import * as THREE from 'three';
import { BALL_Y } from '../constants.js';

const ARROW_Y = BALL_Y + 0.045;
const MIN_SPEED = 0.04;
const MAX_ARROW_LEN = 0.42;
const SPEED_TO_LEN = 0.18;

/**
 * Reusable velocity arrows + short-lived impulse flashes in the table scene.
 */
export class ProbeOverlay {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'probe-overlay';
    this.group.visible = false;
    scene.add(this.group);

    this.arrows = new Map();
    this.flashes = [];
    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
  }

  setEnabled(on) {
    this.group.visible = !!on;
    if (!on) {
      for (const entry of this.arrows.values()) entry.arrow.visible = false;
      this._clearFlashes();
    }
  }

  /**
   * @param {Array<{ id: number, pocketed?: boolean, body: { position: {x,y,z}, velocity: {x,z} } }>} balls
   */
  sync(balls) {
    if (!this.group.visible) return;

    const seen = new Set();
    for (const ball of balls) {
      if (ball.pocketed) continue;
      seen.add(ball.id);
      const vx = ball.body.velocity.x;
      const vz = ball.body.velocity.z;
      const speed = Math.hypot(vx, vz);
      let entry = this.arrows.get(ball.id);
      if (!entry) {
        entry = this._makeArrow(ball.isCue);
        this.arrows.set(ball.id, entry);
      }

      if (speed < MIN_SPEED) {
        entry.arrow.visible = false;
        continue;
      }

      const len = Math.min(MAX_ARROW_LEN, speed * SPEED_TO_LEN);
      this._dir.set(vx, 0, vz).normalize();
      this._origin.set(ball.body.position.x, ARROW_Y, ball.body.position.z);
      entry.arrow.position.copy(this._origin);
      entry.arrow.setDirection(this._dir);
      entry.arrow.setLength(len, Math.min(0.06, len * 0.35), Math.min(0.04, len * 0.22));
      entry.arrow.visible = true;
    }

    for (const [id, entry] of this.arrows) {
      if (!seen.has(id)) entry.arrow.visible = false;
    }

    this._updateFlashes();
  }

  /**
   * Brief impulse direction flash at a world XZ point.
   * @param {{ x: number, z: number }} pos
   * @param {{ x: number, z: number }} dir  horizontal direction (need not be unit)
   */
  flashImpulse(pos, dir, duration = 0.12) {
    if (!this.group.visible) return;
    const len = Math.hypot(dir.x, dir.z);
    if (len < 1e-6) return;

    const color = 0xffc857;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(dir.x / len, 0, dir.z / len),
      new THREE.Vector3(pos.x, ARROW_Y + 0.01, pos.z),
      0.22,
      color,
      0.07,
      0.045,
    );
    // Brighter / thicker feel via scale
    arrow.line.material.depthTest = true;
    arrow.cone.material.depthTest = true;
    this.group.add(arrow);
    this.flashes.push({ arrow, age: 0, duration });
  }

  dispose() {
    this._clearFlashes();
    for (const entry of this.arrows.values()) {
      this.group.remove(entry.arrow);
      entry.arrow.dispose?.();
    }
    this.arrows.clear();
    this.scene.remove(this.group);
  }

  _makeArrow(isCue) {
    const color = isCue ? 0x7ee0ff : 0x9dffb0;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, ARROW_Y, 0),
      0.1,
      color,
      0.05,
      0.03,
    );
    arrow.visible = false;
    this.group.add(arrow);
    return { arrow };
  }

  _updateFlashes() {
    // age advanced in probe.tick via flashStep
  }

  flashStep(dt) {
    if (this.flashes.length === 0) return;
    const remain = [];
    for (const f of this.flashes) {
      f.age += dt;
      const t = f.age / f.duration;
      if (t >= 1) {
        this.group.remove(f.arrow);
        f.arrow.dispose?.();
        continue;
      }
      const opacity = 1 - t;
      if (f.arrow.line?.material) {
        f.arrow.line.material.transparent = true;
        f.arrow.line.material.opacity = opacity;
      }
      if (f.arrow.cone?.material) {
        f.arrow.cone.material.transparent = true;
        f.arrow.cone.material.opacity = opacity;
      }
      remain.push(f);
    }
    this.flashes = remain;
  }

  _clearFlashes() {
    for (const f of this.flashes) {
      this.group.remove(f.arrow);
      f.arrow.dispose?.();
    }
    this.flashes = [];
  }
}
