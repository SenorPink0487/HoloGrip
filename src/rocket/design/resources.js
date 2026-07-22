/**
 * KSP-style resources & fuel networks (simplified demo physics).
 *
 * Resources:
 *   LF  — liquid fuel
 *   OX  — oxidizer
 *   EC  — electric charge
 *   MP  — monopropellant
 *
 * Fuel lines / stack adjacency form undirected graphs so engines can draw
 * propellant from connected tanks (crossfeed).
 */

import { getPartDef, PROPELLANT_DENSITY } from './partDefs.js';
import { getPart, listChildren, normalizeCraft, asCraft } from './craftGraph.js';

export const RESOURCE_DEFS = {
  LF: { id: 'LF', name: '液体燃料', short: 'LF', color: '#6bcf6b', unit: 'u' },
  OX: { id: 'OX', name: '氧化剂', short: 'OX', color: '#6bb3ff', unit: 'u' },
  EC: { id: 'EC', name: '电能', short: 'EC', color: '#f0d060', unit: '⚡' },
  MP: { id: 'MP', name: '单组元', short: 'MP', color: '#c090ff', unit: 'u' },
};

/** KSP-like LF:OX mass split of bulk propellant */
const LF_FRACTION = 0.45;
const OX_FRACTION = 0.55;

function cylinderVolume(diameter, height) {
  const r = (diameter || 1) / 2;
  return Math.PI * r * r * (height || 1);
}

/**
 * Resource amounts stored / provided by a single part (at current fill).
 * @returns {Record<string, number>}
 */
export function partResourceAmount(part, def = null) {
  const d = def || getPartDef(part?.defId);
  if (!part || !d) return {};
  const out = {};

  if (d.category === 'tank' || d.category === 'side') {
    const H = part.params?.height || d.defaultParams?.height || 40;
    const Dia = part.params?.diameter || d.defaultParams?.diameter || 9;
    const fill = Math.min(1, Math.max(0, part.params?.fuelFill ?? 0.9));
    const volFactor = d.tankVolumeFactor ?? 0.72;
    const mass = cylinderVolume(Dia, H) * volFactor * PROPELLANT_DENSITY * fill;
    // Convert mass → abstract units (1 u ≈ 1 kg for demo)
    out.LF = mass * LF_FRACTION;
    out.OX = mass * OX_FRACTION;
    // Structural tanks hold a little battery buffer
    out.EC = Math.max(50, H * Dia * 0.8);
  }

  if (d.category === 'engine') {
    // Engines themselves hold tiny EC for ignition
    out.EC = 20 * Math.max(1, part.params?.count || 1);
  }

  if (d.category === 'utility' || d.resources) {
    const res = d.resources || {};
    for (const [k, v] of Object.entries(res)) {
      const fill = part.params?.fill ?? 1;
      out[k] = (out[k] || 0) + Number(v) * fill;
    }
  }

  // Explicit overrides on part.params.resources
  if (part.params?.resources && typeof part.params.resources === 'object') {
    for (const [k, v] of Object.entries(part.params.resources)) {
      out[k] = Number(v) || 0;
    }
  }

  return out;
}

/**
 * Whether a part can participate in fuel-line endpoints.
 */
export function canFuelConnect(part, def = null) {
  const d = def || getPartDef(part?.defId);
  if (!d) return false;
  return d.category === 'tank' || d.category === 'side' || d.category === 'engine' || !!d.resources?.LF;
}

/**
 * Whether a part can take a strut endpoint (most structural parts).
 */
export function canStrutConnect(part, def = null) {
  const d = def || getPartDef(part?.defId);
  if (!d) return false;
  return ['tank', 'side', 'decoupler', 'nose', 'engine', 'utility'].includes(d.category);
}

/**
 * Build undirected adjacency for fuel (stack neighbors + fuel lines + optional full crossfeed).
 * @param {object} craft
 * @returns {Map<string, Set<string>>}
 */
export function buildFuelGraph(craft) {
  const c = normalizeCraft(asCraft(craft));
  /** @type {Map<string, Set<string>>} */
  const g = new Map();
  const ensure = (id) => {
    if (!g.has(id)) g.set(id, new Set());
    return g.get(id);
  };

  const link = (a, b) => {
    if (!a || !b || a === b) return;
    ensure(a).add(b);
    ensure(b).add(a);
  };

  // Stack / parent-child adjacency for tanks & engines
  for (const p of Object.values(c.parts)) {
    ensure(p.id);
    if (!p.parentId || !c.parts[p.parentId]) continue;
    const def = getPartDef(p.defId);
    const pDef = getPartDef(c.parts[p.parentId].defId);

    // Engine always linked to its parent tank (draw fuel from host)
    if (def?.category === 'engine' && (pDef?.category === 'tank' || pDef?.category === 'side')) {
      link(p.id, p.parentId);
      continue;
    }

    // Side boosters do NOT auto-crossfeed into core (need fuel line or crossfeed flag)
    if (def?.category === 'side') {
      if (p.params?.crossfeed || hasFuelLineBetween(c, p.id, p.parentId)) {
        link(p.id, p.parentId);
      }
      continue;
    }

    // Tank stacked on tank: free flow
    if (def?.category === 'tank' && pDef?.category === 'tank') {
      link(p.id, p.parentId);
      continue;
    }

    // Tank through decoupler: blocked unless crossfeed
    if (def?.category === 'tank' && pDef?.category === 'decoupler') {
      const cross =
        c.parts[p.parentId].params?.crossfeed === true ||
        p.params?.crossfeed === true ||
        hasFuelLineBetween(c, p.id, p.parentId);
      if (cross) link(p.id, p.parentId);
      // Also link decoupler's parent tank when crossfeed
      const grand = c.parts[p.parentId]?.parentId;
      if (cross && grand) link(p.id, grand);
      continue;
    }

    // Tank on side etc.
    if (def?.category === 'tank' && pDef?.category === 'side') {
      link(p.id, p.parentId);
    }
  }

  // Explicit fuel lines
  for (const conn of Object.values(c.connections || {})) {
    if (conn.type !== 'fuelLine') continue;
    if (c.parts[conn.a] && c.parts[conn.b]) link(conn.a, conn.b);
  }

  return g;
}

function hasFuelLineBetween(craft, a, b) {
  for (const conn of Object.values(craft.connections || {})) {
    if (conn.type !== 'fuelLine') continue;
    if ((conn.a === a && conn.b === b) || (conn.a === b && conn.b === a)) return true;
  }
  return false;
}

/**
 * Connected component containing startId.
 * @returns {Set<string>}
 */
export function fuelComponent(graph, startId) {
  const seen = new Set();
  if (!startId || !graph.has(startId)) return seen;
  const q = [startId];
  seen.add(startId);
  while (q.length) {
    const id = q.pop();
    for (const n of graph.get(id) || []) {
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return seen;
}

/**
 * Aggregate resources available to an engine through the fuel network.
 */
export function resourcesReachableByPart(craft, partId) {
  const c = normalizeCraft(asCraft(craft));
  const graph = buildFuelGraph(c);
  const comp = fuelComponent(graph, partId);
  const totals = { LF: 0, OX: 0, EC: 0, MP: 0 };
  for (const id of comp) {
    const p = getPart(c, id);
    if (!p) continue;
    const amt = partResourceAmount(p);
    for (const k of Object.keys(totals)) {
      totals[k] += amt[k] || 0;
    }
  }
  return { totals, component: comp };
}

/**
 * Craft-wide resource inventory + fuel-network warnings.
 */
export function summarizeCraftResources(craft) {
  const c = normalizeCraft(asCraft(craft));
  const totals = { LF: 0, OX: 0, EC: 0, MP: 0 };
  const byPart = {};
  for (const p of Object.values(c.parts)) {
    const amt = partResourceAmount(p);
    byPart[p.id] = amt;
    for (const k of Object.keys(totals)) totals[k] += amt[k] || 0;
  }

  const warnings = [];
  const graph = buildFuelGraph(c);

  // Engines without LF/OX in their component
  for (const p of Object.values(c.parts)) {
    const def = getPartDef(p.defId);
    if (def?.category !== 'engine') continue;
    const { totals: t } = resourcesReachableByPart(c, p.id);
    if (t.LF <= 1 || t.OX <= 1) {
      warnings.push(`发动机 ${def.name} 无法从燃料网络取油 — 检查贮箱连接或燃料管`);
    }
  }

  // Side boosters without crossfeed/fuel line
  for (const p of Object.values(c.parts)) {
    const def = getPartDef(p.defId);
    if (def?.category !== 'side') continue;
    const parent = p.parentId ? getPart(c, p.parentId) : null;
    if (!parent) continue;
    const linked =
      p.params?.crossfeed ||
      hasFuelLineBetween(c, p.id, p.parentId) ||
      (buildFuelGraph(c).get(p.id)?.has(p.parentId) ?? false);
    if (!linked) {
      warnings.push(`侧助推 ${def.name} 未交叉供油 — 添加燃料管或开启 crossfeed`);
    }
  }

  const fuelLines = Object.values(c.connections || {}).filter((x) => x.type === 'fuelLine').length;
  const struts = Object.values(c.connections || {}).filter((x) => x.type === 'strut').length;

  return {
    totals,
    byPart,
    warnings,
    fuelLines,
    struts,
    graphSize: graph.size,
  };
}

/**
 * Structural bonus from struts (demo): each strut adds stiffness score.
 */
export function strutIntegrity(craft) {
  const c = normalizeCraft(asCraft(craft));
  const n = Object.values(c.connections || {}).filter((x) => x.type === 'strut').length;
  // 0–100 score
  return Math.min(100, n * 12);
}
