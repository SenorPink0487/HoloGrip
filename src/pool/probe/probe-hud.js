import { MOTION_LABELS } from './probe-math.js';

function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs !== 0 && abs < 0.005) return n.toExponential(1);
  return n.toFixed(digits);
}

function fmtP(px, pz) {
  return `(${fmt(px, 3)}, ${fmt(pz, 3)})`;
}

/**
 * DOM readouts for the physics probe. Created lazily into #app.
 */
export class ProbeHud {
  /**
   * Prefer mounting inside #hud so the global H toggle hides the probe with the rest of the chrome.
   */
  constructor(root = document.getElementById('hud') || document.getElementById('app')) {
    this.root = root;
    this.el = null;
    this.noteEl = null;
    this._built = false;
  }

  ensure() {
    if (this._built) return;
    this._built = true;

    const panel = document.createElement('div');
    panel.id = 'probe-panel';
    panel.className = 'probe-panel hidden';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="probe-panel-head">
        <span class="probe-dot"></span>
        <span class="probe-title">物理探针</span>
        <span class="probe-focus" id="probe-focus-label">母球</span>
      </div>
      <div class="probe-grid">
        <div class="probe-row"><span>v</span><span id="probe-v">—</span></div>
        <div class="probe-row"><span>滑移</span><span id="probe-slip">—</span></div>
        <div class="probe-row"><span>状态</span><span id="probe-state">—</span></div>
        <div class="probe-row"><span>E<sub>k</sub></span><span id="probe-ek">—</span></div>
        <div class="probe-sub" id="probe-ek-split">平动 — · 转动 —</div>
        <div class="probe-divider"></div>
        <div class="probe-row"><span>Σp<sub>xz</sub></span><span id="probe-sp">—</span></div>
        <div class="probe-row"><span>ΣE<sub>k</sub></span><span id="probe-se">—</span></div>
        <div class="probe-sub" id="probe-se-split">平动 — · 转动 —</div>
      </div>
      <div class="probe-delta" id="probe-delta"></div>
      <div class="probe-note" id="probe-note"></div>
      <div class="probe-foot">数值来自实时模拟；碰撞求解存在小幅数值误差。</div>
    `;
    this.root.appendChild(panel);
    this.el = panel;
    this.noteEl = panel.querySelector('#probe-note');
    this.deltaEl = panel.querySelector('#probe-delta');
    this.refs = {
      focus: panel.querySelector('#probe-focus-label'),
      v: panel.querySelector('#probe-v'),
      slip: panel.querySelector('#probe-slip'),
      state: panel.querySelector('#probe-state'),
      ek: panel.querySelector('#probe-ek'),
      ekSplit: panel.querySelector('#probe-ek-split'),
      sp: panel.querySelector('#probe-sp'),
      se: panel.querySelector('#probe-se'),
      seSplit: panel.querySelector('#probe-se-split'),
    };
  }

  setEnabled(on) {
    this.ensure();
    this.el.classList.toggle('hidden', !on);
    if (!on) {
      this.noteEl.textContent = '';
      this.deltaEl.textContent = '';
    }
  }

  /**
   * @param {{
   *   focusLabel: string,
   *   focus: object | null,
   *   system: object,
   *   deltaText?: string,
   *   noteText?: string,
   * }} data
   */
  render(data) {
    this.ensure();
    if (!data) return;

    this.refs.focus.textContent = data.focusLabel;
    const f = data.focus;
    if (f) {
      this.refs.v.textContent = `${fmt(f.speed)} m/s`;
      this.refs.slip.textContent = `${fmt(f.slipSpeed)} m/s`;
      this.refs.state.textContent = MOTION_LABELS[f.state] ?? f.state;
      this.refs.ek.textContent = `${fmt(f.energyTotal, 3)} J`;
      this.refs.ekSplit.textContent = `平动 ${fmt(f.energyTrans, 3)} · 转动 ${fmt(f.energyRot, 3)}`;
    } else {
      this.refs.v.textContent = '—';
      this.refs.slip.textContent = '—';
      this.refs.state.textContent = '—';
      this.refs.ek.textContent = '—';
      this.refs.ekSplit.textContent = '平动 — · 转动 —';
    }

    const s = data.system;
    this.refs.sp.textContent = `${fmtP(s.px, s.pz)} kg·m/s`;
    this.refs.se.textContent = `${fmt(s.energyTotal, 3)} J`;
    this.refs.seSplit.textContent = `平动 ${fmt(s.energyTrans, 3)} · 转动 ${fmt(s.energyRot, 3)}`;

    this.deltaEl.textContent = data.deltaText || '';
    this.deltaEl.classList.toggle('is-empty', !data.deltaText);
    this.noteEl.textContent = data.noteText || '';
    this.noteEl.classList.toggle('is-empty', !data.noteText);
  }
}
