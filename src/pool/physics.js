import { BALL_R, BALL_Y, PHYSICS } from './constants.js';

const SPHERE_INERTIA_FACTOR = 2 / 5;

function approachZero(value, amount) {
  if (Math.abs(value) <= amount) return 0;
  return value - Math.sign(value) * amount;
}

/** Horizontal velocity of the point where the ball touches the cloth. */
export function getSlipVelocity(body, radius = BALL_R) {
  return {
    x: body.velocity.x + body.angularVelocity.z * radius,
    z: body.velocity.z - body.angularVelocity.x * radius,
  };
}

/** True when an XZ movement segment enters a circular pocket capture area. */
export function segmentIntersectsCircle(from, to, center, radius) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((center.x - from.x) * dx + (center.z - from.z) * dz) / lengthSquared))
    : 0;
  const closestX = from.x + dx * t;
  const closestZ = from.z + dz * t;
  return (closestX - center.x) ** 2 + (closestZ - center.z) ** 2 <= radius * radius;
}

/** Swept 3D point test used by the animated cue tip against the cue ball. */
export function segmentIntersectsSphere(from, to, center, radius) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, (
      (center.x - from.x) * dx
      + (center.y - from.y) * dy
      + (center.z - from.z) * dz
    ) / lengthSquared))
    : 0;
  const cx = from.x + dx * t - center.x;
  const cy = from.y + dy * t - center.y;
  const cz = from.z + dz * t - center.z;
  return cx * cx + cy * cy + cz * cz <= radius * radius;
}

/**
 * Integrate one ball/cloth contact without relying on generic body damping.
 * The sliding impulse is capped at the exact impulse required to reach rolling,
 * which prevents low-speed friction from reversing the ball.
 */
export function integrateClothContact(body, dt, config = PHYSICS, radius = BALL_R) {
  if (body.mass <= 0) return;

  const slip = getSlipVelocity(body, radius);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  const inertia = SPHERE_INERTIA_FACTOR * body.mass * radius * radius;

  if (slipSpeed > config.slipSpeedThreshold) {
    const cancelImpulse = (body.mass * slipSpeed) / 3.5;
    const frictionImpulse = config.slidingFriction * body.mass * config.gravity * dt;
    const magnitude = Math.min(cancelImpulse, frictionImpulse);
    const jx = (-slip.x / slipSpeed) * magnitude;
    const jz = (-slip.z / slipSpeed) * magnitude;

    body.velocity.x += jx / body.mass;
    body.velocity.z += jz / body.mass;
    body.angularVelocity.x += (-radius * jz) / inertia;
    body.angularVelocity.z += (radius * jx) / inertia;
  } else {
    // Remove the final tiny amount of slip, then apply rolling resistance to
    // the centre velocity and rebuild the no-slip angular velocity.
    if (slipSpeed > 0) {
      const magnitude = (body.mass * slipSpeed) / 3.5;
      const jx = (-slip.x / slipSpeed) * magnitude;
      const jz = (-slip.z / slipSpeed) * magnitude;
      body.velocity.x += jx / body.mass;
      body.velocity.z += jz / body.mass;
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    const nextSpeed = Math.max(0, speed - config.rollingDeceleration * dt);
    if (speed > 0) {
      const scale = nextSpeed / speed;
      body.velocity.x *= scale;
      body.velocity.z *= scale;
    }
    if (nextSpeed === 0) {
      body.angularVelocity.x = 0;
      body.angularVelocity.z = 0;
    } else {
      body.angularVelocity.x = body.velocity.z / radius;
      body.angularVelocity.z = -body.velocity.x / radius;
    }
  }

  body.angularVelocity.y = approachZero(
    body.angularVelocity.y,
    config.spinDeceleration * dt,
  );

}

export class PoolPhysics {
  constructor(world, balls, config = PHYSICS) {
    this.world = world;
    this.balls = balls;
    this.config = config;
    this.accumulator = 0;
    this.previousPositions = new Map();
    this.settleDurations = new Map();
    this.syncPositions();
  }

  syncPositions() {
    this.previousPositions.clear();
    for (const ball of this.balls) {
      this.previousPositions.set(ball.id, {
        x: ball.body.position.x,
        z: ball.body.position.z,
      });
    }
  }

  reset() {
    this.accumulator = 0;
    this.settleDurations.clear();
    this.syncPositions();
  }

  strikeCenter(ball, velocity) {
    this.accumulator = 0;
    ball.body.wakeUp();
    ball.body.velocity.set(velocity.x, 0, velocity.z);
    // A centre-ball strike starts in the sliding state; cloth friction creates
    // the rolling spin naturally over the following fixed steps.
    ball.body.angularVelocity.set(0, 0, 0);
    this.settleDurations.set(ball.id, 0);
  }

  /**
   * @param {number} frameDelta
   * @param {{ beforeWorldStep?: () => void }} [hooks]
   *   beforeWorldStep runs after cloth integration, before the contact solver —
   *   useful for sampling pre-impact velocities (e.g. physics probe).
   */
  step(frameDelta, hooks = {}) {
    this.syncPositions();
    const dt = Math.min(Math.max(frameDelta, 0), this.config.maxFrameDelta);
    this.accumulator = Math.min(
      this.accumulator + dt,
      this.config.fixedTimeStep * this.config.maxSubSteps,
    );

    let steps = 0;
    while (this.accumulator >= this.config.fixedTimeStep && steps < this.config.maxSubSteps) {
      this.applySurfacePhysics(this.config.fixedTimeStep);
      hooks.beforeWorldStep?.();
      this.world.step(this.config.fixedTimeStep);
      this.stabilizeBalls(this.config.fixedTimeStep);
      this.accumulator -= this.config.fixedTimeStep;
      steps++;
    }
    return steps;
  }

  applySurfacePhysics(dt) {
    for (const ball of this.balls) {
      if (ball.pocketed || !ball.body.world || ball.body.sleepState === 2) continue;
      if (Math.abs(ball.body.position.y - BALL_Y) > this.config.surfaceTolerance) continue;
      integrateClothContact(ball.body, dt, this.config);
    }
  }

  stabilizeBalls(dt) {
    for (const ball of this.balls) {
      if (ball.pocketed || !ball.body.world) continue;
      const body = ball.body;
      if (Math.abs(body.position.y - BALL_Y) <= this.config.surfaceTolerance * 2) {
        body.position.y = BALL_Y;
        if (Math.abs(body.velocity.y) < 0.15) body.velocity.y = 0;
      }
      const slip = getSlipVelocity(body);
      const visuallyStill = Math.hypot(body.velocity.x, body.velocity.z) <= this.config.stopLinearSpeed
        && Math.hypot(slip.x, slip.z) <= this.config.stopSlipSpeed;
      const stableFor = visuallyStill ? (this.settleDurations.get(ball.id) ?? 0) + dt : 0;
      this.settleDurations.set(ball.id, stableFor);
      if (stableFor >= this.config.settleTime) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.velocity.y = 0;
        body.sleep();
      }
    }
  }

  getPreviousPosition(ball) {
    return this.previousPositions.get(ball.id) ?? ball.body.position;
  }

  allBallsSettled() {
    return this.balls.every((ball) => {
      if (ball.pocketed) return true;
      const body = ball.body;
      return body.sleepState === 2
        || (this.settleDurations.get(ball.id) ?? 0) >= this.config.settleTime;
    });
  }
}
