import test from 'node:test';
import assert from 'node:assert/strict';

import { hallDemoForce, hallDemoVoltage } from '../src/experiments/electro.js';
import {
  createHallDemoEquipment,
  hallCarrierKinematics,
} from '../src/experiments/hallDemoEquipment.js';
import { getHoloScreenLayoutSize } from '../src/holoScreen.js';

const base = Object.freeze({ I: 1, B: 1, n: 1, d: 0.5, nType: true });

// Node has no DOM; carrier textures only need a stub canvas.
const canvasStub = {
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    roundRect() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 40 }),
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
    if (tag === 'canvas') return { ...canvasStub, width: 128, height: 128 };
    return {};
  },
};

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

test('n-type and p-type pile on the same geometric face for fixed I,B', () => {
  const nKin = hallCarrierKinematics({ I: 1, B: 1, nType: true });
  const pKin = hallCarrierKinematics({ I: 1, B: 1, nType: false });
  assert.equal(nKin.flowDirection, -1, 'electrons drift opposite +I');
  assert.equal(pKin.flowDirection, 1, 'holes drift with +I');
  assert.equal(nKin.pileSide, pKin.pileSide, 'same pile face (q and v both reverse)');
  assert.equal(nKin.pileSide, -1, 'I>0,B>0 piles toward −Y');
});

test('flipping B reverses the Lorentz pile side', () => {
  const pos = hallCarrierKinematics({ I: 1, B: 1, nType: true });
  const neg = hallCarrierKinematics({ I: 1, B: -1, nType: true });
  assert.equal(pos.pileSide, -neg.pileSide);
  assert.notEqual(pos.pileSide, 0);
});

test('particle sim keeps bulk flow and only mild Hall-side bias (not edge-glued)', () => {
  const root = createHallDemoEquipment({ tabletop: true });
  const state = {
    I: 1,
    B: 1,
    n: 1,
    d: 0.5,
    nType: true,
    paused: false,
    autoCam: false,
    showB: true,
  };
  // Warm up to a quasi-steady Hall distribution.
  for (let i = 0; i < 180; i += 1) root.userData.update(state, 1 / 60);
  const stats = root.userData.getCarrierStats();
  const kin = hallCarrierKinematics(state);

  // Electrons drift −X.
  assert.ok(stats.meanVx < -0.4, `expected bulk −X drift, meanVx=${stats.meanVx}`);
  // Mild bias toward Lorentz face, not full collapse onto the wall.
  assert.ok(
    Math.sign(stats.meanY) === kin.pileSide || Math.abs(stats.meanY) < 0.05,
    `meanY=${stats.meanY} should bias toward pileSide=${kin.pileSide}`,
  );
  assert.ok(Math.abs(stats.meanY) < 0.75, `meanY too extreme (edge glued?): ${stats.meanY}`);
  assert.ok(
    stats.edgeFraction < 0.55,
    `too many carriers stuck on the Hall face: edgeFraction=${stats.edgeFraction}`,
  );

  // B = 0 → bias collapses toward center, drift remains.
  for (let i = 0; i < 120; i += 1) root.userData.update({ ...state, B: 0 }, 1 / 60);
  const zeroB = root.userData.getCarrierStats();
  assert.ok(zeroB.meanVx < -0.4, `B=0 should keep drift, meanVx=${zeroB.meanVx}`);
  assert.ok(Math.abs(zeroB.meanY) < Math.abs(stats.meanY) + 0.08, 'B=0 should reduce Hall bias');
});

test('hologram canvas sizes match dense layout table', () => {
  const hallDemo = getHoloScreenLayoutSize({
    active: true,
    hud: { running: true, experiment: { id: 'hall_carrier_demo' } },
  });
  assert.deepEqual(hallDemo, { width: 1024, height: 540 });

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
  assert.deepEqual(display, { width: 1280, height: 760 });

  const displayIdle = getHoloScreenLayoutSize({
    active: true,
    hud: { running: false, station: { experiments: [{}, {}] } },
    surface: 'display',
  });
  assert.deepEqual(displayIdle, { width: 1280, height: 780 });
});
