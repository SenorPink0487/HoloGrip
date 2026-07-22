import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { getUiState, setUiState, useUiState } from './store.js';
import { callBridge, setThreeBridge } from './threeBridge.js';

function Toast() {
  const toast = useUiState((state) => state.toast);
  return <div id="toast" className={toast ? 'show' : ''} role="status" aria-live="polite">{toast || ''}</div>;
}

function HelpToggleIcon() {
  return (
    <span className="help-toggle-icon" aria-hidden="true">
      <span className="icon-pulse" />
      <svg className="svg-icon help-ring-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" strokeOpacity="0.35" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function HelpToggleButton({ open, onClick }) {
  return (
    <button
      type="button"
      id="help-toggle"
      title={open ? '关闭交互指南 (Esc)' : '查看交互操作与控制逻辑指南'}
      aria-expanded={open ? 'true' : 'false'}
      onClick={onClick}
    >
      <HelpToggleIcon />
      <span className="help-toggle-copy">
        <strong>交互指南</strong>
        <small>{open ? '点击关闭' : '操作说明 · ?'}</small>
      </span>
    </button>
  );
}

function HelpModal() {
  const open = useUiState((state) => state.helpOpen);
  if (!open) {
    return (
      <div id="help-controls" aria-live="polite">
        <HelpToggleButton open={false} onClick={() => setUiState({ helpOpen: true })} />
      </div>
    );
  }
  return (
    <div id="help-controls" aria-live="polite">
      <HelpToggleButton open onClick={() => setUiState({ helpOpen: false })} />
      <div id="help-modal-wrap" className="help-modal-wrap is-open" aria-hidden="false">
        <div className="help-modal-backdrop" onClick={() => setUiState({ helpOpen: false })} />
        <div className="help-modal-box" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
          <div className="hud-top-bar"><span className="hud-sys-status"><span className="hud-dot" />系统在线 · FULL OPTICAL SYNC</span></div>
          <div className="help-modal-header">
            <div className="help-header-left"><span className="help-header-badge">QUANTUM LAB ARCHITECTURE</span><h2 id="help-modal-title">交互操作与物理引擎控制指南</h2></div>
            <button type="button" className="help-close" onClick={() => setUiState({ helpOpen: false })}><span className="close-kbd">ESC</span><i className="close-x">×</i></button>
          </div>
          <div className="help-modal-body">
            <div className="guide-column mech-col"><div className="guide-col-header"><div className="guide-col-title"><h3>桌面交互</h3><span>KEYBOARD · POINTER · RAYCASTER</span></div></div><div className="guide-rows">
              <div className="guide-row"><div className="guide-keys mech"><kbd>W A S D</kbd></div><div className="guide-desc"><h4>移动与观察</h4><p>点击画面锁定视角，使用键盘移动实验室。</p></div></div>
              <div className="guide-row"><div className="guide-keys mech"><kbd className="kbd-glow">E</kbd> / <kbd>左键</kbd></div><div className="guide-desc"><h4>仪器交互</h4><p>瞄准器材后触发实验操作。</p></div></div>
              <div className="guide-row"><div className="guide-keys mech"><kbd>F</kbd></div><div className="guide-desc"><h4>记录数据</h4><p>在实验过程中记录当前测量值。</p></div></div>
            </div></div>
            <div className="guide-column ar-col"><div className="guide-col-header ar"><div className="guide-col-title"><h3>AR 双手交互</h3><span>LOCAL MEDIAPIPE VISION CORE · H KEY</span></div></div><div className="guide-rows">
              <div className="guide-row ar-row"><div className="guide-keys ar"><span className="ar-pill"><i className="ar-dot" />单手捏合 + 移动手腕</span></div><div className="guide-desc"><h4>隔空转向与操作</h4><p>瞄准仪器后捏合即可拖拽调节。</p></div></div>
              <div className="guide-row ar-row"><div className="guide-keys ar"><span className="ar-pill active"><i className="ar-dot" />双手捏合展开 / 收拢</span></div><div className="guide-desc"><h4>空间漫游</h4><p>双手同时捏合控制前进与后退。</p></div></div>
            </div></div>
          </div>
          <div className="help-modal-footer"><div className="help-footer-status"><i className="status-pulse" />HAPTIC RAYCASTER ONLINE</div><button type="button" className="help-btn-confirm" onClick={() => setUiState({ helpOpen: false })}><span className="btn-text">掌握了，进入物理世界 (E)</span><i className="btn-arrow">→</i></button></div>
        </div>
      </div>
    </div>
  );
}

function HandTrackingControls() {
  const ar = useUiState((state) => state.ar);
  const tutorialVisible = useUiState((state) => state.tutorialVisible);
  const busy = ar.phase === 'loading' || ar.phase === 'permission';
  return (
    <>
      <div id="hand-tracking-controls" aria-live="polite">
        <button type="button" id="hand-tracking-toggle" aria-pressed={String(ar.active)} disabled={busy} title={ar.active ? '关闭 AR 模式（H）' : '开启 AR 模式（H）'} onClick={(event) => { event.stopPropagation(); callBridge('toggleHandTracking'); }}>
          <span className="hand-toggle-icon" aria-hidden="true">AR</span><span className="hand-toggle-copy"><strong>AR 模式</strong><small id="hand-tracking-status">{ar.active ? ar.status : (ar.detail || 'AR 模式已关闭 · H')}</small></span><span className="hand-toggle-led-wrap" aria-hidden="true"><span className="hand-toggle-led" /><span className="hand-toggle-led-ping" /></span>
        </button>
      </div>
      <div id="ar-tutorial" className={tutorialVisible ? 'is-visible' : ''} role="status" aria-live="polite"><strong>AR 双手交互</strong><span>双手捏合外扩前进 / 内收后退 · 单手瞄准仪器捏合操作</span></div>
    </>
  );
}

function UiApp() {
  useEffect(() => {
    const onKey = (event) => {
      if (event.code === 'Escape' && getUiState().helpOpen) {
        event.preventDefault();
        setUiState({ helpOpen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Experiment content remains exclusively on the 3D hologram CanvasTexture.
  // React owns only the low-frequency auxiliary controls, so no duplicate DOM
  // panel is placed over the scene.
  return <><HelpModal /><HandTrackingControls /><Toast /></>;
}

export function mountUi({ bridge, initialHud = null } = {}) {
  setThreeBridge(bridge);
  if (initialHud) setUiState({ hud: initialHud });
  const rootElement = document.getElementById('ui-root');
  if (!rootElement) return null;
  const root = createRoot(rootElement);
  root.render(<UiApp />);
  return root;
}

export function updateHud(hud) {
  setUiState({ hud });
}

export function updateToast(message) {
  setUiState({ toast: message || null });
}

export function updateArStatus(status) {
  setUiState({ ar: status });
}

export function updateTutorial(visible) {
  setUiState({ tutorialVisible: !!visible });
}
