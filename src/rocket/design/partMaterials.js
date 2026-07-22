/**
 * Unified PBR material language for craft parts (VAB + flight mesh).
 * Stainless / carbon / ceramic tile / emissive armor / nozzle copper —
 * shared look so DIY rockets read as one product, not random primitives.
 */

import * as THREE from 'three';

/** Semantic material families used by craftMesh + ghost previews. */
export const PART_MATERIAL_LANG = {
  stainless: {
    color: 0xd8dde5,
    metalness: 0.9,
    roughness: 0.2,
    envMapIntensity: 1.65,
  },
  stainlessDark: {
    color: 0x868d98,
    metalness: 0.86,
    roughness: 0.36,
    envMapIntensity: 1.3,
  },
  stainlessBright: {
    color: 0xf2f6fa,
    metalness: 0.94,
    roughness: 0.12,
    envMapIntensity: 1.9,
  },
  brushed: {
    color: 0xc4cace,
    metalness: 0.86,
    roughness: 0.44,
    envMapIntensity: 1.35,
  },
  carbon: {
    color: 0x121418,
    metalness: 0.4,
    roughness: 0.56,
    envMapIntensity: 0.9,
  },
  ceramic: {
    color: 0x1c1e24,
    metalness: 0.08,
    roughness: 0.88,
    envMapIntensity: 0.55,
  },
  ceramicWarm: {
    color: 0x3a342c,
    metalness: 0.35,
    roughness: 0.58,
    envMapIntensity: 0.7,
  },
  matte: {
    color: 0x2a2e36,
    metalness: 0.1,
    roughness: 0.82,
    envMapIntensity: 0.65,
  },
  nozzle: {
    color: 0x3a3f48,
    metalness: 0.9,
    roughness: 0.28,
    envMapIntensity: 1.35,
  },
  copper: {
    color: 0xb87333,
    metalness: 0.93,
    roughness: 0.3,
    envMapIntensity: 1.5,
  },
  accent: {
    color: 0x1e222a,
    metalness: 0.62,
    roughness: 0.42,
    envMapIntensity: 1.0,
  },
  emissive: {
    color: 0x8aa0d0,
    metalness: 0.4,
    roughness: 0.38,
    envMapIntensity: 1.1,
    emissive: 0x2266ff,
    emissiveIntensity: 0.55,
  },
  emissiveWarm: {
    color: 0xff8844,
    metalness: 0.35,
    roughness: 0.4,
    envMapIntensity: 1.0,
    emissive: 0xff6622,
    emissiveIntensity: 0.5,
  },
  fuel: {
    color: 0x1a6a9e,
    metalness: 0.12,
    roughness: 0.48,
    envMapIntensity: 0.6,
    emissive: 0x0a3050,
    emissiveIntensity: 0.14,
    transparent: true,
    opacity: 0.5,
  },
};

/** Map legacy design material.type → language key */
export const LEGACY_TYPE_MAP = {
  metal: 'stainless',
  matte: 'matte',
  ceramic: 'ceramic',
  emissive: 'emissive',
};

let _brushedTex = null;
let _tileTex = null;
let _panelTex = null;

function canvasTex(draw, size = 256) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Subtle circumferential brush streaks for stainless barrels. */
export function getBrushedTexture() {
  if (_brushedTex) return _brushedTex;
  _brushedTex = canvasTex((ctx, s) => {
    ctx.fillStyle = '#c8cdd4';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      const a = 0.04 + (y % 7) * 0.008;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, y, s, 1);
      ctx.fillStyle = `rgba(0,0,0,${a * 0.7})`;
      ctx.fillRect(0, y + 1, s, 1);
    }
    // sparse vertical panel seams
    for (let i = 0; i < 8; i++) {
      const x = ((i + 0.5) / 8) * s;
      ctx.fillStyle = 'rgba(40,48,58,0.18)';
      ctx.fillRect(x, 0, 1.2, s);
    }
  }, 512);
  if (_brushedTex) {
    _brushedTex.repeat.set(4, 6);
  }
  return _brushedTex;
}

/** Hex-ish heat-tile noise for ceramic surfaces. */
export function getTileTexture() {
  if (_tileTex) return _tileTex;
  _tileTex = canvasTex((ctx, s) => {
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, s, s);
    const cell = 18;
    for (let y = 0; y < s; y += cell) {
      const offset = (Math.floor(y / cell) % 2) * (cell * 0.5);
      for (let x = -cell; x < s + cell; x += cell) {
        const j = ((x * 13 + y * 7) % 40) / 40;
        const g = 18 + Math.floor(j * 22);
        ctx.fillStyle = `rgb(${g},${g + 2},${g + 6})`;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        const px = x + offset;
        ctx.beginPath();
        ctx.roundRect?.(px + 1, y + 1, cell - 2, cell - 2, 2);
        if (!ctx.roundRect) {
          ctx.rect(px + 1, y + 1, cell - 2, cell - 2);
        }
        ctx.fill();
        ctx.stroke();
      }
    }
  }, 256);
  if (_tileTex) _tileTex.repeat.set(3, 4);
  return _tileTex;
}

/** Soft panel grid for SF armor. */
export function getPanelTexture() {
  if (_panelTex) return _panelTex;
  _panelTex = canvasTex((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#6a7a98');
    g.addColorStop(0.5, '#8aa0c8');
    g.addColorStop(1, '#5a6a88');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(120,180,255,0.35)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let i = 0; i <= s; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(100,160,255,0.12)';
    for (let i = 0; i < 12; i++) {
      const x = (i * 53) % s;
      const y = (i * 97) % s;
      ctx.fillRect(x, y, 14, 6);
    }
  }, 256);
  if (_panelTex) _panelTex.repeat.set(2, 4);
  return _panelTex;
}

function parseColor(hex, fallback = 0xd8dde5) {
  try {
    return new THREE.Color(hex ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/**
 * Create a MeshStandardMaterial from language key or legacy matDef.
 * @param {string | { type?: string, color?: string }} matDef
 * @param {THREE.Texture | null} [texture]
 * @param {{ language?: string, mapKind?: 'brushed'|'tile'|'panel'|null }} [opts]
 */
export function createPartMaterial(matDef, texture = null, opts = {}) {
  let langKey = opts.language || null;
  let colorOverride = null;

  if (typeof matDef === 'string') {
    langKey = matDef;
  } else if (matDef && typeof matDef === 'object') {
    langKey = langKey || LEGACY_TYPE_MAP[matDef.type] || matDef.type || 'stainless';
    if (matDef.color) colorOverride = matDef.color;
  }
  langKey = langKey || 'stainless';
  // Allow direct language keys
  if (!PART_MATERIAL_LANG[langKey] && LEGACY_TYPE_MAP[langKey]) {
    langKey = LEGACY_TYPE_MAP[langKey];
  }
  const preset = PART_MATERIAL_LANG[langKey] || PART_MATERIAL_LANG.stainless;

  const mat = new THREE.MeshStandardMaterial({
    color: colorOverride != null ? parseColor(colorOverride, preset.color) : new THREE.Color(preset.color),
    metalness: preset.metalness,
    roughness: preset.roughness,
    envMapIntensity: preset.envMapIntensity ?? 1,
    emissive: new THREE.Color(preset.emissive || 0x000000),
    emissiveIntensity: preset.emissiveIntensity || 0,
    transparent: !!preset.transparent,
    opacity: preset.opacity ?? 1,
  });

  const mapKind = opts.mapKind;
  let map = texture;
  if (!map && mapKind === 'brushed' && (langKey === 'stainless' || langKey === 'brushed' || langKey === 'stainlessDark')) {
    map = getBrushedTexture()?.clone?.() || getBrushedTexture();
  } else if (!map && mapKind === 'tile' && (langKey === 'ceramic' || langKey === 'ceramicWarm')) {
    map = getTileTexture()?.clone?.() || getTileTexture();
  } else if (!map && mapKind === 'panel' && langKey === 'emissive') {
    map = getPanelTexture()?.clone?.() || getPanelTexture();
  }
  if (map) {
    // Avoid mutating shared repeat when clone failed
    if (map !== texture && map.isTexture && mapKind) {
      try {
        map = map.clone();
        map.needsUpdate = true;
        if (mapKind === 'brushed') map.repeat.set(4, 6);
        if (mapKind === 'tile') map.repeat.set(3, 4);
        if (mapKind === 'panel') map.repeat.set(2, 4);
      } catch {
        /* shared ok */
      }
    }
    mat.map = map;
    mat.needsUpdate = true;
  }

  return mat;
}

/**
 * Shared material kit (clones on use if you need unique colors).
 * Prefer createPartMaterial for per-part colors.
 */
export function createPartMaterialKit() {
  return {
    stainless: createPartMaterial('stainless', null, { mapKind: 'brushed' }),
    stainlessDark: createPartMaterial('stainlessDark'),
    stainlessBright: createPartMaterial('stainlessBright'),
    brushed: createPartMaterial('brushed', null, { mapKind: 'brushed' }),
    carbon: createPartMaterial('carbon'),
    ceramic: createPartMaterial('ceramic', null, { mapKind: 'tile' }),
    ceramicWarm: createPartMaterial('ceramicWarm', null, { mapKind: 'tile' }),
    matte: createPartMaterial('matte'),
    nozzle: createPartMaterial('nozzle'),
    copper: createPartMaterial('copper'),
    accent: createPartMaterial('accent'),
    emissive: createPartMaterial('emissive', null, { mapKind: 'panel' }),
    fuel: createPartMaterial('fuel'),
  };
}

/**
 * Ghost / snap-marker materials (additive-friendly, depthWrite off).
 */
export function createGhostMaterials({ valid = true, dim = false } = {}) {
  const fill = valid
    ? dim
      ? 0x5a9e4a
      : 0x7ed957
    : dim
      ? 0x4a7a98
      : 0x6ec8f0;
  const edge = valid ? (dim ? 0xa8e063 : 0xe8ffc8) : dim ? 0x90caf9 : 0xd0f0ff;
  const opacity = dim ? 0.18 : valid ? 0.38 : 0.28;
  const solid = new THREE.MeshStandardMaterial({
    color: fill,
    metalness: 0.15,
    roughness: 0.35,
    transparent: true,
    opacity,
    depthWrite: false,
    emissive: new THREE.Color(fill),
    emissiveIntensity: valid ? 0.35 : 0.22,
    side: THREE.DoubleSide,
  });
  const wire = new THREE.MeshBasicMaterial({
    color: edge,
    transparent: true,
    opacity: dim ? 0.4 : 0.75,
    wireframe: true,
    depthWrite: false,
  });
  const glow = new THREE.MeshBasicMaterial({
    color: fill,
    transparent: true,
    opacity: dim ? 0.12 : 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return { solid, wire, glow, fill, edge };
}

/**
 * Snap node ball materials — cinematic magnet orbs.
 */
export function createSnapNodeMaterials(hover = false) {
  const color = hover ? 0xd4ff8a : 0x8fd94a;
  const core = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.25,
    emissive: new THREE.Color(color),
    emissiveIntensity: hover ? 0.95 : 0.55,
    transparent: true,
    opacity: 0.92,
  });
  const halo = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: hover ? 0.28 : 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.MeshBasicMaterial({
    color: hover ? 0xf0ffd0 : 0xb8f070,
    transparent: true,
    opacity: hover ? 0.9 : 0.65,
    depthWrite: false,
  });
  return { core, halo, ring, color };
}
