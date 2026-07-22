/**
 * One-click craft templates — lower barrier than blank VAB.
 * Default experience starts from a template, not empty craft.
 */

import { defaultMaterial } from './partsLibrary.js';
import {
  createEmptyCraft,
  createDefaultStarshipCraft,
  attachPart,
  normalizeCraft,
} from './craftGraph.js';
import { rebuildStaging } from './staging.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   blurb: string,
 *   badge: string,
 *   accent: string,
 *   expert?: boolean,
 *   recommended?: boolean,
 * }} TemplateMeta
 */

/** @type {TemplateMeta[]} */
export const CRAFT_TEMPLATES = [
  {
    id: 'starship_full',
    name: 'Starship 全栈',
    blurb: '助推器 + 分离环 + 上面级 · 可直接发射',
    badge: '推荐',
    accent: '#8bc34a',
    recommended: true,
  },
  {
    id: 'classic_two',
    name: '经典两级',
    blurb: '轻型芯级 + Merlin 簇 · 上手练装配',
    badge: '入门',
    accent: '#64b5f6',
  },
  {
    id: 'side_boost',
    name: '侧助推重型',
    blurb: '芯级两级 + 双绑侧助推 · 对称演示',
    badge: '进阶',
    accent: '#ffb74d',
  },
  {
    id: 'scifi_slender',
    name: '科幻细长箭',
    blurb: '装甲贮箱 + 离子/等离子 · 外观实验',
    badge: '外观',
    accent: '#ba68c8',
  },
  {
    id: 'empty',
    name: '空箱从零开始',
    blurb: '空白工棚 · 专家模式，需先放根贮箱',
    badge: '专家',
    accent: '#90a4ae',
    expert: true,
  },
];

export function getTemplateMeta(id) {
  return CRAFT_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Build craft for a template id.
 * @param {string} templateId
 * @returns {object} craft document
 */
export function buildTemplateCraft(templateId) {
  let craft;
  switch (templateId) {
    case 'empty':
      craft = createEmptyCraft('新载具');
      break;
    case 'classic_two':
      craft = buildClassicTwoStage();
      break;
    case 'side_boost':
      craft = buildSideBoostHeavy();
      break;
    case 'scifi_slender':
      craft = buildSciFiSlender();
      break;
    case 'starship_full':
    default:
      craft = createDefaultStarshipCraft();
      // keep createDefaultStarshipCraft name ('Starship 副本') for compatibility
      craft.name = craft.name || 'Starship 全栈';
      break;
  }
  return rebuildStaging(normalizeCraft(craft));
}

function buildClassicTwoStage() {
  let c = createEmptyCraft('经典两级');
  let r = attachPart(c, {
    defId: 'tank_std',
    params: {
      height: 28,
      diameter: 3.7,
      fuelFill: 0.92,
      material: defaultMaterial('#c8cdd4', 'metal'),
    },
  });
  c = r.craft;
  const lowerId = r.primaryId;

  r = attachPart(c, {
    defId: 'engine_merlin',
    parentId: lowerId,
    parentNode: 'bottom',
    params: { count: 9, layout: 'ring' },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'aero_fin_grid',
    parentId: lowerId,
    parentNode: 'radial',
    angle: Math.PI / 4,
    symmetry: 4,
    params: { size: 0.55, yFraction: 0.85 },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'decoupler_std',
    parentId: lowerId,
    parentNode: 'top',
    params: { diameter: 3.7, height: 0.8 },
  });
  c = r.craft;
  const decId = r.primaryId;

  r = attachPart(c, {
    defId: 'tank_light',
    parentId: decId,
    parentNode: 'top',
    params: {
      height: 14,
      diameter: 3.7,
      fuelFill: 0.9,
      material: defaultMaterial('#e8ecf2', 'metal'),
    },
  });
  c = r.craft;
  const upperId = r.primaryId;

  r = attachPart(c, {
    defId: 'engine_merlin',
    parentId: upperId,
    parentNode: 'bottom',
    params: { count: 1, layout: 'ring' },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'nose_capsule',
    parentId: upperId,
    parentNode: 'top',
    params: { height: 5.5 },
  });
  c = r.craft;

  return c;
}

function buildSideBoostHeavy() {
  let c = createEmptyCraft('侧助推重型');
  let r = attachPart(c, {
    defId: 'tank_heavy',
    params: {
      height: 48,
      diameter: 5.2,
      fuelFill: 0.9,
      material: defaultMaterial('#b0b6be', 'metal'),
    },
  });
  c = r.craft;
  const coreId = r.primaryId;

  r = attachPart(c, {
    defId: 'engine_heavy_booster',
    parentId: coreId,
    parentNode: 'bottom',
    params: { count: 9, layout: 'ring' },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'side_strap_std',
    parentId: coreId,
    parentNode: 'radial',
    angle: 0,
    symmetry: 2,
    params: {
      height: 42,
      diameter: 2.6,
      fuelFill: 0.9,
      enginePreset: 'merlin',
      engineCount: 3,
    },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'decoupler_std',
    parentId: coreId,
    parentNode: 'top',
    params: { diameter: 5.2, height: 1.0 },
  });
  c = r.craft;
  const decId = r.primaryId;

  r = attachPart(c, {
    defId: 'tank_std',
    parentId: decId,
    parentNode: 'top',
    params: {
      height: 22,
      diameter: 5.2,
      fuelFill: 0.88,
      material: defaultMaterial('#d8dde5', 'metal'),
    },
  });
  c = r.craft;
  const upperId = r.primaryId;

  r = attachPart(c, {
    defId: 'engine_raptor_sl',
    parentId: upperId,
    parentNode: 'bottom',
    params: { count: 3, layout: 'ring' },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'nose_ogive',
    parentId: upperId,
    parentNode: 'top',
    params: { height: 8 },
  });
  c = r.craft;

  return c;
}

function buildSciFiSlender() {
  let c = createEmptyCraft('科幻细长箭');
  let r = attachPart(c, {
    defId: 'tank_sf',
    params: {
      height: 55,
      diameter: 4.2,
      fuelFill: 0.85,
      material: defaultMaterial('#8aa0d0', 'emissive'),
    },
  });
  c = r.craft;
  const tankId = r.primaryId;

  r = attachPart(c, {
    defId: 'engine_plasma_sf',
    parentId: tankId,
    parentNode: 'bottom',
    params: { count: 7, layout: 'cluster' },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'aero_delta_sf',
    parentId: tankId,
    parentNode: 'radial',
    angle: 0,
    symmetry: 3,
    params: { size: 0.9, yFraction: 0.35 },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'decor_ring_glow',
    parentId: tankId,
    parentNode: 'radial',
    params: { yFraction: 0.55 },
  });
  c = r.craft;

  r = attachPart(c, {
    defId: 'nose_spike',
    parentId: tankId,
    parentNode: 'top',
    params: { height: 14, material: defaultMaterial('#9aa8c0', 'emissive') },
  });
  c = r.craft;

  return c;
}

/** Default template when opening VAB with no saved craft preference */
export const DEFAULT_TEMPLATE_ID = 'starship_full';
