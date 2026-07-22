import * as THREE from 'three';
import { BALL_R, CUE_LENGTH } from './constants.js';

const UP = new THREE.Vector3(0, 1, 0);
// Cue mesh is built tip → +Z, short butt → −Z, origin at the grip point
// so the long shaft never runs backward through the torso.
const CUE_TIP_Z = CUE_LENGTH * 0.72;
const CUE_BUTT_Z = -CUE_LENGTH * 0.18;
const TORSO_HALF_WIDTH = 0.18;
// Front/back half-thickness: body side profile matches leg thickness
const LEG_RADIUS = 0.088;
const BODY_DEPTH_HALF = LEG_RADIUS;
const CUE_MAX_RADIUS = 0.0105;
const CUE_CLEARANCE = 0.0095;
const CUE_READY_GAP = 0.20;
export const CUE_BODY_OFFSET = TORSO_HALF_WIDTH + CUE_MAX_RADIUS + CUE_CLEARANCE;
export const AIM_DEPTH_MIN = -0.30;
export const AIM_DEPTH_MAX = 0.18;

export function clampAimDepth(value) {
  return THREE.MathUtils.clamp(value, AIM_DEPTH_MIN, AIM_DEPTH_MAX);
}

export function getAimBodyOffset(aimAngle, depth = 0) {
  return {
    x: Math.sin(aimAngle) * CUE_BODY_OFFSET + Math.cos(aimAngle) * depth,
    z: -Math.cos(aimAngle) * CUE_BODY_OFFSET + Math.sin(aimAngle) * depth,
  };
}

/**
 * Soft, featureless pool avatar inspired by chunky clay characters.
 * The root is always on the floor. Navigation owns root position; this class owns visuals.
 */
export class PoolPlayer {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.floorY = opts.floorY ?? -0.84;
    this.mode = 'idle';
    this.yaw = Math.PI;
    this.walkPhase = 0;
    this.moveBlend = 0;
    this.aimBlend = 0;
    this.strokeT = 0;
    this.strokeDuration = 0.45;
    this.lastPull = 0.08;
    this.strokeFinished = false;

    this.skin = new THREE.MeshPhysicalMaterial({
      color: 0xfaf9f6,
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.82,
      sheen: 0.18,
      sheenColor: new THREE.Color(0xffffff),
    });

    this.root = new THREE.Group();
    this.root.name = 'poolPlayer';
    this.root.position.set(-1.8, this.floorY, 1.15);
    scene.add(this.root);

    this.body = new THREE.Group();
    this.root.add(this.body);
    this._buildBody();
    this._buildCue();

    this.limbs = {
      torso: null,
      neck: null,
      shoulders: null,
      leftShoulder: null,
      rightShoulder: null,
      leftArm: null,
      rightArm: null,
      leftLeg: null,
      rightLeg: null,
    };
    this.limbGroup = new THREE.Group();
    this.root.add(this.limbGroup);

    this._tmp = new THREE.Vector3();
  }

  _buildBody() {
    // Round clay head — nestles into shoulders like the reference clayman
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 48, 32), this.skin);
    head.name = 'head';
    head.position.set(0, 1.36, 0.01);
    head.castShadow = true;
    head.receiveShadow = true;
    this.head = head;
    this.body.add(head);

    // Soft shoulder balls — same radius as arm tubes so no thick→thin bulge
    const shoulderGeo = new THREE.SphereGeometry(0.068, 28, 20);
    for (const side of ['left', 'right']) {
      const ball = new THREE.Mesh(shoulderGeo, this.skin);
      ball.name = `${side}ShoulderBall`;
      ball.castShadow = true;
      ball.receiveShadow = true;
      this.body.add(ball);
      this[`${side}ShoulderBall`] = ball;
    }
  }

  _buildCue() {
    this.cueGroup = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc99a63, roughness: 0.48 });
    const buttMat = new THREE.MeshStandardMaterial({ color: 0x32180e, roughness: 0.56 });

    // Cylinder default axis = Y; rotate to +Z. Origin stays at the grip.
    const shaftLen = CUE_TIP_Z - 0.04;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.0105, shaftLen, 12), shaftMat,
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = shaftLen * 0.5;
    const buttLen = -CUE_BUTT_Z + 0.02;
    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, buttLen, 12), buttMat,
    );
    butt.name = 'cueButt';
    butt.userData.pick = 'cueButt';
    butt.rotation.x = Math.PI / 2;
    butt.position.z = CUE_BUTT_Z * 0.5;
    // Larger invisible collider so the dark butt end is easy to grab for fine aim.
    const buttPick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, buttLen + 0.06, 10),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    buttPick.name = 'cueButtPick';
    buttPick.userData.pick = 'cueButt';
    buttPick.rotation.x = Math.PI / 2;
    buttPick.position.z = CUE_BUTT_Z * 0.5;
    buttPick.visible = true; // must stay raycastable; material is fully transparent
    const tipLen = CUE_TIP_Z - shaftLen;
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.007, tipLen, 12),
      new THREE.MeshStandardMaterial({ color: 0x3d7ea6, roughness: 0.72 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = shaftLen + tipLen * 0.5;
    shaft.castShadow = butt.castShadow = true;
    this.cueButt = butt;
    this.cueButtPick = buttPick;
    this.cueGroup.add(shaft, butt, buttPick, tip);
    this.root.add(this.cueGroup);
  }

  /** Meshes used for mouse fine-aim on the dark butt end. */
  getCueButtPickTargets() {
    return [this.cueButtPick, this.cueButt].filter(Boolean);
  }

  getCueButtWorldPosition(target = new THREE.Vector3()) {
    target.set(0, 0, CUE_BUTT_Z * 0.5);
    return this.cueGroup.localToWorld(target);
  }

  get position() { return this.root.position; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  setPosition(x, z) {
    this.root.position.set(x, this.floorY, z);
  }

  setYaw(yaw, immediate = false, dt = 1 / 60) {
    this.yaw = immediate ? yaw : dampAngle(this.yaw, yaw, 12, dt);
    this.root.rotation.y = this.yaw;
  }

  moveTowards(target, speed, dt) {
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.025) {
      this.setPosition(target.x, target.z);
      return true;
    }
    const step = Math.min(distance, speed * dt);
    this.root.position.x += (dx / distance) * step;
    this.root.position.z += (dz / distance) * step;
    this.setYaw(Math.atan2(dx, dz), false, dt);
    return false;
  }

  beginStroke(power = this.lastPull) {
    this.mode = 'stroke';
    this.strokeT = 0;
    this.lastPull = THREE.MathUtils.clamp(power, 0, 1);
    this.strokeFinished = false;
  }

  beginAim() {
    this.mode = 'aim';
    this.strokeFinished = false;
  }

  isStrokeFinished() {
    return this.strokeFinished;
  }

  getCueTipWorldPosition(target = new THREE.Vector3()) {
    target.set(0, 0, CUE_TIP_Z);
    return this.cueGroup.localToWorld(target);
  }

  update({
    dt = 1 / 60,
    state = 'idle',
    moveSpeed = 0,
    pull = 0,
    ballPos = null,
    shotDirection = null,
    aimDepth = 0,
  }) {
    if (state === 'walk' || state === 'idle' || state === 'snap') {
      this.mode = state;
    } else if (this.mode === 'stroke') {
      this.strokeT += dt;
      if (this.strokeT >= this.strokeDuration) {
        this.mode = 'watch';
        this.strokeFinished = true;
      }
    } else if (state !== 'simulating') {
      this.mode = state;
    }

    if (this.mode === 'charge') {
      this.lastPull = pull;
    }

    const moving = state === 'walk' || state === 'snap';
    const desiredMoveBlend = moving ? THREE.MathUtils.clamp(moveSpeed / 1.25, 0, 1) : 0;
    this.moveBlend = THREE.MathUtils.damp(this.moveBlend, desiredMoveBlend, 11, dt);
    this.walkPhase += dt * (4.2 + moveSpeed * 3.2) * this.moveBlend;

    const aiming = ['aim', 'charge', 'stroke', 'watch', 'simulating'].includes(this.mode);
    const desiredAimBlend = aiming ? 1 : 0;
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend, desiredAimBlend, 14, dt);

    const s = Math.sin(this.walkPhase);
    const liftL = Math.max(0, s) * 0.08 * this.moveBlend * (1 - this.aimBlend);
    const liftR = Math.max(0, -s) * 0.08 * this.moveBlend * (1 - this.aimBlend);
    const stride = 0.17 * this.moveBlend * (1 - this.aimBlend);

    let strokeSlide = 0;
    let currentPitch = 0.22;

    if (this.mode === 'charge') {
      strokeSlide = -pull * 0.24;
      currentPitch = 0.22 + pull * 0.03;
    } else if (this.mode === 'stroke') {
      const u = Math.min(1, this.strokeT / this.strokeDuration);
      if (u < 0.15) {
        // Swing phase: quick forward strike
        const t = u / 0.15;
        const easeOutCubic = 1 - Math.pow(1 - t, 3);
        strokeSlide = THREE.MathUtils.lerp(-this.lastPull * 0.24, 0.18, easeOutCubic);
        currentPitch = 0.22;
      } else if (u < 0.60) {
        // Follow-through phase: hold the extension
        const t = (u - 0.15) / 0.45;
        strokeSlide = THREE.MathUtils.lerp(0.18, 0.20, t);
        currentPitch = 0.22;
      } else {
        // Return phase: transition to watch pose
        const t = (u - 0.60) / 0.40;
        const smoothT = Math.sin(t * Math.PI / 2);
        strokeSlide = THREE.MathUtils.lerp(0.20, 0.04, smoothT);
        currentPitch = THREE.MathUtils.lerp(0.22, 0.10, smoothT);
      }
    } else if (this.mode === 'watch' || this.mode === 'simulating') {
      strokeSlide = 0.04;
      currentPitch = 0.10;
    } else {
      strokeSlide = 0;
      currentPitch = 0.22;
    }

    // Reference clay body: continuous rounded mass, shoulders flow into arms
    const pitch = currentPitch * this.aimBlend;
    const by = -0.03 * this.aimBlend;
    const bz = 0.02 * this.aimBlend;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const hipY = by + 0.58 * cosP;
    const hipZ = bz + 0.58 * sinP;
    const chestY = by + 0.88 * cosP;
    const chestZ = bz + 0.88 * sinP;
    const shoulderY = by + 1.10 * cosP;
    const shoulderZ = bz + 1.10 * sinP;

    // Flat-front/back torso: side depth matches legs (BODY_DEPTH_HALF === LEG_RADIUS)
    // 侧面与背腹面保持完全平滑过渡 (`绝无阶梯毛边或外凸半球盖`)：
    // 盆腔垂直段 (`pelvisBase -> hipCenter`) 使用 skipStartCap: true 消除内部圆顶突刺，与双腿无缝对齐
    // 顶部自胸腔向上插向肩颈交接区 (`upperChest -> collarCenter -> torsoTop`)，侧面厚度 (`depthHalf`) 由 0.080
    // 连续平滑收至 0.065 (`恰好平滑过渡至肩臂与脖颈`)，并启用顶部圆润过渡闭合 (`skipEndCap: false`) 彻底消除侧面断层与缝隙
    const pelvisBase = new THREE.Vector3(0, hipY - 0.06, hipZ);
    const hipCenter = new THREE.Vector3(0, hipY, hipZ);
    const waistCenter = new THREE.Vector3(0, hipY + 0.14, hipZ + (chestZ - hipZ) * 0.28);
    const chestCenter = new THREE.Vector3(0, chestY, chestZ);
    const upperChest = new THREE.Vector3(0, by + 0.98 * cosP, bz + 0.98 * sinP);
    const collarCenter = new THREE.Vector3(0, shoulderY - 0.06, shoulderZ);
    const torsoTop = new THREE.Vector3(0, shoulderY - 0.03, shoulderZ);
    this._setTube(
      'torso',
      [pelvisBase, hipCenter, waistCenter, chestCenter, upperChest, collarCenter, torsoTop],
      [0.160, 0.160, 0.160, 0.160, 0.154, 0.146, 0.136],
      true,
      {
        skipStartCap: true,
        skipEndCap: true,
        depthHalf: [BODY_DEPTH_HALF, BODY_DEPTH_HALF, BODY_DEPTH_HALF, BODY_DEPTH_HALF, 0.076, 0.072, 0.068],
      },
    );

    if (this.limbs && this.limbs.waistJoint) {
      this.limbs.waistJoint.visible = false;
    }

    // Slender, naturally proportioned round clay neck — base inside upper chest/collarbone, top inside spherical head
    const neckBase = new THREE.Vector3(0, shoulderY - 0.06, shoulderZ);
    const neckTop = new THREE.Vector3(0, shoulderY + 0.08, shoulderZ + 0.005 * this.aimBlend);
    this._setTube(
      'neck',
      [neckBase, neckTop],
      [0.072, 0.064],
      false,
    );

    if (this.head) {
      // Snug, naturally proportioned head height above the horizontal shoulder bar
      this.head.position.set(0, shoulderY + 0.18, shoulderZ + 0.01 * this.aimBlend);
      this.head.rotation.x = -pitch * 0.65;
    }

    // 腿内侧稍微斜一点并做圆弧过渡 (`圆弧过渡`)，同时严格保持外侧边界笔直一刀切在 0.160 (`绝不向外凸`)
    // 顶部腰胯相接点 (hipY): 中心 0.080 + 半径 0.080 === 外边缘 0.160；内边缘 0.080 - 0.080 === 0.000（顶部相接无直角坑）
    // 下过斜点 (hipY - 0.06): 中心 0.083 + 半径 0.077 === 外边缘 0.160；内边缘 0.083 - 0.077 === 0.006（内侧斜下自然弧过渡）
    // 大腿主干下行 (hipY - 0.13及以下): 中心 0.086 + 半径 0.074 === 外边缘 0.160；内边缘 0.086 - 0.074 === 0.012（标准竖直分离）
    // 向上直插嵌入上半身，并使用 skipStartCap: true 关闭内部球面突缘，同时打球时的顶部跟进上半身的脊柱倾斜角度，彻底消除背侧毛边与尖刺
    const walkLeftPelvisTop = new THREE.Vector3(0.080, hipY + 0.04, hipZ);
    const walkRightPelvisTop = new THREE.Vector3(-0.080, hipY + 0.04, hipZ);
    const walkLeftHip = new THREE.Vector3(0.080, hipY, hipZ);
    const walkRightHip = new THREE.Vector3(-0.080, hipY, hipZ);
    const walkLeftCrotch = new THREE.Vector3(0.083, hipY - 0.06, hipZ);
    const walkRightCrotch = new THREE.Vector3(-0.083, hipY - 0.06, hipZ);
    const walkLeftAnkle = new THREE.Vector3(0.086, 0.035 + liftL, hipZ + s * stride);
    const walkRightAnkle = new THREE.Vector3(-0.086, 0.035 + liftR, hipZ - s * stride);
    // 走路时腿部关节保持笔直不弯曲（大腿主干到膝盖和脚踝保持在顺直线上）
    const walkLeftThighRoot = new THREE.Vector3(0.086, hipY - 0.13, hipZ);
    const walkRightThighRoot = new THREE.Vector3(-0.086, hipY - 0.13, hipZ);
    const walkLeftThigh = walkLeftThighRoot.clone().lerp(walkLeftAnkle, 0.15);
    const walkRightThigh = walkRightThighRoot.clone().lerp(walkRightAnkle, 0.15);
    const walkLeftKnee = walkLeftThighRoot.clone().lerp(walkLeftAnkle, 0.55);
    const walkRightKnee = walkRightThighRoot.clone().lerp(walkRightAnkle, 0.55);

    const aimLeftPelvisTop = new THREE.Vector3(0.080, hipY + 0.04, hipZ + (chestZ - hipZ) * 0.08);
    const aimRightPelvisTop = new THREE.Vector3(-0.080, hipY + 0.04, hipZ + (chestZ - hipZ) * 0.08);
    const aimLeftHip = new THREE.Vector3(0.080, hipY, hipZ);
    const aimRightHip = new THREE.Vector3(-0.080, hipY, hipZ);
    const aimLeftCrotch = new THREE.Vector3(0.083, hipY - 0.06, hipZ);
    const aimRightCrotch = new THREE.Vector3(-0.083, hipY - 0.06, hipZ);
    const aimLeftThigh = new THREE.Vector3(0.086, hipY - 0.13, hipZ);
    const aimRightThigh = new THREE.Vector3(-0.086, hipY - 0.13, hipZ);
    const aimLeftKnee = new THREE.Vector3(0.086, 0.33, hipZ + 0.08);
    const aimRightKnee = new THREE.Vector3(-0.086, 0.32, hipZ - 0.06);
    const aimLeftAnkle = new THREE.Vector3(0.086, 0.035, hipZ + 0.10);
    const aimRightAnkle = new THREE.Vector3(-0.086, 0.035, hipZ - 0.12);

    const leftPelvisTop = walkLeftPelvisTop.clone().lerp(aimLeftPelvisTop, this.aimBlend);
    const rightPelvisTop = walkRightPelvisTop.clone().lerp(aimRightPelvisTop, this.aimBlend);
    const leftHip = walkLeftHip.clone().lerp(aimLeftHip, this.aimBlend);
    const rightHip = walkRightHip.clone().lerp(aimRightHip, this.aimBlend);
    const leftCrotch = walkLeftCrotch.clone().lerp(aimLeftCrotch, this.aimBlend);
    const rightCrotch = walkRightCrotch.clone().lerp(aimRightCrotch, this.aimBlend);
    const leftThigh = walkLeftThigh.clone().lerp(aimLeftThigh, this.aimBlend);
    const rightThigh = walkRightThigh.clone().lerp(aimRightThigh, this.aimBlend);
    const leftKnee = walkLeftKnee.clone().lerp(aimLeftKnee, this.aimBlend);
    const rightKnee = walkRightKnee.clone().lerp(aimRightKnee, this.aimBlend);
    const leftAnkle = walkLeftAnkle.clone().lerp(aimLeftAnkle, this.aimBlend);
    const rightAnkle = walkRightAnkle.clone().lerp(aimRightAnkle, this.aimBlend);

    const legR = 0.074;
    const crotchR = 0.077;
    const hipR = 0.080;
    this._setTube(
      'leftLeg',
      [leftPelvisTop, leftHip, leftCrotch, leftThigh, leftKnee, leftAnkle],
      [hipR, hipR, crotchR, legR, legR, legR],
      false,
      { skipStartCap: true },
    );
    this._setTube(
      'rightLeg',
      [rightPelvisTop, rightHip, rightCrotch, rightThigh, rightKnee, rightAnkle],
      [hipR, hipR, crotchR, legR, legR, legR],
      false,
      { skipStartCap: true },
    );

    // 胯下圆弧过渡补充鞍面，双重确保无缝对接
    const crotchCenter = new THREE.Vector3(0, hipY + legR, hipZ);
    const crotchLeft = new THREE.Vector3(0.026, hipY - 0.01, hipZ);
    const crotchRight = new THREE.Vector3(-0.026, hipY - 0.01, hipZ);
    this._setTube(
      'crotchArch',
      [crotchRight, crotchCenter, crotchLeft],
      [legR, legR, legR],
      false,
      { skipStartCap: true, skipEndCap: true },
    );

    // Compact horizontal top with smoothly curved outer shoulder ends (`两边平滑弯曲`),
    // keeping the center level (`水平直`) while avoiding an overly broad/wide span.
    const shoulderJointY = shoulderY - 0.03;
    const centerCollar = new THREE.Vector3(0, shoulderJointY, shoulderZ);
    const leftArmRoot = new THREE.Vector3(0.04, shoulderJointY, shoulderZ);
    const rightArmRoot = new THREE.Vector3(-0.04, shoulderJointY, shoulderZ);
    // Outer collarbone stays level at shoulderJointY so top center remains flat horizontal
    const leftRise = new THREE.Vector3(0.105, shoulderJointY, shoulderZ);
    const rightRise = new THREE.Vector3(-0.105, shoulderJointY, shoulderZ);
    // Shoulder outer turn curves smoothly down and inward so it isn't overly wide
    const leftShoulder = new THREE.Vector3(0.156, shoulderJointY - 0.018, shoulderZ);
    const rightShoulder = new THREE.Vector3(-0.156, shoulderJointY - 0.018, shoulderZ);

    const ARM_R = 0.068;
    // Shoulder balls perfectly match ARM_R to round off the outer corner without bumps
    const shoulderZScale = BODY_DEPTH_HALF / ARM_R;
    if (this.leftShoulderBall) {
      this.leftShoulderBall.position.copy(leftShoulder);
      this.leftShoulderBall.scale.set(1.0, 1.0, Math.min(1, shoulderZScale));
    }
    if (this.rightShoulderBall) {
      this.rightShoulderBall.position.copy(rightShoulder);
      this.rightShoulderBall.scale.set(1.0, 1.0, Math.min(1, shoulderZScale));
    }

    // Hide the old bridge mesh if a previous session created it
    if (this.limbs.shoulders) this.limbs.shoulders.visible = false;

    // Idle: relaxed straight arms with hands spread comfortably outward (`手臂保持竖直笔直`)
    const walkSwing = s * this.moveBlend;
    const idleLeftWrist = new THREE.Vector3(0.285, 0.58, 0.02 - walkSwing * 0.10);
    const idleRightWrist = new THREE.Vector3(-0.285, 0.58, 0.02 + walkSwing * 0.10);
    // Elbow exactly on the straight line from shoulder to wrist so arm is straight (`笔直`)
    const idleLeftElbow = leftShoulder.clone().lerp(idleLeftWrist, 0.50);
    const idleRightElbow = rightShoulder.clone().lerp(idleRightWrist, 0.50);

    let leftElbow, rightElbow, leftWrist, rightWrist;

    this.cueGroup.visible = this.aimBlend > 0.01;
    if (this.aimBlend > 0.01) {
      let dirX = 0;
      let dirZ = 1;
      let bx = 0;
      let byAim = 0.8685;
      let bzAim = 1.0;

      if (ballPos) {
        this._tmp.copy(ballPos);
        this.root.worldToLocal(this._tmp);
        bx = this._tmp.x;
        byAim = this._tmp.y;
        bzAim = this._tmp.z;
        const flatDist = Math.hypot(bx, bzAim);
        if (flatDist > 1e-4) {
          dirX = bx / flatDist;
          dirZ = bzAim / flatDist;
        }
      }

      // Body is offset from the shot line — use player-local shot direction so the
      // cue stays parallel to the guide instead of turning toward body origin.
      if (shotDirection) {
        const localShot = new THREE.Vector3(shotDirection.x, 0, shotDirection.z)
          .applyAxisAngle(UP, -this.root.rotation.y);
        const localLength = Math.hypot(localShot.x, localShot.z);
        if (localLength > 1e-4) {
          dirX = localShot.x / localLength;
          dirZ = localShot.z / localLength;
        }
      }

      const aimDir = new THREE.Vector3(dirX, -0.01, dirZ).normalize();
      const cueSide = new THREE.Vector3(-dirZ, 0, dirX).normalize();
      const bridgeDist = 0.26;
      const cueOrigin = new THREE.Vector3(bx, byAim, bzAim)
        .addScaledVector(aimDir, -(CUE_TIP_Z + BALL_R + CUE_READY_GAP) + strokeSlide);
      const gripZ = shoulderZ + 0.05;
      const naturalRightWrist = new THREE.Vector3(dirX * gripZ, 0.88, dirZ * gripZ)
        .addScaledVector(cueSide, CUE_BODY_OFFSET);
      const gripAlongCue = THREE.MathUtils.clamp(
        naturalRightWrist.clone().sub(cueOrigin).dot(aimDir),
        CUE_BUTT_Z + 0.10,
        CUE_TIP_Z - bridgeDist - 0.08,
      );
      const rightWristAim = cueOrigin.clone().addScaledVector(aimDir, gripAlongCue);
      const leftWristAim = rightWristAim.clone().addScaledVector(aimDir, bridgeDist);
      leftWristAim.y -= 0.025;

      this.cueGroup.position.copy(cueOrigin);
      this.cueGroup.scale.set(1, 1, 1);
      this.cueGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aimDir);

      const leftElbowAim = leftShoulder.clone().add(leftWristAim).multiplyScalar(0.5);
      leftElbowAim.addScaledVector(cueSide, -0.08);
      leftElbowAim.y -= 0.06;

      const rightElbowAim = rightShoulder.clone().add(rightWristAim).multiplyScalar(0.5);
      rightElbowAim.addScaledVector(cueSide, 0.08);
      rightElbowAim.y -= 0.08;

      leftWrist = idleLeftWrist.clone().lerp(leftWristAim, this.aimBlend);
      leftElbow = idleLeftElbow.clone().lerp(leftElbowAim, this.aimBlend);
      rightWrist = idleRightWrist.clone().lerp(rightWristAim, this.aimBlend);
      rightElbow = idleRightElbow.clone().lerp(rightElbowAim, this.aimBlend);
    } else {
      leftElbow = idleLeftElbow;
      leftWrist = idleLeftWrist;
      rightElbow = idleRightElbow;
      rightWrist = idleRightWrist;
    }

    // Place upperArm point close to shoulder (12%) so the shoulder turn happens inside the shoulder ball and the arm below is perfectly straight
    const leftUpperArm = leftShoulder.clone().lerp(leftElbow, 0.12);
    const rightUpperArm = rightShoulder.clone().lerp(rightElbow, 0.12);

    // Continuous clay arms & collarbone bridge: level across center (`[centerCollar, leftArmRoot, leftRise]`)
    // and curving smoothly over the shoulder corners (`[leftRise, leftShoulder, leftUpperArm]`) without open cuts or gaps.
    this._setTube(
      'leftArm',
      [centerCollar, leftArmRoot, leftRise, leftShoulder, leftUpperArm, leftElbow, leftWrist],
      [ARM_R, ARM_R, ARM_R, ARM_R, ARM_R, ARM_R, ARM_R],
      false,
      { skipStartCap: true },
    );
    this._setTube(
      'rightArm',
      [centerCollar, rightArmRoot, rightRise, rightShoulder, rightUpperArm, rightElbow, rightWrist],
      [ARM_R, ARM_R, ARM_R, ARM_R, ARM_R, ARM_R, ARM_R],
      false,
      { skipStartCap: true },
    );
  }

  _setTube(key, points, radii, flatZ = false, opts = {}) {
    const geometry = buildSoftTube(points, radii, flatZ, opts);
    let mesh = this.limbs[key];
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, this.skin);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.limbGroup.add(mesh);
      this.limbs[key] = mesh;
    } else {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
  }

  dispose() {
    for (const mesh of Object.values(this.limbs)) mesh?.geometry.dispose();
    this.head?.geometry.dispose();
    // Shoulder balls share one SphereGeometry
    this.leftShoulderBall?.geometry.dispose();
    this.skin.dispose();
    this.scene.remove(this.root);
  }
}

/**
 * Soft clay limb/torso tube.
 * Uses parallel-transport frames (not raw Frenet) so near-vertical hanging arms
 * don't twist into wing-like sheets. Body-space X is kept as the side axis.
 *
 * opts.skipStartCap / opts.skipEndCap: bury ends inside another body part for seamless blend
 */
function buildSoftTube(points, radii, flatZ = false, opts = {}) {
  const { skipStartCap = false, skipEndCap = false, depthHalf = null } = opts;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = 28;
  const radial = 32;
  const capSegments = 6;
  const frames = buildStableFrames(curve, segments);
  const positions = [];
  const normals = [];
  const indices = [];
  const rings = [];

  const start = curve.getPointAt(0);
  const startTangent = curve.getTangentAt(0).normalize();
  // Soft hemispherical caps — skip when the end is buried in another clay mass
  // flatZ parts also get rounded end caps along the spine (scaled by depth)
  if (!skipStartCap) {
    for (let c = 0; c < capSegments; c++) {
      const theta = -Math.PI / 2 + (c / capSegments) * (Math.PI / 2);
      rings.push({
        point: start.clone().addScaledVector(startTangent, Math.sin(theta) * radii[0]),
        radius: Math.cos(theta) * radii[0],
        frame: 0,
        tangentNormal: Math.sin(theta),
        radialNormal: Math.cos(theta),
      });
    }
  }

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const point = curve.getPointAt(u);
    const rf = u * (radii.length - 1);
    const ri = Math.floor(rf);
    const radius = THREE.MathUtils.lerp(radii[ri], radii[Math.min(ri + 1, radii.length - 1)], rf - ri);
    rings.push({ point, radius, frame: i, tangentNormal: 0, radialNormal: 1 });
  }

  if (!skipEndCap) {
    const end = curve.getPointAt(1);
    const endTangent = curve.getTangentAt(1).normalize();
    for (let c = 1; c <= capSegments; c++) {
      const theta = (c / capSegments) * (Math.PI / 2);
      rings.push({
        point: end.clone().addScaledVector(endTangent, Math.sin(theta) * radii.at(-1)),
        radius: Math.cos(theta) * radii.at(-1),
        frame: segments,
        tangentNormal: Math.sin(theta),
        radialNormal: Math.cos(theta),
      });
    }
  }

  for (const ring of rings) {
    const tangent = frames.tangents[ring.frame];
    const dirX = frames.sides[ring.frame];
    const dirZ = frames.forwards[ring.frame];

    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      let locX, locZ;
      let normX, normZ;

      if (flatZ) {
        // Stadium cross-section: full width W, fixed or smoothly interpolated front/back half-depth D
        // so side profile smoothly transitions (`平滑过渡`) along the tube length
        const W = ring.radius;
        let baseD;
        if (Array.isArray(depthHalf)) {
          const df = (ring.frame / segments) * (depthHalf.length - 1);
          const di = Math.floor(df);
          baseD = THREE.MathUtils.lerp(depthHalf[di], depthHalf[Math.min(di + 1, depthHalf.length - 1)], df - di);
        } else {
          baseD = depthHalf ?? Math.min(W * 0.55, 0.088);
        }
        const D = baseD * ring.radialNormal;
        const flatW = Math.max(0, W - Math.min(D, W * 0.95));

        if (flatW > 0.004 && D > 0.004) {
          const arcLen = Math.PI * D / 2;
          const quadLen = arcLen + flatW;
          let a = angle % (Math.PI * 2);
          if (a < 0) a += Math.PI * 2;
          const t = (a / (Math.PI * 2)) * (4 * quadLen);
          const q = Math.floor(t / quadLen) % 4;
          const rem = t - Math.floor(t / quadLen) * quadLen;

          if (q === 0) {
            if (rem <= arcLen) {
              const phi = (rem / arcLen) * (Math.PI / 2);
              locX = flatW + D * Math.cos(phi);
              locZ = D * Math.sin(phi);
              normX = Math.cos(phi);
              normZ = Math.sin(phi);
            } else {
              locX = flatW - (rem - arcLen);
              locZ = D;
              normX = 0; normZ = 1;
            }
          } else if (q === 1) {
            if (rem <= flatW) {
              locX = -rem;
              locZ = D;
              normX = 0; normZ = 1;
            } else {
              const phi = (Math.PI / 2) + ((rem - flatW) / arcLen) * (Math.PI / 2);
              locX = -flatW + D * Math.cos(phi);
              locZ = D * Math.sin(phi);
              normX = Math.cos(phi);
              normZ = Math.sin(phi);
            }
          } else if (q === 2) {
            if (rem <= arcLen) {
              const phi = Math.PI + (rem / arcLen) * (Math.PI / 2);
              locX = -flatW + D * Math.cos(phi);
              locZ = D * Math.sin(phi);
              normX = Math.cos(phi);
              normZ = Math.sin(phi);
            } else {
              locX = -flatW + (rem - arcLen);
              locZ = -D;
              normX = 0; normZ = -1;
            }
          } else {
            if (rem <= flatW) {
              locX = rem;
              locZ = -D;
              normX = 0; normZ = -1;
            } else {
              const phi = (Math.PI * 1.5) + ((rem - flatW) / arcLen) * (Math.PI / 2);
              locX = flatW + D * Math.cos(phi);
              locZ = D * Math.sin(phi);
              normX = Math.cos(phi);
              normZ = Math.sin(phi);
            }
          }
        } else {
          locX = W * Math.cos(angle);
          locZ = D * Math.sin(angle);
          normX = D * Math.cos(angle);
          normZ = W * Math.sin(angle);
          const len = Math.hypot(normX, normZ) || 1;
          normX /= len;
          normZ /= len;
        }
      } else {
        locX = ring.radius * Math.cos(angle);
        locZ = ring.radius * Math.sin(angle);
        normX = Math.cos(angle);
        normZ = Math.sin(angle);
      }

      const offset = dirX.clone().multiplyScalar(locX).add(dirZ.clone().multiplyScalar(locZ));
      let normal;
      if (flatZ && Math.abs(normZ) > 0.99) {
        normal = dirZ.clone().multiplyScalar(Math.sign(normZ));
      } else {
        normal = dirX.clone().multiplyScalar(normX).add(dirZ.clone().multiplyScalar(normZ))
          .multiplyScalar(ring.radialNormal).addScaledVector(tangent, ring.tangentNormal).normalize();
      }

      positions.push(
        ring.point.x + offset.x,
        ring.point.y + offset.y,
        ring.point.z + offset.z,
      );
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + (j + 1) % radial;
      const d = (i + 1) * radial + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Parallel-transport frames with body-space side preference.
 * Avoids Frenet twist on near-vertical hanging limbs (the old "wing" artifact).
 */
function buildStableFrames(curve, segments) {
  const tangents = [];
  const sides = [];
  const forwards = [];

  for (let i = 0; i <= segments; i++) {
    tangents.push(curve.getTangentAt(i / segments).normalize());
  }

  // Prefer world +X as the limb "side" so left/right stays consistent along the body.
  // Fall back to +Z when the path runs nearly along X (rare for this avatar).
  const preferSide = new THREE.Vector3(1, 0, 0);
  const fallbackSide = new THREE.Vector3(0, 0, 1);

  let side0 = preferSide.clone().sub(tangents[0].clone().multiplyScalar(preferSide.dot(tangents[0])));
  if (side0.lengthSq() < 1e-8) {
    side0 = fallbackSide.clone().sub(tangents[0].clone().multiplyScalar(fallbackSide.dot(tangents[0])));
  }
  side0.normalize();
  if (side0.x < 0) side0.negate();
  sides.push(side0);
  forwards.push(new THREE.Vector3().crossVectors(tangents[0], side0).normalize());

  for (let i = 1; i <= segments; i++) {
    const prevT = tangents[i - 1];
    const T = tangents[i];
    const axis = new THREE.Vector3().crossVectors(prevT, T);
    const axisLen = axis.length();
    let side;
    if (axisLen < 1e-6) {
      side = sides[i - 1].clone();
    } else {
      axis.divideScalar(axisLen);
      const angle = Math.acos(THREE.MathUtils.clamp(prevT.dot(T), -1, 1));
      side = sides[i - 1].clone().applyAxisAngle(axis, angle);
    }
    // Keep orthonormal and gently bias toward +X so frames never flip mid-tube
    side.sub(T.clone().multiplyScalar(side.dot(T)));
    if (side.lengthSq() < 1e-8) {
      side = preferSide.clone().sub(T.clone().multiplyScalar(preferSide.dot(T)));
      if (side.lengthSq() < 1e-8) {
        side = fallbackSide.clone().sub(T.clone().multiplyScalar(fallbackSide.dot(T)));
      }
    }
    side.normalize();
    if (side.x < -0.2) side.negate();
    const forward = new THREE.Vector3().crossVectors(T, side).normalize();
    // Re-orthogonalize side from forward × T for numerical stability
    side.copy(new THREE.Vector3().crossVectors(forward, T).normalize());
    sides.push(side);
    forwards.push(forward);
  }

  return { tangents, sides, forwards };
}

function dampAngle(current, target, lambda, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}
