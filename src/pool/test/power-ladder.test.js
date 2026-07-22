import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { BALL_R, BALL_Y, PHYSICS, TABLE_LENGTH } from '../constants.js';
import { ShotPredictor } from '../predict/shot-predictor.js';
import {
  analyzePowerSolve,
  POWER_HARD,
  POWER_SOFT,
  runPowerLadder,
} from '../predict/power-ladder.js';
import { buildShotLesson } from '../predict/shot-lesson.js';

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

test('runPowerLadder returns soft, current-ish, and hard samples', () => {
  const predictor = new ShotPredictor();
  const balls = fullTable([
    liveBall(0, -0.4, 0, { isCue: true }),
  ]);
  const ladder = runPowerLadder(predictor, balls, { x: 1, z: 0 }, 0.5, { maxTime: 6 });
  assert.ok(ladder.samples.length >= 2);
  assert.ok(ladder.samples[0].power01 <= ladder.samples[ladder.samples.length - 1].power01);
  assert.ok(ladder.current);
  const soft = ladder.samples[0];
  const hard = ladder.samples[ladder.samples.length - 1];
  // Higher power should travel at least as far (open table along +x)
  assert.ok(
    (hard.cueTravel ?? 0) + 0.02 >= (soft.cueTravel ?? 0),
    `hard ${hard.cueTravel} soft ${soft.cueTravel}`,
  );
});

test('analyzePowerSolve flags increase when only hard pockets object', () => {
  const ladder = {
    currentPower: 0.3,
    samples: [
      {
        power01: POWER_SOFT,
        isCurrent: false,
        label: '轻',
        cueTravel: 0.2,
        cuePocketed: false,
        pocketedIds: [],
        cushionHits: 0,
        cueFinal: { x: 0.2, z: 0 },
      },
      {
        power01: 0.3,
        isCurrent: true,
        label: '当前',
        cueTravel: 0.35,
        cuePocketed: false,
        pocketedIds: [],
        cushionHits: 0,
        cueFinal: { x: 0.35, z: 0 },
      },
      {
        power01: POWER_HARD,
        isCurrent: false,
        label: '重',
        cueTravel: 1.0,
        cuePocketed: false,
        pocketedIds: [3],
        cushionHits: 1,
        cueFinal: { x: 1.0, z: 0 },
      },
    ],
  };
  ladder.current = ladder.samples[1];
  const a = analyzePowerSolve(ladder);
  assert.equal(a.solveState, 'increase');
  assert.match(a.verdict, /力度|加|进袋/);
});

test('buildShotLesson frames power as the unknown', () => {
  const lesson = buildShotLesson(
    {
      cueId: 0,
      firstHit: {
        kind: 'ball-ball',
        otherId: 1,
        cutAngleDeg: 8,
        speedIn: 2,
        objSpeedOut: 1.7,
        cueSpeedOut: 0.1,
      },
      stats: { cushionHits: 0 },
      finals: [
        { id: 0, x: 0.05, z: 0, pocketed: false, moved: true },
        { id: 1, x: 0.8, z: 0, pocketed: false, moved: true },
      ],
    },
    [{ id: 0, isCue: true }, { id: 1, def: { name: '1' } }],
    {
      power01: 0.4,
      powerSolve: {
        solveState: 'increase',
        verdict: '大力才能进袋',
        hint: '加大力度',
        ladderLines: [{ text: '轻力 · 不入袋' }, { text: '大力 · 入袋' }],
      },
    },
  );
  assert.ok(lesson.steps.some((s) => s.id === 'launch' && /未知量|力度/.test(s.title + s.body)));
  assert.ok(lesson.steps.some((s) => s.id === 'given'));
  assert.match(lesson.headline, /力度|加力/);
  assert.equal(lesson.solveState, 'increase');
  assert.ok(lesson.concepts.includes('力度→初动能'));
});

// silence unused
void TABLE_LENGTH;
