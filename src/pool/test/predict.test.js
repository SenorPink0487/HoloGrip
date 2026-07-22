import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { BALL_R, BALL_Y, PHYSICS, TABLE_LENGTH, TABLE_WIDTH } from '../constants.js';
import { ShotPredictor, cueVelocityFromAim } from '../predict/shot-predictor.js';

function liveBall(id, x, z, { pocketed = false, isCue = false } = {}) {
  const body = new CANNON.Body({
    mass: PHYSICS.ballMass,
    shape: new CANNON.Sphere(BALL_R),
    position: new CANNON.Vec3(x, BALL_Y, z),
  });
  return { id, body, pocketed, isCue };
}

function fullTable(onTable) {
  const balls = [];
  for (let id = 0; id < 16; id++) {
    const live = onTable.find((b) => b.id === id);
    if (live) balls.push(live);
    else balls.push(liveBall(id, 0, 0, { pocketed: true }));
  }
  return balls;
}

test('cueVelocityFromAim scales with power along aim direction', () => {
  const low = cueVelocityFromAim(1, 0, 0);
  const high = cueVelocityFromAim(1, 0, 1);
  assert.ok(high.x > low.x);
  assert.ok(Math.abs(low.z) < 1e-9);
  const diag = cueVelocityFromAim(1, 1, 0.5);
  assert.ok(Math.abs(diag.x - diag.z) < 1e-9);
});

test('head-on shot transfers motion; object path reaches the far side before any bounce-back', () => {
  const predictor = new ShotPredictor();
  const gap = 0.002;
  const balls = fullTable([
    liveBall(0, 0, 0, { isCue: true }),
    liveBall(1, 2 * BALL_R + gap, 0),
  ]);

  const result = predictor.predict(balls, { x: 2.2, z: 0 }, { recordPaths: true, maxTime: 10 });
  const cue = result.finals.find((f) => f.id === 0);
  const obj = result.finals.find((f) => f.id === 1);
  assert.ok(obj && cue);
  assert.equal(obj.pocketed, false);
  assert.ok(obj.moved, 'object should be marked moved even if it bounces back near start');
  const path = result.paths.get(1);
  assert.ok(path && path.length >= 2, 'object path recorded');
  const maxX = Math.max(...path.map((p) => p.x));
  assert.ok(maxX > 0.8, `object should travel well past contact, maxX=${maxX}`);
  assert.ok(result.steps > 10);
  assert.ok(result.firstHit, 'records first hit for teaching');
  assert.equal(result.firstHit.kind, 'ball-ball');
  assert.ok(result.firstHit.cutAngleDeg < 15, 'near head-on cut angle');
});

test('shot toward corner can pocket the cue', () => {
  const predictor = new ShotPredictor();
  const balls = fullTable([
    liveBall(0, TABLE_LENGTH / 2 - 0.2, TABLE_WIDTH / 2 - 0.2, { isCue: true }),
  ]);
  const result = predictor.predict(balls, { x: 3, z: 3 }, { maxTime: 10 });
  const cue = result.finals.find((f) => f.id === 0);
  assert.ok(cue.moved || cue.pocketed, JSON.stringify(cue));
});

test('zero cue velocity leaves balls unmoved', () => {
  const predictor = new ShotPredictor();
  const balls = fullTable([
    liveBall(0, -0.5, 0, { isCue: true }),
    liveBall(1, 0.5, 0.1),
  ]);
  const result = predictor.predict(balls, { x: 0, z: 0 }, { maxTime: 2 });
  const cue = result.finals.find((f) => f.id === 0);
  const obj = result.finals.find((f) => f.id === 1);
  assert.equal(cue.moved, false);
  assert.equal(obj.moved, false);
  assert.ok(Math.abs(cue.x - (-0.5)) < 0.02);
});
