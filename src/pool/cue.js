import * as THREE from 'three';
import { BALL_R, CUE_LENGTH, MAX_POWER, MIN_POWER } from './constants.js';

/**
 * Cue stick controller.
 * - Aiming / charging: tip near cue ball
 * - After shot: stick stays visible in a "watching" pose (pulled back & raised), not hidden
 */
export class CueController {
  constructor(scene) {
    this.scene = scene;
    this.aimAngle = 0;
    this.power = 0;
    this.visible = true;
    this.mode = 'aim'; // 'aim' | 'stroke' | 'watch'
    this.basePull = 0.08;
    this.maxPull = 0.42;

    // stroke animation
    this._strokeT = 0;
    this._strokeDur = 0.18;
    this._watchPull = 0.55;
    this._watchLift = 0.12;

    this.group = new THREE.Group();
    this.group.name = 'cue';

    const shaftGeo = new THREE.CylinderGeometry(0.007, 0.011, CUE_LENGTH * 0.78, 12);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0xd2a679,
      roughness: 0.45,
      metalness: 0.05,
    });
    this.shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.shaft.castShadow = true;

    const buttGeo = new THREE.CylinderGeometry(0.012, 0.014, CUE_LENGTH * 0.22, 12);
    const buttMat = new THREE.MeshStandardMaterial({
      color: 0x2c1810,
      roughness: 0.55,
      metalness: 0.1,
    });
    this.butt = new THREE.Mesh(buttGeo, buttMat);
    this.butt.position.y = -(CUE_LENGTH * 0.78) / 2 - (CUE_LENGTH * 0.22) / 2;
    this.butt.castShadow = true;

    const tipGeo = new THREE.CylinderGeometry(0.0065, 0.007, 0.014, 12);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x3d7ea6,
      roughness: 0.7,
      metalness: 0.05,
    });
    this.tip = new THREE.Mesh(tipGeo, tipMat);
    this.tip.position.y = (CUE_LENGTH * 0.78) / 2 + 0.007;

    const ferGeo = new THREE.CylinderGeometry(0.0072, 0.0072, 0.012, 12);
    const ferMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe3, roughness: 0.4 });
    this.ferrule = new THREE.Mesh(ferGeo, ferMat);
    this.ferrule.position.y = (CUE_LENGTH * 0.78) / 2 - 0.004;

    this.stick = new THREE.Group();
    this.stick.add(this.shaft, this.butt, this.tip, this.ferrule);
    this.stick.rotation.x = Math.PI / 2;
    this.group.add(this.stick);
    scene.add(this.group);

    /** When a player avatar holds the cue, hide this free-floating stick mesh */
    this.stickVisible = true;

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1.2, 0, 0),
      ]),
      lineMat,
    );
    this.aimLine.renderOrder = 2;
    scene.add(this.aimLine);

    this.aimDots = [];
    const dotGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    for (let i = 0; i < 18; i++) {
      const d = new THREE.Mesh(dotGeo, dotMat.clone());
      d.renderOrder = 2;
      scene.add(d);
      this.aimDots.push(d);
    }

    // Guides are independent scene objects — keep off until actively aiming.
    this._showGuides(false);
  }

  _showGuides(on) {
    this.aimLine.visible = on;
    for (const d of this.aimDots) d.visible = on;
  }

  /** Explicit guide visibility (aim line/dots are not children of the stick group). */
  setGuidesVisible(on) {
    this._showGuides(!!on);
  }

  /** Hide/show the free stick mesh (guides still work). */
  setStickVisible(v) {
    this.stickVisible = v;
    this.stick.visible = v;
  }

  /**
   * @deprecated kept for API compat — never fully hides the stick
   */
  setVisible(v) {
    this.visible = true;
    this.group.visible = true;
    if (!v) {
      this.mode = 'watch';
      this._showGuides(false);
    } else {
      this.mode = 'aim';
      this._showGuides(true);
    }
  }

  /** Call when shot is fired */
  beginStroke() {
    this.mode = 'stroke';
    this._strokeT = 0;
    this._showGuides(false);
    this.group.visible = true;
  }

  /** Call when balls have settled and player can aim again */
  beginAim() {
    this.mode = 'aim';
    this._showGuides(true);
    this.group.visible = true;
  }

  /**
   * @param {THREE.Vector3} cuePos
   * @param {number} pull 0..1 charge pull
   * @param {number} dt
   */
  update(cuePos, pull = 0, dt = 0.016) {
    this.group.visible = true;
    this.stick.visible = this.stickVisible;

    let gapPull = pull;
    let lift = 0;
    let pitch = 0;

    if (this.mode === 'stroke') {
      this._strokeT += dt;
      const u = Math.min(1, this._strokeT / this._strokeDur);
      // thrust forward then retract to watch pose
      if (u < 0.35) {
        const t = u / 0.35;
        gapPull = Math.max(0, pull * 0.3 - t * 0.25); // lunge toward ball
      } else {
        const t = (u - 0.35) / 0.65;
        gapPull = THREE.MathUtils.lerp(0, this._watchPull, t);
        lift = THREE.MathUtils.lerp(0, this._watchLift, t);
        pitch = THREE.MathUtils.lerp(0, 0.18, t);
      }
      if (u >= 1) this.mode = 'watch';
    } else if (this.mode === 'watch') {
      gapPull = this._watchPull;
      lift = this._watchLift;
      pitch = 0.18;
    }

    const dirX = Math.cos(this.aimAngle);
    const dirZ = Math.sin(this.aimAngle);
    const gap = BALL_R + 0.01 + this.basePull + gapPull * this.maxPull;
    const tipX = cuePos.x - dirX * gap;
    const tipZ = cuePos.z - dirZ * gap;
    const midOffset = CUE_LENGTH * 0.5;

    this.group.position.set(
      tipX - dirX * midOffset,
      cuePos.y + 0.004 + lift,
      tipZ - dirZ * midOffset,
    );
    this.group.rotation.set(pitch, -this.aimAngle + Math.PI / 2, 0);

    // Aim guides only in aim/charge — sit clearly above cloth to avoid z-fight flash.
    if (this.mode === 'aim' && this.aimLine.visible) {
      const guideY = Math.max(cuePos.y, BALL_R) + 0.004;
      const start = new THREE.Vector3(cuePos.x, guideY, cuePos.z);
      const len = 1.35;
      this.aimLine.geometry.setFromPoints([
        start,
        new THREE.Vector3(cuePos.x + dirX * len, guideY, cuePos.z + dirZ * len),
      ]);
      for (let i = 0; i < this.aimDots.length; i++) {
        const t = 0.08 + i * 0.07;
        const d = this.aimDots[i];
        d.position.set(cuePos.x + dirX * t, guideY + 0.001, cuePos.z + dirZ * t);
        d.material.opacity = 0.5 * (1 - i / this.aimDots.length);
      }
    }
  }

  aimToward(cuePos, targetXZ) {
    const dx = targetXZ.x - cuePos.x;
    const dz = targetXZ.z - cuePos.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.aimAngle = Math.atan2(dz, dx);
  }

  getShotDirection() {
    return new THREE.Vector3(Math.cos(this.aimAngle), 0, Math.sin(this.aimAngle));
  }

  getImpulse(power01) {
    const p = THREE.MathUtils.clamp(power01, 0, 1);
    const strength = MIN_POWER + p * (MAX_POWER - MIN_POWER);
    return this.getShotDirection().multiplyScalar(strength);
  }

  static powerFromDrag(dx, dy, scale = 180) {
    return THREE.MathUtils.clamp(Math.hypot(dx, dy) / scale, 0, 1);
  }
}
