import * as THREE from 'three';
import {
  CINEMATIC_HANDOFF_END,
  CINEMATIC_HANDOFF_START,
  CINEMATIC_LEO_VISUAL,
  EARTH_RADIUS,
  METERS_TO_VISUAL,
} from '../scene/space.js';

/**
 * Cinematic launch sequence (film, not continuous-physics sandbox).
 *
 * Site lives in real metres under a METERS_TO_VISUAL scale (true size vs Earth).
 * Two sets + one cut (see CINEMATIC_HANDOFF_* — thresholds in real metres AGL):
 *   Act I  — pad + rocket + sky (below handoff)
 *   Cut    — pad fades, display Earth globe fades in
 *   Act II — globe + upper-stage / LEO beauty
 *
 * `altitude` / `visualAltitude` are real metres AGL; `velocity` in m/s.
 * referenceFrame should be the scaled site group so chase cam is metre-true.
 */
export function createLaunchSequence(stack, camera, controls, exhaust, referenceFrame = stack.parent) {
  const phases = [
    { id: 'idle', label: '待机', duration: 0 },
    { id: 'countdown', label: '倒计时', duration: 4 },
    { id: 'ignition', label: '点火', duration: 2.5 },
    { id: 'liftoff', label: '升空', duration: 11 },
    // Long atmospheric climb — extra time in the 5–50 km band so pad→Earth
    // handoff can breathe (fast middle used to race through the cut).
    { id: 'ascent', label: '大气层', duration: 55 },
    { id: 'hotstage', label: '热分离', duration: 7 },
    { id: 'separate', label: '级间分离', duration: 8 },
    // Extra time so the booster fall beat can play before LEO plates
    { id: 'shipAscent', label: '二级加速', duration: 30 },
    { id: 'leaveEarth', label: '入轨段', duration: 20 },
    { id: 'deepSpace', label: '轨道插入', duration: 18 },
    { id: 'done', label: '近地轨道', duration: 0 },
  ];

  const state = {
    running: false,
    phaseIndex: 0,
    phaseTime: 0,
    elapsed: 0,
    followCam: true,
    /** @deprecated kept for API; no longer cancels follow on orbit/zoom */
    userOverride: false,
    /**
     * User rotated/zoomed while following — keep target on the rocket but
     * preserve their orbit offset (do not force scripted chase pose).
     */
    userFramed: false,
    speed: 1,
  };

  let root = stack;
  let booster = stack.userData.booster;
  let ship = stack.userData.ship;
  let sideBoosters = stack.userData.sideBoosters || [];

  const rest = {
    boosterY: stack.userData.rest?.boosterY ?? stack.userData.engineClearance,
    shipY:
      stack.userData.rest?.shipY ??
      stack.userData.engineClearance + (stack.userData.booster?.userData?.height || 0) - 0.3,
  };

  const flight = {
    altitude: 0,
    visualAltitude: 0,
    velocity: 0,
    separated: false,
    sideBoostersSeparated: false,
    /** 0 = mated, 0–1 peel, >1 free-fall progress for side boosters */
    sideSepAnim: 0,
    boosterAlt: 0,
    shipAlt: 0,
    shipX: 0,
    shipZ: 0,
    boosterX: 0,
    boosterZ: 0,
  };

  const listeners = new Set();
  let shockwaveFired = false;
  const camSmoothed = new THREE.Vector3();
  const camShakeOffset = new THREE.Vector3();
  const desiredCameraLocal = new THREE.Vector3();
  const desiredTargetLocal = new THREE.Vector3();
  const desiredCameraWorld = new THREE.Vector3();
  const desiredTargetWorld = new THREE.Vector3();
  const followTargetDelta = new THREE.Vector3();
  const bWorld = new THREE.Vector3();
  const sWorld = new THREE.Vector3();
  const bEffect = new THREE.Vector3();
  const sEffect = new THREE.Vector3();
  const sepEuler = new THREE.Euler();
  const sepQuat = new THREE.Quaternion();
  const sepOffset = new THREE.Vector3();
  const sepShipPos = new THREE.Vector3();
  const sepBoosterPos = new THREE.Vector3();
  let camSmoothedInit = false;
  const baseFov = camera.fov;
  const glowCache = new Map();

  /** Interstage clearance opened during hot-stage (metres along stack axis). */
  const HOT_STAGE_GAP = 14;

  /**
   * Mated-stack gravity-turn pose through hot-stage (site-frame metres).
   * Continuous with ascent end: (48 km, 72 km, 14 km), pitch ~−0.58.
   */
  function hotstageStackPose(t) {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    return {
      x: 48_000 + u * 12_000,
      y: 72_000 + u * 23_000,
      z: 14_000 + u * 4_000,
      rx: 0.16 + u * 0.02,
      ry: 0,
      rz: -0.58 - u * 0.05,
    };
  }

  /** Rotate a local stack offset into site axes for a given stack attitude. */
  function stackLocalToSite(pose, lx, ly, lz, out) {
    sepEuler.set(pose.rx, pose.ry || 0, pose.rz, 'XYZ');
    sepQuat.setFromEuler(sepEuler);
    sepOffset.set(lx, ly, lz).applyQuaternion(sepQuat);
    out.set(pose.x + sepOffset.x, pose.y + sepOffset.y, pose.z + sepOffset.z);
    return out;
  }

  /**
   * Absolute ship/booster poses during stage separation (site metres).
   * t=0 matches hot-stage end (mated + HOT_STAGE_GAP); t=1 is a readable peel
   * (~200–300 m clear), not a multi-kilometre teleport.
   */
  function separationPoses(t) {
    const peel = smooth(THREE.MathUtils.clamp(t, 0, 1));
    // Quadratic push: linger near mated, then accelerate the back-away
    const push = peel * peel;
    const p0 = hotstageStackPose(1);

    // Stack reference coasts slightly while stages part
    const base = {
      x: p0.x + peel * 6_000,
      y: p0.y + peel * 8_000,
      z: p0.z + peel * 2_500,
      rx: p0.rx + peel * 0.03,
      ry: peel * 0.025,
      rz: p0.rz - peel * 0.05,
    };

    // Along-stack clearances (metres) — chase cam is ~500–900 m out
    const shipLead = HOT_STAGE_GAP + peel * 50 + push * 150;
    const boosterAft = peel * 55 + push * 220;
    const lat = peel * 20 + push * 65;

    stackLocalToSite(base, lat * 0.12, rest.shipY + shipLead, 0, sepShipPos);
    stackLocalToSite(base, -lat, rest.boosterY - boosterAft, -lat * 0.22, sepBoosterPos);

    return {
      peel,
      push,
      base,
      ship: {
        x: sepShipPos.x,
        y: sepShipPos.y,
        z: sepShipPos.z,
        rx: base.rx + peel * 0.025,
        ry: base.ry,
        rz: base.rz - peel * 0.04,
      },
      booster: {
        x: sepBoosterPos.x,
        y: sepBoosterPos.y,
        z: sepBoosterPos.z,
        // Gentle tumble away from the flight path (not a sudden spin)
        rx: base.rx * (1 - peel * 0.45) + peel * 0.14,
        ry: peel * 0.4,
        rz: base.rz * (1 - peel * 0.85) + peel * 0.62,
      },
    };
  }

  /**
   * Piecewise altitude knots for Super Heavy after stage sep (metres AGL).
   * Starts from separation end, coasts a little, then a clear long fall home.
   */
  function sampleBoosterFallAltitude(u, y0) {
    const knots = [
      [0.0, y0],
      [0.1, y0 + 2_800], // residual uprange coast
      [0.28, y0 * 0.78],
      [0.48, Math.min(y0 * 0.48, 52_000)],
      [0.65, 28_000],
      [0.82, 11_000],
      [0.93, 3_800],
      [1.0, 900],
    ];
    const s = THREE.MathUtils.clamp(u, 0, 1);
    for (let i = 0; i < knots.length - 1; i++) {
      const [t0, a0] = knots[i];
      const [t1, a1] = knots[i + 1];
      if (s <= t1 || i === knots.length - 2) {
        const local = THREE.MathUtils.clamp((s - t0) / Math.max(1e-6, t1 - t0), 0, 1);
        return THREE.MathUtils.lerp(a0, a1, smooth(local));
      }
    }
    return knots[knots.length - 1][1];
  }

  /**
   * Continuous booster return after interstage sep.
   * u=0 → separation end; u=1 → low return near the pad corridor.
   * Cinematic (readable fall), not a full boostback physics sim.
   */
  function boosterFallPoses(u) {
    const s = THREE.MathUtils.clamp(u, 0, 1);
    const sepEnd = separationPoses(1);
    const b0 = sepEnd.booster;
    const fall = smooth(s);
    const fall2 = fall * fall;

    // Boostback toward the pad corridor (downrange shrinks as altitude drops)
    const x = THREE.MathUtils.lerp(b0.x, 6_500, fall);
    const z = THREE.MathUtils.lerp(b0.z, 1_800, fall);
    const y = sampleBoosterFallAltitude(s, b0.y);

    // Attitude arc: sep tumble → engines-forward boostback → engines-down reentry
    const flip = smooth(THREE.MathUtils.smoothstep(s, 0.08, 0.38));
    const reentry = smooth(THREE.MathUtils.smoothstep(s, 0.4, 0.78));
    const rx =
      THREE.MathUtils.lerp(b0.rx, 0.55, flip) * (1 - reentry) +
      THREE.MathUtils.lerp(0.55, 0.12, reentry) * reentry;
    const ry = THREE.MathUtils.lerp(b0.ry, 0.85, fall) + Math.sin(s * Math.PI * 1.4) * 0.06 * (1 - reentry);
    const rz =
      THREE.MathUtils.lerp(b0.rz, 1.15, flip) * (1 - reentry * 0.85) +
      THREE.MathUtils.lerp(0.35, 0.08, reentry) * reentry;

    // Residual sep → brief boostback plume → chill → landing-ish glow near end
    let thrust = 0;
    if (s < 0.12) thrust = THREE.MathUtils.lerp(0.18, 0.05, s / 0.12);
    else if (s < 0.36) {
      const bb = smooth(THREE.MathUtils.smoothstep(s, 0.14, 0.22));
      const bbOut = 1 - smooth(THREE.MathUtils.smoothstep(s, 0.28, 0.36));
      thrust = bb * bbOut * 0.55;
    } else if (s > 0.88) {
      thrust = smooth(THREE.MathUtils.smoothstep(s, 0.88, 0.96)) * 0.42;
    }

    return {
      x,
      y: Math.max(40, y),
      z,
      rx,
      ry,
      rz,
      thrust,
      // How far through the fall (for camera / HUD)
      progress: s,
      fall,
      fall2,
    };
  }

  /**
   * Map film phases onto booster-fall progress 0…1.
   * Most of the visible drop plays during shipAscent; leaveEarth finishes the dive.
   */
  function boosterFallProgress(phaseId, t) {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    if (phaseId === 'separate') return 0;
    if (phaseId === 'shipAscent') return u * 0.62;
    if (phaseId === 'leaveEarth') return 0.62 + u * 0.36;
    if (phaseId === 'deepSpace' || phaseId === 'done') return 1;
    return 0;
  }

  /** Write booster mesh + flight fields from a fall pose. */
  function applyBoosterFallPose(pose) {
    if (!booster || !pose) return;
    flight.boosterX = pose.x;
    flight.boosterAlt = pose.y;
    flight.boosterZ = pose.z;
    booster.position.set(pose.x, pose.y, pose.z);
    booster.rotation.set(pose.rx, pose.ry, pose.rz);
    // Stay visible through the long fall; hide only when nearly on the deck
    booster.visible = pose.progress < 0.97 && pose.y > 200;
  }

  function assemblyFlags() {
    const ud = root.userData || {};
    const stageCount = ud.stageCount ?? (ud.hasInterstageSeparation === false ? 1 : 2);
    return {
      stageCount,
      underpowered: !!ud.underpowered || ud.canLiftOff === false,
      hasInterstage: ud.hasInterstageSeparation !== false && stageCount >= 2,
      hasSideBoosters: (ud.sideBoosters?.length || sideBoosters.length) > 0,
      sideSepPhase: ud.sideBoosterSeparatePhase || 'ascent',
      twr: ud.twr ?? 1.2,
    };
  }

  function rebind(newStack) {
    root = newStack;
    booster = newStack.userData.booster;
    ship = newStack.userData.ship;
    sideBoosters = newStack.userData.sideBoosters || [];
    rest.boosterY =
      newStack.userData.rest?.boosterY ?? newStack.userData.engineClearance;
    rest.shipY =
      newStack.userData.rest?.shipY ??
      newStack.userData.engineClearance +
        (newStack.userData.booster?.userData?.height || 0) -
        0.3;
    glowCache.clear();
  }

  function emit() {
    const phase = phases[state.phaseIndex];
    const flags = assemblyFlags();
    const info = {
      phase: phase.id,
      label: phase.label,
      phaseTime: state.phaseTime,
      phaseDuration: phase.duration,
      elapsed: state.elapsed,
      altitude: flight.altitude,
      visualAltitude: flight.visualAltitude,
      velocity: flight.velocity,
      running: state.running,
      separated: flight.separated,
      sideBoostersSeparated: flight.sideBoostersSeparated,
      progress: getOverallProgress(),
      inSpace: flight.altitude >= 100000,
      underpowered: flags.underpowered,
      stageCount: flags.stageCount,
      warnings: root.userData?.performance?.warnings || [],
    };
    for (const fn of listeners) fn(info);
  }

  function getOverallProgress() {
    let total = 0;
    let done = 0;
    for (let i = 1; i < phases.length - 1; i++) {
      total += phases[i].duration;
      if (i < state.phaseIndex) done += phases[i].duration;
      else if (i === state.phaseIndex) done += Math.min(state.phaseTime, phases[i].duration);
    }
    return total > 0 ? done / total : 0;
  }

  function setPhase(index) {
    state.phaseIndex = index;
    state.phaseTime = 0;
    emit();
  }

  function phaseIndexById(id) {
    return phases.findIndex((p) => p.id === id);
  }

  /** Advance phase, skipping interstage for single-stage vehicles. */
  function advancePhase() {
    if (state.phaseIndex >= phases.length - 1) return;
    let next = state.phaseIndex + 1;
    const flags = assemblyFlags();
    // Skip hotstage + separate for single-stage
    if (!flags.hasInterstage) {
      const nextId = phases[next]?.id;
      if (nextId === 'hotstage' || nextId === 'separate') {
        next = phaseIndexById('shipAscent');
      }
    }
    setPhase(next);
    if (phases[state.phaseIndex].id === 'done') {
      state.running = false;
      emit();
    }
  }

  function resetPose() {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    if (booster) {
      booster.position.set(0, rest.boosterY, 0);
      booster.rotation.set(0, 0, 0);
      const flags = assemblyFlags();
      booster.visible = flags.stageCount >= 2;
    }
    if (ship) {
      ship.position.set(0, rest.shipY, 0);
      ship.rotation.set(0, 0, 0);
      ship.visible = true;
    }
    root.userData.resetSideBoosters?.();
    root.userData.resetPose?.();
    // re-apply rest after resetPose view mode
    if (booster && assemblyFlags().stageCount >= 2) {
      booster.position.set(0, rest.boosterY, 0);
      booster.visible = true;
    }
    if (ship) ship.position.set(0, rest.shipY, 0);

    flight.altitude = 0;
    flight.visualAltitude = 0;
    flight.velocity = 0;
    flight.separated = false;
    flight.sideBoostersSeparated = false;
    flight.sideSepAnim = 0;
    flight.boosterAlt = rest.boosterY;
    flight.shipAlt = rest.shipY;
    flight.shipX = 0;
    flight.shipZ = 0;
    flight.boosterX = 0;
    flight.boosterZ = 0;
    exhaust.reset();
    root.userData.setEngineGlow?.(false);
    state.userOverride = false;
    state.userFramed = false;
    shockwaveFired = false;
    camShakeOffset.set(0, 0, 0);
    camSmoothedInit = false;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }

  function start() {
    root.userData.setViewMode?.('stack');
    resetPose();
    state.running = true;
    state.elapsed = 0;
    state.userOverride = false;
    state.userFramed = false;
    setPhase(1);
    controls.autoRotate = false;
    controls.maxDistance = EARTH_RADIUS * 25;
    // minDistance is in WORLD units. Site is METERS_TO_VISUAL-scaled — a bare
    // "8" forced the chase cam ~4 km away and looked like a huge pull-back.
    controls.minDistance = 8 * METERS_TO_VISUAL;
  }

  function stop() {
    state.running = false;
    resetPose();
    setPhase(0);
    controls.maxDistance = EARTH_RADIUS * 25;
    controls.minDistance = 2 * METERS_TO_VISUAL;
    emit();
  }

  function easeIn(t) {
    return t * t;
  }
  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  /**
   * Piecewise altitude during atmospheric ascent (metres AGL).
   * Lingers in the handoff band so sky thinning + Earth limb can register
   * instead of a one-second flat-pad → blue-marble pop.
   */
  function ascentAltitudeCurve(t) {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    // Knots: [phase t, altitude m] — denser samples through 5–50 km
    const knots = [
      [0.0, 1_200],
      [0.18, 5_500],
      [0.34, 12_000],
      [0.5, 24_000],
      [0.66, 40_000],
      [0.82, 55_000],
      [1.0, 72_000],
    ];
    for (let i = 0; i < knots.length - 1; i++) {
      const [t0, a0] = knots[i];
      const [t1, a1] = knots[i + 1];
      if (u <= t1 || i === knots.length - 2) {
        const local = THREE.MathUtils.clamp((u - t0) / Math.max(1e-6, t1 - t0), 0, 1);
        return THREE.MathUtils.lerp(a0, a1, smooth(local));
      }
    }
    return knots[knots.length - 1][1];
  }

  /** Downrange / crossrange for a more natural gravity-turn arc. */
  function ascentLateral(t) {
    const turn = smooth(THREE.MathUtils.smoothstep(t, 0.08, 0.95));
    return {
      x: turn * 48_000,
      z: turn * turn * 14_000,
      pitchZ: -0.06 - turn * 0.52,
      pitchX: 0.02 + turn * 0.14,
    };
  }

  /**
   * Drive side-booster peel + free-fall. Separation is a mid-phase event
   * (not stretched across the whole ascent), then progress keeps rising so
   * they drop toward Earth while the core climbs. Camera is unchanged.
   */
  function updateSideBoosterSep(phaseId, t) {
    const flags = assemblyFlags();
    if (!flags.hasSideBoosters) return;

    const sepPhase = flags.sideSepPhase || 'ascent';
    const u = THREE.MathUtils.clamp(t, 0, 1);

    if (phaseId === sepPhase) {
      // Focused peel window so it reads as a discrete staging event
      let peelStart = 0.2;
      let peelEnd = 0.5;
      if (sepPhase === 'ascent') {
        // ~12–28 km band on the atmospheric climb curve
        peelStart = 0.3;
        peelEnd = 0.48;
      } else if (sepPhase === 'liftoff') {
        peelStart = 0.55;
        peelEnd = 0.95;
      } else if (sepPhase === 'hotstage') {
        peelStart = 0.12;
        peelEnd = 0.65;
      } else if (sepPhase === 'separate') {
        peelStart = 0.05;
        peelEnd = 0.55;
      }

      const peel = smooth(THREE.MathUtils.smoothstep(u, peelStart, peelEnd));
      // After mid-peel, keep advancing free-fall through the rest of the phase
      const fallStart = (peelStart + peelEnd) * 0.5;
      const fall = THREE.MathUtils.smoothstep(u, fallStart, 1) * 1.55;
      flight.sideSepAnim = peel + fall;
      if (peel > 0.88) flight.sideBoostersSeparated = true;
    } else if (flight.sideBoostersSeparated) {
      // Continue drop in later phases (never freeze at peel=1 / instant hide)
      const cont =
        phaseId === 'hotstage'
          ? 1.55 + u * 0.55
          : phaseId === 'separate'
            ? 2.1 + u * 0.55
            : phaseId === 'shipAscent'
              ? 2.65 + u * 1.5
              : phaseId === 'leaveEarth'
                ? 4.2 + u * 1.1
                : phaseId === 'deepSpace' || phaseId === 'done'
                  ? 5.5
                  : flight.sideSepAnim;
      flight.sideSepAnim = Math.max(flight.sideSepAnim, cont);
    } else if (
      phaseId === 'countdown' ||
      phaseId === 'ignition' ||
      phaseId === 'liftoff' ||
      phaseId === 'ascent' ||
      phaseId === 'hotstage'
    ) {
      // Pre-sep: keep mated
      flight.sideSepAnim = 0;
    }

    // Core velocity in site axes (gravity-turn approx) for ballistic side-booster coast
    const spd = Math.max(0, flight.velocity || 0);
    const prx = root.rotation.x;
    const pry = root.rotation.y;
    const prz = root.rotation.z;
    // Downrange is +X as the stack pitches (prz ≤ 0 on the film turn)
    const pitch = Math.hypot(prx, prz);
    const vx = spd * Math.sin(Math.min(1.2, Math.abs(prz))) * (prz <= 0 ? 1 : -1);
    const vy = spd * Math.max(0.2, Math.cos(Math.min(1.2, pitch)));
    const vz = spd * Math.sin(prx) * 0.45;

    root.userData.separateSideBoosters?.(flight.sideSepAnim, {
      x: root.position.x,
      y: root.position.y,
      z: root.position.z,
      rx: prx,
      ry: pry,
      rz: prz,
      speed: spd,
      vx,
      vy,
      vz,
    });
  }

  function update(dt) {
    if (!state.running) {
      exhaust.setThrust({ booster: 0, ship: 0 });
      return null;
    }

    const scaled = dt * state.speed;
    state.phaseTime += scaled;
    state.elapsed += scaled;

    const phase = phases[state.phaseIndex];
    const t = phase.duration > 0 ? Math.min(1, state.phaseTime / phase.duration) : 1;
    const flags = assemblyFlags();

    let boosterThrust = 0;
    let shipThrust = 0;
    let bloom = 0;

    // Underpowered path: light engines, shake, fail to climb
    if (flags.underpowered) {
      const result = updateUnderpowered(phase.id, t);
      boosterThrust = result.boosterThrust;
      shipThrust = result.shipThrust;
      bloom = result.bloom;
      applyExhaustAndGlow(boosterThrust, shipThrust, flags);
      if (state.followCam) {
        updateCamera(phase.id, t, Math.max(boosterThrust, shipThrust), scaled);
      }
      if (phase.duration > 0 && state.phaseTime >= phase.duration) {
        if (phase.id === 'ignition' || phase.id === 'liftoff' || phase.id === 'ascent') {
          // Stay stuck near pad — go to done with failure state
          if (phase.id === 'ascent' || (phase.id === 'liftoff' && t >= 1)) {
            setPhase(phaseIndexById('done'));
            state.running = false;
            emit();
            return {
              boosterThrust,
              shipThrust,
              bloom,
              heat: 0.2,
              altitude: flight.altitude,
              visualAltitude: flight.visualAltitude,
              velocity: flight.velocity,
              inSpace: false,
              underpowered: true,
            };
          }
        }
        advancePhase();
      }
      emit();
      return {
        boosterThrust,
        shipThrust,
        bloom,
        heat: boosterThrust * 0.5,
        altitude: flight.altitude,
        visualAltitude: flight.visualAltitude,
        velocity: flight.velocity,
        inSpace: false,
        underpowered: true,
      };
    }

    switch (phase.id) {
      case 'countdown': {
        if (t > 0.7) boosterThrust = ((t - 0.7) / 0.3) * 0.15;
        flight.altitude = 0;
        flight.visualAltitude = 0;
        flight.velocity = 0;
        break;
      }
      case 'ignition': {
        boosterThrust = smooth(t);
        // Single-stage: ship engines are the liftoff engines
        if (flags.stageCount === 1) {
          shipThrust = boosterThrust;
          boosterThrust = 0;
        }
        bloom = Math.max(boosterThrust, shipThrust) * 0.55;
        // Stable pad hold — no camera/stack shake (distortion is post-process only)
        root.position.x = 0;
        root.position.z = 0;
        flight.altitude = 0;
        flight.visualAltitude = 0;
        flight.velocity = 5 * t;
        if (!shockwaveFired && Math.max(boosterThrust, shipThrust) > 0.35) {
          shockwaveFired = true;
          exhaust.triggerShockwave?.(root.position.x, root.position.z);
        }
        break;
      }
      case 'liftoff': {
        if (flags.stageCount === 1) {
          shipThrust = 1;
          boosterThrust = 0;
        } else {
          boosterThrust = 1;
        }
        bloom = 0.48;
        // Clear tower → ~1.2 km AGL (keep pad/tower readable most of the beat)
        const liftEase = easeIn(t) * easeIn(Math.min(1, t * 1.08));
        const lift = liftEase * 1200;
        flight.visualAltitude = lift;
        flight.altitude = lift;
        flight.velocity = THREE.MathUtils.lerp(8, 380, smooth(t) * smooth(t));
        // Clean climb — no positional jitter
        root.position.set(0, lift, 0);
        root.rotation.z = -liftEase * 0.07;
        root.rotation.x = liftEase * 0.02;
        break;
      }
      case 'ascent': {
        if (flags.stageCount === 1) {
          shipThrust = 1;
          boosterThrust = 0;
        } else {
          boosterThrust = 1;
        }
        bloom = 0.42 - t * 0.12;
        // 1.2 → ~72 km with extra dwell in the cinematic handoff band
        const climb = ascentAltitudeCurve(t);
        const lat = ascentLateral(t);
        flight.visualAltitude = climb;
        flight.altitude = climb;
        flight.velocity = THREE.MathUtils.lerp(380, 2300, smooth(t));
        root.position.set(lat.x, climb, lat.z);
        root.rotation.z = lat.pitchZ;
        root.rotation.x = lat.pitchX;
        break;
      }
      case 'hotstage': {
        // True hot-stage beat: booster still thrusting, ship lights while nearly mated
        boosterThrust = THREE.MathUtils.lerp(0.88, 0.52, smooth(t));
        shipThrust = smooth(THREE.MathUtils.smoothstep(t, 0.18, 0.72)) * 0.92;
        bloom = 0.28 + shipThrust * 0.14;
        flight.separated = false;

        const pose = hotstageStackPose(t);
        root.position.set(pose.x, pose.y, pose.z);
        root.rotation.set(pose.rx, pose.ry, pose.rz);

        // Late in the beat, open the interstage ring (~0 → HOT_STAGE_GAP m)
        const gap =
          smooth(THREE.MathUtils.smoothstep(t, 0.38, 1)) * HOT_STAGE_GAP;
        if (booster) {
          booster.position.set(0, rest.boosterY, 0);
          booster.rotation.set(0, 0, 0);
          booster.visible = true;
        }
        ship.position.set(0, rest.shipY + gap, 0);
        ship.rotation.set(0, 0, 0);

        flight.visualAltitude = pose.y + rest.shipY + gap;
        flight.altitude = flight.visualAltitude;
        flight.velocity = THREE.MathUtils.lerp(2300, 2800, smooth(t));
        break;
      }
      case 'separate': {
        // Continuous peel from hot-stage end — no root/stage teleport
        const sep = separationPoses(t);
        boosterThrust = THREE.MathUtils.lerp(0.42, 0.06, sep.peel);
        shipThrust = 0.92;
        bloom = 0.3 + sep.peel * 0.06;
        flight.separated = true;

        // Stages own site-frame poses (camera contract); root at origin
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);

        flight.shipX = sep.ship.x;
        flight.shipAlt = sep.ship.y;
        flight.shipZ = sep.ship.z;
        flight.boosterX = sep.booster.x;
        flight.boosterAlt = sep.booster.y;
        flight.boosterZ = sep.booster.z;
        flight.visualAltitude = flight.shipAlt;
        flight.altitude = flight.shipAlt;
        flight.velocity = THREE.MathUtils.lerp(2800, 3400, sep.peel);

        ship.position.set(sep.ship.x, sep.ship.y, sep.ship.z);
        ship.rotation.set(sep.ship.rx, sep.ship.ry, sep.ship.rz);
        if (booster) {
          booster.visible = true;
          booster.position.set(sep.booster.x, sep.booster.y, sep.booster.z);
          booster.rotation.set(sep.booster.rx, sep.booster.ry, sep.booster.rz);
        }
        break;
      }
      case 'shipAscent': {
        // Second-stage burn + Super Heavy long fall (in-world only)
        shipThrust = 0.92;
        if (flags.stageCount === 1) {
          boosterThrust = 0;
          flight.separated = false;
          bloom = 0.26;
          const burn = smooth(t);
          const climb = 72_000 + burn * 128_000;
          flight.visualAltitude = climb;
          flight.altitude = climb;
          flight.velocity = THREE.MathUtils.lerp(2300, 5800, burn);
          root.position.set(48_000 + burn * 80_000, climb, 14_000 + burn * 30_000);
          root.rotation.z = -0.58 - burn * 0.18;
          root.rotation.x = 0.16 + burn * 0.1;
        } else {
          bloom = 0.26;
          flight.separated = true;
          root.position.set(0, 0, 0);
          root.rotation.set(0, 0, 0);
          const burn = smooth(t);
          const sepEnd = separationPoses(1);
          flight.shipX = sepEnd.ship.x + burn * 70_000;
          flight.shipAlt = sepEnd.ship.y + burn * 85_000;
          flight.shipZ = sepEnd.ship.z + burn * 28_000;
          flight.visualAltitude = flight.shipAlt;
          flight.altitude = flight.shipAlt;
          flight.velocity = THREE.MathUtils.lerp(3400, 5800, burn);
          ship.position.set(flight.shipX, flight.shipAlt, flight.shipZ);
          ship.rotation.set(
            THREE.MathUtils.lerp(sepEnd.ship.rx, 0.12, burn),
            THREE.MathUtils.lerp(sepEnd.ship.ry, 0.1, burn),
            THREE.MathUtils.lerp(sepEnd.ship.rz, -0.58, burn)
          );
          // Continuous booster fall from sep end (~100 km → ~28 km this phase)
          const fallPose = boosterFallPoses(boosterFallProgress('shipAscent', t));
          applyBoosterFallPose(fallPose);
          boosterThrust = fallPose.thrust;
        }
        break;
      }
      case 'leaveEarth': {
        // Karman / vacuum — ship climbs; booster finishes its dive
        shipThrust = 0.72;
        bloom = 0.2 + (1 - t) * 0.08;

        if (flags.stageCount === 1) {
          boosterThrust = 0;
          flight.separated = false;
          const escape = smooth(t);
          const climb = 200_000 + escape * 120_000;
          flight.visualAltitude = climb;
          flight.altitude = climb;
          flight.velocity = THREE.MathUtils.lerp(5800, 7400, escape);
          root.position.set(125_000 + escape * 60_000, climb, 42_000 + escape * 25_000);
          root.rotation.set(0.18 + t * 0.08, 0.2, -0.68 - t * 0.08);
        } else {
          flight.separated = true;
          root.position.set(0, 0, 0);
          root.rotation.set(0, 0, 0);
          const escape = smooth(t);
          const sepEnd = separationPoses(1);
          const shipAscentEnd = {
            x: sepEnd.ship.x + 70_000,
            y: sepEnd.ship.y + 85_000,
            z: sepEnd.ship.z + 28_000,
            rx: 0.12,
            ry: 0.1,
            rz: -0.58,
          };
          flight.shipX = shipAscentEnd.x + escape * 55_000;
          flight.shipAlt = shipAscentEnd.y + escape * 120_000;
          flight.shipZ = shipAscentEnd.z + escape * 22_000;
          flight.visualAltitude = flight.shipAlt;
          flight.altitude = flight.shipAlt;
          flight.velocity = THREE.MathUtils.lerp(5800, 7400, escape);
          ship.position.set(flight.shipX, flight.shipAlt, flight.shipZ);
          ship.rotation.set(
            shipAscentEnd.rx + t * 0.08,
            shipAscentEnd.ry + 0.1 + t * 0.06,
            shipAscentEnd.rz - t * 0.08
          );
          const fallPose = boosterFallPoses(boosterFallProgress('leaveEarth', t));
          applyBoosterFallPose(fallPose);
          boosterThrust = fallPose.thrust;
        }
        break;
      }
      case 'deepSpace': {
        // LEO insertion — settle near CINEMATIC_LEO_VISUAL (~400 km)
        shipThrust = 0.38;
        boosterThrust = 0;
        bloom = 0.14;
        if (flags.stageCount === 1) {
          const orbit = smooth(t);
          const climb = 320_000 + orbit * (CINEMATIC_LEO_VISUAL - 320_000);
          flight.visualAltitude = climb;
          flight.altitude = climb;
          flight.velocity = THREE.MathUtils.lerp(7400, 7800, orbit);
          root.position.set(185_000 + orbit * 50_000, climb, 67_000 + orbit * 20_000);
          root.rotation.set(0.22, 0.3 + orbit * 0.16, -0.74);
        } else {
          flight.separated = true;
          if (booster) booster.visible = false;
          const orbit = smooth(t);
          // Continue ship from leaveEarth end rather than a hard LEO teleport
          const sepEnd = separationPoses(1);
          const leaveEnd = {
            x: sepEnd.ship.x + 70_000 + 55_000,
            y: sepEnd.ship.y + 85_000 + 120_000,
            z: sepEnd.ship.z + 28_000 + 22_000,
          };
          flight.shipAlt = THREE.MathUtils.lerp(leaveEnd.y, CINEMATIC_LEO_VISUAL, orbit);
          flight.shipX = leaveEnd.x + orbit * 48_000;
          flight.shipZ = leaveEnd.z + orbit * 18_000;
          flight.visualAltitude = flight.shipAlt;
          flight.altitude = flight.shipAlt;
          flight.velocity = THREE.MathUtils.lerp(7400, 7800, orbit);
          ship.position.set(flight.shipX, flight.shipAlt, flight.shipZ);
          ship.rotation.set(0.22, 0.3 + orbit * 0.16, -0.74);
        }
        break;
      }
      case 'done': {
        shipThrust = 0.12;
        boosterThrust = 0;
        break;
      }
      default:
        break;
    }

    // Side-booster peel/fall every frame (after root pose is set for this tick)
    updateSideBoosterSep(phase.id, t);

    applyExhaustAndGlow(boosterThrust, shipThrust, flags);

    if (state.followCam) {
      updateCamera(phase.id, t, Math.max(boosterThrust, shipThrust), scaled);
    }

    if (phase.duration > 0 && state.phaseTime >= phase.duration) {
      if (state.phaseIndex < phases.length - 1) {
        advancePhase();
      }
    }

    const thrMain = Math.max(boosterThrust, shipThrust);
    let heat = 0;
    if (phase.id === 'ignition') heat = thrMain * 1.0;
    else if (phase.id === 'liftoff') heat = THREE.MathUtils.lerp(1.0, 0.55, t);
    else if (phase.id === 'ascent') heat = Math.max(0, 0.55 * (1 - t * 0.7));
    else if (phase.id === 'countdown' && t > 0.7) heat = thrMain * 0.45;
    const warp = screenWarpAmount(phase.id, t, thrMain);

    emit();
    return {
      boosterThrust,
      shipThrust,
      bloom,
      heat,
      warp,
      altitude: flight.altitude,
      visualAltitude: flight.visualAltitude,
      velocity: flight.velocity,
      inSpace: flight.altitude >= 100000,
      underpowered: false,
    };
  }

  function updateUnderpowered(phaseId, t) {
    let boosterThrust = 0;
    let shipThrust = 0;
    let bloom = 0;
    const flags = assemblyFlags();
    const primaryShip = flags.stageCount === 1;

    if (phaseId === 'countdown') {
      if (t > 0.7) {
        const th = ((t - 0.7) / 0.3) * 0.2;
        if (primaryShip) shipThrust = th;
        else boosterThrust = th;
      }
    } else if (phaseId === 'ignition') {
      const th = smooth(t) * 0.85;
      if (primaryShip) shipThrust = th;
      else boosterThrust = th;
      bloom = th * 0.5;
      root.position.x = 0;
      root.position.z = 0;
      flight.velocity = 2 * t;
      if (!shockwaveFired && th > 0.4) {
        shockwaveFired = true;
        exhaust.triggerShockwave?.(root.position.x, root.position.z);
      }
    } else if (phaseId === 'liftoff' || phaseId === 'ascent') {
      // Struggle: hover a few metres then settle back (no positional jitter)
      const th = phaseId === 'liftoff' ? 0.9 : 0.55 * (1 - t * 0.5);
      if (primaryShip) shipThrust = th;
      else boosterThrust = th;
      bloom = 0.35;
      const hop = phaseId === 'liftoff' ? Math.sin(t * Math.PI) * 8 : Math.max(0, 6 - t * 10);
      flight.visualAltitude = hop;
      flight.altitude = hop * 2;
      flight.velocity = Math.max(0, 15 - t * 20);
      root.position.set(0, hop, 0);
      root.rotation.z = 0;
    } else {
      // After failed ascent — pad hold with residual smoke
      boosterThrust = 0;
      shipThrust = 0;
      flight.visualAltitude = Math.max(0, flight.visualAltitude * 0.95);
      root.position.y = flight.visualAltitude;
    }
    return { boosterThrust, shipThrust, bloom };
  }

  function applyExhaustAndGlow(boosterThrust, shipThrust, flags) {
    const vacuumFactor = THREE.MathUtils.smoothstep(flight.altitude, 55000, 125000);
    const dual = Math.min(boosterThrust, shipThrust);
    const dualDamp = THREE.MathUtils.lerp(1, 0.55, THREE.MathUtils.smoothstep(dual, 0.15, 0.7));
    const rangeDamp = THREE.MathUtils.lerp(
      1,
      0.62,
      THREE.MathUtils.smoothstep(
        flight.visualAltitude,
        CINEMATIC_HANDOFF_START,
        CINEMATIC_LEO_VISUAL
      )
    );
    const glowScale = dualDamp * rangeDamp;
    if (booster) setGlowIntensity(booster, boosterThrust * glowScale, vacuumFactor, rangeDamp);
    if (ship) setGlowIntensity(ship, shipThrust * glowScale, vacuumFactor, rangeDamp);
    // Side boosters: full thrust while mated; residual plume during early free-fall
    if (sideBoosters.length) {
      let sbThrust = 0;
      if (!flight.sideBoostersSeparated) {
        sbThrust = boosterThrust * 0.85;
      } else {
        // Fade residual after peel (progress 1 → ~1.6)
        const anim = flight.sideSepAnim || 0;
        const residual = THREE.MathUtils.clamp(1.55 - anim, 0, 1);
        sbThrust = residual * residual * 0.4;
      }
      for (const sb of sideBoosters) {
        if (!sb.visible) continue;
        setGlowIntensity(sb, sbThrust * glowScale, vacuumFactor, rangeDamp);
      }
    }

    if (booster) booster.getWorldPosition(bWorld);
    else bWorld.set(0, 0, 0);
    if (ship) ship.getWorldPosition(sWorld);
    else sWorld.set(0, 0, 0);
    bEffect.copy(bWorld);
    sEffect.copy(sWorld);
    referenceFrame?.worldToLocal(bEffect);
    referenceFrame?.worldToLocal(sEffect);
    exhaust.setOrigins(
      bEffect.y + 0.5,
      sEffect.y + 0.5,
      { x: bEffect.x, z: bEffect.z },
      { x: sEffect.x, z: sEffect.z }
    );
    // Drive vacuum plume shape (wider / bluer) from real altitude AGL
    exhaust.setAltitude?.(flight.altitude);
    exhaust.setThrust({
      booster: flags.stageCount === 1 ? 0 : boosterThrust,
      ship: flags.stageCount === 1 ? shipThrust : shipThrust,
    });
  }

  function getGlowParts(vehicle) {
    let parts = glowCache.get(vehicle);
    if (parts) return parts;
    parts = { glows: [], plumes: [], machDiamonds: [], machRings: [] };
    vehicle.traverse((o) => {
      if (o.name === 'engineGlow' && o.material) parts.glows.push(o);
      else if (o.name === 'plume' && o.material) parts.plumes.push(o);
      else if (o.name === 'machDiamonds') parts.machDiamonds.push(o);
      else if (o.name === 'machRing' && o.material) parts.machRings.push(o);
    });
    glowCache.set(vehicle, parts);
    return parts;
  }

  function setGlowIntensity(vehicle, thrust, vacuumFactor = 0, rangeFade = 1) {
    if (!vehicle) return;
    const parts = getGlowParts(vehicle);
    // In hard vacuum, hide additive engine glows entirely — they trip bloom
    // against the star cubemap and read as intermittent full-screen flashes.
    if (vacuumFactor > 0.85) {
      for (const o of parts.glows) o.visible = false;
      for (const o of parts.plumes) o.visible = false;
      for (const o of parts.machDiamonds) o.visible = false;
      for (const o of parts.machRings) o.visible = false;
      return;
    }
    const glowOn = thrust > 0.02;
    // Mach diamonds strongest mid-atmosphere; fade in hard vacuum + far camera
    const machOn = thrust > 0.1 && rangeFade > 0.55 && vacuumFactor < 0.92;
    // Vacuum: plume spreads wider / longer (underexpanded bell look)
    const spread = THREE.MathUtils.lerp(1, 1.55, vacuumFactor);
    // Nozzle plumes — brighter under full thrust so engines look lit
    const plumeY =
      (1.15 + thrust * 2.2) * THREE.MathUtils.lerp(1, 1.55, vacuumFactor);
    const plumeXZ = (0.85 + thrust * 0.65) * spread;
    const glowOp = (0.35 + thrust * 0.6) * rangeFade;
    const plumeOp =
      thrust * THREE.MathUtils.lerp(0.7, 0.48, vacuumFactor) * rangeFade;
    const glowScale =
      (0.78 + thrust * 0.42) * THREE.MathUtils.lerp(1, 0.9, 1 - rangeFade);
    // Tiny pad flicker only. In vacuum, oscillating additive glows + UnrealBloom
    // on a black background read as continuous black screen flashes.
    const flickAmp = THREE.MathUtils.lerp(0.06, 0.0, vacuumFactor);
    const flicker =
      1 -
      flickAmp +
      flickAmp * Math.sin(state.elapsed * 22 + (vehicle.id || 0) * 0.7);

    for (const o of parts.glows) {
      o.visible = glowOn;
      if (glowOn) {
        o.material.opacity = glowOp * flicker;
        o.scale.setScalar(glowScale * (0.98 + 0.02 * flickAmp * flicker));
      }
    }
    for (const o of parts.plumes) {
      o.visible = glowOn;
      if (glowOn) {
        const mat = o.material;
        const isShader = !!mat?.uniforms?.uOpacity;
        const isCore =
          (isShader && mat.uniforms.uCore?.value > 0.5) ||
          (mat?.color && mat.color.r > 0.7 && mat.color.b < 0.55);
        const yMul = isCore ? 0.7 : 1;
        const xzMul = isCore ? 0.68 : 1;
        const op = plumeOp * (isCore ? 0.95 : 1) * flicker;
        if (isShader) {
          mat.uniforms.uOpacity.value = op;
          mat.uniforms.uTime.value = state.elapsed;
          if (mat.uniforms.uVacuum) mat.uniforms.uVacuum.value = vacuumFactor;
        } else {
          mat.opacity = op;
        }
        o.scale.y = plumeY * yMul;
        o.scale.x = plumeXZ * xzMul;
        o.scale.z = plumeXZ * xzMul;
      }
    }
    for (const o of parts.machDiamonds) {
      o.visible = machOn;
    }
    for (const o of parts.machRings) {
      o.visible = machOn;
      if (machOn) {
        const baseOp = (o.userData.baseOpacity ?? 0.45) * 0.62;
        const ringFlicker =
          1 - flickAmp * 0.5 + flickAmp * 0.5 * Math.sin(state.elapsed * 20 + o.id);
        // Diamonds fade as atmosphere thins (vacuumFactor high)
        const atm = 1 - vacuumFactor * 0.55;
        o.material.opacity = baseOp * thrust * ringFlicker * rangeFade * atm;
        const s = (o.userData.baseScale ?? 1) * (0.78 + thrust * 0.32) * spread;
        o.scale.setScalar(s);
      }
    }
  }

  /** Camera shake removed — atmospheric drama is full-frame UV warp instead. */
  function cameraShake(_phaseId, _thrust) {
    camShakeOffset.set(0, 0, 0);
    return camShakeOffset;
  }

  /**
   * Subtle heat-haze amount 0..1 for the post-process pass.
   * Strongest near pad exhaust; gentle mid-ascent air shimmer; off in vacuum.
   */
  function screenWarpAmount(phaseId, t, thr) {
    if (phaseId === 'countdown' && thr > 0.05) return thr * 0.18;
    if (phaseId === 'ignition') return thr * 0.55;
    if (phaseId === 'liftoff') {
      // Exhaust heat on pad, fading as the stack clears the trench
      return THREE.MathUtils.lerp(0.55, 0.12, smooth(t)) * Math.max(0.35, thr);
    }
    if (phaseId === 'ascent') {
      // Soft denser-air shimmer around max-Q only — no residual that stripes the hull
      const alt = flight.altitude || 0;
      const maxQ =
        THREE.MathUtils.smoothstep(alt, 8_000, 16_000) *
        (1 - THREE.MathUtils.smoothstep(alt, 28_000, 50_000));
      return THREE.MathUtils.clamp(maxQ * 0.22 * thr, 0, 0.28);
    }
    if (phaseId === 'hotstage') return 0.03 * thr;
    if (phaseId === 'separate') return 0.02 * thr;
    if (phaseId === 'shipAscent') {
      const alt = flight.altitude || 0;
      return thr * 0.03 * (1 - THREE.MathUtils.smoothstep(alt, 90_000, 150_000));
    }
    return 0;
  }

  /**
   * Hard chase: look at vehicle, sit at a fixed rear-side offset.
   * No lookDown / limb plate / film composition — rocket stays centered.
   */
  function setVehicleChase(tx, ty, tz, dist) {
    desiredTargetLocal.set(tx, ty, tz);
    desiredCameraLocal.set(
      tx + dist * 0.55,
      ty + dist * 0.12,
      tz + dist * 0.78
    );
  }

  /**
   * Distance only for readability (true-scale stack is tiny vs Earth).
   * No act-based pull-backs or earth-limb plates.
   */
  function chaseDist(visAlt) {
    const altBoost = THREE.MathUtils.clamp(visAlt * 0.006, 0, 2_400);
    return 220 + altBoost;
  }

  function updateCamera(phaseId, _t = 0, _thrust = 0, _simDt = 1 / 60) {
    const pos = desiredCameraLocal;
    const target = desiredTargetLocal;
    const midLocal = root.userData.getStackMidHeight?.() ?? 70;
    const flags = assemblyFlags();
    const visAlt = flight.visualAltitude || 0;
    const dist = chaseDist(visAlt);

    // Focus on the vehicle every frame — pad hold and climb share one contract.
    if (!flight.separated || flags.stageCount === 1) {
      const rx = root.position.x;
      const ry = root.position.y;
      const rz = root.position.z;
      const focusY = ry + midLocal * 0.55;
      if (phaseId === 'countdown' || phaseId === 'ignition') {
        // Simple pad side view (no hero plate / FOV punch)
        setVehicleChase(0, midLocal * 0.55, 0, 160);
      } else {
        setVehicleChase(rx, focusY, rz, dist);
      }
    } else {
      // After sep: hard-chase upper stage only
      const sx = ship.position.x;
      const sy = ship.position.y + 22;
      const sz = ship.position.z;
      setVehicleChase(sx, sy, sz, dist);
    }

    desiredCameraWorld.copy(pos);
    desiredTargetWorld.copy(target);
    if (referenceFrame) {
      referenceFrame.localToWorld(desiredCameraWorld);
      referenceFrame.localToWorld(desiredTargetWorld);
    }

    // User rotated / zoomed: keep look-at on the rocket, preserve orbit offset.
    if (state.userFramed) {
      followTargetDelta.copy(desiredTargetWorld).sub(controls.target);
      camera.position.add(followTargetDelta);
      controls.target.copy(desiredTargetWorld);
      camSmoothed.copy(camera.position);
      camSmoothedInit = true;
      controls.update();
      return;
    }

    // Always hard-lock — no exponential lag that lets the stack outrun the cam
    camSmoothed.copy(desiredCameraWorld);
    camSmoothedInit = true;
    camera.position.copy(camSmoothed);
    controls.target.copy(desiredTargetWorld);

    // Fixed FOV — continuous FOV lerp reprojects the frame and fights bloom
    if (Math.abs(camera.fov - baseFov) > 0.05) {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    }
    controls.update();
  }

  function onControlsStart() {
    // Rotate / zoom only reframes the chase — never cancel follow.
    if (state.running && state.followCam) {
      state.userFramed = true;
    }
  }

  return {
    state,
    phases,
    start,
    stop,
    update,
    onControlsStart,
    /** Swap vehicle assembly after apply-to-pad */
    setStack(newStack) {
      rebind(newStack);
      resetPose();
    },
    getStack: () => root,
    reset: () => {
      state.running = false;
      resetPose();
      setPhase(0);
      emit();
    },
    setFollowCam(v) {
      state.followCam = v;
      if (v) {
        state.userOverride = false;
        // Re-enable default scripted chase until the user orbits again
        state.userFramed = false;
        camSmoothedInit = false;
      }
    },
    clearUserOverride() {
      state.userOverride = false;
      state.userFramed = false;
      camSmoothedInit = false;
    },
    setSpeed(v) {
      state.speed = v;
    },
    onUpdate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getPhaseLabel() {
      return phases[state.phaseIndex].label;
    },
    getFlight() {
      return flight;
    },
  };
}
