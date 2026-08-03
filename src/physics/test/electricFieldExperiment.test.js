import assert from 'node:assert/strict';
import test from 'node:test';

import {
  electricFieldAt,
  electricForceAt,
  electricPotentialAt,
  electricSourceForceAt,
  createHandlers,
  K_COULOMB,
  chargeUiToCoulomb,
} from '../src/experiments/electro.js';

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

function context() {
  const state = { expId: 'electric_field', stepIndex: 0, data: {} };
  const mouseDrag = { holdLMB: false, movementX: 0, movementY: 0 };
  const equipment = { electro: { updateElectricField: () => {}, mouseDrag } };
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
  assert.equal(state.data.showEquipot, true);
  handlers.onUiAction('electric-probe-sign', { sign: -1 });
  assert.equal(state.data.probe.q0, -1);
  handlers.onUiAction('electric-delete');
  assert.equal(state.data.charges.length, 11);
});

test('electric-field drag maps accumulated movement to X/Y and releases cleanly', () => {
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
  assert.equal(state.data.charges[0].y, 2.5);

  mouseDrag.movementX = 40;
  mouseDrag.movementY = 20;
  handlers.holdInteract(true, 0, 1 / 60, target);
  assert.equal(state.data.charges[0].x, 1);
  assert.equal(state.data.charges[0].y, -0.5);

  assert.equal(handlers.endManipulation(target), true);
  assert.equal(state.data.dragging, false);
});

test('electric-field axis locks freeze locked world axes during drag; wheel is disabled', () => {
  const { state, handlers } = context();
  const target = { userData: { role: 'electric_charge', chargeId: 1 } };

  // Lock Y only: mouse horizontal → X; vertical → Z (Y frozen).
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: true });
  assert.equal(state.data.axisLock.y, true);
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 80,
    totalY: -120,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 2); // 0 + 80 * 0.025
  assert.equal(state.data.charges[0].y, 0); // Y frozen
  // vertical→Z with zScale 0.035: -120 * 0.035 = -4.2 (mouse up pushes deeper)
  assert.equal(state.data.charges[0].z, -4.2);
  handlers.endManipulation(target);

  // Lock X+Y: any drag drives Z (horizontal also works).
  state.data.charges[0].x = 1;
  state.data.charges[0].y = 0.5;
  state.data.charges[0].z = 0;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'z', locked: false });
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 100, // mostly horizontal → still Z
    totalY: 10,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 1);
  assert.equal(state.data.charges[0].y, 0.5);
  // |dx| >> |dy| → drive = -dx = -100; oz = -100 * 0.035 = -3.5
  close(state.data.charges[0].z, -3.5, 1e-9);
  handlers.endManipulation(target);

  // Lock X, free Y: only Y moves (vertical maps to Y).
  state.data.charges[0].x = 1;
  state.data.charges[0].y = 0.5;
  state.data.charges[0].z = 0;
  handlers.onUiAction('electric-axis-lock', { axis: 'x', locked: true });
  handlers.onUiAction('electric-axis-lock', { axis: 'y', locked: false });
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, {
    totalX: 40,
    totalY: 80,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 1); // X frozen
  assert.equal(state.data.charges[0].y, 0.5 - 80 * 0.025); // -dy
  handlers.endManipulation(target);

  // Shift+drag vertical → Z while Y remains free.
  state.data.charges[0].x = 0;
  state.data.charges[0].y = 1;
  state.data.charges[0].z = 0;
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
  assert.equal(state.data.charges[0].y, 1); // Y unchanged under Shift
  close(state.data.charges[0].z, -1.4, 1e-9); // 0 + (-40) * 0.035 = -1.4 (mouse up pushes deeper)
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

test('electric-field charge id resolves from nested hit mesh parents', () => {
  const { state, handlers } = context();
  const parent = { userData: { role: 'electric_charge', chargeId: 1 }, parent: null };
  const nested = { userData: { role: 'electric_charge' }, parent };
  assert.equal(handlers.beginManipulation(nested), true);
  assert.equal(state.data.selectedId, 1);
  assert.equal(state.data.dragging, true);
  handlers.endManipulation(nested);
});
