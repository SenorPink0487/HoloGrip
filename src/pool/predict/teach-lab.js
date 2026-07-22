/**
 * Unified teach lab UI: one button, power slider, formula panel, landing list.
 * No narrative "文字解题".
 */
import { formulaBoardToHtml } from './formula-board.js';

export class TeachLab {
  /**
   * @param {HTMLElement} root
   * @param {{
   *   onToggle?: (active: boolean) => void,
   *   onPower?: (power01: number) => void,
   * }} [handlers]
   */
  constructor(root = document.getElementById('hud') || document.getElementById('app'), handlers = {}) {
    this.root = root;
    this.onToggle = handlers.onToggle ?? (() => {});
    this.onPower = handlers.onPower ?? (() => {});
    this.active = false;
    this.aimReady = false;
    this.power01 = 0.42;
    this._built = false;
    this.el = null;
  }

  ensure() {
    if (this._built) return;
    this._built = true;

    const wrap = document.createElement('div');
    wrap.id = 'teach-lab';
    wrap.className = 'teach-lab';
    wrap.innerHTML = `
      <button type="button" id="teach-toggle" class="hud-btn hud-btn-accent teach-toggle hidden" disabled title="先按 E 进入击球">
        公式推演
      </button>
      <div id="teach-panel" class="float-panel teach-panel hidden">
        <div class="float-panel-head teach-panel-head">
          <span class="float-panel-title teach-panel-title">落点预览 · 公式</span>
          <button type="button" id="teach-close" class="icon-btn teach-close" aria-label="关闭公式推演">×</button>
        </div>
        <label class="teach-slider-label" for="teach-power">
          力度
          <span id="teach-power-pct" class="teach-power-pct">42%</span>
        </label>
        <input id="teach-power" class="teach-power" type="range" min="0" max="100" value="42" step="1" />
        <div class="teach-slider-ticks">
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
        <div class="teach-landings">
          <div class="teach-section-title">各球落点</div>
          <div id="teach-landing-list" class="teach-landing-list">—</div>
        </div>
        <div class="teach-formulas">
          <div class="teach-section-title">公式推演</div>
          <div id="teach-formula-body" class="teach-formula-body"></div>
        </div>
      </div>
    `;
    this.root.appendChild(wrap);
    this.el = wrap;
    this.btn = wrap.querySelector('#teach-toggle');
    this.panel = wrap.querySelector('#teach-panel');
    this.slider = wrap.querySelector('#teach-power');
    this.pctEl = wrap.querySelector('#teach-power-pct');
    this.landingList = wrap.querySelector('#teach-landing-list');
    this.formulaBody = wrap.querySelector('#teach-formula-body');
    this.closeBtn = wrap.querySelector('#teach-close');

    this.btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.btn.disabled) return;
      this.setActive(!this.active);
    });
    this.closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setActive(false);
    });
    this.slider.addEventListener('input', () => {
      const p = Number(this.slider.value) / 100;
      this.power01 = p;
      this.pctEl.textContent = `${Math.round(p * 100)}%`;
      this.onPower(p);
    });
    // Prevent game keys when focusing slider
    this.slider.addEventListener('keydown', (e) => e.stopPropagation());
  }

  /** Call when player enters/leaves aim stance (after E). */
  setAimReady(ready) {
    this.ensure();
    this.aimReady = !!ready;
    this.btn.disabled = !this.aimReady;
    // Default free-roam: hide the button entirely; only show after E (aim ready).
    this.btn.classList.toggle('hidden', !this.aimReady);
    if (!this.aimReady && this.active) {
      this.setActive(false);
    }
    this.btn.title = this.aimReady ? '开启俯视落点与公式' : '先按 E 进入击球';
    this.btn.classList.toggle('is-ready', this.aimReady);
  }

  setActive(on) {
    this.ensure();
    const next = !!on && this.aimReady;
    const changed = next !== this.active;
    this.active = next;
    this.panel.classList.toggle('hidden', !this.active);
    this.btn.classList.toggle('is-active', this.active);
    this.btn.textContent = this.active ? '推演中' : '公式推演';
    if (changed) this.onToggle(this.active);
  }

  isActive() {
    return this.active;
  }

  getPower() {
    return this.power01;
  }

  setPower(power01, { silent = false } = {}) {
    this.ensure();
    const p = Math.min(1, Math.max(0, power01));
    this.power01 = p;
    this.slider.value = String(Math.round(p * 100));
    this.pctEl.textContent = `${Math.round(p * 100)}%`;
    if (!silent) this.onPower(p);
  }

  /**
   * @param {object | null} board  from buildFormulaBoard
   * @param {Array<{ id: number, label: string, text: string, pocketed?: boolean }>} landings
   */
  render(board, landings = []) {
    this.ensure();
    if (!this.active) return;

    if (landings.length) {
      this.landingList.innerHTML = landings.map((row) => `
        <div class="teach-landing-row${row.pocketed ? ' is-pocket' : ''}">
          <span class="teach-landing-name">${row.label}</span>
          <span class="teach-landing-val">${row.text}</span>
        </div>
      `).join('');
    } else {
      this.landingList.textContent = '拖动力度滑条以计算…';
    }

    this.formulaBody.innerHTML = board ? formulaBoardToHtml(board) : '';
  }
}
