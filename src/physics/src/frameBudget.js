/**
 * Frame-budget job queue — camera smoothness over immediacy.
 *
 * Policy:
 *  - Locomotion + WebGL present must never wait on heavy work.
 *  - At most one job per drain pulse.
 *  - Jobs longer than `heavyMs` force camera-only cooldown frames.
 *  - `scheduleCoop` splits long work into time slices with rest between.
 *  - `softSwitch` lets the render loop skip animators / raycasts while
 *    an experiment switch is still draining, so look/WASD stay live.
 */

/**
 * @param {{
 *   budgetMs?: number,
 *   maxJobsPerPulse?: number,
 *   heavyMs?: number,
 *   cooldownFrames?: number,
 *   chainRestFrames?: number,
 *   coopSliceMs?: number,
 * }} [opts]
 */
export function createFrameScheduler(opts = {}) {
  const defaultBudgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : 2.5;
  const maxJobsPerPulse = Number.isFinite(opts.maxJobsPerPulse) ? opts.maxJobsPerPulse : 1;
  const heavyMs = Number.isFinite(opts.heavyMs) ? opts.heavyMs : 4.0;
  const cooldownAfterHeavy = Number.isFinite(opts.cooldownFrames) ? opts.cooldownFrames : 2;
  const defaultChainRest = Number.isFinite(opts.chainRestFrames) ? opts.chainRestFrames : 1;
  const defaultCoopSliceMs = Number.isFinite(opts.coopSliceMs) ? opts.coopSliceMs : 3.0;

  /** @type {Array<{ id: string, fn: () => void, priority: number, gen: number }>} */
  const queue = [];
  /** Cancel tokens: id → generation that is still valid */
  const generations = new Map();
  let scheduled = false;
  /** Frames to skip drain after a heavy job (camera-only frames). */
  let cooldown = 0;
  /** Extra frames where the app should skip animators / focus raycasts. */
  let softFrames = 0;
  let lastJobMs = 0;

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function sortQueue() {
    queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Force N upcoming drain pulses to no-op (camera keeps the main thread).
   * @param {number} frames
   */
  function rest(frames = 1) {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    if (n > cooldown) cooldown = n;
  }

  /**
   * Mark the next N animation frames as "soft switch": render loop should only
   * do camera + present + a tiny budget drain (no station animators / focus).
   * @param {number} frames
   */
  function beginSoftSwitch(frames = 16) {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    if (n > softFrames) softFrames = n;
  }

  /** End soft-switch immediately (call when closing menus / fullscreen). */
  function endSoftSwitch() {
    softFrames = 0;
  }

  /**
   * Soft-switch is ONLY softFrames — never cooldown.
   * (Including cooldown made HUD "wait for soft" jobs call rest() forever,
   * permanently skipping animators or thrashing the job queue after close.)
   */
  function softSwitchActive() {
    return softFrames > 0;
  }

  /** Call once per animation frame from the main loop. */
  function tickSoftSwitch() {
    if (softFrames > 0) softFrames -= 1;
  }

  /**
   * Enqueue work. Same `id` replaces any pending job (latest wins).
   * @param {string} id
   * @param {() => void} fn
   * @param {{ priority?: number }} [jobOpts]
   */
  function schedule(id, fn, jobOpts = {}) {
    if (typeof fn !== 'function') return;
    const key = String(id || 'job');
    const gen = (generations.get(key) || 0) + 1;
    generations.set(key, gen);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].id === key) queue.splice(i, 1);
    }
    queue.push({
      id: key,
      fn,
      priority: Number(jobOpts.priority) || 0,
      gen,
    });
    sortQueue();
    arm();
  }

  /**
   * Cooperative job: `stepFn` returns true while more work remains.
   * Runs at most `sliceMs` per pulse, then rests a frame for the camera.
   *
   * @param {string} id
   * @param {() => boolean} stepFn
   * @param {{ priority?: number, sliceMs?: number, restFrames?: number }} [jobOpts]
   */
  function scheduleCoop(id, stepFn, jobOpts = {}) {
    if (typeof stepFn !== 'function') return;
    const key = String(id || 'coop');
    const priority = Number(jobOpts.priority) || 0;
    const sliceMs = Number.isFinite(jobOpts.sliceMs) ? jobOpts.sliceMs : defaultCoopSliceMs;
    const gap = Number.isFinite(jobOpts.restFrames)
      ? Math.max(0, Math.floor(jobOpts.restFrames))
      : 1;
    // Hard cap so a stuck stepFn cannot keep the lab in soft-switch forever.
    const maxPulses = Number.isFinite(jobOpts.maxPulses) ? Math.max(1, jobOpts.maxPulses) : 48;
    let pulses = 0;

    beginSoftSwitch(8);

    function run() {
      const t0 = nowMs();
      let more = true;
      try {
        // Always do at least one step so progress cannot stall on a 0-budget frame.
        more = !!stepFn();
        while (more && (nowMs() - t0) < sliceMs) {
          more = !!stepFn();
        }
      } catch {
        more = false;
      }
      pulses += 1;
      if (more && pulses < maxPulses) {
        beginSoftSwitch(4);
        if (gap > 0) rest(gap);
        schedule(key, run, { priority });
      }
    }

    schedule(key, run, { priority });
  }

  /**
   * Run `steps` one per drain pulse, with mandatory rest frames between them.
   * @param {string} baseId
   * @param {Array<() => void>} steps
   * @param {{ priority?: number, restFrames?: number }} [jobOpts]
   */
  function scheduleChain(baseId, steps, jobOpts = {}) {
    const list = Array.isArray(steps) ? steps.filter((fn) => typeof fn === 'function') : [];
    if (!list.length) return;
    const key = String(baseId || 'chain');
    const priority = Number(jobOpts.priority) || 0;
    const gap = Number.isFinite(jobOpts.restFrames)
      ? Math.max(0, Math.floor(jobOpts.restFrames))
      : defaultChainRest;

    const gen = (generations.get(key) || 0) + 1;
    generations.set(key, gen);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].id === key || queue[i].id.startsWith(`${key}#`)) {
        queue.splice(i, 1);
      }
    }

    // Soft-switch for the whole chain duration (step + rest per item) + tail.
    beginSoftSwitch(list.length * (1 + gap) + 10);

    let index = 0;
    const stepId = `${key}#step`;

    function pump() {
      if (generations.get(key) !== gen) return;
      if (index >= list.length) return;
      const fn = list[index];
      index += 1;
      try {
        fn();
      } catch {
        /* never break the frame over a chain step */
      }
      if (index < list.length && generations.get(key) === gen) {
        if (gap > 0) rest(gap);
        beginSoftSwitch(6);
        schedule(stepId, pump, { priority });
      }
    }

    schedule(stepId, pump, { priority });
  }

  /** Cancel a pending id (and invalidate in-flight gen). */
  function cancel(id) {
    const key = String(id || '');
    generations.set(key, (generations.get(key) || 0) + 1);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].id === key || queue[i].id.startsWith(`${key}#`)) {
        queue.splice(i, 1);
      }
    }
  }

  function arm() {
    scheduled = queue.length > 0 || cooldown > 0 || softFrames > 0;
  }

  /**
   * Run queued jobs until budget exhausted. Call only AFTER renderer.render().
   * @param {number} [budgetMs]
   * @returns {number} jobs run
   */
  function drain(budgetMs = defaultBudgetMs) {
    if (cooldown > 0) {
      cooldown -= 1;
      scheduled = queue.length > 0 || cooldown > 0 || softFrames > 0;
      return 0;
    }
    if (!queue.length) {
      scheduled = softFrames > 0;
      return 0;
    }
    const start = nowMs();
    const limit = Math.max(0.5, Number(budgetMs) || defaultBudgetMs);
    let ran = 0;
    while (queue.length && ran < maxJobsPerPulse) {
      const tNow = nowMs();
      if (tNow - start >= limit) break;
      const job = queue.shift();
      if (!job) break;
      if (generations.get(job.id) !== job.gen) continue;

      const t0 = nowMs();
      try {
        job.fn();
      } catch {
        /* never let a deferred job kill the frame */
      }
      lastJobMs = nowMs() - t0;
      ran += 1;

      if (lastJobMs >= heavyMs) {
        rest(cooldownAfterHeavy);
        beginSoftSwitch(cooldownAfterHeavy + 2);
      }
      if (maxJobsPerPulse <= 1) break;
    }
    scheduled = queue.length > 0 || cooldown > 0 || softFrames > 0;
    return ran;
  }

  function pending() {
    return queue.length;
  }

  function clear() {
    queue.length = 0;
    generations.clear();
    cooldown = 0;
    softFrames = 0;
  }

  return {
    schedule,
    scheduleChain,
    scheduleCoop,
    cancel,
    rest,
    beginSoftSwitch,
    endSoftSwitch,
    softSwitchActive,
    tickSoftSwitch,
    drain,
    pending,
    clear,
    lastJobMs: () => lastJobMs,
    cooldown: () => cooldown,
    softFrames: () => softFrames,
    /** @internal test/debug */
    _queue: queue,
  };
}

/** Shared singleton for the lab shell (imported by manager + main). */
export const labFrameScheduler = createFrameScheduler({
  budgetMs: 2.5,
  maxJobsPerPulse: 1,
  // ~1/4 frame: anything longer forces camera-only follow-up frames.
  heavyMs: 4.0,
  cooldownFrames: 2,
  chainRestFrames: 1,
  coopSliceMs: 3.0,
});
