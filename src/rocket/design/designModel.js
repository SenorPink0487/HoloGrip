/**
 * Design document API — craft graph is canonical (v2).
 * Stage-shaped views come from compileFlightProjection.
 */

import { DESIGN_VERSION, defaultMaterial, defaultUv, createPartId } from './partsLibrary.js';
import {
  createDefaultStarshipCraft,
  createEmptyCraft,
  cloneCraft,
  normalizeCraft,
  asCraft,
  isCraftDocument,
  migrateV1StagesToCraft,
  attachPart,
  detachPart,
  setPartParams,
  getPart,
  listChildren,
} from './craftGraph.js';
import { getPartDef } from './partDefs.js';
import { compileFlightProjection, asStageDesign } from './compileFlight.js';
import { ensureStaging, normalizeActionGroups, rebuildStaging } from './staging.js';

export { DESIGN_VERSION };

/** @deprecated alias — craft graph */
export function createDefaultStarshipDesign() {
  return rebuildStaging(createDefaultStarshipCraft());
}

export function cloneDesign(design) {
  return cloneCraft(design);
}

/**
 * Normalize any design to craft graph + staging / action groups.
 */
export function normalizeDesign(design) {
  let c = asCraft(design);
  c = ensureStaging(c);
  normalizeActionGroups(c);
  return c;
}

/**
 * Stage-shaped view for legacy consumers (read-only snapshot).
 */
export function toStageDesign(design) {
  return asStageDesign(design);
}

/**
 * True when craft still matches showcase Starship / Super Heavy signature.
 */
export function isDefaultStarshipVisual(design) {
  if (!design) return false;
  const proj = compileFlightProjection(design);
  if (proj.stageCount !== 2 || proj.stages.length < 2) return false;
  if ((proj.sideBoosters?.count || 0) !== 0) return false;
  const [booster, ship] = proj.stages;
  if (Math.abs((booster.diameter || 0) - 9) > 0.25) return false;
  if (Math.abs((ship.diameter || 0) - 9) > 0.25) return false;
  if (Math.abs((booster.height || 0) - 72) > 3) return false;
  if (Math.abs((ship.height || 0) - 52) > 3) return false;
  if ((booster.engines?.count || 0) !== 33) return false;
  if ((ship.engines?.count || 0) !== 6) return false;
  if (booster.textureId || ship.textureId) return false;
  if (ship.nose?.textureId) return false;
  for (const w of booster.wings || []) if (w.textureId) return false;
  for (const w of ship.wings || []) if (w.textureId) return false;
  const steel = (c) => {
    const s = String(c || '').toLowerCase();
    return !s || s === '#d8dde5' || s === '#d8dde5ff';
  };
  if (booster.material?.type && booster.material.type !== 'metal') return false;
  if (ship.material?.type && ship.material.type !== 'metal') return false;
  if (!steel(booster.material?.color) || !steel(ship.material?.color)) return false;
  return true;
}

/**
 * Swap lower/upper stacks (2-stage craft with decoupler).
 */
export function swapStages(design) {
  const craft = asCraft(design);
  const proj = compileFlightProjection(craft);
  if (proj.stageCount < 2) return craft;

  // Rebuild: extract upper and lower tank trees is hard; use projection round-trip via v1 swap
  const v1 = {
    version: 1,
    id: craft.id,
    name: craft.name,
    stageCount: 2,
    stages: [proj.stages[1], proj.stages[0]].map((s, i) => ({
      ...s,
      role: i === 0 ? 'booster' : 'upper',
    })),
    sideBoosters: proj.sideBoosters,
    textures: craft.textures,
    meta: craft.meta,
  };
  // Clear engine items / partIds that confuse migrate
  for (const st of v1.stages) {
    if (st.engines) {
      st.engines = {
        preset: st.engines.preset,
        count: st.engines.count,
        layout: st.engines.layout,
      };
    }
    st.wings = (st.wings || []).map((w) => ({
      id: createPartId('wing'),
      preset: w.preset,
      count: w.count || 1,
      size: w.size ?? 1,
      yFraction: w.yFraction ?? 0.5,
      material: w.material,
    }));
    st.decor = (st.decor || []).map((d) => ({
      id: createPartId('decor'),
      preset: d.preset,
      yFraction: d.yFraction ?? 0.5,
    }));
  }
  return migrateV1StagesToCraft(v1);
}

/**
 * Set 1 or 2 stages on craft (remove/add decoupler+upper).
 */
export function setStageCount(design, count) {
  const craft = asCraft(design);
  const want = count === 1 ? 1 : 2;
  const proj = compileFlightProjection(craft);

  if (want === proj.stageCount) return craft;

  if (want === 1) {
    // Keep upper stage if present, else lower
    const keep = proj.stages[proj.stages.length - 1];
    const v1 = {
      version: 1,
      id: craft.id,
      name: craft.name,
      stageCount: 1,
      stages: [
        {
          ...keep,
          role: 'upper',
          engines: {
            preset: keep.engines?.preset || 'raptor_sl',
            count: keep.engines?.count || 0,
            layout: keep.engines?.layout || 'ring',
          },
          wings: (keep.wings || []).map((w) => ({
            id: createPartId('wing'),
            preset: w.preset,
            count: w.count || 1,
            size: w.size ?? 1,
            yFraction: w.yFraction ?? 0.5,
            material: w.material,
          })),
          decor: (keep.decor || []).map((d) => ({
            id: createPartId('decor'),
            preset: d.preset,
            yFraction: d.yFraction ?? 0.5,
          })),
        },
      ],
      sideBoosters: { ...proj.sideBoosters, count: 0, items: [] },
      textures: craft.textures,
      meta: craft.meta,
    };
    return migrateV1StagesToCraft(v1);
  }

  // want 2: if already 1, add booster below from default
  const def = createDefaultStarshipCraft();
  const defProj = compileFlightProjection(def);
  const upper = proj.stages[0];
  const v1 = {
    version: 1,
    id: craft.id,
    name: craft.name,
    stageCount: 2,
    stages: [
      {
        ...defProj.stages[0],
        engines: {
          preset: defProj.stages[0].engines.preset,
          count: defProj.stages[0].engines.count,
          layout: defProj.stages[0].engines.layout,
        },
        wings: (defProj.stages[0].wings || []).map((w) => ({
          id: createPartId('wing'),
          preset: w.preset,
          count: 1,
          size: w.size ?? 1,
          yFraction: w.yFraction ?? 0.5,
          material: w.material,
        })),
        decor: [],
      },
      {
        ...upper,
        role: 'upper',
        engines: {
          preset: upper.engines?.preset || 'raptor_sl',
          count: upper.engines?.count || 0,
          layout: upper.engines?.layout || 'ring',
        },
        wings: (upper.wings || []).map((w) => ({
          id: createPartId('wing'),
          preset: w.preset,
          count: 1,
          size: w.size ?? 1,
          yFraction: w.yFraction ?? 0.5,
          material: w.material,
        })),
        decor: (upper.decor || []).map((d) => ({
          id: createPartId('decor'),
          preset: d.preset,
          yFraction: d.yFraction ?? 0.5,
        })),
      },
    ],
    sideBoosters: { count: 0, preset: 'strap_std', height: 55, diameter: 3.6, fuelFill: 0.9,
      engines: { preset: 'merlin', count: 9, layout: 'ring' }, material: defaultMaterial(), textureId: null, uv: defaultUv(), separatePhase: 'ascent' },
    textures: craft.textures,
    meta: craft.meta,
  };
  return migrateV1StagesToCraft(v1);
}

/**
 * Mutate engine count on a flight stage (for tests / quick edits).
 * Returns new craft.
 */
export function setStageEngineCount(design, stageIndex, count) {
  let craft = asCraft(design);
  const proj = compileFlightProjection(craft);
  const st = proj.stages[stageIndex];
  if (!st) return craft;
  const n = Math.max(0, Math.min(40, Math.round(count)));
  const engParts = [];
  for (const tid of st.tankPartIds || []) {
    for (const ch of listChildren(craft, tid)) {
      if (getPartDef(ch.defId)?.category === 'engine') engParts.push(ch);
    }
  }
  if (engParts.length === 0 && n > 0 && st.tankPartIds?.[0]) {
    const r = attachPart(craft, {
      defId: `engine_${st.engines?.preset || 'raptor_sl'}`,
      parentId: st.tankPartIds[0],
      parentNode: 'bottom',
      params: { count: n, layout: st.engines?.layout || 'ring' },
    });
    return r.ok ? r.craft : craft;
  }
  if (n === 0) {
    for (const e of engParts) craft = detachPart(craft, e.id);
    return craft;
  }
  // Put all count on first engine part, remove extras
  const [first, ...rest] = engParts;
  craft = setPartParams(craft, first.id, { count: n });
  for (const e of rest) craft = detachPart(craft, e.id);
  return craft;
}

/**
 * Mutate tank height/diameter/fuel on stage.
 */
export function setStageTankParams(design, stageIndex, patch) {
  let craft = asCraft(design);
  const proj = compileFlightProjection(craft);
  const st = proj.stages[stageIndex];
  if (!st?.tankPartIds?.[0]) return craft;
  return setPartParams(craft, st.tankPartIds[0], patch);
}

/**
 * Side booster count 0|2|4 on root tank.
 */
export function setSideBoosterCount(design, count) {
  let craft = asCraft(design);
  const proj = compileFlightProjection(craft);
  // remove existing sides
  for (const item of proj.sideBoosters?.items || []) {
    craft = detachPart(craft, item.partId);
  }
  const c = count === 4 ? 4 : count === 2 ? 2 : 0;
  if (c === 0) return craft;
  const rootId = craft.rootId;
  if (!rootId) return craft;
  const r = attachPart(craft, {
    defId: 'side_strap_std',
    parentId: rootId,
    parentNode: 'radial',
    angle: Math.PI / c,
    symmetry: c,
    params: {
      height: proj.sideBoosters?.height ?? 55,
      diameter: proj.sideBoosters?.diameter ?? 3.6,
      fuelFill: 0.9,
      enginePreset: 'merlin',
      engineCount: 9,
    },
  });
  return r.ok ? r.craft : craft;
}

export {
  createDefaultStarshipCraft,
  createEmptyCraft,
  asCraft,
  isCraftDocument,
  migrateV1StagesToCraft,
  compileFlightProjection,
  asStageDesign,
  getPart,
};
