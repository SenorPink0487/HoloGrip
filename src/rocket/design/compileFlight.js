/**
 * Compile CraftGraph → flight projection (stage-like ABI for generator / launch).
 */

import {
  getPartDef,
  defaultMaterial,
  defaultUv,
  createPartId,
} from './partDefs.js';
import {
  asCraft,
  getPart,
  listChildren,
  normalizeCraft,
} from './craftGraph.js';

/**
 * @typedef {object} FlightProjection
 * @property {number} version
 * @property {string} id
 * @property {string} name
 * @property {1|2} stageCount
 * @property {object[]} stages
 * @property {object} sideBoosters
 * @property {Record<string, object>} textures
 * @property {object} meta
 * @property {object} craft  // original craft snapshot reference fields
 * @property {string[]} warnings
 */

function cylinderVolume(diameter, height) {
  const r = diameter / 2;
  return Math.PI * r * r * height;
}

/**
 * Walk stack chain from root following exclusive/stack top children.
 * Returns ordered list of { part, def } along primary stack (root → tip).
 */
export function walkStackChain(craft) {
  const c = normalizeCraft(craft);
  const chain = [];
  let id = c.rootId;
  const guard = new Set();
  while (id && !guard.has(id)) {
    guard.add(id);
    const part = getPart(c, id);
    if (!part) break;
    const def = getPartDef(part.defId);
    chain.push({ part, def });
    // Prefer stack child on 'top' node
    const topKids = listChildren(c, id).filter((ch) => ch.parentNode === 'top');
    // Prefer decoupler or tank or nose in stack order
    const next =
      topKids.find((ch) => getPartDef(ch.defId)?.category === 'decoupler') ||
      topKids.find((ch) => getPartDef(ch.defId)?.category === 'tank') ||
      topKids.find((ch) => getPartDef(ch.defId)?.category === 'nose') ||
      topKids[0];
    id = next?.id || null;
  }
  return chain;
}

/**
 * Split chain into lower / upper at first decoupler.
 */
export function splitStagesFromChain(chain) {
  const decIdx = chain.findIndex((x) => x.def?.category === 'decoupler');
  if (decIdx < 0) {
    return { lower: chain, upper: [], decoupler: null };
  }
  return {
    lower: chain.slice(0, decIdx),
    upper: chain.slice(decIdx + 1),
    decoupler: chain[decIdx],
  };
}

function collectRadial(craft, tankId, category) {
  return listChildren(craft, tankId).filter((ch) => {
    const d = getPartDef(ch.defId);
    return d?.category === category;
  });
}

function collectEngines(craft, tankId) {
  return listChildren(craft, tankId).filter((ch) => getPartDef(ch.defId)?.category === 'engine');
}

function pickMainTank(segment) {
  const tanks = segment.filter((x) => x.def?.category === 'tank');
  if (!tanks.length) return null;
  // Prefer tallest * widest
  return tanks.reduce((best, t) => {
    const score = (t.part.params?.height || 0) * (t.part.params?.diameter || 1);
    const bScore = (best.part.params?.height || 0) * (best.part.params?.diameter || 1);
    return score >= bScore ? t : best;
  });
}

function buildStageFromSegment(craft, segment, role, nameHint) {
  const main = pickMainTank(segment);
  if (!main) {
    return null;
  }
  const tank = main.part;
  const tankDef = main.def;
  const tankId = tank.id;

  // Height: sum tank heights in segment (ignore nose in height field like v1)
  let height = 0;
  for (const x of segment) {
    if (x.def?.category === 'tank') height += x.part.params?.height || 0;
  }
  if (height < 8) height = tank.params?.height || 40;

  const diameter = tank.params?.diameter || 9;
  const fuelFill = tank.params?.fuelFill ?? 0.9;

  // Nose: search segment stack chain and children of tanks
  let nose = null;
  for (const x of segment) {
    if (x.def?.category === 'nose') {
      nose = {
        preset: x.def.legacyNosePreset || 'ogive',
        height: x.part.params?.height || 10,
        textureId: x.part.params?.textureId || null,
        uv: x.part.params?.uv || defaultUv(),
        material: x.part.params?.material || defaultMaterial(),
        partId: x.part.id,
      };
    }
  }
  if (!nose) {
    for (const x of segment) {
      if (x.def?.category !== 'tank') continue;
      for (const ch of listChildren(craft, x.part.id)) {
        const cd = getPartDef(ch.defId);
        if (cd?.category === 'nose') {
          nose = {
            preset: cd.legacyNosePreset || 'ogive',
            height: ch.params?.height || 10,
            textureId: ch.params?.textureId || null,
            uv: ch.params?.uv || defaultUv(),
            material: ch.params?.material || defaultMaterial(),
            partId: ch.id,
          };
        }
      }
    }
  }

  // Engines on all tanks in segment
  const engineItems = [];
  let totalEngineCount = 0;
  let primaryPreset = 'raptor_sl';
  let primaryLayout = 'ring';
  for (const x of segment) {
    if (x.def?.category !== 'tank') continue;
    for (const eng of collectEngines(craft, x.part.id)) {
      const ed = getPartDef(eng.defId);
      const count = Math.max(1, eng.params?.count || 1);
      totalEngineCount += count;
      primaryPreset = ed?.legacyEnginePreset || primaryPreset;
      primaryLayout = eng.params?.layout || primaryLayout;
      engineItems.push({
        partId: eng.id,
        preset: ed?.legacyEnginePreset || 'raptor_sl',
        count,
        layout: eng.params?.layout || 'ring',
        angle: eng.angle || 0,
      });
    }
  }

  // Wings / decor on tanks
  const wings = [];
  const decor = [];
  for (const x of segment) {
    if (x.def?.category !== 'tank') continue;
    for (const w of collectRadial(craft, x.part.id, 'aero')) {
      const wd = getPartDef(w.defId);
      wings.push({
        id: w.id,
        partId: w.id,
        preset: wd?.legacyWingPreset || 'flap_aft',
        count: 1,
        size: w.params?.size ?? 1,
        yFraction: w.params?.yFraction ?? 0.5,
        angle: w.angle || 0,
        textureId: w.params?.textureId || null,
        uv: w.params?.uv || defaultUv(),
        material: w.params?.material || defaultMaterial('#2a2e36', 'matte'),
      });
    }
    for (const d of collectRadial(craft, x.part.id, 'decor')) {
      const dd = getPartDef(d.defId);
      decor.push({
        id: d.id,
        partId: d.id,
        preset: dd?.legacyDecorPreset || 'ring_weld',
        yFraction: d.params?.yFraction ?? 0.5,
        angle: d.angle || 0,
      });
    }
  }

  // Merge symmetry wings with same preset+yFraction into count (optional visual)
  // Keep individual for partId selection accuracy

  const legacyPreset = tankDef?.legacyStagePreset || 'cylinder_std';

  return {
    id: tank.id || createPartId('stage'),
    role,
    name: tank.params?.name || nameHint || (role === 'booster' ? '一级' : '二级'),
    preset: legacyPreset,
    height,
    diameter,
    fuelFill,
    nose,
    engines: {
      preset: primaryPreset,
      count: totalEngineCount,
      layout: primaryLayout,
      items: engineItems,
    },
    wings,
    decor,
    material: tank.params?.material || defaultMaterial(),
    textureId: tank.params?.textureId || null,
    uv: tank.params?.uv || defaultUv(),
    tankPartIds: segment.filter((x) => x.def?.category === 'tank').map((x) => x.part.id),
    partIds: segment.map((x) => x.part.id),
  };
}

function buildSideBoosters(craft, _rootTankId) {
  const uniq = [];
  const seen = new Set();
  for (const p of Object.values(craft.parts || {})) {
    if (getPartDef(p.defId)?.category !== 'side') continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const def = getPartDef(p.defId);
    uniq.push({
      partId: p.id,
      preset: def?.legacySidePreset || 'strap_std',
      height: p.params?.height ?? 55,
      diameter: p.params?.diameter ?? 3.6,
      fuelFill: p.params?.fuelFill ?? 0.9,
      engines: {
        preset: p.params?.enginePreset || 'merlin',
        count: p.params?.engineCount ?? 9,
        layout: 'ring',
      },
      material: p.params?.material || defaultMaterial('#c8cdd4', 'metal'),
      textureId: p.params?.textureId || null,
      uv: p.params?.uv || defaultUv(),
      separatePhase: p.params?.separatePhase || 'ascent',
      angle: p.angle || 0,
    });
  }

  const count = uniq.length;
  const template = uniq[0] || null;
  return {
    count: count === 0 ? 0 : count,
    preset: template?.preset || 'strap_std',
    height: template?.height ?? 55,
    diameter: template?.diameter ?? 3.6,
    fuelFill: template?.fuelFill ?? 0.9,
    engines: template?.engines || { preset: 'merlin', count: 9, layout: 'ring' },
    material: template?.material || defaultMaterial('#c8cdd4', 'metal'),
    textureId: template?.textureId || null,
    uv: template?.uv || defaultUv(),
    separatePhase: template?.separatePhase || 'ascent',
    items: uniq,
  };
}

/**
 * Compile craft (or v1 design) to flight projection with stages[].
 */
export function compileFlightProjection(designOrCraft) {
  const craft = asCraft(designOrCraft);
  const warnings = [];
  const chain = walkStackChain(craft);

  if (!chain.length) {
    warnings.push('载具为空：请先放置根贮箱');
    return emptyProjection(craft, warnings);
  }

  const { lower, upper, decoupler } = splitStagesFromChain(chain);
  const hasUpper = upper.some((x) => x.def?.category === 'tank');

  const stages = [];
  if (hasUpper) {
    const booster = buildStageFromSegment(craft, lower, 'booster', '一级助推');
    const ship = buildStageFromSegment(craft, upper, 'upper', '二级');
    if (booster) stages.push(booster);
    if (ship) stages.push(ship);
    if (!booster || !ship) {
      warnings.push('级间分离后级段不完整');
    }
  } else {
    // Single stage: entire chain including any nose
    const all = decoupler ? [...lower, ...upper] : chain;
    // If decoupler but no upper tank, ignore decoupler for flight
    if (decoupler && !hasUpper) {
      warnings.push('有分离环但无上级贮箱，按单级处理');
    }
    const segment = all.filter((x) => x.def?.category !== 'decoupler');
    const stage = buildStageFromSegment(craft, segment.length ? segment : chain, 'upper', '单级');
    if (stage) stages.push(stage);
  }

  if (!stages.length) {
    warnings.push('无法编译有效级段');
    return emptyProjection(craft, warnings);
  }

  const rootTank = chain.find((x) => x.def?.category === 'tank');
  const sideBoosters = buildSideBoosters(craft, rootTank?.part?.id);

  // Normalize side count to 0|2|4 for launch symmetry helpers when using template path;
  // keep actual items length for generator free placement
  let sbCount = sideBoosters.items.length;
  if (sbCount === 1) {
    warnings.push('侧助推仅 1 枚，发射分离仍可用');
  }

  const stageCount = /** @type {1|2} */ (stages.length >= 2 ? 2 : 1);
  if (stageCount === 2) {
    stages[0].role = 'booster';
    stages[1].role = 'upper';
  } else {
    stages[0].role = 'upper';
  }

  return {
    version: 1, // projection shape matches v1 stage doc for generator
    id: craft.id,
    name: craft.name,
    stageCount,
    stages,
    sideBoosters: {
      ...sideBoosters,
      count: sbCount,
    },
    textures: craft.textures || {},
    meta: craft.meta || { createdAt: Date.now(), updatedAt: Date.now() },
    craft: {
      version: craft.version,
      rootId: craft.rootId,
      partCount: Object.keys(craft.parts).length,
    },
    warnings,
    // mark for isDefaultStarshipVisual etc.
    _isFlightProjection: true,
    _sourceCraft: craft,
  };
}

function emptyProjection(craft, warnings) {
  return {
    version: 1,
    id: craft?.id || createPartId('design'),
    name: craft?.name || '空载具',
    stageCount: 1,
    stages: [
      {
        id: createPartId('stage'),
        role: 'upper',
        name: '空',
        preset: 'cylinder_std',
        height: 20,
        diameter: 4,
        fuelFill: 0,
        nose: null,
        engines: { preset: 'raptor_sl', count: 0, layout: 'ring', items: [] },
        wings: [],
        decor: [],
        material: defaultMaterial(),
        textureId: null,
        uv: defaultUv(),
        tankPartIds: [],
        partIds: [],
      },
    ],
    sideBoosters: {
      count: 0,
      preset: 'strap_std',
      height: 40,
      diameter: 3,
      fuelFill: 0,
      engines: { preset: 'merlin', count: 0, layout: 'ring' },
      material: defaultMaterial(),
      textureId: null,
      uv: defaultUv(),
      separatePhase: 'ascent',
      items: [],
    },
    textures: craft?.textures || {},
    meta: craft?.meta || { createdAt: Date.now(), updatedAt: Date.now() },
    craft: { version: 2, rootId: null, partCount: 0 },
    warnings,
    _isFlightProjection: true,
    _sourceCraft: craft,
  };
}

/**
 * Whether design is craft or projection or v1 — always get stage-shaped doc for legacy code.
 */
export function asStageDesign(designOrCraft) {
  if (!designOrCraft) return compileFlightProjection(null);
  if (designOrCraft._isFlightProjection && designOrCraft.stages) return designOrCraft;
  if (designOrCraft.parts && !Array.isArray(designOrCraft.parts)) {
    return compileFlightProjection(designOrCraft);
  }
  // v1 stage doc — pass through with light normalize
  if (Array.isArray(designOrCraft.stages)) {
    return {
      ...designOrCraft,
      stageCount: designOrCraft.stageCount === 1 ? 1 : 2,
      _isFlightProjection: false,
    };
  }
  return compileFlightProjection(designOrCraft);
}

export { cylinderVolume };
