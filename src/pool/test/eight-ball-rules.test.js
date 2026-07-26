import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP, createMatchState, resolveShot } from '../net/eight-ball-rules.js';

describe('eight ball rules', () => {
  it('assigns groups after a legal open-table pocket', () => {
    const result = resolveShot(createMatchState(), { firstContactId: 1, pocketedIds: [1] }, [0]);
    assert.equal(result.match.groups[0], GROUP.SOLIDS);
    assert.equal(result.match.turnSeat, 0);
  });

  it('hands ball in hand to opponent after scratch', () => {
    const match = { ...createMatchState({ breakerSeat: 0 }), phase: 'playing', groups: [GROUP.SOLIDS, GROUP.STRIPES] };
    const result = resolveShot(match, { firstContactId: 1, pocketedIds: [0], cueScratch: true }, [0]);
    assert.equal(result.foul, true);
    assert.equal(result.match.turnSeat, 1);
    assert.equal(result.match.ballInHandSeat, 1);
  });

  it('loses when 8 is pocketed before clearing own group', () => {
    const match = { ...createMatchState(), phase: 'playing', groups: [GROUP.SOLIDS, GROUP.STRIPES] };
    const result = resolveShot(match, { firstContactId: 8, pocketedIds: [8] }, [0]);
    assert.equal(result.match.winnerSeat, 1);
  });

  it('wins when 8 is pocketed after own group is clear', () => {
    const match = { ...createMatchState(), phase: 'playing', groups: [GROUP.SOLIDS, GROUP.STRIPES] };
    const result = resolveShot(match, { firstContactId: 8, pocketedIds: [8] }, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(result.match.winnerSeat, 0);
  });
});
