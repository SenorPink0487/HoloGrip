import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJoystickInput, touchActionMode } from '../touch-controls.js';

test('joystick ignores its dead zone and normalizes diagonal travel', () => {
  assert.deepEqual(normalizeJoystickInput(6, 0, 80), { x: 0, y: 0, magnitude: 0 });
  const value = normalizeJoystickInput(80, 80, 80);
  assert.ok(Math.abs(value.magnitude - 1) < 1e-9);
  assert.ok(Math.abs(value.x - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(value.y - Math.SQRT1_2) < 1e-9);
});

test('joystick caps travel at its outer ring', () => {
  const value = normalizeJoystickInput(200, 0, 80);
  assert.equal(value.magnitude, 1);
  assert.equal(value.x, 1);
  assert.equal(value.y, 0);
});

test('touch action follows the pool game state', () => {
  assert.equal(touchActionMode('free'), 'enter');
  assert.equal(touchActionMode('aiming'), 'exit');
  assert.equal(touchActionMode('charging'), 'exit');
  assert.equal(touchActionMode('simulating'), 'waiting');
});
