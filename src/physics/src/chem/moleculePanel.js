/**
 * Floating molecule panel — original HoloChem 3Dmol viewer.
 * Hidden by default; only shown after a component is selected.
 */

let MoleculeViewerClass = null;

async function ensureViewer() {
  if (MoleculeViewerClass) return MoleculeViewerClass;
  const mod = await import('../../../chem/src/viewer.js');
  MoleculeViewerClass = mod.MoleculeViewer;
  return MoleculeViewerClass;
}

/**
 * Singleton floating panel for lab chem molecule display.
 */
let panelSingleton = null;

export function getMoleculePanel() {
  if (panelSingleton) return panelSingleton;
  panelSingleton = createMoleculePanelSync();
  return panelSingleton;
}

function createMoleculePanelSync() {
  const host = document.createElement('div');
  host.id = 'chem-molecule-panel';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'right:24px',
    'bottom:24px',
    'width:min(380px,42vw)',
    'height:min(420px,52vh)',
    'border-radius:20px',
    'overflow:hidden',
    'z-index:40',
    'display:none',
    'pointer-events:auto',
    'background:linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%)',
    'border:1px solid rgba(148,163,184,0.45)',
    'box-shadow:0 18px 50px rgba(15,23,42,0.28),0 0 0 1px rgba(255,255,255,0.5) inset',
    'font-family:Outfit,Noto Sans SC,system-ui,sans-serif',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding:10px 14px',
    'background:rgba(255,255,255,0.72)',
    'border-bottom:1px solid rgba(226,232,240,0.95)',
    'backdrop-filter:blur(10px)',
  ].join(';');

  const title = document.createElement('div');
  title.id = 'chem-mol-title';
  title.textContent = '分子结构';
  title.style.cssText = 'font-weight:700;font-size:14px;color:#0f172a;letter-spacing:0.02em';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = '关闭';
  closeBtn.style.cssText = [
    'width:28px',
    'height:28px',
    'border:none',
    'border-radius:8px',
    'background:rgba(148,163,184,0.18)',
    'color:#475569',
    'font-size:18px',
    'line-height:1',
    'cursor:pointer',
  ].join(';');

  header.appendChild(title);
  header.appendChild(closeBtn);

  const viewport = document.createElement('div');
  viewport.id = 'chem-mol-viewport';
  viewport.style.cssText = 'width:100%;height:calc(100% - 48px);background:#f8fafc';

  host.appendChild(header);
  host.appendChild(viewport);
  document.body.appendChild(host);

  /** @type {import('../../../chem/src/viewer.js').MoleculeViewer | null} */
  let viewer = null;
  let ready = null;

  async function ensureReady() {
    if (viewer) return viewer;
    if (!ready) {
      ready = (async () => {
        const Viewer = await ensureViewer();
        viewer = new Viewer(viewport);
        viewer.setSpin(true);
        return viewer;
      })();
    }
    return ready;
  }

  closeBtn.addEventListener('click', () => {
    api.hide();
  });

  const api = {
    host,
    async showSdf(sdf, formula = '') {
      title.textContent = formula ? `分子结构 · ${formula}` : '分子结构';
      host.style.display = 'block';
      host.setAttribute('aria-hidden', 'false');
      const v = await ensureReady();
      // layout must be visible before 3Dmol sizes the canvas
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            if (sdf) v.loadSdf(sdf);
            else v.viewer?.clear?.();
            v.resize?.();
            v.fit?.({ animate: false });
          } catch (err) {
            console.warn('[chem-mol] load failed', err);
          }
        });
      });
    },
    hide() {
      host.style.display = 'none';
      host.setAttribute('aria-hidden', 'true');
      try { viewer?.viewer?.clear?.(); } catch { /* ignore */ }
    },
    clear() {
      api.hide();
    },
  };

  return api;
}
