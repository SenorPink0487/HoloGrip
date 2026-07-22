/**
 * KSP-style part-by-part craft mesh assembly.
 * Each craft-graph part becomes its own Object3D with distinct geometry —
 * stacking tanks, changing height/diameter/preset must be visually obvious.
 */

import * as THREE from 'three';
import {
  ENGINE_PRESETS,
  NOSE_PRESETS,
  WING_PRESETS,
  DECOR_PRESETS,
} from './partsLibrary.js';
import { getPartDef } from './partDefs.js';
import {
  asCraft,
  getPart,
  listChildren,
  normalizeCraft,
} from './craftGraph.js';
import {
  walkStackChain,
  splitStagesFromChain,
  asStageDesign,
} from './compileFlight.js';
import { calculateRocketPerformance } from './performance.js';
import { applyUvToTexture } from './texturePipeline.js';
import { OLM_DECK_HEIGHT } from '../scene/environment.js';
import { createPartMaterial } from './partMaterials.js';

function disposeTree(root) {
  if (!root) return;
  root.traverse((obj) => {
    obj.geometry?.dispose?.();
    const mats = obj.material
      ? Array.isArray(obj.material)
        ? obj.material
        : [obj.material]
      : [];
    for (const m of mats) {
      if (!m) continue;
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture) v.dispose?.();
      }
      m.dispose?.();
    }
  });
}

/** Engine mount layout (mirrors generator.computeEnginePositions). */
export function computeEnginePositions(engines, radius) {
  const count = Math.max(0, engines?.count || 0);
  const layout = engines?.layout || 'ring';
  const positions = [];
  const R = Math.max(0.5, radius);
  const maxR = Math.max(0.15, R * 0.82);
  if (count === 0) return positions;

  if (layout === 'superheavy' && count >= 20) {
    const rings = [
      { n: Math.min(3, count), r: Math.min(maxR, R * 0.2) },
      { n: Math.min(10, Math.max(0, count - 3)), r: Math.min(maxR, R * 0.49) },
      { n: Math.max(0, count - 13), r: Math.min(maxR, R * 0.78) },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2;
        positions.push({ x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r, s: R / 4.5 });
      }
    }
  } else if (layout === 'starship') {
    const inner = Math.min(3, count);
    const rIn = Math.min(maxR, R * 0.244);
    const rOut = Math.min(maxR, R * 0.578);
    for (let i = 0; i < inner; i++) {
      const a = (i / inner) * Math.PI * 2 + Math.PI / 6;
      positions.push({ x: Math.sin(a) * rIn, z: Math.cos(a) * rIn, s: R / 4.5 });
    }
    const outer = count - inner;
    for (let i = 0; i < outer; i++) {
      const a = (i / Math.max(1, outer)) * Math.PI * 2;
      positions.push({
        x: Math.sin(a) * rOut,
        z: Math.cos(a) * rOut,
        s: (R / 4.5) * 1.15,
      });
    }
  } else if (layout === 'cluster') {
    const cols = Math.ceil(Math.sqrt(count));
    const spacing = Math.min(R * 0.35, (maxR * 2) / Math.max(1, cols));
    let placed = 0;
    for (let row = 0; placed < count; row++) {
      for (let col = 0; col < cols && placed < count; col++) {
        let x = (col - (cols - 1) / 2) * spacing;
        let z = (row - (cols - 1) / 2) * spacing;
        const dist = Math.hypot(x, z);
        if (dist > maxR && dist > 1e-6) {
          const k = maxR / dist;
          x *= k;
          z *= k;
        }
        positions.push({ x, z, s: (R / 4.5) * 0.9 });
        placed++;
      }
    }
  } else {
    const r = Math.min(R * 0.72, maxR);
    if (count === 1) {
      positions.push({ x: 0, z: 0, s: (R / 4.5) * 1.1 });
    } else {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        positions.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: R / 4.5 });
      }
    }
  }
  return positions;
}

function makeMaterial(matDef, texture = null, opts = {}) {
  return createPartMaterial(matDef || { type: 'metal', color: '#d8dde5' }, texture, opts);
}

function loadTextureFromDesign(design, textureId, uv, textureCache) {
  if (!textureId || !design.textures?.[textureId]) return null;
  if (textureCache.has(textureId)) {
    const base = textureCache.get(textureId);
    const cloned = base.clone();
    applyUvToTexture(cloned, uv);
    return cloned;
  }
  const asset = design.textures[textureId];
  if (!asset?.dataUrl || typeof document === 'undefined') return null;
  try {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(asset.dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    applyUvToTexture(tex, uv);
    textureCache.set(textureId, tex);
    return tex;
  } catch {
    return null;
  }
}

/** Tank style skin by defId — four clearly different product looks */
function tankSkin(defId, material) {
  const base = material || { type: 'metal', color: '#d8dde5' };
  const skins = {
    tank_heavy: { type: 'metal', color: '#8a929c' },
    tank_light: { type: 'metal', color: '#f2f5fa' },
    tank_sf: { type: 'emissive', color: '#7a94c8' },
    tank_std: { type: 'metal', color: '#d4dae4' },
  };
  const skin = skins[defId] || skins.tank_std;
  return {
    type: base.type === 'matte' ? 'matte' : base.type === 'ceramic' ? 'ceramic' : skin.type,
    color: base.color && base.color !== '#d8dde5' && base.color !== '#d4dae4' ? base.color : skin.color,
  };
}

function tankRingProfile(defId) {
  if (defId?.includes('heavy')) return { spacing: 2.6, majorEvery: 2, majorR: 0.12, minorR: 0.055 };
  if (defId?.includes('light')) return { spacing: 7.2, majorEvery: 4, majorR: 0.028, minorR: 0.014 };
  if (defId?.includes('sf')) return { spacing: 3.2, majorEvery: 1, majorR: 0.07, minorR: 0.045, glow: true };
  return { spacing: 4.0, majorEvery: 3, majorR: 0.055, minorR: 0.024 };
}

/** Distinct product badges / color bands so tank types read at a glance */
function addTankProductDetails(g, defId, H, R) {
  const isHeavy = defId?.includes('heavy');
  const isLight = defId?.includes('light');
  const isSf = defId?.includes('sf');

  // Mid-barrel identity stripe
  const bandColor = isHeavy ? '#2a2e34' : isLight ? '#5a9fd4' : isSf ? '#4488ff' : '#c45c26';
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.04, R + 0.04, isHeavy ? 2.4 : 1.4, 48, 1, true),
    makeMaterial(
      { type: isSf ? 'emissive' : 'matte', color: bandColor },
      null,
      { language: isSf ? 'emissive' : 'matte' }
    )
  );
  band.position.y = H * (isHeavy ? 0.55 : 0.48);
  band.userData.isHull = true;
  g.add(band);

  // Secondary thin stripe
  const band2 = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.35, 40, 1, true),
    makeMaterial({ type: 'metal', color: isLight ? '#ffffff' : '#e8ecf0' }, null, {
      language: 'stainlessBright',
    })
  );
  band2.position.y = H * 0.62;
  g.add(band2);

  if (isHeavy) {
    // Intertank black belt + grid of access ports
    const inter = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.06, R + 0.06, H * 0.12, 40, 1, true),
      makeMaterial({ type: 'matte', color: '#12151a' }, null, { language: 'carbon' })
    );
    inter.position.y = H * 0.28;
    g.add(inter);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const port = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10),
        makeMaterial({ type: 'metal', color: '#3a4048' }, null, { language: 'stainlessDark' })
      );
      port.rotation.z = Math.PI / 2;
      port.position.set(Math.sin(a) * (R + 0.1), H * 0.28, Math.cos(a) * (R + 0.1));
      g.add(port);
    }
  }

  if (isLight) {
    // Slim stringer-free look: only two bright long welds
    const weld = makeMaterial({ type: 'metal', color: '#ffffff' }, null, { language: 'stainlessBright' });
    for (const a of [0.2, Math.PI + 0.2]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.95, 0.04), weld);
      line.position.set(Math.sin(a) * (R + 0.03), H / 2, Math.cos(a) * (R + 0.03));
      g.add(line);
    }
  }

  if (isSf) {
    // Glowing panel plates
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.15;
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, H * 0.18, 0.08),
        makeMaterial({ type: 'emissive', color: '#66aaff' })
      );
      plate.position.set(Math.sin(a) * (R + 0.08), H * (0.25 + (i % 3) * 0.22), Math.cos(a) * (R + 0.08));
      plate.rotation.y = a;
      g.add(plate);
    }
  }

  if (!isHeavy && !isLight && !isSf) {
    // Standard: LOX / CH4 twin-tone hint rings
    const lox = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.05, 0.06, 6, 36),
      makeMaterial({ type: 'matte', color: '#3d7ea6' }, null, { language: 'matte' })
    );
    lox.rotation.x = Math.PI / 2;
    lox.position.y = H * 0.72;
    g.add(lox);
    const ch4 = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.05, 0.06, 6, 36),
      makeMaterial({ type: 'matte', color: '#8b3a2a' }, null, { language: 'matte' })
    );
    ch4.rotation.x = Math.PI / 2;
    ch4.position.y = H * 0.22;
    g.add(ch4);
  }
}

/**
 * Build one tank barrel: closed cylinder, rings, raceways, optional fuel core.
 * Local space: bottom at y=0, top at y=H.
 */
function buildTankPart(part, def, design, textureCache) {
  const g = new THREE.Group();
  g.name = 'PartTank';
  const H = Math.max(2, part.params?.height || def.defaultParams?.height || 40);
  const D = Math.max(1, part.params?.diameter || def.defaultParams?.diameter || 9);
  const R = D / 2;
  const fill = Math.min(1, Math.max(0, part.params?.fuelFill ?? 0.9));
  const skin = tankSkin(def.id, part.params?.material);
  const tex = loadTextureFromDesign(design, part.params?.textureId, part.params?.uv, textureCache);
  const isSf = def.id?.includes('sf');
  const isHeavy = def.id?.includes('heavy');
  const isLight = def.id?.includes('light');
  const mapKind = tex ? null : isSf ? 'panel' : skin.type === 'ceramic' ? 'tile' : 'brushed';
  const bodyMat = makeMaterial(skin, tex, { mapKind });
  bodyMat.side = THREE.DoubleSide;

  // Closed barrel
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 56, 1, false), bodyMat);
  body.position.y = H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isHull = true;
  body.userData.structureRole = 'hull';
  body.userData.partId = part.id;
  g.add(body);

  // Longitudinal stringers (heavy / sf / standard get fewer)
  const strutCount = isSf ? 14 : isHeavy ? 10 : isLight ? 0 : 6;
  if (strutCount > 0) {
    const strutMat = makeMaterial(
      {
        type: isSf ? 'emissive' : 'metal',
        color: isSf ? '#6a90ff' : '#8a9098',
      },
      null,
      { language: isSf ? 'emissive' : 'stainlessDark' }
    );
    if (isSf) {
      strutMat.emissive = new THREE.Color(0x2244aa);
      strutMat.emissiveIntensity = 0.4;
    }
    for (let i = 0; i < strutCount; i++) {
      const a = (i / strutCount) * Math.PI * 2;
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(isHeavy ? 0.16 : 0.1, H * 0.97, isHeavy ? 0.1 : 0.07),
        strutMat
      );
      strut.position.set(Math.sin(a) * (R + 0.05), H / 2, Math.cos(a) * (R + 0.05));
      strut.userData.isHull = true;
      strut.userData.structureRole = 'hull';
      g.add(strut);
    }
  }

  // Cable raceway trays (Starship-like longitudinal trunk)
  const raceMat = makeMaterial({ type: 'matte', color: '#1a1e26' }, null, { language: 'accent' });
  for (const a of [0.35, Math.PI + 0.55]) {
    const race = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, H * 0.88, 0.22),
      raceMat
    );
    race.position.set(Math.sin(a) * (R + 0.14), H / 2, Math.cos(a) * (R + 0.14));
    race.userData.isHull = true;
    g.add(race);
    // COPV bottles along raceway
    const copvMat = makeMaterial({ type: 'metal', color: '#c8d0d8' }, null, { language: 'stainlessBright' });
    for (let k = 0; k < 3; k++) {
      const copv = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), copvMat);
      copv.scale.set(1, 1.35, 1);
      copv.position.set(
        Math.sin(a) * (R + 0.42),
        H * (0.22 + k * 0.28),
        Math.cos(a) * (R + 0.42)
      );
      copv.userData.isHull = true;
      g.add(copv);
    }
  }

  // Weld / band rings
  const prof = tankRingProfile(def.id);
  const rings = Math.max(2, Math.round(H / prof.spacing));
  const ringMat = makeMaterial(
    {
      type: prof.glow ? 'emissive' : 'metal',
      color: prof.glow ? '#66aaff' : '#f0f4f8',
    },
    null,
    { language: prof.glow ? 'emissive' : 'stainlessBright' }
  );
  for (let i = 0; i <= rings; i++) {
    const y = (i / rings) * H;
    const major = i % prof.majorEvery === 0;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.035, major ? prof.majorR : prof.minorR, 8, 48),
      ringMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.userData.isHull = true;
    ring.userData.structureRole = 'hull';
    g.add(ring);
  }

  // Common dome caps (visual stack interfaces)
  const domeMat = makeMaterial({ type: 'metal', color: '#b8c0c8' }, null, { language: 'brushed' });
  for (const [y, flip] of [
    [0.02, 1],
    [H - 0.02, -1],
  ]) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.98, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.22),
      domeMat
    );
    dome.position.y = y;
    dome.scale.y = flip;
    dome.userData.isHull = true;
    g.add(dome);
  }

  // Fuel core (hidden in solid view; present for xray)
  if (fill > 0.02) {
    const fuelH = Math.max(0.4, H * fill * 0.9);
    const fuelMat = makeMaterial('fuel');
    const fuel = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.78, R * 0.78, fuelH, 28),
      fuelMat
    );
    fuel.position.y = fuelH / 2 + H * 0.04;
    fuel.name = 'FuelCore';
    fuel.userData.isInternal = true;
    fuel.userData.structureRole = 'fuel';
    fuel.userData.partId = part.id;
    fuel.visible = false;
    g.add(fuel);
  }

  // Stack rims
  const rimMat = makeMaterial({ type: 'metal', color: '#9aa3ad' }, null, { language: 'stainlessDark' });
  for (const y of [0.06, H - 0.06]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.94, 0.09, 8, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    rim.userData.isHull = true;
    g.add(rim);
  }

  // Product-identity details (std / heavy / light / sf)
  addTankProductDetails(g, def.id, H, R);

  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'tank';
  g.userData.height = H;
  g.userData.radius = R;
  g.userData.diameter = D;
  g.userData.isHull = true;
  g.userData.structureRole = 'hull';
  g.userData.nodes = {
    top: new THREE.Vector3(0, H, 0),
    bottom: new THREE.Vector3(0, 0, 0),
    radial: new THREE.Vector3(R, H * 0.5, 0),
  };
  return g;
}

function buildDecouplerPart(part, def) {
  const g = new THREE.Group();
  g.name = 'PartDecoupler';
  const H = Math.max(0.6, part.params?.height || 1.2);
  const D = Math.max(1.5, part.params?.diameter || 9);
  const R = D / 2;
  const mat = makeMaterial({ type: 'metal', color: '#6d737c' }, null, { language: 'stainlessDark' });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, H, 48), mat);
  ring.position.y = H / 2;
  ring.castShadow = true;
  ring.userData.isHull = true;
  ring.userData.structureRole = 'hull';
  g.add(ring);
  // Hot-stage / sep ring glow band
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.05, 0.14, 10, 48),
    makeMaterial({ type: 'emissive', color: '#ff8844' }, null, { language: 'emissiveWarm' })
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = H / 2;
  g.add(band);
  // Inner structural web
  const web = makeMaterial({ type: 'metal', color: '#4a5058' }, null, { language: 'accent' });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(0.32, H * 0.88, 0.1), web);
    petal.position.set(Math.sin(a) * R * 1.01, H / 2, Math.cos(a) * R * 1.01);
    g.add(petal);
  }
  // Clamp flanges top/bottom
  const flangeMat = makeMaterial({ type: 'metal', color: '#c0c8d0' }, null, {
    language: 'stainlessBright',
  });
  for (const y of [0.08, H - 0.08]) {
    const fl = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.07, 8, 40), flangeMat);
    fl.rotation.x = Math.PI / 2;
    fl.position.y = y;
    g.add(fl);
  }
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'decoupler';
  g.userData.height = H;
  g.userData.radius = R;
  g.userData.diameter = D;
  g.userData.nodes = {
    top: new THREE.Vector3(0, H, 0),
    bottom: new THREE.Vector3(0, 0, 0),
  };
  return g;
}

function buildNosePart(part, def, parentRadius, design, textureCache) {
  const g = new THREE.Group();
  g.name = 'PartNose';
  const R = parentRadius || (part.params?.diameter || 9) / 2;
  const preset = NOSE_PRESETS[def.legacyNosePreset || def.id?.replace('nose_', '')] || NOSE_PRESETS.ogive;
  const H = Math.max(1, part.params?.height || R * 2.4 * (preset.heightFactor || 1));
  const tex = loadTextureFromDesign(design, part.params?.textureId, part.params?.uv, textureCache);
  const matDef = part.params?.material || { type: 'metal', color: '#d8dde5' };
  const mat = makeMaterial(matDef, tex, { mapKind: tex ? null : 'brushed' });
  const shape = def.shape || preset.shape || 'ogive';
  const ceramic = makeMaterial({ type: 'ceramic', color: '#1c1e24' }, null, {
    language: 'ceramic',
    mapKind: 'tile',
  });
  const seam = makeMaterial({ type: 'metal', color: '#9aa3ad' }, null, { language: 'stainlessDark' });

  let mesh;
  if (shape === 'cone') {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(R, H, 48), mat);
    mesh.position.y = H / 2;
  } else if (shape === 'blunt') {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      mat
    );
    mesh.scale.y = H / R;
  } else if (shape === 'spike') {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, H, 8), mat);
    mesh.position.y = H / 2;
    // glowing edge rings for sci-fi spike
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R * (1 - t) * 0.95, 0.04, 6, 24),
        makeMaterial({ type: 'emissive', color: '#66aaff' })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = t * H;
      g.add(ring);
    }
  } else if (shape === 'capsule') {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.92, R, H * 0.55, 40), mat);
    cyl.position.y = H * 0.28;
    cyl.castShadow = true;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.92, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      mat
    );
    dome.position.y = H * 0.55;
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.04, R * 0.88, H * 0.14, 40),
      ceramic
    );
    shield.position.y = H * 0.06;
    // window band
    const win = new THREE.Mesh(
      new THREE.TorusGeometry(R * 0.78, 0.08, 8, 32),
      makeMaterial({ type: 'emissive', color: '#88ccff' })
    );
    win.rotation.x = Math.PI / 2;
    win.position.y = H * 0.42;
    g.add(cyl, dome, shield, win);
    mesh = null;
  } else if (shape === 'fairing') {
    // Adjustable payload fairing: cylindrical base + ogive cap, petal seams, clamp
    const barrelH = H * 0.55;
    const capH = H * 0.45;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.01, R * 1.01, barrelH, 48, 1, false),
      mat
    );
    barrel.position.y = barrelH / 2;
    barrel.castShadow = true;
    barrel.userData.isHull = true;
    g.add(barrel);
    // Ogive cap (height-driven)
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const y = t * capH;
      const r = R * 1.01 * Math.sqrt(Math.max(0, 1 - t * t * 0.96));
      pts.push(new THREE.Vector2(r, y));
    }
    const cap = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
    cap.position.y = barrelH;
    cap.castShadow = true;
    g.add(cap);
    // Petal split seams (2-halves fairing look)
    const seamMat = makeMaterial({ type: 'metal', color: '#9aa3ad' }, null, {
      language: 'stainlessDark',
    });
    for (const a of [0, Math.PI]) {
      const seamBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, H * 0.92, 0.1),
        seamMat
      );
      seamBox.position.set(Math.sin(a) * (R + 0.02), H * 0.48, Math.cos(a) * (R + 0.02));
      g.add(seamBox);
    }
    // Horizontal station rings (count scales with height)
    const nRing = Math.max(2, Math.round(H / 5));
    for (let i = 1; i < nRing; i++) {
      const y = (i / nRing) * barrelH;
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(R * 1.02, 0.04, 6, 36),
        seamMat
      );
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      g.add(r);
    }
    // Base clamp / separation ring
    const clamp = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.06, R * 1.04, 0.45, 40),
      makeMaterial({ type: 'metal', color: '#5a6068' }, null, { language: 'stainlessDark' })
    );
    clamp.position.y = 0.22;
    g.add(clamp);
    const clampGlow = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.05, 0.06, 6, 36),
      makeMaterial({ type: 'emissive', color: '#ff9944' }, null, { language: 'emissiveWarm' })
    );
    clampGlow.rotation.x = Math.PI / 2;
    clampGlow.position.y = 0.35;
    g.add(clampGlow);
    mesh = null;
  } else {
    // ogive lathe — smoother contour
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const y = t * H;
      const r = R * Math.sqrt(Math.max(0, 1 - t * t * 0.98));
      pts.push(new THREE.Vector2(r, y));
    }
    mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat);
  }
  if (mesh) {
    mesh.castShadow = true;
    mesh.userData.isHull = true;
    mesh.userData.structureRole = 'hull';
    g.add(mesh);
  }

  // Heat-tile leeward strip on ogive/cone (Starship cue)
  if (shape === 'ogive' || shape === 'cone' || shape === 'blunt') {
    const tile = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.01, R * 0.55, H * 0.72, 24, 1, true, -0.55, 1.1),
      ceramic
    );
    tile.position.y = H * 0.38;
    tile.userData.isHull = true;
    g.add(tile);
  }

  // Base flange / fairing clamp ring (fairing has its own clamp)
  if (shape !== 'fairing') {
    const flange = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.07, 8, 40), seam);
    flange.rotation.x = Math.PI / 2;
    flange.position.y = 0.05;
    g.add(flange);
  }

  g.userData.isNose = true;
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'nose';
  g.userData.height = H;
  g.userData.radius = R;
  g.userData.nodes = { bottom: new THREE.Vector3(0, 0, 0) };
  return g;
}

/**
 * Multi-segment engine bell with copper chamber / turbopump silhouette
 * (inspired by createRaptor, scaled for cluster packing).
 */
function createEngineBell(presetId, scale = 1) {
  const preset = ENGINE_PRESETS[presetId] || ENGINE_PRESETS.raptor_sl;
  // Heavy booster reads as a bulkier, sootier sea-level engine (same family, distinct product)
  const heavyBooster = presetId === 'heavy_booster';
  const s = scale * (preset.nozzleScale || 1) * (heavyBooster ? 1.12 : 1);
  const g = new THREE.Group();
  g.name = 'Engine';
  const style = preset.style || 'raptor';
  const vacuum = presetId?.includes('vac') || (preset.nozzleScale || 1) > 1.2;

  const glowColors = {
    raptor: 0xffaa44,
    merlin: 0xff8833,
    ion: 0x66ccff,
    plasma: 0xcc66ff,
  };

  const nozzleMat = makeMaterial(
    {
      type: 'metal',
      color:
        style === 'merlin'
          ? '#4a4038'
          : style === 'ion'
            ? '#2a4060'
            : style === 'plasma'
              ? '#4a2860'
              : heavyBooster
                ? '#2a2622'
                : '#3a3f48',
    },
    null,
    { language: 'nozzle' }
  );
  const copperMat = makeMaterial({ type: 'metal', color: '#b87333' }, null, { language: 'copper' });
  const steelMat = makeMaterial({ type: 'metal', color: '#a0a8b0' }, null, { language: 'stainlessDark' });
  const brightMat = makeMaterial({ type: 'metal', color: '#e8eef4' }, null, { language: 'stainlessBright' });

  const exitR = vacuum ? 0.72 * s : 0.52 * s;
  const throatR = 0.18 * s;
  const bodyR = 0.36 * s;
  const bellH = vacuum ? 1.85 * s : 1.35 * s;
  const chamberH = 0.42 * s;
  const pumpH = 0.38 * s;

  // Multi-segment regen bell (exit at bottom)
  const segs = vacuum
    ? [
        { top: exitR * 0.72, bot: exitR, h: bellH * 0.42 },
        { top: exitR * 0.42, bot: exitR * 0.72, h: bellH * 0.32 },
        { top: throatR, bot: exitR * 0.42, h: bellH * 0.26 },
      ]
    : [
        { top: exitR * 0.7, bot: exitR, h: bellH * 0.45 },
        { top: throatR * 1.15, bot: exitR * 0.7, h: bellH * 0.55 },
      ];
  let yCursor = 0;
  for (const seg of segs) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(seg.top, seg.bot, seg.h, 22, 1, true),
      nozzleMat
    );
    mesh.position.y = -(yCursor + seg.h / 2);
    mesh.userData.isEngine = true;
    mesh.userData.structureRole = 'engine';
    mesh.castShadow = true;
    g.add(mesh);
    yCursor += seg.h;
  }

  // Inner throat liner (reads depth)
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(throatR * 0.92, exitR * 0.55, bellH * 0.55, 16, 1, true),
    makeMaterial({ type: 'metal', color: '#6a4830' }, null, { language: 'copper' })
  );
  inner.material.side = THREE.BackSide;
  inner.material.metalness = 0.7;
  inner.material.roughness = 0.45;
  inner.position.y = -bellH * 0.35;
  inner.userData.isEngine = true;
  g.add(inner);

  // Copper combustion chamber
  const chamber = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyR * 0.85, throatR * 1.4, chamberH, 20),
    copperMat
  );
  chamber.position.y = chamberH * 0.5;
  chamber.userData.isEngine = true;
  chamber.castShadow = true;
  g.add(chamber);
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const r = THREE.MathUtils.lerp(bodyR * 0.85, throatR * 1.4, t) * 1.03;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012 * s, 6, 20), copperMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = chamberH * (1 - t);
    g.add(ring);
  }

  // Turbopump / powerhead
  const pump = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyR * 0.7, bodyR * 0.88, pumpH * 0.55, 16),
    steelMat
  );
  pump.position.y = chamberH + pumpH * 0.35;
  pump.userData.isEngine = true;
  g.add(pump);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR * 0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    brightMat
  );
  dome.position.y = chamberH + pumpH * 0.55;
  g.add(dome);

  // Offset secondary pump (Raptor signature) / merlin simpler
  if (style === 'raptor' || style === 'merlin') {
    const sidePump = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR * 0.28, bodyR * 0.3, pumpH * 0.45, 12),
      brightMat
    );
    sidePump.position.set(bodyR * 0.55, chamberH + pumpH * 0.25, 0);
    sidePump.rotation.z = 0.35;
    g.add(sidePump);
    // Feed lines
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.38 * s, 6),
        steelMat
      );
      pipe.position.set(
        Math.cos(a) * bodyR * 0.65,
        chamberH + pumpH * 0.1,
        Math.sin(a) * bodyR * 0.65
      );
      pipe.rotation.z = Math.cos(a) * 0.45;
      pipe.rotation.x = Math.sin(a) * 0.45;
      g.add(pipe);
    }
  }

  if (style === 'merlin') {
    // Merlin: simpler powerhead, painted white-ish nozzle mid band, single turbopump
    const midBand = new THREE.Mesh(
      new THREE.CylinderGeometry(exitR * 0.85, exitR * 0.92, 0.2 * s, 16, 1, true),
      makeMaterial({ type: 'matte', color: '#e8e4d8' }, null, { language: 'matte' })
    );
    midBand.position.y = -bellH * 0.45;
    g.add(midBand);
    const pumpStack = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR * 0.55, bodyR * 0.65, pumpH * 0.7, 12),
      steelMat
    );
    pumpStack.position.y = chamberH + pumpH * 0.4;
    g.add(pumpStack);
  }

  if (style === 'ion') {
    // Gridded ion thruster: flat dish + dual grid + blue glow
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85 * s, 0.85 * s, 0.14 * s, 24),
      makeMaterial({ type: 'metal', color: '#3a5068' }, null, { language: 'nozzle' })
    );
    dish.position.y = -0.1 * s;
    dish.userData.isEngine = true;
    g.add(dish);
    for (let i = 0; i < 2; i++) {
      const grid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7 * s, 0.7 * s, 0.04 * s, 20),
        makeMaterial({ type: 'emissive', color: i === 0 ? '#66ccff' : '#88eeff' })
      );
      grid.position.y = -0.28 * s - i * 0.12 * s;
      g.add(grid);
    }
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.78 * s, 0.05 * s, 8, 28),
      makeMaterial({ type: 'emissive', color: '#44aaff' })
    );
    rim.position.y = -0.2 * s;
    g.add(rim);
    // Hide chemical bell slightly by covering — already have multi-seg; add blue sheath
    const sheath = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 * s, 0.65 * s, 0.9 * s, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    sheath.position.y = -0.7 * s;
    g.add(sheath);
  } else if (style === 'plasma') {
    // Plasma: magnetic coils + violet glow core
    for (let i = 0; i < 4; i++) {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.38 * s + i * 0.07 * s, 0.055 * s, 8, 24),
        makeMaterial({ type: 'emissive', color: '#cc66ff' })
      );
      coil.position.y = -0.2 * s - i * 0.22 * s;
      coil.userData.isEngine = true;
      g.add(coil);
    }
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22 * s, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xee88ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    core.position.y = -0.55 * s;
    g.add(core);
  }

  // Gimbal ring + actuators (chemical engines)
  if (style === 'raptor' || style === 'merlin') {
    const gimbal = new THREE.Mesh(
      new THREE.TorusGeometry(bodyR * 0.95, 0.03 * s, 6, 24),
      brightMat
    );
    gimbal.rotation.x = Math.PI / 2;
    gimbal.position.y = chamberH + 0.04 * s;
    g.add(gimbal);
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.3;
      const act = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.42 * s, 6),
        makeMaterial({ type: 'matte', color: '#1e222a' }, null, { language: 'accent' })
      );
      act.position.set(
        Math.cos(a) * bodyR * 0.8,
        chamberH + 0.2 * s,
        Math.sin(a) * bodyR * 0.8
      );
      act.rotation.z = Math.cos(a) * 0.55;
      g.add(act);
    }
  }

  // Exit lip
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(exitR * 0.98, 0.02 * s, 6, 28),
    brightMat
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -bellH + 0.02 * s;
  g.add(lip);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * s, 12, 10),
    new THREE.MeshBasicMaterial({
      color: glowColors[style] || 0xffb060,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  glow.name = 'engineGlow';
  glow.position.y = -bellH * 0.15;
  glow.visible = false;
  g.add(glow);

  // Outer cool sheath
  const plumeLen = 2.8 * s;
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(exitR * 0.72, plumeLen, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: style === 'ion' || style === 'plasma' ? glowColors[style] || 0x66ccff : 0x8ec4ff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  plume.name = 'plume';
  plume.position.y = -bellH - plumeLen * 0.42;
  plume.rotation.x = Math.PI;
  plume.visible = false;
  g.add(plume);

  // Inner warm core jet
  const coreLen = plumeLen * 0.55;
  const corePlume = new THREE.Mesh(
    new THREE.ConeGeometry(exitR * 0.38, coreLen, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: glowColors[style] || 0xffa050,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  corePlume.name = 'plume';
  corePlume.position.y = -bellH - coreLen * 0.38;
  corePlume.rotation.x = Math.PI;
  corePlume.visible = false;
  g.add(corePlume);

  g.userData.preset = presetId;
  g.userData.isEngine = true;
  g.userData.structureRole = 'engine';
  return g;
}

function buildEnginePart(part, def, parentRadius) {
  const g = new THREE.Group();
  g.name = 'PartEngines';
  const preset = def.legacyEnginePreset || def.id?.replace('engine_', '') || 'raptor_sl';
  const count = Math.max(1, part.params?.count || 1);
  const layout = part.params?.layout || 'ring';
  const R = Math.max(0.5, parentRadius || 4.5);
  const positions = computeEnginePositions({ count, layout }, R);
  for (const p of positions) {
    const eng = createEngineBell(preset, p.s);
    eng.position.set(p.x, 0, p.z);
    eng.userData.partId = part.id;
    g.add(eng);
  }
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'engine';
  g.userData.isEngine = true;
  g.userData.engineCount = count;
  g.userData.height = 0;
  g.userData.radius = R;
  return g;
}

function buildAeroPart(part, def, parentRadius) {
  const g = new THREE.Group();
  g.name = 'PartAero';
  const preset = WING_PRESETS[def.legacyWingPreset || def.id?.replace('aero_', '')] || WING_PRESETS.flap_aft;
  const size = part.params?.size || 1;
  const mat = makeMaterial(part.params?.material || { type: 'matte', color: '#2a2e36' }, null, {
    language: 'carbon',
  });
  const gridMat = makeMaterial({ type: 'metal', color: '#22262e' }, null, { language: 'nozzle' });
  const hingeMat = makeMaterial({ type: 'metal', color: '#c8d0d8' }, null, { language: 'stainlessBright' });
  const span = (preset.span || 3) * size;
  const chord = (preset.chord || 4) * size;
  const kind = def.legacyWingPreset || '';

  let mesh;
  if (kind === 'fin_grid') {
    // Titanium-style grid fin: outer frame + dense lattice + root hinge
    const frame = new THREE.Group();
    const thick = 0.1 * size;
    // outer frame
    const outer = new THREE.Mesh(new THREE.BoxGeometry(span, thick, chord), gridMat);
    outer.castShadow = true;
    frame.add(outer);
    // inset lattice
    const cols = 6;
    const rows = 6;
    for (let i = 0; i < cols; i++) {
      const v = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * size, span * 0.88, 0.06 * size),
        gridMat
      );
      v.position.x = (i / (cols - 1) - 0.5) * span * 0.82;
      frame.add(v);
    }
    for (let j = 0; j < rows; j++) {
      const h = new THREE.Mesh(
        new THREE.BoxGeometry(span * 0.88, 0.06 * size, 0.06 * size),
        gridMat
      );
      h.position.z = (j / (rows - 1) - 0.5) * chord * 0.82;
      frame.add(h);
    }
    // diagonal cross for silhouette
    for (const sign of [-1, 1]) {
      const d = new THREE.Mesh(
        new THREE.BoxGeometry(span * 0.9, 0.05 * size, 0.05 * size),
        gridMat
      );
      d.rotation.y = sign * 0.55;
      frame.add(d);
    }
    // hinge knuckle at root
    const knuckle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * size, 0.22 * size, 0.55 * size, 12),
      hingeMat
    );
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.x = -span * 0.42;
    frame.add(knuckle);
    mesh = frame;
  } else if (kind === 'delta_sf') {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span, -chord * 0.12);
    shape.lineTo(span * 0.35, -chord);
    shape.lineTo(0, -chord * 0.5);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.14 * size,
      bevelEnabled: true,
      bevelThickness: 0.03 * size,
      bevelSize: 0.04 * size,
      bevelSegments: 2,
    });
    const deltaMat = makeMaterial({ type: 'emissive', color: '#6a80b0' }, null, {
      language: 'emissive',
      mapKind: 'panel',
    });
    mesh = new THREE.Mesh(geo, deltaMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI / 2;
  } else if (kind === 'canard') {
    const group = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1 * size, chord), mat);
    panel.rotation.z = 0.12;
    group.add(panel);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(span * 0.2, 0.08 * size, chord * 0.35),
      hingeMat
    );
    tip.position.set(span * 0.35, 0.02, -chord * 0.15);
    group.add(tip);
    mesh = group;
  } else {
    // Starship-style flaps: thick root, tapered tip, hinge line
    const group = new THREE.Group();
    const rootW = span * 0.35;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.16 * size, chord),
      mat
    );
    if (kind === 'flap_fwd') panel.scale.z = 0.72;
    group.add(panel);
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * size, 0.12 * size, span * 0.9, 10),
      hingeMat
    );
    hinge.rotation.z = Math.PI / 2;
    hinge.position.z = chord * 0.42;
    group.add(hinge);
    // tip edge cap
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12 * size, 0.14 * size, chord * 0.95),
      makeMaterial({ type: 'metal', color: '#4a5058' }, null, { language: 'stainlessDark' })
    );
    tip.position.x = span * 0.48;
    group.add(tip);
    // root attach pad
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(rootW * 0.5, 0.22 * size, chord * 0.35),
      hingeMat
    );
    pad.position.set(-span * 0.35, 0, 0);
    group.add(pad);
    mesh = group;
  }
  // Root at attach: offset outward along +X
  mesh.position.x = span / 2;
  if (mesh.isMesh) mesh.castShadow = true;
  else {
    mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }
  mesh.userData.partId = part.id;
  g.add(mesh);
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'aero';
  g.userData.wingId = part.id;
  g.userData.height = 0;
  g.userData.radius = parentRadius || 4.5;
  return g;
}

function buildDecorPart(part, def, parentRadius) {
  const g = new THREE.Group();
  g.name = 'PartDecor';
  const preset = DECOR_PRESETS[def.legacyDecorPreset || def.id?.replace('decor_', '')] || DECOR_PRESETS.ring_weld;
  const R = parentRadius || 4.5;
  const id = preset.id || '';
  if (id === 'ring_glow') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.08, 0.08, 8, 40),
      makeMaterial({ type: 'emissive', color: '#4488ff' })
    );
    ring.material.emissive = new THREE.Color(0x2266ff);
    ring.material.emissiveIntensity = 0.85;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (id === 'antenna') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
        makeMaterial({ type: 'metal', color: '#c0c8d0' })
      );
      ant.position.set(Math.sin(a) * 0.3, 1.2, Math.cos(a) * 0.3);
      g.add(ant);
    }
  } else if (id === 'vent_band') {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.55, 32, 1, true),
      makeMaterial({ type: 'matte', color: '#1a1e24' })
    );
    g.add(band);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.2, 0.15),
        makeMaterial({ type: 'metal', color: '#444' })
      );
      vent.position.set(Math.sin(a) * (R + 0.12), 0, Math.cos(a) * (R + 0.12));
      g.add(vent);
    }
  } else if (id === 'ring_armor') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.05, 0.14, 6, 36),
      makeMaterial({ type: 'metal', color: '#5a6068' })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.02, 0.035, 6, 36),
      makeMaterial({ type: 'metal', color: '#e8eef4' })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'decor';
  g.userData.height = 0;
  g.userData.radius = R;
  return g;
}

function buildUtilityPart(part, def, parentRadius) {
  const g = new THREE.Group();
  g.name = 'PartUtility';
  const R = parentRadius || 4.5;
  if (def.id === 'util_battery') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.5),
      makeMaterial({ type: 'emissive', color: '#f0d060' })
    );
    box.material.emissive = new THREE.Color(0xaa8800);
    box.material.emissiveIntensity = 0.35;
    box.position.x = 0.7;
    box.userData.structureRole = 'other';
    g.add(box);
  } else {
    // monoprop tank
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 1.6, 16),
      makeMaterial({ type: 'metal', color: '#c090ff' })
    );
    cyl.position.x = 0.9;
    cyl.rotation.z = Math.PI / 2;
    g.add(cyl);
  }
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'utility';
  g.userData.height = 0;
  g.userData.radius = R;
  return g;
}

function buildSidePart(part, def, design, textureCache) {
  const g = new THREE.Group();
  g.name = 'SideBooster';
  const H = Math.max(4, part.params?.height || 55);
  const D = Math.max(1, part.params?.diameter || 3.6);
  const R = D / 2;
  const isSf = def.id?.includes('sf');
  const tex = loadTextureFromDesign(design, part.params?.textureId, part.params?.uv, textureCache);
  const mat = makeMaterial(
    part.params?.material || {
      type: isSf ? 'emissive' : 'metal',
      color: isSf ? '#a0b0d0' : '#c8cdd4',
    },
    tex,
    { mapKind: tex ? null : isSf ? 'panel' : 'brushed' }
  );
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 36, 1, false), mat);
  body.position.y = H / 2;
  body.castShadow = true;
  body.userData.isHull = true;
  body.userData.structureRole = 'hull';
  g.add(body);
  // Weld rings
  const ringMat = makeMaterial({ type: 'metal', color: '#e8eef4' }, null, {
    language: 'stainlessBright',
  });
  const ringN = Math.max(3, Math.round(H / 8));
  for (let i = 0; i <= ringN; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.02, 0.03, 6, 28),
      ringMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = (i / ringN) * H;
    g.add(ring);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.9, 28), mat);
  nose.position.y = H + R * 0.95;
  nose.castShadow = true;
  nose.userData.isHull = true;
  g.add(nose);
  // Intertank stringers
  const strutMat = makeMaterial({ type: 'metal', color: '#888' }, null, { language: 'stainlessDark' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, H * 0.92, 0.06), strutMat);
    strut.position.set(Math.sin(a) * (R + 0.04), H / 2, Math.cos(a) * (R + 0.04));
    g.add(strut);
  }
  // Strap-on attach truss — clear product silhouette facing core (-X)
  const trussMat = makeMaterial({ type: 'metal', color: '#555b64' }, null, { language: 'accent' });
  const strapMat = makeMaterial({ type: 'matte', color: '#c8a010' }, null, { language: 'matte' });
  const hazardMat = makeMaterial({ type: 'matte', color: '#1a1a1a' }, null, { language: 'matte' });
  // Main longeron
  const truss = new THREE.Mesh(new THREE.BoxGeometry(0.5, H * 0.62, 0.32), trussMat);
  truss.position.set(-R - 0.22, H * 0.42, 0);
  truss.castShadow = true;
  g.add(truss);
  // Cross braces
  for (const yf of [0.22, 0.4, 0.58, 0.75]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.16), trussMat);
    arm.position.set(-R - 0.65, H * yf, 0);
    g.add(arm);
    // yellow strap band around booster at attach height
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.08, 0.07, 6, 28),
      yf > 0.5 ? strapMat : hazardMat
    );
    strap.rotation.x = Math.PI / 2;
    strap.position.y = H * yf;
    g.add(strap);
  }
  // Separation thruster stubs (visible product cue)
  for (const z of [-0.55, 0.55]) {
    const sep = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.45, 8),
      makeMaterial({ type: 'metal', color: '#888' }, null, { language: 'stainlessDark' })
    );
    sep.rotation.z = Math.PI / 2;
    sep.position.set(-R - 0.9, H * 0.5, z);
    g.add(sep);
  }
  // Nose black tip cap for visual product read
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.35, 12, 10),
    makeMaterial({ type: 'matte', color: '#1a1e24' }, null, { language: 'carbon' })
  );
  tip.position.y = H + R * 1.75;
  g.add(tip);
  const engCount = Math.max(0, part.params?.engineCount ?? 9);
  if (engCount > 0) {
    const engG = new THREE.Group();
    const positions = computeEnginePositions({ count: engCount, layout: 'ring' }, R);
    const preset = part.params?.enginePreset || 'merlin';
    for (const p of positions) {
      const eng = createEngineBell(preset, p.s * 0.85);
      eng.position.set(p.x, 0, p.z);
      engG.add(eng);
    }
    g.add(engG);
  }
  g.userData.partId = part.id;
  g.userData.defId = def.id;
  g.userData.category = 'side';
  g.userData.isSideBooster = true;
  g.userData.height = H;
  g.userData.radius = R;
  g.userData.diameter = D;
  g.userData.angle = part.angle || 0;
  return g;
}

/**
 * Recursively build part meshes and parent them with KSP attach semantics.
 * @returns {{ rootParts: THREE.Group, partMap: Map<string, THREE.Object3D>, height: number, radius: number }}
 */
function assembleFromCraft(craft, design, textureCache) {
  const c = normalizeCraft(craft);
  const partMap = new Map();
  if (!c.rootId) {
    const empty = new THREE.Group();
    empty.name = 'EmptyCraft';
    return { rootParts: empty, partMap, height: 0, radius: 4.5 };
  }

  function buildMesh(part) {
    const def = getPartDef(part.defId);
    if (!def) return null;
    const parent = part.parentId ? getPart(c, part.parentId) : null;
    const parentDef = parent ? getPartDef(parent.defId) : null;
    const parentR =
      parent?.params?.diameter != null
        ? parent.params.diameter / 2
        : parentDef?.defaultParams?.diameter
          ? parentDef.defaultParams.diameter / 2
          : 4.5;

    let mesh;
    switch (def.category) {
      case 'tank':
        mesh = buildTankPart(part, def, design, textureCache);
        break;
      case 'decoupler':
        mesh = buildDecouplerPart(part, def);
        break;
      case 'nose':
        mesh = buildNosePart(part, def, parentR, design, textureCache);
        break;
      case 'engine':
        mesh = buildEnginePart(part, def, parentR);
        break;
      case 'aero':
        mesh = buildAeroPart(part, def, parentR);
        break;
      case 'decor':
        mesh = buildDecorPart(part, def, parentR);
        break;
      case 'side':
        mesh = buildSidePart(part, def, design, textureCache);
        break;
      case 'utility':
        mesh = buildUtilityPart(part, def, parentR);
        break;
      default:
        mesh = new THREE.Group();
        mesh.userData.partId = part.id;
        mesh.userData.height = 1;
        mesh.userData.radius = 1;
    }
    partMap.set(part.id, mesh);
    return mesh;
  }

  // Build all meshes first
  for (const part of Object.values(c.parts)) {
    buildMesh(part);
  }

  // Attach children under parents with correct local offsets
  const rootMesh = partMap.get(c.rootId);
  const rootGroup = new THREE.Group();
  rootGroup.name = 'CraftParts';
  if (rootMesh) rootGroup.add(rootMesh);

  function attachChildren(parentId) {
    const parentMesh = partMap.get(parentId);
    const parentPart = getPart(c, parentId);
    if (!parentMesh || !parentPart) return;
    const pH = parentMesh.userData.height || 0;
    const pR = parentMesh.userData.radius || 4.5;

    for (const ch of listChildren(c, parentId)) {
      const childMesh = partMap.get(ch.id);
      if (!childMesh) continue;
      const def = getPartDef(ch.defId);
      // Detach if already has parent
      if (childMesh.parent) childMesh.parent.remove(childMesh);

      if (ch.parentNode === 'top' || (def?.category === 'nose' && ch.parentNode !== 'radial')) {
        // Stack on top: child bottom sits on parent top
        childMesh.position.set(0, pH, 0);
        childMesh.rotation.set(0, 0, 0);
        parentMesh.add(childMesh);
      } else if (ch.parentNode === 'bottom' || ch.parentNode === 'mount') {
        // Engines hang at bottom
        childMesh.position.set(0, 0, 0);
        childMesh.rotation.set(0, ch.angle || 0, 0);
        parentMesh.add(childMesh);
      } else if (ch.parentNode === 'radial') {
        const yf = Math.min(1, Math.max(0, ch.params?.yFraction ?? 0.5));
        const y = yf * pH;
        const ang = ch.angle || 0;
        if (def?.category === 'side') {
          const sR = childMesh.userData.radius || 1.8;
          const dist = pR + sR + 0.35;
          childMesh.position.set(Math.sin(ang) * dist, 0, Math.cos(ang) * dist);
          childMesh.rotation.set(0, ang, 0);
          // side sits relative to parent bottom
          childMesh.userData.angle = ang;
          parentMesh.add(childMesh);
        } else if (def?.category === 'decor' && (def.legacyDecorPreset === 'ring_weld' || def.legacyDecorPreset === 'ring_armor' || def.legacyDecorPreset === 'ring_glow' || def.legacyDecorPreset === 'vent_band')) {
          // Full rings centered on axis
          childMesh.position.set(0, y, 0);
          childMesh.rotation.set(0, 0, 0);
          parentMesh.add(childMesh);
        } else {
          // aero / utility / antenna: on surface, face outward
          childMesh.position.set(Math.sin(ang) * pR, y, Math.cos(ang) * pR);
          childMesh.rotation.set(0, ang, 0);
          parentMesh.add(childMesh);
        }
      } else {
        parentMesh.add(childMesh);
      }
      attachChildren(ch.id);
    }
  }

  attachChildren(c.rootId);

  // Measure bounds
  rootGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rootGroup);
  const height = box.isEmpty() ? 40 : Math.max(1, box.max.y - box.min.y);
  const radius = box.isEmpty()
    ? 4.5
    : Math.max(1, Math.max(Math.abs(box.max.x), Math.abs(box.max.z), Math.abs(box.min.x), Math.abs(box.min.z)));

  return { rootParts: rootGroup, partMap, height, radius, box };
}

/**
 * Split craft mesh into booster / ship groups for launch ABI while keeping part fidelity.
 */
export function createRocketFromCraft(designOrCraft, materials = null) {
  const craft = normalizeCraft(asCraft(designOrCraft));
  const d = asStageDesign(craft);
  const perf = calculateRocketPerformance(craft);
  const textureCache = new Map();
  const root = new THREE.Group();
  root.name = 'RocketAssembly';

  const engineClearance = OLM_DECK_HEIGHT + 1.5;
  const { rootParts, partMap, height: craftH, radius: craftR } = assembleFromCraft(
    craft,
    d,
    textureCache
  );

  const chain = walkStackChain(craft);
  const { lower, upper, decoupler } = splitStagesFromChain(chain);

  // Collect part ids belonging to lower vs upper stage
  const lowerTankIds = new Set(
    lower.filter((x) => x.def?.category === 'tank').map((x) => x.part.id)
  );
  const upperTankIds = new Set(
    upper.filter((x) => x.def?.category === 'tank').map((x) => x.part.id)
  );

  function collectSubtreeIds(tankIds) {
    const ids = new Set(tankIds);
    if (decoupler && tankIds === lowerTankIds) ids.add(decoupler.part.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of Object.values(craft.parts)) {
        if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
          // Side boosters stay on root level for separation anim
          if (getPartDef(p.defId)?.category === 'side') continue;
          ids.add(p.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  const lowerIds = collectSubtreeIds(lowerTankIds);
  const upperIds = collectSubtreeIds(upperTankIds);

  let booster = new THREE.Group();
  booster.name = 'BoosterStage';
  let ship = new THREE.Group();
  ship.name = 'UpperStage';
  const sideBoosters = [];

  // Re-parent: for 2-stage, put upper root tank under ship; lower under booster
  // Simpler approach for visual fidelity: keep full tree under one group for single-stage;
  // for 2-stage extract upper stack by cloning transforms... 

  // Practical approach: add entire craft under booster if 1 stage;
  // if 2 stage, build two separate assemble passes from subgraphs.

  const stageCount = d.stageCount >= 2 && upper.length ? 2 : 1;

  /** Stack height / core radius from tank params (not bbox — aero would inflate radius). */
  function stageMetricsFromProjection(stage) {
    if (!stage) return { height: craftH, radius: craftR, diameter: craftR * 2 };
    const height = Math.max(1, stage.height || craftH);
    const diameter = Math.max(1, stage.diameter || 9);
    return { height, radius: diameter / 2, diameter };
  }

  if (stageCount === 1) {
    // Whole craft is the "ship"
    ship.add(rootParts);
    ship.position.y = engineClearance;
    const m0 = stageMetricsFromProjection(d.stages[0]);
    ship.userData.height = m0.height;
    ship.userData.radius = m0.radius;
    ship.userData.diameter = m0.diameter;
    ship.userData.role = 'upper';
    ship.userData.stageId = d.stages[0]?.id;
    ship.userData.partId = craft.rootId;
    ship.userData.partIds = Object.keys(craft.parts);
    ship.userData.engineCount = d.stages[0]?.engines?.count || 0;
    ship.userData.setEngineGlow = (v) => {
      ship.traverse((o) => {
        if (o.name === 'engineGlow' || o.name === 'plume') o.visible = !!v;
      });
    };
    ship.userData.setTilesVisible = () => {};


    booster.name = 'BoosterPlaceholder';
    booster.visible = false;
    booster.userData.height = 0;
    booster.userData.radius = m0.radius;
    booster.userData.setEngineGlow = () => {};
    booster.userData.setTilesVisible = () => {};
    root.add(ship);
    root.add(booster);
  } else {
    // Build lower and upper as separate craft assemblies from part sets
    const lowerCraft = isolateStackCraft(craft, lower, decoupler, 'lower');
    const upperCraft = isolateStackCraft(craft, upper, null, 'upper');

    const lowerAsm = assembleFromCraft(lowerCraft, d, textureCache);
    const upperAsm = assembleFromCraft(upperCraft, d, textureCache);
    const mLow = stageMetricsFromProjection(d.stages[0]);
    const mUp = stageMetricsFromProjection(d.stages[1]);
    // Prefer explicit stack height (tanks + thin decoupler) over bbox
    const boostH = Math.max(mLow.height, lowerAsm.height * 0.5);
    // Use tank stack height from projection (authoritative for edits)
    const boostStackH = mLow.height + (decoupler ? 1.2 : 0);

    booster = new THREE.Group();
    booster.name = 'BoosterStage';
    booster.add(lowerAsm.rootParts);
    booster.position.y = engineClearance;
    booster.userData.height = boostStackH;
    booster.userData.radius = mLow.radius;
    booster.userData.diameter = mLow.diameter;
    booster.userData.role = 'booster';
    booster.userData.stageId = d.stages[0]?.id;
    booster.userData.partId = lower[0]?.part?.id || craft.rootId;
    booster.userData.partIds = [...lowerIds];
    booster.userData.engineCount = d.stages[0]?.engines?.count || 0;
    booster.userData.setEngineGlow = (v) => {
      booster.traverse((o) => {
        if (o.name === 'engineGlow' || o.name === 'plume') o.visible = !!v;
      });
    };
    booster.userData.setTilesVisible = () => {};

    ship = new THREE.Group();
    ship.name = 'UpperStage';
    ship.add(upperAsm.rootParts);
    ship.position.y = engineClearance + boostStackH - 0.15;
    ship.userData.height = mUp.height;
    ship.userData.radius = mUp.radius;
    ship.userData.diameter = mUp.diameter;
    ship.userData.role = 'upper';
    ship.userData.stageId = d.stages[1]?.id;
    ship.userData.partId = upper.find((x) => x.def?.category === 'tank')?.part?.id;
    ship.userData.partIds = [...upperIds];
    ship.userData.engineCount = d.stages[1]?.engines?.count || 0;
    ship.userData.setEngineGlow = (v) => {
      ship.traverse((o) => {
        if (o.name === 'engineGlow' || o.name === 'plume') o.visible = !!v;
      });
    };
    ship.userData.setTilesVisible = () => {};

    root.add(booster);
    root.add(ship);

    // Side boosters from lower tanks (root-level for separation anim)
    for (const p of Object.values(craft.parts)) {
      if (getPartDef(p.defId)?.category !== 'side') continue;
      const mesh = buildSidePart(p, getPartDef(p.defId), d, textureCache);
      const host = getPart(craft, p.parentId);
      const hostR = (host?.params?.diameter || 9) / 2;
      const sR = mesh.userData.radius || 1.8;
      const ang = p.angle || 0;
      const dist = hostR + sR + 0.35;
      mesh.position.set(Math.sin(ang) * dist, engineClearance, Math.cos(ang) * dist);
      mesh.userData.angle = ang;
      mesh.userData.baseDist = dist;
      mesh.userData.restY = engineClearance;
      mesh.userData.isSideBooster = true;
      root.add(mesh);
      sideBoosters.push(mesh);
    }
  }

  const boosterH = booster.userData.height || 0;
  const shipH = ship.userData.height || 0;
  const totalHeight =
    stageCount === 1
      ? engineClearance + shipH
      : engineClearance + boosterH + shipH - 0.15;

  const attachR = (stageCount === 2 ? booster : ship).userData.radius || craftR;

  // Side boosters for single stage — reparent to root so sep/fall can run
  if (stageCount === 1) {
    for (const p of Object.values(craft.parts)) {
      if (getPartDef(p.defId)?.category !== 'side') continue;
      const found = [];
      ship.traverse((o) => {
        if (o.userData?.partId === p.id && o.userData?.isSideBooster) found.push(o);
      });
      for (const o of found) {
        const ang = p.angle || 0;
        const sR = o.userData.radius || 1.8;
        const dist = attachR + sR + 0.35;
        o.userData.angle = ang;
        o.userData.baseDist = dist;
        o.userData.restY = engineClearance;
        o.userData.isSideBooster = true;
        root.add(o);
        o.position.set(Math.sin(ang) * dist, engineClearance, Math.cos(ang) * dist);
        o.rotation.set(0, 0, 0);
        sideBoosters.push(o);
      }
    }
  }
  const restBoosterY = engineClearance;
  const restShipY = stageCount === 1 ? engineClearance : engineClearance + boosterH - 0.15;

  function setViewMode(mode) {
    root.userData.mode = mode;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    if (booster) booster.rotation.set(0, 0, 0);
    if (ship) ship.rotation.set(0, 0, 0);
    for (const sb of sideBoosters) {
      sb.userData._sepCapX = null;
      sb.userData._sepCapY = null;
      sb.userData._sepCapZ = null;
      sb.rotation.set(0, 0, 0);
      sb.visible = true;
      if (sb.parent !== root) root.add(sb);
      const angle = sb.userData.angle || 0;
      const dist = sb.userData.baseDist ?? attachR + (sb.userData.radius || 1) + 0.35;
      const restY = sb.userData.restY ?? engineClearance;
      sb.position.set(Math.sin(angle) * dist, restY, Math.cos(angle) * dist);
    }

    if (stageCount === 1) {
      booster.visible = false;
      ship.visible = true;
      ship.position.set(0, engineClearance, 0);
      return;
    }

    if (mode === 'stack') {
      booster.visible = true;
      ship.visible = true;
      booster.position.set(0, engineClearance, 0);
      ship.position.set(0, restShipY, 0);
    } else if (mode === 'ship') {
      booster.visible = false;
      ship.visible = true;
      ship.position.set(0, engineClearance, 0);
      for (const sb of sideBoosters) sb.visible = false;
    } else if (mode === 'booster') {
      booster.visible = true;
      ship.visible = false;
      booster.position.set(0, engineClearance, 0);
    }
  }

  root.userData = {
    isRocketAssembly: true,
    designId: d.id,
    designName: d.name,
    design: d,
    craft,
    performance: perf,
    booster,
    ship,
    sideBoosters,
    stageCount,
    totalHeight,
    engineClearance,
    massKg: perf.liftoffMassKg,
    thrustN: perf.totalThrustN,
    twr: perf.twr,
    underpowered: perf.underpowered,
    canLiftOff: perf.canLiftOff,
    hasInterstageSeparation: perf.hasInterstageSeparation,
    hasSideBoosterSeparation: perf.hasSideBoosterSeparation,
    sideBoosterSeparatePhase: d.sideBoosters?.separatePhase || 'ascent',
    partMap,
    mode: 'stack',
    rest: { boosterY: restBoosterY, shipY: restShipY },
    setViewMode,
    resetPose() {
      root.userData.setViewMode(root.userData.mode || 'stack');
    },
    setTilesVisible(v) {
      ship?.userData?.setTilesVisible?.(v);
    },
    setEngineGlow(v) {
      ship?.userData?.setEngineGlow?.(v);
      booster?.userData?.setEngineGlow?.(v);
      for (const sb of sideBoosters) sb.userData?.setEngineGlow?.(v);
    },
    getFocusHeight() {
      const mode = root.userData.mode;
      if (mode === 'ship') return engineClearance + shipH * 0.5;
      if (mode === 'booster') return engineClearance + boosterH * 0.5;
      return engineClearance + (totalHeight - engineClearance) * 0.35;
    },
    getStackMidHeight() {
      if (stageCount === 1) return engineClearance + shipH * 0.5;
      return engineClearance + boosterH * 0.55;
    },
    /**
     * Side-booster separation (site metres).
     *
     * progress: 0 = mated, 0–1 = push-clear of core, >1 = ballistic coast/fall.
     * stack: {x,y,z, rx,ry,rz, vx,vy,vz} — core pose + velocity at this tick.
     *
     * Not a synchronized vertical drop: boosters tip *outboard*, lag *aft*
     * of the thrusting core, then follow a ballistic arc (shared inertia at
     * sep, then gravity). Slight per-booster stagger avoids lockstep.
     */
    separateSideBoosters(progress, stack = null) {
      const p = Math.max(0, Number(progress) || 0);
      const peel = Math.min(1, p);
      const fall = Math.max(0, p - 1);
      const ease = peel * peel * (3 - 2 * peel);
      const push = ease * ease;

      const sx = stack?.x ?? root.position.x;
      const sy = stack?.y ?? root.position.y;
      const sz = stack?.z ?? root.position.z;
      const srx = stack?.rx ?? root.rotation.x;
      const sry = stack?.ry ?? root.rotation.y;
      const srz = stack?.rz ?? root.rotation.z;
      const rx = root.position.x;
      const ry = root.position.y;
      const rz = root.position.z;

      // Body axes from core attitude (XYZ euler, matches launchSequence)
      const eul = new THREE.Euler(srx, sry, srz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(eul);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q); // nose
      const aft = up.clone().multiplyScalar(-1); // engines / fall-behind

      for (let i = 0; i < sideBoosters.length; i++) {
        const sb = sideBoosters[i];
        const angle = sb.userData.angle || 0;
        const sR = sb.userData.radius || 1.8;
        const baseDist = sb.userData.baseDist ?? attachR + sR + 0.35;
        const restY = sb.userData.restY ?? engineClearance;

        // Tiny stagger so pairs don't move in perfect unison (pyros aren't clocks)
        const stagger = ((i % 2) * 2 - 1) * 0.035 + Math.sin(angle * 1.7) * 0.04;
        const pLocal = Math.max(0, p - Math.max(0, stagger));
        const peelL = Math.min(1, pLocal);
        const fallL = Math.max(0, pLocal - 1);
        const easeL = peelL * peelL * (3 - 2 * peelL);
        const pushL = easeL * easeL;

        if (sb.parent !== root) root.add(sb);

        if (peelL <= 0.001) {
          sb.userData._sepCapX = null;
          sb.userData._sepCapY = null;
          sb.userData._sepCapZ = null;
          sb.userData._sepVx = null;
          sb.userData._sepVy = null;
          sb.userData._sepVz = null;
          sb.userData._sepAftX = null;
          sb.position.set(Math.sin(angle) * baseDist, restY, Math.cos(angle) * baseDist);
          sb.rotation.set(0, 0, 0);
          sb.visible = true;
          continue;
        }

        // Capture site origin + inertia at first peel frame for this booster
        if (sb.userData._sepCapY == null) {
          const ox = Math.sin(angle) * baseDist;
          const oz = Math.cos(angle) * baseDist;
          // Local attach → site (approx with core attitude)
          const attach = new THREE.Vector3(ox, restY, oz).applyQuaternion(q);
          sb.userData._sepCapX = sx + attach.x;
          sb.userData._sepCapY = sy + attach.y;
          sb.userData._sepCapZ = sz + attach.z;
          // Inertial velocity at sep ≈ core velocity (ballistic coast after)
          const spd = Math.max(80, stack?.speed ?? 900);
          sb.userData._sepVx = stack?.vx ?? spd * Math.sin(Math.abs(srz)) * Math.sign(-srz || 1);
          sb.userData._sepVy = stack?.vy ?? spd * Math.max(0.25, Math.cos(srz));
          sb.userData._sepVz = stack?.vz ?? spd * Math.sin(srx) * 0.35;
          sb.userData._sepAftX = aft.x;
          sb.userData._sepAftY = aft.y;
          sb.userData._sepAftZ = aft.z;
          sb.userData._sepOutX = Math.sin(angle);
          sb.userData._sepOutY = 0;
          sb.userData._sepOutZ = Math.cos(angle);
        }

        const capX = sb.userData._sepCapX;
        const capY = sb.userData._sepCapY;
        const capZ = sb.userData._sepCapZ;
        const outX = sb.userData._sepOutX;
        const outZ = sb.userData._sepOutZ;
        // Outboard in horizontal plane + slight mix with body-aft after capture
        const aftX = sb.userData._sepAftX ?? 0;
        const aftY = sb.userData._sepAftY ?? -1;
        const aftZ = sb.userData._sepAftZ ?? 0;

        // --- Peel (still near core): radial out + tip out + light aft lag ---
        // Spring/pusher clear ~ tens of m, not kilometres
        const radialPeel = baseDist + easeL * 28 + pushL * 70;
        // Fall-behind along body aft (not pure world-down)
        const aftPeel = easeL * 12 + pushL * 55;

        // Core still thrusting during peel: blend toward free state
        const freeW = THREE.MathUtils.smoothstep(peelL, 0.35, 1) * 0.85 + Math.min(1, fallL) * 0.15;
        // Free-flight time proxy (seconds-ish cinematic scale)
        const tFree = fallL * 14 + pushL * 4;

        // Ballistic coast from sep state: r = r0 + v t + ½ g t² (g along -Y)
        const g = 9.2; // slightly soft cinematic gravity
        const vx = sb.userData._sepVx || 0;
        const vy = sb.userData._sepVy || 0;
        const vz = sb.userData._sepVz || 0;
        // Outboard residual push continues briefly after clear
        const radialFree = radialPeel + fallL * 40 + Math.min(fallL, 2) * 55;
        const outPushX = outX * (radialFree - baseDist);
        const outPushZ = outZ * (radialFree - baseDist);
        // Aft drift grows as they lose with the thrusting core
        const aftFree = aftPeel + fallL * 80 + fallL * fallL * 120;

        const ballX = capX + vx * tFree + outPushX + aftX * aftFree;
        const ballY = capY + vy * tFree - 0.5 * g * tFree * tFree + aftY * aftFree * 0.35;
        const ballZ = capZ + vz * tFree + outPushZ + aftZ * aftFree;

        // While peeling, stay loosely with the core then hand off to ballistic
        const peelX = sx + outX * radialPeel + aftX * aftPeel;
        const peelY = sy + restY + aftY * aftPeel * 0.85;
        const peelZ = sz + outZ * radialPeel + aftZ * aftPeel;

        const worldX = peelX * (1 - freeW) + ballX * freeW;
        const worldY = Math.max(50, peelY * (1 - freeW) + ballY * freeW);
        const worldZ = peelZ * (1 - freeW) + ballZ * freeW;

        sb.position.set(worldX - rx, worldY - ry, worldZ - rz);

        // Attitude: tip outboard (radial), then tumble — not a flat belly-flop together
        const tip = easeL * 0.55 + pushL * 0.5 + Math.min(fallL, 2) * 0.35;
        sb.rotation.z = outX * tip + Math.sin(angle + fallL) * fallL * 0.15;
        sb.rotation.x = outZ * tip * 0.55 + fallL * 0.45 + pushL * 0.2;
        sb.rotation.y = Math.sin(angle * 1.9 + i) * (easeL * 0.35 + fallL * 0.7);

        const radialVis = Math.hypot(worldX - sx, worldZ - sz);
        sb.visible = worldY > 80 && radialVis < 3_500 && tFree < 48;
      }
    },
    resetSideBoosters() {
      for (const sb of sideBoosters) {
        sb.userData._sepCapX = null;
        sb.userData._sepCapY = null;
        sb.userData._sepCapZ = null;
        sb.userData._sepVx = null;
        sb.userData._sepVy = null;
        sb.userData._sepVz = null;
        sb.userData._sepAftX = null;
        sb.userData._sepAftY = null;
        sb.userData._sepAftZ = null;
        sb.userData._sepOutX = null;
        sb.userData._sepOutY = null;
        sb.userData._sepOutZ = null;
        sb.visible = true;
        const angle = sb.userData.angle || 0;
        const sR = sb.userData.radius || 1;
        const dist = sb.userData.baseDist ?? attachR + sR + 0.35;
        const restY = sb.userData.restY ?? engineClearance;
        if (sb.parent !== root) root.add(sb);
        sb.position.set(Math.sin(angle) * dist, restY, Math.cos(angle) * dist);
        sb.rotation.set(0, 0, 0);
      }
    },
    dispose() {
      disposeTree(root);
      for (const tex of textureCache.values()) tex.dispose?.();
      textureCache.clear();
    },
  };

  // Fuel lines (yellow) & struts (gray) as world-space segments
  addConnectionMeshes(root, craft, partMap, engineClearance, stageCount, booster, ship);

  setViewMode('stack');
  return root;
}

/**
 * Draw fuel lines / struts between part world positions.
 */
function addConnectionMeshes(root, craft, partMap, engineClearance, stageCount, booster, ship) {
  const conns = Object.values(craft.connections || {});
  if (!conns.length) return;
  const group = new THREE.Group();
  group.name = 'Connections';

  const worldOf = (partId) => {
    const mesh = partMap?.get?.(partId);
    if (mesh) {
      mesh.updateWorldMatrix(true, false);
      const v = new THREE.Vector3();
      // Prefer geometric center
      const box = new THREE.Box3().setFromObject(mesh);
      if (!box.isEmpty()) {
        box.getCenter(v);
        return v;
      }
      mesh.getWorldPosition(v);
      return v;
    }
    return null;
  };

  // After parenting, partMap meshes may be under booster/ship — still works with world matrix
  root.updateMatrixWorld(true);

  for (const conn of conns) {
    let a = worldOf(conn.a);
    let b = worldOf(conn.b);
    // Fallback: search tree by partId
    if (!a || !b) {
      root.traverse((o) => {
        if (o.userData?.partId === conn.a && !a) {
          const box = new THREE.Box3().setFromObject(o);
          a = new THREE.Vector3();
          if (!box.isEmpty()) box.getCenter(a);
          else o.getWorldPosition(a);
        }
        if (o.userData?.partId === conn.b && !b) {
          const box = new THREE.Box3().setFromObject(o);
          b = new THREE.Vector3();
          if (!box.isEmpty()) box.getCenter(b);
          else o.getWorldPosition(b);
        }
      });
    }
    if (!a || !b) continue;
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.05) continue;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const isFuel = conn.type === 'fuelLine';
    const rad = isFuel ? 0.12 : 0.08;
    const mat = new THREE.MeshStandardMaterial({
      color: isFuel ? 0xffcc33 : 0x889099,
      metalness: isFuel ? 0.4 : 0.7,
      roughness: 0.4,
      emissive: isFuel ? 0x664400 : 0x000000,
      emissiveIntensity: isFuel ? 0.25 : 0,
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), mat);
    cyl.position.copy(mid);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    cyl.userData.isConnection = true;
    cyl.userData.connectionId = conn.id;
    cyl.userData.connectionType = conn.type;
    group.add(cyl);
  }
  root.add(group);
}

/**
 * Build a minimal craft document containing only one stage's stack + its radial/engine children.
 */
function isolateStackCraft(fullCraft, segment, decoupler, role) {
  const parts = {};
  const tankEntries = segment.filter((x) => x.def?.category === 'tank');
  if (!tankEntries.length && segment.length) {
    // use whatever is there
  }
  const ordered = [];
  for (const x of segment) {
    if (x.def?.category === 'tank' || x.def?.category === 'nose') ordered.push(x);
  }
  if (role === 'lower' && decoupler) {
    // include decoupler at top of lower
  }

  // Copy tanks in stack order with rewired parents
  let prevId = null;
  let rootId = null;
  for (const x of segment) {
    if (x.def?.category !== 'tank') continue;
    const p = fullCraft.parts[x.part.id];
    if (!p) continue;
    const copy = {
      ...JSON.parse(JSON.stringify(p)),
      parentId: prevId,
      parentNode: prevId ? 'top' : null,
      childNode: prevId ? 'bottom' : null,
    };
    parts[copy.id] = copy;
    if (!rootId) rootId = copy.id;
    prevId = copy.id;
  }
  // Decoupler on last lower tank
  if (role === 'lower' && decoupler?.part) {
    const p = fullCraft.parts[decoupler.part.id];
    if (p && prevId) {
      const copy = {
        ...JSON.parse(JSON.stringify(p)),
        parentId: prevId,
        parentNode: 'top',
        childNode: 'bottom',
      };
      parts[copy.id] = copy;
    }
  }
  // Nose on last upper tank
  for (const x of segment) {
    if (x.def?.category !== 'nose') continue;
    const p = fullCraft.parts[x.part.id];
    if (!p || !prevId) continue;
    const copy = {
      ...JSON.parse(JSON.stringify(p)),
      parentId: prevId,
      parentNode: 'top',
      childNode: 'bottom',
    };
    parts[copy.id] = copy;
  }

  // Engines, aero, decor attached to tanks in this segment (not side)
  for (const tank of Object.values(parts)) {
    if (getPartDef(tank.defId)?.category !== 'tank') continue;
    for (const ch of listChildren(fullCraft, tank.id)) {
      const cd = getPartDef(ch.defId);
      if (!cd || cd.category === 'side') continue;
      if (cd.category === 'tank' || cd.category === 'decoupler' || cd.category === 'nose') continue;
      if (parts[ch.id]) continue;
      parts[ch.id] = JSON.parse(JSON.stringify(ch));
    }
  }

  // Also nose attached as child of tank in full craft
  for (const tank of Object.values(parts)) {
    if (getPartDef(tank.defId)?.category !== 'tank') continue;
    for (const ch of listChildren(fullCraft, tank.id)) {
      if (getPartDef(ch.defId)?.category === 'nose' && !parts[ch.id]) {
        parts[ch.id] = {
          ...JSON.parse(JSON.stringify(ch)),
          parentId: tank.id,
          parentNode: 'top',
        };
      }
    }
  }

  return {
    version: fullCraft.version,
    id: fullCraft.id + '-' + role,
    name: fullCraft.name,
    rootId,
    parts,
    textures: fullCraft.textures,
    meta: fullCraft.meta,
  };
}

/**
 * Build a single part mesh for VAB icon rendering / previews.
 * Uses default params; engines forced to count=1 for readable silhouette.
 */
export function buildIsolatedPartMesh(defId, overrides = {}) {
  const def = getPartDef(defId);
  if (!def) return null;

  const part = {
    id: `icon_${defId}`,
    defId,
    params: {
      ...(def.defaultParams || {}),
      ...(overrides.params || {}),
    },
  };

  // Single engine looks better as an icon than a full cluster
  if (def.category === 'engine') {
    part.params.count = overrides.params?.count ?? 1;
    part.params.layout = overrides.params?.layout || 'ring';
  }

  const design = { textures: {} };
  const textureCache = new Map();
  const parentR =
    overrides.parentRadius ??
    (def.defaultParams?.diameter != null ? def.defaultParams.diameter / 2 : 4.5);

  switch (def.category) {
    case 'tank':
      return buildTankPart(part, def, design, textureCache);
    case 'decoupler':
      return buildDecouplerPart(part, def);
    case 'nose':
      return buildNosePart(part, def, parentR, design, textureCache);
    case 'engine':
      return buildEnginePart(part, def, parentR);
    case 'aero':
      return buildAeroPart(part, def, parentR);
    case 'decor':
      return buildDecorPart(part, def, parentR);
    case 'side':
      return buildSidePart(part, def, design, textureCache);
    case 'utility':
      return buildUtilityPart(part, def, parentR);
    default: {
      const g = new THREE.Group();
      g.userData.defId = defId;
      return g;
    }
  }
}
