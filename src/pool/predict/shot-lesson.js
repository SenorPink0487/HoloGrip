/**
 * Shot lesson with **power as the unknown** in the problem.
 * Aim / cut angle are treated as given conditions; 力度 is what you solve for.
 */

import { POWER_HARD, POWER_SOFT } from './power-ladder.js';

function ballName(id, meta = []) {
  const m = meta.find((b) => b.id === id);
  if (m?.isCue || id === 0) return '母球';
  if (m?.def?.name) return `${m.def.name} 号`;
  return `${id} 号球`;
}

function fmtAngle(deg) {
  if (!Number.isFinite(deg)) return '—';
  return `${Math.round(deg)}°`;
}

function pct(p) {
  return `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;
}

function classifyCut(cutAngleDeg) {
  if (cutAngleDeg == null) return null;
  if (cutAngleDeg < 12) return 'headOn';
  if (cutAngleDeg < 25) return 'thick';
  if (cutAngleDeg < 40) return 'half';
  if (cutAngleDeg < 55) return 'thin';
  return 'veryThin';
}

const CUT_LABEL = {
  headOn: '近似正碰',
  thick: '厚球（大切）',
  half: '半球位',
  thin: '薄球',
  veryThin: '极薄球',
};

/**
 * @param {object} result  current-power predict() output
 * @param {Array} ballMeta
 * @param {{ power01?: number, powerSolve?: object | null }} [ctx]
 */
export function buildShotLesson(result, ballMeta = [], ctx = {}) {
  const cueId = result.cueId ?? 0;
  const hit = result.firstHit ?? null;
  const cutKind = hit ? classifyCut(hit.cutAngleDeg) : null;
  const moved = (result.finals || []).filter((f) => f.moved || f.pocketed);
  const pocketed = (result.finals || []).filter((f) => f.pocketed);
  const cueFinal = (result.finals || []).find((f) => f.id === cueId);
  const power01 = ctx.power01 ?? 0.42;
  const solve = ctx.powerSolve ?? null;

  const steps = [];

  // ── 1. Given: aim / contact geometry (not the unknown)
  if (hit && hit.kind === 'ball-ball') {
    const objName = ballName(hit.otherId, ballMeta);
    const cutLabel = CUT_LABEL[cutKind] || '碰撞';
    steps.push({
      id: 'given',
      title: '已知 · 瞄准',
      body: `${cutLabel}（切角约 ${fmtAngle(hit.cutAngleDeg)}），冲量沿连心线传给 ${objName}。`
        + ' 方向决定「往哪传」，先当作本题条件固定。',
    });
  } else if (hit && hit.kind === 'cushion') {
    steps.push({
      id: 'given',
      title: '已知 · 瞄准',
      body: '当前瞄准会先碰库再走位。路线形状主要由方向决定；能走多远、会不会进袋，仍取决于力度。',
    });
  } else {
    steps.push({
      id: 'given',
      title: '已知 · 瞄准',
      body: '未碰到其他球时，母球沿瞄准方向减速。落点距离几乎只由初动能（力度）和台呢摩擦决定。',
    });
  }

  // ── 2. Unknown: power / initial KE
  let powerBody = `未知量是力度（当前 ${pct(power01)}）。`
    + ' 力度越大，母球初速度越大，平动动能大致按速度平方增加，滑动阶段更长，最终停点通常更远。';
  if (power01 < POWER_SOFT + 0.08) {
    powerBody += ' 你偏轻力：适合短距离、防冲库/防进母球。';
  } else if (power01 > POWER_HARD - 0.1) {
    powerBody += ' 你偏大力：走位远、易连锁，也更容易「冲过头」。';
  } else {
    powerBody += ' 对照桌上的轻力/大力标记，看当前解落在哪一档。';
  }
  steps.push({ id: 'launch', title: '未知量 · 力度', body: powerBody });

  // ── 3. Solve: compare ladder outcomes
  if (solve?.verdict) {
    steps.push({
      id: 'contact',
      title: '对照 · 轻 / 当前 / 重',
      body: solve.verdict + (solve.hint ? ` ${solve.hint}` : ''),
    });
  } else if (hit && hit.kind === 'ball-ball') {
    const objName = ballName(hit.otherId, ballMeta);
    let body = '同一瞄准下改力度：';
    if (cutKind === 'headOn') {
      body += `${objName}分到的速度随力度升高——正碰时目标球路程对力度很敏感。`;
    } else {
      body += `切角已定，${objName}的出射方向大体不变，但路程和是否进袋随力度变。`;
    }
    steps.push({ id: 'contact', title: '对照 · 力度效应', body });
  } else {
    steps.push({
      id: 'contact',
      title: '对照 · 力度效应',
      body: '轻力与大力幽灵点可对比：若大力才碰库/进袋，说明存在「阈值动能」——力度必须跨过它。',
    });
  }

  // ── 4. Answer: landing under current power
  let restBody = `在力度 ${pct(power01)} 下的解：`;
  if (pocketed.length > 0) {
    restBody += ` 预计入袋 ${pocketed.map((f) => ballName(f.id, ballMeta)).join('、')}。`;
  } else {
    restBody += ' 无入袋。';
  }
  if (cueFinal?.pocketed) {
    restBody += ' 母球预计落袋（常被看作力度过大）。';
  } else if (cueFinal?.moved) {
    restBody += ` 母球停点 (${cueFinal.x.toFixed(2)}, ${cueFinal.z.toFixed(2)}) m。`;
  }
  if (solve?.solveState === 'increase') {
    restBody += ' → 结论：加大力度。';
  } else if (solve?.solveState === 'decrease') {
    restBody += ' → 结论：减小力度。';
  } else if (solve?.solveState === 'ok') {
    restBody += ' → 结论：力度已进入可行区。';
  } else if (solve?.solveState === 'window') {
    restBody += ' → 结论：在轻力与大力之间搜索窗口。';
  }
  steps.push({ id: 'rest', title: '本题解 · 当前落点', body: restBody });

  // Headline — power first
  let headline = `力度解题 · 当前 ${pct(power01)}`;
  if (solve?.solveState === 'increase') {
    headline = `力度偏小 · 加力才能到目标`;
  } else if (solve?.solveState === 'decrease') {
    headline = `力度偏大 · 减力防冲过头`;
  } else if (solve?.solveState === 'ok') {
    headline = `力度可行 · ${pct(power01)} 已覆盖需求`;
  } else if (solve?.solveState === 'window') {
    headline = `力度窗口 · 在轻力与大力之间找`;
  } else if (cutKind) {
    headline = `${CUT_LABEL[cutKind]} · 用力度决定走多远`;
  }

  const concepts = ['力度→初动能', '摩擦耗能'];
  if (hit?.kind === 'ball-ball') concepts.push('切角（已知）', '动量传递');
  if ((result.stats?.cushionHits ?? 0) > 0) concepts.push('碰库阈值');
  if (pocketed.length > 0) concepts.push('进袋动能');

  let wonder = '只改力度、不改瞄准：落点距离怎么变？会不会突然多一次碰库？';
  if (solve?.solveState === 'increase') {
    wonder = '进袋所需的最小力度大约在哪？从轻力往上加，哪一档幽灵球第一次进袋？';
  } else if (solve?.solveState === 'decrease') {
    wonder = '从大力往下减，哪一档母球不再进袋，而目标球仍能进？';
  } else if (cutKind === 'headOn') {
    wonder = '正碰时目标球路程几乎只靠力度：力度减半，停点大概会怎样（不必精确，先猜再看）？';
  }

  const landingLines = (solve?.ladderLines || []).map((l) => l.text);
  if (landingLines.length === 0) {
    for (const f of moved.slice(0, 5)) {
      const name = ballName(f.id, ballMeta);
      if (f.pocketed) landingLines.push(`${name} → 入袋`);
      else landingLines.push(`${name} → (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`);
    }
  }

  return {
    headline,
    steps,
    concepts,
    wonder,
    landingLines,
    cutKind,
    cutAngleDeg: hit?.cutAngleDeg ?? null,
    firstHit: hit,
    hasMotion: moved.length > 0,
    power01,
    solveState: solve?.solveState ?? 'explore',
    powerVerdict: solve?.verdict ?? '',
    powerHint: solve?.hint ?? '',
    kicker: '力度解题',
  };
}
