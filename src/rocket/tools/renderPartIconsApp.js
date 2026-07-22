/**
 * Browser-side part icon baker.
 * Renders each PART_DEFS mesh with the same geometry as the VAB / flight craft.
 * Exposes window.__ICON_BAKER__ for Playwright to drive.
 */
import * as THREE from 'three';
import { PART_DEFS, PART_CATEGORIES } from '../design/partDefs.js';
import { buildIsolatedPartMesh } from '../design/craftMesh.js';

const SIZE = 512;
const BG = 0x12161a;

const canvas = document.getElementById('stage');
const statusEl = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setSize(SIZE, SIZE, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// Higher exposure so stainless reads silver (no IBL env map in baker)
renderer.toneMappingExposure = 1.55;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 500);
const key = new THREE.DirectionalLight(0xffffff, 3.4);
key.position.set(5, 9, 7);
scene.add(key);
const key2 = new THREE.DirectionalLight(0xfff2e0, 1.6);
key2.position.set(2, 5, 10);
scene.add(key2);
const fill = new THREE.DirectionalLight(0xb0d0ff, 1.5);
fill.position.set(-6, 4, -3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe8c8, 1.2);
rim.position.set(1, 2, -8);
scene.add(rim);
const bounce = new THREE.DirectionalLight(0xffffff, 0.9);
bounce.position.set(0, -6, 2);
scene.add(bounce);
scene.add(new THREE.AmbientLight(0x9aa6b4, 0.95));
scene.add(new THREE.HemisphereLight(0xe8f0f8, 0x2a3038, 0.85));

let currentRoot = null;

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log('[icon-baker]', msg);
}

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = o.material
      ? Array.isArray(o.material)
        ? o.material
        : [o.material]
      : [];
    for (const m of mats) m?.dispose?.();
  });
}

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) {
    camera.position.set(3, 2, 4);
    camera.lookAt(0, 0, 0);
    return;
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Center object at origin for framing
  obj.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  // Tighter crop so the part fills the card thumb
  const dist = maxDim * 1.55;
  // Slight 3/4 view — matches product icon feel
  camera.position.set(dist * 0.68, dist * 0.38, dist * 0.82);
  camera.near = Math.max(0.02, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);
}

/** Boost materials that rely on envMap so they still read without IBL */
function boostMaterials(root) {
  root.traverse((o) => {
    const mats = o.material
      ? Array.isArray(o.material)
        ? o.material
        : [o.material]
      : [];
    for (const m of mats) {
      if (!m) continue;
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        // Without env map, metal looks black — lift base color + lower metalness slightly
        if (m.metalness > 0.5) {
          m.metalness = Math.min(m.metalness, 0.72);
          m.roughness = Math.max(m.roughness ?? 0.3, 0.28);
          if (m.color) {
            const c = m.color;
            c.r = Math.min(1, c.r * 1.35 + 0.08);
            c.g = Math.min(1, c.g * 1.35 + 0.08);
            c.b = Math.min(1, c.b * 1.35 + 0.08);
          }
          m.envMapIntensity = 0;
        }
        m.needsUpdate = true;
      }
    }
  });
}

function renderDef(defId) {
  if (currentRoot) {
    scene.remove(currentRoot);
    disposeObject(currentRoot);
    currentRoot = null;
  }

  const mesh = buildIsolatedPartMesh(defId);
  if (!mesh) {
    setStatus(`missing mesh: ${defId}`);
    renderer.render(scene, camera);
    return false;
  }

  // Hide internal-only helpers (fuel cores already invisible)
  mesh.traverse((o) => {
    if (o.userData?.isInternal) o.visible = false;
    if (o.name === 'plume') o.visible = false;
  });
  boostMaterials(mesh);

  currentRoot = mesh;
  scene.add(mesh);
  frameObject(mesh);
  renderer.render(scene, camera);
  setStatus(`rendered ${defId}`);
  return true;
}

function listJobs() {
  const parts = Object.values(PART_DEFS).map((d) => ({
    kind: 'part',
    id: d.id,
    file: iconFileForPart(d),
    category: d.category,
  }));

  // Category rail icons: representative part per category
  const catRep = {
    tank: 'tank_std',
    nose: 'nose_ogive',
    engine: 'engine_raptor_sl',
    aero: 'aero_fin_grid',
    decor: 'decor_ring_weld',
    side: 'side_strap_std',
    decoupler: 'decoupler_std',
    utility: 'util_battery',
  };
  const cats = PART_CATEGORIES.map((c) => ({
    kind: 'cat',
    id: c.id,
    file: `cat-${c.id}.png`,
    repDefId: catRep[c.id] || null,
  }));

  return { parts, cats };
}

function iconFileForPart(def) {
  // Keep filenames matching partDefs.js icon paths
  const icon = def.icon || '';
  const m = icon.match(/\/([^/]+)\.png$/i);
  if (m) return m[1] + '.png';
  return `part-${def.id}.png`;
}

function toDataURL() {
  return canvas.toDataURL('image/png');
}

// Warm-up render so WebGL is ready
renderer.render(scene, camera);
setStatus('ready');

window.__ICON_BAKER__ = {
  ready: true,
  listJobs,
  renderDef,
  toDataURL,
  SIZE,
  PART_DEFS: Object.keys(PART_DEFS),
};
