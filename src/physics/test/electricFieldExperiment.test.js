import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  electricFieldAt,
  electricForceAt,
  electricPotentialAt,
  electricSourceForceAt,
  createHandlers,
  K_COULOMB,
  chargeUiToCoulomb,
} from '../src/experiments/electro.js';
import { drawHoloScreen, getHoloScreenLayoutSize, pickHoloScreen } from '../src/holoScreen.js';

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

function context(customEquipment = null) {
  const state = { expId: 'electric_field', stepIndex: 0, data: {} };
  const mouseDrag = { holdLMB: false, movementX: 0, movementY: 0 };
  const equipment = customEquipment || { electro: { updateElectricField: () => {}, mouseDrag } };
  const handlers = createHandlers({
    state,
    equipment,
    toast: () => {},
    pushHud: () => {},
    advanceStep: () => {},
    setStep: () => {},
    currentStep: () => ({ id: 'explore' }),
    currentExp: () => null,
    currentStation: () => null,
  });
  state.data = handlers.initData('electric_field');
  return { state, handlers, mouseDrag };
}

test('point charge field uses SI Coulomb law E = kQ/r²', () => {
  const charges = [{ id: 1, q: 1, x: 0, y: 0, z: 0 }]; // 1 μC
  const e1 = electricFieldAt(charges, { x: 1, y: 0, z: 0 });
  const e2 = electricFieldAt(charges, { x: 2, y: 0, z: 0 });
  const Q = chargeUiToCoulomb(1);
  close(e1.x, (K_COULOMB * Q) / 1 ** 2);
  close(e2.x, (K_COULOMB * Q) / 2 ** 2);
  // inverse-square ratio
  close(e1.x / e2.x, 4, 1e-8);
});

test('charge reversal reverses field direction', () => {
  const positive = electricFieldAt([{ q: 1, x: 0, y: 0, z: 0 }], { x: 1, y: 0, z: 0 });
  const negative = electricFieldAt([{ q: -1, x: 0, y: 0, z: 0 }], { x: 1, y: 0, z: 0 });
  close(positive.x, -negative.x);
  close(positive.y, 0);
});

test('superposition, probe force F=qE, and potential φ=kQ/r', () => {
  const charges = [
    { id: 1, q: 1, x: -1, y: 0, z: 0 },
    { id: 2, q: -1, x: 1, y: 0, z: 0 },
  ];
  const field = electricFieldAt(charges, { x: 0, y: 1, z: 0 });
  const force = electricForceAt(charges, { x: 0, y: 1, z: 0 }, 2); // 2 μC
  const qC = chargeUiToCoulomb(2);
  close(force.x, field.x * qC);
  close(force.y, field.y * qC);

  const Q = chargeUiToCoulomb(1);
  close(
    electricPotentialAt([{ q: 1, x: 0, y: 0, z: 0 }], { x: 2, y: 0, z: 0 }),
    (K_COULOMB * Q) / 2,
  );

  const sourceForce = electricSourceForceAt([
    { id: 1, q: 1, x: 0, y: 0, z: 0 },
    { id: 2, q: 1, x: 2, y: 0, z: 0 },
  ], 1);
  assert.ok(sourceForce.x < 0);
});

test('near-field singularity is guarded', () => {
  const field = electricFieldAt([{ q: 2, x: 0, y: 0, z: 0 }], { x: 0.001, y: 0, z: 0 });
  assert.deepEqual(field, { x: 0, y: 0, z: 0 });
});

test('electric-field controller supports add/delete, limits, toggles and probe edits', () => {
  const { state, handlers } = context();
  for (let i = 0; i < 20; i += 1) handlers.onUiAction('electric-add', { sign: i % 2 ? -1 : 1 });
  assert.equal(state.data.charges.length, 12);
  assert.equal(state.data.selectedId, 12);
  handlers.onUiAction('electric-move', { axis: 'x', delta: 99 });
  assert.equal(state.data.charges.at(-1).x, 4.5);
  handlers.onUiAction('electric-probe-move', { axis: 'z', delta: -99 });
  assert.equal(state.data.probe.z, -5);
  handlers.onUiAction('electric-toggle', { key: 'equipot' });
  assert.equal(state.data.showEquipot, 'flat');
  handlers.onUiAction('electric-toggle', { key: 'equipot' });
  assert.equal(state.data.showEquipot, 'concentric');
  handlers.onUiAction('electric-toggle', { key: 'equipot' });
  assert.equal(state.data.showEquipot, false);
  handlers.onUiAction('electric-toggle', { key: 'gauss' });
  assert.equal(state.data.showGauss, true);
  handlers.onUiAction('electric-toggle', { key: 'gauss' });
  assert.equal(state.data.showGauss, false);
  handlers.onUiAction('electric-probe-sign', { sign: -1 });
  assert.equal(state.data.probe.q0, -1);
  handlers.onUiAction('electric-delete');
  assert.equal(state.data.charges.length, 11);
});

test('electric-field drag maps accumulated movement to X/Z and releases cleanly', () => {
  const { state, handlers, mouseDrag } = context();
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };
  assert.equal(handlers.beginManipulation(target), true);
  assert.equal(state.data.dragging, true);

  handlers.updateManipulation(target, {
    totalX: 100,
    totalY: -100,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 2.5);
  assert.equal(state.data.charges[0].z, 2.5);

  mouseDrag.movementX = 40;
  mouseDrag.movementY = 20;
  handlers.holdInteract(true, 0, 1 / 60, target);
  assert.equal(state.data.charges[0].x, 1);
  assert.equal(state.data.charges[0].z, -0.5);

  assert.equal(handlers.endManipulation(target), true);
  assert.equal(state.data.dragging, false);
});

test('electric-field axis locks freeze locked world axes during drag; wheel is disabled', () => {
  const { state, handlers } = context();
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };

  // Lock Z only: mouse horizontal → X; vertical → Y (Z frozen).
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: true });
  assert.equal(state.data.axisLock.z, true);
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 80,
    totalY: -120,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 2); // 0 + 80 * 0.025
  assert.equal(state.data.charges[0].z, 0); // Z frozen
  // vertical→Y with scale 0.025: (-120) * (-1) * 0.025 = 3.0 (mouse up moves towards +Z / screen left)
  assert.equal(state.data.charges[0].y, 3);
  handlers.endManipulation(target);

  // Lock X+Z: any drag drives Y (horizontal also works).
  state.data.charges[0].x = 1;
  state.data.charges[0].y = 0;
  state.data.charges[0].z = 0.5;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: false });
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 100, // mostly horizontal → still Y
    totalY: 10,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 1);
  assert.equal(state.data.charges[0].z, 0.5);
  // |dx| >> |dy| → drive = dx = 100; oy = 100 * 0.025 = 2.5
  close(state.data.charges[0].y, 2.5, 1e-9);
  handlers.endManipulation(target);

  // Lock X+Y: only Z moves (vertical maps to Z).
  state.data.charges[0].x = 1;
  state.data.charges[0].y = 0.5;
  state.data.charges[0].z = 0;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: false });
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 40,
    totalY: 80,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 1); // X frozen
  assert.equal(state.data.charges[0].y, 0.5); // Y frozen
  assert.equal(state.data.charges[0].z, -80 * 0.025); // -dy
  handlers.endManipulation(target);

  // Shift+drag vertical → Y while Z remains free.
  state.data.charges[0].x = 0;
  state.data.charges[0].y = 0;
  state.data.charges[0].z = 1;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: false });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: false });
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: false });
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 0,
    totalY: -40,
    shiftKey: true,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].z, 1); // Z unchanged under Shift
  close(state.data.charges[0].y, 1.0, 1e-9); // 0 + (-40) * (-1) * 0.025 = 1.0 (mouse up moves towards +Z / screen left)
  handlers.endManipulation(target);

  // Wheel adjusts Z when unlocked.
  state.data.charges[0].z = 0;
  assert.equal(handlers.onWheel(-100, target), true);
  assert.equal(state.data.charges[0].z, 0.2);

  // Z lock blocks wheel.
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: true });
  const zLocked = state.data.charges[0].z;
  assert.equal(handlers.onWheel(-100, target), false);
  assert.equal(state.data.charges[0].z, zLocked);

  // Keyboard X/Y/Z toggles locks.
  const beforeX = state.data.axisLock.x;
  handlers.onKey('KeyX');
  assert.equal(state.data.axisLock.x, !beforeX);
});

test('electric-field raycaster drag maps crosshair 3D ray directly to charge position', () => {
  const { state, handlers } = context();
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };
  state.data.charges[0].x = 0;
  state.data.charges[0].y = 0;
  state.data.charges[0].z = 0;
  state.data.axisLock = { x: false, y: false, z: false };

  assert.equal(handlers.beginManipulation(target), true);

  // Mock raycaster pointing down at (1.3, y=0, 2.6) in local space (scaled by 0.13: hit=(0.169, 0, 0.338))
  const raycaster = {
    ray: {
      origin: new THREE.Vector3(0.169, 10, 0.338),
      direction: new THREE.Vector3(0, -1, 0),
    },
  };

  assert.equal(handlers.updateManipulation(target, { raycaster }), true);
  close(state.data.charges[0].x, 1.3, 1e-4);
  close(state.data.charges[0].y, 2.6, 1e-4);

  handlers.endManipulation(target);
});

test('electric-field coordinate axes remain anchored during drag and update on release', () => {
  const { state, handlers } = context();
  const chargeTarget = { userData: { role: 'electric_charge', chargeId: state.data.charges[0].id } };
  state.data.charges[0].x = 1;
  state.data.charges[0].y = 2;
  state.data.charges[0].z = 0;

  assert.equal(handlers.beginManipulation(chargeTarget), true);
  assert.equal(state.data.dragging, true);
  assert.deepEqual(state.data.dragStart, { x: 1, y: 2, z: 0 });

  // During drag, charge moves but dragStart remains fixed as axis anchor
  state.data.charges[0].x = 3.5;
  assert.deepEqual(state.data.dragStart, { x: 1, y: 2, z: 0 });

  // On release, drag clears and new position becomes active axis center
  handlers.endManipulation(chargeTarget);
  assert.equal(state.data.dragging, false);
});

test('electric-field charge id resolves from nested hit mesh parents', () => {
  const { state, handlers } = context();
  const parent = { userData: { role: 'electric_charge', chargeId: 1 }, parent: null };
  const nested = { userData: { role: 'electric_charge' }, parent };
  assert.equal(handlers.beginManipulation(nested), true);
  assert.equal(state.data.selectedId, 1);
  assert.equal(state.data.dragging, true);
  handlers.endManipulation(nested);
});

test('electric-field content screen renders full controls without error', () => {
  const station = { id: 'electro', name: '电磁学实验台' };
  const experiment = { id: 'electric_field', name: '静电场探索' };
  const hud = {
    station,
    experiment,
    running: true,
    data: {
      charges: [{ id: 1, q: 1, x: 0, y: 0, z: 0 }],
      probe: { x: 0, y: 0, z: 0, q0: 1 },
      axisLock: {},
    },
  };
  const layout = getHoloScreenLayoutSize({ active: true, hud, surface: 'display' });
  const stubCtx = {
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {},
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, fill() {}, stroke() {}, addColorStop() {},
    createLinearGradient() { return { addColorStop() {} }; },
    measureText(t) { return { width: t.length * 10 }; },
  };
  const res = drawHoloScreen(stubCtx, layout.width, layout.height, {
    active: true,
    hud,
    surface: 'display',
    fullTitle: '电磁学实验台',
    enTitle: 'ELECTROMAGNETISM',
  });
  assert.ok(res.hits.length >= 10, 'content display must yield hit targets for all controls');
  const actions = res.hits.map((h) => h.action);
  assert.ok(actions.includes('electric-toggle'));
  assert.ok(actions.includes('electric-select'));
  assert.ok(actions.includes('electric-add'));
  assert.ok(actions.includes('electric-reset'));
  assert.ok(actions.includes('electric-probe-sign'));
  assert.ok(actions.includes('electric-axis-lock'));
  const locks = res.hits.filter((hit) => hit.action === 'electric-axis-lock');
  assert.deepEqual(locks.map((hit) => hit.axis), ['x', 'y', 'z']);
  for (const lock of locks) {
    const u = (lock.x + lock.w / 2) / layout.width;
    const v = 1 - (lock.y + lock.h / 2) / layout.height;
    const picked = pickHoloScreen(u, v, layout.width, layout.height, res.hits, 1);
    assert.equal(picked?.action, 'electric-axis-lock');
    assert.equal(picked?.axis, lock.axis);
  }
});

test('electric-field side camera view drag projects deltas without inversion', () => {
  const mockCamera = {
    // Camera on right side (+X) looking towards -X (quaternion rotates (0,0,-1) to (-1,0,0))
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  };
  const mockEquipment = {
    electro: {
      getCamera: () => mockCamera,
      mouseDrag: {},
    },
  };
  const { state, handlers } = context(mockEquipment);
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };
  state.data.charges = [{ id: 1, q: 1, x: 0, y: 0, z: 0 }];
  state.data.selectedId = 1;

  // Lock Z so dragging moves freely on desk floor (XY plane)
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: false });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: false });

  assert.equal(handlers.beginManipulation(target), true);

  // Dragging mouse to the LEFT (totalX < 0) in side view (+Z is screen-left)
  handlers.updateManipulation(target, {
    totalX: -80,
    totalY: 0,
    dragged: true,
    dt: 1 / 60,
  });

  // In this side-view projection, dragging LEFT must increase experiment Y.
  assert.ok(state.data.charges[0].y > 0, `charge.y should increase when dragging left in side view, got ${state.data.charges[0].y}`);
  handlers.endManipulation(target);
});

test('electric-field side camera keeps single free Y axis under the cursor', () => {
  const mockCamera = {
    // Camera on +X looking toward -X: scene +Z / experiment +Y is screen-left.
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  };
  const { state, handlers } = context({
    electro: { getCamera: () => mockCamera, mouseDrag: {} },
  });
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };
  state.data.charges = [{ id: 1, q: 1, x: 0, y: 0, z: 0 }];
  state.data.selectedId = 1;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: false });

  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, { totalX: -80, totalY: 0, dragged: true, dt: 1 / 60 });
  assert.ok(state.data.charges[0].y > 0, `left drag should increase Y in side view, got ${state.data.charges[0].y}`);
  handlers.endManipulation(target);
});

