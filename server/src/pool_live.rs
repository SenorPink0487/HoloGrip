//! HoloPool room-based multiplayer (anonymous room codes).
//!
//! Flow:
//! 1. Client opens `GET /api/pool/live` WebSocket
//! 2. First text message must be `{ "type": "join", "create": true }` or
//!    `{ "type": "join", "create": false, "roomCode": "ABC123" }`
//! 3. Server assigns seat (host=0, guest=1), relays messages with turn checks

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{broadcast, mpsc, Mutex};
use tracing::{info, warn};
use uuid::Uuid;

const ROOM_CODE_LEN: usize = 6;
/// Alphabet without ambiguous 0/O/1/I
const ROOM_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_SEATS: usize = 2;
const ROOM_IDLE_TTL: Duration = Duration::from_secs(30 * 60);
const REJOIN_TTL: Duration = Duration::from_secs(3 * 60);
const BROADCAST_CAP: usize = 256;

#[derive(Clone, Default)]
pub struct PoolLiveState {
    inner: Arc<Mutex<PoolHub>>,
}

#[derive(Default)]
struct PoolHub {
    rooms: HashMap<String, PoolRoom>,
}

struct PoolRoom {
    code: String,
    host_id: Uuid,
    seats: [Option<PlayerSlot>; MAX_SEATS],
    turn_seat: u8,
    /// playing once 2 players connected; waiting while alone
    phase: RoomPhase,
    version: u64,
    match_state: Value,
    rematch_ready: [bool; MAX_SEATS],
    tx: broadcast::Sender<String>,
    last_active: Instant,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RoomPhase {
    Waiting,
    Playing,
    Reconnecting,
    Ended,
}

struct PlayerSlot {
    id: Uuid,
    name: String,
    rejoin_token: String,
    /// Outbound channel to this player's WS writer task
    out: mpsc::UnboundedSender<String>,
    disconnected_at: Option<Instant>,
}

#[derive(Deserialize)]
struct ClientMsg {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    create: bool,
    #[serde(default, rename = "roomCode")]
    room_code: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, rename = "rejoinToken")]
    rejoin_token: Option<String>,
    #[serde(flatten)]
    rest: HashMap<String, Value>,
}

#[derive(Serialize)]
struct WelcomeMsg<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "roomCode")]
    room_code: &'a str,
    role: &'a str,
    #[serde(rename = "playerId")]
    player_id: String,
    seat: u8,
    #[serde(rename = "rejoinToken")]
    rejoin_token: String,
}

pub async fn live_ws(State(state): State<PoolLiveState>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: PoolLiveState, socket: WebSocket) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

    // Writer task: personal queue + room broadcast fan-in happens after join
    let writer = tokio::spawn(async move {
        let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if ws_sender.send(Message::Ping(Vec::new().into())).await.is_err() {
                        break;
                    }
                }
                msg = out_rx.recv() => {
                    match msg {
                        Some(text) => {
                            if ws_sender.send(Message::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
            }
        }
    });

    let mut player_id = Uuid::new_v4();
    let mut room_code: Option<String> = None;
    let mut seat: Option<u8> = None;
    let mut broadcast_forward: Option<tokio::task::JoinHandle<()>> = None;

    // Wait for join as first meaningful message
    while let Some(msg) = ws_receiver.next().await {
        let text = match msg {
            Ok(Message::Text(t)) => t.to_string(),
            Ok(Message::Close(_)) | Err(_) => {
                cleanup_player(&state, room_code.as_deref(), player_id).await;
                writer.abort();
                return;
            }
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
            Ok(_) => continue,
        };

        let parsed: ClientMsg = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                let _ = out_tx.send(error_json("bad_json", &format!("invalid json: {e}")));
                continue;
            }
        };

        if parsed.kind != "join" && parsed.kind != "rejoin" {
            let _ = out_tx.send(error_json("need_join", "first message must be join"));
            continue;
        }

        let name = parsed
            .name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.chars().take(24).collect::<String>())
            .unwrap_or_else(|| format!("P{}", &player_id.to_string()[..4]));

        let join_result = if parsed.kind == "rejoin" {
            let code = parsed.room_code.as_deref().map(normalize_code).filter(|c| !c.is_empty());
            let token = parsed.rejoin_token.as_deref().unwrap_or("");
            match code {
                Some(code) => rejoin_room(&state, &code, token, out_tx.clone()).await,
                None => Err(("bad_code", "roomCode required".to_string())),
            }
        } else if parsed.create {
            create_room(&state, player_id, name, out_tx.clone()).await
        } else {
            let code = parsed
                .room_code
                .as_deref()
                .map(normalize_code)
                .filter(|c| !c.is_empty());
            match code {
                Some(c) => join_room(&state, &c, player_id, name, out_tx.clone()).await,
                None => Err(("bad_code", "roomCode required".to_string())),
            }
        };

        match join_result {
            Ok((code, role, seat_n, mut rx, restored_id)) => {
                player_id = restored_id;
                room_code = Some(code.clone());
                seat = Some(seat_n);

                let welcome = WelcomeMsg {
                    kind: "welcome",
                    room_code: &code,
                    role,
                    player_id: player_id.to_string(),
                    seat: seat_n,
                    rejoin_token: room_token(&state, &code, seat_n).await.unwrap_or_default(),
                };
                if let Ok(s) = serde_json::to_string(&welcome) {
                    let _ = out_tx.send(s);
                }
                broadcast_room_snapshot(&state, &code).await;

                // Forward room broadcast → personal out channel
                let out = out_tx.clone();
                broadcast_forward = Some(tokio::spawn(async move {
                    loop {
                        match rx.recv().await {
                            Ok(text) => {
                                if out.send(text).is_err() {
                                    break;
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }));

                info!(%code, %player_id, seat = seat_n, "pool player joined");
                break;
            }
            Err((code, message)) => {
                let _ = out_tx.send(error_json(code, &message));
                if code == "room_full" || code == "not_found" {
                    // keep connection open for retry join
                }
            }
        }
    }

    if room_code.is_none() {
        writer.abort();
        if let Some(h) = broadcast_forward {
            h.abort();
        }
        return;
    }

    let code = room_code.clone().unwrap();
    let my_seat = seat.unwrap_or(0);

    // Main relay loop
    while let Some(msg) = ws_receiver.next().await {
        let text = match msg {
            Ok(Message::Text(t)) => t.to_string(),
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
            Ok(_) => continue,
        };

        let parsed: ClientMsg = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => {
                let _ = out_tx.send(error_json("bad_json", "invalid json"));
                continue;
            }
        };

        touch_room(&state, &code).await;

        match parsed.kind.as_str() {
            "join" => {
                let _ = out_tx.send(error_json("already_joined", "already in a room"));
            }
            "player" | "peer" => {
                // Host/guest movement + aim preview — fan-out to room with sender id
                let mut payload = json!({
                    "type": "peer",
                    "from": player_id.to_string(),
                    "seat": my_seat,
                });
                if let Some(obj) = payload.as_object_mut() {
                    for (k, v) in parsed.rest {
                        if k == "type" || k == "from" {
                            continue;
                        }
                        obj.insert(k, v);
                    }
                }
                if let Ok(s) = serde_json::to_string(&payload) {
                    broadcast_raw(&state, &code, &s).await;
                }
            }
            "shot" => {
                // Only current-turn player may request a shot; relay to host as shot_request
                let ok = with_room(&state, &code, |room| {
                    room.seats[my_seat as usize]
                        .as_ref()
                        .map(|p| p.id == player_id)
                        .unwrap_or(false)
                        && room.turn_seat == my_seat
                        && room.phase == RoomPhase::Playing
                })
                .await
                .unwrap_or(false);

                if !ok {
                    let _ = out_tx.send(error_json("not_your_turn", "not your turn to shoot"));
                    continue;
                }

                let mut payload = json!({
                    "type": "shot_request",
                    "from": player_id.to_string(),
                    "seat": my_seat,
                });
                if let Some(obj) = payload.as_object_mut() {
                    for (k, v) in parsed.rest {
                        obj.insert(k, v);
                    }
                }
                // Deliver only to host
                if let Ok(s) = serde_json::to_string(&payload) {
                    send_to_host(&state, &code, &s).await;
                }
            }
            "state" => {
                // Only host may broadcast authoritative table state
                let is_host = with_room(&state, &code, |room| room.host_id == player_id)
                    .await
                    .unwrap_or(false);
                if !is_host {
                    let _ = out_tx.send(error_json("not_host", "only host can send state"));
                    continue;
                }

                // Apply turnSeat / phase if present
                if let Some(ts) = parsed.rest.get("turnSeat").and_then(|v| v.as_u64()) {
                    with_room_mut(&state, &code, |room| {
                        if ts < MAX_SEATS as u64 {
                            room.turn_seat = ts as u8;
                        }
                    })
                    .await;
                }

                let mut payload = json!({
                    "type": "state",
                    "from": player_id.to_string(),
                });
                if let Some(obj) = payload.as_object_mut() {
                    for (k, v) in parsed.rest {
                        obj.insert(k, v);
                    }
                }
                if let Ok(s) = serde_json::to_string(&payload) {
                    broadcast_raw(&state, &code, &s).await;
                }
            }
            "match_state" | "shot_result" => {
                let is_host = with_room(&state, &code, |room| room.host_id == player_id)
                    .await
                    .unwrap_or(false);
                if !is_host {
                    let _ = out_tx.send(error_json("not_host", "only host can resolve the match"));
                    continue;
                }
                let message_type = parsed.kind.clone();
                let payload = with_room_mut(&state, &code, |room| {
                    room.version += 1;
                    if let Some(m) = parsed.rest.get("match") { room.match_state = m.clone(); }
                    if room.match_state.get("phase").and_then(Value::as_str) == Some("ended") {
                        room.phase = RoomPhase::Ended;
                    }
                    json!({"type":message_type, "match":room.match_state, "version":room.version,
                        "shotResult":parsed.rest.get("shotResult"), "reason":parsed.rest.get("reason")})
                }).await;
                if let Some(payload) = payload {
                    if let Ok(s) = serde_json::to_string(&payload) { broadcast_raw(&state, &code, &s).await; }
                    if message_type == "match_state" && payload.get("match").and_then(|m| m.get("phase")).and_then(Value::as_str) == Some("ended") {
                        let mut end = payload.clone();
                        end["type"] = Value::String("match_end".into());
                        if let Ok(s) = serde_json::to_string(&end) { broadcast_raw(&state, &code, &s).await; }
                    }
                }
            }
            "rematch_ready" => {
                let payload = with_room_mut(&state, &code, |room| {
                    room.rematch_ready[my_seat as usize] = true;
                    room.version += 1;
                    let both = room.rematch_ready.iter().all(|ready| *ready);
                    if both {
                        room.rematch_ready = [false; MAX_SEATS];
                        room.phase = RoomPhase::Playing;
                        room.turn_seat = 1 - room.turn_seat;
                        room.match_state = json!({"phase":"break","breakerSeat":room.turn_seat,"turnSeat":room.turn_seat,"groups":[null,null],"ballInHandSeat":null});
                    }
                    json!({"type":"rematch_ready","ready":room.rematch_ready,"start":both,"match":room.match_state,"version":room.version})
                }).await;
                if let Some(payload) = payload { if let Ok(s) = serde_json::to_string(&payload) { broadcast_raw(&state, &code, &s).await; } }
            }
            "forfeit" => {
                let payload = with_room_mut(&state, &code, |room| {
                    room.version += 1;
                    room.phase = RoomPhase::Ended;
                    room.match_state["phase"] = Value::String("ended".into());
                    room.match_state["winnerSeat"] = json!(1 - my_seat);
                    room.match_state["reason"] = Value::String("对手离开对局".into());
                    json!({"type":"match_end","match":room.match_state,"reason":"对手离开对局","version":room.version})
                }).await;
                if let Some(payload) = payload { if let Ok(s) = serde_json::to_string(&payload) { broadcast_raw(&state, &code, &s).await; } }
                break;
            }
            "reset" => {
                let is_host = with_room(&state, &code, |room| room.host_id == player_id)
                    .await
                    .unwrap_or(false);
                if !is_host {
                    let _ = out_tx.send(error_json("not_host", "only host can reset"));
                    continue;
                }
                with_room_mut(&state, &code, |room| {
                    room.turn_seat = 0;
                })
                .await;
                let payload = json!({
                    "type": "reset",
                    "from": player_id.to_string(),
                    "turnSeat": 0,
                });
                if let Ok(s) = serde_json::to_string(&payload) {
                    broadcast_raw(&state, &code, &s).await;
                }
            }
            "turn" => {
                // Host advances turn after settle
                let is_host = with_room(&state, &code, |room| room.host_id == player_id)
                    .await
                    .unwrap_or(false);
                if !is_host {
                    let _ = out_tx.send(error_json("not_host", "only host can change turn"));
                    continue;
                }
                let next = parsed
                    .rest
                    .get("turnSeat")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u8);
                with_room_mut(&state, &code, |room| {
                    if let Some(n) = next {
                        if (n as usize) < MAX_SEATS {
                            room.turn_seat = n;
                        }
                    } else {
                        room.turn_seat = 1 - room.turn_seat;
                    }
                })
                .await;
                broadcast_room_snapshot(&state, &code).await;
            }
            other => {
                warn!(kind = other, "unknown pool message");
                let _ = out_tx.send(error_json("unknown_type", &format!("unknown type: {other}")));
            }
        }
    }

    if let Some(h) = broadcast_forward {
        h.abort();
    }
    cleanup_player(&state, Some(&code), player_id).await;
    writer.abort();
    info!(%code, %player_id, "pool player left");
}

// ── Room helpers ────────────────────────────────────────────────────

async fn create_room(
    state: &PoolLiveState,
    player_id: Uuid,
    name: String,
    out: mpsc::UnboundedSender<String>,
) -> Result<(String, &'static str, u8, broadcast::Receiver<String>, Uuid), (&'static str, String)> {
    let mut hub = state.inner.lock().await;
    gc_rooms(&mut hub);

    let code = generate_unique_code(&hub.rooms);
    let (tx, rx) = broadcast::channel(BROADCAST_CAP);
    let mut seats: [Option<PlayerSlot>; MAX_SEATS] = Default::default();
    seats[0] = Some(PlayerSlot {
        id: player_id,
        name,
        rejoin_token: Uuid::new_v4().to_string(),
        out,
        disconnected_at: None,
    });

    hub.rooms.insert(
        code.clone(),
        PoolRoom {
            code: code.clone(),
            host_id: player_id,
            seats,
            turn_seat: 0,
            phase: RoomPhase::Waiting,
            version: 1,
            match_state: json!({"phase":"break","breakerSeat":0,"turnSeat":0,"groups":[null,null],"ballInHandSeat":null}),
            rematch_ready: [false; MAX_SEATS],
            tx,
            last_active: Instant::now(),
        },
    );

    Ok((code, "host", 0, rx, player_id))
}

async fn join_room(
    state: &PoolLiveState,
    code: &str,
    player_id: Uuid,
    name: String,
    out: mpsc::UnboundedSender<String>,
) -> Result<(String, &'static str, u8, broadcast::Receiver<String>, Uuid), (&'static str, String)> {
    let mut hub = state.inner.lock().await;
    gc_rooms(&mut hub);

    let room = hub
        .rooms
        .get_mut(code)
        .ok_or(("not_found", "房间不存在".to_string()))?;

    // Find free seat
    let free = room
        .seats
        .iter()
        .position(|s| s.is_none())
        .ok_or(("room_full", "房间已满".to_string()))?;

    room.seats[free] = Some(PlayerSlot {
        id: player_id,
        name,
        rejoin_token: Uuid::new_v4().to_string(),
        out,
        disconnected_at: None,
    });
    room.last_active = Instant::now();
    if free == 1 || room.seats.iter().filter(|s| s.is_some()).count() >= 2 {
        room.phase = RoomPhase::Playing;
    }

    let rx = room.tx.subscribe();
    let role = if free == 0 { "host" } else { "guest" };
    room.version += 1;
    Ok((code.to_string(), role, free as u8, rx, player_id))
}

async fn rejoin_room(
    state: &PoolLiveState,
    code: &str,
    token: &str,
    out: mpsc::UnboundedSender<String>,
) -> Result<(String, &'static str, u8, broadcast::Receiver<String>, Uuid), (&'static str, String)> {
    let mut hub = state.inner.lock().await;
    let room = hub.rooms.get_mut(code).ok_or(("not_found", "房间不存在".to_string()))?;
    let (seat, player_id) = room.seats.iter_mut().enumerate().find_map(|(seat, slot)| {
        let player = slot.as_mut()?;
        (player.rejoin_token == token && player.disconnected_at.is_some()).then(|| {
            player.out = out.clone();
            player.disconnected_at = None;
            (seat, player.id)
        })
    }).ok_or(("rejoin_expired", "重连令牌无效或已过期".to_string()))?;
    if room.seats.iter().all(|slot| slot.as_ref().map(|p| p.disconnected_at.is_none()).unwrap_or(false)) {
        room.phase = RoomPhase::Playing;
    }
    room.version += 1;
    room.last_active = Instant::now();
    let role = if room.host_id == player_id { "host" } else { "guest" };
    Ok((code.to_string(), role, seat as u8, room.tx.subscribe(), player_id))
}

async fn room_token(state: &PoolLiveState, code: &str, seat: u8) -> Option<String> {
    let hub = state.inner.lock().await;
    hub.rooms.get(code)?.seats.get(seat as usize)?.as_ref().map(|p| p.rejoin_token.clone())
}

async fn cleanup_player(state: &PoolLiveState, code: Option<&str>, player_id: Uuid) {
    let Some(code) = code else { return };
    let mut hub = state.inner.lock().await;
    let Some(room) = hub.rooms.get_mut(code) else {
        return;
    };

    let seat = room.seats.iter_mut().enumerate().find_map(|(seat, slot)| {
        let player = slot.as_mut()?;
        (player.id == player_id).then(|| { player.disconnected_at = Some(Instant::now()); seat })
    });
    let Some(seat) = seat else { return };
    room.last_active = Instant::now();
    room.phase = RoomPhase::Reconnecting;
    room.version += 1;
    let payload = json!({"type":"reconnecting", "seat":seat, "deadlineSeconds":REJOIN_TTL.as_secs(), "version":room.version});
    if let Ok(s) = serde_json::to_string(&payload) { let _ = room.tx.send(s); }
    drop(hub);
    broadcast_room_snapshot(state, code).await;
}

async fn broadcast_room_snapshot(state: &PoolLiveState, code: &str) {
    let hub = state.inner.lock().await;
    let Some(room) = hub.rooms.get(code) else {
        return;
    };
    let players: Vec<Value> = room
        .seats
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            s.as_ref().map(|p| {
                json!({
                    "id": p.id.to_string(),
                    "name": p.name,
                    "seat": i,
                    "connected": p.disconnected_at.is_none(),
                })
            })
        })
        .collect();
    let phase = match room.phase {
        RoomPhase::Waiting => "waiting",
        RoomPhase::Playing => "playing",
        RoomPhase::Reconnecting => "reconnecting",
        RoomPhase::Ended => "ended",
    };
    let payload = json!({
        "type": "room",
        "roomCode": room.code,
        "players": players,
        "turnSeat": room.turn_seat,
        "phase": phase,
        "hostId": room.host_id.to_string(),
        "version": room.version,
        "match": room.match_state,
    });
    if let Ok(s) = serde_json::to_string(&payload) {
        let _ = room.tx.send(s);
    }
}

async fn broadcast_raw(state: &PoolLiveState, code: &str, text: &str) {
    let hub = state.inner.lock().await;
    if let Some(room) = hub.rooms.get(code) {
        let _ = room.tx.send(text.to_string());
    }
}

async fn send_to_host(state: &PoolLiveState, code: &str, text: &str) {
    let hub = state.inner.lock().await;
    if let Some(room) = hub.rooms.get(code) {
        if let Some(host) = room.seats.iter().flatten().find(|p| p.id == room.host_id) {
            let _ = host.out.send(text.to_string());
        }
    }
}

async fn touch_room(state: &PoolLiveState, code: &str) {
    let mut hub = state.inner.lock().await;
    if let Some(room) = hub.rooms.get_mut(code) {
        room.last_active = Instant::now();
    }
}

async fn with_room<F, R>(state: &PoolLiveState, code: &str, f: F) -> Option<R>
where
    F: FnOnce(&PoolRoom) -> R,
{
    let hub = state.inner.lock().await;
    hub.rooms.get(code).map(f)
}

async fn with_room_mut<F, R>(state: &PoolLiveState, code: &str, f: F) -> Option<R>
where
    F: FnOnce(&mut PoolRoom) -> R,
{
    let mut hub = state.inner.lock().await;
    hub.rooms.get_mut(code).map(f)
}

fn generate_unique_code(rooms: &HashMap<String, PoolRoom>) -> String {
    let mut rng = rand::thread_rng();
    for _ in 0..64 {
        let code: String = (0..ROOM_CODE_LEN)
            .map(|_| {
                let i = rng.gen_range(0..ROOM_ALPHABET.len());
                ROOM_ALPHABET[i] as char
            })
            .collect();
        if !rooms.contains_key(&code) {
            return code;
        }
    }
    // Fallback: uuid fragment
    Uuid::new_v4().to_string()[..ROOM_CODE_LEN].to_uppercase()
}

fn normalize_code(raw: &str) -> String {
    raw.trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(ROOM_CODE_LEN)
        .collect()
}

fn error_json(code: &str, message: &str) -> String {
    json!({
        "type": "error",
        "code": code,
        "message": message,
    })
    .to_string()
}

fn gc_rooms(hub: &mut PoolHub) {
    let now = Instant::now();
    hub.rooms.retain(|_, room| {
        let occupied = room.seats.iter().any(|s| s.is_some());
        occupied && now.duration_since(room.last_active) < ROOM_IDLE_TTL
            || (!occupied && now.duration_since(room.last_active) < Duration::from_secs(60))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_and_uppercases() {
        assert_eq!(normalize_code(" ab12cd "), "AB12CD");
        assert_eq!(normalize_code("xx-yy-zz"), "XXYYZZ");
    }

    #[test]
    fn code_alphabet_has_no_ambiguous() {
        let s = std::str::from_utf8(ROOM_ALPHABET).unwrap();
        assert!(!s.contains('0'));
        assert!(!s.contains('O'));
        assert!(!s.contains('1'));
        assert!(!s.contains('I'));
        assert_eq!(ROOM_CODE_LEN, 6);
    }
}
