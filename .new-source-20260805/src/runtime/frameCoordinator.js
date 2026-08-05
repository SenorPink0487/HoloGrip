const DEFAULT_FIXED_DT = 1 / 60;

/** Single simulation/render/predictive-work scheduler for the lab. */
export function createFrameCoordinator({
  fixedDt = DEFAULT_FIXED_DT,
  maxCatchUp = 2,
  now = () => performance.now(),
  onFixedUpdate = () => {},
  onVisualUpdate = () => {},
  onInput = () => {},
  onRaycast = () => {},
  onRender = () => {},
} = {}) {
  const tasks = [];
  let accumulator = 0;
  let last = null;
  let dirty = true;
  let renderMs = 0;

  function enqueue(task) {
    if (!task || typeof task.step !== 'function') throw new TypeError('task.step is required');
    tasks.push(task);
    return () => { task.cancelled = true; };
  }

  function drain(deadline, signal) {
    const limit = Math.min(2, Math.max(0, deadline - now()));
    const end = now() + limit;
    while (tasks.length && now() < end) {
      const task = tasks[0];
      if (task.cancelled || signal?.aborted) { tasks.shift(); continue; }
      const stepStart = now();
      const done = task.step(end, signal);
      const elapsed = now() - stepStart;
      if (elapsed > 4) console.warn(`[FrameCoordinator] task ${task.id || 'anonymous'} exceeded 4ms`, elapsed);
      if (done !== false) tasks.shift();
      else if (now() >= end) break;
    }
  }

  function frame(timestamp = now()) {
    if (last == null) last = timestamp;
    const elapsed = Math.min(0.1, Math.max(0, (timestamp - last) / 1000));
    last = timestamp;
    accumulator += elapsed;
    onInput(timestamp);
    let steps = 0;
    while (accumulator >= fixedDt && steps < maxCatchUp) {
      onFixedUpdate(fixedDt);
      accumulator -= fixedDt;
      steps += 1;
      dirty = true;
    }
    if (dirty) {
      onVisualUpdate(accumulator / fixedDt);
      dirty = false;
    }
    const renderStart = now();
    onRaycast(timestamp);
    onRender(timestamp);
    renderMs = now() - renderStart;
    // Skip background drain when the present already exceeded one frame budget.
    // Budget is measured from post-render now — not from the frame timestamp —
    // so a 4 ms present still leaves a fresh 2 ms window for one background task.
    if (renderMs <= 16.7) drain(now() + 2);
    return { elapsed, steps, renderMs, pending: tasks.length };
  }

  return {
    frame,
    enqueue,
    invalidate() { dirty = true; },
    cancelAll() { tasks.length = 0; },
    get pending() { return tasks.length; },
    get lastRenderMs() { return renderMs; },
  };
}
