import * as THREE from 'three';

const SAMPLE = Object.freeze({ L: 4.4, W: 1.7, H: 0.5 });
const PARTICLE_COUNT = 240;
const TRAIL_LENGTH = 10;
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

  const labelI = makeTextSprite('I', '#72c7a8', 0.78);
  labelI.position.set(SAMPLE.L / 2 + 0.72, -0.55, 0.35);
  const labelB = makeTextSprite('B', '#8eaae0', 0.85);
  labelB.position.set(-SAMPLE.L / 2 - 0.78, 0.12, 1.25);
  const labelVh = makeTextSprite('Vₕ', '#c4a0b0', 0.85);
  labelVh.position.set(0.1, SAMPLE.W / 2 + 0.62, 0);
  const labelF = makeTextSprite('F', '#d4bc7a', 0.72);
  labelF.position.set(1.45, -0.54, 0.35);
  root.add(labelI, labelB, labelVh, labelF);

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const massVariance = new Float32Array(PARTICLE_COUNT);
  const phases = new Float32Array(PARTICLE_COUNT);
  const trailHistory = new Float32Array(PARTICLE_COUNT * TRAIL_LENGTH * 3);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * SAMPLE.L * 0.92;
    const y = (Math.random() - 0.5) * SAMPLE.W * 0.72;
    const z = (Math.random() - 0.5) * SAMPLE.H * 0.88;
    positions.set([x, y, z], i * 3);
    velocities.set([0, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3], i * 3);
    massVariance[i] = 0.86 + Math.random() * 0.28;
    phases[i] = Math.random() * Math.PI * 2;
    for (let s = 0; s < TRAIL_LENGTH; s += 1) trailHistory.set([x, y, z], (i * TRAIL_LENGTH + s) * 3);
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

  const trailPositions = new Float32Array(PARTICLE_COUNT * (TRAIL_LENGTH - 1) * 6);
  const trailColors = new Float32Array(trailPositions.length);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  trailGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 15);
  const trails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: tabletop ? 0.4 : 0.85,
    depthWrite: false,
    // Additive blending keeps low-intensity trail vertices from drawing black
    // streaks over the host's white tabletop.
    blending: THREE.AdditiveBlending,
    toneMapped: !tabletop,
  }));
  trails.frustumCulled = false;
  trails.renderOrder = 3;
  root.add(trails);

  const carrierColor = new THREE.Color(ELECTRON_COLOR);
  let lastCarrierType = null;
  let lastIntensity = null;
  let lastThickness = null;
  function syncStaticVisuals(state) {
    if (lastThickness !== state.d) {
      lastThickness = state.d;
      body.scale.z = state.d / SAMPLE.H;
      labelF.position.z = Math.max(0.35, state.d / 2 + 0.15);
    }
    if (lastCarrierType !== state.nType) {
      lastCarrierType = state.nType;
      carrierColor.setHex(state.nType ? ELECTRON_COLOR : HOLE_COLOR);
      particleMaterial.color.copy(carrierColor);
      lastIntensity = null;
    }
    const intensity = Math.min(1, 0.35 + 0.55 * state.I);
    if (lastIntensity === intensity) return;
    lastIntensity = intensity;
    let p = 0;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const trailVisibility = !tabletop || i % 2 === 0 ? 1 : 0;
      for (let s = 0; s < TRAIL_LENGTH - 1; s += 1) {
        for (const fade of [Math.pow(1 - s / (TRAIL_LENGTH - 1), 1.6), Math.pow(1 - (s + 1) / (TRAIL_LENGTH - 1), 1.6)]) {
          trailColors[p++] = carrierColor.r * fade * intensity * trailVisibility;
          trailColors[p++] = carrierColor.g * fade * intensity * trailVisibility;
          trailColors[p++] = carrierColor.b * fade * intensity * trailVisibility;
        }
      }
    }
    trailGeometry.attributes.color.needsUpdate = true;
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
      ? 0.58 + 0.18 * Math.min(I, 1.2)
      : 0.5 + 0.5 * Math.min(I, 1.2);
    particleMaterial.size = tabletop
      ? 0.026 + 0.012 * Math.min(I, 1.2)
      : 0.1 + 0.05 * Math.min(I, 1.2);

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

    // Mean transverse position → space-charge Hall field.
    // Electrons pile at y < 0 ⇒ meanY < 0 ⇒ E_y < 0 (E points toward −y).
    // Holes pile at y < 0 ⇒ meanY < 0 ⇒ E_y > 0 (E points toward +y).
    // E_y = −κ · meanY · q  satisfies both.
    let meanY = 0;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) meanY += positions[i * 3 + 1];
    meanY /= PARTICLE_COUNT;

    // Cap |E| near the ideal cancelling field |v0 B| so force balance is reachable.
    const kappa = 2.8 * (0.5 / Math.max(0.5, n));
    const Ecap = Math.abs(v0 * Bz) + 0.05;
    let Ey = -kappa * meanY * carrierSign;
    if (Ey > Ecap) Ey = Ecap;
    else if (Ey < -Ecap) Ey = -Ecap;

    // Soft wall stiffness (restoring, not absorbing).
    const wallK = 28;
    const wallDamp = 0.55;
    // Weak z confinement to keep carriers inside the film.
    const zSpring = 1.8 * (0.5 / Math.max(0.15, Number(state.d || 0.5)));

    // Lorentz force direction on a pure-drift carrier: F_y ∝ q (−v0 Bz).
    // Used for the F label and wrap re-entry bias (not as a hard attractor).
    const FmagY = -carrierSign * v0 * Bz;
    const pileBias = Math.abs(Bz) < 1e-3 || Math.abs(I) < 1e-3
      ? 0
      : Math.sign(FmagY || -1) * Math.min(0.35, 0.12 + 0.18 * Math.min(Math.abs(v0 * Bz), 2));

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const pi = i * 3;
      let x = positions[pi];
      let y = positions[pi + 1];
      let z = positions[pi + 2];
      let vx = velocities[pi];
      let vy = velocities[pi + 1];
      let vz = velocities[pi + 2];

      // Shift trail history back one step.
      for (let s = TRAIL_LENGTH - 1; s > 0; s -= 1) {
        const dst = (i * TRAIL_LENGTH + s) * 3;
        const src = dst - 3;
        trailHistory[dst] = trailHistory[src];
        trailHistory[dst + 1] = trailHistory[src + 1];
        trailHistory[dst + 2] = trailHistory[src + 2];
      }

      const mass = massVariance[i];
      // v × B with B = (0, 0, Bz): (vy Bz, −vx Bz, 0)
      const vCrossBx = vy * Bz;
      const vCrossBy = -vx * Bz;
      // a = (q/m)(v × B + E) + drag toward drift + soft walls
      let ax = (v0 - vx) / (tau * mass) + qOverM * vCrossBx;
      let ay = (0 - vy) / (tau * 1.15 * mass) + qOverM * (vCrossBy + Ey);
      let az = (0 - vz) / (tau * mass) - z * zSpring / mass;

      // Soft Hall-face walls: push back while inside a skin layer.
      if (y > halfW * 0.92) ay -= (y - halfW * 0.92) * wallK / mass;
      else if (y < -halfW * 0.92) ay -= (y + halfW * 0.92) * wallK / mass;
      if (z > halfH * 0.9) az -= (z - halfH * 0.9) * wallK / mass;
      else if (z < -halfH * 0.9) az -= (z + halfH * 0.9) * wallK / mass;

      phases[i] += dt * 8;
      const jitter = thermalStep / Math.sqrt(mass);
      vx += ax * dt + (Math.sin(phases[i] * 1.3 + i) * 0.35 + Math.random() - 0.5) * jitter;
      vy += ay * dt + (Math.cos(phases[i] * 1.7 + i) * 0.35 + Math.random() - 0.5) * jitter;
      vz += az * dt + (Math.sin(phases[i] * 2.1 + i) * 0.25 + Math.random() - 0.5) * jitter * 0.7;

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

      // Hard clamp only after soft forces — partial bounce (not sticky absorb).
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

      // Periodic along current axis: carriers re-enter across the full width
      // with only a mild bias toward the Lorentz-deflected side (bulk flow).
      let wrapped = false;
      if (flowDirection < 0 && x < -halfL - 0.08) {
        x = halfL + 0.08;
        wrapped = true;
      } else if (flowDirection > 0 && x > halfL + 0.08) {
        x = -halfL - 0.08;
        wrapped = true;
      }
      if (wrapped) {
        // Gaussian-ish fill of the cross-section, lightly biased by Hall side.
        const u1 = Math.random() + Math.random() + Math.random() - 1.5;
        const u2 = Math.random() + Math.random() + Math.random() - 1.5;
        y = Math.max(-halfW, Math.min(halfW, pileBias * halfW * 0.55 + u1 * halfW * 0.55));
        z = Math.max(-halfH, Math.min(halfH, u2 * halfH * 0.7));
        vx = v0 * (0.85 + Math.random() * 0.3);
        vy = (Math.random() - 0.5) * 0.25;
        vz = (Math.random() - 0.5) * 0.2;
      }

      positions[pi] = x;
      positions[pi + 1] = y;
      positions[pi + 2] = z;
      velocities[pi] = vx;
      velocities[pi + 1] = vy;
      velocities[pi + 2] = vz;

      const head = i * TRAIL_LENGTH * 3;
      trailHistory[head] = x;
      trailHistory[head + 1] = y;
      trailHistory[head + 2] = z;
      if (wrapped) {
        for (let s = 1; s < TRAIL_LENGTH; s += 1) {
          const t = head + s * 3;
          trailHistory[t] = x;
          trailHistory[t + 1] = y;
          trailHistory[t + 2] = z;
        }
      }
      const segmentBase = i * (TRAIL_LENGTH - 1) * 6;
      for (let s = 0; s < TRAIL_LENGTH - 1; s += 1) {
        const a = (i * TRAIL_LENGTH + s) * 3;
        const b = a + 3;
        trailPositions[segmentBase + s * 6] = trailHistory[a];
        trailPositions[segmentBase + s * 6 + 1] = trailHistory[a + 1];
        trailPositions[segmentBase + s * 6 + 2] = trailHistory[a + 2];
        trailPositions[segmentBase + s * 6 + 3] = trailHistory[b];
        trailPositions[segmentBase + s * 6 + 4] = trailHistory[b + 1];
        trailPositions[segmentBase + s * 6 + 5] = trailHistory[b + 2];
      }
    }

    particleGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.position.needsUpdate = true;

    // Place F on the Lorentz-deflected Hall face (same side for n and p).
    const showF = Math.abs(Bz) > 0.04 && I > 0.04;
    labelF.visible = showF;
    if (showF) {
      const side = Math.sign(FmagY || -1);
      labelF.position.set(
        halfL * 0.35,
        side * (SAMPLE.W / 2 + 0.42),
        Math.max(0.2, Number(state.d || 0.5) / 2 + 0.1),
      );
    }
  }

  root.userData.update = (state, dt) => {
    if (!state) return;
    syncStaticVisuals(state);
    const voltage = (state.I * state.B * (state.nType ? -1 : 1)) / (state.n * Math.max(0.05, state.d / 0.5));
    shell.material.emissiveIntensity = 0.18 + Math.min(Math.abs(voltage), 2) * 0.11;
    core.material.opacity = (tabletop ? 0.62 : 0.2) + Math.min(Math.abs(voltage), 2) * 0.06;
    labelB.visible = state.showB !== false;
    if (tabletop && state.autoCam && dt > 0) root.rotation.y += dt * 0.18;
    if (!state.paused && dt > 0) updateParticles(state, Math.min(dt, 0.05));
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

  root.userData.prewarm = (renderer, camera, scene) => {
    const visible = root.visible;
    root.visible = true;
    // Seed particles + materials so first open only reuses already-built state.
    root.userData.update?.({
      I: 1,
      B: 1,
      n: 1,
      d: 0.5,
      nType: true,
      paused: true,
      autoCam: false,
      showB: true,
      vh: -1,
      force: 1,
    }, 0.016);
    renderer.compile(root, camera, scene);
    root.visible = visible;
  };
  return root;
}
