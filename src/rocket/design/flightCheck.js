/**
 * Friendly launch readiness check — red / yellow / green one-liners.
 * More approachable than raw Δv tables for new builders.
 */

import { calculateRocketPerformance } from './performance.js';
import { asCraft, getPart, listChildren } from './craftGraph.js';
import { getPartDef } from './partDefs.js';
import { walkStackChain, splitStagesFromChain, compileFlightProjection } from './compileFlight.js';

/** @typedef {'green'|'yellow'|'red'} CheckLevel */

/**
 * @typedef {{
 *   level: CheckLevel,
 *   canLaunch: boolean,
 *   headline: string,
 *   summary: string,
 *   checks: Array<{ id: string, level: CheckLevel, label: string, detail?: string }>,
 *   tips: string[],
 *   wizard: { step: number, label: string, done: boolean, hint: string }[],
 *   perf: object,
 * }} FlightCheckReport
 */

/**
 * Run full launch gate + wizard progress for a craft.
 * @param {object} design
 * @returns {FlightCheckReport}
 */
export function evaluateFlightCheck(design) {
  const craft = asCraft(design);
  const perf = calculateRocketPerformance(craft);
  const proj = compileFlightProjection(craft);
  const checks = [];
  const tips = [];

  const partCount = Object.keys(craft.parts || {}).length;
  const hasRoot = !!craft.rootId && !!getPart(craft, craft.rootId);
  const chain = hasRoot ? walkStackChain(craft) : [];
  const { lower, upper, decoupler } = splitStagesFromChain(chain);

  // ── Structural checks ──────────────────────────────────
  if (!hasRoot || partCount === 0) {
    checks.push({
      id: 'root',
      level: 'red',
      label: '没有箭体',
      detail: '先从模板开始，或放一个贮箱作根件',
    });
  } else {
    checks.push({ id: 'root', level: 'green', label: '已有箭体结构' });
  }

  const engines = Object.values(craft.parts || {}).filter(
    (p) => getPartDef(p.defId)?.category === 'engine'
  );
  const totalEngCount = engines.reduce((s, p) => s + Math.max(1, p.params?.count || 1), 0);
  if (totalEngCount <= 0) {
    checks.push({
      id: 'engine',
      level: 'red',
      label: '没有发动机',
      detail: '在芯级底部挂上发动机',
    });
  } else {
    checks.push({
      id: 'engine',
      level: 'green',
      label: `发动机 ×${totalEngCount}`,
    });
  }

  if (perf.fuelMassKg <= 0) {
    checks.push({
      id: 'fuel',
      level: 'red',
      label: '没有推进剂',
      detail: '提高贮箱燃料装载，或换更大贮箱',
    });
  } else if (perf.fuelMassKg < 5000) {
    checks.push({
      id: 'fuel',
      level: 'yellow',
      label: '燃料偏少',
      detail: '能离地，但射程有限',
    });
  } else {
    checks.push({ id: 'fuel', level: 'green', label: '燃料充足' });
  }

  // TWR
  if (perf.totalThrustN <= 0) {
    checks.push({
      id: 'twr',
      level: 'red',
      label: '推力为零',
      detail: '无法点火升空',
    });
  } else if (perf.twr < 1) {
    checks.push({
      id: 'twr',
      level: 'red',
      label: `推不动（TWR ${perf.twr.toFixed(2)}）`,
      detail: '增加发动机数量或减轻结构 / 减小贮箱',
    });
    tips.push('TWR < 1：点火后抬不起脚，先加推力或减重');
  } else if (perf.twr < 1.2) {
    checks.push({
      id: 'twr',
      level: 'yellow',
      label: `勉强离地（TWR ${perf.twr.toFixed(2)}）`,
      detail: '建议 ≥ 1.2，爬升会更稳',
    });
    tips.push('TWR 偏低：再加几台发动机会更安心');
  } else {
    checks.push({
      id: 'twr',
      level: 'green',
      label: `推重比良好（${perf.twr.toFixed(2)}）`,
    });
  }

  // Staging / multi-stage
  if (proj.stageCount >= 2 && decoupler) {
    checks.push({ id: 'staging', level: 'green', label: '两级 + 分离环就绪' });
  } else if (proj.stageCount >= 2 && !decoupler) {
    checks.push({
      id: 'staging',
      level: 'yellow',
      label: '多级但缺分离环',
      detail: '级间请加「标准级间分离环」',
    });
    tips.push('没有分离环 → 只能当单级飞');
  } else {
    checks.push({
      id: 'staging',
      level: 'yellow',
      label: '单级构型',
      detail: '可以飞；加分离环可拆两级',
    });
  }

  // Nose / fairing
  const hasNose = Object.values(craft.parts || {}).some(
    (p) => getPartDef(p.defId)?.category === 'nose'
  );
  if (!hasNose && hasRoot) {
    checks.push({
      id: 'nose',
      level: 'yellow',
      label: '未装鼻锥/整流',
      detail: '不影响起飞，但外形不完整',
    });
  } else if (hasNose) {
    checks.push({ id: 'nose', level: 'green', label: '已装鼻锥/整流' });
  }

  // Side boosters without struts (already in perf warnings)
  if ((proj.sideBoosters?.count || 0) > 0 && (perf.strutIntegrity || 0) < 12) {
    checks.push({
      id: 'strut',
      level: 'yellow',
      label: '侧助推建议加支柱',
      detail: '专家模式可用支柱工具加固',
    });
  }

  // CoM-ish sanity: very top-heavy (tall thin with engines only at bottom is ok)
  // Flag if height >> diameter * 20 and single engine
  if (perf.totalHeightM > 0 && perf.coreDiameterM > 0) {
    const aspect = perf.totalHeightM / perf.coreDiameterM;
    if (aspect > 22 && totalEngCount <= 2) {
      checks.push({
        id: 'com',
        level: 'yellow',
        label: '细长箭体',
        detail: '质心偏高风险 — 演示飞行仍可用',
      });
    } else {
      checks.push({ id: 'com', level: 'green', label: '构型比例正常' });
    }
  }

  // Aggregate level
  const hasRed = checks.some((c) => c.level === 'red');
  const hasYellow = checks.some((c) => c.level === 'yellow');
  const level = hasRed ? 'red' : hasYellow ? 'yellow' : 'green';
  const canLaunch = !hasRed && perf.canLiftOff && perf.twr >= 1 && totalEngCount > 0 && hasRoot;

  let headline;
  let summary;
  if (!hasRoot) {
    headline = '还不能飞';
    summary = '请先选一个模板，或放置贮箱作为根件';
  } else if (level === 'red') {
    const top = checks.find((c) => c.level === 'red');
    headline = top?.label || '还不能飞';
    summary = top?.detail || '请先修复红色检查项';
  } else if (level === 'yellow') {
    headline = canLaunch ? '可以发射（有提醒）' : '接近就绪';
    summary = checks.find((c) => c.level === 'yellow')?.detail || '有可改进项，但不拦发射';
  } else {
    headline = '可以发射';
    summary = `TWR ${perf.twr.toFixed(2)} · 质量 ${formatMassShort(perf.liftoffMassKg)} · 就绪`;
  }

  // Wizard steps: core → engine → nose
  const wizard = buildWizardSteps(craft, { hasRoot, totalEngCount, hasNose, lower, upper });

  return {
    level,
    canLaunch,
    headline,
    summary,
    checks,
    tips: tips.slice(0, 4),
    wizard,
    perf,
  };
}

function buildWizardSteps(craft, ctx) {
  const step1Done = ctx.hasRoot;
  let step2Done = ctx.totalEngCount > 0;
  // Prefer engines on lower/core tank
  if (ctx.hasRoot && craft.rootId) {
    const kids = listChildren(craft, craft.rootId);
    const engOnRoot = kids.some((ch) => getPartDef(ch.defId)?.category === 'engine');
    if (engOnRoot) step2Done = true;
  }
  const step3Done = ctx.hasNose;

  return [
    {
      step: 1,
      label: '选芯级',
      done: step1Done,
      hint: step1Done ? '已有根贮箱' : '点模板或从零件库放「贮箱级段」',
    },
    {
      step: 2,
      label: '加发动机',
      done: step2Done,
      hint: step2Done ? '底部已有推力' : '选发动机 → 吸附到芯级底部',
    },
    {
      step: 3,
      label: '加鼻锥',
      done: step3Done,
      hint: step3Done ? '顶部已封口' : '选鼻锥 → 吸附到最上面贮箱顶部',
    },
  ];
}

function formatMassShort(kg) {
  if (kg >= 1e6) return `${(kg / 1e6).toFixed(1)}kt`;
  if (kg >= 1e3) return `${(kg / 1e3).toFixed(0)}t`;
  return `${Math.round(kg)}kg`;
}

/**
 * Compact strip token for status bar.
 * @param {FlightCheckReport} report
 */
export function flightCheckStripHtml(report) {
  const icon = report.level === 'green' ? '●' : report.level === 'yellow' ? '▲' : '✖';
  return { icon, level: report.level, text: report.headline };
}
