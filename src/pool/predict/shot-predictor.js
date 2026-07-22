import * as CANNON from 'cannon-es';
import {
  BALL_R,
  BALL_Y,
  CLOTH_Y,
  PHYSICS,
  pocketCaptureRadius,
  TABLE_LENGTH,
  TABLE_WIDTH,
  RESTITUTION_BALL,
  RESTITUTION_CUSHION,
  FRICTION_BALL,
  MIN_POWER,
  MAX_POWER,
} from '../constants.js';
import { PoolPhysics, segmentIntersectsCircle } from '../physics.js';
import { createCushionBodies, getPocketPositions } from '../table.js';

const MAX_SIM_TIME = 14; // seconds of simulated time
const PATH_SAMPLE_DT = 1 / 40; // store path points ~40 Hz
const MIN_MOVE = BALL_R * 0.35;

/**
 * Headless twin of the live table: same materials, cushions, cloth model.
 * Call predict() with current ball poses + cue velocity to get rest positions.
 */
export class ShotPredictor {
  constructor(pocketPositions = getPocketPositions()) {
    this.pockets = pocketPositions;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -PHYSICS.gravity, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 14;

    const ballMat = new CANNON.Material('predict-ball');
    const clothMat = new CANNON.Material('predict-cloth');
    const cushionMat = new CANNON.Material('predict-cushion');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(ballMat, ballMat, {
        friction: FRICTION_BALL,
        restitution: RESTITUTION_BALL,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(ballMat, clothMat, {
        friction: 0,
        restitution: 0.02,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(ballMat, cushionMat, {
        friction: PHYSICS.cushionFriction,
        restitution: RESTITUTION_CUSHION,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
      }),
    );

    const ground = new CANNON.Body({
      mass: 0,
      material: clothMat,
      shape: new CANNON.Plane(),
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.set(0, CLOTH_Y, 0);
    this.world.addBody(ground);

    for (const c of createCushionBodies(cushionMat)) {
      this.world.addBody(c);
    }

    this.ballMat = ballMat;
    this.slots = [];
    for (let id = 0; id < 16; id++) {
      const body = new CANNON.Body({
        mass: PHYSICS.ballMass,
        shape: new CANNON.Sphere(BALL_R),
        material: ballMat,
        position: new CANNON.Vec3(0, BALL_Y, 0),
        linearDamping: 0,
        angularDamping: 0,
        allowSleep: true,
        sleepSpeedLimit: PHYSICS.stopLinearSpeed,
        sleepTimeLimit: 0.25,
      });
      body.userData = { type: 'ball', id };
      this.world.addBody(body);
      this.slots.push({
        id,
        body,
        pocketed: false,
        active: false,
      });
    }

    this.physics = new PoolPhysics(this.world, this.slots);
  }

  /**
   * @param {Array<{ id: number, pocketed: boolean, isCue?: boolean, body: { position: {x,y,z} } }>} liveBalls
   * @param {{ x: number, z: number }} cueVelocity  centre-strike linear velocity
   * @param {{ cueId?: number, maxTime?: number, recordPaths?: boolean }} [opts]
   * @returns {{
   *   finals: Array<{ id: number, x: number, z: number, pocketed: boolean, moved: boolean }>,
   *   paths: Map<number, Array<{ x: number, z: number }>>,
   *   pocketedIds: number[],
   *   simTime: number,
   *   steps: number,
   * }}
   */
  predict(liveBalls, cueVelocity, opts = {}) {
    const cueId = opts.cueId ?? 0;
    const maxTime = opts.maxTime ?? MAX_SIM_TIME;
    const recordPaths = opts.recordPaths !== false;
    const dt = PHYSICS.fixedTimeStep;

    // Reset slots from live state
    for (const slot of this.slots) {
      const live = liveBalls.find((b) => b.id === slot.id);
      const onTable = live && !live.pocketed;
      slot.active = !!onTable;
      slot.pocketed = !onTable;
      if (onTable) {
        if (!slot.body.world) this.world.addBody(slot.body);
        slot.body.wakeUp();
        slot.body.position.set(live.body.position.x, BALL_Y, live.body.position.z);
        slot.body.velocity.set(0, 0, 0);
        slot.body.angularVelocity.set(0, 0, 0);
        slot.body.quaternion.set(0, 0, 0, 1);
      } else if (slot.body.world) {
        this.world.removeBody(slot.body);
      }
    }

    this.physics.reset();
    const cueSlot = this.slots.find((s) => s.id === cueId && s.active);
    if (!cueSlot) {
      return emptyResult(liveBalls);
    }
    this.physics.strikeCenter(cueSlot, {
      x: cueVelocity.x,
      z: cueVelocity.z,
    });

    const starts = new Map();
    const paths = new Map();
    /** Peak distance from start — balls can bounce back near origin and still count as moved. */
    const peakTravel = new Map();
    for (const slot of this.slots) {
      if (!slot.active) continue;
      starts.set(slot.id, {
        x: slot.body.position.x,
        z: slot.body.position.z,
      });
      peakTravel.set(slot.id, 0);
      if (recordPaths) {
        paths.set(slot.id, [{ x: slot.body.position.x, z: slot.body.position.z }]);
      }
    }

    let firstHit = null;
    let cushionHits = 0;
    let pendingHit = null;
    const preVel = new Map();

    const onBeginContact = (e) => {
      const a = e.bodyA;
      const b = e.bodyB;
      const ta = a?.userData?.type;
      const tb = b?.userData?.type;
      if (!ta || !tb) return;

      if (ta === 'ball' && tb === 'ball') {
        if (firstHit || pendingHit) return;
        const idA = a.userData.id;
        const idB = b.userData.id;
        const va = preVel.get(idA);
        const vb = preVel.get(idB);
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        let cutAngleDeg = 0;
        let speedIn = 0;
        if (va && vb) {
          const rvx = va.vx - vb.vx;
          const rvz = va.vz - vb.vz;
          speedIn = Math.hypot(rvx, rvz);
          if (speedIn > 1e-6) {
            const cos = Math.abs((rvx * nx + rvz * nz) / speedIn);
            cutAngleDeg = Math.acos(Math.min(1, Math.max(0, cos))) * (180 / Math.PI);
          }
        }
        // Prefer cue as "self"
        let selfId = idA;
        let otherId = idB;
        let selfBody = a;
        let otherBody = b;
        if (idB === cueId) {
          selfId = idB;
          otherId = idA;
          selfBody = b;
          otherBody = a;
        } else if (idA !== cueId && idB !== cueId) {
          // object-object: still record first pack collision
        }
        pendingHit = {
          kind: 'ball-ball',
          selfId,
          otherId,
          cutAngleDeg,
          speedIn,
          normal: { x: nx, z: nz },
          point: {
            x: (selfBody.position.x + otherBody.position.x) / 2,
            z: (selfBody.position.z + otherBody.position.z) / 2,
          },
          framesLeft: 2,
        };
        return;
      }

      const ballCushion = (ta === 'ball' && tb === 'cushion') || (tb === 'ball' && ta === 'cushion');
      if (ballCushion) {
        const ballBody = ta === 'ball' ? a : b;
        const speed = Math.hypot(ballBody.velocity.x, ballBody.velocity.z);
        if (speed < 0.12) return;
        cushionHits += 1;
        if (!firstHit && !pendingHit) {
          const nx = ballBody.position.x;
          const nz = ballBody.position.z;
          const nlen = Math.hypot(nx, nz) || 1;
          firstHit = {
            kind: 'cushion',
            selfId: ballBody.userData.id,
            otherId: null,
            cutAngleDeg: null,
            speedIn: speed,
            normal: { x: nx / nlen, z: nz / nlen },
            point: { x: ballBody.position.x, z: ballBody.position.z },
            cueSpeedOut: null,
            objSpeedOut: null,
          };
        }
      }
    };
    this.world.addEventListener('beginContact', onBeginContact);

    let simTime = 0;
    let steps = 0;
    let pathAcc = 0;
    const maxSteps = Math.ceil(maxTime / dt);

    while (simTime < maxTime && steps < maxSteps) {
      // previous positions for swept pocket test + pre-impact velocities
      const prev = new Map();
      preVel.clear();
      for (const slot of this.slots) {
        if (!slot.active || slot.pocketed) continue;
        prev.set(slot.id, {
          x: slot.body.position.x,
          z: slot.body.position.z,
        });
        preVel.set(slot.id, {
          vx: slot.body.velocity.x,
          vz: slot.body.velocity.z,
        });
      }

      this.physics.applySurfacePhysics(dt);
      this.world.step(dt);
      this.physics.stabilizeBalls(dt);

      if (pendingHit) {
        pendingHit.framesLeft -= 1;
        if (pendingHit.framesLeft <= 0) {
          const self = this.slots.find((s) => s.id === pendingHit.selfId);
          const other = this.slots.find((s) => s.id === pendingHit.otherId);
          firstHit = {
            kind: 'ball-ball',
            selfId: pendingHit.selfId,
            otherId: pendingHit.otherId,
            cutAngleDeg: pendingHit.cutAngleDeg,
            speedIn: pendingHit.speedIn,
            normal: pendingHit.normal,
            point: pendingHit.point,
            cueSpeedOut: self && !self.pocketed
              ? Math.hypot(self.body.velocity.x, self.body.velocity.z)
              : 0,
            objSpeedOut: other && !other.pocketed
              ? Math.hypot(other.body.velocity.x, other.body.velocity.z)
              : 0,
          };
          pendingHit = null;
        }
      }

      for (const slot of this.slots) {
        if (!slot.active || slot.pocketed) continue;
        const p = slot.body.position;
        const previous = prev.get(slot.id) ?? { x: p.x, z: p.z };
        if (this._shouldPocket(previous, p)) {
          this._pocket(slot);
          peakTravel.set(slot.id, Math.max(peakTravel.get(slot.id) ?? 0, MIN_MOVE * 2));
          continue;
        }
        const start = starts.get(slot.id);
        if (start) {
          const travel = Math.hypot(p.x - start.x, p.z - start.z);
          if (travel > (peakTravel.get(slot.id) ?? 0)) peakTravel.set(slot.id, travel);
        }
      }

      simTime += dt;
      steps += 1;
      pathAcc += dt;

      if (recordPaths && pathAcc >= PATH_SAMPLE_DT) {
        pathAcc = 0;
        for (const slot of this.slots) {
          if (!slot.active || slot.pocketed) continue;
          const list = paths.get(slot.id);
          if (!list) continue;
          const last = list[list.length - 1];
          const x = slot.body.position.x;
          const z = slot.body.position.z;
          if ((x - last.x) ** 2 + (z - last.z) ** 2 > 1e-6) {
            list.push({ x, z });
          }
        }
      }

      if (this.physics.allBallsSettled()) {
        // require a few extra settled steps like the main loop
        let extra = 0;
        while (extra < 8 && this.physics.allBallsSettled()) {
          this.physics.applySurfacePhysics(dt);
          this.world.step(dt);
          this.physics.stabilizeBalls(dt);
          simTime += dt;
          steps += 1;
          extra += 1;
        }
        break;
      }
    }

    this.world.removeEventListener('beginContact', onBeginContact);
    if (pendingHit && !firstHit) {
      firstHit = {
        kind: pendingHit.kind,
        selfId: pendingHit.selfId,
        otherId: pendingHit.otherId,
        cutAngleDeg: pendingHit.cutAngleDeg,
        speedIn: pendingHit.speedIn,
        normal: pendingHit.normal,
        point: pendingHit.point,
        cueSpeedOut: null,
        objSpeedOut: null,
      };
    }

    const finals = [];
    const pocketedIds = [];
    for (const slot of this.slots) {
      if (!slot.active && !starts.has(slot.id)) {
        const live = liveBalls.find((b) => b.id === slot.id);
        if (live?.pocketed) {
          finals.push({
            id: slot.id,
            x: live.body?.position?.x ?? 0,
            z: live.body?.position?.z ?? 0,
            pocketed: true,
            moved: false,
          });
          pocketedIds.push(slot.id);
        }
        continue;
      }
      const start = starts.get(slot.id);
      if (!start) continue;
      const traveled = peakTravel.get(slot.id) ?? 0;
      const moved = traveled > MIN_MOVE || slot.pocketed;
      if (slot.pocketed) {
        finals.push({
          id: slot.id,
          x: slot.body.position.x,
          z: slot.body.position.z,
          pocketed: true,
          moved: true,
        });
        pocketedIds.push(slot.id);
        continue;
      }
      const x = slot.body.position.x;
      const z = slot.body.position.z;
      finals.push({ id: slot.id, x, z, pocketed: false, moved });
      if (recordPaths && moved) {
        const list = paths.get(slot.id);
        if (list) {
          const last = list[list.length - 1];
          if (!last || last.x !== x || last.z !== z) list.push({ x, z });
        }
      }
    }

    if (recordPaths) {
      for (const f of finals) {
        if (!f.moved) paths.delete(f.id);
      }
    }

    return {
      finals,
      paths,
      pocketedIds,
      simTime,
      steps,
      firstHit,
      stats: { cushionHits },
      starts,
    };
  }

  _shouldPocket(from, to) {
    for (const pocket of this.pockets) {
      const r = pocketCaptureRadius(pocket);
      if (segmentIntersectsCircle(from, to, pocket, r)) return true;
    }
    if (
      Math.abs(to.x) > TABLE_LENGTH / 2 + BALL_R * 1.2
      || Math.abs(to.z) > TABLE_WIDTH / 2 + BALL_R * 1.2
      || to.y < -0.05
    ) {
      return true;
    }
    return false;
  }

  _pocket(slot) {
    slot.pocketed = true;
    slot.body.velocity.set(0, 0, 0);
    slot.body.angularVelocity.set(0, 0, 0);
    if (slot.body.world) this.world.removeBody(slot.body);
  }
}

function emptyResult(liveBalls) {
  return {
    finals: liveBalls.map((b) => ({
      id: b.id,
      x: b.body.position.x,
      z: b.body.position.z,
      pocketed: !!b.pocketed,
      moved: false,
    })),
    paths: new Map(),
    pocketedIds: liveBalls.filter((b) => b.pocketed).map((b) => b.id),
    simTime: 0,
    steps: 0,
    firstHit: null,
    stats: { cushionHits: 0 },
    starts: new Map(),
  };
}

/** Cue velocity from aim direction + UI power (same mapping as fireCue). */
export function cueVelocityFromAim(dirX, dirZ, power01) {
  const p = Math.min(1, Math.max(0, power01));
  const strength = MIN_POWER + p * (MAX_POWER - MIN_POWER);
  const speed = 1.05 + p * 0.35;
  const len = Math.hypot(dirX, dirZ) || 1;
  const s = (strength * speed) / len;
  return { x: dirX * s, z: dirZ * s };
}
