/**
 * Sci-fi part presets for DIY rocket design.
 * Mass/thrust/Isp are simplified demo values, not engineering data.
 */

/** Document version: 2 = craft part-tree; 1 migrates on load */
export const DESIGN_VERSION = 2;

/** Material style presets applied to MeshStandardMaterial (aligned with partMaterials language). */
export const MATERIAL_PRESETS = {
  metal: {
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 1.65,
  },
  matte: {
    metalness: 0.1,
    roughness: 0.82,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 0.65,
  },
  ceramic: {
    metalness: 0.08,
    roughness: 0.88,
    emissive: 0x000000,
    emissiveIntensity: 0,
    envMapIntensity: 0.55,
  },
  emissive: {
    metalness: 0.4,
    roughness: 0.38,
    emissive: 0x2266ff,
    emissiveIntensity: 0.55,
    envMapIntensity: 1.1,
  },
};

export const NOSE_PRESETS = {
  ogive: {
    id: 'ogive',
    name: '卵形鼻锥 Ogive',
    heightFactor: 1.0,
    dryMassKg: 4200,
    shape: 'ogive',
  },
  cone: {
    id: 'cone',
    name: '尖锥 Cone',
    heightFactor: 0.85,
    dryMassKg: 2800,
    shape: 'cone',
  },
  blunt: {
    id: 'blunt',
    name: '钝头 Blunt',
    heightFactor: 0.55,
    dryMassKg: 3500,
    shape: 'blunt',
  },
  spike: {
    id: 'spike',
    name: '科幻尖刺 Spike',
    heightFactor: 1.35,
    dryMassKg: 2200,
    shape: 'spike',
  },
  capsule: {
    id: 'capsule',
    name: '返回舱 Capsule',
    heightFactor: 0.7,
    dryMassKg: 5100,
    shape: 'capsule',
  },
  fairing: {
    id: 'fairing',
    name: '可调整流罩 Fairing',
    heightFactor: 1.15,
    dryMassKg: 3600,
    shape: 'fairing',
  },
};

export const STAGE_PRESETS = {
  cylinder_std: {
    id: 'cylinder_std',
    name: '标准圆柱级段',
    structuralDensity: 42, // kg per m³ of envelope (simplified dry structure)
    tankVolumeFactor: 0.72,
  },
  cylinder_heavy: {
    id: 'cylinder_heavy',
    name: '加强级段',
    structuralDensity: 58,
    tankVolumeFactor: 0.68,
  },
  cylinder_light: {
    id: 'cylinder_light',
    name: '轻质级段',
    structuralDensity: 28,
    tankVolumeFactor: 0.78,
  },
  cylinder_sf: {
    id: 'cylinder_sf',
    name: '科幻装甲级段',
    structuralDensity: 48,
    tankVolumeFactor: 0.65,
  },
};

/** Propellant bulk density approx (CH4+LOX mixture average), kg/m³ */
export const PROPELLANT_DENSITY = 850;

export const ENGINE_PRESETS = {
  raptor_sl: {
    id: 'raptor_sl',
    name: 'Raptor SL',
    thrustN: 2.3e6,
    ispSec: 330,
    dryMassKg: 1600,
    nozzleScale: 1.0,
    style: 'raptor',
  },
  raptor_vac: {
    id: 'raptor_vac',
    name: 'Raptor Vacuum',
    thrustN: 2.5e6,
    ispSec: 380,
    dryMassKg: 1800,
    nozzleScale: 1.35,
    style: 'raptor',
  },
  merlin: {
    id: 'merlin',
    name: 'Merlin-like',
    thrustN: 9.0e5,
    ispSec: 282,
    dryMassKg: 470,
    nozzleScale: 0.75,
    style: 'merlin',
  },
  ion_sf: {
    id: 'ion_sf',
    name: '科幻离子簇',
    thrustN: 1.2e5,
    ispSec: 4200,
    dryMassKg: 900,
    nozzleScale: 0.55,
    style: 'ion',
  },
  plasma_sf: {
    id: 'plasma_sf',
    name: '等离子喷口',
    thrustN: 1.8e6,
    ispSec: 450,
    dryMassKg: 2100,
    nozzleScale: 1.1,
    style: 'plasma',
  },
  heavy_booster: {
    id: 'heavy_booster',
    name: '重型助推发动机',
    thrustN: 2.4e6,
    ispSec: 327,
    dryMassKg: 1700,
    nozzleScale: 1.05,
    style: 'raptor',
  },
};

export const WING_PRESETS = {
  flap_fwd: {
    id: 'flap_fwd',
    name: '前襟翼',
    dryMassKg: 800,
    span: 3.2,
    chord: 4.5,
  },
  flap_aft: {
    id: 'flap_aft',
    name: '后襟翼',
    dryMassKg: 1200,
    span: 4.5,
    chord: 6.5,
  },
  delta_sf: {
    id: 'delta_sf',
    name: '三角翼',
    dryMassKg: 1600,
    span: 6.0,
    chord: 8.0,
  },
  fin_grid: {
    id: 'fin_grid',
    name: '格栅舵',
    dryMassKg: 650,
    span: 2.8,
    chord: 2.8,
  },
  canard: {
    id: 'canard',
    name: '鸭翼',
    dryMassKg: 400,
    span: 2.2,
    chord: 2.0,
  },
};

export const DECOR_PRESETS = {
  ring_weld: {
    id: 'ring_weld',
    name: '环缝',
    dryMassKg: 80,
  },
  ring_armor: {
    id: 'ring_armor',
    name: '装甲环',
    dryMassKg: 220,
  },
  ring_glow: {
    id: 'ring_glow',
    name: '发光环',
    dryMassKg: 120,
  },
  vent_band: {
    id: 'vent_band',
    name: '排气带',
    dryMassKg: 150,
  },
  antenna: {
    id: 'antenna',
    name: '天线阵列',
    dryMassKg: 90,
  },
};

export const SIDE_BOOSTER_PRESETS = {
  strap_std: {
    id: 'strap_std',
    name: '标准侧助推',
    structuralDensity: 40,
    tankVolumeFactor: 0.7,
  },
  strap_sf: {
    id: 'strap_sf',
    name: '科幻侧助推',
    structuralDensity: 36,
    tankVolumeFactor: 0.74,
  },
};

export function defaultUv() {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    repeatX: 1,
    repeatY: 1,
    tile: true,
  };
}

export function defaultMaterial(color = '#d8dde5', type = 'metal') {
  return { type, color };
}

export function createPartId(prefix = 'part') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
