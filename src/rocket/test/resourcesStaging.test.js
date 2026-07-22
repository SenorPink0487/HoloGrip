/**
 * Resources, connections, staging & action groups.
 * Run: node --test tests/resourcesStaging.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultStarshipCraft,
  attachPart,
  normalizeCraft,
} from '../design/craftGraph.js';
import {
  partResourceAmount,
  summarizeCraftResources,
  buildFuelGraph,
  strutIntegrity,
} from '../design/resources.js';
import {
  addConnection,
  removeConnection,
  setPartCrossfeed,
  listConnections,
} from '../design/connections.js';
import {
  buildDefaultStaging,
  ensureStaging,
  rebuildStaging,
  moveStageGroup,
  setStagingManual,
  toggleActionGroup,
  partActionGroups,
  ACTION_GROUP_KEYS,
} from '../design/staging.js';
import { calculateRocketPerformance } from '../design/performance.js';
import { createRocketFromDesign } from '../design/generator.js';
import { setSideBoosterCount } from '../design/designModel.js';

describe('resources on tanks / engines', () => {
  it('tank stores LF+OX, engine has tiny EC', () => {
    let c = createDefaultStarshipCraft();
    c = normalizeCraft(c);
    const tank = Object.values(c.parts).find((p) => p.defId.startsWith('tank_'));
    const eng = Object.values(c.parts).find((p) => p.defId.startsWith('engine_'));
    assert.ok(tank && eng);
    const tr = partResourceAmount(tank);
    assert.ok(tr.LF > 1000, 'LF');
    assert.ok(tr.OX > 1000, 'OX');
    const er = partResourceAmount(eng);
    assert.ok(er.EC > 0);
  });

  it('summarizeCraftResources totals LF/OX and reports fuel lines', () => {
    const c = createDefaultStarshipCraft();
    const s = summarizeCraftResources(c);
    assert.ok(s.totals.LF > 0);
    assert.ok(s.totals.OX > 0);
    assert.equal(s.fuelLines, 0);
  });
});

describe('fuel lines & struts', () => {
  it('adds fuel line between two tanks and builds graph edge', () => {
    let c = createDefaultStarshipCraft();
    const tanks = Object.values(c.parts).filter((p) => p.defId.startsWith('tank_'));
    assert.ok(tanks.length >= 2);
    const r = addConnection(c, 'fuelLine', tanks[0].id, tanks[1].id);
    assert.equal(r.ok, true);
    c = r.craft;
    assert.equal(listConnections(c, 'fuelLine').length, 1);
    const g = buildFuelGraph(c);
    assert.ok(g.get(tanks[0].id)?.has(tanks[1].id));
  });

  it('strut increases integrity; remove connection works', () => {
    let c = createDefaultStarshipCraft();
    const tanks = Object.values(c.parts).filter((p) => p.defId.startsWith('tank_'));
    const r = addConnection(c, 'strut', tanks[0].id, tanks[1].id);
    assert.equal(r.ok, true);
    c = r.craft;
    assert.ok(strutIntegrity(c) >= 12);
    const id = listConnections(c, 'strut')[0].id;
    c = removeConnection(c, id);
    assert.equal(listConnections(c, 'strut').length, 0);
  });

  it('side booster without crossfeed warns', () => {
    let c = setSideBoosterCount(createDefaultStarshipCraft(), 2);
    const s = summarizeCraftResources(c);
    assert.ok(s.warnings.some((w) => /侧助推|交叉|燃料管/.test(w)));
  });

  it('crossfeed flag on side clears fuel warning path into graph', () => {
    let c = setSideBoosterCount(createDefaultStarshipCraft(), 2);
    const side = Object.values(c.parts).find((p) => p.defId.startsWith('side_'));
    assert.ok(side);
    c = setPartCrossfeed(c, side.id, true);
    const g = buildFuelGraph(c);
    assert.ok(g.get(side.id)?.has(side.parentId));
  });
});

describe('staging', () => {
  it('default staging has engine activation then decouple', () => {
    const c = createDefaultStarshipCraft();
    const st = buildDefaultStaging(c);
    assert.ok(st.groups.length >= 2);
    const kinds = st.groups.flatMap((g) => g.icons.map((i) => i.kind));
    assert.ok(kinds.includes('activateEngine'));
    assert.ok(kinds.includes('decouple'));
  });

  it('moveStageGroup reorders and marks manual', () => {
    let c = rebuildStaging(createDefaultStarshipCraft());
    const id0 = c.staging.groups[0].id;
    c = moveStageGroup(c, id0, 1);
    assert.equal(c.staging.auto, false);
    assert.notEqual(c.staging.groups[0].id, id0);
  });

  it('ensureStaging preserves manual order', () => {
    let c = rebuildStaging(createDefaultStarshipCraft());
    const groups = [...c.staging.groups].reverse();
    c = setStagingManual(c, groups);
    const idFirst = c.staging.groups[0].id;
    c = ensureStaging(c);
    assert.equal(c.staging.auto, false);
    assert.equal(c.staging.groups[0].id, idFirst);
  });
});

describe('action groups', () => {
  it('toggle AG membership on a part', () => {
    let c = createDefaultStarshipCraft();
    const eng = Object.values(c.parts).find((p) => p.defId.startsWith('engine_'));
    c = toggleActionGroup(c, 'custom1', eng.id, 'toggle');
    assert.ok(partActionGroups(c, eng.id).includes('custom1'));
    c = toggleActionGroup(c, 'custom1', eng.id, 'toggle');
    assert.ok(!partActionGroups(c, eng.id).includes('custom1'));
    assert.ok(ACTION_GROUP_KEYS.length >= 10);
  });
});

describe('performance + mesh integrate resources', () => {
  it('performance exposes resources and strutIntegrity', () => {
    const p = calculateRocketPerformance(createDefaultStarshipCraft());
    assert.ok(p.resources?.totals?.LF > 0);
    assert.ok(typeof p.strutIntegrity === 'number');
  });

  it('fuel line appears in rocket mesh as Connections group', () => {
    let c = createDefaultStarshipCraft();
    const tanks = Object.values(c.parts).filter((p) => p.defId.startsWith('tank_'));
    c = addConnection(c, 'fuelLine', tanks[0].id, tanks[1].id).craft;
    const root = createRocketFromDesign(c);
    let found = false;
    root.traverse((o) => {
      if (o.name === 'Connections' || o.userData?.isConnection) found = true;
    });
    assert.ok(found, 'expected connection mesh');
    root.userData.dispose();
  });
});
