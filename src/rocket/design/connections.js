/**
 * Craft connections: fuel lines & struts (KSP-style between two parts).
 */

import { createPartId, cloneCraft, normalizeCraft, getPart, asCraft } from './craftGraph.js';
import { canFuelConnect, canStrutConnect } from './resources.js';
import { getPartDef } from './partDefs.js';

/**
 * @typedef {object} CraftConnection
 * @property {string} id
 * @property {'fuelLine'|'strut'} type
 * @property {string} a
 * @property {string} b
 */

export function listConnections(craft, type = null) {
  const c = normalizeCraft(asCraft(craft));
  const all = Object.values(c.connections || {});
  if (!type) return all;
  return all.filter((x) => x.type === type);
}

function samePair(a, b, x, y) {
  return (a === x && b === y) || (a === y && b === x);
}

/**
 * @returns {{ ok: true, craft, connection } | { ok: false, reason: string, craft }}
 */
export function addConnection(craft, type, partA, partB) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  if (!c.connections) c.connections = {};
  if (partA === partB) return { ok: false, reason: '不能连接到自身', craft: c };
  const pa = getPart(c, partA);
  const pb = getPart(c, partB);
  if (!pa || !pb) return { ok: false, reason: '零件不存在', craft: c };

  if (type === 'fuelLine') {
    if (!canFuelConnect(pa) || !canFuelConnect(pb)) {
      return { ok: false, reason: '燃料管只能连接贮箱 / 发动机 / 侧助推', craft: c };
    }
  } else if (type === 'strut') {
    if (!canStrutConnect(pa) || !canStrutConnect(pb)) {
      return { ok: false, reason: '支柱只能连接结构件', craft: c };
    }
  } else {
    return { ok: false, reason: '未知连接类型', craft: c };
  }

  // Duplicate?
  for (const conn of Object.values(c.connections)) {
    if (conn.type === type && samePair(conn.a, conn.b, partA, partB)) {
      return { ok: false, reason: '已存在相同连接', craft: c };
    }
  }

  const id = createPartId(type === 'fuelLine' ? 'fl' : 'st');
  const connection = { id, type, a: partA, b: partB };
  c.connections[id] = connection;
  c.meta = c.meta || {};
  c.meta.updatedAt = Date.now();
  // Adding connections invalidates auto staging only mildly — mark staging dirty false still ok
  if (c.staging) c.staging.auto = c.staging.auto !== false ? true : c.staging.auto;
  return { ok: true, craft: normalizeCraft(c), connection };
}

export function removeConnection(craft, connectionId) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  if (!c.connections?.[connectionId]) return normalizeCraft(c);
  delete c.connections[connectionId];
  c.meta.updatedAt = Date.now();
  return normalizeCraft(c);
}

export function removeConnectionsForPart(craft, partId) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  if (!c.connections) return c;
  for (const id of Object.keys(c.connections)) {
    const conn = c.connections[id];
    if (conn.a === partId || conn.b === partId) delete c.connections[id];
  }
  return normalizeCraft(c);
}

/**
 * Toggle tank/side crossfeed flag (KSP fuel crossfeed through part).
 */
export function setPartCrossfeed(craft, partId, enabled) {
  const c = cloneCraft(normalizeCraft(asCraft(craft)));
  const p = getPart(c, partId);
  if (!p) return c;
  const def = getPartDef(p.defId);
  if (!['tank', 'side', 'decoupler'].includes(def?.category)) return c;
  p.params = { ...p.params, crossfeed: !!enabled };
  c.meta.updatedAt = Date.now();
  return normalizeCraft(c);
}

/**
 * Ensure connections object exists; drop dangling endpoints.
 */
export function normalizeConnections(craft) {
  const c = craft;
  if (!c.connections || typeof c.connections !== 'object') c.connections = {};
  for (const id of Object.keys(c.connections)) {
    const conn = c.connections[id];
    if (!conn || !conn.a || !conn.b || !c.parts[conn.a] || !c.parts[conn.b]) {
      delete c.connections[id];
      continue;
    }
    if (conn.type !== 'fuelLine' && conn.type !== 'strut') delete c.connections[id];
  }
  return c;
}
