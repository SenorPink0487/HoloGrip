/**
 * Chemistry pour merge logic (pure state, no Three.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blendColors, getReagent } from '../src/chem/reagentCatalog.js';

function emptyCup() {
  return { reagents: [], fill: 0, color: 0x38bdf8, formula: '' };
}

function commitPour(state, from, to) {
  const src = state[from];
  const dst = state[to];
  if (!src.reagents.length) return state;
  if (!dst.reagents.length) {
    dst.reagents = src.reagents.map((r) => ({ ...r }));
    dst.color = src.color;
    dst.fill = 0.85;
  } else {
    const ids = new Set(dst.reagents.map((r) => r.id));
    for (const r of src.reagents) {
      if (!ids.has(r.id)) dst.reagents.push({ ...r });
    }
    dst.color = blendColors(dst.color, src.color, 0.5);
    dst.fill = Math.min(0.95, Math.max(dst.fill, 0.7) + 0.15);
  }
  dst.formula = dst.reagents.map((r) => r.formula).join('+');
  src.reagents = [];
  src.fill = 0;
  src.formula = '';
  return state;
}

describe('chem pour merge', () => {
  it('pours NaCl from A into empty B', () => {
    const nacl = getReagent('nacl');
    const state = {
      A: { reagents: [{ ...nacl }], fill: 0.85, color: nacl.color, formula: 'NaCl' },
      B: emptyCup(),
    };
    commitPour(state, 'A', 'B');
    assert.equal(state.A.fill, 0);
    assert.equal(state.A.reagents.length, 0);
    assert.equal(state.B.reagents[0].formula, 'NaCl');
    assert.ok(state.B.fill > 0.5);
  });

  it('merges two different reagents', () => {
    const nacl = getReagent('nacl');
    const h2o = getReagent('h2o');
    const state = {
      A: { reagents: [{ ...nacl }], fill: 0.8, color: nacl.color, formula: 'NaCl' },
      B: { reagents: [{ ...h2o }], fill: 0.8, color: h2o.color, formula: 'H2O' },
    };
    commitPour(state, 'A', 'B');
    assert.equal(state.B.reagents.length, 2);
    assert.ok(state.B.formula.includes('H2O'));
    assert.ok(state.B.formula.includes('NaCl'));
  });
});
