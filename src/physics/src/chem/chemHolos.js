/**
 * Chemistry always-on floating holos (left status / right composition / front picker).
 *
 * Vision Pro style floating window — rounded translucent frosted glass with soft specular glow,
 * light mode theme and positioned behind the desk beakers for intuitive spatial interaction.
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
    panelW = 1.70,
    panelH = 1.30,
    primitives,
  } = opts;
  const { rbox } = primitives;
  const accentHex = CHEM_ACCENT;
  const accentNum = CHEM_ACCENT_NUM;

  const g = new THREE.Group();
  g.name = `chem-holo-${id}`;
  g.position.set(...pos);
  g.rotation.y = rotY;

  // Vision Pro style light-mode frosted crystal glass panel
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.12,
    transmission: 0.85,
    thickness: 0.04,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Large rounded glass panel with Vision Pro corner radius
  const glass = rbox(panelW, panelH, 0.01, panelMat, 0.14, 14);
  glass.position.z = 0.004;
  glass.raycast = () => {};
  g.add(glass);

  // Soft outer rim glow (luminous white specular edge light)
  const rim = rbox(panelW + 0.022, panelH + 0.022, 0.014,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
    }),
    0.15, 14);
  rim.position.z = -0.008;
  rim.raycast = () => {};
  g.add(rim);

  // Back face with translucent depth
  const backMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    transparent: true,
    opacity: 0.45,
    side: THREE.FrontSide,
  });
  const back = rbox(panelW, panelH, 0.012, backMat, 0.14, 14);
  back.rotation.y = Math.PI;
  back.position.z = -0.014;
  back.raycast = () => {};
  g.add(back);

  // High canvas resolution matching Vision Pro ratios.
  const CW = kind === 'periodic' ? 1920 : 1400;
  const CH = kind === 'periodic' ? 1120 : 1040;
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
    opacity: 0.98,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  // Plane for UV picking - frontmost position so no sub-meshes block clicks
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), screenMat);
  screen.position.z = 0.012;
  screen.userData.stationId = 'chem';
  screen.userData.type = 'holo_display';
  screen.userData.role = 'holo_display';
  screen.userData.interactive = true;
  screen.userData.chemKind = kind;
  g.add(screen);

  g.userData.stationId = 'chem';
  g.userData.type = 'holo_display';
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

  if (kind !== 'periodic') {
    setPresent(true);
    draw(true);
  } else {
    setPresent(false);
  }

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
 * Create the three chem holos positioned BEHIND the desk beakers (z=0.55).
 */
export function createChemHoloSet(THREE, primitives, scene) {
  const left = makeChemHolo(THREE, {
    id: 'chem-left',
    kind: 'left',
    title: '状态',
    pos: [-1.85, 1.85, 0.05],
    rotY: Math.PI * 0.15,
    panelW: 1.70,
    panelH: 1.30,
    primitives,
  });
  const right = makeChemHolo(THREE, {
    id: 'chem-right',
    kind: 'right',
    title: '成分',
    pos: [1.85, 1.85, 0.05],
    rotY: -Math.PI * 0.15,
    panelW: 1.70,
    panelH: 1.30,
    primitives,
  });
  const periodic = makeChemHolo(THREE, {
    id: 'chem-periodic',
    kind: 'periodic',
    title: '周期表',
    pos: [0, 2.05, -0.35],
    rotY: 0,
    panelW: 2.95,
    panelH: 1.72,
    primitives,
  });

  scene.add(left);
  scene.add(right);
  scene.add(periodic);

  return { left, right, periodic, list: [left, right, periodic] };
}
