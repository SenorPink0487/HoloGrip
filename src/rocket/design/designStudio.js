/**
 * Independent design showroom for rocket assembly.
 * Orbital-lab language: graphite hangar, hero rocket framing,
 * restrained lighting — no dense HUD scenery.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRocketFromDesign, disposeObject3D } from './generator.js';
import { cloneDesign, normalizeDesign, isDefaultStarshipVisual, asCraft } from './designModel.js';
import { getPartDef } from './partDefs.js';
import { getPart, listChildren } from './craftGraph.js';
import {
  buildSnapCandidates,
  resolveSnapFromRay,
  isSnapCommitable,
  computeSymmetryAngles,
  nodeWorldPosition,
  getHostCylinder,
  radialPadForCategory,
} from './attachSnap.js';
import { applyVabCameraButtons } from './vabControls.js';
import { createFullStack } from '../starship/fullStack.js';
import { createMaterials } from '../starship/materials.js';
import {
  createGhostMaterials,
  createSnapNodeMaterials,
} from './partMaterials.js';
import {
  estimateMassBalance,
  createBalanceGizmoGroup,
} from './massBalance.js';

/** Default rocket fill of viewport height (~72%). */
export const DEFAULT_ROCKET_VIEWPORT_FILL = 0.72;

/** Enter camera reveal duration (ms). */
export const ENTER_REVEAL_MS = 700;

/**
 * Distance so object height fills `fill` of the vertical FOV.
 * @param {number} height
 * @param {number} fovDeg
 * @param {number} [fill=0.72]
 */
export function computeRocketFrameDistance(height, fovDeg, fill = DEFAULT_ROCKET_VIEWPORT_FILL) {
  const h = Math.max(height, 1);
  const f = Math.min(0.95, Math.max(0.35, fill));
  const halfFov = (Math.max(1, fovDeg) * Math.PI) / 180 / 2;
  return h / (2 * f * Math.tan(halfFov));
}

/**
 * Whether reduced motion is preferred (browser or explicit override).
 * @param {{ matchMedia?: (q: string) => { matches: boolean } } | null} [env]
 */
export function prefersReducedMotion(env = typeof globalThis !== 'undefined' ? globalThis : null) {
  try {
    return !!env?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

/**
 * Resolve mesh/group targets on the rocket for a tree selection descriptor.
 * @param {THREE.Object3D | null} rocket
 * @param {{ type?: string, index?: number, partId?: string | null } | null} selection
 * @returns {THREE.Object3D[]}
 */
export function resolveSelectionTargets(rocket, selection) {
  if (!rocket || !selection || !selection.type) return [];
  const type = selection.type;
  const index = selection.index ?? 0;
  const partId = selection.partId || selection.primaryId || null;

  // Direct partId lookup (craft graph)
  if (partId) {
    const hits = [];
    rocket.traverse((o) => {
      if (o.userData?.partId === partId || o.userData?.wingId === partId || o.userData?.decorId === partId) {
        hits.push(o);
      }
    });
    if (hits.length) return hits;
  }

  if (type === 'root') return [rocket];

  const booster = rocket.userData?.booster || null;
  const ship = rocket.userData?.ship || null;
  const sideBoosters = rocket.userData?.sideBoosters || [];
  const stages = [booster, ship].filter(Boolean);

  if (type === 'side') {
    if (sideBoosters.length) return sideBoosters.slice();
    const found = [];
    rocket.traverse((o) => {
      if (o.name === 'SideBooster' || o.userData?.isSideBooster) found.push(o);
    });
    return found;
  }

  if (type === 'stage') {
    const st = stages[index];
    if (st) return [st];
    // Parametric assembly may not expose booster/ship; match stageId / role order
    const stageGroups = [];
    rocket.traverse((o) => {
      if (o.userData?.stageId != null || o.userData?.role) {
        if (!stageGroups.includes(o) && o.parent === rocket) stageGroups.push(o);
      }
    });
    if (stageGroups[index]) return [stageGroups[index]];
    return stages.length ? [stages[Math.min(index, stages.length - 1)]] : [rocket];
  }

  const stageRoot = stages[index] || stages[0] || rocket;

  if (type === 'nose') {
    const hits = [];
    stageRoot.traverse((o) => {
      if (o.userData?.isNose || o.name === 'Nose' || o.name === 'nose') hits.push(o);
    });
    if (hits.length) return hits;
    // Full-stack ship: prefer upper third of stage as soft target
    return [stageRoot];
  }

  if (type === 'engines') {
    const hits = [];
    stageRoot.traverse((o) => {
      if (
        o.name === 'BoosterEngines' ||
        o.name === 'ShipEngines' ||
        o.name === 'engines' ||
        o.name?.includes?.('Raptor') ||
        o.userData?.isEngineCluster
      ) {
        hits.push(o);
      }
    });
    // Prefer named engine group roots over individual raptors
    const groups = hits.filter(
      (o) => o.name === 'BoosterEngines' || o.name === 'ShipEngines' || o.name === 'engines'
    );
    if (groups.length) return groups;
    if (hits.length) return hits.slice(0, 12);
    return [stageRoot];
  }

  if (type === 'wing' && partId) {
    const hits = [];
    stageRoot.traverse((o) => {
      if (o.userData?.wingId === partId) hits.push(o);
    });
    if (hits.length) return hits;
    // Full stack: flaps / grid fins as wing stand-in
    const flaps = [];
    stageRoot.traverse((o) => {
      if (/flap|gridfin|wing/i.test(o.name || '')) flaps.push(o);
    });
    return flaps.length ? flaps : [stageRoot];
  }

  if (type === 'decor') {
    const hits = [];
    stageRoot.traverse((o) => {
      if (o.userData?.decorId === partId || o.name === 'Decor') hits.push(o);
    });
    return hits.length ? hits : [stageRoot];
  }

  return [stageRoot];
}

/**
 * Apply / restore emissive outline-style highlight on materials.
 * Clones materials per mesh so shared material instances (Full Stack)
 * are not mutated and other stages stay untinted.
 * @param {THREE.Object3D[]} targets
 * @param {{ originals: Map<string, object>, meshes: THREE.Mesh[] }} store
 * @param {{ color?: number, intensity?: number }} [opts]
 */
export function applyOutlineHighlight(targets, store, opts = {}) {
  clearOutlineHighlight(store);
  const color = opts.color ?? 0x3d9eff;
  const intensity = opts.intensity ?? 0.55;

  for (const root of targets) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      // Skip CoM / thrust learning gizmos
      if (o.userData?.skipOutline || o.userData?.isBalanceGizmo) return;
      let p = o.parent;
      while (p) {
        if (p.userData?.isBalanceGizmo || p.name === 'MassBalanceGizmo') return;
        p = p.parent;
      }
      const wasArray = Array.isArray(o.material);
      const srcMats = wasArray ? o.material : [o.material];
      const clones = srcMats.map((mat) => {
        if (!mat || !('emissive' in mat)) return mat;
        const c = mat.clone();
        if (c.emissive?.copy && mat.emissive) c.emissive.copy(mat.emissive);
        else c.emissive = new THREE.Color(mat.emissive?.getHex?.() ?? 0);
        c.emissive.setHex(color);
        c.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.08) + intensity;
        c.needsUpdate = true;
        return c;
      });
      // Key by mesh uuid — one entry per mesh for clean teardown
      store.originals.set(o.uuid, {
        mesh: o,
        material: o.material,
        clones: wasArray ? clones : clones[0],
      });
      o.material = wasArray ? clones : clones[0];
      store.meshes.push(o);
    });
  }
}

/**
 * Restore mesh materials and dispose highlight clones.
 * @param {{ originals: Map<string, object>, meshes: THREE.Mesh[] }} store
 */
export function clearOutlineHighlight(store) {
  if (!store) return;
  for (const entry of store.originals.values()) {
    const { mesh, material, clones } = entry;
    // Legacy in-place entries (mat/emissive) — keep restore path defensive
    if (entry.mat && !mesh) {
      const { mat, emissive, emissiveIntensity } = entry;
      if (mat.emissive && emissive) mat.emissive.copy(emissive);
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = emissiveIntensity;
      mat.needsUpdate = true;
      continue;
    }
    if (!mesh) continue;
    mesh.material = material;
    const list = Array.isArray(clones) ? clones : clones ? [clones] : [];
    const origList = Array.isArray(material) ? material : material ? [material] : [];
    for (const c of list) {
      if (!c || origList.includes(c)) continue;
      c.dispose?.();
    }
  }
  store.originals.clear();
  store.meshes.length = 0;
}

/**
 * Create highlight store.
 */
export function createHighlightStore() {
  return { originals: new Map(), meshes: [] };
}

/**
 * Drive emissive intensity on highlight clones for one pulse frame.
 * @param {{ originals: Map<string, object> }} store
 * @param {number} fade 1 → 0 over pulse life
 */
function setPulseCloneIntensity(store, fade) {
  for (const entry of store.originals.values()) {
    // Clone-based entries from applyOutlineHighlight
    const clones = Array.isArray(entry.clones)
      ? entry.clones
      : entry.clones
        ? [entry.clones]
        : entry.mat
          ? [entry.mat]
          : [];
    const origs = Array.isArray(entry.material)
      ? entry.material
      : entry.material
        ? [entry.material]
        : [];
    clones.forEach((c, i) => {
      if (!c || !('emissiveIntensity' in c)) return;
      const base = origs[i]?.emissiveIntensity ?? entry.emissiveIntensity ?? 0;
      c.emissiveIntensity = base + 0.85 * fade;
    });
  }
}

/**
 * One-shot emissive pulse on targets (returns cancel fn).
 * Uses per-mesh material clones from applyOutlineHighlight.
 * @param {THREE.Object3D[]} targets
 * @param {number} durationMs
 * @param {{ reducedMotion?: boolean, now?: () => number }} [opts]
 */
export function pulsePartFeedback(targets, durationMs = 280, opts = {}) {
  if (!targets?.length || opts.reducedMotion) {
    return { cancel() {}, done: true };
  }
  const store = createHighlightStore();
  applyOutlineHighlight(targets, store, { color: 0x5ec8ff, intensity: 0.85 });
  const start = (opts.now || (() => performance.now()))();
  let cancelled = false;
  let raf = 0;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    clearOutlineHighlight(store);
  }

  function tick(nowArg) {
    if (cancelled || finished) return;
    const now = typeof nowArg === 'number' ? nowArg : (opts.now || (() => performance.now()))();
    const t = now - start;
    const k = Math.min(1, t / Math.max(1, durationMs));
    const fade = 1 - k;
    setPulseCloneIntensity(store, fade);
    if (k < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      finish();
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    // First paint at full pulse
    setPulseCloneIntensity(store, 1);
    raf = requestAnimationFrame(tick);
  } else {
    finish();
    return { cancel() {}, done: true };
  }

  return {
    done: false,
    cancel() {
      cancelled = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      finish();
    },
  };
}

/**
 * Selection controller used by the design studio (exported for unit tests).
 * @param {{ getRocket: () => THREE.Object3D | null, onFocus?: (center: THREE.Vector3, targets: THREE.Object3D[]) => void, reducedMotion?: () => boolean }} deps
 */
export function createPartSelectionController(deps) {
  const highlightStore = createHighlightStore();
  /** @type {{ type?: string, index?: number, partId?: string | null } | null} */
  let currentSelection = null;
  let feedbackPulse = null;

  function getSelectionState() {
    return {
      selection: currentSelection ? { ...currentSelection } : null,
      highlightCount: highlightStore.originals.size,
      meshCount: highlightStore.meshes.length,
    };
  }

  function clearSelectionVisual() {
    if (feedbackPulse) {
      feedbackPulse.cancel?.();
      feedbackPulse = null;
    }
    clearOutlineHighlight(highlightStore);
    currentSelection = null;
  }

  /**
   * @param {{ type?: string, index?: number, partId?: string | null } | null} selection
   * @param {{ focus?: boolean, highlight?: boolean }} [opts]
   */
  function setSelectedPart(selection, opts = {}) {
    const focus = opts.focus !== false;
    const highlight = opts.highlight !== false;

    if (!selection || !selection.type) {
      clearOutlineHighlight(highlightStore);
      currentSelection = null;
      return getSelectionState();
    }

    currentSelection = {
      type: selection.type,
      index: selection.index ?? 0,
      partId: selection.partId ?? null,
    };

    clearOutlineHighlight(highlightStore);
    const rocket = deps.getRocket?.() ?? null;
    if (!rocket) return getSelectionState();

    const targets = resolveSelectionTargets(rocket, currentSelection);

    // Root selection keeps the hero rocket un-tinted; only part nodes get outline
    if (highlight && targets.length && currentSelection.type !== 'root') {
      applyOutlineHighlight(targets, highlightStore, {
        color: 0x3d9eff,
        intensity: 0.32,
      });
    }

    if (focus && targets.length) {
      const box = new THREE.Box3();
      for (const t of targets) box.expandByObject(t);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        deps.onFocus?.(center, targets);
      }
    }

    return getSelectionState();
  }

  function pulseSelectionFeedback(selection = currentSelection) {
    if (feedbackPulse) {
      feedbackPulse.cancel?.();
      feedbackPulse = null;
    }
    const rocket = deps.getRocket?.() ?? null;
    if (!rocket || !selection) return { ok: false };
    if (deps.reducedMotion?.()) return { ok: true, reduced: true };
    const targets = resolveSelectionTargets(rocket, selection);
    const saved = currentSelection ? { ...currentSelection } : selection ? { ...selection } : null;
    clearOutlineHighlight(highlightStore);
    feedbackPulse = pulsePartFeedback(targets, 280, { reducedMotion: false });
    const restore = () => {
      // Cancel any in-flight pulse (restores mesh materials) before re-applying selection policy
      const pending = feedbackPulse;
      feedbackPulse = null;
      pending?.cancel?.();
      // Re-enter selection path so root skip / clone-highlight policy stays consistent
      if (saved) setSelectedPart(saved, { focus: false, highlight: true });
    };
    if (feedbackPulse.done) restore();
    else if (typeof setTimeout === 'function') setTimeout(restore, 300);
    return { ok: true, count: targets.length };
  }

  return {
    setSelectedPart,
    pulseSelectionFeedback,
    getSelectionState,
    clearSelectionVisual,
    get highlightStore() {
      return highlightStore;
    },
  };
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {HTMLCanvasElement} canvas
 */
export function createDesignStudio(renderer, canvas) {
  const scene = new THREE.Scene();
  scene.name = 'DesignStudio';

  const bgTex = makeVerticalGradientTexture(
    ['#07090c', '#0b0e12', '#10141a', '#0a0c10'],
    [0, 0.35, 0.72, 1]
  );
  scene.background = bgTex;
  scene.fog = new THREE.Fog(0x0a0c10, 200, 560);

  const camera = new THREE.PerspectiveCamera(
    36,
    window.innerWidth / window.innerHeight,
    0.5,
    5000
  );
  camera.position.set(88, 48, 118);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.minDistance = 12;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = 0.18;
  controls.target.set(0, 42, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.18;
  controls.enabled = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 1.28;

  // Cinematic VAB bay — stronger metal response, cool/warm rim, floor bounce
  const hemi = new THREE.HemisphereLight(0xe8f0fa, 0x0a0c10, 0.38);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6ee, 2.15);
  key.position.set(95, 170, 75);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 400;
  key.shadow.camera.left = -90;
  key.shadow.camera.right = 90;
  key.shadow.camera.top = 130;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.00012;
  key.shadow.radius = 2.4;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7ab4ff, 0.58);
  fill.position.set(-110, 65, -25);
  scene.add(fill);

  const rimWarm = new THREE.DirectionalLight(0xffb080, 0.78);
  rimWarm.position.set(-35, 55, -130);
  scene.add(rimWarm);

  const rimCool = new THREE.DirectionalLight(0x88c4ff, 0.52);
  rimCool.position.set(60, 40, -100);
  scene.add(rimCool);

  // Edge silhouette light (reads stainless contour)
  const rimBack = new THREE.DirectionalLight(0xc8e0ff, 0.42);
  rimBack.position.set(0, 30, 140);
  scene.add(rimBack);

  const top = new THREE.SpotLight(0xeef4ff, 72, 420, Math.PI / 3.2, 0.72, 1.05);
  top.position.set(0, 210, 40);
  top.target.position.set(0, 45, 0);
  top.castShadow = false;
  scene.add(top, top.target);

  // Soft key spot on mid rocket
  const heroSpot = new THREE.SpotLight(0xfff0e0, 48, 280, Math.PI / 5.5, 0.55, 1.2);
  heroSpot.position.set(55, 140, 90);
  heroSpot.target.position.set(0, 50, 0);
  scene.add(heroSpot, heroSpot.target);

  const bounce = new THREE.PointLight(0xa8c8ff, 22, 140, 1.5);
  bounce.position.set(28, 12, 65);
  scene.add(bounce);

  // Floor up-light for reflection feel
  const floorBounce = new THREE.PointLight(0x88aacc, 18, 90, 1.8);
  floorBounce.position.set(0, 4, 20);
  scene.add(floorBounce);

  buildShowroom(scene);

  /** @type {THREE.Object3D | null} */
  let rocket = null;
  let active = false;
  let designSnapshot = null;
  let detailedPreview = null;
  let studioMats = null;
  /** @type {'solid' | 'cutaway' | 'xray'} — solid full craft by default (KSP VAB) */
  let viewStyle = 'solid';
  /** Optional clip plane — only used if explicitly enabled; cutaway now = ghost hull, no half-cut */
  const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  /** Half-section clip is OFF by default (looks broken); keep for debug if needed */
  let cutawayUsesClip = false;
  let rebuildSerial = 0;
  /** @type {THREE.Group | null} */
  let attachGizmoRoot = null;
  /** @type {THREE.Group | null} */
  let ghostPartRoot = null;
  /** @type {THREE.Group | null} */
  let radialGuideRoot = null;
  /** @type {THREE.Group | null} CoM ball + thrust arrow */
  let balanceGizmoRoot = null;
  /** Show CoM / thrust markers (default on for learning) */
  let showBalanceGizmos = true;
  /**
   * @type {{
   *   defId: string|null,
   *   targets: object[],
   *   symmetry: number,
   *   rotation: number,
   *   hoverParentId?: string|null,
   *   hoverNode?: string|null,
   *   snap?: object|null
   * }}
   */
  let installPreview = {
    defId: null,
    targets: [],
    symmetry: 1,
    rotation: 0,
    hoverParentId: null,
    hoverNode: null,
    snap: null,
  };
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let gizmoPulseT = 0;
  /** Last resolved placement for commit */
  let lastInstallSnap = null;
  /** Was last hover magnet-locked (for snap-in flash) */
  let wasSnapLocked = false;
  /** @type {number} brief flash scale boost after magnet lock */
  let snapFlashUntil = 0;
  /**
   * Place-success scale pop on newly installed meshes.
   * @type {{ targets: THREE.Object3D[], t0: number, dur: number, bases: Map<string, THREE.Vector3> } | null}
   */
  let placeAnim = null;
  /** @type {{ cancel?: () => void } | null} */
  let placePulse = null;

  let userInteracted = false;
  let revealRaf = 0;
  let revealActive = false;
  /** @type {{ t0: number, dur: number, from: THREE.Vector3, to: THREE.Vector3 } | null} */
  let focusAnim = null;

  const reducedMotion = () => prefersReducedMotion();

  const selectionApi = createPartSelectionController({
    getRocket: () => rocket,
    reducedMotion,
    onFocus(center) {
      if (reducedMotion()) {
        controls.target.lerp(center, 0.45);
        controls.update();
        return;
      }
      const startTarget = controls.target.clone();
      const endTarget = center.clone();
      endTarget.lerp(startTarget, 0.35);
      focusAnim = {
        t0: performance.now(),
        dur: 420,
        from: startTarget,
        to: endTarget,
      };
    },
  });

  function stopAutoRotateFromUser() {
    if (!userInteracted) {
      userInteracted = true;
      controls.autoRotate = false;
    }
  }

  const onControlsStart = () => stopAutoRotateFromUser();
  controls.addEventListener('start', onControlsStart);
  canvas.addEventListener('pointerdown', onControlsStart, { passive: true });
  canvas.addEventListener('wheel', onControlsStart, { passive: true });

  function frameRocket(opts = {}) {
    const fill = opts.fill ?? DEFAULT_ROCKET_VIEWPORT_FILL;
    if (!rocket) {
      controls.target.set(0, 42, 0);
      camera.position.set(88, 48, 118);
      controls.update();
      return;
    }
    const box = new THREE.Box3().setFromObject(rocket);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const h = Math.max(size.y, 20);
    const r = Math.max(size.x, size.z, 10) * 0.5;
    // Distance along view ray so projected height ≈ fill of FOV
    const viewDist = Math.max(
      computeRocketFrameDistance(h, camera.fov, fill),
      r * 2.8,
      40
    );
    // Three-quarter product angle — unit offset * viewDist keeps fill accurate
    const dir = new THREE.Vector3(0.62, 0.06, 0.78).normalize();
    controls.target.copy(center);
    camera.position.set(
      center.x + dir.x * viewDist,
      center.y + dir.y * viewDist + h * 0.02,
      center.z + dir.z * viewDist
    );
    camera.near = Math.max(0.2, viewDist / 200);
    camera.far = Math.max(2500, viewDist * 22);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(8, h * 0.12);
    controls.maxDistance = Math.max(220, h * 6.5);
    controls.update();
  }

  function setSelectedPart(selection, opts) {
    return selectionApi.setSelectedPart(selection, opts);
  }

  function pulseSelectionFeedback(selection) {
    return selectionApi.pulseSelectionFeedback(selection);
  }

  function getSelectionState() {
    return {
      ...selectionApi.getSelectionState(),
      autoRotate: controls.autoRotate,
      userInteracted,
      revealActive,
      reducedMotion: reducedMotion(),
    };
  }

  function clearAttachGizmos() {
    if (attachGizmoRoot) {
      scene.remove(attachGizmoRoot);
      disposeObject3D(attachGizmoRoot);
      attachGizmoRoot = null;
    }
    if (radialGuideRoot) {
      scene.remove(radialGuideRoot);
      disposeObject3D(radialGuideRoot);
      radialGuideRoot = null;
    }
    clearStackGuide();
    clearGhostPart();
    lastInstallSnap = null;
    wasSnapLocked = false;
  }

  function clearGhostPart() {
    if (ghostPartRoot) {
      scene.remove(ghostPartRoot);
      disposeObject3D(ghostPartRoot);
      ghostPartRoot = null;
    }
  }

  /**
   * Show attach-node gizmos + enable continuous radial snap while installing.
   * @param {{
   *   defId?: string|null,
   *   targets?: { parentId: string, parentNode: string, score?: number }[],
   *   symmetry?: number,
   *   rotation?: number
   * }} preview
   */
  function setInstallPreview(preview = {}) {
    const nextDef = preview.defId || null;
    const defChanged = nextDef !== installPreview.defId;
    const nextRot =
      preview.rotation != null ? preview.rotation : defChanged ? 0 : installPreview.rotation || 0;
    installPreview = {
      defId: nextDef,
      targets: preview.targets || [],
      symmetry: preview.symmetry ?? installPreview.symmetry ?? 1,
      rotation: nextRot,
      hoverParentId: defChanged || !nextDef ? null : installPreview.hoverParentId || null,
      hoverNode: defChanged || !nextDef ? null : installPreview.hoverNode || null,
      snap: defChanged || !nextDef ? null : installPreview.snap || null,
    };
    // KSP: while holding a part, LMB places — camera uses RMB orbit
    applyVabCameraButtons(controls, !!nextDef);
    controls.autoRotate = false;
    if (!nextDef) {
      clearAttachGizmos();
      return;
    }
    rebuildAttachGizmos();
    if (installPreview.snap && isSnapCommitable(installPreview.snap)) {
      placeGhostFromSnap(installPreview.snap, { valid: true });
      updateRadialGuide(installPreview.snap);
      highlightGizmoForSnap(installPreview.snap);
    }
  }

  function setInstallRotation(rad) {
    installPreview.rotation = rad || 0;
    if (lastInstallSnap && !lastInstallSnap.isStack) {
      // Re-apply rotation onto last radial snap angle base
      const base = lastInstallSnap.baseAngle != null ? lastInstallSnap.baseAngle : lastInstallSnap.angle;
      const next = {
        ...lastInstallSnap,
        angle: base + installPreview.rotation,
        baseAngle: base,
      };
      // Recompute world from host cylinder
      if (designSnapshot && rocket && next.parentId) {
        const craft = asCraft(designSnapshot);
        const cyl = getHostCylinder(rocket, craft, next.parentId);
        const def = getPartDef(installPreview.defId);
        const pad = radialPadForCategory(def?.category);
        if (cyl) {
          next.world = nodeWorldPosition(cyl, 'radial', next.angle, next.yFraction ?? 0.5, pad);
        }
      }
      lastInstallSnap = next;
      installPreview.snap = next;
      placeGhostFromSnap(next);
      updateRadialGuide(next);
      highlightGizmoForSnap(next);
    }
    return installPreview.rotation;
  }

  function nudgeInstallRotation(deltaRad) {
    return setInstallRotation((installPreview.rotation || 0) + (deltaRad || 0));
  }

  function makeGhostMesh(defId, { dim = false, valid = true } = {}) {
    const def = getPartDef(defId);
    const g = new THREE.Group();
    g.name = 'GhostPart';
    // Green when snapped, cyan when free-floating — PBR translucent + wire + additive shell
    const { solid, wire, glow } = createGhostMaterials({ valid, dim });
    const cat = def?.category || 'tank';
    let mesh;
    if (cat === 'engine') {
      // Bell cluster hint hanging below mount (matches bottom attach)
      mesh = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.8, 22), solid);
      mesh.rotation.x = Math.PI;
      mesh.position.y = -1.9;
      // Mount plate so the attach face is obvious
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.28, 22), solid);
      plate.position.y = 0.05;
      g.add(plate);
    } else if (cat === 'nose') {
      const h = def?.defaultParams?.height || 10;
      mesh = new THREE.Mesh(new THREE.ConeGeometry(2.4, Math.min(h, 14), 28), solid);
      mesh.position.y = Math.min(h, 14) / 2;
    } else if (cat === 'decoupler') {
      // Interstage ring — flat disc + outer torus (reads as sep ring)
      mesh = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.38, 12, 48), solid);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.35;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.2, 0.35, 40),
        solid
      );
      disc.position.y = 0.35;
      g.add(disc);
    } else if (cat === 'aero') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 5.2), solid);
      mesh.position.x = 2.1;
    } else if (cat === 'side') {
      const h = Math.min(def?.defaultParams?.height || 40, 28);
      const r = (def?.defaultParams?.diameter || 3.6) / 2;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, h * 0.55, 20), solid);
      mesh.position.y = (h * 0.55) / 2;
    } else if (cat === 'decor' || cat === 'utility') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 8, 36), solid);
      mesh.rotation.x = Math.PI / 2;
    } else {
      const h = def?.defaultParams?.height || 20;
      const r = (def?.defaultParams?.diameter || 9) / 2;
      const gh = Math.min(h * 0.42, 22);
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, gh, 28), solid);
      mesh.position.y = gh / 2;
    }
    g.add(mesh);
    const outline = mesh.clone();
    outline.material = wire;
    outline.scale.multiplyScalar(1.025);
    g.add(outline);
    // Soft additive shell for “hologram magnet” read
    const shell = mesh.clone();
    shell.material = glow;
    shell.scale.multiplyScalar(1.08);
    g.add(shell);
    // Snap magnet orb under / at attach
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(dim ? 0.35 : 0.55, 14, 12),
      new THREE.MeshBasicMaterial({
        color: valid ? 0xb8ff70 : 0x80d8ff,
        transparent: true,
        opacity: dim ? 0.35 : 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    if (cat === 'engine') orb.position.y = 0.15;
    else if (cat === 'aero') orb.position.set(0, 0, 0);
    else orb.position.y = 0.1;
    g.add(orb);
    g.userData.isGhost = true;
    g.userData.category = cat;
    g.userData.ghostValid = valid;
    g.userData.ghostDim = dim;
    return g;
  }

  /**
   * Free-float ghost on the construction plane under the cursor (not snapped).
   * This is the KSP "part stuck to mouse" feel before magnetic attach.
   */
  function freeGhostWorldFromRay(ray) {
    const planePoint = controls.target.clone();
    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    n.negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, planePoint);
    const hit = new THREE.Vector3();
    if (ray.intersectPlane(plane, hit)) return hit;
    return ray.origin.clone().addScaledVector(ray.direction, 50);
  }

  function placeGhostFree(world, { valid = false } = {}) {
    clearGhostPart();
    if (!world || !installPreview.defId) return;
    ghostPartRoot = new THREE.Group();
    ghostPartRoot.name = 'GhostPartRoot';
    ghostPartRoot.userData.isGhost = true;
    const ghost = makeGhostMesh(installPreview.defId, { dim: false, valid });
    ghost.position.copy(world);
    ghost.rotation.y = installPreview.rotation || 0;
    ghostPartRoot.add(ghost);
    // Dim symmetry previews around free position
    const def = getPartDef(installPreview.defId);
    const cat = def?.category || '';
    const sym = ['aero', 'side', 'decor', 'engine'].includes(cat)
      ? Math.max(1, installPreview.symmetry || 1)
      : 1;
    if (sym > 1) {
      for (let i = 1; i < sym; i++) {
        const ang = (installPreview.rotation || 0) + (i / sym) * Math.PI * 2;
        const g2 = makeGhostMesh(installPreview.defId, { dim: true, valid: false });
        g2.position.copy(world);
        g2.rotation.y = ang;
        ghostPartRoot.add(g2);
      }
    }
    scene.add(ghostPartRoot);
  }

  /**
   * Place primary + symmetry ghost instances from a snap result.
   */
  function placeGhostFromSnap(snap, { valid = true } = {}) {
    clearGhostPart();
    if (!snap?.world || !installPreview.defId) return;
    const def = getPartDef(installPreview.defId);
    const cat = def?.category || '';
    const useSym =
      !snap.isStack && ['aero', 'side', 'decor', 'engine'].includes(cat)
        ? Math.max(1, installPreview.symmetry || 1)
        : 1;

    ghostPartRoot = new THREE.Group();
    ghostPartRoot.name = 'GhostPartRoot';
    ghostPartRoot.userData.isGhost = true;

    const craft = designSnapshot ? asCraft(designSnapshot) : null;
    const cyl =
      craft && rocket && snap.parentId
        ? getHostCylinder(rocket, craft, snap.parentId)
        : null;
    const pad = radialPadForCategory(cat);
    const angles = snap.isStack
      ? [0]
      : computeSymmetryAngles(snap.angle || 0, useSym);

    angles.forEach((ang, i) => {
      const ghost = makeGhostMesh(installPreview.defId, { dim: i > 0, valid });
      if (snap.isStack) {
        ghost.position.copy(snap.world);
      } else if (cyl) {
        const wp = nodeWorldPosition(cyl, 'radial', ang, snap.yFraction ?? 0.5, pad);
        ghost.position.copy(wp);
        ghost.rotation.y = ang;
      } else {
        ghost.position.copy(snap.world);
        ghost.rotation.y = ang;
      }
      ghostPartRoot.add(ghost);
    });
    scene.add(ghostPartRoot);
  }

  /** @type {THREE.Group | null} axial guide for engine bottom / decoupler top */
  let stackGuideRoot = null;

  function clearStackGuide() {
    if (stackGuideRoot) {
      scene.remove(stackGuideRoot);
      disposeObject3D(stackGuideRoot);
      stackGuideRoot = null;
    }
  }

  /**
   * Vertical magnet beam + label for stack installs (engines / decouplers).
   * Makes the attach direction obvious while the ghost follows the cursor.
   */
  function updateStackGuide(snap) {
    clearStackGuide();
    if (!snap?.isStack || !rocket || !designSnapshot || !installPreview.defId) return;
    const def = getPartDef(installPreview.defId);
    const cat = def?.category || '';
    if (cat !== 'engine' && cat !== 'decoupler' && cat !== 'nose' && cat !== 'tank') return;

    const craft = asCraft(designSnapshot);
    const cyl = getHostCylinder(rocket, craft, snap.parentId);
    if (!cyl || !snap.world) return;

    stackGuideRoot = new THREE.Group();
    stackGuideRoot.name = 'StackGuide';

    const isBottom = snap.parentNode === 'bottom' || snap.parentNode === 'mount';
    const isTop = snap.parentNode === 'top';
    const color = cat === 'engine' ? 0xffb74d : cat === 'decoupler' ? 0x4dd0e1 : 0xaed581;

    // Axis beam from host mid toward attach face
    const mid = new THREE.Vector3(cyl.cx, cyl.cy, cyl.cz);
    const beamLen = Math.max(3.5, Math.abs(snap.world.y - mid.y) + 1.2);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, beamLen, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    beam.position.set(
      snap.world.x,
      snap.world.y + (isBottom ? beamLen * 0.35 : isTop ? -beamLen * 0.35 : 0),
      snap.world.z
    );
    stackGuideRoot.add(beam);

    // Big face ring at attach plane
    const faceRing = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(2.2, cyl.radius * 0.72), 0.16, 10, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    faceRing.rotation.x = Math.PI / 2;
    faceRing.position.copy(snap.world);
    faceRing.userData.pulseBoost = 1.15;
    stackGuideRoot.add(faceRing);

    // Direction chevron
    const chev = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.4, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    if (isBottom) {
      chev.rotation.x = Math.PI;
      chev.position.set(snap.world.x, snap.world.y - 1.6, snap.world.z);
    } else {
      chev.position.set(snap.world.x, snap.world.y + 1.6, snap.world.z);
    }
    stackGuideRoot.add(chev);

    // Canvas label
    const labelText =
      cat === 'engine'
        ? '发动机 → 底部挂点'
        : cat === 'decoupler'
          ? '分离环 → 级间节点'
          : isTop
            ? '顶部挂点'
            : '底部挂点';
    const label = makeWorldLabel(labelText, color);
    label.position.set(snap.world.x, snap.world.y + (isBottom ? -3.2 : 3.2), snap.world.z);
    stackGuideRoot.add(label);

    scene.add(stackGuideRoot);
  }

  function makeWorldLabel(text, colorHex = 0xaed581) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
    ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 4;
    roundRect(ctx, 8, 12, 496, 72, 16);
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 36px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f0f7ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      })
    );
    spr.scale.set(7.2, 1.35, 1);
    return spr;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function updateRadialGuide(snap) {
    if (radialGuideRoot) {
      scene.remove(radialGuideRoot);
      disposeObject3D(radialGuideRoot);
      radialGuideRoot = null;
    }
    if (!snap || snap.isStack || !rocket || !designSnapshot) return;
    const craft = asCraft(designSnapshot);
    const cyl = getHostCylinder(rocket, craft, snap.parentId);
    if (!cyl) return;

    radialGuideRoot = new THREE.Group();
    radialGuideRoot.name = 'RadialGuide';
    const y = cyl.minY + (snap.yFraction ?? 0.5) * (cyl.maxY - cyl.minY);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(cyl.radius + 0.15, 0.07, 6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x9ccc65,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cyl.cx, y, cyl.cz);
    ring.userData.isAttachNode = true;
    radialGuideRoot.add(ring);

    // Tick marks at symmetry angles
    const def = getPartDef(installPreview.defId);
    const cat = def?.category || '';
    const sym =
      ['aero', 'side', 'decor', 'engine'].includes(cat) ? Math.max(1, installPreview.symmetry || 1) : 1;
    for (const ang of computeSymmetryAngles(snap.angle || 0, sym)) {
      const p = nodeWorldPosition(cyl, 'radial', ang, snap.yFraction ?? 0.5, 0.2);
      const tick = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xc5e1a5, transparent: true, opacity: 0.85 })
      );
      tick.position.copy(p);
      radialGuideRoot.add(tick);
    }
    scene.add(radialGuideRoot);
  }

  function highlightGizmoForSnap(snap) {
    if (!attachGizmoRoot || !snap) return;
    attachGizmoRoot.children.forEach((child) => {
      const match =
        child.userData.parentId === snap.parentId && child.userData.parentNode === snap.parentNode;
      child.userData.baseScale = match ? 1.4 : 1;
      child.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && !o.material.visible === false) {
          if (o.material.visible !== false && o.geometry?.type !== 'SphereGeometry') {
            /* keep */
          }
          if (o.material.color && o.userData?.skipColor !== true) {
            o.material.color?.setHex?.(match ? 0xc5e1a5 : 0x7cb342);
          }
        }
      });
      // Simpler: color group materials
      child.traverse((o) => {
        if (o.isMesh && o.material?.color && o.material.visible !== false) {
          if (o.material.opacity > 0.01) {
            o.material.color.setHex(match ? 0xdcedc8 : 0x7cb342);
          }
        }
      });
    });
  }

  function rebuildAttachGizmos() {
    // Keep ghost if rebuilding markers only — clear markers first
    if (attachGizmoRoot) {
      scene.remove(attachGizmoRoot);
      disposeObject3D(attachGizmoRoot);
      attachGizmoRoot = null;
    }
    if (!rocket || !installPreview.defId || !installPreview.targets?.length) {
      clearGhostPart();
      if (radialGuideRoot) {
        scene.remove(radialGuideRoot);
        disposeObject3D(radialGuideRoot);
        radialGuideRoot = null;
      }
      lastInstallSnap = null;
      return;
    }
    if (!designSnapshot) return;

    const craft = asCraft(designSnapshot);
    attachGizmoRoot = new THREE.Group();
    attachGizmoRoot.name = 'AttachGizmos';

    let firstStackSnap = null;

    for (const t of installPreview.targets) {
      if (!t.parentId || !t.parentNode) continue;
      const cyl = getHostCylinder(rocket, craft, t.parentId);
      if (!cyl) continue;
      const isStack = t.parentNode === 'top' || t.parentNode === 'bottom' || t.parentNode === 'mount';
      const world = isStack
        ? nodeWorldPosition(cyl, t.parentNode)
        : nodeWorldPosition(cyl, 'radial', 0, 0.5, 1.4);
      if (!world) continue;

      const isHover =
        installPreview.hoverParentId === t.parentId && installPreview.hoverNode === t.parentNode;
      const color = isHover ? 0xc5e1a5 : 0x7cb342;

      let mesh;
      const snapMats = createSnapNodeMaterials(isHover);
      const installCat = getPartDef(installPreview.defId)?.category || '';
      // Engines / decouplers need larger, louder stack magnets (they hide under the hull)
      const stackBoost =
        installCat === 'engine' || installCat === 'decoupler' ? 1.45 : 1;
      if (isStack) {
        const ringR = 1.95 * stackBoost;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ringR, 0.2 * stackBoost, 10, 40),
          snapMats.ring
        );
        ring.rotation.x = Math.PI / 2;
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.68 * stackBoost, 16, 14),
          snapMats.core
        );
        // Additive halo sphere
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(1.35 * stackBoost, 16, 12),
          snapMats.halo
        );
        // Direction chevron: top = up cone, bottom = down
        const chev = new THREE.Mesh(
          new THREE.ConeGeometry(0.55 * stackBoost, 1.3 * stackBoost, 10),
          snapMats.ring
        );
        if (t.parentNode === 'top') {
          chev.position.y = 1.3 * stackBoost;
        } else {
          chev.rotation.x = Math.PI;
          chev.position.y = -1.3 * stackBoost;
        }
        mesh = new THREE.Group();
        mesh.add(halo, ring, core, chev);
        mesh.userData.stackBoost = stackBoost;
        if (!firstStackSnap) {
          firstStackSnap = {
            parentId: t.parentId,
            parentNode: t.parentNode,
            angle: installPreview.rotation || 0,
            yFraction: t.parentNode === 'top' ? 1 : 0,
            world: world.clone(),
            isStack: true,
            score: t.score || 10,
          };
        }
      } else {
        // Radial hosts: mid-height zone ring + magnet diamond
        const zone = new THREE.Mesh(
          new THREE.TorusGeometry(cyl.radius + 0.22, 0.14, 8, 48),
          new THREE.MeshBasicMaterial({
            color: isHover ? 0xc5e1a5 : 0x558b2f,
            transparent: true,
            opacity: isHover ? 0.55 : 0.38,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        zone.rotation.x = Math.PI / 2;
        zone.position.set(cyl.cx, cyl.cy, cyl.cz);
        mesh = new THREE.Group();
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), snapMats.core);
        diamond.position.copy(world);
        const dHalo = new THREE.Mesh(new THREE.SphereGeometry(1.55, 12, 10), snapMats.halo);
        dHalo.position.copy(world);
        mesh.add(dHalo, diamond);
        zone.userData.isAttachNode = true;
        zone.userData.parentId = t.parentId;
        zone.userData.parentNode = t.parentNode;
        attachGizmoRoot.add(zone);
      }

      mesh.position.copy(isStack ? world : new THREE.Vector3());
      if (!isStack) {
        // diamond already world-positioned as child; reset parent
        mesh.position.set(0, 0, 0);
      }
      mesh.userData.isAttachNode = true;
      mesh.userData.parentId = t.parentId;
      mesh.userData.parentNode = t.parentNode;
      mesh.userData.baseScale = isHover ? 1.35 : 1;
      mesh.userData.isStack = isStack;

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(isStack ? 3.6 : 2.4, 12, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.copy(isStack ? new THREE.Vector3() : world);
      hit.userData.isAttachNode = true;
      hit.userData.parentId = t.parentId;
      hit.userData.parentNode = t.parentNode;
      mesh.add(hit);
      attachGizmoRoot.add(mesh);
    }
    scene.add(attachGizmoRoot);

    // Default ghost on best stack or first target until pointer moves
    if (!installPreview.snap && firstStackSnap) {
      lastInstallSnap = firstStackSnap;
      installPreview.snap = firstStackSnap;
      placeGhostFromSnap(firstStackSnap);
      highlightGizmoForSnap(firstStackSnap);
      updateStackGuide(firstStackSnap);
    } else if (installPreview.snap) {
      placeGhostFromSnap(installPreview.snap);
      updateRadialGuide(installPreview.snap);
      if (installPreview.snap.isStack) updateStackGuide(installPreview.snap);
      else clearStackGuide();
      highlightGizmoForSnap(installPreview.snap);
    }
  }

  function pointerToRay(clientX, clientY, domElement) {
    const el = domElement || canvas;
    const rect = el.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.ray.clone();
  }

  /**
   * Continuous snap resolve from pointer (stack magnets + radial surface).
   * @returns {object | null} full placement snap
   */
  function resolveInstallSnap(clientX, clientY, domElement) {
    if (!installPreview.defId || !rocket || !designSnapshot) return null;
    if (!installPreview.targets?.length) return null;
    const craft = asCraft(designSnapshot);
    const ray = pointerToRay(clientX, clientY, domElement);
    const candidates = buildSnapCandidates(rocket, craft, installPreview.targets);
    const camDist = camera.position.distanceTo(controls.target);
    // Rotation is applied inside resolve for stack; for radial we pass 0 and add baseAngle
    const snap = resolveSnapFromRay(ray, candidates, {
      camDist,
      rotation: 0,
      defCategory: getPartDef(installPreview.defId)?.category,
    });
    if (!snap) return null;
    if (!snap.isStack) {
      snap.baseAngle = snap.angle;
      snap.angle = (snap.baseAngle || 0) + (installPreview.rotation || 0);
      const cyl = getHostCylinder(rocket, craft, snap.parentId);
      const def = getPartDef(installPreview.defId);
      if (cyl) {
        snap.world = nodeWorldPosition(
          cyl,
          'radial',
          snap.angle,
          snap.yFraction ?? 0.5,
          radialPadForCategory(def?.category)
        );
      }
    } else {
      snap.angle = installPreview.rotation || 0;
    }
    return snap;
  }

  /**
   * Raycast / continuous snap for click commit.
   * @returns {{ parentId: string, parentNode: string, angle?: number, yFraction?: number, commitable?: boolean } | null}
   */
  function pickAttachNode(clientX, clientY, domElement) {
    if (!installPreview.defId) return null;
    const snap = resolveInstallSnap(clientX, clientY, domElement);
    if (!snap || !isSnapCommitable(snap)) {
      // Fallback: discrete gizmo hit (large stack rings)
      if (attachGizmoRoot) {
        const ray = pointerToRay(clientX, clientY, domElement);
        raycaster.ray.copy(ray);
        const hits = raycaster.intersectObjects(attachGizmoRoot.children, true);
        for (const h of hits) {
          let o = h.object;
          while (o) {
            if (o.userData?.isAttachNode && o.userData.parentId) {
              return {
                parentId: o.userData.parentId,
                parentNode: o.userData.parentNode,
                angle: installPreview.rotation || 0,
                yFraction: o.userData.parentNode === 'top' ? 1 : 0.5,
                commitable: true,
              };
            }
            o = o.parent;
          }
        }
      }
      return null;
    }
    lastInstallSnap = snap;
    installPreview.snap = snap;
    installPreview.hoverParentId = snap.parentId;
    installPreview.hoverNode = snap.parentNode;
    return {
      parentId: snap.parentId,
      parentNode: snap.parentNode,
      angle: snap.angle,
      yFraction: snap.yFraction,
      commitable: true,
      isStack: snap.isStack,
    };
  }

  /**
   * KSP-style hover: part sticks to cursor; green snap when near a node / surface.
   * @returns {object | null}
   */
  function hoverAttachNode(clientX, clientY, domElement) {
    if (!installPreview.defId) return null;
    const ray = pointerToRay(clientX, clientY, domElement);
    const snap = rocket ? resolveInstallSnap(clientX, clientY, domElement) : null;
    const canSnap = !!(snap && isSnapCommitable(snap));

    // Magnet lock flash when first engaging a valid node (engine / decoupler cue)
    if (canSnap && !wasSnapLocked) {
      snapFlashUntil = performance.now() + 280;
    }
    wasSnapLocked = canSnap;

    if (canSnap) {
      lastInstallSnap = snap;
      installPreview.snap = snap;
      installPreview.hoverParentId = snap.parentId;
      installPreview.hoverNode = snap.parentNode;
      placeGhostFromSnap(snap, { valid: true });
      updateRadialGuide(snap);
      updateStackGuide(snap);
      highlightGizmoForSnap(snap);
      return {
        parentId: snap.parentId,
        parentNode: snap.parentNode,
        angle: snap.angle,
        yFraction: snap.yFraction,
        commitable: true,
        soft: false,
        free: false,
      };
    }

    // Free-float on construction plane (not attached)
    lastInstallSnap = snap && snap.soft ? snap : null;
    installPreview.snap = lastInstallSnap;
    installPreview.hoverParentId = null;
    installPreview.hoverNode = null;
    clearStackGuide();
    if (radialGuideRoot) {
      scene.remove(radialGuideRoot);
      disposeObject3D(radialGuideRoot);
      radialGuideRoot = null;
    }
    placeGhostFree(freeGhostWorldFromRay(ray), { valid: false });
    // Clear gizmo highlight
    if (attachGizmoRoot) {
      attachGizmoRoot.children.forEach((child) => {
        child.userData.baseScale = 1;
        child.traverse((o) => {
          if (o.isMesh && o.material?.color && o.material.visible !== false) {
            if (o.material.opacity > 0.01) o.material.color.setHex(0x7cb342);
          }
        });
      });
    }
    return {
      parentId: null,
      parentNode: null,
      commitable: false,
      free: true,
      world: freeGhostWorldFromRay(ray),
    };
  }

  function getInstallPlacement() {
    if (!lastInstallSnap || !isSnapCommitable(lastInstallSnap)) return null;
    return {
      parentId: lastInstallSnap.parentId,
      parentNode: lastInstallSnap.parentNode,
      angle: lastInstallSnap.angle || 0,
      yFraction: lastInstallSnap.yFraction ?? 0.5,
      commitable: true,
      rotation: installPreview.rotation || 0,
    };
  }

  /** Whether a part is currently held (install mode). */
  function isPlacing() {
    return !!installPreview.defId;
  }

  function clearRocket(disposeDetailed = false) {
    selectionApi.clearSelectionVisual();
    clearAttachGizmos();
    clearBalanceGizmo();
    focusAnim = null;
    if (!rocket) return;
    scene.remove(rocket);
    if (rocket === detailedPreview) {
      if (disposeDetailed) {
        disposeObject3D(detailedPreview);
        detailedPreview = null;
      }
    } else if (rocket.userData?.dispose) {
      rocket.userData.dispose();
    } else {
      disposeObject3D(rocket);
    }
    rocket = null;
  }

  /**
   * Apply solid / cutaway / x-ray materials so users can see internals & edits.
   * Always re-run after setDesign (fresh meshes).
   */
  function applyViewStyle(style = viewStyle) {
    viewStyle = style === 'solid' || style === 'xray' ? style : 'cutaway';
    if (!rocket) return viewStyle;

    // Cutaway = translucent full hull (no half-slice). Clip only if cutawayUsesClip.
    const useClip = viewStyle === 'cutaway' && cutawayUsesClip;
    rocket.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.userData?.isAttachNode || o.userData?.isGhost) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const role =
        o.userData?.structureRole ||
        (o.userData?.isHull
          ? 'hull'
          : o.userData?.isInternal
            ? 'fuel'
            : o.userData?.isEngine
              ? 'engine'
              : 'other');
      for (const m of mats) {
        if (!m) continue;
        if (m.userData?._vabBase == null) {
          m.userData = m.userData || {};
          m.userData._vabBase = {
            opacity: m.opacity ?? 1,
            transparent: !!m.transparent,
            depthWrite: m.depthWrite !== false,
            side: m.side,
          };
        }
        const base = m.userData._vabBase;
        m.clippingPlanes = useClip ? [cutPlane] : [];
        m.clipShadows = useClip;

        if (viewStyle === 'solid') {
          m.opacity = base.opacity;
          m.transparent = base.transparent;
          m.depthWrite = base.depthWrite;
          m.side = base.side;
        } else if (viewStyle === 'cutaway') {
          // Full rocket, see-through hull — engines/fuel solid (KSP “look inside” without half mesh)
          if (role === 'hull') {
            m.transparent = true;
            m.opacity = 0.28;
            m.depthWrite = false;
            m.side = THREE.DoubleSide;
          } else if (role === 'fuel') {
            m.transparent = true;
            m.opacity = 0.78;
            m.depthWrite = true;
          } else {
            m.transparent = base.transparent;
            m.opacity = base.opacity;
            m.depthWrite = base.depthWrite;
          }
        } else {
          m.transparent = true;
          m.depthWrite = false;
          m.side = THREE.DoubleSide;
          if (role === 'engine') m.opacity = 0.9;
          else if (role === 'fuel') m.opacity = 0.6;
          else if (role === 'hull') m.opacity = 0.14;
          else m.opacity = 0.4;
        }
        m.needsUpdate = true;
      }
      if (o.userData?.isInternal) {
        o.visible = viewStyle !== 'solid';
      }
    });

    if (useClip && rocket) {
      const box = new THREE.Box3().setFromObject(rocket);
      const c = new THREE.Vector3();
      box.getCenter(c);
      cutPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(-1, 0, 0), c);
    }

    return viewStyle;
  }

  function setViewStyle(style) {
    return applyViewStyle(style);
  }

  function getViewStyle() {
    return viewStyle;
  }

  /**
   * Rebuild preview rocket in hangar only (not the pad).
   * Always uses procedural craft mesh so part-tree edits are visible
   * (Full Stack showcase is pad-only via isDefaultStarshipVisual).
   * @param {object} design
   * @param {{ frame?: boolean }} [opts]
   */
  function clearBalanceGizmo() {
    if (balanceGizmoRoot) {
      if (balanceGizmoRoot.parent) balanceGizmoRoot.parent.remove(balanceGizmoRoot);
      disposeObject3D(balanceGizmoRoot);
      balanceGizmoRoot = null;
    }
  }

  /**
   * CoM yellow ball + thrust arrow at stack base (KSP-like learning aids).
   */
  function updateBalanceGizmos() {
    clearBalanceGizmo();
    if (!showBalanceGizmos || !rocket || !designSnapshot) return;
    if (!asCraft(designSnapshot).rootId) return;

    const balance = estimateMassBalance(designSnapshot);
    rocket.userData.massBalance = balance;
    balanceGizmoRoot = createBalanceGizmoGroup(THREE, balance);
    // Stack base sits at engineClearance in rocket local space
    const ec = rocket.userData.engineClearance || 0;
    balanceGizmoRoot.position.set(0, ec, 0);
    balanceGizmoRoot.userData.isBalanceGizmo = true;
    rocket.add(balanceGizmoRoot);
  }

  function setShowBalanceGizmos(on) {
    showBalanceGizmos = !!on;
    updateBalanceGizmos();
    return showBalanceGizmos;
  }

  function setDesign(design, opts = {}) {
    designSnapshot = normalizeDesign(cloneDesign(design));
    const prevSel = selectionApi.getSelectionState().selection;
    clearBalanceGizmo();
    clearRocket(false);
    rebuildSerial += 1;
    // Cancel in-flight place anim on full rebuild
    if (placeAnim) placeAnim = null;
    if (placePulse) {
      placePulse.cancel?.();
      placePulse = null;
    }

    // Design bay must always reflect the live craft graph / compiled stages
    rocket = createRocketFromDesign(designSnapshot, null);

    const pedDeckY = 0.9;
    const ec = rocket.userData.engineClearance || 0;
    rocket.position.set(0, pedDeckY - ec, 0);
    rocket.rotation.set(0, 0, 0);
    scene.add(rocket);
    rocket.userData.setEngineGlow?.(false);
    applyViewStyle(viewStyle);
    if (opts.frame !== false) frameRocket();
    // Re-apply selection highlight after rebuild (no camera lurch)
    const placeSel = opts.placeSelection || null;
    if (placeSel?.partId || placeSel?.type) {
      setSelectedPart(placeSel, { focus: true, highlight: true });
      startPlaceScaleAnim(placeSel);
    } else if (prevSel) {
      setSelectedPart(prevSel, { focus: false, highlight: true });
    }
    rebuildAttachGizmos();
    updateBalanceGizmos();
    return rocket;
  }

  /**
   * Scale-pop newly placed part (engine / decoupler especially).
   * @param {{ type?: string, partId?: string|null, index?: number }} selection
   */
  function startPlaceScaleAnim(selection) {
    if (!rocket || !selection || reducedMotion()) return;
    const targets = resolveSelectionTargets(rocket, selection);
    if (!targets.length) return;
    const bases = new Map();
    for (const t of targets) {
      if (!t) continue;
      const id = t.uuid;
      bases.set(id, t.scale.clone());
      t.scale.setScalar(0.18);
    }
    placeAnim = {
      targets,
      t0: performance.now(),
      dur: 420,
      bases,
    };
  }

  /**
   * Full place feedback: scale pop (from setDesign) + emissive pulse + magnet ring flash.
   * @param {{ type?: string, partId?: string, primaryId?: string, category?: string }} info
   */
  function playPlaceFeedback(info) {
    if (!rocket || !info) return { ok: false };
    const selection = {
      type: info.type,
      index: info.index ?? 0,
      partId: info.partId || info.primaryId || null,
    };
    if (placePulse) {
      placePulse.cancel?.();
      placePulse = null;
    }
    // Extra pulse if scale anim already started in setDesign
    if (!placeAnim) startPlaceScaleAnim(selection);
    placePulse = selectionApi.pulseSelectionFeedback(selection);
    // Spawn a short-lived world flash at part center (stack install cue)
    spawnPlaceBurst(selection, info.category);
    return { ok: true };
  }

  function spawnPlaceBurst(selection, category) {
    if (!rocket || reducedMotion()) return;
    const targets = resolveSelectionTargets(rocket, selection);
    if (!targets.length) return;
    const box = new THREE.Box3();
    for (const t of targets) box.expandByObject(t);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);

    const isEngine = category === 'engine';
    const isDecoupler = category === 'decoupler';
    const color = isEngine ? 0xffab40 : isDecoupler ? 0x80deea : 0xa5d6a7;

    const burst = new THREE.Group();
    burst.name = 'PlaceBurst';
    burst.position.copy(center);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(isDecoupler ? 2.8 : 1.6, 0.12, 8, 36),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ring.rotation.x = Math.PI / 2;
    burst.add(ring);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(isEngine ? 0.9 : 0.55, 14, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    burst.add(core);
    scene.add(burst);

    const t0 = performance.now();
    const dur = 480;
    function tickBurst() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - (1 - k) ** 2;
      const s = 0.4 + e * 2.2;
      burst.scale.setScalar(s);
      ring.material.opacity = 0.85 * (1 - k);
      core.material.opacity = 0.7 * (1 - k);
      if (k < 1) {
        requestAnimationFrame(tickBurst);
      } else {
        scene.remove(burst);
        disposeObject3D(burst);
      }
    }
    requestAnimationFrame(tickBurst);
  }

  function runEnterReveal() {
    if (revealRaf) {
      cancelAnimationFrame(revealRaf);
      revealRaf = 0;
    }
    revealActive = false;
    if (!rocket) return;

    if (reducedMotion()) {
      frameRocket();
      if (!userInteracted) controls.autoRotate = true;
      return;
    }

    // Start pulled back, ease into hero frame
    const box = new THREE.Box3().setFromObject(rocket);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const h = Math.max(size.y, 20);
    const endDist = Math.max(
      computeRocketFrameDistance(h, camera.fov, DEFAULT_ROCKET_VIEWPORT_FILL),
      40
    );
    const startDist = endDist * 1.55;
    const dir = new THREE.Vector3(0.62, 0.06, 0.78).normalize();
    const startPos = new THREE.Vector3(
      center.x + dir.x * startDist,
      center.y + dir.y * startDist + h * 0.1,
      center.z + dir.z * startDist
    );
    const endPos = new THREE.Vector3(
      center.x + dir.x * endDist,
      center.y + dir.y * endDist + h * 0.02,
      center.z + dir.z * endDist
    );
    camera.position.copy(startPos);
    controls.target.copy(center);
    controls.update();

    revealActive = true;
    const t0 = performance.now();
    const dur = ENTER_REVEAL_MS;

    function step(now) {
      if (!active || !revealActive) return;
      const k = Math.min(1, (now - t0) / dur);
      // ease-out cubic
      const e = 1 - (1 - k) ** 3;
      camera.position.lerpVectors(startPos, endPos, e);
      controls.target.copy(center);
      controls.update();
      if (k < 1) {
        revealRaf = requestAnimationFrame(step);
      } else {
        revealActive = false;
        revealRaf = 0;
        frameRocket();
      }
    }
    revealRaf = requestAnimationFrame(step);
  }

  function enter(design) {
    active = true;
    userInteracted = false;
    controls.enabled = true;
    controls.autoRotate = !reducedMotion();
    applyVabCameraButtons(controls, false);
    setDesign(design, { frame: false });
    runEnterReveal();
  }

  function exit() {
    active = false;
    controls.enabled = false;
    controls.autoRotate = false;
    applyVabCameraButtons(controls, false);
    if (revealRaf) {
      cancelAnimationFrame(revealRaf);
      revealRaf = 0;
    }
    revealActive = false;
    focusAnim = null;
    clearRocket(false);
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update(_dt) {
    if (!active) return;

    if (focusAnim) {
      const k = Math.min(1, (performance.now() - focusAnim.t0) / focusAnim.dur);
      const e = 1 - (1 - k) ** 3;
      controls.target.lerpVectors(focusAnim.from, focusAnim.to, e);
      if (k >= 1) focusAnim = null;
    }

    // Place-success scale pop (engine / decoupler install cue)
    if (placeAnim) {
      const k = Math.min(1, (performance.now() - placeAnim.t0) / placeAnim.dur);
      // Overshoot ease: 0.18 → 1.08 → 1.0
      const e = 1 - (1 - k) ** 3;
      const over = e < 0.7 ? e / 0.7 : 1 - (e - 0.7) / 0.3 * 0.08;
      const sMul = 0.18 + over * 0.9;
      for (const target of placeAnim.targets) {
        if (!target) continue;
        const base = placeAnim.bases.get(target.uuid);
        if (!base) continue;
        target.scale.set(base.x * sMul, base.y * sMul, base.z * sMul);
      }
      if (k >= 1) {
        for (const target of placeAnim.targets) {
          const base = placeAnim.bases.get(target?.uuid);
          if (target && base) target.scale.copy(base);
        }
        placeAnim = null;
      }
    }

    controls.update();
    const t = performance.now() * 0.001;
    gizmoPulseT = t;
    const now = performance.now();
    const flash =
      now < snapFlashUntil ? 1 + ((snapFlashUntil - now) / 280) * 0.55 : 1;

    // Pulse attach gizmos + ghost opacity (stronger while installing engines/decouplers)
    if (attachGizmoRoot) {
      const cat = getPartDef(installPreview.defId)?.category || '';
      const boost = cat === 'engine' || cat === 'decoupler' ? 1.12 : 1;
      const pulse = (1 + Math.sin(t * 4.2) * 0.1) * boost * flash;
      attachGizmoRoot.children.forEach((child, i) => {
        const base = child.userData.baseScale || 1;
        const s = base * (pulse + Math.sin(t * 5 + i) * 0.04);
        child.scale.setScalar(s);
      });
    }
    if (stackGuideRoot) {
      const pulse = (1 + Math.sin(t * 5.5) * 0.12) * flash;
      stackGuideRoot.scale.setScalar(pulse);
      stackGuideRoot.traverse((o) => {
        if (o.material?.opacity != null && o.material.transparent) {
          const base = o.geometry?.type === 'TorusGeometry' ? 0.72 : 0.5;
          o.material.opacity = base + Math.sin(t * 6) * 0.15;
        }
      });
    }
    // Soft CoM halo / thrust glow breathe
    if (balanceGizmoRoot) {
      const com = balanceGizmoRoot.getObjectByName('CoMMarker');
      if (com) {
        const s = 1 + Math.sin(t * 2.8) * 0.04;
        com.scale.setScalar(s);
      }
      balanceGizmoRoot.traverse((o) => {
        if (o.name === 'ThrustMarker' && o.children) {
          /* keep */
        }
        if (o.material?.emissiveIntensity != null && o.parent?.name === 'ThrustMarker') {
          o.material.emissiveIntensity = 0.4 + Math.sin(t * 5) * 0.12;
        }
      });
    }
    if (ghostPartRoot) {
      ghostPartRoot.traverse((o) => {
        if (!o.material || o.material.opacity == null) return;
        if (o.material.wireframe) {
          o.material.opacity = 0.55 + Math.sin(t * 3.2) * 0.12;
          return;
        }
        if (o.material.blending === THREE.AdditiveBlending) {
          o.material.opacity = 0.14 + Math.sin(t * 4.0) * 0.06;
          return;
        }
        // solid ghost body
        const base = o.parent?.userData?.ghostDim ? 0.16 : 0.34;
        o.material.opacity = base + Math.sin(t * 3.5) * 0.07;
        if (o.material.emissiveIntensity != null) {
          o.material.emissiveIntensity = 0.28 + Math.sin(t * 3.5) * 0.12;
        }
      });
    }
    if (radialGuideRoot) {
      radialGuideRoot.traverse((o) => {
        if (o.material && o.material.opacity != null) {
          const base = o.geometry?.type === 'TorusGeometry' ? 0.5 : 0.75;
          o.material.opacity = base + Math.sin(t * 4) * 0.1;
        }
      });
    }

  }

  function render() {
    if (!active) return;
    const prevTone = renderer.toneMappingExposure;
    const prevLocalClip = renderer.localClippingEnabled;
    const prevPlanes = renderer.clippingPlanes;
    renderer.toneMappingExposure = 1.28;
    // Optional half-section only when cutawayUsesClip (default off)
    if (viewStyle === 'cutaway' && cutawayUsesClip) {
      renderer.localClippingEnabled = true;
      renderer.clippingPlanes = [cutPlane];
    } else {
      renderer.localClippingEnabled = false;
      renderer.clippingPlanes = [];
    }
    renderer.render(scene, camera);
    renderer.toneMappingExposure = prevTone;
    renderer.localClippingEnabled = prevLocalClip;
    renderer.clippingPlanes = prevPlanes;
  }

  function isActive() {
    return active;
  }

  function getDesign() {
    return designSnapshot ? cloneDesign(designSnapshot) : null;
  }

  function getRocket() {
    return rocket;
  }

  return {
    scene,
    camera,
    controls,
    enter,
    exit,
    setDesign,
    frameRocket,
    setSelectedPart,
    pulseSelectionFeedback,
    getSelectionState,
    clearSelectionVisual: () => selectionApi.clearSelectionVisual(),
    setInstallPreview,
    setInstallRotation,
    nudgeInstallRotation,
    pickAttachNode,
    hoverAttachNode,
    resolveInstallSnap,
    getInstallPlacement,
    isPlacing,
    playPlaceFeedback,
    rebuildAttachGizmos,
    updateBalanceGizmos,
    setShowBalanceGizmos,
    getShowBalanceGizmos: () => showBalanceGizmos,
    setViewStyle,
    getViewStyle,
    applyViewStyle,
    getRebuildSerial: () => rebuildSerial,
    resize,
    update,
    render,
    isActive,
    getDesign,
    getRocket,
  };
}

/** Soft vertical gradient used as scene background. */
function makeVerticalGradientTexture(colors, stops) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (let i = 0; i < colors.length; i++) {
    g.addColorStop(stops[i] ?? i / (colors.length - 1), colors[i]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Radial soft disc (spotlight / floor wash) texture — restrained. */
function makeRadialGlowTexture(inner = 'rgba(80,140,200,0.28)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, 'rgba(30, 60, 90, 0.12)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Orbital hangar: open floor, soft podium, low-contrast silhouettes,
 * scale marks, soft vertical beams — no dense HUD props.
 */
function buildShowroom(scene) {
  const root = new THREE.Group();
  root.name = 'DesignShowroom';

  // Infinite soft floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    metalness: 0.68,
    roughness: 0.36,
    envMapIntensity: 1.15,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(380, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Polished inner plate — mirror-ish bay floor
  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(62, 80),
    new THREE.MeshStandardMaterial({
      color: 0x141a22,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.6,
    })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.02;
  plate.receiveShadow = true;
  root.add(plate);

  // Stronger podium wash
  const washTex = makeRadialGlowTexture('rgba(90, 150, 210, 0.42)');
  const wash = new THREE.Mesh(
    new THREE.CircleGeometry(32, 48),
    new THREE.MeshBasicMaterial({
      map: washTex,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wash.rotation.x = -Math.PI / 2;
  wash.position.y = 0.04;
  wash.name = 'PodiumWash';
  root.add(wash);

  // Soft contact shadow under vehicle
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.035;
  contact.name = 'ContactShadow';
  root.add(contact);

  // Ground reflection disc (high metal, low roughness)
  const reflect = new THREE.Mesh(
    new THREE.CircleGeometry(26, 56),
    new THREE.MeshStandardMaterial({
      color: 0x1e2a38,
      metalness: 0.96,
      roughness: 0.1,
      envMapIntensity: 2.0,
      transparent: true,
      opacity: 0.38,
    })
  );
  reflect.rotation.x = -Math.PI / 2;
  reflect.position.y = 0.028;
  reflect.name = 'GroundReflection';
  root.add(reflect);

  // Outer glow ring on floor
  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(24, 25.2, 80),
    new THREE.MeshBasicMaterial({
      color: 0x4a7aaa,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.045;
  floorRing.name = 'FloorGlowRing';
  root.add(floorRing);

  // Elegant low podium
  const podium = new THREE.Group();
  podium.name = 'Podium';

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 16.2, 0.5, 64),
    new THREE.MeshStandardMaterial({
      color: 0x161b22,
      metalness: 0.68,
      roughness: 0.34,
    })
  );
  base.position.y = 0.26;
  base.castShadow = true;
  base.receiveShadow = true;
  podium.add(base);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(13.5, 14.2, 0.32, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1e2530,
      metalness: 0.8,
      roughness: 0.26,
    })
  );
  cap.position.y = 0.68;
  cap.castShadow = true;
  cap.receiveShadow = true;
  podium.add(cap);

  // Thin edge — cool bay accent
  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(13.8, 0.05, 8, 96),
    new THREE.MeshStandardMaterial({
      color: 0x5a8ab0,
      emissive: 0x1a4060,
      emissiveIntensity: 0.65,
      metalness: 0.55,
      roughness: 0.3,
    })
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.86;
  podium.add(edge);

  // Secondary inner edge
  const edge2 = new THREE.Mesh(
    new THREE.TorusGeometry(12.2, 0.03, 6, 72),
    new THREE.MeshStandardMaterial({
      color: 0x3a5a78,
      emissive: 0x102838,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.35,
    })
  );
  edge2.rotation.x = Math.PI / 2;
  edge2.position.y = 0.88;
  podium.add(edge2);

  root.add(podium);

  // Soft cyclorama
  const cycTex = makeVerticalGradientTexture(
    ['#080a0e', '#0c1016', '#121820', '#0a0c10'],
    [0, 0.4, 0.75, 1]
  );
  const cyc = new THREE.Mesh(
    new THREE.SphereGeometry(420, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshBasicMaterial({
      map: cycTex,
      side: THREE.BackSide,
      fog: true,
      depthWrite: false,
    })
  );
  cyc.position.y = -10;
  root.add(cyc);

  // Low-contrast hangar silhouettes
  const hangarMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    metalness: 0.12,
    roughness: 0.94,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const wallL = new THREE.Mesh(new THREE.PlaneGeometry(180, 100), hangarMat);
  wallL.position.set(-175, 38, -70);
  wallL.rotation.y = Math.PI * 0.3;
  wallL.name = 'HangarSilhouetteL';
  root.add(wallL);

  const wallR = new THREE.Mesh(new THREE.PlaneGeometry(140, 85), hangarMat.clone());
  wallR.position.set(165, 32, -95);
  wallR.rotation.y = -Math.PI * 0.32;
  wallR.name = 'HangarSilhouetteR';
  root.add(wallR);

  // Soft vertical beams (restrained)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x4a7aaa,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const [x, z, h] of [
    [-90, -40, 95],
    [100, -55, 80],
    [-40, -120, 70],
  ]) {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, h), beamMat);
    beam.position.set(x, h * 0.4, z);
    beam.name = 'SoftBeam';
    root.add(beam);
  }

  // Scale marks (floor tick ring) — engineering reference, low contrast
  const scaleGroup = new THREE.Group();
  scaleGroup.name = 'ScaleMarks';
  const tickMat = new THREE.MeshBasicMaterial({
    color: 0x3a4555,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 3.2), tickMat);
    tick.rotation.x = -Math.PI / 2;
    tick.position.set(Math.cos(a) * 32, 0.06, Math.sin(a) * 32);
    tick.rotation.z = a;
    scaleGroup.add(tick);
  }
  // Radius reference ring
  const scaleRing = new THREE.Mesh(
    new THREE.RingGeometry(31.5, 32.2, 64),
    new THREE.MeshBasicMaterial({
      color: 0x3a4555,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  scaleRing.rotation.x = -Math.PI / 2;
  scaleRing.position.y = 0.05;
  scaleGroup.add(scaleRing);
  root.add(scaleGroup);

  // Sparse depth dust
  const dustGeo = new THREE.BufferGeometry();
  const N = 90;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 50 + Math.random() * 160;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 10 + Math.random() * 90;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0x8aa0b8,
      size: 0.4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  root.add(dust);

  scene.add(root);
  return root;
}
