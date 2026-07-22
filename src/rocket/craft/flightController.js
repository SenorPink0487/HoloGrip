import * as THREE from 'three';

/**
 * Planar flight controller — fixed altitude, horizontal motion only.
 *
 * Ship axes: +X nose, +Y up, +Z right
 *
 *   W/S     forward / reverse
 *   A/D or ←→  turn left / right (yaw)
 *   Q/E     strafe left / right (same height)
 *   Shift   BOOST
 *   C       HYPER
 *   Shift+C WARP
 *   X       hard brake
 *
 * No pitch / climb / dive — craft stays on a fixed horizontal plane
 * (solar-system orbital plane when spawned there).
 */
export function createFlightController(ship, camera, orbitControls) {
  const keys = new Set();
  const vel = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desiredCam = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const shipWorld = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const camUp = new THREE.Vector3(0, 1, 0);
  const backDir = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camBasis = new THREE.Matrix4();
  const camQuat = new THREE.Quaternion();

  let active = false;
  let thrustLevel = 0;
  let speed = 0;
  let mode = 'cruise';
  let modeBlend = 0;
  /**
   * Fixed pilot FOV. Changing projection with speed/mode re-rasterizes distant
   * point stars every frame and reads as continuous background flicker.
   * Speed feel comes from exhaust, trails, and chase distance — not FOV punch.
   */
  const PILOT_FOV = 50;
  let warpTrail = null;
  let trailIdx = 0;
  let trailData = null;
  let bankAngle = 0;
  let heading = 0; // yaw around world +Y (radians)
  let yawRate = 0;
  let lockAlt = 40; // fixed flight height (local Y)

  const TIERS = {
    cruise: {
      accel: 280,
      reverseAccel: 160,
      maxSpeed: 900,
      drag: 0.55,
      brakeDrag: 5.5,
      yawRate: 2.6,
      yawAccel: 14,
      yawDrag: 9,
      strafeAccel: 140,
      // Normal: close chase — ship large and readable
      camDist: 24,
      camHeight: 6,
      camLag: 14,
      camLookAhead: 12,
      // FOV is locked to PILOT_FOV (speed/mode FOV changes flash the starfield)
      thrustVisual: 0.85,
      label: '巡航',
    },
    boost: {
      accel: 900,
      reverseAccel: 280,
      maxSpeed: 3800,
      drag: 0.35,
      brakeDrag: 4.5,
      yawRate: 2.1,
      yawAccel: 12,
      yawDrag: 8,
      strafeAccel: 180,
      // Slight pull-back for boost speed sense
      camDist: 30,
      camHeight: 7.5,
      camLag: 15,
      camLookAhead: 16,
      thrustVisual: 1.1,
      label: '加力',
    },
    hyper: {
      // Higher accel / cap so hyper reads as a clear jump past boost
      accel: 32000,
      reverseAccel: 900,
      maxSpeed: 120000,
      drag: 0.08,
      brakeDrag: 3.2,
      yawRate: 1.35,
      yawAccel: 9,
      yawDrag: 7,
      strafeAccel: 100,
      // Hard-follow locked at high speed; trails sell velocity (not FOV)
      camDist: 40,
      camHeight: 10,
      camLag: 40,
      camLookAhead: 40,
      thrustVisual: 1.4,
      label: '超高速',
    },
    warp: {
      accel: 110000,
      reverseAccel: 1600,
      maxSpeed: 420000,
      drag: 0.03,
      brakeDrag: 2.8,
      yawRate: 0.85,
      yawAccel: 6,
      yawDrag: 6,
      strafeAccel: 50,
      camDist: 48,
      camHeight: 12,
      camLag: 50,
      camLookAhead: 55,
      thrustVisual: 1.85,
      label: '曲速',
    },
  };

  const CFG = { ...TIERS.cruise };

  const FLIGHT_KEYS = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'KeyX',
    'KeyC',
    'ShiftLeft',
    'ShiftRight',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Tab',
  ]);

  function onKeyDown(e) {
    if (!active) return;
    if (e.repeat) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keys.add(e.code);
    if (FLIGHT_KEYS.has(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function isDown(code) {
    return keys.has(code);
  }

  /** Horizontal forward / right from heading (world XZ, +Y up). */
  function updateAxes() {
    // Model +X is nose; heading is rotation.y
    forward.set(Math.cos(heading), 0, -Math.sin(heading));
    right.set(Math.sin(heading), 0, Math.cos(heading));
  }

  function applyShipOrientation() {
    // Level flight: pitch 0, yaw = heading, mild bank only while turning
    ship.rotation.order = 'YXZ';
    ship.rotation.x = 0;
    ship.rotation.y = heading;
    ship.rotation.z = bankAngle;
  }

  function resolveMode(thr) {
    const boost = isDown('ShiftLeft') || isDown('ShiftRight');
    const hyper = isDown('KeyC') || isDown('Tab');
    if (thr > 0 && boost && hyper) return 'warp';
    if (thr > 0 && hyper) return 'hyper';
    if (thr > 0 && boost) return 'boost';
    return 'cruise';
  }

  /**
   * High-speed exhaust trail — elongated streak particles (not dots).
   * Local ship space: -X aft. Streaks stretch with intensity for warp look.
   */
  function ensureWarpTrail() {
    if (warpTrail) return;
    // Compact trail — enough motion cue without burying the ship
    const N = 96;
    const pos = new Float32Array(N * 3);
    const life = new Float32Array(N); // 0 dead → 1 fresh
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] = -9999;
      life[i] = 0;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uSize: { value: 6 },
        uIntensity: { value: 0 },
        uStretch: { value: 1 },
        uColorA: { value: new THREE.Color(0xaaf0ff) },
        uColorB: { value: new THREE.Color(0x3366ff) },
      },
      vertexShader: /* glsl */ `
        attribute float aLife;
        attribute float aSeed;
        uniform float uSize;
        uniform float uIntensity;
        uniform float uStretch;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(0.1, -mv.z);
          float base = uSize * (0.4 + uIntensity * 0.7) * (0.45 + aLife * 0.55);
          gl_PointSize = base * (90.0 / dist) * (0.65 + aSeed * 0.45);
          // Cap still allows long streaks at warp without full-screen blobs
          gl_PointSize = min(gl_PointSize, 22.0 + uStretch * 10.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform float uStretch;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying float vLife;
        varying float vSeed;
        void main() {
          if (vLife < 0.02) discard;
          vec2 uv = gl_PointCoord - 0.5;
          uv.y *= mix(1.0, 0.35, clamp(uStretch * 0.4, 0.0, 1.0));
          float r = length(uv);
          float soft = 1.0 - smoothstep(0.0, 0.48, r);
          soft = pow(max(soft, 0.0), 1.6);
          if (soft < 0.03) discard;
          float core = pow(soft, 2.8);
          vec3 col = mix(uColorB, uColorA, core + vSeed * 0.12);
          col = mix(col, vec3(1.0), core * 0.25 * uIntensity);
          float a = soft * vLife * (0.22 + uIntensity * 0.4);
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    warpTrail = new THREE.Points(geo, mat);
    warpTrail.name = 'WarpTrail';
    warpTrail.frustumCulled = false;
    warpTrail.renderOrder = 3;
    ship.add(warpTrail);
    trailData = { N, pos, life, seed, geo, mat };
    trailIdx = 0;
  }

  function updateWarpTrail(dt, intensity) {
    if (!trailData) return;
    const { N, pos, life, geo, mat } = trailData;
    const on = intensity > 0.04;
    warpTrail.visible = on;
    if (!on) {
      mat.uniforms.uIntensity.value = 0;
      return;
    }

    // Dense, fast streaks — main speed cue when chase cam freezes the hull
    const rate = 55 + intensity * 220;
    const nSpawn = Math.min(22, Math.floor(rate * dt + Math.random() * 2.5));
    const spread = 0.4 + intensity * 1.4;
    for (let n = 0; n < nSpawn; n++) {
      const i = trailIdx % N;
      pos[i * 3] = -10 - Math.random() * (3 + intensity * 14);
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      life[i] = 0.45 + Math.random() * 0.4;
      trailIdx++;
    }

    // Stream aft hard — Doppler streak at hyper/warp
    const stream = 120 + intensity * 480;
    const collapse = 2.4 + intensity * 2.0;
    const lifeDecay = 2.2 + intensity * 1.6;
    const killX = -40 - intensity * 90;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0.01) {
        pos[i * 3 + 1] = -9999;
        continue;
      }
      pos[i * 3] -= stream * dt;
      pos[i * 3 + 1] *= 1 - collapse * dt;
      pos[i * 3 + 2] *= 1 - collapse * dt;
      life[i] *= Math.exp(-lifeDecay * dt);
      if (pos[i * 3] < killX || life[i] < 0.02) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;

    mat.uniforms.uIntensity.value = 0.55 + intensity * 0.85;
    mat.uniforms.uStretch.value = 0.5 + intensity * 1.8;
    mat.uniforms.uSize.value = 6 + intensity * 14;
    mat.uniforms.uColorA.value.setHSL(0.52 - intensity * 0.08, 0.8, 0.6 + intensity * 0.12);
    mat.uniforms.uColorB.value.setHSL(0.58 - intensity * 0.06, 0.85, 0.38 + intensity * 0.1);
  }

  function clearWarpTrail() {
    if (!trailData) return;
    const { N, pos, life, geo, mat } = trailData;
    for (let i = 0; i < N; i++) {
      life[i] = 0;
      pos[i * 3 + 1] = -9999;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;
    mat.uniforms.uIntensity.value = 0;
    if (warpTrail) warpTrail.visible = false;
  }

  /**
   * World-space scale of the scout (main.js scales the ~24 m model ≈5× so it
   * reads near full-stack size). Chase offsets are authored for unit scale and
   * must be multiplied, otherwise the camera sits inside the hull.
   */
  function shipWorldScale() {
    tmp.setFromMatrixScale(ship.matrixWorld);
    const s = (Math.abs(tmp.x) + Math.abs(tmp.y) + Math.abs(tmp.z)) / 3;
    return Number.isFinite(s) && s > 1e-4 ? s : 1;
  }

  /**
   * Build chase pose in ship-local offsets, then apply as a world matrix.
   * Avoid camera.lookAt(worldPoints): at high speed / large heliocentric
   * coordinates, float lookAt jitter reorients the sky every frame and the
   * star dome appears to sparkle even when FOV is fixed.
   */
  function placeChaseCamera(snap) {
    ship.updateMatrixWorld(true);
    ship.getWorldPosition(shipWorld);
    updateAxes();

    backDir.copy(forward);
    // Camera always upright (planar flight)
    camUp.copy(worldUp);

    const s = shipWorldScale();
    // Slightly longer lever than the authored unit-scale chase so a 5× hull
    // still reads as a full third-person ship, not a canopy close-up.
    const dist = CFG.camDist * s * 1.15;
    const height = CFG.camHeight * s * 1.1;
    const look = CFG.camLookAhead * s;

    desiredCam
      .copy(shipWorld)
      .addScaledVector(backDir, -dist)
      .addScaledVector(camUp, height)
      .addScaledVector(right, bankAngle * -4 * s);

    // Aim slightly above the origin so the hull sits lower in frame (horizon
    // readable) instead of locking onto the canopy bubble.
    lookAt
      .copy(shipWorld)
      .addScaledVector(forward, look)
      .addScaledVector(camUp, height * 0.15);

    // Stable view axes from small relative vectors (not absolute lookAt)
    camForward.copy(lookAt).sub(desiredCam);
    if (camForward.lengthSq() < 1e-10) {
      camForward.copy(forward);
    } else {
      camForward.normalize();
    }
    camRight.crossVectors(camForward, worldUp);
    if (camRight.lengthSq() < 1e-10) {
      camRight.copy(right);
    } else {
      camRight.normalize();
    }
    camUp.crossVectors(camRight, camForward).normalize();

    if (snap) {
      camera.position.copy(desiredCam);
      applyCameraOrientation();
    }
  }

  function applyCameraOrientation() {
    // Three.js camera looks down -Z; columns are right, up, -forward
    tmp.copy(camForward).negate();
    camBasis.makeBasis(camRight, camUp, tmp);
    camQuat.setFromRotationMatrix(camBasis);
    camera.quaternion.copy(camQuat);
    camera.up.copy(camUp);
  }

  function applyFov() {
    // Keep FOV locked while piloting — any continuous FOV lerp (mode or speed)
    // reprojects the star field and causes the sky to shimmer.
    if (Math.abs(camera.fov - PILOT_FOV) > 0.01) {
      camera.fov = PILOT_FOV;
      camera.updateProjectionMatrix();
    }
  }

  function enable(spawnPos, spawnLookDir) {
    active = true;
    ship.visible = true;
    keys.clear();
    bankAngle = 0;
    yawRate = 0;

    if (spawnPos) ship.position.copy(spawnPos);
    lockAlt = ship.position.y;
    ship.position.y = lockAlt;

    // Heading from look direction projected on XZ
    if (spawnLookDir && spawnLookDir.lengthSq() > 1e-8) {
      tmp.copy(spawnLookDir);
      tmp.y = 0;
      if (tmp.lengthSq() < 1e-8) tmp.set(1, 0, 0);
      else tmp.normalize();
      // forward = (cos h, 0, -sin h) → h = atan2(-z, x)
      heading = Math.atan2(-tmp.z, tmp.x);
    } else {
      heading = 0;
    }

    applyShipOrientation();
    ship.updateMatrixWorld(true);

    vel.set(0, 0, 0);
    thrustLevel = 0;
    speed = 0;
    mode = 'cruise';
    modeBlend = 0;
    Object.assign(CFG, TIERS.cruise);
    ensureWarpTrail();
    clearWarpTrail();
    if (orbitControls) {
      orbitControls.enabled = false;
      orbitControls.autoRotate = false;
    }
    // Near plane scales with hull size so we never clip the big scout mesh
    const s = shipWorldScale();
    camera.near = Math.max(0.5, s * 0.4);
    camera.fov = PILOT_FOV;
    camera.up.copy(worldUp);
    camera.updateProjectionMatrix();
    placeChaseCamera(true);
    if (orbitControls) orbitControls.target.copy(shipWorld);
  }

  function disable() {
    active = false;
    ship.visible = false;
    keys.clear();
    vel.set(0, 0, 0);
    thrustLevel = 0;
    speed = 0;
    mode = 'cruise';
    modeBlend = 0;
    bankAngle = 0;
    yawRate = 0;
    ship.userData.setThrustVisual?.(0);
    ship.userData.setHyperVisual?.(0);
    clearWarpTrail();
    camera.up.copy(worldUp);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    if (orbitControls) orbitControls.enabled = true;
  }

  function update(dt) {
    if (!active) return { thrust: 0, speed: 0, active: false, mode: 'cruise' };
    dt = Math.min(dt, 0.05);

    // ── Throttle (forward / reverse only) ───────────────────
    let thr = 0;
    if (isDown('KeyW') || isDown('ArrowUp')) thr += 1;
    if (isDown('KeyS') || isDown('ArrowDown')) thr -= 0.7;
    const braking = isDown('KeyX');
    if (braking) thr = 0;

    mode = resolveMode(thr);
    const tier = TIERS[mode];
    const targetBlend =
      mode === 'warp' ? 1 : mode === 'hyper' ? 0.72 : mode === 'boost' ? 0.38 : 0;
    modeBlend = THREE.MathUtils.lerp(modeBlend, targetBlend, 1 - Math.exp(-5 * dt));

    Object.assign(CFG, {
      accel: tier.accel,
      reverseAccel: tier.reverseAccel,
      maxSpeed: tier.maxSpeed,
      drag: tier.drag,
      brakeDrag: tier.brakeDrag,
      yawRate: tier.yawRate,
      yawAccel: tier.yawAccel,
      yawDrag: tier.yawDrag,
      strafeAccel: tier.strafeAccel,
      thrustVisual: tier.thrustVisual,
      label: tier.label,
    });
    {
      // Fixed chase framing while piloting. Continuous camDist/lookAhead
      // lerps (mode or speed) reorient the camera every frame and make even
      // infinite-projected stars crawl/shimmer. Sell speed with trails only.
      const base = TIERS.cruise;
      CFG.camDist = base.camDist;
      CFG.camHeight = base.camHeight;
      CFG.camLag = base.camLag;
      CFG.camLookAhead = base.camLookAhead;
      CFG.fov = PILOT_FOV;
    }

    // ── Yaw only (left / right turn) ────────────────────────
    let yawIn = 0;
    if (isDown('KeyA') || isDown('ArrowLeft')) yawIn += 1;
    if (isDown('KeyD') || isDown('ArrowRight')) yawIn -= 1;

    const wantYaw = yawIn * CFG.yawRate;
    const yawResp = 1 - Math.exp(-CFG.yawAccel * dt);
    yawRate += (wantYaw - yawRate) * yawResp;
    if (Math.abs(yawIn) < 0.02) yawRate *= Math.exp(-CFG.yawDrag * dt);
    heading += yawRate * dt;

    // Cosmetic bank while turning (does not change flight plane)
    bankAngle = THREE.MathUtils.lerp(bankAngle, -yawIn * 0.4, 1 - Math.exp(-10 * dt));
    applyShipOrientation();
    updateAxes();

    // ── Horizontal thrust + strafe ──────────────────────────
    const thrVisTarget = Math.max(0, thr) * CFG.thrustVisual + (mode === 'warp' ? 0.2 : 0);
    thrustLevel = THREE.MathUtils.lerp(thrustLevel, thrVisTarget, 1 - Math.exp(-16 * dt));

    const accel = thr >= 0 ? CFG.accel : CFG.reverseAccel;
    vel.addScaledVector(forward, thr * accel * dt);

    // Strafe on same plane (Q/E)
    if (isDown('KeyQ')) vel.addScaledVector(right, -CFG.strafeAccel * dt);
    if (isDown('KeyE')) vel.addScaledVector(right, CFG.strafeAccel * dt);

    // Kill any vertical component — planar constraint
    vel.y = 0;

    // Redirect lateral velocity toward nose while thrusting forward
    if (speed > 40 && thr > 0) {
      const along = vel.dot(forward);
      if (along > 0) {
        const lat = tmp.copy(vel).addScaledVector(forward, -along);
        const turn = Math.min(1, Math.abs(yawIn));
        const t = 1 - Math.exp(-(0.6 + turn * 0.8) * 4 * dt);
        vel.copy(forward).multiplyScalar(along).addScaledVector(lat, 1 - t);
        vel.y = 0;
      }
    }

    const drag = braking ? CFG.brakeDrag : CFG.drag;
    vel.multiplyScalar(Math.exp(-drag * dt));
    vel.y = 0;

    speed = vel.length();
    if (speed > CFG.maxSpeed) {
      vel.multiplyScalar(CFG.maxSpeed / speed);
      speed = CFG.maxSpeed;
    }

    // Integrate on XZ only; lock altitude
    ship.position.x += vel.x * dt;
    ship.position.z += vel.z * dt;
    ship.position.y = lockAlt;

    const speedFrac = Math.min(1, speed / Math.max(1, tier.maxSpeed));
    const nowT = performance.now() * 0.001;
    // Hyper exhaust + trail intensity tracks real speed (visual velocity)
    const hyperVis =
      modeBlend * (0.4 + 0.6 * Math.max(speedFrac, thr > 0 ? 0.55 : 0));
    ship.userData.setThrustVisual?.(Math.min(1.45, thrustLevel + modeBlend * 0.2));
    ship.userData.setHyperVisual?.(hyperVis, nowT, speedFrac);
    ship.userData.pulse?.(nowT, Math.min(1.25, thrustLevel + modeBlend * 0.25));
    // Trail ramps hard with speed — primary motion cue in chase cam
    updateWarpTrail(dt, Math.min(1.25, hyperVis * (0.55 + speedFrac * 0.7)));

    // ── Camera: hard lock at high speed (soft lag cannot keep up) ──
    // Speed feel comes from warp trail + exhaust + mode chase distance.
    const hardFollow =
      mode === 'hyper' ||
      mode === 'warp' ||
      mode === 'boost' ||
      speed > 600;
    placeChaseCamera(hardFollow);
    if (!hardFollow) {
      const camAlpha = 1 - Math.exp(-CFG.camLag * dt);
      camera.position.lerp(desiredCam, camAlpha);
      // Rebuild forward from lagged position so orientation stays coherent
      camForward.copy(lookAt).sub(camera.position);
      if (camForward.lengthSq() > 1e-10) camForward.normalize();
      else camForward.copy(forward);
      camRight.crossVectors(camForward, worldUp);
      if (camRight.lengthSq() > 1e-10) camRight.normalize();
      else camRight.copy(right);
      camUp.crossVectors(camRight, camForward).normalize();
    } else {
      camera.position.copy(desiredCam);
    }
    applyCameraOrientation();
    applyFov();

    if (orbitControls) orbitControls.target.copy(shipWorld);

    return {
      active: true,
      thrust: thrustLevel,
      speed,
      boost: mode === 'boost' || mode === 'warp',
      hyper: mode === 'hyper' || mode === 'warp',
      warp: mode === 'warp',
      mode,
      modeLabel: tier.label,
      modeBlend,
      maxSpeed: tier.maxSpeed,
      position: ship.position,
      worldPosition: shipWorld,
      altitude: lockAlt,
      planar: true,
    };
  }

  function getState() {
    return {
      active,
      speed,
      thrust: thrustLevel,
      mode,
      heading,
      lockAlt,
      position: ship.position.clone(),
      velocity: vel.clone(),
    };
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    if (warpTrail) {
      ship.remove(warpTrail);
      warpTrail.geometry?.dispose();
      warpTrail.material?.dispose();
      warpTrail = null;
    }
  }

  return {
    enable,
    disable,
    update,
    getState,
    dispose,
    get active() {
      return active;
    },
    TIERS,
    get CFG() {
      return CFG;
    },
  };
}
