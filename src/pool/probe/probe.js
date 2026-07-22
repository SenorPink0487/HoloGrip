import { BALL_R, PHYSICS } from '../constants.js';
import {
  energyRatio,
  momentumDelta,
  sampleBall,
  sampleSystem,
  snapshotVelocities,
  systemFromVelocityMap,
} from './probe-math.js';
import { NOTE_COOLDOWN, NOTE_DISPLAY, pickContactNote, pickRollingNote } from './probe-notes.js';
import { ProbeOverlay } from './probe-overlay.js';
import { ProbeHud } from './probe-hud.js';

/**
 * Optional physics observation layer. Default off — does not alter gameplay.
 */
export class PhysicsProbe {
  constructor(scene, balls, { getCueBallId = () => 0 } = {}) {
    this.balls = balls;
    this.getCueBallId = getCueBallId;
    this.enabled = false;
    this.focusId = null;
    this.overlay = new ProbeOverlay(scene);
    this.hud = new ProbeHud();
    this.velocityCache = snapshotVelocities(balls);

    this.noteText = '';
    this.noteAge = 0;
    this.noteCooldowns = new Map();

    this.deltaText = '';
    this.deltaAge = 0;

    this.prevFocusState = new Map();
    this._pendingContact = null;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.overlay.setEnabled(this.enabled);
    this.hud.setEnabled(this.enabled);
    if (!this.enabled) {
      this.noteText = '';
      this.deltaText = '';
      this._pendingContact = null;
    } else if (this.focusId == null) {
      this.focusId = this.getCueBallId();
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setFocus(id) {
    this.focusId = id;
  }

  /** Call once per physics frame *before* world.step so collision Δ has a baseline. */
  cacheVelocities() {
    if (!this.enabled) return;
    this.velocityCache = snapshotVelocities(this.balls);
  }

  /**
   * From cannon beginContact — schedule a short delayed sample after the solver settles.
   * @param {object} bodyA
   * @param {object} bodyB
   */
  onContact(bodyA, bodyB) {
    if (!this.enabled) return;
    const ta = bodyA?.userData?.type;
    const tb = bodyB?.userData?.type;
    if (!ta || !tb) return;

    const ballBall = ta === 'ball' && tb === 'ball';
    const cushion = (ta === 'ball' && tb === 'cushion') || (tb === 'ball' && ta === 'cushion');
    if (!ballBall && !cushion) return;

    // Ignore near-zero relative speed (settling chatter)
    const rvx = bodyA.velocity.x - bodyB.velocity.x;
    const rvz = bodyA.velocity.z - bodyB.velocity.z;
    if (Math.hypot(rvx, rvz) < 0.08) return;

    // Collapse multi-contact cascades into one pending sample
    if (this._pendingContact) return;

    const before = systemFromVelocityMap(this.velocityCache);
    let kind = ballBall ? 'ball-ball' : 'ball-cushion';
    let cutAngleDeg = 0;
    let mid = { x: 0, z: 0 };
    let normal = { x: 1, z: 0 };

    if (ballBall) {
      const dx = bodyB.position.x - bodyA.position.x;
      const dz = bodyB.position.z - bodyA.position.z;
      const len = Math.hypot(dx, dz) || 1;
      normal = { x: dx / len, z: dz / len };
      mid = {
        x: (bodyA.position.x + bodyB.position.x) / 2,
        z: (bodyA.position.z + bodyB.position.z) / 2,
      };
      // Angle between relative velocity and line of centres (pre-impact cache)
      const idA = bodyA.userData.id;
      const idB = bodyB.userData.id;
      const va = this.velocityCache.get(idA);
      const vb = this.velocityCache.get(idB);
      if (va && vb) {
        const rvx = va.vx - vb.vx;
        const rvz = va.vz - vb.vz;
        const rspeed = Math.hypot(rvx, rvz);
        if (rspeed > 1e-6) {
          const cos = Math.abs((rvx * normal.x + rvz * normal.z) / rspeed);
          const impactAngle = Math.acos(Math.min(1, Math.max(0, cos))) * (180 / Math.PI);
          cutAngleDeg = impactAngle;
        }
      }
    } else {
      const ballBody = ta === 'ball' ? bodyA : bodyB;
      mid = { x: ballBody.position.x, z: ballBody.position.z };
      // Approximate outward normal from table center for flash
      const nx = ballBody.position.x;
      const nz = ballBody.position.z;
      const nlen = Math.hypot(nx, nz) || 1;
      normal = { x: nx / nlen, z: nz / nlen };
    }

    this._pendingContact = {
      kind,
      before,
      cutAngleDeg,
      mid,
      normal,
      framesLeft: 2,
    };
  }

  /**
   * @param {number} dt frame delta seconds
   */
  update(dt) {
    if (!this.enabled) return;

    if (this._pendingContact) {
      this._pendingContact.framesLeft -= 1;
      if (this._pendingContact.framesLeft <= 0) {
        this._resolveContact(this._pendingContact);
        this._pendingContact = null;
      }
    }

    // Rolling transition notes
    for (const ball of this.balls) {
      if (ball.pocketed) continue;
      const sample = sampleBall(ball.body, { config: PHYSICS, radius: BALL_R });
      const prev = this.prevFocusState.get(ball.id);
      if (prev === 'sliding' && sample.state === 'rolling') {
        this._tryNote('toRolling', pickRollingNote());
      }
      this.prevFocusState.set(ball.id, sample.state);
    }

    if (this.noteText) {
      this.noteAge += dt;
      if (this.noteAge >= NOTE_DISPLAY) {
        this.noteText = '';
        this.noteAge = 0;
      }
    }
    if (this.deltaText) {
      this.deltaAge += dt;
      if (this.deltaAge >= 1.2) {
        this.deltaText = '';
        this.deltaAge = 0;
      }
    }

    // Cool down note categories
    for (const [key, t] of this.noteCooldowns) {
      const next = t - dt;
      if (next <= 0) this.noteCooldowns.delete(key);
      else this.noteCooldowns.set(key, next);
    }

    this.overlay.sync(this.balls);
    this.overlay.flashStep(dt);

    const focusId = this.focusId ?? this.getCueBallId();
    const focusBall = this.balls.find((b) => b.id === focusId && !b.pocketed)
      ?? this.balls.find((b) => b.isCue && !b.pocketed)
      ?? null;
    const focusSample = focusBall
      ? sampleBall(focusBall.body, { config: PHYSICS, radius: BALL_R })
      : null;
    const system = sampleSystem(this.balls, { config: PHYSICS, radius: BALL_R });

    let focusLabel = '—';
    if (focusBall) {
      focusLabel = focusBall.isCue ? '母球' : (focusBall.def?.name ?? `#${focusBall.id}`);
    }

    this.hud.render({
      focusLabel,
      focus: focusSample,
      system,
      deltaText: this.deltaText,
      noteText: this.noteText,
    });
  }

  _resolveContact(pending) {
    const after = sampleSystem(this.balls, { config: PHYSICS, radius: BALL_R });
    const mom = momentumDelta(pending.before, after);
    const er = energyRatio(pending.before.energyTotal, after.energyTotal);

    const relPct = mom.relChange * 100;
    const pPart = mom.pBeforeMag < 1e-6
      ? 'Σp 基准很小'
      : relPct < 3
        ? 'Σp 变化 < 3%'
        : `Σp 变化 ${relPct.toFixed(0)}%`;
    const ePart = Number.isFinite(er) ? `动能比 ${er.toFixed(2)}` : '动能比 —';
    const label = pending.kind === 'ball-ball' ? '球-球' : '球-库';
    this.deltaText = `${label} · ${pPart} · ${ePart}`;
    this.deltaAge = 0;

    this.overlay.flashImpulse(pending.mid, pending.normal);

    const note = pickContactNote(pending.kind, {
      cutAngleDeg: pending.cutAngleDeg,
      relPChange: mom.relChange,
    });
    this._tryNote(pending.kind === 'ball-ball' ? 'ball-ball' : 'cushion', note);
  }

  _tryNote(category, text) {
    if (this.noteCooldowns.has(category)) return;
    this.noteText = text;
    this.noteAge = 0;
    this.noteCooldowns.set(category, NOTE_COOLDOWN);
  }
}
