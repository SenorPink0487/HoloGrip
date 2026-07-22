import * as THREE from 'three';

/**
 * Dual asteroid system:
 *
 * 1) STATIC belt — main-belt annulus (~2.0–3.2 AU) for system view.
 * 2) STREAM field — wrap-around pack that follows the ship, but density is
 *    gated by heliocentric radius: dense only inside the main belt, sparse
 *    near Earth / deep space (option 1 — more realistic placement).
 *
 * Scale: scout ~20 m; common rocks ship-scale to a few hundred metres;
 * named bodies use real R/R⊕ ratios.
 */
export function createAsteroidField(opts = {}) {
  const earthRadius = opts.earthRadius ?? 14000;
  const AU = opts.AU ?? earthRadius * 22;
  const sunPos = opts.sunPos?.clone?.() ?? new THREE.Vector3(0, 0, 0);
  const earthAngle = opts.earthAngle ?? 2.45;

  const R = earthRadius;
  const planeY = 0; // solar-system orbital plane
  // Thick vertical cloud — was ~0.045 R (sheet-thin next to rock sizes).
  // ~0.9 R half-height so rocks sit clearly above/below the flight plane.
  const halfThick = R * 0.9;

  // Main belt (compressed heliocentric units) — densest STREAM here
  const BELT_INNER = AU * 2.05;
  const BELT_OUTER = AU * 3.2;
  // Soft ramps (start rising outside Earth so approach feels progressive)
  const BELT_FADE_IN0 = AU * 1.2;
  const BELT_FADE_IN1 = AU * 2.1;
  const BELT_FADE_OUT0 = AU * 3.05;
  const BELT_FADE_OUT1 = AU * 3.7;
  // Baseline everywhere (NEA / scattered) — slight thin-out for readability
  const BELT_SPARSE = 0.26;

  const earthX = Math.cos(earthAngle) * AU;
  const earthZ = Math.sin(earthAngle) * AU;

  /**
   * 0..1 density weight from heliocentric cylindrical radius.
   * Ambient floor everywhere + boost inside main belt (not a binary void).
   */
  function beltDensityAt(x, z) {
    const r = Math.hypot(x, z);
    const enter = THREE.MathUtils.smoothstep(BELT_FADE_IN0, BELT_FADE_IN1, r);
    const leave = 1 - THREE.MathUtils.smoothstep(BELT_FADE_OUT0, BELT_FADE_OUT1, r);
    const core = enter * leave;
    const mid = Math.exp(
      -Math.pow((r - (BELT_INNER + BELT_OUTER) * 0.5) / (AU * 0.55), 2)
    );
    // Sparse only outside the belt; main belt still peaks at full density
    const boost = core * (0.45 + 0.4 * mid);
    return THREE.MathUtils.clamp(BELT_SPARSE + boost, 0, 1);
  }

  /** Deterministic keep/cull so wrap doesn't flicker a rock on/off randomly. */
  function rockVisibleInBelt(i, x, z, layerBias = 1) {
    const dens = Math.min(1, beltDensityAt(x, z) * layerBias);
    if (dens >= 0.97) return true;
    return hash01(i * 17.13 + 3.7) < dens;
  }

  /**
   * Vertical sample: fat mid-plane cloud + high outliers (not a flat disc).
   * Returns offset from planeY in group-local Y.
   */
  function sampleHeight(i, scale = 1) {
    // Two hashes → approx triangular / soft gaussian in [-1, 1]
    const u = hash01(i * 5.3) + hash01(i * 1.9) - 1;
    // Push mass away from exact plane so fewer rocks share one height
    const shaped = Math.sign(u) * Math.pow(Math.abs(u), 0.55);
    // ~12% high-inclination outliers
    const outlier =
      hash01(i * 7.11) > 0.88 ? 1.6 + hash01(i * 8.3) * 1.4 : 1;
    // Slight layer separation by seed so gravel / dark / main differ
    const layerJitter = (hash01(i * 2.7) - 0.5) * 0.35;
    return (shaped * outlier + layerJitter) * halfThick * scale;
  }

  const group = new THREE.Group();
  group.name = 'AsteroidBelt';
  group.position.copy(sunPos);

  // Lit by sun only — no emissive. Emissive micro-rocks read as twinkling
  // "stars" when the stream wrap-recycles them at high ship speed.
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xc8c0b4,
    metalness: 0.18,
    roughness: 0.72,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 0.9,
  });
  const rockMatB = new THREE.MeshStandardMaterial({
    color: 0xb0a898,
    metalness: 0.14,
    roughness: 0.78,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 0.8,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x8a8478,
    metalness: 0.16,
    roughness: 0.8,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 0.7,
  });
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xd0e0ec,
    metalness: 0.28,
    roughness: 0.45,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 1.1,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xc8d0d8,
    metalness: 0.82,
    roughness: 0.32,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 1.2,
  });

  const dummy = new THREE.Object3D();
  const bodies = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const _ship = new THREE.Vector3();
  const _world = new THREE.Vector3();

  function sampleSize(i, className) {
    const u = Math.max(1e-4, hash01(i));
    if (className === 'pebble') {
      return THREE.MathUtils.clamp(16 * Math.pow(u, -0.38), 16, 60);
    }
    if (className === 'boulder') {
      return THREE.MathUtils.clamp(50 * Math.pow(u, -0.48), 50, 220);
    }
    if (className === 'hill') {
      return THREE.MathUtils.clamp(150 * Math.pow(u, -0.52), 150, 520);
    }
    return THREE.MathUtils.clamp(300 * Math.pow(u, -0.58), 300, 1200);
  }

  function irregularScale(s, i) {
    return {
      x: s * (0.8 + hash01(i + 1) * 0.45),
      y: s * (0.6 + hash01(i + 2) * 0.5),
      z: s * (0.75 + hash01(i + 3) * 0.45),
    };
  }

  function placeAt(mesh, i, x, y, z, s, rotSeed) {
    const sc = irregularScale(s, rotSeed);
    dummy.position.set(x, y, z);
    dummy.rotation.set(
      hash01(rotSeed + 1) * 6,
      hash01(rotSeed + 2) * 6,
      hash01(rotSeed + 3) * 6
    );
    dummy.scale.set(sc.x, sc.y, sc.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  // ═══════════════════════════════════════════════════════════
  // STREAM FIELD — world-fixed rocks with wrap recycling
  //
  // Rocks sit at absolute positions on the orbital plane. The ship flies
  // through them (parallax + correct depth). When a rock leaves a window
  // around the ship it is teleported ahead by one window — infinite field
  // without locking rocks to the camera (which looked frozen/fake).
  // ═══════════════════════════════════════════════════════════
  const STREAM_HALF = 90000; // ±90 km recycle window
  const STREAM_N = 4800;
  const STREAM_DARK_N = 1600;
  const STREAM_GRAVEL_N = 2400;

  // Absolute positions in group-local space
  const streamPos = new Float32Array(STREAM_N * 3);
  const streamSize = new Float32Array(STREAM_N);
  const streamSpin = new Float32Array(STREAM_N);
  const streamAngle = new Float32Array(STREAM_N);
  const streamAxis = new Float32Array(STREAM_N * 3);

  const darkPos = new Float32Array(STREAM_DARK_N * 3);
  const darkSize = new Float32Array(STREAM_DARK_N);
  const darkSpin = new Float32Array(STREAM_DARK_N);
  const darkAngle = new Float32Array(STREAM_DARK_N);

  const gravelPos = new Float32Array(STREAM_GRAVEL_N * 3);
  const gravelSize = new Float32Array(STREAM_GRAVEL_N);
  const gravelSpin = new Float32Array(STREAM_GRAVEL_N);
  const gravelAngle = new Float32Array(STREAM_GRAVEL_N);

  // Depth-correct opaque rocks (explicit depthWrite — no transparent sorting junk)
  for (const m of [rockMat, rockMatB, darkMat, iceMat, metalMat]) {
    m.depthTest = true;
    m.depthWrite = true;
    m.transparent = false;
  }

  const streamMesh = new THREE.InstancedMesh(
    createRockyGeometry(1, 0.5),
    rockMat,
    STREAM_N
  );
  streamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streamMesh.castShadow = false;
  streamMesh.receiveShadow = true;
  streamMesh.frustumCulled = false;
  streamMesh.name = 'AsteroidsStream';
  streamMesh.renderOrder = 0;
  group.add(streamMesh);

  const streamDark = new THREE.InstancedMesh(
    createRockyGeometry(1, 0.55),
    darkMat,
    STREAM_DARK_N
  );
  streamDark.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streamDark.castShadow = false;
  streamDark.receiveShadow = true;
  streamDark.frustumCulled = false;
  streamDark.name = 'AsteroidsStreamDark';
  group.add(streamDark);

  const streamGravel = new THREE.InstancedMesh(
    createRockyGeometry(0, 0.4),
    rockMatB,
    STREAM_GRAVEL_N
  );
  streamGravel.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streamGravel.castShadow = false;
  streamGravel.receiveShadow = true;
  streamGravel.frustumCulled = false;
  streamGravel.name = 'AsteroidsStreamGravel';
  group.add(streamGravel);

  const _q = new THREE.Quaternion();
  const _eul = new THREE.Euler();
  const _axis = new THREE.Vector3();

  // Ship-local for distance cull (set each stream update)
  let streamCx = earthX;
  let streamCz = earthZ;
  // Hide rocks that project as ~1px sparkle dots (sub-pixel + wrap = star flicker)
  const MIN_SOLID_SIZE = 28;
  const CULL_DIST = 42000;

  function placeSpinning(mesh, i, x, y, z, s, angle, ax, ay, az, seed, layerBias = 1) {
    // Outside main belt: hide most instances (sparse NEA / deep space)
    if (!rockVisibleInBelt(i, x, z, layerBias)) {
      dummy.position.set(x, y, z);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      return;
    }
    // Far + tiny → hide. Wrap recycling of sub-pixel rocks looked like stars blinking.
    const dx = x - streamCx;
    const dz = z - streamCz;
    const distSq = dx * dx + dz * dz;
    if (s < MIN_SOLID_SIZE && distSq > CULL_DIST * CULL_DIST) {
      dummy.position.set(x, y, z);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      return;
    }
    const sc = irregularScale(s, seed);
    dummy.position.set(x, y, z);
    // Stable random rest pose, then spin around a fixed axis
    _eul.set(hash01(seed + 1) * 6, hash01(seed + 2) * 6, hash01(seed + 3) * 6);
    dummy.quaternion.setFromEuler(_eul);
    _axis.set(ax, ay, az);
    if (_axis.lengthSq() < 1e-6) _axis.set(0, 1, 0);
    _axis.normalize();
    _q.setFromAxisAngle(_axis, angle);
    dummy.quaternion.premultiply(_q);
    dummy.scale.set(sc.x, sc.y, sc.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function scatterLayer(pos, size, spin, angle, n, sizeFn, axisArr = null) {
    const cell = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      if (i < n * 0.42) {
        const gx = i % cell;
        const gz = (i / cell) | 0;
        pos[i * 3] =
          (gx + 0.5) / cell * 2 * STREAM_HALF -
          STREAM_HALF +
          (hash01(i) - 0.5) * 220;
        pos[i * 3 + 2] =
          (gz + 0.5) / cell * 2 * STREAM_HALF -
          STREAM_HALF +
          (hash01(i + 1) - 0.5) * 220;
      } else {
        pos[i * 3] = (hash01(i * 2.1) - 0.5) * 2 * STREAM_HALF;
        pos[i * 3 + 2] = (hash01(i * 3.7) - 0.5) * 2 * STREAM_HALF;
      }
      // Thick 3D cloud — not coplanar with the flight plane
      pos[i * 3 + 1] = planeY + sampleHeight(i, 1.15);
      size[i] = sizeFn(i);
      spin[i] = (hash01(i + 9) - 0.5) * 0.8;
      angle[i] = hash01(i + 11) * Math.PI * 2;
      if (axisArr) {
        axisArr[i * 3] = hash01(i + 12) - 0.5;
        axisArr[i * 3 + 1] = 0.4 + hash01(i + 13) * 0.6;
        axisArr[i * 3 + 2] = hash01(i + 14) - 0.5;
      }
    }
  }

  function reseedAbsolute(cx, cz) {
    scatterLayer(
      streamPos,
      streamSize,
      streamSpin,
      streamAngle,
      STREAM_N,
      (i) => {
        const cls =
          hash01(i + 4) < 0.48
            ? 'pebble'
            : hash01(i + 5) < 0.78
              ? 'boulder'
              : hash01(i + 6) < 0.92
                ? 'hill'
                : 'mountain';
        return sampleSize(i + 70, cls);
      },
      streamAxis
    );
    for (let i = 0; i < STREAM_N; i++) {
      streamPos[i * 3] += cx;
      streamPos[i * 3 + 2] += cz;
    }

    scatterLayer(
      darkPos,
      darkSize,
      darkSpin,
      darkAngle,
      STREAM_DARK_N,
      (i) => sampleSize(i + 900, hash01(i) < 0.6 ? 'pebble' : 'boulder')
    );
    for (let i = 0; i < STREAM_DARK_N; i++) {
      darkPos[i * 3] += cx;
      darkPos[i * 3 + 2] += cz;
    }

    scatterLayer(
      gravelPos,
      gravelSize,
      gravelSpin,
      gravelAngle,
      STREAM_GRAVEL_N,
      // Keep gravel large enough to read as rocks, not 1px star-sparkle
      (i) => 32 + hash01(i + 3) * 48
    );
    for (let i = 0; i < STREAM_GRAVEL_N; i++) {
      gravelPos[i * 3] += cx;
      gravelPos[i * 3 + 2] += cz;
    }
  }

  /** Keep rock in [center-half, center+half] by leaping one full window. */
  function wrapAxis(pos, i, base, cx, half) {
    const span = half * 2;
    let v = pos[i * 3 + base];
    let d = v - cx;
    if (d > half) {
      v -= span * Math.ceil((d - half) / span);
      pos[i * 3 + base] = v;
      return true;
    }
    if (d < -half) {
      v += span * Math.ceil((-half - d) / span);
      pos[i * 3 + base] = v;
      return true;
    }
    return false;
  }

  function syncStreamMatrices(dt) {
    // Main rock layer — full density only in belt
    for (let i = 0; i < STREAM_N; i++) {
      streamAngle[i] += streamSpin[i] * dt;
      placeSpinning(
        streamMesh,
        i,
        streamPos[i * 3],
        streamPos[i * 3 + 1],
        streamPos[i * 3 + 2],
        streamSize[i],
        streamAngle[i],
        streamAxis[i * 3],
        streamAxis[i * 3 + 1],
        streamAxis[i * 3 + 2],
        i + 17,
        1
      );
    }
    streamMesh.instanceMatrix.needsUpdate = true;

    // Dark rocks slightly rarer outside peak belt
    for (let i = 0; i < STREAM_DARK_N; i++) {
      darkAngle[i] += darkSpin[i] * dt;
      placeSpinning(
        streamDark,
        i,
        darkPos[i * 3],
        darkPos[i * 3 + 1],
        darkPos[i * 3 + 2],
        darkSize[i],
        darkAngle[i],
        0.2,
        1,
        0.15,
        i + 200,
        0.85
      );
    }
    streamDark.instanceMatrix.needsUpdate = true;

    // Gravel densest mid-belt (layerBias > 1 peaks with density curve still capped)
    for (let i = 0; i < STREAM_GRAVEL_N; i++) {
      gravelAngle[i] += gravelSpin[i] * dt;
      placeSpinning(
        streamGravel,
        i,
        gravelPos[i * 3],
        gravelPos[i * 3 + 1],
        gravelPos[i * 3 + 2],
        gravelSize[i],
        gravelAngle[i],
        0.1,
        1,
        0.1,
        i + 400,
        1.1
      );
    }
    streamGravel.instanceMatrix.needsUpdate = true;
  }

  function updateStreamWorld(cx, cz, dt) {
    streamCx = cx;
    streamCz = cz;
    // World-fixed wrap: rocks stay put until they leave the ship window
    for (let i = 0; i < STREAM_N; i++) {
      wrapAxis(streamPos, i, 0, cx, STREAM_HALF);
      wrapAxis(streamPos, i, 2, cz, STREAM_HALF);
    }
    for (let i = 0; i < STREAM_DARK_N; i++) {
      wrapAxis(darkPos, i, 0, cx, STREAM_HALF);
      wrapAxis(darkPos, i, 2, cz, STREAM_HALF);
    }
    for (let i = 0; i < STREAM_GRAVEL_N; i++) {
      wrapAxis(gravelPos, i, 0, cx, STREAM_HALF);
      wrapAxis(gravelPos, i, 2, cz, STREAM_HALF);
    }
    syncStreamMatrices(dt);
  }

  // Seed around Earth; reseed if pilot teleports far
  reseedAbsolute(earthX, earthZ);
  syncStreamMatrices(0);
  let streamSeededAtX = earthX;
  let streamSeededAtZ = earthZ;
  let streamReady = true;

  // ═══════════════════════════════════════════════════════════
  // STATIC main-belt annulus (system view / deep backdrop)
  // Real main belt ≈ 2.1–3.3 AU → compressed 2.05–3.2 AU
  // ═══════════════════════════════════════════════════════════
  const rNear = BELT_INNER;
  const rFar = BELT_OUTER;
  const ringRadii = [];
  for (let ring = 0; ring < 14; ring++) {
    // Prefer mid-belt rings (slightly denser packing toward 2.7 AU)
    const t = (ring + 0.5) / 14;
    const midBias = 0.35 + 0.65 * Math.sin(t * Math.PI); // more rings near mid
    const u = THREE.MathUtils.clamp(t * 0.55 + midBias * 0.45, 0, 1);
    ringRadii.push(rNear * Math.pow(rFar / rNear, u));
  }
  const perRing = 36;
  const regularCount = ringRadii.length * perRing;
  const regular = new THREE.InstancedMesh(
    createRockyGeometry(1, 0.45),
    rockMatB,
    regularCount
  );
  regular.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  regular.castShadow = false;
  regular.frustumCulled = true;
  regular.name = 'AsteroidsRegular';
  group.add(regular);

  let idx = 0;
  for (let ring = 0; ring < ringRadii.length; ring++) {
    const r = ringRadii[ring];
    for (let k = 0; k < perRing; k++) {
      const angle = (k / perRing) * Math.PI * 2 + ring * 0.08;
      const s = sampleSize(idx + 50, hash01(idx) < 0.6 ? 'boulder' : 'hill');
      placeAt(
        regular,
        idx,
        Math.cos(angle) * r,
        planeY + sampleHeight(idx + 50, 1.0),
        Math.sin(angle) * r,
        s,
        idx + 50
      );
      idx++;
    }
  }
  regular.instanceMatrix.needsUpdate = true;
  regular.computeBoundingSphere();

  const chaosCount = 400;
  const chaos = new THREE.InstancedMesh(
    createRockyGeometry(1, 0.55),
    darkMat,
    chaosCount
  );
  chaos.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  chaos.castShadow = false;
  chaos.frustumCulled = true;
  chaos.name = 'AsteroidsChaos';
  group.add(chaos);
  for (let i = 0; i < chaosCount; i++) {
    const t = Math.pow(hash01(i * 3.1), 0.7);
    const r = rNear * Math.pow(rFar / rNear, t) * (0.88 + hash01(i * 2.2) * 0.28);
    const angle = i * GOLDEN + hash01(i * 5.5) * 0.9;
    placeAt(
      chaos,
      i,
      Math.cos(angle) * r,
      planeY + sampleHeight(i + 200, 1.2),
      Math.sin(angle) * r,
      sampleSize(i + 200, hash01(i) < 0.5 ? 'boulder' : 'hill'),
      i + 80
    );
  }
  chaos.instanceMatrix.needsUpdate = true;
  chaos.computeBoundingSphere();

  const iceCount = 80;
  const ice = new THREE.InstancedMesh(createRockyGeometry(1, 0.4), iceMat, iceCount);
  ice.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  ice.castShadow = false;
  ice.frustumCulled = true;
  group.add(ice);
  for (let i = 0; i < iceCount; i++) {
    const t = 0.55 + hash01(i * 4.4) * 0.45;
    const r = rNear * Math.pow(rFar / rNear, t);
    const angle = i * GOLDEN * 1.6 + 0.4;
    placeAt(
      ice,
      i,
      Math.cos(angle) * r,
      planeY + sampleHeight(i + 300, 1.35),
      Math.sin(angle) * r,
      sampleSize(i + 300, 'hill'),
      i + 90
    );
  }
  ice.instanceMatrix.needsUpdate = true;
  ice.computeBoundingSphere();

  // Named bodies
  const uniqueDefs = [
    { name: 'Ceres', realR_km: 473, color: 0x8a8278, i: 0 },
    { name: 'Vesta', realR_km: 262, color: 0x6e6458, i: 1 },
    { name: 'Pallas', realR_km: 256, color: 0x5c5850, i: 2 },
    { name: 'Hygiea', realR_km: 217, color: 0x706860, i: 3 },
    { name: 'Interamnia', realR_km: 166, color: 0x4a4640, i: 4 },
    { name: 'Psyche', realR_km: 113, color: 0x6a6e74, metal: true, i: 5 },
  ];
  const EARTH_R_KM = 6371;
  const namedN = uniqueDefs.length;
  const namedR = AU * 2.6;
  for (const def of uniqueDefs) {
    const geo = createRockyGeometry(2, 0.48);
    const mat = def.metal ? metalMat.clone() : rockMat.clone();
    mat.color = new THREE.Color(def.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = def.name;
    const radius = R * (def.realR_km / EARTH_R_KM);
    const angle = (def.i / namedN) * Math.PI * 2 + 0.4;
    const r = namedR * (0.94 + (def.i % 3) * 0.04);
    mesh.position.set(
      Math.cos(angle) * r,
      planeY + (def.i - 2.5) * halfThick * 0.22,
      Math.sin(angle) * r
    );
    const squash = 0.88 + hash01(def.i + 3) * 0.12;
    mesh.scale.set(radius, radius * squash, radius * (0.9 + hash01(def.i) * 0.12));
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    group.add(mesh);
    bodies.push({
      mesh,
      name: def.name,
      radius,
      spin: (hash01(def.i + 80) - 0.5) * 0.03,
    });
  }

  group.userData.planeY = planeY;
  group.userData.streamHalf = STREAM_HALF;
  group.userData.streamCount = STREAM_N + STREAM_DARK_N + STREAM_GRAVEL_N;
  group.userData.beltInner = BELT_INNER;
  group.userData.beltOuter = BELT_OUTER;
  group.userData.beltDensityAt = beltDensityAt;

  let visible = true;
  let streamEnabled = true;

  /**
   * @param {number} dt
   * @param {THREE.Vector3|null} shipWorldPos world-space ship (scene coords)
   */
  function update(dt, shipWorldPos = null) {
    if (!visible) return;

    for (const b of bodies) {
      b.mesh.rotation.y += b.spin * dt;
      b.mesh.rotation.x += b.spin * 0.2 * dt;
    }

    if (!streamEnabled || !shipWorldPos) return;

    // Instances live under group at sunPos — ship → group-local XZ
    const cx = shipWorldPos.x - group.position.x;
    const cz = shipWorldPos.z - group.position.z;

    // If the pilot jumps too far (mode switch), full reseed so the window is filled
    const jumpX = cx - streamSeededAtX;
    const jumpZ = cz - streamSeededAtZ;
    if (jumpX * jumpX + jumpZ * jumpZ > STREAM_HALF * STREAM_HALF * 2.5) {
      reseedAbsolute(cx, cz);
      streamSeededAtX = cx;
      streamSeededAtZ = cz;
    }

    // World-fixed positions + wrap + spin → real relative motion & depth
    updateStreamWorld(cx, cz, dt);
    streamSeededAtX = cx;
    streamSeededAtZ = cz;
  }

  return {
    group,
    bodies,
    update,
    setVisible(v) {
      visible = !!v;
      group.visible = visible;
    },
    setStreamEnabled(v) {
      streamEnabled = !!v;
      streamMesh.visible = streamEnabled;
      streamDark.visible = streamEnabled;
      streamGravel.visible = streamEnabled;
      if (streamEnabled) {
        // Refresh matrices when enabling pilot mode
        syncStreamMatrices(0);
      }
    },
    /** Call when entering pilot so the dense field is seeded at the ship. */
    seedAtWorld(shipWorldPos) {
      if (!shipWorldPos) return;
      const cx = shipWorldPos.x - group.position.x;
      const cz = shipWorldPos.z - group.position.z;
      reseedAbsolute(cx, cz);
      streamSeededAtX = cx;
      streamSeededAtZ = cz;
      syncStreamMatrices(0);
    },
    nearestBody(worldPos) {
      let best = null;
      let bestD = Infinity;
      for (const b of bodies) {
        b.mesh.getWorldPosition(_world);
        const d = worldPos.distanceTo(_world) - b.radius;
        if (d < bestD) {
          bestD = d;
          best = { name: b.name, distance: Math.max(0, d) };
        }
      }
      return best;
    },
  };
}

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function createRockyGeometry(detail = 1, noise = 0.45) {
  const subdiv = detail >= 2 ? 2 : detail >= 1 ? 1 : 0;
  const geo = new THREE.IcosahedronGeometry(1, subdiv);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    nrm.copy(v).normalize();
    const nx = nrm.x;
    const ny = nrm.y;
    const nz = nrm.z;
    let d =
      1 +
      noise3(nx * 1.7, ny * 1.7, nz * 1.7) * noise * 0.4 +
      noise3(nx * 4.2, ny * 4.2, nz * 4.2) * noise * 0.28 +
      noise3(nx * 9.5, ny * 9.5, nz * 9.5) * noise * 0.14;
    const crater = noise3(nx * 3.1 + 2, ny * 3.1, nz * 3.1);
    if (crater > 0.45) d *= 0.88 - (crater - 0.45) * 0.15;
    v.copy(nrm).multiplyScalar(d);
    v.x *= 1.05;
    v.y *= 0.82;
    v.z *= 0.96;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function noise3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
