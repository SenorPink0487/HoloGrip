// Hall effect physics and experiment data helpers.

export const E_CHARGE = 1.602e-19; // C

export const MATERIALS = {
  N_Ge: {
    id: 'N_Ge',
    name: 'N 型锗',
    carrierType: 'N',
    carrierDensity: 6.3e20,
    mobility: 0.38,
    defaultThicknessMm: 0.5,
    note: '适合观察负霍尔系数，霍尔电压符号为负。',
  },
  P_Ge: {
    id: 'P_Ge',
    name: 'P 型锗',
    carrierType: 'P',
    carrierDensity: 4.8e20,
    mobility: 0.18,
    defaultThicknessMm: 0.5,
    note: '适合观察正霍尔系数，霍尔电压符号为正。',
  },
  N_Si: {
    id: 'N_Si',
    name: 'N 型硅',
    carrierType: 'N',
    carrierDensity: 8.5e21,
    mobility: 0.135,
    defaultThicknessMm: 0.5,
    note: '载流子浓度较高，霍尔电压更小。',
  },
  P_Si: {
    id: 'P_Si',
    name: 'P 型硅',
    carrierType: 'P',
    carrierDensity: 6.8e21,
    mobility: 0.048,
    defaultThicknessMm: 0.5,
    note: '空穴迁移率较低，漂移速度较小。',
  },
};

export const CARRIER_N = {
  N: MATERIALS.N_Ge.carrierDensity,
  P: MATERIALS.P_Ge.carrierDensity,
};

const DEFAULT_NOISE = {
  enabled: true,
  relativeNoise: 0.008,
  resolutionMv: 0.001,
  random: Math.random,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nearlyEqual(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

export function getMaterial(materialId, carrierType = 'N') {
  const fallbackId = carrierType === 'P' ? 'P_Ge' : 'N_Ge';
  return MATERIALS[materialId] || MATERIALS[fallbackId];
}

export function calibrateMagneticField(magnetCurrentA = 0, options = {}) {
  const {
    saturationT = 1.55,
    linearGain = 0.82,
    residualT = 0,
  } = options;
  const current = Math.max(0, Number(magnetCurrentA) || 0);
  const saturated = saturationT * Math.tanh((linearGain * current) / saturationT);
  return clamp(residualT + saturated, 0, saturationT);
}

export function simulateMeasurement(valueMv, options = {}) {
  const cfg = { ...DEFAULT_NOISE, ...options };
  if (!cfg.enabled) {
    return {
      valueMv,
      noiseMv: 0,
      resolutionMv: cfg.resolutionMv,
    };
  }

  const span = Math.max(Math.abs(valueMv) * cfg.relativeNoise, cfg.resolutionMv);
  const unit = (cfg.random() - 0.5) * 2;
  const noiseMv = unit * span;
  const rounded = Math.round((valueMv + noiseMv) / cfg.resolutionMv) * cfg.resolutionMv;

  return {
    valueMv: rounded,
    noiseMv: rounded - valueMv,
    resolutionMv: cfg.resolutionMv,
  };
}

export function estimateCarrierDensity(hallCoefficient) {
  if (!Number.isFinite(hallCoefficient) || hallCoefficient === 0) return 0;
  return 1 / (Math.abs(hallCoefficient) * E_CHARGE);
}

export function computeHallState(input = {}) {
  const carrierType = input.carrierType || input.carrier || 'N';
  const material = getMaterial(input.materialId, carrierType);
  const currentMa = Number(input.currentMa ?? input.current ?? 0);
  const magnetCurrentA = Number(input.magnetCurrentA ?? input.field ?? 0);
  const magneticFieldT = Number(input.magneticFieldT ?? calibrateMagneticField(magnetCurrentA));
  const thicknessMm = Number(input.thicknessMm ?? input.thickness ?? material.defaultThicknessMm);
  const carrierDensity = Number(input.carrierDensity ?? material.carrierDensity);
  const mobility = Number(input.mobility ?? material.mobility);
  const sign = carrierType === 'P' ? 1 : -1;
  const currentA = currentMa * 1e-3;
  const thicknessM = Math.max(thicknessMm, 0.001) * 1e-3;
  const hallCoefficient = sign / (carrierDensity * E_CHARGE);
  const hallVoltageV = hallCoefficient * currentA * magneticFieldT / thicknessM;
  const hallVoltageMv = hallVoltageV * 1e3;
  const measurement = simulateMeasurement(hallVoltageMv, {
    enabled: input.measurementMode === 'measured',
    ...(input.noise || {}),
  });
  const charge = carrierType === 'P' ? E_CHARGE : -E_CHARGE;
  const driftVelocity = currentA === 0
    ? 0
    : Math.abs(currentA) / (carrierDensity * E_CHARGE * 1e-6);
  const lorentzSign = Math.sign(charge * currentA * magneticFieldT) || sign;
  const normalizedVoltage = clamp(Math.abs(hallVoltageMv) / 8, 0, 1);
  const normalizedField = clamp(Math.abs(magneticFieldT) / 1.55, 0, 1);
  const normalizedCurrent = clamp(Math.abs(currentMa) / 10, 0, 1);

  return {
    carrierType,
    materialId: material.id,
    materialName: material.name,
    material,
    currentMa,
    magnetCurrentA,
    magneticFieldT,
    thicknessMm,
    carrierDensity,
    mobility,
    hallVoltageMv,
    measuredHallVoltageMv: measurement.valueMv,
    measurementNoiseMv: measurement.noiseMv,
    hallCoefficient,
    estimatedCarrierDensity: estimateCarrierDensity(hallCoefficient),
    driftVelocity,
    sign,
    polarity: hallVoltageMv < 0 ? 'negative' : hallVoltageMv > 0 ? 'positive' : 'zero',
    fieldDirection: magneticFieldT >= 0 ? '+y' : '-y',
    forceDirection: lorentzSign >= 0 ? '+z' : '-z',
    visualScale: {
      current: normalizedCurrent,
      field: normalizedField,
      voltage: normalizedVoltage,
      thickness: clamp(thicknessMm / 2, 0.1, 1),
      drift: clamp(Math.abs(driftVelocity) / 0.08, 0, 1),
    },
  };
}

export function fitHallLine(records = []) {
  const usable = records.filter((r) => Number.isFinite(r.currentMa) && Number.isFinite(readVoltage(r)));
  const warnings = [];
  if (usable.length < 2) {
    return emptyFit(['至少需要 2 个数据点才能拟合 V_H-I_S 曲线。']);
  }

  const first = usable[0];
  if (!usable.every((r) => nearlyEqual(r.magneticFieldT, first.magneticFieldT, 1e-6))) {
    warnings.push('磁场 B 不一致，V_H-I_S 拟合的斜率不能直接用于反推 R_H。');
  }
  if (!usable.every((r) => nearlyEqual(r.thicknessMm, first.thicknessMm, 1e-6))) {
    warnings.push('样品厚度 d 不一致，拟合结果仅作趋势参考。');
  }
  if (!usable.every((r) => r.carrierType === first.carrierType)) {
    warnings.push('载流子类型不一致，不能合并反推霍尔系数。');
  }

  const n = usable.length;
  const xs = usable.map((r) => r.currentMa);
  const ys = usable.map(readVoltage);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slopeMvPerMa = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const interceptMv = (sumY - slopeMvPerMa * sumX) / n;
  const meanY = sumY / n;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slopeMvPerMa * xs[i] + interceptMv)) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const slopeVPerA = slopeMvPerMa; // mV/mA equals V/A.
  const estimatedHallCoefficient = first.magneticFieldT
    ? slopeVPerA * (first.thicknessMm * 1e-3) / first.magneticFieldT
    : 0;
  const estimatedCarrierDensity = estimateCarrierDensity(estimatedHallCoefficient);
  const referenceDensity = first.carrierDensity || getMaterial(first.materialId, first.carrierType).carrierDensity;
  const relativeErrorPercent = referenceDensity
    ? Math.abs(estimatedCarrierDensity - referenceDensity) / referenceDensity * 100
    : 0;

  return {
    slopeMvPerMa,
    interceptMv,
    rSquared,
    estimatedHallCoefficient,
    estimatedCarrierDensity,
    relativeErrorPercent,
    warnings,
  };
}

function readVoltage(record) {
  return Number(record.measuredHallVoltageMv ?? record.hallVoltageMv ?? record.vh);
}

function emptyFit(warnings) {
  return {
    slopeMvPerMa: 0,
    interceptMv: 0,
    rSquared: 0,
    estimatedHallCoefficient: 0,
    estimatedCarrierDensity: 0,
    relativeErrorPercent: 0,
    warnings,
  };
}

export function makeExperimentRecord(state, mode = 'manual') {
  return {
    id: `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode,
    timestamp: new Date().toISOString(),
    currentMa: state.currentMa,
    magnetCurrentA: state.magnetCurrentA,
    magneticFieldT: state.magneticFieldT,
    thicknessMm: state.thicknessMm,
    carrierType: state.carrierType,
    materialId: state.materialId,
    materialName: state.materialName,
    carrierDensity: state.carrierDensity,
    hallCoefficient: state.hallCoefficient,
    hallVoltageMv: state.hallVoltageMv,
    measuredHallVoltageMv: state.measuredHallVoltageMv,
    measurementNoiseMv: state.measurementNoiseMv,
  };
}

export function recordsToCsv(records = [], fit = null) {
  const headers = [
    '序号',
    '时间',
    '材料',
    '类型',
    'I_S/mA',
    'I_M/A',
    'B/T',
    'd/mm',
    '理论V_H/mV',
    '测量V_H/mV',
    '噪声/mV',
  ];
  const rows = records.map((r, i) => [
    i + 1,
    r.timestamp,
    r.materialName || r.materialId,
    r.carrierType,
    fixed(r.currentMa, 3),
    fixed(r.magnetCurrentA, 3),
    fixed(r.magneticFieldT, 5),
    fixed(r.thicknessMm, 3),
    fixed(r.hallVoltageMv, 6),
    fixed(r.measuredHallVoltageMv, 6),
    fixed(r.measurementNoiseMv, 6),
  ]);
  if (fit) {
    rows.push([]);
    rows.push(['拟合斜率 mV/mA', fixed(fit.slopeMvPerMa, 6)]);
    rows.push(['截距 mV', fixed(fit.interceptMv, 6)]);
    rows.push(['R^2', fixed(fit.rSquared, 6)]);
    rows.push(['反推R_H m^3/C', sci(fit.estimatedHallCoefficient, 4)]);
    rows.push(['反推n /m^3', sci(fit.estimatedCarrierDensity, 4)]);
    rows.push(['相对误差 %', fixed(fit.relativeErrorPercent, 3)]);
  }
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function fixed(value, digits) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '';
}

export function createReportHtml({ state, records, fit }) {
  const rows = records.map((r, i) => `
    <tr>
      <td>${i + 1}</td><td>${r.materialName}</td><td>${r.carrierType}</td>
      <td>${fixed(r.currentMa, 2)}</td><td>${fixed(r.magneticFieldT, 4)}</td>
      <td>${fixed(r.thicknessMm, 2)}</td><td>${fixed(r.measuredHallVoltageMv, 4)}</td>
    </tr>`).join('');
  const warnings = fit?.warnings?.length ? fit.warnings.join('；') : '无';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>霍尔效应虚拟实验报告</title>
  <style>
    body{font-family:"Microsoft YaHei",Arial,sans-serif;margin:32px;color:#172033}
    h1{font-size:24px} table{border-collapse:collapse;width:100%;margin:16px 0}
    th,td{border:1px solid #c9d3e3;padding:6px 8px;text-align:right}
    th:first-child,td:first-child{text-align:center}.meta{line-height:1.8}.warn{color:#9a5a00}
  </style>
</head>
<body>
  <h1>霍尔效应虚拟实验报告</h1>
  <div class="meta">
    <div>材料：${state.materialName}（${state.carrierType} 型）</div>
    <div>当前条件：I_S=${fixed(state.currentMa, 2)} mA，B=${fixed(state.magneticFieldT, 4)} T，d=${fixed(state.thicknessMm, 2)} mm</div>
    <div>理论 V_H=${fixed(state.hallVoltageMv, 4)} mV，测量 V_H=${fixed(state.measuredHallVoltageMv, 4)} mV</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>材料</th><th>类型</th><th>I_S/mA</th><th>B/T</th><th>d/mm</th><th>测量V_H/mV</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>拟合结果</h2>
  <p>斜率：${fixed(fit?.slopeMvPerMa, 6)} mV/mA；截距：${fixed(fit?.interceptMv, 6)} mV；R²：${fixed(fit?.rSquared, 5)}</p>
  <p>反推 R_H：${sci(fit?.estimatedHallCoefficient || 0, 4)} m³/C；反推 n：${sci(fit?.estimatedCarrierDensity || 0, 4)} /m³；相对误差：${fixed(fit?.relativeErrorPercent, 3)}%</p>
  <p class="warn">拟合提示：${warnings}</p>
  <script>window.print();</script>
</body>
</html>`;
}

export function computeHall(s) {
  const state = computeHallState({
    carrierType: s.carrier,
    materialId: s.materialId || (s.carrier === 'P' ? 'P_Ge' : 'N_Ge'),
    currentMa: s.current,
    magneticFieldT: s.field,
    thicknessMm: s.thickness,
    measurementMode: s.measurementMode || 'ideal',
  });
  return {
    vh: state.hallVoltageMv,
    measuredVh: state.measuredHallVoltageMv,
    rh: state.hallCoefficient,
    n: state.carrierDensity,
    sign: state.sign,
    drift: state.visualScale.current,
    state,
  };
}

export function fieldFromSlider(v) {
  return calibrateMagneticField(v);
}

export function sci(x, digits = 1) {
  if (!Number.isFinite(x) || x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const mant = x / Math.pow(10, exp);
  return `${mant.toFixed(digits)}e${exp >= 0 ? '+' : ''}${exp}`;
}
