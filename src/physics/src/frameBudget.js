/**
 * Frame-budget job queue — smoothness over immediacy.
 *
 * Policy: the WebGL present path must never wait on heavy work.
 * Jobs run only with leftover main-thread budget (after render, or on idle rAFs).
 * Users may see apparatus/UI appear a few frames late; the camera must not hitch.
 */

/**
 * @param {{ budgetMs?: number, maxJobsPerPulse?: number }} [opts]
 */
export function createFrameScheduler(opts = {}) {
  // Default: one heavy job per drain pulse so a single reset/compile cannot
  // chain with HUD paint and freeze the next frame.
  const defaultBudgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : 3.0;
  const maxJobsPerPulse = Number.isFinite(opts.maxJobsPerPulse) ? opts.maxJobsPerPulse : 1;

  /** @type {Array<{ id: string, fn: () => void, priority: number, gen: number }>} */
  const queue = [];
  /** Cancel tokens: id → generation that is still valid */
  const generations = new Map();
  let scheduled = false;
  let pulseId = 0;

  function sortQueue() {
    // Higher priority first; stable enough for our use (FIFO within priority).
    queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Enqueue work. Same `id` replaces any pending job (latest wins).
   * @param {string} id
   * @param {() => void} fn
   * @param {{ priority?: number }} [jobOpts] priority: higher runs sooner (default 0)
   */
  function schedule(id, fn, jobOpts = {}) {
    if (typeof fn !== 'function') return;
    const key = String(id || 'job');
    const gen = (generations.get(key) || 0) + 1;
    generations.set(key, gen);
    // Drop older jobs with the same id
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

  /** Cancel a pending id (and invalidate in-flight gen). */
  function cancel(id) {
    const key = String(id || '');
    generations.set(key, (generations.get(key) || 0) + 1);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].id === key) queue.splice(i, 1);
    }
  }

  function arm() {
    // Do NOT spin a parallel rAF here. Heavy jobs must only run from the main
    // animate() loop *after* WebGL present — a freestanding rAF was still able
    // to freeze the view between frames on experiment switch.
    scheduled = queue.length > 0;
  }

  /**
   * Run queued jobs until budget exhausted. Call only AFTER renderer.render().
   * @param {number} [budgetMs]
   * @returns {number} jobs run
   */
  function drain(budgetMs = defaultBudgetMs) {
    if (!queue.length) {
      scheduled = false;
      return 0;
    }
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const limit = Math.max(0.5, Number(budgetMs) || defaultBudgetMs);
    let ran = 0;
    while (queue.length && ran < maxJobsPerPulse) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - start >= limit) break;
      const job = queue.shift();
      if (!job) break;
      if (generations.get(job.id) !== job.gen) continue; // cancelled / superseded
      try {
        job.fn();
      } catch {
        /* never let a deferred job kill the frame */
      }
      ran += 1;
      // Hard stop after one job by default — even if budget remains — so a single
      // 20ms canvas paint cannot chain with another heavy job in the same pulse.
      if (maxJobsPerPulse <= 1) break;
    }
    scheduled = queue.length > 0;
    return ran;
  }

  function pending() {
    return queue.length;
  }

  function clear() {
    queue.length = 0;
    generations.clear();
  }

  return {
    schedule,
    cancel,
    drain,
    pending,
    clear,
    /** @internal test/debug */
    _queue: queue,
  };
}

/** Shared singleton for the lab shell (imported by manager + main). */
export const labFrameScheduler = createFrameScheduler({ budgetMs: 3.0, maxJobsPerPulse: 1 });
