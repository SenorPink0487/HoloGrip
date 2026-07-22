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

test('Hall terminal pinch commits a wire when release is over the second port', () => {
  const ctx = createContext({
    expId: 'hall_effect',
    stepId: 'configure',
    equipment: {
      electro: {
        startHallWirePreview: () => {},
        updateHallWirePreview: () => 'hh_red',
        cancelHallWirePreview: () => {},
        updateHall: () => {},
        setHallWiring: () => {},
      },
    },
  });
  const handlers = createElectroHandlers(ctx);
  ctx.state.data = handlers.initData('hall_effect');
  const from = { userData: { role: 'hall_terminal_output', portId: 'out_red' } };
  const to = { userData: { role: 'hall_terminal_helmholtz', portId: 'hh_red' } };

  assert.equal(handlers.beginManipulation(from), true);
  assert.equal(ctx.state.data.terminalDragFrom, 'out_red');
  assert.equal(handlers.endManipulation(from, { hoverTarget: to }), true);
  assert.deepEqual(ctx.state.data.wires, [['out_red', 'hh_red']]);
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

test('Hall data-table wheel and drag scroll move the record viewport', () => {
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
  // Seed more rows than a typical viewport so scrolling is meaningful.
  ctx.state.data.records = Array.from({ length: 20 }, (_, i) => ({
    target: 'helmholtz',
    pos: i,
    vh: i * 0.1,
    b: i * 0.01,
    Im: 0.5,
    Is: 5,
  }));
  ctx.state.data.tableScrollAuto = true;
  ctx.state.data.showCurve = false;

  const display = {
    userData: {
      type: 'holo_display',
      role: 'holo_display',
      hitRegions: [{
        action: 'hall-scroll-table',
        role: 'scrollable_table',
        maxRows: 8,
        maxStart: 12,
        rowH: 30,
      }],
    },
  };
  const tablePick = display.userData.hitRegions[0];

  // Wheel up from the auto-pinned bottom should reveal older rows.
  assert.equal(handlers.onWheel(-120, display, tablePick), true);
  assert.equal(ctx.state.data.tableScrollAuto, false);
  assert.ok(ctx.state.data.tableScrollTop < 12);

  const afterUp = ctx.state.data.tableScrollTop;
  // Wheel down moves back toward the newest rows.
  assert.equal(handlers.onWheel(120, display, tablePick), true);
  assert.ok(ctx.state.data.tableScrollTop > afterUp);

  // Drag-style pixel scroll (finger up → later rows).
  const beforeDrag = ctx.state.data.tableScrollTop;
  assert.equal(handlers.onUiAction('hall-scroll-table', {
    deltaPx: 90,
    rowH: 30,
    maxRows: 8,
    maxStart: 12,
  }), true);
  assert.equal(ctx.state.data.tableScrollTop, Math.min(12, beforeDrag + 3));
});

test('AR pinch-drag on the Hall data table scrolls like fullscreen drag', () => {
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
  ctx.state.data.records = Array.from({ length: 20 }, (_, i) => ({
    target: 'helmholtz', pos: i, vh: 0, b: 0, Im: 0.5, Is: 5,
  }));
  ctx.state.data.showCurve = false;
  ctx.state.data.tableScrollAuto = true;

  const tablePick = {
    action: 'hall-scroll-table',
    role: 'scrollable_table',
    maxRows: 8,
    maxStart: 12,
    rowH: 30,
    scrollable: true,
  };
  const display = {
    userData: {
      type: 'holo_display',
      role: 'holo_display',
      hitRegions: [tablePick],
      pickFromRay: () => tablePick,
    },
  };

  assert.equal(handlers.beginManipulation(display, { pick: tablePick, time: 0 }), true);
  assert.equal(!!ctx.state.data.tableScrollDrag?.armed, true);

  // Hand moves down on screen (positive dy) → earlier rows (leave auto bottom).
  handlers.updateManipulation(display, { dy: 120, dragged: true });
  assert.equal(ctx.state.data.tableScrollAuto, false);
  assert.ok(ctx.state.data.tableScrollTop < 12);

  const afterRevealOlder = ctx.state.data.tableScrollTop;
  // Hand moves up (negative dy) → later rows again.
  handlers.updateManipulation(display, { dy: -90, dragged: true });
  assert.ok(ctx.state.data.tableScrollTop > afterRevealOlder);

  assert.equal(handlers.endManipulation(display, { dragged: true }), true);
  assert.equal(ctx.state.data.tableScrollDrag, null);
});

test('content-screen Faraday B slider arms drag and follows absolute pick / relative move', () => {
  let lastB = null;
  const ctx = createContext({
    expId: 'faraday_induction',
    stepId: 'field',
    equipment: {
      electro: {
        updateFaraday: (data) => { lastB = data.B; },
        mouseDrag: { movementX: 0, movementY: 0, holdLMB: false },
      },
    },
  });
  const handlers = createElectroHandlers(ctx);
  ctx.state.data = handlers.initData('faraday_induction');
  const startB = ctx.state.data.B;

  const sliderPick = {
    action: 'faraday-b-slider',
    role: 'faraday-b-slider',
    x: 100,
    y: 200,
    w: 400,
    h: 66,
    min: -3,
    max: 3,
    // Midpoint of the track → B ≈ 0
    px: 300,
    py: 230,
  };
  const display = {
    userData: {
      type: 'holo_display',
      role: 'holo_display',
      pickFromRay: () => sliderPick,
    },
  };

  assert.equal(handlers.beginManipulation(display, { pick: sliderPick, time: 0 }), true);
  assert.equal(ctx.state.data.sliderDragging, true);
  assert.ok(Math.abs(ctx.state.data.B - 0) < 1e-6, 'absolute click maps mid-track to B≈0');
  assert.equal(lastB, ctx.state.data.B);

  // Relative drag must continue from the absolute value, not snap back to B0.
  handlers.updateManipulation(display, { totalX: 100, dragged: true });
  assert.ok(ctx.state.data.B > 0.5, `relative drag raises B from absolute anchor, got ${ctx.state.data.B}`);
  assert.notEqual(ctx.state.data.B, startB);

  assert.equal(handlers.endManipulation(display, { dragged: true }), true);
  assert.equal(ctx.state.data.sliderDragging, false);
  assert.ok(ctx.state.data.lastInduction, 'releasing the slider records an induction measurement');
  assert.equal(ctx.stepId, 'conclude');
});

test('Hall identify requires sequential order and reports correct/wrong picks', () => {
  const toasts = [];
  const partModes = {};
  const ctx = createContext({
    expId: 'hall_effect',
    stepId: 'identify',
    equipment: {
      electro: {
        setHallPartState: (role, mode) => { partModes[role] = mode; },
        clearHallIdentifyVisuals: () => {},
        updateHall: () => {},
        setHallWiring: () => {},
      },
    },
  });
  ctx.toast = (msg) => { toasts.push(msg); };
  const handlers = createElectroHandlers(ctx);
  ctx.state.data = handlers.initData('hall_effect');

  // Wrong order: console before helmholtz
  assert.equal(
    handlers.interact({ userData: { role: 'hall_console' } }, 0, { id: 'identify' }),
    true,
  );
  assert.equal(ctx.state.data.identified.hall_console, false);
  assert.equal(ctx.state.data.identifyFeedback.ok, false);
  assert.match(toasts.at(-1), /选错了|第 1 件|亥姆霍兹/);

  // Correct: first item
  assert.equal(
    handlers.interact({ userData: { role: 'hall_helmholtz' } }, 0, { id: 'identify' }),
    true,
  );
  assert.equal(ctx.state.data.identified.hall_helmholtz, true);
  assert.equal(ctx.state.data.identifyFeedback.ok, true);
  assert.match(toasts.at(-1), /正确|亥姆霍兹/);

  // Still wrong order: console while solenoid is next
  assert.equal(
    handlers.interact({ userData: { role: 'hall_console' } }, 0, { id: 'identify' }),
    true,
  );
  assert.equal(ctx.state.data.identified.hall_console, false);
  assert.equal(ctx.state.data.identifyFeedback.ok, false);

  // Complete remaining sequence
  for (const role of ['hall_solenoid', 'hall_probe', 'hall_console']) {
    assert.equal(
      handlers.interact({ userData: { role } }, 0, { id: 'identify' }),
      true,
    );
    assert.equal(ctx.state.data.identified[role], true);
    assert.equal(ctx.state.data.identifyFeedback.ok, true);
  }
  assert.equal(
    ['hall_helmholtz', 'hall_solenoid', 'hall_probe', 'hall_console']
      .every((role) => ctx.state.data.identified[role]),
    true,
  );
});
