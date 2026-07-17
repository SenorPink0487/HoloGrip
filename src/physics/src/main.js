import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createExperimentManager } from './experiments/index.js';
import { diffractionHalfSpan, diffractionIntensity } from './experiments/optics.js';
import { createHallDemoEquipment } from './experiments/hallDemoEquipment.js';
import { getAppInfo, isTauri } from './tauri.js';
import { createLabLoader } from './loader.js';
import {
  drawHoloScreen,
  getHoloScreenLayoutSize,
  pickHoloScreen,
  uvFromRayAndMesh,
} from './holoScreen.js';
import { drawFormulaBoard, pickFormulaBoard, FORMULA_CATALOG } from './formulaBoard.js';
import { createHandTracking } from './handTracking.js';
import { createArInteractionController } from './arInteraction.js';
import { resolveFrontmostInteraction } from './raycastInteraction.js';
/** Set after equipment is built; used by idle animators & interaction */
let expManager = null;

const labLoader = createLabLoader();
labLoader.setProgress(0.04, '初始化渲染核心…');

// Desktop shell detection (no-op on pure web / Vite preview)
if (isTauri()) {
  getAppInfo().then((info) => {
    if (info) console.info(`[Tauri] ${info.name} v${info.version}`);
  }).catch(() => {});
}

// ═══════════════════════════════════════════════
//  Renderer — bright cinematic look
// ═══════════════════════════════════════════════
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd6ecff);
scene.fog = new THREE.FogExp2(0xd6ecff, 0.018);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.06, 60);
// Spawn inside the room looking toward the lab center (not against the front wall)
camera.position.set(0, 1.65, 5.0);

labLoader.setProgress(0.12, '构建实验室空间…');

// ═══════════════════════════════════════════════
//  Controls
// ═══════════════════════════════════════════════
const controls = new PointerLockControls(camera, document.body);
canvas.addEventListener('click', () => {
  if (document.body.classList.contains('is-loading')) return;
  if (holoFsState?.open) return; // fullscreen UI owns the mouse
  if (handTracking?.isActive()) return;
  if (!controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => {
  document.body.classList.add('locked');
});
controls.addEventListener('unlock', () => {
  document.body.classList.remove('locked');
});

const move = { forward: false, back: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const arVelocity = new THREE.Vector2();
const SPEED = 4.5;
const AR_SPEED = 2.2;
/** Dual-hand pinch dolly is intentional locomotion — keep it snappier and longer-range. */
const AR_DOLLY_SPEED = 9.5;

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': move.forward = true; break;
    case 'KeyS': case 'ArrowDown': move.back = true; break;
    case 'KeyA': case 'ArrowLeft': move.left = true; break;
    case 'KeyD': case 'ArrowRight': move.right = true; break;
    case 'Space': move.up = true; e.preventDefault(); break;
    case 'ShiftLeft': case 'ShiftRight': move.down = true; break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': move.forward = false; break;
    case 'KeyS': case 'ArrowDown': move.back = false; break;
    case 'KeyA': case 'ArrowLeft': move.left = false; break;
    case 'KeyD': case 'ArrowRight': move.right = false; break;
    case 'Space': move.up = false; break;
    case 'ShiftLeft': case 'ShiftRight': move.down = false; break;
  }
});

// ═══════════════════════════════════════════════
//  Materials — bright sci-fi palette
// ═══════════════════════════════════════════════
const mat = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 0.15, roughness: 0.55 }),
  wallPanel: new THREE.MeshStandardMaterial({ color: 0xe8f2fc, metalness: 0.35, roughnessRoughness: 0.4 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xeef6ff, metalness: 0.55, roughnessRoughness: 0.18 }),
  floorAccent: new THREE.MeshStandardMaterial({ color: 0xc8e4ff, metalness: 0.6, roughnessRoughness: 0.22 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf8fbff, metalness: 0.2, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.25, roughnessRoughness: 0.35 }),
  whiteGloss: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 1, roughnessRoughness: 0.12 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xb8c4d4, metalness: 0.92, roughnessRoughness: 0.22 }),
  darkGlass: new THREE.MeshPhysicalMaterial({
    color: 0xa8c8e8, metalness: 0.1, roughness: 0.05, transmission: 0.85,
    thickness: 0.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xd0ecff, metalness: 0, roughness: 0.02, transmission: 0.92,
    thickness: 0.35, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.05,
  }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.4, roughnessRoughness: 0.3, emissive: 0x0e7490, emissiveIntensity: 0.35 }),
  cyanGlow: new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.3 }),
  blueGlow: new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x2563eb, emissiveIntensity: 0.9, metalness: 0.3, roughnessRoughness: 0.35 }),
  pinkGlow: new THREE.MeshStandardMaterial({ color: 0xf9a8d4, emissive: 0xec4899, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.35 }),
  greenGlow: new THREE.MeshStandardMaterial({ color: 0x6ee7b7, emissive: 0x10b981, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.35 }),
  orangeGlow: new THREE.MeshStandardMaterial({ color: 0xfdba74, emissive: 0xf97316, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.35 }),
  violetGlow: new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x8b5cf6, emissiveIntensity: 0.75, metalness: 0.2, roughness: 0.35 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughnessRoughness: 0.45 }),
  softBlue: new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.3, roughnessRoughness: 0.4 }),
  hologram: new THREE.MeshStandardMaterial({
    color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  }),
};

function rbox(w, h, d, material, radius = 0.03, segments = 3) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, radius), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, material, segs = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, segs = 32) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function torus(r, tube, material, rs = 12, ts = 32) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, rs, ts), material);
  m.castShadow = true;
  return m;
}

// ═══════════════════════════════════════════════
//  Lighting — bright airy
// ═══════════════════════════════════════════════
labLoader.setProgress(0.22, '配置光照与材质…');
RectAreaLightUniformsLib.init();

const hemi = new THREE.HemisphereLight(0xf0f9ff, 0xb8d4e8, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfffaf0, 1.15);
sun.position.set(6, 16, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const sun2 = new THREE.DirectionalLight(0xc4e4ff, 0.45);
sun2.position.set(-8, 10, -4);
scene.add(sun2);

function addCeilingLight(x, z, w = 2.8, intensity = 5) {
  const light = new THREE.RectAreaLight(0xe8f4ff, intensity, w, 0.35);
  light.position.set(x, 3.78, z);
  light.rotation.x = -Math.PI / 2;
  scene.add(light);

  const g = new THREE.Group();
  g.position.set(x, 3.85, z);
  const housing = rbox(w + 0.2, 0.08, 0.45, mat.white, 0.02);
  g.add(housing);
  const diffuser = rbox(w, 0.04, 0.28, new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xd0e8ff, emissiveIntensity: 1.4, roughness: 0.1, roughness: 0.3,
  }), 0.015);
  diffuser.position.y = -0.04;
  g.add(diffuser);
  // cyan edge LEDs
  const edge = rbox(w + 0.15, 0.015, 0.02, mat.cyanGlow, 0.005);
  edge.position.set(0, -0.02, 0.2);
  g.add(edge);
  scene.add(g);
}

addCeilingLight(-3.8, -2.2);
addCeilingLight(3.8, -2.2);
addCeilingLight(-3.8, 2.5);
addCeilingLight(3.8, 2.5);
addCeilingLight(0, 0, 3.5, 4);

// accent point lights
const accents = [
  { c: 0x22d3ee, p: [-3.5, 1.5, -2.5], i: 0.6 },
  { c: 0x60a5fa, p: [3.5, 1.5, -2.5], i: 0.55 },
  { c: 0xa78bfa, p: [0, 2, 0.5], i: 0.4 },
  { c: 0x34d399, p: [-3.5, 1.4, 2.2], i: 0.4 },
];
accents.forEach(({ c, p, i }) => {
  const l = new THREE.PointLight(c, i, 5, 2);
  l.position.set(...p);
  scene.add(l);
});

// ═══════════════════════════════════════════════
//  Room structure
// ═══════════════════════════════════════════════
const ROOM_W = 16;
const ROOM_D = 14;
const ROOM_H = 4;
/** Front-wall chalkboards + formula screen: only interact in the near third of the lab. */
const FRONT_WALL_DISPLAY_MAX_DIST = ROOM_D / 3;

// Floor — glossy tiles with glowing grid
const floor = rbox(ROOM_W, 0.14, ROOM_D, mat.floor, 0.02);
floor.position.y = -0.07;
scene.add(floor);

// Raised platform center
const platform = rbox(5.5, 0.08, 4.2, mat.floorAccent, 0.04);
platform.position.set(0, 0.04, 0.3);
scene.add(platform);
const platformEdge = rbox(5.55, 0.02, 4.25, mat.cyanGlow, 0.01);
platformEdge.position.set(0, 0.09, 0.3);
scene.add(platformEdge);

// Floor light strips (grid)
function addFloorStrip(len, x, z, rotY) {
  const strip = rbox(len, 0.012, 0.022, mat.cyanGlow, 0.004);
  strip.position.set(x, 0.015, z);
  strip.rotation.y = rotY;
  scene.add(strip);
}
for (let x = -7; x <= 7; x += 2) addFloorStrip(ROOM_D - 0.8, x, 0, Math.PI / 2);
for (let z = -6; z <= 6; z += 2) addFloorStrip(ROOM_W - 0.8, 0, z, 0);

// Walls
const wallT = 0.2;
const walls = [
  rbox(ROOM_W, ROOM_H, wallT, mat.wall, 0.01), // back
  rbox(ROOM_W, ROOM_H, wallT, mat.wall, 0.01), // front
  rbox(wallT, ROOM_H, ROOM_D, mat.wall, 0.01), // left
  rbox(wallT, ROOM_H, ROOM_D, mat.wall, 0.01), // right
];
walls[0].position.set(0, ROOM_H / 2, -ROOM_D / 2);
walls[1].position.set(0, ROOM_H / 2, ROOM_D / 2);
walls[2].position.set(-ROOM_W / 2, ROOM_H / 2, 0);
walls[3].position.set(ROOM_W / 2, ROOM_H / 2, 0);
walls.forEach((w) => scene.add(w));

// Ceiling
const ceiling = rbox(ROOM_W, 0.12, ROOM_D, mat.ceiling, 0.01);
ceiling.position.y = ROOM_H + 0.06;
scene.add(ceiling);

// Matte side blackboards. Their vertical span matches the centre display,
// while their shorter horizontal length is preserved.
const sideBoardMat = new THREE.MeshStandardMaterial({
  color: 0x20364d,
  metalness: 0,
  roughness: 1,
});
const BLACKBOARD_COLORS = ['#f8fafc', '#67e8f9', '#fde047', '#fb7185'];
const BLACKBOARD_SIZES = [4, 9, 16];
const blackboardBrush = { color: BLACKBOARD_COLORS[0], size: BLACKBOARD_SIZES[1] };
const sideBlackboards = [];

function addSideBlackboard(x, toolbarSide, w = 3.6, h = 2.2) {
  const g = new THREE.Group();
  g.position.set(x, 2.45, -ROOM_D / 2 + 0.12);

  const board = rbox(w, h, 0.08, sideBoardMat, 0.02);
  g.add(board);

  const c = document.createElement('canvas');
  c.width = 1152;
  c.height = 704;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const toolbarW = 86;
  const toolbarX = toolbarSide === 'left' ? 0 : c.width - toolbarW;
  ctx.fillStyle = '#20364d';
  ctx.fillRect(0, 0, c.width, c.height);

  function drawToolbar() {
    ctx.save();
    ctx.fillStyle = '#122438';
    ctx.fillRect(toolbarX, 0, toolbarW, c.height);
    ctx.strokeStyle = '#4f6f8d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const dividerX = toolbarSide === 'left' ? toolbarW - 1 : toolbarX + 1;
    ctx.moveTo(dividerX, 0);
    ctx.lineTo(dividerX, c.height);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 22px sans-serif';
    ctx.fillStyle = '#b9d6ed';
    ctx.fillText('颜色', toolbarX + toolbarW / 2, 34);
    BLACKBOARD_COLORS.forEach((color, i) => {
      const cy = 92 + i * 66;
      ctx.beginPath();
      ctx.arc(toolbarX + toolbarW / 2, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (blackboardBrush.color === color) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#b9d6ed';
    ctx.fillText('粗细', toolbarX + toolbarW / 2, 390);
    BLACKBOARD_SIZES.forEach((size, i) => {
      const cy = 454 + i * 82;
      ctx.beginPath();
      ctx.arc(toolbarX + toolbarW / 2, cy, Math.max(4, size * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      if (blackboardBrush.size === size) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    });
    ctx.restore();
    tex.needsUpdate = true;
  }
  drawToolbar();

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  face.position.z = 0.041;
  g.add(face);

  const tag = (o) => {
    o.userData.type = 'side_blackboard';
    o.userData.role = 'side_blackboard';
    o.userData.interactive = true;
    o.userData.maxInteractDist = FRONT_WALL_DISPLAY_MAX_DIST;
  };
  tag(g);
  tag(face);
  tag(board);

  function faceHitFromRay(rc) {
    face.updateMatrixWorld(true);
    return rc.intersectObject(face, false)[0] || null;
  }

  function pick(uv) {
    if (!uv) return null;
    const px = uv.x * c.width;
    const py = (1 - uv.y) * c.height;
    const inToolbar = toolbarSide === 'left' ? px <= toolbarW : px >= toolbarX;
    if (!inToolbar) return { action: 'draw', uv };

    for (let i = 0; i < BLACKBOARD_COLORS.length; i += 1) {
      if (Math.abs(py - (92 + i * 66)) <= 28) {
        return { action: 'color', value: BLACKBOARD_COLORS[i] };
      }
    }
    for (let i = 0; i < BLACKBOARD_SIZES.length; i += 1) {
      if (Math.abs(py - (454 + i * 82)) <= 34) {
        return { action: 'size', value: BLACKBOARD_SIZES[i] };
      }
    }
    return { action: 'toolbar' };
  }

  function canvasPoint(uv) {
    return { x: uv.x * c.width, y: (1 - uv.y) * c.height };
  }

  g.userData.face = face;
  g.userData.maxInteractDist = FRONT_WALL_DISPLAY_MAX_DIST;
  g.userData.pickFromRay = (rc) => {
    const hit = faceHitFromRay(rc);
    if (!hit?.uv || hit.distance > FRONT_WALL_DISPLAY_MAX_DIST) return null;
    return pick(hit.uv);
  };
  g.userData.lastDrawPoint = null;
  g.userData.stopStroke = () => { g.userData.lastDrawPoint = null; };
  g.userData.applyPick = (selection) => {
    if (selection?.action === 'color') blackboardBrush.color = selection.value;
    else if (selection?.action === 'size') blackboardBrush.size = selection.value;
    else return selection?.action === 'draw';
    sideBlackboards.forEach((item) => item.userData.drawToolbar());
    return false;
  };
  g.userData.drawFromRay = (rc) => {
    const hit = faceHitFromRay(rc);
    if (!hit?.uv || hit.distance > FRONT_WALL_DISPLAY_MAX_DIST) {
      g.userData.stopStroke();
      return false;
    }
    const selection = pick(hit.uv);
    if (selection?.action !== 'draw') {
      g.userData.stopStroke();
      return false;
    }
    const p = canvasPoint(selection.uv);
    const prev = g.userData.lastDrawPoint || p;
    ctx.save();
    ctx.strokeStyle = blackboardBrush.color;
    ctx.lineWidth = blackboardBrush.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    g.userData.lastDrawPoint = p;
    tex.needsUpdate = true;
    return true;
  };
  g.userData.drawToolbar = drawToolbar;

  sideBlackboards.push(g);
  scene.add(g);
  return g;
}
const centreBoardW = 4.55;
const centreBoardHalfW = centreBoardW / 2;
const sideBoardW = 3.6;
const sideBoardX = centreBoardHalfW + sideBoardW / 2;
addSideBlackboard(-sideBoardX, 'right', sideBoardW);
addSideBlackboard(sideBoardX, 'left', sideBoardW);

// ═══════════════════════════════════════════════
//  Futuristic lab tables
// ═══════════════════════════════════════════════
labLoader.setProgress(0.36, '装配实验台面…');
function makeTechTable(w, d, h = 0.88) {
  const g = new THREE.Group();
  // glossy white top
  const top = rbox(w, 0.05, d, mat.whiteGloss, 0.04);
  top.position.y = h;
  g.add(top);
  // glass underlayer glow
  const glowTop = rbox(w - 0.06, 0.015, d - 0.06, mat.cyanGlow, 0.01);
  glowTop.position.y = h - 0.03;
  g.add(glowTop);
  // slim carbon legs with feet
  const lx = w / 2 - 0.1, lz = d / 2 - 0.1;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.025, 0.035, h - 0.05, mat.carbon, 12);
      leg.position.set(sx * lx, (h - 0.05) / 2, sz * lz);
      g.add(leg);
      const foot = cyl(0.06, 0.06, 0.02, mat.chrome, 16);
      foot.position.set(sx * lx, 0.01, sz * lz);
      g.add(foot);
    }
  }
  // cross brace with LED
  const brace = rbox(w - 0.25, 0.02, 0.02, mat.silver, 0.005);
  brace.position.y = 0.35;
  g.add(brace);
  const led = rbox(w * 0.4, 0.012, 0.012, mat.cyanGlow, 0.003);
  led.position.y = 0.35;
  g.add(led);
  // under-shelf
  const shelf = rbox(w * 0.85, 0.025, d * 0.75, mat.wallPanel, 0.02);
  shelf.position.y = 0.28;
  g.add(shelf);
  return g;
}

// Four themed stations (center island stays general research console)
// layout: back-left 力学 | back-right 光学 | front-left 电磁学 | front-right 热力学
const tableLayouts = [
  { w: 3.4, d: 1.15, p: [-4.2, 0, -2.8], theme: '力学', color: '#0ea5e9' },
  { w: 3.4, d: 1.15, p: [4.2, 0, -2.8], theme: '光学', color: '#f59e0b' },
  { w: 2.8, d: 1.1, p: [-4.2, 0, 2.6], theme: '电磁学', color: '#ec4899' },
  { w: 2.8, d: 1.1, p: [4.2, 0, 2.6], theme: '热力学', color: '#f97316' },
];
tableLayouts.forEach(({ w, d, p }) => {
  const t = makeTechTable(w, d);
  t.position.set(...p);
  scene.add(t);
});

// Station edge nameplates on tabletops
function makeStationPlate(title, subtitle, accentHex) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 10, 128);
  ctx.fillRect(0, 0, 512, 4);
  ctx.fillStyle = accentHex;
  ctx.font = 'bold 42px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.fillText(title, 28, 58);
  ctx.fillStyle = '#64748b';
  ctx.font = '22px "Segoe UI", sans-serif';
  ctx.fillText(subtitle, 28, 98);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.14),
    new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: 0.4 })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Nameplates sit on the aisle-side of each table (holo screens occupy the wall edge)
const stationMeta = [
  { title: '力学', sub: 'MECHANICS', accent: '#0ea5e9', p: [-3.0, 0.94, -2.35] },
  { title: '光学', sub: 'OPTICS', accent: '#f59e0b', p: [3.0, 0.94, -2.35] },
  { title: '电磁学', sub: 'ELECTRO', accent: '#ec4899', p: [-3.1, 0.94, 3.0] },
  { title: '热力学', sub: 'THERMO', accent: '#f97316', p: [3.1, 0.94, 3.0] },
];
stationMeta.forEach(({ title, sub, accent, p }) => {
  const plate = makeStationPlate(title, sub, accent);
  plate.position.set(...p);
  scene.add(plate);
});

// Center island — holographic research console (unchanged role)
const island = makeTechTable(3.2, 1.6, 0.95);
island.position.set(0, 0, 0.4);
scene.add(island);

// Stools — modern
function makeStool() {
  const g = new THREE.Group();
  const seat = cyl(0.17, 0.17, 0.04, mat.whiteGloss, 24);
  seat.position.y = 0.58;
  g.add(seat);
  const ring = torus(0.15, 0.012, mat.cyanGlow, 8, 24);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.56;
  g.add(ring);
  const pole = cyl(0.022, 0.028, 0.5, mat.chrome, 12);
  pole.position.y = 0.3;
  g.add(pole);
  const base = cyl(0.18, 0.2, 0.03, mat.carbon, 20);
  base.position.y = 0.015;
  g.add(base);
  return g;
}
[
  // 力学台 / 光学台前
  [-4.2, -1.85], [-3.2, -1.85], [4.2, -1.85], [3.2, -1.85],
  // 电磁学台 / 热力学台前
  [-4.2, 3.5], [-3.4, 3.5], [4.2, 3.5], [3.4, 3.5],
  // 中央岛
  [-0.8, 1.55], [0.8, 1.55],
].forEach(([x, z]) => {
  const s = makeStool();
  s.position.set(x, 0, z);
  s.rotation.y = (Math.random() - 0.5) * 0.5;
  scene.add(s);
});

// ═══════════════════════════════════════════════
//  Animated equipment
// ═══════════════════════════════════════════════
const animators = [];

// —— Holographic Newton's Cradle ——
function makeNewtonsCradle() {
  const g = new THREE.Group();
  const base = rbox(0.75, 0.05, 0.32, mat.whiteGloss, 0.025);
  base.position.y = 0.025;
  g.add(base);
  const baseLed = rbox(0.7, 0.01, 0.28, mat.cyanGlow, 0.005);
  baseLed.position.y = 0.055;
  g.add(baseLed);

  const frameW = 0.58, frameH = 0.48;
  // arched frame bars
  for (const z of [-0.11, 0.11]) {
    for (const x of [-frameW / 2, frameW / 2]) {
      const post = cyl(0.012, 0.012, frameH, mat.chrome, 10);
      post.position.set(x, frameH / 2 + 0.06, z);
      g.add(post);
    }
    const bar = cyl(0.01, 0.01, frameW, mat.chrome, 10);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, frameH + 0.06, z);
    g.add(bar);
  }

  const n = 5, r = 0.042, stringLen = 0.34;
  const balls = [];
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i - (n - 1) / 2) * r * 2, frameH + 0.06, 0);

    const sGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.11),
      new THREE.Vector3(0, -stringLen, 0),
      new THREE.Vector3(0, 0, 0.11),
    ]);
    pivot.add(new THREE.Line(sGeo, new THREE.LineBasicMaterial({ color: 0x88d4ff, transparent: true, opacity: 0.7 })));

    const ball = sphere(r, mat.chrome, 28);
    ball.position.y = -stringLen;
    ball.userData.interactive = true;
    ball.userData.role = 'cradle';
    pivot.add(ball);
    const aura = sphere(r * 1.15, new THREE.MeshStandardMaterial({
      color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.2, depthWrite: false,
    }), 16);
    aura.position.y = -stringLen;
    pivot.add(aura);
    g.add(pivot);
    balls.push(pivot);
  }

  g.userData.cradleBalls = balls;
  g.userData.interactive = true;
  g.userData.role = 'cradle';

  animators.push((t) => {
    if (expManager?.state.running && expManager.state.expId === 'cradle_demo') return;
    const period = 1.35;
    const phase = (t % period) / period;
    const angle = Math.sin(phase * Math.PI * 2) * 0.55;
    balls[0].rotation.z = Math.max(0, angle);
    balls[n - 1].rotation.z = Math.min(0, -angle);
    if (phase >= 0.5) {
      balls[0].rotation.z = Math.min(0, angle);
      balls[n - 1].rotation.z = Math.max(0, -angle);
    }
  });
  return g;
}

// —— Quantum Pendulum ——
function makePendulum() {
  const g = new THREE.Group();
  const base = rbox(0.4, 0.04, 0.28, mat.whiteGloss, 0.02);
  base.position.y = 0.02;
  g.add(base);
  const baseRing = torus(0.14, 0.012, mat.blueGlow, 8, 28);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.05;
  g.add(baseRing);

  const pole = cyl(0.018, 0.022, 1.0, mat.chrome, 12);
  pole.position.set(0, 0.55, -0.08);
  g.add(pole);
  const arm = rbox(0.5, 0.025, 0.025, mat.silver, 0.008);
  arm.position.set(0, 1.02, 0);
  g.add(arm);

  // holographic protractor
  const arcPts = [];
  for (let a = -55; a <= 55; a += 1.5) {
    const rad = THREE.MathUtils.degToRad(a);
    arcPts.push(new THREE.Vector3(Math.sin(rad) * 0.4, 1.0 - Math.cos(rad) * 0.4, 0.04));
  }
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })
  ));

  const pivot = new THREE.Group();
  pivot.position.set(0, 1.0, 0);
  pivot.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.72, 0)]),
    new THREE.LineBasicMaterial({ color: 0x7dd3fc })
  ));
  const bob = sphere(0.075, mat.blueGlow, 24);
  bob.position.y = -0.72;
  bob.userData.interactive = true;
  bob.userData.role = 'pendulum_bob';
  pivot.add(bob);
  const bobRing = torus(0.09, 0.008, mat.cyanGlow, 8, 20);
  bobRing.position.y = -0.72;
  pivot.add(bobRing);
  g.add(pivot);

  g.userData.pendulumPivot = pivot;
  g.userData.bob = bob;
  g.userData.interactive = true;
  g.userData.role = 'pendulum';
  g.userData.stringLen = 0.72;

  animators.push((t) => {
    if (expManager?.state.running && expManager.state.expId === 'pendulum_g') return;
    pivot.rotation.z = Math.sin(t * 1.75) * 0.48;
  });
  return g;
}

// —— Magnetic spring oscillator ——
function makeSpringMass() {
  const g = new THREE.Group();
  const base = rbox(0.38, 0.04, 0.38, mat.whiteGloss, 0.02);
  base.position.y = 0.02;
  g.add(base);

  // four corner posts forming open cube
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = cyl(0.012, 0.012, 0.78, mat.chrome, 10);
      post.position.set(sx * 0.14, 0.42, sz * 0.14);
      g.add(post);
    }
  }
  const top = rbox(0.32, 0.03, 0.32, mat.silver, 0.015);
  top.position.y = 0.8;
  g.add(top);
  const topLed = rbox(0.28, 0.01, 0.28, mat.greenGlow, 0.005);
  topLed.position.y = 0.78;
  g.add(topLed);

  const springGroup = new THREE.Group();
  springGroup.position.set(0, 0.78, 0);
  const springPts = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const ang = t * 12 * Math.PI * 2;
    springPts.push(new THREE.Vector3(Math.cos(ang) * 0.055, -t * 0.38, Math.sin(ang) * 0.055));
  }
  springGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(springPts),
    new THREE.LineBasicMaterial({ color: 0x34d399 })
  ));

  const mass = rbox(0.14, 0.1, 0.14, mat.greenGlow, 0.02);
  mass.position.y = -0.45;
  mass.userData.interactive = true;
  mass.userData.role = 'spring_mass';
  springGroup.add(mass);
  const floatRing = torus(0.1, 0.01, mat.cyanGlow, 8, 24);
  floatRing.rotation.x = Math.PI / 2;
  floatRing.position.y = -0.55;
  springGroup.add(floatRing);
  g.add(springGroup);

  g.userData.springGroup = springGroup;
  g.userData.springMass = mass;
  g.userData.interactive = true;
  g.userData.role = 'spring';

  animators.push((t) => {
    if (expManager?.state.running && expManager.state.expId === 'spring_k') return;
    const stretch = 0.1 * Math.sin(t * 3.0);
    springGroup.scale.y = 1 + stretch * 1.8;
    mass.position.y = -0.45 - stretch;
    floatRing.position.y = -0.55 - stretch * 0.5;
    floatRing.rotation.z = t * 2;
  });
  return g;
}

// —— Laser Optics Bench ——
function makeOpticsBench() {
  const g = new THREE.Group();
  const lab = {
    brass: new THREE.MeshStandardMaterial({
      color: 0xc9a227, metalness: 0.92, roughness: 0.32, emissive: 0x3d3008, emissiveIntensity: 0.08,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x8b939e, metalness: 0.88, roughness: 0.3, emissive: 0x101418, emissiveIntensity: 0.05,
    }),
    matteBlack: new THREE.MeshStandardMaterial({
      color: 0x1a1d22, metalness: 0.2, roughness: 0.75, emissive: 0x050505, emissiveIntensity: 0.04,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xf3efe6, metalness: 0.02, roughness: 0.88, emissive: 0x1a1810, emissiveIntensity: 0.04,
    }),
    warmGlass: new THREE.MeshPhysicalMaterial({
      color: 0xffe8aa, metalness: 0, roughness: 0.04, transmission: 0.9,
      thickness: 0.45, transparent: true, opacity: 0.55, clearcoat: 1,
    }),
  };

  function makeSelectOutline(sx, sy, sz) {
    const box = new THREE.BoxGeometry(sx, sy, sz);
    const edges = new THREE.EdgesGeometry(box);
    const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    box.dispose();
    edges.dispose();
    const lineMat = new LineMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0,
      linewidth: 4,
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      depthTest: true,
      toneMapped: false,
    });
    const outline = new LineSegments2(geometry, lineMat);
    outline.computeLineDistances();
    outline.visible = false;
    outline.userData.isOutline = true;
    return outline;
  }

  function addRecognitionTarget(host, role, size, outlinePos = [0, 0, 0]) {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(...outlinePos);
    hit.userData.interactive = true;
    hit.userData.role = role;
    host.add(hit);
    const outline = makeSelectOutline(...size);
    outline.position.set(...outlinePos);
    host.add(outline);
    return { outline, hit };
  }

  // ── Shared optical rail (full bench length ~2.2 m visual) ──
  const rail = rbox(2.2, 0.045, 0.18, lab.matteBlack, 0.01);
  rail.position.y = 0.05;
  g.add(rail);
  const railTop = rbox(2.15, 0.012, 0.05, lab.steel, 0.003);
  railTop.position.y = 0.078;
  g.add(railTop);
  for (const z of [-0.095, 0.095]) {
    const side = rbox(2.2, 0.028, 0.018, lab.steel, 0.004);
    side.position.set(0, 0.095, z);
    g.add(side);
  }
  // scale ticks
  for (let i = 0; i <= 22; i++) {
    const tick = rbox(0.006, 0.01, i % 5 === 0 ? 0.07 : 0.04, lab.brass, 0.001);
    tick.position.set(-1.05 + i * 0.1, 0.09, 0);
    g.add(tick);
  }
  const railHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.12, 0.22),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  railHit.position.y = 0.08;
  railHit.userData.interactive = true;
  railHit.userData.role = 'opt_rail';
  g.add(railHit);

  // ── Prism mode group ──
  const prismGroup = new THREE.Group();
  prismGroup.name = 'prismSetup';

  // White light source + collimator / slit
  const source = new THREE.Group();
  source.position.set(-0.85, 0.22, 0);
  const sourceBody = rbox(0.22, 0.16, 0.16, lab.matteBlack, 0.015);
  source.add(sourceBody);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfff2cc, emissive: 0xffcc66, emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.35,
    }),
  );
  lamp.position.set(-0.02, 0.02, 0);
  source.add(lamp);
  const collimator = cyl(0.035, 0.04, 0.1, lab.steel, 16);
  collimator.rotation.z = Math.PI / 2;
  collimator.position.x = 0.14;
  source.add(collimator);
  const slit = rbox(0.01, 0.08, 0.012, lab.brass, 0.002);
  slit.position.x = 0.2;
  source.add(slit);
  source.userData.interactive = true;
  source.userData.role = 'opt_source';
  prismGroup.add(source);

  const sourceLight = new THREE.PointLight(0xffd28a, 0.15, 2.2, 2);
  sourceLight.position.set(-0.75, 0.28, 0);
  prismGroup.add(sourceLight);

  // Incident beam (white)
  const inBeamMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e7, emissive: 0xffe4a3, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.0, depthWrite: false,
  });
  const inBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.72, 8), inBeamMat);
  inBeam.rotation.z = Math.PI / 2;
  inBeam.position.set(-0.35, 0.22, 0);
  prismGroup.add(inBeam);

  // Prism on rotatable stage
  const prismStage = new THREE.Group();
  prismStage.position.set(0.15, 0.1, 0);
  const stageBase = cyl(0.12, 0.12, 0.03, lab.steel, 28);
  stageBase.position.y = 0.0;
  prismStage.add(stageBase);
  const stageDial = cyl(0.1, 0.1, 0.012, lab.brass, 48);
  stageDial.position.y = 0.02;
  prismStage.add(stageDial);
  // degree marks
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const mark = rbox(0.008, 0.004, 0.018, lab.matteBlack, 0.001);
    mark.position.set(Math.cos(a) * 0.088, 0.028, Math.sin(a) * 0.088);
    mark.rotation.y = -a;
    prismStage.add(mark);
  }

  const prismShape = new THREE.Shape();
  prismShape.moveTo(0, 0.1);
  prismShape.lineTo(0.09, -0.06);
  prismShape.lineTo(-0.09, -0.06);
  prismShape.closePath();
  const prismMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(prismShape, {
      depth: 0.12, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0xe8f4ff, metalness: 0, roughness: 0.02, transmission: 0.94,
      thickness: 1.0, transparent: true, opacity: 0.58, clearcoat: 1, ior: 1.5,
    }),
  );
  prismMesh.position.set(0, 0.1, -0.06);
  prismMesh.userData.interactive = true;
  prismMesh.userData.role = 'opt_prism';
  prismStage.add(prismMesh);
  prismStage.userData.interactive = true;
  prismStage.userData.role = 'opt_prism';
  prismGroup.add(prismStage);

  // Goniometer arm / readout
  const gonio = new THREE.Group();
  gonio.position.set(0.15, 0.05, 0.28);
  const gonioBody = rbox(0.28, 0.08, 0.16, lab.matteBlack, 0.012);
  gonio.add(gonioBody);
  const gonioScreen = rbox(0.16, 0.04, 0.02, new THREE.MeshStandardMaterial({
    color: 0x0a1a12, emissive: 0x22c55e, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.4,
  }), 0.004);
  gonioScreen.position.set(0, 0.02, 0.09);
  gonio.add(gonioScreen);
  // canvas readout on gonio
  const gonioCanvas = document.createElement('canvas');
  gonioCanvas.width = 256;
  gonioCanvas.height = 64;
  const gonioCtx = gonioCanvas.getContext('2d');
  const gonioTex = new THREE.CanvasTexture(gonioCanvas);
  gonioTex.colorSpace = THREE.SRGBColorSpace;
  const gonioReadout = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.038),
    new THREE.MeshBasicMaterial({ map: gonioTex, transparent: true }),
  );
  gonioReadout.position.set(0, 0.02, 0.101);
  gonio.add(gonioReadout);
  gonio.userData.interactive = true;
  gonio.userData.role = 'opt_goniometer';
  prismGroup.add(gonio);

  function paintGonio(deltaDeg, phiDeg) {
    gonioCtx.fillStyle = '#04140c';
    gonioCtx.fillRect(0, 0, 256, 64);
    gonioCtx.fillStyle = '#4ade80';
    gonioCtx.font = 'bold 22px Consolas, monospace';
    gonioCtx.fillText(`δ ${deltaDeg.toFixed(2)}°`, 12, 28);
    gonioCtx.fillStyle = '#86efac';
    gonioCtx.font = '16px Consolas, monospace';
    gonioCtx.fillText(`φ ${phiDeg.toFixed(1)}°`, 12, 52);
    gonioTex.needsUpdate = true;
  }
  paintGonio(38.9, 12);

  // Observation screen for spectrum
  const spectrumScreen = new THREE.Group();
  spectrumScreen.position.set(0.95, 0.24, 0);
  const scrPlate = rbox(0.03, 0.32, 0.42, lab.paper, 0.008);
  spectrumScreen.add(scrPlate);
  const scrStand = cyl(0.015, 0.02, 0.18, lab.steel, 10);
  scrStand.position.set(0, -0.16, 0);
  spectrumScreen.add(scrStand);
  spectrumScreen.userData.interactive = true;
  spectrumScreen.userData.role = 'opt_screen';
  prismGroup.add(spectrumScreen);

  const spectrumGroup = new THREE.Group();
  const spectrumColors = [0xff0044, 0xff6600, 0xffee00, 0x44dd66, 0x2288ff, 0x7722ff];
  const spectrumBars = [];
  spectrumColors.forEach((c, i) => {
    const barMat = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0, metalness: 0.05, roughness: 0.45,
      transparent: true, opacity: 0.15,
    });
    const s = rbox(0.012, 0.24, 0.045, barMat, 0.004);
    s.position.set(0.02, 0, -0.12 + i * 0.048);
    spectrumGroup.add(s);
    spectrumBars.push(barMat);
  });
  spectrumScreen.add(spectrumGroup);

  // Dispersed exit beams (fan)
  const exitBeams = new THREE.Group();
  const exitMats = [];
  spectrumColors.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.3,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.7, 6), m);
    beam.rotation.z = Math.PI / 2;
    const spread = (i - 2.5) * 0.04;
    beam.position.set(0.55, 0.22, spread);
    beam.rotation.y = -spread * 0.8;
    exitBeams.add(beam);
    exitMats.push(m);
  });
  prismGroup.add(exitBeams);

  g.add(prismGroup);

  // ── Lens mode group ──
  const lensGroup = new THREE.Group();
  lensGroup.name = 'lensSetup';
  lensGroup.visible = false;

  // Object screen with illuminated cross
  const objectMount = new THREE.Group();
  objectMount.position.set(-0.9, 0.22, 0);
  const objBase = cyl(0.05, 0.05, 0.02, lab.matteBlack, 12);
  objBase.position.y = -0.14;
  objectMount.add(objBase);
  const objStand = cyl(0.012, 0.016, 0.16, lab.steel, 10);
  objStand.position.y = -0.06;
  objectMount.add(objStand);
  const objPlate = rbox(0.04, 0.2, 0.2, lab.matteBlack, 0.008);
  objectMount.add(objPlate);
  // glowing cross pattern
  const crossH = rbox(0.01, 0.02, 0.12, new THREE.MeshStandardMaterial({
    color: 0xffe4a0, emissive: 0xffcc55, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3,
  }), 0.002);
  const crossV = rbox(0.01, 0.12, 0.02, new THREE.MeshStandardMaterial({
    color: 0xffe4a0, emissive: 0xffcc55, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3,
  }), 0.002);
  crossH.position.x = 0.025;
  crossV.position.x = 0.025;
  objectMount.add(crossH);
  objectMount.add(crossV);
  const objLamp = new THREE.PointLight(0xffd080, 0.4, 1.5, 2);
  objLamp.position.set(-0.08, 0.05, 0);
  objectMount.add(objLamp);
  objectMount.userData.interactive = true;
  objectMount.userData.role = 'opt_object';
  lensGroup.add(objectMount);

  // Convex lens mount
  const lensMount = new THREE.Group();
  lensMount.position.set(-0.2, 0.22, 0);
  const lensBase = cyl(0.055, 0.055, 0.022, lab.matteBlack, 14);
  lensBase.position.y = -0.14;
  lensMount.add(lensBase);
  const lensStand = cyl(0.012, 0.018, 0.16, lab.steel, 10);
  lensStand.position.y = -0.06;
  lensMount.add(lensStand);
  const lensRing = torus(0.075, 0.01, lab.brass, 12, 32);
  lensRing.rotation.y = Math.PI / 2;
  lensMount.add(lensRing);
  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 24, 18),
    lab.warmGlass,
  );
  lensGlass.scale.set(0.22, 1, 1);
  lensMount.add(lensGlass);
  lensMount.userData.interactive = true;
  lensMount.userData.role = 'opt_lens';
  lensGroup.add(lensMount);

  // Image screen
  const imageMount = new THREE.Group();
  imageMount.position.set(0.55, 0.22, 0);
  const imgBase = cyl(0.05, 0.05, 0.02, lab.matteBlack, 12);
  imgBase.position.y = -0.14;
  imageMount.add(imgBase);
  const imgStand = cyl(0.012, 0.016, 0.16, lab.steel, 10);
  imgStand.position.y = -0.06;
  imageMount.add(imgStand);
  const imgPlate = rbox(0.025, 0.24, 0.24, lab.paper, 0.006);
  imageMount.add(imgPlate);
  // image of cross (blurred when out of focus)
  const imgCrossMat = new THREE.MeshStandardMaterial({
    color: 0x334155, emissive: 0xfbbf24, emissiveIntensity: 0.15,
    transparent: true, opacity: 0.85, metalness: 0, roughness: 0.6,
  });
  const imgCrossH = rbox(0.008, 0.015, 0.1, imgCrossMat, 0.002);
  const imgCrossV = rbox(0.008, 0.1, 0.015, imgCrossMat, 0.002);
  imgCrossH.position.x = -0.015;
  imgCrossV.position.x = -0.015;
  imageMount.add(imgCrossH);
  imageMount.add(imgCrossV);
  imageMount.userData.interactive = true;
  imageMount.userData.role = 'opt_image';
  imageMount.userData.imgCross = [imgCrossH, imgCrossV];
  imageMount.userData.imgCrossMat = imgCrossMat;
  lensGroup.add(imageMount);

  // Ray guide lines (object → lens → image)
  const rayMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.35, depthWrite: false,
  });
  const ray1 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), rayMat);
  ray1.rotation.z = Math.PI / 2;
  lensGroup.add(ray1);
  const ray2 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), rayMat.clone());
  ray2.rotation.z = Math.PI / 2;
  lensGroup.add(ray2);

  g.add(lensGroup);

  // ── Fraunhofer single/multi-slit mode (ported from danfen source) ──
  const diffractionGroup = new THREE.Group();
  diffractionGroup.name = 'diffractionSetup';
  diffractionGroup.visible = false;

  function spectralColor(nm) {
    let r = 0; let gg = 0; let b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { gg = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { gg = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
    else if (nm < 645) { r = 1; gg = -(nm - 645) / 65; }
    else r = 1;
    let f = 1;
    if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
    return new THREE.Color(
      THREE.MathUtils.clamp(r * f, 0, 1),
      THREE.MathUtils.clamp(gg * f, 0, 1),
      THREE.MathUtils.clamp(b * f, 0, 1),
    );
  }

  function makeDiffPost(x) {
    const post = new THREE.Group();
    post.position.x = x;
    const base = rbox(0.13, 0.04, 0.15, lab.matteBlack, 0.008);
    base.position.y = 0.12;
    post.add(base);
    const rod = cyl(0.012, 0.015, 0.3, lab.steel, 14);
    rod.position.y = 0.25;
    post.add(rod);
    diffractionGroup.add(post);
    return post;
  }

  const diffSource = makeDiffPost(-0.9);
  const diffLaserBody = cyl(0.04, 0.045, 0.23, lab.matteBlack, 24);
  diffLaserBody.rotation.z = Math.PI / 2;
  diffLaserBody.position.set(0, 0.39, 0);
  diffSource.add(diffLaserBody);
  const diffLaserNose = cyl(0.018, 0.035, 0.06, lab.steel, 18);
  diffLaserNose.rotation.z = Math.PI / 2;
  diffLaserNose.position.set(0.145, 0.39, 0);
  diffSource.add(diffLaserNose);
  const diffEmitterMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
  const diffEmitter = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), diffEmitterMat);
  diffEmitter.position.set(0.18, 0.39, 0);
  diffSource.add(diffEmitter);
  const diffHalo = new THREE.Mesh(
    new THREE.CircleGeometry(0.042, 32),
    new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  diffHalo.rotation.y = Math.PI / 2;
  diffHalo.position.set(0.181, 0.39, 0);
  diffSource.add(diffHalo);
  diffSource.userData.interactive = true;
  diffSource.userData.role = 'diff_source';
  const sourceHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.24),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  sourceHit.position.y = 0.32;
  sourceHit.userData.interactive = true;
  sourceHit.userData.role = 'diff_source';
  diffSource.add(sourceHit);

  const diffSlitMount = makeDiffPost(-0.34);
  const diffSlitFrame = rbox(0.035, 0.34, 0.36, lab.matteBlack, 0.008);
  diffSlitFrame.position.y = 0.39;
  diffSlitMount.add(diffSlitFrame);
  const diffSlitBars = new THREE.Group();
  diffSlitBars.position.y = 0.39;
  diffSlitMount.add(diffSlitBars);
  const diffSlitGlows = new THREE.Group();
  diffSlitGlows.position.set(-0.019, 0.39, 0);
  diffSlitMount.add(diffSlitGlows);
  diffSlitMount.userData.interactive = true;
  diffSlitMount.userData.role = 'diff_slit';
  const slitHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.4, 0.42),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  slitHit.position.y = 0.36;
  slitHit.userData.interactive = true;
  slitHit.userData.role = 'diff_slit';
  diffSlitMount.add(slitHit);

  const diffScreen = makeDiffPost(0.5);
  const diffScreenBack = rbox(0.035, 0.48, 0.62, lab.matteBlack, 0.008);
  diffScreenBack.position.y = 0.39;
  diffScreen.add(diffScreenBack);
  const diffScreenCanvas = document.createElement('canvas');
  diffScreenCanvas.width = 640;
  diffScreenCanvas.height = 240;
  const diffScreenCtx = diffScreenCanvas.getContext('2d');
  const diffScreenTex = new THREE.CanvasTexture(diffScreenCanvas);
  diffScreenTex.colorSpace = THREE.SRGBColorSpace;
  const diffScreenFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.42),
    new THREE.MeshBasicMaterial({ map: diffScreenTex, side: THREE.DoubleSide, toneMapped: false }),
  );
  diffScreenFace.rotation.y = -Math.PI / 2;
  diffScreenFace.position.set(-0.02, 0.39, 0);
  diffScreen.add(diffScreenFace);
  diffScreen.userData.interactive = true;
  diffScreen.userData.role = 'diff_screen';
  const screenHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.55, 0.7),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  screenHit.position.y = 0.35;
  screenHit.userData.interactive = true;
  screenHit.userData.role = 'diff_screen';
  diffScreen.add(screenHit);

  const diffBeamGroup = new THREE.Group();
  diffractionGroup.add(diffBeamGroup);
  const diffWaveGroup = new THREE.Group();
  diffWaveGroup.position.set(diffSlitMount.position.x, 0.392, 0);
  diffractionGroup.add(diffWaveGroup);
  const waveArcPositions = [];
  for (let j = 0; j <= 48; j++) {
    const angle = -0.95 + (1.9 * j) / 48;
    waveArcPositions.push(Math.cos(angle), 0, Math.sin(angle));
  }
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(waveArcPositions, 3));
    const wave = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x44ff88,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    wave.frustumCulled = false;
    diffWaveGroup.add(wave);
  }
  const diffLaserLight = new THREE.PointLight(0x44ff88, 0.55, 1.8, 2);
  diffLaserLight.position.set(-0.7, 0.42, 0);
  diffractionGroup.add(diffLaserLight);
  g.add(diffractionGroup);

  let diffSignature = '';
  let diffWavePhase = 0;
  function disposeChildren(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
  }

  function updateDiffraction(d) {
    const signature = [d.lightOn, d.lambdaNm, d.slitMm, d.pitchMm, d.N, d.distM, d.showBeam, d.showWave].join('|');
    if (signature === diffSignature) return;
    diffSignature = signature;
    const color = spectralColor(Number(d.lambdaNm || 550));
    const lit = !!d.lightOn;
    diffEmitterMat.color.copy(color);
    diffEmitter.visible = lit;
    diffHalo.material.color.copy(color);
    diffHalo.visible = lit;
    diffLaserLight.color.copy(color);
    diffLaserLight.visible = lit;
    diffWaveGroup.visible = lit && d.showWave !== false;
    diffWaveGroup.children.forEach((wave) => wave.material.color.copy(color));

    const nSlits = Math.max(1, Math.round(Number(d.N || 2)));
    const aV = THREE.MathUtils.clamp(Number(d.slitMm || 0.05) * 0.45, 0.006, 0.08);
    const pitchV = THREE.MathUtils.clamp(Number(d.pitchMm || 0.25) * 0.45, 0.02, 0.12);
    const centers = Array.from({ length: nSlits }, (_, i) => nSlits === 1 ? 0 : (i - (nSlits - 1) / 2) * pitchV);
    const plateHalf = Math.max(0.16, ((nSlits - 1) * pitchV + aV) / 2 + 0.035);
    disposeChildren(diffSlitBars);
    disposeChildren(diffSlitGlows);
    const barMat = lab.matteBlack.clone();
    const segments = [[-plateHalf, centers[0] - aV / 2]];
    for (let i = 0; i < centers.length - 1; i++) segments.push([centers[i] + aV / 2, centers[i + 1] - aV / 2]);
    segments.push([centers[centers.length - 1] + aV / 2, plateHalf]);
    for (const [z0, z1] of segments) {
      if (z1 - z0 < 0.001) continue;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, z1 - z0), barMat);
      bar.position.z = (z0 + z1) / 2;
      diffSlitBars.add(bar);
    }
    for (const z of centers) {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(0.004, aV * 0.85), 0.24),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: lit ? 0.85 : 0,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      glow.rotation.y = Math.PI / 2;
      glow.position.z = z;
      diffSlitGlows.add(glow);
    }

    const slitX = diffSlitMount.position.x;
    const screenX = slitX + 0.34 + ((Number(d.distM || 1) - 0.4) / 1.6) * 0.9;
    diffScreen.position.x = screenX;
    disposeChildren(diffBeamGroup);
    if (lit && d.showBeam !== false) {
      const inLen = slitX - (-0.72);
      const inBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.008, inLen, 12, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      inBeam.rotation.z = Math.PI / 2;
      inBeam.position.set(-0.72 + inLen / 2, 0.39, 0);
      diffBeamGroup.add(inBeam);
      const halfVisual = 0.28;
      const fanGeo = new THREE.BufferGeometry();
      fanGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        slitX, 0.39, 0,
        screenX - 0.025, 0.39, -halfVisual,
        screenX - 0.025, 0.39, halfVisual,
      ], 3));
      fanGeo.setIndex([0, 1, 2]);
      diffBeamGroup.add(new THREE.Mesh(
        fanGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      ));
    }

    const W = diffScreenCanvas.width;
    const H = diffScreenCanvas.height;
    diffScreenCtx.fillStyle = '#030509';
    diffScreenCtx.fillRect(0, 0, W, H);
    if (lit) {
      const image = diffScreenCtx.createImageData(W, H);
      const pixels = image.data;
      const half = diffractionHalfSpan(d);
      for (let col = 0; col < W; col++) {
        const x = ((col / (W - 1)) * 2 - 1) * half;
        const intensity = diffractionIntensity(x, d);
        const soft = Math.min(1, Math.pow(intensity / (intensity + 0.06), 0.8) * 1.08);
        for (let row = 0; row < H; row++) {
          const v = (row / (H - 1)) * 2 - 1;
          const bright = soft * Math.exp(-v * v * 1.6);
          const idx = (row * W + col) * 4;
          pixels[idx] = 4 + Math.round(color.r * 245 * bright);
          pixels[idx + 1] = 4 + Math.round(color.g * 245 * bright);
          pixels[idx + 2] = 8 + Math.round(color.b * 245 * bright);
          pixels[idx + 3] = 255;
        }
      }
      diffScreenCtx.putImageData(image, 0, 0);
    }
    diffScreenTex.needsUpdate = true;
  }

  function animateDiffraction(t, dt) {
    if (!diffractionGroup.visible) return;
    if (diffEmitter.visible) {
      diffEmitter.scale.setScalar(1 + 0.12 * Math.sin(t * 10));
      diffHalo.material.opacity = 0.3 + 0.2 * Math.sin(t * 7);
      diffLaserLight.intensity = 0.5 + 0.18 * Math.sin(t * 7);
    }
    if (!diffWaveGroup.visible) return;
    diffWavePhase = (diffWavePhase + dt * 2.5) % 2.2;
    diffWaveGroup.children.forEach((wave, i) => {
      const p = (diffWavePhase + i * 0.45) % 2.2;
      const radius = 0.04 + p * 0.12;
      wave.scale.set(radius, 1, radius);
      wave.material.opacity = 0.55 * (1 - p / 2.2);
    });
  }

  // Recognition targets
  const recognition = {
    opt_source: addRecognitionTarget(source, 'opt_source', [0.28, 0.22, 0.22], [0, 0, 0]),
    opt_prism: addRecognitionTarget(prismStage, 'opt_prism', [0.28, 0.28, 0.28], [0, 0.12, 0]),
    opt_screen: addRecognitionTarget(spectrumScreen, 'opt_screen', [0.1, 0.36, 0.46], [0, 0, 0]),
    opt_goniometer: addRecognitionTarget(gonio, 'opt_goniometer', [0.32, 0.12, 0.2], [0, 0, 0]),
    opt_object: addRecognitionTarget(objectMount, 'opt_object', [0.14, 0.28, 0.26], [0, 0, 0]),
    opt_lens: addRecognitionTarget(lensMount, 'opt_lens', [0.12, 0.28, 0.22], [0, 0, 0]),
    opt_image: addRecognitionTarget(imageMount, 'opt_image', [0.12, 0.32, 0.3], [0, 0, 0]),
    opt_rail: addRecognitionTarget(g, 'opt_rail', [2.2, 0.1, 0.24], [0, 0.08, 0]),
  };
  const recognitionRings = Object.fromEntries(
    Object.entries(recognition).map(([k, v]) => [k, v.outline]),
  );

  function setPartState(role, mode) {
    const ring = recognitionRings[role];
    if (!ring) return;
    if (mode === 'off') {
      ring.visible = false;
      ring.material.opacity = 0;
      return;
    }
    ring.visible = true;
    ring.material.color.setHex(mode === 'done' ? 0x4ade80 : 0xfbbf24);
    ring.material.opacity = mode === 'done' ? 0.95 : 1;
    ring.scale.setScalar(mode === 'done' ? 1.015 : 1.03);
  }

  function clearIdentifyVisuals() {
    Object.keys(recognitionRings).forEach((role) => setPartState(role, 'off'));
  }

  /** Map cm on optical bench to local X (object at -0.9 ≈ 0 cm, scale 0.018 m/cm) */
  const CM0 = -0.9;
  const CM_SCALE = 0.018;
  function cmToX(cm) {
    return CM0 + cm * CM_SCALE;
  }

  function setMode(mode) {
    // idle / diffraction 均展示单缝多缝装置
    prismGroup.visible = mode === 'prism';
    lensGroup.visible = mode === 'lens';
    diffractionGroup.visible = mode === 'diffraction' || mode === 'idle';
    if (mode === 'idle') {
      inBeamMat.opacity = 0;
      exitMats.forEach((m) => { m.opacity = 0; });
      spectrumBars.forEach((m) => { m.opacity = 0.12; m.emissiveIntensity = 0; });
      sourceLight.intensity = 0.1;
    }
  }

  function updateOptics(d) {
    if (!d) return;
    if (d.mode === 'diffraction') {
      setMode('diffraction');
      updateDiffraction(d);
      return;
    }
    if (d.mode === 'lens') {
      setMode('lens');
      lensMount.position.x = cmToX(Number(d.lensPos || 45));
      imageMount.position.x = cmToX(Number(d.screenPos || 80));
      objectMount.position.x = cmToX(Number(d.objectPos || 0));

      // rays: object → lens → screen
      const ox = objectMount.position.x;
      const lx = lensMount.position.x;
      const sx = imageMount.position.x;
      const y = 0.22;
      const mid1 = (ox + lx) / 2;
      const len1 = Math.max(0.05, Math.abs(lx - ox));
      ray1.position.set(mid1, y, 0);
      ray1.scale.set(1, len1, 1);
      const mid2 = (lx + sx) / 2;
      const len2 = Math.max(0.05, Math.abs(sx - lx));
      ray2.position.set(mid2, y, 0);
      ray2.scale.set(1, len2, 1);

      const score = Number(d.focusScore || 0);
      const mag = Math.max(0.15, Math.min(2.5, Math.abs(Number(d.magnification || 1))));
      // invert image when real image
      const flip = d.vImage != null && d.u > d.fTrue ? -1 : 1;
      imgCrossH.scale.set(1, 1 + (1 - score) * 2.5, mag);
      imgCrossV.scale.set(1, mag, 1 + (1 - score) * 2.5);
      imgCrossH.position.y = 0;
      imgCrossV.position.y = 0;
      imageMount.scale.y = flip > 0 ? 1 : 1; // keep upright visual, encode invert via color
      imgCrossMat.emissiveIntensity = 0.08 + score * 1.1;
      imgCrossMat.opacity = 0.35 + score * 0.6;
      imgCrossMat.emissive.setHex(score > 0.72 ? 0xfbbf24 : score > 0.4 ? 0x94a3b8 : 0x475569);
      rayMat.opacity = 0.2 + score * 0.35;
      if (ray2.material) ray2.material.opacity = rayMat.opacity;
      objLamp.intensity = 0.35 + score * 0.25;
      return;
    }

    // prism mode
    setMode('prism');
    const lightOn = !!d.lightOn;
    const angleDeg = Number(d.prismAngle || 0);
    prismStage.rotation.y = (angleDeg - 18) * (Math.PI / 180) * 0.6;
    paintGonio(Number(d.delta || 0), angleDeg);

    sourceLight.intensity = lightOn ? 1.1 : 0.08;
    lamp.material.emissiveIntensity = lightOn ? 1.6 : 0.15;
    inBeamMat.opacity = lightOn ? 0.55 : 0;
    inBeamMat.emissiveIntensity = lightOn ? 0.9 : 0.1;

    const spectrumOn = lightOn && !!d.spectrumVisible;
    const nearMin = !!d.atMinimum;
    const spreadGain = 0.7 + Math.min(1.2, Math.abs(angleDeg - 18) * 0.03);
    // shift spectrum laterally with deviation
    const zShift = (Number(d.delta || 40) - 40) * 0.004;
    spectrumGroup.position.z = zShift;
    spectrumBars.forEach((m, i) => {
      m.opacity = spectrumOn ? 0.55 + (nearMin ? 0.35 : 0) : 0.08;
      m.emissiveIntensity = spectrumOn ? (nearMin ? 1.4 : 0.7) : 0.05;
      // emphasize selected color line
      const names = ['red', 'red', 'yellow', 'green', 'blue', 'violet'];
      if (d.colorLine && d.colorLine !== 'white') {
        const active = names[i] === d.colorLine
          || (d.colorLine === 'red' && i <= 1)
          || (d.colorLine === 'violet' && i >= 4);
        m.opacity = spectrumOn ? (active ? 0.95 : 0.12) : 0.05;
        m.emissiveIntensity = spectrumOn && active ? 1.6 : 0.1;
      }
    });
    exitMats.forEach((m, i) => {
      m.opacity = spectrumOn ? 0.35 : 0;
      m.emissiveIntensity = spectrumOn ? 0.8 : 0;
      const beam = exitBeams.children[i];
      if (beam) {
        const spread = (i - 2.5) * 0.045 * spreadGain + zShift * 0.3;
        beam.position.set(0.55, 0.22, spread);
        beam.rotation.y = -spread * 0.9;
      }
    });
  }

  // Default showcase: single/double-slit diffraction bench
  updateOptics({
    mode: 'diffraction',
    lightOn: true,
    lambdaNm: 550,
    slitMm: 0.05,
    pitchMm: 0.25,
    N: 2,
    distM: 1,
    showBeam: true,
    showWave: true,
  });

  g.userData.setMode = setMode;
  g.userData.updateOptics = updateOptics;
  g.userData.setPartState = setPartState;
  g.userData.clearIdentifyVisuals = clearIdentifyVisuals;
  g.userData.prismGroup = prismGroup;
  g.userData.lensGroup = lensGroup;
  g.userData.diffractionGroup = diffractionGroup;
  g.userData.animateDiffraction = animateDiffraction;
  g.userData.interactive = true;
  g.userData.role = 'optics';
  return g;
}

// —— Hall-effect magnetic-field bench ——
function makeHallSetup() {
  const g = new THREE.Group();
  // ── Lab materials (matte / metallic, not neon toy glow) ──
  const lab = {
    brass: new THREE.MeshStandardMaterial({
      color: 0xc9a227, metalness: 0.95, roughness: 0.28, emissive: 0x3d3008, emissiveIntensity: 0.1,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x9aa3ad, metalness: 0.9, roughness: 0.28, emissive: 0x111418, emissiveIntensity: 0.05,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xf5f0e6, metalness: 0.02, roughness: 0.85, emissive: 0x222018, emissiveIntensity: 0.04,
    }),
    rubberRed: new THREE.MeshStandardMaterial({
      color: 0x991b1b, metalness: 0.05, roughness: 0.75, emissive: 0x2a0505, emissiveIntensity: 0.08,
    }),
    rubberBlack: new THREE.MeshStandardMaterial({
      color: 0x111111, metalness: 0.08, roughness: 0.72, emissive: 0x050505, emissiveIntensity: 0.06,
    }),
  };

  function bindingPost(x, y, z, colorMat, role, portId, wireColor) {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    const socket = cyl(0.018, 0.018, 0.008, colorMat, 24);
    socket.position.y = 0.004;
    grp.add(socket);
    const body = cyl(0.007, 0.007, 0.018, lab.brass, 16);
    body.position.y = 0.015;
    grp.add(body);
    const nut = cyl(0.012, 0.012, 0.007, lab.brass, 16);
    nut.position.y = 0.025;
    grp.add(nut);
    const socketHole = cyl(0.005, 0.005, 0.004, lab.rubberBlack, 16);
    socketHole.position.y = 0.031;
    grp.add(socketHole);

    const plug = new THREE.Group();
    const plugPin = cyl(0.0045, 0.0045, 0.018, lab.brass, 14);
    plugPin.position.y = 0.038;
    plug.add(plugPin);
    const plugSleeve = cyl(0.009, 0.011, 0.024, colorMat, 18);
    plugSleeve.position.y = 0.053;
    plug.add(plugSleeve);
    plug.visible = false;
    grp.add(plug);

    if (role) {
      grp.userData.interactive = true;
      grp.userData.role = role;
      grp.userData.portId = portId;
      grp.userData.wireColor = wireColor;
      grp.userData.plug = plug;
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.07, 0.055),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = 0.03;
      hit.userData.interactive = true;
      hit.userData.role = role;
      hit.userData.portId = portId;
      grp.add(hit);
    }
    return grp;
  }

  // ═══ HCC-2 Hall-effect magnetic-field bench ═══
  // Faithful compact reconstruction of the original Hall project: the long
  // solenoid, Helmholtz pair, transparent guide tube, ruler/probe and the
  // three-readout HCC-2 console remain visible as one complete instrument.
  const hallGroup = new THREE.Group();
  hallGroup.visible = true;

  const deckMat = new THREE.MeshStandardMaterial({ color: 0xd6d8da, metalness: 0.16, roughness: 0.48 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.28, roughness: 0.55 });
  const hallCopper = new THREE.MeshStandardMaterial({
    color: 0xb85b27, metalness: 0.82, roughness: 0.34,
    emissive: 0x321006, emissiveIntensity: 0.08,
  });
  const acrylic = new THREE.MeshPhysicalMaterial({
    color: 0xe8f7ff, transparent: true, opacity: 0.24, transmission: 0.76,
    roughness: 0.08, side: THREE.DoubleSide, depthWrite: false,
  });

  const hallBase = rbox(1.28, 0.08, 0.8, deckMat, 0.014);
  hallBase.position.y = 0.04;
  hallGroup.add(hallBase);

  // Long solenoid across the rear, always present just like the source model.
  // Full turn count N drawn procedurally with fwidth AA (no moiré). Wire
  // bump normals + roughness/metal variation restore copper depth and sheen.
  const hallSolenoid = new THREE.Group();
  hallSolenoid.position.set(0, 0.245, -0.24);
  const solTube = cyl(0.056, 0.056, 1.04, acrylic, 64);
  solTube.rotation.z = Math.PI / 2;
  hallSolenoid.add(solTube);

  const solWindUniforms = {
    uTurns: { value: 100 },
  };

  // Soft studio env so copper metalness has something to reflect (no scene env map)
  function makeSolenoidEnvMap() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#e8eef8');
    sky.addColorStop(0.42, '#8a96a8');
    sky.addColorStop(0.55, '#3a4250');
    sky.addColorStop(1, '#1a1412');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 256);
    // Key light
    ctx.fillStyle = 'rgba(255, 252, 245, 0.55)';
    ctx.beginPath();
    ctx.ellipse(160, 70, 70, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    // Warm fill (lab bounce)
    ctx.fillStyle = 'rgba(255, 170, 90, 0.4)';
    ctx.beginPath();
    ctx.ellipse(360, 190, 100, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cool rim
    ctx.fillStyle = 'rgba(140, 190, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(420, 60, 50, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const solEnvMap = makeSolenoidEnvMap();

  const solWindMat = new THREE.MeshStandardMaterial({
    color: 0xd4894a,
    metalness: 0.9,
    roughness: 0.28,
    emissive: 0x3a1206,
    emissiveIntensity: 0.1,
    envMap: solEnvMap,
    envMapIntensity: 0.95,
  });
  solWindMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTurns = solWindUniforms.uTurns;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vSolUv;
        varying vec3 vSolAxis;
        varying vec3 vSolCirc;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float axis = uv.y;
          float ang = atan(position.z, position.x);
          vSolUv = vec2(ang * 0.15915494309, axis);
          vec3 oRadial = normalize(vec3(position.x, 0.0, position.z) + vec3(1e-6, 0.0, 0.0));
          vec3 oAxis = vec3(0.0, 1.0, 0.0);
          vec3 oCirc = normalize(cross(oAxis, oRadial));
          vSolAxis = normalize(normalMatrix * oAxis);
          vSolCirc = normalize(normalMatrix * oCirc);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTurns;
        varying vec2 vSolUv;
        varying vec3 vSolAxis;
        varying vec3 vSolCirc;
        // Shared wind profile for color / normal / roughness (set in color_fragment)
        float solDetail;
        float solRidge;
        float solSin;
        float solCos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float turns = max(uTurns, 1.0);
          float phase = vSolUv.y * turns + vSolUv.x;
          float fw = max(fwidth(phase), 1e-4);
          float pxPerTurn = 1.0 / fw;
          // Full N when readable; fade only when undersampled (anti-moiré)
          solDetail = smoothstep(1.15, 2.9, pxPerTurn);
          float ang = phase * 6.28318530718;
          solCos = cos(ang);
          solSin = sin(ang);
          // Round enamel-wire cross-section (crest = wire body, trough = groove)
          solRidge = 0.5 + 0.5 * solCos;
          float micro = 0.5 + 0.5 * cos(ang * 2.0);
          float ridge = solRidge * 0.82 + micro * 0.18;
          float tone = mix(0.52, ridge, solDetail);
          // Deep contact shadow between turns
          float ao = mix(1.0, mix(0.42, 1.0, pow(max(solRidge, 0.0), 0.55)), solDetail);
          vec3 darkC = vec3(0.32, 0.12, 0.04);
          vec3 midC  = vec3(0.78, 0.44, 0.17);
          vec3 litC  = vec3(1.0, 0.78, 0.48);
          vec3 wind = mix(darkC, midC, smoothstep(0.1, 0.48, tone));
          wind = mix(wind, litC, smoothstep(0.48, 0.9, tone));
          // Specular copper edge on the wire crown
          wind = mix(wind, vec3(1.0, 0.88, 0.65), 0.18 * pow(solRidge, 2.0) * solDetail);
          diffuseColor.rgb = wind * ao;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          // Bright metal crowns, softer enamel in the valleys
          float rPeak = 0.14;
          float rValley = 0.55;
          roughnessFactor = mix(0.34, mix(rValley, rPeak, pow(solRidge, 1.35)), solDetail);
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        {
          metalnessFactor = mix(0.78, mix(0.72, 0.96, solRidge), solDetail);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Strong round-wire bump: each turn reads as a tube, not a flat stripe
          float bump = 1.15 * solDetail;
          float axialGain = clamp(uTurns * 0.014, 0.55, 1.85);
          float axial = solSin * bump * axialGain;
          float circ = solSin * bump * 0.38;
          float lift = solCos * bump * 0.55;
          // Slight helical twist on the normal for continuous-wire feel
          float twist = solCos * bump * 0.12;
          vec3 T = normalize(vSolAxis);
          vec3 B = normalize(vSolCirc);
          vec3 N = normalize(normal);
          vec3 nW = normalize(
            N * (1.0 + lift)
            - T * axial
            - B * (circ + twist)
          );
          normal = normalize(mix(N, nW, solDetail));
        }`,
      );
  };
  solWindMat.customProgramCacheKey = () => 'hall-solenoid-wind-aa-v5';

  // Corrugated radial profile gives real geometric depth (still one mesh, full N)
  function makeSolenoidWindGeometry(turns, length = 1.04, radius = 0.063, wireAmp = 0.0032) {
    const n = Math.round(THREE.MathUtils.clamp(turns, 10, 300));
    // ≥2 segs per turn so the sine profile is smooth; AA still handled in shader
    const heightSegs = Math.max(48, n * 2);
    const radialSegs = 64;
    const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegs, heightSegs, true);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const v = new THREE.Vector3();
    const rad = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Local Y is axis; map to 0..1 then to phase of N turns
      const t = THREE.MathUtils.clamp(v.y / length + 0.5, 0, 1);
      const ang = Math.atan2(v.z, v.x);
      const phase = t * n + ang / (Math.PI * 2);
      const ridge = Math.cos(phase * Math.PI * 2);
      const r = Math.hypot(v.x, v.z) || radius;
      const r2 = radius + wireAmp * ridge;
      const s = r2 / r;
      v.x *= s;
      v.z *= s;
      pos.setXYZ(i, v.x, v.y, v.z);
      // Approximate normal for round wire (outward + axial tilt)
      rad.set(v.x, 0, v.z).normalize();
      const dPhase = -Math.sin(phase * Math.PI * 2);
      const nrm = rad
        .clone()
        .multiplyScalar(1)
        .addScaledVector(new THREE.Vector3(0, 1, 0), dPhase * wireAmp * n * 0.35)
        .normalize();
      nor.setXYZ(i, nrm.x, nrm.y, nrm.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  let solWindBody = new THREE.Mesh(makeSolenoidWindGeometry(100), solWindMat);
  solWindBody.castShadow = true;
  solWindBody.receiveShadow = true;
  solWindBody.rotation.z = Math.PI / 2;
  hallSolenoid.add(solWindBody);

  let lastHallTurns = -1;
  function setHallSolenoidTurns(turns) {
    const count = Math.round(THREE.MathUtils.clamp(Number(turns || 100), 10, 300));
    if (count === lastHallTurns) return;
    lastHallTurns = count;
    // Full N in both shader and corrugated geometry
    solWindUniforms.uTurns.value = count;
    const prev = solWindBody.geometry;
    solWindBody.geometry = makeSolenoidWindGeometry(count);
    prev.dispose();
  }
  setHallSolenoidTurns(100);

  const solenoidSupportMat = new THREE.MeshStandardMaterial({
    color: 0x20282b,
    metalness: 0.52,
    roughness: 0.38,
  });
  const solenoidEndMat = new THREE.MeshPhysicalMaterial({
    color: 0x9bb8bd,
    transparent: true,
    opacity: 0.58,
    transmission: 0.18,
    metalness: 0.18,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });

  // Symmetrical end assemblies: a closed face and short collar flow into a
  // rounded cradle, then a slim stem and foot transfer the load to the deck.
  for (const sx of [-1, 1]) {
    const endX = sx * 0.52;

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.071, 0.071, 0.03, 48, 1, true),
      solenoidSupportMat,
    );
    collar.rotation.z = Math.PI / 2;
    collar.position.x = endX;
    hallSolenoid.add(collar);

    const endFace = new THREE.Mesh(new THREE.CircleGeometry(0.058, 48), solenoidEndMat);
    endFace.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    endFace.position.x = sx * 0.536;
    hallSolenoid.add(endFace);

    const cradle = new THREE.Mesh(
      new THREE.TorusGeometry(0.063, 0.009, 10, 48),
      solenoidSupportMat,
    );
    cradle.rotation.y = Math.PI / 2;
    cradle.position.x = endX;
    hallSolenoid.add(cradle);

    const stem = rbox(0.042, 0.078, 0.07, solenoidSupportMat, 0.012);
    stem.position.set(endX, -0.112, 0);
    hallSolenoid.add(stem);

    const foot = rbox(0.1, 0.024, 0.15, solenoidSupportMat, 0.012);
    foot.position.set(endX, -0.164, 0);
    hallSolenoid.add(foot);
  }
  hallGroup.add(hallSolenoid);

  // Helmholtz coils: thick multi-layer copper windings and clear flanges.
  const hallHelm = new THREE.Group();
  hallHelm.position.set(-0.04, 0.28, -0.02);
  function makeHallCoil() {
    const cg = new THREE.Group();
    const widthTurns = 20;
    const layerTurns = 12;
    const windings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.014, 6, 48), hallCopper, widthTurns * layerTurns,
    );
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let layer = 0; layer < layerTurns; layer++) {
      const radius = 0.1 + layer * ((0.132 - 0.1) / layerTurns);
      for (let w = 0; w < widthTurns; w++) {
        dummy.position.set(-0.02 + w * (0.04 / widthTurns), 0, 0);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.scale.setScalar(radius);
        dummy.updateMatrix();
        windings.setMatrixAt(idx++, dummy.matrix);
      }
    }
    windings.instanceMatrix.needsUpdate = true;
    cg.add(windings);
    for (const sx of [-1, 1]) {
      const flange = new THREE.Mesh(new THREE.RingGeometry(0.096, 0.152, 64), acrylic);
      flange.rotation.y = Math.PI / 2;
      flange.position.x = sx * 0.024;
      cg.add(flange);
    }
    const drum = cyl(0.096, 0.096, 0.048, acrylic, 64);
    drum.rotation.z = Math.PI / 2;
    cg.add(drum);
    const foot = rbox(0.06, 0.16, 0.085, blackMat, 0.004);
    foot.position.y = -0.19;
    cg.add(foot);
    return cg;
  }
  const hallLeftCoil = makeHallCoil();
  hallLeftCoil.position.x = -0.1;
  const hallRightCoil = makeHallCoil();
  hallRightCoil.position.x = 0.1;
  hallHelm.add(hallLeftCoil, hallRightCoil);
  hallGroup.add(hallHelm);

  // Transparent measuring tube runs through the Helmholtz pair.
  const guideTube = cyl(0.032, 0.032, 1, acrylic, 32);
  guideTube.rotation.z = Math.PI / 2;
  guideTube.position.set(0.04, 0.28, -0.02);
  hallGroup.add(guideTube);

  // Sliding white ruler and red Hall sensor; probe moves between both objects.
  const hallProbe = new THREE.Group();
  hallProbe.position.set(0, 0.28, -0.02);
  const probeRod = rbox(1, 0.016, 0.032, lab.paper, 0.002);
  probeRod.position.x = 0.5;
  hallProbe.add(probeRod);
  const tickGeometry = new THREE.BoxGeometry(0.0012, 0.0015, 0.012);
  const ticks = new THREE.InstancedMesh(tickGeometry, blackMat, 241);
  const tickDummy = new THREE.Object3D();
  for (let i = 0; i < 241; i++) {
    const scaleZ = i % 10 === 0 ? 2.4 : i % 5 === 0 ? 1.7 : 1;
    tickDummy.position.set(i * (0.96 / 240), 0.009, 0);
    tickDummy.scale.set(1, 1, scaleZ);
    tickDummy.updateMatrix();
    ticks.setMatrixAt(i, tickDummy.matrix);
  }
  ticks.instanceMatrix.needsUpdate = true;
  hallProbe.add(ticks);
  const sensorTip = rbox(0.036, 0.028, 0.035, new THREE.MeshStandardMaterial({
    color: 0xd71920, emissive: 0x68070a, emissiveIntensity: 0.42,
  }), 0.003);
  sensorTip.position.x = -0.02;
  hallProbe.add(sensorTip);
  hallGroup.add(hallProbe);

  function makeHallReadout(label, initial) {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 140;
    const cx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, emissive: 0x5a0000, emissiveIntensity: 0.65, roughness: 0.24 });
    let lastValue = null;
    const paint = (value) => {
      if (value === lastValue) return;
      lastValue = value;
      cx.fillStyle = '#090202'; cx.fillRect(0, 0, 320, 140);
      cx.strokeStyle = '#3f4044'; cx.lineWidth = 8; cx.strokeRect(4, 4, 312, 132);
      cx.fillStyle = '#ff2028'; cx.font = 'bold 64px Consolas, monospace'; cx.textAlign = 'center';
      cx.fillText(value, 160, 78);
      cx.fillStyle = '#72757a'; cx.font = '20px "Microsoft YaHei", sans-serif'; cx.fillText(label, 160, 118);
      texture.needsUpdate = true;
    };
    paint(initial);
    return { material, paint };
  }

  const readoutDefs = [
    makeHallReadout('励磁电流 Im(A)', '0.500'),
    makeHallReadout('霍尔电流 Is(mA)', '5.00'),
    makeHallReadout('霍尔电压 VH(mV)', '0.0'),
  ];
  const hallKnobs = [];
  readoutDefs.forEach((readout, i) => {
    const x = -0.38 + i * 0.38;
    const bezel = rbox(0.29, 0.018, 0.12, blackMat, 0.005);
    bezel.position.set(x, 0.095, 0.2);
    hallGroup.add(bezel);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.1), readout.material);
    face.rotation.x = -Math.PI / 2;
    face.position.set(x, 0.106, 0.2);
    hallGroup.add(face);
    const knob = cyl(0.034, 0.038, 0.022, lab.steel, 22);
    knob.position.set(x, 0.1, 0.32);
    const knobRole = i === 0 ? 'hall_knob_im' : i === 1 ? 'hall_knob_is' : 'hall_knob_zero';
    knob.userData.interactive = true;
    knob.userData.role = knobRole;
    const knobHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.08, 0.09),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    knobHit.userData.interactive = true;
    knobHit.userData.role = knobRole;
    knob.add(knobHit);
    const indicator = rbox(0.008, 0.004, 0.032, lab.paper, 0.001);
    indicator.position.set(0, 0.014, 0.017);
    knob.add(indicator);
    hallGroup.add(knob);
    hallKnobs.push(knob);
  });

  // Exactly three terminal pairs. Ports occupy the left column; silk-screen
  // labels occupy a separate right column so neither the supports nor wires
  // can cover the text.
  function makeTerminalLabel(primary, secondary, z, kind) {
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#30383d';
    ctx.fillStyle = '#30383d';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (kind !== 'output') {
      ctx.beginPath();
      ctx.moveTo(20, 72);
      ctx.lineTo(64, 72);
      for (let i = 0; i < 8; i++) {
        ctx.lineTo(64 + (i + 1) * 18, 72 + (i % 2 === 0 ? -18 : 18));
      }
      ctx.lineTo(250, 72);
      ctx.stroke();
      ctx.font = 'italic 32px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(kind === 'solenoid' ? 'L' : 'L1 — L2', 135, 42);
    } else {
      ctx.beginPath();
      ctx.moveTo(26, 72);
      ctx.lineTo(250, 72);
      ctx.stroke();
      ctx.font = 'italic 32px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Im', 138, 42);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 39px "Microsoft YaHei", sans-serif';
    ctx.fillText(primary, 286, 76);
    if (secondary) {
      ctx.fillStyle = '#5b6469';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.fillText(secondary, 286, 126);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.063),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(-0.37, 0.0815, z);
    hallGroup.add(label);
  }

  makeTerminalLabel('螺线管', '', -0.12, 'solenoid');
  makeTerminalLabel('亥姆霍兹线圈', '共轴线圈', -0.025, 'helmholtz');
  makeTerminalLabel('励磁电流输出', '', 0.07, 'output');

  const hallTerminalPorts = new Map();
  const terminalGroups = [
    {
      key: 'solenoid', role: 'hall_terminal_solenoid',
      sockets: [
        ['sol_black', -0.6, -0.12, lab.rubberBlack, 0x171717],
        ['sol_red', -0.535, -0.12, lab.rubberRed, 0xd72d2d],
      ],
    },
    {
      key: 'helmholtz', role: 'hall_terminal_helmholtz',
      sockets: [
        ['hh_black', -0.6, -0.025, lab.rubberBlack, 0x171717],
        ['hh_red', -0.535, -0.025, lab.rubberRed, 0xd72d2d],
      ],
    },
    {
      key: 'output', role: 'hall_terminal_output',
      sockets: [
        ['out_black', -0.6, 0.07, lab.rubberBlack, 0x171717],
        ['out_red', -0.535, 0.07, lab.rubberRed, 0xd72d2d],
      ],
    },
  ];
  terminalGroups.forEach(({ key, role, sockets }) => {
    sockets.forEach(([portId, x, z, material, wireColor]) => {
      const post = bindingPost(x, 0.084, z, material, role, portId, wireColor);
      post.userData.terminalGroup = key;
      hallGroup.add(post);
      hallTerminalPorts.set(portId, post);
    });
  });

  const hallWireLayer = new THREE.Group();
  hallGroup.add(hallWireLayer);
  const hallWirePreviewGeometry = new THREE.BufferGeometry();
  hallWirePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(32 * 3), 3));
  const hallWirePreviewMaterial = new THREE.LineBasicMaterial({ color: 0xd72d2d, transparent: true, opacity: 0.9 });
  const hallWirePreview = new THREE.Line(hallWirePreviewGeometry, hallWirePreviewMaterial);
  hallWirePreview.visible = false;
  hallWirePreview.frustumCulled = false;
  hallGroup.add(hallWirePreview);
  const hallWireRay = new THREE.Raycaster();
  const hallWirePlane = new THREE.Plane();
  const hallWireWorldPoint = new THREE.Vector3();
  const hallWirePlanePoint = new THREE.Vector3();
  const hallWirePlaneNormal = new THREE.Vector3();
  let hallWireSignature = '';

  const terminalAnchor = (portId) => {
    const post = hallTerminalPorts.get(portId);
    return post ? post.position.clone().add(new THREE.Vector3(0, 0.07, 0)) : null;
  };

  const makeCableCurve = (from, to) => {
    const span = from.distanceTo(to);
    const lift = THREE.MathUtils.clamp(0.055 + span * 0.22, 0.07, 0.18);
    const controlA = from.clone().add(new THREE.Vector3(0, lift, 0));
    const controlB = to.clone().add(new THREE.Vector3(0, lift, 0));
    return new THREE.CubicBezierCurve3(from, controlA, controlB, to);
  };

  const setHallWires = (wires = []) => {
    const signature = JSON.stringify(wires);
    if (signature === hallWireSignature) return;
    hallWireSignature = signature;
    while (hallWireLayer.children.length) {
      const wire = hallWireLayer.children.pop();
      wire.geometry?.dispose?.();
      wire.material?.dispose?.();
    }
    hallTerminalPorts.forEach((post) => { post.userData.plug.visible = false; });
    wires.forEach((pair) => {
      const [from, to] = Array.isArray(pair) ? pair : [pair?.from, pair?.to];
      const start = terminalAnchor(from);
      const end = terminalAnchor(to);
      if (!start || !end || from === to) return;
      const sourcePost = hallTerminalPorts.get(from);
      const cable = new THREE.Mesh(
        new THREE.TubeGeometry(makeCableCurve(start, end), 36, 0.006, 8, false),
        new THREE.MeshStandardMaterial({
          color: sourcePost?.userData.wireColor ?? 0xd72d2d,
          roughness: 0.68,
          metalness: 0.02,
        }),
      );
      cable.castShadow = true;
      hallWireLayer.add(cable);
      hallTerminalPorts.get(from).userData.plug.visible = true;
      hallTerminalPorts.get(to).userData.plug.visible = true;
    });
  };

  const startHallWirePreview = (portId) => {
    const post = hallTerminalPorts.get(portId);
    if (!post) return;
    hallWirePreviewMaterial.color.setHex(post.userData.wireColor ?? 0xd72d2d);
    hallWirePreview.visible = true;
  };

  const updateHallWirePreview = (fromPortId, cam, hoverPortId = null) => {
    const start = terminalAnchor(fromPortId);
    if (!start || !cam) return null;
    let snappedPortId = hoverPortId && hoverPortId !== fromPortId ? hoverPortId : null;
    let end = snappedPortId ? terminalAnchor(snappedPortId) : null;
    if (!end) {
      hallGroup.updateMatrixWorld(true);
      hallWireRay.setFromCamera(new THREE.Vector2(0, 0), cam);
      hallWirePlanePoint.set(0, 0.1, 0);
      hallGroup.localToWorld(hallWirePlanePoint);
      hallWirePlaneNormal.set(0, 1, 0).transformDirection(hallGroup.matrixWorld);
      hallWirePlane.setFromNormalAndCoplanarPoint(hallWirePlaneNormal, hallWirePlanePoint);
      if (hallWireRay.ray.intersectPlane(hallWirePlane, hallWireWorldPoint)) {
        end = hallWireWorldPoint.clone();
        hallGroup.worldToLocal(end);
      }
    }
    if (!end) end = start.clone();
    if (!snappedPortId) {
      let nearestDistance = 0.072;
      hallTerminalPorts.forEach((post, portId) => {
        if (portId === fromPortId) return;
        const anchor = terminalAnchor(portId);
        const distance = Math.hypot(anchor.x - end.x, anchor.z - end.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          snappedPortId = portId;
        }
      });
      if (snappedPortId) end = terminalAnchor(snappedPortId);
    }
    hallTerminalPorts.forEach((post, portId) => {
      post.scale.setScalar(portId === snappedPortId ? 1.18 : 1);
    });
    const curve = makeCableCurve(start, end);
    const attr = hallWirePreviewGeometry.attributes.position;
    for (let i = 0; i < 32; i++) {
      const point = curve.getPoint(i / 31);
      attr.setXYZ(i, point.x, point.y, point.z);
    }
    attr.needsUpdate = true;
    hallWirePreviewGeometry.computeBoundingSphere();
    hallWirePreview.visible = true;
    return snappedPortId;
  };

  const cancelHallWirePreview = () => {
    hallWirePreview.visible = false;
    hallTerminalPorts.forEach((post) => { post.scale.setScalar(1); });
  };
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 640; titleCanvas.height = 96;
  const titleCtx = titleCanvas.getContext('2d');
  titleCtx.fillStyle = '#d6d8da'; titleCtx.fillRect(0, 0, 640, 96);
  titleCtx.fillStyle = '#dc2626'; titleCtx.font = 'bold 44px "Microsoft YaHei", sans-serif'; titleCtx.textAlign = 'center';
  titleCtx.fillText('HCC-2型  霍尔效应测磁仪', 320, 62);
  const titleTex = new THREE.CanvasTexture(titleCanvas); titleTex.colorSpace = THREE.SRGBColorSpace;
  const titlePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.072), new THREE.MeshStandardMaterial({ map: titleTex }));
  titlePlate.rotation.x = -Math.PI / 2;
  titlePlate.position.set(0.18, 0.081, 0.07);
  hallGroup.add(titlePlate);

  // Magnetic field-line tracing follows the source Experiment3D implementation:
  // numerically integrate the axial/radial field of circular current loops.
  // Keep one textbook-style meridian slice instead of duplicating it around
  // the axis; this makes the field readable without a 3D starburst of lines.
  const helmholtzFieldLines = new THREE.Group();
  const solenoidFieldLines = new THREE.Group();
  helmholtzFieldLines.visible = false;
  solenoidFieldLines.visible = false;
  hallGroup.add(helmholtzFieldLines, solenoidFieldLines);

  const hallFieldMaterials = new Set();
  const hallFieldFlow = { direction: 1, speed: 0 };
  let hallFieldViewportWidth = window.innerWidth;
  let hallFieldViewportHeight = window.innerHeight;
  let helmholtzFieldSignature = '';
  let solenoidFieldBuilt = false;

  function getLoopField2D(x, radial, centreX, radius) {
    let bx = 0;
    let br = 0;
    const samples = 32;
    const dTheta = (Math.PI * 2) / samples;
    for (let i = 0; i < samples; i++) {
      const cosTheta = Math.cos(i * dTheta);
      const dx = x - centreX;
      const distanceSq = dx * dx + radial * radial + radius * radius
        - 2 * radius * radial * cosTheta;
      const distancePow = Math.pow(Math.max(distanceSq, 1e-7), 1.5);
      bx += ((radius * radius - radius * radial * cosTheta) / distancePow) * dTheta;
      br += ((radius * cosTheta * dx) / distancePow) * dTheta;
    }
    return { bx, br };
  }

  function traceAxisymmetricField(fieldAt, startX, startRadial, bounds, step, maxSteps) {
    const walk = (sign, includeStart) => {
      const points = [];
      let x = startX;
      let radial = startRadial;
      for (let i = 0; i < maxSteps; i++) {
        if (includeStart || i > 0) points.push({ x, radial });
        const { bx, br } = fieldAt(x, radial);
        const magnitude = Math.hypot(bx, br);
        if (!Number.isFinite(magnitude) || magnitude < 1e-8) break;
        x += sign * (bx / magnitude) * step;
        radial += sign * (br / magnitude) * step;
        if (x < bounds.minX || x > bounds.maxX
          || radial < bounds.minRadial || radial > bounds.maxRadial) break;
      }
      return points;
    };
    return [
      ...walk(-1, false).reverse(),
      ...walk(1, true),
    ];
  }

  function clearHallFieldGroup(group) {
    while (group.children.length) {
      const line = group.children.pop();
      if (line.material) hallFieldMaterials.delete(line.material);
      line.geometry?.dispose?.();
      line.material?.dispose?.();
    }
  }

  function addFlowingFieldLine(group, traced, axisY, axisZ, mirror = false) {
    if (traced.length < 6) return;
    const draw = (sign) => {
      const positions = [];
      traced.forEach(({ x, radial }) => {
        const y = axisY + sign * radial;
        if (y >= 0.08) {
          positions.push(x, y, axisZ);
        }
      });
      if (positions.length < 6) return;
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0,
        linewidth: 3.4,
        worldUnits: false,
        dashed: true,
        dashScale: 1,
        dashSize: 0.13,
        gapSize: 0.035,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        alphaToCoverage: true,
      });
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.frustumCulled = false;
      line.renderOrder = 8;
      line.raycast = () => {};
      group.add(line);
      hallFieldMaterials.add(material);
    };
    draw(1);
    if (mirror) draw(-1);
  }

  function rebuildHelmholtzFieldLines() {
    const leftCentre = hallHelm.position.x + hallLeftCoil.position.x;
    const rightCentre = hallHelm.position.x + hallRightCoil.position.x;
    const signature = `${leftCentre.toFixed(3)}:${rightCentre.toFixed(3)}`;
    if (signature === helmholtzFieldSignature) return;
    helmholtzFieldSignature = signature;
    clearHallFieldGroup(helmholtzFieldLines);

    const radius = 0.116;
    const fieldAt = (x, radial) => {
      const left = getLoopField2D(x, radial, leftCentre, radius);
      const right = getLoopField2D(x, radial, rightCentre, radius);
      return { bx: left.bx + right.bx, br: left.br + right.br };
    };
    const bounds = { minX: -0.38, maxX: 0.34, minRadial: 0, maxRadial: 0.22 };
    const centreX = (leftCentre + rightCentre) / 2;

    // 1. 从中心出发的大磁场线（4个采样，共7条线，填补中间空白）
    [0, 0.03, 0.06, 0.09].forEach((radial) => {
      const traced = traceAxisymmetricField(fieldAt, centreX, radial, bounds, 0.006, 420);
      addFlowingFieldLine(helmholtzFieldLines, traced, 0.28, -0.02, radial > 0);
    });

    // 2. 围绕左、右线圈顶部和底部的局部回旋圆（仅1个采样，共4条线）
    [0.13].forEach((radial) => {
      const tracedLeft = traceAxisymmetricField(fieldAt, leftCentre, radial, bounds, 0.006, 300);
      addFlowingFieldLine(helmholtzFieldLines, tracedLeft, 0.28, -0.02, true);

      const tracedRight = traceAxisymmetricField(fieldAt, rightCentre, radial, bounds, 0.006, 300);
      addFlowingFieldLine(helmholtzFieldLines, tracedRight, 0.28, -0.02, true);
    });
  }

  function buildSolenoidFieldLines() {
    if (solenoidFieldBuilt) return;
    solenoidFieldBuilt = true;
    const loopCentres = [];
    for (let x = -0.5; x <= 0.5001; x += 0.04) loopCentres.push(x);
    const fieldAt = (x, radial) => {
      let bx = 0;
      let br = 0;
      loopCentres.forEach((centreX) => {
        const field = getLoopField2D(x, radial, centreX, 0.063);
        bx += field.bx;
        br += field.br;
      });
      return { bx, br };
    };
    // 放宽至左右 -0.66 到 0.66，使两端的发散喇叭口能够充分舒展展开，同时防止超长远场发散
    const bounds = { minX: -0.66, maxX: 0.66, minRadial: 0, maxRadial: 0.20 };
    // 采样均在管内（半径0.063以内），保证管内平行细密，管口优雅发散
    [0, 0.015, 0.03, 0.045, 0.06].forEach((radial) => {
      const traced = traceAxisymmetricField(fieldAt, 0, radial, bounds, 0.006, 440);
      addFlowingFieldLine(solenoidFieldLines, traced, 0.245, -0.24, radial > 0);
    });
  }

  animators.push((time) => {
    if (hallFieldViewportWidth !== window.innerWidth
      || hallFieldViewportHeight !== window.innerHeight) {
      hallFieldViewportWidth = window.innerWidth;
      hallFieldViewportHeight = window.innerHeight;
      hallFieldMaterials.forEach((material) => {
        material.resolution.set(hallFieldViewportWidth, hallFieldViewportHeight);
      });
    }
    const offset = -time * hallFieldFlow.speed * hallFieldFlow.direction;
    hallFieldMaterials.forEach((material) => {
      material.dashOffset = offset;
    });
  });

  // Physical recognition targets, matching the Faraday identify workflow.
  function addHallRecognitionTarget(host, role, size, outlinePos = [0, 0, 0]) {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(...outlinePos);
    hit.userData.interactive = true;
    hit.userData.role = role;
    host.add(hit);

    const outline = makeSelectOutline(...size);
    outline.position.set(...outlinePos);
    host.add(outline);
    return { outline, hit };
  }
  const hallTargets = {
    hall_helmholtz: addHallRecognitionTarget(hallHelm, 'hall_helmholtz', [0.56, 0.4, 0.4], [0.04, -0.02, 0]),
    hall_solenoid: addHallRecognitionTarget(hallSolenoid, 'hall_solenoid', [1.12, 0.3, 0.22], [0, -0.03, 0]),
    hall_probe: addHallRecognitionTarget(hallProbe, 'hall_probe', [1.04, 0.08, 0.09], [0.48, 0, 0]),
    hall_console: addHallRecognitionTarget(hallGroup, 'hall_console', [1.25, 0.16, 0.34], [0, 0.08, 0.22]),
  };
  const hallRecognitionRings = {
    hall_helmholtz: hallTargets.hall_helmholtz.outline,
    hall_solenoid: hallTargets.hall_solenoid.outline,
    hall_probe: hallTargets.hall_probe.outline,
    hall_console: hallTargets.hall_console.outline,
  };
  const probeHitMesh = hallTargets.hall_probe.hit;
  function setHallRecognitionMode(role, mode) {
    const ring = hallRecognitionRings[role];
    if (!ring) return;
    if (mode === 'off') {
      ring.visible = false;
      ring.material.opacity = 0;
      return;
    }
    ring.visible = true;
    ring.material.color.setHex(mode === 'done' ? 0x4ade80 : 0x38bdf8);
    ring.material.opacity = mode === 'done' ? 0.95 : 1;
    ring.scale.setScalar(mode === 'done' ? 1.015 : 1.03);
  }
  // The source carrier animation is a second apparatus state on this same
  // electro bench. It never owns the renderer, camera, or page navigation.
  const hallDemoGroup = createHallDemoEquipment({ tabletop: true });
  g.add(hallGroup, hallDemoGroup);

  g.userData.hallGroup = hallGroup;
  g.userData.hallDemoGroup = hallDemoGroup;

  g.userData.setMode = (mode) => {
    hallGroup.visible = mode === 'hall';
    hallDemoGroup.visible = mode === 'hall-demo';
  };
  g.userData.updateHallDemo = (d, dt) => hallDemoGroup.userData.update?.(d, dt);

  g.userData.updateHall = (d) => {
    if (!d) return;
    const targetSolenoid = d.target === 'solenoid';
    if (probeHitMesh) {
      if (targetSolenoid) {
        // 长螺线管模式下放大探针拾取盒的 Y 和 Z，方便在管内被鼠标轻松点中
        probeHitMesh.scale.set(1, 3.8, 2.6);
      } else {
        probeHitMesh.scale.set(1, 1, 1);
      }
    }
    // Both devices remain present; only the probe changes measurement axis.
    hallProbe.position.z = targetSolenoid ? -0.24 : -0.02;
    hallProbe.position.y = targetSolenoid ? 0.245 : 0.28;
    // Source model maps the full −25…25 cm range to ±1.0 world units.
    hallProbe.position.x = THREE.MathUtils.clamp(Number(d.probePos || 0) / 25, -1, 1) * 1.0;
    hallRightCoil.position.x = -0.02
      + THREE.MathUtils.clamp((Number(d.rightCoilPos || 2.5) + 0.5) / 13.5, 0, 1) * 0.34;
    setHallSolenoidTurns(d.turns);
    const energy = d.wiring?.energized
      ? THREE.MathUtils.clamp(Number(d.Im || 0), 0, 1)
      : 0;
    hallCopper.emissiveIntensity = 0.12 + energy * 0.58;
    solWindMat.emissiveIntensity = 0.08 + energy * 0.5;
    const fieldVisible = energy > 0.01;
    if (fieldVisible) {
      if (targetSolenoid) buildSolenoidFieldLines();
      else rebuildHelmholtzFieldLines();
    }
    helmholtzFieldLines.visible = fieldVisible && !targetSolenoid;
    solenoidFieldLines.visible = fieldVisible && targetSolenoid;
    const turnGain = targetSolenoid
      ? THREE.MathUtils.clamp(Number(d.turns || 100) / 100, 0.2, 1.8)
      : 1;
    const fieldOpacity = Math.min(1, energy * 1.5 * turnGain) * 0.92;
    const fieldColor = (d.direction || 1) > 0 ? 0x0284c7 : 0xdb2777;
    hallFieldFlow.direction = (d.direction || 1) > 0 ? 1 : -1;
    hallFieldFlow.speed = fieldVisible ? 0.16 + energy * 0.28 : 0;
    hallFieldMaterials.forEach((material) => {
      material.opacity = fieldOpacity;
      material.color.setHex(fieldColor);
    });
    readoutDefs[0].paint(Number(d.Im || 0).toFixed(3));
    readoutDefs[1].paint(Number(d.Is || 0).toFixed(2));
    readoutDefs[2].paint(Number(d.vh || 0).toFixed(1));
    hallKnobs[0].rotation.y = -Math.PI * 0.75 + Number(d.Im || 0) * Math.PI * 1.5;
    hallKnobs[1].rotation.y = -Math.PI * 0.75 + (Number(d.Is || 0) / 10) * Math.PI * 1.5;
    setHallWires(d.wires || []);
  };
  g.userData.startHallWirePreview = startHallWirePreview;
  g.userData.updateHallWirePreview = updateHallWirePreview;
  g.userData.cancelHallWirePreview = cancelHallWirePreview;
  g.userData.setHallPartState = setHallRecognitionMode;
  g.userData.clearHallIdentifyVisuals = () => {
    Object.keys(hallRecognitionRings).forEach((role) => setHallRecognitionMode(role, 'off'));
  };
  g.userData.prewarmHall = (webglRenderer, activeCamera, targetScene) => {
    const wasVisible = hallGroup.visible;
    hallGroup.visible = true;
    webglRenderer.compile(hallGroup, activeCamera, targetScene);
    hallGroup.visible = wasVisible;
  };
  g.userData.prewarmHallDemo = (webglRenderer, activeCamera, targetScene) => {
    hallDemoGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
  };

  // helpers for experiment handlers / rail picking
  const _ray = new THREE.Raycaster();
  const _railOrigin = new THREE.Vector3();
  const _railDir = new THREE.Vector3();
  const _railEnd = new THREE.Vector3();
  const _camOrigin = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _v = new THREE.Vector3();
  /**
   * Identify selection ring only (outline around equipment — no full-body glow).
   * mode: 'off' | 'hover' | 'done'
   */
  function makeSelectOutline(sx, sy, sz) {
    const box = new THREE.BoxGeometry(sx, sy, sz);
    const edges = new THREE.EdgesGeometry(box);
    const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    box.dispose();
    edges.dispose();
    const mat = new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0,
      linewidth: 4,
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      depthTest: true,
      toneMapped: false,
    });
    const outline = new LineSegments2(geometry, mat);
    outline.computeLineDistances();
    outline.visible = false;
    outline.userData.isSelectRing = true;
    outline.raycast = () => {}; // never block picks
    return outline;
  }

  g.userData.interactive = true;
  g.userData.role = 'electro';
  g.userData.getHallProbePos = (cam, target = 'helmholtz') => {
    if (!cam) return null;
    const y = target === 'solenoid' ? 0.245 : 0.28;
    const z = target === 'solenoid' ? -0.24 : -0.02;
    _railOrigin.set(-0.27, y, z);
    _railEnd.set(0.27, y, z);
    hallGroup.localToWorld(_railOrigin);
    hallGroup.localToWorld(_railEnd);
    _railDir.subVectors(_railEnd, _railOrigin);
    _ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    _camOrigin.copy(_ray.ray.origin);
    _camDir.copy(_ray.ray.direction).normalize();
    _u.copy(_railDir);
    _v.copy(_camDir);
    _w.subVectors(_railOrigin, _camOrigin);
    const a = _u.dot(_u);
    const b = _u.dot(_v);
    const c = _v.dot(_v);
    const d0 = _u.dot(_w);
    const e0 = _v.dot(_w);
    const denom = a * c - b * b;
    let s = Math.abs(denom) < 1e-10 ? -d0 / a : (b * e0 - c * d0) / denom;
    s = THREE.MathUtils.clamp(s, 0, 1);
    return -25 + s * 50;
  };

  return g;
}

// —— Precision analysis station (balance + display) ——
function makeBalance() {
  const g = new THREE.Group();
  const base = rbox(0.5, 0.05, 0.35, mat.whiteGloss, 0.025);
  base.position.y = 0.025;
  g.add(base);

  // digital display panel
  const display = rbox(0.28, 0.16, 0.02, mat.carbon, 0.01);
  display.position.set(0, 0.35, -0.12);
  g.add(display);
  const screen = rbox(0.24, 0.12, 0.01, new THREE.MeshStandardMaterial({
    color: 0x67e8f9, emissive: 0x0891b2, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.3,
  }), 0.005);
  screen.position.set(0, 0.35, -0.105);
  g.add(screen);

  const column = cyl(0.02, 0.03, 0.28, mat.chrome, 12);
  column.position.y = 0.18;
  g.add(column);

  const beamPivot = new THREE.Group();
  beamPivot.position.y = 0.34;
  const beam = rbox(0.55, 0.02, 0.03, mat.silver, 0.008);
  beamPivot.add(beam);

  for (const sx of [-1, 1]) {
    const chain = new THREE.Group();
    chain.position.set(sx * 0.24, 0, 0);
    const pan = cyl(0.09, 0.08, 0.012, mat.chrome, 20);
    pan.position.y = -0.14;
    chain.add(pan);
    const panRing = torus(0.09, 0.006, mat.violetGlow, 6, 20);
    panRing.rotation.x = Math.PI / 2;
    panRing.position.y = -0.13;
    chain.add(panRing);
    chain.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.14, 0)]),
      new THREE.LineBasicMaterial({ color: 0xa78bfa })
    ));
    beamPivot.add(chain);
  }
  g.add(beamPivot);

  // weight set in cradle
  [0.035, 0.03, 0.025, 0.02].forEach((r, i) => {
    const w = cyl(r, r, 0.028, mat.chrome, 14);
    w.position.set(0.15 + i * 0.01, 0.07, 0.12);
    g.add(w);
  });

  animators.push((t) => {
    beamPivot.rotation.z = Math.sin(t * 0.65) * 0.05;
  });
  return g;
}

// —— Holographic data terminal ——
function makeHoloTerminal() {
  const g = new THREE.Group();
  const base = rbox(0.5, 0.04, 0.35, mat.carbon, 0.02);
  base.position.y = 0.02;
  g.add(base);
  // floating holo screens
  const screens = [];
  for (let i = 0; i < 3; i++) {
    const s = rbox(0.28 - i * 0.04, 0.2 - i * 0.03, 0.008, mat.hologram, 0.005);
    s.position.set(0, 0.25 + i * 0.08, -0.05 + i * 0.04);
    s.rotation.x = -0.15 - i * 0.05;
    g.add(s);
    screens.push(s);
  }
  // projector beam
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false,
    })
  );
  cone.position.set(0, 0.15, 0);
  cone.rotation.x = Math.PI;
  g.add(cone);

  animators.push((t) => {
    screens.forEach((s, i) => {
      s.position.y = 0.25 + i * 0.08 + Math.sin(t * 2 + i) * 0.015;
      s.material.opacity = 0.4 + 0.2 * Math.sin(t * 3 + i);
    });
  });
  return g;
}

// —— Beakers with tech stands ——
function makeBeaker(h = 0.15, r = 0.045, liquid = 0x38bdf8) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.95, h, 28, 1, true),
    mat.glass
  );
  wall.position.y = h / 2;
  g.add(wall);
  const rim = torus(r, 0.006, mat.chrome, 8, 24);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  g.add(rim);
  const bottom = cyl(r * 0.95, r * 0.95, 0.008, mat.glass, 24);
  bottom.position.y = 0.004;
  g.add(bottom);
  if (liquid != null) {
    const liq = cyl(r * 0.88, r * 0.88, h * 0.5, new THREE.MeshPhysicalMaterial({
      color: liquid, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.7,
      transmission: 0.35, emissive: liquid, emissiveIntensity: 0.15,
    }), 20);
    liq.position.y = h * 0.28;
    g.add(liq);
  }
  return g;
}

// —— Thermodynamics station ——
function makeThermoSetup() {
  const g = new THREE.Group();
  const base = rbox(0.7, 0.04, 0.42, mat.whiteGloss, 0.02);
  base.position.y = 0.02;
  g.add(base);
  const baseLed = rbox(0.65, 0.01, 0.38, mat.orangeGlow, 0.005);
  baseLed.position.y = 0.045;
  g.add(baseLed);

  // calorimeter
  const caloOuter = cyl(0.07, 0.07, 0.16, mat.chrome, 24);
  caloOuter.position.set(-0.18, 0.14, 0.02);
  g.add(caloOuter);
  const caloInner = cyl(0.055, 0.055, 0.12, mat.glass, 20);
  caloInner.position.set(-0.18, 0.14, 0.02);
  g.add(caloInner);
  const liquid = cyl(0.05, 0.05, 0.07, new THREE.MeshPhysicalMaterial({
    color: 0xff6b35, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.75,
    emissive: 0xff4400, emissiveIntensity: 0.2,
  }), 16);
  liquid.position.set(-0.18, 0.11, 0.02);
  g.add(liquid);
  const lid = cyl(0.075, 0.075, 0.02, mat.carbon, 20);
  lid.position.set(-0.18, 0.23, 0.02);
  g.add(lid);
  const stir = cyl(0.008, 0.008, 0.12, mat.chrome, 8);
  stir.position.set(-0.18, 0.28, 0.02);
  g.add(stir);

  // heat conduction rods (copper / aluminum / iron colors)
  const rodColors = [
    { c: 0xb87333, e: 0xff4400 },
    { c: 0xc0c8d0, e: 0xff8844 },
    { c: 0x6b7280, e: 0xff6622 },
  ];
  rodColors.forEach((rc, i) => {
    const rod = cyl(0.012, 0.012, 0.28, new THREE.MeshStandardMaterial({
      color: rc.c, metalness: 0.85, roughnessRoughness: 0.3,
      emissive: rc.e, emissiveIntensity: 0.15 + i * 0.05,
    }), 12);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0.12, 0.14, -0.1 + i * 0.1);
    g.add(rod);
    // cold / hot ends
    const cold = sphere(0.02, mat.blueGlow, 10);
    cold.position.set(-0.02, 0.14, -0.1 + i * 0.1);
    g.add(cold);
    const hot = sphere(0.02, mat.orangeGlow, 10);
    hot.position.set(0.26, 0.14, -0.1 + i * 0.1);
    g.add(hot);
  });
  // heater block on right
  const heater = rbox(0.1, 0.08, 0.28, mat.carbon, 0.015);
  heater.position.set(0.32, 0.1, 0);
  g.add(heater);
  const heatPadMat = new THREE.MeshStandardMaterial({
    color: 0xfdba74, emissive: 0xf97316, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.35,
  });
  const heatPad = rbox(0.08, 0.02, 0.24, heatPadMat, 0.008);
  heatPad.position.set(0.32, 0.15, 0);
  g.add(heatPad);

  // digital thermometer panel
  const panel = rbox(0.16, 0.12, 0.02, mat.carbon, 0.01);
  panel.position.set(-0.18, 0.32, -0.14);
  g.add(panel);
  const screen = rbox(0.13, 0.08, 0.01, new THREE.MeshStandardMaterial({
    color: 0xffddaa, emissive: 0xff6600, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.4,
  }), 0.005);
  screen.position.set(-0.18, 0.32, -0.125);
  g.add(screen);

  // molecular motion / gas model — floating spheres in a glass box
  const boxFrame = rbox(0.18, 0.14, 0.12, mat.glass, 0.01);
  boxFrame.position.set(0.05, 0.16, 0.12);
  g.add(boxFrame);
  const molecules = [];
  for (let i = 0; i < 8; i++) {
    const m = sphere(0.012, mat.orangeGlow, 8);
    m.position.set(
      0.05 + (Math.random() - 0.5) * 0.1,
      0.16 + (Math.random() - 0.5) * 0.08,
      0.12 + (Math.random() - 0.5) * 0.06
    );
    g.add(m);
    molecules.push({ mesh: m, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() });
  }

  animators.push((t) => {
    molecules.forEach(({ mesh, phase, speed }) => {
      mesh.position.x = 0.05 + Math.sin(t * speed + phase) * 0.05;
      mesh.position.y = 0.16 + Math.cos(t * speed * 1.3 + phase) * 0.04;
      mesh.position.z = 0.12 + Math.sin(t * speed * 0.8 + phase * 1.5) * 0.03;
    });
    heatPadMat.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 3);
    liquid.material.emissiveIntensity = 0.15 + 0.1 * Math.sin(t * 2);
  });

  g.userData.rods = [];
  g.children.forEach((ch) => {
    if (ch.isMesh && Math.abs(ch.position.y - 0.14) < 0.001 && Math.abs(ch.rotation.z - Math.PI / 2) < 0.01) {
      // clone material so heat can be unique per rod
      ch.material = ch.material.clone();
      g.userData.rods.push(ch);
    }
  });
  g.userData.heatPadMat = heatPadMat;
  g.userData.setRodHeat = (progress) => {
    g.userData.rods.forEach((rod, i) => {
      const speed = [1.0, 0.72, 0.48][i] || 0.5;
      const heat = Math.min(1, progress * speed * 1.35);
      rod.material.emissiveIntensity = 0.12 + heat * 1.3;
    });
    if (g.userData.heatPadMat) g.userData.heatPadMat.emissiveIntensity = 0.5 + progress * 0.9;
  };
  g.userData.interactive = true;
  g.userData.role = 'thermo';

  return g;
}

// ═══════════════════════════════════════════════
//  Place equipment by station theme
// ═══════════════════════════════════════════════
labLoader.setProgress(0.52, '部署实验仪器…');
// Table Y surfaces: side tables ~0.93, center island ~1.0
const TABLE_Y = 0.93;
const ISLAND_Y = 1.0;

// —— 力学 (back-left: -4.2, -2.8) ——
const cradle = makeNewtonsCradle();
cradle.position.set(-3.6, TABLE_Y, -2.8);
scene.add(cradle);

const pendulum = makePendulum();
pendulum.position.set(-4.5, TABLE_Y, -2.75);
scene.add(pendulum);

const spring = makeSpringMass();
spring.position.set(-5.3, TABLE_Y, -2.8);
scene.add(spring);

const balance = makeBalance();
balance.position.set(-2.9, TABLE_Y, -2.65);
scene.add(balance);

// —— 光学 (back-right: 4.2, -2.8) ——
const optics = makeOpticsBench();
optics.position.set(4.2, TABLE_Y, -2.8);
// Keep the optical axis parallel to the bench.  Even a small yaw here rotates
// the rail, laser, slit and screen as one unit and makes the setup look bent.
optics.rotation.y = 0;
scene.add(optics);

// prism / lens accessory beakers as optical liquids
[
  { o: makeBeaker(0.1, 0.03, 0xaaddff), p: [5.5, TABLE_Y, -2.5] },
  { o: makeBeaker(0.09, 0.028, 0xffe8aa), p: [5.7, TABLE_Y, -2.7] },
].forEach(({ o, p }) => {
  o.position.set(...p);
  scene.add(o);
});

// —— 电磁学 (front-left: -4.2, 2.6) ——
const hallBench = makeHallSetup();
hallBench.position.set(-4.0, TABLE_Y, 2.55);
scene.add(hallBench);

const multi = rbox(0.18, 0.05, 0.26, mat.carbon, 0.015);
multi.position.set(-5.1, TABLE_Y + 0.03, 2.7);
scene.add(multi);
const multiScreen = rbox(0.14, 0.01, 0.1, mat.greenGlow, 0.005);
multiScreen.position.set(-5.1, TABLE_Y + 0.06, 2.65);
scene.add(multiScreen);

// small coil / wire spool
const spool = cyl(0.05, 0.05, 0.06, mat.copper, 16);
spool.position.set(-3.3, TABLE_Y + 0.04, 2.85);
scene.add(spool);
const spoolCore = cyl(0.02, 0.02, 0.08, mat.carbon, 10);
spoolCore.position.set(-3.3, TABLE_Y + 0.05, 2.85);
scene.add(spoolCore);

// —— 热力学 (front-right: 4.2, 2.6) ——
const thermo = makeThermoSetup();
thermo.position.set(4.2, TABLE_Y, 2.6);
scene.add(thermo);

[
  { o: makeBeaker(0.13, 0.04, 0xff6644), p: [5.2, TABLE_Y, 2.35] },
  { o: makeBeaker(0.12, 0.038, 0x44aaff), p: [5.45, TABLE_Y, 2.55] },
].forEach(({ o, p }) => {
  o.position.set(...p);
  scene.add(o);
});

// —— 中央岛：全息终端（不改动定位逻辑） ——
const holo = makeHoloTerminal();
holo.position.set(0, ISLAND_Y, 0.3);
scene.add(holo);

[
  { o: makeBeaker(0.14, 0.042, 0xa78bfa), p: [0.7, ISLAND_Y, 0.2] },
  { o: makeBeaker(0.11, 0.032, 0xfbbf24), p: [1.0, ISLAND_Y, 0.5] },
].forEach(({ o, p }) => {
  o.position.set(...p);
  scene.add(o);
});

// ═══════════════════════════════════════════════
//  Interactive wall display — formula & concept board
// ═══════════════════════════════════════════════
function makeInteractiveFormulaBoard() {
  const g = new THREE.Group();
  const boardW = 4.4;
  const boardH = 2.05;
  const c = document.createElement('canvas');
  // Higher resolution for large wall fonts / crisp UI
  c.width = 1920;
  c.height = 900;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const state = {
    category: 'all',
    selectedId: null,
  };
  let hitRegions = [];

  function redraw() {
    const result = drawFormulaBoard(ctx, c.width, c.height, state);
    hitRegions = result.hits || [];
    tex.needsUpdate = true;
  }
  redraw();

  const screenMat = new THREE.MeshStandardMaterial({
    map: tex,
    metalness: 0.15,
    roughness: 0.35,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.1,
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW, boardH),
    screenMat,
  );
  screen.position.z = 0.02;
  g.add(screen);

  // back plate
  const plate = rbox(boardW + 0.08, boardH + 0.08, 0.05, mat.carbon, 0.02);
  plate.position.z = -0.01;
  g.add(plate);

  // invisible hit volume (slightly larger for easier aiming)
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(boardW + 0.15, boardH + 0.15, 0.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.z = 0.05;
  g.add(hit);

  const tag = (o) => {
    o.userData.type = 'formula_board';
    o.userData.interactive = true;
    o.userData.role = 'formula_board';
    // Only interact within ~1/3 of lab depth to avoid accidental activation from afar
    o.userData.maxInteractDist = FRONT_WALL_DISPLAY_MAX_DIST;
  };
  tag(g);
  tag(screen);
  tag(hit);
  tag(plate);

  g.userData.screen = screen;
  g.userData.state = state;
  g.userData.redraw = redraw;
  g.userData.maxInteractDist = FRONT_WALL_DISPLAY_MAX_DIST;

  g.userData.pickFromRay = (rc) => {
    screen.updateMatrixWorld(true);
    const hs = rc.intersectObject(screen, false);
    if (!hs.length || !hs[0].uv) return null;
    // Distance gate: board only responds in the front third of the lab
    if (hs[0].distance > FRONT_WALL_DISPLAY_MAX_DIST) return null;
    return pickFormulaBoard(hs[0].uv.x, hs[0].uv.y, c.width, c.height, hitRegions);
  };

  g.userData.applyPick = (pick) => {
    if (!pick?.action) return false;
    if (pick.action === 'category' && pick.categoryId) {
      state.category = pick.categoryId;
      state.selectedId = null;
      redraw();
      const cat = FORMULA_CATALOG.categories.find((c) => c.id === pick.categoryId);
      showToast(`分类：${cat?.name || pick.categoryId}`);
      return true;
    }
    if (pick.action === 'select' && pick.itemId) {
      state.selectedId = pick.itemId;
      redraw();
      const item = FORMULA_CATALOG.items.find((it) => it.id === pick.itemId);
      showToast(item ? `概念：${item.title}` : '已打开概念详情');
      return true;
    }
    if (pick.action === 'back') {
      state.selectedId = null;
      redraw();
      showToast('返回公式列表');
      return true;
    }
    return false;
  };

  // gentle idle emissive pulse
  animators.push((t) => {
    screenMat.emissiveIntensity = 0.08 + 0.04 * Math.sin(t * 1.2);
  });

  return g;
}

const formulaBoard = makeInteractiveFormulaBoard();
formulaBoard.position.set(0, 2.45, -ROOM_D / 2 + 0.14);
scene.add(formulaBoard);
// frame glow
const boardFrame = rbox(4.55, 2.2, 0.04, mat.cyanGlow, 0.02);
boardFrame.position.set(0, 2.45, -ROOM_D / 2 + 0.1);
scene.add(boardFrame);
const boardLight = new THREE.RectAreaLight(0xbae6fd, 3.2, 4.4, 2.0);
boardLight.position.set(0, 2.45, -ROOM_D / 2 + 0.4);
boardLight.lookAt(0, 2.45, 0);
scene.add(boardLight);

// ═══════════════════════════════════════════════
//  Side wall holographic posters
// ═══════════════════════════════════════════════
function makeTechPoster(title, subtitle, accent, x, z, rotY) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 480;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 320, 480);
  g.addColorStop(0, '#f0f9ff');
  g.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 480);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 296, 456);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(12, 12, 296, 60);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 160, 52);
  ctx.fillStyle = '#64748b';
  ctx.font = '14px sans-serif';
  ctx.fillText(subtitle, 160, 90);

  // abstract tech diagram
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(160, 240, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(160, 240, 45, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(160 + Math.cos(a) * 45, 240 + Math.sin(a) * 45);
    ctx.lineTo(160 + Math.cos(a) * 70, 240 + Math.sin(a) * 70);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(160, 240, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  ctx.fillText('MODULE  ·  ACTIVE', 160, 420);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = rbox(0.85, 1.25, 0.03, new THREE.MeshStandardMaterial({
    map: tex, metalness: 0.15, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.05,
  }), 0.02);
  mesh.position.set(x, 2.0, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  // LED strip under poster
  const strip = rbox(0.7, 0.015, 0.02, mat.cyanGlow, 0.005);
  strip.position.set(x + Math.sin(rotY) * 0.02, 1.32, z + Math.cos(rotY) * 0.02);
  strip.rotation.y = rotY;
  scene.add(strip);
}

// side-wall tech posters removed — replaced by physicist portrait gallery

// ═══════════════════════════════════════════════
//  Server racks / equipment columns
// ═══════════════════════════════════════════════
function makeServerRack() {
  const g = new THREE.Group();
  const body = rbox(0.55, 1.9, 0.45, mat.whiteGloss, 0.03);
  body.position.y = 0.95;
  g.add(body);
  for (let i = 0; i < 8; i++) {
    const slot = rbox(0.48, 0.12, 0.02, mat.carbon, 0.01);
    slot.position.set(0, 0.3 + i * 0.2, 0.22);
    g.add(slot);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x6ee7b7, emissive: 0x10b981, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.35,
    });
    const led = sphere(0.012, ledMat, 8);
    led.position.set(0.18, 0.3 + i * 0.2, 0.24);
    g.add(led);
    const phase = i * 1.7;
    animators.push((t) => {
      ledMat.emissiveIntensity = 0.35 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3 + phase));
    });
  }
  const topBar = rbox(0.5, 0.03, 0.4, mat.cyanGlow, 0.01);
  topBar.position.y = 1.92;
  g.add(topBar);
  return g;
}
const rack1 = makeServerRack();
rack1.position.set(-ROOM_W / 2 + 0.5, 0, 5.2);
scene.add(rack1);
const rack2 = makeServerRack();
rack2.position.set(ROOM_W / 2 - 0.5, 0, 5.2);
scene.add(rack2);

// Sliding door
const door = rbox(1.3, 2.4, 0.08, mat.darkGlass, 0.03);
door.position.set(ROOM_W / 2 - 2.2, 1.2, ROOM_D / 2 - 0.08);
scene.add(door);
const doorFrame = rbox(1.45, 2.55, 0.05, mat.chrome, 0.02);
doorFrame.position.set(ROOM_W / 2 - 2.2, 1.2, ROOM_D / 2 - 0.12);
scene.add(doorFrame);
const doorLed = rbox(1.35, 0.02, 0.03, mat.cyanGlow, 0.005);
doorLed.position.set(ROOM_W / 2 - 2.2, 2.45, ROOM_D / 2 - 0.05);
scene.add(doorLed);

// ═══════════════════════════════════════════════
//  Portrait frames — famous physicists (local assets)
// ═══════════════════════════════════════════════
labLoader.setProgress(0.68, '加载科学家肖像…');

const loadingManager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader(loadingManager);
const portraitLoadPromises = [];

let portraitsDone = 0;
const PORTRAIT_TOTAL = 8;

/** @returns {Promise<THREE.Texture | null>} */
function loadPortraitTexture(url) {
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        portraitsDone += 1;
        const t = portraitsDone / PORTRAIT_TOTAL;
        labLoader.setProgress(0.68 + t * 0.2, `加载科学家肖像… ${portraitsDone}/${PORTRAIT_TOTAL}`);
        resolve(tex);
      },
      undefined,
      () => {
        portraitsDone += 1;
        const t = portraitsDone / PORTRAIT_TOTAL;
        labLoader.setProgress(0.68 + t * 0.2, `加载科学家肖像… ${portraitsDone}/${PORTRAIT_TOTAL}`);
        resolve(null);
      },
    );
  });
}

function makeNameplate(name, years) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(0, 0, 512, 3);
  ctx.fillStyle = '#f8fafc';
  // Chinese names need slightly smaller type to fit long strings
  ctx.font = name.length > 6
    ? 'bold 26px "Microsoft YaHei", "Segoe UI", sans-serif'
    : 'bold 30px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, 256, 42);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px "Segoe UI", sans-serif';
  ctx.fillText(years, 256, 74);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePortraitFrame(imageUrl, name, years, w = 0.72, h = 0.92) {
  const g = new THREE.Group();
  const frameDepth = 0.04;
  const border = 0.045;

  // outer metallic frame
  const outer = rbox(w + border * 2, h + border * 2 + 0.12, frameDepth, mat.chrome, 0.015);
  outer.position.z = -frameDepth / 2;
  g.add(outer);

  // inner dark mat
  const matte = rbox(w + border * 0.7, h + border * 0.7, 0.012, mat.carbon, 0.008);
  matte.position.z = 0.002;
  g.add(matte);

  // portrait plane
  const photoMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc, metalness: 0.05, roughness: 0.45,
  });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat);
  photo.position.z = 0.012;
  g.add(photo);

  const portraitPromise = loadPortraitTexture(imageUrl).then((tex) => {
    if (tex) {
      photoMat.map = tex;
      photoMat.color.set(0xffffff);
      photoMat.needsUpdate = true;
    } else {
      // fallback: soft placeholder if image missing
      photoMat.color.set(0x94a3b8);
      photoMat.emissive = new THREE.Color(0x1e293b);
      photoMat.emissiveIntensity = 0.2;
    }
  });
  portraitLoadPromises.push(portraitPromise);

  // glass cover
  const cover = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.01, h + 0.01),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 0.9,
      thickness: 0.02, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
    })
  );
  cover.position.z = 0.02;
  g.add(cover);

  // nameplate under portrait
  const plateW = w + border * 1.6;
  const plate = rbox(plateW, 0.1, 0.02, mat.carbon, 0.01);
  plate.position.set(0, -(h / 2 + border + 0.02), 0.01);
  g.add(plate);
  const nameTex = makeNameplate(name, years);
  const nameMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(plateW * 0.95, 0.085),
    new THREE.MeshStandardMaterial({ map: nameTex, metalness: 0.1, roughness: 0.5 })
  );
  nameMesh.position.set(0, -(h / 2 + border + 0.02), 0.022);
  g.add(nameMesh);

  // subtle LED edge under frame
  const led = rbox(w + border * 2, 0.012, 0.012, mat.cyanGlow, 0.003);
  led.position.set(0, -(h / 2 + border + 0.08), 0.01);
  g.add(led);

  // small point light for portrait highlight
  const pl = new THREE.PointLight(0xfff5e6, 0.25, 1.8, 2);
  pl.position.set(0, 0.15, 0.35);
  g.add(pl);

  return g;
}

// left wall portraits
const portraitsLeft = [
  { file: 'einstein.jpg', name: '阿尔伯特·爱因斯坦', years: '1879 – 1955', z: -3.8 },
  { file: 'newton.jpg', name: '艾萨克·牛顿', years: '1643 – 1727', z: -1.6 },
  { file: 'curie.jpg', name: '玛丽·居里', years: '1867 – 1934', z: 0.6 },
  { file: 'galileo.jpg', name: '伽利略·伽利莱', years: '1564 – 1642', z: 2.8 },
];
portraitsLeft.forEach(({ file, name, years, z }) => {
  const f = makePortraitFrame(`assets/portraits/${file}`, name, years);
  f.position.set(-ROOM_W / 2 + 0.14, 1.85, z);
  f.rotation.y = Math.PI / 2;
  scene.add(f);
});

// right wall portraits
const portraitsRight = [
  { file: 'maxwell.jpg', name: '詹姆斯·麦克斯韦', years: '1831 – 1879', z: -3.8 },
  { file: 'faraday.jpg', name: '迈克尔·法拉第', years: '1791 – 1867', z: -1.6 },
  { file: 'tesla.jpg', name: '尼古拉·特斯拉', years: '1856 – 1943', z: 0.6 },
  { file: 'planck.jpg', name: '马克斯·普朗克', years: '1858 – 1947', z: 2.8 },
];
portraitsRight.forEach(({ file, name, years, z }) => {
  const f = makePortraitFrame(`assets/portraits/${file}`, name, years);
  f.position.set(ROOM_W / 2 - 0.14, 1.85, z);
  f.rotation.y = -Math.PI / 2;
  scene.add(f);
});


// ═══════════════════════════════════════════════
//  Holo projectors — volumetric double-sided holograms
//  · Front & back both readable / interactive
//  · Soft-face the player; switch primary side by camera side
// ═══════════════════════════════════════════════
labLoader.setProgress(0.82, '同步全息终端…');

const STATION_LABEL = {
  mechanics: '力学实验台',
  optics: '光学实验台',
  electro: '电磁学实验台',
  thermo: '热力学实验台',
};
const STATION_EN = {
  mechanics: 'MECHANICS',
  optics: 'OPTICS',
  electro: 'ELECTRO',
  thermo: 'THERMO',
};

/** Shared temps for holo billboard / side tests (avoid GC in animate) */
const _holoWorldPos = new THREE.Vector3();
const _holoCamDir = new THREE.Vector3();
const _holoFront = new THREE.Vector3();
const _holoParentQuat = new THREE.Quaternion();
const _holoParentEuler = new THREE.Euler();

function makeHoloPanel(stationId, title, accentHex, accentNum = 0x38bdf8) {
  const g = new THREE.Group();
  const panelW = 0.82;
  const panelH = 0.54;
  const fullTitle = STATION_LABEL[stationId] || title;
  const enTitle = STATION_EN[stationId] || 'STATION';

  // ── Projector pedestal on tabletop ──
  const base = rbox(0.32, 0.04, 0.32, mat.carbon, 0.02);
  base.position.y = 0.02;
  g.add(base);
  const ring = torus(0.11, 0.012, mat.chrome, 10, 36);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.045;
  g.add(ring);
  const plate = cyl(0.09, 0.1, 0.028, mat.silver, 24);
  plate.position.y = 0.06;
  g.add(plate);
  const emitter = cyl(0.05, 0.038, 0.032, mat.chrome, 20);
  emitter.position.y = 0.09;
  g.add(emitter);

  const coreMat = new THREE.MeshStandardMaterial({
    color: accentNum, emissive: accentNum, emissiveIntensity: 1.35,
    metalness: 0.15, roughness: 0.28, transparent: true, opacity: 0.95,
  });
  const core = sphere(0.026, coreMat, 16);
  core.position.y = 0.12;
  g.add(core);

  const ledMat = new THREE.MeshStandardMaterial({
    color: accentNum, emissive: accentNum, emissiveIntensity: 1.1, metalness: 0.25, roughness: 0.35,
  });
  const ledRing = torus(0.115, 0.006, ledMat, 8, 40);
  ledRing.rotation.x = Math.PI / 2;
  ledRing.position.y = 0.048;
  g.add(ledRing);

  // volumetric beam cone (tip into emitter)
  const coneMat = new THREE.MeshBasicMaterial({
    color: accentNum, transparent: true, opacity: 0.1,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 28, 1, true), coneMat);
  cone.position.y = 0.42;
  cone.rotation.x = Math.PI;
  g.add(cone);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.08,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.07, 0.5, 12, 1, true), beamMat);
  beam.position.y = 0.38;
  g.add(beam);

  // energy rings in the beam
  const spinRings = [];
  for (let i = 0; i < 3; i++) {
    const rm = new THREE.MeshBasicMaterial({
      color: accentNum, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const sr = torus(0.07 + i * 0.03, 0.004, rm, 6, 32);
    sr.rotation.x = Math.PI / 2;
    sr.position.y = 0.24 + i * 0.11;
    g.add(sr);
    spinRings.push({ mesh: sr, mat: rm, i });
  }

  // ── Floating hologram group (yaw tracks player) ──
  const floatG = new THREE.Group();
  floatG.position.set(0, 0.72, 0);
  g.add(floatG);

  // ── Canvas UI (full interactive screen on hologram) ──
  let c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  let ctx = c.getContext('2d');
  let lastDrawKey = '';
  let hitRegions = [];
  let boundHud = null;
  let boundDataHtml = '';

  const FLOAT_Y_NORMAL = 0.72;
  g.userData.maximized = false;
  g.userData._floatBaseY = FLOAT_Y_NORMAL;
  g.userData.accentHex = accentHex;
  g.userData.fullTitle = fullTitle;
  g.userData.enTitle = enTitle;

  const createScreenTexture = () => {
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  let tex = createScreenTexture();

  // Front + back planes (back rotated so text is not mirrored)
  const makeFaceMat = () => new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.88,
    side: THREE.FrontSide,
    depthWrite: false,
    toneMapped: false,
  });
  const frontMat = makeFaceMat();
  const backMat = makeFaceMat();

  const front = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), frontMat);
  front.position.z = 0.008;
  floatG.add(front);

  const backFace = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), backMat);
  backFace.rotation.y = Math.PI; // correct text orientation from behind
  backFace.position.z = -0.008;
  floatG.add(backFace);

  // Dedicated pick targets (have UVs — unlike the broad hit box)
  g.userData.screenFaces = [front, backFace];

  const holoLight = new THREE.PointLight(accentNum, 0.55, 2.6, 2);
  holoLight.position.set(0, 0.55, 0);
  g.add(holoLight);

  // Thick hit volume — both sides of the projection
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(panelW + 0.2, panelH + 0.45, 0.55),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.set(0, FLOAT_Y_NORMAL, 0);
  g.add(hit);

  const syncScreenLayout = (active) => {
    const layout = getHoloScreenLayoutSize({
      active: !!active,
      hud: active ? boundHud : null,
      dataHtml: boundDataHtml,
    });
    if (layout.width === c.width && layout.height === c.height) return false;

    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = layout.width;
    nextCanvas.height = layout.height;
    c = nextCanvas;
    ctx = c.getContext('2d');
    const previousTexture = tex;
    tex = createScreenTexture();
    frontMat.map = tex;
    backMat.map = tex;
    frontMat.needsUpdate = true;
    backMat.needsUpdate = true;
    g.userData.tex = tex;
    previousTexture.dispose();
    const sx = layout.width / 1024;
    const sy = layout.height / 640;
    front.scale.set(sx, sy, 1);
    backFace.scale.set(sx, sy, 1);
    hit.scale.set(sx, sy, 1);
    g.userData._floatBaseY = FLOAT_Y_NORMAL + (panelH * (sy - 1)) / 2;
    g.userData.canvasW = layout.width;
    g.userData.canvasH = layout.height;
    g.userData.screenWorldSize = { width: panelW * sx, height: panelH * sy };
    return true;
  };

  const draw = (active, force = false) => {
    const layoutChanged = syncScreenLayout(active);
    const rev = boundHud?._rev ?? 0;
    const maxed = g.userData.maximized ? 1 : 0;
    const key = `${active ? 1 : 0}|${maxed}|${rev}|${boundHud?.expId || ''}|${boundHud?.stepIndex ?? ''}|${c.width}x${c.height}|${boundDataHtml.slice(0, 48)}`;
    if (!force && !layoutChanged && key === lastDrawKey) return;
    lastDrawKey = key;

    const W = c.width;
    const H = c.height;
    const result = drawHoloScreen(ctx, W, H, {
      accentHex,
      fullTitle,
      enTitle,
      active: !!active,
      hud: active ? boundHud : null,
      dataHtml: boundDataHtml,
      maximized: !!g.userData.maximized,
    });
    hitRegions = result.hits || [];
    g.userData.hitRegions = hitRegions;
    g.userData.boundHud = boundHud;
    g.userData.boundDataHtml = boundDataHtml;
    tex.needsUpdate = true;
  };

  draw(false);

  const tag = (o) => {
    o.userData.type = 'holo';
    o.userData.stationId = stationId;
    o.userData.interactive = true;
  };
  tag(g);
  tag(hit);
  tag(front);
  tag(backFace);
  tag(base);
  tag(core);

  g.userData.draw = draw;
  g.userData.tex = tex;
  g.userData.frontMat = frontMat;
  g.userData.backMat = backMat;
  g.userData.floatG = floatG;
  g.userData.screenRoot = floatG;
  g.userData.holoLight = holoLight;
  g.userData.coreMat = coreMat;
  g.userData.facingSide = 1; // +1 front primary, -1 back primary
  g.userData.canvasW = c.width;
  g.userData.canvasH = c.height;
  g.userData.setHud = (hud, dataHtml = '') => {
    boundHud = hud;
    boundDataHtml = dataHtml || '';
    lastDrawKey = '';
    draw(!!g.userData.active, true);
  };
  g.userData.setMaximized = (on) => {
    // Fullscreen is managed globally; only store flag + redraw chrome icon here
    g.userData.maximized = !!on;
    lastDrawKey = '';
    draw(!!g.userData.active, true);
  };
  /** UV pick on hologram screen (like clicking a monitor) */
  g.userData.pick = (uv) => {
    if (!uv || !g.userData.active) return null;
    return pickHoloScreen(uv.x, uv.y, c.width, c.height, hitRegions, 1);
  };
  const _pickPlane = new THREE.Plane();
  const _pickHit = new THREE.Vector3();
  const _pickLocal = new THREE.Vector3();
  const _pickN = new THREE.Vector3();

  /**
   * Infinite-plane UV for a screen face (works even if ray barely misses mesh edges).
   * u,v in 0..1 relative to unscaled PlaneGeometry bounds; outside clamped.
   */
  function uvOnFacePlane(raycaster, face) {
    face.updateMatrixWorld(true);
    _pickN.set(0, 0, 1).transformDirection(face.matrixWorld).normalize();
    face.getWorldPosition(_holoWorldPos);
    _pickPlane.setFromNormalAndCoplanarPoint(_pickN, _holoWorldPos);
    const ray = raycaster.ray;
    if (!ray.intersectPlane(_pickPlane, _pickHit)) return null;
    // must be in front of camera
    _pickLocal.subVectors(_pickHit, ray.origin);
    if (_pickLocal.dot(ray.direction) < 1e-4) return null;

    _pickLocal.copy(_pickHit);
    face.worldToLocal(_pickLocal);
    // PlaneGeometry: x ∈ [-w/2,w/2], y ∈ [-h/2,h/2] (scale already undone by worldToLocal)
    const u = (_pickLocal.x / panelW) + 0.5;
    const v = (_pickLocal.y / panelH) + 0.5;
    if (u < -0.08 || u > 1.08 || v < -0.08 || v > 1.08) return null;
    return {
      u: THREE.MathUtils.clamp(u, 0, 1),
      v: THREE.MathUtils.clamp(v, 0, 1),
      distance: ray.origin.distanceTo(_pickHit),
    };
  }

  /**
   * Collect UV samples on both screen faces. Plane tests ignore other meshes, so
   * table instruments in front of the wall-side projector do not block aim.
   */
  function collectScreenSamples(raycaster) {
    floatG.updateMatrixWorld(true);
    front.updateMatrixWorld(true);
    backFace.updateMatrixWorld(true);

    const samples = [];
    for (const face of [front, backFace]) {
      const uvInfo = uvFromRayAndMesh(raycaster, face) || uvOnFacePlane(raycaster, face);
      if (!uvInfo) continue;
      samples.push({ face, ...uvInfo });
    }
    samples.sort((a, b) => a.distance - b.distance);
    return samples;
  }

  /** Closest screen-plane aim (active or idle) — used to prefer holo over gear. */
  g.userData.screenAimFromRay = (raycaster) => {
    const samples = collectScreenSamples(raycaster);
    return samples[0] || null;
  };

  /**
   * Raycast screen planes for UV. Prefer the closer face; try both if needed.
   * Ensures matrixWorld is current (important after maximize scale / float bob).
   */
  g.userData.pickFromRay = (raycaster) => {
    if (!g.userData.active) return null;
    const samples = collectScreenSamples(raycaster);
    if (!samples.length) return null;

    for (const s of samples) {
      const side = s.face === backFace ? -1 : 1;
      const pick = pickHoloScreen(s.u, s.v, c.width, c.height, hitRegions, side);
      if (pick) return pick;
    }
    const s0 = samples[0];
    return pickHoloScreen(s0.u, s0.v, c.width, c.height, hitRegions, s0.face === backFace ? -1 : 1);
  };

  // Billboard yaw + dual-face emphasis based on camera side
  animators.push((t) => {
    const phase = t + stationId.length * 0.7;
    const baseY = g.userData._floatBaseY ?? FLOAT_Y_NORMAL;
    floatG.position.y = baseY + Math.sin(phase * 1.35) * 0.022;
    hit.position.y = floatG.position.y;

    // Soft-yaw so the hologram faces the player (works from either side of the table)
    floatG.getWorldPosition(_holoWorldPos);
    _holoCamDir.subVectors(camera.position, _holoWorldPos);
    _holoCamDir.y = 0;
    if (_holoCamDir.lengthSq() > 1e-6) {
      _holoCamDir.normalize();
      const targetYaw = Math.atan2(_holoCamDir.x, _holoCamDir.z);
      g.getWorldQuaternion(_holoParentQuat);
      _holoParentEuler.setFromQuaternion(_holoParentQuat, 'YXZ');
      const localYaw = targetYaw - _holoParentEuler.y;
      let dy = localYaw - floatG.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      floatG.rotation.y += dy * 0.14;
    }

    // Which face is toward the player? (local +Z vs camera)
    floatG.updateMatrixWorld(true);
    floatG.getWorldDirection(_holoFront);
    _holoCamDir.subVectors(camera.position, _holoWorldPos).normalize();
    const facing = _holoFront.dot(_holoCamDir) >= 0 ? 1 : -1;
    g.userData.facingSide = facing;

    // Emphasize the face toward the player; other side stays readable & interactive
    const pulse = 0.84 + 0.08 * Math.sin(t * 2.4);
    const activeBoost = g.userData.active ? 0.08 : 0;
    if (facing >= 0) {
      frontMat.opacity = Math.min(0.96, pulse + activeBoost);
      backMat.opacity = 0.52;
    } else {
      backMat.opacity = Math.min(0.96, pulse + activeBoost);
      frontMat.opacity = 0.52;
    }
    // projector idle FX
    coreMat.emissiveIntensity = 1.05 + 0.35 * Math.sin(t * 3.5);
    coneMat.opacity = 0.07 + 0.04 * Math.sin(t * 2.1);
    beamMat.opacity = 0.06 + 0.03 * Math.sin(t * 2.6);
    holoLight.intensity = g.userData.active ? 0.7 : 0.4 + 0.15 * Math.sin(t * 2);
    spinRings.forEach(({ mesh, mat: rm, i }) => {
      mesh.rotation.z = t * (1.1 + i * 0.35) * (i % 2 ? -1 : 1);
      mesh.position.y = 0.24 + i * 0.11 + Math.sin(t * 2 + i) * 0.012;
      rm.opacity = 0.28 + 0.18 * Math.sin(t * 2.5 + i);
    });

    draw(!!g.userData.active);
  });

  return g;
}

// Wall-side table edges; hologram free-yaws toward the player from either side
// tables: mechanics/optics w=3.4 @ x=±4.2,z=-2.8 | electro/thermo w=2.8 @ x=±4.2,z=2.6
const holoConfigs = [
  { id: 'mechanics', title: '力学', accent: '#38bdf8', accentNum: 0x38bdf8, pos: [-5.72, 0.93, -2.8], rotY: -Math.PI / 2 },
  { id: 'electro', title: '电磁学', accent: '#f472b6', accentNum: 0xf472b6, pos: [-5.42, 0.93, 2.6], rotY: -Math.PI / 2 },
  { id: 'optics', title: '光学', accent: '#fbbf24', accentNum: 0xfbbf24, pos: [5.72, 0.93, -2.8], rotY: Math.PI / 2 },
  { id: 'thermo', title: '热力学', accent: '#fb923c', accentNum: 0xfb923c, pos: [5.42, 0.93, 2.6], rotY: Math.PI / 2 },
];
const holos = {};
holoConfigs.forEach(({ id, title, accent, accentNum, pos, rotY }) => {
  const h = makeHoloPanel(id, title, accent, accentNum);
  h.position.set(...pos);
  h.rotation.y = rotY;
  scene.add(h);
  holos[id] = h;
});

// Build equipment refs for experiment manager
const equipment = {
  holos,
  mechanics: {
    cradleBalls: cradle.userData.cradleBalls,
    pendulumPivot: pendulum.userData.pendulumPivot,
    springGroup: spring.userData.springGroup,
    springMass: spring.userData.springMass,
    setPendulumLength: (L) => {
      const pivot = pendulum.userData.pendulumPivot;
      const bob = pendulum.userData.bob;
      if (!pivot || !bob) return;
      // scale string visually by bob y
      const len = Math.min(0.9, Math.max(0.4, L));
      bob.position.y = -len;
      pendulum.userData.stringLen = len;
    },
  },
  optics: {
    setMode: (mode) => optics.userData.setMode?.(mode),
    updateOptics: (data) => optics.userData.updateOptics?.(data),
    setPartState: (part, mode) => optics.userData.setPartState?.(part, mode),
    clearIdentifyVisuals: () => optics.userData.clearIdentifyVisuals?.(),
    getCamera: () => camera,
    mouseDrag: { holdLMB: false, movementX: 0 },
  },
  electro: {
    getHallProbePos: (cam, target) => hallBench.userData.getHallProbePos?.(cam, target) ?? null,
    setMode: (mode) => hallBench.userData.setMode?.(mode),
    updateHall: (data) => hallBench.userData.updateHall?.(data),
    updateHallDemo: (data, dt) => hallBench.userData.updateHallDemo?.(data, dt),
    startHallWirePreview: (portId) => hallBench.userData.startHallWirePreview?.(portId),
    updateHallWirePreview: (fromPortId, cam, hoverPortId) => hallBench.userData.updateHallWirePreview?.(fromPortId, cam, hoverPortId),
    cancelHallWirePreview: () => hallBench.userData.cancelHallWirePreview?.(),
    setHallPartState: (part, mode) => hallBench.userData.setHallPartState?.(part, mode),
    clearHallIdentifyVisuals: () => hallBench.userData.clearHallIdentifyVisuals?.(),
    getCamera: () => camera,
    /** Shared pointer-drag state for Hall controls. */
    mouseDrag: { holdLMB: false, movementX: 0 },
  },
  thermo: {
    setRodHeat: thermo.userData.setRodHeat,
    setTempDisplay: thermo.userData.setTempDisplay,
  },
};

// Tag station roots interactive
cradle.userData.interactive = true;
pendulum.userData.interactive = true;
spring.userData.interactive = true;
optics.userData.interactive = true;
hallBench.userData.interactive = true;
thermo.userData.interactive = true;

// DOM HUD for experiments
const expPanel = document.getElementById('exp-panel');
const expList = document.getElementById('exp-list');
const expActive = document.getElementById('exp-active');
const expStationTitle = document.getElementById('exp-station-title');
const expName = document.getElementById('exp-name');
const expTheory = document.getElementById('exp-theory');
const expSteps = document.getElementById('exp-steps');
const expHint = document.getElementById('exp-hint');
const expData = document.getElementById('exp-data');
const toastEl = document.getElementById('toast');
const crosshair = document.getElementById('crosshair');
let toastTimer = 0;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function formatData(stationId, expId, data) {
  if (!data) return '—';
  if (expId === 'pendulum_g') {
    return `L = ${data.L?.toFixed(2) ?? '—'} m\nT = ${data.T ? data.T.toFixed(3) + ' s' : '测量中…'}\n<span class="ok">g = ${data.g ? data.g.toFixed(2) + ' m/s²' : '—'}</span>`;
  }
  if (expId === 'spring_k') {
    return `m = ${data.m?.toFixed(2) ?? '—'} kg\nT = ${data.T ? data.T.toFixed(3) + ' s' : '—'}\n<span class="ok">k = ${data.k ? data.k.toFixed(1) + ' N/m' : '—'}</span>`;
  }
  if (expId === 'cradle_demo') {
    return `模式: ${data.mode === 2 ? '抬起 2 球' : data.mode === 1 ? '抬起 1 球' : '待机'}\n按 1 / 2 切换`;
  }
  if (expId === 'multi_slit_diffraction') {
    return `${data.N === 1 ? '单缝衍射' : `${data.N} 缝干涉`}　λ=${Number(data.lambdaNm || 0).toFixed(0)} nm\na=${Number(data.slitMm || 0).toFixed(3)} mm　d=${Number(data.pitchMm || 0).toFixed(3)} mm\nL=${Number(data.distM || 0).toFixed(2)} m　Δx≈${Number(data.fringeSpacingMm || 0).toFixed(3)} mm\n<span class="ok">记录 ${Array.isArray(data.records) ? data.records.length : 0} 组　${data.farField ? 'Fraunhofer ✓' : '近场警告'}</span>`;
  }
  if (expId === 'hall_effect') {
    const target = data.target === 'solenoid' ? '长螺线管' : '亥姆霍兹线圈';
    const records = Array.isArray(data.records) ? data.records : [];
    const wiringText = data.wiring?.energized
      ? `${data.wiring.label}${data.wiring.reversed ? '（反接）' : '（正接）'}`
      : data.wiring?.status === 'invalid' ? '接线无效/未闭合' : 'Im 输出未接线';
    return `对象: ${target}\n接线: ${wiringText}\nVH = ${Number(data.vh || 0).toFixed(2)} mV　X = ${Number(data.probePos || 0).toFixed(1)} cm\nIm = ${Number(data.Im || 0).toFixed(2)} A　Is = ${Number(data.Is || 0).toFixed(1)} mA\n记录: ${records.length} 组`;
  }
  if (expId === 'hall_carrier_demo') {
    return `I = ${Number(data.I || 0).toFixed(2)}　B = ${Number(data.B || 0).toFixed(2)}\nn = ${Number(data.n || 0).toFixed(2)}　d = ${Number(data.d || 0).toFixed(2)}\nVₕ(rel.) = ${Number(data.vh || 0).toFixed(3)}　${data.nType ? 'n 型' : 'p 型'}\n${data.paused ? '动效已暂停' : '载流子运动中'}`;
  }
  if (expId === 'calorimetry') {
    return `样品 T = ${data.sampleT?.toFixed(1) ?? '—'} °C\n水温 = ${data.waterT?.toFixed(1) ?? '—'} °C\n终温 = ${data.finalT ? data.finalT.toFixed(1) + ' °C' : '—'}\n<span class="ok">c ≈ ${data.cSample ? data.cSample.toFixed(0) + ' J/(kg·K)' : '—'}</span>`;
  }
  if (expId === 'conduction') {
    return `加热: ${data.heaterOn ? '开' : '关'}\n进度: ${((data.progress || 0) * 100).toFixed(0)}%`;
  }
  return JSON.stringify(data);
}

/** Monotonic revision so hologram screens redraw when HUD changes */
let hudRev = 0;
let lastHudSnapshot = null;
let lastHudDataHtml = '';

// ── Fullscreen maximized hologram (covers the whole browser viewport) ──
const holoFsEl = document.getElementById('holo-fs');
const holoFsCanvas = document.getElementById('holo-fs-canvas');
const holoFsCtx = holoFsCanvas?.getContext('2d');
const holoFsState = {
  open: false,
  stationId: null,
  hits: [],
  canvasW: 1600,
  canvasH: 1000,
};

function resizeHoloFsCanvas() {
  if (!holoFsCanvas || !holoFsEl) return;
  const frame = holoFsEl.querySelector('.holo-fs-frame');
  const rect = frame?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(320, rect.width);
  const cssH = Math.max(240, rect.height);
  // The experiment UI has a desktop-sized vertical layout. On short windows,
  // keep that logical height and let the canvas scale uniformly in CSS; this
  // prevents the footer from covering parameter rows while preserving picks.
  const minLogicalH = 820;
  const logicalScale = Math.max(1, minLogicalH / (cssH * dpr));
  const bufW = Math.round(cssW * dpr * logicalScale);
  const bufH = Math.round(cssH * dpr * logicalScale);
  holoFsState.canvasW = bufW;
  holoFsState.canvasH = bufH;
  holoFsCanvas.width = bufW;
  holoFsCanvas.height = bufH;
}

function paintHoloFs() {
  if (!holoFsState.open || !holoFsCtx || !holoFsCanvas) return;
  const sid = holoFsState.stationId;
  const holo = holos[sid];
  if (!holo?.userData) return;
  const ud = holo.userData;
  const W = holoFsCanvas.width;
  const H = holoFsCanvas.height;
  const result = drawHoloScreen(holoFsCtx, W, H, {
    accentHex: ud.accentHex || '#38bdf8',
    fullTitle: ud.fullTitle || '实验台',
    enTitle: ud.enTitle || 'STATION',
    active: true,
    hud: lastHudSnapshot,
    dataHtml: lastHudDataHtml,
    maximized: true,
  });
  holoFsState.hits = result.hits || [];
}

function openHoloFullscreen(stationId) {
  if (!holoFsEl || !holoFsCanvas) return;
  holoFsState.open = true;
  holoFsState.stationId = stationId;
  holoFsEl.classList.add('open');
  holoFsEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('holo-fs-open');
  // Free the mouse so user can click the fullscreen UI like a normal screen
  if (controls.isLocked) controls.unlock();
  const holo = holos[stationId];
  holo?.userData?.setMaximized?.(true);
  resizeHoloFsCanvas();
  paintHoloFs();
  showToast('已全屏显示全息终端 · Esc 退出全屏');
}

function closeHoloFullscreen(opts = {}) {
  const { keepMaximizedFlag = false } = opts;
  if (!holoFsEl) return;
  const sid = holoFsState.stationId;
  holoFsState.open = false;
  holoFsState.hits = [];
  holoFsEl.classList.remove('open');
  holoFsEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('holo-fs-open');
  if (sid && holos[sid] && !keepMaximizedFlag) {
    holos[sid].userData?.setMaximized?.(false);
  }
  holoFsState.stationId = null;
}

function toggleHoloFullscreen(stationId) {
  if (holoFsState.open && holoFsState.stationId === stationId) {
    closeHoloFullscreen();
    showToast('已退出全屏');
    return false;
  }
  openHoloFullscreen(stationId);
  return true;
}

function mapFsClickToCanvas(clientX, clientY) {
  if (!holoFsCanvas) return null;
  const rect = holoFsCanvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const px = ((clientX - rect.left) / rect.width) * holoFsCanvas.width;
  const py = ((clientY - rect.top) / rect.height) * holoFsCanvas.height;
  return { px, py };
}

function pickFsAt(clientX, clientY) {
  const p = mapFsClickToCanvas(clientX, clientY);
  if (!p) return null;
  const hits = holoFsState.hits || [];
  // reuse multi-convention pick via fake UV
  const u = p.px / holoFsCanvas.width;
  const v = 1 - p.py / holoFsCanvas.height; // pickHoloScreen converts (1-v)*H for first candidate
  return pickHoloScreen(u, v, holoFsCanvas.width, holoFsCanvas.height, hits, 1)
    || (() => {
      // direct pixel test (canvas coords already top-left origin)
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (p.px >= h.x && p.px <= h.x + h.w && p.py >= h.y && p.py <= h.y + h.h) return h;
      }
      // chrome corner snap
      if (p.px > holoFsCanvas.width * 0.7 && p.py < holoFsCanvas.height * 0.14) {
        let best = null;
        let bestD = Infinity;
        for (const h of hits) {
          if (!h.chrome) continue;
          const cx = h.x + h.w / 2;
          const cy = h.y + h.h / 2;
          const d = (p.px - cx) ** 2 + (p.py - cy) ** 2;
          if (d < bestD) { bestD = d; best = h; }
        }
        return best;
      }
      return null;
    })();
}

if (holoFsCanvas) {
  holoFsCanvas.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pick = pickFsAt(e.clientX, e.clientY);
    if (pick) handleHoloScreenAction(pick, holoFsState.stationId);
  });
  holoFsCanvas.addEventListener('mousemove', (e) => {
    const pick = pickFsAt(e.clientX, e.clientY);
    holoFsCanvas.style.cursor = pick ? 'pointer' : 'default';
  });
}

window.addEventListener('resize', () => {
  if (!holoFsState.open) return;
  resizeHoloFsCanvas();
  paintHoloFs();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && holoFsState.open) {
    e.preventDefault();
    closeHoloFullscreen();
    showToast('已退出全屏');
  }
});

function pushHudToHoloScreens(hud) {
  hudRev += 1;
  const payload = hud ? { ...hud, _rev: hudRev, expId: hud.experiment?.id } : null;
  let dataHtml = '';
  if (hud?.running && hud.experiment && hud.station) {
    dataHtml = formatData(hud.station.id, hud.experiment.id, hud.data);
  }
  lastHudSnapshot = payload;
  lastHudDataHtml = dataHtml;

  Object.entries(holos).forEach(([id, h]) => {
    if (!h?.userData) return;
    const isActive = !!(hud?.menuOpen && hud.station?.id === id);
    h.userData.active = isActive;
    if (isActive && payload) {
      h.userData.setHud?.(payload, dataHtml);
    } else {
      if (holoFsState.open && holoFsState.stationId === id) closeHoloFullscreen();
      else h.userData.setMaximized?.(false);
      h.userData.setHud?.(null, '');
      h.userData.draw?.(false, true);
    }
  });

  // Keep fullscreen overlay in sync with live experiment data
  if (holoFsState.open) {
    if (!hud?.menuOpen || hud.station?.id !== holoFsState.stationId) {
      closeHoloFullscreen();
    } else {
      paintHoloFs();
    }
  }
}

function handleHoloScreenAction(pick, stationId) {
  if (!pick?.action || !expManager) return false;
  const t = clock.elapsedTime;
  const holo = stationId ? holos[stationId] : null;
  switch (pick.action) {
    case 'close':
      closeHoloFullscreen();
      expManager.closeMenu();
      showToast('已关闭全息菜单');
      return true;
    case 'maximize': {
      // Maximize = fill the entire browser window (not 3D scale)
      const sid = stationId || holoFsState.stationId;
      if (!sid) return false;
      toggleHoloFullscreen(sid);
      return true;
    }
    case 'start':
      if (pick.expId) expManager.startExperiment(pick.expId);
      if (holoFsState.open) paintHoloFs();
      return true;
    case 'back':
      expManager.exitExperiment();
      if (holoFsState.open) paintHoloFs();
      return true;
    case 'action':
      expManager.interact({ userData: { role: 'ui_action' } }, t);
      if (holoFsState.open) paintHoloFs();
      return true;
    case 'record':
      expManager.onKey('KeyF', t);
      if (holoFsState.open) paintHoloFs();
      return true;
    default: {
      // Forward experiment UI actions (hall-*, optics-diff-*, …) without a hard-coded list
      if (typeof pick.action === 'string' && /^[a-z]+-/.test(pick.action)) {
        const ok = expManager.uiAction(pick.action, pick);
        if (ok && holoFsState.open) paintHoloFs();
        return ok;
      }
      return false;
    }
  }
}

function onHudUpdate(hud) {
  // UI lives on the 3D hologram screen (+ optional fullscreen overlay)
  expPanel.classList.remove('open');
  pushHudToHoloScreens(hud);
}

expManager = createExperimentManager({
  equipment,
  onHudUpdate,
  onToast: showToast,
});

// Compile only the hidden Hall apparatus while the boot loader is still up,
// so opening the experiment does not pay the first-use shader cost.
hallBench.userData.prewarmHall?.(renderer, camera, scene);
hallBench.userData.prewarmHallDemo?.(renderer, camera, scene);

// Development-only visual QA shortcut for the reconstructed source model.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'hall') {
  const previewParams = new URLSearchParams(window.location.search);
  expManager.openStationMenu('electro');
  expManager.startExperiment('hall_effect');
  if (previewParams.get('view') === 'terminals') {
    camera.position.set(-4.56, 1.72, 3.08);
    camera.lookAt(-4.43, 1.02, 2.56);
  } else {
    camera.position.set(-4.0, 1.45, 3.65);
    camera.lookAt(-4.0, 1.12, 2.55);
  }
  if (previewParams.get('wiring') === 'helmholtz') {
    expManager.state.data.wires = [
      ['out_red', 'hh_red'],
      ['out_black', 'hh_black'],
    ];
    expManager.update(0, 0);
  } else if (previewParams.get('wiring') === 'helmholtz-reversed') {
    expManager.state.data.wires = [
      ['out_red', 'hh_black'],
      ['out_black', 'hh_red'],
    ];
    expManager.update(0, 0);
  } else if (previewParams.get('wiring') === 'solenoid') {
    expManager.state.data.wires = [
      ['out_red', 'sol_red'],
      ['out_black', 'sol_black'],
    ];
    expManager.update(0, 0);
  } else if (previewParams.get('wiring') === 'reversed') {
    expManager.state.data.wires = [
      ['out_red', 'sol_black'],
      ['out_black', 'sol_red'],
    ];
    expManager.update(0, 0);
  }
  if (previewParams.get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('electro'));
  }
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'hall-demo') {
  const previewParams = new URLSearchParams(window.location.search);
  expManager.openStationMenu('electro');
  expManager.startExperiment('hall_carrier_demo');
  if (previewParams.get('screen') === '1') {
    camera.position.set(-4.1, 1.72, 2.6);
    camera.lookAt(-5.42, 1.72, 2.6);
  } else {
    camera.position.set(-4.0, 1.45, 3.65);
    camera.lookAt(-4.0, 1.13, 2.55);
  }
  if (previewParams.get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('electro'));
  }
}

if (import.meta.env.DEV && ['diffraction', 'diffraction-fullscreen'].includes(new URLSearchParams(window.location.search).get('preview'))) {
  const previewParams = new URLSearchParams(window.location.search);
  expManager.openStationMenu('optics');
  expManager.startExperiment('multi_slit_diffraction');
  camera.position.set(4.15, 1.55, -1.15);
  camera.lookAt(4.2, 1.02, -2.8);
  if (previewParams.get('fullscreen') === '1' || previewParams.get('preview') === 'diffraction-fullscreen') {
    requestAnimationFrame(() => openHoloFullscreen('optics'));
  }
}

// DOM panel kept as accessibility fallback (hidden); wire buttons if re-enabled
document.getElementById('exp-close')?.addEventListener('click', (e) => {
  e.stopPropagation();
  expManager.closeMenu();
});
document.getElementById('exp-back')?.addEventListener('click', (e) => {
  e.stopPropagation();
  expManager.exitExperiment();
});
document.getElementById('exp-action')?.addEventListener('click', (e) => {
  e.stopPropagation();
  expManager.interact({ userData: { role: 'ui_action' } }, clock.elapsedTime);
});
document.getElementById('exp-record')?.addEventListener('click', (e) => {
  e.stopPropagation();
  expManager.onKey('KeyF', clock.elapsedTime);
});

// Raycasting interaction
const raycaster = new THREE.Raycaster();
const interactables = [];
const raycastSurfaces = [];
function collectInteractables() {
  interactables.length = 0;
  raycastSurfaces.length = 0;
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.interactive) interactables.push(obj);
    if (obj.isMesh || obj.isSprite) raycastSurfaces.push(obj);
  });
}
collectInteractables();

let focusedTarget = null;
let lastFocusHit = null;
let holdE = false;
let holdLMB = false;
let handTracking = null;
let arInteractionController = null;

function getFocusHit() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(interactables, true);
  if (!hits.length) return null;
  return hits[0];
}

function resolveInteractive(obj) {
  let o = obj;
  while (o && !o.userData?.interactive && o.parent) o = o.parent;
  return o?.userData?.interactive ? o : null;
}

/** Respect optional per-object maxInteractDist (front boards / formula screen). */
function withinInteractDist(obj, distance) {
  const max = obj?.userData?.maxInteractDist;
  if (max == null || !Number.isFinite(max)) return true;
  return distance <= max;
}

function frontWallTooFarToast() {
  showToast('请走近前墙再操作（约实验室前三分之一区域）');
}

/** Prefer specific apparatus controls over the station root. */
function resolveInteractivePreferred(hits) {
  if (!hits?.length) return null;
  const ROLE_PRI = {
    pendulum_bob: 65,
    spring_mass: 65,
    diff_source: 65,
    diff_slit: 65,
    diff_screen: 65,
    hall_helmholtz: 55,
    hall_solenoid: 55,
    hall_probe: 60,
    hall_console: 50,
    hall_knob_im: 70,
    hall_knob_is: 70,
    hall_knob_zero: 70,
    hall_terminal_solenoid: 80,
    hall_terminal_helmholtz: 80,
    hall_terminal_output: 80,
    formula_board: 45,
    side_blackboard: 46,
    electro: 5,
    holo: 40,
  };
  // Slightly wider band so wall-side holos can compete when gear is close.
  // (Screen-plane aim is handled separately in getAimedHolo — that is the
  // primary fix for "instruments block the hologram".)
  // Prefer first hit that is actually interactable (skip distant formula board etc.)
  let nearBase = null;
  for (const hit of hits) {
    const o = resolveInteractive(hit.object);
    if (!o) continue;
    if (!withinInteractDist(o, hit.distance)) continue;
    nearBase = hit.distance;
    break;
  }
  if (nearBase == null) return null;
  const near = nearBase + 0.35;
  let best = null;
  let bestScore = -Infinity;
  for (const hit of hits) {
    if (hit.distance > near) break;
    const o = resolveInteractive(hit.object);
    if (!o) continue;
    if (!withinInteractDist(o, hit.distance)) continue;
    const role = o.userData.role || (o.userData.type === 'holo' ? 'holo' : '');
    const pri = ROLE_PRI[role] ?? 10;
    // closer + higher role priority
    const score = pri * 10 - hit.distance;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/**
 * Prefer the floating hologram when the crosshair lands on its screen plane.
 * Mesh raycasts often hit table instruments first (they sit closer than the
 * wall-edge projectors), which previously made the holo unusable up close.
 */
function getAimedHolo(rc) {
  let best = null;
  let bestDist = Infinity;
  for (const holo of Object.values(holos)) {
    const aim = holo?.userData?.screenAimFromRay?.(rc);
    if (!aim) continue;
    if (aim.distance < bestDist) {
      bestDist = aim.distance;
      best = holo;
    }
  }
  return best;
}

function getAimedHoloControl(rc) {
  let best = null;
  let bestDist = Infinity;
  for (const holo of Object.values(holos)) {
    if (!holo?.userData?.active) continue;
    const aim = holo.userData.screenAimFromRay?.(rc);
    if (!aim || aim.distance >= bestDist) continue;
    // Only an actual button/card region receives UI priority. Empty screen
    // space still obeys the frontmost-surface rule and becomes camera look.
    const pick = holo.userData.pickFromRay?.(rc);
    if (!pick) continue;
    bestDist = aim.distance;
    best = {
      target: holo,
      hit: { object: holo, distance: aim.distance },
    };
  }
  return best;
}

function getFocusTarget(inputRaycaster = raycaster) {
  if (inputRaycaster === raycaster) {
    inputRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }
  const hits = inputRaycaster.intersectObjects(interactables, true);
  lastFocusHit = hits[0] || null;

  const aimedHolo = getAimedHolo(inputRaycaster);
  if (aimedHolo) return aimedHolo;

  if (!hits.length) return null;
  return resolveInteractivePreferred(hits);
}

function getHandFocusInfo(inputRaycaster) {
  const hits = inputRaycaster.intersectObjects(raycastSurfaces, false);
  return resolveFrontmostInteraction(hits, {
    resolveInteractive,
    withinInteractDist,
    priorityInteraction: getAimedHoloControl(inputRaycaster),
    // Once the front surface is known to be interactive, match the mouse
    // resolver inside that same shallow apparatus layer so a broad station or
    // console hit box cannot swallow its button/knob/terminal controls.
    preferInteractive: resolveInteractivePreferred,
  });
}

function tryInteract(inputRaycaster = raycaster, allowUnlocked = false, directContext = null) {
  if (!allowUnlocked && !controls.isLocked) return;
  const t = clock.elapsedTime;
  if (inputRaycaster === raycaster) {
    inputRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }
  const hits = inputRaycaster.intersectObjects(interactables, true);
  lastFocusHit = hits[0] || null;

  // Screen-plane aim wins over closer instrument meshes
  const directTarget = directContext?.target || null;
  const aimedHolo = directTarget?.userData?.type === 'holo'
    ? directTarget
    : (!directContext ? getAimedHolo(inputRaycaster) : null);
  if (aimedHolo) {
    const sid = aimedHolo.userData.stationId;
    if (aimedHolo.userData.active) {
      const pick = aimedHolo.userData.pickFromRay?.(inputRaycaster)
        || (lastFocusHit?.uv ? aimedHolo.userData.pick?.(lastFocusHit.uv) : null);
      if (pick) {
        handleHoloScreenAction(pick, sid);
        return;
      }
      showToast('请瞄准全息屏上的按钮或实验卡片');
      return;
    }
    expManager.interact(aimedHolo, t);
    return;
  }

  const target = directTarget || resolveInteractivePreferred(hits);

  // Front wall formula board (only within ~1/3 lab depth)
  if (target?.userData?.type === 'formula_board' || target?.userData?.role === 'formula_board') {
    const board = formulaBoard;
    const boardHit = hits.find((h) => {
      const o = resolveInteractive(h.object);
      return o && (o.userData.type === 'formula_board' || o.userData.role === 'formula_board');
    });
    if (boardHit && !withinInteractDist(board, boardHit.distance)) {
      frontWallTooFarToast();
      return;
    }
    const pick = board?.userData?.pickFromRay?.(inputRaycaster);
    if (pick) {
      board.userData.applyPick(pick);
      return;
    }
    if (!boardHit || withinInteractDist(board, boardHit.distance)) {
      showToast('瞄准分类标签或公式卡片后按 E');
    }
    return;
  }

  // Front-wall chalkboards share the same near-third range to avoid far mis-taps.
  if (target?.userData?.type === 'side_blackboard' || target?.userData?.role === 'side_blackboard') {
    const boardHit = hits.find((h) => {
      const o = resolveInteractive(h.object);
      return o && (o.userData.type === 'side_blackboard' || o.userData.role === 'side_blackboard');
    });
    if (boardHit && !withinInteractDist(target, boardHit.distance)) {
      frontWallTooFarToast();
      return;
    }
    const pick = target.userData.pickFromRay?.(inputRaycaster);
    if (!pick) {
      if (boardHit && withinInteractDist(target, boardHit.distance)) {
        showToast('瞄准黑板工具栏或书写区后按 E');
      }
      return;
    }
    if (pick.action === 'color' || pick.action === 'size') {
      target.userData.applyPick(pick);
      showToast(pick.action === 'color' ? '已选择画笔颜色' : '已选择画笔粗细');
    } else if (pick.action === 'draw') {
      target.userData.drawFromRay?.(inputRaycaster);
    }
    return;
  }

  // Hologram mesh/hitbox (pedestal, thick volume) when not on the screen plane
  if (target?.userData?.type === 'holo') {
    const sid = target.userData.stationId;
    const holo = holos[sid];
    if (holo?.userData?.active) {
      // Prefer dedicated plane raycast (hit box has no reliable UV)
      const pick = holo.userData.pickFromRay?.(inputRaycaster)
        || (lastFocusHit?.uv ? holo.userData.pick?.(lastFocusHit.uv) : null);
      if (pick) {
        handleHoloScreenAction(pick, sid);
        return;
      }
      showToast('请瞄准全息屏上的按钮或实验卡片');
      return;
    }
    expManager.interact(target, t);
    return;
  }

  if (target) {
    if (directContext) {
      expManager.beginManipulation(target, {
        ...directContext,
        time: directContext.time ?? t,
        raycaster: inputRaycaster,
      });
    } else {
      expManager.interact(target, t);
    }
  } else if (!directContext && expManager.state.running) {
    expManager.interact({ userData: { role: 'generic' } }, t);
  }
}

function syncMouseDragState() {
  const holding = holdLMB || !!handTracking?.isPinching();
  if (equipment?.electro?.mouseDrag) equipment.electro.mouseDrag.holdLMB = holding;
  if (equipment?.optics?.mouseDrag) equipment.optics.mouseDrag.holdLMB = holding;
}

function resetMouseDragAccum() {
  if (equipment?.electro?.mouseDrag) equipment.electro.mouseDrag.movementX = 0;
  if (equipment?.optics?.mouseDrag) equipment.optics.mouseDrag.movementX = 0;
}

function accumulateMouseDrag(dx) {
  if (equipment?.electro?.mouseDrag) equipment.electro.mouseDrag.movementX += dx;
  if (equipment?.optics?.mouseDrag) equipment.optics.mouseDrag.movementX += dx;
}

// ── Camera-based AR input powered by local MediaPipe hand tracking ──
const handToggleEl = document.getElementById('hand-tracking-toggle');
const handStatusEl = document.getElementById('hand-tracking-status');
const handVideoEl = document.getElementById('hand-tracking-video');
const arTutorialEl = document.getElementById('ar-tutorial');
const helpToggleEl = document.getElementById('help-toggle');
const helpModalWrapEl = document.getElementById('help-modal-wrap');
const helpCloseEl = document.getElementById('help-close');
const helpConfirmEl = document.getElementById('help-confirm');
const helpBackdropEl = document.getElementById('help-modal-backdrop');
let handTrackingPhase = 'off';
let handTrackingDetail = 'AR 模式已关闭 · H';
let arInteractionLabel = '准备';
let arTutorialTimer = 0;

function renderArStatus() {
  if (!handStatusEl) return;
  handStatusEl.textContent = handTrackingPhase === 'running'
    ? arInteractionLabel
    : (handTrackingDetail || 'AR 模式已关闭 · H');
}

function updateArPhase(snapshot) {
  arInteractionLabel = snapshot?.label || '准备';
  ['navigating', 'looking', 'manipulating', 'tracking-lost'].forEach((phase) => {
    document.body.classList.toggle(`ar-${phase}`, snapshot?.phase === phase);
  });
  renderArStatus();
}

function showArTutorial() {
  if (!arTutorialEl) return;
  let alreadyShown = false;
  try {
    alreadyShown = localStorage.getItem('physics-lab-ar-tutorial') === 'shown';
    if (!alreadyShown) localStorage.setItem('physics-lab-ar-tutorial', 'shown');
  } catch { /* storage is optional */ }
  if (alreadyShown) return;
  arTutorialEl.classList.add('is-visible');
  window.clearTimeout(arTutorialTimer);
  arTutorialTimer = window.setTimeout(() => {
    arTutorialEl.classList.remove('is-visible');
  }, 7000);
}

function updateHandTrackingStatus({
  phase,
  detail,
  activeHand = null,
  trackingFps = 0,
  inferenceMs = 0,
  pipelineMs = 0,
  droppedFrames = 0,
  workerRestarts = 0,
  dropRate = 0,
  pinchRatios = null,
  degraded = false,
}) {
  handTrackingPhase = phase;
  handTrackingDetail = detail || (phase === 'off' ? 'AR 模式已关闭 · H' : '准备');
  document.body.classList.toggle('hand-tracking-loading', phase === 'loading' || phase === 'permission');
  document.body.classList.toggle('hand-tracking-active', phase === 'running');
  document.body.classList.toggle('hand-tracking-error', phase === 'error');
  document.body.classList.toggle('hand-tracking-degraded', phase === 'running' && degraded);
  handToggleEl?.setAttribute('aria-pressed', String(phase === 'running'));
  if (handToggleEl) {
    handToggleEl.disabled = phase === 'loading' || phase === 'permission';
    handToggleEl.dataset.activeHand = activeHand || '';
    handToggleEl.dataset.trackingFps = trackingFps ? String(Math.round(trackingFps)) : '';
    handToggleEl.dataset.inferenceMs = inferenceMs ? inferenceMs.toFixed(1) : '';
    handToggleEl.dataset.pipelineMs = pipelineMs ? pipelineMs.toFixed(1) : '';
    handToggleEl.dataset.droppedFrames = String(droppedFrames);
    handToggleEl.dataset.workerRestarts = String(workerRestarts);
    handToggleEl.dataset.dropRate = dropRate ? dropRate.toFixed(3) : '';
    const leftPinch = pinchRatios?.Left;
    const rightPinch = pinchRatios?.Right;
    handToggleEl.dataset.leftPinchRaw = Number.isFinite(leftPinch?.raw)
      ? leftPinch.raw.toFixed(3) : '';
    handToggleEl.dataset.leftPinchFiltered = Number.isFinite(leftPinch?.filtered)
      ? leftPinch.filtered.toFixed(3) : '';
    handToggleEl.dataset.rightPinchRaw = Number.isFinite(rightPinch?.raw)
      ? rightPinch.raw.toFixed(3) : '';
    handToggleEl.dataset.rightPinchFiltered = Number.isFinite(rightPinch?.filtered)
      ? rightPinch.filtered.toFixed(3) : '';
    handToggleEl.title = phase === 'running'
      ? `关闭 AR 模式（H）${degraded ? ' · 兼容模式' : ''}${detail ? ` · ${detail}` : ''}`
      : '开启 AR 模式（H）';
  }
  renderArStatus();
  if (phase === 'error') showToast(detail || 'AR 模式启动失败');
}

handTracking = createHandTracking({
  camera,
  scene,
  video: handVideoEl,
  resolveTarget: (inputRaycaster) => {
    const { target, hit } = getHandFocusInfo(inputRaycaster);
    const distance = THREE.MathUtils.clamp(Number(hit?.distance || 4.5), 0.35, 4.5);
    return { target, distance };
  },
  onPinchStart: (event) => arInteractionController?.onPinchStart(event),
  onPinchMove: (event) => arInteractionController?.onPinchMove(event),
  onPinchEnd: (event) => arInteractionController?.onPinchEnd(event),
  onStatus: updateHandTrackingStatus,
});

arInteractionController = createArInteractionController({
  getHandState: (label) => handTracking.getHandState(label),
  beginManipulation: (event) => {
    resetMouseDragAccum();
    syncMouseDragState();
    tryInteract(event.raycaster, true, {
      direct: true,
      target: event.target,
      time: clock.elapsedTime,
    });
  },
  updateManipulation: (event) => {
    accumulateMouseDrag(THREE.MathUtils.clamp(Number(event.dx || 0), -60, 60));
    expManager?.updateManipulation(event.target, {
      ...event,
      time: clock.elapsedTime,
    });
    if (event.target?.userData?.role === 'side_blackboard') {
      event.target.userData.drawFromRay?.(event.raycaster);
    }
  },
  endManipulation: (event) => {
    expManager?.endManipulation(event.target, {
      ...event,
      time: clock.elapsedTime,
    });
    sideBlackboards.forEach((board) => board.userData.stopStroke?.());
    syncMouseDragState();
  },
  onLook: (dx, dy) => {
    // Keep euler/quaternion in sync (PointerLockControls also drives the camera this way).
    // Soft clamp avoids rare tracking spikes without hard edge feel.
    const lookDx = THREE.MathUtils.clamp(dx, -48, 48);
    const lookDy = THREE.MathUtils.clamp(dy, -48, 48);
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= lookDx * 0.0024;
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x - lookDy * 0.0024,
      -THREE.MathUtils.degToRad(80),
      THREE.MathUtils.degToRad(80),
    );
    camera.quaternion.setFromEuler(camera.rotation);
  },
  onPhaseChange: updateArPhase,
  dollyOptions: { gain: 48, deadZone: 0.0008 },
  lookOptions: {
    minCutoff: 0.9,
    beta: 0.55,
    sensitivity: 0.95,
    outputFollow: 22,
    maxStepPx: 40,
  },
});

async function toggleHandTracking() {
  if (handTracking.isStarting()) return;
  if (controls.isLocked) controls.unlock();
  const active = await handTracking.toggle();
  arInteractionController.setEnabled(active);
  if (active) showArTutorial();
  else arTutorialEl?.classList.remove('is-visible');
}

handToggleEl?.addEventListener('mousedown', (event) => event.stopPropagation());
handToggleEl?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleHandTracking();
});
window.addEventListener('beforeunload', () => handTracking?.destroy());

function openHelpModal() {
  if (controls.isLocked) controls.unlock();
  if (helpModalWrapEl) {
    helpModalWrapEl.classList.add('is-open');
    helpModalWrapEl.setAttribute('aria-hidden', 'false');
  }
}

function closeHelpModal() {
  if (helpModalWrapEl) {
    helpModalWrapEl.classList.remove('is-open');
    helpModalWrapEl.setAttribute('aria-hidden', 'true');
  }
}

helpToggleEl?.addEventListener('mousedown', (e) => e.stopPropagation());
helpToggleEl?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (helpModalWrapEl?.classList.contains('is-open')) closeHelpModal();
  else openHelpModal();
});
helpCloseEl?.addEventListener('click', (e) => { e.stopPropagation(); closeHelpModal(); });
helpConfirmEl?.addEventListener('click', (e) => { e.stopPropagation(); closeHelpModal(); });
helpBackdropEl?.addEventListener('click', (e) => { e.stopPropagation(); closeHelpModal(); });

document.addEventListener('keydown', (e) => {
  if (helpModalWrapEl && helpModalWrapEl.classList.contains('is-open')) {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeHelpModal();
      return;
    }
  }
  if (e.code === 'KeyH' && !e.repeat) {
    toggleHandTracking();
  }
  if (e.code === 'KeyE') {
    if (!holdE) tryInteract();
    holdE = true;
  }
  if (expManager) expManager.onKey(e.code, clock.elapsedTime);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') holdE = false;
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && controls.isLocked) {
    holdLMB = true;
    resetMouseDragAccum();
    syncMouseDragState();
    tryInteract();
  }
});
document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked || !holdLMB) return;
  accumulateMouseDrag(Number(e.movementX || 0));
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    holdLMB = false;
    sideBlackboards.forEach((board) => board.userData.stopStroke?.());
    syncMouseDragState();
  }
});
// If pointer unlocks mid-drag, release LMB grab
controls.addEventListener('unlock', () => {
  holdLMB = false;
  holdE = false;
  sideBlackboards.forEach((board) => board.userData.stopStroke?.());
  syncMouseDragState();
});
document.addEventListener('wheel', (e) => {
  if (!controls.isLocked || !expManager) return;
  const target = getFocusTarget();
  if (expManager.onWheel(e.deltaY, target)) e.preventDefault();
}, { passive: false });

// prevent exp panel clicks from locking issues
expPanel.addEventListener('mousedown', (e) => e.stopPropagation());

// ═══════════════════════════════════════════════
//  Bounds / Loop
// ═══════════════════════════════════════════════
const BOUND = {
  minX: -ROOM_W / 2 + 0.45,
  maxX: ROOM_W / 2 - 0.45,
  minZ: -ROOM_D / 2 + 0.45,
  maxZ: ROOM_D / 2 - 0.45,
  minY: 0.4,
  maxY: 3.3,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const nowMs = performance.now();
  const arActive = !!handTracking?.isActive();

  // Camera inference is throttled internally and only runs in user-enabled AR mode.
  handTracking?.update(nowMs);
  const arState = arInteractionController?.update(nowMs);

  if (controls.isLocked || arActive) {
    velocity.x -= velocity.x * 9.0 * dt;
    velocity.z -= velocity.z * 9.0 * dt;
    velocity.y -= velocity.y * 9.0 * dt;

    direction.z = Number(move.forward) - Number(move.back);
    direction.x = Number(move.right) - Number(move.left);
    direction.normalize();

    if (move.forward || move.back) velocity.z -= direction.z * SPEED * 12 * dt;
    if (move.left || move.right) velocity.x -= direction.x * SPEED * 12 * dt;
    if (move.up) velocity.y += SPEED * 10 * dt;
    if (move.down) velocity.y -= SPEED * 10 * dt;

    controls.moveRight(-velocity.x * dt);
    controls.moveForward(-velocity.z * dt);
    camera.position.y += velocity.y * dt;

    if (arActive && arState) {
      const arMoveSpeed = arState.dualNavigating ? AR_DOLLY_SPEED : AR_SPEED;
      const arDamp = arState.dualNavigating ? 14 : (arState.manipulating ? 16 : 9);
      arVelocity.x = THREE.MathUtils.damp(
        arVelocity.x,
        arState.movement.strafe * arMoveSpeed,
        arDamp,
        dt,
      );
      arVelocity.y = THREE.MathUtils.damp(
        arVelocity.y,
        arState.movement.forward * arMoveSpeed,
        arDamp,
        dt,
      );
      controls.moveRight(arVelocity.x * dt);
      controls.moveForward(arVelocity.y * dt);
    } else {
      arVelocity.set(0, 0);
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, BOUND.minX, BOUND.maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, BOUND.minZ, BOUND.maxZ);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, BOUND.minY, BOUND.maxY);
  }

  // experiment simulation
  if (expManager) {
    syncMouseDragState();
    const handInteraction = handTracking?.getPrimaryInteraction();
    const pointerTarget = controls.isLocked ? getFocusTarget() : null;
    focusedTarget = handInteraction?.target || pointerTarget;
    const holdTarget = handInteraction?.holding && handInteraction.target?.userData?.portId
      ? (handInteraction.hoverTarget || handInteraction.target)
      : focusedTarget;
    expManager.holdInteract(holdE || holdLMB || !!handInteraction?.holding, t, dt, holdTarget);
    expManager.update(t, dt);
    if (holdLMB && focusedTarget?.userData?.role === 'side_blackboard') {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      focusedTarget.userData.drawFromRay?.(raycaster);
    } else {
      sideBlackboards.forEach((board) => board.userData.stopStroke?.());
    }
    expManager.onFocus(focusedTarget);
    const hallRun = expManager.state.running && expManager.state.expId === 'hall_effect';
    const opticsRun = expManager.state.running
      && expManager.state.expId === 'multi_slit_diffraction';
    const canInteract = !!(
      focusedTarget
      || handInteraction?.holding
      || (hallRun && expManager.state.data?.hallDragging)
      || (opticsRun && expManager.state.data?.dragging)
      || (hallRun && expManager.currentStep?.()?.id === 'identify')
    );
    if (canInteract) crosshair.classList.add('can-interact');
    else crosshair.classList.remove('can-interact');
  }

  optics.userData.animateDiffraction?.(t, dt);
  for (const fn of animators) fn(t);
  renderer.render(scene, camera);
}

// Start render loop immediately so the first painted frame is real lab content
animate();

// ── Boot gate: wait for portraits + a few painted frames, then reveal ──
// Avoid gl.finish / heavy compile — those freeze the main thread and leave a gray void.
const bootStarted = performance.now();
const MIN_BOOT_MS = 700;

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Present a few frames so the first visible image is the lab, not an empty buffer. */
async function paintReadyFrames() {
  labLoader.setProgress(0.94, '渲染首帧…');
  for (let i = 0; i < 3; i++) {
    renderer.render(scene, camera);
    labLoader.setProgress(0.94 + (i + 1) * 0.02, '渲染首帧…');
    await nextFrame();
  }
}

async function bootReveal() {
  try {
    // Don't block forever if a portrait fails — race with a timeout
    await Promise.race([
      Promise.all(portraitLoadPromises),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    labLoader.setProgress(0.9, '校准光学系统…');
    await paintReadyFrames();

    const wait = Math.max(0, MIN_BOOT_MS - (performance.now() - bootStarted));
    if (wait) await new Promise((r) => setTimeout(r, wait));

    labLoader.setProgress(1, '系统就绪 · 欢迎进入实验室');
    await labLoader.finish();
  } catch {
    await paintReadyFrames().catch(() => {});
    await labLoader.finish();
  }
}

bootReveal();
