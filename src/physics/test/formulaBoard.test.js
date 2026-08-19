import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMULA_CATALOG,
  drawFormulaBoard,
  pickFormulaBoard,
} from '../src/formulaBoard.js';

test('FORMULA_CATALOG has 5 stations with 25 real project experiments', () => {
  assert.equal(FORMULA_CATALOG.stations.length, 5);
  const stationIds = FORMULA_CATALOG.stations.map((s) => s.id);
  assert.deepEqual(stationIds, ['mechanics', 'electro', 'optics', 'thermo', 'chem']);

  assert.equal(FORMULA_CATALOG.items.length, 25);

  const mechanicsItems = FORMULA_CATALOG.items.filter((it) => it.cat === 'mechanics');
  assert.equal(mechanicsItems.length, 6);

  const electroItems = FORMULA_CATALOG.items.filter((it) => it.cat === 'electro');
  assert.equal(electroItems.length, 6);

  const opticsItems = FORMULA_CATALOG.items.filter((it) => it.cat === 'optics');
  assert.equal(opticsItems.length, 5);

  const thermoItems = FORMULA_CATALOG.items.filter((it) => it.cat === 'thermo');
  assert.equal(thermoItems.length, 5);

  const chemItems = FORMULA_CATALOG.items.filter((it) => it.cat === 'chem');
  assert.equal(chemItems.length, 3);
});

test('FORMULA_CATALOG items contain all required structured fields', () => {
  for (const item of FORMULA_CATALOG.items) {
    assert.ok(item.id, `item ${item.id} must have id`);
    assert.ok(item.cat, `item ${item.id} must have cat`);
    assert.ok(item.expId, `item ${item.id} must have expId`);
    assert.ok(item.expName, `item ${item.id} must have expName`);
    assert.ok(item.code, `item ${item.id} must have code`);
    assert.ok(item.title, `item ${item.id} must have title`);
    assert.ok(item.formula, `item ${item.id} must have formula`);
    assert.ok(item.concept, `item ${item.id} must have concept`);
    assert.ok(item.symbols, `item ${item.id} must have symbols`);
    assert.ok(item.labLink, `item ${item.id} must have labLink`);
  }
});

function createMockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    createLinearGradient() {
      return { addColorStop() {} };
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    stroke() {},
    fill() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    measureText(text) {
      return { width: String(text || '').length * 10 };
    },
    save() {},
    restore() {},
  };
}

test('drawFormulaBoard Level 1 (Home View) renders 5 station cards', () => {
  const ctx = createMockCtx();
  const W = 1920;
  const H = 900;

  const result = drawFormulaBoard(ctx, W, H, { stationId: null, selectedId: null });
  assert.ok(result.hits.length > 0);

  const stationHits = result.hits.filter((h) => h.action === 'station');
  assert.equal(stationHits.length, 5);
});

test('drawFormulaBoard Level 2 (Station Sub-page) renders experiment cards and back-home', () => {
  const ctx = createMockCtx();
  const W = 1920;
  const H = 900;

  const result = drawFormulaBoard(ctx, W, H, { stationId: 'mechanics', selectedId: null });
  assert.ok(result.hits.length > 0);

  const backHome = result.hits.find((h) => h.action === 'home');
  assert.ok(backHome, 'must have back to home button');

  const expHits = result.hits.filter((h) => h.action === 'select');
  assert.equal(expHits.length, 6, 'mechanics station must display 6 experiments');
});

test('drawFormulaBoard Level 3 (Experiment Detail) renders detail view with nav buttons', () => {
  const ctx = createMockCtx();
  const W = 1920;
  const H = 900;

  const result = drawFormulaBoard(ctx, W, H, { stationId: 'mechanics', selectedId: 'pendulum' });
  const backStation = result.hits.find((h) => h.action === 'back');
  assert.ok(backStation, 'must have back button in detail mode');

  const navHits = result.hits.filter((h) => h.action === 'nav');
  assert.ok(navHits.length > 0, 'must have nav buttons');
});

test('pickFormulaBoard picks station card in Home view and navigates', () => {
  const ctx = createMockCtx();
  const W = 1920;
  const H = 900;

  const result = drawFormulaBoard(ctx, W, H, { stationId: null, selectedId: null });
  const firstStation = result.hits.find((h) => h.action === 'station');
  assert.ok(firstStation);

  // Pick center of first station card
  const u = (firstStation.x + firstStation.w / 2) / W;
  const v = 1 - (firstStation.y + firstStation.h / 2) / H;

  const picked = pickFormulaBoard(u, v, W, H, result.hits);
  assert.ok(picked);
  assert.equal(picked.action, 'station');
  assert.equal(picked.stationId, firstStation.stationId);
});

test('parseFormulaAst correctly identifies fractions, square roots and Greek symbols', async () => {
  const { parseFormulaAst, measureFormulaAst, drawFormulaCardGroup } = await import('../src/physicsFormula.js');
  const ctx = createMockCtx();

  const ast = parseFormulaAst('h=\\frac{1}{2}gt^{2}；v=\\sqrt{2gh}');
  assert.ok(ast.length > 0);
  const frac = ast.find((n) => n.type === 'frac');
  assert.ok(frac, 'must parse \\frac node');
  assert.ok(frac.num.length > 0, 'fraction must have numerator');
  assert.ok(frac.den.length > 0, 'fraction must have denominator');

  const m = measureFormulaAst(ctx, ast, 24);
  assert.ok(m.width > 0);
  assert.ok(m.height > 0);

  // drawFormulaCardGroup should execute smoothly on mock ctx
  drawFormulaCardGroup(ctx, 'h=\\frac{1}{2}gt^{2}；v=\\sqrt{2gh}', 0, 0, 600, 200, { themeColor: '#0ea5e9' });
});

