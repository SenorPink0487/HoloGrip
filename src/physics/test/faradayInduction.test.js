import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FARADAY_ROD_LENGTH,
  faradayArea,
  faradayEmfFromDelta,
  faradayFlux,
  faradaySense,
  createHandlers,
} from '../src/experiments/electro.js';
import { faradayBFromSliderPick } from '../src/holoScreen.js';
import { getDeskSliderConfig } from '../src/deskSliderCatalog.js';
import { STATION_EXPERIMENTS } from '../src/experiments/registry.js';

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

function faradayContext() {
  const state = { expId: 'faraday_induction', stepIndex: 0, data: {} };
  const mouseDrag = { holdLMB: false, movementX: 0, movementY: 0 };
  const equipment = {
    electro: {
      updateFaraday: () => {},
      setMode: () => {},
      mouseDrag,
    },
  };
  const handlers = createHandlers({
    state,
    equipment,
    toast: () => {},
    pushHud: () => {},
    advanceStep: () => {},
    setStep: (id) => {
      const steps = ['motion', 'field', 'conclude'];
      const idx = steps.indexOf(id);
      if (idx > state.stepIndex) state.stepIndex = idx;
    },
    currentStep: () => ({ id: 'motion' }),
    currentExp: () => null,
    currentStation: () => null,
  });
  state.data = handlers.initData('faraday_induction');
  return { state, handlers, mouseDrag };
}

test('Faraday apparatus is registered on the electromagnetism station', () => {
  const experiment = STATION_EXPERIMENTS.electro.experiments.find((item) => item.id === 'faraday_induction');
  assert.ok(experiment);
  assert.equal(experiment.steps.length, 3);
});

test('Faraday flux uses B times the sliding-rod area', () => {
  assert.equal(faradayArea(4.5), (4.5 - 0.25) * FARADAY_ROD_LENGTH);
  assert.equal(faradayFlux(-1, 4.5), -17);
  assert.equal(faradayFlux(0, 4.5), 0);
});

test('Faraday emf and Lenz direction obey sign and limiting cases', () => {
  assert.equal(faradayEmfFromDelta(2, 0.5), -4);
  assert.equal(faradaySense(1), 'cw');
  assert.equal(faradaySense(-1), 'ccw');
  assert.equal(faradaySense(0), 'none');
  assert.equal(faradayEmfFromDelta(0, 1), -0);
});

test('content-screen Faraday slider pick maps canvas px to B', () => {
  const pick = {
    action: 'faraday-b-slider',
    x: 100,
    w: 400,
    min: -3,
    max: 3,
  };
  assert.equal(faradayBFromSliderPick({ ...pick, px: 100 }), -3);
  assert.equal(faradayBFromSliderPick({ ...pick, px: 300 }), 0);
  assert.equal(faradayBFromSliderPick({ ...pick, px: 500 }), 3);
  assert.equal(faradayBFromSliderPick({ ...pick }), null);
});

test('Faraday defaults expose target B/x and duration for preset-then-play', () => {
  const { state } = faradayContext();
  assert.equal(state.data.animChannel, 'B');
  assert.ok(Number.isFinite(state.data.targetB));
  assert.ok(Number.isFinite(state.data.targetX));
  assert.ok(state.data.animDuration >= 0.3);
  assert.equal(state.data.pendingAnim, null);
});

test('Faraday animates B from current to target and records induction', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: -1 });
  handlers.onUiAction('faraday-set', { key: 'targetB', value: 2 });
  handlers.onUiAction('faraday-set', { key: 'animDuration', value: 1 });
  handlers.onUiAction('faraday-channel', { channel: 'B' });
  handlers.onUiAction('faraday-play', {});
  assert.ok(state.data.pendingAnim);
  assert.equal(state.data.pendingAnim.channel, 'B');
  close(state.data.pendingAnim.from, -1);
  close(state.data.pendingAnim.to, 2);

  // Advance through the smoothstep animation.
  for (let i = 0; i < 30; i += 1) handlers.update(0, 0.05);
  assert.equal(state.data.pendingAnim, null);
  close(state.data.B, 2, 1e-5);
  assert.ok(state.data.lastInduction);
  close(state.data.lastInduction.B0, -1, 1e-5);
  close(state.data.lastInduction.B1, 2, 1e-5);
  assert.ok(Math.abs(state.data.lastInduction.emf) > 0);
});

test('Faraday animates x from current to target and records motion', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'x', value: 3 });
  handlers.onUiAction('faraday-set', { key: 'targetX', value: 7 });
  handlers.onUiAction('faraday-set', { key: 'animDuration', value: 0.8 });
  handlers.onUiAction('faraday-channel', { channel: 'x' });
  handlers.onUiAction('faraday-play', {});
  assert.ok(state.data.pendingAnim);
  assert.equal(state.data.pendingAnim.channel, 'x');

  for (let i = 0; i < 30; i += 1) handlers.update(0, 0.05);
  assert.equal(state.data.pendingAnim, null);
  close(state.data.x, 7, 1e-5);
  assert.ok(state.data.lastMotion);
  close(state.data.lastMotion.x0, 3, 1e-5);
  close(state.data.lastMotion.x1, 7, 1e-5);
});

test('Faraday reverse B is a dynamic change to −B', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: 1.2 });
  handlers.onUiAction('faraday-reverse', {});
  assert.ok(state.data.pendingAnim);
  close(state.data.pendingAnim.to, -1.2, 1e-6);
  for (let i = 0; i < 40; i += 1) handlers.update(0, 0.05);
  close(state.data.B, -1.2, 1e-5);
  assert.ok(state.data.lastInduction);
});

test('live faraday-set x drag arms motional current while x changes', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: -1 });
  handlers.onUiAction('faraday-set', { key: 'x', value: 3 });
  // Live desk/content drag: begin motion measurement + update x.
  assert.equal(
    handlers.onUiAction('faraday-set', { key: 'x', value: 5, live: true }),
    true,
  );
  assert.equal(state.data.dragging, true);
  assert.ok(state.data.motionStart);
  close(state.data.x, 5);
  // One frame of velocity → non-zero emf / Lenz sense.
  handlers.update(0, 0.05);
  assert.notEqual(state.data.currentSense, 'none');
  assert.ok(Math.abs(state.data.liveEmf) > 1e-6);
  // Release finishes the motion record (same path as rod drag).
  handlers.endManipulation?.(null, { time: state.data._time });
  assert.equal(state.data.dragging, false);
  assert.ok(state.data.lastMotion);
  close(state.data.lastMotion.x0, 3, 1e-5);
  close(state.data.lastMotion.x1, 5, 1e-5);
});

test('AR rod drag synchronizes induction direction before the next fixed tick', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: -1 });
  const rod = { userData: { role: 'faraday_rod' } };
  assert.equal(handlers.beginManipulation(rod, { time: 0 }), true);
  assert.equal(handlers.updateManipulation(rod, { totalX: 80, dt: 1 / 30, dragged: true }), true);
  assert.notEqual(state.data.currentSense, 'none');
  assert.ok(Math.abs(state.data.liveEmf) > 1e-6);
  const forwardSense = state.data.currentSense;
  assert.equal(
    handlers.updateManipulation(rod, { totalX: 79, dt: 1 / 30, dragged: true }),
    true,
  );
  assert.equal(state.data.currentSense, forwardSense, 'one-pixel reverse jitter does not flip current');
  assert.equal(
    handlers.updateManipulation(rod, { totalX: 70, dt: 1 / 30, dragged: true }),
    true,
  );
  assert.notEqual(state.data.currentSense, forwardSense, 'a deliberate reverse drag flips current');
  handlers.update(0, 1 / 60);
  const direction = state.data.currentSense;
  handlers.update(0, 1 / 60);
  assert.equal(state.data.currentSense, direction, 'direction persists between sparse hand samples');
  assert.ok(state.data.currentLinger > 0);
});

test('live faraday-set B drag arms induction current while B changes', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: -1 });
  handlers.onUiAction('faraday-set', { key: 'x', value: 4.5 });
  assert.equal(
    handlers.onUiAction('faraday-set', { key: 'B', value: 1.5, live: true }),
    true,
  );
  assert.equal(state.data.sliderDragging, true);
  handlers.update(0, 0.05);
  assert.notEqual(state.data.currentSense, 'none');
  assert.ok(Math.abs(state.data.liveEmf) > 1e-6);
  handlers.endManipulation?.(null, { time: state.data._time });
  assert.equal(state.data.sliderDragging, false);
  assert.ok(state.data.lastInduction);
});

test('non-live faraday-set B/x does not leave a stuck gesture', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: 0.8 });
  handlers.onUiAction('faraday-set', { key: 'x', value: 3.2 });
  assert.equal(state.data.dragging, false);
  assert.equal(state.data.sliderDragging, false);
  close(state.data.B, 0.8);
  close(state.data.x, 3.2);
  // Preset-then-play still works after discrete setup sets.
  handlers.onUiAction('faraday-set', { key: 'targetB', value: -0.8 });
  handlers.onUiAction('faraday-play', {});
  assert.ok(state.data.pendingAnim);
});

test('manual parameter modification reverts played state to 播放变化', () => {
  const { state, handlers } = faradayContext();
  handlers.onUiAction('faraday-set', { key: 'B', value: -1 });
  handlers.onUiAction('faraday-set', { key: 'targetB', value: 2 });
  handlers.onUiAction('faraday-set', { key: 'animDuration', value: 1 });
  handlers.onUiAction('faraday-play', {});

  for (let i = 0; i < 30; i += 1) handlers.update(0, 0.05);
  assert.ok(state.data.lastInduction);

  let cfg = getDeskSliderConfig('electro', 'faraday_induction', state.data);
  let actionGrp = cfg.specs.find((s) => s.kind === 'actionGroup' && s.buttons?.some((it) => it.action === 'faraday-play'));
  let playBtn = actionGrp.buttons.find((it) => it.action === 'faraday-play');
  assert.equal(playBtn.label, '重复变化');

  // Manual parameter modification changes targetB -> reverts label to 播放变化
  handlers.onUiAction('faraday-set', { key: 'targetB', value: 2.5 });
  cfg = getDeskSliderConfig('electro', 'faraday_induction', state.data);
  actionGrp = cfg.specs.find((s) => s.kind === 'actionGroup' && s.buttons?.some((it) => it.action === 'faraday-play'));
  playBtn = actionGrp.buttons.find((it) => it.action === 'faraday-play');
  assert.equal(playBtn.label, '播放变化');
});
