/**
 * Experiment manager — routes interactions to per-station handlers.
 */
import { STATION_EXPERIMENTS, STATION_MODULES } from './registry.js';
import { isParamSliderAction, valueFromParamSliderPick } from '../holoScreen.js';
import { labFrameScheduler } from '../frameBudget.js';

/** Create manager bound to scene equipment refs */
export function createExperimentManager({
  equipment,
  onHudUpdate,
  onToast,
  /** Optional external scheduler; defaults to shared lab frame budget. */
  scheduler = labFrameScheduler,
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

  /**
   * HUD canvas paint is expensive — never flush on the click microtask.
   * Snapshot eagerly, paint on the frame budget after WebGL present.
   */
  let pendingHudPayload = null;

  function buildHudPayload() {
    const st = currentStation();
    const exp = currentExp();
    const step = currentStep();
    return {
      menuOpen: state.menuOpen,
      station: st,
      experiment: exp,
      stepIndex: state.stepIndex,
      step,
      running: state.running,
      // Shallow copy is enough; handlers own nested mutation carefully.
      data: state.data ? { ...state.data } : {},
      stations: STATION_EXPERIMENTS,
    };
  }

  function flushHudNow() {
    if (!onHudUpdate || !pendingHudPayload) return;
    const payload = pendingHudPayload;
    pendingHudPayload = null;
    try {
      // onHudUpdate must stay cheap (store snapshot + schedule canvas jobs only).
      onHudUpdate(payload);
    } catch { /* never break the frame over HUD */ }
  }

  function pushHud() {
    if (!onHudUpdate) return;
    pendingHudPayload = buildHudPayload();
    // After WebGL present only. One job per pulse — never chain with geometry work.
    scheduler.schedule('hud:paint', flushHudNow, { priority: 100 });
  }

  /** Force a HUD paint on the next drain without waiting for another push. */
  function requestHudPaint() {
    if (pendingHudPayload || !onHudUpdate) {
      scheduler.schedule('hud:paint', flushHudNow, { priority: 100 });
      return;
    }
    pushHud();
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

  function setSelectorActive(stationId, on) {
    Object.values(equipment.holos || {}).forEach((h) => {
      if (!h?.userData) return;
      const active = on && h.userData.stationId === stationId;
      h.userData.active = active;
      if (typeof h.userData.draw === 'function') h.userData.draw(active);
    });
  }

  function openStationMenu(stationId) {
    state.stationId = stationId;
    state.menuOpen = true;
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    setSelectorActive(stationId, true);
    // Content display stays hidden until an experiment card is chosen.
    Object.values(equipment.displays || {}).forEach((d) => {
      d?.userData?.setPresent?.(false);
    });
    toast(`已打开 ${STATION_EXPERIMENTS[stationId]?.title || ''} · 请选择实验`);
    pushHud();
  }

  function closeMenu() {
    state.menuOpen = false;
    setSelectorActive(null, false);
    Object.values(equipment.displays || {}).forEach((d) => {
      d?.userData?.setPresent?.(false);
    });
    pushHud();
  }

  function startExperiment(expId) {
    const st = currentStation();
    if (!st) return;
    const exp = st.experiments.find((e) => e.id === expId);
    if (!exp) return;
    const h = handlers[st.id];
    const prevExpId = state.running ? state.expId : null;
    const prevHandlers = prevExpId ? handlers[st.id] : null;

    // Bookkeeping only — this may still run on a post-render budget pulse, not
    // the browser click stack (main.startExperimentSafe defers us).
    state.expId = expId;
    state.stepIndex = 0;
    state.running = true;
    state.menuOpen = true;
    state.data = h?.initData(expId) || {};
    state.data._apparatusReady = false;
    // Defer toast/HUD one more schedule tick so this pulse stays tiny.
    scheduler.schedule('exp:toast', () => {
      toast(`开始实验：${exp.name}`);
    }, { priority: 150 });
    pushHud();

    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');

    if (prevExpId && prevHandlers?.cleanup) {
      const cleanupId = prevExpId;
      scheduler.schedule('exp:cleanup', () => {
        try { prevHandlers.cleanup?.(cleanupId); } catch { /* ignore */ }
      }, { priority: 80 });
    }

    scheduler.schedule('exp:visuals', () => {
      if (!state.running || state.expId !== expId) return;
      try { h?.applyVisualDefaults?.(expId); } catch { /* keep HUD up */ }
      if (state.data) state.data._apparatusReady = true;
      scheduler.schedule('exp:visuals-hud', () => {
        if (!state.running || state.expId !== expId) return;
        pushHud();
      }, { priority: 90 });
    }, { priority: 70 });
  }

  function interact(target, t) {
    // Tabletop hologram terminal: power on the station + front content display.
    if (
      target?.userData?.type === 'holo'
      || target?.userData?.role === 'holo_selector'
    ) {
      const sid = target.userData.stationId;
      // Already showing this station's screen — leave open for UV button picks in main.js
      if (state.menuOpen && state.stationId === sid) {
        return true;
      }
      openStationMenu(sid);
      return true;
    }

    // Content display itself does not open the station; tabletop selector does.
    if (
      target?.userData?.type === 'holo_display'
      || target?.userData?.role === 'holo_display'
    ) {
      const sid = target.userData.stationId;
      if (state.menuOpen && state.stationId === sid) return true;
      toast('请先瞄准桌面全息终端激活内容屏');
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

  function mouseDragTotalX() {
    return Number(
      equipment?.electro?.mouseDrag?.movementX
      ?? equipment?.optics?.mouseDrag?.movementX
      ?? equipment?.mechanics?.mouseDrag?.movementX
      ?? equipment?.thermo?.mouseDrag?.movementX
      ?? 0,
    );
  }

  function resolveSliderPick(target, context = {}) {
    let pick = context.pick;
    if (isParamSliderAction(pick?.action)) return pick;
    if (context.raycaster && target?.userData?.pickFromRay) {
      const live = target.userData.pickFromRay(context.raycaster);
      if (isParamSliderAction(live?.action)) return live;
    }
    return null;
  }

  function dispatchSliderValue(pick, value, live = true) {
    if (!Number.isFinite(value)) return false;
    if (pick.action === 'faraday-b-slider') {
      return !!uiAction('faraday-b-set', { value });
    }
    if (pick.action === 'induced-e-slider') {
      return !!uiAction('induced-e-set', { key: pick.key, value, live });
    }
    // Generic param-slider → experiment setAction
    if (!pick.setAction) return false;
    return !!uiAction(pick.setAction, {
      key: pick.key,
      value,
      axis: pick.axis,
      target: pick.target,
      live,
    });
  }

  function armUiSlider(pick, value) {
    const min = Number(pick.min);
    const max = Number(pick.max);
    state.data._uiSlider = {
      action: pick.action,
      setAction: pick.setAction || null,
      key: pick.key || null,
      axis: pick.axis || null,
      target: pick.target || null,
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 1,
      base: Number.isFinite(value) ? value : null,
      originX: mouseDragTotalX(),
    };
  }

  function applyUiSliderRelative(totalX) {
    const s = state.data._uiSlider;
    if (!s) return false;
    if (!Number.isFinite(s.base)) return false;
    const span = Number(s.max) - Number(s.min);
    const next = Math.max(
      s.min,
      Math.min(s.max, Number(s.base) + Number(totalX || 0) * span * 0.0028),
    );
    return dispatchSliderValue({
      action: s.action,
      setAction: s.setAction,
      key: s.key,
      axis: s.axis,
      target: s.target,
      min: s.min,
      max: s.max,
    }, next, true);
  }

  function clearUiSlider() {
    if (!state.data?._uiSlider) return false;
    state.data._uiSlider = null;
    pushHud();
    return true;
  }

  function beginManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    const sliderPick = resolveSliderPick(target, context);
    // Faraday / induced keep station-specific measurement bookkeeping; still
    // arm the shared continuous-drag state so holdInteract can drive them.
    if (sliderPick) {
      const value = valueFromParamSliderPick(sliderPick);
      armUiSlider(sliderPick, value);
      if (sliderPick.action === 'param-slider') {
        if (Number.isFinite(value)) dispatchSliderValue(sliderPick, value, true);
        return true;
      }
      // Fall through so Faraday/induced beginManipulation can record / set key.
    }
    const h = activeHandlers();
    if (h?.beginManipulation) {
      const ok = h.beginManipulation(target, context) || false;
      if (ok && sliderPick && state.data._uiSlider && Number.isFinite(valueFromParamSliderPick(sliderPick))) {
        // Re-base after station handler absolute jump (e.g. induced-e).
        const v = valueFromParamSliderPick(sliderPick);
        if (Number.isFinite(v)) state.data._uiSlider.base = v;
      }
      return ok;
    }
    return interact(target, context.time ?? 0);
  }

  function updateManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    const s = state.data._uiSlider;
    if (s) {
      // Prefer absolute UV pick when the ray still hits the same control.
      if (context.raycaster && target?.userData?.pickFromRay) {
        const live = target.userData.pickFromRay(context.raycaster);
        if (isParamSliderAction(live?.action)
          && live.action === s.action
          && (!s.key || live.key === s.key)
          && (!s.axis || live.axis === s.axis)
          && Number.isFinite(live.px)) {
          const value = valueFromParamSliderPick(live);
          if (Number.isFinite(value)) {
            dispatchSliderValue(live, value, true);
            s.base = value;
            s.originX = Number.isFinite(context.totalX)
              ? Number(context.totalX)
              : mouseDragTotalX();
            return true;
          }
        }
      }
      const totalX = Number.isFinite(context.totalX)
        ? Number(context.totalX)
        : mouseDragTotalX();
      applyUiSliderRelative(totalX - Number(s.originX || 0));
      return true;
    }
    return activeHandlers()?.updateManipulation?.(target, context) || false;
  }

  function endManipulation(target, context = {}) {
    if (!state.running || !state.expId) return false;
    const hadSlider = !!state.data._uiSlider;
    // Station handler first (Faraday records induction, induced clears flags).
    const ok = activeHandlers()?.endManipulation?.(target, context) || false;
    if (hadSlider) {
      clearUiSlider();
      return true;
    }
    return ok;
  }

  function onKey(code, t) {
    if (!state.running) return false;
    return activeHandlers()?.onKey(code, t) || false;
  }

  function onWheel(delta, target, pick) {
    if (!state.running) return false;
    return activeHandlers()?.onWheel(delta, target, pick) || false;
  }

  function uiAction(action, payload) {
    if (!state.running) return false;
    return activeHandlers()?.onUiAction?.(action, payload) || false;
  }

  function holdInteract(holding, t, dt, target) {
    if (!state.running) return;
    const s = state.data._uiSlider;
    if (s) {
      if (holding) {
        applyUiSliderRelative(mouseDragTotalX() - Number(s.originX || 0));
        return;
      }
      // Release continuous slider; station endManipulation may also run from
      // pointerup — clear here so a pure hold path (pointer-lock) finishes.
      activeHandlers()?.endManipulation?.(target, { time: t });
      clearUiSlider();
      return;
    }
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
    const eid = state.expId;
    const h = activeHandlers();
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    state.menuOpen = true;
    toast('已退出当前实验');
    pushHud();
    // Cleanup off the click frame — hide via setMode is cheap when scheduled.
    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');
    if (h?.cleanup && eid) {
      scheduler.schedule('exp:cleanup', () => {
        try { h.cleanup?.(eid); } catch { /* ignore */ }
      }, { priority: 80 });
    }
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
    requestHudPaint,
    currentExp,
    currentStation,
    currentStep,
  };
}
