/**
 * Protocol helpers for HoloPool multiplayer (no WebSocket).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  r3,
  r4,
  serializeBalls,
  applyBallSnapshot,
} from '../net/pool-net.js';

describe('pool-net number packing', () => {
  it('r3 rounds to 3 decimals', () => {
    assert.equal(r3(1.23456), 1.235);
    assert.equal(r3(-0.0014), -0.001);
  });

  it('r4 rounds to 4 decimals', () => {
    assert.equal(r4(0.123456), 0.1235);
  });
});

function makeFakeBall(id, opts = {}) {
  const pos = { x: opts.x ?? 0, y: opts.y ?? 0.028, z: opts.z ?? 0 };
  const quat = { x: 0, y: 0, z: 0, w: 1 };
  const vel = { x: opts.vx ?? 0, y: 0, z: opts.vz ?? 0 };
  const ang = { x: 0, y: 0, z: 0 };
  const body = {
    position: {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    quaternion: {
      x: quat.x,
      y: quat.y,
      z: quat.z,
      w: quat.w,
      set(x, y, z, w) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      },
    },
    velocity: {
      x: vel.x,
      y: vel.y,
      z: vel.z,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    angularVelocity: {
      x: ang.x,
      y: ang.y,
      z: ang.z,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    world: opts.world ?? { removeBody() {} },
    wakeUp() {},
    sleepState: 0,
  };
  return {
    id,
    pocketed: !!opts.pocketed,
    body,
    mesh: {
      visible: !opts.pocketed,
      position: { set() {}, copy() {} },
      quaternion: { set() {} },
    },
  };
}

describe('serializeBalls / applyBallSnapshot', () => {
  it('round-trips positions and velocities', () => {
    const balls = [
      makeFakeBall(0, { x: 0.5, z: -0.25, vx: 1.2, vz: -0.8 }),
      makeFakeBall(1, { x: -0.1, z: 0.2 }),
    ];
    const snap = serializeBalls(balls);
    assert.equal(snap.length, 2);
    assert.equal(snap[0].id, 0);
    assert.equal(snap[0].x, 0.5);
    assert.equal(snap[0].vx, 1.2);

    const targets = [
      makeFakeBall(0),
      makeFakeBall(1),
    ];
    applyBallSnapshot(targets, snap);
    assert.equal(targets[0].body.position.x, 0.5);
    assert.equal(targets[0].body.velocity.z, -0.8);
    assert.equal(targets[1].body.position.z, 0.2);
  });

  it('applies pocketed flag', () => {
    const balls = [makeFakeBall(3, { pocketed: true })];
    const snap = serializeBalls(balls);
    assert.equal(snap[0].pocketed, true);

    const target = [makeFakeBall(3)];
    applyBallSnapshot(target, snap);
    assert.equal(target[0].pocketed, true);
    assert.equal(target[0].mesh.visible, false);
  });

  it('blends prediction corrections instead of teleporting balls', () => {
    const target = [makeFakeBall(0, { x: 0, z: 0, vx: 1 })];
    applyBallSnapshot(target, [{
      id: 0, x: 1, y: 0.028, z: 0.5,
      vx: 0, vy: 0, vz: 1, wx: 0, wy: 0, wz: 0,
      pocketed: false,
    }], { correction: 0.2, wake: false });

    assert.equal(target[0].body.position.x, 0.2);
    assert.equal(target[0].body.position.z, 0.1);
    assert.equal(target[0].body.velocity.x, 0.8);
    assert.equal(target[0].body.velocity.z, 0.2);
  });
});

describe('turn gate logic', () => {
  function canShoot({ online, mySeat, turnSeat, phase }) {
    if (!online) return true;
    if (phase !== 'playing') return false;
    return mySeat === turnSeat;
  }

  it('offline always can shoot', () => {
    assert.equal(canShoot({ online: false, mySeat: 1, turnSeat: 0, phase: 'playing' }), true);
  });

  it('online only current seat', () => {
    assert.equal(canShoot({ online: true, mySeat: 0, turnSeat: 0, phase: 'playing' }), true);
    assert.equal(canShoot({ online: true, mySeat: 1, turnSeat: 0, phase: 'playing' }), false);
  });

  it('waiting phase blocks shots', () => {
    assert.equal(canShoot({ online: true, mySeat: 0, turnSeat: 0, phase: 'waiting' }), false);
  });
});

describe('room code normalize (client-side mirror)', () => {
  function normalizeCode(raw) {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  }

  it('uppercases and strips', () => {
    assert.equal(normalizeCode(' ab12cd '), 'AB12CD');
    assert.equal(normalizeCode('xx-yy'), 'XXYY');
  });
});
