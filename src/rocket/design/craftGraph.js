/**
 * Craft part-tree graph: attach / detach / symmetry / normalize.
 * Canonical editor model (DESIGN_VERSION 2).
 */

import {
  DESIGN_VERSION,
  PART_DEFS,
  getPartDef,
  getDefNode,
  effectiveStackSize,
  stackSizesCompatible,
  tankDefFromStagePreset,
  noseDefFromPreset,
  engineDefFromPreset,
  wingDefFromPreset,
  decorDefFromPreset,
  sideDefFromPreset,
  defaultMaterial,
  defaultUv,
  createPartId,
} from './partDefs.js';

export { DESIGN_VERSION, createPartId };

/**
 * @typedef {object} CraftPart
 * @property {string} id
 * @property {string} defId
 * @property {string|null} parentId
 * @property {string|null} parentNode
 * @property {string|null} childNode
 * @property {number} angle
 * @property {number} [radialOffset]
 * @property {string|null} symmetryGroupId
 * @property {object} params
 */

/**
 * @typedef {object} Craft
 * @property {number} version
 * @property {string} id
 * @property {string} name
 * @property {string|null} rootId
 * @property {Record<string, CraftPart>} parts
 * @property {Record<string, object>} textures
 * @property {{ createdAt: number, updatedAt: number }} meta
 */

export function cloneCraft(craft) {
  if (typeof structuredClone === 'function') return structuredClone(craft);
  return JSON.parse(JSON.stringify(craft));
}

export function createEmptyCraft(name = '新载具') {
  const now = Date.now();
  return {
    version: DESIGN_VERSION,
    id: createPartId('design'),
    name,
    rootId: null,
    parts: {},
    textures: {},
    connections: {},
    staging: { auto: true, groups: [] },
    actionGroups: {},
    meta: { createdAt: now, updatedAt: now },
  };
}

export function getPart(craft, id) {
  if (!craft?.parts || id == null) return null;
  return craft.parts[id] || null;
}

export function listChildren(craft, parentId) {
  return Object.values(craft.parts || {}).filter((p) => p.parentId === parentId);
}

export function listChildrenOnNode(craft, parentId, parentNode) {
  return listChildren(craft, parentId).filter((p) => p.parentNode === parentNode);
}

function mergeParams(def, params) {
  const base = { ...(def?.defaultParams || {}) };
  if (params && typeof params === 'object') Object.assign(base, params);
  if (!base.material && def?.category === 'tank') base.material = defaultMaterial();
  if (!base.uv) base.uv = defaultUv();
  return base;
}

/**
 * Which child node to use when attaching def to parentNode.
 */
export function resolveChildNode(def, parentNodeId, parentDef) {
  const parentNode = getDefNode(parentDef, parentNodeId);
  if (!parentNode || !def) return null;

  if (parentNode.type === 'stack') {
    // Child must present opposite stack direction
    const wantDir = -parentNode.dir;
    const node = (def.nodes || []).find((n) => n.type === 'stack' && n.dir === wantDir);
    return node?.id || null;
  }
  if (parentNode.type === 'radial') {
    const node = (def.nodes || []).find((n) => n.type === 'radial');
    return node?.id || null;
  }
  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canAttach(craft, parentId, parentNodeId, defId, opts = {}) {
  const def = getPartDef(defId);
  if (!def) return { ok: false, reason: '未知零件' };

  // Root placement
  if (parentId == null || parentId === '') {
    if (!def.canBeRoot) return { ok: false, reason: '该零件不能作为根件' };
    if (craft.rootId && getPart(craft, craft.rootId)) {
      return { ok: false, reason: '已有根件，请先清空或挂到现有节点' };
    }
    return { ok: true };
  }

  const parent = getPart(craft, parentId);
  if (!parent) return { ok: false, reason: '父零件不存在' };
  const parentDef = getPartDef(parent.defId);
  if (!parentDef) return { ok: false, reason: '父零件定义缺失' };

  const pNode = getDefNode(parentDef, parentNodeId);
  if (!pNode) return { ok: false, reason: '父节点不存在' };

  const childNodeId = resolveChildNode(def, parentNodeId, parentDef);
  if (!childNodeId) return { ok: false, reason: '节点类型不兼容' };

  // Category rules
  if (pNode.type === 'stack' && pNode.dir === -1) {
    // bottom: engines preferred; tanks/decouplers also stack under rare cases not used
    if (def.category === 'nose') return { ok: false, reason: '鼻锥不能装在底部' };
  }
  if (pNode.type === 'stack' && pNode.dir === 1) {
    if (def.category === 'engine') return { ok: false, reason: '发动机应装在底部节点' };
  }
  if (pNode.type === 'radial') {
    if (!['aero', 'decor', 'side', 'utility'].includes(def.category)) {
      return { ok: false, reason: '该零件不能径向安装' };
    }
  }
  if (pNode.type === 'stack') {
    if (['aero', 'decor', 'side', 'utility'].includes(def.category)) {
      return { ok: false, reason: '气动/装饰/侧助推/公用件请使用径向节点' };
    }
  }

  // Size check for stack (params may already include auto-aligned diameter).
  // Engines always mount to host bottom — skip diameter gate (KSP magnets, not hard size lock).
  if (pNode.type === 'stack' && def.category !== 'engine') {
    const aligned = alignStackParams(parent, parentDef, def, opts.params);
    const ps = effectiveStackSize(parentDef, parent.params);
    const cs = effectiveStackSize(def, { ...def.defaultParams, ...aligned });
    if (!stackSizesCompatible(ps, cs)) {
      return { ok: false, reason: '节点尺寸不匹配' };
    }
  }

  // Exclusive occupancy (unless replace allowed)
  const occupants = listChildrenOnNode(craft, parentId, parentNodeId);
  const exclusive =
    pNode.exclusive ||
    def.stackExclusive ||
    def.category === 'nose' ||
    def.category === 'decoupler';

  if (exclusive && occupants.length > 0 && !opts.allowReplace) {
    // Engines share bottom non-exclusive; nose/decoupler on top exclusive
    if (def.category === 'engine' && !pNode.exclusive) {
      // multiple engine clusters ok
    } else if (pNode.exclusive || def.category === 'nose' || def.category === 'decoupler') {
      // allowReplace default true for exclusive stack tops
      if (opts.allowReplace === false) {
        return { ok: false, reason: '节点已被占用' };
      }
    }
  }

  // Symmetry only meaningful on radial
  const sym = opts.symmetry ?? 1;
  if (sym > 1 && pNode.type !== 'radial' && def.category !== 'engine') {
    // engines can use symmetry on bottom via angles
  }

  return { ok: true };
}

/**
 * When stacking tanks / decouplers / noses, match host diameter so
 * beginners never hit "节点尺寸不匹配".
 */
export function alignStackParams(parent, parentDef, childDef, params = null) {
  const out = params && typeof params === 'object' ? { ...params } : {};
  if (!parent || !childDef) return out;
  const hostDia =
    parent.params?.diameter ??
    parentDef?.defaultParams?.diameter ??
    null;
  if (hostDia == null || !Number.isFinite(Number(hostDia))) return out;
  // Only auto-align parts that have a diameter concept
  const cat = childDef.category;
  if (cat === 'tank' || cat === 'decoupler' || cat === 'nose') {
    if (out.diameter == null || Math.abs(Number(out.diameter) - Number(hostDia)) > 0.05) {
      out.diameter = Number(hostDia);
    }
  }
  return out;
}

/**
 * Attach part(s). Returns { craft, partIds, primaryId } or error object.
 * @param {object} [opts.autoSideSym] if true and placing side boosters at sym=1, bump to ×2
 */
export function attachPart(craft, {
  defId,
  parentId = null,
  parentNode = null,
  angle = 0,
  symmetry = 1,
  params = null,
  allowReplace = true,
  autoSideSym = false,
} = {}) {
  const c = cloneCraft(craft);
  const def = getPartDef(defId);
  if (!def) return { ok: false, reason: '未知零件', craft: c };

  let sym = Math.max(1, Math.min(8, Math.round(symmetry || 1)));
  if (autoSideSym && def.category === 'side' && sym < 2) sym = 2;

  // Root
  if (!c.rootId || !getPart(c, c.rootId)) {
    if (!def.canBeRoot) return { ok: false, reason: '请先放置可作根件的贮箱', craft: c };
    const id = createPartId('part');
    c.parts[id] = {
      id,
      defId,
      parentId: null,
      parentNode: null,
      childNode: null,
      angle: 0,
      symmetryGroupId: null,
      params: mergeParams(def, params),
    };
    c.rootId = id;
    c.meta = c.meta || {};
    c.meta.updatedAt = Date.now();
    return { ok: true, craft: normalizeCraft(c), partIds: [id], primaryId: id };
  }

  if (parentId == null) {
    return { ok: false, reason: '需要指定安装父节点', craft: c };
  }

  const parent = getPart(c, parentId);
  const parentDef = getPartDef(parent?.defId);
  const pNode = getDefNode(parentDef, parentNode);
  // Smart stack: auto-match diameter to host
  let useParams = params;
  if (pNode?.type === 'stack' && parent) {
    useParams = alignStackParams(parent, parentDef, def, params);
  }

  const check = canAttach(c, parentId, parentNode, defId, {
    symmetry: sym,
    params: useParams,
    allowReplace,
  });
  if (!check.ok) return { ...check, craft: c };

  const childNode = resolveChildNode(def, parentNode, parentDef);

  // Replace exclusive occupants
  const exclusive =
    pNode?.exclusive || def.stackExclusive || def.category === 'nose' || def.category === 'decoupler';
  if (exclusive && allowReplace) {
    const occ = listChildrenOnNode(c, parentId, parentNode);
    if (def.category !== 'engine' || pNode?.exclusive) {
      for (const o of occ) {
        if (def.category === 'engine' && getPartDef(o.defId)?.category === 'engine') continue;
        detachPartInPlace(c, o.id);
      }
    }
    if (def.category === 'nose' || def.category === 'decoupler') {
      for (const o of listChildrenOnNode(c, parentId, parentNode)) {
        detachPartInPlace(c, o.id);
      }
    }
  }

  const groupId = sym > 1 ? createPartId('sym') : null;
  const partIds = [];
  const n = pNode?.type === 'radial' || def.category === 'engine' ? sym : 1;

  for (let i = 0; i < n; i++) {
    const id = createPartId('part');
    const a = angle + (n > 1 ? (i / n) * Math.PI * 2 : 0);
    const instParams = mergeParams(def, useParams);
    if (n > 1 && def.category === 'engine' && (useParams?.count == null || useParams.count === 1)) {
      instParams.count = 1;
    }
    c.parts[id] = {
      id,
      defId,
      parentId,
      parentNode,
      childNode,
      angle: a,
      symmetryGroupId: groupId,
      params: instParams,
    };
    partIds.push(id);
  }

  c.meta = c.meta || {};
  c.meta.updatedAt = Date.now();
  return { ok: true, craft: normalizeCraft(c), partIds, primaryId: partIds[0] };
}

function detachPartInPlace(c, partId) {
  const part = c.parts[partId];
  if (!part) return;
  // cascade children first
  const kids = listChildren(c, partId);
  for (const k of kids) detachPartInPlace(c, k.id);
  // symmetry group siblings only if same group - detachPart public handles group
  delete c.parts[partId];
  if (c.rootId === partId) c.rootId = null;
}

/**
 * Detach part and its symmetry group + descendants.
 */
export function detachPart(craft, partId, { wholeSymmetryGroup = true } = {}) {
  const c = cloneCraft(craft);
  const part = getPart(c, partId);
  if (!part) return normalizeCraft(c);

  const ids = new Set([partId]);
  if (wholeSymmetryGroup && part.symmetryGroupId) {
    for (const p of Object.values(c.parts)) {
      if (p.symmetryGroupId === part.symmetryGroupId) ids.add(p.id);
    }
  }
  for (const id of ids) detachPartInPlace(c, id);
  // Drop fuel lines / struts that referenced removed parts
  if (c.connections) {
    for (const cid of Object.keys(c.connections)) {
      const conn = c.connections[cid];
      if (ids.has(conn.a) || ids.has(conn.b)) delete c.connections[cid];
    }
  }
  c.meta = c.meta || {};
  c.meta.updatedAt = Date.now();
  return normalizeCraft(c);
}

export function setPartParams(craft, partId, patch) {
  const c = cloneCraft(craft);
  const part = getPart(c, partId);
  if (!part) return c;
  part.params = { ...part.params, ...patch };
  // sync symmetry group params for non-angle fields
  if (part.symmetryGroupId) {
    for (const p of Object.values(c.parts)) {
      if (p.symmetryGroupId === part.symmetryGroupId && p.id !== partId) {
        const { angle: _a, ...rest } = patch;
        p.params = { ...p.params, ...rest };
      }
    }
  }
  c.meta.updatedAt = Date.now();
  return normalizeCraft(c);
}

export function setCraftName(craft, name) {
  const c = cloneCraft(craft);
  c.name = String(name || '未命名');
  c.meta.updatedAt = Date.now();
  return c;
}

/**
 * Normalize craft: clamp params, drop orphans, fix version.
 */
export function normalizeCraft(craft) {
  const c = cloneCraft(craft || createEmptyCraft());
  c.version = DESIGN_VERSION;
  if (!c.parts || typeof c.parts !== 'object') c.parts = {};
  if (!c.textures) c.textures = {};
  if (!c.connections || typeof c.connections !== 'object') c.connections = {};
  if (!c.staging || typeof c.staging !== 'object') c.staging = { auto: true, groups: [] };
  if (!c.actionGroups || typeof c.actionGroups !== 'object') c.actionGroups = {};
  if (!c.meta) c.meta = { createdAt: Date.now(), updatedAt: Date.now() };
  if (!c.id) c.id = createPartId('design');
  if (!c.name) c.name = '未命名载具';

  // Prune dangling connections
  for (const id of Object.keys(c.connections)) {
    const conn = c.connections[id];
    if (
      !conn ||
      (conn.type !== 'fuelLine' && conn.type !== 'strut') ||
      !c.parts[conn.a] ||
      !c.parts[conn.b]
    ) {
      delete c.connections[id];
    }
  }

  // Drop parts with missing defs
  for (const id of Object.keys(c.parts)) {
    const p = c.parts[id];
    if (!getPartDef(p.defId)) {
      delete c.parts[id];
      continue;
    }
    const def = getPartDef(p.defId);
    p.params = mergeParams(def, p.params || {});
    // clamp known numerics
    if (p.params.height != null) p.params.height = clamp(p.params.height, 0.5, 120);
    if (p.params.diameter != null) p.params.diameter = clamp(p.params.diameter, 0.5, 18);
    if (p.params.fuelFill != null) p.params.fuelFill = clamp(p.params.fuelFill, 0, 1);
    if (p.params.count != null) p.params.count = Math.max(1, Math.min(40, Math.round(p.params.count)));
    if (p.params.size != null) p.params.size = clamp(p.params.size, 0.3, 3);
    if (p.params.yFraction != null) p.params.yFraction = clamp(p.params.yFraction, 0, 1);
    if (p.params.engineCount != null) {
      p.params.engineCount = Math.max(0, Math.min(20, Math.round(p.params.engineCount)));
    }
    p.angle = Number.isFinite(p.angle) ? p.angle : 0;
  }

  // Validate root
  if (c.rootId && !c.parts[c.rootId]) c.rootId = null;
  if (!c.rootId) {
    const tanks = Object.values(c.parts).filter((p) => getPartDef(p.defId)?.canBeRoot && !p.parentId);
    if (tanks[0]) c.rootId = tanks[0].id;
  }

  // Remove orphaned (parent missing) non-roots
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Object.keys(c.parts)) {
      const p = c.parts[id];
      if (p.parentId && !c.parts[p.parentId]) {
        detachPartInPlace(c, id);
        changed = true;
      }
    }
  }

  c.meta.updatedAt = Date.now();
  return c;
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * List attach targets for a def (for install UI).
 * @returns {{ parentId: string, parentNode: string, score: number }[]}
 */
export function listValidAttachTargets(craft, defId, opts = {}) {
  const def = getPartDef(defId);
  if (!def) return [];
  const c = normalizeCraft(craft);
  const out = [];

  if (!c.rootId) {
    if (def.canBeRoot) out.push({ parentId: null, parentNode: null, score: 100 });
    return out;
  }

  for (const part of Object.values(c.parts)) {
    const pDef = getPartDef(part.defId);
    if (!pDef?.nodes) continue;
    for (const node of pDef.nodes) {
      const check = canAttach(c, part.id, node.id, defId, { ...opts, allowReplace: true });
      if (check.ok) {
        let score = 10;
        if (def.category === 'engine' && node.id === 'bottom') score = 50;
        if (def.category === 'nose' && node.id === 'top') score = 50;
        if (def.category === 'decoupler' && node.id === 'top') score = 40;
        if (node.type === 'radial' && ['aero', 'decor', 'side', 'utility'].includes(def.category)) score = 40;
        out.push({ parentId: part.id, parentNode: node.id, score });
      }
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Flat tree for UI.
 */
export function getAssemblyTreeView(craft) {
  const c = normalizeCraft(craft);
  const rows = [];
  function walk(id, depth) {
    const p = getPart(c, id);
    if (!p) return;
    const def = getPartDef(p.defId);
    rows.push({
      id: p.id,
      defId: p.defId,
      name: def?.name || p.defId,
      category: def?.category || 'unknown',
      depth,
      parentId: p.parentId,
      angle: p.angle,
      symmetryGroupId: p.symmetryGroupId,
      params: p.params,
    });
    const kids = listChildren(c, id).sort((a, b) => a.defId.localeCompare(b.defId) || a.angle - b.angle);
    for (const k of kids) walk(k.id, depth + 1);
  }
  if (c.rootId) walk(c.rootId, 0);
  return rows;
}

/**
 * Default Starship-equivalent craft tree.
 */
export function createDefaultStarshipCraft() {
  let c = createEmptyCraft('Starship 副本');

  // Root booster tank
  let r = attachPart(c, {
    defId: 'tank_heavy',
    params: { height: 72, diameter: 9, fuelFill: 0.92, material: defaultMaterial('#d8dde5', 'metal') },
  });
  c = r.craft;
  const boosterId = r.primaryId;

  // Booster engines ×33
  r = attachPart(c, {
    defId: 'engine_heavy_booster',
    parentId: boosterId,
    parentNode: 'bottom',
    params: { count: 33, layout: 'superheavy' },
  });
  c = r.craft;

  // Grid fins ×4 radial
  r = attachPart(c, {
    defId: 'aero_fin_grid',
    parentId: boosterId,
    parentNode: 'radial',
    angle: Math.PI / 4,
    symmetry: 4,
    params: { size: 1, yFraction: 0.88, material: defaultMaterial('#2a2e36', 'matte') },
  });
  c = r.craft;

  // Decor rings on booster
  for (const y of [0.25, 0.5, 0.75]) {
    r = attachPart(c, {
      defId: 'decor_ring_weld',
      parentId: boosterId,
      parentNode: 'radial',
      params: { yFraction: y },
    });
    c = r.craft;
  }
  r = attachPart(c, {
    defId: 'decor_vent_band',
    parentId: boosterId,
    parentNode: 'radial',
    params: { yFraction: 0.08 },
  });
  c = r.craft;

  // Decoupler on booster top
  r = attachPart(c, {
    defId: 'decoupler_std',
    parentId: boosterId,
    parentNode: 'top',
    params: { diameter: 9, height: 1.2 },
  });
  c = r.craft;
  const decId = r.primaryId;

  // Ship tank on decoupler top
  r = attachPart(c, {
    defId: 'tank_std',
    parentId: decId,
    parentNode: 'top',
    params: { height: 52, diameter: 9, fuelFill: 0.88, material: defaultMaterial('#d8dde5', 'metal') },
  });
  c = r.craft;
  const shipId = r.primaryId;

  // Ship engines
  r = attachPart(c, {
    defId: 'engine_raptor_sl',
    parentId: shipId,
    parentNode: 'bottom',
    params: { count: 6, layout: 'starship' },
  });
  c = r.craft;

  // Nose
  r = attachPart(c, {
    defId: 'nose_ogive',
    parentId: shipId,
    parentNode: 'top',
    params: { height: 12, material: defaultMaterial('#d8dde5', 'metal') },
  });
  c = r.craft;

  // Flaps
  r = attachPart(c, {
    defId: 'aero_flap_fwd',
    parentId: shipId,
    parentNode: 'radial',
    angle: 0,
    symmetry: 2,
    params: { size: 1, yFraction: 0.72, material: defaultMaterial('#2a2e36', 'matte') },
  });
  c = r.craft;
  r = attachPart(c, {
    defId: 'aero_flap_aft',
    parentId: shipId,
    parentNode: 'radial',
    angle: Math.PI / 2,
    symmetry: 2,
    params: { size: 1, yFraction: 0.18, material: defaultMaterial('#2a2e36', 'matte') },
  });
  c = r.craft;

  for (const y of [0.35, 0.55]) {
    r = attachPart(c, {
      defId: 'decor_ring_weld',
      parentId: shipId,
      parentNode: 'radial',
      params: { yFraction: y },
    });
    c = r.craft;
  }

  return normalizeCraft(c);
}

/**
 * Migrate v1 stage document → craft graph.
 */
export function migrateV1StagesToCraft(v1) {
  const d = v1 || {};
  let c = createEmptyCraft(d.name || '导入载具');
  c.id = d.id || c.id;
  c.textures = d.textures || {};
  if (d.meta) c.meta = { ...c.meta, ...d.meta };

  const stages = Array.isArray(d.stages) ? d.stages : [];
  const stageCount = d.stageCount === 1 ? 1 : Math.min(2, Math.max(1, stages.length || 2));

  if (stages.length === 0) {
    return createDefaultStarshipCraft();
  }

  // Bottom stage
  const s0 = stages[0];
  let r = attachPart(c, {
    defId: tankDefFromStagePreset(s0.preset),
    params: {
      height: s0.height ?? 40,
      diameter: s0.diameter ?? 9,
      fuelFill: s0.fuelFill ?? 0.9,
      material: s0.material || defaultMaterial(),
      textureId: s0.textureId || null,
      uv: s0.uv || defaultUv(),
      name: s0.name,
    },
  });
  c = r.craft;
  let coreId = r.primaryId;
  const stageTankIds = [coreId];

  const attachStageBits = (stage, tankId) => {
    let craft = c;
    if (stage.engines?.preset) {
      const er = attachPart(craft, {
        defId: engineDefFromPreset(stage.engines.preset),
        parentId: tankId,
        parentNode: 'bottom',
        params: {
          count: stage.engines.count || 1,
          layout: stage.engines.layout || 'ring',
        },
      });
      if (er.ok) craft = er.craft;
    }
    if (stage.nose?.preset) {
      const nr = attachPart(craft, {
        defId: noseDefFromPreset(stage.nose.preset),
        parentId: tankId,
        parentNode: 'top',
        params: {
          height: stage.nose.height ?? 10,
          material: stage.nose.material,
          textureId: stage.nose.textureId,
          uv: stage.nose.uv,
        },
      });
      if (nr.ok) craft = nr.craft;
    }
    for (const w of stage.wings || []) {
      const wr = attachPart(craft, {
        defId: wingDefFromPreset(w.preset),
        parentId: tankId,
        parentNode: 'radial',
        angle: 0,
        symmetry: Math.min(8, Math.max(1, w.count || 1)),
        params: {
          size: w.size ?? 1,
          yFraction: w.yFraction ?? 0.5,
          material: w.material,
          textureId: w.textureId,
          uv: w.uv,
        },
      });
      if (wr.ok) craft = wr.craft;
    }
    for (const dec of stage.decor || []) {
      const dr = attachPart(craft, {
        defId: decorDefFromPreset(dec.preset),
        parentId: tankId,
        parentNode: 'radial',
        params: { yFraction: dec.yFraction ?? 0.5 },
      });
      if (dr.ok) craft = dr.craft;
    }
    c = craft;
  };

  // If nose on booster and 2-stage, nose usually on upper — attach bits carefully
  // For booster (s0): engines, wings, decor — not nose if 2-stage with upper having nose
  if (stageCount === 1) {
    attachStageBits(s0, coreId);
  } else {
    // booster without nose
    const booster = { ...s0, nose: null };
    attachStageBits(booster, coreId);

    // decoupler
    r = attachPart(c, {
      defId: 'decoupler_std',
      parentId: coreId,
      parentNode: 'top',
      params: { diameter: s0.diameter ?? 9 },
    });
    if (!r.ok) {
      // if top occupied, still try
      c = r.craft;
    } else {
      c = r.craft;
      const decId = r.primaryId;
      const s1 = stages[1] || stages[0];
      r = attachPart(c, {
        defId: tankDefFromStagePreset(s1.preset),
        parentId: decId,
        parentNode: 'top',
        params: {
          height: s1.height ?? 50,
          diameter: s1.diameter ?? 9,
          fuelFill: s1.fuelFill ?? 0.88,
          material: s1.material || defaultMaterial(),
          textureId: s1.textureId || null,
          uv: s1.uv || defaultUv(),
          name: s1.name,
        },
      });
      c = r.craft;
      const shipId = r.primaryId;
      stageTankIds.push(shipId);
      attachStageBits(s1, shipId);
    }
  }

  // Side boosters
  const sb = d.sideBoosters;
  if (sb && sb.count > 0) {
    r = attachPart(c, {
      defId: sideDefFromPreset(sb.preset),
      parentId: stageTankIds[0],
      parentNode: 'radial',
      angle: Math.PI / (sb.count || 2),
      symmetry: sb.count === 4 ? 4 : 2,
      params: {
        height: sb.height ?? 55,
        diameter: sb.diameter ?? 3.6,
        fuelFill: sb.fuelFill ?? 0.9,
        enginePreset: sb.engines?.preset || 'merlin',
        engineCount: sb.engines?.count ?? 9,
        separatePhase: sb.separatePhase || 'ascent',
        material: sb.material,
        textureId: sb.textureId,
        uv: sb.uv,
      },
    });
    if (r.ok) c = r.craft;
  }

  c.name = d.name || c.name;
  return normalizeCraft(c);
}

/**
 * Detect if document is craft graph (v2) vs stage doc (v1).
 */
export function isCraftDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (doc.parts && typeof doc.parts === 'object' && !Array.isArray(doc.parts)) {
    if (doc.rootId != null || Object.keys(doc.parts).length >= 0) {
      // v2 craft has parts map; v1 has stages array
      if (Array.isArray(doc.stages) && !doc.rootId && Object.keys(doc.parts).length === 0) return false;
      if (doc.version >= 2 || doc.rootId || Object.keys(doc.parts).length > 0) return true;
    }
  }
  return false;
}

/**
 * Coerce any design input to craft graph.
 */
export function asCraft(doc) {
  if (!doc) return createDefaultStarshipCraft();
  if (isCraftDocument(doc)) return normalizeCraft(doc);
  if (Array.isArray(doc.stages) || doc.stageCount) return migrateV1StagesToCraft(doc);
  return createDefaultStarshipCraft();
}
