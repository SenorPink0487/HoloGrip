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
  { key: 'dBdt', label: 'dB/dt', min: -6.25, max: 6.25, value: 5.68, setAction: 'induced-e-set', action: 'induced-e-slider' },
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

test('angled ray aimed at 半径 R resolves R', () => {
  const panel = makePanel();
  let topZ = null;
  for (let z = -0.25; z <= 0.25; z += 0.005) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (pick?.key === 'R') {
      topZ = z;
      break;
    }
  }
  assert.ok(topZ != null, 'expected to locate R row Z');
  const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, topZ));
  assert.equal(pick?.key, 'R');
});

test('downward ray that clips a front grab still selects the rear row under the crosshair', () => {
  const panel = makePanel();
  let topZ = null;
  for (let z = -0.25; z <= 0.25; z += 0.005) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (pick?.key === 'R') {
      topZ = z;
      break;
    }
  }
  const pick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, topZ));
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
  for (const key of ['R', 'dBdt']) {
    assert.ok(found.has(key), `expected to be able to aim ${key}, got keys: ${[...found.keys()].join(',')}`);
  }
});

test('pick value follows local X on the aimed track', () => {
  const panel = makePanel();
  // Hit near the right end of the dBdt track (bipolar −6.25…6.25).
  let dZ = null;
  for (let z = -0.22; z <= 0.22; z += 0.006) {
    const probe = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, z));
    if (probe?.key === 'dBdt') {
      dZ = z;
      break;
    }
  }
  assert.ok(dZ != null, 'could not locate dBdt row Z');
  const left = panel.userData.pickFromRay(rayTowardLocal(panel, -0.22, 0.03, dZ));
  const right = panel.userData.pickFromRay(rayTowardLocal(panel, 0.22, 0.03, dZ));
  assert.equal(left?.key, 'dBdt');
  assert.equal(right?.key, 'dBdt');
  assert.ok(left.value < 0, `left of bipolar dBdt should be negative, got ${left.value}`);
  assert.ok(right.value > 0, `right of bipolar dBdt should be positive, got ${right.value}`);
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

test('desk panel actionGroup resolves discrete buttons based on local X aim', async () => {
  const { getDeskSliderConfig } = await import('../src/deskSliderCatalog.js');
  const config = getDeskSliderConfig('electro', 'faraday_induction', { animChannel: 'B' });
  assert.ok(config.specs.length >= 6);

  const panel = createDeskSliderPanel({ stationId: 'electro', accentHex: '#ec4899', accentNum: 0xec4899 });
  panel.position.set(0, 0.9, 0);
  panel.updateMatrixWorld(true);
  panel.userData.setPresent(true);
  panel.userData.setSpecs(config.specs);
  panel.updateMatrixWorld(true);

  // Scan top row Z for actionGroup hits (感应·B / 动生·x / B→...)
  let topZ = null;
  for (let z = -0.35; z <= 0.35; z += 0.005) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, -0.18, 0.03, z));
    if (pick?.action === 'faraday-channel') {
      topZ = z;
      break;
    }
  }
  assert.ok(topZ != null, 'expected to find top row actionGroup Z');

  // Scan bottom row Z for actionGroup hits (反向 B / 播放变化 / 重置)
  let botZ = null;
  for (let z = -0.35; z <= 0.35; z += 0.005) {
    const pick = panel.userData.pickFromRay(rayTowardLocal(panel, -0.18, 0.03, z));
    if (pick?.action === 'faraday-reverse') {
      botZ = z;
      break;
    }
  }
  assert.ok(botZ != null, 'expected to find bottom row actionGroup Z');

  const leftPick = panel.userData.pickFromRay(rayTowardLocal(panel, -0.18, 0.03, topZ));
  const midPick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, topZ));
  const botMidPick = panel.userData.pickFromRay(rayTowardLocal(panel, 0, 0.03, botZ));

  assert.equal(leftPick?.action, 'faraday-channel');
  assert.equal(leftPick?.payload?.channel, 'B');
  assert.equal(midPick?.action, 'faraday-channel');
  assert.equal(midPick?.payload?.channel, 'x');
  assert.equal(botMidPick?.action, 'faraday-play');
});

