/**
 * Experiment manager — routes interactions to per-station handlers.
 */
import { STATION_EXPERIMENTS, STATION_MODULES } from './registry.js';

/** Create manager bound to scene equipment refs */
export function createExperimentManager({
  equipment,
  onHudUpdate,
  onToast,
}) {
  const state = {
    stationId: null,
    expId: null,
    stepIndex: 0,
    running: false,
    data: {},
    menuOpen: false,
  };

  function currentStation() {
    return state.stationId ? STATION_EXPERIMENTS[state.stationId] : null;
  }
  function currentExp() {
    const st = currentStation();
    if (!st || !state.expId) return null;
    return st.experiments.find((e) => e.id === state.expId) || null;
  }
  function currentStep() {
    const exp = currentExp();
    if (!exp) return null;
    return exp.steps[state.stepIndex] || null;
  }

  function toast(msg) {
    if (onToast) onToast(msg);
  }

  function pushHud() {
    if (!onHudUpdate) return;
    const st = currentStation();
    const exp = currentExp();
    const step = currentStep();
    onHudUpdate({
      menuOpen: state.menuOpen,
      station: st,
      experiment: exp,
      stepIndex: state.stepIndex,
      step,
      running: state.running,
      data: { ...state.data },
      stations: STATION_EXPERIMENTS,
    });
  }

  function advanceStep() {
    const exp = currentExp();
    if (!exp) return;
    if (state.stepIndex < exp.steps.length - 1) {
      state.stepIndex += 1;
      toast(`步骤 ${state.stepIndex + 1}/${exp.steps.length}`);
    } else {
      toast('实验完成！可返回菜单选择其他实验');
      state.data.completed = true;
    }
    pushHud();
  }

  function setStep(id) {
    const exp = currentExp();
    if (!exp) return;
    const idx = exp.steps.findIndex((s) => s.id === id);
    if (idx >= 0 && idx > state.stepIndex) {
      state.stepIndex = idx;
      pushHud();
    }
  }

  const ctx = {
    state,
    equipment,
    toast,
    pushHud,
    advanceStep,
    setStep,
    currentStep,
    currentExp,
    currentStation,
  };

  /** @type {Record<string, ReturnType<typeof STATION_MODULES[string]['createHandlers']>>} */
  const handlers = {};
  for (const [id, mod] of Object.entries(STATION_MODULES)) {
    handlers[id] = mod.createHandlers(ctx);
  }

  function activeHandlers() {
    return state.stationId ? handlers[state.stationId] : null;
  }

  function openStationMenu(stationId) {
    state.stationId = stationId;
    state.menuOpen = true;
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    Object.values(equipment.holos || {}).forEach((h) => {
      if (!h?.userData) return;
      const on = h.userData.stationId === stationId;
      h.userData.active = on;
      if (typeof h.userData.draw === 'function') h.userData.draw(on);
    });
    toast(`已打开 ${STATION_EXPERIMENTS[stationId]?.title || ''} 实验菜单`);
    pushHud();
  }

  function closeMenu() {
    state.menuOpen = false;
    Object.values(equipment.holos || {}).forEach((h) => {
      if (!h?.userData) return;
      h.userData.active = false;
      if (typeof h.userData.draw === 'function') h.userData.draw(false);
    });
    pushHud();
  }

  function startExperiment(expId) {
    const st = currentStation();
    if (!st) return;
    const exp = st.experiments.find((e) => e.id === expId);
    if (!exp) return;
    const h = handlers[st.id];
    if (state.running && state.expId) h?.cleanup?.(state.expId);
    state.expId = expId;
    state.stepIndex = 0;
    state.running = true;
    state.menuOpen = true;
    state.data = h?.initData(expId) || {};
    h?.applyVisualDefaults?.(expId);
    toast(`开始实验：${exp.name} — 在全息屏查看步骤，瞄准仪器操作`);
    pushHud();
  }

  function interact(target, t) {
    // Hologram terminal: open station UI (screen content is drawn on the holo itself)
    if (target?.userData?.type === 'holo') {
      const sid = target.userData.stationId;
      // Already showing this station's screen — leave open for UV button picks in main.js
      if (state.menuOpen && state.stationId === sid) {
        return true;
      }
      openStationMenu(sid);
      return true;
    }

    if (!state.running || !state.expId) {
      return false;
    }

    const step = currentStep();
    if (!step) return false;

    const h = activeHandlers();
    if (h?.interact(target, t, step)) return true;

    return false;
  }

  function beginManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    const h = activeHandlers();
    if (h?.beginManipulation) return h.beginManipulation(target, context) || false;
    return interact(target, context.time ?? 0);
  }

  function updateManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    return activeHandlers()?.updateManipulation?.(target, context) || false;
  }

  function endManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    return activeHandlers()?.endManipulation?.(target, context) || false;
  }

  function onKey(code, t) {
    if (!state.running) return false;
    return activeHandlers()?.onKey(code, t) || false;
  }

  function onWheel(delta, target) {
    if (!state.running) return false;
    return activeHandlers()?.onWheel(delta, target) || false;
  }

  function uiAction(action, payload) {
    if (!state.running) return false;
    return activeHandlers()?.onUiAction?.(action, payload) || false;
  }

  function holdInteract(holding, t, dt, target) {
    if (!state.running) return;
    activeHandlers()?.holdInteract(holding, t, dt, target);
  }

  function onFocus(target) {
    if (!state.running) return;
    activeHandlers()?.onFocus?.(target);
  }

  function update(t, dt) {
    if (!state.running) return state.data;
    const h = activeHandlers();
    if (h) return h.update(t, dt);
    return state.data;
  }

  function exitExperiment() {
    activeHandlers()?.cleanup?.(state.expId);
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    state.menuOpen = true;
    toast('已退出当前实验');
    pushHud();
  }

  return {
    state,
    openStationMenu,
    closeMenu,
    startExperiment,
    exitExperiment,
    interact,
    beginManipulation,
    updateManipulation,
    endManipulation,
    onKey,
    onWheel,
    uiAction,
    holdInteract,
    onFocus,
    update,
    pushHud,
    currentExp,
    currentStation,
    currentStep,
  };
}
