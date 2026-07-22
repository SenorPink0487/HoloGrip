import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createExperimentManager } from './experiments/index.js';
import { createMaterials } from './scene/shared/materials.js';
import { createPrimitives } from './scene/shared/primitives.js';
import { createSharedProps } from './scene/shared/labProps.js';
import { STATION_SCENE_MODULES } from './scene/stations/registry.js';
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
import {
  mountUi,
  updateArStatus,
  updateHud,
  updateToast,
  updateTutorial,
} from './ui/main.jsx';
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
  // A charge can be dragged directly from the unlocked view.  Do not let the
  // click that follows that drag unexpectedly engage pointer-lock navigation.
  if (gaussPointerDrag?.suppressClick) {
    gaussPointerDrag.suppressClick = false;
    return;
  }
  if (!controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => {
  document.body.classList.add('locked');
  // Pointer-lock mouse input is an explicit desktop interaction mode.  Pause
  // AR gesture callbacks while it is active so a visible hand cannot compete
  // with the mouse for the same experiment target.
  arInteractionController?.setEnabled(false);
});
controls.addEventListener('unlock', () => {
  document.body.classList.remove('locked');
  if (handTracking?.isActive()) arInteractionController?.setEnabled(true);
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
const mat = createMaterials();
const primitives = createPrimitives();
const { rbox, box, cyl, sphere, torus } = primitives;
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

  // Only the root group is interactive. Child meshes (face/board) stay as pure
  // geometry so resolveInteractive walks up to this host, where pick/draw APIs live.
  // (Tagging children as interactive caused the mesh to be selected without APIs.)
  const markMeta = (o) => {
    o.userData.type = 'side_blackboard';
    o.userData.role = 'side_blackboard';
    o.userData.maxInteractDist = FRONT_WALL_DISPLAY_MAX_DIST;
  };
  markMeta(g);
  markMeta(face);
  markMeta(board);
  g.userData.interactive = true;

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

// —— Experiment category stations ——

//  Place equipment by station theme
const TABLE_Y = 0.93;
const ISLAND_Y = 1.0;

const sharedProps = createSharedProps({ THREE, materials: mat, primitives });

const stationContext = {
  THREE,
  scene,
  camera,
  renderer,
  materials: mat,
  primitives,
  shared: sharedProps,
  registerAnimator: (animateStation) => animators.push(animateStation),
  getExperimentState: () => expManager?.state ?? null,
  constants: { TABLE_Y, ISLAND_Y },
};
const stationScenes = {};
for (const [stationId, createStation] of Object.entries(STATION_SCENE_MODULES)) {
  const station = createStation(stationContext);
  stationScenes[stationId] = station;
  scene.add(station.root);
  station.animators.forEach(stationContext.registerAnimator);
}

const hallBench = stationScenes.electro.refs.hallBench;

// Center island remains shared lab equipment.
const holo = sharedProps.makeHoloTerminal();
holo.position.set(0, ISLAND_Y, 0.3);
scene.add(holo);

[
  { o: sharedProps.makeBeaker(0.14, 0.042, 0xa78bfa), p: [0.7, ISLAND_Y, 0.2] },
  { o: sharedProps.makeBeaker(0.11, 0.032, 0xfbbf24), p: [1.0, ISLAND_Y, 0.5] },
].forEach(({ o, p }) => {
  o.position.set(...p);
  scene.add(o);
});
sharedProps.animators.forEach(stationContext.registerAnimator);

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
  // Larger tabletop terminal so experiment cards are easy to aim at.
  const panelW = 0.98;
  const panelH = 0.68;
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

  // Tabletop terminal is selector-only: activate + choose experiment.
  const HOLO_SURFACE = 'selector';

  const syncScreenLayout = (active) => {
    const layout = getHoloScreenLayoutSize({
      active: !!active,
      hud: active ? boundHud : null,
      dataHtml: boundDataHtml,
      surface: HOLO_SURFACE,
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
    const key = `${active ? 1 : 0}|${maxed}|${rev}|${boundHud?.expId || ''}|${boundHud?.stepIndex ?? ''}|${boundHud?.running ? 1 : 0}|${c.width}x${c.height}|${boundDataHtml.slice(0, 48)}`;
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
      surface: HOLO_SURFACE,
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
    o.userData.role = 'holo_selector';
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
    const nextDataHtml = dataHtml || '';
    const unchanged = boundHud === hud && boundDataHtml === nextDataHtml;
    boundHud = hud;
    boundDataHtml = nextDataHtml;
    // Inactive selector screens receive the same cleared HUD on every state
    // update. Avoid invalidating their canvas cache unless the payload really
    // changed; switching experiments otherwise repaints every screen twice.
    if (unchanged) {
      draw(!!g.userData.active, false);
      return;
    }
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

/**
 * Large floating content display in front of each experiment table.
 * Shows experiment steps/controls; activated by the tabletop selector terminal.
 */
function makeStationDisplay(stationId, title, accentHex, accentNum = 0x38bdf8) {
  const g = new THREE.Group();
  // Content panel sized for dense HUD layouts (not a wall-filling blank canvas).
  const panelW = 2.55;
  const panelH = 1.55;
  const fullTitle = STATION_LABEL[stationId] || title;
  const enTitle = STATION_EN[stationId] || 'STATION';
  const SURFACE = 'display';

  // Ultra-Thin Titanium Micro-Bezel (Stark Industries Zero-Bezel Minimalist Glass)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee9,
    metalness: 0.65,
    roughness: 0.22,
  });
  const rim = rbox(panelW + 0.014, panelH + 0.014, 0.01, rimMat, 0.004);
  rim.position.z = -0.005;
  g.add(rim);

  // Optical Edge Glow Wire (Subtle Luminous Halo around Rim)
  const haloMat = new THREE.MeshBasicMaterial({
    color: accentNum,
    transparent: true,
    opacity: 0.55,
  });
  const halo = rbox(panelW + 0.02, panelH + 0.02, 0.003, haloMat, 0.004);
  halo.position.z = -0.006;
  g.add(halo);

  // Floating Micro-Stabilizer Lines (Futuristic Optical Suspension Bars)
  const stabMat = new THREE.MeshBasicMaterial({
    color: accentNum,
    transparent: true,
    opacity: 0.45,
  });
  const topStab = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.35, 0.003, 0.003), stabMat);
  topStab.position.set(0, panelH / 2 + 0.018, 0);
  g.add(topStab);
  const botStab = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.35, 0.003, 0.003), stabMat);
  botStab.position.set(0, -panelH / 2 - 0.018, 0);
  g.add(botStab);

  let c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  let ctx = c.getContext('2d');
  let lastDrawKey = '';
  let hitRegions = [];
  let boundHud = null;
  let boundDataHtml = '';

  g.userData.maximized = false;
  g.userData._baseY = 0;
  g.userData.accentHex = accentHex;
  g.userData.fullTitle = fullTitle;
  g.userData.enTitle = enTitle;
  g.userData.surface = SURFACE;

  const createScreenTexture = () => {
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  let tex = createScreenTexture();

  const screenMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.85,
    side: THREE.FrontSide,
    depthWrite: false,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), screenMat);
  screen.position.z = 0.01;
  g.add(screen);

  // 3D Crystal Glass Substrate (Provides realistic physical thickness and glass reflections)
  const substrateMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.08,
    roughness: 0.06,
    transmission: 0.94,
    thickness: 0.12,
    transparent: true,
    opacity: 0.32,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.54,
    reflectivity: 0.9,
  });
  const substrate = rbox(panelW, panelH, 0.006, substrateMat, 0.004);
  substrate.position.z = 0.003;
  g.add(substrate);

  // Soft rear face so the panel stays readable if viewed from a slight angle
  const backMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.22,
    side: THREE.FrontSide,
    depthWrite: false,
    toneMapped: false,
  });
  const backFace = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), backMat);
  backFace.rotation.y = Math.PI;
  backFace.position.z = -0.03;
  g.add(backFace);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(panelW + 0.12, panelH + 0.12, 0.18),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  g.add(hit);

  const panelLight = new THREE.PointLight(0xf8fafc, 0.45, 4.5, 2);
  panelLight.position.set(0, 0, 0.35);
  g.add(panelLight);

  // Hidden until an experiment is selected on the tabletop terminal.
  g.visible = false;
  g.userData.present = false;

  const syncScreenLayout = (active) => {
    const layout = getHoloScreenLayoutSize({
      active: !!active,
      hud: active ? boundHud : null,
      dataHtml: boundDataHtml,
      surface: SURFACE,
    });
    if (layout.width === c.width && layout.height === c.height) return false;

    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = layout.width;
    nextCanvas.height = layout.height;
    c = nextCanvas;
    ctx = c.getContext('2d');
    const previousTexture = tex;
    tex = createScreenTexture();
    screenMat.map = tex;
    backMat.map = tex;
    screenMat.needsUpdate = true;
    backMat.needsUpdate = true;
    g.userData.tex = tex;
    const sx = layout.width / 1280;
    const sy = layout.height / 800;
    screen.scale.set(sx, sy, 1);
    substrate.scale.set(sx, sy, 1);
    backFace.scale.set(sx, sy, 1);
    rim.scale.set(sx, sy, 1);
    halo.scale.set(sx, sy, 1);
    hit.scale.set(sx, sy, 1);
    topStab.position.set(0, (panelH * sy) / 2 + 0.018, 0);
    botStab.position.set(0, -(panelH * sy) / 2 - 0.018, 0);
    if (g.userData._baseY !== undefined) {
      g.position.y = g.userData._baseY + (panelH * (sy - 1)) / 2;
    }

    g.userData.canvasW = layout.width;
    g.userData.canvasH = layout.height;
    g.userData.screenWorldSize = { width: panelW * sx, height: panelH * sy };
    return true;
  };

  const draw = (active, force = false) => {
    const layoutChanged = syncScreenLayout(active);
    const rev = boundHud?._rev ?? 0;
    const maxed = g.userData.maximized ? 1 : 0;
    const key = `${active ? 1 : 0}|${maxed}|${rev}|${boundHud?.expId || ''}|${boundHud?.stepIndex ?? ''}|${boundHud?.running ? 1 : 0}|${c.width}x${c.height}|${boundDataHtml.slice(0, 48)}`;
    if (!force && !layoutChanged && key === lastDrawKey) return;
    lastDrawKey = key;

    const result = drawHoloScreen(ctx, c.width, c.height, {
      accentHex,
      fullTitle,
      enTitle,
      active: !!active,
      hud: active ? boundHud : null,
      dataHtml: boundDataHtml,
      maximized: !!g.userData.maximized,
      surface: SURFACE,
      theme: 'light',
    });
    hitRegions = result.hits || [];
    g.userData.hitRegions = hitRegions;
    g.userData.boundHud = boundHud;
    g.userData.boundDataHtml = boundDataHtml;
    tex.needsUpdate = true;
  };
  draw(false);

  // Stay in the interactables list; presence is gated in pick/aim/visible.
  // (Toggling interactive + recollecting the whole scene every HUD push froze the app.)
  const tag = (o) => {
    o.userData.type = 'holo_display';
    o.userData.role = 'holo_display';
    o.userData.stationId = stationId;
    o.userData.interactive = true;
  };
  tag(g);
  tag(hit);
  tag(screen);
  tag(backFace);
  tag(rim);
  tag(halo);
  tag(topStab);
  tag(botStab);
  tag(substrate);

  function setPresent(on) {
    const present = !!on;
    // Critical: HUD updates every frame while experiments run — only flip visibility
    // when presence actually changes. Never recollect the scene here.
    if (g.userData.present === present && g.visible === present) {
      g.userData.active = present;
      return;
    }
    g.userData.present = present;
    g.userData.active = present;
    g.visible = present;
    // Disable raycasts on hidden panels so they cannot block equipment.
    [hit, screen, backFace, rim, halo, topStab, botStab].forEach((mesh) => {
      mesh.raycast = present ? THREE.Mesh.prototype.raycast : () => {};
    });
    panelLight.intensity = present ? 0.55 : 0;
    if (!present) {
      hitRegions = [];
      g.userData.hitRegions = [];
    }
  }

  // Start with raycasts disabled (hidden).
  [hit, screen, backFace, rim, halo, topStab, botStab].forEach((mesh) => {
    mesh.raycast = () => {};
  });

  g.userData.draw = draw;
  g.userData.tex = tex;
  g.userData.screenFaces = [screen, backFace];
  g.userData.screenRoot = g;
  g.userData.canvasW = c.width;
  g.userData.canvasH = c.height;
  g.userData.setPresent = setPresent;
  g.userData.prewarm = (webglRenderer, activeCamera, targetScene) => {
    const wasVisible = g.visible;
    const wasPresent = g.userData.present;
    syncScreenLayout(true);
    draw(true, true);
    g.visible = true;
    webglRenderer.compile(g, activeCamera, targetScene);
    g.visible = wasVisible;
    g.userData.present = wasPresent;
  };
  g.userData.setHud = (hud, dataHtml = '') => {
    boundHud = hud;
    boundDataHtml = dataHtml || '';
    // Content screen is independent: only paints while an experiment is running.
    const running = !!(hud?.running && hud?.experiment);
    setPresent(running);
    if (running) {
      // Let draw()'s key cache skip identical frames; force only on first show.
      draw(true, false);
    }
  };
  g.userData.setMaximized = (on) => {
    g.userData.maximized = !!on;
    lastDrawKey = '';
    if (g.userData.present) draw(true, true);
  };
  g.userData.pick = (uv) => {
    if (!uv || !g.userData.present) return null;
    return pickHoloScreen(uv.x, uv.y, c.width, c.height, hitRegions, 1);
  };

  const _pickPlane = new THREE.Plane();
  const _pickHit = new THREE.Vector3();
  const _pickLocal = new THREE.Vector3();
  const _pickN = new THREE.Vector3();

  function uvOnFacePlane(raycaster, face) {
    face.updateMatrixWorld(true);
    _pickN.set(0, 0, 1).transformDirection(face.matrixWorld).normalize();
    face.getWorldPosition(_holoWorldPos);
    _pickPlane.setFromNormalAndCoplanarPoint(_pickN, _holoWorldPos);
    const ray = raycaster.ray;
    if (!ray.intersectPlane(_pickPlane, _pickHit)) return null;
    _pickLocal.subVectors(_pickHit, ray.origin);
    if (_pickLocal.dot(ray.direction) < 1e-4) return null;
    _pickLocal.copy(_pickHit);
    face.worldToLocal(_pickLocal);
    const u = (_pickLocal.x / panelW) + 0.5;
    const v = (_pickLocal.y / panelH) + 0.5;
    if (u < -0.08 || u > 1.08 || v < -0.08 || v > 1.08) return null;
    return {
      u: THREE.MathUtils.clamp(u, 0, 1),
      v: THREE.MathUtils.clamp(v, 0, 1),
      distance: ray.origin.distanceTo(_pickHit),
    };
  }

  function collectScreenSamples(raycaster) {
    g.updateMatrixWorld(true);
    screen.updateMatrixWorld(true);
    backFace.updateMatrixWorld(true);
    const samples = [];
    for (const face of [screen, backFace]) {
      const uvInfo = uvFromRayAndMesh(raycaster, face) || uvOnFacePlane(raycaster, face);
      if (!uvInfo) continue;
      samples.push({ face, ...uvInfo });
    }
    samples.sort((a, b) => a.distance - b.distance);
    return samples;
  }

  g.userData.screenAimFromRay = (raycaster) => {
    // Only claim aim while this content panel is present (experiment selected).
    if (!g.userData.present || !g.visible) return null;
    const samples = collectScreenSamples(raycaster);
    return samples[0] || null;
  };

  g.userData.pickFromRay = (raycaster) => {
    if (!g.userData.present || !g.visible) return null;
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

  // Gentle float + soft face toward the player (only while present)
  animators.push((t) => {
    if (!g.userData.present || !g.visible) {
      panelLight.intensity = 0;
      return;
    }
    const phase = t + stationId.length * 1.1 + 2.1;
    g.position.y = g.userData._baseY + Math.sin(phase * 1.1) * 0.03;

    g.getWorldPosition(_holoWorldPos);
    _holoCamDir.subVectors(camera.position, _holoWorldPos);
    _holoCamDir.y = 0;
    if (_holoCamDir.lengthSq() > 1e-6) {
      _holoCamDir.normalize();
      const targetYaw = Math.atan2(_holoCamDir.x, _holoCamDir.z);
      let dy = targetYaw - g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * 0.08;
    }

    const pulse = 0.95 + 0.03 * Math.sin(t * 2.1);
    screenMat.opacity = THREE.MathUtils.clamp(pulse, 0.92, 0.99);
    backMat.opacity = 0.22;
    panelLight.intensity = 0.38 + 0.08 * Math.sin(t * 2.4);
    haloMat.opacity = 0.45 + 0.15 * Math.sin(t * 2.5);
    stabMat.opacity = 0.30 + 0.15 * Math.sin(t * 3.0);

    draw(true);
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
// Front-of-table floating content screens: table "front" faces the chalkboard wall (-Z).
// Offset farther from each bench so the panel clears equipment / hands more cleanly.
// Content displays sit slightly above table height so the bench stays visible.
const displayConfigs = [
  { id: 'mechanics', title: '力学', accent: '#38bdf8', accentNum: 0x38bdf8, pos: [-4.2, 2.15, -4.05], rotY: 0 },
  { id: 'optics', title: '光学', accent: '#fbbf24', accentNum: 0xfbbf24, pos: [4.2, 2.15, -4.05], rotY: 0 },
  { id: 'electro', title: '电磁学', accent: '#f472b6', accentNum: 0xf472b6, pos: [-4.2, 2.15, 1.45], rotY: 0 },
  { id: 'thermo', title: '热力学', accent: '#fb923c', accentNum: 0xfb923c, pos: [4.2, 2.15, 1.45], rotY: 0 },
];
const holos = {};
const stationDisplays = {};
holoConfigs.forEach(({ id, title, accent, accentNum, pos, rotY }) => {
  const h = makeHoloPanel(id, title, accent, accentNum);
  h.position.set(...pos);
  h.rotation.y = rotY;
  scene.add(h);
  holos[id] = h;
});
displayConfigs.forEach(({ id, title, accent, accentNum, pos, rotY }) => {
  const d = makeStationDisplay(id, title, accent, accentNum);
  d.position.set(...pos);
  d.rotation.y = rotY;
  d.userData._baseY = pos[1];
  const panelH = 1.55;
  const sy = (d.userData.canvasH || 800) / 800;
  d.position.y = pos[1] + (panelH * (1 - sy)) / 2;
  scene.add(d);
  stationDisplays[id] = d;
  if (holos[id]) holos[id].userData.display = d;
});

// Build equipment refs for experiment manager
const equipment = {
  holos,
  displays: stationDisplays,
  mechanics: stationScenes.mechanics.equipment,
  optics: stationScenes.optics.equipment,
  electro: stationScenes.electro.equipment,
  thermo: stationScenes.thermo.equipment,
};



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
  updateToast(msg);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    updateToast(null);
  }, 2400);
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
  if (expId === 'faraday_induction') {
    const motion = data.lastMotion;
    const induction = data.lastInduction;
    const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
    return `B = ${fmt(data.B, 2)} T · A = ${fmt(data.area)} m² · Φ = ${fmt(data.flux)} Wb\n`
      + `铜棒 x = ${fmt(data.x)} · 楞次方向: ${data.currentSense || '无'}\n`
      + `动生 ε = ${motion ? fmt(motion.emf, 4) : '—'} · 感生 ε = ${induction ? fmt(induction.emf, 4) : '—'}\n`
      + `记录: ${Array.isArray(data.records) ? data.records.length : 0} 组`;
  }
  if (expId === 'hall_carrier_demo') {
    return `I = ${Number(data.I || 0).toFixed(2)}　B = ${Number(data.B || 0).toFixed(2)}\nn = ${Number(data.n || 0).toFixed(2)}　d = ${Number(data.d || 0).toFixed(2)}\nVₕ(rel.) = ${Number(data.vh || 0).toFixed(3)}　${data.nType ? 'n 型' : 'p 型'}\n${data.paused ? '动效已暂停' : '载流子运动中'}`;
  }
  if (expId === 'gauss_theorem') {
    const selected = data.charges?.find((charge) => charge.id === data.selectedId);
    return `Q内 = ${Number(data.qEnclosed || 0).toFixed(2)} e　ΦE = ${Number(data.flux || 0).toFixed(2)} / ε₀\nR = ${Number(data.radius || 0).toFixed(2)}　<Eₙ> = ${Number(data.meanField || 0).toFixed(3)}\n电荷数: ${data.charges?.length || 0}　选中: ${selected ? `${selected.q > 0 ? '+' : ''}${selected.q.toFixed(1)} e` : '无'}`;
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
  // Fullscreen mirrors the front content display (experiment UI).
  const display = stationDisplays[sid];
  const source = display?.userData || ud;
  const result = drawHoloScreen(holoFsCtx, W, H, {
    accentHex: source.accentHex || ud.accentHex || '#38bdf8',
    fullTitle: source.fullTitle || ud.fullTitle || '实验台',
    enTitle: source.enTitle || ud.enTitle || 'STATION',
    active: true,
    hud: lastHudSnapshot,
    dataHtml: lastHudDataHtml,
    maximized: true,
    surface: 'display',
    theme: 'light',
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
  const display = stationDisplays[stationId];
  holo?.userData?.setMaximized?.(true);
  display?.userData?.setMaximized?.(true);
  resizeHoloFsCanvas();
  paintHoloFs();
  showToast('已全屏显示实验内容屏 · Esc 退出全屏');
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
  if (sid && !keepMaximizedFlag) {
    holos[sid]?.userData?.setMaximized?.(false);
    stationDisplays[sid]?.userData?.setMaximized?.(false);
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
  /** @type {{ pointerId: number, lastY: number, moved: boolean, pick: object } | null} */
  let fsTableDrag = null;
  let fsFaradayDrag = null;

  function fsFaradayValueAt(clientX, pick) {
    const point = mapFsClickToCanvas(clientX, 0);
    if (!point || !pick) return null;
    const u = THREE.MathUtils.clamp((point.px - pick.x) / Math.max(1, pick.w), 0, 1);
    return Number(pick.min ?? -3) + u * (Number(pick.max ?? 3) - Number(pick.min ?? -3));
  }

  function fsDisplayTarget() {
    return {
      userData: {
        type: 'holo_display',
        role: 'holo_display',
        stationId: holoFsState.stationId,
        hitRegions: holoFsState.hits || [],
      },
    };
  }

  function fsScrollPick(atPick = null) {
    if (atPick?.action === 'hall-scroll-table' || atPick?.role === 'scrollable_table') return atPick;
    return (holoFsState.hits || []).find(
      (h) => h?.action === 'hall-scroll-table' || h?.role === 'scrollable_table',
    ) || atPick || null;
  }

  holoFsCanvas.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // A completed drag-scroll should not also fire the underlying control.
    if (fsTableDrag?.moved || fsFaradayDrag?.moved) {
      fsTableDrag = null;
      fsFaradayDrag = null;
      return;
    }
    const pick = pickFsAt(e.clientX, e.clientY);
    // Table region is scroll-only — clicks are not a discrete action.
    if (pick?.action === 'hall-scroll-table') return;
    if (pick) handleHoloScreenAction(pick, holoFsState.stationId);
  });
  holoFsCanvas.addEventListener('pointerdown', (e) => {
    if (!holoFsState.open || e.button !== 0) return;
    const pick = pickFsAt(e.clientX, e.clientY);
    if (pick?.action === 'faraday-b-slider') {
      fsFaradayDrag = { pointerId: e.pointerId, pick, moved: false };
      const value = fsFaradayValueAt(e.clientX, pick);
      if (value != null) expManager?.uiAction?.('faraday-b-set', { value });
      try { holoFsCanvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
      return;
    }
    if (pick?.action !== 'hall-scroll-table' && pick?.role !== 'scrollable_table') return;
    fsTableDrag = {
      pointerId: e.pointerId,
      lastY: e.clientY,
      moved: false,
      pick: fsScrollPick(pick),
    };
    try { holoFsCanvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  holoFsCanvas.addEventListener('pointermove', (e) => {
    if (fsFaradayDrag && fsFaradayDrag.pointerId === e.pointerId) {
      const livePick = (holoFsState.hits || []).find((h) => h?.action === 'faraday-b-slider') || fsFaradayDrag.pick;
      const value = fsFaradayValueAt(e.clientX, livePick);
      if (value != null) {
        fsFaradayDrag.moved = true;
        fsFaradayDrag.pick = livePick;
        expManager?.uiAction?.('faraday-b-set', { value });
      }
      e.preventDefault();
      return;
    }
    if (!fsTableDrag || fsTableDrag.pointerId !== e.pointerId) {
      const pick = pickFsAt(e.clientX, e.clientY);
      if (pick?.action === 'hall-scroll-table' || pick?.role === 'scrollable_table') {
        holoFsCanvas.style.cursor = pick.scrollable === false ? 'default' : 'ns-resize';
      } else {
        holoFsCanvas.style.cursor = pick ? 'pointer' : 'default';
      }
      return;
    }
    const dy = e.clientY - fsTableDrag.lastY;
    fsTableDrag.lastY = e.clientY;
    if (Math.abs(dy) < 0.5) return;
    fsTableDrag.moved = true;
    // Refresh metrics after prior frames may have repainted the table.
    const livePick = fsScrollPick(fsTableDrag.pick);
    fsTableDrag.pick = livePick || fsTableDrag.pick;
    // Finger/content follows: drag up reveals later rows (same as wheel down).
    const ok = expManager?.uiAction?.('hall-scroll-table', {
      deltaPx: -dy,
      rowH: fsTableDrag.pick?.rowH,
      maxRows: fsTableDrag.pick?.maxRows,
      maxStart: fsTableDrag.pick?.maxStart,
    });
    if (ok) e.preventDefault();
  });
  const endFsTableDrag = (e) => {
    if (!fsTableDrag || (e && fsTableDrag.pointerId !== e.pointerId)) return;
    try { holoFsCanvas.releasePointerCapture(fsTableDrag.pointerId); } catch { /* ignore */ }
    // Keep moved flag briefly so the trailing click is suppressed.
    const moved = fsTableDrag.moved;
    fsTableDrag = moved ? { ...fsTableDrag, pointerId: -1 } : null;
    if (moved) {
      setTimeout(() => { if (fsTableDrag?.pointerId === -1) fsTableDrag = null; }, 0);
    }
  };
  const endFsFaradayDrag = (e) => {
    if (!fsFaradayDrag || (e && fsFaradayDrag.pointerId !== e.pointerId)) return;
    try { holoFsCanvas.releasePointerCapture(fsFaradayDrag.pointerId); } catch { /* ignore */ }
    expManager?.endManipulation?.({ userData: { role: 'faraday-b-slider' } }, { time: clock.elapsedTime });
    const moved = fsFaradayDrag.moved;
    fsFaradayDrag = moved ? { ...fsFaradayDrag, pointerId: -1 } : null;
    if (moved) setTimeout(() => { if (fsFaradayDrag?.pointerId === -1) fsFaradayDrag = null; }, 0);
  };
  holoFsCanvas.addEventListener('pointerup', endFsTableDrag);
  holoFsCanvas.addEventListener('pointercancel', endFsTableDrag);
  holoFsCanvas.addEventListener('pointerup', endFsFaradayDrag);
  holoFsCanvas.addEventListener('pointercancel', endFsFaradayDrag);
  holoFsCanvas.addEventListener('wheel', (e) => {
    if (!holoFsState.open || !expManager) return;
    const atPick = pickFsAt(e.clientX, e.clientY);
    const pick = fsScrollPick(atPick);
    // Match 3D behavior: wheel anywhere on the fullscreen content panel can
    // drive the data table when the record view is active (not only when the
    // cursor is pixel-perfect over the table rect).
    if (expManager.onWheel(e.deltaY, fsDisplayTarget(), pick)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });
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
    }
  });

  // Front content displays are independent: only appear after an experiment is chosen.
  Object.entries(stationDisplays).forEach(([id, d]) => {
    if (!d?.userData) return;
    const isRunningHere = !!(
      hud?.menuOpen
      && hud?.running
      && hud.station?.id === id
      && hud.experiment
    );
    if (isRunningHere && payload) {
      d.userData.setHud?.(payload, dataHtml);
    } else if (d.userData.present || d.userData.active) {
      d.userData.setMaximized?.(false);
      d.userData.setPresent?.(false);
      d.userData.setHud?.(null, '');
    }
  });

  // Keep fullscreen overlay in sync with live experiment data
  if (holoFsState.open) {
    if (!hud?.menuOpen || !hud?.running || hud.station?.id !== holoFsState.stationId) {
      closeHoloFullscreen();
    } else {
      paintHoloFs();
    }
  }
}

function handleHoloScreenAction(pick, stationId) {
  if (!pick?.action || !expManager) return false;
  const t = clock.elapsedTime;
  switch (pick.action) {
    case 'close':
      closeHoloFullscreen();
      expManager.closeMenu();
      showToast('已关闭实验终端');
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
    case 'hall-scroll-table':
      // Data-table scrolling is owned by wheel / drag handlers, not clicks.
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
  updateHud(hud);
  pushHudToHoloScreens(hud);
}

expManager = createExperimentManager({
  equipment,
  onHudUpdate,
  onToast: showToast,
});

// Compile hidden apparatus while the boot loader is still up.
Object.values(stationScenes.electro.prewarm).forEach((prewarm) => prewarm());

const preparedExperimentIds = new Set();
let prepareIdleHandle = 0;
function prepareExperiment(expId) {
  if (!expId || preparedExperimentIds.has(expId)) return;
  preparedExperimentIds.add(expId);
  const run = () => {
    prepareIdleHandle = 0;
    stationDisplays[expManager?.state?.stationId || '']?.userData?.prewarm?.(renderer, camera, scene);
    stationScenes[expManager?.state?.stationId || '']?.prewarm?.[expId]?.();
  };
  if (typeof window.requestIdleCallback === 'function') {
    prepareIdleHandle = window.requestIdleCallback(run, { timeout: 900 });
  } else {
    prepareIdleHandle = window.setTimeout(run, 80);
  }
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'gauss') {
  const previewParams = new URLSearchParams(window.location.search);
  expManager.openStationMenu('electro');
  expManager.startExperiment('gauss_theorem');
  camera.position.set(-4.0, 1.52, 3.55);
  camera.lookAt(-4.0, 1.18, 2.55);
  if (previewParams.get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('electro'));
  }
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'electric-field') {
  expManager.openStationMenu('electro');
  expManager.startExperiment('electric_field');
  camera.position.set(-4.0, 1.45, 3.65);
  camera.lookAt(-4.0, 1.12, 2.55);
  if (new URLSearchParams(window.location.search).get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('electro'));
  }
}

// Development-only visual QA shortcut for the migrated Faraday apparatus.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'faraday') {
  expManager.openStationMenu('electro');
  expManager.startExperiment('faraday_induction');
  camera.position.set(-3.2, 1.55, 4.0);
  camera.lookAt(-4.0, 1.14, 2.55);
  if (new URLSearchParams(window.location.search).get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('electro'));
  }
}

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
// Used for wheel picking while the pointer is unlocked. PointerLockControls
// keeps the normal ray at the crosshair, but a regular cursor needs its own
// ray based on the wheel event's client coordinates.
const wheelRaycaster = new THREE.Raycaster();
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
// Direct desktop dragging is available before pointer-lock is engaged.  The
// standalone Gauss demo behaves this way, so keep a small pointer gesture
// bridge in the host lab instead of requiring a separate "look" click first.
let gaussPointerDrag = null;
let handTracking = null;
let arInteractionController = null;

// Unlocked desktop drag bridge for the source-style charge/probe interaction.
// Pointer-lock and AR continue to use the normal accumulated movement path.
const unlockedElectroRaycaster = new THREE.Raycaster();
const unlockedElectroPointer = new THREE.Vector2();
let unlockedElectroDrag = null;
let lastElectroPointerEventTime = 0;
function isHierarchyVisible(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function unlockedElectroPick(event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  unlockedElectroPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  unlockedElectroRaycaster.setFromCamera(unlockedElectroPointer, camera);
  const hits = unlockedElectroRaycaster.intersectObjects(interactables, true);
  // Charges/probes may sit behind the transparent hologram. The generic
  // resolver intentionally stops at the first nearby screen hit, so choose
  // semantic electromagnetic targets first for source-style dragging.
  // Invisible apparatus from other electro modes still raycasts in Three.js,
  // so only accept targets that belong to a currently visible hierarchy.
  const preferredRoles = ['electric_charge', 'electric_probe', 'gauss_charge', 'faraday_rod'];
  for (const role of preferredRoles) {
    const hit = hits.find((entry) => {
      const target = resolveInteractive(entry.object);
      return target?.userData?.role === role && isHierarchyVisible(target);
    });
    const target = hit ? resolveInteractive(hit.object) : null;
    if (target) return { target, raycaster: unlockedElectroRaycaster };
  }
  return null;
}
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || controls.isLocked || holoFsState?.open) return;
  const picked = unlockedElectroPick(event);
  if (!picked) return;
  unlockedElectroDrag = {
    ...picked,
    lastX: Number(event.clientX || 0),
    lastY: Number(event.clientY || 0),
  };
  // A successful apparatus pick owns this gesture even when the pointer
  // happens to release without movement; never fall through to pointer-lock.
  gaussPointerDrag = { suppressClick: true };
  holdLMB = true;
  resetMouseDragAccum();
  syncMouseDragState();
  expManager?.beginManipulation(picked.target, { direct: true, time: clock.elapsedTime });
  // Keep the gesture routed to the canvas after the initial hit. Without an
  // explicit capture, moving off the tiny charge hit volume can stop emitting
  // pointermove events in unlocked desktop mode.
  if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
  if (!unlockedElectroDrag) return;
  lastElectroPointerEventTime = performance.now();
  const fallbackDx = Number(event.clientX || 0) - unlockedElectroDrag.lastX;
  const fallbackDy = Number(event.clientY || 0) - unlockedElectroDrag.lastY;
  const dx = Number.isFinite(event.movementX) && event.movementX !== 0 ? event.movementX : fallbackDx;
  const dy = Number.isFinite(event.movementY) && event.movementY !== 0 ? event.movementY : fallbackDy;
  unlockedElectroDrag.lastX = Number(event.clientX || unlockedElectroDrag.lastX);
  unlockedElectroDrag.lastY = Number(event.clientY || unlockedElectroDrag.lastY);
  accumulateMouseDrag(dx, dy);
  expManager?.updateManipulation(unlockedElectroDrag.target, { dt: 1 / 60, time: clock.elapsedTime });
  gaussPointerDrag.suppressClick = true;
});
window.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !unlockedElectroDrag) return;
  expManager?.endManipulation(unlockedElectroDrag.target, { time: clock.elapsedTime });
  if (event.pointerId != null) canvas.releasePointerCapture?.(event.pointerId);
  unlockedElectroDrag = null;
  holdLMB = false;
  syncMouseDragState();
});

// Some desktop automation shells (and older embedded WebViews) expose the
// legacy mouse stream without forwarding pointermove. Mirror the same bridge
// for that path; ignore synthetic mouse events that immediately follow a
// native pointer event so movement is not applied twice.
canvas.addEventListener('mousedown', (event) => {
  if (unlockedElectroDrag || event.button !== 0 || controls.isLocked || holoFsState?.open) return;
  const picked = unlockedElectroPick(event);
  if (!picked) return;
  unlockedElectroDrag = { ...picked, lastX: Number(event.clientX || 0), lastY: Number(event.clientY || 0) };
  gaussPointerDrag = { suppressClick: true };
  holdLMB = true;
  resetMouseDragAccum();
  syncMouseDragState();
  expManager?.beginManipulation(picked.target, { direct: true, time: clock.elapsedTime });
  if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
window.addEventListener('mousemove', (event) => {
  if (!unlockedElectroDrag || performance.now() - lastElectroPointerEventTime < 8) return;
  const fallbackDx = Number(event.clientX || 0) - unlockedElectroDrag.lastX;
  const fallbackDy = Number(event.clientY || 0) - unlockedElectroDrag.lastY;
  const dx = Number.isFinite(event.movementX) && event.movementX !== 0 ? event.movementX : fallbackDx;
  const dy = Number.isFinite(event.movementY) && event.movementY !== 0 ? event.movementY : fallbackDy;
  unlockedElectroDrag.lastX = Number(event.clientX || unlockedElectroDrag.lastX);
  unlockedElectroDrag.lastY = Number(event.clientY || unlockedElectroDrag.lastY);
  accumulateMouseDrag(dx, dy);
  expManager?.updateManipulation(unlockedElectroDrag.target, { dt: 1 / 60, time: clock.elapsedTime });
  gaussPointerDrag.suppressClick = true;
});
window.addEventListener('mouseup', (event) => {
  if (!unlockedElectroDrag || event.button !== 0) return;
  expManager?.endManipulation(unlockedElectroDrag.target, { time: clock.elapsedTime });
  unlockedElectroDrag = null;
  holdLMB = false;
  syncMouseDragState();
});

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

/** Climb to the side-blackboard host that owns pick/draw APIs. */
function resolveSideBlackboardHost(obj) {
  let o = obj;
  while (o) {
    if (
      (o.userData?.type === 'side_blackboard' || o.userData?.role === 'side_blackboard')
      && typeof o.userData.drawFromRay === 'function'
    ) {
      return o;
    }
    o = o.parent;
  }
  return null;
}

/** Climb to tabletop holo / content-display host that owns pickFromRay. */
function resolveScreenHost(obj) {
  let o = obj;
  while (o) {
    const t = o.userData?.type;
    const r = o.userData?.role;
    if (
      (t === 'holo' || t === 'holo_display' || r === 'holo_selector' || r === 'holo_display')
      && typeof o.userData.pickFromRay === 'function'
    ) {
      return o;
    }
    o = o.parent;
  }
  // Fallback via station maps if only a child mesh was selected.
  const sid = obj?.userData?.stationId;
  if (!sid) return null;
  if (obj?.userData?.type === 'holo_display' || obj?.userData?.role === 'holo_display') {
    return stationDisplays[sid] || null;
  }
  return holos[sid] || null;
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
    // Base equal priority; sequential identify boosts the required next part below.
    hall_helmholtz: 50,
    hall_solenoid: 50,
    hall_probe: 50,
    hall_console: 50,
    hall_knob_im: 70,
    hall_knob_is: 70,
    hall_knob_zero: 70,
    gauss_charge: 78,
    gauss_surface: 42,
    electric_charge: 80,
    electric_probe: 82,
    faraday_rod: 86,
    hall_terminal_solenoid: 80,
    hall_terminal_helmholtz: 80,
    hall_terminal_output: 80,
    formula_board: 45,
    side_blackboard: 46,
    electro: 5,
    holo: 40,
    holo_selector: 40,
    holo_display: 48,
  };
  // Slightly wider band so wall-side holos can compete when gear is close.
  // (Screen-plane aim is handled separately in getAimedHolo — that is the
  // primary fix for "instruments block the hologram".)
  // Prefer first hit that is actually interactable (skip distant formula board etc.)
  // and currently visible (hidden electro modes leave raycast-enabled meshes).
  let nearBase = null;
  for (const hit of hits) {
    const o = resolveInteractive(hit.object);
    if (!o) continue;
    if (!isHierarchyVisible(o)) continue;
    if (!withinInteractDist(o, hit.distance)) continue;
    nearBase = hit.distance;
    break;
  }
  if (nearBase == null) return null;
  const near = nearBase + 0.35;
  // During Hall sequential identify, prefer the required next apparatus so a
  // closer ruler/console in the same view cannot permanently shadow it.
  const identifyNext = (
    expManager?.state?.expId === 'hall_effect'
    && expManager.currentStep?.()?.id === 'identify'
    && expManager.state?.data?.identifyNext
  ) || null;
  let best = null;
  let bestScore = -Infinity;
  for (const hit of hits) {
    if (hit.distance > near) break;
    const o = resolveInteractive(hit.object);
    if (!o) continue;
    if (!isHierarchyVisible(o)) continue;
    if (!withinInteractDist(o, hit.distance)) continue;
    const role = o.userData.role || (o.userData.type === 'holo' ? 'holo' : '');
    let pri = ROLE_PRI[role] ?? 10;
    if (identifyNext && role === identifyNext) pri += 45;
    // closer + higher role priority
    const score = pri * 10 - hit.distance;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Live charge / probe under the ray for electric-field & Gauss experiments. */
function pickLiveElectroCharge(hits) {
  const expId = expManager?.state?.expId;
  const preferredRoles = expId === 'electric_field'
    ? ['electric_charge', 'electric_probe']
    : expId === 'gauss_theorem'
      ? ['gauss_charge']
      : expId === 'faraday_induction'
        ? ['faraday_rod']
      : null;
  if (!preferredRoles || !hits?.length) return null;
  for (const role of preferredRoles) {
    const hit = hits.find((entry) => {
      const target = resolveInteractive(entry.object);
      return target?.userData?.role === role && isHierarchyVisible(target);
    });
    if (hit) return resolveInteractive(hit.object);
  }
  return null;
}

/**
 * Prefer floating screens when the crosshair lands on a screen plane.
 * Mesh raycasts often hit table instruments first (they sit closer than the
 * wall-edge projectors), which previously made the holo unusable up close.
 * Content displays are preferred over tabletop selectors when both are aimed.
 */
function getAimedHolo(rc) {
  let best = null;
  let bestDist = Infinity;
  let bestPri = -Infinity;
  const candidates = [
    ...Object.values(stationDisplays).map((d) => ({ screen: d, pri: 2 })),
    ...Object.values(holos).map((h) => ({ screen: h, pri: 1 })),
  ];
  for (const { screen, pri } of candidates) {
    const aim = screen?.userData?.screenAimFromRay?.(rc);
    if (!aim) continue;
    if (aim.distance + 0.05 < bestDist || (Math.abs(aim.distance - bestDist) <= 0.05 && pri > bestPri)) {
      bestDist = aim.distance;
      bestPri = pri;
      best = screen;
    }
  }
  return best;
}

function getAimedHoloControl(rc) {
  let best = null;
  let bestDist = Infinity;
  let bestPri = -Infinity;
  const candidates = [
    ...Object.values(stationDisplays).map((d) => ({ screen: d, pri: 2 })),
    ...Object.values(holos).map((h) => ({ screen: h, pri: 1 })),
  ];
  for (const { screen, pri } of candidates) {
    if (!(screen?.userData?.active || screen?.userData?.present)) continue;
    const aim = screen.userData.screenAimFromRay?.(rc);
    if (!aim) continue;
    if (aim.distance - 0.05 > bestDist) continue;
    // Only an actual button/card region receives UI priority. Empty screen
    // space still obeys the frontmost-surface rule and becomes camera look.
    const pick = screen.userData.pickFromRay?.(rc);
    if (!pick) continue;
    if (aim.distance + 0.05 < bestDist || (Math.abs(aim.distance - bestDist) <= 0.05 && pri > bestPri)) {
      bestDist = aim.distance;
      bestPri = pri;
      best = {
        target: screen,
        hit: { object: screen, distance: aim.distance },
      };
    }
  }
  return best;
}

function getFocusTarget(inputRaycaster = raycaster) {
  if (inputRaycaster === raycaster) {
    inputRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }
  const hits = inputRaycaster.intersectObjects(interactables, true);
  lastFocusHit = hits[0] || null;

  // Charge drag must beat the floating content screen: the display plane often
  // sits between the camera and the bench, and would otherwise swallow grabs.
  const liveCharge = pickLiveElectroCharge(hits);
  if (liveCharge) return liveCharge;

  const aimedHolo = getAimedHolo(inputRaycaster);
  if (aimedHolo) return aimedHolo;

  // The Hall sockets are deliberately tiny in the model.  If the mouse ray
  // passes just beside a socket, use the same semantic nearest-port fallback
  // as AR so the port can still be grabbed instead of selecting the console
  // deck behind it.  Keep this scoped to the Hall experiment and to a narrow
  // aim band so ordinary apparatus picking remains frontmost elsewhere.
  if (expManager?.state?.expId === 'hall_effect') {
    const terminal = hallBench.userData.getHallTerminalTarget?.(inputRaycaster, { maxDistance: 0.11 });
    if (terminal?.target) {
      lastFocusHit = terminal.hit;
      return terminal.target;
    }
  }

  if (!hits.length) return null;
  return resolveInteractivePreferred(hits);
}

function getHandFocusInfo(inputRaycaster) {
  const hits = inputRaycaster.intersectObjects(raycastSurfaces, false);
  const terminalFallback = expManager?.state?.expId === 'hall_effect'
    ? hallBench.userData.getHallTerminalTarget?.(inputRaycaster)
    : null;
  const holoControl = getAimedHoloControl(inputRaycaster);
  return resolveFrontmostInteraction(hits, {
    resolveInteractive,
    withinInteractDist,
    // A live hologram button remains highest priority.  Otherwise a nearby
    // Hall terminal gets semantic priority when the AR ray is within its
    // forgiving aim radius, even if the deck is the first visible surface.
    priorityInteraction: holoControl || terminalFallback,
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

  // Screen-plane aim wins over closer instrument meshes — except live charges,
  // which must remain draggable even when the content panel intersects the ray.
  const directTarget = directContext?.target || null;
  const directCharge = directTarget && (
    directTarget.userData?.role === 'electric_charge'
    || directTarget.userData?.role === 'electric_probe'
    || directTarget.userData?.role === 'gauss_charge'
  ) && isHierarchyVisible(directTarget)
    ? directTarget
    : pickLiveElectroCharge(hits);
  if (directCharge && !resolveScreenHost(directTarget)) {
    if (directContext) {
      expManager.beginManipulation(directCharge, {
        ...directContext,
        time: directContext.time ?? t,
        raycaster: inputRaycaster,
      });
    } else {
      expManager.interact(directCharge, t);
    }
    return;
  }
  const directScreen = resolveScreenHost(directTarget);
  const aimedHolo = directScreen
    || (!directContext ? getAimedHolo(inputRaycaster) : null);
  if (aimedHolo) {
    const sid = aimedHolo.userData.stationId;
    const isDisplay = aimedHolo.userData.type === 'holo_display'
      || aimedHolo.userData.role === 'holo_display';
    const screenLive = !!(aimedHolo.userData.active || aimedHolo.userData.present);
    if (screenLive) {
      const pick = aimedHolo.userData.pickFromRay?.(inputRaycaster)
        || (lastFocusHit?.uv ? aimedHolo.userData.pick?.(lastFocusHit.uv) : null);
      if (pick) {
        // Faraday B slider on the content screen: press-and-drag (pointer-lock,
        // E-hold, or AR pinch). Must not fall through to discrete uiAction —
        // action id "faraday-b-slider" is not a one-shot button.
        if (pick.action === 'faraday-b-slider') {
          expManager.beginManipulation(aimedHolo, {
            ...(directContext || {}),
            time: directContext?.time ?? t,
            raycaster: inputRaycaster,
            pick,
          });
          return;
        }
        // Data-table region: arm a press-and-drag scroll (mouse + AR pinch),
        // matching the fullscreen drag / wheel behaviour.
        if (pick.action === 'hall-scroll-table' || pick.role === 'scrollable_table') {
          if (directContext) {
            expManager.beginManipulation(aimedHolo, {
              ...directContext,
              time: directContext.time ?? t,
              raycaster: inputRaycaster,
              pick,
            });
          } else {
            // Discrete click/tap on the table is a no-op; scrolling needs drag/wheel.
            handleHoloScreenAction(pick, sid);
          }
          return;
        }
        handleHoloScreenAction(pick, sid);
        return;
      }
      showToast(isDisplay
        ? '请瞄准内容屏上的控件'
        : '请瞄准桌面终端上的实验卡片');
      return;
    }
    // Only the tabletop selector opens the station menu.
    if (!isDisplay) {
      expManager.interact(aimedHolo, t);
      return;
    }
    showToast('请先在桌面终端选择实验');
    return;
  }

  // Prefer a nearby Hall terminal for desktop mouse grabs even when the ray
  // intersects the console/deck first.  The fallback is intentionally only
  // used for a live Hall experiment and remains narrow enough to distinguish
  // the adjacent red/black sockets.
  const terminalFallback = !directContext && expManager?.state?.expId === 'hall_effect'
    ? hallBench.userData.getHallTerminalTarget?.(inputRaycaster, { maxDistance: 0.11 })
    : null;
  const target = directTarget || terminalFallback?.target || resolveInteractivePreferred(hits);

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
    const board = resolveSideBlackboardHost(target) || target;
    const boardHit = hits.find((h) => {
      const o = resolveInteractive(h.object);
      return o && (o.userData.type === 'side_blackboard' || o.userData.role === 'side_blackboard');
    });
    if (boardHit && !withinInteractDist(board, boardHit.distance)) {
      frontWallTooFarToast();
      return;
    }
    const pick = board.userData.pickFromRay?.(inputRaycaster);
    if (!pick) {
      if (boardHit && withinInteractDist(board, boardHit.distance)) {
        showToast('瞄准黑板工具栏或书写区后按 E');
      }
      return;
    }
    if (pick.action === 'color' || pick.action === 'size') {
      board.userData.applyPick(pick);
      showToast(pick.action === 'color' ? '已选择画笔颜色' : '已选择画笔粗细');
    } else if (pick.action === 'draw') {
      board.userData.drawFromRay?.(inputRaycaster);
    }
    return;
  }

  // Hologram mesh/hitbox (pedestal / content frame) when not on the screen plane
  if (
    target?.userData?.type === 'holo'
    || target?.userData?.type === 'holo_display'
    || target?.userData?.role === 'holo_selector'
    || target?.userData?.role === 'holo_display'
  ) {
    const screen = resolveScreenHost(target) || target;
    const sid = screen.userData.stationId;
    const isDisplay = screen.userData.type === 'holo_display'
      || screen.userData.role === 'holo_display';
    // Hidden content screens must not swallow clicks / block the lab.
    if (isDisplay && !(screen.userData.present && screen.visible)) {
      // fall through to equipment / other targets
    } else if (screen?.userData?.active || screen?.userData?.present) {
      // Prefer dedicated plane raycast (hit box has no reliable UV)
      const pick = screen.userData.pickFromRay?.(inputRaycaster)
        || (lastFocusHit?.uv ? screen.userData.pick?.(lastFocusHit.uv) : null);
      if (pick) {
        if (pick.action === 'faraday-b-slider') {
          expManager.beginManipulation(screen, {
            ...(directContext || {}),
            time: directContext?.time ?? t,
            raycaster: inputRaycaster,
            pick,
          });
          return;
        }
        if (pick.action === 'hall-scroll-table' || pick.role === 'scrollable_table') {
          if (directContext) {
            expManager.beginManipulation(screen, {
              ...directContext,
              time: directContext.time ?? t,
              raycaster: inputRaycaster,
              pick,
            });
          } else {
            handleHoloScreenAction(pick, sid);
          }
          return;
        }
        handleHoloScreenAction(pick, sid);
        return;
      }
      showToast(isDisplay
        ? '请瞄准内容屏上的控件'
        : '请瞄准桌面终端上的实验卡片');
      return;
    } else if (!isDisplay) {
      expManager.interact(screen, t);
      return;
    }
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
  if (equipment?.electro?.mouseDrag) {
    equipment.electro.mouseDrag.movementX = 0;
    equipment.electro.mouseDrag.movementY = 0;
  }
  if (equipment?.optics?.mouseDrag) equipment.optics.mouseDrag.movementX = 0;
}

function accumulateMouseDrag(dx, dy = 0) {
  if (equipment?.electro?.mouseDrag) {
    equipment.electro.mouseDrag.movementX += dx;
    equipment.electro.mouseDrag.movementY += dy;
  }
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
  updateArStatus({ phase: snapshot?.phase || 'off', status: arInteractionLabel });
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
  updateTutorial(true);
  window.clearTimeout(arTutorialTimer);
  arTutorialTimer = window.setTimeout(() => {
    arTutorialEl.classList.remove('is-visible');
    updateTutorial(false);
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
  updateArStatus({
    active: phase === 'running',
    phase,
    detail: handTrackingDetail,
    status: phase === 'running' ? (arInteractionLabel || '准备') : handTrackingDetail,
    activeHand,
    trackingFps,
    inferenceMs,
    pipelineMs,
    degraded,
  });
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
    // Forward both axes so table scroll (Y) and probe/knob drags (X) work in AR.
    accumulateMouseDrag(
      THREE.MathUtils.clamp(Number(event.dx || 0), -60, 60),
      THREE.MathUtils.clamp(Number(event.dy || 0), -60, 60),
    );
    expManager?.updateManipulation(event.target, {
      ...event,
      time: clock.elapsedTime,
    });
    const board = resolveSideBlackboardHost(event.target);
    if (board) {
      board.userData.drawFromRay?.(event.raycaster);
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
  // Do not let AR callbacks compete with pointer-lock mouse interaction.
  arInteractionController.setEnabled(active && !controls.isLocked);
  if (active) showArTutorial();
  else {
    arTutorialEl?.classList.remove('is-visible');
    updateTutorial(false);
  }
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
  accumulateMouseDrag(Number(e.movementX || 0), Number(e.movementY || 0));
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
  if (!expManager || holoFsState?.open) return;

  let target = null;
  let pickRay = raycaster;
  if (controls.isLocked) {
    // Pointer-lock input uses the crosshair at the center of the viewport.
    target = getFocusTarget(raycaster);
  } else {
    // When the cursor is free, only the WebGL canvas should be treated as a
    // 3D interaction surface. Build a ray through the actual cursor position
    // so moving the cursor over a content screen selects that screen.
    if (e.target !== canvas && !canvas.contains?.(e.target)) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    wheelRaycaster.setFromCamera(ndc, camera);
    pickRay = wheelRaycaster;
    target = getFocusTarget(wheelRaycaster);
  }

  // Resolve the aimed content screen once more before dispatching the wheel.
  // This intentionally outranks nearby apparatus hitboxes: when the crosshair
  // is on the data table, the wheel belongs to that table, not to a coil or
  // console behind the panel.
  const aimedScreen = getAimedHolo(pickRay);
  if (aimedScreen) target = aimedScreen;
  const pick = target?.userData?.pickFromRay ? target.userData.pickFromRay(pickRay) : null;
  // Prefer the scrollable-table hit metadata even when the ray currently rests
  // on a nearby button, so maxRows/maxStart match the painted viewport.
  let wheelPick = pick;
  if (pick?.action !== 'hall-scroll-table' && pick?.role !== 'scrollable_table') {
    const regions = target?.userData?.hitRegions;
    const scrollHit = Array.isArray(regions)
      ? regions.find((h) => h?.action === 'hall-scroll-table' || h?.role === 'scrollable_table')
      : null;
    if (scrollHit) wheelPick = scrollHit;
  }
  if (expManager.onWheel(e.deltaY, target, wheelPick)) e.preventDefault();
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
    // Once pointer lock is active, the mouse owns the central ray.  AR hands
    // remain rendered, but their hover/hold state must not shadow mouse gear
    // controls or keep a stale terminal drag alive.
    const mouseMode = controls.isLocked;
    focusedTarget = mouseMode ? pointerTarget : (handInteraction?.target || pointerTarget);
    const handHolding = !mouseMode && !!handInteraction?.holding;
    expManager.holdInteract(holdE || holdLMB || handHolding, t, dt, focusedTarget);
    expManager.update(t, dt);
    const focusedBoard = resolveSideBlackboardHost(focusedTarget);
    if (holdLMB && focusedBoard) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      focusedBoard.userData.drawFromRay?.(raycaster);
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
      || (hallRun && expManager.state.data?.tableScrollDrag?.armed)
      || (opticsRun && expManager.state.data?.dragging)
      || (hallRun && expManager.currentStep?.()?.id === 'identify')
    );
    if (crosshair) {
      if (canInteract) crosshair.classList.add('can-interact');
      else crosshair.classList.remove('can-interact');
    }
  }

  for (const fn of animators) fn(t);
  renderer.render(scene, camera);
}

mountUi({
  bridge: {
    prepareExperiment,
    openStationMenu: (stationId) => expManager?.openStationMenu(stationId),
    closeMenu: () => expManager?.closeMenu(),
    startExperiment: (expId) => expManager?.startExperiment(expId),
    exitExperiment: () => expManager?.exitExperiment(),
    uiAction: (action, payload) => expManager?.uiAction(action, payload),
    recordExperiment: () => expManager?.onKey('KeyF', clock.elapsedTime),
    triggerExperimentAction: () => expManager?.interact({ userData: { role: 'ui_action' } }, clock.elapsedTime),
    toggleHandTracking,
    openFullscreen: (stationId) => openHoloFullscreen(stationId),
    closeFullscreen: () => closeHoloFullscreen(),
  },
});

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
