/**
 * Measure optics first-open AFTER lab-ready, with evidence.
 * Usage: LAB_URL=http://127.0.0.1:5199 node scripts/measure_optics_open.mjs [expId]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXP = process.argv[2] || 'reflection';
const BASE = process.env.LAB_URL || 'http://127.0.0.1:5199';
const URL = `${BASE}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const allConsole = [];
page.on('console', (msg) => allConsole.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (err) => allConsole.push({ type: 'pageerror', text: String(err) }));

await page.addInitScript(() => {
  window.__frameGaps = [];
  let last = performance.now();
  const tick = (now) => {
    const gap = now - last;
    if (gap >= 50) window.__frameGaps.push({ gap: Math.round(gap), t: Math.round(now) });
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longTasks.push({ duration: Math.round(e.duration), start: Math.round(e.startTime) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* ignore */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

// Wait lab-ready (boot can be long due to full prewarm)
for (let i = 0; i < 120; i += 1) {
  const ready = await page.evaluate(() => document.body.classList.contains('lab-ready'));
  if (ready) break;
  await page.waitForTimeout(1000);
}

const pre = await page.evaluate(() => ({
  ready: document.body.classList.contains('lab-ready'),
  geoGpuReady: window.__labDebug?.geoGpuReady ?? null,
  hot: window.__labDebug?.hot ?? null,
  prepared: window.__labDebug ? [...(window.__labDebug.preparedExperimentIds || [])] : null,
}));

// Reset frame gap capture for open phase only
await page.evaluate(() => {
  window.__frameGaps = [];
  window.__longTasks = [];
});

const openTiming = await page.evaluate(async (expId) => {
  const t0 = performance.now();
  const dbg = window.__labDebug;
  if (!dbg?.equipment) return { error: 'no __labDebug' };
  // Mimic real open: hot station + startExperiment
  dbg.stationPresence?.setHotStation?.('optics');
  // Use bridge if available via exposed manager — not exported.
  // Dispatch through exp manager on equipment path:
  const mgr = dbg.equipment && null;
  void mgr;
  // Call same path as UI: need expManager. Expose it:
  return { error: 'need expManager on __labDebug', preMs: performance.now() - t0, expId };
}, EXP);

// Expose expManager if missing
await page.evaluate(() => {
  // main may only expose __labDebug.equipment — attach start via DOM bridge not available.
});

// Prefer URL preview after ready: reload with preview once ready is guaranteed... 
// Instead call start via re-inject: store startExperiment on __labDebug
// Patch: read from already-open debug after we add expManager to __labDebug

const openTiming2 = await page.evaluate(async (expId) => {
  const t0 = performance.now();
  const start = window.__labDebug?.startExperiment;
  const openMenu = window.__labDebug?.openStationMenu;
  if (typeof openMenu === 'function') openMenu('optics');
  if (typeof start !== 'function') {
    return {
      error: 'startExperiment not on __labDebug',
      keys: window.__labDebug ? Object.keys(window.__labDebug) : [],
      geoGpuReady: window.__labDebug?.geoGpuReady ?? null,
    };
  }
  start(expId);
  // Wait up to 5s for geo ready
  for (let i = 0; i < 100; i += 1) {
    if (window.__labDebug?.geoGpuReady) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    dt: performance.now() - t0,
    geoGpuReady: window.__labDebug?.geoGpuReady ?? null,
    hot: window.__labDebug?.hot ?? null,
  };
}, EXP);

await page.waitForTimeout(3000);

const post = await page.evaluate(() => {
  const gaps = (window.__frameGaps || []).slice().sort((a, b) => b.gap - a.gap);
  const tasks = (window.__longTasks || []).slice().sort((a, b) => b.duration - a.duration);
  return {
    geoGpuReady: window.__labDebug?.geoGpuReady ?? null,
    hot: window.__labDebug?.hot ?? null,
    topFrameGaps: gaps.slice(0, 15),
    topLongTasks: tasks.slice(0, 15),
    maxGap: gaps[0]?.gap || 0,
    maxLongTask: tasks[0]?.duration || 0,
  };
});

const out = {
  url: URL,
  pre,
  openTiming,
  openTiming2,
  post,
  openTraces: allConsole.filter((c) => c.text.includes('[open-trace]') || c.text.includes('[frameBudget]')),
  errors: allConsole.filter((c) => c.type === 'pageerror' || c.type === 'error').slice(0, 20),
};

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/optics-open-measure.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
