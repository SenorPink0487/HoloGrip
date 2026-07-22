/**
 * Aggregate dry mass, fuel, thrust, Isp → height, TWR, Δv, warnings.
 * Uses simplified rocket equations for demo purposes only.
 */

import {
  STAGE_PRESETS,
  ENGINE_PRESETS,
  NOSE_PRESETS,
  WING_PRESETS,
  DECOR_PRESETS,
  SIDE_BOOSTER_PRESETS,
  PROPELLANT_DENSITY,
} from './partsLibrary.js';
import { asStageDesign } from './compileFlight.js';
import { summarizeCraftResources, strutIntegrity } from './resources.js';
import { asCraft } from './craftGraph.js';

const G0 = 9.80665;

function cylinderVolume(diameter, height) {
  const r = diameter / 2;
  return Math.PI * r * r * height;
}

function stageStructureMass(stage) {
  const preset = STAGE_PRESETS[stage.preset] || STAGE_PRESETS.cylinder_std;
  const envelope = cylinderVolume(stage.diameter, stage.height);
  let mass = envelope * preset.structuralDensity;

  if (stage.nose?.preset) {
    const nose = NOSE_PRESETS[stage.nose.preset] || NOSE_PRESETS.ogive;
    mass += nose.dryMassKg * (stage.diameter / 9);
  }

  const eng = ENGINE_PRESETS[stage.engines?.preset] || ENGINE_PRESETS.raptor_sl;
  const count = Math.max(0, stage.engines?.count || 0);
  mass += eng.dryMassKg * count;

  for (const w of stage.wings || []) {
    const wp = WING_PRESETS[w.preset] || WING_PRESETS.flap_aft;
    mass += wp.dryMassKg * (w.count || 1) * (w.size || 1);
  }
  for (const d of stage.decor || []) {
    const dp = DECOR_PRESETS[d.preset] || DECOR_PRESETS.ring_weld;
    mass += dp.dryMassKg;
  }
  return mass;
}

function stageFuelMass(stage) {
  const preset = STAGE_PRESETS[stage.preset] || STAGE_PRESETS.cylinder_std;
  // Nose reduces tank length slightly
  let tankH = stage.height;
  if (stage.nose) {
    tankH = Math.max(stage.height * 0.55, stage.height - (stage.nose.height || 0) * 0.5);
  }
  const vol = cylinderVolume(stage.diameter, tankH) * preset.tankVolumeFactor;
  const fill = clamp01(stage.fuelFill ?? 0.85);
  return vol * PROPELLANT_DENSITY * fill;
}

function stageThrust(stage) {
  const eng = ENGINE_PRESETS[stage.engines?.preset] || ENGINE_PRESETS.raptor_sl;
  const count = Math.max(0, stage.engines?.count || 0);
  return eng.thrustN * count;
}

function stageIsp(stage) {
  const eng = ENGINE_PRESETS[stage.engines?.preset] || ENGINE_PRESETS.raptor_sl;
  return eng.ispSec;
}

function sideBoosterMasses(sb) {
  if (!sb || !sb.count) {
    return { dryKg: 0, fuelKg: 0, thrustN: 0, ispSec: 0, each: null };
  }
  const preset = SIDE_BOOSTER_PRESETS[sb.preset] || SIDE_BOOSTER_PRESETS.strap_std;
  const envelope = cylinderVolume(sb.diameter, sb.height);
  let dry = envelope * preset.structuralDensity;
  const eng = ENGINE_PRESETS[sb.engines?.preset] || ENGINE_PRESETS.merlin;
  const count = Math.max(0, sb.engines?.count || 0);
  dry += eng.dryMassKg * count;
  const fuel =
    cylinderVolume(sb.diameter, sb.height) *
    preset.tankVolumeFactor *
    PROPELLANT_DENSITY *
    clamp01(sb.fuelFill ?? 0.9);
  const thrust = eng.thrustN * count;
  return {
    dryKg: dry * sb.count,
    fuelKg: fuel * sb.count,
    thrustN: thrust * sb.count,
    ispSec: eng.ispSec,
    each: { dryKg: dry, fuelKg: fuel, thrustN: thrust, ispSec: eng.ispSec },
  };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param {object} design
 * @returns {PerformanceReport}
 */
export function calculateRocketPerformance(design) {
  const d = asStageDesign(design);
  const warnings = [...(d.warnings || [])];
  const stages = [];

  let totalHeight = 0;
  let maxDiameter = 0;
  let totalDry = 0;
  let totalFuel = 0;
  let liftoffThrust = 0;

  // Stack stages bottom → top for height
  for (let i = 0; i < d.stages.length; i++) {
    const st = d.stages[i];
    const dryKg = stageStructureMass(st);
    const fuelKg = stageFuelMass(st);
    const thrustN = stageThrust(st);
    const ispSec = stageIsp(st);
    const wetKg = dryKg + fuelKg;
    const stageHeight = st.height + (st.nose?.height || 0) * 0; // nose is inside height budget for default
    // For display: nose adds if not already included in height field.
    // Default Starship stores total stage height including nose in `height`.
    const displayHeight = st.height;

    if (!st.engines || st.engines.count <= 0) {
      warnings.push(`级 ${i + 1}（${st.name || st.role}）缺少发动机`);
    }
    if (st.height < 10) {
      warnings.push(`级 ${i + 1} 高度过短，结构可能不稳定`);
    }

    stages.push({
      index: i,
      id: st.id,
      role: st.role,
      name: st.name,
      heightM: displayHeight,
      diameterM: st.diameter,
      dryMassKg: dryKg,
      fuelMassKg: fuelKg,
      wetMassKg: wetKg,
      thrustN,
      ispSec,
      engineCount: st.engines?.count || 0,
      enginePreset: st.engines?.preset,
    });

    totalHeight += displayHeight;
    maxDiameter = Math.max(maxDiameter, st.diameter);
    totalDry += dryKg;
    totalFuel += fuelKg;

    // Liftoff thrust: first stage + side boosters (and upper if single stage)
    if (i === 0) liftoffThrust += thrustN;
  }

  // Overlap interstage ~0.3 m for two-stage like original stack
  if (d.stageCount === 2 && d.stages.length === 2) {
    totalHeight = Math.max(0, totalHeight - 0.3);
  }

  const side = sideBoosterMasses(d.sideBoosters);
  totalDry += side.dryKg;
  totalFuel += side.fuelKg;
  liftoffThrust += side.thrustN;

  if (d.sideBoosters?.count) {
    maxDiameter = Math.max(
      maxDiameter,
      d.stages[0].diameter + d.sideBoosters.diameter * 2 + 0.5
    );
  }

  const liftoffMassKg = totalDry + totalFuel;
  const weightN = liftoffMassKg * G0;
  const twr = weightN > 0 ? liftoffThrust / weightN : 0;

  if (d.stages.length === 0) {
    warnings.push('缺少级段结构');
  }
  if (liftoffThrust <= 0) {
    warnings.push('起飞推力为零 — 无法升空');
  }
  if (twr > 0 && twr < 1) {
    warnings.push(`推重比 ${twr.toFixed(2)} < 1 — 动力不足，点火后无法正常升空`);
  }
  if (twr >= 1 && twr < 1.05) {
    warnings.push(`推重比接近 1（${twr.toFixed(2)}）— 升空缓慢`);
  }
  if (totalFuel <= 0) {
    warnings.push('无推进剂装载');
  }

  // Sequential Δv estimate (Tsiolkovsky), side boosters burn with stage 0
  let remainingMass = liftoffMassKg;
  let totalDv = 0;
  const stageDv = [];

  // Side booster + first stage combined burn
  if (stages.length > 0) {
    const s0 = stages[0];
    const sideFuel = side.fuelKg;
    const sideDry = side.dryKg;
    const burnFuel = s0.fuelMassKg + sideFuel;
    const m0 = remainingMass;
    const mf = Math.max(1, m0 - burnFuel);
    // Effective Isp weighted by thrust contribution
    const t0 = s0.thrustN;
    const ts = side.thrustN;
    const ispEff =
      t0 + ts > 0
        ? (s0.ispSec * t0 + (side.ispSec || s0.ispSec) * ts) / (t0 + ts)
        : s0.ispSec;
    const dv0 = ispEff * G0 * Math.log(m0 / mf);
    stageDv.push({ index: 0, role: s0.role, deltaV: dv0, ispSec: ispEff });
    totalDv += dv0;
    // Drop side dry + stage 0 dry after burnout (staging)
    remainingMass = mf - sideDry;
    if (d.stageCount === 2 && stages.length > 1) {
      remainingMass -= s0.dryMassKg; // stage separation
      remainingMass = Math.max(stages[1].dryMassKg + stages[1].fuelMassKg, remainingMass);
    } else {
      remainingMass = Math.max(s0.dryMassKg, mf - sideDry);
    }
  }

  if (d.stageCount === 2 && stages.length > 1) {
    const s1 = stages[1];
    const m0 = Math.max(s1.wetMassKg, remainingMass);
    const mf = Math.max(1, m0 - s1.fuelMassKg);
    const dv1 = s1.ispSec * G0 * Math.log(m0 / mf);
    stageDv.push({ index: 1, role: s1.role, deltaV: dv1, ispSec: s1.ispSec });
    totalDv += dv1;
  }

  const canLiftOff = twr >= 1 && liftoffThrust > 0;
  const underpowered = twr > 0 && twr < 1;

  // Resources / connections (fuel lines, struts, crossfeed)
  let resources = null;
  let integrity = 0;
  try {
    const craft = asCraft(design);
    resources = summarizeCraftResources(craft);
    integrity = strutIntegrity(craft);
    for (const w of resources.warnings || []) {
      if (!warnings.includes(w)) warnings.push(w);
    }
    // Only nag about struts when side boosters exist without any strut
    if (integrity < 12 && (d.sideBoosters?.count || 0) > 0) {
      warnings.push('侧助推缺少支柱 — 建议添加 Strut 提高结构刚度');
    }
  } catch {
    /* ignore resource analysis failures */
  }

  return {
    totalHeightM: totalHeight,
    diameterM: maxDiameter,
    coreDiameterM: d.stages[0]?.diameter ?? 0,
    dryMassKg: totalDry,
    fuelMassKg: totalFuel,
    liftoffMassKg,
    totalThrustN: liftoffThrust,
    twr,
    deltaV: totalDv,
    stages,
    sideBoosters: {
      count: d.sideBoosters?.count || 0,
      dryMassKg: side.dryKg,
      fuelMassKg: side.fuelKg,
      thrustN: side.thrustN,
    },
    stageDeltaV: stageDv,
    warnings,
    canLiftOff,
    underpowered,
    stageCount: d.stageCount,
    hasInterstageSeparation: d.stageCount === 2,
    hasSideBoosterSeparation: (d.sideBoosters?.count || 0) > 0,
    resources,
    strutIntegrity: integrity,
  };
}
