import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShotLesson } from '../predict/shot-lesson.js';
import { samplePath } from '../predict/predict-replay.js';

const meta = [
  { id: 0, isCue: true, def: { name: '母球' } },
  { id: 1, isCue: false, def: { name: '1' } },
];

test('lesson treats aim as given and power as unknown', () => {
  const lesson = buildShotLesson(
    {
      cueId: 0,
      firstHit: {
        kind: 'ball-ball',
        otherId: 1,
        cutAngleDeg: 5,
        speedIn: 2,
        objSpeedOut: 1.8,
        cueSpeedOut: 0.1,
        point: { x: 0, z: 0 },
        normal: { x: 1, z: 0 },
      },
      stats: { cushionHits: 0 },
      finals: [
        { id: 0, x: 0.02, z: 0, pocketed: false, moved: true },
        { id: 1, x: 0.9, z: 0, pocketed: false, moved: true },
      ],
    },
    meta,
    { power01: 0.5 },
  );
  assert.ok(lesson.steps.some((s) => s.id === 'given'));
  assert.ok(lesson.steps.some((s) => s.id === 'launch' && /力度|未知/.test(s.title + s.body)));
  assert.ok(lesson.concepts.includes('力度→初动能'));
  assert.match(lesson.wonder, /力度/);
});

test('powerSolve increase shapes headline and rest conclusion', () => {
  const lesson = buildShotLesson(
    {
      cueId: 0,
      firstHit: {
        kind: 'ball-ball',
        otherId: 1,
        cutAngleDeg: 48,
        speedIn: 2,
        objSpeedOut: 0.5,
        cueSpeedOut: 1.6,
        point: { x: 0, z: 0 },
        normal: { x: 1, z: 0 },
      },
      stats: { cushionHits: 1 },
      finals: [
        { id: 0, x: 0.4, z: 0.1, pocketed: false, moved: true },
        { id: 1, x: 0.2, z: 0.3, pocketed: false, moved: true },
      ],
    },
    meta,
    {
      power01: 0.3,
      powerSolve: {
        solveState: 'increase',
        verdict: '大力才能进袋',
        hint: '加力',
        ladderLines: [{ text: '轻力 · 不入袋' }],
      },
    },
  );
  assert.match(lesson.headline, /偏小|加力|力度/);
  assert.equal(lesson.solveState, 'increase');
  assert.match(lesson.steps.find((s) => s.id === 'rest').body, /加大|加力|结论/);
});

test('samplePath is monotonic along a line', () => {
  const pts = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
  ];
  const a = samplePath(pts, 0);
  const b = samplePath(pts, 0.5);
  const c = samplePath(pts, 1);
  assert.equal(a.x, 0);
  assert.ok(Math.abs(b.x - 1) < 1e-9);
  assert.equal(c.x, 2);
});
