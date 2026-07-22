/**
 * KSP-style staging stack + action groups.
 *
 * Staging UI lists groups bottom→top where index 0 fires first (spacebar).
 * Each group has icons: activateEngine | decouple | fairing | stage | custom
 */

import { createPartId, cloneCraft, normalizeCraft, getPart, asCraft, listChildren } from './craftGraph.js';
import { getPartDef } from './partDefs.js';
import { walkStackChain, splitStagesFromChain } from './compileFlight.js';

/** @typedef {{ kind: string, partId: string, label?: string }} StageIcon */
/** @typedef {{ id: string, icons: StageIcon[] }} StageGroup */

export const ACTION_GROUP_KEYS = [
  { id: 'abort', name: '中止 Abort' },
  { id: 'gear', name: '起落架 Gear' },
  { id: 'lights', name: '灯光 Lights' },
  { id: 'rcs', name: 'RCS' },
  { id: 'sas', name: 'SAS' },
  { id: 'brakes', name: '刹车 Brakes' },
  { id: 'custom1', name: '自定义 1' },
  { id: 'custom2', name: '自定义 2' },
  { id: 'custom3', name: '自定义 3' },
  { id: 'custom4', name: '自定义 4' },
  { id: 'custom5', name: '自定义 5' },
];

export function emptyActionGroups() {
  const ag = {};
  for (const k of ACTION_GROUP_KEYS) ag[k.id] = [];
  return ag;
}

/**
 * Build default staging from craft structure (KSP-ish).
 * Order: index 0 activates first.
 *   0: booster engines (liftoff)
 *   1: side sep (if any)
 *   2: interstage sep + upper engines
 *   3+: leftover decouplers / fairings
 */
export function buildDefaultStaging(craft) {
  const c = normalizeCraft(asCraft(craft));
  /** @type {StageGroup[]} */
  const groups = [];
  const used = new Set();

  const pushGroup = (icons) => {
    const filtered = icons.filter((ic) => ic.partId && c.parts[ic.partId] && !used.has(`${ic.kind}:${ic.partId}`));
    for (const ic of filtered) used.add(`${ic.kind}:${ic.partId}`);
    if (!filtered.length) return;
    groups.push({ id: createPartId('stg'), icons: filtered });
  };

  const chain = walkStackChain(c);
  const { lower, upper, decoupler } = splitStagesFromChain(chain);

  // Engines on lower tanks
  const lowerEngines = [];
  for (const x of lower) {
    if (x.def?.category !== 'tank') continue;
    for (const ch of listChildren(c, x.part.id)) {
      if (getPartDef(ch.defId)?.category === 'engine') {
        lowerEngines.push({
          kind: 'activateEngine',
          partId: ch.id,
          label: getPartDef(ch.defId)?.name || '发动机',
        });
      }
    }
  }
  // Also any engine whose parent is lower tank
  if (lowerEngines.length) pushGroup(lowerEngines);

  // Side boosters: sep + their engines (if any)
  const sideIcons = [];
  for (const p of Object.values(c.parts)) {
    if (getPartDef(p.defId)?.category === 'side') {
      sideIcons.push({ kind: 'decouple', partId: p.id, label: '侧助推分离' });
    }
  }
  if (sideIcons.length) pushGroup(sideIcons);

  // Interstage
  if (decoupler?.part) {
    const icons = [
      { kind: 'decouple', partId: decoupler.part.id, label: '级间分离' },
    ];
    for (const x of upper) {
      if (x.def?.category !== 'tank') continue;
      for (const ch of listChildren(c, x.part.id)) {
        if (getPartDef(ch.defId)?.category === 'engine') {
          icons.push({
            kind: 'activateEngine',
            partId: ch.id,
            label: getPartDef(ch.defId)?.name || '上面级发动机',
          });
        }
      }
    }
    pushGroup(icons);
  } else if (upper.length) {
    const icons = [];
    for (const x of upper) {
      if (x.def?.category !== 'tank') continue;
      for (const ch of listChildren(c, x.part.id)) {
        if (getPartDef(ch.defId)?.category === 'engine') {
          icons.push({
            kind: 'activateEngine',
            partId: ch.id,
            label: getPartDef(ch.defId)?.name || '发动机',
          });
        }
      }
    }
    if (icons.length) pushGroup(icons);
  }

  // Fairings / nose jettison as last cosmetic stage if nose present
  for (const p of Object.values(c.parts)) {
    const def = getPartDef(p.defId);
    if (def?.category === 'nose') {
      pushGroup([{ kind: 'fairing', partId: p.id, label: def.name || '整流罩' }]);
    }
  }

  // Any leftover decouplers
  for (const p of Object.values(c.parts)) {
    const def = getPartDef(p.defId);
    if (def?.category === 'decoupler' && !used.has(`decouple:${p.id}`)) {
      pushGroup([{ kind: 'decouple', partId: p.id, label: def.name }]);
    }
  }

  if (!groups.length) {
    groups.push({ id: createPartId('stg'), icons: [] });
  }

  return { auto: true, groups };
}

/**
 * Ensure staging exists; rebuild when auto mode (or forced).
 * Manual edits set staging.auto = false and are preserved.
 */
export function ensureStaging(craft, { forceRebuild = false } = {}) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  if (!c.staging) c.staging = { auto: true, groups: [] };

  if (forceRebuild || c.staging.auto !== false) {
    c.staging = buildDefaultStaging(c);
  } else {
    // Manual: prune dead icons only
    for (const g of c.staging.groups || []) {
      g.icons = (g.icons || []).filter((ic) => ic.partId && c.parts[ic.partId]);
    }
    c.staging.groups = (c.staging.groups || []).filter((g) => g.icons.length > 0);
    if (!c.staging.groups.length) {
      c.staging.groups = [{ id: createPartId('stg'), icons: [] }];
    }
  }
  return c;
}

export function setStagingManual(craft, groups) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  c.staging = {
    auto: false,
    groups: (groups || []).map((g) => ({
      id: g.id || createPartId('stg'),
      icons: (g.icons || []).map((ic) => ({ ...ic })),
    })),
  };
  if (!c.staging.groups.length) c.staging.groups = [{ id: createPartId('stg'), icons: [] }];
  c.meta.updatedAt = Date.now();
  return c;
}

/** Snapshot staging groups without auto-rebuild (preserves ids for manual ops). */
function stagingSnapshot(craft) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  if (!c.staging?.groups?.length) {
    c.staging = buildDefaultStaging(c);
  }
  return c;
}

/** Move stage group by delta (-1 = earlier fire, +1 = later). Marks manual. */
export function moveStageGroup(craft, groupId, delta) {
  const c = stagingSnapshot(craft);
  const groups = c.staging.groups.slice();
  const i = groups.findIndex((g) => g.id === groupId);
  if (i < 0) return setStagingManual(c, groups);
  const j = i + delta;
  if (j < 0 || j >= groups.length) return setStagingManual(c, groups);
  const tmp = groups[i];
  groups[i] = groups[j];
  groups[j] = tmp;
  return setStagingManual(c, groups);
}

export function addEmptyStage(craft, afterIndex = -1) {
  const c = stagingSnapshot(craft);
  const groups = c.staging.groups.slice();
  const g = { id: createPartId('stg'), icons: [] };
  const idx = afterIndex < 0 ? groups.length : afterIndex + 1;
  groups.splice(idx, 0, g);
  return setStagingManual(c, groups);
}

export function removeStageGroup(craft, groupId) {
  const c = stagingSnapshot(craft);
  let groups = c.staging.groups.filter((g) => g.id !== groupId);
  const removed = c.staging.groups.find((g) => g.id === groupId);
  if (removed?.icons?.length && groups.length) {
    groups[0] = {
      ...groups[0],
      icons: [...removed.icons, ...groups[0].icons],
    };
  }
  if (!groups.length) groups = [{ id: createPartId('stg'), icons: [] }];
  return setStagingManual(c, groups);
}

export function moveIconToStage(craft, partId, kind, toGroupId) {
  const c = stagingSnapshot(craft);
  const groups = c.staging.groups.map((g) => ({
    ...g,
    icons: g.icons.filter((ic) => !(ic.partId === partId && ic.kind === kind)),
  }));
  const target = groups.find((g) => g.id === toGroupId);
  if (!target) return setStagingManual(c, groups);
  const part = getPart(c, partId);
  const def = part ? getPartDef(part.defId) : null;
  target.icons.push({
    kind,
    partId,
    label: def?.name || kind,
  });
  return setStagingManual(c, groups);
}

export function rebuildStaging(craft) {
  return ensureStaging(craft, { forceRebuild: true });
}

/* ── Action groups ─────────────────────────────────────── */

export function normalizeActionGroups(craft) {
  const c = craft;
  if (!c.actionGroups || typeof c.actionGroups !== 'object') {
    c.actionGroups = emptyActionGroups();
  }
  for (const k of ACTION_GROUP_KEYS) {
    if (!Array.isArray(c.actionGroups[k.id])) c.actionGroups[k.id] = [];
    c.actionGroups[k.id] = c.actionGroups[k.id].filter(
      (a) => a && a.partId && c.parts?.[a.partId]
    );
  }
  return c;
}

export function toggleActionGroup(craft, groupId, partId, kind = 'toggle') {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  normalizeActionGroups(c);
  if (!ACTION_GROUP_KEYS.some((k) => k.id === groupId)) return c;
  const list = c.actionGroups[groupId];
  const idx = list.findIndex((a) => a.partId === partId && a.kind === kind);
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ partId, kind, label: getPartDef(getPart(c, partId)?.defId)?.name });
  c.meta.updatedAt = Date.now();
  return c;
}

export function partActionGroups(craft, partId) {
  const c = normalizeCraft(asCraft(craft));
  normalizeActionGroups(c);
  const out = [];
  for (const k of ACTION_GROUP_KEYS) {
    if (c.actionGroups[k.id].some((a) => a.partId === partId)) out.push(k.id);
  }
  return out;
}

export function iconGlyph(kind) {
  switch (kind) {
    case 'activateEngine':
      return '🔥';
    case 'decouple':
      return '⏏';
    case 'fairing':
      return '▲';
    case 'stage':
      return '▸';
    default:
      return '•';
  }
}
