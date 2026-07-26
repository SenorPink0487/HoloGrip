/** Deterministic, host-authoritative practical 8-ball rules. */

export const GROUP = Object.freeze({ SOLIDS: 'solids', STRIPES: 'stripes' });

export function ballGroup(id) {
  if (id >= 1 && id <= 7) return GROUP.SOLIDS;
  if (id >= 9 && id <= 15) return GROUP.STRIPES;
  return null;
}

export function otherGroup(group) {
  return group === GROUP.SOLIDS ? GROUP.STRIPES : GROUP.SOLIDS;
}

export function createMatchState({ breakerSeat = 0, gameNumber = 1 } = {}) {
  return {
    gameNumber,
    phase: 'break',
    breakerSeat,
    turnSeat: breakerSeat,
    groups: [null, null],
    ballInHandSeat: null,
    winnerSeat: null,
    reason: '',
  };
}

export function remainingForGroup(pocketedIds, group) {
  const ids = group === GROUP.SOLIDS ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  return ids.filter((id) => !pocketedIds.includes(id)).length;
}

/**
 * Resolve a completed stroke. `events` comes from the host physics observer.
 * The result is intentionally serializable and can be broadcast verbatim.
 */
export function resolveShot(match, events, pocketedIds = []) {
  const next = structuredClone(match);
  const shooter = next.turnSeat;
  const first = events.firstContactId ?? null;
  const pocketed = [...new Set(events.pocketedIds || [])];
  const cueScratch = !!events.cueScratch || pocketed.includes(0);
  const ownGroup = next.groups[shooter];
  const opponent = 1 - shooter;
  const ownsCleared = ownGroup ? remainingForGroup(pocketedIds, ownGroup) === 0 : false;
  const expected = ownsCleared ? 8 : ownGroup;

  let foul = cueScratch;
  let foulReason = cueScratch ? '母球落袋，对手自由球' : '';
  if (first == null) {
    foul = true;
    foulReason ||= '未碰到目标球，对手自由球';
  } else if (expected === 8 ? first !== 8 : ownGroup && ballGroup(first) !== ownGroup) {
    foul = true;
    foulReason ||= '先碰错误目标球，对手自由球';
  }

  if (pocketed.includes(8)) {
    if (!ownsCleared || foul) {
      return { match: { ...next, phase: 'ended', winnerSeat: opponent, reason: '8号球提前或犯规入袋' }, foul, pocketed };
    }
    return { match: { ...next, phase: 'ended', winnerSeat: shooter, reason: '合法打进8号球' }, foul: false, pocketed };
  }

  // Table is open until the first legally pocketed object ball assigns groups.
  if (!ownGroup) {
    const assigned = pocketed.map(ballGroup).find(Boolean);
    if (assigned && !foul) {
      next.groups[shooter] = assigned;
      next.groups[opponent] = otherGroup(assigned);
    }
  }

  const shooterGroup = next.groups[shooter];
  const legallyPocketed = shooterGroup && pocketed.some((id) => ballGroup(id) === shooterGroup);
  if (foul) {
    next.turnSeat = opponent;
    next.ballInHandSeat = opponent;
    next.phase = 'playing';
    next.reason = foulReason;
  } else if (legallyPocketed) {
    next.ballInHandSeat = null;
    next.phase = 'playing';
    next.reason = '合法进球，继续击球';
  } else {
    next.turnSeat = opponent;
    next.ballInHandSeat = null;
    next.phase = 'playing';
    next.reason = '未进己方球，交换回合';
  }
  return { match: next, foul, pocketed };
}
