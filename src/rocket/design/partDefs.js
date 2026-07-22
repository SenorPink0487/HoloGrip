/**
 * KSP-style part definitions with attach nodes.
 * Physics values are simplified demo data, not engineering truth.
 */

import {
  DESIGN_VERSION,
  MATERIAL_PRESETS,
  NOSE_PRESETS,
  STAGE_PRESETS,
  ENGINE_PRESETS,
  WING_PRESETS,
  DECOR_PRESETS,
  SIDE_BOOSTER_PRESETS,
  PROPELLANT_DENSITY,
  defaultMaterial,
  defaultUv,
  createPartId,
} from './partsLibrary.js';

export {
  DESIGN_VERSION,
  MATERIAL_PRESETS,
  PROPELLANT_DENSITY,
  defaultMaterial,
  defaultUv,
  createPartId,
};

/** Stack size tolerance (relative size units) */
export const STACK_SIZE_TOLERANCE = 0.55;

/**
 * Node types:
 * - stack: axial top/bottom (dir +1 top / -1 bottom)
 * - radial: circumferential attach
 * - mount: engine faces upward into parent bottom
 */

function stackNodes(size = 1.25, { radial = true } = {}) {
  const nodes = [
    { id: 'top', type: 'stack', dir: 1, size, exclusive: true },
    { id: 'bottom', type: 'stack', dir: -1, size, exclusive: false },
  ];
  if (radial) nodes.push({ id: 'radial', type: 'radial', size: 1, exclusive: false });
  return nodes;
}

function noseNodes(size = 1.25) {
  return [{ id: 'bottom', type: 'stack', dir: -1, size, exclusive: true }];
}

function engineNodes(size = 1.25) {
  return [{ id: 'mount', type: 'stack', dir: 1, size, exclusive: false }];
}

function radialOnlyNodes(size = 1) {
  return [{ id: 'mount', type: 'radial', size, exclusive: false }];
}

function decouplerNodes(size = 1.25) {
  return [
    { id: 'top', type: 'stack', dir: 1, size, exclusive: true },
    { id: 'bottom', type: 'stack', dir: -1, size, exclusive: true },
  ];
}

/** @type {Record<string, object>} */
export const PART_DEFS = {};

function reg(def) {
  PART_DEFS[def.id] = def;
  return def;
}

// ── Tanks (can be root) — distinct defaults so swapping type is obvious in VAB ──
const TANK_LOOK = {
  cylinder_std: {
    height: 40,
    diameter: 7.5,
    material: defaultMaterial('#d8dde5', 'metal'),
    blurb: '标准圆柱贮箱 · 中等环缝',
  },
  cylinder_heavy: {
    height: 72,
    diameter: 9,
    material: defaultMaterial('#a8b0ba', 'metal'),
    blurb: '加强级段 · 密环缝 + 纵梁',
  },
  cylinder_light: {
    height: 28,
    diameter: 5.5,
    material: defaultMaterial('#eef2f8', 'metal'),
    blurb: '轻质细长贮箱 · 疏环缝',
  },
  cylinder_sf: {
    height: 48,
    diameter: 8.2,
    material: defaultMaterial('#8aa0d0', 'emissive'),
    blurb: '科幻装甲 · 发光纵肋',
  },
};

for (const [id, sp] of Object.entries(STAGE_PRESETS)) {
  const size = 1.25;
  const look = TANK_LOOK[id] || TANK_LOOK.cylinder_std;
  reg({
    id: `tank_${id.replace('cylinder_', '')}`,
    legacyStagePreset: id,
    name: sp.name,
    category: 'tank',
    icon: `/design-ui/vab/part-tank-${id.replace('cylinder_', '')}.png`,
    blurb: look.blurb || '燃料贮箱 / 箭体段',
    structuralDensity: sp.structuralDensity,
    tankVolumeFactor: sp.tankVolumeFactor,
    dryMassKg: 0, // derived from envelope
    canBeRoot: true,
    defaultParams: {
      height: look.height,
      diameter: look.diameter,
      fuelFill: 0.9,
      material: look.material,
    },
    nodes: stackNodes(size, { radial: true }),
    paramSchema: {
      height: { min: 8, max: 120, step: 0.5, label: '高度 m' },
      diameter: { min: 1.5, max: 18, step: 0.1, label: '直径 m' },
      fuelFill: { min: 0, max: 1, step: 0.01, label: '燃料装载' },
    },
  });
}

// aliases used in craft defaults
PART_DEFS.tank_std = PART_DEFS.tank_std || PART_DEFS['tank_std'];
// STAGE keys: cylinder_std → tank_std
if (!PART_DEFS.tank_std && PART_DEFS['tank_std'] === undefined) {
  /* built as tank_std from cylinder_std */
}

// Fix ids: cylinder_std → tank_std
// The loop produced tank_std, tank_heavy, tank_light, tank_sf

// ── Noses ────────────────────────────────────────────────
for (const [id, np] of Object.entries(NOSE_PRESETS)) {
  reg({
    id: `nose_${id}`,
    legacyNosePreset: id,
    name: np.name,
    category: 'nose',
    icon: `/design-ui/vab/part-nose-${id}.png`,
    blurb:
      np.shape === 'fairing'
        ? '可调高度整流罩 · 拖高度参数看外形变化'
        : '整流罩 / 鼻锥',
    dryMassKg: np.dryMassKg,
    heightFactor: np.heightFactor,
    shape: np.shape,
    canBeRoot: false,
    defaultParams: {
      height: np.shape === 'fairing' ? 16 : 12,
      material: defaultMaterial('#d8dde5', 'metal'),
    },
    nodes: noseNodes(1.25),
    stackExclusive: true,
    paramSchema: {
      height: {
        min: 1,
        max: np.shape === 'fairing' ? 40 : 30,
        step: 0.5,
        label: np.shape === 'fairing' ? '整流罩高度 m' : '高度 m',
      },
    },
  });
}

// ── Engines ──────────────────────────────────────────────
for (const [id, ep] of Object.entries(ENGINE_PRESETS)) {
  reg({
    id: `engine_${id}`,
    legacyEnginePreset: id,
    name: ep.name,
    category: 'engine',
    icon: `/design-ui/vab/part-engine-${id}.png`,
    blurb: '火箭发动机（可设数量/布局）',
    dryMassKg: ep.dryMassKg,
    thrustN: ep.thrustN,
    ispSec: ep.ispSec,
    nozzleScale: ep.nozzleScale,
    style: ep.style,
    canBeRoot: false,
    defaultParams: {
      count: 1,
      layout: 'ring',
    },
    nodes: engineNodes(1.25),
    paramSchema: {
      count: { min: 1, max: 40, step: 1, label: '数量' },
      layout: {
        type: 'select',
        options: ['ring', 'cluster', 'starship', 'superheavy'],
        label: '布局',
      },
    },
  });
}

// ── Aero / wings ─────────────────────────────────────────
for (const [id, wp] of Object.entries(WING_PRESETS)) {
  reg({
    id: `aero_${id}`,
    legacyWingPreset: id,
    name: wp.name,
    category: 'aero',
    icon: `/design-ui/vab/part-aero-${id}.png`,
    blurb: '气动控制面',
    dryMassKg: wp.dryMassKg,
    span: wp.span,
    chord: wp.chord,
    canBeRoot: false,
    defaultParams: {
      size: 1,
      yFraction: 0.5,
      material: defaultMaterial('#2a2e36', 'matte'),
    },
    nodes: radialOnlyNodes(1),
    paramSchema: {
      size: { min: 0.3, max: 3, step: 0.1, label: '尺寸' },
      yFraction: { min: 0, max: 1, step: 0.01, label: '高度位置' },
    },
  });
}

// ── Decor ────────────────────────────────────────────────
for (const [id, dp] of Object.entries(DECOR_PRESETS)) {
  reg({
    id: `decor_${id}`,
    legacyDecorPreset: id,
    name: dp.name,
    category: 'decor',
    icon: `/design-ui/vab/part-decor-${id}.png`,
    blurb: '装饰 / 结构细节',
    dryMassKg: dp.dryMassKg,
    canBeRoot: false,
    defaultParams: {
      yFraction: 0.5,
    },
    nodes: radialOnlyNodes(1),
    paramSchema: {
      yFraction: { min: 0, max: 1, step: 0.01, label: '高度位置' },
    },
  });
}

// ── Side boosters (radial tanks) ─────────────────────────
for (const [id, sp] of Object.entries(SIDE_BOOSTER_PRESETS)) {
  reg({
    id: `side_${id}`,
    legacySidePreset: id,
    name: sp.name,
    category: 'side',
    icon: `/design-ui/vab/part-side-${id.replace('strap_', '')}.png`,
    blurb: '外挂侧助推器',
    structuralDensity: sp.structuralDensity,
    tankVolumeFactor: sp.tankVolumeFactor,
    canBeRoot: false,
    defaultParams: {
      height: 55,
      diameter: 3.6,
      fuelFill: 0.9,
      enginePreset: 'merlin',
      engineCount: 9,
      separatePhase: 'ascent',
      material: defaultMaterial('#c8cdd4', 'metal'),
    },
    nodes: radialOnlyNodes(1),
    paramSchema: {
      height: { min: 8, max: 100, step: 0.5, label: '高度 m' },
      diameter: { min: 1, max: 8, step: 0.1, label: '直径 m' },
      fuelFill: { min: 0, max: 1, step: 0.01, label: '燃料' },
      engineCount: { min: 0, max: 20, step: 1, label: '发动机数' },
    },
  });
}

// ── Decoupler ────────────────────────────────────────────
reg({
  id: 'decoupler_std',
  name: '标准级间分离环',
  category: 'decoupler',
  icon: '/design-ui/vab/part-decoupler-std.png',
  blurb: '划分一二级，启用级间分离',
  dryMassKg: 2400,
  canBeRoot: false,
  defaultParams: {
    height: 1.2,
    diameter: 9,
    crossfeed: false,
  },
  nodes: decouplerNodes(1.25),
  paramSchema: {
    diameter: { min: 1.5, max: 18, step: 0.1, label: '直径 m' },
  },
});

// ── Utility: batteries / monoprop (resources) ─────────────
reg({
  id: 'util_battery',
  name: '蓄电池组',
  category: 'utility',
  icon: '/design-ui/vab/part-util-battery.png',
  blurb: '电能 EC 存储',
  dryMassKg: 180,
  canBeRoot: false,
  resources: { EC: 4000 },
  defaultParams: { fill: 1, yFraction: 0.4 },
  nodes: radialOnlyNodes(1),
  paramSchema: {
    fill: { min: 0, max: 1, step: 0.05, label: '电量' },
    yFraction: { min: 0, max: 1, step: 0.01, label: '高度位置' },
  },
});
reg({
  id: 'util_monoprop',
  name: '单组元贮箱',
  category: 'utility',
  icon: '/design-ui/vab/part-util-monoprop.png',
  blurb: 'RCS 单组元推进剂 MP',
  dryMassKg: 220,
  canBeRoot: false,
  resources: { MP: 800 },
  defaultParams: { fill: 1, yFraction: 0.55 },
  nodes: radialOnlyNodes(1),
  paramSchema: {
    fill: { min: 0, max: 1, step: 0.05, label: '装载' },
    yFraction: { min: 0, max: 1, step: 0.01, label: '高度位置' },
  },
});

/** Ordered categories for VAB rail */
export const PART_CATEGORIES = [
  { id: 'tank', title: '贮箱级段', iconKey: 'stagePreset', icon: '/design-ui/vab/cat-tank.png' },
  { id: 'nose', title: '鼻锥整流', iconKey: 'nose', icon: '/design-ui/vab/cat-nose.png' },
  { id: 'engine', title: '发动机', iconKey: 'engine', icon: '/design-ui/vab/cat-engine.png' },
  { id: 'aero', title: '气动翼面', iconKey: 'wing', icon: '/design-ui/vab/cat-aero.png' },
  { id: 'decor', title: '装饰结构', iconKey: 'decor', icon: '/design-ui/vab/cat-decor.png' },
  { id: 'side', title: '侧助推', iconKey: 'side', icon: '/design-ui/vab/cat-side.png' },
  { id: 'decoupler', title: '分离装置', iconKey: 'stagePreset', icon: '/design-ui/vab/cat-decoupler.png' },
  { id: 'utility', title: '公用资源', iconKey: 'decor', icon: '/design-ui/vab/cat-decor.png' },
];

export function getPartDef(defId) {
  return PART_DEFS[defId] || null;
}

export function listPartDefs(category = null) {
  const all = Object.values(PART_DEFS);
  if (!category) return all;
  return all.filter((d) => d.category === category);
}

export function getDefNode(def, nodeId) {
  if (!def?.nodes) return null;
  return def.nodes.find((n) => n.id === nodeId) || null;
}

/** Map legacy stage preset id → tank def id */
export function tankDefFromStagePreset(preset) {
  const key = String(preset || 'cylinder_std').replace('cylinder_', '');
  return PART_DEFS[`tank_${key}`] ? `tank_${key}` : 'tank_std';
}

export function noseDefFromPreset(preset) {
  const id = `nose_${preset || 'ogive'}`;
  return PART_DEFS[id] ? id : 'nose_ogive';
}

export function engineDefFromPreset(preset) {
  const id = `engine_${preset || 'raptor_sl'}`;
  return PART_DEFS[id] ? id : 'engine_raptor_sl';
}

export function wingDefFromPreset(preset) {
  const id = `aero_${preset || 'flap_aft'}`;
  return PART_DEFS[id] ? id : 'aero_flap_aft';
}

export function decorDefFromPreset(preset) {
  const id = `decor_${preset || 'ring_weld'}`;
  return PART_DEFS[id] ? id : 'decor_ring_weld';
}

export function sideDefFromPreset(preset) {
  const id = `side_${preset || 'strap_std'}`;
  return PART_DEFS[id] ? id : 'side_strap_std';
}

/** Effective stack size from def + params (diameter-aware) */
export function effectiveStackSize(def, params = {}) {
  const base = def?.nodes?.find((n) => n.type === 'stack')?.size ?? 1.25;
  const dia = params.diameter;
  if (dia != null && Number.isFinite(Number(dia))) {
    // 9 m → 1.25 reference
    return base * (Number(dia) / 9);
  }
  return base;
}

export function stackSizesCompatible(a, b) {
  return Math.abs(a - b) <= STACK_SIZE_TOLERANCE;
}
