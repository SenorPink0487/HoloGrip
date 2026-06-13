use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{broadcast, Mutex};
use tracing::warn;

use crate::user_auth::{verify_jwt, UserAuthState};

#[derive(Clone, Default)]
pub struct WhiteboardLiveState {
    rooms: Arc<Mutex<HashMap<u64, broadcast::Sender<String>>>>,
}

#[derive(Clone)]
pub struct WhiteboardLiveAppState {
    pub auth: UserAuthState,
    pub live: WhiteboardLiveState,
}

#[derive(Deserialize)]
pub struct LiveQuery {
    pub token: String,
}

pub async fn live_ws(
    State(state): State<WhiteboardLiveAppState>,
    Path(lesson_id): Path<u64>,
    Query(query): Query<LiveQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let claims = match verify_jwt(&state.auth.jwt_secret, &query.token) {
        Ok(c) => c,
        Err(e) => {
            warn!("whiteboard live jwt failed: {e}");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let class_id = match crate::db::find_lesson_class_id(&state.auth.pool, lesson_id).await {
        Ok(Some(id)) => id,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            warn!("whiteboard live find lesson failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    match crate::db::is_class_member(&state.auth.pool, class_id, claims.sub).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::FORBIDDEN.into_response(),
        Err(e) => {
            warn!("whiteboard live authz failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    ws.on_upgrade(move |socket| handle_socket(state.live, lesson_id, socket))
}

async fn handle_socket(live: WhiteboardLiveState, lesson_id: u64, socket: WebSocket) {
    let sender = {
        let mut rooms = live.rooms.lock().await;
        rooms
            .entry(lesson_id)
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(128);
                tx
            })
            .clone()
    };
    let mut receiver = sender.subscribe();
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let outbound = tokio::spawn(async move {
        while let Ok(text) = receiver.recv().await {
            if ws_sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let _ = sender.send(text.to_string());
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(_) => break,
        }
    }

    outbound.abort();
}
