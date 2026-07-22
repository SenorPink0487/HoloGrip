import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { BALL_R, BALL_Y, PHYSICS } from '../constants.js';
import {
  PoolPhysics,
  getSlipVelocity,
  integrateClothContact,
  segmentIntersectsCircle,
  segmentIntersectsSphere,
} from '../physics.js';
import {
  AIM_DEPTH_MAX,
  AIM_DEPTH_MIN,
  CUE_BODY_OFFSET,
  PoolPlayer,
  clampAimDepth,
  getAimBodyOffset,
} from '../player.js';
import { isInsideBlock, resolveFloorMovement } from '../navigation.js';

function makeBody() {
  return new CANNON.Body({
    mass: PHYSICS.ballMass,
    shape: new CANNON.Sphere(BALL_R),
    position: new CANNON.Vec3(0, BALL_Y, 0),
    linearDamping: 0,
    angularDamping: 0,
  });
}

test('sliding friction removes energy and converges to rolling without reversing', () => {
  const body = makeBody();
  body.velocity.x = 2;
  let previousSpeed = body.velocity.x;
  let reachedRolling = false;

  for (let i = 0; i < 240; i++) {
    integrateClothContact(body, 1 / 120);
    assert.ok(body.velocity.x >= -1e-10);
    assert.ok(body.velocity.x <= previousSpeed + 1e-10);
    previousSpeed = body.velocity.x;
    const slip = getSlipVelocity(body);
    if (Math.hypot(slip.x, slip.z) <= PHYSICS.slipSpeedThreshold) reachedRolling = true;
  }

  assert.equal(reachedRolling, true);
  assert.ok(body.angularVelocity.z < 0);
});

test('a rolling ball keeps the no-slip ratio and eventually stops', () => {
  const body = makeBody();
  body.velocity.x = 0.8;
  body.angularVelocity.z = -body.velocity.x / BALL_R;

  for (let i = 0; i < 1200; i++) integrateClothContact(body, 1 / 120);

  const slip = getSlipVelocity(body);
  assert.ok(Math.hypot(slip.x, slip.z) < 1e-9);
  assert.equal(body.velocity.x, 0);
  assert.equal(body.angularVelocity.z, 0);
});

test('vertical spin decays without moving a stationary ball', () => {
  const body = makeBody();
  body.angularVelocity.y = 4;
  for (let i = 0; i < 720; i++) integrateClothContact(body, 1 / 120);
  assert.equal(body.angularVelocity.y, 0);
  assert.equal(body.velocity.x, 0);
  assert.equal(body.velocity.z, 0);
});

function simulate(frameDeltas) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  const body = makeBody();
  world.addBody(body);
  const ball = { id: 0, body, pocketed: false };
  const physics = new PoolPhysics(world, [ball]);
  physics.strikeCenter(ball, { x: 1.5, z: 0 });
  for (const dt of frameDeltas) physics.step(dt);
  return { x: body.position.x, speed: body.velocity.x };
}

test('fixed stepping is consistent across common rendering rates', () => {
  const at60 = simulate(Array(120).fill(1 / 60));
  const at120 = simulate(Array(240).fill(1 / 120));
  const at144 = simulate(Array(288).fill(1 / 144));
  assert.ok(Math.abs(at60.x - at120.x) < 1e-8);
  assert.ok(Math.abs(at60.x - at144.x) < 0.015);
  assert.ok(Math.abs(at60.speed - at144.speed) < 0.01);
});

test('reset clears accumulated time and centre strike clears residual spin', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  const body = makeBody();
  world.addBody(body);
  const ball = { id: 0, body, pocketed: false };
  const physics = new PoolPhysics(world, [ball]);
  physics.step(PHYSICS.fixedTimeStep / 2);
  body.angularVelocity.set(3, 4, 5);
  physics.reset();
  physics.strikeCenter(ball, { x: 1, z: 0.25 });
  assert.equal(physics.accumulator, 0);
  assert.deepEqual(
    [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
    [0, 0, 0],
  );
});

test('swept pocket test catches a fast crossing but rejects a near miss', () => {
  const pocket = { x: 0, z: 0 };
  assert.equal(segmentIntersectsCircle({ x: -0.2, z: 0 }, { x: 0.2, z: 0 }, pocket, 0.05), true);
  assert.equal(segmentIntersectsCircle({ x: -0.2, z: 0.06 }, { x: 0.2, z: 0.06 }, pocket, 0.05), false);
});

test('swept cue tip detects contact exactly once along a fast crossing', () => {
  const ball = { x: 0, y: BALL_Y, z: 0 };
  assert.equal(
    segmentIntersectsSphere(
      { x: 0, y: BALL_Y, z: -0.2 },
      { x: 0, y: BALL_Y, z: 0.2 },
      ball,
      BALL_R + 0.008,
    ),
    true,
  );
  assert.equal(
    segmentIntersectsSphere(
      { x: 0.05, y: BALL_Y, z: -0.2 },
      { x: 0.05, y: BALL_Y, z: 0.2 },
      ball,
      BALL_R + 0.008,
    ),
    false,
  );
});

test('aim depth clamps and body compensation stays aligned while rotating', () => {
  assert.equal(clampAimDepth(-1), AIM_DEPTH_MIN);
  assert.equal(clampAimDepth(1), AIM_DEPTH_MAX);
  for (const angle of [0, Math.PI / 3, Math.PI, Math.PI * 1.7]) {
    const depth = 0.11;
    const offset = getAimBodyOffset(angle, depth);
    const forwardProjection = offset.x * Math.cos(angle) + offset.z * Math.sin(angle);
    const lateralProjection = offset.x * Math.sin(angle) - offset.z * Math.cos(angle);
    assert.ok(Math.abs(forwardProjection - depth) < 1e-10);
    assert.ok(Math.abs(lateralProjection - CUE_BODY_OFFSET) < 1e-10);
  }
});

test('visually still ball sleeps after the settle window despite axial spin', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  const body = makeBody();
  body.velocity.x = 0.01;
  body.angularVelocity.y = 20;
  world.addBody(body);
  const ball = { id: 0, body, pocketed: false };
  const physics = new PoolPhysics(world, [ball]);
  for (let i = 0; i < 40; i++) physics.step(1 / 120);
  assert.equal(physics.allBallsSettled(), true);
  assert.equal(body.velocity.lengthSquared(), 0);
  assert.equal(body.angularVelocity.lengthSquared(), 0);
});

const navigationBounds = {
  roomHalfX: 4,
  roomHalfZ: 3,
  blockHalfX: 1.6,
  blockHalfZ: 1,
};

test('player placed inside the table is projected outside before moving', () => {
  const next = resolveFloorMovement(
    { x: 1.52, z: 0.2 },
    { x: -0.03, z: 0 },
    navigationBounds,
  );
  assert.equal(isInsideBlock(next, 1.6, 1), false);
  assert.ok(next.x > 1.6);
});

test('diagonal movement into the table slides along its edge', () => {
  const next = resolveFloorMovement(
    { x: 1.7, z: 0.4 },
    { x: -0.2, z: 0.25 },
    navigationBounds,
  );
  assert.equal(next.x, 1.7);
  assert.equal(next.z, 0.65);
  assert.equal(isInsideBlock(next, 1.6, 1), false);
});

test('changing aim stance keeps the cue at a fixed physical length', () => {
  const scene = new THREE.Scene();
  const avatar = new PoolPlayer(scene, { floorY: -0.84 });
  const ballPos = new THREE.Vector3(0, BALL_Y, 0);
  const shotDirection = { x: 1, z: 0 };

  const cueLength = () => {
    scene.updateMatrixWorld(true);
    const grip = avatar.cueGroup.getWorldPosition(new THREE.Vector3());
    const tip = avatar.getCueTipWorldPosition(new THREE.Vector3());
    return grip.distanceTo(tip);
  };

  avatar.setPosition(-1.8, 1.15);
  avatar.setYaw(0, true);
  avatar.update({ state: 'aim', ballPos, shotDirection, aimDepth: 0, dt: 1 / 60 });
  const before = cueLength();

  avatar.setPosition(-1.5, 0.9);
  avatar.update({ state: 'aim', ballPos, shotDirection, aimDepth: 0.18, dt: 1 / 60 });
  const after = cueLength();

  assert.ok(Math.abs(before - after) < 1e-10);
  assert.deepEqual(avatar.cueGroup.scale.toArray(), [1, 1, 1]);
  avatar.dispose();
});
