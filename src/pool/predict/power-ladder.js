import { cueVelocityFromAim } from './shot-predictor.js';

/** Soft / hard brackets used as fixed "what-if" powers for the same aim. */
export const POWER_SOFT = 0.22;
export const POWER_HARD = 0.88;

/**
 * @param {import('./shot-predictor.js').ShotPredictor} predictor
 * @param {Array} balls
 * @param {{ x: number, z: number }} dir  unit-ish shot direction
 * @param {number} currentPower  0..1
 * @param {{ cueId?: number, maxTime?: number }} [opts]
 */
export function runPowerLadder(predictor, balls, dir, currentPower, opts = {}) {
  const cueId = opts.cueId ?? 0;
  const maxTime = opts.maxTime ?? 10;
  const pCur = clamp01(currentPower);
  // Always include soft, current, hard — merge near-duplicates
  const raw = [POWER_SOFT, pCur, POWER_HARD];
  const powers = [];
  for (const p of raw) {
    if (!powers.some((q) => Math.abs(q - p) < 0.04)) powers.push(p);
  }
  powers.sort((a, b) => a - b);

  const samples = powers.map((power01) => {
    const isCurrent = Math.abs(power01 - pCur) < 0.04;
    const velocity = cueVelocityFromAim(dir.x, dir.z, power01);
    const result = predictor.predict(balls, velocity, {
      cueId,
      recordPaths: isCurrent,
      maxTime,
    });
    result.cueId = cueId;
    return summarizeSample(power01, result, cueId, isCurrent);
  });

  return {
    powers,
    currentPower: pCur,
    samples,
    current: samples.find((s) => s.isCurrent) ?? samples[Math.floor(samples.length / 2)],
  };
}

function summarizeSample(power01, result, cueId, isCurrent) {
  const cue = result.finals.find((f) => f.id === cueId);
  const start = result.starts?.get?.(cueId);
  let cueTravel = 0;
  if (cue && start && !cue.pocketed) {
    cueTravel = Math.hypot(cue.x - start.x, cue.z - start.z);
  } else if (cue?.pocketed) {
    cueTravel = Infinity;
  }
  // Peak travel from path if available
  const path = result.paths?.get?.(cueId);
  if (path && start && path.length > 1) {
    let peak = 0;
    for (const p of path) {
      peak = Math.max(peak, Math.hypot(p.x - start.x, p.z - start.z));
    }
    if (peak > cueTravel) cueTravel = peak;
  }

  const pocketedIds = result.pocketedIds ?? result.finals.filter((f) => f.pocketed).map((f) => f.id);
  const movedIds = result.finals.filter((f) => f.moved && !f.pocketed).map((f) => f.id);

  return {
    power01,
    isCurrent,
    label: powerLabel(power01, isCurrent),
    result,
    cueFinal: cue ?? null,
    cueTravel: Number.isFinite(cueTravel) ? cueTravel : null,
    cuePocketed: !!cue?.pocketed,
    pocketedIds,
    movedIds,
    cushionHits: result.stats?.cushionHits ?? 0,
    firstHit: result.firstHit ?? null,
  };
}

export function powerLabel(power01, isCurrent = false) {
  if (isCurrent) return `当前 ${pct(power01)}`;
  if (power01 <= POWER_SOFT + 0.05) return `轻力 ${pct(power01)}`;
  if (power01 >= POWER_HARD - 0.05) return `大力 ${pct(power01)}`;
  return `${pct(power01)}`;
}

function pct(p) {
  return `${Math.round(clamp01(p) * 100)}%`;
}

function clamp01(p) {
  return Math.min(1, Math.max(0, p));
}

/**
 * Compare soft / current / hard outcomes — the core "power is the unknown" analysis.
 * @param {ReturnType<typeof runPowerLadder>} ladder
 */
export function analyzePowerSolve(ladder) {
  const soft = ladder.samples.find((s) => s.power01 <= POWER_SOFT + 0.05) ?? ladder.samples[0];
  const hard = ladder.samples.find((s) => s.power01 >= POWER_HARD - 0.05)
    ?? ladder.samples[ladder.samples.length - 1];
  const cur = ladder.current;

  const softPockets = new Set(soft.pocketedIds);
  const hardPockets = new Set(hard.pocketedIds);
  const curPockets = new Set(cur.pocketedIds);

  /** Balls that only go in with enough power */
  const needsPower = [...hardPockets].filter((id) => id !== 0 && !softPockets.has(id));
  /** Scratch / cue pocket only at high power */
  const cueScratchHard = hard.cuePocketed && !soft.cuePocketed;
  const cueScratchCur = cur.cuePocketed;

  let verdict = '';
  let hint = '';
  let solveState = 'explore'; // explore | increase | decrease | window | ok

  if (needsPower.length > 0 && !needsPower.some((id) => curPockets.has(id))) {
    solveState = 'increase';
    verdict = `大力能让 ${needsPower.map(idLabel).join('、')} 入袋，轻力够不着——力度是进袋的关键未知量。`;
    hint = '保持瞄准，空格加大力度，看当前幽灵球何时与大力结果重合。';
  } else if (needsPower.length > 0 && needsPower.some((id) => curPockets.has(id))) {
    if (cueScratchCur) {
      solveState = 'decrease';
      verdict = '目标能进，但当前力度下母球也预计落袋——略减力度，找「进球且不进母球」的窗口。';
      hint = '力度过大时多余动能会把母球带进危险区。';
    } else {
      solveState = 'ok';
      verdict = `当前力度已覆盖进袋所需初动能（对照轻力：进不了；大力：也能进）。`;
      hint = '可以微调力度，观察走位是否仍合适。';
    }
  } else if (cueScratchHard && !soft.cuePocketed) {
    if (cueScratchCur) {
      solveState = 'decrease';
      verdict = '大力会把母球送袋；轻力则不会——用力度控制「冲过头」。';
      hint = '减小力度，让母球在袋口前耗尽动能。';
    } else {
      solveState = 'window';
      verdict = '存在力度窗口：太大会母球落袋，太小可能走位不够。';
      hint = '在轻力与大力之间搜索安全停点。';
    }
  } else {
    // Distance / cushion comparison
    const st = soft.cueTravel ?? 0;
    const ht = hard.cueTravel ?? 0;
    const ct = cur.cueTravel ?? 0;
    if (ht > st + 0.15) {
      verdict = `同一瞄准下，力度主要改「走多远」：轻力约 ${fmtM(st)}，大力约 ${fmtM(ht)}，当前约 ${fmtM(ct)}。`;
      if (cur.cushionHits > soft.cushionHits) {
        verdict += ' 当前已比轻力多碰库——更大动能才折线。';
      }
      hint = '只改力度、不改方向，落点沿能量耗尽位置移动（碰库后会折）。';
      solveState = 'explore';
    } else {
      verdict = '此瞄准下轻力与大力落点接近（可能很快碰球/碰库把速度分走）。';
      hint = '可先改薄厚球（方向），再把力度当精细未知量。';
      solveState = 'explore';
    }
  }

  // Ordered travel for UI
  const ladderLines = ladder.samples.map((s) => {
    const pocketTxt = s.pocketedIds.length
      ? `入袋[${s.pocketedIds.map(idLabel).join(',')}]`
      : '不入袋';
    const dist = s.cuePocketed ? '母球入袋' : `母球走位≈${fmtM(s.cueTravel ?? 0)}`;
    return {
      power01: s.power01,
      isCurrent: s.isCurrent,
      text: `${s.label} · ${dist} · ${pocketTxt} · 碰库${s.cushionHits}次`,
    };
  });

  return {
    soft,
    hard,
    current: cur,
    verdict,
    hint,
    solveState,
    needsPower,
    ladderLines,
    cueScratchHard,
  };
}

function idLabel(id) {
  return id === 0 ? '母球' : `${id}号`;
}

function fmtM(x) {
  if (!Number.isFinite(x)) return '—';
  return `${x.toFixed(2)} m`;
}
