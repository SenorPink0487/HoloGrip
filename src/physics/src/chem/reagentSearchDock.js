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

  // Update for both hidden and iPad dock
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const val = inputEl?.value || '';
        onSubmit?.(val, '');
      }
      e.stopPropagation();
    });
  }
  inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  inputEl.addEventListener('keypress', (e) => e.stopPropagation());

  document.body.appendChild(inputEl);
  return inputEl;
}

export function focusSearchInput(initialVal = '', changeCb = null, submitCb = null) {
  // iPad/WebView: show visible keyboard dock instead of hidden input
  // (hidden inputs frequently fail to trigger virtual keyboard on iPad)
  const isCoarse = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
  if (isCoarse && !inputEl) {
    // Create visible bottom keyboard dock
    const dock = document.createElement('div');
    dock.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      background: rgba(255,255,255,0.95);
      border-top: 1px solid rgba(0,0,0,0.1);
      padding: 12px 16px;
      backdrop-filter: blur(20px);
      font-size: 16px;
      inputmode: text;
      enterkeyhint: search;
    `;
    dock.innerHTML = `
      <input id="chem-reagent-iPad" 
        type="text" 
        autocomplete="off" 
        spellcheck="false"
        style="width: 100%; padding: 12px 16px; border: 1px solid #ccc; border-radius: 12px; font-size: 16px; background: white;"
        placeholder="输入化学式、名称或 SMILES..."
      />
    `;
    document.body.appendChild(dock);
    inputEl = dock.querySelector('#chem-reagent-iPad');
  }

  const el = inputEl || ensureHiddenInput();
  onChange = typeof changeCb === 'function' ? changeCb : null;
  if (typeof submitCb === 'function') {
    onSubmit = submitCb;
  }
  el.value = String(initialVal || '');
  el.focus({ preventScroll: true });
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
  // iPad dock cleanup
  const dock = document.getElementById('chem-reagent-iPad')?.parentElement;
  if (dock) {
    dock.remove();
    inputEl = null;
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

/** @type {any} */
let activeRecognition = null;

export function toggleSpeechRecognition(onResult, onStatusChange) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    onStatusChange?.('unsupported');
    return false;
  }

  if (activeRecognition) {
    try { activeRecognition.stop(); } catch { /* ignore */ }
    activeRecognition = null;
    onStatusChange?.('stopped');
    return false;
  }

  try {
    const recognition = new SpeechRec();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      onStatusChange?.('listening');
    };

    recognition.onresult = (event) => {
      let resultText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        resultText += event.results[i][0].transcript;
      }
      if (resultText) {
        setReagentSearchValue(resultText);
        onResult?.(resultText);
      }
    };

    recognition.onerror = (err) => {
      console.warn('[speech] Recognition error:', err);
      activeRecognition = null;
      onStatusChange?.('error', err?.error);
    };

    recognition.onend = () => {
      activeRecognition = null;
      onStatusChange?.('ended');
    };

    recognition.start();
    activeRecognition = recognition;
    return true;
  } catch (err) {
    console.warn('[speech] Start failed:', err);
    activeRecognition = null;
    onStatusChange?.('error', String(err));
    return false;
  }
}



