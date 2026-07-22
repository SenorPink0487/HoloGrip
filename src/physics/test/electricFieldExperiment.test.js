import assert from 'node:assert/strict';
import test from 'node:test';

import {
  electricFieldAt,
  electricForceAt,
  electricPotentialAt,
  electricSourceForceAt,
  createHandlers,
} from '../src/experiments/electro.js';

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
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

test('single normalized point charge follows inverse-square behavior', () => {
  const charges = [{ id: 1, q: 1, x: 0, y: 0, z: 0 }];
  const e1 = electricFieldAt(charges, { x: 1, y: 0, z: 0 });
  const e2 = electricFieldAt(charges, { x: 2, y: 0, z: 0 });
  close(e1.x, 1);
  close(e2.x, 0.25);
});

test('charge reversal reverses field direction', () => {
  const positive = electricFieldAt([{ q: 1, x: 0, y: 0, z: 0 }], { x: 1, y: 0, z: 0 });
  const negative = electricFieldAt([{ q: -1, x: 0, y: 0, z: 0 }], { x: 1, y: 0, z: 0 });
  close(positive.x, -negative.x);
  close(positive.y, 0);
});

test('superposition, probe force scaling, and potential sign are consistent', () => {
  const charges = [
    { id: 1, q: 1, x: -1, y: 0, z: 0 },
    { id: 2, q: -1, x: 1, y: 0, z: 0 },
  ];
  const field = electricFieldAt(charges, { x: 0, y: 1, z: 0 });
  const force = electricForceAt(charges, { x: 0, y: 1, z: 0 }, 2);
  close(force.x, field.x * 2);
  close(force.y, field.y * 2);
  close(electricPotentialAt([{ q: 1, x: 0, y: 0, z: 0 }], { x: 2, y: 0, z: 0 }), 0.5);
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

  // AR / direct path: totalX/totalY alone must move the charge.
  handlers.updateManipulation(target, {
    totalX: 100,
    totalY: -100,
    dragged: true,
    dt: 1 / 60,
  });
  assert.equal(state.data.charges[0].x, 2.5);
  assert.equal(state.data.charges[0].y, 2.5);

  // Desktop mouseDrag facade path (holdInteract / unlocked pointer bridge).
  mouseDrag.movementX = 40;
  mouseDrag.movementY = 20;
  handlers.holdInteract(true, 0, 1 / 60, target);
  assert.equal(state.data.charges[0].x, 1);
  assert.equal(state.data.charges[0].y, -0.5);

  assert.equal(handlers.endManipulation(target), true);
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
