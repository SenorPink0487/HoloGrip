import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandlers as createMechanicsHandlers } from '../src/experiments/mechanics.js';
import { createHandlers as createOpticsHandlers } from '../src/experiments/optics.js';
import { createHandlers as createElectroHandlers } from '../src/experiments/electro.js';

function createContext({ expId, stepId, equipment }) {
  const state = { expId, stepIndex: 0, data: {} };
  let activeStep = stepId;
  return {
    state,
    equipment,
    toast: () => {},
    pushHud: () => {},
    advanceStep: () => {},
    setStep: (id) => { activeStep = id; },
    currentStep: () => ({ id: activeStep }),
    currentExp: () => null,
    currentStation: () => null,
    get stepId() { return activeStep; },
  };
}

test('AR mechanics drag changes pendulum length within its physical rail', () => {
  let visualLength = 0;
  const ctx = createContext({
    expId: 'pendulum_g',
    stepId: 'set_L',
    equipment: { mechanics: { setPendulumLength: (value) => { visualLength = value; } } },
  });
  const handlers = createMechanicsHandlers(ctx);
  ctx.state.data = handlers.initData('pendulum_g');
  const target = { userData: { role: 'pendulum_bob' } };
  assert.equal(handlers.beginManipulation(target), true);
  handlers.updateManipulation(target, { totalY: -1000, dragged: true });
  assert.equal(ctx.state.data.L, 1);
  assert.equal(visualLength, 1);
  handlers.endManipulation(target, { dragged: true });
  assert.equal(ctx.stepId, 'pull');
});

test('AR spring mass drag snaps to the supported mass set', () => {
  const ctx = createContext({ expId: 'spring_k', stepId: 'set_m', equipment: { mechanics: {} } });
  const handlers = createMechanicsHandlers(ctx);
  ctx.state.data = handlers.initData('spring_k');
  const target = { userData: { role: 'spring_mass' } };
  handlers.beginManipulation(target);
  handlers.updateManipulation(target, { totalY: -60, dragged: true });
  assert.equal(ctx.state.data.m, 0.3);
  handlers.endManipulation(target, { dragged: true });
  assert.equal(ctx.stepId, 'oscillate');
});

test('AR optics distinguishes a source tap from a wavelength drag', () => {
  const ctx = createContext({
    expId: 'multi_slit_diffraction',
    stepId: 'setup',
    equipment: { optics: { updateOptics: () => {} } },
  });
  const handlers = createOpticsHandlers(ctx);
  ctx.state.data = handlers.initData('multi_slit_diffraction');
  const source = { userData: { role: 'diff_source' } };
  const initialWavelength = ctx.state.data.lambdaNm;
  handlers.beginManipulation(source);
  handlers.updateManipulation(source, { totalX: 100, dragged: true });
  handlers.endManipulation(source, { dragged: true });
  assert.ok(ctx.state.data.lambdaNm > initialWavelength);
  assert.equal(ctx.state.data.lightOn, true);

  handlers.beginManipulation(source);
  handlers.endManipulation(source, { dragged: false });
  assert.equal(ctx.state.data.lightOn, false);
});

test('AR tracking loss cancels an unfinished Hall terminal wire', () => {
  let cancelled = 0;
  const ctx = createContext({
    expId: 'hall_effect',
    stepId: 'configure',
    equipment: {
      electro: {
        startHallWirePreview: () => {},
        cancelHallWirePreview: () => { cancelled += 1; },
        updateHall: () => {},
        setHallWiring: () => {},
      },
    },
  });
  const handlers = createElectroHandlers(ctx);
  ctx.state.data = handlers.initData('hall_effect');
  const terminal = { userData: { role: 'hall_terminal_output', portId: 'im_red' } };
  handlers.beginManipulation(terminal);
  assert.equal(ctx.state.data.terminalDragFrom, 'im_red');
  handlers.endManipulation(terminal, { cancelled: true });
  assert.equal(ctx.state.data.terminalDragFrom, null);
  assert.equal(ctx.state.data.wires.length, 0);
  assert.equal(cancelled, 1);
});

test('Hall console clicks do not record unless the explicit record action is used', () => {
  const ctx = createContext({
    expId: 'hall_effect',
    stepId: 'scan',
    equipment: {
      electro: {
        updateHall: () => {},
        setHallWiring: () => {},
      },
    },
  });
  const handlers = createElectroHandlers(ctx);
  ctx.state.data = handlers.initData('hall_effect');

  const consoleTarget = { userData: { role: 'hall_console' } };
  assert.equal(handlers.interact(consoleTarget, 0, { id: 'scan' }), false);
  assert.equal(ctx.state.data.records.length, 0);

  const recordAction = { userData: { role: 'ui_action' } };
  assert.equal(handlers.interact(recordAction, 0, { id: 'scan' }), true);
  assert.equal(ctx.state.data.records.length, 1);
});
