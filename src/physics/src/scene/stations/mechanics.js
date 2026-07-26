/** Host scene adapter for the six source-authored mechanics experiments. */
import {
  MechanicsSourceRuntime,
  SOURCE_MECHANICS_EXPERIMENTS,
} from './mechanicsSourceRuntime.js';
import { station as mechanicsCatalog } from '../../experiments/mechanics.js';

const MECHANICS_DEFAULTS = Object.fromEntries(
  (mechanicsCatalog.experiments || []).map((exp) => [exp.id, { ...(exp.defaults || {}) }]),
);

export function createStationEquipment(ctx) {
  const { THREE, camera, renderer } = ctx;
  const root = new THREE.Group();
  root.name = 'mechanics-station';
  const runtimes = {};
  let activeId = null;

  for (const id of Object.keys(SOURCE_MECHANICS_EXPERIMENTS)) {
    const runtime = new MechanicsSourceRuntime({ id, camera, renderer });
    root.add(runtime.root);
    runtimes[id] = runtime;
  }

  function defaultsFor(id) {
    return { ...(MECHANICS_DEFAULTS[id] || {}) };
  }

  function ensure(id, params = {}) {
    const runtime = runtimes[id];
    // Prefer host catalog defaults so first open matches prewarm (no rebuild).
    const initial = Object.keys(params || {}).length ? params : defaultsFor(id);
    runtime?.ensureBuilt(initial);
    return runtime;
  }

  function setMode(id, params = null, { reset = false, snapshot = true } = {}) {
    activeId = runtimes[id] ? id : null;
    const resolved = params || (activeId ? defaultsFor(activeId) : {});
    // Ensure active rig exists before visibility pass so ensureBuilt can attach.
    const runtime = activeId ? ensure(activeId, resolved) : null;
    Object.entries(runtimes).forEach(([runtimeId, rt]) => {
      rt.setVisible(runtimeId === activeId);
    });
    if (runtime && reset) runtime.reset(resolved);
    // Snapshot is optional: switch path uses visibility-only first, then soft reset.
    if (!snapshot || !runtime) return null;
    return runtime.snapshot?.({ forceReadouts: !!reset }) || null;
  }

  const equipment = {
    setMode,
    /** Idle: keep last apparatus if any; null hides all (mechanics has no single museum rig). */
    showcase: () => { /* tables stay; active experiment mesh only when hot */ },
    shutdown: () => setMode(null, null, { reset: false, snapshot: false }),
    suspend: () => setMode(null, null, { reset: false, snapshot: false }),
    resume: () => { /* mode restored by experiment applyVisualDefaults */ },
    reset: (id, params) => ensure(id, params || defaultsFor(id))?.reset(params || defaultsFor(id)),
    setParam: (id, key, value) => ensure(id)?.setParam(key, value),
    setPaused: (id, paused) => ensure(id)?.setPaused(paused),
    action: (id, action) => ensure(id)?.action(action) || false,
    updateSource: (id, dt) => ensure(id)?.update(dt),
    snapshot: (id) => ensure(id)?.snapshot(),
    beginBallDrag: (diameterMm) => ensure('viscosity')?.beginBallDrag(diameterMm) || false,
    updateBallDrag: (totalX, totalY) => ensure('viscosity')?.updateBallDrag(totalX, totalY) || false,
    endBallDrag: (cancelled) => ensure('viscosity')?.endBallDrag(cancelled) || false,
    get activeId() { return activeId; },
    sourceRuntimes: runtimes,
  };

  const prewarm = Object.fromEntries(
    Object.keys(runtimes).map((id) => [id, () => {
      // Build with the SAME defaults as first open, attach + compile under the
      // loader, then detach. First user switch must not hard-rebuild the source.
      const runtime = ensure(id, defaultsFor(id));
      // sync freeze under the loader — do not leave coop jobs pending for boot.
      runtime.setVisible(true, { sync: true });
      try {
        runtime.root.updateWorldMatrix?.(true, true);
        if (renderer && camera) renderer.compile?.(runtime.root, camera);
      } catch { /* full scene paint is done by warmAll */ }
      runtime.setVisible(false, { sync: true });
    }]),
  );

  setMode(null);
  return { root, equipment, animators: [], prewarm, refs: runtimes };
}
