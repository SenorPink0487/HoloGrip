import * as THREE from 'three';

/**
 * Launch exhaust — realistic methalox plume (not cartoon sunburst).
 *
 * Visual language:
 *  - Short, downward jet columns (~20–55 m) — NEVER stretch to ground from altitude
 *  - Open cones (no solid base disc that reads as a pancake from above)
 *  - Soft gas density: bright near nozzle, transparent downstream
 *  - Filaments mostly parallel to thrust, slight cone splay — no radial starburst
 *  - Pad-only: flame trench, ground pool, steam/smoke
 *
 * Coordinates: real metres in the siteMeters parent.
 */
export function createExhaustSystem(parent) {
  const group = new THREE.Group();
  group.name = 'LaunchEffects';
  parent.add(group);

  const NOISE_GLSL = /* glsl */ `
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.07;
        a *= 0.5;
      }
      return v;
    }
  `;

  // =========================================================================
  // Jet volume shader — soft gas column (open cone), axis-radial density
  // =========================================================================
  function makeJetMaterial({ coreBias = 0.5 } = {}) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // NEVER depth-test against pad scrub / terrain — huge ground plane +
      // site scale precision hides mid-air plumes when camera looks "down through" flame.
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uVacuum: { value: 0 },
        uCore: { value: coreBias },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uVacuum;
        uniform float uCore;
        varying vec2 vUv;
        varying vec3 vPos;
        ${NOISE_GLSL}
        void main() {
          // Open ConeGeometry: tip at +Y before rot; after rot X=PI tip is -Y (down).
          // UV.y ~ 0 at tip, ~1 at base (nozzle). fromNozzle 0 at engines → 1 at tip.
          float fromNozzle = 1.0 - vUv.y;
          // Radial distance from cone axis in object space (pre-scale unit cone)
          float radial = length(vPos.xz);
          // Cone radius grows with fromNozzle (tip=0, base≈1 after unit scale)
          float coneR = max(0.04, mix(0.02, 1.0, fromNozzle));
          float rNorm = radial / coneR;

          float t = uTime;
          // Slow advection only — fast noise + sin used to strobe a bright
          // disc in the chase-cam center (especially with additive + bloom).
          float n = fbm(vec2(vUv.x * 4.0 + fromNozzle, fromNozzle * 5.5 - t * 2.2));
          float n2 = fbm(vec2(vUv.x * 8.0 - t * 0.25, fromNozzle * 9.0 - t * 3.5));

          // Soft axis core, falloff to edge — gas not solid plastic
          float axis = 1.0 - smoothstep(0.0, mix(0.5, 0.85, uVacuum), rNorm + n * 0.05);
          float edge = 1.0 - smoothstep(0.5, 1.05, rNorm);
          float dens = axis * (0.62 + edge * 0.5);

          // Fade along length: bright near nozzle, wispy tip
          dens *= exp(-fromNozzle * mix(1.35, 0.75, uVacuum));
          dens *= smoothstep(1.05, 0.12, fromNozzle);
          dens *= 0.88 + n * 0.12 + n2 * 0.06;
          dens *= mix(0.9, 1.05, uCore);
          // No temporal sin flicker — that read as a mid-screen flash

          float alpha = dens * uIntensity;
          if (alpha < 0.02) discard;

          // Warm methalox — stay orange/amber (reads on green terrain; blue washes out)
          // Cap vacuum core brightness so additive plumes don't pop white holes
          float hot = (1.0 - fromNozzle) * axis;
          vec3 colCore = mix(vec3(1.0, 0.92, 0.72), vec3(0.75, 0.82, 0.95), uVacuum * 0.7);
          vec3 colHot = vec3(1.0, 0.65, 0.2);
          vec3 colBody = vec3(0.98, 0.36, 0.06);
          vec3 colTip = mix(vec3(1.0, 0.42, 0.1), vec3(0.5, 0.62, 0.9), uVacuum * 0.55);

          vec3 col = mix(colBody, colHot, hot * 0.85);
          col = mix(col, colCore, hot * hot * 0.55 * (0.5 + uCore * 0.4));
          col = mix(col, colTip, fromNozzle * (0.3 + n * 0.15) * (1.0 - axis * 0.3));
          // Soft ceiling so bloom never hard-trips mid frame
          col = min(col, vec3(1.15, 1.0, 0.9));

          gl_FragColor = vec4(col, clamp(alpha * mix(0.85, 0.38, fromNozzle), 0.0, 0.82));
        }
      `,
    });
  }

  // =========================================================================
  // 1) Main plume — open cones, fixed physical length
  // =========================================================================
  const plumeGroup = new THREE.Group();
  plumeGroup.name = 'MainPlume';
  plumeGroup.visible = false;
  group.add(plumeGroup);

  // openEnded = true → no base disc (that pancake from above)
  const unitCone = new THREE.ConeGeometry(1, 1, 28, 1, true);

  function makePlumeCone(mat) {
    const mesh = new THREE.Mesh(unitCone, mat);
    mesh.rotation.x = Math.PI;
    mesh.frustumCulled = false;
    mesh.renderOrder = 50; // after terrain / pad steel
    plumeGroup.add(mesh);
    return mesh;
  }

  const coreMat = makeJetMaterial({ coreBias: 1.0 });
  const midMat = makeJetMaterial({ coreBias: 0.5 });
  const sheathMat = makeJetMaterial({ coreBias: 0.15 });
  const shipCoreMat = makeJetMaterial({ coreBias: 0.9 });
  const shipSheathMat = makeJetMaterial({ coreBias: 0.2 });

  const coreJet = makePlumeCone(coreMat);
  const midJet = makePlumeCone(midMat);
  const sheathJet = makePlumeCone(sheathMat);
  const shipCoreJet = makePlumeCone(shipCoreMat);
  const shipSheathJet = makePlumeCone(shipSheathMat);

  // Fewer sub-jets — subtle cluster, not 10 fat cones
  const RING = 6;
  const ringMeshes = [];
  const ringGeo = new THREE.ConeGeometry(1, 1, 14, 1, true);
  for (let i = 0; i < RING; i++) {
    const mat = makeJetMaterial({ coreBias: 0.55 });
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = Math.PI;
    m.frustumCulled = false;
    m.renderOrder = 51;
    m.visible = false;
    plumeGroup.add(m);
    ringMeshes.push(m);
  }

  // =========================================================================
  // 2) Flame trench (pad only)
  // =========================================================================
  const trenchGroup = new THREE.Group();
  trenchGroup.name = 'FlameTrench';
  trenchGroup.visible = false;
  group.add(trenchGroup);

  const trenchVert = /* glsl */ `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const trenchFrag = /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    varying vec3 vPos;
    ${NOISE_GLSL}
    void main() {
      float along = vPos.x + 0.5;
      float across = abs(vPos.z) * 2.0;
      float up = vPos.y + 0.5;
      float t = uTime;
      float n = fbm(vec2(along * 6.5 - t * 8.0, across * 3.5 + up * 2.0));
      float n2 = fbm(vec2(along * 13.0 - t * 14.0, up * 5.5));
      float center = 1.0 - smoothstep(0.12, 0.98, across);
      float heightFade = 1.0 - smoothstep(0.28, 1.0, up);
      float near = 1.0 - smoothstep(0.0, 0.7, along);
      float farFade = 1.0 - smoothstep(0.6, 1.0, along);
      float dens = center * heightFade * (0.55 + n * 0.5) * (0.65 + n2 * 0.35);
      dens *= mix(0.55, 1.2, near) * farFade;
      dens *= 0.9 + 0.1 * sin(t * 16.0 + along * 10.0);
      float alpha = dens * uIntensity;
      if (alpha < 0.04) discard;
      vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.7, 0.25), center * near * (0.4 + n2 * 0.4));
      col = mix(col, vec3(0.9, 0.4, 0.08), along * 0.4);
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
    }
  `;

  function makeTrenchMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
      vertexShader: trenchVert,
      fragmentShader: trenchFrag,
    });
  }

  const trenchMats = [];
  const trenchBoxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addTrenchArm(dirX, length, height, width) {
    const mat = makeTrenchMaterial();
    const mesh = new THREE.Mesh(trenchBoxGeo, mat);
    mesh.scale.set(length, height, width);
    mesh.position.set(dirX * (length * 0.5 + 2), height * 0.4, 0);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    trenchGroup.add(mesh);
    trenchMats.push(mat);
  }
  addTrenchArm(1, 85, 14, 16);
  addTrenchArm(-1, 85, 14, 16);

  function addTrenchZ(dirZ, length, height, width) {
    const mat = makeTrenchMaterial();
    const mesh = new THREE.Mesh(trenchBoxGeo, mat);
    mesh.scale.set(width, height, length);
    mesh.position.set(0, height * 0.38, dirZ * (length * 0.5 + 2));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    trenchGroup.add(mesh);
    trenchMats.push(mat);
  }
  addTrenchZ(1, 44, 12, 14);
  addTrenchZ(-1, 44, 12, 14);

  const underMat = makeTrenchMaterial();
  const underFire = new THREE.Mesh(trenchBoxGeo, underMat);
  underFire.scale.set(18, 18, 18);
  underFire.position.set(0, 9, 0);
  underFire.frustumCulled = false;
  underFire.renderOrder = 2;
  trenchGroup.add(underFire);
  trenchMats.push(underMat);

  // =========================================================================
  // 3) Ground fire (pad only, low altitude)
  // =========================================================================
  const groundGroup = new THREE.Group();
  groundGroup.name = 'GroundFire';
  groundGroup.visible = false;
  group.add(groundGroup);

  const groundFireMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float t = uTime;
        float n = fbm(p * 3.2 + vec2(0.0, -t * 2.5));
        float core = smoothstep(0.48, 0.0, r);
        float mid = smoothstep(0.95, 0.25, r) * (0.5 + n * 0.6);
        float dens = max(core, mid) * uIntensity;
        if (dens < 0.05) discard;
        vec3 col = mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.55, 0.12), core + n * 0.25);
        gl_FragColor = vec4(col, clamp(dens * 0.85, 0.0, 0.88));
      }
    `,
  });
  const groundFire = new THREE.Mesh(new THREE.CircleGeometry(1, 48), groundFireMat);
  groundFire.rotation.x = -Math.PI / 2;
  groundFire.position.y = 0.5;
  groundFire.scale.setScalar(36);
  groundFire.frustumCulled = false;
  groundGroup.add(groundFire);

  const dustMat = new THREE.MeshBasicMaterial({
    color: 0x6a6460,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const dustRing = new THREE.Mesh(new THREE.TorusGeometry(20, 5, 8, 32), dustMat);
  dustRing.rotation.x = Math.PI / 2;
  dustRing.position.y = 2.5;
  dustRing.frustumCulled = false;
  groundGroup.add(dustRing);

  // =========================================================================
  // 4) Short downward filaments (NOT radial starburst)
  // =========================================================================
  const STREAK = 600;
  const streakLife = new Float32Array(STREAK);
  const streakMax = new Float32Array(STREAK);
  const streakPos = new Float32Array(STREAK * 3);
  const streakVel = new Float32Array(STREAK * 3);
  const streakKind = new Float32Array(STREAK);
  for (let i = 0; i < STREAK; i++) {
    streakLife[i] = -1;
    streakPos[i * 3 + 1] = -999;
  }

  const streakGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const streakMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Must depth-test: without it, additive filaments paint over the hull as
    // bright vertical stripes whenever a plane half-extends into the stack.
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aInstColor;
      attribute float aInstLife;
      attribute float aInstSeed;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLife;
      varying float vSeed;
      void main() {
        vUv = uv;
        vColor = aInstColor;
        vLife = aInstLife;
        vSeed = aInstSeed;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLife;
      varying float vSeed;
      ${NOISE_GLSL}
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;
        float along = vUv.y;
        float n = noise(vec2(across * 3.0 + vSeed, along * 5.0 - vLife * 2.5));
        float halfW = mix(0.15, 0.7, along) * (0.7 + n * 0.35);
        float edge = 1.0 - smoothstep(0.5, 1.0, across / max(0.08, halfW));
        float core = 1.0 - smoothstep(0.0, 0.4, across / max(0.08, halfW));
        float head = smoothstep(0.0, 0.1, along) * smoothstep(1.0, 0.55, along);
        float dens = edge * (0.25 + core * 0.8) * head * pow(clamp(vLife, 0.0, 1.0), 0.7);
        float alpha = dens * 0.75;
        if (alpha < 0.03) discard;
        vec3 col = mix(vColor * 0.6, vColor * 1.15, core);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
      }
    `,
  });

  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAK);
  streaks.frustumCulled = false;
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaks.name = 'ExhaustStreaks';
  streaks.renderOrder = 52;
  group.add(streaks);

  const instColor = new Float32Array(STREAK * 3);
  const instLife = new Float32Array(STREAK);
  const instSeed = new Float32Array(STREAK);
  for (let i = 0; i < STREAK; i++) {
    instSeed[i] = Math.random() * 100;
    instLife[i] = 0;
    instColor[i * 3] = 1;
    instColor[i * 3 + 1] = 0.6;
    instColor[i * 3 + 2] = 0.25;
  }
  const attrColor = new THREE.InstancedBufferAttribute(instColor, 3);
  const attrLife = new THREE.InstancedBufferAttribute(instLife, 1);
  const attrSeed = new THREE.InstancedBufferAttribute(instSeed, 1);
  attrColor.setUsage(THREE.DynamicDrawUsage);
  attrLife.setUsage(THREE.DynamicDrawUsage);
  streakGeo.setAttribute('aInstColor', attrColor);
  streakGeo.setAttribute('aInstLife', attrLife);
  streakGeo.setAttribute('aInstSeed', attrSeed);

  const _mat = new THREE.Matrix4();
  const _hideMat = new THREE.Matrix4().makeScale(0, 0, 0);
  _hideMat.setPosition(0, -9999, 0);
  let streakCursor = 0;

  function hideStreak(i) {
    streakLife[i] = -1;
    instLife[i] = 0;
    streaks.setMatrixAt(i, _hideMat);
  }
  for (let i = 0; i < STREAK; i++) hideStreak(i);
  streaks.instanceMatrix.needsUpdate = true;

  function spawnStreak(stage, role = 'jet') {
    for (let k = 0; k < 20; k++) {
      const i = (streakCursor + k) % STREAK;
      if (streakLife[i] >= 0) continue;
      streakCursor = (i + 1) % STREAK;

      const isShip = stage === 'ship';
      const ox = isShip ? shipOrigin.x : emitOrigin.x;
      const oy = isShip ? shipOrigin.y : emitOrigin.y;
      const oz = isShip ? shipOrigin.z : emitOrigin.z;

      if (role === 'splash') {
        if (!nearPad) return;
        const ang = Math.random() * Math.PI * 2;
        const spd = 14 + Math.random() * 28;
        streakPos[i * 3] = ox + (Math.random() - 0.5) * 4;
        streakPos[i * 3 + 1] = 0.5 + Math.random() * 1.2;
        streakPos[i * 3 + 2] = oz + (Math.random() - 0.5) * 4;
        streakVel[i * 3] = Math.cos(ang) * spd;
        streakVel[i * 3 + 1] = 3 + Math.random() * 8;
        streakVel[i * 3 + 2] = Math.sin(ang) * spd;
        streakMax[i] = 0.22 + Math.random() * 0.3;
        streakLife[i] = streakMax[i];
        streakKind[i] = 2;
        instColor[i * 3] = 1.0;
        instColor[i * 3 + 1] = 0.45 + Math.random() * 0.25;
        instColor[i * 3 + 2] = 0.08;
        instLife[i] = 1;
        return;
      }

      // Emit from engine ring — mostly DOWN, slight cone splay only
      const clusterR = isShip ? 1.4 : 3.2;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * clusterR;
      streakPos[i * 3] = ox + Math.cos(ang) * rad;
      streakPos[i * 3 + 1] = oy - Math.random() * 0.6;
      streakPos[i * 3 + 2] = oz + Math.sin(ang) * rad;

      const th = isShip ? shipThrust : boosterThrust;
      // Physical exhaust speed (m/s visual) — short life keeps length modest
      const down = isShip ? -(38 + Math.random() * 28) : -(48 + Math.random() * 36);
      // Small splay (~8–12° half-angle), NOT horizontal starburst
      const splay = (role === 'sheath' ? 6.5 : 3.2) * (rad / Math.max(0.4, clusterR));
      streakVel[i * 3] = Math.cos(ang) * splay + (Math.random() - 0.5) * 2.5;
      streakVel[i * 3 + 1] = down * (0.85 + th * 0.25);
      streakVel[i * 3 + 2] = Math.sin(ang) * splay + (Math.random() - 0.5) * 2.5;

      streakMax[i] = role === 'sheath' ? 0.35 + Math.random() * 0.35 : 0.2 + Math.random() * 0.22;
      streakLife[i] = streakMax[i];
      streakKind[i] = isShip ? 1 : 0;

      if (role === 'core') {
        instColor[i * 3] = 1.0;
        instColor[i * 3 + 1] = 0.88 + Math.random() * 0.1;
        instColor[i * 3 + 2] = 0.65 + Math.random() * 0.2;
      } else {
        instColor[i * 3] = 1.0;
        instColor[i * 3 + 1] = 0.5 + Math.random() * 0.28;
        instColor[i * 3 + 2] = 0.12 + Math.random() * 0.12;
      }
      instLife[i] = 1;
      return;
    }
  }

  function updateStreakMatrix(i) {
    const px = streakPos[i * 3];
    const py = streakPos[i * 3 + 1];
    const pz = streakPos[i * 3 + 2];
    const vx = streakVel[i * 3];
    const vy = streakVel[i * 3 + 1];
    const vz = streakVel[i * 3 + 2];
    const spd = Math.hypot(vx, vy, vz) + 0.001;
    const lf = Math.max(0.05, streakLife[i] / streakMax[i]);
    const isSplash = streakKind[i] === 2;

    // Short filaments — never multi-hundred-metre rays
    const len = isSplash
      ? 2.5 + spd * 0.06 * lf
      : Math.min(5.5, (streakKind[i] === 1 ? 2.4 : 3.2) + spd * 0.04 * lf);
    const wid = isSplash ? 0.9 + (1 - lf) * 1.8 : 0.28 + (1 - lf) * 0.85;

    const yx = vx / spd;
    const yy = vy / spd;
    const yz = vz / spd;
    let xx;
    let xy;
    let xz;
    if (Math.abs(yy) < 0.92) {
      xx = yz;
      xy = 0;
      xz = -yx;
    } else {
      xx = 0;
      xy = -yz;
      xz = yy;
    }
    const xLen = Math.hypot(xx, xy, xz) || 1;
    xx /= xLen;
    xy /= xLen;
    xz /= xLen;
    const zx = xy * yz - xz * yy;
    const zy = xz * yx - xx * yz;
    const zz = xx * yy - xy * yx;

    // PlaneGeometry is ±0.5 along local Y. Shift the center half a length
    // along velocity so the filament only fills the plume side of the particle
    // (not the opposite half, which would stab up into the rocket body).
    const half = len * 0.5;
    const cx = px + yx * half;
    const cy = py + yy * half;
    const cz = pz + yz * half;

    const e = _mat.elements;
    e[0] = xx * wid;
    e[1] = xy * wid;
    e[2] = xz * wid;
    e[3] = 0;
    e[4] = yx * len;
    e[5] = yy * len;
    e[6] = yz * len;
    e[7] = 0;
    e[8] = zx;
    e[9] = zy;
    e[10] = zz;
    e[11] = 0;
    e[12] = cx;
    e[13] = cy;
    e[14] = cz;
    e[15] = 1;
    streaks.setMatrixAt(i, _mat);
  }

  // =========================================================================
  // 5) Smoke + steam (pad)
  // =========================================================================
  const SMOKE = 400;
  const sPos = new Float32Array(SMOKE * 3);
  const sVel = new Float32Array(SMOKE * 3);
  const sLife = new Float32Array(SMOKE);
  const sMax = new Float32Array(SMOKE);
  const sSize = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) {
    sLife[i] = -1;
    sPos[i * 3 + 1] = -999;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  const sMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uPixelRatio: {
        value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
      },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uPixelRatio;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (150.0 / max(0.05, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float e = smoothstep(0.5, 0.15, d);
        gl_FragColor = vec4(0.4, 0.38, 0.36, e * 0.35);
      }
    `,
  });
  const smoke = new THREE.Points(sGeo, sMat);
  smoke.frustumCulled = false;
  group.add(smoke);
  let sCursor = 0;

  function spawnSmoke() {
    for (let k = 0; k < 12; k++) {
      const i = (sCursor + k) % SMOKE;
      if (sLife[i] >= 0) continue;
      sCursor = (i + 1) % SMOKE;
      const ang = Math.random() * Math.PI * 2;
      const rad = 5 + Math.random() * 18;
      sPos[i * 3] = emitOrigin.x + Math.cos(ang) * rad;
      sPos[i * 3 + 1] = 0.5 + Math.random() * 2.5;
      sPos[i * 3 + 2] = emitOrigin.z + Math.sin(ang) * rad;
      const out = 2 + Math.random() * 7;
      sVel[i * 3] = Math.cos(ang) * out;
      sVel[i * 3 + 1] = 1.5 + Math.random() * 4;
      sVel[i * 3 + 2] = Math.sin(ang) * out;
      sMax[i] = 2 + Math.random() * 3;
      sLife[i] = sMax[i];
      sSize[i] = 10 + Math.random() * 18;
      return;
    }
  }

  const STEAM = 320;
  const stPos = new Float32Array(STEAM * 3);
  const stVel = new Float32Array(STEAM * 3);
  const stLife = new Float32Array(STEAM);
  const stMax = new Float32Array(STEAM);
  const stSize = new Float32Array(STEAM);
  const stAlpha = new Float32Array(STEAM);
  for (let i = 0; i < STEAM; i++) {
    stLife[i] = -1;
    stPos[i * 3 + 1] = -999;
  }
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
  stGeo.setAttribute('aSize', new THREE.BufferAttribute(stSize, 1));
  stGeo.setAttribute('aAlpha', new THREE.BufferAttribute(stAlpha, 1));
  const stMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uPixelRatio: {
        value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
      },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      uniform float uPixelRatio;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (160.0 / max(0.05, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.08, d);
        gl_FragColor = vec4(0.9, 0.92, 0.95, soft * vAlpha);
      }
    `,
  });
  const steam = new THREE.Points(stGeo, stMat);
  steam.frustumCulled = false;
  steam.name = 'SteamParticles';
  group.add(steam);
  let stCursor = 0;

  function spawnSteam() {
    for (let k = 0; k < 20; k++) {
      const i = (stCursor + k) % STEAM;
      if (stLife[i] >= 0) continue;
      stCursor = (i + 1) % STEAM;
      const ang = Math.random() * Math.PI * 2;
      // Deluge fans out from under OLM and along trench
      const rad = 2 + Math.random() * 22;
      stPos[i * 3] = emitOrigin.x + Math.cos(ang) * rad;
      stPos[i * 3 + 1] = 0.3 + Math.random() * 5;
      stPos[i * 3 + 2] = emitOrigin.z + Math.sin(ang) * rad;
      const out = 5 + Math.random() * 12;
      stVel[i * 3] = Math.cos(ang) * out;
      stVel[i * 3 + 1] = 3 + Math.random() * 6;
      stVel[i * 3 + 2] = Math.sin(ang) * out;
      stMax[i] = 3.2 + Math.random() * 2.8;
      stLife[i] = stMax[i];
      stSize[i] = 18 + Math.random() * 36;
      stAlpha[i] = 0.4 + Math.random() * 0.25;
      return;
    }
  }

  // =========================================================================
  // Shockwave + light
  // =========================================================================
  const shockMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uProgress: { value: 1 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float edge = abs(vUv.y - 0.5) * 2.0;
        float ring = smoothstep(1.0, 0.12, edge);
        float alpha = ring * uOpacity * (1.0 - uProgress);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.95, 0.9, 0.75), vec3(1.0, 0.75, 0.4), 1.0 - uProgress), alpha);
      }
    `,
  });
  const shockwaveRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), shockMat);
  shockwaveRing.rotation.x = -Math.PI / 2;
  shockwaveRing.position.y = 1.5;
  shockwaveRing.visible = false;
  shockwaveRing.name = 'ShockwaveRing';
  group.add(shockwaveRing);

  let shockAge = -1;
  const SHOCK_DURATION = 1.4;
  const SHOCK_R0 = 6;
  const SHOCK_R1 = 220;

  const padLight = new THREE.PointLight(0xff7a28, 0, 160, 1.5);
  padLight.position.set(0, 5, 0);
  padLight.visible = false;
  padLight.name = 'PadFlameLight';
  group.add(padLight);

  // Secondary fill under OLM deck — lights stilts / tower from below
  const padLight2 = new THREE.PointLight(0xff9030, 0, 90, 1.8);
  padLight2.position.set(0, 12, 0);
  padLight2.visible = false;
  padLight2.name = 'PadFlameLight2';
  group.add(padLight2);

  // =========================================================================
  // State
  // =========================================================================
  let boosterThrust = 0;
  let shipThrust = 0;
  let emitOrigin = new THREE.Vector3(0, 1, 0);
  let shipOrigin = new THREE.Vector3(0, 1, 0);
  let nearPad = true;
  let steamRate = 0;
  let streakAccum = 0;
  let smokeAccum = 0;
  let steamAccum = 0;
  let splashAccum = 0;
  let vacuumFactor = 0;

  const jetMats = [
    coreMat,
    midMat,
    sheathMat,
    shipCoreMat,
    shipSheathMat,
    ...ringMeshes.map((m) => m.material),
  ];

  function placeJet(mesh, x, y, z, radius, length, intensity, vacuum) {
    if (!mesh) return;
    const show = intensity > 0.04 && length > 0.5;
    mesh.visible = show;
    if (!show) {
      if (mesh.material?.uniforms) mesh.material.uniforms.uIntensity.value = 0;
      return;
    }
    mesh.position.set(x, y - length * 0.5, z);
    mesh.scale.set(radius, length, radius);
    mesh.rotation.set(Math.PI, 0, 0);
    if (mesh.material?.uniforms) {
      mesh.material.uniforms.uIntensity.value = intensity;
      mesh.material.uniforms.uVacuum.value = vacuum;
      // Always off — ground plane must never occlude the jet column
      mesh.material.depthTest = false;
    }
  }

  function updatePlumes() {
    const vac = vacuumFactor;
    // Vacuum: additive jets sit on the chase-cam crosshair and strobe as a
    // bright mid-screen patch. Kill them entirely past hard vacuum.
    if (vac > 0.88) {
      plumeGroup.visible = false;
      for (const m of jetMats) {
        if (m?.uniforms) m.uniforms.uIntensity.value = 0;
      }
      for (const m of ringMeshes) m.visible = false;
      coreJet.visible = midJet.visible = sheathJet.visible = false;
      shipCoreJet.visible = shipSheathJet.visible = false;
      return;
    }
    // Fade thrust contribution as air thins so the plume softens before cut
    const vacFade = 1 - THREE.MathUtils.smoothstep(vac, 0.45, 0.88);
    const bTh = boosterThrust * vacFade;
    const sTh = shipThrust * vacFade;
    const any = bTh > 0.03 || sTh > 0.03;
    plumeGroup.visible = any;
    if (!any) {
      for (const m of jetMats) {
        if (m?.uniforms) m.uniforms.uIntensity.value = 0;
      }
      for (const m of ringMeshes) m.visible = false;
      coreJet.visible = midJet.visible = sheathJet.visible = false;
      shipCoreJet.visible = shipSheathJet.visible = false;
      return;
    }

    // PHYSICAL plume length (metres) — never scale with altitude (km-long cones look fake).
    let bLen = (24 + bTh * 26) * (1 + vac * 0.55); // ~24–50 m
    // Near pad: bridge engines → trench so the dump flame reads as one system
    if (nearPad && emitOrigin.y < 36) {
      bLen = Math.max(bLen, Math.min(emitOrigin.y + 10, 42));
    }
    const bR = (1.9 + bTh * 1.5) * (1 + vac * 0.35);

    // Slightly brighter when off-pad so orange reads on green scrub from chase cam
    // Cap intensity — vacuum blue-white cores were flash-blooming the center frame
    const airBoost = nearPad ? 1 : 1.05;
    placeJet(
      coreJet,
      emitOrigin.x,
      emitOrigin.y,
      emitOrigin.z,
      bR * 0.42,
      bLen * 0.9,
      Math.min(1.05, bTh * 1.1 * airBoost),
      vac
    );
    placeJet(
      midJet,
      emitOrigin.x,
      emitOrigin.y,
      emitOrigin.z,
      bR * 0.82,
      bLen,
      Math.min(0.95, bTh * 0.9 * airBoost),
      vac
    );
    placeJet(
      sheathJet,
      emitOrigin.x,
      emitOrigin.y,
      emitOrigin.z,
      bR * 1.28,
      bLen * 1.1,
      Math.min(0.75, bTh * 0.55 * airBoost),
      Math.min(1, vac + 0.15)
    );

    // Multi-engine filaments around the main column
    const ringR = 2.5 + bTh * 0.55;
    const ringLen = bLen * 0.68;
    const ringRad = 0.38 + bTh * 0.28;
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2 + 0.08;
      const jitter = 0.9 + (i % 3) * 0.05;
      placeJet(
        ringMeshes[i],
        emitOrigin.x + Math.cos(a) * ringR,
        emitOrigin.y,
        emitOrigin.z + Math.sin(a) * ringR,
        ringRad * jitter,
        ringLen * jitter,
        bTh * 0.7,
        vac
      );
      // Tiny splay only
      if (ringMeshes[i].visible) {
        ringMeshes[i].rotation.z = Math.cos(a) * 0.05 * bTh;
        ringMeshes[i].rotation.x = Math.PI + Math.sin(a) * 0.05 * bTh;
      }
    }

    const shipLen = (8 + sTh * 12) * (1 + vac * 0.4);
    const shipR = 0.7 + sTh * 0.7 + vac * 0.2;
    placeJet(
      shipCoreJet,
      shipOrigin.x,
      shipOrigin.y,
      shipOrigin.z,
      shipR * 0.4,
      shipLen * 0.85,
      Math.min(0.85, sTh * 0.75),
      vac
    );
    placeJet(
      shipSheathJet,
      shipOrigin.x,
      shipOrigin.y,
      shipOrigin.z,
      shipR,
      shipLen,
      Math.min(0.55, sTh * 0.4),
      Math.min(1, vac + 0.12)
    );
  }

  function updateGround() {
    const padI = Math.max(boosterThrust, shipThrust * 0.35);
    const show = padI > 0.05 && emitOrigin.y < 55 && nearPad;
    groundGroup.visible = show;
    if (!show) {
      groundFireMat.uniforms.uIntensity.value = 0;
      dustMat.opacity = 0;
      return;
    }
    groundFire.position.set(emitOrigin.x, 0.5, emitOrigin.z);
    groundFire.scale.setScalar(34 + padI * 30);
    const gFade = THREE.MathUtils.clamp(1 - (emitOrigin.y - 10) / 50, 0, 1);
    groundFireMat.uniforms.uIntensity.value = padI * 0.95 * gFade;
    dustRing.position.set(emitOrigin.x, 2.4 + padI * 1.5, emitOrigin.z);
    const dustS = 0.85 + padI * 0.95;
    dustRing.scale.set(dustS, dustS, dustS);
    dustMat.opacity = padI * 0.4 * gFade;
  }

  function updateLayout() {
    updatePlumes();
    updateGround();
  }

  function triggerShockwave(x = 0, z = 0) {
    shockAge = 0;
    shockwaveRing.position.set(x, 1.5, z);
    shockwaveRing.scale.setScalar(SHOCK_R0);
    shockwaveRing.visible = true;
    shockMat.uniforms.uProgress.value = 0;
    shockMat.uniforms.uOpacity.value = 0.55;
  }

  return {
    group,
    points: streaks,
    flame: trenchGroup,
    column: coreJet,
    sheath: sheathJet,
    steam,
    shockwaveRing,
    padLight,
    triggerShockwave,

    setThrust({ booster = 0, ship = 0 } = {}) {
      boosterThrust = THREE.MathUtils.clamp(booster, 0, 1);
      shipThrust = THREE.MathUtils.clamp(ship, 0, 1);

      const padI = Math.max(boosterThrust, shipThrust * 0.35);
      trenchGroup.visible = nearPad && padI > 0.04 && emitOrigin.y < 80;
      for (const mat of trenchMats) {
        const hFade = THREE.MathUtils.clamp(1 - (emitOrigin.y - 6) / 65, 0, 1);
        mat.uniforms.uIntensity.value =
          trenchGroup.visible ? Math.min(1.25, padI * 1.45 * hFade) : 0;
      }

      // Water deluge / steam — thick near pad (Starship signature look)
      if (nearPad && padI > 0.02 && emitOrigin.y < 75) {
        const heightFade = THREE.MathUtils.clamp(1 - (emitOrigin.y - 4) / 65, 0, 1);
        steamRate = padI * 140 * heightFade;
      } else {
        steamRate = 0;
      }

      // Warm pad fill — enough to orange-tint stilts, not white-out the frame
      // Steady intensity only (no sin flicker — that strobed mid-frame when
      // chase cam still saw the light at moderate altitude).
      const lightBase = Math.max(boosterThrust, shipThrust * 0.25);
      if (lightBase > 0.02 && emitOrigin.y < 120 && nearPad) {
        padLight.visible = true;
        padLight2.visible = true;
        const altFade = THREE.MathUtils.clamp(1 - emitOrigin.y / 120, 0.1, 1);
        padLight.intensity = lightBase * 1.6 * altFade;
        padLight.distance = 110;
        padLight.decay = 1.7;
        padLight.color.setRGB(1.0, 0.42, 0.1);
        padLight2.intensity = lightBase * 0.8 * altFade;
        padLight2.distance = 70;
        padLight2.color.setRGB(1.0, 0.5, 0.15);
      } else {
        padLight.visible = false;
        padLight.intensity = 0;
        padLight2.visible = false;
        padLight2.intensity = 0;
      }

      updateLayout();
    },

    setOrigins(boosterWorldY, shipWorldY, boosterXZ, shipXZ) {
      const bx = boosterXZ?.x ?? 0;
      const bz = boosterXZ?.z ?? 0;
      const sx = shipXZ?.x ?? 0;
      const sz = shipXZ?.z ?? 0;
      emitOrigin.set(bx, boosterWorldY, bz);
      shipOrigin.set(sx, shipWorldY, sz);
      nearPad = boosterWorldY < 85 && Math.hypot(bx, bz) < 60;

      trenchGroup.position.set(bx, 0, bz);

      const lightY = nearPad
        ? Math.min(10, Math.max(3, boosterWorldY * 0.15 + 3))
        : Math.min(boosterWorldY * 0.25, 40);
      padLight.position.set(bx, lightY, bz);
      padLight2.position.set(bx, Math.min(boosterWorldY * 0.35 + 4, 18), bz);

      updateLayout();
    },

    setAltitude(altM = 0) {
      vacuumFactor = THREE.MathUtils.smoothstep(altM, 25000, 100000);
      updateLayout();
    },

    update(dt, t) {
      for (const m of jetMats) {
        if (m?.uniforms?.uTime) m.uniforms.uTime.value = t;
      }
      for (const mat of trenchMats) mat.uniforms.uTime.value = t;
      groundFireMat.uniforms.uTime.value = t;
      streakMat.uniforms.uTime.value = t;

      // Filaments denser on pad; none in vacuum (center-frame sparkle flashes)
      const altMul =
        vacuumFactor > 0.85
          ? 0
          : nearPad
            ? 1
            : THREE.MathUtils.clamp(1 - (emitOrigin.y - 30) / 280, 0.08, 1) *
              (1 - vacuumFactor * 0.95);
      const emitRate = (boosterThrust * 110 + shipThrust * 35) * altMul;
      streakAccum += emitRate * dt;
      let nSpawn = Math.min(28, Math.floor(streakAccum));
      streakAccum -= nSpawn;
      for (let n = 0; n < nSpawn; n++) {
        if (boosterThrust > 0.02) {
          spawnStreak('booster', n % 4 === 0 ? 'core' : 'sheath');
        }
        if (shipThrust > 0.02 && n % 4 === 0) {
          spawnStreak('ship', n % 3 === 0 ? 'core' : 'sheath');
        }
      }

      if (nearPad && boosterThrust > 0.15 && emitOrigin.y < 35) {
        splashAccum += boosterThrust * 70 * dt;
        let sn = Math.min(24, Math.floor(splashAccum));
        splashAccum -= sn;
        for (let n = 0; n < sn; n++) spawnStreak('booster', 'splash');
      }

      if (boosterThrust > 0.1 && emitOrigin.y < 50 && nearPad) {
        smokeAccum += boosterThrust * 55 * dt;
        let sn = Math.min(18, Math.floor(smokeAccum));
        smokeAccum -= sn;
        for (let n = 0; n < sn; n++) spawnSmoke();
      }

      if (steamRate > 0.5) {
        steamAccum += steamRate * dt;
        let sn = Math.min(40, Math.floor(steamAccum));
        steamAccum -= sn;
        for (let n = 0; n < sn; n++) spawnSteam();
      }

      if (shockAge >= 0) {
        shockAge += dt;
        const p = Math.min(1, shockAge / SHOCK_DURATION);
        const eased = 1 - (1 - p) * (1 - p);
        shockwaveRing.scale.setScalar(THREE.MathUtils.lerp(SHOCK_R0, SHOCK_R1, eased));
        shockMat.uniforms.uProgress.value = p;
        shockMat.uniforms.uOpacity.value = 0.55 * (1 - p);
        if (p >= 1) {
          shockAge = -1;
          shockwaveRing.visible = false;
        }
      }

      let liveStreaks = 0;
      for (let i = 0; i < STREAK; i++) {
        if (streakLife[i] < 0) continue;
        liveStreaks++;
        streakLife[i] -= dt;
        if (streakLife[i] <= 0) {
          hideStreak(i);
          continue;
        }
        const lf = streakLife[i] / streakMax[i];
        instLife[i] = lf;

        streakPos[i * 3] += streakVel[i * 3] * dt;
        streakPos[i * 3 + 1] += streakVel[i * 3 + 1] * dt;
        streakPos[i * 3 + 2] += streakVel[i * 3 + 2] * dt;

        // Keep jets coherent — light drag, almost no sideways chaos
        streakVel[i * 3] *= 0.99;
        streakVel[i * 3 + 2] *= 0.99;
        streakVel[i * 3 + 1] *= streakKind[i] === 2 ? 0.97 : 0.995;
        if (streakKind[i] === 2) streakVel[i * 3 + 1] += -4 * dt;

        // Kill streaks that have travelled far past plume length (no endless rays)
        const dy = emitOrigin.y - streakPos[i * 3 + 1];
        if (streakKind[i] !== 2 && dy > 55) {
          hideStreak(i);
          continue;
        }

        if (streakPos[i * 3 + 1] < 0.2 && streakVel[i * 3 + 1] < 0) {
          if (nearPad && streakKind[i] !== 2 && emitOrigin.y < 35) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 10 + Math.random() * 18;
            streakVel[i * 3] = Math.cos(ang) * spd;
            streakVel[i * 3 + 1] = 2 + Math.random() * 6;
            streakVel[i * 3 + 2] = Math.sin(ang) * spd;
            streakPos[i * 3 + 1] = 0.25;
            streakKind[i] = 2;
            streakLife[i] *= 0.4;
            instColor[i * 3] = 1.0;
            instColor[i * 3 + 1] = 0.48;
            instColor[i * 3 + 2] = 0.1;
          } else {
            hideStreak(i);
            continue;
          }
        }

        updateStreakMatrix(i);
      }
      if (liveStreaks > 0 || nSpawn > 0) {
        streaks.instanceMatrix.needsUpdate = true;
        attrColor.needsUpdate = true;
        attrLife.needsUpdate = true;
      }

      let liveSmoke = 0;
      for (let i = 0; i < SMOKE; i++) {
        if (sLife[i] < 0) continue;
        liveSmoke++;
        sLife[i] -= dt;
        if (sLife[i] <= 0) {
          sLife[i] = -1;
          sPos[i * 3 + 1] = -999;
          continue;
        }
        sPos[i * 3] += sVel[i * 3] * dt;
        sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
        sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
        sVel[i * 3] *= 0.993;
        sVel[i * 3 + 2] *= 0.993;
        sSize[i] += dt * 5;
      }
      if (liveSmoke > 0) {
        sGeo.attributes.position.needsUpdate = true;
        sGeo.attributes.aSize.needsUpdate = true;
      }

      let liveSteam = 0;
      for (let i = 0; i < STEAM; i++) {
        if (stLife[i] < 0) continue;
        liveSteam++;
        stLife[i] -= dt;
        if (stLife[i] <= 0) {
          stLife[i] = -1;
          stPos[i * 3 + 1] = -999;
          stAlpha[i] = 0;
          continue;
        }
        stPos[i * 3] += stVel[i * 3] * dt;
        stPos[i * 3 + 1] += stVel[i * 3 + 1] * dt;
        stPos[i * 3 + 2] += stVel[i * 3 + 2] * dt;
        stVel[i * 3] *= 0.99;
        stVel[i * 3 + 2] *= 0.99;
        stSize[i] += dt * 7;
        const age = 1 - stLife[i] / stMax[i];
        const env = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88;
        stAlpha[i] = Math.max(0, env * 0.58);
      }
      if (liveSteam > 0) {
        stGeo.attributes.position.needsUpdate = true;
        stGeo.attributes.aSize.needsUpdate = true;
        stGeo.attributes.aAlpha.needsUpdate = true;
      }
    },

    setPixelRatio(pr) {
      sMat.uniforms.uPixelRatio.value = pr;
      stMat.uniforms.uPixelRatio.value = pr;
    },

    reset() {
      for (let i = 0; i < STREAK; i++) hideStreak(i);
      streaks.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < SMOKE; i++) {
        sLife[i] = -1;
        sPos[i * 3 + 1] = -999;
      }
      for (let i = 0; i < STEAM; i++) {
        stLife[i] = -1;
        stPos[i * 3 + 1] = -999;
        stAlpha[i] = 0;
      }
      shockAge = -1;
      shockwaveRing.visible = false;
      padLight.visible = false;
      padLight.intensity = 0;
      padLight2.visible = false;
      padLight2.intensity = 0;
      streakAccum = smokeAccum = steamAccum = splashAccum = 0;
      trenchGroup.visible = false;
      groundGroup.visible = false;
      plumeGroup.visible = false;
      groundFireMat.uniforms.uIntensity.value = 0;
      dustMat.opacity = 0;
      for (const m of jetMats) {
        if (m?.uniforms) m.uniforms.uIntensity.value = 0;
      }
      for (const m of [coreJet, midJet, sheathJet, shipCoreJet, shipSheathJet, ...ringMeshes]) {
        m.visible = false;
      }
      this.setThrust({ booster: 0, ship: 0 });
      sGeo.attributes.position.needsUpdate = true;
      stGeo.attributes.position.needsUpdate = true;
      stGeo.attributes.aAlpha.needsUpdate = true;
    },
  };
}
