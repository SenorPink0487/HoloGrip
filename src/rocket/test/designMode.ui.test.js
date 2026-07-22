/**
 * Design-mode UI shell + selection→summary contract tests (shipped controller).
 * Run: node --test tests/designMode.ui.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createDesignModeController } from '../design/designMode.js';
import {
  createDefaultStarshipDesign,
  calculateRocketPerformance,
  serializeDesign,
  deserializeDesign,
  cloneDesign,
  setStageEngineCount,
  setSideBoosterCount,
  compileFlightProjection,
} from '../design/index.js';
import { __memoryClear as memClear } from '../design/storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function makeRoot() {
  // Minimal DOM shim for node
  if (typeof globalThis.document === 'undefined') {
    const store = new Map();
    class FakeEl {
      constructor(tag = 'div') {
        this.tagName = String(tag).toUpperCase();
        this.children = [];
        this.attributes = {};
        this.style = {};
        this.classList = {
          _s: new Set(),
          add(...xs) {
            xs.forEach((x) => this._s.add(x));
          },
          remove(...xs) {
            xs.forEach((x) => this._s.delete(x));
          },
          toggle(x, force) {
            if (force === true) this._s.add(x);
            else if (force === false) this._s.delete(x);
            else if (this._s.has(x)) this._s.delete(x);
            else this._s.add(x);
          },
          contains(x) {
            return this._s.has(x);
          },
        };
        this.dataset = {};
        this._listeners = {};
        this.hidden = false;
        this.disabled = false;
        this.value = '';
        this.innerHTML = '';
        this.textContent = '';
        this.parentElement = null;
      }
      setAttribute(k, v) {
        this.attributes[k] = v;
      }
      getAttribute(k) {
        return this.attributes[k];
      }
      appendChild(c) {
        c.parentElement = this;
        this.children.push(c);
        return c;
      }
      querySelector(sel) {
        return queryAll(this, sel)[0] || null;
      }
      querySelectorAll(sel) {
        return queryAll(this, sel);
      }
      addEventListener(type, fn) {
        (this._listeners[type] ||= []).push(fn);
      }
      click() {
        (this._listeners.click || []).forEach((fn) => fn({ target: this }));
      }
    }

    function parseHTML(html, parent) {
      // Extremely small subset: assign innerHTML as string and index by id via regex
      parent._html = html;
      const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      parent._byId = parent._byId || {};
      for (const id of ids) {
        if (!parent._byId[id]) {
          const el = new FakeEl();
          el.id = id;
          // tag heuristics
          if (/dmUndo|dmRedo|dmReset|dmExport|dmImport|dmApply|dmExit|dmDup|dmDel|dmSwap|dmTab/.test(id)) {
            el.tagName = 'BUTTON';
          }
          if (id === 'dmImportFile' || id === 'dmTexFile') el.tagName = 'INPUT';
          parent._byId[id] = el;
        }
      }
      // class hooks for tabs/panels/tree actions
      for (const cls of ['ds-tab', 'dm-tree-item', 'dm-lib-item', 'dm-prop-group', 'dm-perf-detail']) {
        parent._byClass = parent._byClass || {};
        parent._byClass[cls] = parent._byClass[cls] || [];
      }
      // seed tabs
      if (html.includes('ds-tab')) {
        const lib = parent._byId.dmTabLib || new FakeEl('button');
        lib.id = 'dmTabLib';
        lib.dataset.tab = 'library';
        lib.classList.add('ds-tab', 'active');
        parent._byId.dmTabLib = lib;
        const tree = parent._byId.dmTabTree || new FakeEl('button');
        tree.id = 'dmTabTree';
        tree.dataset.tab = 'tree';
        tree.classList.add('ds-tab');
        parent._byId.dmTabTree = tree;
        parent._byClass['ds-tab'] = [lib, tree];
      }
      if (html.includes('dmTreeActions')) {
        const actions = parent._byId.dmTreeActions || new FakeEl('div');
        actions.id = 'dmTreeActions';
        actions.hidden = true;
        parent._byId.dmTreeActions = actions;
      }
      if (html.includes('dmPanelLib')) {
        parent._byId.dmPanelLib = parent._byId.dmPanelLib || new FakeEl('div');
        parent._byId.dmPanelLib.id = 'dmPanelLib';
        parent._byId.dmPanelTree = parent._byId.dmPanelTree || new FakeEl('div');
        parent._byId.dmPanelTree.id = 'dmPanelTree';
        parent._byId.dmPanelTree.hidden = true;
      }
    }

    function queryAll(root, sel) {
      if (!sel) return [];
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        // walk root._byId
        const found = findById(root, id);
        return found ? [found] : [];
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).split(/[\s.>]/)[0];
        return findByClass(root, cls);
      }
      if (sel.includes('[')) {
        // [data-bind], [data-action=...]
        return [];
      }
      return [];
    }

    function findById(node, id) {
      if (node.id === id) return node;
      if (node._byId?.[id]) return node._byId[id];
      for (const c of node.children || []) {
        const f = findById(c, id);
        if (f) return f;
      }
      // Also search nested HTML maps on any child
      if (node._byId) {
        for (const el of Object.values(node._byId)) {
          if (el.id === id) return el;
          if (el._byId?.[id]) return el._byId[id];
        }
      }
      return null;
    }

    function findByClass(node, cls) {
      const out = [];
      if (node._byClass?.[cls]) out.push(...node._byClass[cls]);
      if (node.classList?.contains?.(cls)) out.push(node);
      for (const c of node.children || []) out.push(...findByClass(c, cls));
      if (node._byId) {
        for (const el of Object.values(node._byId)) {
          if (el.classList?.contains?.(cls)) out.push(el);
        }
      }
      return out;
    }

    // Patch FakeEl innerHTML setter
    Object.defineProperty(FakeEl.prototype, 'innerHTML', {
      get() {
        return this._html || '';
      },
      set(v) {
        parseHTML(String(v), this);
      },
    });

    globalThis.document = {
      body: new FakeEl('body'),
      createElement: (t) => new FakeEl(t),
    };
    // classList body hooks
    document.body.classList = {
      _s: new Set(),
      add(...xs) {
        xs.forEach((x) => this._s.add(x));
      },
      remove(...xs) {
        xs.forEach((x) => this._s.delete(x));
      },
    };
  }

  const root = document.createElement('div');
  root.classList.add('design-mode-root');
  return root;
}

describe('designMode shell structure (VAB craft tree)', () => {
  beforeEach(() => {
    memClear();
  });

  it('builds tabbed left dock, summary, compact perf, status track', () => {
    const rootEl = makeRoot();
    let lastSel = undefined;
    const ctrl = createDesignModeController({
      rootEl,
      onDesignChange() {},
      onApplyToPad() {},
      onExit() {},
      onSelectionChange(sel) {
        lastSel = sel;
      },
    });

    // Force shell via render
    ctrl.render();
    const html = rootEl.innerHTML || rootEl._html || '';
    assert.ok(html.includes('orbital-lab') || html.includes('vab-shell') || html.includes('ds-tabs'), 'shell markers');
    assert.ok(html.includes('dmTabLib') && html.includes('dmTabTree'), 'library/tree tabs');
    assert.ok(html.includes('dmTabTpl') || html.includes('data-tab="templates"'), 'template wall tab');
    assert.ok(html.includes('dmFlightGate') || html.includes('能不能发射'), 'flight gate panel');
    assert.ok(html.includes('dmNovice') || html.includes('新手'), 'novice toggle');
    assert.ok(html.includes('dmReset'), 'reset-to-default button');
    assert.ok(html.includes('dmSelSummary'), 'selected part summary');
    assert.ok(html.includes('dmPerfStrip') || html.includes('ds-status-track'), 'status track');
    assert.ok(!html.includes('ds-viewport-scan'), 'no scanline chrome');
    assert.ok(!html.includes('PARAMETRIC LIVE RENDER'), 'no English HUD subtitle');
    assert.ok(!html.includes('ds-viewport-corner'), 'no corner HUD brackets');

    // Selection summary contract
    const d = createDefaultStarshipDesign();
    const sumRoot = ctrl.buildSelectionSummary(d, { type: 'root', index: 0 });
    assert.ok(sumRoot.title);
    const sumStage = ctrl.buildSelectionSummary(d, { type: 'stage', index: 0 });
    assert.equal(sumStage.type, 'stage');
    const sumEng = ctrl.buildSelectionSummary(d, { type: 'engines', index: 0 });
    assert.equal(sumEng.type, 'engines');

    // Compact perf contract
    const perf = calculateRocketPerformance(d);
    const compact = ctrl.buildCompactPerf(perf);
    assert.ok('twr' in compact && 'massKg' in compact && 'thrustN' in compact && 'valid' in compact);
    assert.equal(compact.valid, true);
    assert.ok(compact.twr > 1);

    // Selection emit
    assert.ok(lastSel === null || lastSel?.type, 'selection callback fired');
  });

  it('getSelected returns current tree selection shape', () => {
    const rootEl = makeRoot();
    const ctrl = createDesignModeController({
      rootEl,
      onDesignChange() {},
      onApplyToPad() {},
      onExit() {},
    });
    ctrl.render();
    const sel = ctrl.getSelected();
    assert.ok(sel);
    assert.ok(['root', 'stage', 'nose', 'engines', 'wing', 'decor', 'side', 'part'].includes(sel.type));
    assert.equal(typeof sel.index, 'number');
  });

  it('resetToDefault restores Starship clone and is undoable', () => {
    const rootEl = makeRoot();
    const changes = [];
    const toasts = [];
    const ctrl = createDesignModeController({
      rootEl,
      onDesignChange(d) {
        changes.push(d);
      },
      onApplyToPad() {},
      onExit() {},
      onToast(msg, kind) {
        toasts.push({ msg, kind });
      },
    });
    ctrl.render();

    let modified = cloneDesign(createDefaultStarshipDesign());
    modified.name = '自定义构型';
    modified = setStageEngineCount(modified, 0, 1);
    ctrl.setDesign(modified);

    assert.equal(ctrl.getDesign().name, '自定义构型');
    assert.equal(compileFlightProjection(ctrl.getDesign()).stages[0].engines.count, 1);

    ctrl.resetToDefault();
    const restored = ctrl.getDesign();
    const baseline = createDefaultStarshipDesign();
    assert.equal(restored.name, baseline.name);
    assert.equal(
      compileFlightProjection(restored).stages[0].engines.count,
      compileFlightProjection(baseline).stages[0].engines.count
    );
    assert.equal(ctrl.getSelected()?.type, 'root');
    assert.ok(toasts.some((t) => t.kind === 'ok' && /初始|Starship|重置|恢复/.test(t.msg)));
    assert.ok(ctrl.history.canUndo(), 'reset pushes history for undo');

    const undone = ctrl.history.undo();
    assert.ok(undone);
    assert.equal(undone.name, '自定义构型');
    assert.equal(compileFlightProjection(undone).stages[0].engines.count, 1);
  });

  it('beginInstall enters install mode with valid targets', () => {
    const rootEl = makeRoot();
    const ctrl = createDesignModeController({
      rootEl,
      onDesignChange() {},
      onApplyToPad() {},
      onExit() {},
    });
    ctrl.render();
    ctrl.beginInstall('engine_merlin');
    const st = ctrl.getInstallState();
    assert.equal(st.defId, 'engine_merlin');
    assert.ok(st.targets.length > 0);
    ctrl.cancelInstall();
    assert.equal(ctrl.getInstallState().defId, null);
  });
});

describe('design regression surfaces still work', () => {
  it('serialize/deserialize round-trip craft graph', () => {
    const d = createDefaultStarshipDesign();
    d.name = 'Orbital Lab Fixture';
    const json = serializeDesign(d);
    const { design } = deserializeDesign(json);
    assert.equal(design.name, 'Orbital Lab Fixture');
    const a = compileFlightProjection(d);
    const b = compileFlightProjection(design);
    assert.equal(b.stageCount, a.stageCount);
    assert.equal(b.stages[0].engines.count, a.stages[0].engines.count);
  });

  it('calculateRocketPerformance on default still positive mass/thrust/TWR', () => {
    const p = calculateRocketPerformance(createDefaultStarshipDesign());
    assert.ok(p.liftoffMassKg > 0);
    assert.ok(p.totalThrustN > 0);
    assert.ok(p.twr > 1);
    assert.equal(p.canLiftOff, true);
  });

  it('underpowered compact.valid is false', () => {
    const rootEl = makeRoot();
    const ctrl = createDesignModeController({
      rootEl,
      onDesignChange() {},
      onApplyToPad() {},
      onExit() {},
    });
    let weak = setStageEngineCount(createDefaultStarshipDesign(), 0, 1);
    weak = setStageEngineCount(weak, 1, 0);
    weak = setSideBoosterCount(weak, 0);
    const compact = ctrl.buildCompactPerf(calculateRocketPerformance(weak));
    assert.equal(compact.valid, false);
    assert.ok(compact.twr < 1);
  });
});

describe('static CSS / source tokens (VAB)', () => {
  it('style.css has graphite / titanium / accent roles and VAB layout', () => {
    const css = readFileSync(join(rootDir, 'style.css'), 'utf8');
    assert.ok(css.includes('--ds-graphite'));
    assert.ok(css.includes('--ds-titanium'));
    assert.ok(css.includes('--ds-blue'));
    assert.ok(css.includes('--ds-orange'));
    assert.ok(css.includes('--ds-green'));
    assert.ok(css.includes('prefers-reduced-motion'));
    assert.ok(css.includes('ds-status-track') || css.includes('ds-status-msg'));
    assert.ok(css.includes('ds-tab'));
    assert.ok(css.includes('--ds-sans') || css.includes('DM Sans'));
    assert.ok(css.includes('vab-part-grid') || css.includes('vab-cat-rail'));
    const modeJs = readFileSync(join(rootDir, 'design/designMode.js'), 'utf8');
    assert.ok(!modeJs.includes('ds-viewport-scan'));
    assert.ok(modeJs.includes('beginInstall') || modeJs.includes('attachPart'));
    assert.ok(modeJs.includes('onSelectionChange'));
    assert.ok(modeJs.includes('vab-shell') || modeJs.includes('载具装配'));
  });

  it('designStudio has framing fill, reveal ms, hangar accents, setSelectedPart', () => {
    const src = readFileSync(join(rootDir, 'design/designStudio.js'), 'utf8');
    assert.ok(src.includes('DEFAULT_ROCKET_VIEWPORT_FILL'));
    assert.ok(src.includes('0.72'));
    assert.ok(src.includes('ENTER_REVEAL_MS'));
    assert.ok(src.includes('700'));
    assert.ok(src.includes('setSelectedPart'));
    assert.ok(src.includes('prefersReducedMotion') || src.includes('prefers-reduced-motion'));
    assert.ok(src.includes('HangarSilhouette') || src.includes('ScaleMarks') || src.includes('SoftBeam'));
    assert.ok(src.includes('PodiumWash') || src.includes('ContactShadow'));
    assert.ok(src.includes('autoRotate'));
    // Clone-per-mesh highlight (no shared Full Stack bleed)
    assert.ok(src.includes('mat.clone()') || src.includes('.clone()'));
  });

  it('quiet bottom strip is non-metric when healthy', () => {
    const modeJs = readFileSync(join(rootDir, 'design/designMode.js'), 'utf8');
    // Flight-gate headline path (A onboarding) — must not duplicate TWR metric
    assert.ok(
      modeJs.includes('gate.headline') || modeJs.includes('可以发射') || modeJs.includes('evaluateFlightCheck'),
      'status strip uses flight-check headline'
    );
    const quietAssign = modeJs.match(
      /strip\.innerHTML\s*=\s*`[^`]*gate\.headline[^`]*`/
    );
    assert.ok(quietAssign, 'quiet status assignment present');
    assert.ok(!quietAssign[0].includes('推重比'), 'quiet strip must not duplicate TWR');
  });
});
