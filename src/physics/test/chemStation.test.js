/**
 * Chemistry station registration + lab-mode gating.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_CATALOG,
  PHYSICS_STATION_IDS,
  STATION_IDS,
  stationIdsForMode,
  findExperiment,
} from '../src/runtime/catalog.js';
import { resolveLabMode, isChemMode } from '../src/chem/labMode.js';
import { getReagent, getElement, CHEM_ELEMENTS, blendColors } from '../src/chem/reagentCatalog.js';
import { parseSdf } from '../src/chem/moleculeMesh.js';
import { pickChemHits, drawChemPeriodicPanel } from '../src/chem/periodicTableDraw.js';

describe('labMode', () => {
  it('defaults to physics', () => {
    assert.equal(resolveLabMode(''), 'physics');
    assert.equal(isChemMode('physics'), false);
  });

  it('reads ?mode=chem', () => {
    assert.equal(resolveLabMode('?mode=chem'), 'chem');
    assert.equal(resolveLabMode('?mode=chemistry'), 'chem');
    assert.equal(isChemMode('chem'), true);
  });
});

describe('catalog chem station', () => {
  it('includes chem in full catalog but not physics-only list', () => {
    assert.ok(LAB_CATALOG.chem);
    assert.equal(LAB_CATALOG.chem.id, 'chem');
    assert.ok(STATION_IDS.includes('chem'));
    assert.ok(!PHYSICS_STATION_IDS.includes('chem'));
    assert.deepEqual([...stationIdsForMode('chem')], ['chem']);
    assert.ok(!stationIdsForMode('physics').includes('chem'));
  });

  it('finds reagent-mix experiment', () => {
    const hit = findExperiment('reagent-mix');
    assert.equal(hit?.stationId, 'chem');
    assert.equal(hit?.experiment?.id, 'reagent-mix');
  });
});

describe('reagent catalog', () => {
  it('has curated elements and NaCl', () => {
    assert.ok(CHEM_ELEMENTS.length >= 10);
    assert.ok(getElement('Na'));
    const nacl = getReagent('nacl');
    assert.equal(nacl?.formula, 'NaCl');
  });

  it('blends colors', () => {
    const mid = blendColors(0xff0000, 0x0000ff, 0.5);
    assert.ok(typeof mid === 'number');
  });
});

describe('SDF parse + periodic hits', () => {
  it('parses a minimal mol block', () => {
    const sdf = [
      'water',
      '',
      '',
      '  3  2  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
      '    0.9600    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
      '   -0.2400    0.9300    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  1  0  0  0  0',
      '  1  3  1  0  0  0  0',
      'M  END',
    ].join('\n');
    const { atoms, bonds } = parseSdf(sdf);
    assert.equal(atoms.length, 3);
    assert.equal(bonds.length, 2);
    assert.equal(atoms[0].elem, 'O');
  });

  it('draws periodic panel and hits an element cell', () => {
    const canvas = { width: 1280, height: 900 };
    // node canvas stub
    const calls = [];
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      arcTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      fillText(...args) { calls.push(args); },
      measureText: (t) => ({ width: String(t).length * 8 }),
    };
    const { hits } = drawChemPeriodicPanel(ctx, canvas.width, canvas.height, {
      activeCup: 'A',
      pickerPhase: 'elements',
    });
    assert.ok(hits.length > 5);
    const elHit = hits.find((h) => h.action === 'chem-pick-element' && h.element === 'Na');
    assert.ok(elHit);
    // UV pick at cell center
    const u = (elHit.x + elHit.w / 2) / canvas.width;
    const v = 1 - (elHit.y + elHit.h / 2) / canvas.height;
    const picked = pickChemHits(hits, u, v, canvas.width, canvas.height);
    assert.equal(picked?.element, 'Na');
  });
});
