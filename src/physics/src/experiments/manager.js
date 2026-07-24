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

  /**
   * @param {string|null} stationId
   * @param {boolean} on
   * @param {{ paint?: boolean }} [opts] paint=false for close path (no sync canvas hitch)
   */
  function setSelectorActive(stationId, on, opts = {}) {
    const paint = opts.paint !== false;
    Object.values(equipment.holos || {}).forEach((h) => {
      if (!h?.userData) return;
      const active = on && h.userData.stationId === stationId;
      h.userData.active = active;
      // Closing used to call draw() on every station hologram — multi-canvas hitch.
      if (paint && typeof h.userData.draw === 'function') h.userData.draw(active);
    });
  }

  function openStationMenu(stationId) {
    state.stationId = stationId;
    state.menuOpen = true;
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    setSelectorActive(stationId, true, { paint: true });
    // Content display stays hidden until an experiment card is chosen.
    Object.values(equipment.displays || {}).forEach((d) => {
      d?.userData?.setPresent?.(false);
    });
    toast(`已打开 ${STATION_EXPERIMENTS[stationId]?.title || ''} · 请选择实验`);
    pushHud();
  }

  function closeMenu() {
    // Visibility/flags only on the call stack — no canvas, no apparatus work.
    state.menuOpen = false;
    setSelectorActive(null, false, { paint: false });
    Object.values(equipment.displays || {}).forEach((d) => {
      if (d?.userData) {
        d.userData.maximized = false;
        d.userData.boundHud = null;
        d.userData.boundDataHtml = '';
        d.userData._contentExpId = null;
      }
      d?.userData?.setPresent?.(false);
    });
    scheduler.cancel('exp:switch');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');
    // HUD paint next pulse (not on the click frame).
    scheduler.schedule('exp:close-hud', () => pushHud(), { priority: 40 });
  }

  function startExperiment(expId) {
    const st = currentStation();
    if (!st) return;
    const exp = st.experiments.find((e) => e.id === expId);
    if (!exp) return;
    const h = handlers[st.id];
    const prevExpId = state.running ? state.expId : null;
    const prevHandlers = prevExpId ? handlers[st.id] : null;

    // Bookkeeping only — keep this microtask tiny so the click frame can paint.
    state.expId = expId;
    state.stepIndex = 0;
    state.running = true;
    state.menuOpen = true;
    state.data = h?.initData(expId) || {};
    state.data._apparatusReady = false;

    // Abort any in-flight switch chain from a previous card click.
    scheduler.cancel('exp:switch');
    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');
    scheduler.cancel('exp:toast');

    // Multi-frame switch: one step → rest frame (camera) → next step.
    // Never stack cleanup + setMode + dense HUD on consecutive busy frames.
    const steps = [];
    steps.push(() => {
      if (!state.running || state.expId !== expId) return;
      toast(`开始实验：${exp.name}`);
      // Shell / warm-cache paint only — dense layout is a later chain step.
      pushHud();
    });
    if (prevExpId && prevHandlers?.cleanup) {
      const cleanupId = prevExpId;
      steps.push(() => {
        try { prevHandlers.cleanup?.(cleanupId); } catch { /* ignore */ }
      });
    }
    steps.push(() => {
      if (!state.running || state.expId !== expId) return;
      try { h?.applyVisualDefaults?.(expId); } catch { /* keep HUD up */ }
      if (state.data) state.data._apparatusReady = true;
    });
    steps.push(() => {
      if (!state.running || state.expId !== expId) return;
      // Second HUD pass after apparatus is visible (readouts / live hits).
      pushHud();
    });

    if (typeof scheduler.scheduleChain === 'function') {
      scheduler.scheduleChain('exp:switch', steps, { priority: 70, restFrames: 1 });
    } else {
      // Fallback if a test injects a minimal scheduler.
      steps.forEach((fn, i) => {
        scheduler.schedule(`exp:switch:${i}`, fn, { priority: 70 - i });
      });
    }
    // Soft-switch: main loop skips animators/focus while the chain drains.
    scheduler.beginSoftSwitch?.(28);
    scheduler.rest?.(2);
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
    // No toast/pushHud on the click stack — schedule so camera keeps frames.
    scheduler.cancel('exp:switch');
    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');
    scheduler.cancel('exp:toast');
    scheduler.cancel('exp:close-hud');
    scheduler.beginSoftSwitch?.(10);
    scheduler.rest?.(1);
    if (typeof scheduler.scheduleChain === 'function') {
      const steps = [];
      if (h?.cleanup && eid) {
        steps.push(() => {
          try { h.cleanup?.(eid); } catch { /* ignore */ }
        });
      }
      steps.push(() => {
        toast('已退出当前实验');
        pushHud();
      });
      scheduler.scheduleChain('exp:exit', steps, { priority: 45, restFrames: 1 });
    } else {
      if (h?.cleanup && eid) {
        scheduler.schedule('exp:cleanup', () => {
          try { h.cleanup?.(eid); } catch { /* ignore */ }
        }, { priority: 45 });
      }
      scheduler.schedule('exp:close-hud', () => {
        toast('已退出当前实验');
        pushHud();
      }, { priority: 40 });
    }
  }

  /**
   * Close terminal / big screen (× button).
   * Click frame: stop sim + hide UI/apparatus visibility only.
   * Heavy freeze/cleanup/HUD: later pulses with camera rests.
   */
  function closeStationUi() {
    const sid = state.stationId;
    const eid = state.running ? state.expId : null;
    const h = eid && sid ? handlers[sid] : null;

    // 1) Stop simulation bookkeeping immediately (update() becomes no-op).
    state.running = false;
    state.expId = null;
    state.stepIndex = 0;
    state.data = {};
    state.menuOpen = false;

    // 2) Hide content panels — visibility only, no canvas paint.
    setSelectorActive(null, false, { paint: false });
    Object.values(equipment.displays || {}).forEach((d) => {
      if (!d?.userData) return;
      d.userData.maximized = false;
      d.userData.boundHud = null;
      d.userData.boundDataHtml = '';
      d.userData._contentExpId = null;
      // Cheap hide: flip flags/visibility without raycast rebinding thrash.
      d.userData.present = false;
      d.userData.active = false;
      d.visible = false;
      if (typeof d.userData.setPresent === 'function') {
        // Prefer full setPresent when cheap path already flipped; only if needed.
        try { d.userData.setPresent(false); } catch { /* ignore */ }
      }
    });
    Object.values(equipment.holos || {}).forEach((holo) => {
      if (holo?.userData) {
        holo.userData.maximized = false;
        holo.userData.active = false;
      }
    });

    // 3) Instantly hide dense apparatus so the *next* WebGL frame is cheap.
    //    (Previously cleanup ran 2+ frames later and left optics geo on-screen.)
    try {
      if (sid === 'optics') {
        if (typeof equipment.optics?.hideAll === 'function') equipment.optics.hideAll();
        else equipment.optics?.setMode?.('off');
      } else if (sid === 'thermo') {
        equipment.thermo?.setMode?.(null);
      } else if (sid === 'electro') {
        equipment.electro?.setMode?.(null);
      } else if (sid === 'mechanics') {
        equipment.mechanics?.setMode?.(null, null, { reset: false, snapshot: false });
      }
    } catch { /* best-effort visibility hide */ }

    // 4) Cancel in-flight work; keep camera-first soft window.
    scheduler.cancel('exp:switch');
    scheduler.cancel('exp:exit');
    scheduler.cancel('exp:shutdown');
    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');
    scheduler.cancel('exp:toast');
    scheduler.cancel('exp:close-hud');
    scheduler.cancel('optics:open-geo');
    scheduler.cancel('optics:open-diff');
    scheduler.cancel('optics:rays');
    scheduler.cancel('optics:fringe');
    scheduler.beginSoftSwitch?.(18);
    scheduler.rest?.(2);

    // 5) Residual cleanup + toast on later pulses (freeze is already chunked).
    const steps = [];
    if (h?.cleanup && eid) {
      steps.push(() => {
        try { h.cleanup?.(eid); } catch { /* ignore */ }
      });
    }
    steps.push(() => {
      toast('已关闭实验终端');
      pushHud();
    });
    if (typeof scheduler.scheduleChain === 'function') {
      scheduler.scheduleChain('exp:shutdown', steps, { priority: 28, restFrames: 2 });
    } else {
      steps.forEach((fn, i) => {
        scheduler.schedule(`exp:shutdown:${i}`, fn, { priority: 28 - i });
      });
    }
  }

  return {
    state,
    openStationMenu,
    closeMenu,
    closeStationUi,
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
