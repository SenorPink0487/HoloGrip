import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { BALL_R, PHYSICS } from '../constants.js';
import {
  classifyMotionState,
  energyRatio,
  momentumDelta,
  rotationalKineticEnergy,
  sampleBall,
  sampleSystem,
  sphereInertia,
  translationalKineticEnergy,
} from '../probe/probe-math.js';

function makeBody({ mass = PHYSICS.ballMass } = {}) {
  return new CANNON.Body({
    mass,
    shape: new CANNON.Sphere(BALL_R),
    position: new CANNON.Vec3(0, BALL_R, 0),
  });
}

test('sphere inertia is 2/5 m r²', () => {
  const m = 0.17;
  assert.ok(Math.abs(sphereInertia(m) - 0.4 * m * BALL_R * BALL_R) < 1e-12);
});

test('translational and rotational kinetic energy match hand values', () => {
  const m = PHYSICS.ballMass;
  const v = { x: 2, y: 0, z: 0 };
  assert.equal(translationalKineticEnergy(m, v), 0.5 * m * 4);

  const body = makeBody();
  body.angularVelocity.set(0, 0, -2 / BALL_R);
  const er = rotationalKineticEnergy(m, body.angularVelocity);
  const I = sphereInertia(m);
  const w = 2 / BALL_R;
  assert.ok(Math.abs(er - 0.5 * I * w * w) < 1e-12);
});

test('still / rolling / sliding classification', () => {
  const body = makeBody();
  assert.equal(classifyMotionState(body), 'still');

  body.velocity.x = 0.8;
  body.angularVelocity.z = -0.8 / BALL_R;
  assert.equal(classifyMotionState(body), 'rolling');

  body.angularVelocity.z = 0;
  assert.equal(classifyMotionState(body), 'sliding');
});

test('sampleSystem sums momentum and energy of two balls', () => {
  const a = makeBody();
  const b = makeBody();
  a.velocity.set(1, 0, 0);
  b.velocity.set(0, 0, 2);
  const balls = [
    { id: 0, body: a, pocketed: false },
    { id: 1, body: b, pocketed: false },
  ];
  const sys = sampleSystem(balls);
  assert.ok(Math.abs(sys.px - PHYSICS.ballMass * 1) < 1e-12);
  assert.ok(Math.abs(sys.pz - PHYSICS.ballMass * 2) < 1e-12);
  assert.ok(Math.abs(sys.energyTrans - 0.5 * PHYSICS.ballMass * (1 + 4)) < 1e-12);
});

test('pocketed balls are excluded from system sample', () => {
  const a = makeBody();
  a.velocity.set(3, 0, 0);
  const balls = [
    { id: 0, body: a, pocketed: true },
  ];
  const sys = sampleSystem(balls);
  assert.equal(sys.px, 0);
  assert.equal(sys.energyTotal, 0);
});

test('momentumDelta and energyRatio report relative change', () => {
  const before = { px: 0.34, pz: 0, energyTotal: 0.34 };
  const after = { px: 0.34, pz: 0, energyTotal: 0.31 };
  const mom = momentumDelta(before, after);
  assert.ok(mom.relChange < 1e-9);
  assert.ok(Math.abs(energyRatio(0.34, 0.31) - 0.31 / 0.34) < 1e-12);
});

test('sampleBall exposes slip and state for pure sliding cue', () => {
  const body = makeBody();
  body.velocity.set(1.5, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  const s = sampleBall(body);
  assert.equal(s.state, 'sliding');
  assert.ok(Math.abs(s.slipSpeed - 1.5) < 1e-9);
  assert.ok(s.energyRot < 1e-12);
});
