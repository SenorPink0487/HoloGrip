import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FARADAY_ROD_LENGTH,
  faradayArea,
  faradayEmfFromDelta,
  faradayFlux,
  faradaySense,
} from '../src/experiments/electro.js';
import { faradayBFromSliderPick } from '../src/holoScreen.js';
import { STATION_EXPERIMENTS } from '../src/experiments/registry.js';

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
