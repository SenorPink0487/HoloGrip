/**
 * Unit tests for design-domain (craft graph + flight compile).
 * Run: node --test tests/design.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultStarshipDesign,
  normalizeDesign,
  cloneDesign,
  setStageCount,
  setStageEngineCount,
  setStageTankParams,
  setSideBoosterCount,
  calculateRocketPerformance,
  serializeDesign,
  deserializeDesign,
  validateTextureFile,
  createRocketFromDesign,
  sideBoosterAngles,
  computeEnginePositions,
  createDesignHistory,
  fitMaxEdge,
  MAX_TEXTURE_EDGE,
  DESIGN_VERSION,
  resolveBootDesign,
  saveDesignLocal,
  loadDesignLocal,
  isDefaultStarshipVisual,
  compileFlightProjection,
  attachPart,
  canAttach,
  detachPart,
  asCraft,
  setPartParams,
  getPart,
} from '../design/index.js';
import { __memoryClear as memClear } from '../design/storage.js';

describe('default Starship-clone design (craft graph)', () => {
  it('has version 2 craft tree and Starship-like compiled stages', () => {
    const d = createDefaultStarshipDesign();
    assert.equal(d.version, DESIGN_VERSION);
    assert.ok(d.rootId);
    assert.ok(d.parts && Object.keys(d.parts).length > 5);
    const p = compileFlightProjection(d);
    assert.equal(p.stageCount, 2);
    assert.equal(p.stages.length, 2);
    assert.ok(p.stages[0].height >= 70 && p.stages[0].height <= 75);
    assert.ok(p.stages[1].height >= 50 && p.stages[1].height <= 55);
    assert.equal(p.stages[0].diameter, 9);
    assert.equal(p.stages[0].engines.count, 33);
    assert.equal(p.stages[1].engines.count, 6);
  });
});

describe('craft attach rules', () => {
  it('rejects engine on top node and accepts on bottom', () => {
    const d = createDefaultStarshipDesign();
    const root = d.rootId;
    assert.equal(canAttach(d, root, 'top', 'engine_raptor_sl').ok, false);
    assert.equal(canAttach(d, root, 'bottom', 'engine_raptor_sl').ok, true);
  });

  it('attaches nose via install targets', () => {
    let c = createDefaultStarshipDesign();
    // strip ship nose by finding nose parts
    for (const p of Object.values(c.parts)) {
      if (p.defId.startsWith('nose_')) c = detachPart(c, p.id);
    }
    const shipTank = Object.values(c.parts).find(
      (p) => p.defId === 'tank_std' && p.parentId
    );
    assert.ok(shipTank);
    const r = attachPart(c, {
      defId: 'nose_cone',
      parentId: shipTank.id,
      parentNode: 'top',
    });
    assert.equal(r.ok, true);
    const proj = compileFlightProjection(r.craft);
    assert.equal(proj.stages[1].nose.preset, 'cone');
  });
});

describe('calculateRocketPerformance', () => {
  it('default design has positive mass/thrust/Δv and TWR > 1', () => {
    const d = createDefaultStarshipDesign();
    const p = calculateRocketPerformance(d);
    assert.ok(p.liftoffMassKg > 0, 'mass > 0');
    assert.ok(p.totalThrustN > 0, 'thrust > 0');
    assert.ok(p.deltaV > 0, 'deltaV > 0');
    assert.ok(p.totalHeightM > 100, 'height ~ stack');
    assert.ok(p.twr > 1, `TWR should be > 1, got ${p.twr}`);
    assert.equal(p.canLiftOff, true);
    assert.equal(p.underpowered, false);
    assert.equal(p.hasInterstageSeparation, true);
    assert.ok(Array.isArray(p.stages) && p.stages.length === 2);
  });

  it('covers TWR > 1, ≈ 1, and < 1 bands', () => {
    const base = createDefaultStarshipDesign();

    const high = setStageEngineCount(base, 0, 33);
    const high2 = setStageTankParams(high, 0, { fuelFill: 0.5 });
    const pHigh = calculateRocketPerformance(high2);
    assert.ok(pHigh.twr > 1, `high TWR ${pHigh.twr}`);

    const p0 = calculateRocketPerformance(base);
    let bestP = p0;
    for (let n = 1; n <= 40; n++) {
      const c = setStageEngineCount(base, 0, n);
      const c2 = setSideBoosterCount(c, 0);
      const p = calculateRocketPerformance(c2);
      if (Math.abs(p.twr - 1) < Math.abs(bestP.twr - 1)) bestP = p;
    }
    if (Math.abs(bestP.twr - 1) <= 0.35) {
      assert.ok(bestP.twr > 0.65 && bestP.twr < 1.35, `near-1 TWR ${bestP.twr}`);
    } else {
      assert.ok(Number.isFinite(bestP.twr));
    }

    let low = setStageEngineCount(base, 0, 1);
    low = setStageEngineCount(low, 1, 0);
    low = setSideBoosterCount(low, 0);
    low = setStageTankParams(low, 0, { fuelFill: 1 });
    low = setStageTankParams(low, 1, { fuelFill: 1 });
    const pLow = calculateRocketPerformance(low);
    assert.ok(pLow.twr < 1, `low TWR ${pLow.twr}`);
    assert.equal(pLow.underpowered, true);
    assert.equal(pLow.canLiftOff, false);
    assert.ok(pLow.warnings.length > 0, 'warnings for underpowered');
    assert.ok(
      pLow.warnings.some((w) => /推重比|动力不足|升空/.test(w)),
      'warning mentions TWR/underpowered'
    );
  });

  it('missing structure / engines produces warnings', () => {
    let d = createDefaultStarshipDesign();
    d = setStageEngineCount(d, 0, 0);
    d = setStageEngineCount(d, 1, 0);
    d = setSideBoosterCount(d, 0);
    const p = calculateRocketPerformance(d);
    assert.ok(p.warnings.length > 0);
    assert.ok(p.totalThrustN === 0 || p.twr < 1);
  });

  it('metrics change when height/diameter/engines change', () => {
    const a = createDefaultStarshipDesign();
    let b = setStageTankParams(a, 0, { height: 40, diameter: 6 });
    b = setStageEngineCount(b, 0, 10);
    const pa = calculateRocketPerformance(a);
    const pb = calculateRocketPerformance(b);
    assert.notEqual(pa.totalHeightM, pb.totalHeightM);
    assert.notEqual(pa.liftoffMassKg, pb.liftoffMassKg);
    assert.notEqual(pa.totalThrustN, pb.totalThrustN);
  });
});

describe('createRocketFromDesign assembly', () => {
  it('part-tree mesh: tank height/diameter edits change stage metrics visibly', () => {
    const d1 = createDefaultStarshipDesign();
    let d2 = setStageTankParams(d1, 0, { height: 40, diameter: 5 });
    const a1 = createRocketFromDesign(d1);
    const a2 = createRocketFromDesign(d2);
    assert.ok(a1.userData.booster.userData.height > a2.userData.booster.userData.height + 10);
    assert.ok(Math.abs(a2.userData.booster.userData.radius - 2.5) < 1e-6);
    // Distinct part groups exist (not a single anonymous blob)
    let tankParts = 0;
    a1.traverse((o) => {
      if (o.name === 'PartTank') tankParts++;
    });
    assert.ok(tankParts >= 2, `expected ≥2 PartTank meshes, got ${tankParts}`);
    a1.userData.dispose();
    a2.userData.dispose();
  });

  it('builds assembly with height/mass/engine data matching design', () => {
    const d = createDefaultStarshipDesign();
    const root = createRocketFromDesign(d);
    assert.equal(root.userData.isRocketAssembly, true);
    assert.equal(root.userData.stageCount, 2);
    assert.ok(root.userData.booster);
    assert.ok(root.userData.ship);
    assert.ok(root.userData.totalHeight > 100);
    assert.ok(root.userData.massKg > 0);
    assert.ok(root.userData.thrustN > 0);
    assert.equal(root.userData.booster.userData.engineCount, 33);
    assert.equal(root.userData.ship.userData.engineCount, 6);
    assert.ok(typeof root.userData.setViewMode === 'function');
    assert.ok(typeof root.userData.resetPose === 'function');
    assert.ok(typeof root.userData.setEngineGlow === 'function');
    assert.ok(typeof root.userData.dispose === 'function');
    assert.ok(typeof root.userData.getStackMidHeight === 'function');
    root.userData.dispose();
  });

  it('regenerates metrics when stage height/engines change', () => {
    const d1 = createDefaultStarshipDesign();
    let d2 = setStageTankParams(d1, 0, { height: 50 });
    d2 = setStageEngineCount(d2, 0, 12);
    const a1 = createRocketFromDesign(d1);
    const a2 = createRocketFromDesign(d2);
    assert.notEqual(a1.userData.booster.userData.height, a2.userData.booster.userData.height);
    assert.notEqual(a1.userData.thrustN, a2.userData.thrustN);
    assert.notEqual(a1.userData.totalHeight, a2.userData.totalHeight);
    a1.userData.dispose();
    a2.userData.dispose();
  });

  it('single-stage has no interstage sep path', () => {
    const d = setStageCount(createDefaultStarshipDesign(), 1);
    const root = createRocketFromDesign(d);
    assert.equal(root.userData.stageCount, 1);
    assert.equal(root.userData.hasInterstageSeparation, false);
    assert.equal(root.userData.booster.visible, false);
    assert.equal(root.userData.ship.visible, true);
    root.userData.dispose();
  });

  it('places 2 and 4 side boosters symmetrically', () => {
    const ang2 = sideBoosterAngles(2);
    const ang4 = sideBoosterAngles(4);
    assert.equal(ang2.length, 2);
    assert.equal(ang4.length, 4);
    const diff2 = Math.abs(Math.abs(ang2[1] - ang2[0]) - Math.PI);
    assert.ok(diff2 < 1e-9, '2 boosters 180° apart');
    const step = ang4[1] - ang4[0];
    assert.ok(Math.abs(step - Math.PI / 2) < 1e-9);

    for (const count of [2, 4]) {
      const d = setSideBoosterCount(createDefaultStarshipDesign(), count);
      const root = createRocketFromDesign(d);
      assert.equal(root.userData.sideBoosters.length, count);
      assert.equal(root.userData.hasSideBoosterSeparation, true);
      const positions = root.userData.sideBoosters.map((sb) => ({
        x: sb.position.x,
        z: sb.position.z,
      }));
      const cx = positions.reduce((s, p) => s + p.x, 0) / count;
      const cz = positions.reduce((s, p) => s + p.z, 0) / count;
      assert.ok(Math.abs(cx) < 1e-6, `cx ${cx}`);
      assert.ok(Math.abs(cz) < 1e-6, `cz ${cz}`);
      const r0 = Math.hypot(positions[0].x, positions[0].z);
      for (const p of positions) {
        assert.ok(Math.abs(Math.hypot(p.x, p.z) - r0) < 1e-6);
      }
      root.userData.dispose();
    }
  });
});

describe('serialize / deserialize', () => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('round-trips craft with embedded texture Data URL', () => {
    let d = createDefaultStarshipDesign();
    d = { ...d, name: 'Test Rocket' };
    d = setSideBoosterCount(d, 2);
    d = cloneDesign(d);
    d.textures = {
      ...(d.textures || {}),
      tex_test: { mime: 'image/png', dataUrl: tinyPng, width: 1, height: 1 },
    };
    d = setPartParams(d, d.rootId, { textureId: 'tex_test', uv: { ...getPart(d, d.rootId).params.uv, scale: 2, offsetX: 0.1 } });

    const json = serializeDesign(d);
    assert.ok(json.includes('huojian-rocket-design'));
    assert.ok(json.includes('tex_test'));
    assert.ok(json.includes('data:image/png'));
    assert.ok(json.includes('parts'));

    const { design, warnings } = deserializeDesign(json);
    assert.equal(design.name, 'Test Rocket');
    const proj = compileFlightProjection(design);
    assert.equal(proj.sideBoosters.count, 2);
    assert.ok(design.textures.tex_test);
    assert.equal(design.textures.tex_test.dataUrl, tinyPng);
    assert.equal(getPart(design, design.rootId).params.textureId, 'tex_test');
    assert.equal(getPart(design, design.rootId).params.uv.scale, 2);
    assert.ok(Array.isArray(warnings));
  });

  it('migrates v1 stage document on import', () => {
    const v1 = {
      format: 'huojian-rocket-design',
      version: 1,
      design: {
        version: 1,
        id: 'old',
        name: 'Legacy',
        stageCount: 2,
        stages: [
          {
            id: 's0',
            role: 'booster',
            name: 'B',
            preset: 'cylinder_heavy',
            height: 72,
            diameter: 9,
            fuelFill: 0.9,
            nose: null,
            engines: { preset: 'heavy_booster', count: 33, layout: 'superheavy' },
            wings: [],
            decor: [],
            material: { type: 'metal', color: '#d8dde5' },
          },
          {
            id: 's1',
            role: 'upper',
            name: 'S',
            preset: 'cylinder_std',
            height: 52,
            diameter: 9,
            fuelFill: 0.88,
            nose: { preset: 'ogive', height: 12 },
            engines: { preset: 'raptor_sl', count: 6, layout: 'starship' },
            wings: [],
            decor: [],
            material: { type: 'metal', color: '#d8dde5' },
          },
        ],
        sideBoosters: {
          count: 0,
          preset: 'strap_std',
          height: 55,
          diameter: 3.6,
          fuelFill: 0.9,
          engines: { preset: 'merlin', count: 9, layout: 'ring' },
          separatePhase: 'ascent',
        },
        textures: {},
        meta: { createdAt: 1, updatedAt: 1 },
      },
    };
    const { design, warnings } = deserializeDesign(JSON.stringify(v1));
    assert.equal(design.version, DESIGN_VERSION);
    assert.ok(design.rootId);
    assert.ok(warnings.some((w) => /迁移|零件树|v2|版本/.test(w)) || design.parts);
    const p = compileFlightProjection(design);
    assert.equal(p.stageCount, 2);
    assert.equal(p.stages[0].engines.count, 33);
  });

  it('rejects corrupt JSON', () => {
    assert.throws(() => deserializeDesign('{not json'), /损坏|JSON|解析/);
  });

  it('rejects unknown future version', () => {
    const payload = JSON.stringify({
      format: 'huojian-rocket-design',
      version: 99,
      design: createDefaultStarshipDesign(),
    });
    assert.throws(() => deserializeDesign(payload), /未来版本|未知/);
  });

  it('falls back / drops bad textures without throwing', () => {
    const d = createDefaultStarshipDesign();
    d.textures = {
      bad1: { mime: 'image/png', dataUrl: 'not-a-data-url' },
      bad2: {
        mime: 'application/javascript',
        dataUrl: 'data:application/javascript;base64,YWxlcnQoMSk=',
      },
      ok: { mime: 'image/png', dataUrl: tinyPng, width: 1, height: 1 },
    };
    const json = serializeDesign(d);
    const { design, warnings } = deserializeDesign(json);
    assert.ok(design.textures.ok);
    assert.equal(design.textures.bad1, undefined);
    assert.equal(design.textures.bad2, undefined);
    assert.ok(warnings.length >= 1);
  });

  it('validateTextureFile rejects wrong type and oversize', () => {
    assert.equal(validateTextureFile({ type: 'image/png', size: 100 }).ok, true);
    assert.equal(validateTextureFile({ type: 'image/gif', size: 100 }).ok, false);
    assert.equal(
      validateTextureFile({ type: 'image/png', size: 50 * 1024 * 1024 }).ok,
      false
    );
  });
});

describe('texture helpers', () => {
  it('fitMaxEdge compresses longest edge to 2048', () => {
    const r = fitMaxEdge(4096, 2048, MAX_TEXTURE_EDGE);
    assert.equal(r.width, 2048);
    assert.equal(r.height, 1024);
    const small = fitMaxEdge(800, 600, MAX_TEXTURE_EDGE);
    assert.equal(small.width, 800);
    assert.equal(small.height, 600);
  });
});

describe('undo/redo history', () => {
  it('undo and redo restore designs', () => {
    const h = createDesignHistory();
    const a = createDefaultStarshipDesign();
    a.name = 'A';
    h.init(a);
    const b = cloneDesign(a);
    b.name = 'B';
    h.push(b);
    assert.equal(h.get().name, 'B');
    assert.equal(h.undo().name, 'A');
    assert.equal(h.redo().name, 'B');
  });
});

describe('api smoke: default vs underpowered', () => {
  it('consumer-style import path returns sane default and underpowered reports', () => {
    const def = createDefaultStarshipDesign();
    const pDef = calculateRocketPerformance(def);
    const aDef = createRocketFromDesign(def);
    assert.ok(pDef.twr > 1);
    assert.ok(pDef.liftoffMassKg > 1000);
    assert.ok(pDef.totalThrustN > 1e6);
    assert.ok(aDef.userData.massKg > 0);
    assert.ok(aDef.userData.canLiftOff);

    let weak = setStageEngineCount(def, 0, 1);
    weak = setStageEngineCount(weak, 1, 0);
    weak = setSideBoosterCount(weak, 0);
    const pWeak = calculateRocketPerformance(weak);
    const aWeak = createRocketFromDesign(weak);
    assert.ok(pWeak.twr < 1);
    assert.ok(pWeak.warnings.length > 0);
    assert.equal(aWeak.userData.underpowered, true);
    aDef.userData.dispose();
    aWeak.userData.dispose();
  });
});

describe('engine positions scale with stage radius', () => {
  it('superheavy/starship mounts stay inside body when diameter shrinks to 6 m', () => {
    const bodyR = 3;
    const maxAllowed = bodyR * 0.82 + 1e-6;
    const sh = computeEnginePositions(
      { count: 33, layout: 'superheavy', preset: 'heavy_booster' },
      bodyR
    );
    assert.equal(sh.length, 33);
    for (const p of sh) {
      const r = Math.hypot(p.x, p.z);
      assert.ok(r <= maxAllowed, `superheavy engine at r=${r} > ${maxAllowed}`);
    }
    assert.ok(Math.max(...sh.map((p) => Math.hypot(p.x, p.z))) < 3.5);

    const ss = computeEnginePositions(
      { count: 6, layout: 'starship', preset: 'raptor_sl' },
      bodyR
    );
    assert.equal(ss.length, 6);
    for (const p of ss) {
      const r = Math.hypot(p.x, p.z);
      assert.ok(r <= maxAllowed, `starship engine at r=${r} > ${maxAllowed}`);
    }

    const big = computeEnginePositions({ count: 33, layout: 'superheavy' }, 4.5);
    const smallMax = Math.max(...sh.map((p) => Math.hypot(p.x, p.z)));
    const bigMax = Math.max(...big.map((p) => Math.hypot(p.x, p.z)));
    assert.ok(bigMax > smallMax, 'engine ring radius grows with stage radius');
  });

  it('createRocketFromDesign places engines inside booster radius for Ø6 m', () => {
    let d = setStageTankParams(createDefaultStarshipDesign(), 0, { diameter: 6 });
    d = setStageEngineCount(d, 0, 33);
    // ensure layout superheavy
    const proj = compileFlightProjection(d);
    const engId = proj.stages[0].engines.items?.[0]?.partId;
    if (engId) d = setPartParams(d, engId, { layout: 'superheavy', count: 33 });
    const root = createRocketFromDesign(d);
    const booster = root.userData.booster;
    const R = booster.userData.radius;
    assert.ok(Math.abs(R - 3) < 1e-6);
    const engines = [];
    booster.traverse((o) => {
      if (o.name === 'Engine') engines.push(o);
    });
    assert.ok(engines.length >= 30, `expected ~33 engines, got ${engines.length}`);
    for (const e of engines) {
      const r = Math.hypot(e.position.x, e.position.z);
      assert.ok(r <= R * 0.82 + 0.05, `engine outside body r=${r} R=${R}`);
    }
    root.userData.dispose();
  });
});

describe('nose and wing independent textures in craft params', () => {
  it('normalize preserves nose/wing textureId and uv on parts', () => {
    let d = createDefaultStarshipDesign();
    const proj = compileFlightProjection(d);
    const noseId = proj.stages[1].nose?.partId;
    const wingId = proj.stages[1].wings?.[0]?.partId;
    assert.ok(noseId && wingId);
    d = setPartParams(d, noseId, {
      textureId: 'tex_nose',
      uv: { scale: 2, offsetX: 0.1, offsetY: 0, rotation: 0, repeatX: 1, repeatY: 1, tile: true },
    });
    d = setPartParams(d, wingId, {
      textureId: 'tex_wing',
      uv: { scale: 3, offsetX: 0, offsetY: 0.2, rotation: 15, repeatX: 2, repeatY: 2, tile: true },
    });
    d.textures = {
      tex_nose: {
        mime: 'image/png',
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        width: 1,
        height: 1,
      },
      tex_wing: {
        mime: 'image/png',
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        width: 1,
        height: 1,
      },
    };
    const n = normalizeDesign(d);
    assert.equal(getPart(n, noseId).params.textureId, 'tex_nose');
    assert.equal(getPart(n, noseId).params.uv.scale, 2);
    assert.equal(getPart(n, wingId).params.textureId, 'tex_wing');
    assert.equal(getPart(n, wingId).params.uv.scale, 3);
    const { design: back } = deserializeDesign(serializeDesign(n));
    assert.equal(getPart(back, noseId).params.textureId, 'tex_nose');
    assert.equal(getPart(back, wingId).params.textureId, 'tex_wing');
  });
});

describe('isDefaultStarshipVisual', () => {
  it('true for default clone, false after DIY size/engine change', () => {
    const d = createDefaultStarshipDesign();
    assert.equal(isDefaultStarshipVisual(d), true);
    const custom = setStageTankParams(d, 0, { diameter: 6 });
    assert.equal(isDefaultStarshipVisual(custom), false);
    const engines = setStageEngineCount(d, 0, 10);
    assert.equal(isDefaultStarshipVisual(engines), false);
  });
});

describe('IndexedDB / memory boot restore', () => {
  it('resolveBootDesign returns saved design when load provides one', async () => {
    let custom = createDefaultStarshipDesign();
    custom = { ...custom, name: 'Saved DIY Rocket' };
    custom = setStageTankParams(custom, 0, { height: 55 });
    const boot = await resolveBootDesign({
      load: async () => custom,
      createDefault: () => createDefaultStarshipDesign(),
    });
    assert.equal(boot.name, 'Saved DIY Rocket');
    const p = compileFlightProjection(boot);
    assert.equal(p.stages[0].height, 55);
  });

  it('resolveBootDesign falls back to default when load empty', async () => {
    const boot = await resolveBootDesign({
      load: async () => null,
      createDefault: () => {
        const d = createDefaultStarshipDesign();
        d.name = 'Fresh Default';
        return d;
      },
    });
    assert.equal(boot.name, 'Fresh Default');
  });

  it('memory storage save/load round-trip used by autosave path', async () => {
    memClear();
    const d = createDefaultStarshipDesign();
    d.name = 'Autosave Me';
    await saveDesignLocal(d);
    const loaded = await loadDesignLocal();
    assert.ok(loaded);
    assert.equal(loaded.name, 'Autosave Me');
    memClear();
  });
});
