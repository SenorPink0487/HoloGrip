/**
 * HoloPool WebSocket client — anonymous room codes.
 * Connect → send join → receive welcome / room / peer / state / shot_request / error.
 */

export function poolLiveUrl() {
  if (typeof window === 'undefined') return '';
  if (window.__TAURI_INTERNALS__) {
    return 'wss://hologrip.cn/api/pool/live';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/pool/live`;
}

export class PoolNet {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    this.role = null; // 'host' | 'guest'
    this.seat = null;
    this.rejoinToken = null;
    this._handlers = {
      welcome: [],
      room: [],
      peer: [],
      state: [],
      match_state: [],
      shot_result: [],
      match_end: [],
      rematch_ready: [],
      reconnecting: [],
      shot_request: [],
      reset: [],
      error: [],
      open: [],
      close: [],
    };
  }

  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
    return () => {
      this._handlers[event] = this._handlers[event].filter((h) => h !== fn);
    };
  }

  _emit(event, data) {
    for (const fn of this._handlers[event] || []) {
      try {
        fn(data);
      } catch (e) {
        console.warn('[PoolNet] handler error', event, e);
      }
    }
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const url = poolLiveUrl();
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this._emit('open', {});
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };
      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this._emit('close', {});
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before open'));
        }
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!msg || !msg.type) return;
        if (msg.type === 'welcome') {
          this.playerId = msg.playerId;
          this.roomCode = msg.roomCode;
          this.role = msg.role;
          this.seat = msg.seat;
          this.rejoinToken = msg.rejoinToken || this.rejoinToken;
          this._persistSession();
          this._emit('welcome', msg);
          return;
        }
        if (['room', 'match_state', 'shot_result', 'match_end', 'rematch_ready', 'reconnecting'].includes(msg.type)) {
          if (msg.version != null && Number.isFinite(Number(msg.version))) this._persistSession();
          this._emit('room', msg);
          if (msg.type !== 'room') this._emit(msg.type, msg);
          return;
        }
        if (msg.type === 'peer') {
          if (msg.from && msg.from === this.playerId) return;
          this._emit('peer', msg);
          return;
        }
        if (msg.type === 'state') {
          this._emit('state', msg);
          return;
        }
        if (msg.type === 'shot_request') {
          this._emit('shot_request', msg);
          return;
        }
        if (msg.type === 'reset') {
          this._emit('reset', msg);
          return;
        }
        if (msg.type === 'error') {
          this._emit('error', msg);
          return;
        }
      };
    });
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  createRoom(name) {
    return this.send({ type: 'join', create: true, name: name || undefined });
  }

  rejoinRoom(roomCode, rejoinToken) {
    return this.send({ type: 'rejoin', roomCode, rejoinToken });
  }

  joinRoom(roomCode, name) {
    return this.send({
      type: 'join',
      create: false,
      roomCode: String(roomCode || '').trim().toUpperCase(),
      name: name || undefined,
    });
  }

  sendPlayer(payload) {
    return this.send({ type: 'player', ...payload });
  }

  sendShot(payload) {
    return this.send({ type: 'shot', ...payload });
  }

  sendState(payload) {
    return this.send({ type: 'state', ...payload });
  }

  sendReset() {
    return this.send({ type: 'reset' });
  }

  sendTurn(turnSeat) {
    return this.send(
      turnSeat == null ? { type: 'turn' } : { type: 'turn', turnSeat },
    );
  }

  sendMatchState(payload) { return this.send({ type: 'match_state', ...payload }); }
  sendShotResult(payload) { return this.send({ type: 'shot_result', ...payload }); }
  sendRematchReady() { return this.send({ type: 'rematch_ready' }); }
  sendForfeit() { return this.send({ type: 'forfeit' }); }

  _persistSession() {
    if (typeof sessionStorage === 'undefined' || !this.roomCode || !this.rejoinToken) return;
    sessionStorage.setItem('holopool-session', JSON.stringify({
      roomCode: this.roomCode, rejoinToken: this.rejoinToken, seat: this.seat,
    }));
  }

  static savedSession() {
    try { return JSON.parse(sessionStorage.getItem('holopool-session') || 'null'); } catch { return null; }
  }

  static clearSavedSession() {
    try { sessionStorage.removeItem('holopool-session'); } catch { /* ignore */ }
  }

  close({ keepSession = false } = {}) {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    this.role = null;
    this.seat = null;
    this.rejoinToken = null;
    if (!keepSession) PoolNet.clearSavedSession();
  }
}

/** Round float for compact wire format */
export function r3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

export function r4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/**
 * Serialize ball list for host state broadcast.
 * @param {Array} balls pool ball objects with body / pocketed / id
 */
export function serializeBalls(balls) {
  return balls.map((b) => {
    const p = b.body.position;
    const q = b.body.quaternion;
    const v = b.body.velocity;
    const w = b.body.angularVelocity;
    return {
      id: b.id,
      x: r3(p.x),
      y: r3(p.y),
      z: r3(p.z),
      qx: r4(q.x),
      qy: r4(q.y),
      qz: r4(q.z),
      qw: r4(q.w),
      vx: r3(v.x),
      vy: r3(v.y),
      vz: r3(v.z),
      wx: r3(w.x),
      wy: r3(w.y),
      wz: r3(w.z),
      pocketed: !!b.pocketed,
    };
  });
}

/**
 * Apply serialized balls onto local ball objects (guest).
 * @param {Array} balls
 * @param {Array} snapshot
 * @param {{ world?: object, wake?: boolean|'moving', correction?: number }} opts
 */
export function applyBallSnapshot(balls, snapshot, opts = {}) {
  if (!Array.isArray(snapshot)) return;
  // Guests run the ball simulation locally.  Authority snapshots therefore
  // nudge the prediction back instead of teleporting it every network tick.
  const correction = Math.max(0, Math.min(1, Number(opts.correction ?? 1)));
  const byId = new Map(balls.map((b) => [b.id, b]));
  for (const s of snapshot) {
    const ball = byId.get(s.id);
    if (!ball) continue;

    if (s.pocketed) {
      if (!ball.pocketed) {
        ball.pocketed = true;
        ball.mesh.visible = false;
        ball.body.velocity.set(0, 0, 0);
        ball.body.angularVelocity.set(0, 0, 0);
        if (ball.body.world) {
          ball.body.world.removeBody(ball.body);
        }
      }
      continue;
    }

    // Un-pocket if needed
    if (ball.pocketed) {
      ball.pocketed = false;
      ball.mesh.visible = true;
      if (opts.world && !ball.body.world) {
        opts.world.addBody(ball.body);
      }
    }

    const blend = (current, next) => current + (next - current) * correction;
    ball.body.position.set(
      blend(ball.body.position.x, s.x),
      blend(ball.body.position.y, s.y),
      blend(ball.body.position.z, s.z),
    );
    // Keep locally simulated rolling rotation between correction packets.
    if (s.qx != null && correction === 1) {
      ball.body.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    }
    ball.body.velocity.set(
      blend(ball.body.velocity.x, s.vx || 0),
      blend(ball.body.velocity.y, s.vy || 0),
      blend(ball.body.velocity.z, s.vz || 0),
    );
    ball.body.angularVelocity.set(
      blend(ball.body.angularVelocity.x, s.wx || 0),
      blend(ball.body.angularVelocity.y, s.wy || 0),
      blend(ball.body.angularVelocity.z, s.wz || 0),
    );
    const snapshotMoving = Math.hypot(s.vx || 0, s.vy || 0, s.vz || 0) > 0.002;
    if (opts.wake !== false && (opts.wake !== 'moving' || snapshotMoving)) {
      ball.body.wakeUp?.();
      ball.body.sleepState = 0;
    }
    ball.mesh.position.set(s.x, s.y, s.z);
    if (s.qx != null) {
      ball.mesh.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    }
  }
}
