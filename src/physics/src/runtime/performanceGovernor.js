/**
 * Fixed-quality performance governor for the browser laboratory.
 *
 * This module intentionally does not change render quality at runtime.  It
 * measures the frame budget, exposes a compact snapshot for diagnostics, and
 * reports sustained pressure so the user can make an informed decision on
 * hardware that cannot sustain the selected quality profile.
 */

export const HIGH_QUALITY_PROFILE = Object.freeze({
  dprCap: 1.5,
  shadowMapSize: 2048,
  particleBudget: 20000,
  bloomEnabled: true,
  bloomScale: 0.75,
  fogQuality: 'high',
});

const FRAME_SAMPLE_LIMIT = 240;
const PANEL_UPDATE_MS = 250;
const FRAME_BUDGET_MS = 1000 / 60;
const WARNING_COOLDOWN_MS = 10000;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] || 0;
}

function formatMs(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'} ms`;
}

function formatCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '0';
}

function createDebugPanel() {
  if (typeof document === 'undefined') return null;
  const enabled = Boolean(
    import.meta.env?.DEV
      || new URLSearchParams(window.location.search).has('measure')
      || new URLSearchParams(window.location.search).has('debugPerf'),
  );
  if (!enabled) return null;

  const style = document.createElement('style');
  style.dataset.physicsPerf = 'true';
  style.textContent = `
    #physics-perf-overlay {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 10000;
      min-width: 230px;
      padding: 10px 12px;
      border: 1px solid rgba(112, 239, 210, .42);
      border-radius: 10px;
      background: rgba(3, 14, 24, .88);
      color: #d9fff7;
      box-shadow: 0 10px 28px rgba(0, 0, 0, .28);
      font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      pointer-events: none;
      backdrop-filter: blur(10px);
    }
    #physics-perf-overlay[hidden] { display: none; }
    #physics-perf-overlay .perf-title {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 5px;
      color: #70efd2;
      font-weight: 700;
      letter-spacing: .04em;
    }
    #physics-perf-overlay .perf-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      white-space: nowrap;
    }
    #physics-perf-overlay .perf-label { color: rgba(217, 255, 247, .64); }
    #physics-perf-overlay .perf-value { color: #f5fffd; }
    #physics-perf-overlay .perf-status { margin-top: 5px; color: #86f7ac; }
    #physics-perf-overlay .perf-status.warn { color: #ffd166; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'physics-perf-overlay';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="perf-title"><span>HOLOPHYSICS PERF</span><span>F3</span></div>
    <div class="perf-row"><span class="perf-label">FPS</span><span class="perf-value" data-perf="fps">—</span></div>
    <div class="perf-row"><span class="perf-label">Frame</span><span class="perf-value" data-perf="frameMs">—</span></div>
    <div class="perf-row"><span class="perf-label">Render</span><span class="perf-value" data-perf="renderMs">—</span></div>
    <div class="perf-row"><span class="perf-label">Simulation</span><span class="perf-value" data-perf="simulationMs">—</span></div>
    <div class="perf-row"><span class="perf-label">DPR</span><span class="perf-value" data-perf="dpr">—</span></div>
    <div class="perf-row"><span class="perf-label">Draw calls</span><span class="perf-value" data-perf="calls">—</span></div>
    <div class="perf-row"><span class="perf-label">Triangles</span><span class="perf-value" data-perf="triangles">—</span></div>
    <div class="perf-row"><span class="perf-label">Textures / Geo</span><span class="perf-value" data-perf="memory">—</span></div>
    <div class="perf-row"><span class="perf-label">Worker / SAB</span><span class="perf-value" data-perf="worker">—</span></div>
    <div class="perf-status" data-perf="status">OK</div>
  `;
  document.body.appendChild(panel);

  const values = Object.fromEntries(
    [...panel.querySelectorAll('[data-perf]')].map((node) => [node.dataset.perf, node]),
  );

  return {
    panel,
    values,
    toggle() { panel.hidden = !panel.hidden; },
    update(snapshot) {
      values.fps.textContent = Number.isFinite(snapshot.fps) ? snapshot.fps.toFixed(1) : '—';
      values.frameMs.textContent = formatMs(snapshot.frameMs);
      values.renderMs.textContent = formatMs(snapshot.renderMs);
      values.simulationMs.textContent = formatMs(snapshot.simulationMs);
      values.dpr.textContent = Number(snapshot.dpr || 0).toFixed(2);
      values.calls.textContent = formatCount(snapshot.render?.calls);
      values.triangles.textContent = formatCount(snapshot.render?.triangles);
      values.memory.textContent = `${formatCount(snapshot.memory?.textures)} / ${formatCount(snapshot.memory?.geometries)}`;
      values.worker.textContent = `${snapshot.workerMode} / ${snapshot.sharedArrayBuffer ? 'on' : 'off'}`;
      values.status.textContent = snapshot.status === 'warning'
        ? `WARN: ${snapshot.warningReason}`
        : 'OK · fixed high quality';
      values.status.classList.toggle('warn', snapshot.status === 'warning');
    },
    dispose() {
      panel.remove();
      style.remove();
    },
  };
}

/**
 * @param {{
 *   renderer?: object,
 *   quality?: object,
 *   onStatusChange?: (status: string, snapshot: object) => void,
 * }} [options]
 */
export function createPerformanceGovernor(options = {}) {
  const renderer = options.renderer || null;
  const quality = Object.freeze({ ...HIGH_QUALITY_PROFILE, ...(options.quality || {}) });
  const panel = createDebugPanel();
  const frameSamples = [];
  let frameStart = 0;
  let frameMs = 0;
  let renderMs = 0;
  let simulationMs = 0;
  let lastPanelUpdate = -Infinity;
  let lastFrameAt = 0;
  let fps = 0;
  let slowFrameStreak = 0;
  let lowFpsSince = 0;
  let mainFrameOver25 = false;
  let status = 'ok';
  let warningReason = '';
  let lastWarningAt = -Infinity;
  let longTaskCount = 0;
  let longTaskMax = 0;
  let runtimeInfo = {
    workerMode: 'auto',
    sharedArrayBuffer: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true,
    workerPending: 0,
  };

  let longTaskObserver = null;
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount += 1;
          longTaskMax = Math.max(longTaskMax, entry.duration);
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    }
  } catch { /* unsupported browser / WebView */ }

  function getRendererStats() {
    return {
      render: renderer?.info?.render ? { ...renderer.info.render } : {},
      memory: renderer?.info?.memory ? { ...renderer.info.memory } : {},
      programs: renderer?.info?.programs?.length || 0,
    };
  }

  function getSnapshot() {
    const stats = getRendererStats();
    return {
      status,
      warningReason,
      quality,
      fps,
      frameMs,
      frameP95: percentile(frameSamples, 95),
      renderMs,
      simulationMs,
      dpr: renderer?.getPixelRatio?.() || quality.dprCap,
      render: stats.render,
      memory: stats.memory,
      programs: stats.programs,
      workerMode: runtimeInfo.workerMode,
      sharedArrayBuffer: runtimeInfo.sharedArrayBuffer,
      workerPending: runtimeInfo.workerPending,
      longTaskCount,
      longTaskMax,
      frameSamples: frameSamples.length,
    };
  }

  function publishStatus(nextStatus, reason, timestamp) {
    if (nextStatus === status && reason === warningReason) return;
    status = nextStatus;
    warningReason = reason || '';
    const snapshot = getSnapshot();
    if (nextStatus === 'warning' && timestamp - lastWarningAt >= WARNING_COOLDOWN_MS) {
      lastWarningAt = timestamp;
      options.onStatusChange?.(nextStatus, snapshot);
    } else if (nextStatus === 'ok') {
      options.onStatusChange?.(nextStatus, snapshot);
    }
  }

  function updatePressure(timestamp) {
    if (frameMs > FRAME_BUDGET_MS) slowFrameStreak += 1;
    else slowFrameStreak = 0;

    if (fps > 0 && fps < 60) {
      if (!lowFpsSince) lowFpsSince = timestamp;
    } else {
      lowFpsSince = 0;
    }

    mainFrameOver25 = frameMs > 25;
    let reason = '';
    if (slowFrameStreak >= 3) reason = '连续 3 帧超过 16.7ms';
    else if (lowFpsSince && timestamp - lowFpsSince >= 2000) reason = 'FPS 持续低于 60';
    else if (mainFrameOver25) reason = '主线程单帧超过 25ms';
    else if (runtimeInfo.workerPending > 3) reason = 'Worker 计算积压超过 3 个结果';

    publishStatus(reason ? 'warning' : 'ok', reason, timestamp);
  }

  function beginFrame(timestamp = nowMs()) {
    frameStart = timestamp;
    renderMs = 0;
    simulationMs = 0;
  }

  function recordSimulation(ms) {
    if (Number.isFinite(ms)) simulationMs += Math.max(0, ms);
  }

  function recordRender(ms) {
    if (Number.isFinite(ms)) renderMs = Math.max(0, ms);
  }

  function endFrame(timestamp = nowMs()) {
    if (!frameStart) frameStart = timestamp;
    frameMs = Math.max(0, timestamp - frameStart);
    if (lastFrameAt > 0) {
      const delta = timestamp - lastFrameAt;
      if (delta > 0) fps = 1000 / delta;
    }
    lastFrameAt = timestamp;
    frameSamples.push(frameMs);
    if (frameSamples.length > FRAME_SAMPLE_LIMIT) frameSamples.shift();
    updatePressure(timestamp);
    if (panel && timestamp - lastPanelUpdate >= PANEL_UPDATE_MS) {
      panel.update(getSnapshot());
      lastPanelUpdate = timestamp;
    }
    return getSnapshot();
  }

  function setRuntimeInfo(info = {}) {
    runtimeInfo = { ...runtimeInfo, ...info };
  }

  const keyHandler = (event) => {
    if (event.code === 'F3' && panel) {
      event.preventDefault();
      panel.toggle();
    }
  };
  if (panel) window.addEventListener('keydown', keyHandler);

  return {
    quality,
    beginFrame,
    recordSimulation,
    recordRender,
    endFrame,
    setRuntimeInfo,
    getSnapshot,
    getStatus: () => status,
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener?.('keydown', keyHandler);
      longTaskObserver?.disconnect?.();
      panel?.dispose?.();
    },
  };
}
