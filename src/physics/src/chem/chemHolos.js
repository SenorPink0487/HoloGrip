/**
 * Chemistry always-on floating holos (left status / right composition / front picker).
 *
 * Vision Pro style floating window — rounded glass with soft rim glow and depth.
 */

import {
  drawChemLeftPanel,
  drawChemRightPanel,
  drawChemPeriodicPanel,
  pickChemHits,
} from './periodicTableDraw.js';
import { CHEM_ACCENT, CHEM_ACCENT_NUM } from './labMode.js';

/**
 * @param {typeof import('three')} THREE
 * @param {{
 *   id: string,
 *   kind: 'left'|'right'|'periodic',
 *   title: string,
 *   pos: [number, number, number],
 *   rotY?: number,
 *   panelW?: number,
 *   panelH?: number,
 *   primitives: { rbox: Function },
 * }} opts
 */
export function makeChemHolo(THREE, opts) {
  const {
    id,
    kind,
    title,
    pos,
    rotY = 0,
    panelW = 1.15,
    panelH = 1.45,
    primitives,
  } = opts;
  const { rbox } = primitives;
  const accentHex = CHEM_ACCENT;
  const accentNum = CHEM_ACCENT_NUM;

  const g = new THREE.Group();
  g.name = `chem-holo-${id}`;
  g.position.set(...pos);
  g.rotation.y = rotY;

  // Vision Pro style rounded glass panel — soft frosted glass with rim glow
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.15,
    roughness: 0.22,
    transmission: 0.55,
    thickness: 0.04,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Large rounded glass with generous corner radius
  const glass = rbox(panelW, panelH, 0.01, panelMat, 0.12, 12);
  glass.position.z = 0.004;
  g.add(glass);

  // Soft outer rim glow (Vision Pro style edge light)
  const rim = rbox(panelW + 0.022, panelH + 0.022, 0.014,
    new THREE.MeshBasicMaterial({
      color: accentNum,
      transparent: true,
      opacity: 0.32,
    }),
    0.14, 12);
  rim.position.z = -0.008;
  g.add(rim);

  // Inner highlight strip
  const highlight = rbox(panelW * 0.92, panelH * 0.015, 0.003,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
    }),
    0.008, 4);
  highlight.position.set(0, panelH * 0.42, 0.012);
  g.add(highlight);

  // Back face with slight depth
  const backMat = new THREE.MeshBasicMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.55,
    side: THREE.FrontSide,
  });
  const back = rbox(panelW, panelH, 0.012, backMat, 0.12, 12);
  back.rotation.y = Math.PI;
  back.position.z = -0.014;
  g.add(back);

  // Higher canvas res so large fonts stay sharp on the floating panels.
  const CW = kind === 'periodic' ? 1600 : 900;
  const CH = kind === 'periodic' ? 1100 : 1200;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  let hitRegions = [];
  let boundData = null;
  let lastKey = '';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;

  const screenMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.97,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  // Plane for reliable UV picking; canvas content already has rounded glass look.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.96, panelH * 0.96), screenMat);
  screen.position.z = 0.008;
  screen.userData.stationId = 'chem';
  screen.userData.type = 'holo_display';
  screen.userData.role = 'holo_display';
  screen.userData.interactive = true;
  screen.userData.chemKind = kind;
  g.add(screen);

  g.userData.stationId = 'chem';
  g.userData.type = kind === 'periodic' ? 'holo_display' : 'holo_display';
  g.userData.role = 'holo_display';
  g.userData.chemKind = kind;
  g.userData.interactive = true;
  g.userData.active = true;
  g.userData.present = kind !== 'periodic';
  g.userData.accentHex = accentHex;
  g.userData.canvasW = CW;
  g.userData.canvasH = CH;
  g.userData.screenMesh = screen;

  function setPresent(on) {
    g.userData.present = !!on;
    g.visible = !!on;
    screen.visible = !!on;
  }

  function setHud(hud) {
    boundData = hud?.data || hud || {};
    // Periodic only when picker open
    if (kind === 'periodic') {
      const open = !!boundData.pickerOpen;
      setPresent(open);
      if (open) draw(true);
      return;
    }
    setPresent(true);
    draw(true);
  }

  function draw(force = false) {
    if (!g.userData.present && kind === 'periodic' && !force) return;
    const data = boundData || {};
    const key = JSON.stringify({
      kind,
      a: data.activeCup,
      p: data.pickerOpen,
      ph: data.pickerPhase,
      el: data.pickedElement,
      ca: data.cupA?.formula,
      cb: data.cupB?.formula,
      n: data.components?.length,
      sel: data.selectedComponentId,
      h: data.hint,
    });
    if (!force && key === lastKey) return;
    lastKey = key;

    let result;
    if (kind === 'left') result = drawChemLeftPanel(ctx, CW, CH, data);
    else if (kind === 'right') result = drawChemRightPanel(ctx, CW, CH, data);
    else result = drawChemPeriodicPanel(ctx, CW, CH, data);
    hitRegions = result?.hits || [];
    tex.needsUpdate = true;
  }

  function pickFromRay(raycaster) {
    if (!g.userData.present) return null;
    const hits = raycaster.intersectObject(screen, false);
    if (!hits.length) return null;
    const uv = hits[0].uv;
    if (!uv) return null;
    return pickChemHits(hitRegions, uv.x, uv.y, CW, CH);
  }

  function screenAimFromRay(raycaster) {
    if (!g.userData.present || !g.visible) return null;
    screen.updateWorldMatrix?.(true, false);
    const hits = raycaster.intersectObject(screen, false);
    if (!hits.length) return null;
    return { distance: hits[0].distance, point: hits[0].point, object: screen };
  }

  g.userData.setPresent = setPresent;
  g.userData.setHud = setHud;
  g.userData.draw = draw;
  g.userData.pickFromRay = pickFromRay;
  g.userData.screenAimFromRay = screenAimFromRay;
  g.userData.boundData = () => boundData;

  // Initial paint
  if (kind !== 'periodic') {
    setPresent(true);
    draw(true);
  } else {
    setPresent(false);
  }

  // Face the player (soft yaw)
  const _world = new THREE.Vector3();
  const _cam = new THREE.Vector3();
  function faceCamera(camera) {
    if (!camera || !g.userData.present) return;
    g.getWorldPosition(_world);
    camera.getWorldPosition(_cam);
    const dx = _cam.x - _world.x;
    const dz = _cam.z - _world.z;
    if (Math.hypot(dx, dz) < 0.01) return;
    g.rotation.y = Math.atan2(dx, dz);
  }

  g.userData.faceCamera = faceCamera;
  g.userData.title = title;

  return g;
}

/**
 * Create the three chem holos around the center island.
 */
export function createChemHoloSet(THREE, primitives, scene) {
  const left = makeChemHolo(THREE, {
    id: 'chem-left',
    kind: 'left',
    title: '状态',
    pos: [-1.65, 1.95, 0.95],
    rotY: Math.PI / 2,
    panelW: 1.35,
    panelH: 1.75,
    primitives,
  });
  const right = makeChemHolo(THREE, {
    id: 'chem-right',
    kind: 'right',
    title: '成分',
    pos: [1.65, 1.95, 0.95],
    rotY: -Math.PI / 2,
    panelW: 1.35,
    panelH: 1.75,
    primitives,
  });
  const periodic = makeChemHolo(THREE, {
    id: 'chem-periodic',
    kind: 'periodic',
    title: '周期表',
    pos: [0, 2.2, 1.7],
    rotY: 0,
    panelW: 2.9,
    panelH: 1.9,
    primitives,
  });

  scene.add(left);
  scene.add(right);
  scene.add(periodic);

  return { left, right, periodic, list: [left, right, periodic] };
}
