/**
 * Teaching readout: power is the unknown; landings are the solution check.
 */
export class LessonHud {
  constructor(root = document.getElementById('hud') || document.getElementById('app')) {
    this.root = root;
    this.el = null;
    this._built = false;
    this._onReplay = null;
  }

  ensure() {
    if (this._built) return;
    this._built = true;
    const panel = document.createElement('div');
    panel.id = 'lesson-panel';
    panel.className = 'lesson-panel hidden';
    panel.innerHTML = `
      <div class="lesson-head">
        <span class="lesson-mark">◎</span>
        <span class="lesson-kicker" id="lesson-kicker">力度解题</span>
        <span class="lesson-power-pill" id="lesson-power-pill">—</span>
      </div>
      <div class="lesson-headline" id="lesson-headline">—</div>
      <div class="lesson-solve" id="lesson-solve"></div>
      <ol class="lesson-steps" id="lesson-steps"></ol>
      <div class="lesson-landings" id="lesson-landings"></div>
      <div class="lesson-tags" id="lesson-tags"></div>
      <div class="lesson-wonder" id="lesson-wonder"></div>
      <div class="lesson-actions">
        <button type="button" class="lesson-btn" id="lesson-replay" tabindex="-1">回放轨迹 T</button>
        <span class="lesson-hint">空格改力度 · 桌上浅色点=轻力 · 深色点=大力</span>
      </div>
    `;
    this.root.appendChild(panel);
    this.el = panel;
    this.refs = {
      kicker: panel.querySelector('#lesson-kicker'),
      powerPill: panel.querySelector('#lesson-power-pill'),
      headline: panel.querySelector('#lesson-headline'),
      solve: panel.querySelector('#lesson-solve'),
      steps: panel.querySelector('#lesson-steps'),
      landings: panel.querySelector('#lesson-landings'),
      tags: panel.querySelector('#lesson-tags'),
      wonder: panel.querySelector('#lesson-wonder'),
      replay: panel.querySelector('#lesson-replay'),
    };
    this.refs.replay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._onReplay?.();
    });
  }

  setReplayHandler(fn) {
    this._onReplay = fn;
  }

  setEnabled(on) {
    this.ensure();
    this.el.classList.toggle('hidden', !on);
  }

  /**
   * @param {object | null} lesson
   * @param {{ activeStepId?: string | null }} [opts]
   */
  render(lesson, opts = {}) {
    this.ensure();
    if (!lesson) {
      this.refs.headline.textContent = '蓄力或调方向，以力度为未知量求解落点';
      this.refs.solve.innerHTML = '';
      this.refs.steps.innerHTML = '';
      this.refs.landings.textContent = '';
      this.refs.tags.innerHTML = '';
      this.refs.wonder.textContent = '';
      this.refs.powerPill.textContent = '—';
      return;
    }

    this.refs.kicker.textContent = lesson.kicker || '力度解题';
    this.refs.powerPill.textContent = lesson.power01 != null
      ? `${Math.round(lesson.power01 * 100)}%`
      : '—';
    this.refs.powerPill.dataset.state = lesson.solveState || 'explore';
    this.refs.headline.textContent = lesson.headline;

    if (lesson.powerVerdict) {
      this.refs.solve.innerHTML = `
        <div class="lesson-solve-label">力度结论</div>
        <div class="lesson-solve-body">${lesson.powerVerdict}</div>
        ${lesson.powerHint ? `<div class="lesson-solve-hint">${lesson.powerHint}</div>` : ''}
      `;
      this.refs.solve.dataset.state = lesson.solveState || 'explore';
      this.refs.solve.classList.remove('is-empty');
    } else {
      this.refs.solve.innerHTML = '';
      this.refs.solve.classList.add('is-empty');
    }

    const active = opts.activeStepId ?? null;
    // Map replay phases onto new step ids
    const activeMapped = active === 'launch' ? 'launch'
      : active === 'contact' ? 'contact'
        : active === 'rest' ? 'rest'
          : active;

    this.refs.steps.innerHTML = lesson.steps.map((s) => `
      <li class="lesson-step${activeMapped === s.id ? ' is-active' : ''}" data-step="${s.id}">
        <div class="lesson-step-title">${s.title}</div>
        <div class="lesson-step-body">${s.body}</div>
      </li>
    `).join('');

    this.refs.landings.innerHTML = lesson.landingLines.length
      ? `<div class="lesson-landings-title">力度阶梯（同瞄准）</div>${
        lesson.landingLines.map((l) => `<div>${l}</div>`).join('')
      }`
      : '';

    this.refs.tags.innerHTML = (lesson.concepts || [])
      .map((c) => `<span class="lesson-tag">${c}</span>`)
      .join('');

    this.refs.wonder.textContent = lesson.wonder ? `想一想：${lesson.wonder}` : '';
  }
}
