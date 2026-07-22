import test from 'node:test';
import assert from 'node:assert/strict';

import { hallDemoForce, hallDemoVoltage } from '../src/experiments/electro.js';
import { getHoloScreenLayoutSize } from '../src/holoScreen.js';

const base = Object.freeze({ I: 1, B: 1, n: 1, d: 0.5, nType: true });

test('Hall carrier demo preserves source polarity and reversal behavior', () => {
  assert.equal(hallDemoVoltage(base), -1);
  assert.equal(hallDemoVoltage({ ...base, B: -1 }), 1);
  assert.equal(hallDemoVoltage({ ...base, nType: false }), 1);
});

test('Hall carrier demo obeys proportionality and limiting cases', () => {
  assert.equal(hallDemoVoltage({ ...base, I: 0 }), 0);
  assert.equal(hallDemoVoltage({ ...base, B: 0 }), 0);
  assert.equal(hallDemoVoltage({ ...base, I: 2 }), -2);
  assert.equal(hallDemoVoltage({ ...base, n: 2 }), -0.5);
  assert.equal(hallDemoVoltage({ ...base, d: 1 }), -0.5);
  assert.equal(hallDemoForce({ ...base, I: 2, B: -1.5 }), 3);
});

test('hologram canvas grows to fit dense experiment controls', () => {
  const hallDemo = getHoloScreenLayoutSize({
    active: true,
    hud: { running: true, experiment: { id: 'hall_carrier_demo' } },
  });
  assert.deepEqual(hallDemo, { width: 1024, height: 640 });

  const menu = getHoloScreenLayoutSize({
    active: true,
    hud: { station: { experiments: [{}, {}, {}, {}] } },
  });
  assert.ok(menu.height > 720);
});

test('selector surface stays menu-sized while display hosts experiment content', () => {
  const runningHud = {
    running: true,
    experiment: { id: 'hall_carrier_demo' },
    station: { experiments: [{}, {}, {}] },
  };
  const selector = getHoloScreenLayoutSize({
    active: true,
    hud: runningHud,
    surface: 'selector',
  });
  assert.ok(selector.height < 920);
  assert.ok(selector.height >= 720);

  const display = getHoloScreenLayoutSize({
    active: true,
    hud: runningHud,
    surface: 'display',
  });
  assert.deepEqual(display, { width: 1280, height: 920 });

  const displayIdle = getHoloScreenLayoutSize({
    active: true,
    hud: { running: false, station: { experiments: [{}, {}] } },
    surface: 'display',
  });
  assert.deepEqual(displayIdle, { width: 1280, height: 780 });
});
