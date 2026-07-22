import { BALL_R, PHYSICS } from '../constants.js';
import { getSlipVelocity } from '../physics.js';

const SPHERE_INERTIA_FACTOR = 2 / 5;

/** Rotational inertia of a solid sphere: (2/5) m r² */
export function sphereInertia(mass, radius = BALL_R) {
  return SPHERE_INERTIA_FACTOR * mass * radius * radius;
}

export function horizontalSpeed(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

export function translationalKineticEnergy(mass, velocity) {
  const v2 = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
  return 0.5 * mass * v2;
}

export function rotationalKineticEnergy(mass, angularVelocity, radius = BALL_R) {
  const I = sphereInertia(mass, radius);
  const w2 = angularVelocity.x * angularVelocity.x
    + angularVelocity.y * angularVelocity.y
    + angularVelocity.z * angularVelocity.z;
  return 0.5 * I * w2;
}

export function momentumXZ(mass, velocity) {
  return {
    x: mass * velocity.x,
    z: mass * velocity.z,
  };
}

/**
 * Classify cloth contact state using the same slip threshold as the simulator.
 * @returns {'still' | 'rolling' | 'sliding'}
 */
export function classifyMotionState(body, config = PHYSICS, radius = BALL_R) {
  const speed = horizontalSpeed(body.velocity);
  const slip = getSlipVelocity(body, radius);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  if (speed <= config.stopLinearSpeed && slipSpeed <= config.stopSlipSpeed) return 'still';
  if (slipSpeed <= config.slipSpeedThreshold) return 'rolling';
  return 'sliding';
}

export function sampleBall(body, { mass = body.mass, radius = BALL_R, config = PHYSICS } = {}) {
  const slip = getSlipVelocity(body, radius);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  const speed = horizontalSpeed(body.velocity);
  const p = momentumXZ(mass, body.velocity);
  const et = translationalKineticEnergy(mass, body.velocity);
  const er = rotationalKineticEnergy(mass, body.angularVelocity, radius);
  return {
    speed,
    vx: body.velocity.x,
    vy: body.velocity.y,
    vz: body.velocity.z,
    wx: body.angularVelocity.x,
    wy: body.angularVelocity.y,
    wz: body.angularVelocity.z,
    slipSpeed,
    slipX: slip.x,
    slipZ: slip.z,
    px: p.x,
    pz: p.z,
    energyTrans: et,
    energyRot: er,
    energyTotal: et + er,
    state: classifyMotionState(body, config, radius),
  };
}

/**
 * Aggregate system horizontal momentum and kinetic energy for active balls.
 * @param {Array<{ body: object, pocketed?: boolean }>} balls
 */
export function sampleSystem(balls, { radius = BALL_R, config = PHYSICS } = {}) {
  let px = 0;
  let pz = 0;
  let energyTrans = 0;
  let energyRot = 0;
  let moving = 0;

  for (const ball of balls) {
    if (ball.pocketed || !ball.body) continue;
    const s = sampleBall(ball.body, { mass: ball.body.mass, radius, config });
    px += s.px;
    pz += s.pz;
    energyTrans += s.energyTrans;
    energyRot += s.energyRot;
    if (s.state !== 'still') moving += 1;
  }

  return {
    px,
    pz,
    pMag: Math.hypot(px, pz),
    energyTrans,
    energyRot,
    energyTotal: energyTrans + energyRot,
    moving,
  };
}

/**
 * Compare two horizontal momentum samples (e.g. pre/post collision window).
 * @returns {{ dpMag: number, pBeforeMag: number, relChange: number }}
 */
export function momentumDelta(before, after) {
  const dpx = after.px - before.px;
  const dpz = after.pz - before.pz;
  const dpMag = Math.hypot(dpx, dpz);
  const pBeforeMag = Math.hypot(before.px, before.pz);
  const relChange = pBeforeMag > 1e-9 ? dpMag / pBeforeMag : dpMag;
  return { dpx, dpz, dpMag, pBeforeMag, relChange };
}

export function energyRatio(energyBefore, energyAfter) {
  if (energyBefore <= 1e-12) return energyAfter <= 1e-12 ? 1 : Infinity;
  return energyAfter / energyBefore;
}

/** Snapshot linear velocities for collision Δ sampling. */
export function snapshotVelocities(balls) {
  const map = new Map();
  for (const ball of balls) {
    if (ball.pocketed || !ball.body) continue;
    const v = ball.body.velocity;
    const w = ball.body.angularVelocity;
    map.set(ball.id, {
      vx: v.x,
      vy: v.y,
      vz: v.z,
      wx: w.x,
      wy: w.y,
      wz: w.z,
      mass: ball.body.mass,
    });
  }
  return map;
}

export function systemFromVelocityMap(map) {
  let px = 0;
  let pz = 0;
  let energyTrans = 0;
  let energyRot = 0;
  for (const s of map.values()) {
    px += s.mass * s.vx;
    pz += s.mass * s.vz;
    const v2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
    energyTrans += 0.5 * s.mass * v2;
    const I = sphereInertia(s.mass);
    const w2 = s.wx * s.wx + s.wy * s.wy + s.wz * s.wz;
    energyRot += 0.5 * I * w2;
  }
  return {
    px,
    pz,
    pMag: Math.hypot(px, pz),
    energyTrans,
    energyRot,
    energyTotal: energyTrans + energyRot,
  };
}

export const MOTION_LABELS = Object.freeze({
  still: '静止',
  rolling: '滚动',
  sliding: '滑动',
});
