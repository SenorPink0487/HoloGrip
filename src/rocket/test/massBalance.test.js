/**
 * CoM / thrust mass balance helpers
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMassBalance } from '../design/massBalance.js';
import { buildTemplateCraft } from '../design/templates.js';
import { createEmptyCraft, attachPart } from '../design/craftGraph.js';
import { NOSE_PRESETS } from '../design/partsLibrary.js';
import { getPartDef } from '../design/partDefs.js';

describe('estimateMassBalance', () => {
  it('starship template has CoM between base and tip with positive thrust', () => {
    const craft = buildTemplateCraft('starship_full');
    const b = estimateMassBalance(craft);
    assert.ok(b.totalMassKg > 1000);
    assert.ok(b.thrustN > 0);
    assert.ok(b.twr >= 1);
    assert.ok(b.comYFromStackBase > 0);
    assert.ok(b.comYFromStackBase < b.stackHeightM);
    assert.ok(b.comFraction > 0.15 && b.comFraction < 0.85);
    assert.ok(b.cotYFromStackBase < b.comYFromStackBase);
    assert.equal(b.canLiftOff, true);
  });

  it('empty craft is underpowered / zero mass safe', () => {
    const b = estimateMassBalance(createEmptyCraft());
    assert.ok(b.thrustN === 0 || b.twr < 1);
    assert.ok(Number.isFinite(b.comYFromStackBase));
  });

  it('adding upper mass raises CoM fraction', () => {
    let c = createEmptyCraft();
    let r = attachPart(c, {
      defId: 'tank_std',
      params: { height: 20, diameter: 5, fuelFill: 0.9 },
    });
    c = r.craft;
    r = attachPart(c, {
      defId: 'engine_raptor_sl',
      parentId: c.rootId,
      parentNode: 'bottom',
      params: { count: 5, layout: 'ring' },
    });
    c = r.craft;
    const low = estimateMassBalance(c);

    r = attachPart(c, {
      defId: 'decoupler_std',
      parentId: c.rootId,
      parentNode: 'top',
    });
    c = r.craft;
    r = attachPart(c, {
      defId: 'tank_std',
      parentId: r.primaryId,
      parentNode: 'top',
      params: { height: 40, diameter: 5, fuelFill: 0.95 },
    });
    c = r.craft;
    const high = estimateMassBalance(c);
    assert.ok(
      high.comYFromStackBase > low.comYFromStackBase,
      `CoM rose ${low.comYFromStackBase} → ${high.comYFromStackBase}`
    );
  });
});

describe('fairing part def', () => {
  it('registers adjustable fairing nose', () => {
    assert.ok(NOSE_PRESETS.fairing);
    const def = getPartDef('nose_fairing');
    assert.ok(def);
    assert.equal(def.shape, 'fairing');
    assert.ok(def.paramSchema.height.max >= 30);
  });
});
