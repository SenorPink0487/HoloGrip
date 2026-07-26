/** Host adapter for the original reli-source thermodynamics apparatus. */
import { CalorimetryExperiment } from '../../reli/experiments/calorimetry.js';
import { ConvectionExperiment } from '../../reli/experiments/convection.js';
import { HeatConductionExperiment } from '../../reli/experiments/heatConduction.js';
import { IdealGasExperiment } from '../../reli/experiments/idealGas.js';
import { ThermalExpansionExperiment } from '../../reli/experiments/thermalExpansion.js';

/**
 * Host room already has a key light + shadow map. Source casters (thermal-expansion
 * heater coils especially) make the *first* open re-fill the shadow map and freeze
 * the view for a frame. Keep source self-lighting (PointLight) but never cast.
 */
function stripSourceShadowCasters(root) {
  if (!root?.traverse) return;
  root.traverse((object) => {
    if (object.isLight) {
      object.castShadow = false;
      return;
    }
    if (object.castShadow) object.castShadow = false;
    // Receive is cheap enough for contact grounding; leave as authored.
  });
}

/**
 * O(1) mount/unmount — never freeze-walk thermo source trees on open.
 * Detached rigs are free for updateMatrixWorld and picking.
 */
function mountRig(parent, rig, on) {
  if (!parent || !rig) return;
  if (on) {
    if (!rig.parent) parent.add(rig);
    rig.visible = true;
  } else {
    rig.visible = false;
    if (rig.parent) rig.parent.remove(rig);
  }
}

export function createStationEquipment(ctx) {
  const { THREE, renderer, camera } = ctx;
  const root = new THREE.Group();
  root.name = 'thermo-station';
  // Source rigs are bench-sized.  The host station table is smaller, so scale
  // the complete source model uniformly; no geometry is substituted.
  // Keep the source bench-top height after uniform scaling (source rigs use
  // local y≈0.88, while the host tabletop is y≈0.93).
  // Nudge toward table center (−Z from sitting edge) so desk sliders on z≈3.13 stay clear.
  root.position.set(4.2, 0.60, 2.45);
  root.scale.setScalar(0.38);

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 8;
  sourceCanvas.height = 8;
  sourceCanvas.style.touchAction = 'none';
  const classes = {
    calorimetry: CalorimetryExperiment,
    convection: ConvectionExperiment,
    'heat-conduction': HeatConductionExperiment,
    'ideal-gas': IdealGasExperiment,
    'thermal-expansion': ThermalExpansionExperiment,
  };
  const experiments = {};
  const animators = [];
  const lastParamSignatures = new Map();
  /** @type {string | null} */
  let activeId = null;

  for (const [id, Klass] of Object.entries(classes)) {
    const experiment = new Klass(renderer, sourceCanvas);
    experiment.setup();
    experiment.controls.enabled = false;
    experiment.rig.visible = false;
    experiment.rig.userData.sourceExperimentId = id;
    // Host owns room shadows — strip dense source casters (solid expansion coils…).
    stripSourceShadowCasters(experiment.rig);
    // Attach host semantic roles to source pick volumes so the existing
    // pointer-lock/AR resolver can operate on the original meshes.
    if (id === 'calorimetry') {
      experiment.hotBeaker.userData.interactive = true;
      experiment.hotBeaker.userData.role = 'thermo_hot_beaker';
      experiment.coldBeaker.userData.interactive = true;
      experiment.coldBeaker.userData.role = 'thermo_cold_beaker';
      experiment.rig.userData.interactive = true;
      experiment.rig.userData.role = 'thermo_calorimeter';
    } else if (id === 'ideal-gas') {
      experiment.piston.userData.interactive = true;
      experiment.piston.userData.role = 'thermo_piston';
    } else {
      experiment.rig.userData.interactive = true;
      experiment.rig.userData.role = `thermo_${id}`;
    }
    // Park detached — first open is O(1) parent.add, not a freeze walk.
    experiments[id] = experiment;
  }

  function setMode(expId) {
    const next = expId && experiments[expId] ? expId : null;
    if (activeId === next) return;
    if (activeId && experiments[activeId]) {
      mountRig(root, experiments[activeId].rig, false);
    }
    activeId = next;
    if (next && experiments[next]) {
      mountRig(root, experiments[next].rig, true);
    }
  }

  function syncParams(expId, data, opts = {}) {
    const exp = experiments[expId];
    if (!exp || !data) return;
    const next = exp.params;
    const signatureKeys = expId === 'calorimetry'
      ? ['tHot', 'tCold', 'mHot', 'mCold']
      : expId === 'convection'
        ? ['tPlate', 'tAir', 'area', 'running']
        : expId === 'heat-conduction'
          ? ['tHot', 'tCold', 'conductivity', 'running']
          : expId === 'ideal-gas'
            ? ['temperature', 'volume']
            : ['temperature', 'length0', 'material'];
    const signature = signatureKeys.map((key) => `${key}:${data[key]}`).join('|');
    const changed = lastParamSignatures.get(expId) !== signature;
    lastParamSignatures.set(expId, signature);
    if (expId === 'calorimetry') {
      Object.assign(next, { tHot: data.tHot, tCold: data.tCold, mHot: data.mHot, mCold: data.mCold });
      // onParamChange resets mix when cups are full — only when user params change.
      if (changed) exp.onParamChange();
      // Let the source's phased approach → tilt/stream → return animation
      // commit the cup only when its own state machine reaches the end.
      if (data.cupHot && !exp.cup.hasHot && !exp.pour) exp._commitPour('hot');
      if (data.cupCold && !exp.cup.hasCold && !exp.pour) exp._commitPour('cold');
      // Host is single source of truth for mix clock (see updateSource).
      if (data.mixProgress != null) exp.mixProgress = Number(data.mixProgress);
      if (data.tCurrent != null) exp.tCurrent = data.tCurrent;
      // Visual paint is owned by updateSource so we do not double _syncVisuals
      // every frame (was a major thermo hitch + 2× mix advance path).
      if (opts.forceVisual) exp._syncVisuals?.();
    } else if (expId === 'convection') {
      Object.assign(next, { tPlate: data.tPlate, tAir: data.tAir, area: data.area, running: data.running });
      // Plate scale only depends on area; other params feed the live particle sim.
      if (changed) exp.onParamChange('area');
    } else if (expId === 'heat-conduction') {
      Object.assign(next, { tHot: data.tHot, tCold: data.tCold, conductivity: data.conductivity, running: data.running });
      if (changed) {
        exp.onParamChange('tHot');
        exp.onParamChange('tCold');
      }
      // Host owns the finite-difference field; copy into source for coloring.
      if (data.temps?.length && exp.temps?.length) {
        const n = Math.min(data.temps.length, exp.temps.length);
        for (let i = 0; i < n; i += 1) exp.temps[i] = data.temps[i];
      }
    } else if (expId === 'ideal-gas') {
      const prevT = next.temperature;
      const prevV = next.volume;
      Object.assign(next, { temperature: data.temperature, volume: data.volume });
      if (changed) {
        // Only rescale velocities / rebuild piston when the quantized value moved.
        if (prevT !== next.temperature) exp.onParamChange('temperature');
        if (prevV !== next.volume) exp.onParamChange('volume');
      }
    } else if (expId === 'thermal-expansion') {
      Object.assign(next, { temperature: data.temperature, length0: data.length0, material: data.material });
      if (changed) {
        exp.onParamChange('material');
        exp.onParamChange('length0');
      }
    }
  }

  function updateState(expId, data, opts = {}) {
    syncParams(expId, data, opts);
  }

  /**
   * Advance source visuals. Host manager owns discrete physics for calorimetry
   * mix + heat-conduction FD; source must not re-integrate those (2× speed bug).
   */
  function updateSource(expId, dt) {
    const exp = experiments[expId];
    if (!exp) return;
    const h = Math.min(dt, 0.05);
    // Keep source clock alive for glow/pulse animations.
    exp.clock.getDelta();

    if (expId === 'calorimetry') {
      // Pour animation is source-owned; mix progress is host-owned.
      if (exp.pour) {
        exp._updatePour?.(h);
      } else {
        // Keep the stirrer alive while the host mix clock runs (source.update
        // no longer advances mix, so it would never spin otherwise).
        if (
          exp.cup?.hasHot
          && exp.cup?.hasCold
          && Number(exp.mixProgress || 0) < 0.98
          && exp.stirrer
        ) {
          const dT = Math.abs(Number(exp.params?.tHot || 0) - Number(exp.params?.tCold || 0));
          const stir = 3.2 + (dT / 60) * 2.5;
          exp.stirrer.rotation.y += h * stir;
        }
        exp._syncVisuals?.();
      }
      return;
    }

    if (expId === 'heat-conduction') {
      // Skip source FD (host already stepped d.temps and copied into exp.temps).
      exp._hostFieldOwned = true;
      exp.update?.(h);
      return;
    }

    exp.update?.(h);

    if (expId === 'convection' && exp.smoke?.material?.uniforms) {
      // Source demo is 1:1; host rig is scaled down. Apply absolute host
      // scale once per frame (never multiply size buffers — that was O(N)
      // and fought the particle writer every tick).
      const spriteScale = 0.45;
      const heat = THREE.MathUtils.clamp(
        Math.max(0, (exp.params?.tPlate || 650) - (exp.params?.tAir || 300)) / 520,
        0,
        1,
      );
      exp.smoke.material.uniforms.uScale.value = (300 + heat * 80) * spriteScale;
      exp.smoke.material.uniforms.uOpacity.value = (exp.params?.running === false ? 0.12 : 0.55) * 0.80;
    }
  }

  animators.push((_t) => {
    const state = ctx.getExperimentState?.();
    // Only drive the active experiment while running — never keep a leftover
    // visible rig integrating after cleanup (setMode null hides all).
    const activeId = state?.running && experiments[state.expId] ? state.expId : null;
    if (!activeId) return;
    updateSource(activeId, state?._dt || 1 / 60);
  });

  const equipment = {
    setMode,
    showcase: () => setMode(null),
    shutdown: () => setMode(null),
    suspend: () => setMode(null),
    resume: () => { /* mode restored by experiment applyVisualDefaults */ },
    updateState,
    updateSource,
    pour: (kind) => {
      const exp = experiments.calorimetry;
      const beaker = kind === 'hot' ? exp.hotBeaker : exp.coldBeaker;
      if (exp.cup?.[kind === 'hot' ? 'hasHot' : 'hasCold'] || exp.pour) return false;
      exp._beginPour(kind, beaker);
      return true;
    },
    getPourState: () => {
      const p = experiments.calorimetry.pour;
      return p ? { active: true, phase: p.phase, t: p.t } : { active: false };
    },
    reset: (expId) => {
      lastParamSignatures.delete(expId);
      const exp = experiments[expId];
      exp?.reset?.();
      // Host never uses OrbitControls on the dummy canvas.
      if (exp?.controls) exp.controls.enabled = false;
      if (exp) exp._hostFieldOwned = expId === 'heat-conduction';
    },
    /** Read live source counters (ideal-gas collisions) after visual tick. */
    getSourceMetrics: (expId) => {
      const exp = experiments[expId];
      if (!exp) return null;
      if (expId === 'ideal-gas') {
        return {
          collisionsPerSec: Number(exp.collisionsPerSec || 0),
          collisionWindow: Number(exp.collisionWindow || 0),
        };
      }
      return null;
    },
    sourceExperiments: experiments,
  };

  // Heat conduction field is always host-driven in this integration.
  if (experiments['heat-conduction']) {
    experiments['heat-conduction']._hostFieldOwned = true;
  }

  // Per-experiment GPU compile so first open does not hitch on shader/material
  // first-use (boot warmAll previously only compiled the last visible thermo rig).
  const prewarm = Object.fromEntries(
    Object.keys(experiments).map((id) => [id, () => {
      const exp = experiments[id];
      if (!exp?.rig) return;
      // Temporarily mount for compile, then park again (O(1)).
      mountRig(root, exp.rig, true);
      try {
        // Seed one visual tick so emissive/coil materials match first-open state
        // (thermal-expansion heater especially) before compile.
        if (typeof exp.update === 'function') {
          try { exp.clock?.getDelta?.(); } catch { /* ignore */ }
          exp.update(1 / 60);
        }
        exp.rig.updateWorldMatrix?.(true, true);
        if (renderer && camera) renderer.compile?.(exp.rig, camera);
      } catch { /* full scene paint is done by warmAll */ }
      // Leave only the active experiment mounted.
      if (activeId !== id) mountRig(root, exp.rig, false);
    }]),
  );

  setMode(null);
  return { root, equipment, animators, prewarm, refs: experiments };
}
