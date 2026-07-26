/**
 * Reproducible experiment open timing (menu + card) after lab-ready.
 *
 * Usage:
 *   LAB_URL=http://127.0.0.1:5173 node scripts/measure_experiment_open.mjs [stationId] [expId]
 *   node scripts/measure_experiment_open.mjs optics reflection
 *   node scripts/measure_experiment_open.mjs electro faraday_induction
 *   node scripts/measure_experiment_open.mjs all
 *
 * Writes JSON to output/experiment-open-measure.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.LAB_URL || 'http://127.0.0.1:5173';
const URL = `${BASE}/`;
const arg0 = process.argv[2] || 'optics';
const arg1 = process.argv[3] || 'reflection';

/** @type {Array<{ stationId: string, expId: string }>} */
const CASES = arg0 === 'all'
  ? [
    { stationId: 'optics', expId: 'reflection' },
    { stationId: 'optics', expId: 'refraction' },
    { stationId: 'optics', expId: 'dispersion' },
    { stationId: 'optics', expId: 'lens' },
    { stationId: 'optics', expId: 'multi_slit_diffraction' },
    { stationId: 'electro', expId: 'faraday_induction' },
    { stationId: 'electro', expId: 'gauss_theorem' },
    { stationId: 'mechanics', expId: 'free-fall' },
    { stationId: 'thermo', expId: 'calorimetry' },
  ]
  : [{ stationId: arg0, expId: arg1 }];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const allConsole = [];
page.on('console', (msg) => allConsole.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (err) => allConsole.push({ type: 'pageerror', text: String(err) }));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

// Boot can be long (full prewarm + final GPU hot-set refresh). Wait up to ~5 min.
let ready = false;
for (let i = 0; i < 300; i += 1) {
  ready = await page.evaluate(() => document.body.classList.contains('lab-ready'));
  if (ready) break;
  await page.waitForTimeout(1000);
}

const pre = await page.evaluate(() => ({
  ready: document.body.classList.contains('lab-ready'),
  hasMeasureOpen: typeof window.__labDebug?.measureOpen === 'function',
  hasStart: typeof window.__labDebug?.startExperiment === 'function',
  hot: window.__labDebug?.hot ?? null,
  preparedCount: window.__labDebug?.preparedExperimentIds
    ? [...window.__labDebug.preparedExperimentIds].length
    : null,
  geoGpuReady: window.__labDebug?.geoGpuReady ?? null,
  keys: window.__labDebug ? Object.keys(window.__labDebug) : [],
}));

/** @type {unknown[]} */
const results = [];

for (const { stationId, expId } of CASES) {
  // Close any open experiment so each case starts clean.
  await page.evaluate(() => {
    try { window.__labDebug?.getExpManager?.()?.exitExperiment?.(); } catch { /* ignore */ }
    try { window.__labDebug?.getExpManager?.()?.closeMenu?.(); } catch { /* ignore */ }
    try { window.__labDebug?.stationPresence?.setHotStation?.(null); } catch { /* ignore */ }
  });
  await page.waitForTimeout(200);

  const report = await page.evaluate(async ({ stationId: sid, expId: eid }) => {
    const dbg = window.__labDebug;
    if (!dbg) return { error: 'no __labDebug (need Vite DEV build)' };
    if (typeof dbg.measureOpen === 'function') {
      return dbg.measureOpen({
        stationId: sid,
        expId: eid,
        openMenu: true,
        settleMs: 250,
        timeoutMs: 6000,
      });
    }
    // Fallback if measureOpen missing
    const t0 = performance.now();
    dbg.openStationMenu?.(sid);
    dbg.startExperiment?.(eid);
    await new Promise((r) => setTimeout(r, 1200));
    return {
      fallback: true,
      stationId: sid,
      expId: eid,
      wallMs: performance.now() - t0,
      hot: dbg.hot ?? null,
      geoGpuReady: dbg.geoGpuReady ?? null,
      lastSession: dbg.openTiming?.getLast?.() || null,
    };
  }, { stationId, expId });

  results.push(report);
  // eslint-disable-next-line no-console
  console.log(
    `[measure] ${stationId}/${expId}`,
    report?.error
      || `click=${report?.clickMs}ms wall=${report?.wallMs}ms maxGap=${report?.maxGap} maxLT=${report?.maxLongTask}`,
  );
}

const openTraces = allConsole.filter(
  (c) => c.text.includes('[open-trace]') || c.text.includes('[frameBudget]'),
);

const out = {
  url: URL,
  at: new Date().toISOString(),
  pre,
  cases: CASES,
  results,
  openTraces: openTraces.slice(-120),
  errors: allConsole.filter((c) => c.type === 'pageerror' || c.type === 'error').slice(0, 30),
};

fs.mkdirSync('output', { recursive: true });
const outPath = path.join('output', 'experiment-open-measure.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
// Also keep optics-named file when single optics case (compat with older path).
if (CASES.length === 1 && CASES[0].stationId === 'optics') {
  fs.writeFileSync(path.join('output', 'optics-open-measure.json'), JSON.stringify(out, null, 2));
}
console.log(`\nWrote ${outPath}`);
console.log(JSON.stringify({
  ready: pre.ready,
  hasMeasureOpen: pre.hasMeasureOpen,
  summary: results.map((r) => ({
    stationId: r?.stationId,
    expId: r?.expId,
    clickMs: r?.clickMs,
    wallMs: r?.wallMs,
    maxGap: r?.maxGap,
    maxLongTask: r?.maxLongTask,
    settled: r?.settled,
    topMarks: r?.experimentSession?.marks?.slice?.(0, 8),
    topJobs: r?.experimentSession?.topJobs,
    error: r?.error,
  })),
}, null, 2));

await browser.close();
process.exit(pre.ready && !results.some((r) => r?.error) ? 0 : 1);
