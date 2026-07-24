import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createExperimentManager, STATION_EXPERIMENTS, STATION_MODULES } from './experiments/index.js';
import { createMaterials } from './scene/shared/materials.js';
import { createPrimitives } from './scene/shared/primitives.js';
import { createSharedProps } from './scene/shared/labProps.js';
import { STATION_SCENE_MODULES } from './scene/stations/registry.js';
import { getAppInfo, isTauri } from './tauri.js';
import { createLabLoader } from './loader.js';
import {
  drawHoloScreen,
  getHoloScreenLayoutSize,
  isParamSliderAction,
  pickHoloScreen,
  uvFromRayAndMesh,
  valueFromParamSliderPick,
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
import { labFrameScheduler } from './frameBudget.js';

/** Set after equipment is built; used by idle animators & interaction */
let expManager = null;

const labLoader = createLabLoader();
labLoader.setProgress(0.04, '初始化渲染核心…');

/** One animation frame (for paint + GSAP). */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Return control to the browser so the loader can paint and chrome stays
 * responsive (tabs / back / address bar). setTimeout creates a macrotask;
 * rAF then aligns with the next paint.
 * @param {number} [minIdleMs]
 */
function yieldToBrowser(minIdleMs = 0) {
  return new Promise((resolve) => {
    const wait = Math.max(0, Number(minIdleMs) || 0);
    setTimeout(() => {
      requestAnimationFrame(() => resolve());
    }, wait);
  });
}

/**
 * Run a heavy sync chunk, then force a browser idle slice proportional to cost.
 * @template T
 * @param {() => T} fn
 * @param {{ minIdleMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function runHeavyChunk(fn, opts = {}) {
  const minIdleMs = opts.minIdleMs ?? 8;
  const t0 = performance.now();
  let result;
  try {
    result = fn();
  } finally {
    const elapsed = performance.now() - t0;
    // Longer rest after expensive chunks so input events can drain.
    const rest = elapsed > 48 ? 32 : elapsed > 20 ? 16 : elapsed > 8 ? 10 : minIdleMs;
    await yieldToBrowser(rest);
  }
  return result;
}

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
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
// Cap DPR: full 2× on 4K/HiDPI multiplies fill-rate and was a major host hitch
// after dense source rigs (mechanics/thermo/optics) were migrated into one room.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// Soft PCF is roughly 2–4× the shadow-map cost of basic PCF on large rooms.
renderer.shadowMap.type = THREE.PCFShadowMap;
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
const BLACKBOARD_SURFACE = '#20364d';
/** Shared brush state across both front-wall boards. mode: pen | eraser */
const blackboardBrush = {
  color: BLACKBOARD_COLORS[0],
  size: BLACKBOARD_SIZES[1],
  mode: 'pen',
};
const sideBlackboards = [];

// Toolbar layout (canvas px). Compact so pen / eraser / clear all fit.
const BB_COLOR_YS = [62, 118, 174, 230];
const BB_SIZE_YS = [330, 385, 440];
const BB_ERASER_Y = 548;
const BB_CLEAR_Y = 620;
const BB_TOOL_HIT_R = 28;

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
  ctx.fillStyle = BLACKBOARD_SURFACE;
  ctx.fillRect(0, 0, c.width, c.height);

  function fillDrawingSurface() {
    ctx.fillStyle = BLACKBOARD_SURFACE;
    if (toolbarSide === 'left') {
      ctx.fillRect(toolbarW, 0, c.width - toolbarW, c.height);
    } else {
      ctx.fillRect(0, 0, c.width - toolbarW, c.height);
    }
  }

  function roundRectPath(x0, y0, rw, rh, r) {
    const rr = Math.min(r, rw / 2, rh / 2);
    ctx.beginPath();
    ctx.moveTo(x0 + rr, y0);
    ctx.arcTo(x0 + rw, y0, x0 + rw, y0 + rh, rr);
    ctx.arcTo(x0 + rw, y0 + rh, x0, y0 + rh, rr);
    ctx.arcTo(x0, y0 + rh, x0, y0, rr);
    ctx.arcTo(x0, y0, x0 + rw, y0, rr);
    ctx.closePath();
  }

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

    const cx = toolbarX + toolbarW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 20px "Microsoft YaHei", "Segoe UI", sans-serif';
    ctx.fillStyle = '#b9d6ed';
    ctx.fillText('颜色', cx, 24);
    BLACKBOARD_COLORS.forEach((color, i) => {
      const cy = BB_COLOR_YS[i];
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (blackboardBrush.mode === 'pen' && blackboardBrush.color === color) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#b9d6ed';
    ctx.fillText('粗细', cx, 290);
    BLACKBOARD_SIZES.forEach((size, i) => {
      const cy = BB_SIZE_YS[i];
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, size * 0.75), 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      if (blackboardBrush.size === size) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });

    // ── Tools: eraser toggle + one-tap clear ──
    ctx.fillStyle = '#b9d6ed';
    ctx.fillText('工具', cx, 500);

    const toolW = toolbarW - 16;
    const toolH = 40;
    const toolX = toolbarX + 8;

    // Eraser
    const eraserOn = blackboardBrush.mode === 'eraser';
    roundRectPath(toolX, BB_ERASER_Y - toolH / 2, toolW, toolH, 8);
    ctx.fillStyle = eraserOn ? 'rgba(56, 189, 248, 0.28)' : 'rgba(15, 23, 42, 0.55)';
    ctx.fill();
    ctx.strokeStyle = eraserOn ? '#38bdf8' : '#64748b';
    ctx.lineWidth = eraserOn ? 2.5 : 1.5;
    ctx.stroke();
    // Mini eraser glyph
    ctx.save();
    ctx.translate(cx, BB_ERASER_Y - 6);
    ctx.rotate(-0.35);
    ctx.fillStyle = eraserOn ? '#e0f2fe' : '#cbd5e1';
    ctx.fillRect(-12, -5, 20, 11);
    ctx.fillStyle = eraserOn ? '#38bdf8' : '#94a3b8';
    ctx.fillRect(-12, 2, 20, 5);
    ctx.restore();
    ctx.font = '600 15px "Microsoft YaHei", "Segoe UI", sans-serif';
    ctx.fillStyle = eraserOn ? '#e0f2fe' : '#cbd5e1';
    ctx.fillText('橡皮', cx, BB_ERASER_Y + 14);

    // Clear all
    roundRectPath(toolX, BB_CLEAR_Y - toolH / 2, toolW, toolH, 8);
    ctx.fillStyle = 'rgba(251, 113, 133, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.font = '600 16px "Microsoft YaHei", "Segoe UI", sans-serif';
    ctx.fillStyle = '#fecdd3';
    ctx.fillText('清屏', cx, BB_CLEAR_Y);

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
      if (Math.abs(py - BB_COLOR_YS[i]) <= BB_TOOL_HIT_R) {
        return { action: 'color', value: BLACKBOARD_COLORS[i] };
      }
    }
    for (let i = 0; i < BLACKBOARD_SIZES.length; i += 1) {
      if (Math.abs(py - BB_SIZE_YS[i]) <= BB_TOOL_HIT_R) {
        return { action: 'size', value: BLACKBOARD_SIZES[i] };
      }
    }
    if (Math.abs(py - BB_ERASER_Y) <= BB_TOOL_HIT_R) {
      return { action: 'eraser' };
    }
    if (Math.abs(py - BB_CLEAR_Y) <= BB_TOOL_HIT_R) {
      return { action: 'clear' };
    }
    return { action: 'toolbar' };
  }

  function canvasPoint(uv) {
    return { x: uv.x * c.width, y: (1 - uv.y) * c.height };
  }

  function clearBoard() {
    g.userData.stopStroke();
    fillDrawingSurface();
    drawToolbar();
    tex.needsUpdate = true;
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
  g.userData.clearBoard = clearBoard;
  g.userData.applyPick = (selection) => {
    if (selection?.action === 'color') {
      blackboardBrush.color = selection.value;
      blackboardBrush.mode = 'pen';
    } else if (selection?.action === 'size') {
      blackboardBrush.size = selection.value;
    } else if (selection?.action === 'eraser') {
      // Toggle eraser ↔ pen for quick switch while teaching.
      blackboardBrush.mode = blackboardBrush.mode === 'eraser' ? 'pen' : 'eraser';
    } else if (selection?.action === 'clear') {
      clearBoard();
      return false;
    } else {
      return selection?.action === 'draw';
    }
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
    const erasing = blackboardBrush.mode === 'eraser';
    // Eraser is slightly broader than the pen at the same size setting.
    const lineW = erasing
      ? Math.max(12, blackboardBrush.size * 2.4)
      : blackboardBrush.size;
    ctx.save();
    ctx.strokeStyle = erasing ? BLACKBOARD_SURFACE : blackboardBrush.color;
    ctx.lineWidth = lineW;
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
// Build stations one-by-one with main-thread yields so the loader (and browser
// chrome) stay interactive. Electro/optics geometry is large enough that a
// single sync loop freezes tab UI for seconds.
const STATION_BOOT = Object.freeze({
  mechanics: { ratio: 0.40, status: '装配力学实验台…' },
  optics: { ratio: 0.48, status: '装配光学实验台…' },
  electro: { ratio: 0.56, status: '装配电磁学实验台…' },
  thermo: { ratio: 0.64, status: '装配热力学实验台…' },
});
const stationScenes = {};
for (const [stationId, createStation] of Object.entries(STATION_SCENE_MODULES)) {
  const boot = STATION_BOOT[stationId] || { ratio: 0.5, status: `装配${stationId}…` };
  labLoader.setProgress(boot.ratio, boot.status);
  await yieldToBrowser(0);
  const station = await runHeavyChunk(() => createStation(stationContext), { minIdleMs: 16 });
  stationScenes[stationId] = station;
  scene.add(station.root);
  station.animators.forEach(stationContext.registerAnimator);
  await yieldToBrowser(8);
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
    boundHud = hud;
    boundDataHtml = dataHtml || '';
    // Draw is invoked only from budget jobs (pushHudToHoloScreens schedules us).
    // Still paint here so a direct setHud call works, but prefer callers that
    // already sit on the frame budget.
    draw(!!g.userData.active, false);
  };
  g.userData.setMaximized = (on) => {
    // Fullscreen is managed globally. Never force a dense redraw here —
    // closing the big screen used to hitch by repainting the whole HUD twice.
    if (g.userData.maximized === !!on) return;
    g.userData.maximized = !!on;
    lastDrawKey = '';
  };
  /** UV pick on hologram screen (like clicking a monitor) */
  g.userData.pick = (uv) => {
    if (!uv) return null;
    // Idle terminal: whole panel is the power-on target (matches on-screen CTA).
    if (!g.userData.active) {
      return {
        action: 'activate',
        role: 'holo_activate',
        stationId,
        x: 0,
        y: 0,
        w: c.width,
        h: c.height,
      };
    }
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
    const samples = collectScreenSamples(raycaster);
    if (!samples.length) return null;
    // Idle tabletop terminal: any screen-plane hit powers on the experiment menu.
    // Previously pickFromRay returned null while inactive, so unlocked desktop
    // clicks never activated the electro/mechanics/… terminals.
    if (!g.userData.active) {
      return {
        action: 'activate',
        role: 'holo_activate',
        stationId,
        x: 0,
        y: 0,
        w: c.width,
        h: c.height,
      };
    }

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

  // Fixed modest resolution: full dense UI still fits; ~half the fill cost of 1280×1200.
  // Never reallocate on experiment switch (that was a major hitch).
  const FIXED_DISPLAY_W = 960;
  const FIXED_DISPLAY_H = 720;
  let c = document.createElement('canvas');
  c.width = FIXED_DISPLAY_W;
  c.height = FIXED_DISPLAY_H;
  let ctx = c.getContext('2d');
  let lastDrawKey = '';
  let hitRegions = [];
  let boundHud = null;
  let boundDataHtml = '';
  /** Boot-time pixel + hit cache so first open skips dense canvas layout. */
  const warmCacheByExp = new Map();

  g.userData.maximized = false;
  g.userData._baseY = 0;
  g.userData.accentHex = accentHex;
  g.userData.fullTitle = fullTitle;
  g.userData.enTitle = enTitle;
  g.userData.surface = SURFACE;

  const createScreenTexture = () => {
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Anisotropy is free at rest but costs on every texture upload — keep low.
    texture.anisotropy = 1;
    return texture;
  };
  let tex = createScreenTexture();
  // Base plane design size is panelW×panelH mapped from 1280×800 reference.
  g.userData._fixedScale = {
    sx: FIXED_DISPLAY_W / 1280,
    sy: FIXED_DISPLAY_H / 800,
  };

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

  // Apply fixed canvas aspect to meshes once at build (no switch-time resize).
  if (g.userData._fixedScale) {
    const { sx, sy } = g.userData._fixedScale;
    screen.scale.set(sx, sy, 1);
    substrate.scale.set(sx, sy, 1);
    backFace.scale.set(sx, sy, 1);
    rim.scale.set(sx, sy, 1);
    halo.scale.set(sx, sy, 1);
    hit.scale.set(sx, sy, 1);
    topStab.position.set(0, (panelH * sy) / 2 + 0.018, 0);
    botStab.position.set(0, -(panelH * sy) / 2 - 0.018, 0);
    g.userData.canvasW = FIXED_DISPLAY_W;
    g.userData.canvasH = FIXED_DISPLAY_H;
    g.userData.screenWorldSize = { width: panelW * sx, height: panelH * sy };
  }

  // Hidden until an experiment is selected on the tabletop terminal.
  g.visible = false;
  g.userData.present = false;

  /** Layout is fixed for the lifetime of the panel — never realloc on switch. */
  const syncScreenLayout = () => false;

  /**
   * Cheap first paint after switch: solid glass + title only.
   * Full dense controls arrive on a later budget pulse.
   */
  const paintShell = (titleText = '加载实验界面…') => {
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(255,255,255,0.55)');
    bg.addColorStop(1, 'rgba(241,245,249,0.48)');
    ctx.fillStyle = bg;
    ctx.fillRect(12, 12, W - 24, H - 24);
    ctx.strokeStyle = 'rgba(14,165,233,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(titleText || fullTitle).slice(0, 28), W / 2, H * 0.42);
    ctx.fillStyle = '#0369a1';
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillText('界面加载中…', W / 2, H * 0.52);
    hitRegions = [];
    g.userData.hitRegions = hitRegions;
    // Shell is a non-interactive placeholder — never treat it as live content.
    g.userData._contentExpId = null;
    lastDrawKey = `shell|${titleText}`;
    tex.needsUpdate = true;
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
  paintShell(fullTitle);
  g.userData.paintShell = paintShell;
  g.userData.paintFull = () => {
    if (boundHud?.running && boundHud?.experiment) draw(true, true);
  };

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
    panelLight.intensity = present ? 0.55 : 0;
    if (!present) {
      hitRegions = [];
      g.userData.hitRegions = [];
      g.userData._contentExpId = null;
      // Hide path: skip raycast rebinding on the close click (was a small hitch
      // ×4 stations). Disabled meshes stay non-interactive while invisible;
      // re-enable when shown again.
      [hit, screen, backFace, rim, halo, topStab, botStab].forEach((mesh) => {
        mesh.raycast = () => {};
      });
      return;
    }
    // Show path: restore raycasts.
    [hit, screen, backFace, rim, halo, topStab, botStab].forEach((mesh) => {
      mesh.raycast = THREE.Mesh.prototype.raycast;
    });
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
  /**
   * GPU + canvas warm without permanently activating the content screen.
   * Always restores hidden state unless an experiment was already presenting.
   */
  g.userData.prewarm = (webglRenderer, activeCamera, targetScene) => {
    const wasPresent = !!g.userData.present;
    const prevHud = boundHud;
    const prevHtml = boundDataHtml;
    try {
      // Paint a representative frame for layout/shader compile under the loader.
      if (!boundHud) {
        boundHud = {
          menuOpen: true,
          station: STATION_EXPERIMENTS[stationId] || { id: stationId },
          experiment: STATION_EXPERIMENTS[stationId]?.experiments?.[0] || { id: 'warmup', name: 'warmup', steps: [] },
          stepIndex: 0,
          running: true,
          data: {},
          _rev: -100,
          expId: 'warmup',
        };
        boundDataHtml = '';
      }
      syncScreenLayout(true);
      draw(true, true);
      setPresent(true);
      webglRenderer.compile(g, activeCamera, targetScene);
    } catch {
      // best-effort
    } finally {
      boundHud = prevHud;
      boundDataHtml = prevHtml;
      // Never leave boot warm-up with the content panel visible.
      if (wasPresent && prevHud) {
        setPresent(true);
        draw(true, true);
      } else {
        setPresent(false);
        boundHud = null;
        boundDataHtml = '';
        lastDrawKey = '';
        draw(false, true);
      }
    }
  };
  /**
   * Snapshot the current dense paint for first-open restore (boot prewarm).
   * @param {string} expId
   */
  g.userData.captureWarm = (expId) => {
    if (!expId || !hitRegions.length) return false;
    try {
      const snap = document.createElement('canvas');
      snap.width = c.width;
      snap.height = c.height;
      snap.getContext('2d').drawImage(c, 0, 0);
      // Hit regions are plain rects + action meta (no functions).
      const hits = hitRegions.map((h) => ({ ...h }));
      warmCacheByExp.set(String(expId), {
        canvas: snap,
        hits,
        w: c.width,
        h: c.height,
        dataSig: boundDataHtml.slice(0, 96),
      });
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Instant first-open: blit boot snapshot + restore hit regions.
   * @param {string} expId
   * @returns {boolean}
   */
  g.userData.applyWarm = (expId) => {
    const entry = warmCacheByExp.get(String(expId || ''));
    if (!entry || entry.w !== c.width || entry.h !== c.height) return false;
    if (!entry.hits?.length) return false;
    try {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(entry.canvas, 0, 0);
      hitRegions = entry.hits.map((h) => ({ ...h }));
      g.userData.hitRegions = hitRegions;
      g.userData._contentExpId = String(expId);
      // Absorb the startExperiment + post-visuals pushHud double-fire without
      // re-running dense canvas layout (that was the "first switch freezes" hitch).
      g.userData._skipFullBudget = 2;
      g.userData._skipFullExpId = String(expId);
      lastDrawKey = `warm|${expId}|${entry.dataSig}`;
      tex.needsUpdate = true;
      return true;
    } catch {
      return false;
    }
  };

  g.userData.setHud = (hud, dataHtml = '', opts = {}) => {
    boundHud = hud;
    boundDataHtml = dataHtml || '';
    const running = !!(hud?.running && hud?.experiment);
    setPresent(running);
    if (!running) {
      lastDrawKey = '';
      g.userData._contentExpId = null;
      return;
    }
    const expId = hud.experiment?.id || hud.expId || '';
    // Prefer boot snapshot on first open — free for the camera frame.
    if (opts.preferWarm && expId) {
      if (
        g.userData._contentExpId === expId
        && Array.isArray(hitRegions)
        && hitRegions.length > 0
      ) {
        return;
      }
      if (g.userData.applyWarm?.(expId)) return;
    }
    // shell: cheap placeholder; full: dense controls (caller should budget this).
    if (opts.shell) {
      // Electro (and others) throttle-push HUD every ~0.1–0.35s. Re-painting the
      // shell on every push wipes hitRegions and, under the one-job-per-pulse
      // frame budget, can starve/clobber the full interactive paint — making
      // the content screen look live but refuse clicks.
      if (
        g.userData._contentExpId === expId
        && Array.isArray(hitRegions)
        && hitRegions.length > 0
      ) {
        return;
      }
      paintShell(hud.experiment?.name || fullTitle);
      return;
    }
    // Skip redundant full layout when warm cache (or prior paint) already live.
    if (
      opts.skipIfLive
      && g.userData._contentExpId === expId
      && Array.isArray(hitRegions)
      && hitRegions.length > 0
    ) {
      return;
    }
    draw(true, !!opts.force);
    // Mark this experiment's dense UI as live so subsequent shell jobs no-op.
    if (Array.isArray(hitRegions) && hitRegions.length > 0) {
      g.userData._contentExpId = expId;
    }
  };
  g.userData.setMaximized = (on) => {
    // Flag only — next budget paint refreshes the maximize chrome icon.
    // Sync draw(true,true) on close was a major post-fullscreen hitch.
    if (g.userData.maximized === !!on) return;
    g.userData.maximized = !!on;
    lastDrawKey = '';
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
  if (stationId === 'mechanics' && Array.isArray(data.readouts)) {
    const lines = data.readouts.slice(0, 6).map((item) => `${item.label}: ${item.value}`);
    lines.push(`<span class="ok">${data.paused ? '仿真已暂停' : '源仿真运行中'}</span>`);
    return lines.join('\n');
  }
  if (expId === 'multi_slit_diffraction') {
    const nRec = Array.isArray(data.records) ? data.records.length : 0;
    const mode = data.chartOpen ? '核对标注中' : (data.farField ? 'Fraunhofer ✓' : '近场警告');
    return `${data.N === 1 ? '单缝衍射' : `${data.N} 缝干涉`}　λ=${Number(data.lambdaNm || 0).toFixed(0)} nm\na=${Number(data.slitMm || 0).toFixed(3)} mm　d=${Number(data.pitchMm || 0).toFixed(3)} mm\nL=${Number(data.distM || 0).toFixed(2)} m　Δx≈${Number(data.fringeSpacingMm || 0).toFixed(3)} mm\n<span class="ok">对照 ${nRec} 组　${mode}</span>`;
  }
  if (data.mode === 'geometric'
    || expId === 'reflection' || expId === 'refraction'
    || expId === 'dispersion' || expId === 'lens') {
    const nRec = Array.isArray(data.records) ? data.records.length : 0;
    const mod = data.moduleCode ? `${data.moduleCode} ` : '';
    const mirror = data.opticsMode === 'mirror' || expId === 'reflection';
    const t1 = data.theta1 != null ? Number(data.theta1).toFixed(1) : '—';
    const t2 = data.theta2 == null ? (mirror ? '—' : 'TIR') : Number(data.theta2).toFixed(1);
    if (mirror) {
      const dth = data.deltaTheta != null ? Number(data.deltaTheta).toFixed(3) : '—';
      return `${mod}反射　θᵢ=${t1}°　θᵣ=${t2}°\n|Δθ|=${dth}°　转角=${Number(data.rotate || 0).toFixed(0)}°\n<span class="ok">记录 ${nRec} 组　${data.verifyOk ? 'θᵢ≈θᵣ ✓' : '调节中'}</span>`;
    }
    const ratio = data.snellRatio != null ? Number(data.snellRatio).toFixed(3) : '—';
    return `${mod}折射/色散　n=${Number(data.ior || 0).toFixed(3)}　θ₁=${t1}°　θ₂=${t2}°\nsinθ₁/sinθ₂=${ratio}　光束=${Number(data.rayCount || 1)}\n<span class="ok">记录 ${nRec} 组${data.dispersion ? '　色散开' : ''}</span>`;
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
  if (expId === 'induced_electric_field') {
    const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
    const region = Number(data.probeR || 0) <= Number(data.R || 0) + 1e-6 ? '面内' : '面外';
    return `B = ${fmt(data.B, 2)} · dB/dt = ${fmt(data.dBdt, 2)}\n`
      + `R = ${fmt(data.R, 2)} · r = ${fmt(data.probeR, 2)}（${region}）\n`
      + `|E| = ${fmt(data.magnitudeE, 3)} · ${data.senseLabel || '—'}\n`
      + `${data.paused ? '振荡已暂停' : 'B = B₀ sin(ωt) 振荡中'}`;
  }
  if (expId === 'hall_carrier_demo') {
    return `I = ${Number(data.I || 0).toFixed(2)}　B = ${Number(data.B || 0).toFixed(2)}\nn = ${Number(data.n || 0).toFixed(2)}　d = ${Number(data.d || 0).toFixed(2)}\nVₕ(rel.) = ${Number(data.vh || 0).toFixed(3)}　${data.nType ? 'n 型' : 'p 型'}\n${data.paused ? '动画已暂停' : '载流子运动中'}`;
  }
  if (expId === 'gauss_theorem') {
    const selected = data.charges?.find((charge) => charge.id === data.selectedId);
    return `Q内 = ${Number(data.qEnclosed || 0).toFixed(2)} e　ΦE = ${Number(data.flux || 0).toFixed(2)} / ε₀\nR = ${Number(data.radius || 0).toFixed(2)}　<Eₙ> = ${Number(data.meanField || 0).toFixed(3)}\n电荷数: ${data.charges?.length || 0}　选中: ${selected ? `${selected.q > 0 ? '+' : ''}${selected.q.toFixed(1)} e` : '无'}`;
  }
  if (expId === 'calorimetry') {
    const teq = data.cupHot && data.cupCold ? (data.mHot * data.tHot + data.mCold * data.tCold) / (data.mHot + data.mCold) : null;
    const motion = data.pouring ? `倒入${data.pouring === 'hot' ? '热水' : '冷水'} · ${Math.round((data.pourProgress || 0) * 100)}%` : data.mixProgress > 0 && data.mixProgress < 1 ? `混合中 · ${Math.round(data.mixProgress * 100)}%` : '静置';
    return `热水 ${Number(data.tHot || 0).toFixed(0)} °C / ${Number(data.mHot || 0).toFixed(0)} g\n冷水 ${Number(data.tCold || 0).toFixed(0)} °C / ${Number(data.mCold || 0).toFixed(0)} g\n过程：${motion} · 终温 ${data.tCurrent == null ? '—' : Number(data.tCurrent).toFixed(1) + ' °C'}\n<span class="ok">理论平衡 = ${teq == null ? '—' : teq.toFixed(1) + ' °C'} · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'convection') {
    const deltaT = Math.max(0, Number(data.tPlate || 0) - Number(data.tAir || 0));
    const L = Math.sqrt(Number(data.area || 0.12));
    const ra = 1e8 * deltaT * L ** 3;
    const nu = 0.15 * Math.pow(Math.max(ra, 1), 1 / 3);
    const h = deltaT < 1 ? 2 : Math.max(3, nu * 0.028 / L);
    return `热板 ${Number(data.tPlate || 0).toFixed(0)} K · 环境 ${Number(data.tAir || 0).toFixed(0)} K\nRa = ${ra.toFixed(0)} · Nu = ${nu.toFixed(1)}\n<span class="ok">h = ${h.toFixed(1)} W/(m²·K) · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'heat-conduction') {
    return `热端 ${Number(data.tHot || 0).toFixed(0)} K · 冷端 ${Number(data.tCold || 0).toFixed(0)} K\nk = ${Number(data.conductivity || 0).toFixed(2)} · 中点 ${Number(data.temps?.[24] || 0).toFixed(1)} K\n<span class="ok">记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'ideal-gas') {
    const p = (Number(data.n || 0) * 8.314 * Number(data.temperature || 0) / Math.max(0.01, Number(data.volume || 1)) / 1000) * 12;
    return `T = ${Number(data.temperature || 0).toFixed(0)} K · V = ${Number(data.volume || 0).toFixed(2)} ×\nP = ${p.toFixed(1)} kPa · n = ${Number(data.n || 0).toFixed(3)} mol\n<span class="ok">碰撞率 ${data.collisionsPerSec || 0} Hz · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'thermal-expansion') {
    const alpha = ({ aluminum: 23.1, copper: 16.5, steel: 12, invar: 1.2 }[data.material] || 23.1) * 1e-6;
    const dL = alpha * Number(data.length0 || 1) * (Number(data.temperature || 20) - 20);
    return `材料 ${data.material || 'aluminum'} · T = ${Number(data.temperature || 0).toFixed(0)} °C\nΔL = ${(dL * 1000).toFixed(3)} mm · L = ${((Number(data.length0 || 1) + dL) * 1000).toFixed(2)} mm\n<span class="ok">α = ${(alpha * 1e6).toFixed(1)} ×10⁻⁶/K · 记录 ${data.records?.length || 0} 组</span>`;
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
  // DOM + flags only — never shrink GPU canvas or paint on the click frame
  // (canvas resize was a post-close hitch on some GPUs).
  holoFsState.open = false;
  holoFsState.hits = [];
  holoFsEl.classList.remove('open');
  holoFsEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('holo-fs-open');
  if (sid) {
    labFrameScheduler.cancel?.(`hud:display-full:${sid}`);
    labFrameScheduler.cancel?.(`hud:display-warm:${sid}`);
    labFrameScheduler.cancel?.(`hud:selector:${sid}`);
    labFrameScheduler.cancel?.('hud:fs-paint');
    labFrameScheduler.cancel?.('hud:close-fs');
    if (!keepMaximizedFlag) {
      if (holos[sid]?.userData) holos[sid].userData.maximized = false;
      if (stationDisplays[sid]?.userData) stationDisplays[sid].userData.maximized = false;
    }
  }
  holoFsState.stationId = null;
  // Free the giant fullscreen buffer on a later pulse (after camera frames).
  labFrameScheduler.schedule?.('hud:fs-free', () => {
    if (holoFsState.open) return;
    if (holoFsCanvas && (holoFsCanvas.width > 4 || holoFsCanvas.height > 4)) {
      holoFsCanvas.width = 1;
      holoFsCanvas.height = 1;
      holoFsState.canvasW = 1;
      holoFsState.canvasH = 1;
    }
  }, { priority: 20 });
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
  /** Unified fullscreen drag for faraday / induced-e / generic param sliders. */
  let fsSliderDrag = null;

  function fsSliderValueAt(clientX, pick) {
    const point = mapFsClickToCanvas(clientX, 0);
    if (!point || !pick) return null;
    return valueFromParamSliderPick({ ...pick, px: point.px });
  }

  function fsLiveSliderPick(fallback) {
    const action = fallback?.action;
    if (!action) return fallback;
    const live = (holoFsState.hits || []).find((h) => (
      h?.action === action
      && (!fallback?.key || h.key === fallback.key)
      && (!fallback?.axis || h.axis === fallback.axis)
      && (!fallback?.setAction || h.setAction === fallback.setAction)
    ));
    return live || fallback;
  }

  function fsDispatchSlider(pick, clientX) {
    const value = fsSliderValueAt(clientX, pick);
    if (!Number.isFinite(value)) return false;
    if (pick.action === 'faraday-b-slider') {
      expManager?.uiAction?.('faraday-b-set', { value });
      return true;
    }
    if (pick.action === 'induced-e-slider') {
      expManager?.uiAction?.('induced-e-set', { key: pick.key, value, live: true });
      return true;
    }
    if (pick.action === 'param-slider' && pick.setAction) {
      expManager?.uiAction?.(pick.setAction, {
        key: pick.key,
        value,
        axis: pick.axis,
        target: pick.target,
        live: true,
      });
      return true;
    }
    return false;
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
    if (fsTableDrag?.moved || fsSliderDrag?.moved) {
      fsTableDrag = null;
      fsSliderDrag = null;
      return;
    }
    const pick = pickFsAt(e.clientX, e.clientY);
    // Table region is scroll-only — clicks are not a discrete action.
    if (pick?.action === 'hall-scroll-table') return;
    // Continuous sliders are owned by pointerdown/move, not click.
    if (isParamSliderAction(pick?.action)) return;
    if (pick) handleHoloScreenAction(pick, holoFsState.stationId);
  });
  holoFsCanvas.addEventListener('pointerdown', (e) => {
    if (!holoFsState.open || e.button !== 0) return;
    const pick = pickFsAt(e.clientX, e.clientY);
    if (isParamSliderAction(pick?.action)) {
      fsSliderDrag = { pointerId: e.pointerId, pick, moved: false };
      fsDispatchSlider(pick, e.clientX);
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
    if (fsSliderDrag && fsSliderDrag.pointerId === e.pointerId) {
      const livePick = fsLiveSliderPick(fsSliderDrag.pick);
      if (fsDispatchSlider(livePick, e.clientX)) {
        fsSliderDrag.moved = true;
        fsSliderDrag.pick = livePick;
      }
      e.preventDefault();
      return;
    }
    if (!fsTableDrag || fsTableDrag.pointerId !== e.pointerId) {
      const pick = pickFsAt(e.clientX, e.clientY);
      if (pick?.action === 'hall-scroll-table' || pick?.role === 'scrollable_table') {
        holoFsCanvas.style.cursor = pick.scrollable === false ? 'default' : 'ns-resize';
      } else if (isParamSliderAction(pick?.action)) {
        holoFsCanvas.style.cursor = 'ew-resize';
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
  const endFsSliderDrag = (e) => {
    if (!fsSliderDrag || (e && fsSliderDrag.pointerId !== e.pointerId)) return;
    try { holoFsCanvas.releasePointerCapture(fsSliderDrag.pointerId); } catch { /* ignore */ }
    expManager?.endManipulation?.(
      { userData: { role: fsSliderDrag.pick?.role || fsSliderDrag.pick?.action || 'param-slider' } },
      { time: clock.elapsedTime },
    );
    const moved = fsSliderDrag.moved;
    fsSliderDrag = moved ? { ...fsSliderDrag, pointerId: -1 } : null;
    if (moved) setTimeout(() => { if (fsSliderDrag?.pointerId === -1) fsSliderDrag = null; }, 0);
  };
  holoFsCanvas.addEventListener('pointerup', endFsTableDrag);
  holoFsCanvas.addEventListener('pointercancel', endFsTableDrag);
  holoFsCanvas.addEventListener('pointerup', endFsSliderDrag);
  holoFsCanvas.addEventListener('pointercancel', endFsSliderDrag);
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
    // Esc exits fullscreen only — do not run full station shutdown on this frame.
    closeHoloFullscreen();
    labFrameScheduler.beginSoftSwitch?.(6);
    labFrameScheduler.rest?.(1);
    showToast('已退出全屏');
  }
});

/**
 * Holo HUD push — MUST stay cheap.
 * Never paint multiple large canvases in one call (that was the switch hitch).
 * Only flip flags here; schedule at most one surface paint per frame budget pulse.
 */
function pushHudToHoloScreens(hud) {
  hudRev += 1;
  const payload = hud ? { ...hud, _rev: hudRev, expId: hud.experiment?.id } : null;
  lastHudSnapshot = payload;
  // dataHtml filled lazily inside the paint job for the active station only.
  lastHudDataHtml = '';

  const activeId = hud?.menuOpen && hud.station?.id ? hud.station.id : null;
  const runningHere = !!(
    activeId
    && hud?.running
    && hud.experiment
  );

  // ── Cheap flag pass (no canvas, no formatData) ──
  Object.entries(holos).forEach(([id, h]) => {
    if (!h?.userData) return;
    const isActive = activeId === id;
    const wasActive = !!h.userData.active;
    h.userData.active = isActive;
    if (!isActive && wasActive) {
      // Leaving this terminal: drop binding only. Do NOT force a full idle redraw
      // (setMaximized/draw would hitch on switch).
      h.userData.boundHud = null;
      h.userData.boundDataHtml = '';
      h.userData._selectorPaintSig = '';
      h.userData.maximized = false;
      if (holoFsState.open && holoFsState.stationId === id) {
        labFrameScheduler.schedule('hud:close-fs', () => closeHoloFullscreen(), { priority: 110 });
      }
    }
  });

  Object.entries(stationDisplays).forEach(([id, d]) => {
    if (!d?.userData) return;
    const want = runningHere && id === activeId;
    if (!want && (d.userData.present || d.userData.active)) {
      // Hide without painting dense experiment chrome.
      if (d.userData) d.userData.maximized = false;
      d.userData.setPresent?.(false);
      d.userData.boundHud = null;
      d.userData.boundDataHtml = '';
      d.userData._contentExpId = null;
      labFrameScheduler.cancel?.(`hud:display-full:${id}`);
      labFrameScheduler.cancel?.(`hud:display-warm:${id}`);
    } else if (want && !d.userData.present) {
      // Show blank panel immediately (visibility only) — content paints next pulses.
      d.userData.setPresent?.(true);
    }
  });

  if (!activeId || !payload) return;

  // ── Tabletop selector: paint only when menu/exp chrome actually changes ──
  labFrameScheduler.schedule(`hud:selector:${activeId}`, () => {
    const h = holos[activeId];
    const snap = lastHudSnapshot;
    if (!h?.userData || !snap) return;
    if (snap.station?.id !== activeId) return;
    const sig = [
      snap.running ? 1 : 0,
      snap.expId || '',
      snap.stepIndex ?? '',
      snap.menuOpen ? 1 : 0,
    ].join('|');
    if (h.userData._selectorPaintSig === sig) return;
    h.userData._selectorPaintSig = sig;
    lastHudDataHtml = '';
    h.userData.setHud?.(snap, '');
  }, { priority: 100 });

  // ── Content display: warm-cache / shell first, dense paint later ──
  // First-open hitch was: skip shell for "prepared" labs → immediate full
  // drawHoloScreen on the switch frame (camera freezes). Prefer boot bitmap.
  if (runningHere) {
    const display = stationDisplays[activeId];
    const expId = hud.experiment?.id || payload.expId || '';
    const hasLiveContent = !!(
      display?.userData
      && display.userData._contentExpId === expId
      && Array.isArray(display.userData.hitRegions)
      && display.userData.hitRegions.length > 0
    );

    if (!hasLiveContent) {
      // Show glass + try boot snapshot in one early pulse (blit is cheap).
      labFrameScheduler.schedule(`hud:display-warm:${activeId}`, () => {
        const d = stationDisplays[activeId];
        const snap = lastHudSnapshot;
        if (!d?.userData || !snap?.running || snap.station?.id !== activeId || !snap.experiment) return;
        d.userData.setPresent?.(true);
        const sid = snap.experiment?.id || snap.expId || '';
        if (
          d.userData._contentExpId === sid
          && Array.isArray(d.userData.hitRegions)
          && d.userData.hitRegions.length > 0
        ) {
          return;
        }
        // Instant interactive panel when boot prewarm captured this experiment.
        if (d.userData.applyWarm?.(sid)) {
          // Bind live hud (pick meta / data) without re-layouting the canvas.
          const dataHtml = formatData(snap.station.id, snap.experiment.id, snap.data);
          lastHudDataHtml = dataHtml;
          d.userData.setHud?.(snap, dataHtml, { skipIfLive: true });
          return;
        }
        // Fallback placeholder — never block the camera with dense layout here.
        d.userData.setHud?.(snap, '', { shell: true });
      }, { priority: 95 });
    } else {
      labFrameScheduler.cancel(`hud:display-warm:${activeId}`);
      labFrameScheduler.cancel(`hud:display-shell:${activeId}`);
    }

    // Dense full paint waits until soft-switch ends so look/WASD stay free.
    // IMPORTANT: do not call rest() while waiting — rest used to keep soft-switch
    // alive forever (softSwitch used to include cooldown).
    const paintFull = () => {
      if (labFrameScheduler.softSwitchActive?.()) {
        labFrameScheduler.schedule(`hud:display-full:${activeId}`, paintFull, { priority: 30 });
        return;
      }
      const d = stationDisplays[activeId];
      const snap = lastHudSnapshot;
      if (!d?.userData || !snap?.running || snap.station?.id !== activeId || !snap.experiment) return;
      const sid = snap.experiment?.id || snap.expId || '';
      const dataHtml = formatData(snap.station.id, snap.experiment.id, snap.data);
      lastHudDataHtml = dataHtml;

      if (
        d.userData._skipFullExpId === sid
        && (d.userData._skipFullBudget || 0) > 0
      ) {
        d.userData._skipFullBudget -= 1;
        if (d.userData._skipFullBudget <= 0) {
          d.userData._skipFullExpId = null;
        }
        d.userData.setHud?.(snap, dataHtml, { skipIfLive: true });
        return;
      }

      const live = !!(
        d.userData._contentExpId === sid
        && Array.isArray(d.userData.hitRegions)
        && d.userData.hitRegions.length > 0
      );
      d.userData.setHud?.(snap, dataHtml, { force: !live });
      labFrameScheduler.rest?.(1);
    };
    labFrameScheduler.schedule(
      `hud:display-full:${activeId}`,
      paintFull,
      { priority: hasLiveContent ? 45 : 30 },
    );
  }

  // Fullscreen overlay — never paint inline on switch.
  if (holoFsState.open) {
    if (!hud?.menuOpen || !hud?.running || hud.station?.id !== holoFsState.stationId) {
      labFrameScheduler.schedule('hud:close-fs', () => closeHoloFullscreen(), { priority: 110 });
    } else {
      labFrameScheduler.schedule('hud:fs-paint', () => paintHoloFs(), { priority: 60 });
    }
  }
}

/** Paint tabletop experiment cards immediately after power-on (no budget wait). */
function forceSelectorMenuPaint(stationId) {
  const h = holos[stationId];
  const st = STATION_EXPERIMENTS[stationId];
  if (!h?.userData || !st) return;
  hudRev += 1;
  const snap = {
    menuOpen: true,
    station: st,
    experiment: null,
    stepIndex: 0,
    step: null,
    running: false,
    data: {},
    stations: STATION_EXPERIMENTS,
    _rev: hudRev,
    expId: null,
  };
  lastHudSnapshot = snap;
  h.userData.active = true;
  // Bust the selector signature so a later scheduled paint cannot skip.
  h.userData._selectorPaintSig = '';
  try {
    h.userData.setHud?.(snap, '');
    h.userData.draw?.(true, true);
  } catch { /* best-effort */ }
}

function handleHoloScreenAction(pick, stationId) {
  if (!pick?.action || !expManager) return false;
  const t = clock.elapsedTime;
  switch (pick.action) {
    case 'close':
      // × button: keep this microtask under ~1ms so look/WASD stay live.
      closeHoloFullscreen();
      if (typeof expManager.closeStationUi === 'function') {
        expManager.closeStationUi();
      } else if (expManager.state?.running) {
        expManager.exitExperiment();
        expManager.closeMenu();
      } else {
        expManager.closeMenu();
      }
      return true;
    case 'maximize': {
      // Maximize = fill the entire browser window (not 3D scale)
      const sid = stationId || holoFsState.stationId;
      if (!sid) return false;
      toggleHoloFullscreen(sid);
      return true;
    }
    case 'activate': {
      // Idle tabletop terminal CTA — open the station menu and paint cards now.
      const sid = stationId || pick.stationId;
      if (!sid) return false;
      if (expManager.state?.menuOpen && expManager.state?.stationId === sid) {
        // Already open: still force a card paint if the idle art is stuck.
        forceSelectorMenuPaint(sid);
        return true;
      }
      expManager.openStationMenu(sid);
      forceSelectorMenuPaint(sid);
      return true;
    }
    case 'start':
      // Never paint fullscreen canvas on the click frame — startExperimentSafe
      // only queues budget jobs; paint arrives on a later pulse.
      if (pick.expId) startExperimentSafe(pick.expId);
      return true;
    case 'back':
      expManager.exitExperiment();
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
  // Zustand store update is cheap; all canvas work is scheduled inside pushHudToHoloScreens.
  updateHud(hud);
  pushHudToHoloScreens(hud);
}

expManager = createExperimentManager({
  equipment,
  onHudUpdate,
  onToast: showToast,
});

/** Experiments whose GPU geometry + shaders have been fully warmed. */
const preparedExperimentIds = new Set();

/**
 * Synchronously prepare a single experiment so the first open never stutters.
 * Safe to call multiple times; no-ops after the first successful warm.
 * @param {string} expId
 * @param {string} [stationId]
 * @param {{ force?: boolean }} [opts] force re-run prewarm (e.g. after context loss)
 */
function prepareExperiment(expId, stationId, opts = {}) {
  if (!expId) return;
  if (!opts.force && preparedExperimentIds.has(expId)) return;
  let sid = stationId || expManager?.state?.stationId || null;
  if (!sid) {
    for (const [id, st] of Object.entries(STATION_EXPERIMENTS)) {
      if (st.experiments?.some((e) => e.id === expId)) {
        sid = id;
        break;
      }
    }
  }
  if (sid) {
    stationDisplays[sid]?.userData?.prewarm?.(renderer, camera, scene);
    stationScenes[sid]?.prewarm?.[expId]?.();
  } else {
    // Fallback: try every station prewarm map.
    Object.values(stationScenes).forEach((st) => st?.prewarm?.[expId]?.());
  }
  preparedExperimentIds.add(expId);
}

/** Force every floating content display back to hidden (no experiment selected). */
function hideAllContentDisplays() {
  Object.values(stationDisplays).forEach((d) => {
    if (!d?.userData) return;
    d.userData.setMaximized?.(false);
    d.userData.setHud?.(null, '');
    d.userData.setPresent?.(false);
    d.visible = false;
    d.userData.present = false;
    d.userData.active = false;
  });
}

/**
 * Warm hologram menus + content screens so first open does not paint/compile mid-interaction.
 * Must not leave any content display visible after boot.
 */
function prewarmHoloSurfaces() {
  Object.entries(holos).forEach(([id, h]) => {
    if (!h?.userData) return;
    const st = STATION_EXPERIMENTS[id];
    const mockHud = {
      menuOpen: true,
      station: st,
      experiment: null,
      stepIndex: 0,
      step: null,
      running: false,
      data: {},
      stations: STATION_EXPERIMENTS,
      _rev: -1,
    };
    const wasActive = h.userData.active;
    try {
      h.userData.active = true;
      h.userData.setHud?.(mockHud, '');
      h.userData.draw?.(true, true);
    } finally {
      h.userData.active = false;
      h.userData.setHud?.(null, '');
      h.userData.draw?.(false, true);
      h.userData.active = wasActive;
    }
  });

  // Content screens: prewarm GPU/canvas only — never leave setHud(running) active.
  Object.values(stationDisplays).forEach((d) => {
    d?.userData?.prewarm?.(renderer, camera, scene);
  });
  hideAllContentDisplays();
}

/** Map experiment id → station equipment setMode argument. */
const EXP_MODE_BY_ID = Object.freeze({
  'free-fall': 'free-fall',
  'inclined-plane': 'inclined-plane',
  pendulum: 'pendulum',
  collision: 'collision',
  projectile: 'projectile',
  viscosity: 'viscosity',
  hall_effect: 'hall',
  hall_carrier_demo: 'hall-demo',
  gauss_theorem: 'gauss',
  electric_field: 'electric-field',
  faraday_induction: 'faraday',
  induced_electric_field: 'induced-e',
  multi_slit_diffraction: 'diffraction',
  reflection: 'geometric',
  refraction: 'geometric',
  dispersion: 'geometric',
  lens: 'geometric',
  calorimetry: 'calorimetry',
  convection: 'convection',
  'heat-conduction': 'heat-conduction',
  'ideal-gas': 'ideal-gas',
  'thermal-expansion': 'thermal-expansion',
});

/**
 * When true, the main animate() loop skips WebGL present so the loader
 * (spinner / bar / brand) keeps getting animation frames during heavy prewarm.
 */
let bootSuspendRender = false;

/**
 * Yield during boot prewarm. Prefer macrotask + rAF so browser chrome input
 * is not starved by a long chain of microtasks / pure rAFs.
 * @param {number} [minIdleMs]
 */
async function yieldToLoader(minIdleMs = 0) {
  await yieldToBrowser(minIdleMs);
  // Second frame: let GSAP / progress bar composite after the idle slice.
  await nextFrame();
}

/** Cache of experiment initData used only during boot prewarm / soft warm. */
const warmDataCache = new Map();

/**
 * Authoritative first-open simulation state (same as startExperiment).
 * Keeps field-line signatures and dense HUD branches aligned with runtime.
 */
function warmInitData(stationId, expId) {
  const key = `${stationId}:${expId}`;
  if (warmDataCache.has(key)) return warmDataCache.get(key);
  let data = {};
  try {
    const mod = STATION_MODULES[stationId];
    if (mod?.createHandlers) {
      const h = mod.createHandlers({
        state: { running: false, expId: null, data: {}, stepIndex: 0 },
        equipment: {},
        toast() {},
        pushHud() {},
        advanceStep() {},
        setStep() {},
        currentStep: () => null,
        currentExp: () => null,
        currentStation: () => null,
      });
      data = h?.initData?.(expId) || {};
    }
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object') data = {};
  // Mechanics catalog still carries defaults on the experiment card.
  const exp = STATION_EXPERIMENTS[stationId]?.experiments?.find((e) => e.id === expId);
  if (exp?.defaults && !data.params) {
    data = {
      params: { ...exp.defaults },
      readouts: Array.isArray(data.readouts) ? data.readouts : [],
      paused: false,
      sourceTime: 0,
      ...data,
    };
  }
  warmDataCache.set(key, data);
  return data;
}

/**
 * Seed live apparatus with the same defaults the first open will use so
 * expensive field-line / particle allocations are not first paid at click time.
 */
function seedWarmApparatus(stationId, expId, eq) {
  if (!eq) return;
  const data = warmInitData(stationId, expId);
  try {
    if (stationId === 'electro') {
      if (expId === 'gauss_theorem') eq.updateGauss?.(data, 0);
      else if (expId === 'electric_field') eq.updateElectricField?.(data, 0);
      else if (expId === 'faraday_induction') eq.updateFaraday?.(data, 0);
      else if (expId === 'induced_electric_field') eq.updateInducedElectric?.(data, 0);
      else if (expId === 'hall_effect') eq.updateHall?.(data);
      else if (expId === 'hall_carrier_demo') eq.updateHallDemo?.(data, 0);
      return;
    }
    if (stationId === 'thermo') {
      eq.updateState?.(expId, data, { forceVisual: true });
      // One visual tick so first-open materials (thermal-expansion coils/glow)
      // are already in the state compile will capture.
      try {
        const src = eq.sourceExperiments?.[expId];
        if (src && typeof src.update === 'function') {
          try { src.clock?.getDelta?.(); } catch { /* ignore */ }
          src.update(1 / 60);
        }
      } catch { /* ignore */ }
      return;
    }
  } catch { /* best-effort */ }
}

/**
 * Show one apparatus mode under the loader (no full-scene thrash).
 * Heavy GPU compile is scoped to the station root and followed by a browser yield.
 */
async function warmExperimentApparatus(job) {
  const st = STATION_EXPERIMENTS[job.stationId];
  const exp = st?.experiments?.find((e) => e.id === job.expId) || { id: job.expId };
  const setMode = stationScenes[job.stationId]?.equipment?.setMode
    || equipment[job.stationId]?.setMode;
  const eq = stationScenes[job.stationId]?.equipment || equipment[job.stationId];
  const mode = EXP_MODE_BY_ID[job.expId];
  const defaults = exp.defaults || null;
  const stationRoot = stationScenes[job.stationId]?.root;

  await runHeavyChunk(() => {
    prepareExperiment(job.expId, job.stationId);
  }, { minIdleMs: 10 });

  await runHeavyChunk(() => {
    if (mode && typeof setMode === 'function') {
      try {
        if (job.stationId === 'mechanics') {
          setMode(mode, defaults, { reset: false });
        } else if (job.stationId === 'thermo') {
          // Thermo setMode takes experiment id (not a shared mode alias).
          setMode(job.expId);
        } else {
          setMode(mode);
        }
      } catch { /* ignore */ }
    }

    try {
      if (job.stationId === 'optics' && mode === 'geometric' && typeof eq?.updateGeometric === 'function') {
        eq.updateGeometric({
          shape: exp.id === 'reflection' ? 'mirror' : exp.id === 'lens' ? 'sphere' : 'prism',
          angle: exp.id === 'dispersion' ? 48 : exp.id === 'lens' ? 12 : 35,
          rayCount: exp.id === 'dispersion' ? 9 : exp.id === 'lens' ? 7 : 1,
          ior: 1.52,
          dispersion: exp.id === 'dispersion',
          dispersionStrength: 0.85,
          rotate: 0,
          showReflect: true,
          opticsMode: exp.id === 'reflection' ? 'mirror' : 'dielectric',
          mode: exp.id === 'reflection' ? 'mirror' : 'dielectric',
        }, { force: true });
      }
      if (job.stationId === 'optics' && mode === 'diffraction') {
        eq?.updateOptics?.({
          mode: 'diffraction',
          lightOn: true,
          lambdaNm: 550,
          slitMm: 0.05,
          pitchMm: 0.25,
          N: 2,
          distM: 1,
          showBeam: true,
          showWave: true,
        }, { force: true });
        eq?.flushDeferredDiffraction?.();
      }
      // Match first-open state so signature caches (field lines, wires, …) hit.
      seedWarmApparatus(job.stationId, job.expId, eq);
    } catch { /* ignore */ }
  }, { minIdleMs: 12 });

  // Compile only the station subtree (not the whole room) after mode switches.
  await runHeavyChunk(() => {
    try {
      if (stationRoot) {
        stationRoot.updateWorldMatrix?.(true, true);
        renderer.compile(stationRoot, camera);
      }
    } catch { /* best-effort */ }
  }, { minIdleMs: 16 });
}

/**
 * Paint experiment content UIs under the loader.
 * Critical: menu chrome + first experiment (fonts/layout/hit regions + GPU).
 * Remaining experiment panels are still painted, but each paint is followed by
 * a macrotask yield so browser chrome stays responsive during long boots.
 */
async function warmStationExperimentHuds(stationId, experiments, onHudTick) {
  const st = STATION_EXPERIMENTS[stationId];
  const list = (experiments || []).filter(Boolean);
  if (!st || !list.length) return;
  const holo = holos[stationId];
  const display = stationDisplays[stationId];

  // Menu chrome once.
  await runHeavyChunk(() => {
    try {
      if (holo?.userData) {
        holo.userData.active = true;
        holo.userData.setHud?.({
          menuOpen: true,
          station: st,
          experiment: null,
          stepIndex: 0,
          step: null,
          running: false,
          data: {},
          stations: STATION_EXPERIMENTS,
          _rev: -2500,
        }, '');
        holo.userData.draw?.(true, true);
      }
    } catch { /* ignore */ }
  }, { minIdleMs: 10 });

  for (let i = 0; i < list.length; i += 1) {
    const sampleExp = list[i];
    await runHeavyChunk(() => {
      const mockData = warmInitData(stationId, sampleExp.id);
      const mockHud = {
        menuOpen: true,
        station: st,
        experiment: sampleExp,
        stepIndex: 0,
        step: sampleExp.steps?.[0] || null,
        running: true,
        data: mockData,
        stations: STATION_EXPERIMENTS,
        _rev: -3000 - i,
        expId: sampleExp.id,
      };
      const dataHtml = formatData(stationId, sampleExp.id, mockData);
      try {
        if (holo?.userData) {
          holo.userData.setHud?.(mockHud, dataHtml);
          holo.userData.draw?.(true, true);
        }
        if (display?.userData) {
          display.userData.setHud?.(mockHud, dataHtml, { force: true });
          // Snapshot pixels + hit regions for hitch-free first open.
          display.userData.captureWarm?.(sampleExp.id);
          // First dense paint also compiles content-panel materials/shaders.
          if (i === 0) {
            try {
              display.updateWorldMatrix?.(true, true);
              renderer.compile(display, camera, scene);
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      onHudTick?.(sampleExp);
    }, { minIdleMs: i === 0 ? 16 : 12 });
  }

  await runHeavyChunk(() => {
    try {
      if (holo?.userData) {
        holo.userData.active = false;
        holo.userData.setHud?.(null, '');
        holo.userData.draw?.(false, true);
      }
      if (display?.userData) {
        display.userData.setMaximized?.(false);
        display.userData.setPresent?.(false);
        display.userData.setHud?.(null, '');
        display.userData._contentExpId = null;
        display.userData.hitRegions = [];
      }
    } catch { /* ignore */ }
  }, { minIdleMs: 8 });
}

/**
 * Compile + warm apparatus under the loader cover.
 * Time-sliced with macrotask yields so browser chrome stays clickable.
 * Avoids full-scene compile after every station (that was the main freeze).
 * @param {(ratio: number, status?: string) => void} onProgress
 */
async function warmAllLabResources(onProgress) {
  const jobs = [];
  Object.entries(STATION_EXPERIMENTS).forEach(([sid, st]) => {
    (st.experiments || []).forEach((exp) => {
      jobs.push({
        stationId: sid,
        expId: exp.id,
        label: exp.name || exp.id,
        exp,
      });
    });
  });

  // Group by station: apparatus per experiment, then dense content HUD paints.
  const byStation = new Map();
  jobs.forEach((job) => {
    if (!byStation.has(job.stationId)) byStation.set(job.stationId, []);
    byStation.get(job.stationId).push(job);
  });

  // apparatus job + HUD paint per experiment + per-station GPU present + boot steps
  const total = Math.max(1, jobs.length * 2 + byStation.size + 3);
  let done = 0;
  const ratioOf = () => 0.88 + (done / total) * 0.08;
  const tick = (status) => {
    done += 1;
    onProgress(ratioOf(), status);
  };

  bootSuspendRender = true;
  labLoader.setBusy?.(true);
  try {
    onProgress(0.88, '预编译全息终端…');
    // Yield between stations inside prewarm so status + chrome stay live.
    for (const id of Object.keys(holos)) {
      const h = holos[id];
      if (!h?.userData) continue;
      const st = STATION_EXPERIMENTS[id];
      const mockHud = {
        menuOpen: true,
        station: st,
        experiment: null,
        stepIndex: 0,
        step: null,
        running: false,
        data: {},
        stations: STATION_EXPERIMENTS,
        _rev: -1,
      };
      await runHeavyChunk(() => {
        try {
          h.userData.active = true;
          h.userData.setHud?.(mockHud, '');
          h.userData.draw?.(true, true);
        } finally {
          h.userData.active = false;
          h.userData.setHud?.(null, '');
          h.userData.draw?.(false, true);
        }
      }, { minIdleMs: 10 });
    }
    for (const d of Object.values(stationDisplays)) {
      await runHeavyChunk(() => {
        d?.userData?.prewarm?.(renderer, camera, scene);
      }, { minIdleMs: 12 });
    }
    hideAllContentDisplays();
    tick('预编译全息终端…');
    await yieldToLoader(8);

    onProgress(0.89, '预编译实验室场景…');
    // One full-scene compile at boot — not once per station/experiment.
    await runHeavyChunk(() => {
      try {
        renderer.compile(scene, camera);
      } catch {
        // compile is best-effort
      }
    }, { minIdleMs: 24 });
    await runHeavyChunk(() => {
      try {
        renderer.render(scene, camera);
      } catch { /* ignore */ }
    }, { minIdleMs: 12 });
    tick('预编译实验室场景…');

    for (const [stationId, stationJobs] of byStation) {
      const stationTitle = STATION_EXPERIMENTS[stationId]?.title || stationId;
      onProgress(ratioOf(), `预热${stationTitle}…`);

      for (const job of stationJobs) {
        onProgress(ratioOf(), `预热器材：${job.label}`);
        await warmExperimentApparatus(job);
        tick(`器材就绪：${job.label}`);
        // Extra breathing room after each apparatus so tab UI can process events.
        await yieldToLoader(8);
      }

      // Every experiment content panel (not only the first card on the station).
      onProgress(ratioOf(), `预热${stationTitle}界面…`);
      await warmStationExperimentHuds(
        stationId,
        stationJobs.map((job) => job.exp),
        (sampleExp) => tick(`界面就绪：${sampleExp?.name || sampleExp?.id || ''}`),
      );
      // Present once per station (not full recompile of the whole room).
      await runHeavyChunk(() => {
        try {
          const root = stationScenes[stationId]?.root;
          if (root) {
            root.updateWorldMatrix?.(true, true);
            renderer.compile(root, camera);
          }
          renderer.render(scene, camera);
        } catch { /* ignore */ }
      }, { minIdleMs: 16 });
      tick(`${stationTitle} GPU 就绪`);
      await yieldToLoader(10);
    }

    // Restore default electro / optics idle presentation.
    await runHeavyChunk(() => {
      try { equipment.electro?.setMode?.('hall'); } catch { /* ignore */ }
      try { equipment.optics?.setMode?.('idle'); } catch { /* ignore */ }
      const mechanicsPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'mechanics'
        ? (new URLSearchParams(window.location.search).get('exp') || 'free-fall')
        : null;
      try { equipment.mechanics?.setMode?.(mechanicsPreview); } catch { /* ignore */ }
      const thermoPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'thermo'
        ? (new URLSearchParams(window.location.search).get('exp') || 'calorimetry')
        : null;
      try { equipment.thermo?.setMode?.(thermoPreview); } catch { /* ignore */ }
      hideAllContentDisplays();
    }, { minIdleMs: 10 });

    onProgress(0.96, '预热完成…');
    await runHeavyChunk(() => {
      try {
        renderer.render(scene, camera);
      } catch { /* ignore */ }
      hideAllContentDisplays();
    }, { minIdleMs: 12 });
  } finally {
    bootSuspendRender = false;
    labLoader.setBusy?.(false);
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

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'induced-e') {
  expManager.openStationMenu('electro');
  expManager.startExperiment('induced_electric_field');
  camera.position.set(-3.4, 1.75, 3.95);
  camera.lookAt(-4.0, 1.2, 2.55);
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

// Development-only visual QA shortcut for the migrated mechanics rigs.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'mechanics') {
  const previewParams = new URLSearchParams(window.location.search);
  const mechanicsExp = previewParams.get('exp') || 'free-fall';
  const showMechanicsPreview = (expId) => {
    expManager.openStationMenu('mechanics');
    expManager.startExperiment(expId);
    camera.position.set(-4.2, expId === 'free-fall' ? 2.15 : 1.75, 0.35);
    camera.lookAt(-4.2, expId === 'free-fall' ? 1.65 : 1.15, -2.8);
  };
  showMechanicsPreview(mechanicsExp);
  window.__mechanicsQa = Object.freeze({
    start: showMechanicsPreview,
    snapshot: (expId) => equipment.mechanics?.snapshot?.(expId || expManager.state.expId),
    setParam: (key, value) => expManager.uiAction('mechanics-source-set', { key, value }),
    action: (id) => expManager.uiAction('mechanics-source-action', { id }),
    fullscreen: () => openHoloFullscreen('mechanics'),
  });
  if (previewParams.get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('mechanics'));
  }
}

// Development-only visual QA shortcut for the migrated thermodynamics rigs.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'thermo') {
  const previewParams = new URLSearchParams(window.location.search);
  const thermoExp = previewParams.get('exp') || 'calorimetry';
  expManager.openStationMenu('thermo');
  expManager.startExperiment(thermoExp);
  camera.position.set(4.2, 1.6, 4.9);
  camera.lookAt(4.2, 1.28, 2.6);
  if (previewParams.get('fullscreen') === '1') {
    requestAnimationFrame(() => openHoloFullscreen('thermo'));
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

// Development-only visual QA for geometric optics (guangxue migration).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'optics-geo') {
  const previewParams = new URLSearchParams(window.location.search);
  const geoExp = previewParams.get('exp') || 'reflection';
  expManager.openStationMenu('optics');
  expManager.startExperiment(geoExp);
  camera.position.set(4.15, 1.7, -0.9);
  camera.lookAt(4.2, 1.05, -2.8);
  if (previewParams.get('fullscreen') === '1') {
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
  // Live content-screen controls beat apparatus on the same ray so aiming a
  // slider/button never steals a charge/probe sitting behind the glass.
  const holoControl = getAimedHoloControl(unlockedElectroRaycaster);
  if (holoControl?.target) {
    return {
      target: holoControl.target,
      raycaster: unlockedElectroRaycaster,
      holoControl: true,
    };
  }
  const hits = unlockedElectroRaycaster.intersectObjects(interactables, true);
  // Charges/probes may sit behind the transparent hologram. The generic
  // resolver intentionally stops at the first nearby screen hit, so choose
  // semantic electromagnetic targets first for source-style dragging.
  // Invisible apparatus from other electro modes still raycasts in Three.js,
  // so only accept targets that belong to a currently visible hierarchy.
  // Hall knobs/probe/coils must beat empty content-screen glass the same way
  // Faraday rod / induced-E probe already do — otherwise only terminals work
  // (they have a separate nearest-port fallback).
  const preferredRoles = [
    'electric_charge', 'electric_probe', 'gauss_charge', 'faraday_rod', 'induced_e_probe',
    'hall_knob_im', 'hall_knob_is', 'hall_knob_zero',
    'hall_probe', 'hall_helmholtz', 'hall_solenoid', 'hall_console',
    'hall_terminal_solenoid', 'hall_terminal_helmholtz', 'hall_terminal_output',
  ];
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
  // Content-screen UI (sliders/buttons): route through the normal screen path
  // instead of the apparatus drag bridge.
  if (picked.holoControl || resolveScreenHost(picked.target)) {
    gaussPointerDrag = { suppressClick: true };
    holdLMB = true;
    resetMouseDragAccum();
    syncMouseDragState();
    tryInteract(picked.raycaster, true, {
      target: picked.target,
      direct: true,
      time: clock.elapsedTime,
    });
    unlockedElectroDrag = {
      ...picked,
      lastX: Number(event.clientX || 0),
      lastY: Number(event.clientY || 0),
      screenUi: true,
    };
    if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
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
  // Keep the UV ray under the cursor for absolute content-screen slider tracking.
  if (unlockedElectroDrag.screenUi || unlockedElectroDrag.holoControl) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      unlockedElectroPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      unlockedElectroRaycaster.setFromCamera(unlockedElectroPointer, camera);
    }
  }
  expManager?.updateManipulation(unlockedElectroDrag.target, {
    dt: 1 / 60,
    time: clock.elapsedTime,
    totalX: equipment?.electro?.mouseDrag?.movementX || 0,
    totalY: equipment?.electro?.mouseDrag?.movementY || 0,
    raycaster: unlockedElectroRaycaster,
  });
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
  if (picked.holoControl || resolveScreenHost(picked.target)) {
    gaussPointerDrag = { suppressClick: true };
    holdLMB = true;
    resetMouseDragAccum();
    syncMouseDragState();
    tryInteract(picked.raycaster, true, {
      target: picked.target,
      direct: true,
      time: clock.elapsedTime,
    });
    unlockedElectroDrag = {
      ...picked,
      lastX: Number(event.clientX || 0),
      lastY: Number(event.clientY || 0),
      screenUi: true,
    };
    if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
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
  if (unlockedElectroDrag.screenUi || unlockedElectroDrag.holoControl) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      unlockedElectroPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      unlockedElectroRaycaster.setFromCamera(unlockedElectroPointer, camera);
    }
  }
  expManager?.updateManipulation(unlockedElectroDrag.target, {
    dt: 1 / 60,
    time: clock.elapsedTime,
    totalX: equipment?.electro?.mouseDrag?.movementX || 0,
    totalY: equipment?.electro?.mouseDrag?.movementY || 0,
    raycaster: unlockedElectroRaycaster,
  });
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
    induced_e_probe: 88,
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

/**
 * Live bench apparatus under the ray for the active electro experiment.
 * These win over empty content-screen glass so gear stays grabable when the
 * floating display sits between the camera and the tabletop.
 */
function pickLiveElectroCharge(hits) {
  const expId = expManager?.state?.expId;
  const preferredRoles = expId === 'electric_field'
    ? ['electric_charge', 'electric_probe']
    : expId === 'gauss_theorem'
      ? ['gauss_charge']
      : expId === 'faraday_induction'
        ? ['faraday_rod']
        : expId === 'induced_electric_field'
          ? ['induced_e_probe']
          : expId === 'hall_effect'
            ? [
              'hall_knob_im', 'hall_knob_is', 'hall_knob_zero',
              'hall_probe', 'hall_helmholtz', 'hall_solenoid', 'hall_console',
              'hall_terminal_solenoid', 'hall_terminal_helmholtz', 'hall_terminal_output',
            ]
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
    const isSelector = screen?.userData?.type === 'holo'
      || screen?.userData?.role === 'holo_selector';
    // Idle tabletop selectors must stay aimable so "点击激活" works without
    // pointer-lock. Content displays still require present/active.
    if (!(screen?.userData?.active || screen?.userData?.present || isSelector)) continue;
    const aim = screen.userData.screenAimFromRay?.(rc);
    if (!aim) continue;
    if (aim.distance - 0.05 > bestDist) continue;
    // Only an actual button/card/activate region receives UI priority. Empty
    // active-screen space still obeys the frontmost-surface rule.
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

  // Aiming a real content-screen control (slider/button) always wins over
  // apparatus on the same ray — otherwise the induced-E probe / Faraday rod
  // steals the crosshair while the user is clearly aiming the panel UI.
  const holoControl = getAimedHoloControl(inputRaycaster);
  if (holoControl?.target) return holoControl.target;

  // Bench apparatus (Hall knobs/probe/coils, Faraday rod, …) still beats empty
  // content-screen glass so gear remains grabable through the floating panel.
  const liveCharge = pickLiveElectroCharge(hits);
  if (liveCharge) return liveCharge;

  // The Hall sockets are deliberately tiny in the model.  If the mouse ray
  // passes just beside a socket, use the same semantic nearest-port fallback
  // as AR so the port can still be grabbed instead of selecting the console
  // deck behind it.  Keep this scoped to the Hall experiment and to a narrow
  // aim band so ordinary apparatus picking remains frontmost elsewhere.
  // Run before empty-glass holo so terminals remain usable when the panel
  // occludes the bench but the aim is still near a socket.
  if (expManager?.state?.expId === 'hall_effect') {
    const terminal = hallBench.userData.getHallTerminalTarget?.(inputRaycaster, { maxDistance: 0.11 });
    if (terminal?.target) {
      lastFocusHit = terminal.hit;
      return terminal.target;
    }
  }

  // Empty content-screen glass (no button/slider under the ray) must NOT steal
  // focus — otherwise only terminals (nearest-port) remain usable.
  const aimedHolo = getAimedHolo(inputRaycaster);
  if (aimedHolo) {
    const pick = aimedHolo.userData.pickFromRay?.(inputRaycaster);
    if (pick) return aimedHolo;
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
  // Live bench gear beats empty content glass (same rule as desktop getFocusTarget).
  const liveApparatus = pickLiveElectroCharge(
    inputRaycaster.intersectObjects(interactables, true),
  );
  const apparatusPriority = (!holoControl && liveApparatus)
    ? { target: liveApparatus, hit: { object: liveApparatus, distance: 0 } }
    : null;
  return resolveFrontmostInteraction(hits, {
    resolveInteractive,
    withinInteractDist,
    // Real UI controls first; then Hall terminals / live apparatus; never empty glass.
    priorityInteraction: holoControl || terminalFallback || apparatusPriority,
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

  // ── FAST PATH: hologram UI first — NO full-scene raycast ──
  // Experiment card clicks used to freeze the lab because every press ran
  // intersectObjects(interactables) over the whole station before handling UI.
  const directTarget = directContext?.target || null;
  const directScreen = resolveScreenHost(directTarget);
  const aimedHoloControl = directScreen
    ? { target: directScreen, hit: { object: directScreen, distance: 0 } }
    : getAimedHoloControl(inputRaycaster);
  const aimedHoloFast = directScreen
    || aimedHoloControl?.target
    || null;

  if (aimedHoloFast) {
    const aimedHolo = aimedHoloFast;
    const sid = aimedHolo.userData.stationId;
    const isDisplay = aimedHolo.userData.type === 'holo_display'
      || aimedHolo.userData.role === 'holo_display';
    const isSelector = aimedHolo.userData.type === 'holo'
      || aimedHolo.userData.role === 'holo_selector';
    const screenLive = !!(aimedHolo.userData.active || aimedHolo.userData.present);
    // Always try UV pick first — idle selectors return action:'activate'.
    const pick = aimedHolo.userData.pickFromRay?.(inputRaycaster)
      || (directContext?.pick && isParamSliderAction(directContext.pick?.action)
        ? directContext.pick
        : null);
    if (pick) {
      if (isParamSliderAction(pick.action)) {
        expManager.beginManipulation(aimedHolo, {
          ...(directContext || {}),
          time: directContext?.time ?? t,
          raycaster: inputRaycaster,
          pick,
        });
        return;
      }
      if (pick.action === 'hall-scroll-table' || pick.role === 'scrollable_table') {
        if (directContext) {
          expManager.beginManipulation(aimedHolo, {
            ...directContext,
            time: directContext?.time ?? t,
            raycaster: inputRaycaster,
            pick,
          });
        } else {
          handleHoloScreenAction(pick, sid);
        }
        return;
      }
      // activate / start / back / menu cards — before any scene raycast
      handleHoloScreenAction(pick, sid);
      return;
    }
    if (screenLive) {
      if (isDisplay && !directScreen && !aimedHoloControl?.target) {
        // empty content glass → fall through to apparatus
      } else if (!isDisplay) {
        showToast('请瞄准桌面终端上的实验卡片');
        return;
      } else {
        showToast('请瞄准内容屏上的控件');
        return;
      }
    } else if (isSelector) {
      // Fallback if pickFromRay failed to sample UV but the terminal is aimed.
      handleHoloScreenAction({ action: 'activate', stationId: sid }, sid);
      return;
    } else if (!isDisplay) {
      expManager.interact(aimedHolo, t);
      return;
    } else {
      showToast('请先在桌面终端选择实验');
      return;
    }
  }

  // ── SLOW PATH: full interactables raycast (apparatus only) ──
  const hits = inputRaycaster.intersectObjects(interactables, true);
  lastFocusHit = hits[0] || null;

  const liveChargeRoles = new Set([
    'electric_charge', 'electric_probe', 'gauss_charge', 'faraday_rod', 'induced_e_probe',
    'hall_knob_im', 'hall_knob_is', 'hall_knob_zero',
    'hall_probe', 'hall_helmholtz', 'hall_solenoid', 'hall_console',
    'hall_terminal_solenoid', 'hall_terminal_helmholtz', 'hall_terminal_output',
  ]);
  const directIsCharge = !!(
    directTarget
    && liveChargeRoles.has(directTarget.userData?.role)
    && isHierarchyVisible(directTarget)
    && !resolveScreenHost(directTarget)
  );
  const directCharge = directIsCharge
    ? directTarget
    : pickLiveElectroCharge(hits);
  if (directCharge) {
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
    if (pick.action === 'color' || pick.action === 'size' || pick.action === 'eraser' || pick.action === 'clear') {
      board.userData.applyPick(pick);
      if (pick.action === 'color') showToast('已选择画笔颜色');
      else if (pick.action === 'size') showToast('已选择画笔粗细');
      else if (pick.action === 'eraser') {
        showToast(blackboardBrush.mode === 'eraser' ? '橡皮模式 · 按住拖动画擦除' : '已切回画笔');
      } else if (pick.action === 'clear') {
        showToast('黑板已清屏');
      }
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
        if (isParamSliderAction(pick.action)) {
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

/**
 * Post-render only: canvas HUD paints / one-shot attach work.
 * Keep this tight — after any heavy job the scheduler also inserts a
 * camera-only cooldown frame so look/WASD stay continuous during switches.
 */
const POST_RENDER_BUDGET_MS = 3.0;

function animate() {
  // Schedule the next frame first so a long drain cannot delay rAF arming.
  requestAnimationFrame(animate);
  // During boot prewarm, leave almost all main-thread budget to warm chunks +
  // loader paints so browser chrome (tabs / back) stays responsive.
  if (bootSuspendRender) {
    labFrameScheduler.drain(1);
    return;
  }
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const nowMs = performance.now();
  const arActive = !!handTracking?.isActive();
  const softSwitch = !!labFrameScheduler.softSwitchActive?.();
  labFrameScheduler.tickSoftSwitch?.();

  // Camera inference is throttled internally and only runs in user-enabled AR mode.
  // During experiment switch, skip AR vision work — it steals frames from look/WASD.
  if (!softSwitch) {
    handTracking?.update(nowMs);
  }
  const arState = (!softSwitch && arActive)
    ? arInteractionController?.update(nowMs)
    : null;

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

  // Soft switch: camera + present + tiny budget only. No focus raycasts,
  // station animators, or dense interaction — that was the remaining freeze.
  if (softSwitch) {
    renderer.render(scene, camera);
    labFrameScheduler.drain(2.5);
    return;
  }

  // experiment simulation — every frame, same as the standalone sources
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
      && (expManager.state.expId === 'multi_slit_diffraction'
        || expManager.state.data?.mode === 'geometric');
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

  // All station animators every frame (particles, rays, holo float).
  // Time-slicing here made migrated benches stutter while looking around.
  for (const fn of animators) {
    try { fn(t); } catch { /* never let one station freeze the lab */ }
  }

  renderer.render(scene, camera);

  // One-shot HUD / attach work only — never block the next frame's sim.
  labFrameScheduler.drain(POST_RENDER_BUDGET_MS);
}

function startExperimentSafe(expId) {
  if (!expId) return;
  // Never run prepareExperiment on the click microtask — that freezes the view.
  // Bookkeeping + HUD schedule only; GPU warm (if somehow missing) is one budget job.
  if (!preparedExperimentIds.has(expId)) {
    labFrameScheduler.schedule(`exp:prepare:${expId}`, () => {
      try { prepareExperiment(expId); } catch { /* best-effort */ }
    }, { priority: 80 });
  }
  expManager?.startExperiment(expId);
}

mountUi({
  bridge: {
    prepareExperiment,
    openStationMenu: (stationId) => expManager?.openStationMenu(stationId),
    closeMenu: () => expManager?.closeMenu(),
    startExperiment: (expId) => startExperimentSafe(expId),
    exitExperiment: () => expManager?.exitExperiment(),
    uiAction: (action, payload) => expManager?.uiAction(action, payload),
    recordExperiment: () => expManager?.onKey('KeyF', clock.elapsedTime),
    triggerExperimentAction: () => expManager?.interact({ userData: { role: 'ui_action' } }, clock.elapsedTime),
    toggleHandTracking,
    openFullscreen: (stationId) => openHoloFullscreen(stationId),
    closeFullscreen: () => closeHoloFullscreen(),
  },
});

// Start render loop immediately so frames under the loader are real lab content
// (loader fully covers the canvas until finish()).
animate();

// ── Boot gate: assets + GPU prewarm must complete before the lab is revealed ──
const bootStarted = performance.now();
const MIN_BOOT_MS = 500;

/** Present a few frames so the first visible image is the lab, not an empty buffer. */
async function paintReadyFrames() {
  labLoader.setProgress(0.97, '渲染首帧…');
  for (let i = 0; i < 3; i++) {
    await runHeavyChunk(() => {
      try {
        renderer.render(scene, camera);
      } catch { /* ignore */ }
    }, { minIdleMs: 8 });
    labLoader.setProgress(0.97 + (i + 1) * 0.008, '渲染首帧…');
  }
}

async function bootReveal() {
  try {
    // Don't block forever if a portrait fails — race with a timeout
    await Promise.race([
      Promise.all(portraitLoadPromises),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    // Let portrait decode / layout settle before the heavy prewarm wave.
    await yieldToBrowser(16);
    labLoader.setProgress(0.88, '预热实验器材…');
    // Heavy compile + first geometry builds happen while the loader covers the view.
    await warmAllLabResources((ratio, status) => labLoader.setProgress(ratio, status));
    await paintReadyFrames();

    const wait = Math.max(0, MIN_BOOT_MS - (performance.now() - bootStarted));
    if (wait) await new Promise((r) => setTimeout(r, wait));

    labLoader.setProgress(1, '系统就绪 · 欢迎进入实验室');
    await labLoader.finish();
  } catch (err) {
    console.warn('[boot] reveal failed, using fallback warm', err);
    // Best-effort fallback: still try a quick warm so entry is not bare.
    try {
      Object.entries(STATION_EXPERIMENTS).forEach(([sid, st]) => {
        (st.experiments || []).forEach((exp) => prepareExperiment(exp.id, sid));
      });
    } catch { /* ignore */ }
    await paintReadyFrames().catch(() => {});
    try {
      await labLoader.finish();
    } catch { /* ignore */ }
  }
}

bootReveal();
