import * as THREE from 'three';

const SAMPLE = Object.freeze({ L: 4.4, W: 1.7, H: 0.5 });
const PARTICLE_COUNT = 240;
const ELECTRON_COLOR = 0x5cb89a;
const HOLE_COLOR = 0xc49878;
/** Drift speed scale used by the teaching particle model (world units / s per I). */
const DRIFT_SPEED = 1.55;

/**
 * Kinematic signs for the Hall teaching demo.
 * Lorentz F_y on a pure-drift carrier: q (v × B)_y = q (−v_x B_z) = −q v0 Bz.
 * n-type and p-type pile on the **same** geometric face for given I, B
 * (both q and v reverse); only V_H polarity differs.
 */
export function hallCarrierKinematics({
  I = 1,
  B = 1,
  nType = true,
} = {}) {
  const carrierSign = nType === false ? 1 : -1;
  const flowDirection = nType === false ? 1 : -1;
  const i = Math.max(0, Number(I) || 0);
  const bz = Number(B) || 0;
  const v0 = DRIFT_SPEED * i * flowDirection;
  // F_y ∝ q (−v0 Bz) with teaching q = carrierSign
  const forceY = -carrierSign * v0 * bz;
  return {
    carrierSign,
    flowDirection,
    v0,
    forceY,
    pileSide: Math.abs(forceY) < 1e-9 ? 0 : Math.sign(forceY),
  };
}

function makeTextSprite(text, color, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 48px Inter, "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 36;
  ctx.fillStyle = 'rgba(17, 19, 23, 0.76)';
  ctx.beginPath();
  ctx.roundRect(256 - width / 2, 36, width, 56, 10);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 0.96,
  }));
  sprite.scale.set(1.7 * scale, 0.42 * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function createCarrierTexture({ crisp = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (crisp) {
    // Tabletop viewing can get very close to the sample. Keep a compact solid
    // core and clip the wide soft halo that made overlapping carriers blurry.
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.24, 'rgba(255,255,255,1)');
    glow.addColorStop(0.38, 'rgba(210,255,244,0.9)');
    glow.addColorStop(0.52, 'rgba(150,235,214,0.28)');
    glow.addColorStop(0.64, 'rgba(120,210,190,0)');
    glow.addColorStop(1, 'rgba(120,210,190,0)');
  } else {
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.18, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.42, 'rgba(180,230,255,0.55)');
    glow.addColorStop(0.75, 'rgba(120,190,255,0.15)');
    glow.addColorStop(1, 'rgba(120,190,255,0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Programmatic apparatus ported from the standalone Hall-effect animation. */
export function createHallDemoEquipment({ tabletop = false } = {}) {
  const root = new THREE.Group();
  root.name = 'hall-effect-carrier-demo';
  root.visible = false;
  root.scale.setScalar(tabletop ? 0.28 : 1);
  root.position.set(0, tabletop ? 0.34 : 0, tabletop ? 0.02 : 0);

  const body = new THREE.Group();
  root.add(body);
  const shellGeometry = new THREE.BoxGeometry(SAMPLE.L, SAMPLE.W, SAMPLE.H);
  const shell = new THREE.Mesh(shellGeometry, new THREE.MeshPhysicalMaterial({
    color: 0x3d4654,
    metalness: 0.15,
    roughness: 0.28,
    transparent: true,
    opacity: tabletop ? 0.42 : 0.32,
    emissive: 0x243040,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  shell.renderOrder = 1;
  body.add(shell);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(shellGeometry),
    new THREE.LineBasicMaterial({
      color: 0x9aa3b0,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
    }),
  );
  edges.renderOrder = 7;
  body.add(edges);
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(SAMPLE.L * 0.94, SAMPLE.W * 0.86, SAMPLE.H * 0.4),
    new THREE.MeshBasicMaterial({
      color: 0x2a3544,
      transparent: true,
      opacity: tabletop ? 0.68 : 0.28,
      depthWrite: false,
    }),
  );
  core.renderOrder = 1;
  body.add(core);

  const padMaterial = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.75, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.18, SAMPLE.W * 0.58, SAMPLE.H * 0.85), padMaterial);
    pad.position.x = side * (SAMPLE.L / 2 + 0.05);
    body.add(pad);
  }

  // Striking Hall face charge accumulation glow planes (+Y and -Y)
  const glowPlaneGeo = new THREE.PlaneGeometry(SAMPLE.L * 0.98, SAMPLE.H * 0.95);
  const glowMatPos = new THREE.MeshBasicMaterial({
    color: ELECTRON_COLOR,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMatNeg = glowMatPos.clone();

  const faceGlowPos = new THREE.Mesh(glowPlaneGeo, glowMatPos);
  faceGlowPos.rotation.x = Math.PI / 2;
  faceGlowPos.position.y = SAMPLE.W / 2 + 0.01;
  faceGlowPos.renderOrder = 5;

  const faceGlowNeg = new THREE.Mesh(glowPlaneGeo, glowMatNeg);
  faceGlowNeg.rotation.x = Math.PI / 2;
  faceGlowNeg.position.y = -SAMPLE.W / 2 - 0.01;
  faceGlowNeg.renderOrder = 5;

  body.add(faceGlowPos, faceGlowNeg);

  // 磁场 3D 矢量箭头组（位于实验器材正前方，开启 DoubleSide 与无色调映射，确保正面看色泽鲜艳不发黑）
  const bFieldGroup = new THREE.Group();
  bFieldGroup.visible = false;
  root.add(bFieldGroup);

  const bArrows = [];
  const MAX_B_ARROWS = 15;
  const zFront = 1.15; // 位于实验器材正前方（面向视角方向），保持安全距离
  for (let i = 0; i < MAX_B_ARROWS; i += 1) {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, zFront),
      1.5,
      0x38bdf8,
      0.30,
      0.18,
    );
    arrow.line.material.transparent = true;
    arrow.cone.material.transparent = true;
    arrow.line.material.side = THREE.DoubleSide;
    arrow.cone.material.side = THREE.DoubleSide;
    arrow.line.material.toneMapped = false;
    arrow.cone.material.toneMapped = false;
    arrow.renderOrder = 6;
    arrow.line.renderOrder = 6;
    arrow.cone.renderOrder = 7;
    bFieldGroup.add(arrow);
    bArrows.push(arrow);
  }

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const baseCoords = new Float32Array(PARTICLE_COUNT * 2);
  const massVariance = new Float32Array(PARTICLE_COUNT);
  const phases = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * SAMPLE.L * 0.92;
    const y = (Math.random() - 0.5) * SAMPLE.W * 0.76;
    const z = (Math.random() - 0.5) * SAMPLE.H * 0.88;
    baseCoords[i * 2] = y;
    baseCoords[i * 2 + 1] = z;
    positions.set([x, y, z], i * 3);
    velocities.set([0, 0, 0], i * 3);
    massVariance[i] = 0.86 + Math.random() * 0.28;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 15);
  const particleMaterial = new THREE.PointsMaterial({
    size: tabletop ? 0.04 : 0.12,
    map: createCarrierTexture({ crisp: tabletop }),
    color: ELECTRON_COLOR,
    transparent: true,
    opacity: tabletop ? 0.7 : 0.95,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
    blending: tabletop ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: !tabletop,
    alphaTest: tabletop ? 0.12 : 0,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  particles.renderOrder = 4;
  root.add(particles);

  let smoothTilt = 0;
  let smoothGlowPos = 0;
  let smoothGlowNeg = 0;

  const carrierColor = new THREE.Color(ELECTRON_COLOR);
  let lastCarrierType = null;
  let lastThickness = null;
  function syncStaticVisuals(state) {
    if (lastThickness !== state.d) {
      lastThickness = state.d;
      body.scale.z = state.d / SAMPLE.H;
    }
    if (lastCarrierType !== state.nType) {
      lastCarrierType = state.nType;
      carrierColor.setHex(state.nType ? ELECTRON_COLOR : HOLE_COLOR);
      particleMaterial.color.copy(carrierColor);
      glowMatPos.color.copy(carrierColor);
      glowMatNeg.color.copy(carrierColor);
    }
  }

  /**
   * Teaching model of steady Hall drift inside a thin bar sample.
   *
   * Coordinates (sample local):
   *   +X length  — conventional +I; electrons drift −X, holes +X
   *   +Y width   — Hall / transverse face (accumulation)
   *   +Z thickness — applied field B = (0, 0, Bz)
   *
   * Forces per carrier (charge sign q = ±1):
   *   1) Scattering drag → drift velocity v_d = (v0, 0, 0)
   *   2) Lorentz (q/m) v × B with B along Z  → transverse deflection
   *   3) Hall electric field E_y from space charge (mean y) that builds until
   *      q E_y cancels the magnetic force so bulk flow continues in X
   *   4) Soft walls (spring + partial bounce) — no sticky “absorb vy=0” edges
   *
   * Previous bug: artificial yEq spring + absorbing walls glued every particle
   * to one edge so the demo looked like a 1-D ant trail, not Hall equilibrium.
   */
  function updateParticles(state, dt) {
    const I = Math.max(0, Number(state.I || 0));
    const Bz = Number(state.B || 0);
    const n = Math.max(0.3, Number(state.n || 1));
    const nType = state.nType !== false;
    // q < 0 for electrons, q > 0 for holes.
    const carrierSign = nType ? -1 : 1;
    // Drift along ±X (electrons opposite conventional current).
    const flowDirection = nType ? -1 : 1;

    particleMaterial.opacity = tabletop
      ? 0.72 + 0.2 * Math.min(I, 1.2)
      : 0.7 + 0.3 * Math.min(I, 1.2);
    particleMaterial.size = tabletop
      ? 0.048 + 0.018 * Math.min(I, 1.2)
      : 0.16 + 0.08 * Math.min(I, 1.2);

    const halfW = SAMPLE.W / 2 - 0.08;
    const halfH = Math.max(0.02, Number(state.d || 0.5) / 2 - 0.04);
    const halfL = SAMPLE.L / 2;

    // Drift speed scales with current; scattering time sets mobility.
    const tau = 0.18;
    const v0 = DRIFT_SPEED * I * flowDirection;
    // |q|/m scale — large enough that Lorentz is visible, small enough to stay stable.
    const qOverM = carrierSign * 3.6;
    // Thermal noise falls as concentration rises (mean free path picture).
    const thermalStep = Math.sqrt(2 * (0.006 / n) * dt);

    // Uncapped linear scaling: B=1 gives tilt 0.38, B=2 gives tilt 0.76 (2x clear visual distinction!)
    const FmagY = -carrierSign * v0 * Bz;
    const targetTilt = Math.sign(FmagY || 0) * (0.38 * Math.abs(Bz) * Math.min(1.5, I));
    const lerpAlpha = Math.min(1.0, 12.0 * Math.max(0.001, dt));
    smoothTilt += (targetTilt - smoothTilt) * lerpAlpha;
    const tiltScale = smoothTilt;

    // Weak z confinement to keep carriers inside the sample film.
    const zSpring = 2.2 * (0.5 / Math.max(0.15, Number(state.d || 0.5)));
    const wallK = 32;
    const wallDamp = 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const pi = i * 3;
      let x = positions[pi];
      let y = positions[pi + 1];
      let z = positions[pi + 2];
      let vx = velocities[pi];
      let vy = velocities[pi + 1];
      let vz = velocities[pi + 2];



      const mass = massVariance[i];
      const yBase = baseCoords[i * 2];
      const zBase = baseCoords[i * 2 + 1];

      // Normalized progress along drift direction (0 at entry, 1 at exit).
      const progress = flowDirection < 0
        ? Math.max(0, Math.min(1, (halfL - x) / SAMPLE.L))
        : Math.max(0, Math.min(1, (x + halfL) / SAMPLE.L));

      // Streamline curves at entry and exit ends (0..0.3 and 0.7..1), flat in middle (0.3..0.7)
      const ramp = 0.3;
      let sCurve = 1.0;
      if (progress < ramp) {
        const u = progress / ramp;
        sCurve = u * u * (3 - 2 * u);
      } else if (progress > 1 - ramp) {
        const u = (1 - progress) / ramp;
        sCurve = u * u * (3 - 2 * u);
      }
      const yDeflected = yBase * (1 - 0.4 * sCurve) + tiltScale * sCurve * 1.5;
      const yTarget = Math.max(-halfW * 0.95, Math.min(halfW * 0.95, yDeflected));
      const filmScale = Number(state.d || 0.5) / 0.5;
      const zTarget = Math.max(-halfH * 0.88, Math.min(halfH * 0.88, zBase * filmScale));

      const vCrossBx = vy * Bz;

      let ax = (v0 - vx) / (tau * mass) + qOverM * vCrossBx;
      let ay = (0 - vy) / (tau * mass) + (yTarget - y) * (20.0 / mass);
      let az = (0 - vz) / (tau * mass) + (zTarget - z) * (20.0 / mass);

      // Soft Hall-face walls: restoring force near borders.
      if (y > halfW * 0.88) ay -= (y - halfW * 0.88) * wallK / mass;
      else if (y < -halfW * 0.88) ay -= (y + halfW * 0.88) * wallK / mass;
      if (z > halfH * 0.85) az -= (z - halfH * 0.85) * wallK / mass;
      else if (z < -halfH * 0.85) az -= (z + halfH * 0.85) * wallK / mass;

      phases[i] += dt * 8;
      const jitter = thermalStep / Math.sqrt(mass);
      vx += ax * dt + (Math.sin(phases[i] * 1.3 + i) * 0.35 + Math.random() - 0.5) * jitter;
      vy += ay * dt + (Math.cos(phases[i] * 1.7 + i) * 0.15 + Math.random() - 0.5) * jitter * 0.4;
      vz += az * dt + (Math.sin(phases[i] * 2.1 + i) * 0.15 + Math.random() - 0.5) * jitter * 0.4;

      // Mild speed clamp keeps rare large steps from tunneling the walls.
      const speed2 = vx * vx + vy * vy + vz * vz;
      const maxSpeed = 4.5 + 2.5 * Math.abs(v0);
      if (speed2 > maxSpeed * maxSpeed) {
        const s = maxSpeed / Math.sqrt(speed2);
        vx *= s; vy *= s; vz *= s;
      }

      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      // Hard clamp only after soft forces — partial bounce.
      if (y > halfW) {
        y = halfW;
        if (vy > 0) vy = -vy * wallDamp;
      } else if (y < -halfW) {
        y = -halfW;
        if (vy < 0) vy = -vy * wallDamp;
      }
      if (z > halfH) {
        z = halfH;
        if (vz > 0) vz = -vz * wallDamp;
      } else if (z < -halfH) {
        z = -halfH;
        if (vz < 0) vz = -vz * wallDamp;
      }

      // Periodic along current axis: carriers re-enter on opposite side
      // on their entry streamline (progress=0), preserving continuous parabolic orbits indefinitely.
      let wrapped = false;
      if (x < -halfL - 0.08) {
        x = halfL + 0.08;
        wrapped = true;
      } else if (x > halfL + 0.08) {
        x = -halfL - 0.08;
        wrapped = true;
      }
      if (wrapped) {
        y = Math.max(-halfW * 0.92, Math.min(halfW * 0.92, yBase));
        z = Math.max(-halfH * 0.88, Math.min(halfH * 0.88, zBase * filmScale));
        vx = v0 * (0.85 + Math.random() * 0.3);
        vy = (Math.random() - 0.5) * 0.02;
        vz = (Math.random() - 0.5) * 0.02;
      }

      positions[pi] = x;
      positions[pi + 1] = y;
      positions[pi + 2] = z;
      velocities[pi] = vx;
      velocities[pi + 1] = vy;
      velocities[pi + 2] = vz;

    }

    particleGeometry.attributes.position.needsUpdate = true;
  }

  /**
   * Apply host-owned particle snapshot (stride-6: px,py,pz,vx,vy,vz).
   * Used when ExperimentSimBackend owns carrier integrate.
   * @param {Float32Array|ArrayLike<number>} packed
   * @param {number} [stride=6]
   */
  root.userData.applyHostParticles = (packed, stride = 6) => {
    if (!packed?.length) return;
    const s = stride | 0 || 6;
    const count = Math.min(PARTICLE_COUNT, Math.floor(packed.length / s));
    for (let i = 0; i < count; i += 1) {
      const o = i * s;
      const pi = i * 3;
      positions[pi] = packed[o];
      positions[pi + 1] = packed[o + 1];
      positions[pi + 2] = packed[o + 2];
      velocities[pi] = packed[o + 3];
      velocities[pi + 1] = packed[o + 4];
      velocities[pi + 2] = packed[o + 5];
    }
    particleGeometry.attributes.position.needsUpdate = true;
  };

  root.userData.setHostParticlesOwned = (owned) => {
    root.userData._hostParticlesOwned = !!owned;
  };

  function extrapolateParticles(state, dt) {
    const halfW = SAMPLE.W / 2 - 0.08;
    const halfH = Math.max(0.02, Number(state.d || 0.5) / 2 - 0.04);
    const halfL = SAMPLE.L / 2;
    const wallDamp = 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const pi = i * 3;
      let x = positions[pi] + velocities[pi] * dt;
      let y = positions[pi + 1] + velocities[pi + 1] * dt;
      let z = positions[pi + 2] + velocities[pi + 2] * dt;
      let vx = velocities[pi];
      let vy = velocities[pi + 1];
      let vz = velocities[pi + 2];

      if (y > halfW) {
        y = halfW;
        if (vy > 0) vy = -vy * wallDamp;
      } else if (y < -halfW) {
        y = -halfW;
        if (vy < 0) vy = -vy * wallDamp;
      }
      if (z > halfH) {
        z = halfH;
        if (vz > 0) vz = -vz * wallDamp;
      } else if (z < -halfH) {
        z = -halfH;
        if (vz < 0) vz = -vz * wallDamp;
      }

      if (x < -halfL - 0.08) {
        x = halfL + 0.08;
      } else if (x > halfL + 0.08) {
        x = -halfL - 0.08;
      }

      positions[pi] = x;
      positions[pi + 1] = y;
      positions[pi + 2] = z;
      velocities[pi] = vx;
      velocities[pi + 1] = vy;
      velocities[pi + 2] = vz;
    }
    particleGeometry.attributes.position.needsUpdate = true;
  }

  root.userData.update = (state, dt) => {
    if (!state) return;
    syncStaticVisuals(state);
    const voltage = (state.I * state.B * (state.nType ? -1 : 1)) / (state.n * Math.max(0.05, state.d / 0.5));
    shell.material.emissiveIntensity = 0.18 + Math.min(Math.abs(voltage), 2) * 0.11;
    core.material.opacity = (tabletop ? 0.62 : 0.2) + Math.min(Math.abs(voltage), 2) * 0.06;

    // Striking Hall face charge accumulation glow feedback with smooth Lerp
    const carrierSign = state.nType !== false ? -1 : 1;
    const flowDirection = state.nType !== false ? -1 : 1;
    const v0 = DRIFT_SPEED * Math.max(0, Number(state.I || 0)) * flowDirection;
    const FmagY = -carrierSign * v0 * Number(state.B || 0);
    const pileSide = Math.abs(state.B || 0) < 0.02 || Math.abs(state.I || 0) < 0.02 ? 0 : Math.sign(FmagY || -1);
    const absV = Math.min(1, Math.abs(voltage) / 2.0);
    const activeGlow = absV > 0.01 ? 0.18 + 0.62 * absV : 0;

    const targetGlowPos = pileSide > 0 ? activeGlow : 0;
    const targetGlowNeg = pileSide < 0 ? activeGlow : 0;
    const glowAlpha = Math.min(1.0, 10.0 * Math.max(0.001, dt));

    smoothGlowPos += (targetGlowPos - smoothGlowPos) * glowAlpha;
    smoothGlowNeg += (targetGlowNeg - smoothGlowNeg) * glowAlpha;

    const showB = Math.abs(state.B || 0) > 0.01;
    bFieldGroup.visible = showB;
    if (showB) {
      const bVal = Number(state.B || 0);
      const absB = Math.abs(bVal);
      const bSign = bVal >= 0 ? 1 : -1;
      const bColorHex = bVal >= 0 ? 0x38bdf8 : 0xff6b00;
      const bColor = new THREE.Color(bColorHex);
      const bStrength = Math.min(1, absB / 2.0);
      const bOpacity = 0.65 + 0.35 * bStrength;
      const bDir = new THREE.Vector3(0, 0, bSign);
      const zCenter = 1.15;
      const zStart = zCenter - bSign * 0.75;

      // 磁场强度改变时，动态调整箭头的数量与疏密（从 3 根到 13 根）
      const count = Math.max(3, Math.min(bArrows.length, Math.round(THREE.MathUtils.lerp(3, 13, bStrength))));
      for (let i = 0; i < bArrows.length; i += 1) {
        const arrow = bArrows[i];
        if (i < count) {
          arrow.visible = true;
          const x = count > 1 ? (i / (count - 1) - 0.5) * SAMPLE.L * 0.84 : 0;
          arrow.setDirection(bDir);
          arrow.position.set(x, 0, zStart);
          arrow.setColor(bColorHex);
          if (arrow.line?.material) {
            arrow.line.material.color.copy(bColor);
            arrow.line.material.opacity = bOpacity;
            arrow.line.material.side = THREE.DoubleSide;
            arrow.line.material.toneMapped = false;
          }
          if (arrow.cone?.material) {
            arrow.cone.material.color.copy(bColor);
            arrow.cone.material.opacity = Math.min(1, bOpacity + 0.15);
            arrow.cone.material.side = THREE.DoubleSide;
            arrow.cone.material.toneMapped = false;
          }
        } else {
          arrow.visible = false;
        }
      }
    }
    if (tabletop && state.autoCam && dt > 0) root.rotation.y += dt * 0.18;
    // Host SimBackend may own carrier integrate — if so, run smooth extrapolation when dt > 0.
    if (!root.userData._hostParticlesOwned && !state.paused && dt > 0) {
      updateParticles(state, Math.min(dt, 0.05));
    } else if (root.userData._hostParticlesOwned && !state.paused && dt > 0) {
      extrapolateParticles(state, Math.min(dt, 0.05));
    }
  };

  /** Snapshot for tests / debug: bulk flow must continue; edge must not own everyone. */
  root.userData.getCarrierStats = () => {
    const halfW = SAMPLE.W / 2 - 0.08;
    let meanY = 0;
    let meanVx = 0;
    let edgeCount = 0;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const y = positions[i * 3 + 1];
      const vx = velocities[i * 3];
      meanY += y;
      meanVx += vx;
      if (Math.abs(y) > halfW * 0.88) edgeCount += 1;
    }
    return {
      count: PARTICLE_COUNT,
      meanY: meanY / PARTICLE_COUNT,
      meanVx: meanVx / PARTICLE_COUNT,
      edgeFraction: edgeCount / PARTICLE_COUNT,
    };
  };

  return root;
}
