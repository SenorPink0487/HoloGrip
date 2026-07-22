import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMaterials } from './starship/materials.js';
import { createFullStack } from './starship/fullStack.js';
import { createLaunchPad, createLights, OLM_DECK_HEIGHT } from './scene/environment.js';
import {
  createSpace,
  EARTH_RADIUS,
  REAL_EARTH_RADIUS_M,
  METERS_TO_VISUAL,
  CINEMATIC_HANDOFF_START,
  CINEMATIC_PAD_OUT_END,
  CINEMATIC_LEO_VISUAL,
} from './scene/space.js';
import {
  SYSTEM_FAR_ORBIT_MULTIPLIER,
  createSolarScale,
} from './scene/solarScale.js';
import { createPostProcessing } from './effects/postprocessing.js';
import { createExhaustSystem } from './effects/exhaust.js';
import { createLaunchSequence } from './effects/launchSequence.js';
import { createSoundEngine } from './audio/soundEngine.js';
import { createPlayerShip } from './craft/playerShip.js';
import { createFlightController } from './craft/flightController.js';
import { createAsteroidField } from './scene/asteroids.js';
import {
  createDefaultStarshipDesign,
  createRocketFromDesign,
  calculateRocketPerformance,
  disposeObject3D,
  cloneDesign,
  resolveBootDesign,
  loadDesignLocal,
  normalizeDesign,
  isDefaultStarshipVisual,
} from './design/index.js';
import { createDesignModeController } from './design/designMode.js';
import { createDesignStudio } from './design/designStudio.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------------------
// Scene / free camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const SOLAR_SCALE = createSolarScale(EARTH_RADIUS);

// Far plane must clear the system overview camera (outer ~ Saturn orbit × multi).
// Old EARTH_RADIUS*4096 ≈ 1.07×outer — camera at ~2×outer was fully clipped → black.
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  Math.max(0.0002, 2 * METERS_TO_VISUAL),
  SOLAR_SCALE.outerOrbitRadius * SYSTEM_FAR_ORBIT_MULTIPLIER
);
// Default pad framing is applied after siteMeters exists (true Earth-ratio site).

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.screenSpacePanning = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.zoomSpeed = 1.25;
controls.enableRotate = true;
// Fully free look — no ground lock
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
// World-unit limits; pad is METERS_TO_VISUAL-scaled (rocket ~0.26 units tall)
controls.minDistance = 2 * METERS_TO_VISUAL;
controls.maxDistance = EARTH_RADIUS * 400;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
// Allow looking from below / orbit freely
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

// Space first (MW cubemap → scene.environment when ready; single sunDir source)
const space = createSpace(scene);

// Soft studio env only until milky-way cubemap loads — then space.js owns environment
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if (!scene.environment) scene.environment = roomEnv;
const padLights = createLights(scene);
// Pad sky dome shares space.sunDir (same Vector3 reference)
const pad = createLaunchPad(scene, { sunDir: space.sunDir });
pad.setVisibleByAltitude(0);
space.updateByAltitude(0);

/**
 * Minimum altitude used for pad/Earth visibility cross-fade.
 * Raised when free-look camera presets need the globe (earth / system / planets).
 * Cleared for pad-local views so the flat site returns.
 */
let viewAltFloor = 0;

/** Free-look body the camera should keep tracking as it orbits (moon/mars/…). */
let freeLookBody = null;
const _freeLookDelta = new THREE.Vector3();

/**
 * Earth surface frame: pad / stack / local play-space ride heliocentric Earth.
 * When padFrameLock, camera co-moves so launch pad feels fixed.
 * When viewing the solar system, lock is off so Earth orbits in frame.
 */
const surfaceFrame = new THREE.Group();
surfaceFrame.name = 'EarthSurfaceFrame';
scene.add(surfaceFrame);

/**
 * Site in real metres, then scaled by METERS_TO_VISUAL so Starbase / stack
 * match true size vs the display Earth (EARTH_RADIUS ↔ 6371 km).
 * Launch sequence + pad cameras work in metres inside this group.
 */
const siteMeters = new THREE.Group();
siteMeters.name = 'SiteMeters';
siteMeters.scale.setScalar(METERS_TO_VISUAL);
surfaceFrame.add(siteMeters);

// Tower rim practical rides the scaled site (same metres as Mechazilla).
siteMeters.add(padLights.rim);
padLights.rim.position.set(-20, 50, -30);
let padFrameLock = true;
const _surfPrev = new THREE.Vector3();
const _surfDelta = new THREE.Vector3();
const _surfOrigin = new THREE.Vector3();
const _earthCenter = new THREE.Vector3();
const _shipWorld = new THREE.Vector3();
const _siteLocal = new THREE.Vector3();
const _siteWorld = new THREE.Vector3();

function syncSurfaceFrame() {
  if (typeof space.getSurfaceOrigin === 'function') {
    space.getSurfaceOrigin(_surfOrigin);
  } else {
    _surfOrigin.set(0, 0, 0);
  }
  _surfDelta.copy(_surfOrigin).sub(surfaceFrame.position);
  surfaceFrame.position.copy(_surfOrigin);
  return _surfDelta;
}

function applySurfaceCameraDelta(delta) {
  if (!padFrameLock || pilotMode) return;
  if (delta.lengthSq() < 1e-12) return;
  camera.position.add(delta);
  controls.target.add(delta);
}

/** Map a pad-local metre offset into world space (true site scale). */
function siteLocalToWorld(x, y, z, out = _siteWorld) {
  _siteLocal.set(x, y, z);
  return siteMeters.localToWorld(out.copy(_siteLocal));
}

/** Place orbit camera for pad framing (positions in real metres). */
function setPadCameraMeters(camX, camY, camZ, tgtX, tgtY, tgtZ) {
  siteMeters.updateWorldMatrix(true, false);
  siteLocalToWorld(camX, camY, camZ, camera.position);
  siteLocalToWorld(tgtX, tgtY, tgtZ, controls.target);
}

const mats = createMaterials();

/**
 * Active design document (editable clone).
 * Pad mesh: detailed original Full Stack while design still matches Starship
 * signature; DIY / modified designs use procedural RocketAssembly.
 */
let activeDesign = createDefaultStarshipDesign();
/** High-detail Super Heavy + Starship showcase (heat tiles, fins, raptors…). */
let originalStack = createFullStack(mats);
attachDetailedStackMeta(originalStack, activeDesign);
let stack = originalStack;

// Reparent pad into metre-true site group.
// Must use add() (not attach()): attach() preserves world scale and would
// cancel METERS_TO_VISUAL, leaving the pad full-size while the rocket shrinks
// — rocket looks like it floats over a giant ground plane.
pad.padRoot.removeFromParent();
pad.padRoot.position.set(0, 0, 0);
pad.padRoot.rotation.set(0, 0, 0);
pad.padRoot.scale.set(1, 1, 1);
siteMeters.add(pad.padRoot);
siteMeters.add(stack);

const contact = new THREE.Mesh(
  new THREE.CircleGeometry(8, 32),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
  })
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.05;
siteMeters.add(contact);

const post = createPostProcessing(renderer, scene, camera);
const exhaust = createExhaustSystem(siteMeters);
const launch = createLaunchSequence(stack, camera, controls, exhaust, siteMeters);
const sfx = createSoundEngine();

// Default view: full stack on OLM (metre framing → world via site scale)
setPadCameraMeters(95, OLM_DECK_HEIGHT + 55, 130, 0, OLM_DECK_HEIGHT + 60, 0);
camera.near = Math.max(0.0002, 2 * METERS_TO_VISUAL);
camera.updateProjectionMatrix();
controls.update();

/** Attach launch/performance fields onto the detailed Full Stack. */
function attachDetailedStackMeta(root, design) {
  const perf = calculateRocketPerformance(design);
  root.userData.performance = perf;
  root.userData.underpowered = perf.underpowered;
  root.userData.canLiftOff = perf.canLiftOff;
  root.userData.massKg = perf.liftoffMassKg;
  root.userData.thrustN = perf.totalThrustN;
  root.userData.twr = perf.twr;
  root.userData.stageCount = 2;
  root.userData.hasInterstageSeparation = true;
  root.userData.hasSideBoosterSeparation = false;
  root.userData.sideBoosters = root.userData.sideBoosters || [];
  root.userData.isDetailedStarship = true;
  root.userData.isRocketAssembly = false;
  root.userData.designId = design?.id;
  root.userData.designName = design?.name;
  return root;
}

/**
 * Replace pad vehicle; dispose previous GPU resources (never destroy cached originalStack).
 * @param {object} design
 * @param {{ useOriginal?: boolean }} [opts]
 */
function applyDesignToPad(design, opts = {}) {
  if (launch.state.running) {
    launch.stop();
    setMissionUiIdle();
  }

  activeDesign = normalizeDesign(cloneDesign(design));
  const useDetailed =
    opts.useOriginal === true ||
    (opts.useOriginal !== false && isDefaultStarshipVisual(activeDesign));

  const prev = stack;
  siteMeters.remove(prev);
  // Keep showcase Full Stack mesh alive for reuse
  if (prev !== originalStack) {
    if (prev.userData?.dispose) prev.userData.dispose();
    else disposeObject3D(prev);
  }

  if (useDetailed) {
    // Recreate showcase stack if missing or stripped
    if (!originalStack?.userData?.booster) {
      originalStack = createFullStack(mats);
    }
    attachDetailedStackMeta(originalStack, activeDesign);
    stack = originalStack;
    stack.userData.setTilesVisible?.(ui.showTiles?.checked ?? true);
    stack.userData.setEngineGlow?.(false);
    stack.userData.setViewMode?.('stack');
  } else {
    stack = createRocketFromDesign(activeDesign, mats);
    stack.userData.setEngineGlow?.(false);
  }

  siteMeters.add(stack);
  launch.setStack(stack);

  updateSpecsFromAssembly();
  applyViewMode('stack');
}

function updateSpecsFromAssembly() {
  const perf =
    stack.userData.performance || calculateRocketPerformance(activeDesign);
  const stageCount = stack.userData.stageCount ?? 2;
  const rows = [
    ['总高', `${perf.totalHeightM.toFixed(1)} m`],
    ['直径', `${perf.coreDiameterM.toFixed(1)} m`],
    ['起飞质量', `${(perf.liftoffMassKg / 1000).toFixed(0)} t`],
    ['总推力', `${(perf.totalThrustN / 1e6).toFixed(1)} MN`],
    ['推重比', perf.twr.toFixed(2) + (perf.underpowered ? ' ⚠' : '')],
    ['Δv 估', `${(perf.deltaV / 1000).toFixed(2)} km/s`],
    ['构型', stageCount === 1 ? '单级' : '两级' + (perf.sideBoosters?.count ? ` +${perf.sideBoosters.count}侧助` : '')],
  ];
  if (ui.specsList) {
    ui.specsList.innerHTML = rows
      .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
      .join('');
  }
  // Performance warning banner on mission badge
  if (perf.warnings?.length && ui.flightMeta && !launch.state.running) {
    ui.flightMeta.title = perf.warnings.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Pilot craft + small bodies
// ---------------------------------------------------------------------------
const playerShip = createPlayerShip();
// Model length ~24 m; scale so displayed length ≈ full-stack rocket (~120 m)
playerShip.scale.setScalar(5);
surfaceFrame.add(playerShip);
const flight = createFlightController(playerShip, camera, controls);
// Full-ring main belt (heliocentric) — even angular coverage, cheap static instances
const asteroids = createAsteroidField({
  earthRadius: EARTH_RADIUS,
  AU: space.AU,
  sunPos: space.getPlanetWorldPos?.('sun') || new THREE.Vector3(0, 0, 0),
  // Keep in sync with earthDef.angle in scene/space.js
  earthAngle: 2.45,
});
asteroids.group.visible = false;
// Parent to space root so the belt shares the sun-centered frame
(space.root || scene).add(asteroids.group);

// Snap pad frame + camera to current Earth surface (Earth already on orbit)
syncSurfaceFrame();
setPadCameraMeters(95, OLM_DECK_HEIGHT + 55, 130, 0, OLM_DECK_HEIGHT + 60, 0);
controls.update();
// No permanent belt light — keeps vacuum black.

// Rotate / zoom while following: reframe orbit around the rocket (keep follow on).
// Uncheck「跟随相机」to fully free the camera.
controls.addEventListener('start', () => {
  launch.onControlsStart();
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const ui = {
  showTiles: document.getElementById('showTiles'),
  autoRotate: document.getElementById('autoRotate'),
  followCam: document.getElementById('followCam'),
  timeScale: document.getElementById('timeScale'),
  btnLaunch: document.getElementById('btnLaunch'),
  btnAbort: document.getElementById('btnAbort'),
  btnPilot: document.getElementById('btnPilot'),
  soundEnabled: document.getElementById('soundEnabled'),
  soundVolume: document.getElementById('soundVolume'),
  fps: document.getElementById('fps'),
  specsList: document.getElementById('specsList'),
  phaseLabel: document.getElementById('phaseLabel'),
  flightMeta: document.getElementById('flightMeta'),
  missionBadge: document.getElementById('missionBadge'),
  missionProgress: document.getElementById('missionProgress'),
  missionPct: document.getElementById('missionPct'),
  statusDot: document.getElementById('statusDot'),
  tlTrack: document.getElementById('tlTrack'),
  pilotHud: document.getElementById('pilotHud'),
  pilotModeLabel: document.getElementById('pilotMode'),
  pilotSpeed: document.getElementById('pilotSpeed'),
  pilotThrust: document.getElementById('pilotThrust'),
  pilotAlt: document.getElementById('pilotAlt'),
  pilotZone: document.getElementById('pilotZone'),
  hintDefault: document.getElementById('hintDefault'),
  hintPilot: document.getElementById('hintPilot'),
  btnDesign: document.getElementById('btnDesign'),
  designRoot: document.getElementById('designMode'),
  designToast: document.getElementById('designToast'),
  perfWarn: document.getElementById('perfWarn'),
};

let pilotMode = false;
let designPreviewTimer = null;
/** @type {ReturnType<typeof createDesignModeController> | null} */
let designMode = null;

/** Independent hangar scene — not the pad / launch world. */
const designStudio = createDesignStudio(renderer, canvas);

// Initial specs from design assembly
updateSpecsFromAssembly();

/** Saved pad camera / controls while in design bay */
let padViewSnapshot = null;

function snapshotPadView() {
  padViewSnapshot = {
    camPos: camera.position.clone(),
    target: controls.target.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    autoRotate: controls.autoRotate,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
}

function restorePadView() {
  if (!padViewSnapshot) return;
  camera.position.copy(padViewSnapshot.camPos);
  controls.target.copy(padViewSnapshot.target);
  camera.fov = padViewSnapshot.fov;
  camera.near = padViewSnapshot.near;
  camera.far = padViewSnapshot.far;
  camera.updateProjectionMatrix();
  controls.autoRotate = padViewSnapshot.autoRotate;
  controls.minDistance = padViewSnapshot.minDistance;
  controls.maxDistance = padViewSnapshot.maxDistance;
  controls.enabled = true;
  controls.update();
  padViewSnapshot = null;
}

/**
 * KSP VAB pointer model while design bay is open:
 *  - Holding a part: LMB places (if green-snapped); RMB orbits; wheel zooms
 *  - Part ghost always follows cursor (free float or magnetic snap)
 */
let designPtr = { down: false, button: 0, x: 0, y: 0, moved: false };
/** Last rotation synced into studio (avoid rebuild thrash on mousemove) */
let designSyncedRot = null;

function onDesignCanvasPointerDown(ev) {
  if (!designMode?.isActive?.() || !designStudio.isActive()) return;
  designPtr = {
    down: true,
    button: ev.button ?? 0,
    x: ev.clientX,
    y: ev.clientY,
    moved: false,
  };
}

function onDesignCanvasPointerUp(ev) {
  if (!designMode?.isActive?.() || !designStudio.isActive()) return;
  const moved =
    designPtr.moved ||
    Math.hypot(ev.clientX - designPtr.x, ev.clientY - designPtr.y) > 6;
  const button = ev.button ?? designPtr.button;
  designPtr.down = false;

  const inst = designMode.getInstallState?.();
  if (!inst?.defId) return;

  // LMB click (no drag) → place when snapped
  if (button === 0 && !moved) {
    const hit = designStudio.pickAttachNode?.(ev.clientX, ev.clientY, canvas);
    if (hit?.parentId && hit?.parentNode && hit.commitable !== false) {
      designMode.tryAttachAt?.(hit.parentId, hit.parentNode, {
        angle: hit.angle,
        yFraction: hit.yFraction,
        keepHolding: true,
      });
    } else {
      // Soft feedback — KSP-ish "can't attach here"
      designMode?.getInstallState?.();
      // toast via designMode if exposed — use install hints only
      const el = ui.designToast;
      if (el) {
        el.hidden = false;
        el.textContent = '未磁吸到挂点 — 靠近绿色节点/筒壁后再左键';
        el.dataset.kind = 'err';
        clearTimeout(el._t);
        el._t = setTimeout(() => {
          el.hidden = true;
        }, 1600);
      }
    }
  }
}

function onDesignCanvasPointerMove(ev) {
  if (!designMode?.isActive?.() || !designStudio.isActive()) return;
  if (designPtr.down) {
    if (Math.hypot(ev.clientX - designPtr.x, ev.clientY - designPtr.y) > 6) {
      designPtr.moved = true;
    }
  }
  const inst = designMode.getInstallState?.();
  if (!inst?.defId) return;
  if (inst.rotation != null && inst.rotation !== designSyncedRot) {
    designSyncedRot = inst.rotation;
    designStudio.setInstallRotation?.(inst.rotation);
  }
  // Always update held-part ghost under cursor
  designStudio.hoverAttachNode?.(ev.clientX, ev.clientY, canvas);
}

function onDesignCanvasContextMenu(ev) {
  if (!designMode?.isActive?.() || !designStudio.isActive()) return;
  // RMB is camera orbit in place mode — never show browser menu
  ev.preventDefault();
}

function enterDesignBay(design) {
  snapshotPadView();
  // Disable pad orbit controls — studio owns the canvas
  controls.enabled = false;
  controls.autoRotate = false;
  designStudio.enter(design);
  // Default solid full craft (KSP VAB) — no half-cut
  designStudio.setViewStyle?.(designMode?.getViewStyle?.() || 'solid');
  document.body.classList.add('design-mode');
  if (ui.designRoot) {
    ui.designRoot.hidden = false;
    ui.designRoot.classList.add('open');
  }
  canvas?.addEventListener('pointerdown', onDesignCanvasPointerDown);
  canvas?.addEventListener('pointerup', onDesignCanvasPointerUp);
  canvas?.addEventListener('pointermove', onDesignCanvasPointerMove);
  canvas?.addEventListener('contextmenu', onDesignCanvasContextMenu);
}

function leaveDesignBay() {
  canvas?.removeEventListener('pointerdown', onDesignCanvasPointerDown);
  canvas?.removeEventListener('pointerup', onDesignCanvasPointerUp);
  canvas?.removeEventListener('pointermove', onDesignCanvasPointerMove);
  canvas?.removeEventListener('contextmenu', onDesignCanvasContextMenu);
  designStudio.exit();
  document.body.classList.remove('design-mode');
  document.body.classList.remove('vab-placing');
  if (ui.designRoot) {
    ui.designRoot.hidden = true;
    ui.designRoot.classList.remove('open');
  }
  restorePadView();
}

/** Skip debounced rebuild right after place-feedback already rebuilt the hangar rocket. */
let designPlaceUntil = 0;

designMode = createDesignModeController({
  rootEl: ui.designRoot || document.createElement('div'),
  onDesignChange(design) {
    // Rebuild ONLY in the hangar studio — pad stack stays untouched until Apply
    if (!designMode?.isActive?.()) return;
    // Place path already rebuilt with install motion cue — don't clobber it
    if (performance.now() < designPlaceUntil) return;
    clearTimeout(designPreviewTimer);
    designPreviewTimer = setTimeout(() => {
      if (performance.now() < designPlaceUntil) return;
      designStudio.setDesign(design, { frame: false });
      // Keep 3D highlight in sync after rebuild
      const sel = designMode.getSelected?.();
      if (sel) designStudio.setSelectedPart(sel, { focus: false });
      const inst = designMode.getInstallState?.();
      if (inst) designStudio.setInstallPreview?.(inst);
    }, 120);
  },
  onSelectionChange(selection) {
    if (!designMode?.isActive?.()) return;
    // Focus camera on the part so edits are easy to verify in 3D
    designStudio.setSelectedPart(selection, { focus: true, highlight: true });
  },
  onInstallPreview(preview) {
    if (!designMode?.isActive?.()) return;
    designStudio.setInstallPreview?.(preview);
    if (preview?.rotation != null) {
      designSyncedRot = preview.rotation;
      designStudio.setInstallRotation?.(preview.rotation);
    }
    if (!preview?.defId) designSyncedRot = null;
  },
  onViewStyleChange(style) {
    if (!designMode?.isActive?.()) return;
    designStudio.setViewStyle?.(style);
  },
  onBalanceGizmoChange(show) {
    if (!designMode?.isActive?.()) return;
    designStudio.setShowBalanceGizmos?.(!!show);
  },
  onParamFeedback(selection) {
    if (!designMode?.isActive?.()) return;
    designStudio.pulseSelectionFeedback(selection);
  },
  onPlaceFeedback(info) {
    if (!designMode?.isActive?.()) return;
    // Rebuild immediately so the new part exists, then play place motion cue
    clearTimeout(designPreviewTimer);
    designPlaceUntil = performance.now() + 500;
    const design = designMode.getDesign?.();
    if (design) {
      designStudio.setDesign(design, {
        frame: false,
        placeSelection: {
          type: info?.type,
          index: info?.index ?? 0,
          partId: info?.partId || info?.primaryId || null,
        },
        placeCategory: info?.category || null,
      });
    }
    const inst = designMode.getInstallState?.();
    if (inst) designStudio.setInstallPreview?.(inst);
    designStudio.playPlaceFeedback?.(info);
  },
  onApplyToPad(design) {
    activeDesign = cloneDesign(design);
    applyDesignToPad(activeDesign);
    designMode.exit();
    const perf = calculateRocketPerformance(design);
    if (ui.perfWarn) {
      if (perf.warnings.length) {
        ui.perfWarn.hidden = false;
        ui.perfWarn.textContent = '⚠ ' + perf.warnings[0];
      } else {
        ui.perfWarn.hidden = true;
      }
    }
  },
  onExit() {
    leaveDesignBay();
    // Return to pad framing (do not force-rebuild unless applied)
    applyViewMode('stack');
  },
  onToast(msg, kind) {
    const el = ui.designToast;
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.dataset.kind = kind || 'ok';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  },
});

// Patch enter so UI + hangar scene switch together
const _designEnter = designMode.enter.bind(designMode);
designMode.enter = async (initialDesign) => {
  await _designEnter(initialDesign);
  // Studio uses the design the controller settled on (IDB or pad)
  enterDesignBay(designMode.getDesign());
};

ui.btnDesign?.addEventListener('click', () => {
  if (pilotMode) exitPilotMode();
  if (launch.state.running) {
    launch.stop();
    setMissionUiIdle();
  }
  designMode.enter(activeDesign);
});

/**
 * Restore autosaved design from IndexedDB after cold boot so refresh keeps work.
 * Runs once after pad/UI wiring exists (applyDesignToPad needs launch + ui).
 */
(async function restoreDesignFromIndexedDB() {
  try {
    const boot = await resolveBootDesign();
    // Only replace pad if IDB had a real save (not just freshly-created default)
    const saved = await loadDesignLocal();
    if (!saved) return;
    activeDesign = normalizeDesign(boot);
    applyDesignToPad(activeDesign);
  } catch (err) {
    console.warn('[design] IndexedDB restore skipped:', err);
  }
})();

const specsDefault = [
  ['总高', '≈ 124 m'],
  ['直径', '9 m'],
  ['星舰', '52 m · 6 台猛禽'],
  ['助推器', '72 m · 33 台猛禽'],
  ['推进剂', '甲烷 + 液氧'],
];

const tlPhases = launch.phases.filter((p) => p.id !== 'idle' && p.id !== 'done');
const tlEls = {};
for (const p of tlPhases) {
  const el = document.createElement('span');
  el.className = 'tl-step';
  el.textContent = p.label.split(' ')[0];
  el.title = p.label;
  ui.tlTrack.appendChild(el);
  tlEls[p.id] = el;
}

function updateSpecs() {
  // Prefer live assembly performance when available
  if (stack?.userData?.performance || stack?.userData?.isRocketAssembly) {
    updateSpecsFromAssembly();
    return;
  }
  ui.specsList.innerHTML = specsDefault
    .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
    .join('');
}

/** Always full-stack pad framing (display mode select removed). */
function applyViewMode(_mode = 'stack') {
  if (launch.state.running) {
    launch.stop();
    setMissionUiIdle();
  } else if (launch.getFlight().separated || launch.getFlight().visualAltitude > 0) {
    launch.reset();
  }
  // Pad-local restore: stack rides siteMeters (true Earth ratio)
  freeLookBody = null;
  padFrameLock = true;
  stack.visible = true;
  contact.visible = true;

  stack.userData.setViewMode?.('stack');
  updateSpecs();
  setPadCameraMeters(95, OLM_DECK_HEIGHT + 55, 130, 0, OLM_DECK_HEIGHT + 60, 0);
  controls.minDistance = 2 * METERS_TO_VISUAL;
  controls.maxDistance = EARTH_RADIUS * 25;
  camera.fov = 45;
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.0002, 2 * METERS_TO_VISUAL);
  camera.updateProjectionMatrix();
  controls.update();
  viewAltFloor = 0;
  space.resetStarReveal?.();
  space.updateByAltitude(0);
  // Re-enable pad shadows after one-way climb disable
  if (space.shadowLight) space.shadowLight.castShadow = true;
  pad.reload?.(siteMeters);
  pad.setVisibleByAltitude(0);
}

function setMissionUiIdle() {
  ui.missionBadge.classList.remove('live');
  ui.statusDot.classList.remove('live');
  ui.phaseLabel.textContent = '待机';
  ui.flightMeta.textContent = '高度 — · 速度 —';
  ui.missionProgress.style.width = '0%';
  ui.missionPct.textContent = '0%';
  ui.btnLaunch.disabled = false;
  space.resetStarReveal?.();
  if (space.shadowLight) space.shadowLight.castShadow = true;
  for (const el of Object.values(tlEls)) {
    el.classList.remove('active', 'done');
  }
  controls.autoRotate = ui.autoRotate.checked;
  space.setOrbitTimeScale?.(1);
  // Orbit rings only for 全日系 camera — stay hidden after leaving pilot
  space.setOrbitPathsVisible?.(false);
  exhaust.reset();
  stack.userData.setEngineGlow?.(false);
  viewAltFloor = 0;
  space.updateByAltitude(0);
  // Abort / idle always brings the launch site back
  pad.reload?.(siteMeters);
  pad.setVisibleByAltitude(0);
  contact.visible = true;
  post.setHeatDistortion(0, 0);
  exitVacuumStable();
  sfx.syncMission({ phase: 'idle', altitude: 0, boosterThrust: 0, shipThrust: 0 });
}

function formatAlt(m) {
  if (m < 1000) return `${m.toFixed(0)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(2)} km`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatVel(v) {
  if (v < 1000) return `${v.toFixed(0)} m/s`;
  return `${(v / 1000).toFixed(2)} km/s`;
}

let lastMissionInfo = {
  phase: 'idle',
  phaseTime: 0,
  altitude: 0,
  running: false,
  inSpace: false,
};
/**
 * Sticky vacuum look after Karman / LEO. Survives mission "done" (running=false)
 * so glow / altitude handoff stop thrashing against the black sky.
 * Cleared only on abort / pad reset / new launch.
 */
let vacuumStable = false;

function enterVacuumStable() {
  if (vacuumStable) return;
  vacuumStable = true;
  // Freeze engine/plume emissives — idle sin flicker against black sky reads as flashes
  stack.userData.setEngineGlow?.(false);
  post.setHeatDistortion(0, 0);
  space.setStarVisibility?.(1);
  if (scene.fog) scene.fog.density = 0;
  renderer.toneMappingExposure = 1.04;
}

function exitVacuumStable() {
  vacuumStable = false;
}

launch.onUpdate((info) => {
  lastMissionInfo = info;
  ui.phaseLabel.textContent = info.label;
  const spaceTag = info.inSpace ? ' · 太空' : '';
  ui.flightMeta.textContent = `高度 ${formatAlt(info.altitude)} · 速度 ${formatVel(info.velocity)}${spaceTag}`;
  const pct = Math.round(info.progress * 100);
  ui.missionProgress.style.width = `${pct}%`;
  ui.missionPct.textContent = `${pct}%`;

  const curIdx = launch.phases.findIndex((x) => x.id === info.phase);
  for (const p of tlPhases) {
    const el = tlEls[p.id];
    if (!el) continue;
    el.classList.remove('active', 'done');
    const thisIdx = launch.phases.findIndex((x) => x.id === p.id);
    if (info.phase === 'done' || thisIdx < curIdx) el.classList.add('done');
    else if (p.id === info.phase) el.classList.add('active');
  }

  if (info.inSpace || info.altitude >= 100_000) {
    enterVacuumStable();
  }

  if (!info.running && info.phase === 'done') {
    ui.missionBadge.classList.remove('live');
    ui.statusDot.classList.remove('live');
    ui.btnLaunch.disabled = false;
    // Leave vehicle in space — free explore; drop the entire launch site
    ui.phaseLabel.textContent = '近地轨道 · 自由视角';
    space.setOrbitTimeScale?.(1);
    pad.unload?.();
    post.setHeatDistortion(0, 0);
    enterVacuumStable();
  }
});

ui.showTiles.addEventListener('change', () => {
  stack.userData.setTilesVisible(ui.showTiles.checked);
});
ui.autoRotate.addEventListener('change', () => {
  if (!launch.state.running) controls.autoRotate = ui.autoRotate.checked;
});
ui.followCam.addEventListener('change', () => {
  launch.setFollowCam(ui.followCam.checked);
  if (ui.followCam.checked) launch.clearUserOverride();
});
ui.timeScale.addEventListener('change', () => {
  launch.setSpeed(parseFloat(ui.timeScale.value) || 1);
  sfx.playUIClick();
});

ui.soundEnabled?.addEventListener('change', () => {
  sfx.resume();
  sfx.setEnabled(ui.soundEnabled.checked);
  sfx.playUIClick();
});

ui.soundVolume?.addEventListener('input', () => {
  const v = (parseInt(ui.soundVolume.value, 10) || 0) / 100;
  sfx.setVolume(v);
});

ui.btnLaunch.addEventListener('click', async () => {
  ui.btnLaunch.disabled = true;
  await sfx.resume();
  await sfx.loadAll();
  sfx.onLaunchStart();
  stack.userData.setViewMode?.('stack');
  updateSpecs();
  viewAltFloor = 0; // natural altitude drives pad↔Earth cross-fade
  stack.visible = true;
  // Ensure pad set is back if a previous flight unloaded it in LEO
  exitVacuumStable();
  space.resetStarReveal?.();
  if (space.shadowLight) space.shadowLight.castShadow = true;
  pad.reload?.(siteMeters);
  pad.setVisibleByAltitude(0);
  // Idle raptor glow removed — launch sequence drives thrust glow only
  stack.userData.setEngineGlow?.(false);
  // Orbit rings only when user picks 全日系 — not during launch ascent
  space.setOrbitPathsVisible?.(false);
  // Solar-system periods are intentionally compressed for exploration; freeze
  // them during the launch so Earth, lighting and residual plume share one frame.
  space.setOrbitTimeScale?.(0);

  // Surface performance warnings (underpowered still allowed to ignite)
  const perf =
    stack.userData.performance || calculateRocketPerformance(activeDesign);
  if (ui.perfWarn) {
    if (perf.warnings?.length) {
      ui.perfWarn.hidden = false;
      ui.perfWarn.textContent = '⚠ ' + perf.warnings.join(' · ');
    } else {
      ui.perfWarn.hidden = true;
    }
  }

  launch.start();
  ui.missionBadge.classList.add('live');
  ui.statusDot.classList.add('live');
  ui.autoRotate.checked = false;
  controls.autoRotate = false;
  ui.followCam.checked = true;
  launch.setFollowCam(true);
});

ui.btnAbort.addEventListener('click', () => {
  if (pilotMode) exitPilotMode();
  sfx.onAbort();
  launch.stop();
  setMissionUiIdle();
  applyViewMode('stack');
});

// ---------------------------------------------------------------------------
// Pilot mode — free-fly scout (starts next to the Starship stack)
// ---------------------------------------------------------------------------
function enterPilotMode() {
  if (pilotMode) return;
  if (launch.state.running) {
    launch.stop();
    setMissionUiIdle();
  }

  pilotMode = true;
  // Freeze heliocentric motion while flying. Otherwise Earth drifts ~8 km/s in
  // display units and the chase camera can never stay with the scout.
  space.setOrbitTimeScale?.(0);
  freeLookBody = null;
  padFrameLock = true;
  asteroids.setVisible(true);
  asteroids.setStreamEnabled?.(true);
  document.body.classList.add('pilot-mode');
  ui.btnPilot?.classList.add('active');
  ui.btnPilot && (ui.btnPilot.textContent = '退出驾驶');
  ui.btnLaunch && (ui.btnLaunch.disabled = true);
  ui.autoRotate.checked = false;
  controls.autoRotate = false;
  ui.followCam.checked = false;
  launch.setFollowCam(false);
  viewAltFloor = 0;

  // Keep rocket visible as a reference; pad fades at orbital height
  stack.visible = true;
  contact.visible = false;

  // Surface frame origin is the pad (Earth center + local up * R).
  // Solar-system orbits live on the heliocentric XZ plane (world y ≈ earth.y).
  // Local y = -EARTH_RADIUS puts the scout on that same orbital plane.
  const orbitPlaneLocalY = -EARTH_RADIUS;
  // Outside the globe so we are not inside the Earth mesh (equatorial clearance)
  const clearR = EARTH_RADIUS * 1.22;
  const spawn = new THREE.Vector3(clearR * 0.85, orbitPlaneLocalY, clearR * 0.55);
  // Nose along +X of the orbital plane (forward into open space / belt)
  const look = new THREE.Vector3(1, 0, 0.15).normalize();
  flight.enable(spawn, look);
  playerShip.getWorldPosition(_shipWorld);
  asteroids.seedAtWorld?.(_shipWorld);

  // Orbital plane = deep-space look (Earth globe + stars + belt)
  const pilotAlt = 4500;
  viewAltFloor = CINEMATIC_HANDOFF_START;
  space.updateByAltitude(pilotAlt);
  pad.setVisibleByAltitude(pilotAlt);
  renderer.toneMappingExposure = 1.12;
  if (scene.fog) scene.fog.density = 0;

  if (ui.pilotHud) ui.pilotHud.hidden = false;
  if (ui.hintDefault) ui.hintDefault.hidden = true;
  if (ui.hintPilot) ui.hintPilot.hidden = false;

  ui.missionBadge.classList.add('live');
  ui.statusDot.classList.add('live');
  ui.phaseLabel.textContent = '驾驶模式';
  ui.flightMeta.textContent = '轨道面飞行 · W/A/D · Shift/C';
  sfx.playUIClick?.();
  sfx.enterPilot?.();
  document.body.classList.remove('pilot-hyper', 'pilot-warp');
  document.body.style.setProperty('--speed-glow', '0');

  // Drop focus from the button so WASD/Space are not eaten by UI
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  canvas?.focus?.({ preventScroll: true });
}

/**
 * Frame the free camera on the rocket (full stack, or ship if separated).
 * Used when leaving pilot mode so the player returns to the vehicle, not a
 * fixed cold-start pad angle.
 */
function focusCameraOnRocket() {
  freeLookBody = null;
  padFrameLock = true;
  stack.visible = true;
  contact.visible = true;

  const flightState = launch.getFlight();
  const target = new THREE.Vector3();
  let bodyH = stack.userData.getFocusHeight?.() ?? 60;

  if (flightState.separated && stack.userData.ship?.visible) {
    stack.userData.ship.getWorldPosition(target);
    bodyH = (stack.userData.ship.userData.height || 50) * 0.45;
    target.y += bodyH;
  } else {
    stack.getWorldPosition(target);
    target.y += bodyH;
  }

  controls.target.copy(target);
  // Hero angle in real metres, converted to world via site scale
  const m = METERS_TO_VISUAL;
  camera.position.set(target.x + 95 * m, target.y + 35 * m, target.z + 130 * m);
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.0002, 2 * m);
  camera.updateProjectionMatrix();
  controls.minDistance = 2 * m;
  controls.maxDistance = EARTH_RADIUS * 25;
  controls.update();

  const alt = Math.max(0, flightState.visualAltitude || 0);
  viewAltFloor = 0;
  space.updateByAltitude(alt);
  // Only show the pad again if we are still near the surface
  const realAlt = flightState.altitude ?? 0;
  if (realAlt < 80_000 && alt < CINEMATIC_PAD_OUT_END * 0.5) {
    pad.reload?.(siteMeters);
    pad.setVisibleByAltitude(alt);
  } else {
    pad.unload?.();
  }
  if (alt < 30) contact.visible = true;
  else contact.visible = false;
}

function exitPilotMode() {
  if (!pilotMode) return;
  pilotMode = false;
  asteroids.setVisible(false);
  asteroids.setStreamEnabled?.(false);
  document.body.classList.remove('pilot-mode', 'pilot-hyper', 'pilot-warp');
  document.body.style.setProperty('--speed-glow', '0');
  sfx.exitPilot?.();
  ui.btnPilot?.classList.remove('active');
  ui.btnPilot && (ui.btnPilot.textContent = '驾驶');
  flight.disable();
  camera.fov = 45;
  camera.updateProjectionMatrix();

  stack.visible = true;
  contact.visible = true;

  if (ui.pilotHud) ui.pilotHud.hidden = true;
  if (ui.hintDefault) ui.hintDefault.hidden = false;
  if (ui.hintPilot) ui.hintPilot.hidden = true;

  // Leave the scout and return the free camera to the rocket
  controls.enabled = true;
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.0002, 2 * METERS_TO_VISUAL);
  camera.updateProjectionMatrix();
  ui.btnLaunch && (ui.btnLaunch.disabled = false);
  controls.autoRotate = ui.autoRotate.checked;
  space.setOrbitTimeScale?.(1);

  focusCameraOnRocket();

  const flightState = launch.getFlight();
  const inFlight =
    launch.state.running ||
    flightState.separated ||
    (flightState.altitude || 0) > 100;
  ui.missionBadge.classList.toggle('live', !!inFlight);
  ui.statusDot.classList.toggle('live', !!inFlight);
  ui.phaseLabel.textContent = inFlight
    ? '自由视角 · 跟随火箭'
    : '待机';
  if (!inFlight) {
    ui.flightMeta.textContent = '高度 — · 速度 —';
  }
  sfx.playUIClick?.();
}

ui.btnPilot?.addEventListener('click', () => {
  if (pilotMode) exitPilotMode();
  else enterPilotMode();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && pilotMode) {
    e.preventDefault();
    exitPilotMode();
  }
});

// Unlock audio + preload NASA samples on first gesture
const unlockAudio = async () => {
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
  await sfx.resume();
  await sfx.loadAll();
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/** Restore default pad framing (or chase the vehicle if already climbing). */
function resetViewCamera() {
  if (pilotMode) return;

  freeLookBody = null;
  padFrameLock = true;
  viewAltFloor = 0;
  stack.visible = true;
  contact.visible = true;
  space.setOrbitPathsVisible?.(false);
  space.setOverviewMarkersVisible?.(false);
  space.setSaturnRingsVisible?.(true);
  if (!pilotMode) asteroids.setVisible(false);

  const m = METERS_TO_VISUAL;
  controls.minDistance = 2 * m;
  controls.maxDistance = EARTH_RADIUS * 25;
  camera.near = Math.max(0.0002, 2 * m);
  camera.fov = 45;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();

  const flight = launch.getFlight();
  const h = stack.userData.getFocusHeight?.() ?? OLM_DECK_HEIGHT + 60;

  if (flight.visualAltitude > 80 && (launch.state.running || flight.separated)) {
    // In flight: reframe on the vehicle mid-stack
    const p = new THREE.Vector3();
    if (stack.userData.ship) {
      stack.userData.ship.getWorldPosition(p);
    } else {
      stack.getWorldPosition(p);
    }
    controls.target.set(p.x, p.y + 30 * m, p.z);
    camera.position.set(p.x + 80 * m, p.y + 35 * m, p.z + 100 * m);
    ui.followCam.checked = true;
    launch.setFollowCam(true);
    launch.clearUserOverride?.();
  } else {
    setPadCameraMeters(
      95,
      Math.max(h, OLM_DECK_HEIGHT + 40),
      130,
      0,
      h,
      0
    );
    // Pad hold: keep follow available for next launch
    ui.followCam.checked = true;
    launch.setFollowCam(true);
    launch.clearUserOverride?.();
  }

  space.updateByAltitude(0);
  pad.reload?.(siteMeters);
  pad.setVisibleByAltitude(0);
  controls.update();
  sfx.playUIClick?.();
}

document.getElementById('btnResetView')?.addEventListener('click', () => {
  resetViewCamera();
});

/**
 * Jump free-look camera to a planet / sun / full-system overview.
 * (Restored after CAMERA MATRIX simplification — Chinese labels only.)
 */
function focusCelestial(cam) {
  if (pilotMode) return;

  launch.setFollowCam(false);
  ui.followCam.checked = false;
  controls.autoRotate = false;
  ui.autoRotate.checked = false;
  camera.fov = 45;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();

  const trackingBodies = new Set([
    'moon',
    'mars',
    'jupiter',
    'saturn',
    'venus',
    'mercury',
    'earth',
  ]);

  if (cam === 'system') {
    freeLookBody = null;
    padFrameLock = false;
    stack.visible = false;
    contact.visible = false;
    space.setOrbitPathsVisible?.(true);
    space.setSaturnRingsVisible?.(true);
    space.setOverviewMarkersVisible?.(true);
    asteroids.setVisible(true);

    viewAltFloor = CINEMATIC_LEO_VISUAL;
    const sunPos = space.getPlanetWorldPos?.('sun') || new THREE.Vector3(0, 0, 0);
    const outer =
      space.outerOrbitRadius || SOLAR_SCALE.outerOrbitRadius || EARTH_RADIUS * 55;
    const sunR = space.planets?.sun?.userData?.radius || SOLAR_SCALE.sunRadius;
    const needFar = outer * SYSTEM_FAR_ORBIT_MULTIPLIER;
    if (camera.far < needFar) {
      camera.far = needFar;
      camera.updateProjectionMatrix();
    }
    controls.target.copy(sunPos);
    camera.position.set(
      sunPos.x + outer * 0.25,
      sunPos.y + outer * 2.15,
      sunPos.z + outer * 1.05
    );
    controls.minDistance = Math.max(sunR * 4.0, outer * 0.08);
    controls.maxDistance = outer * 8.0;
    space.updateByAltitude(viewAltFloor);
    pad.setVisibleByAltitude(viewAltFloor);
    controls.update();
    sfx.playUIClick?.();
    return;
  }

  // Single body (earth / moon / planets / sun)
  space.setOrbitPathsVisible?.(false);
  space.setOverviewMarkersVisible?.(false);
  space.setSaturnRingsVisible?.(true);
  if (!pilotMode) asteroids.setVisible(false);
  stack.visible = true;
  contact.visible = cam === 'earth';

  if (cam === 'earth') {
    freeLookBody = 'earth';
    padFrameLock = false;
    viewAltFloor = CINEMATIC_LEO_VISUAL;
    const earthC =
      space.getEarthCenter?.() ||
      surfaceFrame.position.clone().setY(surfaceFrame.position.y - EARTH_RADIUS);
    const focus = earthC.clone().add(new THREE.Vector3(0, EARTH_RADIUS * 0.15, 0));
    controls.target.copy(focus);
    camera.position.set(
      focus.x + EARTH_RADIUS * 0.35,
      focus.y + EARTH_RADIUS * 0.25,
      focus.z + EARTH_RADIUS * 0.55
    );
    controls.minDistance = EARTH_RADIUS * 1.15;
    controls.maxDistance = EARTH_RADIUS * 40;
  } else {
    padFrameLock = false;
    viewAltFloor = CINEMATIC_LEO_VISUAL;
    const pos = space.getPlanetWorldPos?.(cam);
    if (!pos) return;
    const r = space.planets?.[cam]?.userData?.radius || EARTH_RADIUS * 0.4;
    controls.minDistance = r * 1.15;
    controls.target.copy(pos);
    if (cam === 'sun') {
      freeLookBody = null;
      camera.position.set(pos.x + r * 4.8, pos.y + r * 0.55, pos.z + r * 4.0);
    } else {
      freeLookBody = trackingBodies.has(cam) ? cam : null;
      camera.position.set(pos.x + r * 3.4, pos.y + r * 0.9, pos.z + r * 2.9);
    }
    controls.maxDistance = EARTH_RADIUS * 400;
  }

  space.updateByAltitude(viewAltFloor);
  pad.setVisibleByAltitude(viewAltFloor);
  controls.update();
  sfx.playUIClick?.();
}

document.querySelectorAll('[data-cam]').forEach((btn) => {
  btn.addEventListener('click', () => {
    focusCelestial(btn.dataset.cam);
  });
});

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
  exhaust.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  designStudio.resize(w, h);
});

// ---------------------------------------------------------------------------
// Animate
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;
let fpsTime = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ----- Design hangar: fully separate scene (no pad / launch sim) -----
  if (designStudio.isActive()) {
    designStudio.update(dt);
    designStudio.render();
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      ui.fps.textContent = `${Math.round(frames / fpsTime)} FPS`;
      frames = 0;
      fpsTime = 0;
    }
    return;
  }

  // Advance orbits / Earth frame FIRST, then fly the scout in a stable frame.
  // (Previously flight ran before surfaceFrame moved, so the camera lagged the
  // orbital slip by a full frame — ship looked tiny and "uncontrollable".)
  space.update?.(dt, camera);
  const surfDelta = syncSurfaceFrame();
  applySurfaceCameraDelta(surfDelta);

  // Pilot flight takes priority over launch sequence
  const pilotState = flight.update(dt);
  // Flight updates the camera after the orbital/scene tick above. Re-anchor
  // the camera-locked star shell in the same frame so moving in pilot mode
  // cannot make the background stars shimmer from a one-frame position lag.
  space.syncCamera?.(camera);
  if (asteroids.group.visible) {
    // Dense wrap-around stream follows the ship anywhere in the system
    if (pilotMode) {
      playerShip.getWorldPosition(_shipWorld);
      asteroids.update(dt, _shipWorld);
    } else {
      asteroids.update(dt, null);
    }
  }

  const missionFlight = pilotMode ? null : launch.update(dt);
  // Launch chase moves the camera after space.update — re-anchor sky shells so
  // dust/star layers never lag one frame (reads as black flicker in vacuum).
  if (!pilotMode && launch.state.running && launch.state.followCam) {
    space.syncCamera?.(camera);
  }
  // Immersive NASA-sample audio driven by flight / pilot state
  const shipPos = stack.userData.ship?.position;
  if (pilotMode) {
    sfx.syncPilot?.({
      active: true,
      thrust: pilotState?.thrust ?? 0,
      mode: pilotState?.mode ?? 'cruise',
      modeBlend: pilotState?.modeBlend ?? 0,
      speed: pilotState?.speed ?? 0,
      maxSpeed: pilotState?.maxSpeed ?? 900,
    });
  } else {
    sfx.syncMission({
      ...lastMissionInfo,
      altitude: missionFlight?.altitude ?? lastMissionInfo.altitude ?? 0,
      boosterThrust: missionFlight?.boosterThrust ?? 0,
      shipThrust: missionFlight?.shipThrust ?? 0,
      running: launch.state.running,
      panX: shipPos?.x ?? stack.position.x ?? 0,
      inSpace: missionFlight?.inSpace ?? lastMissionInfo.inSpace,
    });
  }

  // Mission altitude is real metres AGL; siteMeters scales meshes to Earth ratio.
  let sceneAltitude =
    missionFlight?.visualAltitude ?? launch.getFlight().visualAltitude ?? 0;
  if (pilotMode) {
    // Distance above Earth surface (world space; ship is under surfaceFrame)
    if (space.getEarthCenterInto) {
      space.getEarthCenterInto(_earthCenter);
    } else {
      _earthCenter.copy(surfaceFrame.position);
      _earthCenter.y -= EARTH_RADIUS;
    }
    playerShip.getWorldPosition(_shipWorld);
    sceneAltitude = Math.max(0, _shipWorld.distanceTo(_earthCenter) - EARTH_RADIUS);
  }

  // Free-look orbital presets or manual pull-back raise the visibility floor
  // so the globe & space show smoothly when pulling the camera far away
  const camDist = camera.position.distanceTo(controls.target);
  // Telemetry is already real metres during mission.
  const telemetryAltitude = pilotMode
    ? Math.max(0, (sceneAltitude / EARTH_RADIUS) * REAL_EARTH_RADIUS_M)
    : launch.getFlight().altitude ?? 0;

  // Sticky vacuum once past ~100 km (also set from mission callbacks).
  if (
    !vacuumStable &&
    (missionFlight?.inSpace ||
      lastMissionInfo?.inSpace ||
      telemetryAltitude >= 100_000 ||
      (pilotMode && sceneAltitude > EARTH_RADIUS * 0.02))
  ) {
    enterVacuumStable();
  }
  const missionInSpace = vacuumStable || !!(missionFlight?.inSpace || lastMissionInfo?.inSpace);

  // Keep free-look camera from going *inside* the solid Earth globe (backfaces
  // culled → pure black slab). Pad cameras sit at ~R + few metres — that is
  // OUTSIDE the mesh; only push when clearly sub-surface.
  // Never run this on the pad / low ascent or it flings the cam into space.
  if (
    !pilotMode &&
    (vacuumStable || missionInSpace || telemetryAltitude > 80_000)
  ) {
    if (space.getEarthCenterInto) {
      space.getEarthCenterInto(_earthCenter);
    } else {
      _earthCenter.copy(surfaceFrame.position);
      _earthCenter.y -= EARTH_RADIUS;
    }
    const camEarthDist = camera.position.distanceTo(_earthCenter);
    // Inside crust only (pad is at ≈ R + ε, not inside)
    if (camEarthDist > 1e-6 && camEarthDist < EARTH_RADIUS * 0.998) {
      _freeLookDelta
        .copy(camera.position)
        .sub(_earthCenter)
        .normalize();
      if (_freeLookDelta.lengthSq() < 1e-10) _freeLookDelta.set(0, 1, 0);
      camera.position
        .copy(_earthCenter)
        .addScaledVector(_freeLookDelta, EARTH_RADIUS * 1.01);
      const tgtDist = controls.target.distanceTo(_earthCenter);
      if (tgtDist < EARTH_RADIUS * 0.998) {
        controls.target
          .copy(_earthCenter)
          .addScaledVector(_freeLookDelta, EARTH_RADIUS * 1.02);
      }
    }
  }

  // Near plane: freeze during launch chase + vacuum — projection matrix
  // updates mid-ascent reproject the whole frame and flash black voids.
  // Free-look on pad may still adapt slowly when not flying.
  if (!pilotMode && !vacuumStable && !launch.state.running) {
    const farSafe = camera.far * 0.0005;
    const nearFloor = Math.max(0.00012, 0.5 * METERS_TO_VISUAL);
    const nearCap = Math.max(0.05, farSafe);
    const targetNear = Math.min(
      Math.max(nearFloor, camDist * 0.01),
      nearCap
    );
    const blendedNear = THREE.MathUtils.lerp(camera.near, targetNear, 0.2);
    // Large threshold — only update on real zoom changes, not micro jitter
    if (Math.abs(blendedNear - camera.near) / Math.max(camera.near, 1e-6) > 0.12) {
      camera.near = blendedNear;
      camera.updateProjectionMatrix();
    }
  }
  // Handoff altitude is real metres AGL (siteMeters).
  // CRITICAL: never drive pad↔Earth↔star handoff from free-look camDist during
  // launch / vacuum — chase-cam distance oscillates and reverse-fades the sky,
  // which reads as full-screen black flashes.
  const camDistM = camDist / METERS_TO_VISUAL;
  const camAltBoost =
    !launch.state.running && !vacuumStable && !missionInSpace && !pilotMode
      ? Math.max(0, camDistM - 250) * 0.75
      : 0;
  const visualAlt = Math.max(sceneAltitude, viewAltFloor, camAltBoost);
  // In pilot / LEO vacuum use ship altitude only for space look (stable).
  const spaceVisualAlt = pilotMode
    ? sceneAltitude
    : vacuumStable || missionInSpace || launch.state.running
      ? Math.max(telemetryAltitude, sceneAltitude, vacuumStable ? CINEMATIC_LEO_VISUAL * 0.9 : 0)
      : visualAlt;
  const atmosphereAltitude = pilotMode
    ? telemetryAltitude
    : vacuumStable || missionInSpace
      ? Math.max(telemetryAltitude, 120_000)
      : launch.state.running
        ? Math.max(telemetryAltitude, sceneAltitude)
        : Math.max(telemetryAltitude, visualAlt);

  const spaceLook = space.updateByAltitude(spaceVisualAlt, atmosphereAltitude);
  // Pilot / LEO: keep star layer fully revealed (no per-frame intensity steps).
  if (pilotMode || vacuumStable || missionInSpace) space.setStarVisibility?.(1);

  // Keep free-look locked on orbiting bodies (moon / planets / earth)
  if (freeLookBody && !pilotMode) {
    const pos = space.getPlanetWorldPos?.(freeLookBody);
    if (pos) {
      _freeLookDelta.copy(pos).sub(controls.target);
      controls.target.copy(pos);
      if (_freeLookDelta.lengthSq() > 0) {
        camera.position.add(_freeLookDelta);
      }
    }
  }

  // Once past the atmosphere handoff, fully unload the Starbase set so it is
  // not drawn or updated in LEO / free-look (reload on abort / next launch).
  const wantPad =
    !pilotMode &&
    !vacuumStable &&
    !missionInSpace &&
    visualAlt < CINEMATIC_PAD_OUT_END * 0.98 &&
    (telemetryAltitude < 95_000 || !launch.state.running);
  if (!wantPad && pad.isLoaded?.()) {
    pad.unload?.();
    if (padLights?.fill) padLights.fill.intensity = 0;
    if (padLights?.rim) padLights.rim.intensity = 0;
  } else if (wantPad) {
    if (!pad.isLoaded?.()) pad.reload?.(siteMeters);
    pad.setVisibleByAltitude(visualAlt, atmosphereAltitude);
    // Infinite sky: keep the shell centered on the camera (no near-dome parallax)
    pad.syncSkyToCamera?.(camera);
    // Volumetric cloud drift (Sky Pro-style pad sky)
    pad.updateSky?.(t);
    // Kill pad fill/rim lights as the site dissolves
    const padFill =
      1 -
      THREE.MathUtils.smoothstep(
        visualAlt,
        CINEMATIC_HANDOFF_START,
        CINEMATIC_PAD_OUT_END
      );
    if (padLights?.fill) padLights.fill.intensity = 0.12 * padFill;
    if (padLights?.rim) padLights.rim.intensity = 0.28 * padFill;
  }

  // Exposure: single owner per mode (no dual writers)
  if (vacuumStable || pilotMode || missionInSpace) {
    if (scene.fog) scene.fog.density = 0;
    renderer.toneMappingExposure = pilotMode
      ? Math.max(spaceLook?.exposure ?? 0.98, 1.12)
      : 1.04;
  } else if (launch.state.running) {
    const targetExp = spaceLook?.exposure ?? 1.05;
    renderer.toneMappingExposure += (targetExp - renderer.toneMappingExposure) * 0.06;
  } else if (spaceLook?.exposure != null && !pilotMode) {
    const targetExp = spaceLook.exposure;
    renderer.toneMappingExposure += (targetExp - renderer.toneMappingExposure) * 0.1;
  }
  if (!pilotMode) contact.visible = sceneAltitude < 30;

  // Pilot HUD — deep-space status and nearest small body.
  if (pilotMode) {
    if (scene.fog) {
      scene.fog.density = 0;
    }
    // Floor IBL in vacuum so silver hull doesn't go pure black (space sets
    // environmentIntensity → 0 for cinematic starship ascent).
    if (scene.environment) {
      scene.environmentIntensity = Math.max(scene.environmentIntensity ?? 0, 0.65);
    }
    playerShip.getWorldPosition(_shipWorld);
    const near = asteroids.nearestBody(_shipWorld);
    if (ui.pilotZone) {
      // Belt spans AU-scale distances — use a generous HUD threshold
      if (near && near.distance < EARTH_RADIUS * 8) {
        ui.pilotZone.textContent = `${near.name} · ${formatAlt(near.distance)}`;
      } else {
        // Heliocentric density cue: sparse near Earth, dense in main belt
        const g = asteroids.group?.position;
        const dens = asteroids.group?.userData?.beltDensityAt?.(
          _shipWorld.x - (g?.x ?? 0),
          _shipWorld.z - (g?.z ?? 0)
        );
        if (dens != null && dens > 0.78) {
          ui.pilotZone.textContent = '主小行星带';
        } else if (dens != null && dens > 0.5) {
          ui.pilotZone.textContent = '主带边缘';
        } else {
          ui.pilotZone.textContent = '深空 · 中等';
        }
      }
    }

    if (ui.pilotModeLabel) {
      ui.pilotModeLabel.textContent = pilotState.modeLabel || pilotState.mode || '巡航';
      ui.pilotModeLabel.dataset.mode = pilotState.mode || 'cruise';
    }
    if (ui.pilotSpeed) {
      const sp = pilotState.speed || 0;
      if (sp < 1000) ui.pilotSpeed.textContent = `${sp.toFixed(0)} m/s`;
      else if (sp < 100000) ui.pilotSpeed.textContent = `${(sp / 1000).toFixed(2)} km/s`;
      else ui.pilotSpeed.textContent = `${(sp / 1000).toFixed(0)} km/s`;
    }
    if (ui.pilotThrust) {
      const tag =
        pilotState.mode === 'warp'
          ? ' 曲速'
          : pilotState.mode === 'hyper'
            ? ' 超高速'
            : pilotState.mode === 'boost'
              ? ' 加力'
              : '';
      ui.pilotThrust.textContent = `${Math.round((pilotState.thrust || 0) * 100)}%${tag}`;
    }
    if (ui.pilotAlt) ui.pilotAlt.textContent = formatAlt(sceneAltitude);
    ui.flightMeta.textContent = `${pilotState.modeLabel || '巡航'} · ${ui.pilotSpeed?.textContent || '—'} · 高度 ${formatAlt(sceneAltitude)}`;

    document.body.classList.toggle('pilot-hyper', pilotState.mode === 'hyper');
    document.body.classList.toggle(
      'pilot-warp',
      pilotState.mode === 'warp'
    );
    // Screen-edge speed glow strength (0..1)
    const glow =
      pilotState.mode === 'warp'
        ? Math.min(1, 0.55 + (pilotState.modeBlend || 0) * 0.55)
        : pilotState.mode === 'hyper'
          ? Math.min(1, 0.4 + (pilotState.modeBlend || 0) * 0.5)
          : 0;
    document.body.style.setProperty('--speed-glow', glow.toFixed(3));
  }

  if (missionFlight) {
    // Exhaust / air heat haze only (0 in vacuum).
    // Do not fold mission "heat" into screen warp — that applied full-frame UV
    // jitter onto the rocket silhouette and read as vertical hull stripes.
    const warp = missionInSpace || vacuumStable ? 0 : missionFlight.warp || 0;
    post.setHeatDistortion(warp, t);
  } else {
    post.setHeatDistortion(0, t);
  }

  // Vacuum: kill additive plumes / streaks every frame AFTER launch may have
  // re-armed them. They sit on the chase-cam crosshair as a flashing mid patch.
  if (
    vacuumStable ||
    missionInSpace ||
    (missionFlight?.altitude ?? launch.getFlight()?.altitude ?? 0) >= 100_000
  ) {
    stack.userData.setEngineGlow?.(false);
    exhaust.setThrust?.({ booster: 0, ship: 0 });
    exhaust.setAltitude?.(200_000);
  }
  exhaust.update(dt, t);

  // Scripted chase already called controls.update(); a second pass with damping
  // nudges the orbit offset and makes the rocket look like it outruns the cam.
  if (!pilotMode && !(launch.state.running && launch.state.followCam && !launch.state.userFramed)) {
    controls.update();
  }

  // Always composer: selective sun UnrealBloom + optional heat haze
  post.render();

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = `${Math.round(frames / fpsTime)} FPS`;
    frames = 0;
    fpsTime = 0;
  }
}

// Init
stack.userData.setTilesVisible(true);
stack.userData.setEngineGlow?.(false);
updateSpecs();
space.updateByAltitude(0);
// Compile Earth / atmosphere / sky shaders before the first ascent so the
// pad→space handoff does not hitch on pipeline creation mid-flight.
space.warmGpu?.(renderer, camera);
pad.setVisibleByAltitude(0);
tick();

console.info(
  '%cStarship 3D%c · Pilot mode · Asteroids · Deep Space',
  'color:#6eb6ff;font-weight:bold',
  'color:#8b9bb8'
);
