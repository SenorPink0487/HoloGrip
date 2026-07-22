import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormulaBoard, buildLandingRows, formulaBoardToHtml } from '../predict/formula-board.js';

test('buildFormulaBoard includes power and energy blocks', () => {
  const board = buildFormulaBoard(
    {
      cueId: 0,
      steps: 100,
      firstHit: {
        kind: 'ball-ball',
        otherId: 1,
        cutAngleDeg: 12,
        normal: { x: 1, z: 0 },
        speedIn: 2,
        cueSpeedOut: 0.1,
        objSpeedOut: 1.8,
      },
      finals: [
        { id: 0, x: 0.1, z: 0, moved: true, pocketed: false },
        { id: 1, x: 0.8, z: 0, moved: true, pocketed: false },
      ],
    },
    0.5,
    [{ id: 0, isCue: true }, { id: 1, def: { name: '1' } }],
    { dirX: 1, dirZ: 0 },
  );
  assert.ok(board.v0 > 0);
  assert.ok(board.Ek0 > 0);
  assert.ok(board.blocks.some((b) => b.title.includes('初速度')));
  assert.ok(board.blocks.some((b) => b.title.includes('动能')));
  assert.ok(board.blocks.some((b) => b.title.includes('首碰')));
  const html = formulaBoardToHtml(board);
  assert.match(html, /formula-block/);
});

test('buildLandingRows skips already-pocketed live balls', () => {
  const rows = buildLandingRows(
    {
      finals: [
        { id: 0, x: 0, z: 0, moved: true, pocketed: false },
        { id: 2, x: 0, z: 0, moved: false, pocketed: true },
      ],
    },
    [
      { id: 0, isCue: true, pocketed: false },
      { id: 2, pocketed: true, def: { name: '2' } },
    ],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 0);
});
