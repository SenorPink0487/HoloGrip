import fs from 'fs';

const p = 'src/experiments/manager.js';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('  function startExperiment(expId) {');
const end = s.indexOf('  function interact(target, t) {');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const next = `  function startExperiment(expId) {
    const st = currentStation();
    if (!st) return;
    const exp = st.experiments.find((e) => e.id === expId);
    if (!exp) return;
    const h = handlers[st.id];
    const prevExpId = state.running ? state.expId : null;
    const prevHandlers = prevExpId ? handlers[st.id] : null;

    // Click frame: only lightweight bookkeeping + toast. Never heavy GPU/sim work.
    state.expId = expId;
    state.stepIndex = 0;
    state.running = true;
    state.menuOpen = true;
    state.data = h?.initData(expId) || {};
    state.data._apparatusReady = false;
    toast(\`开始实验：\${exp.name} — 装置加载中，画面保持流畅\`);
    pushHud();

    scheduler.cancel('exp:cleanup');
    scheduler.cancel('exp:visuals');
    scheduler.cancel('exp:visuals-hud');

    if (prevExpId && prevHandlers?.cleanup) {
      const cleanupId = prevExpId;
      scheduler.schedule('exp:cleanup', () => {
        try { prevHandlers.cleanup?.(cleanupId); } catch { /* ignore */ }
      }, { priority: 80 });
    }

    scheduler.schedule('exp:visuals', () => {
      if (!state.running || state.expId !== expId) return;
      try { h?.applyVisualDefaults?.(expId); } catch { /* keep HUD up */ }
      if (state.data) state.data._apparatusReady = true;
      scheduler.schedule('exp:visuals-hud', () => {
        if (!state.running || state.expId !== expId) return;
        pushHud();
      }, { priority: 90 });
    }, { priority: 70 });
  }

`;

s = s.slice(0, start) + next + s.slice(end);
fs.writeFileSync(p, s);
console.log('patched startExperiment', start, '->', end);
