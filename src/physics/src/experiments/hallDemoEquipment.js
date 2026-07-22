import * as THREE from 'three';

const SAMPLE = Object.freeze({ L: 4.4, W: 1.7, H: 0.5 });
const PARTICLE_COUNT = 240;
const TRAIL_LENGTH = 10;
const ELECTRON_COLOR = 0x5cb89a;
const HOLE_COLOR = 0xc49878;

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

  function updateParticles(state, dt) {
    const flowDirection = state.nType ? -1 : 1;
    const carrierSign = state.nType ? -1 : 1;
    const pileSide = -Math.sign(state.B || 1);
    const dNorm = Math.max(0.05, state.d / 0.5);
    const mix = Math.min(Math.abs(state.B * state.I) / (state.n * dNorm), 2.5);
    particleMaterial.opacity = tabletop
      ? 0.58 + 0.18 * Math.min(state.I, 1.2)
      : 0.5 + 0.5 * Math.min(state.I, 1.2);
    particleMaterial.size = tabletop
      ? 0.026 + 0.012 * Math.min(state.I, 1.2)
      : 0.1 + 0.05 * Math.min(state.I, 1.2);
    const tau = 0.15;
    const v0 = 1.45 * state.I * flowDirection;
    const qOverM = carrierSign * 4.2;
    const halfW = SAMPLE.W / 2 - 0.08;
    const yEq = pileSide * Math.min(halfW * 0.95, SAMPLE.W * 0.28 * mix);
    const thermalStep = Math.sqrt(2 * (0.009 / Math.max(0.3, state.n)) * dt);
    const halfH = Math.max(0.02, state.d / 2 - 0.04);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const pi = i * 3;
      let x = positions[pi]; let y = positions[pi + 1]; let z = positions[pi + 2];
      let vx = velocities[pi]; let vy = velocities[pi + 1]; let vz = velocities[pi + 2];
      for (let s = TRAIL_LENGTH - 1; s > 0; s -= 1) {
        const dst = (i * TRAIL_LENGTH + s) * 3;
        const src = dst - 3;
        trailHistory[dst] = trailHistory[src];
        trailHistory[dst + 1] = trailHistory[src + 1];
        trailHistory[dst + 2] = trailHistory[src + 2];
      }
      const mass = massVariance[i];
      const bx = state.B * 0.12 * Math.sin(x * 2.2 + phases[i]);
      const by = state.B * 0.15 * Math.cos(x * 1.8 + phases[i]);
      const ax = (v0 - vx) / (tau * mass) + qOverM * (vy * state.B - vz * by);
      const ay = qOverM * (vz * bx - vx * state.B) + (yEq - y) / (tau * 1.6 * mass);
      const az = qOverM * (vx * by - vy * bx) - z * (0.3 * (0.5 / state.d)) / (tau * mass);
      phases[i] += dt * 10;
      vx += ax * dt + (Math.sin(phases[i] * 1.3 + i) + Math.random() - 0.5) * thermalStep;
      vy += ay * dt + (Math.cos(phases[i] * 1.7 + i) + Math.random() - 0.5) * thermalStep;
      vz += az * dt + (Math.sin(phases[i] * 2.1 + i) + Math.random() - 0.5) * thermalStep * 0.8;
      x += vx * dt; y += vy * dt; z += vz * dt;
      // Hall / thickness faces are sample surfaces, not rubber walls.
      // Absorb the outward normal velocity so carriers pile and slide instead
      // of visibly bouncing off the bottom edge (especially under strong B).
      if (y > halfW) {
        y = halfW;
        if (vy > 0) vy = 0;
      } else if (y < -halfW) {
        y = -halfW;
        if (vy < 0) vy = 0;
      }
      if (z > halfH) {
        z = halfH;
        if (vz > 0) vz = 0;
      } else if (z < -halfH) {
        z = -halfH;
        if (vz < 0) vz = 0;
      }
      let wrapped = false;
      if (flowDirection < 0 && x < -SAMPLE.L / 2 - 0.1) { x = SAMPLE.L / 2 + 0.1; wrapped = true; }
      if (flowDirection > 0 && x > SAMPLE.L / 2 + 0.1) { x = -SAMPLE.L / 2 - 0.1; wrapped = true; }
      if (wrapped) {
        y = yEq * 0.2 + (Math.random() - 0.5) * SAMPLE.W * 0.4;
        z = (Math.random() - 0.5) * state.d * 0.85;
        vx = v0; vy = (Math.random() - 0.5) * 0.2; vz = (Math.random() - 0.5) * 0.2;
      }
      positions.set([x, y, z], pi);
      velocities.set([vx, vy, vz], pi);
      const head = i * TRAIL_LENGTH * 3;
      trailHistory.set([x, y, z], head);
      if (wrapped) for (let s = 1; s < TRAIL_LENGTH; s += 1) trailHistory.set([x, y, z], head + s * 3);
      const segmentBase = i * (TRAIL_LENGTH - 1) * 6;
      for (let s = 0; s < TRAIL_LENGTH - 1; s += 1) {
        const a = (i * TRAIL_LENGTH + s) * 3;
        const b = a + 3;
        trailPositions.set(trailHistory.subarray(a, a + 3), segmentBase + s * 6);
        trailPositions.set(trailHistory.subarray(b, b + 3), segmentBase + s * 6 + 3);
      }
    }
    particleGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.position.needsUpdate = true;
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
  root.userData.prewarm = (renderer, camera, scene) => {
    const visible = root.visible;
    root.visible = true;
    renderer.compile(root, camera, scene);
    root.visible = visible;
  };
  return root;
}
