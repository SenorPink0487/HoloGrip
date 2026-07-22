/**
 * Procedural rocket mesh builder → RocketAssembly façade.
 * All designed-craft geometry comes from the design document.
 */

import * as THREE from 'three';
import {
  MATERIAL_PRESETS,
  ENGINE_PRESETS,
  NOSE_PRESETS,
  WING_PRESETS,
  DECOR_PRESETS,
} from './partsLibrary.js';
import { asStageDesign } from './compileFlight.js';
import { asCraft } from './craftGraph.js';
import { calculateRocketPerformance } from './performance.js';
import { applyUvToTexture } from './texturePipeline.js';
import { OLM_DECK_HEIGHT } from '../scene/environment.js';
import { createRocketFromCraft } from './craftMesh.js';

/**
 * Dispose object tree geometries, materials, textures.
 * @param {THREE.Object3D} root
 */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.dispose?.();
    }
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

function parseColor(hex, fallback = 0xd8dde5) {
  try {
    return new THREE.Color(hex || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function makeMaterial(matDef, texture = null, sharedFallback = null) {
  const type = matDef?.type || 'metal';
  const preset = MATERIAL_PRESETS[type] || MATERIAL_PRESETS.metal;
  const mat = new THREE.MeshStandardMaterial({
    color: parseColor(matDef?.color),
    metalness: preset.metalness,
    roughness: preset.roughness,
    emissive: new THREE.Color(preset.emissive || 0x000000),
    emissiveIntensity: preset.emissiveIntensity || 0,
    envMapIntensity: type === 'metal' ? 1.5 : 0.8,
  });
  if (texture) {
    mat.map = texture;
    mat.needsUpdate = true;
  } else if (sharedFallback && type === 'metal') {
    // keep procedural look without sharing mutable mats
  }
  return mat;
}

function loadTextureFromDesign(design, textureId, uv, textureCache) {
  if (!textureId || !design.textures?.[textureId]) return null;
  if (textureCache.has(textureId)) {
    const base = textureCache.get(textureId);
    // clone so UV can differ per surface
    const cloned = base.clone();
    applyUvToTexture(cloned, uv);
    return cloned;
  }
  const asset = design.textures[textureId];
  if (!asset?.dataUrl || typeof document === 'undefined') {
    // In Node tests without DOM, skip GPU textures
    return null;
  }
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

function createNoseMesh(nose, radius, mat) {
  const preset = NOSE_PRESETS[nose.preset] || NOSE_PRESETS.ogive;
  const h = nose.height || radius * 2.5 * (preset.heightFactor || 1);
  const g = new THREE.Group();
  g.name = 'Nose';

  let mesh;
  if (preset.shape === 'cone') {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, h, 48), mat);
    mesh.position.y = h / 2;
  } else if (preset.shape === 'blunt') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    mesh.scale.y = h / radius;
    mesh.position.y = 0;
  } else if (preset.shape === 'spike') {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.95, h, 6), mat);
    mesh.position.y = h / 2;
  } else if (preset.shape === 'capsule') {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius, h * 0.55, 32),
      mat
    );
    cyl.position.y = h * 0.28;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.92, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.y = h * 0.55;
    g.add(cyl, dome);
    g.userData.height = h;
    return g;
  } else {
    // ogive via lathe
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = t * h;
      const r = radius * Math.sqrt(Math.max(0, 1 - t * t * 0.98));
      pts.push(new THREE.Vector2(r, y));
    }
    mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat);
  }
  if (mesh) {
    mesh.castShadow = true;
    g.add(mesh);
  }
  g.userData.height = h;
  return g;
}

function createEngine(presetId, scale = 1) {
  const preset = ENGINE_PRESETS[presetId] || ENGINE_PRESETS.raptor_sl;
  const s = scale * (preset.nozzleScale || 1);
  const g = new THREE.Group();
  g.name = 'Engine';

  const bellMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f48,
    metalness: 0.88,
    roughness: 0.3,
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: preset.style === 'ion' ? 0x44aaff : preset.style === 'plasma' ? 0xaa44ff : 0x6a4830,
    metalness: 0.5,
    roughness: 0.4,
    emissive: preset.style === 'ion' ? 0x2266ff : preset.style === 'plasma' ? 0x6622aa : 0x331100,
    emissiveIntensity: 0.25,
  });

  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 1.4 * s, 16, 1, true),
    bellMat
  );
  bell.position.y = -0.7 * s;
  g.add(bell);

  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * s, 0.35 * s, 0.4 * s, 12),
    bellMat
  );
  throat.position.y = 0.05 * s;
  g.add(throat);

  // Glow + plume hooks used by launchSequence
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.35 * s, 12, 12),
    new THREE.MeshBasicMaterial({
      color: preset.style === 'ion' ? 0x66ccff : preset.style === 'plasma' ? 0xcc66ff : 0xffaa44,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  glow.name = 'engineGlow';
  glow.position.y = -1.3 * s;
  glow.visible = false;
  g.add(glow);

  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.45 * s, 2.2 * s, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: preset.style === 'ion' ? 0x88ddff : preset.style === 'plasma' ? 0xdd88ff : 0xff8844,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  plume.name = 'plume';
  plume.position.y = -2.2 * s;
  plume.rotation.x = Math.PI;
  plume.visible = false;
  g.add(plume);

  g.userData.preset = presetId;
  return g;
}

/**
 * Engine mount positions scaled by stage radius (no fixed Starship metres).
 * Fractions match classic SH/Starship proportions at R=4.5 m.
 * @returns {{ x: number, z: number, s: number }[]}
 */
export function computeEnginePositions(engines, radius) {
  const count = Math.max(0, engines?.count || 0);
  const layout = engines?.layout || 'ring';
  const positions = [];
  const R = Math.max(0.5, radius);
  // Keep mounts inside the barrel with a small margin for bell radius
  const maxR = Math.max(0.15, R * 0.82);

  if (count === 0) return positions;

  if (layout === 'superheavy' && count >= 20) {
    // 3 + 10 + 20 style rings — fractions of stage radius
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

function placeEngines(group, engines, radius) {
  const preset = engines?.preset || 'raptor_sl';
  const items = engines?.items;
  // Multi-item free angles: if multiple engine parts each with count, merge via layout on first
  if (items?.length === 1 && (items[0].count || 1) >= 1) {
    const it = items[0];
    const positions = computeEnginePositions(
      { count: it.count, layout: it.layout || engines.layout },
      radius
    );
    for (const p of positions) {
      const eng = createEngine(it.preset || preset, p.s);
      eng.position.set(p.x, 0, p.z);
      eng.userData.partId = it.partId || null;
      eng.userData.isEngine = true;
      eng.userData.structureRole = 'engine';
      group.add(eng);
    }
    return positions;
  }
  if (items?.length > 1) {
    // Each item is one engine (or small cluster) at angle
    const R = Math.max(0.5, radius);
    const maxR = Math.max(0.15, R * 0.82);
    const positions = [];
    for (const it of items) {
      const n = Math.max(1, it.count || 1);
      if (n > 1) {
        const sub = computeEnginePositions({ count: n, layout: it.layout || 'ring' }, radius);
        for (const p of sub) {
          const eng = createEngine(it.preset || preset, p.s);
          eng.position.set(p.x, 0, p.z);
          eng.userData.partId = it.partId || null;
          eng.userData.isEngine = true;
          eng.userData.structureRole = 'engine';
          group.add(eng);
          positions.push(p);
        }
      } else {
        const a = it.angle || 0;
        const r = Math.min(R * 0.72, maxR);
        const p = { x: Math.sin(a) * r, z: Math.cos(a) * r, s: R / 4.5 };
        const eng = createEngine(it.preset || preset, p.s);
        eng.position.set(p.x, 0, p.z);
        eng.userData.partId = it.partId || null;
        eng.userData.isEngine = true;
        eng.userData.structureRole = 'engine';
        group.add(eng);
        positions.push(p);
      }
    }
    return positions;
  }
  const positions = computeEnginePositions(engines, radius);
  for (const p of positions) {
    const eng = createEngine(preset, p.s);
    eng.position.set(p.x, 0, p.z);
    eng.userData.isEngine = true;
    eng.userData.structureRole = 'engine';
    group.add(eng);
  }
  return positions;
}

function addWings(group, wings, radius, height, design, textureCache) {
  for (const w of wings || []) {
    const preset = WING_PRESETS[w.preset] || WING_PRESETS.flap_aft;
    const size = w.size || 1;
    const y = (w.yFraction ?? 0.5) * height;
    const tex = loadTextureFromDesign(design, w.textureId, w.uv || {}, textureCache);
    const mat = makeMaterial(
      w.material || { type: 'matte', color: '#2a2e36' },
      tex
    );
    // Prefer single instance at angle (craft graph); else legacy count ring
    if (w.angle != null && (w.count == null || w.count === 1)) {
      const a = w.angle || 0;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(preset.span * size, 0.15 * size, preset.chord * size),
        mat
      );
      mesh.position.set(
        Math.sin(a) * (radius + (preset.span * size) / 2),
        y,
        Math.cos(a) * (radius + (preset.span * size) / 2)
      );
      mesh.rotation.y = a;
      mesh.castShadow = true;
      mesh.userData.wingId = w.id || w.partId;
      mesh.userData.partId = w.partId || w.id;
      group.add(mesh);
    } else {
      const count = w.count || 2;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(preset.span * size, 0.15 * size, preset.chord * size),
          mat
        );
        mesh.position.set(
          Math.sin(a) * (radius + (preset.span * size) / 2),
          y,
          Math.cos(a) * (radius + (preset.span * size) / 2) * 0.15
        );
        mesh.rotation.y = a;
        mesh.castShadow = true;
        mesh.userData.wingId = w.id;
        mesh.userData.partId = w.partId || w.id;
        group.add(mesh);
      }
    }
  }
}

function addDecor(group, decor, radius, height, matBright) {
  for (const d of decor || []) {
    const preset = DECOR_PRESETS[d.preset] || DECOR_PRESETS.ring_weld;
    const y = (d.yFraction ?? 0.5) * height;
    if (preset.id === 'ring_glow') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.05, 0.06, 8, 48),
        new THREE.MeshStandardMaterial({
          color: 0x4488ff,
          emissive: 0x2266ff,
          emissiveIntensity: 0.8,
          metalness: 0.4,
          roughness: 0.3,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
    } else if (preset.id === 'antenna') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
          matBright
        );
        ant.position.set(Math.sin(a) * (radius + 0.1), y + 1, Math.cos(a) * (radius + 0.1));
        group.add(ant);
      }
    } else {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.02, preset.id === 'ring_armor' ? 0.08 : 0.03, 6, 48),
        matBright
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
    }
  }
}

function buildStageGroup(stage, design, textureCache, sharedMats) {
  const g = new THREE.Group();
  g.name = stage.role === 'booster' ? 'BoosterStage' : 'UpperStage';

  const R = stage.diameter / 2;
  const H = stage.height;
  const tex = loadTextureFromDesign(design, stage.textureId, stage.uv, textureCache);
  const bodyMat = makeMaterial(stage.material, tex);
  const brightMat = makeMaterial(
    { type: stage.material?.type || 'metal', color: '#f0f4f8' },
    null
  );

  // Body cylinder (if nose, body is slightly shorter visually when nose separate)
  let bodyH = H;
  let noseH = 0;
  if (stage.nose?.preset) {
    noseH = stage.nose.height || R * 2.2;
    bodyH = Math.max(H * 0.55, H - noseH);
  }

  // Open-ended barrel so engines at the base remain visible when looking up
  bodyMat.side = THREE.DoubleSide;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, bodyH, 48, 1, true),
    bodyMat
  );
  body.position.y = bodyH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isHull = true;
  body.userData.structureRole = 'hull';
  // Cap only the top so you can see into the thrust structure from below
  const capMat = bodyMat.clone();
  capMat.side = THREE.DoubleSide;
  const topCap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat);
  topCap.rotation.x = -Math.PI / 2;
  topCap.position.y = bodyH;
  topCap.userData.isHull = true;
  topCap.userData.structureRole = 'hull';
  g.add(body, topCap);

  // Propellant volume (internal) — visible in cutaway / x-ray
  const fill = Math.min(1, Math.max(0, stage.fuelFill ?? 0.85));
  if (fill > 0.02) {
    const fuelH = Math.max(0.5, bodyH * fill * 0.92);
    const fuelMat = new THREE.MeshStandardMaterial({
      color: 0x1a6a9e,
      metalness: 0.15,
      roughness: 0.45,
      transparent: true,
      opacity: 0.55,
      emissive: 0x0a3050,
      emissiveIntensity: 0.15,
    });
    const fuel = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.82, R * 0.82, fuelH, 32),
      fuelMat
    );
    fuel.position.y = fuelH / 2 + bodyH * 0.04;
    fuel.name = 'FuelCore';
    fuel.userData.isInternal = true;
    fuel.userData.structureRole = 'fuel';
    fuel.userData.partId = stage.tankPartIds?.[0] || stage.id;
    g.add(fuel);
  }

  // Weld rings
  const rings = Math.max(2, Math.round(bodyH / 4));
  for (let i = 0; i <= rings; i++) {
    const y = (i / rings) * bodyH;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.02, i % 4 === 0 ? 0.04 : 0.02, 6, 48),
      brightMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.userData.isHull = true;
    g.add(ring);
  }

  if (stage.nose?.preset) {
    // Nose can use its own texture/material; fall back to stage body map only if unset
    const noseTex =
      loadTextureFromDesign(
        design,
        stage.nose.textureId ?? null,
        stage.nose.uv || stage.uv,
        textureCache
      ) || (stage.nose.textureId ? null : tex);
    const noseMatDef = stage.nose.material || stage.material;
    const noseMat = makeMaterial(noseMatDef, noseTex);
    const nose = createNoseMesh({ ...stage.nose, height: noseH }, R, noseMat);
    nose.position.y = bodyH;
    nose.userData.isNose = true;
    nose.userData.partId = stage.nose.partId || null;
    g.add(nose);
  }

  placeEngines(g, stage.engines, R);
  addWings(g, stage.wings, R, bodyH, design, textureCache);
  addDecor(g, stage.decor, R, bodyH, brightMat);

  const totalH = bodyH + (stage.nose?.preset ? noseH : 0);
  // Prefer design height for stack math consistency
  g.userData.height = H;
  g.userData.visualHeight = totalH;
  g.userData.radius = R;
  g.userData.diameter = stage.diameter;
  g.userData.role = stage.role;
  g.userData.engineCount = stage.engines?.count || 0;
  g.userData.stageId = stage.id;
  g.userData.partId = stage.tankPartIds?.[0] || stage.id;
  g.userData.partIds = stage.partIds || [];

  g.userData.setEngineGlow = (v) => {
    g.traverse((o) => {
      if (o.name === 'engineGlow' || o.name === 'plume') o.visible = !!v;
    });
  };
  g.userData.setTilesVisible = () => {};

  return g;
}

function buildSideBooster(sb, design, textureCache, angle, attachRadius) {
  const g = new THREE.Group();
  g.name = 'SideBooster';
  const R = sb.diameter / 2;
  const H = sb.height;
  const tex = loadTextureFromDesign(design, sb.textureId, sb.uv, textureCache);
  const mat = makeMaterial(sb.material, tex);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 32, 1, true), mat);
  body.position.y = H / 2;
  body.castShadow = true;
  body.userData.isHull = true;
  body.userData.structureRole = 'hull';
  if (mat) mat.side = THREE.DoubleSide;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.8, 24), mat);
  nose.position.y = H + R * 0.9;
  nose.userData.isHull = true;
  g.add(nose);

  placeEngines(g, sb.engines, R);

  // Attach outside core
  const dist = attachRadius + R + 0.35;
  g.position.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist);
  g.userData.height = H;
  g.userData.radius = R;
  g.userData.angle = angle;
  g.userData.setEngineGlow = (v) => {
    g.traverse((o) => {
      if (o.name === 'engineGlow' || o.name === 'plume') o.visible = !!v;
    });
  };
  return g;
}

/**
 * Create a RocketAssembly from a design document.
 * KSP-style: every craft-graph part is a distinct mesh (not a merged stage blob).
 * API compatible with launch/exhaust/scene expectations of fullStack userData.
 *
 * @param {object} design
 * @param {object} [materials] optional shared materials (unused for craft path; kept for API)
 * @returns {THREE.Group} root with RocketAssembly userData
 */
export function createRocketFromDesign(design, materials = null) {
  // Part-tree assembly — edits to height/diameter/preset/attach are always visible
  return createRocketFromCraft(design, materials);
}

/**
 * Symmetric angles for N side boosters (2 or 4).
 */
export function sideBoosterAngles(count) {
  const n = count === 4 ? 4 : count === 2 ? 2 : 0;
  const angles = [];
  for (let i = 0; i < n; i++) {
    angles.push((i / n) * Math.PI * 2 + Math.PI / n);
  }
  return angles;
}
