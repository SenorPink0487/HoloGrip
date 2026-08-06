/**
 * Real HTML search bar for the chem reagent picker.
 * Canvas holos cannot type; this dock appears when the periodic/reagent panel is open.
 * Reuses original HoloChem AI: DeepSeek resolve + PubChem lookupMolecule.
 */

/** @type {HTMLElement | null} */
let dock = null;
/** @type {HTMLInputElement | null} */
let inputEl = null;
/** @type {HTMLSelectElement | null} */
let condEl = null;
/** @type {HTMLButtonElement | null} */
let searchBtn = null;
/** @type {HTMLElement | null} */
let statusEl = null;
/** @type {null | ((query: string, condition: string) => void | Promise<void>)} */
let onSubmit = null;
let visible = false;

function ensureDock() {
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'chem-reagent-search-dock';
  dock.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:28px',
    'transform:translateX(-50%)',
    'z-index:55',
    'display:none',
    'width:min(720px,92vw)',
    'padding:14px 16px',
    'border-radius:20px',
    'background:rgba(255,255,255,0.92)',
    'border:1px solid rgba(226,232,240,0.95)',
    'box-shadow:0 16px 48px rgba(15,23,42,0.22),0 0 0 1px rgba(255,255,255,0.6) inset',
    'backdrop-filter:blur(18px)',
    '-webkit-backdrop-filter:blur(18px)',
    'font-family:Outfit,"Noto Sans SC",system-ui,sans-serif',
    'pointer-events:auto',
  ].join(';');

  const label = document.createElement('div');
  label.textContent = 'AI 试剂检索 · 化学式 / 中英文名 / SMILES · 支持 A+B 反应';
  label.style.cssText = 'font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px;letter-spacing:0.02em';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';

  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.id = 'chem-reagent-query';
  inputEl.placeholder = '例如：H2O、氯化钠、C6H12O6、NaOH+HCl…';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;
  inputEl.style.cssText = [
    'flex:1 1 240px',
    'min-width:180px',
    'height:44px',
    'padding:0 14px',
    'border-radius:12px',
    'border:1.5px solid rgba(203,213,225,0.95)',
    'background:#fff',
    'color:#0f172a',
    'font-size:15px',
    'font-weight:500',
    'outline:none',
    'box-shadow:0 1px 2px rgba(15,23,42,0.04)',
  ].join(';');

  condEl = document.createElement('select');
  condEl.id = 'chem-reaction-condition';
  condEl.style.cssText = [
    'height:44px',
    'padding:0 12px',
    'border-radius:12px',
    'border:1.5px solid rgba(203,213,225,0.95)',
    'background:#fff',
    'color:#334155',
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  [
    ['', '未指定条件'],
    ['水溶液', '水溶液'],
    ['加热', '加热'],
    ['点燃', '点燃'],
  ].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    condEl.appendChild(o);
  });

  searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.textContent = 'AI 解析';
  searchBtn.style.cssText = [
    'height:44px',
    'padding:0 18px',
    'border:none',
    'border-radius:12px',
    'background:linear-gradient(135deg,#0ea5e9,#0284c7)',
    'color:#fff',
    'font-size:14px',
    'font-weight:700',
    'cursor:pointer',
    'box-shadow:0 6px 16px rgba(2,132,199,0.28)',
    'white-space:nowrap',
  ].join(';');

  statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:8px;font-size:12px;font-weight:600;color:#64748b;min-height:16px';

  row.appendChild(inputEl);
  row.appendChild(condEl);
  row.appendChild(searchBtn);
  dock.appendChild(label);
  dock.appendChild(row);
  dock.appendChild(statusEl);
  document.body.appendChild(dock);

  const submit = () => {
    const q = String(inputEl?.value || '').trim();
    if (!q) {
      setStatus('请输入化学式、名称或 SMILES');
      inputEl?.focus();
      return;
    }
    const cond = String(condEl?.value || '');
    void Promise.resolve(onSubmit?.(q, cond));
  };

  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    submit();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      submit();
    }
    // Keep lab pointer-lock / WASD from eating typing
    e.stopPropagation();
  });
  inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  inputEl.addEventListener('keypress', (e) => e.stopPropagation());
  inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
  inputEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  dock.addEventListener('pointerdown', (e) => e.stopPropagation());
  dock.addEventListener('mousedown', (e) => e.stopPropagation());

  return dock;
}

export function setReagentSearchHandler(handler) {
  onSubmit = typeof handler === 'function' ? handler : null;
}

export function setReagentSearchStatus(text, tone = 'info') {
  ensureDock();
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.color = tone === 'error'
    ? '#dc2626'
    : tone === 'ok'
      ? '#059669'
      : '#64748b';
}

export function setReagentSearchBusy(busy) {
  ensureDock();
  if (searchBtn) {
    searchBtn.disabled = !!busy;
    searchBtn.textContent = busy ? '解析中…' : 'AI 解析';
    searchBtn.style.opacity = busy ? '0.7' : '1';
  }
  if (inputEl) inputEl.disabled = !!busy;
  if (condEl) condEl.disabled = !!busy;
}

export function showReagentSearchDock(opts = {}) {
  ensureDock();
  visible = true;
  if (dock) dock.style.display = 'block';
  const cup = opts.activeCup || 'A';
  if (statusEl && !opts.keepStatus) {
    statusEl.textContent = `当前烧杯 ${cup} · 输入后按 Enter 或点「AI 解析」`;
    statusEl.style.color = '#64748b';
  }
  // Focus after a tick so pointer-lock unlock / holo click settles
  requestAnimationFrame(() => {
    try {
      inputEl?.focus({ preventScroll: true });
    } catch {
      inputEl?.focus();
    }
  });
}

export function hideReagentSearchDock() {
  visible = false;
  if (dock) dock.style.display = 'none';
  setReagentSearchBusy(false);
}

export function isReagentSearchDockVisible() {
  return visible;
}

export function getReagentSearchValue() {
  return String(inputEl?.value || '').trim();
}

export function setReagentSearchValue(v) {
  ensureDock();
  if (inputEl) inputEl.value = String(v || '');
}

function setStatus(text) {
  setReagentSearchStatus(text);
}
