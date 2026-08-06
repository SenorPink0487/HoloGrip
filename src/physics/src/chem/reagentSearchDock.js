/**
 * Real HTML search bar for the chem reagent picker.
 * Streamlined single-row bar embedded directly into the bottom slot of the periodic selection screen.
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
    'bottom:max(64px, 11vh)',
    'transform:translateX(-50%)',
    'z-index:55',
    'display:none',
    'width:min(680px,80vw)',
    'padding:8px 12px',
    'border-radius:16px',
    'background:rgba(255,255,255,0.95)',
    'border:1px solid rgba(226,232,240,0.95)',
    'box-shadow:0 12px 36px rgba(15,23,42,0.18),0 0 0 1px rgba(255,255,255,0.8) inset',
    'backdrop-filter:blur(20px)',
    '-webkit-backdrop-filter:blur(20px)',
    'font-family:Outfit,"Noto Sans SC",system-ui,sans-serif',
    'pointer-events:auto',
    'box-sizing:border-box',
  ].join(';');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;width:100%';

  const badge = document.createElement('div');
  badge.innerHTML = '<span style="font-size:14px">✨</span><span style="font-weight:700;font-size:12px;color:#0284c7;letter-spacing:-0.01em">AI 检索</span>';
  badge.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 4px 0 2px;white-space:nowrap;user-select:none;flex-shrink:0';

  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.id = 'chem-reagent-query';
  inputEl.placeholder = '输入化学式 / 名称 / SMILES (如 H2O, 氯化钠, NaOH+HCl)';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;
  inputEl.style.cssText = [
    'flex:1',
    'min-width:140px',
    'height:36px',
    'padding:0 12px',
    'border-radius:10px',
    'border:1px solid rgba(203,213,225,0.9)',
    'background:#f8fafc',
    'color:#0f172a',
    'font-size:13.5px',
    'font-weight:500',
    'outline:none',
    'box-sizing:border-box',
    'transition:all 0.15s ease',
  ].join(';');

  condEl = document.createElement('select');
  condEl.id = 'chem-reaction-condition';
  condEl.style.cssText = [
    'height:36px',
    'padding:0 10px',
    'border-radius:10px',
    'border:1px solid rgba(203,213,225,0.9)',
    'background:#f8fafc',
    'color:#334155',
    'font-size:12.5px',
    'font-weight:600',
    'cursor:pointer',
    'outline:none',
    'flex-shrink:0',
    'box-sizing:border-box',
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
    'height:36px',
    'padding:0 16px',
    'border:none',
    'border-radius:10px',
    'background:linear-gradient(135deg,#0ea5e9,#0284c7)',
    'color:#fff',
    'font-size:13px',
    'font-weight:700',
    'cursor:pointer',
    'box-shadow:0 4px 12px rgba(2,132,199,0.25)',
    'white-space:nowrap',
    'flex-shrink:0',
    'transition:all 0.15s ease',
  ].join(';');

  statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:4px;font-size:11.5px;font-weight:600;color:#64748b;text-align:center;min-height:0;display:none;transition:all 0.15s ease';

  row.appendChild(badge);
  row.appendChild(inputEl);
  row.appendChild(condEl);
  row.appendChild(searchBtn);
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
  const str = String(text || '').trim();
  if (!str) {
    statusEl.style.display = 'none';
    statusEl.textContent = '';
    return;
  }
  statusEl.style.display = 'block';
  statusEl.textContent = str;
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
  if (statusEl && !opts.keepStatus) {
    statusEl.style.display = 'none';
    statusEl.textContent = '';
  }
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

