/**
 * Off-screen typing bridge for the 3D main screen search bar.
 * Ensures canvas holos can receive real physical keyboard typing without floating DOM elements on screen.
 * Reuses original HoloChem AI: DeepSeek resolve + PubChem lookupMolecule.
 */

/** @type {HTMLInputElement | null} */
let inputEl = null;
/** @type {null | ((query: string, condition: string) => void | Promise<void>)} */
let onSubmit = null;
/** @type {null | ((val: string) => void)} */
let onChange = null;

function ensureHiddenInput() {
  if (inputEl) return inputEl;

  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.id = 'chem-reagent-query-hidden';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;
  inputEl.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:-9999px',
    'width:1px',
    'height:1px',
    'opacity:0',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');

  inputEl.addEventListener('input', () => {
    const val = inputEl?.value || '';
    onChange?.(val);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const val = inputEl?.value || '';
      onSubmit?.(val, '');
    }
    e.stopPropagation();
  });
  inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  inputEl.addEventListener('keypress', (e) => e.stopPropagation());

  document.body.appendChild(inputEl);
  return inputEl;
}

export function focusSearchInput(initialVal = '', changeCb = null, submitCb = null) {
  const el = ensureHiddenInput();
  onChange = typeof changeCb === 'function' ? changeCb : null;
  if (typeof submitCb === 'function') {
    onSubmit = submitCb;
  }
  el.value = String(initialVal || '');
  requestAnimationFrame(() => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  });
}

export function setReagentSearchHandler(handler) {
  onSubmit = typeof handler === 'function' ? handler : null;
}

export function setReagentSearchStatus() {
  // Status is now rendered directly inside the 3D main screen Canvas
}

export function setReagentSearchBusy() {
  // Busy state is now rendered directly inside the 3D main screen Canvas
}

export function showReagentSearchDock() {
  ensureHiddenInput();
}

export function hideReagentSearchDock() {
  if (inputEl) {
    try { inputEl.blur(); } catch { /* ignore */ }
  }
}

export function updateReagentSearchDockPosition() {
  // No floating HTML dock DOM element; fully integrated into 3D main screen
}

export function isReagentSearchDockVisible() {
  return false;
}

export function getReagentSearchValue() {
  return String(inputEl?.value || '').trim();
}

export function setReagentSearchValue(v) {
  ensureHiddenInput();
  if (inputEl) inputEl.value = String(v || '');
}



