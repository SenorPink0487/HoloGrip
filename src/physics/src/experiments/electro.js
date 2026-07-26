import { labFrameScheduler } from '../frameBudget.js';
import {
  K_COULOMB,
  EPSILON_0,
  chargeUiToCoulomb,
  coulombFieldContribution,
  coulombPotentialContribution,
} from '../physicsFormula.js';

export { K_COULOMB, EPSILON_0, chargeUiToCoulomb };

/**
 * 电磁学实验台 — 霍尔效应测磁
 *
 * 静电场 / 高斯定理采用人教版 SI 写法：
 *   E = kQ/r²，φ = kQ/r，F = qE，Φ_E = Q内/ε₀
 *   k = 9.0×10⁹ N·m²/C²；界面电荷读数单位为 μC；位置单位为 m。
 */

export const station = {
  id: 'electro',
  title: '电磁学实验台',
  accent: '#ec4899',
  experiments: [
    {
      id: 'faraday_induction',
      name: '法拉第电磁感应',
      goal: '设定 B 或铜棒位置 x 的目标值与变化时长，播放动态过程，观察磁通量变化、感应电动势与楞次定律方向。',
      theory: 'Φ = BS，S = (x − x₀)L；E = nΔΦ/Δt（方向由楞次定律判定）',
      steps: [
        { id: 'motion', text: '设定目标 x 并播放，测量动生电动势', hint: '模式选「动生·x」，设目标位置与时长，点「播放变化」；也可手拖铜棒。' },
        { id: 'field', text: '设定目标 B 并播放，测量感生电动势', hint: '模式选「感生·B」，设目标磁场与时长，点「播放变化」；或点「反向 B」快速演示。' },
        { id: 'conclude', text: '完成法拉第定律验证', hint: '比较 E = BLΔx/Δt 与 E = S·ΔB/Δt 的结果，并用楞次定律判定方向。' },
      ],
    },
    {
      id: 'induced_electric_field',
      name: '感生电场',
      goal: '手动调节 B 与 dB/dt，观察涡旋感生电场：面内 E∝r，面外 E∝1/r，方向由楞次定律判定。',
      theory: 'E·2πr = ΔΦ/Δt；r≤R 时 E=(r/2)|ΔB/Δt|，r>R 时 E=(R²/(2r))|ΔB/Δt|',
      steps: [
        { id: 'observe', text: '观察圆柱形磁场区与同心涡旋 E 线', hint: '感生电场是闭合涡旋线，不是静电场的起止线。默认手动设定 B 与 dB/dt。' },
        { id: 'probe', text: '拖动探测电荷，比较面内/面外 E 的大小', hint: '面内 |E| 随 r 增大，面外随 r 减小。' },
        { id: 'lenz', text: '调节 dB/dt 或反转变化趋势，观察 E 的环绕方向', hint: '在桌右侧滑条拖 dB/dt，或点「反转 dB/dt」；需要连续交变时可开「自动振荡」。' },
        { id: 'conclude', text: '完成感生电场规律归纳', hint: '对照全息屏公式与 E–r 曲线归纳规律。' },
      ],
    },
    {
      id: 'electric_field',
      name: '静电场探索',
      goal: '拖动正负点电荷与探测电荷，观察叠加电场、受力与电势的空间分布',
      theory: 'E=F/q；E=kQ/r²；F=qE；k=9.0×10⁹ N·m²/C²（电荷以 μC 计，位置以 m 计）',
      steps: [
        {
          id: 'explore',
          text: '自由探索静电场与探测电荷',
          hint: '拖动调 X/Y；滚轮或 Shift+拖 调 Z；内容屏可锁轴；电荷量在桌侧滑条。',
        },
      ],
    },
    {
      id: 'hall_effect',
      name: '霍尔效应测磁',
      goal: '调节励磁与霍尔电流，扫描探头位置并比较亥姆霍兹线圈和长螺线管的磁场分布',
      theory: 'U_H = K_H I_s B；由霍尔电压测磁感应强度 B',
      steps: [
        { id: 'identify', text: '认识器材：线圈、霍尔探头与 HCC-2 测磁仪', hint: '按 01→04 顺序瞄准 3D 器材按 E 确认；选对/选错均有提示' },
        { id: 'configure', text: '选择测量对象并确认电流方向', hint: '在全息屏选择亥姆霍兹线圈或长螺线管' },
        { id: 'energize', text: '设置励磁电流 Im 与霍尔电流 Is', hint: '在桌右侧滑条调节 Im / Is' },
        { id: 'scan', text: '移动探头并记录至少 3 组 B–X 数据', hint: '调节 X 后在桌面控制面板点击「记录当前读数」，系统由 VH 换算 B' },
        { id: 'compare', text: '切换测量对象，比较磁场分布', hint: '切换线圈并继续记录，观察曲线形状变化' },
        { id: 'conclude', text: '根据数据归纳霍尔电压与磁场的关系', hint: '记录多组数据并对照曲线归纳结论' },
      ],
    },
    {
      id: 'hall_carrier_demo',
      name: '霍尔效应原理',
      goal: '观察电流、磁场、载流子浓度、样品厚度与载流子类型如何共同改变载流子的三维运动和霍尔电压极性。',
      theory: '霍尔电压 U_H = R_H·I·B/d；n 型与 p 型载流子的霍尔电压极性相反（演示量为相对值）。',
      steps: [
        { id: 'observe', text: '自由调节参数并观察载流子运动', hint: '在桌右侧滑条调节 I、B、n、d，内容屏可切换 n/p 型。' },
      ],
    },
    {
      id: 'gauss_theorem',
      name: '高斯定理 · 电通量',
      goal: '拖动正负点电荷进出闭合高斯面，验证总电通量只由面内净电荷决定。',
      theory: 'Φ_E=Q内/ε₀；ε₀=1/(4πk)；改变球面半径会改变面平均场强，但 Q内 不变则总通量不变。',
      steps: [
        { id: 'observe', text: '观察球形高斯面、电荷、电场线与通量粒子', hint: '瞄准电荷按住拖动，滚轮可沿深度方向微调。' },
        { id: 'cross', text: '让电荷跨过高斯面并比较 Q内 与 Φ_E', hint: '拖动电荷进出高斯面；半径与电荷量在桌右侧滑条调节。' },
        { id: 'compare', text: '改变球面半径或加入异号电荷', hint: '比较同一 Q内 下半径变化对平均场强与总通量的不同影响。' },
        { id: 'conclude', text: '完成验证并归纳高斯定理', hint: '确认“外部电荷不改变闭合面的净通量”。' },
      ],
    },
  ],
};

export function gaussEnclosedCharge(charges = [], radius = 2.4) {
  return charges.reduce((sum, charge) => {
    const distance = Math.hypot(
      Number(charge?.x || 0),
      Number(charge?.y || 0),
      Number(charge?.z || 0),
    );
    return distance < Number(radius) - 1e-4 ? sum + Number(charge?.q || 0) : sum;
  }, 0);
}

/** Φ_E = Q内/ε₀（Q 由界面 μC 换算为 C） */
export function gaussFlux(charges = [], radius = 2.4, epsilon0 = EPSILON_0) {
  const qC = chargeUiToCoulomb(gaussEnclosedCharge(charges, radius));
  return qC / Number(epsilon0 || EPSILON_0);
}

/** 与 electricFieldAt 相同：E = kQ r̂ / r² */
export function gaussFieldAt(charges = [], point = {}, options = {}) {
  return electricFieldAt(charges, point, options);
}

export function gaussMeanNormalField(charges = [], radius = 2.4) {
  const r = Math.max(1e-6, Number(radius || 0));
  if (charges.length === 1) {
    const charge = charges[0];
    const distance = Math.hypot(Number(charge.x || 0), Number(charge.y || 0), Number(charge.z || 0));
    if (distance < 0.12 && distance < r && Math.abs(Number(charge.q || 0)) > 0.01) {
      // 球心点电荷：E = k|Q|/R²
      return (K_COULOMB * Math.abs(chargeUiToCoulomb(charge.q))) / (r * r);
    }
  }
  const sampleCount = 40;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let sum = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const y = 1 - (i / Math.max(sampleCount - 1, 1)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const field = gaussFieldAt(charges, {
      x: Math.cos(theta) * radial * r,
      y: y * r,
      z: Math.sin(theta) * radial * r,
    });
    sum += Math.hypot(field.x, field.y, field.z);
  }
  return sum / sampleCount;
}

/**
 * Local normal flux density E·n on a spherical Gaussian surface.
 * direction is any non-zero vector; n is taken as its unit vector.
 * Positive ⇒ outward flux through that patch, negative ⇒ inward.
 */
export function gaussNormalFluxDensity(charges = [], direction = {}, radius = 2.4) {
  const r = Math.max(1e-6, Number(radius || 0));
  const nx = Number(direction?.x || 0);
  const ny = Number(direction?.y || 0);
  const nz = Number(direction?.z || 0);
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen < 1e-12) return 0;
  const ux = nx / nLen;
  const uy = ny / nLen;
  const uz = nz / nLen;
  const field = gaussFieldAt(charges, { x: ux * r, y: uy * r, z: uz * r });
  return field.x * ux + field.y * uy + field.z * uz;
}

/**
 * Map local E·n and cycle progress ∈ [0,1] to a radial factor r/R.
 * Outward patches travel R_in → R_out; inward patches travel R_out → R_in.
 * Returns null when the patch carries negligible flux (particle should hide).
 */
export function gaussFluxParticleRadiusNorm(density, progress, options = {}) {
  const eps = Number(options.eps ?? 1e-5);
  if (!(Math.abs(Number(density) || 0) > eps)) return null;
  const rIn = Number(options.rIn ?? 0.58);
  const rOut = Number(options.rOut ?? 1.52);
  const t = Math.min(1, Math.max(0, Number(progress) || 0));
  return Number(density) > 0
    ? rIn + (rOut - rIn) * t
    : rOut + (rIn - rOut) * t;
}

/** Advection speed for a flux tracer; stronger |E·n| streams move faster. */
export function gaussFluxParticleSpeed(density, options = {}) {
  const abs = Math.abs(Number(density) || 0);
  const ref = Number(options.refAbs ?? K_COULOMB * 1e-6); // ~9×10³ N/C
  const base = Number(options.base ?? 0.38);
  const gain = Number(options.gain ?? 0.72);
  const maxExtra = Number(options.maxExtra ?? 1.15);
  return base + Math.min(maxExtra, (abs / ref) * gain);
}

/**
 * Visual weight for a tracer (scale/opacity proxy).
 * Emphasizes the surface crossing so E·dA is readable.
 */
export function gaussFluxParticleEmphasis(density, radiusNorm, options = {}) {
  const abs = Math.abs(Number(density) || 0);
  // SI 下 |E| 约 10³ N/C 量级（1 μC、米级距离）
  const refAbs = Number(options.refAbs ?? K_COULOMB * 1e-6 * 0.15);
  const strength = 0.42 + 0.58 * Math.min(1, abs / refAbs);
  const near = Math.abs(Number(radiusNorm) - 1);
  const surfaceBoost = 0.72 + 0.38 * Math.exp(-(near * near) / Number(options.surfaceWidth || 0.07));
  return strength * surfaceBoost;
}

/**
 * 静电场强 E = Σ kQᵢ r̂ᵢ / rᵢ²（SI，N/C）
 * charges[].q 为界面 μC 读数；point 坐标单位 m。
 */
export function electricFieldAt(charges = [], point = {}, options = {}) {
  const minRadius = Math.max(1e-4, Number(options.minRadius ?? 0.04));
  const field = { x: 0, y: 0, z: 0 };
  for (const charge of charges) {
    const dx = Number(point.x || 0) - Number(charge?.x || 0);
    const dy = Number(point.y || 0) - Number(charge?.y || 0);
    const dz = Number(point.z || 0) - Number(charge?.z || 0);
    const dE = coulombFieldContribution(charge?.q, dx, dy, dz, minRadius);
    field.x += dE.x;
    field.y += dE.y;
    field.z += dE.z;
  }
  return field;
}

/** 电势 φ = Σ kQᵢ / rᵢ（V，取无穷远处为零） */
export function electricPotentialAt(charges = [], point = {}, options = {}) {
  const minRadius = Math.max(1e-4, Number(options.minRadius ?? 0.04));
  let potential = 0;
  for (const charge of charges) {
    const dx = Number(point.x || 0) - Number(charge?.x || 0);
    const dy = Number(point.y || 0) - Number(charge?.y || 0);
    const dz = Number(point.z || 0) - Number(charge?.z || 0);
    potential += coulombPotentialContribution(
      charge?.q,
      Math.hypot(dx, dy, dz),
      minRadius,
    );
  }
  return potential;
}

/** 探测电荷受力 F = qE（N）；q0 为界面 μC 读数 */
export function electricForceAt(charges = [], point = {}, q0 = 1, options = {}) {
  const field = electricFieldAt(charges, point, options);
  const q = chargeUiToCoulomb(q0);
  return { x: field.x * q, y: field.y * q, z: field.z * q };
}

export function electricSourceForceAt(charges = [], id, options = {}) {
  const source = charges.find((charge) => charge?.id === id);
  if (!source) return { x: 0, y: 0, z: 0 };
  return electricForceAt(
    charges.filter((charge) => charge?.id !== id),
    source,
    source.q,
    options,
  );
}

const HALL_MU0 = 4 * Math.PI * 1e-7;
const HALL_K = 200;
const HALL_COIL_RADIUS_M = 0.05;
const HALL_COIL_TURNS = 210;
const HALL_SOLENOID_LENGTH_M = 0.26;
const HALL_SOLENOID_RADIUS_M = 0.014;

export function hallDemoVoltage(data) {
  const carrierSign = data?.nType === false ? 1 : -1;
  const thicknessNorm = Math.max(0.05, Number(data?.d || 0) / 0.5);
  const numerator = Number(data?.I || 0) * Number(data?.B || 0);
  if (numerator === 0) return 0;
  return (numerator * carrierSign)
    / (Math.max(0.3, Number(data?.n || 0)) * thicknessNorm);
}

export function hallDemoForce(data) {
  return Math.abs(Number(data?.I || 0) * Number(data?.B || 0));
}

// Source apparatus constants (physical coordinates, before the scene adapter's
// visual scale/offset conversion).
export const FARADAY_ROD_LENGTH = 4;
export const FARADAY_X_END = 0.25;
export const FARADAY_X_MIN = 1.2;
export const FARADAY_X_MAX = 8;

export function faradayArea(x, rodLength = FARADAY_ROD_LENGTH, xEnd = FARADAY_X_END) {
  return Math.max(0, Number(x || 0) - xEnd) * rodLength;
}

export function faradayFlux(B, x, rodLength = FARADAY_ROD_LENGTH, xEnd = FARADAY_X_END) {
  return Number(B || 0) * faradayArea(x, rodLength, xEnd);
}

export function faradayEmfFromDelta(dFlux, dt) {
  const duration = Math.max(1e-9, Math.abs(Number(dt || 0)));
  return -Number(dFlux || 0) / duration;
}

/** Lenz direction for a signed increase/decrease in the declared flux. */
export function faradaySense(dFluxRate) {
  const rate = Number(dFluxRate || 0);
  if (Math.abs(rate) < 1e-8) return 'none';
  return rate > 0 ? 'cw' : 'ccw';
}

export function faradaySenseLabel(sense) {
  if (sense === 'cw') return '顺时针（俯视）';
  if (sense === 'ccw') return '逆时针（俯视）';
  return '无感应电流';
}

// —— Induced electric field (Maxwell–Faraday / 感生电场) ——
// Uniform axial B confined to a cylinder of radius R. Changing B produces
// azimuthal E with |E|∝r inside and |E|∝1/r outside (normalized SI-like units).
export const INDUCED_E_R_MIN = 0.8;
export const INDUCED_E_R_MAX = 3.2;
export const INDUCED_E_PROBE_R_MAX = 4.5;
export const INDUCED_E_AMP_MAX = 2.5;
export const INDUCED_E_OMEGA_MAX = 2.5;

/**
 * |E| at radial distance r for uniform dB/dt inside radius R.
 * @param {number} r
 * @param {number} R
 * @param {number} dBdt signed dB/dt; only magnitude enters |E|
 */
export function inducedEMagnitude(r, R, dBdt) {
  const radius = Math.max(0, Number(r || 0));
  const region = Math.max(1e-6, Number(R || 0));
  const rate = Math.abs(Number(dBdt || 0));
  if (rate < 1e-12 || radius < 1e-9) return 0;
  if (radius <= region) return 0.5 * radius * rate;
  return 0.5 * (region * region / radius) * rate;
}

/**
 * Lenz sense looking down +y (scene up, independent of B sign):
 * dB_y/dt > 0 → clockwise E when viewed from +y.
 * (Do not phrase as “looking along B”: when B is negative that would reverse CW/CCW.)
 * @returns {'cw'|'ccw'|'none'}
 */
export function inducedESense(dBdt) {
  const rate = Number(dBdt || 0);
  if (Math.abs(rate) < 1e-8) return 'none';
  return rate > 0 ? 'cw' : 'ccw';
}

export function inducedESenseLabel(sense) {
  if (sense === 'cw') return '顺时针（俯视 +y）';
  if (sense === 'ccw') return '逆时针（俯视 +y）';
  return '无感生电场';
}

/**
 * Sample E–r curve points for the content-screen plot.
 * @returns {Array<{ r: number, E: number, inside: boolean }>}
 */
export function inducedEProfile(R, dBdt, samples = 48, rMax = INDUCED_E_PROBE_R_MAX) {
  const region = Math.max(1e-6, Number(R || 0));
  const maxR = Math.max(region * 1.05, Number(rMax || INDUCED_E_PROBE_R_MAX));
  const n = Math.max(8, Math.round(Number(samples) || 48));
  const points = [];
  for (let i = 0; i <= n; i += 1) {
    const r = (i / n) * maxR;
    points.push({
      r,
      E: inducedEMagnitude(r, region, dBdt),
      inside: r <= region + 1e-9,
    });
  }
  return points;
}

/**
 * Tangential unit vector in the xz plane (B along +y).
 * CW looking from +y: ê_θ = (ẑ × r̂) with right-hand? Looking from +y:
 * CCW (right-hand around +y) = (-z, 0, x)/r ; CW = (z, 0, -x)/r.
 */
export function inducedEDirection(x, z, sense) {
  if (sense === 'none') return { x: 0, y: 0, z: 0 };
  const r = Math.hypot(Number(x || 0), Number(z || 0));
  if (r < 1e-9) return { x: 0, y: 0, z: 0 };
  const sx = Number(x || 0) / r;
  const sz = Number(z || 0) / r;
  // CCW around +y: ê = (−sz, 0, sx); CW: opposite
  if (sense === 'ccw') return { x: -sz, y: 0, z: sx };
  return { x: sz, y: 0, z: -sx };
}

export function inducedEVectorAt(point, R, dBdt) {
  const x = Number(point?.x || 0);
  const z = Number(point?.z || 0);
  const r = Math.hypot(x, z);
  const sense = inducedESense(dBdt);
  const mag = inducedEMagnitude(r, R, dBdt);
  const dir = inducedEDirection(x, z, sense);
  return { x: dir.x * mag, y: 0, z: dir.z * mag, magnitude: mag, sense, r };
}

const HALL_PART_NAMES = {
  hall_helmholtz: '亥姆霍兹线圈',
  hall_solenoid: '长螺线管',
  hall_probe: '霍尔探头与标尺',
  hall_console: 'HCC-2 测磁仪',
};
const HALL_PART_ROLES = Object.keys(HALL_PART_NAMES);
const HALL_TERMINAL_KEYS = {
  hall_terminal_solenoid: 'solenoid',
  hall_terminal_helmholtz: 'helmholtz',
  hall_terminal_output: 'output',
};
const HALL_WIRING_RULES = {
  solenoid: {
    positive: ['sol_red'],
    negative: ['sol_black'],
    label: '螺线管',
  },
  helmholtz: {
    positive: ['hh_red'],
    negative: ['hh_black'],
    label: '亥姆霍兹线圈',
  },
};

export function analyzeHallWiring(wires = []) {
  const links = new Map();
  wires.forEach((pair) => {
    const [a, b] = Array.isArray(pair) ? pair : [pair?.from, pair?.to];
    if (!a || !b || a === b) return;
    links.set(a, b);
    links.set(b, a);
  });
  const redPeer = links.get('out_red') || null;
  const blackPeer = links.get('out_black') || null;
  for (const [target, rule] of Object.entries(HALL_WIRING_RULES)) {
    const direct = rule.positive.includes(redPeer) && rule.negative.includes(blackPeer);
    const reversed = rule.negative.includes(redPeer) && rule.positive.includes(blackPeer);
    if (direct || reversed) {
      return {
        energized: true,
        target,
        direction: reversed ? -1 : 1,
        reversed,
        status: reversed ? 'reversed' : 'forward',
        label: rule.label,
      };
    }
  }
  return {
    energized: false,
    target: null,
    direction: 1,
    reversed: false,
    status: redPeer || blackPeer ? 'invalid' : 'open',
    label: '',
  };
}

/** @param {object} ctx shared manager context */
export function createHandlers(ctx) {
  const {
    state, equipment, toast, pushHud, advanceStep, setStep, currentStep,
  } = ctx;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function applyWiringState(data) {
    data.wiring = analyzeHallWiring(data.wires);
    if (data.wiring.energized) {
      data.target = data.wiring.target;
      data.direction = data.wiring.direction;
    } else {
      data.direction = 1;
    }
    return data.wiring;
  }

  function initData(expId) {
    if (expId === 'faraday_induction') {
      return {
        B: -1,
        x: 4.5,
        rodLength: FARADAY_ROD_LENGTH,
        xEnd: FARADAY_X_END,
        xMin: FARADAY_X_MIN,
        xMax: FARADAY_X_MAX,
        showField: true,
        area: faradayArea(4.5),
        flux: faradayFlux(-1, 4.5),
        currentSense: 'none',
        measureMode: null,
        // Preset-then-play: set target + duration, then animate smoothly.
        animChannel: 'B', // 'B' | 'x'
        targetB: 1.5,
        targetX: 6.5,
        animDuration: 1.5,
        pendingAnim: null,
        liveEmf: 0,
        animProgress: 0,
        /** Keep current-flow arrows visible briefly after a change ends. */
        currentLinger: 0,
        lingerSense: 'none',
        dragging: false,
        motionStart: null,
        inductionStart: null,
        pendingB: null, // legacy alias cleared; animations use pendingAnim
        sliderDragging: false,
        sliderStart: null,
        lastMotion: null,
        lastInduction: null,
        records: [],
        completed: false,
        _time: 0,
        _prevX: 4.5,
        _hudThrottle: 0,
      };
    }
    if (expId === 'hall_effect') {
      return {
        target: 'helmholtz',
        Im: 0.5,
        Is: 5,
        probePos: 0,
        rightCoilPos: 2.5,
        turns: 100,
        direction: 1,
        zeroOffset: 0,
        wires: [],
        terminalDragFrom: null,
        terminalSnapPort: null,
        hallDragArmed: false,
        hallDragging: false,
        identified: {
          hall_helmholtz: false,
          hall_solenoid: false,
          hall_probe: false,
          hall_console: false,
        },
        vh: 0,
        records: [],
        showCurve: false,
        /** First visible row index in the data table (0 = top / oldest). */
        tableScrollTop: 0,
        /** When true, the table sticks to the newest rows after each record. */
        tableScrollAuto: true,
        /** Sub-row pixel residual for smooth trackpad / drag scrolling. */
        tableScrollPx: 0,
        completed: false,
        _hudThrottle: 0,
      };
    }
    if (expId === 'hall_carrier_demo') {
      return {
        I: 1,
        B: 1,
        n: 1,
        d: 0.5,
        nType: true,
        paused: false,
        autoCam: false,
        showB: true,
        vh: -1,
        force: 1,
      };
    }
    if (expId === 'gauss_theorem') {
      return {
        radius: 2.4,
        charges: [{ id: 1, q: 1, x: 0, y: 0, z: 0 }],
        selectedId: 1,
        nextChargeId: 2,
        showSurface: true,
        showLines: true,
        showFlux: true,
        dragArmed: false,
        dragging: false,
        completed: false,
        qEnclosed: 1,
        // Φ_E = Q/ε₀，Q = 1 μC；E = kQ/R²
        flux: chargeUiToCoulomb(1) / EPSILON_0,
        meanField: (K_COULOMB * chargeUiToCoulomb(1)) / (2.4 ** 2),
        _hudThrottle: 0,
      };
    }
    if (expId === 'electric_field') {
      const probe = { x: 2, y: 0.8, z: 0, q0: 1 };
      const charges = [{ id: 1, q: 1, x: 0, y: 0, z: 0 }];
      const field = electricFieldAt(charges, probe);
      const force = electricForceAt(charges, probe, probe.q0);
      return {
        charges,
        selectedId: 1,
        nextChargeId: 2,
        probe,
        showLines: true,
        showArrows: true,
        showEquipot: false,
        showProbe: true,
        autoRotate: false,
        formulaTab: 'def',
        /**
         * Axis locks for mouse drag. true = that world axis is frozen.
         * Position is drag-only (no coordinate desk sliders).
         */
        axisLock: { x: false, y: false, z: false },
        dragging: false,
        dragTarget: null,
        dragMouseX: 0,
        dragMouseY: 0,
        dragStart: null,
        field,
        force,
        magnitudeE: Math.hypot(field.x, field.y, field.z),
        magnitudeF: Math.hypot(force.x, force.y, force.z),
        potential: electricPotentialAt(charges, probe),
        completed: false,
        _hudThrottle: 0,
      };
    }
    if (expId === 'induced_electric_field') {
      const R = 2;
      // Default: manual control (static B + dB/dt). Auto sine drive is opt-in.
      const amp = 1.2;
      const omega = 0.9;
      const phase = 0;
      const B = 1.0;
      const dBdt = 1.1;
      const probeR = 1.4;
      const probeAngle = 0.35;
      const probe = {
        x: probeR * Math.cos(probeAngle),
        y: 0,
        z: probeR * Math.sin(probeAngle),
        q0: 1,
      };
      const field = inducedEVectorAt(probe, R, dBdt);
      return {
        R,
        amp,
        omega,
        phase,
        B,
        dBdt,
        auto: false,
        paused: false,
        probe,
        probeR,
        showB: true,
        showE: true,
        showParticles: true,
        showProbe: true,
        field,
        magnitudeE: field.magnitude,
        force: {
          x: field.x * probe.q0,
          y: 0,
          z: field.z * probe.q0,
        },
        sense: field.sense,
        senseLabel: inducedESenseLabel(field.sense),
        profile: inducedEProfile(R, dBdt),
        eAtBoundary: inducedEMagnitude(R, R, dBdt),
        dragging: false,
        dragMouseX: 0,
        dragMouseY: 0,
        dragStart: null,
        completed: false,
        sliderDragging: false,
        sliderKey: null,
        _time: 0,
        _hudThrottle: 0,
      };
    }
    return {};
  }

  function selectedGaussCharge(data) {
    return data.charges?.find((charge) => charge.id === data.selectedId) || null;
  }

  function syncGauss(data, refresh = true, dt = 0) {
    data.qEnclosed = gaussEnclosedCharge(data.charges, data.radius);
    data.flux = gaussFlux(data.charges, data.radius);
    data.meanField = gaussMeanNormalField(data.charges, data.radius);
    equipment.electro?.updateGauss?.(data, dt);
    if (refresh) pushHud();
  }

  function selectedElectricCharge(data) {
    return data.charges?.find((charge) => charge.id === data.selectedId) || null;
  }

  /** Walk the picked mesh / parent chain for a finite charge id. */
  function resolveChargeId(target) {
    let node = target;
    while (node) {
      const id = Number(node.userData?.chargeId);
      if (Number.isFinite(id)) return id;
      node = node.parent;
    }
    return NaN;
  }

  function mouseDragDelta(data) {
    return {
      dx: Number(equipment.electro?.mouseDrag?.movementX || 0) - Number(data.dragMouseX || 0),
      dy: Number(equipment.electro?.mouseDrag?.movementY || 0) - Number(data.dragMouseY || 0),
    };
  }

  function electricAxisLock(data) {
    const lock = data?.axisLock || {};
    return {
      x: lock.x === true,
      y: lock.y === true,
      z: lock.z === true,
    };
  }

  /** Human-readable free/locked axes for toasts and HUD. */
  function electricAxisLockSummary(data) {
    const lock = electricAxisLock(data);
    const locked = ['x', 'y', 'z'].filter((a) => lock[a]).map((a) => a.toUpperCase());
    if (!locked.length) return '拖动 X/Y · 滚轮或 Shift+拖 调 Z';
    if (locked.length === 3) return 'X/Y/Z 已全部锁定';
    const free = ['x', 'y', 'z'].filter((a) => !lock[a]).map((a) => a.toUpperCase());
    if (free.includes('Z') && !free.includes('Y') && !free.includes('X')) {
      return `已锁 ${locked.join('/')} · 任意拖动或滚轮调 Z（范围 ±4.5 m）`;
    }
    if (free.includes('Z') && !free.includes('Y')) {
      return `已锁 ${locked.join('/')} · 拖动/滚轮调 Z（范围 ±4.5 m）`;
    }
    if (free.includes('Z')) {
      return `已锁 ${locked.join('/')} · 可动 ${free.join('/')}（Z：滚轮或 Shift+拖）`;
    }
    return `已锁 ${locked.join('/')} · 可动 ${free.join('/')}`;
  }

  function electricDragWantsShiftZ(data) {
    // Prefer explicit context flag, then mouseDrag facade (desktop / pointer-lock).
    return !!(
      data?._dragShiftZ
      || equipment.electro?.mouseDrag?.shiftKey
    );
  }

  /**
   * Map screen drag → world Δ on free axes only.
   * - Mouse X → world X (if free)
   * - Mouse Y → world Y if free
   * - Shift + mouse Y → world Z when both Y and Z free
   * - When Y is locked (only Z free for vertical): any screen drag drives Z
   *   (vertical preferred; horizontal still works so “前后/左右”都能推 Z)
   * Wheel (separate) also nudges Z when free.
   */
  function electricDragOffsets(data, dx, dy) {
    const lock = electricAxisLock(data);
    const freeX = !lock.x;
    const freeY = !lock.y;
    const freeZ = !lock.z;
    const scale = 0.025;
    const zScale = 0.035; // slightly more sensitive for depth-only edits
    const shiftZ = electricDragWantsShiftZ(data);
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (freeX) ox = dx * scale;
    if (freeY && freeZ && shiftZ) {
      // Explicit depth chord while Y remains free.
      oz = -dy * zScale;
    } else if (freeY) {
      oy = -dy * scale;
    } else if (freeZ) {
      // X/Y locked (or Y locked): whole pointer plane → Z.
      // Prefer vertical; if the gesture is mostly horizontal, still move Z so
      // users are not stuck when they drag “sideways” expecting depth change.
      const useVertical = Math.abs(dy) >= Math.abs(dx) * 0.45;
      const drive = useVertical ? dy : -dx;
      oz = -drive * zScale;
    }
    return { ox, oy, oz, freeX, freeY, freeZ, lock };
  }

  /**
   * Apply screen-space drag deltas to the armed electric-field target.
   * Position only — visuals / E·F / decorations run once per animation frame
   * in update(). Calling sync here from every pointermove freezes the UI.
   */
  function applyElectricDragDelta(data, dx, dy, _dt = 0) {
    if (!data?.dragStart) return false;
    const { ox, oy, oz, freeX, freeY, freeZ } = electricDragOffsets(data, dx, dy);
    if (!freeX && !freeY && !freeZ) return false;

    const applyAxis = (obj, axis, free, start, delta, lo, hi) => {
      if (!free) {
        obj[axis] = start;
        return;
      }
      obj[axis] = clamp(start + delta, lo, hi);
    };

    if (data.dragTarget === 'probe') {
      const p = data.probe;
      const s = data.dragStart;
      applyAxis(p, 'x', freeX, s.x, ox, -5, 5);
      applyAxis(p, 'y', freeY, s.y, oy, -5, 5);
      applyAxis(p, 'z', freeZ, s.z, oz, -5, 5);
    } else {
      const charge = selectedElectricCharge(data);
      if (!charge) return false;
      const s = data.dragStart;
      applyAxis(charge, 'x', freeX, s.x, ox, -4.5, 4.5);
      applyAxis(charge, 'y', freeY, s.y, oy, -4.5, 4.5);
      applyAxis(charge, 'z', freeZ, s.z, oz, -4.5, 4.5);
    }
    return true;
  }

  /**
   * Gauss charge drag: write X/Y only. Field-line rebuild + flux particles are
   * owned by the per-frame syncGauss in update() (and once more on release).
   */
  function applyGaussDragDelta(data, dx, dy, _dt = 0) {
    const charge = selectedGaussCharge(data);
    if (!charge || !data?.dragArmed) return false;
    data.dragging = true;
    charge.x = clamp(Number(data.dragStartX || 0) + dx * 0.025, -5, 5);
    charge.y = clamp(Number(data.dragStartY || 0) - dy * 0.025, -5, 5);
    if (state.stepIndex < 1 && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) setStep('cross');
    return true;
  }

  function syncElectricField(data, refresh = true, dt = 0) {
    const probe = data.probe || { x: 0, y: 0, z: 0, q0: 1 };
    data.field = electricFieldAt(data.charges, probe);
    data.force = electricForceAt(data.charges, probe, probe.q0);
    data.magnitudeE = Math.hypot(data.field.x, data.field.y, data.field.z);
    data.magnitudeF = Math.hypot(data.force.x, data.force.y, data.force.z);
    data.potential = electricPotentialAt(data.charges, probe);
    equipment.electro?.updateElectricField?.(data, dt);
    if (refresh) pushHud();
  }

  function syncFaraday(data, refresh = true, dt = 0) {
    data.area = faradayArea(data.x, data.rodLength, data.xEnd);
    data.flux = faradayFlux(data.B, data.x, data.rodLength, data.xEnd);
    equipment.electro?.updateFaraday?.(data, dt);
    if (refresh) pushHud();
  }

  function recomputeInducedElectric(data) {
    if (data.auto) {
      data.B = Number(data.amp || 0) * Math.sin(Number(data.phase || 0));
      data.dBdt = Number(data.amp || 0) * Number(data.omega || 0) * Math.cos(Number(data.phase || 0));
    }
    const probe = data.probe || { x: 0, y: 0, z: 0, q0: 1 };
    data.probeR = Math.hypot(Number(probe.x || 0), Number(probe.z || 0));
    const field = inducedEVectorAt(probe, data.R, data.dBdt);
    data.field = field;
    data.magnitudeE = field.magnitude;
    data.force = {
      x: field.x * Number(probe.q0 || 0),
      y: 0,
      z: field.z * Number(probe.q0 || 0),
    };
    data.sense = field.sense;
    data.senseLabel = inducedESenseLabel(field.sense);
    data.eAtBoundary = inducedEMagnitude(data.R, data.R, data.dBdt);
    data.profile = inducedEProfile(data.R, data.dBdt);
    return data;
  }

  function syncInducedElectric(data, refresh = true, dt = 0) {
    recomputeInducedElectric(data);
    equipment.electro?.updateInducedElectric?.(data, dt);
    if (refresh) pushHud();
  }

  function applyInducedProbeDrag(data, dx, dy) {
    if (!data?.dragStart || !data.probe) return false;
    // Screen drag maps to tabletop XZ (B is vertical).
    data.probe.x = clamp(data.dragStart.x + dx * 0.02, -INDUCED_E_PROBE_R_MAX, INDUCED_E_PROBE_R_MAX);
    data.probe.z = clamp(data.dragStart.z + dy * 0.02, -INDUCED_E_PROBE_R_MAX, INDUCED_E_PROBE_R_MAX);
    data.probe.y = 0;
    const r = Math.hypot(data.probe.x, data.probe.z);
    if (r > INDUCED_E_PROBE_R_MAX) {
      const s = INDUCED_E_PROBE_R_MAX / r;
      data.probe.x *= s;
      data.probe.z *= s;
    }
    if (state.stepIndex < 1 && Math.hypot(dx, dy) > 4) setStep('probe');
    syncInducedElectric(data, false);
    return true;
  }

  const INDUCED_DBDT_MAX = INDUCED_E_AMP_MAX * INDUCED_E_OMEGA_MAX;
  const INDUCED_SLIDER_RANGES = {
    R: [INDUCED_E_R_MIN, INDUCED_E_R_MAX],
    amp: [0.2, INDUCED_E_AMP_MAX],
    omega: [0.15, INDUCED_E_OMEGA_MAX],
    B: [-INDUCED_E_AMP_MAX, INDUCED_E_AMP_MAX],
    dBdt: [-INDUCED_DBDT_MAX, INDUCED_DBDT_MAX],
    probeR: [0.15, INDUCED_E_PROBE_R_MAX],
    q0: [0.2, 3],
  };

  function inducedSliderBaseValue(data, key) {
    if (key === 'probeR') return Number(data.probeR || 0);
    if (key === 'q0') return Math.abs(Number(data.probe?.q0 || 1));
    return Number(data[key] || 0);
  }

  /** Relative content-screen slider drag (pointer-lock / hold path). */
  function applyInducedSliderRelative(data, totalX) {
    const key = data.sliderKey;
    if (!key || !data.sliderDragging) return false;
    const range = INDUCED_SLIDER_RANGES[key];
    if (!range) return false;
    const [min, max] = range;
    const span = max - min;
    if (data.sliderDragBase == null || !Number.isFinite(data.sliderDragBase)) {
      data.sliderDragBase = inducedSliderBaseValue(data, key);
      data.sliderDragOriginX = 0;
    }
    // ~full range over ~360 px of mouse travel — readable without overshoot.
    const next = clamp(
      Number(data.sliderDragBase) + Number(totalX || 0) * span * 0.0028,
      min,
      max,
    );
    onUiAction('induced-e-set', { key, value: next, live: true });
    return true;
  }

  function finishInducedSlider(data) {
    if (!data?.sliderDragging) return false;
    data.sliderDragging = false;
    data.sliderKey = null;
    data.sliderDragBase = null;
    data.sliderDragOriginX = null;
    Object.keys(data).forEach((key) => {
      if (key.startsWith('_sliderBase_')) delete data[key];
    });
    syncInducedElectric(data);
    return true;
  }

  function updateInducedElectric(data, dt = 0) {
    const step = Math.max(0, Number(dt || 0));
    data._time = Number(data._time || 0) + step;
    if (data.auto && !data.paused) {
      data.phase = Number(data.phase || 0) + Number(data.omega || 0) * step;
      // Keep phase bounded for numeric comfort.
      if (data.phase > Math.PI * 100 || data.phase < -Math.PI * 100) {
        data.phase = ((data.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      }
    }
    recomputeInducedElectric(data);
    equipment.electro?.updateInducedElectric?.(data, step);
    data._hudThrottle = Number(data._hudThrottle || 0) + step;
    const hudInterval = data.dragging || data.sliderDragging ? 0.1 : 0.22;
    if (data._hudThrottle > hudInterval) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }

  function faradayBusy(data) {
    return !!(data?.dragging || data?.sliderDragging || data?.pendingAnim);
  }

  function finishFaradayMotion(data) {
    if (!data.motionStart) return false;
    const start = data.motionStart;
    const dt = Math.max(1e-6, data._time - start.t0);
    const dx = data.x - start.x0;
    const dFlux = faradayFlux(start.B, data.x, data.rodLength, data.xEnd)
      - start.flux0;
    const emf = faradayEmfFromDelta(dFlux, dt);
    const sense = faradaySense(dFlux / dt);
    data.lastMotion = {
      x0: start.x0, x1: data.x, dx, dt, B: start.B,
      flux0: start.flux0, flux1: start.flux0 + dFlux, dFlux, emf, sense,
      senseLabel: faradaySenseLabel(sense),
    };
    data.records.push({ type: 'motion', ...data.lastMotion });
    data.records = data.records.slice(-12);
    data.motionStart = null;
    data.dragging = false;
    data.measureMode = null;
    data.currentSense = 'none';
    data.liveEmf = 0;
    data.animProgress = 0;
    data.currentLinger = 0;
    data.lingerSense = 'none';
    if (state.stepIndex < 1 && Math.abs(dx) > 1e-4) setStep('field');
    toast(`动生测量完成：E = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    return true;
  }

  /**
   * Animate B or x from the current value to a target over `duration` seconds.
   * Used by “播放变化” and by reverse-B preset.
   */
  function startFaradayAnim(data, opts = {}) {
    if (faradayBusy(data)) return false;
    const channel = opts.channel === 'x' || opts.channel === 'B'
      ? opts.channel
      : (data.animChannel === 'x' ? 'x' : 'B');
    const duration = clamp(
      Number(opts.duration ?? data.animDuration ?? 1.5),
      0.3,
      6,
    );
    let from;
    let to;
    if (channel === 'x') {
      from = Number(data.x || 0);
      to = clamp(
        Number(opts.to ?? data.targetX ?? from),
        FARADAY_X_MIN,
        FARADAY_X_MAX,
      );
    } else {
      from = Number(data.B || 0);
      to = clamp(Number(opts.to ?? data.targetB ?? from), -3, 3);
    }
    if (Math.abs(to - from) < 1e-8) {
      toast('目标与当前值相同，请先调整目标');
      return false;
    }
    data.animChannel = channel;
    // Steady dΦ/dt for the whole play (linear ramp) so current arrows stay on.
    const dValDt = (to - from) / Math.max(1e-6, duration);
    let dFluxDt0 = 0;
    if (channel === 'x') {
      dFluxDt0 = Number(data.B || 0) * Number(data.rodLength || FARADAY_ROD_LENGTH) * dValDt;
    } else {
      dFluxDt0 = faradayArea(data.x, data.rodLength, data.xEnd) * dValDt;
    }
    data.pendingAnim = {
      channel,
      from,
      to,
      t0: data._time,
      duration,
      dValDt,
      dFluxDt: dFluxDt0,
      B0: Number(data.B || 0),
      x0: Number(data.x || 0),
      area0: faradayArea(data.x, data.rodLength, data.xEnd),
      flux0: faradayFlux(data.B, data.x, data.rodLength, data.xEnd),
    };
    data.inductionStart = channel === 'B' ? data.pendingAnim : null;
    data.measureMode = channel === 'x' ? 'motion' : 'induction';
    data.currentSense = faradaySense(dFluxDt0);
    data.lingerSense = 'none';
    data.liveEmf = -dFluxDt0;
    data.animProgress = 0;
    data.currentLinger = 0;
    data.pendingB = null;
    return true;
  }

  function startFaradayBChange(data, target, duration = 0.6) {
    return startFaradayAnim(data, { channel: 'B', to: target, duration });
  }

  function finishFaradayAnim(data) {
    const pending = data.pendingAnim;
    if (!pending) return false;
    if (pending.channel === 'x') data.x = pending.to;
    else data.B = pending.to;
    const dt = Math.max(1e-6, data._time - pending.t0, pending.duration);
    const flux1 = faradayFlux(data.B, data.x, data.rodLength, data.xEnd);
    const dFlux = flux1 - pending.flux0;
    const emf = faradayEmfFromDelta(dFlux, dt);
    const sense = faradaySense(dFlux / dt);
    if (pending.channel === 'x') {
      const dx = data.x - pending.x0;
      data.lastMotion = {
        x0: pending.x0,
        x1: data.x,
        dx,
        dt,
        B: pending.B0,
        flux0: pending.flux0,
        flux1,
        dFlux,
        emf,
        sense,
        senseLabel: faradaySenseLabel(sense),
      };
      data.records.push({ type: 'motion', ...data.lastMotion });
      if (state.stepIndex < 1 && Math.abs(dx) > 1e-4) setStep('field');
      toast(`动生测量完成：E = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    } else {
      const dB = data.B - pending.from;
      data.lastInduction = {
        B0: pending.from,
        B1: data.B,
        dB,
        dt,
        area: pending.area0,
        flux0: pending.flux0,
        flux1,
        dFlux,
        emf,
        sense,
        senseLabel: faradaySenseLabel(sense),
      };
      data.records.push({ type: 'induction', ...data.lastInduction });
      if (state.stepIndex < 2 && Math.abs(dB) > 1e-6) setStep('conclude');
      toast(`感生测量完成：E = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    }
    data.records = data.records.slice(-12);
    data.pendingAnim = null;
    data.pendingB = null;
    data.inductionStart = null;
    data.measureMode = null;
    // Stop current flow as soon as the change ends (no linger).
    data.currentSense = 'none';
    data.lingerSense = 'none';
    data.liveEmf = 0;
    data.animProgress = 0;
    data.currentLinger = 0;
    return true;
  }

  /** Stop early: treat current value as the endpoint and record the partial change. */
  function stopFaradayAnim(data) {
    const pending = data.pendingAnim;
    if (!pending) return false;
    pending.to = pending.channel === 'x' ? Number(data.x) : Number(data.B);
    pending.duration = Math.max(1e-3, data._time - pending.t0);
    return finishFaradayAnim(data);
  }

  // Back-compat alias used by reverse-B path.
  function finishFaradayBChange(data) {
    return finishFaradayAnim(data);
  }

  function beginFaradaySlider(data) {
    if (faradayBusy(data)) return false;
    data.sliderDragging = true;
    data.measureMode = 'induction';
    data.currentSense = 'none';
    data.sliderStart = {
      B0: data.B,
      t0: data._time,
      area: faradayArea(data.x, data.rodLength, data.xEnd),
      flux0: faradayFlux(data.B, data.x, data.rodLength, data.xEnd),
      // dragB0 is the relative-drag origin (may differ from B0 after click-to-set).
      dragB0: data.B,
    };
    return true;
  }

  /** Map a faraday-b-slider hit (desk 3D value or content-screen px) → B. */
  function faradayBFromPick(pick) {
    if (!pick || pick.action !== 'faraday-b-slider') return null;
    const min = Number(pick.min ?? -3);
    const max = Number(pick.max ?? 3);
    if (Number.isFinite(pick.value)) return clamp(Number(pick.value), min, max);
    if (!Number.isFinite(pick.px)) return null;
    const trackX = Number.isFinite(pick.trackX) ? Number(pick.trackX) : Number(pick.x || 0);
    const trackW = Math.max(1, Number.isFinite(pick.trackW) ? Number(pick.trackW) : Number(pick.w || 1));
    const u = clamp((Number(pick.px) - trackX) / trackW, 0, 1);
    return min + u * (max - min);
  }

  /**
   * Jump the thumb to an absolute B while keeping relative drag continuous.
   * totalX is the cumulative pointer delta already spent in this gesture so
   * B = dragB0 + totalX*0.01 still equals `value` after the jump.
   */
  function setFaradaySliderAbsolute(data, value, totalX = 0) {
    const next = clamp(Number(value), -3, 3);
    data.B = next;
    if (data.sliderStart) {
      data.sliderStart.dragB0 = next - Number(totalX || 0) * 0.01;
    }
  }

  function applyFaradaySliderRelative(data, totalX) {
    const start = data.sliderStart;
    if (!start) return;
    const base = Number.isFinite(start.dragB0) ? start.dragB0 : start.B0;
    data.B = clamp(base + Number(totalX || 0) * 0.01, -3, 3);
  }

  function finishFaradaySlider(data) {
    const start = data.sliderStart;
    if (!data.sliderDragging || !start) return false;
    const dt = Math.max(1e-6, data._time - start.t0);
    const flux1 = faradayFlux(data.B, data.x, data.rodLength, data.xEnd);
    const dFlux = flux1 - start.flux0;
    const dB = data.B - start.B0;
    const emf = faradayEmfFromDelta(dFlux, dt);
    const sense = faradaySense(dFlux / dt);
    data.lastInduction = {
      B0: start.B0, B1: data.B, dB, dt, area: start.area,
      flux0: start.flux0, flux1, dFlux, emf, sense,
      senseLabel: faradaySenseLabel(sense),
    };
    data.records.push({ type: 'induction', ...data.lastInduction });
    data.records = data.records.slice(-12);
    data.sliderDragging = false;
    data.sliderStart = null;
    data.measureMode = null;
    data.currentSense = 'none';
    data.lingerSense = 'none';
    data.currentLinger = 0;
    data.liveEmf = 0;
    if (state.stepIndex < 2 && Math.abs(dB) > 1e-6) setStep('conclude');
    toast(`磁场滑块测量完成：E = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    return true;
  }

  function updateFaraday(data, dt = 0) {
    const step = Math.max(0, Number(dt || 0));
    data._time += step;
    if (data.pendingAnim) {
      const p = data.pendingAnim;
      const u = clamp((data._time - p.t0) / Math.max(1e-6, p.duration), 0, 1);
      // Linear ramp → constant dΦ/dt for the whole play (current arrows stay lit).
      const val = p.from + (p.to - p.from) * u;
      data.animProgress = u;
      // Prefer frame velocity for x (matches manual rod); planned rate for B.
      if (p.channel === 'x') {
        data.x = val;
        const v = step > 1e-8 ? (data.x - data._prevX) / step : Number(p.dValDt || 0);
        const dFluxDt = Number(data.B || 0) * Number(data.rodLength || FARADAY_ROD_LENGTH) * v;
        // Fallback planned rate if this frame's dx is 0 (first tick).
        const rate = Math.abs(dFluxDt) > 1e-8 ? dFluxDt : Number(p.dFluxDt || 0);
        data.currentSense = faradaySense(rate);
        data.liveEmf = -rate;
      } else {
        data.B = val;
        const dFluxDt = Number(p.dFluxDt);
        data.currentSense = faradaySense(dFluxDt);
        data.liveEmf = -dFluxDt;
      }
      if (u >= 1) finishFaradayAnim(data);
    } else if (data.dragging && data.motionStart) {
      const v = step > 1e-8 ? (data.x - data._prevX) / step : 0;
      const dFluxDt = data.B * data.rodLength * v;
      data.currentSense = faradaySense(dFluxDt);
      data.liveEmf = -dFluxDt;
    } else if (data.sliderDragging && data.sliderStart) {
      const elapsed = Math.max(step, data._time - data.sliderStart.t0);
      const dFluxDt = data.sliderStart.area * (data.B - data.sliderStart.B0) / elapsed;
      data.currentSense = faradaySense(dFluxDt);
      data.liveEmf = -dFluxDt;
    } else {
      data.currentSense = 'none';
      data.liveEmf = 0;
      data.animProgress = 0;
      data.currentLinger = 0;
      data.lingerSense = 'none';
    }
    data._prevX = data.x;
    syncFaraday(data, false, step);
    data._hudThrottle += step;
    // Anim / drag needs livelier readout; keep well under full paint every frame.
    const hudInterval = data.pendingAnim || data.sliderDragging || data.dragging
      ? 0.08
      : 0.22;
    if (data._hudThrottle > hudInterval) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }

  function calculateHallField(data, pos = data.probePos) {
    if (!data.wiring?.energized || data.wiring.target !== data.target) return 0;
    const x = Number(pos || 0) / 100;
    const Im = Number(data.Im || 0);
    let bTesla;
    if (data.target === 'helmholtz') {
      const fixedX = -0.025;
      const movingX = Number(data.rightCoilPos ?? 2.5) / 100;
      const fieldAt = (centreX) => (
        HALL_MU0 * HALL_COIL_TURNS * Im * HALL_COIL_RADIUS_M ** 2
        / (2 * Math.pow(HALL_COIL_RADIUS_M ** 2 + (x - centreX) ** 2, 1.5))
      );
      bTesla = fieldAt(fixedX) + fieldAt(movingX);
    } else {
      const halfLength = HALL_SOLENOID_LENGTH_M / 2;
      const turnsPerMetre = Number(data.turns || 100) / HALL_SOLENOID_LENGTH_M;
      const endCos = (z) => z / Math.sqrt(z * z + HALL_SOLENOID_RADIUS_M ** 2);
      bTesla = HALL_MU0 * turnsPerMetre * Im * 0.5
        * (endCos(x + halfLength) - endCos(x - halfLength));
    }
    return bTesla * Number(data.direction || 1);
  }

  function calculateHallVoltage(data) {
    return HALL_K * Number(data.Is || 0) * calculateHallField(data)
      + Number(data.zeroOffset || 0);
  }

  function syncHall(data, refresh = true) {
    applyWiringState(data);
    data.vh = calculateHallVoltage(data);
    equipment.electro?.updateHall?.(data);
    if (refresh) pushHud();
  }

  function syncHallDemo(data, refresh = true) {
    data.vh = hallDemoVoltage(data);
    data.force = hallDemoForce(data);
    equipment.electro?.updateHallDemo?.(data, 0);
    if (refresh) pushHud();
  }


  function remainingHallParts(data) {
    return HALL_PART_ROLES.filter((role) => !data.identified?.[role]);
  }

  /** Next equipment that must be identified (strict sequential order). */
  function nextHallPart(data) {
    return remainingHallParts(data)[0] || null;
  }

  function setIdentifyFeedback(ok, text) {
    const data = state.data;
    if (!data) return;
    data.identifyFeedback = {
      ok: !!ok,
      text: String(text || ''),
      at: Date.now(),
    };
  }

  function refreshHallIdentifyVisuals(hoverRole) {
    const data = state.data;
    if (state.expId !== 'hall_effect' || currentStep()?.id !== 'identify') return;
    const next = nextHallPart(data);
    // Strict: outline only while the crosshair is on that part.
    // Identified parts stay mode "done" so their hit volumes stop blocking
    // rear apparatus (solenoid sits behind Helmholtz on the bench).
    HALL_PART_ROLES.forEach((role) => {
      let mode = 'off';
      if (data.identified?.[role]) {
        mode = 'done';
      } else if (hoverRole === role) {
        mode = role === next ? 'hover' : 'locked';
      }
      equipment.electro?.setHallPartState?.(role, mode);
    });
    data._hoverRole = hoverRole || null;
    data.identifyNext = next;
  }


  function identifyHallRole(role) {
    const data = state.data;
    const name = HALL_PART_NAMES[role];
    if (!name || !data.identified) return false;

    // Already done earlier in the sequence
    if (data.identified[role]) {
      const next = nextHallPart(data);
      const msg = next
        ? `「${name}」已识别过。请按顺序瞄准：${HALL_PART_NAMES[next]}`
        : `「${name}」已识别过。器材认识已完成`;
      toast(msg);
      setIdentifyFeedback(true, msg);
      refreshHallIdentifyVisuals(role);
      pushHud();
      return true;
    }

    const expected = nextHallPart(data);
    // Wrong order: this is a real apparatus, but not the current step target
    if (expected && role !== expected) {
      const expectedName = HALL_PART_NAMES[expected];
      const expectedIdx = HALL_PART_ROLES.indexOf(expected) + 1;
      const pickedIdx = HALL_PART_ROLES.indexOf(role) + 1;
      const msg = `选错了：当前应按顺序识别第 ${expectedIdx} 件「${expectedName}」，你点的是第 ${pickedIdx} 件「${name}」`;
      toast(msg);
      setIdentifyFeedback(false, msg);
      data._lastWrongRole = role;
      refreshHallIdentifyVisuals(role);
      pushHud();
      return true;
    }

    data.identified[role] = true;
    data._lastWrongRole = null;
    const remaining = remainingHallParts(data);
    if (!remaining.length) {
      equipment.electro?.clearHallIdentifyVisuals?.();
      const msg = `✓ 正确：已识别「${name}」。器材认识完成，请到内容屏选择测量对象`;
      toast(msg);
      setIdentifyFeedback(true, msg);
      advanceStep();
    } else {
      const next = remaining[0];
      const nextIdx = HALL_PART_ROLES.indexOf(next) + 1;
      const msg = `✓ 正确：已识别「${name}」。下一项（${String(nextIdx).padStart(2, '0')}）：${HALL_PART_NAMES[next]}`;
      toast(msg);
      setIdentifyFeedback(true, msg);
      refreshHallIdentifyVisuals(null);
    }
    pushHud();
    return true;
  }


  function identifyHallWrong(role) {
    const expected = nextHallPart(state.data);
    const expectedName = expected ? HALL_PART_NAMES[expected] : '';
    const expectedIdx = expected ? HALL_PART_ROLES.indexOf(expected) + 1 : 0;
    let wrongLabel = '空白处或其他物体';
    if (role === 'ui_action') wrongLabel = '界面按钮';
    else if (role && role !== 'generic') wrongLabel = role;
    const msg = expected
      ? `选错了：「${wrongLabel}」不是目标。请按顺序瞄准第 ${expectedIdx} 件「${expectedName}」`
      : '器材认识已完成';
    toast(msg);
    setIdentifyFeedback(false, msg);
    state.data._lastWrongRole = role || 'generic';
    refreshHallIdentifyVisuals(state.data._hoverRole);
    pushHud();
    return true;
  }


  function applyVisualDefaults(expId) {
    if (!equipment.electro) return;
    // Visibility only; heavy field rebuild is a separate frame-budget job.
    let kind = null;
    if (expId === 'faraday_induction') {
      equipment.electro.setMode?.('faraday');
      kind = 'faraday';
    } else if (expId === 'induced_electric_field') {
      equipment.electro.setMode?.('induced-e');
      kind = 'induced-e';
    } else if (expId === 'hall_effect') {
      equipment.electro.setMode?.('hall');
      kind = 'hall';
    } else if (expId === 'hall_carrier_demo') {
      equipment.electro.setMode?.('hall-demo');
      kind = 'hall-demo';
    } else if (expId === 'gauss_theorem') {
      equipment.electro.setMode?.('gauss');
      kind = 'gauss';
    } else if (expId === 'electric_field') {
      equipment.electro.setMode?.('electric-field');
      kind = 'electric-field';
    }
    if (!kind) return;
    state.data._awaitElectroSync = kind;
    state.data._electroDetailsPending = true;
    // setMode is O(1) mount. Field sync is deferred and usually a signature no-op
    // after boot prewarm — never soft-switch the lab for it.
    labFrameScheduler.schedule('electro:sync-detail', () => {
      if (!state.running || state.expId !== expId) return;
      // Flush without forcing a HUD repaint when nothing visual changed.
      flushDeferredElectroSync();
    }, { priority: 35, soft: true });
  }

  function flushDeferredElectroSync() {
    const kind = state.data?._awaitElectroSync;
    if (!kind || !state.running) return false;
    state.data._awaitElectroSync = null;
    if (kind === 'faraday') syncFaraday(state.data, false);
    else if (kind === 'induced-e') syncInducedElectric(state.data, false);
    else if (kind === 'hall') {
      syncHall(state.data, false);
      refreshHallIdentifyVisuals(null);
    } else if (kind === 'hall-demo') syncHallDemo(state.data, false);
    else if (kind === 'gauss') syncGauss(state.data, false);
    else if (kind === 'electric-field') syncElectricField(state.data, false);
    else return false;
    state.data._electroDetailsPending = false;
    return true;
  }



  function onUiAction(action, payload = {}) {
    if (state.expId === 'induced_electric_field') {
      const data = state.data;
      if (action === 'induced-e-adjust') {
        const key = payload.key;
        const delta = Number(payload.delta || 0);
        if (key === 'R') data.R = clamp(data.R + delta, INDUCED_E_R_MIN, INDUCED_E_R_MAX);
        if (key === 'amp') data.amp = clamp(data.amp + delta, 0.2, INDUCED_E_AMP_MAX);
        if (key === 'omega') data.omega = clamp(data.omega + delta, 0.15, INDUCED_E_OMEGA_MAX);
        if (key === 'B' && !data.auto) {
          data.B = clamp(Number(data.B || 0) + delta, -INDUCED_E_AMP_MAX, INDUCED_E_AMP_MAX);
        }
        if (key === 'dBdt' && !data.auto) {
          data.dBdt = clamp(
            Number(data.dBdt || 0) + delta,
            -INDUCED_E_AMP_MAX * INDUCED_E_OMEGA_MAX,
            INDUCED_E_AMP_MAX * INDUCED_E_OMEGA_MAX,
          );
        }
        if (key === 'probeR') {
          const nextR = clamp(Number(data.probeR || 0) + delta, 0.15, INDUCED_E_PROBE_R_MAX);
          const angle = Math.atan2(Number(data.probe?.z || 0), Number(data.probe?.x || 1));
          data.probe.x = nextR * Math.cos(angle);
          data.probe.z = nextR * Math.sin(angle);
          data.probeR = nextR;
          if (state.stepIndex < 1) setStep('probe');
        }
        if (key === 'q0') {
          const magnitude = clamp(Math.abs(Number(data.probe?.q0 || 1)) + delta, 0.2, 3);
          data.probe.q0 = Math.sign(data.probe.q0 || 1) * Math.round(magnitude * 10) / 10;
        }
        if (state.stepIndex < 2 && (key === 'amp' || key === 'omega' || key === 'B' || key === 'dBdt')) {
          setStep('lenz');
        }
      } else if (action === 'induced-e-set' || action === 'induced-e-slider') {
        // Absolute value from content-screen sliders (live drag or one-shot set).
        const key = payload.key;
        let value = Number(payload.value);
        if (!Number.isFinite(value) && Number.isFinite(payload.px)) {
          const trackX = Number.isFinite(payload.trackX) ? Number(payload.trackX) : Number(payload.x || 0);
          const trackW = Math.max(1, Number.isFinite(payload.trackW) ? Number(payload.trackW) : Number(payload.w || 1));
          const min = Number(payload.min);
          const max = Number(payload.max);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            const u = clamp((Number(payload.px) - trackX) / trackW, 0, 1);
            value = min + u * (max - min);
          }
        }
        if (!key || !Number.isFinite(value)) return true;
        if (key === 'R') data.R = clamp(value, INDUCED_E_R_MIN, INDUCED_E_R_MAX);
        else if (key === 'amp') {
          data.amp = clamp(value, 0.2, INDUCED_E_AMP_MAX);
          if (state.stepIndex < 2) setStep('lenz');
        } else if (key === 'omega') {
          data.omega = clamp(value, 0.15, INDUCED_E_OMEGA_MAX);
          if (state.stepIndex < 2) setStep('lenz');
        } else if (key === 'probeR') {
          const nextR = clamp(value, 0.15, INDUCED_E_PROBE_R_MAX);
          const angle = Math.atan2(Number(data.probe?.z || 0), Number(data.probe?.x || 1));
          data.probe.x = nextR * Math.cos(angle);
          data.probe.z = nextR * Math.sin(angle);
          data.probeR = nextR;
          if (state.stepIndex < 1) setStep('probe');
        } else if (key === 'q0') {
          const magnitude = clamp(Math.abs(value), 0.2, 3);
          data.probe.q0 = Math.sign(data.probe?.q0 || 1) * magnitude;
        } else if (key === 'dBdt' && !data.auto) {
          data.dBdt = clamp(
            value,
            -INDUCED_E_AMP_MAX * INDUCED_E_OMEGA_MAX,
            INDUCED_E_AMP_MAX * INDUCED_E_OMEGA_MAX,
          );
          if (state.stepIndex < 2) setStep('lenz');
        } else if (key === 'B' && !data.auto) {
          data.B = clamp(value, -INDUCED_E_AMP_MAX, INDUCED_E_AMP_MAX);
          if (state.stepIndex < 2) setStep('lenz');
        }
        data.sliderDragging = action === 'induced-e-slider' || payload.live === true;
        // Live slider moves: skip full HUD every pointermove (update loop paints).
        syncInducedElectric(data, !data.sliderDragging);
        return true;
      } else if (action === 'induced-e-mode') {
        const nextAuto = payload.auto !== false;
        data.auto = nextAuto;
        if (nextAuto) {
          // Enter auto: seed phase from current B so the sine starts smoothly.
          const amp = Math.max(0.2, Number(data.amp || 1));
          const b = clamp(Number(data.B || 0) / amp, -1, 1);
          // Prefer phase whose cos matches current dB/dt sign (dB/dt ∝ cos φ).
          let phase = Math.asin(b);
          const wantCos = Math.sign(Number(data.dBdt || 0));
          if (wantCos < 0 && Math.cos(phase) > 0) phase = Math.PI - phase;
          if (wantCos > 0 && Math.cos(phase) < 0) phase = Math.PI - phase;
          data.phase = phase;
          data.paused = false;
          if (state.stepIndex < 2) setStep('lenz');
        }
        // Leaving auto freezes the last B / dB/dt from recomputeInducedElectric.
      } else if (action === 'induced-e-pause') {
        // Pause only affects the auto oscillator; keep the toggle for UI consistency.
        data.paused = !data.paused;
      } else if (action === 'induced-e-flip') {
        // Reverse the sense of dB/dt: flip phase by π in auto mode.
        if (data.auto) data.phase += Math.PI;
        else data.dBdt = -Number(data.dBdt || 0);
        if (state.stepIndex < 2) setStep('lenz');
      } else if (action === 'induced-e-toggle') {
        const key = {
          B: 'showB', E: 'showE', particles: 'showParticles', probe: 'showProbe',
        }[payload.key];
        if (key) data[key] = !data[key];
      } else if (action === 'induced-e-probe-sign') {
        data.probe.q0 = (Number(payload.sign) < 0 ? -1 : 1) * Math.max(0.2, Math.abs(data.probe.q0));
      } else if (action === 'induced-e-reset') {
        Object.assign(data, initData('induced_electric_field'));
      } else if (action === 'induced-e-complete') {
        data.completed = true;
        state.stepIndex = Math.max(state.stepIndex, 3);
        toast('感生电场实验完成：面内 E∝r，面外 E∝1/r');
      } else {
        return false;
      }
      syncInducedElectric(data);
      return true;
    }
    if (state.expId === 'faraday_induction') {
      const data = state.data;
      if (action === 'faraday-b-set') {
        // Live slider drags fire this every pointermove — never full-HUD refresh
        // here (updateFaraday throttles the content-screen paint).
        if (data.pendingAnim) return true;
        if (!data.sliderDragging && !beginFaradaySlider(data)) return true;
        setFaradaySliderAbsolute(data, payload.value ?? data.B, 0);
        syncFaraday(data, false);
        return true;
      }
      if (action === 'faraday-b-slider') {
        // Content-screen hit region action id (not a discrete button). Arm the
        // drag; optional px / value jump the thumb to the aim position.
        if (data.pendingAnim) return true;
        if (!data.sliderDragging && !beginFaradaySlider(data)) return true;
        const fromPick = faradayBFromPick(payload);
        const value = Number.isFinite(payload?.value) ? Number(payload.value) : fromPick;
        if (value != null && Number.isFinite(value)) {
          setFaradaySliderAbsolute(data, value, 0);
        }
        syncFaraday(data, false);
        return true;
      }
      if (action === 'faraday-set') {
        // B / x: live desk (or content) drags arm measurement so current arrows
        // light while Φ changes. target* / animDuration are setup-only.
        // Non-live sets (preset before play, tests) snap values without a gesture.
        if (data.pendingAnim) return true;
        const key = payload.key;
        let value = Number(payload.value);
        if (!Number.isFinite(value) && Number.isFinite(payload.px)) {
          const trackX = Number.isFinite(payload.trackX) ? Number(payload.trackX) : Number(payload.x || 0);
          const trackW = Math.max(1, Number.isFinite(payload.trackW) ? Number(payload.trackW) : Number(payload.w || 1));
          const min = Number(payload.min);
          const max = Number(payload.max);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            const u = clamp((Number(payload.px) - trackX) / trackW, 0, 1);
            value = min + u * (max - min);
          }
        }
        if (!Number.isFinite(value)) return true;
        const live = payload.live === true;
        if (key === 'B') {
          const next = clamp(value, -3, 3);
          if (live) {
            // Don't interleave with rod / x-slider motion.
            if (data.dragging) return true;
            if (!data.sliderDragging && !beginFaradaySlider(data)) return true;
            setFaradaySliderAbsolute(data, next, 0);
          } else if (data.sliderDragging) {
            setFaradaySliderAbsolute(data, next, 0);
          } else {
            data.B = next;
          }
        } else if (key === 'x') {
          const next = clamp(value, FARADAY_X_MIN, FARADAY_X_MAX);
          if (live) {
            // Don't interleave with B-slider induction measurement.
            if (data.sliderDragging) return true;
            if (!data.dragging) {
              data.dragging = true;
              data.measureMode = 'motion';
              data.motionStart = {
                t0: data._time,
                x0: data.x,
                B: data.B,
                flux0: faradayFlux(data.B, data.x, data.rodLength, data.xEnd),
              };
              data._prevX = data.x;
              data.currentSense = 'none';
              data.liveEmf = 0;
            }
            data.x = next;
          } else {
            data.x = next;
          }
        } else if (key === 'targetB') data.targetB = clamp(value, -3, 3);
        else if (key === 'targetX') data.targetX = clamp(value, FARADAY_X_MIN, FARADAY_X_MAX);
        else if (key === 'animDuration') data.animDuration = clamp(value, 0.3, 6);
        else return false;
        // Live drag: light sync; updateFaraday owns sense/E each frame.
        // Release / non-live setup gets a full HUD refresh.
        syncFaraday(data, !live);
        return true;
      }
      if (action === 'faraday-channel') {
        const ch = payload.channel === 'x' ? 'x' : 'B';
        data.animChannel = ch;
        syncFaraday(data);
        return true;
      }
      if (action === 'faraday-play') {
        const ok = startFaradayAnim(data, {
          channel: payload.channel || data.animChannel,
          to: payload.to,
          duration: payload.duration,
        });
        if (ok) {
          toast(data.pendingAnim?.channel === 'x'
            ? '动生：铜棒位置动态变化中…'
            : '感生：磁场动态变化中…');
        }
        syncFaraday(data);
        return true;
      }
      if (action === 'faraday-stop') {
        if (data.pendingAnim) stopFaradayAnim(data);
        syncFaraday(data);
        return true;
      }
      if (action === 'faraday-b-step') {
        const delta = Number(payload.delta || 0.2);
        startFaradayBChange(data, data.B + delta, 0.5);
      } else if (action === 'faraday-reverse') {
        startFaradayBChange(data, -data.B, Math.max(0.5, Number(data.animDuration || 1.2) * 0.6));
      } else if (action === 'faraday-toggle-field') {
        data.showField = !data.showField;
      } else if (action === 'faraday-reset') {
        Object.assign(data, initData('faraday_induction'));
      } else if (action === 'faraday-complete') {
        data.completed = true;
        state.stepIndex = Math.max(state.stepIndex, 2);
        toast('法拉第电磁感应实验完成');
      } else {
        return false;
      }
      syncFaraday(data);
      return true;
    }
    if (state.expId === 'electric_field') {
      const data = state.data;
      const charge = selectedElectricCharge(data);
      const probe = data.probe;
      if (action === 'electric-select') {
        const id = Number(payload.id);
        if (data.charges.some((item) => item.id === id)) data.selectedId = id;
      } else if (action === 'electric-set') {
        const key = payload.key;
        const value = Number(payload.value);
        if (!Number.isFinite(value)) return true;
        const onProbe = payload.target === 'probe';
        if (onProbe && probe) {
          if (key === 'q0') {
            probe.q0 = Math.sign(probe.q0 || 1) * clamp(Math.abs(value), 0.2, 3);
          } else if (['x', 'y', 'z'].includes(key)) {
            probe[key] = clamp(value, -5, 5);
          } else if (payload.axis) {
            probe[payload.axis] = clamp(value, -5, 5);
          }
        } else if (key === 'q' && charge) {
          charge.q = Math.sign(charge.q || 1) * clamp(Math.abs(value), 0.2, 3);
        } else if (['x', 'y', 'z'].includes(key) && charge) {
          charge[key] = clamp(value, -4.5, 4.5);
        } else if (payload.axis && charge) {
          charge[payload.axis] = clamp(value, -4.5, 4.5);
        }
        syncElectricField(data, payload.live !== true);
        return true;
      } else if (action === 'electric-add') {
        if (data.charges.length >= 12) {
          toast('最多放置 12 个点电荷');
          return true;
        }
        const id = data.nextChargeId++;
        const angle = data.charges.length * 1.9;
        const radius = 1.3;
        data.charges.push({
          id,
          q: Number(payload.sign) < 0 ? -1 : 1,
          x: Math.cos(angle) * radius,
          y: 0.2 * (data.charges.length % 3 - 1),
          z: Math.sin(angle) * radius,
        });
        data.selectedId = id;
      } else if (action === 'electric-delete') {
        if (charge) data.charges = data.charges.filter((item) => item.id !== charge.id);
        data.selectedId = data.charges[0]?.id ?? null;
      } else if (action === 'electric-sign' && charge) {
        charge.q = (Number(payload.sign) < 0 ? -1 : 1) * Math.max(0.2, Math.abs(charge.q));
      } else if (action === 'electric-charge' && charge) {
        const magnitude = clamp(Math.abs(charge.q) + Number(payload.delta || 0), 0.2, 3);
        charge.q = Math.sign(charge.q || 1) * Math.round(magnitude * 10) / 10;
      } else if (action === 'electric-move' && charge) {
        const axis = ['x', 'y', 'z'].includes(payload.axis) ? payload.axis : 'x';
        charge[axis] = clamp(charge[axis] + Number(payload.delta || 0), -4.5, 4.5);
      } else if (action === 'electric-center' && charge) {
        charge.x = 0; charge.y = 0; charge.z = 0;
      } else if (action === 'electric-probe-move') {
        const axis = ['x', 'y', 'z'].includes(payload.axis) ? payload.axis : 'x';
        probe[axis] = clamp(probe[axis] + Number(payload.delta || 0), -5, 5);
      } else if (action === 'electric-probe-charge') {
        const magnitude = clamp(Math.abs(probe.q0) + Number(payload.delta || 0), 0.2, 3);
        probe.q0 = Math.sign(probe.q0 || 1) * Math.round(magnitude * 10) / 10;
      } else if (action === 'electric-probe-sign') {
        probe.q0 = (Number(payload.sign) < 0 ? -1 : 1) * Math.max(0.2, Math.abs(probe.q0));
      } else if (action === 'electric-toggle') {
        const key = {
          lines: 'showLines', arrows: 'showArrows', equipot: 'showEquipot', probe: 'showProbe',
        }[payload.key];
        if (key) data[key] = !data[key];
      } else if (action === 'electric-axis-lock') {
        const axis = String(payload.axis || payload.key || '').toLowerCase();
        if (!['x', 'y', 'z'].includes(axis)) return true;
        if (!data.axisLock || typeof data.axisLock !== 'object') {
          data.axisLock = { x: false, y: false, z: false };
        }
        // Explicit value (desk / tests) or toggle on each click.
        if (payload.locked === true || payload.locked === false) {
          data.axisLock[axis] = payload.locked;
        } else {
          data.axisLock[axis] = !data.axisLock[axis];
        }
        toast(electricAxisLockSummary(data));
      } else if (action === 'electric-formula') {
        data.formulaTab = ['def', 'force', 'point', 'super', 'dipole'].includes(payload.key)
          ? payload.key
          : 'def';
      } else if (action === 'electric-auto') {
        data.autoRotate = !data.autoRotate;
      } else if (action === 'electric-reset-view') {
        data.resetView = (data.resetView || 0) + 1;
      } else if (action === 'electric-reset') {
        Object.assign(data, initData('electric_field'));
      } else if (action === 'electric-complete') {
        data.completed = true;
        toast('静电场探索完成');
      } else {
        return false;
      }
      syncElectricField(data);
      return true;
    }
    if (state.expId === 'gauss_theorem') {
      const data = state.data;
      const charge = selectedGaussCharge(data);
      if (action === 'gauss-select') {
        const id = Number(payload.id);
        if (data.charges.some((item) => item.id === id)) data.selectedId = id;
      } else if (action === 'gauss-set') {
        const key = payload.key;
        const value = Number(payload.value);
        if (!Number.isFinite(value)) return true;
        if (key === 'radius' || key === 'R') data.radius = clamp(value, 1.2, 4.2);
        else if (key === 'q' && charge) {
          charge.q = Math.sign(charge.q || 1) * clamp(Math.abs(value), 0.2, 3);
        } else if (['x', 'y', 'z'].includes(key) && charge) {
          charge[key] = clamp(value, -5, 5);
          if (state.stepIndex < 1) setStep('cross');
        } else if (payload.axis && charge) {
          charge[payload.axis] = clamp(value, -5, 5);
          if (state.stepIndex < 1) setStep('cross');
        }
        if (state.stepIndex < 2 && (data.charges.length > 1 || Math.abs(data.radius - 2.4) > 0.05)) setStep('compare');
        syncGauss(data, payload.live !== true);
        return true;
      } else if (action === 'gauss-radius') {
        if (Number.isFinite(Number(payload.value))) {
          data.radius = clamp(Number(payload.value), 1.2, 4.2);
        } else {
          data.radius = clamp(data.radius + Number(payload.delta || 0), 1.2, 4.2);
        }
      } else if (action === 'gauss-add') {
        if (data.charges.length >= 6) {
          toast('最多放置 6 个点电荷');
          return true;
        }
        const id = data.nextChargeId++;
        const angle = data.charges.length * 1.7;
        const spread = Math.min(data.radius * 0.55, 1.4);
        data.charges.push({
          id,
          q: Number(payload.sign) < 0 ? -1 : 1,
          x: Math.cos(angle) * spread,
          y: 0.15 * (data.charges.length % 3 - 1),
          z: Math.sin(angle) * spread,
        });
        data.selectedId = id;
      } else if (action === 'gauss-delete') {
        if (charge) data.charges = data.charges.filter((item) => item.id !== charge.id);
        data.selectedId = data.charges[0]?.id ?? null;
      } else if (action === 'gauss-sign' && charge) {
        charge.q = (Number(payload.sign) < 0 ? -1 : 1) * Math.max(0.2, Math.abs(charge.q));
      } else if (action === 'gauss-charge' && charge) {
        const magnitude = clamp(Math.abs(charge.q) + Number(payload.delta || 0), 0.2, 3);
        charge.q = Math.sign(charge.q || 1) * Math.round(magnitude * 10) / 10;
      } else if (action === 'gauss-move' && charge) {
        const axis = ['x', 'y', 'z'].includes(payload.axis) ? payload.axis : 'x';
        charge[axis] = clamp(charge[axis] + Number(payload.delta || 0), -5, 5);
        if (state.stepIndex < 1) setStep('cross');
      } else if (action === 'gauss-center' && charge) {
        charge.x = 0; charge.y = 0; charge.z = 0;
      } else if (action === 'gauss-toggle') {
        const key = { surface: 'showSurface', lines: 'showLines', flux: 'showFlux' }[payload.key];
        if (key) data[key] = !data[key];
      } else if (action === 'gauss-reset') {
        Object.assign(data, initData('gauss_theorem'));
      } else if (action === 'gauss-complete') {
        data.completed = true;
        state.stepIndex = 3;
        toast('高斯定理验证完成：Φ_E = Q内/ε₀');
      } else {
        return false;
      }
      if (state.stepIndex < 2 && (data.charges.length > 1 || Math.abs(data.radius - 2.4) > 0.05)) setStep('compare');
      syncGauss(data);
      return true;
    }
    if (state.expId === 'hall_carrier_demo') {
      const data = state.data;
      if (action === 'hall-demo-adjust' || action === 'hall-demo-set') {
        const key = payload.key;
        if (action === 'hall-demo-set' && Number.isFinite(Number(payload.value))) {
          const value = Number(payload.value);
          if (key === 'I') data.I = clamp(value, 0, 2);
          if (key === 'B') data.B = clamp(value, -2, 2);
          if (key === 'n') data.n = clamp(value, 0.3, 2.5);
          if (key === 'd') data.d = clamp(value, 0.1, 1.2);
        } else {
          const delta = Number(payload.delta || 0);
          if (key === 'I') data.I = clamp(data.I + delta, 0, 2);
          if (key === 'B') data.B = clamp(data.B + delta, -2, 2);
          if (key === 'n') data.n = clamp(data.n + delta, 0.3, 2.5);
          if (key === 'd') data.d = clamp(data.d + delta, 0.1, 1.2);
        }
        syncHallDemo(data, payload.live !== true);
        return true;
      }
      if (action === 'hall-demo-type') {
        data.nType = payload.nType !== false;
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-flip') {
        data.B *= -1;
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-pause') {
        data.paused = !data.paused;
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-field') {
        data.showB = !data.showB;
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-auto') {
        data.autoCam = !data.autoCam;
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-reset') {
        Object.assign(data, initData('hall_carrier_demo'));
        syncHallDemo(data);
        return true;
      }
      return false;
    }
    if (state.expId !== 'hall_effect') return false;
    const data = state.data;
    if (action === 'hall-target') {
      data.target = payload.target === 'solenoid' ? 'solenoid' : 'helmholtz';
      if (state.stepIndex === 1) advanceStep();
      syncHall(data);
      toast(data.target === 'helmholtz' ? '测量对象：亥姆霍兹线圈' : '测量对象：长螺线管');
      return true;
    }
    if (action === 'hall-identify') {
      // Assist button only confirms the current sequential target (does not skip).
      const next = nextHallPart(data);
      if (!next) {
        toast('器材已全部识别完成');
        return true;
      }
      return identifyHallRole(next);
    }
    if (action === 'hall-adjust' || action === 'hall-set') {
      const key = payload.key;
      if (action === 'hall-set' && Number.isFinite(Number(payload.value))) {
        const value = Number(payload.value);
        if (key === 'Im') data.Im = clamp(value, 0, 1);
        if (key === 'Is') data.Is = clamp(value, 0, 10);
        if (key === 'probePos') data.probePos = clamp(value, -25, 25);
        if (key === 'rightCoilPos') data.rightCoilPos = clamp(value, -0.5, 13);
        if (key === 'turns') data.turns = Math.round(clamp(value, 10, 300) / 10) * 10;
      } else {
        const delta = Number(payload.delta || 0);
        if (key === 'Im') data.Im = clamp(data.Im + delta, 0, 1);
        if (key === 'Is') data.Is = clamp(data.Is + delta, 0, 10);
        if (key === 'probePos') data.probePos = clamp(data.probePos + delta, -25, 25);
        if (key === 'rightCoilPos') data.rightCoilPos = clamp(data.rightCoilPos + delta, -0.5, 13);
        if (key === 'turns') data.turns = Math.round(clamp(data.turns + delta, 10, 300) / 10) * 10;
      }
      if (state.stepIndex <= 2 && data.Im > 0 && data.Is > 0) setStep('scan');
      syncHall(data, payload.live !== true);
      return true;
    }
    if (action === 'hall-direction') {
      toast('请交换 Im 输出端的红黑接线来反转磁场方向');
      return true;
    }
    if (action === 'hall-record') {
      data.vh = calculateHallVoltage(data);
      data.showCurve = false;
      data.tableScrollAuto = true;
      data.tableScrollPx = 0;
      data.records.push({
        target: data.target,
        pos: data.probePos,
        vh: data.vh,
        b: calculateHallField(data) * 1000,
        Im: data.Im,
        Is: data.Is,
        rightCoilPos: data.rightCoilPos,
        turns: data.turns,
        direction: data.direction,
        zeroOffset: data.zeroOffset,
        hallK: HALL_K,
      });
      if (data.records.length > 60) data.records.shift();
      if (data.records.length >= 3 && state.stepIndex < 4) setStep('compare');
      syncHall(data);
      toast(`已记录 X=${data.probePos.toFixed(1)} cm，B=${(calculateHallField(data) * 1000).toFixed(3)} mT`);
      return true;
    }
    if (action === 'hall-clear') {
      data.records = [];
      data.showCurve = false;
      data.tableScrollAuto = true;
      data.tableScrollTop = 0;
      data.tableScrollPx = 0;
      syncHall(data);
      toast('霍尔测量记录已清空');
      return true;
    }
    if (action === 'hall-scroll-table') {
      if (!data.records || !data.records.length || data.showCurve) return false;
      // Prefer layout metrics from the live hit region so fullscreen and 3D
      // panels stay in sync; fall back to a conservative visible-row estimate.
      // NOTE: parameter name is `payload` (see onUiAction signature).
      const maxRows = Number.isFinite(Number(payload?.maxRows))
        ? Math.max(1, Math.round(Number(payload.maxRows)))
        : 8;
      const maxStart = Number.isFinite(Number(payload?.maxStart))
        ? Math.max(0, Math.round(Number(payload.maxStart)))
        : Math.max(0, data.records.length - maxRows);
      if (maxStart <= 0) return false;

      const current = Number.isFinite(data.tableScrollTop) && data.tableScrollTop >= 0 && !data.tableScrollAuto
        ? data.tableScrollTop
        : maxStart;

      // Support both discrete row deltas (wheel notches) and pixel deltas
      // (trackpad / drag). Content follows the finger: drag up → later rows.
      let rowDelta = Number(payload?.delta || 0);
      if (Number.isFinite(Number(payload?.deltaPx))) {
        const rowH = Number.isFinite(Number(payload?.rowH)) && Number(payload.rowH) > 0
          ? Number(payload.rowH)
          : 30;
        data.tableScrollPx = Number(data.tableScrollPx || 0) + Number(payload.deltaPx);
        const steps = Math.trunc(data.tableScrollPx / rowH);
        if (steps !== 0) {
          data.tableScrollPx -= steps * rowH;
          rowDelta += steps;
        }
      }
      if (!rowDelta) return true;

      data.tableScrollAuto = false;
      data.tableScrollTop = Math.max(0, Math.min(maxStart, Math.round(current + rowDelta)));
      syncHall(data);
      return true;
    }
    if (action === 'hall-chart') {
      if (!data.showCurve && data.records.length < 2) {
        toast('至少记录 2 组数据后才能生成曲线');
        return true;
      }
      data.showCurve = !data.showCurve;
      syncHall(data);
      toast(data.showCurve ? '已生成符合磁场模型的 B–X 分布曲线' : '已返回实验数据记录');
      return true;
    }
    if (action === 'hall-complete') {
      data.completed = true;
      state.stepIndex = 5;
      syncHall(data);
      toast('霍尔效应测磁实验完成');
      return true;
    }
    return false;
  }

  function onFocus(target) {
    if (state.expId === 'hall_effect' && currentStep()?.id === 'identify') {
      const role = target?.userData?.role;
      refreshHallIdentifyVisuals(HALL_PART_NAMES[role] ? role : null);
      return;
    }
  }

  function armHallCameraDrag(kind, value) {
    const data = state.data;
    data.hallDragArmed = true;
    data.hallDragging = false;
    data.hallDragMoved = false;
    data.hallHoldAccum = 0;
    data.hallDragKind = kind;
    data.hallDragStartValue = Number(value || 0);
    data.hallDragStartMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
  }


  function interact(target, _time, step) {
    if (state.expId === 'induced_electric_field') {
      const data = state.data;
      if (target?.userData?.role === 'induced_e_probe') {
        data.dragging = true;
        data.dragStart = {
          x: Number(data.probe?.x || 0),
          z: Number(data.probe?.z || 0),
        };
        data.dragMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.dragMouseY = Number(equipment.electro?.mouseDrag?.movementY || 0);
        toast('已抓住探测电荷：在水平面拖动改变 r，观察 E∝r / E∝1/r');
        if (state.stepIndex < 1) setStep('probe');
        syncInducedElectric(data);
        return true;
      }
      if (target?.userData?.role === 'ui_action') return onUiAction('induced-e-complete');
      return false;
    }
    if (state.expId === 'faraday_induction') {
      if (target?.userData?.role === 'faraday_rod') {
        const data = state.data;
        if (data.pendingAnim || data.sliderDragging) return true;
        data.dragging = true;
        data.measureMode = 'motion';
        data.motionStart = {
          t0: data._time,
          x0: data.x,
          B: data.B,
          flux0: faradayFlux(data.B, data.x, data.rodLength, data.xEnd),
        };
        data._prevX = data.x;
        data.currentSense = 'none';
        toast('已抓住铜棒：沿导轨拖动，松开后显示动生电动势');
        syncFaraday(data);
        return true;
      }
      if (target?.userData?.role === 'ui_action') return onUiAction('faraday-complete');
      return false;
    }
    if (state.expId === 'electric_field') {
      const data = state.data;
      if (target?.userData?.role === 'electric_charge') {
        const id = resolveChargeId(target);
        if (!data.charges.some((charge) => charge.id === id)) return false;
        data.selectedId = id;
        const charge = selectedElectricCharge(data);
        if (!charge) return false;
        data.dragTarget = 'charge';
        data.dragging = true;
        data.dragStart = { x: charge.x, y: charge.y, z: charge.z };
        data.dragMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.dragMouseY = Number(equipment.electro?.mouseDrag?.movementY || 0);
        syncElectricField(data);
        toast(`已选中 Q${data.charges.findIndex((item) => item.id === id) + 1}；${electricAxisLockSummary(data)}`);
        return true;
      }
      if (target?.userData?.role === 'electric_probe') {
        data.dragTarget = 'probe';
        data.dragging = true;
        data.dragStart = { ...data.probe };
        data.dragMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.dragMouseY = Number(equipment.electro?.mouseDrag?.movementY || 0);
        toast(`已选中探测电荷 q₀；${electricAxisLockSummary(data)}`);
        return true;
      }
      if (target?.userData?.role === 'ui_action') return onUiAction('electric-complete');
      return false;
    }
    if (state.expId === 'gauss_theorem') {
      if (target?.userData?.role === 'gauss_charge') {
        const data = state.data;
        const id = resolveChargeId(target);
        if (data.charges.some((charge) => charge.id === id)) data.selectedId = id;
        const charge = selectedGaussCharge(data);
        if (!charge) return false;
        data.dragArmed = true;
        data.dragging = false;
        data.dragStartX = charge.x;
        data.dragStartY = charge.y;
        data.dragMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.dragMouseY = Number(equipment.electro?.mouseDrag?.movementY || 0);
        syncGauss(data);
        toast(`已抓住 Q${data.charges.findIndex((item) => item.id === id) + 1}；拖动改变 X/Y，滚轮微调 Z`);
        return true;
      }
      if (target?.userData?.role === 'gauss_surface') {
        return onUiAction('gauss-radius', { delta: 0.1 });
      }
      if (target?.userData?.role === 'ui_action') return onUiAction('gauss-complete');
      return false;
    }
    if (state.expId === 'hall_carrier_demo') {
      if (target?.userData?.role === 'ui_action') return onUiAction('hall-demo-pause');
      return false;
    }
    if (state.expId !== 'hall_effect' || !step) return false;
    const role = target?.userData?.role;
    const terminalKey = HALL_TERMINAL_KEYS[role];
    const portId = target?.userData?.portId;
    if (terminalKey && portId) {
      const data = state.data;
      data.terminalDragFrom = portId;
      data.terminalDragGroup = terminalKey;
      data.terminalSnapPort = null;
      equipment.electro?.startHallWirePreview?.(portId);
      toast('已抓住接线端：按住鼠标，将准星拖到另一个端口后松开');
      return true;
    }
    if (step.id === 'identify') {
      // Any valid apparatus: sequential check inside identifyHallRole (wrong order = tip).
      if (HALL_PART_NAMES[role]) return identifyHallRole(role);
      if (role === 'ui_action') {
        const next = nextHallPart(state.data);
        return next ? identifyHallRole(next) : true;
      }
      return identifyHallWrong(role || 'generic');
    }
    const data = state.data;
    if (role === 'hall_helmholtz') {
      data.target = 'helmholtz';
      if (state.stepIndex === 1) advanceStep();
      armHallCameraDrag('rightCoilPos', data.rightCoilPos);
      syncHall(data);
      toast('已选择亥姆霍兹线圈；按住并转动镜头可移动右线圈');
      return true;
    }
    if (role === 'hall_solenoid') {
      data.target = 'solenoid';
      if (state.stepIndex === 1) advanceStep();
      armHallCameraDrag('turns', data.turns);
      syncHall(data);
      toast('已选择长螺线管；按住并转动镜头可调节匝数');
      return true;
    }
    if (role === 'hall_probe') {
      armHallCameraDrag('probePos', data.probePos);
      toast('已抓住霍尔探头：按住左键并转动视角沿标尺移动');
      return true;
    }
    if (role === 'hall_knob_im') {
      armHallCameraDrag('Im', data.Im);
      toast('已抓住 Im 旋钮：按住并转动镜头连续调节');
      return true;
    }
    if (role === 'hall_knob_is') {
      armHallCameraDrag('Is', data.Is);
      toast('已抓住 Is 旋钮：按住并转动镜头连续调节');
      return true;
    }
    if (role === 'hall_knob_zero') {
      data.zeroOffset -= data.vh;
      syncHall(data);
      toast('霍尔电压已调零');
      return true;
    }
    // The console-wide hit box exists for apparatus recognition only.  Once
    // recognition is complete it must not behave like the record button:
    // otherwise clicking a readout, label, or any empty part of the physical
    // instrument records a measurement.  Recording stays available through
    // the explicit hologram/accessible UI action and the F shortcut.
    if (role === 'ui_action') return onUiAction('hall-record');
    return false;
  }

  function onKey(code) {
    if (state.expId === 'induced_electric_field') {
      if (code === 'KeyP') return onUiAction('induced-e-pause');
      if (code === 'KeyR') return onUiAction('induced-e-reset');
      if (code === 'KeyF') return onUiAction('induced-e-complete');
      if (code === 'KeyB') return onUiAction('induced-e-flip');
      return false;
    }
    if (state.expId === 'faraday_induction') {
      if (code === 'KeyR') return onUiAction('faraday-reset');
      if (code === 'KeyF') return onUiAction('faraday-complete');
      if (code === 'KeyB') return onUiAction('faraday-reverse');
      return false;
    }
    if (state.expId === 'electric_field') {
      if (code === 'KeyR') return onUiAction('electric-reset');
      if (code === 'KeyF') return onUiAction('electric-complete');
      // X / Y / Z toggle axis locks for single-axis mouse drag.
      if (code === 'KeyX') return onUiAction('electric-axis-lock', { axis: 'x' });
      if (code === 'KeyY') return onUiAction('electric-axis-lock', { axis: 'y' });
      if (code === 'KeyZ') return onUiAction('electric-axis-lock', { axis: 'z' });
      return false;
    }
    if (state.expId === 'gauss_theorem') {
      if (code === 'KeyR') return onUiAction('gauss-reset');
      if (code === 'KeyF') return onUiAction('gauss-complete');
      return false;
    }
    if (state.expId === 'hall_carrier_demo') {
      if (code === 'KeyP') return onUiAction('hall-demo-pause');
      if (code === 'KeyR') return onUiAction('hall-demo-reset');
      return false;
    }
    if (state.expId !== 'hall_effect') return false;
    if (code === 'KeyF') return onUiAction('hall-record');
    if (code === 'KeyR') return onUiAction('hall-direction');
    return false;
  }

  function resolveTableScrollPick(target, pick) {
    if (pick?.action === 'hall-scroll-table' || pick?.role === 'scrollable_table') return pick;
    const regions = target?.userData?.hitRegions;
    if (!Array.isArray(regions)) return pick || null;
    return regions.find((h) => h?.action === 'hall-scroll-table' || h?.role === 'scrollable_table') || pick || null;
  }

  function onWheel(delta, target, pick) {
    if (state.expId === 'induced_electric_field') {
      if (target?.userData?.role === 'induced_e_probe') {
        const sign = Number(delta) > 0 ? 1 : -1;
        return onUiAction('induced-e-adjust', { key: 'probeR', delta: sign * 0.12 });
      }
      return false;
    }
    if (state.expId === 'faraday_induction') {
      if (target?.userData?.role === 'faraday_rod') {
        const sign = Number(delta) > 0 ? 1 : -1;
        state.data.x = clamp(state.data.x + sign * 0.08, state.data.xMin, state.data.xMax);
        syncFaraday(state.data);
        return true;
      }
      return false;
    }
    if (state.expId === 'electric_field') {
      // Wheel → world Z when unlocked (X/Y stay on drag).
      if (electricAxisLock(state.data).z) return false;
      const step = delta > 0 ? -0.2 : 0.2;
      const role = target?.userData?.role;
      // Prefer the live drag target, then aim role, then last selection.
      if (state.data.dragging && state.data.dragTarget === 'probe') {
        return onUiAction('electric-probe-move', { axis: 'z', delta: step });
      }
      if (state.data.dragging && state.data.dragTarget === 'charge') {
        return onUiAction('electric-move', { axis: 'z', delta: step });
      }
      if (role === 'electric_probe') {
        return onUiAction('electric-probe-move', { axis: 'z', delta: step });
      }
      const chargeId = Number(target?.userData?.chargeId ?? state.data.selectedId);
      if (state.data.charges.some((charge) => charge.id === chargeId)) {
        state.data.selectedId = chargeId;
        return onUiAction('electric-move', { axis: 'z', delta: step });
      }
      if (state.data.selectedId != null || state.data.dragTarget === 'probe') {
        // Slight aim miss while still focused on last probe/charge.
        if (state.data.dragTarget === 'probe' || role === 'electric_probe') {
          return onUiAction('electric-probe-move', { axis: 'z', delta: step });
        }
      }
      return false;
    }
    if (state.expId === 'gauss_theorem') {
      const chargeId = Number(target?.userData?.chargeId ?? state.data.selectedId);
      if (state.data.charges.some((charge) => charge.id === chargeId)) state.data.selectedId = chargeId;
      return onUiAction('gauss-move', { axis: 'z', delta: delta > 0 ? -0.15 : 0.15 });
    }
    if (state.expId !== 'hall_effect' || currentStep()?.id === 'identify') return false;

    const scrollPick = resolveTableScrollPick(target, pick);
    const onDisplay = target?.userData?.type === 'holo_display'
      || target?.userData?.role === 'holo_display'
      || scrollPick?.action === 'hall-scroll-table'
      || scrollPick?.role === 'scrollable_table';
    // Any wheel over the content display (or the table hit region) owns the
    // data log when the record view is open — equipment knobs only receive
    // the wheel after the table cannot use it.
    if (onDisplay && !state.data.showCurve && state.data.records?.length > 0) {
      const deltaY = Number(delta || 0);
      if (!deltaY) return false;
      // Pixel residual keeps trackpads smooth; a full mouse notch (~100px)
      // advances several rows via the same path as drag scrolling.
      return onUiAction('hall-scroll-table', {
        deltaPx: deltaY,
        rowH: scrollPick?.rowH,
        maxRows: scrollPick?.maxRows,
        maxStart: scrollPick?.maxStart,
      });
    }
    const role = target?.userData?.role;
    const sign = delta > 0 ? -1 : 1;
    if (role === 'hall_probe') return onUiAction('hall-adjust', { key: 'probePos', delta: sign });
    if (role === 'hall_helmholtz') return onUiAction('hall-adjust', { key: 'rightCoilPos', delta: sign * 0.5 });
    if (role === 'hall_solenoid') return onUiAction('hall-adjust', { key: 'turns', delta: sign * 10 });
    if (role === 'hall_knob_im') return onUiAction('hall-adjust', { key: 'Im', delta: sign * 0.05 });
    if (role === 'hall_knob_is') return onUiAction('hall-adjust', { key: 'Is', delta: sign * 0.5 });
    return false;
  }

  function holdInteract(holding, _time, dt, target) {
    if (state.expId === 'induced_electric_field') {
      const data = state.data;
      // Content-screen sliders: continuous path via cumulative mouse deltas.
      // sliderDragOriginX rebases after absolute UV jumps so relative + absolute
      // never fight (unlocked desktop updates the ray; pointer-lock uses relative).
      if (holding && data.sliderDragging && data.sliderKey) {
        const totalX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        const origin = Number(data.sliderDragOriginX || 0);
        applyInducedSliderRelative(data, totalX - origin);
        return;
      }
      if (!holding && data.sliderDragging) {
        finishInducedSlider(data);
        return;
      }
      if (holding && data.dragging && data.dragStart) {
        const dx = Number(equipment.electro?.mouseDrag?.movementX || 0) - Number(data.dragMouseX || 0);
        const dy = Number(equipment.electro?.mouseDrag?.movementY || 0) - Number(data.dragMouseY || 0);
        applyInducedProbeDrag(data, dx, dy);
        return;
      }
      if (!holding && data.dragging) {
        data.dragging = false;
        data.dragStart = null;
        syncInducedElectric(data);
      }
      return;
    }
    if (state.expId === 'faraday_induction') {
      const data = state.data;
      if (holding && data.sliderDragging && data.sliderStart) {
        // Only write B here. updateFaraday (same frame) owns the single visual sync.
        const totalX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        applyFaradaySliderRelative(data, totalX);
        return;
      }
      if (!holding && data.sliderDragging) {
        finishFaradaySlider(data);
        syncFaraday(data);
        return;
      }
      if (holding && data.dragging && data.motionStart) {
        const totalX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.x = clamp(data.motionStart.x0 + totalX * 0.015, data.xMin, data.xMax);
        // Rod drag: updateFaraday syncs once per frame (avoids double field/HUD work).
        return;
      }
      if (!holding && data.dragging) {
        finishFaradayMotion(data);
        syncFaraday(data);
      }
      return;
    }
    if (state.expId === 'electric_field') {
      const data = state.data;
      if (holding && data.dragging && data.dragStart) {
        const { dx, dy } = mouseDragDelta(data);
        data._dragShiftZ = !!equipment.electro?.mouseDrag?.shiftKey;
        // Position only; update() owns the single per-frame visual sync.
        applyElectricDragDelta(data, dx, dy, dt);
        return;
      }
      if (!holding && data.dragging) {
        data.dragging = false;
        data.dragTarget = null;
        data.dragStart = null;
        data._dragShiftZ = false;
        // Release rebuilds field decorations (deferred inside equipment).
        syncElectricField(data);
      }
      return;
    }
    if (state.expId === 'gauss_theorem') {
      const data = state.data;
      if (holding && data.dragArmed) {
        const { dx, dy } = mouseDragDelta(data);
        // Position only; update() owns the single per-frame visual sync.
        applyGaussDragDelta(data, dx, dy, dt);
        return;
      }
      if (!holding && data.dragArmed) {
        data.dragArmed = false;
        data.dragging = false;
        syncGauss(data);
      }
      return;
    }
    if (state.expId !== 'hall_effect') return;
    const data = state.data;
    if (data.terminalDragFrom) {
      const hoverPortId = target?.userData?.portId || null;
      if (holding) {
        data.terminalSnapPort = equipment.electro?.updateHallWirePreview?.(
          data.terminalDragFrom,
          equipment.electro?.getCamera?.(),
          hoverPortId,
        ) || null;
        return;
      }
      const from = data.terminalDragFrom;
      const to = hoverPortId || data.terminalSnapPort;
      if (to && to !== from) {
        const retained = (data.wires || []).filter((pair) => {
          const [a, b] = Array.isArray(pair) ? pair : [pair?.from, pair?.to];
          return a !== from && b !== from && a !== to && b !== to;
        });
        retained.push([from, to]);
        data.wires = retained;
        applyWiringState(data);
        if (data.wiring.energized) {
          toast(`接线完成：Im 输出已${data.wiring.reversed ? '反向' : '正向'}接入${data.wiring.label}`);
        } else {
          toast('导线已连接，但 Im 输出回路尚未按规则闭合');
        }
      } else {
        const initialLen = (data.wires || []).length;
        const retained = (data.wires || []).filter((pair) => {
          const [a, b] = Array.isArray(pair) ? pair : [pair?.from, pair?.to];
          return a !== from && b !== from;
        });
        if (retained.length < initialLen) {
          data.wires = retained;
          toast('已取消该接线端的导线连接');
        } else {
          toast('未对准另一个接线口，已取消接线');
        }
      }
      data.terminalDragFrom = null;
      data.terminalDragGroup = null;
      data.terminalSnapPort = null;
      equipment.electro?.cancelHallWirePreview?.();
      syncHall(data);
      return;
    }
    if (currentStep()?.id === 'identify') return;
    if (holding && data.hallDragArmed) {
      data.hallHoldAccum = (data.hallHoldAccum || 0) + dt;
      if (!data.hallDragging && data.hallHoldAccum > 0.08) data.hallDragging = true;
      if (!data.hallDragging) return;
      const mouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
      const deltaPx = mouseX - Number(data.hallDragStartMouseX || 0);
      const kind = data.hallDragKind;
      const start = Number(data.hallDragStartValue || 0);
      if (Math.abs(deltaPx) > 2) data.hallDragMoved = true;
      if (kind === 'probePos') data.probePos = clamp(start + deltaPx * 0.05, -25, 25);
      if (kind === 'rightCoilPos') data.rightCoilPos = clamp(start + deltaPx * 0.02, -0.5, 13);
      if (kind === 'turns') data.turns = Math.round(clamp(start + deltaPx, 10, 300) / 10) * 10;
      if (kind === 'Im') data.Im = clamp(start + deltaPx * 0.0025, 0, 1);
      if (kind === 'Is') data.Is = clamp(start + deltaPx * 0.025, 0, 10);
      if (kind && state.stepIndex <= 2 && data.Im > 0 && data.Is > 0) setStep('scan');
      syncHall(data, false);
      return;
    }
    if (!holding && data.hallDragArmed) {
      const kind = data.hallDragKind;
      data.hallDragArmed = false;
      data.hallDragging = false;
      data.hallHoldAccum = 0;
      data.hallDragKind = null;
      syncHall(data);
      const labels = {
        probePos: `探头位置 X = ${data.probePos.toFixed(1)} cm`,
        rightCoilPos: `右线圈位置 = ${data.rightCoilPos.toFixed(1)} cm`,
        turns: `螺线管匝数 N = ${data.turns}`,
        Im: `励磁电流 Im = ${data.Im.toFixed(3)} A`,
        Is: `霍尔电流 Is = ${data.Is.toFixed(2)} mA`,
      };
      toast(labels[kind] || '调节完成');
    }
  }

  function armTableScrollDrag(target, pick) {
    if (state.expId !== 'hall_effect' || !state.data) return false;
    if (state.data.showCurve || !state.data.records?.length) return false;
    const scrollPick = resolveTableScrollPick(target, pick);
    if (!scrollPick || (scrollPick.action !== 'hall-scroll-table' && scrollPick.role !== 'scrollable_table')) {
      return false;
    }
    const maxStart = Number.isFinite(Number(scrollPick.maxStart))
      ? Math.max(0, Math.round(Number(scrollPick.maxStart)))
      : Math.max(0, state.data.records.length - Math.max(1, Number(scrollPick.maxRows) || 8));
    // Nothing to scroll when every row already fits the viewport.
    if (maxStart <= 0 || scrollPick.scrollable === false) return false;

    state.data.tableScrollDrag = {
      armed: true,
      moved: false,
      maxRows: scrollPick.maxRows,
      maxStart: scrollPick.maxStart,
      rowH: scrollPick.rowH,
      screen: target,
    };
    return true;
  }

  function applyTableScrollDrag(context = {}) {
    const drag = state.data?.tableScrollDrag;
    if (!drag?.armed) return false;

    // Prefer live layout metrics from the content screen hit list.
    const live = resolveTableScrollPick(drag.screen || context.target, null) || drag;
    drag.maxRows = live.maxRows ?? drag.maxRows;
    drag.maxStart = live.maxStart ?? drag.maxStart;
    drag.rowH = live.rowH ?? drag.rowH;

    const dy = Number(context.dy || 0);
    if (Math.abs(dy) < 0.35) return true;
    drag.moved = true;
    // Same sign convention as fullscreen pointer drag: hand/cursor up → later rows.
    onUiAction('hall-scroll-table', {
      deltaPx: -dy,
      rowH: drag.rowH,
      maxRows: drag.maxRows,
      maxStart: drag.maxStart,
    });
    return true;
  }

  function clearTableScrollDrag() {
    if (!state.data?.tableScrollDrag) return false;
    state.data.tableScrollDrag = null;
    return true;
  }

  function beginManipulation(target, context = {}) {
    if (state.expId === 'induced_electric_field') {
      let pick = context.pick?.action === 'induced-e-slider' ? context.pick : null;
      if (!pick && context.raycaster && target?.userData?.pickFromRay) {
        const live = target.userData.pickFromRay(context.raycaster);
        if (live?.action === 'induced-e-slider') pick = live;
      }
      if (pick?.action === 'induced-e-slider') {
        const data = state.data;
        data.sliderDragging = true;
        data.sliderKey = pick.key || null;
        data.sliderDragBase = inducedSliderBaseValue(data, pick.key);
        data.sliderDragOriginX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        // Jump thumb to aim when the pick has an absolute canvas x.
        onUiAction('induced-e-slider', { ...pick, live: true });
        // Re-base relative drag after absolute jump so subsequent movementX
        // deltas stay continuous from the new value.
        data.sliderDragBase = inducedSliderBaseValue(data, pick.key);
        return true;
      }
      return interact(target, context.time || 0, currentStep());
    }
    if (state.expId === 'faraday_induction') {
      let pick = context.pick?.action === 'faraday-b-slider' ? context.pick : null;
      // AR / direct ray: resolve slider hit from the content-screen mesh.
      if (!pick && context.raycaster && target?.userData?.pickFromRay) {
        const live = target.userData.pickFromRay(context.raycaster);
        if (live?.action === 'faraday-b-slider') pick = live;
      }
      if (pick?.action === 'faraday-b-slider') {
        if (!beginFaradaySlider(state.data) && !state.data.sliderDragging) return true;
        const value = faradayBFromPick(pick);
        if (value != null) setFaradaySliderAbsolute(state.data, value, 0);
        syncFaraday(state.data);
        return true;
      }
    }
    if (armTableScrollDrag(target, context.pick || null)) return true;
    // AR / direct ray: resolve table pick from the ray if the caller only
    // supplied the screen host (common when the hand locks the display mesh).
    if (context.raycaster && target?.userData?.pickFromRay) {
      const pick = target.userData.pickFromRay(context.raycaster);
      if (armTableScrollDrag(target, pick)) return true;
    }
    return interact(target, context.time || 0, currentStep());
  }

  function updateManipulation(_target, context = {}) {
    if (state.expId === 'induced_electric_field') {
      const data = state.data;
      if (data?.sliderDragging) {
        // Prefer absolute UV pick when the ray still hits this slider track
        // (unlocked desktop / AR following the thumb).
        if (context.raycaster && _target?.userData?.pickFromRay) {
          const live = _target.userData.pickFromRay(context.raycaster);
          if (live?.action === 'induced-e-slider'
            && (!data.sliderKey || live.key === data.sliderKey)
            && Number.isFinite(live.px)) {
            onUiAction('induced-e-slider', { ...live, live: true });
            data.sliderDragBase = inducedSliderBaseValue(data, data.sliderKey);
            data.sliderDragOriginX = Number(
              Number.isFinite(context.totalX)
                ? context.totalX
                : (equipment.electro?.mouseDrag?.movementX || 0),
            );
            return true;
          }
        }
        // Relative fallback (pointer-lock totals or when UV leaves the track).
        const totalX = Number.isFinite(context.totalX)
          ? Number(context.totalX)
          : Number(equipment.electro?.mouseDrag?.movementX || 0);
        const origin = Number(data.sliderDragOriginX || 0);
        applyInducedSliderRelative(data, totalX - origin);
        return true;
      }
      if (data?.dragging && data.dragStart && (
        Number.isFinite(context.totalX)
        || Number.isFinite(context.totalY)
        || Number.isFinite(context.dx)
        || Number.isFinite(context.dy)
      )) {
        const dx = Number.isFinite(context.totalX) ? Number(context.totalX) : Number(context.dx || 0);
        const dy = Number.isFinite(context.totalY) ? Number(context.totalY) : Number(context.dy || 0);
        applyInducedProbeDrag(data, dx, dy);
        return true;
      }
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return !!data?.dragging || !!data?.sliderDragging;
    }
    if (state.expId === 'faraday_induction') {
      const data = state.data;
      if (data?.sliderDragging) {
        const totalX = Number.isFinite(context.totalX)
          ? Number(context.totalX)
          : (Number.isFinite(context.dx) ? Number(context.dx) : null);
        // Prefer absolute thumb position from a live content-screen UV pick
        // (AR pinch following the track), then fall back to relative drag.
        // Visuals/HUD are owned by updateFaraday once per animation frame.
        if (context.raycaster && _target?.userData?.pickFromRay) {
          const live = _target.userData.pickFromRay(context.raycaster);
          const absB = faradayBFromPick(live);
          if (absB != null) {
            setFaradaySliderAbsolute(data, absB, totalX || 0);
            return true;
          }
        }
        if (totalX != null && Number.isFinite(totalX)) {
          applyFaradaySliderRelative(data, totalX);
        }
        return true;
      }
      if (data?.dragging && data.motionStart && (
        Number.isFinite(context.totalX) || Number.isFinite(context.dx)
      )) {
        const totalX = Number.isFinite(context.totalX)
          ? Number(context.totalX)
          : Number(context.dx || 0);
        data.x = clamp(data.motionStart.x0 + totalX * 0.015, data.xMin, data.xMax);
        return true;
      }
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return !!data?.dragging;
    }
    if (state.expId === 'electric_field') {
      const data = state.data;
      // Prefer AR / direct-manipulation totals when present so drag works even
      // if the shared mouseDrag facade was not forwarded for this frame.
      if (data?.dragging && data.dragStart && (
        Number.isFinite(context.totalX)
        || Number.isFinite(context.totalY)
        || Number.isFinite(context.dx)
        || Number.isFinite(context.dy)
      )) {
        const dx = Number.isFinite(context.totalX) ? Number(context.totalX) : Number(context.dx || 0);
        const dy = Number.isFinite(context.totalY) ? Number(context.totalY) : Number(context.dy || 0);
        data._dragShiftZ = !!(context.shiftKey || equipment.electro?.mouseDrag?.shiftKey);
        applyElectricDragDelta(data, dx, dy, context.dt || 0);
        return true;
      }
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return !!data?.dragging;
    }
    if (state.expId === 'gauss_theorem') {
      const data = state.data;
      if (data?.dragArmed && (
        Number.isFinite(context.totalX)
        || Number.isFinite(context.totalY)
        || Number.isFinite(context.dx)
        || Number.isFinite(context.dy)
      )) {
        const dx = Number.isFinite(context.totalX) ? Number(context.totalX) : Number(context.dx || 0);
        const dy = Number.isFinite(context.totalY) ? Number(context.totalY) : Number(context.dy || 0);
        applyGaussDragDelta(data, dx, dy, context.dt || 0);
        return true;
      }
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return !!data?.dragArmed;
    }
    if (state.expId !== 'hall_effect') return false;
    if (state.data.tableScrollDrag?.armed) {
      return applyTableScrollDrag(context);
    }
    if (state.data.terminalDragFrom) {
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return true;
    }
    // Camera-drag knobs / probe / coils: apply mouse totals every frame.
    // (Previously returned true without calling holdInteract, so grabs did nothing.)
    if (state.data.hallDragArmed) {
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return true;
    }
    return false;
  }

  function endManipulation(_target, context = {}) {
    if (state.expId === 'induced_electric_field') {
      if (state.data.sliderDragging) {
        finishInducedSlider(state.data);
        return true;
      }
      if (!state.data.dragging) return false;
      holdInteract(false, context.time || 0, 0, context.target);
      return true;
    }
    if (state.expId === 'faraday_induction') {
      if (state.data.sliderDragging) {
        finishFaradaySlider(state.data);
        syncFaraday(state.data);
        return true;
      }
      if (!state.data.dragging) return false;
      holdInteract(false, context.time || 0, 0, context.target);
      return true;
    }
    if (state.expId === 'electric_field') {
      if (!state.data.dragging) return false;
      holdInteract(false, context.time || 0, 0, context.target);
      return true;
    }
    if (state.expId === 'gauss_theorem') {
      if (!state.data.dragArmed) return false;
      holdInteract(false, context.time || 0, 0, context.target);
      return true;
    }
    if (state.expId !== 'hall_effect') return false;
    const data = state.data;
    if (data.tableScrollDrag?.armed) {
      clearTableScrollDrag();
      return true;
    }
    if (context.cancelled && data.terminalDragFrom) {
      data.terminalDragFrom = null;
      data.terminalDragGroup = null;
      data.terminalSnapPort = null;
      equipment.electro?.cancelHallWirePreview?.();
      syncHall(data);
      toast('追踪中断，已取消接线');
      return true;
    }
    if (data.terminalDragFrom) {
      holdInteract(false, context.time || 0, 0, context.hoverTarget);
      return true;
    }
    if (data.hallDragArmed) {
      holdInteract(false, context.time || 0, 0, context.target);
      return true;
    }
    return false;
  }

  function update(_time, dt) {
    // Deferred electro sync is scheduled on the frame budget (not here) so
    // field-line rebuilds never hitch the pre-render path.
    if (state.expId === 'induced_electric_field' && state.data) {
      updateInducedElectric(state.data, dt);
      return state.data;
    }
    if (state.expId === 'faraday_induction' && state.data) {
      updateFaraday(state.data, dt);
      return state.data;
    }
    if (state.expId === 'electric_field' && state.data) {
      syncElectricField(state.data, false, dt);
      state.data._hudThrottle = (state.data._hudThrottle || 0) + dt;
      if (state.data._hudThrottle > 0.25) {
        state.data._hudThrottle = 0;
        pushHud();
      }
      return state.data;
    }
    if (state.expId === 'gauss_theorem' && state.data) {
      syncGauss(state.data, false, dt);
      state.data._hudThrottle = (state.data._hudThrottle || 0) + dt;
      if (state.data._hudThrottle > 0.3) {
        state.data._hudThrottle = 0;
        pushHud();
      }
      return state.data;
    }
    if (state.expId === 'hall_carrier_demo' && state.data) {
      state.data.vh = hallDemoVoltage(state.data);
      state.data.force = hallDemoForce(state.data);
      equipment.electro?.updateHallDemo?.(state.data, dt);
      return state.data;
    }
    if (state.expId !== 'hall_effect' || !state.data) return state.data;
    const data = state.data;
    applyWiringState(data);
    data.vh = calculateHallVoltage(data);
    equipment.electro?.updateHall?.(data);
    data._hudThrottle = (data._hudThrottle || 0) + dt;
    if (data._hudThrottle > 0.35) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }

  function cleanup(_expId) {
    if (state.data) state.data._awaitElectroSync = null;
    equipment.electro?.clearHallIdentifyVisuals?.();
    equipment.electro?.cancelHallWirePreview?.();
    // Idle Hall showcase stays on the table; animators only run while electro is hot.
    try {
      if (typeof equipment.electro?.showcase === 'function') equipment.electro.showcase();
      else if (typeof equipment.electro?.suspend === 'function') equipment.electro.suspend();
      else equipment.electro?.setMode?.('hall');
    } catch { /* ignore */ }
  }

  return {
    initData,
    applyVisualDefaults,
    interact,
    beginManipulation,
    updateManipulation,
    endManipulation,
    onKey,
    onWheel,
    holdInteract,
    onFocus,
    onUiAction,
    cleanup,
    update,
  };
}
