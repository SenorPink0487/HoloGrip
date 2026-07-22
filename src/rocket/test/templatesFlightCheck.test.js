/**
 * Templates + flight check (onboarding A)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRAFT_TEMPLATES,
  buildTemplateCraft,
  DEFAULT_TEMPLATE_ID,
  getTemplateMeta,
} from '../design/templates.js';
import { evaluateFlightCheck } from '../design/flightCheck.js';
import { attachPart, createEmptyCraft, alignStackParams, getPart } from '../design/craftGraph.js';
import { getPartDef } from '../design/partDefs.js';
import { calculateRocketPerformance } from '../design/performance.js';

describe('craft templates', () => {
  it('lists five starter templates including recommended + expert empty', () => {
    assert.equal(CRAFT_TEMPLATES.length, 5);
    assert.ok(CRAFT_TEMPLATES.some((t) => t.recommended));
    assert.ok(CRAFT_TEMPLATES.some((t) => t.expert && t.id === 'empty'));
    assert.equal(DEFAULT_TEMPLATE_ID, 'starship_full');
    assert.equal(getTemplateMeta('classic_two')?.name, '经典两级');
  });

  it('builds flyable crafts for non-empty templates', () => {
    for (const t of CRAFT_TEMPLATES) {
      if (t.id === 'empty') {
        const empty = buildTemplateCraft('empty');
        assert.equal(empty.rootId, null);
        assert.equal(Object.keys(empty.parts).length, 0);
        continue;
      }
      const craft = buildTemplateCraft(t.id);
      assert.ok(craft.rootId, `${t.id} has root`);
      assert.ok(Object.keys(craft.parts).length >= 3, `${t.id} has parts`);
      const report = evaluateFlightCheck(craft);
      assert.equal(report.canLaunch, true, `${t.id} should launch: ${report.headline}`);
      assert.notEqual(report.level, 'red', `${t.id} not red`);
      const perf = calculateRocketPerformance(craft);
      assert.ok(perf.twr >= 1, `${t.id} TWR ${perf.twr}`);
    }
  });

  it('starship template is default and multi-stage', () => {
    const c = buildTemplateCraft('starship_full');
    const r = evaluateFlightCheck(c);
    assert.ok(r.wizard.every((s) => s.done) || r.wizard.filter((s) => s.done).length >= 2);
    assert.ok(r.canLaunch);
  });
});

describe('flight check', () => {
  it('empty craft is red / no launch', () => {
    const r = evaluateFlightCheck(createEmptyCraft());
    assert.equal(r.level, 'red');
    assert.equal(r.canLaunch, false);
    assert.ok(r.checks.some((c) => c.id === 'root' && c.level === 'red'));
    assert.equal(r.wizard[0].done, false);
  });

  it('tank only is red (no engine)', () => {
    let c = createEmptyCraft();
    const a = attachPart(c, { defId: 'tank_std', params: { height: 30, diameter: 5 } });
    assert.ok(a.ok);
    const r = evaluateFlightCheck(a.craft);
    assert.equal(r.canLaunch, false);
    assert.ok(r.checks.some((c) => c.id === 'engine' && c.level === 'red'));
    assert.equal(r.wizard[0].done, true);
    assert.equal(r.wizard[1].done, false);
  });

  it('tank + engines can launch (wizard steps 1–2)', () => {
    let c = createEmptyCraft();
    let r = attachPart(c, { defId: 'tank_std', params: { height: 40, diameter: 9, fuelFill: 0.9 } });
    c = r.craft;
    r = attachPart(c, {
      defId: 'engine_raptor_sl',
      parentId: c.rootId,
      parentNode: 'bottom',
      params: { count: 9, layout: 'ring' },
    });
    assert.ok(r.ok);
    const check = evaluateFlightCheck(r.craft);
    assert.equal(check.canLaunch, true);
    assert.equal(check.wizard[0].done, true);
    assert.equal(check.wizard[1].done, true);
    assert.equal(check.wizard[2].done, false);
  });
});

describe('alignStackParams', () => {
  it('matches child diameter to parent tank', () => {
    const parent = { params: { diameter: 5.2, height: 40 } };
    const parentDef = getPartDef('tank_std');
    const childDef = getPartDef('decoupler_std');
    const aligned = alignStackParams(parent, parentDef, childDef, { height: 1.2 });
    assert.equal(aligned.diameter, 5.2);
  });

  it('attachPart auto-aligns stack diameter', () => {
    let c = createEmptyCraft();
    let r = attachPart(c, { defId: 'tank_heavy', params: { height: 40, diameter: 7.5 } });
    c = r.craft;
    r = attachPart(c, {
      defId: 'decoupler_std',
      parentId: c.rootId,
      parentNode: 'top',
      params: { diameter: 3 }, // wrong size — should auto-align
    });
    assert.ok(r.ok, r.reason);
    const dec = getPart(r.craft, r.primaryId);
    assert.equal(dec.params.diameter, 7.5);
  });
});
