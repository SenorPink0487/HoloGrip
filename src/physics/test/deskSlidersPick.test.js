/**
 * Desk slider panel: row selection under angled rays.
 * Regression for “aiming 半径 R / dB/dt but resolving as 磁感应 B”.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Node has no DOM; desk header / action textures only need a stub canvas.
const canvasStub = {
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'middle',
  }),
};
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return { ...canvasStub, width: 0, height: 0 };
    return {};
  },
};

const { createDeskSliderPanel } = await import('../src/scene/shared/deskSliders.js');

const INDUCED_SPECS = [
  { key: 'R', label: '半径 R', min: 0.8, max: 3.2, value: 0.81, setAction: 'induced-e-set', action: 'induced-e-slider' },
  { key: 'B', label: '磁感应 B', min: -2.5, max: 2.5, value: 0.16, setAction: 'induced-e-set', action: 'induced-e-slider' },
  { key: 'dBdt', label: 'dB/dt', min: -6.25, max: 6.25, value: 5.68, setAction: 'induced-e-set', action: 'induced-e-slider' },
  { key: 'probeR', label: '探测电荷 r', min: 0.15, max: 4.5, value: 1.82, setAction: 'induced-e-set', action: 'induced-e-slider' },
];

function makePanel() {
  const panel = createDeskSliderPanel({ stationId: 'electro', accentHex: '#ec4899', accentNum: 0xec4899 });
  panel.position.set(0, 0.9, 0);
  panel.updateMatrixWorld(true);
  panel.userData.setPresent(true);
  panel.userData.setSpecs(INDUCED_SPECS);
  panel.updateMatrixWorld(true);
  return panel;
}

/** Ray from elevated “seated” eye toward a local point on the card surface. */
function rayTowardLocal(panel, localX, localY, localZ) {
  const target = new THREE.Vector3(localX, localY, localZ);
  panel.localToWorld(target);
  // Camera above and in front of the sitting edge (+Z), looking down at the card.
  const origin = new THREE.Vector3(panel.position.x, panel.position.y + 0.55, panel.position.z + 0.75);
  const dir = target.clone().sub(origin).normalize();
  const rc = new THREE.Raycaster(origin, dir);
  return rc;
}

test('angled ray aimed at 半径 R resolves R, not 磁感应 B', () => {
  const panel = makePanel();
  // Row 0 center (top / rear row in local −Z layout).
  const slots = [];
  panel.traverse((m) => {
    if (m.userData?.slotIndex === 0) slots.push(m);
  });
  // Aim at the header/track band of the first active row via plane Y.
  // Local Z for row i ≈ −baseD/2 + pad + ROW_H*(i+0.5); use pick API indirectly
  // by targeting several samples across the first row’s band.
  // Row centers for 4 slots sit near z ≈ −0.15, −0.05, +0.05, +0.15.
  // Stay well inside the rear band so we are not testing the R|B midpoint.
  const picks = [];
  for (const z of [-0.16, -0.15, -0.14, -0.13]) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (pick) picks.push(pick.key);
  }
  assert.ok(picks.length > 0, 'expected at least one hit on the top row band');
  assert.ok(picks.every((k) => k === 'R'), `expected all R, got ${picks.join(',')}`);
});

test('downward ray that clips a front grab still selects the rear row under the crosshair', () => {
  const panel = makePanel();
  // Steep look-down: origin high and close so the ray often enters a front
  // grab volume first (old distance-first logic → wrong nearer row).
  const target = new THREE.Vector3(0, 0.03, -0.15);
  panel.localToWorld(target);
  const origin = new THREE.Vector3(panel.position.x, panel.position.y + 0.9, panel.position.z + 0.35);
  const dir = target.clone().sub(origin).normalize();
  const pick = panel.userData.pickFromRay(new THREE.Raycaster(origin, dir));
  assert.equal(pick?.key, 'R', `steep aim at rear row must be R, got ${pick?.key}`);
});

test('each induced-E row is independently selectable under downward aim', () => {
  const panel = makePanel();
  // Probe active row Z centers from the panel’s own layout by scanning local Z.
  const found = new Map();
  for (let z = -0.22; z <= 0.22; z += 0.008) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0.05, 0.03, z));
    if (pick?.key) found.set(pick.key, (found.get(pick.key) || 0) + 1);
  }
  for (const key of ['R', 'B', 'dBdt', 'probeR']) {
    assert.ok(found.has(key), `expected to be able to aim ${key}, got keys: ${[...found.keys()].join(',')}`);
  }
});

test('pick value follows local X on the aimed track', () => {
  const panel = makePanel();
  // Hit near the right end of the B track (bipolar −2.5…2.5 → near +2.5).
  // Scan for a Z that maps to B, then sample X.
  let bZ = null;
  for (let z = -0.22; z <= 0.22; z += 0.006) {
    const probe = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (probe?.key === 'B') {
      bZ = z;
      break;
    }
  }
  assert.ok(bZ != null, 'could not locate B row Z');
  const left = panel.userData.pickFromRay(rayTowardLocal(panel, -0.22, 0.03, bZ));
  const right = panel.userData.pickFromRay(rayTowardLocal(panel, 0.22, 0.03, bZ));
  assert.equal(left?.key, 'B');
  assert.equal(right?.key, 'B');
  assert.ok(left.value < 0, `left of bipolar B should be negative, got ${left.value}`);
  assert.ok(right.value > 0, `right of bipolar B should be positive, got ${right.value}`);
});

test('Hall desk panel exposes discrete 记录当前读数 action chip', () => {
  const panel = createDeskSliderPanel({ stationId: 'electro', accentHex: '#ec4899', accentNum: 0xec4899 });
  panel.position.set(0, 0.9, 0);
  panel.updateMatrixWorld(true);
  panel.userData.setPresent(true);
  panel.userData.setSpecs([
    { kind: 'range', key: 'Im', label: '励磁电流 Im', min: 0, max: 1, value: 0.5, setAction: 'hall-set', action: 'param-slider' },
    { kind: 'range', key: 'Is', label: '霍尔电流 Is', min: 0, max: 10, value: 5, setAction: 'hall-set', action: 'param-slider' },
    { kind: 'range', key: 'probePos', label: '探头 X', min: -25, max: 25, value: 0, setAction: 'hall-set', action: 'param-slider' },
    { kind: 'range', key: 'rightCoilPos', label: '右线圈位置', min: -0.5, max: 13, value: 2.5, setAction: 'hall-set', action: 'param-slider' },
    { kind: 'action', key: 'hall-record', label: '记录当前读数', action: 'hall-record' },
  ]);
  panel.updateMatrixWorld(true);

  let found = null;
  for (let z = -0.28; z <= 0.28; z += 0.006) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (pick?.action === 'hall-record') {
      found = pick;
      break;
    }
  }
  assert.ok(found, 'expected to aim the record action chip');
  assert.equal(found.kind, 'action');
  assert.equal(found.role, 'desk_action');
  assert.equal(found.action, 'hall-record');
});
