/**
 * HoloPool multiplayer session orchestrator.
 * Host owns rules and authoritative corrections; both peers simulate ball
 * motion locally between snapshots for smooth turn-based shooting.
 */

import { PoolPlayer } from '../player.js';
import {
  PoolNet,
  serializeBalls,
  applyBallSnapshot,
  r3,
  r4,
} from './pool-net.js';

const PLAYER_SEND_HZ = 12;
// Local prediction keeps the motion smooth; the host only sends authority
// corrections, so this does not need to run at visual-frame frequency.
const STATE_SEND_HZ = 10;

/**
 * @param {object} deps
 * @param {import('three').Scene} deps.scene
 * @param {number} deps.floorY
 * @param {Array} deps.balls
 * @param {object} deps.world
 * @param {() => object} deps.getLocalPlayer  // { x, z, yaw, visualState, aimAngle, power, aimDepth }
 * @param {(snapshot: object) => void} deps.onRemotePlayer
 * @param {(msg: object) => void} deps.onShotRequest  // host only
 * @param {(msg: object) => void} deps.onState        // reacts to authority state / turn changes
 * @param {() => void} deps.onReset
 * @param {(info: object) => void} deps.onUi
 * @param {(msg: string, ms?: number) => void} deps.toast
 */
export function createMultiplayer(deps) {
  const net = new PoolNet();
  let active = false;
  let turnSeat = 0;
  let phase = 'idle'; // idle | waiting | playing
  let remotePlayer = null;
  let playerSendAcc = 0;
  let stateSendAcc = 0;
  let lastStateSeq = 0;
  let stateSeq = 0;
  let stateVersion = 0;
  let match = null;
  /** @type {'local'|'host'|'guest'} */
  let mode = 'local';
  let unsubs = [];

  function isOnline() {
    return active && mode !== 'local';
  }

  function isHost() {
    return mode === 'host';
  }

  function isGuest() {
    return mode === 'guest';
  }

  function mySeat() {
    return net.seat ?? 0;
  }

  function isMyTurn() {
    if (!isOnline()) return true;
    if (phase !== 'playing') return false;
    return mySeat() === turnSeat;
  }

  function canShoot() {
    return !isOnline() || isMyTurn();
  }

  function canReset() {
    return !isOnline() || isHost();
  }

  function ensureRemoteAvatar(skinColor) {
    if (remotePlayer) return remotePlayer;
    remotePlayer = new PoolPlayer(deps.scene, {
      floorY: deps.floorY,
      skinColor: skinColor ?? 0xc8e8ff,
    });
    remotePlayer.root.name = 'poolPlayerRemote';
    // Offset spawn so avatars don't stack
    remotePlayer.setPosition(1.8, 1.15);
    return remotePlayer;
  }

  function removeRemoteAvatar() {
    if (!remotePlayer) return;
    deps.scene.remove(remotePlayer.root);
    remotePlayer = null;
  }

  function emitUi(extra = {}) {
    deps.onUi?.({
      active,
      mode,
      roomCode: net.roomCode,
      role: net.role,
      seat: net.seat,
      turnSeat,
      phase,
      isMyTurn: isMyTurn(),
      playerId: net.playerId,
      match,
      version: stateVersion,
      ...extra,
    });
  }

  function bindNet() {
    unsubs.forEach((u) => u());
    unsubs = [];

    unsubs.push(
      net.on('welcome', (msg) => {
        mode = msg.role === 'host' ? 'host' : 'guest';
        active = true;
        phase = 'waiting';
        ensureRemoteAvatar(mode === 'host' ? 0xc8e8ff : 0xffe0b8);
        emitUi();
        deps.toast?.(
          msg.role === 'host'
            ? `房间 ${msg.roomCode} 已创建 — 等待对手加入`
            : `已加入房间 ${msg.roomCode}`,
          2800,
        );
      }),
    );

    unsubs.push(
      net.on('room', (msg) => {
        if (msg.type !== 'room') return;
        const wasWaiting = phase === 'waiting' || phase === 'idle';
        turnSeat = typeof msg.turnSeat === 'number' ? msg.turnSeat : turnSeat;
        phase = msg.phase || phase;
        if (msg.match) {
          match = msg.match;
          if (match.turnSeat != null) turnSeat = match.turnSeat;
        }
        if (phase === 'playing' && wasWaiting) {
          deps.toast?.(
            isMyTurn() ? '对局开始 — 你的回合' : '对局开始 — 对方先手',
            2200,
          );
          // Host pushes full table so guest starts in sync
          if (mode === 'host') {
            broadcastState({ event: 'settled' });
          }
        }
        emitUi({ players: msg.players });
      }),
    );

    unsubs.push(net.on('match_state', (msg) => {
      if (Number.isFinite(Number(msg.version)) && Number(msg.version) < stateVersion) return;
      stateVersion = Number(msg.version) || stateVersion;
      match = msg.match || match;
      if (match?.turnSeat != null) turnSeat = match.turnSeat;
      if (match?.phase === 'ended') phase = 'ended';
      else if (match) phase = 'playing';
      emitUi({ shotResult: msg.shotResult });
    }));
    unsubs.push(net.on('match_end', (msg) => {
      if (Number(msg.version) < stateVersion) return;
      stateVersion = Number(msg.version) || stateVersion;
      match = msg.match || match;
      phase = 'ended';
      emitUi({ matchEnded: true, reason: msg.reason });
    }));
    unsubs.push(net.on('reconnecting', (msg) => {
      phase = 'reconnecting';
      emitUi({ reconnecting: msg });
    }));
    unsubs.push(net.on('rematch_ready', (msg) => {
      if (msg.start) {
        match = msg.match || match;
        if (match?.turnSeat != null) turnSeat = match.turnSeat;
        phase = 'playing';
        deps.onRematch?.(msg);
      }
      emitUi({ rematch: msg });
    }));

    unsubs.push(
      net.on('peer', (msg) => {
        const rp = ensureRemoteAvatar();
        deps.onRemotePlayer?.(msg, rp);
      }),
    );

    unsubs.push(
      net.on('state', (msg) => {
        if (typeof msg.turnSeat === 'number') turnSeat = msg.turnSeat;
        if (msg.phase) phase = msg.phase;
        if (typeof msg.seq === 'number') {
          if (msg.seq < lastStateSeq && mode === 'guest') return;
          lastStateSeq = msg.seq;
        }
        // Host already has authority; still update turn UI
        if (isGuest() && Array.isArray(msg.balls)) {
          const isBoundary = msg.event === 'shot' || msg.event === 'settled';
          applyBallSnapshot(deps.balls, msg.balls, {
            world: deps.world,
            correction: isBoundary ? 1 : 0.18,
            wake: isBoundary ? true : 'moving',
          });
        }
        deps.onState?.(msg);
        emitUi();
      }),
    );

    unsubs.push(
      net.on('shot_request', (msg) => {
        if (!isHost()) return;
        deps.onShotRequest?.(msg);
      }),
    );

    unsubs.push(
      net.on('reset', () => {
        turnSeat = 0;
        deps.onReset?.();
        emitUi();
        deps.toast?.('房主重新摆球', 1800);
      }),
    );

    unsubs.push(
      net.on('error', (msg) => {
        const code = msg.code || '';
        deps.toast?.(msg.message || code || '联机错误', 2800);
        if (code === 'room_closed' || code === 'peer_left') {
          if (code === 'room_closed' || code === 'rejoin_expired') {
            leave({ silent: true, keepSession: false });
          } else {
            phase = 'waiting';
            emitUi();
          }
        }
        emitUi({ lastError: msg });
      }),
    );

    unsubs.push(
      net.on('close', () => {
        if (active) {
          deps.toast?.('联机连接已断开', 2200);
          leave({ silent: true, keepSession: true });
          window.setTimeout(() => resume().catch(() => {}), 1000);
        }
      }),
    );
  }

  async function createRoom(name) {
    await net.connect();
    bindNet();
    net.createRoom(name);
  }

  async function joinRoom(code, name) {
    await net.connect();
    bindNet();
    net.joinRoom(code, name);
  }

  async function resume() {
    const saved = PoolNet.savedSession();
    if (!saved?.roomCode || !saved?.rejoinToken) return false;
    await net.connect();
    bindNet();
    net.rejoinRoom(saved.roomCode, saved.rejoinToken);
    return true;
  }

  function leave(opts = {}) {
    active = false;
    mode = 'local';
    phase = 'idle';
    turnSeat = 0;
    lastStateSeq = 0;
    stateSeq = 0;
    stateVersion = 0;
    match = null;
    removeRemoteAvatar();
    unsubs.forEach((u) => u());
    unsubs = [];
    net.close({ keepSession: !!opts.keepSession });
    if (!opts.silent) deps.toast?.('已离开房间', 1600);
    emitUi();
  }

  /**
   * Guest fires: send shot to host instead of local physics.
   */
  function requestShot({ aimAngle, power, aimDepth }) {
    if (!isGuest() || !isMyTurn()) return false;
    return net.sendShot({
      aimAngle: r4(aimAngle),
      power: r3(power),
      aimDepth: r3(aimDepth ?? 0),
    });
  }

  /**
   * Host broadcasts full table state.
   */
  function broadcastState(extra = {}) {
    if (!isHost() || !active) return;
    stateSeq += 1;
    net.sendState({
      seq: stateSeq,
      turnSeat,
      phase: phase === 'playing' ? 'playing' : phase,
      balls: serializeBalls(deps.balls),
      ...extra,
    });
  }

  function broadcastReset() {
    if (!isHost()) return false;
    turnSeat = 0;
    return net.sendReset();
  }

  function broadcastMatchState(payload) {
    if (!isHost() || !active) return false;
    match = payload.match || match;
    if (match?.turnSeat != null) turnSeat = match.turnSeat;
    return net.sendMatchState(payload);
  }

  function sendShotResult(payload) {
    if (!isHost() || !active) return false;
    return net.sendShotResult(payload);
  }

  function readyRematch() { return net.sendRematchReady(); }

  function forfeit() {
    net.sendForfeit();
    leave({ silent: true, keepSession: false });
  }

  /** Call after balls settle on host — advance turn and push state */
  function onHostSettled(nextTurn = null) {
    if (!isHost() || phase !== 'playing') return;
    turnSeat = nextTurn == null ? 1 - turnSeat : nextTurn;
    net.sendTurn(turnSeat);
    broadcastState({ event: 'settled' });
    emitUi();
    deps.toast?.(isMyTurn() ? '你的回合' : '对方回合', 1600);
  }

  /** Host starts simulating a shot (own or guest) */
  function onHostShotStarted(extra = {}) {
    if (!isHost()) return;
    broadcastState({ event: 'shot', ...extra });
  }

  function tick(dt, opts = {}) {
    if (!active || !net.connected) return;

    // Send local avatar
    playerSendAcc += dt;
    if (playerSendAcc >= 1 / PLAYER_SEND_HZ) {
      playerSendAcc = 0;
      const p = deps.getLocalPlayer?.();
      if (p) {
        net.sendPlayer({
          x: r3(p.x),
          z: r3(p.z),
          yaw: r3(p.yaw),
          visualState: p.visualState || 'idle',
          aimAngle: p.aimAngle != null ? r4(p.aimAngle) : undefined,
          power: p.power != null ? r3(p.power) : undefined,
          aimDepth: p.aimDepth != null ? r3(p.aimDepth) : undefined,
          pull: p.pull != null ? r3(p.pull) : undefined,
        });
      }
    }

    // Host streams balls while simulating
    if (isHost() && opts.simulating) {
      stateSendAcc += dt;
      if (stateSendAcc >= 1 / STATE_SEND_HZ) {
        stateSendAcc = 0;
        broadcastState({ event: 'sim' });
      }
    }
  }

  function getRemotePlayer() {
    return remotePlayer;
  }

  return {
    net,
    createRoom,
    joinRoom,
    resume,
    leave,
    tick,
    isOnline,
    isHost,
    isGuest,
    isMyTurn,
    canShoot,
    canReset,
    requestShot,
    broadcastState,
    broadcastReset,
    broadcastMatchState,
    sendShotResult,
    readyRematch,
    forfeit,
    onHostSettled,
    onHostShotStarted,
    getRemotePlayer,
    get mode() {
      return mode;
    },
    get phase() {
      return phase;
    },
    get turnSeat() {
      return turnSeat;
    },
    get roomCode() {
      return net.roomCode;
    },
    get match() { return match; },
    emitUi,
  };
}
