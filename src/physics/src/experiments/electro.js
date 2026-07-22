/**
 * 电磁学实验台 — 霍尔效应测磁
 */

export const station = {
  id: 'electro',
  title: '电磁学实验台',
  accent: '#ec4899',
  experiments: [
    {
      id: 'faraday_induction',
      name: '法拉第电磁感应',
      goal: '拖动导轨上的铜棒或改变均匀磁场，观察磁通量变化、感应电动势与楞次定律方向。',
      theory: 'Φ = B·A，A = (x − x₀)L；ε = −dΦ/dt',
      steps: [
        { id: 'motion', text: '拖动铜棒，测量动生电动势', hint: '按住铜棒沿导轨移动，松开后查看 Δx、Δt、ε 与电流方向。' },
        { id: 'field', text: '改变磁场，测量感生电动势', hint: '使用全息屏上的 B−、B+ 或反向按钮，观察磁通量变化。' },
        { id: 'conclude', text: '完成法拉第定律验证', hint: '比较 ε = −B L Δx/Δt 与 ε = −A ΔB/Δt 的结果。' },
      ],
    },
    {
      id: 'electric_field',
      name: '静电场探索',
      goal: '拖动正负点电荷与试探电荷，观察叠加电场、受力与电势的空间分布',
      theory: 'E = Σ(qᵢ r̂ᵢ / rᵢ²)；F = q₀ E；V = Σ(qᵢ / rᵢ)（归一化单位 K=1）',
      steps: [
        { id: 'explore', text: '自由探索静电场与试探电荷', hint: '拖动电荷或探针；使用全息屏控件进行精细调整。' },
      ],
    },
    {
      id: 'hall_effect',
      name: '霍尔效应测磁',
      goal: '调节励磁与霍尔电流，扫描探头位置并比较亥姆霍兹线圈和长螺线管的磁场分布',
      theory: 'V_H = K_H I_s B；轴线上 B 随探头位置、线圈间距与螺线管匝数变化',
      steps: [
        { id: 'identify', text: '认识器材：线圈、霍尔探头与 HCC-2 测磁仪', hint: '按 01→04 顺序瞄准 3D 器材按 E 确认；选对/选错均有提示' },
        { id: 'configure', text: '选择测量对象并确认电流方向', hint: '在全息屏选择亥姆霍兹线圈或长螺线管' },
        { id: 'energize', text: '设置励磁电流 Im 与霍尔电流 Is', hint: '使用全息参数卡片的 − / + 按钮调节电流' },
        { id: 'scan', text: '移动探头并记录至少 3 组 B–X 数据', hint: '调节 X 后点击「记录当前读数」，系统由 VH 换算 B' },
        { id: 'compare', text: '切换测量对象，比较磁场分布', hint: '切换线圈并继续记录，观察曲线形状变化' },
        { id: 'conclude', text: '根据数据归纳霍尔电压与磁场的关系', hint: '点击「完成实验」生成结论' },
      ],
    },
    {
      id: 'hall_carrier_demo',
      name: '霍尔效应载流子动效',
      goal: '观察电流、磁场、载流子浓度、样品厚度与载流子类型如何共同改变载流子的三维运动和霍尔电压极性。',
      theory: '演示关系：Vₕ ∝ I·B/(n·d)；n 型与 p 型载流子的霍尔电压极性相反。界面数值为相对演示量。',
      steps: [
        { id: 'observe', text: '自由调节参数并观察载流子运动', hint: '使用全息屏按钮调节 I、B、n、d，切换 n/p 型或反转磁场方向。' },
      ],
    },
    {
      id: 'gauss_theorem',
      name: '高斯定理 · 电通量',
      goal: '拖动正负点电荷进出闭合高斯面，验证总电通量只由面内净电荷决定。',
      theory: '∯S E·dA = Q内/ε₀；改变球面半径会改变面平均场强，但只要包围的净电荷不变，总通量就不变。',
      steps: [
        { id: 'observe', text: '观察球形高斯面、电荷、电场线与通量粒子', hint: '瞄准电荷按住拖动，滚轮可沿深度方向微调。' },
        { id: 'cross', text: '让电荷跨过高斯面并比较 Q内 与 ΦE', hint: '也可在内容屏用 X/Y/Z 按钮精确移动。' },
        { id: 'compare', text: '改变球面半径或加入异号电荷', hint: '比较同一 Q内 下半径变化对平均场强与总通量的不同影响。' },
        { id: 'conclude', text: '完成验证并归纳高斯定理', hint: '确认“外部电荷不改变闭合面的净通量”后点击完成。' },
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

export function gaussFlux(charges = [], radius = 2.4, epsilon0 = 1) {
  return gaussEnclosedCharge(charges, radius) / Number(epsilon0 || 1);
}

export function gaussFieldAt(charges = [], point = {}) {
  const field = { x: 0, y: 0, z: 0 };
  for (const charge of charges) {
    const dx = Number(point.x || 0) - Number(charge?.x || 0);
    const dy = Number(point.y || 0) - Number(charge?.y || 0);
    const dz = Number(point.z || 0) - Number(charge?.z || 0);
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-5 || Math.abs(Number(charge?.q || 0)) < 1e-6) continue;
    const scale = Number(charge.q) / (r2 * Math.sqrt(r2));
    field.x += dx * scale;
    field.y += dy * scale;
    field.z += dz * scale;
  }
  return field;
}

export function gaussMeanNormalField(charges = [], radius = 2.4) {
  const r = Math.max(1e-6, Number(radius || 0));
  if (charges.length === 1) {
    const charge = charges[0];
    const distance = Math.hypot(Number(charge.x || 0), Number(charge.y || 0), Number(charge.z || 0));
    if (distance < 0.12 && distance < r && Math.abs(Number(charge.q || 0)) > 0.01) {
      return Math.abs(Number(charge.q)) / (4 * Math.PI * r * r);
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
  const base = Number(options.base ?? 0.38);
  const gain = Number(options.gain ?? 0.72);
  const maxExtra = Number(options.maxExtra ?? 1.15);
  return base + Math.min(maxExtra, abs * gain);
}

/**
 * Visual weight for a tracer (scale/opacity proxy).
 * Emphasizes the surface crossing so E·dA is readable.
 */
export function gaussFluxParticleEmphasis(density, radiusNorm, options = {}) {
  const abs = Math.abs(Number(density) || 0);
  const strength = 0.42 + 0.58 * Math.min(1, abs / Number(options.refAbs || 0.35));
  const near = Math.abs(Number(radiusNorm) - 1);
  const surfaceBoost = 0.72 + 0.38 * Math.exp(-(near * near) / Number(options.surfaceWidth || 0.07));
  return strength * surfaceBoost;
}

/** Normalized electrostatic field used by the static-field experiment. */
export function electricFieldAt(charges = [], point = {}, options = {}) {
  const minRadius = Math.max(1e-4, Number(options.minRadius ?? 0.04));
  const field = { x: 0, y: 0, z: 0 };
  for (const charge of charges) {
    const dx = Number(point.x || 0) - Number(charge?.x || 0);
    const dy = Number(point.y || 0) - Number(charge?.y || 0);
    const dz = Number(point.z || 0) - Number(charge?.z || 0);
    const r2 = dx * dx + dy * dy + dz * dz;
    if (Math.abs(Number(charge?.q || 0)) < 1e-8 || r2 < minRadius * minRadius) continue;
    const scale = Number(charge.q) / (r2 * Math.sqrt(r2));
    field.x += dx * scale;
    field.y += dy * scale;
    field.z += dz * scale;
  }
  return field;
}

export function electricPotentialAt(charges = [], point = {}, options = {}) {
  const minRadius = Math.max(1e-4, Number(options.minRadius ?? 0.04));
  let potential = 0;
  for (const charge of charges) {
    const dx = Number(point.x || 0) - Number(charge?.x || 0);
    const dy = Number(point.y || 0) - Number(charge?.y || 0);
    const dz = Number(point.z || 0) - Number(charge?.z || 0);
    potential += Number(charge?.q || 0) / Math.max(minRadius, Math.hypot(dx, dy, dz));
  }
  return potential;
}

export function electricForceAt(charges = [], point = {}, q0 = 1, options = {}) {
  const field = electricFieldAt(charges, point, options);
  const q = Number(q0 || 0);
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
        dragging: false,
        motionStart: null,
        inductionStart: null,
        pendingB: null,
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
        flux: 1,
        meanField: 1 / (4 * Math.PI * 2.4 ** 2),
        _hudThrottle: 0,
      };
    }
    if (expId === 'electric_field') {
      return {
        charges: [{ id: 1, q: 1, x: 0, y: 0, z: 0 }],
        selectedId: 1,
        nextChargeId: 2,
        probe: { x: 2, y: 0.8, z: 0, q0: 1 },
        showLines: true,
        showArrows: true,
        showEquipot: false,
        showProbe: true,
        autoRotate: false,
        formulaTab: 'def',
        dragging: false,
        dragTarget: null,
        dragMouseX: 0,
        dragMouseY: 0,
        dragStart: null,
        field: { x: 0, y: 0, z: 0 },
        force: { x: 0, y: 0, z: 0 },
        magnitudeE: 0,
        magnitudeF: 0,
        potential: 0,
        completed: false,
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

  /** Apply screen-space drag deltas to the armed electric-field target. */
  function applyElectricDragDelta(data, dx, dy, dt = 0) {
    if (!data?.dragStart) return false;
    if (data.dragTarget === 'probe') {
      data.probe.x = clamp(data.dragStart.x + dx * 0.025, -5, 5);
      data.probe.y = clamp(data.dragStart.y - dy * 0.025, -5, 5);
    } else {
      const charge = selectedElectricCharge(data);
      if (!charge) return false;
      charge.x = clamp(data.dragStart.x + dx * 0.025, -4.5, 4.5);
      charge.y = clamp(data.dragStart.y - dy * 0.025, -4.5, 4.5);
    }
    syncElectricField(data, false, dt);
    return true;
  }

  function applyGaussDragDelta(data, dx, dy, dt = 0) {
    const charge = selectedGaussCharge(data);
    if (!charge || !data?.dragArmed) return false;
    data.dragging = true;
    charge.x = clamp(Number(data.dragStartX || 0) + dx * 0.025, -5, 5);
    charge.y = clamp(Number(data.dragStartY || 0) - dy * 0.025, -5, 5);
    if (state.stepIndex < 1 && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) setStep('cross');
    syncGauss(data, false, dt);
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
    if (state.stepIndex < 1 && Math.abs(dx) > 1e-4) setStep('field');
    toast(`动生测量完成：ε = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    return true;
  }

  function startFaradayBChange(data, target, duration = 0.35) {
    if (data.dragging || data.pendingB || data.sliderDragging) return false;
    const from = Number(data.B || 0);
    const to = clamp(Number(target || 0), -3, 3);
    if (Math.abs(to - from) < 1e-8) return false;
    data.pendingB = {
      from, to, t0: data._time, duration: Math.max(0.05, duration),
      area0: faradayArea(data.x, data.rodLength, data.xEnd),
      flux0: faradayFlux(from, data.x, data.rodLength, data.xEnd),
    };
    data.inductionStart = data.pendingB;
    data.measureMode = 'induction';
    data.currentSense = 'none';
    return true;
  }

  function finishFaradayBChange(data) {
    const pending = data.pendingB;
    if (!pending) return false;
    data.B = pending.to;
    const dt = Math.max(1e-6, data._time - pending.t0, pending.duration);
    const flux1 = faradayFlux(data.B, data.x, data.rodLength, data.xEnd);
    const dFlux = flux1 - pending.flux0;
    const dB = data.B - pending.from;
    const emf = faradayEmfFromDelta(dFlux, dt);
    const sense = faradaySense(dFlux / dt);
    data.lastInduction = {
      B0: pending.from, B1: data.B, dB, dt,
      area: pending.area0, flux0: pending.flux0, flux1, dFlux, emf, sense,
      senseLabel: faradaySenseLabel(sense),
    };
    data.records.push({ type: 'induction', ...data.lastInduction });
    data.records = data.records.slice(-12);
    data.pendingB = null;
    data.inductionStart = null;
    data.measureMode = null;
    data.currentSense = 'none';
    if (state.stepIndex < 2 && Math.abs(dB) > 1e-6) setStep('conclude');
    toast(`感生测量完成：ε = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    return true;
  }

  function beginFaradaySlider(data) {
    if (data.dragging || data.pendingB || data.sliderDragging) return false;
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

  /** Map a content-screen faraday-b-slider hit (with canvas px) → B. */
  function faradayBFromPick(pick) {
    if (!pick || pick.action !== 'faraday-b-slider' || !Number.isFinite(pick.px)) return null;
    const min = Number(pick.min ?? -3);
    const max = Number(pick.max ?? 3);
    const u = clamp((Number(pick.px) - Number(pick.x || 0)) / Math.max(1, Number(pick.w || 1)), 0, 1);
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
    if (state.stepIndex < 2 && Math.abs(dB) > 1e-6) setStep('conclude');
    toast(`磁场滑块测量完成：ε = ${emf.toFixed(4)}，${faradaySenseLabel(sense)}`);
    return true;
  }

  function updateFaraday(data, dt = 0) {
    const step = Math.max(0, Number(dt || 0));
    data._time += step;
    if (data.pendingB) {
      const p = data.pendingB;
      const u = clamp((data._time - p.t0) / p.duration, 0, 1);
      const s = u * u * (3 - 2 * u);
      data.B = p.from + (p.to - p.from) * s;
      if (u >= 1) finishFaradayBChange(data);
    }
    if (data.dragging && data.motionStart) {
      const v = step > 1e-8 ? (data.x - data._prevX) / step : 0;
      data.currentSense = faradaySense(data.B * data.rodLength * v);
    } else if (data.sliderDragging && data.sliderStart) {
      const elapsed = Math.max(step, data._time - data.sliderStart.t0);
      data.currentSense = faradaySense(
        data.sliderStart.area * (data.B - data.sliderStart.B0) / elapsed,
      );
    } else if (!data.pendingB) {
      data.currentSense = 'none';
    }
    data._prevX = data.x;
    syncFaraday(data, false, step);
    data._hudThrottle += step;
    // Slider drag needs a slightly livelier content-screen readout; keep it
    // well under a full repaint-per-pointermove (which previously froze the UI).
    const hudInterval = data.sliderDragging || data.dragging ? 0.1 : 0.22;
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
    if (expId === 'faraday_induction' && equipment.electro) {
      equipment.electro.setMode?.('faraday');
      syncFaraday(state.data, false);
      return;
    }
    if (expId === 'hall_effect' && equipment.electro) {
      equipment.electro.setMode?.('hall');
      syncHall(state.data, false);
      refreshHallIdentifyVisuals(null);
      return;
    }
    if (expId === 'hall_carrier_demo' && equipment.electro) {
      equipment.electro.setMode?.('hall-demo');
      syncHallDemo(state.data, false);
      return;
    }
    if (expId === 'gauss_theorem' && equipment.electro) {
      equipment.electro.setMode?.('gauss');
      syncGauss(state.data, false);
      return;
    }
    if (expId === 'electric_field' && equipment.electro) {
      equipment.electro.setMode?.('electric-field');
      syncElectricField(state.data, false);
    }
  }



  function onUiAction(action, payload = {}) {
    if (state.expId === 'faraday_induction') {
      const data = state.data;
      if (action === 'faraday-b-set') {
        // Live slider drags fire this every pointermove — never full-HUD refresh
        // here (updateFaraday throttles the content-screen paint).
        if (!data.sliderDragging && !beginFaradaySlider(data)) return true;
        setFaradaySliderAbsolute(data, payload.value ?? data.B, 0);
        syncFaraday(data, false);
        return true;
      }
      if (action === 'faraday-b-slider') {
        // Content-screen hit region action id (not a discrete button). Arm the
        // drag; optional px / value jump the thumb to the aim position.
        if (!data.sliderDragging && !beginFaradaySlider(data)) return true;
        const fromPick = faradayBFromPick(payload);
        const value = Number.isFinite(payload?.value) ? Number(payload.value) : fromPick;
        if (value != null && Number.isFinite(value)) {
          setFaradaySliderAbsolute(data, value, 0);
        }
        syncFaraday(data, false);
        return true;
      }
      if (action === 'faraday-b-step') {
        const delta = Number(payload.delta || 0.2);
        startFaradayBChange(data, data.B + delta, 0.35);
      } else if (action === 'faraday-reverse') {
        startFaradayBChange(data, -data.B, 0.6);
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
      } else if (action === 'gauss-radius') {
        data.radius = clamp(data.radius + Number(payload.delta || 0), 1.2, 4.2);
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
        toast('高斯定理验证完成：ΦE = Q内/ε₀');
      } else {
        return false;
      }
      if (state.stepIndex < 2 && (data.charges.length > 1 || Math.abs(data.radius - 2.4) > 0.05)) setStep('compare');
      syncGauss(data);
      return true;
    }
    if (state.expId === 'hall_carrier_demo') {
      const data = state.data;
      if (action === 'hall-demo-adjust') {
        const key = payload.key;
        const delta = Number(payload.delta || 0);
        if (key === 'I') data.I = clamp(data.I + delta, 0, 2);
        if (key === 'B') data.B = clamp(data.B + delta, -2, 2);
        if (key === 'n') data.n = clamp(data.n + delta, 0.3, 2.5);
        if (key === 'd') data.d = clamp(data.d + delta, 0.1, 1.2);
        syncHallDemo(data);
        return true;
      }
      if (action === 'hall-demo-set') {
        const key = payload.key;
        const value = Number(payload.value);
        if (key === 'I') data.I = clamp(value, 0, 2);
        if (key === 'B') data.B = clamp(value, -2, 2);
        if (key === 'n') data.n = clamp(value, 0.3, 2.5);
        if (key === 'd') data.d = clamp(value, 0.1, 1.2);
        syncHallDemo(data);
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
    if (action === 'hall-adjust') {
      const key = payload.key;
      const delta = Number(payload.delta || 0);
      if (key === 'Im') data.Im = clamp(data.Im + delta, 0, 1);
      if (key === 'Is') data.Is = clamp(data.Is + delta, 0, 10);
      if (key === 'probePos') data.probePos = clamp(data.probePos + delta, -25, 25);
      if (key === 'rightCoilPos') data.rightCoilPos = clamp(data.rightCoilPos + delta, -0.5, 13);
      if (key === 'turns') data.turns = Math.round(clamp(data.turns + delta, 10, 300) / 10) * 10;
      if (state.stepIndex <= 2 && data.Im > 0 && data.Is > 0) setStep('scan');
      syncHall(data);
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
    if (state.expId === 'faraday_induction') {
      if (target?.userData?.role === 'faraday_rod') {
        const data = state.data;
        if (data.pendingB || data.sliderDragging) return true;
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
        toast(`已选中 Q${data.charges.findIndex((item) => item.id === id) + 1}；拖动修改 X/Y，滚轮微调 Z`);
        return true;
      }
      if (target?.userData?.role === 'electric_probe') {
        data.dragTarget = 'probe';
        data.dragging = true;
        data.dragStart = { ...data.probe };
        data.dragMouseX = Number(equipment.electro?.mouseDrag?.movementX || 0);
        data.dragMouseY = Number(equipment.electro?.mouseDrag?.movementY || 0);
        toast('已选中试探电荷 q₀；拖动修改位置，滚轮微调 Z');
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
    if (state.expId === 'faraday_induction') {
      if (code === 'KeyR') return onUiAction('faraday-reset');
      if (code === 'KeyF') return onUiAction('faraday-complete');
      if (code === 'KeyB') return onUiAction('faraday-reverse');
      return false;
    }
    if (state.expId === 'electric_field') {
      if (code === 'KeyR') return onUiAction('electric-reset');
      if (code === 'KeyF') return onUiAction('electric-complete');
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
      const role = target?.userData?.role;
      if (role === 'electric_probe') return onUiAction('electric-probe-move', { axis: 'z', delta: delta > 0 ? -0.15 : 0.15 });
      const chargeId = Number(target?.userData?.chargeId ?? state.data.selectedId);
      if (state.data.charges.some((charge) => charge.id === chargeId)) state.data.selectedId = chargeId;
      return onUiAction('electric-move', { axis: 'z', delta: delta > 0 ? -0.15 : 0.15 });
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
        applyElectricDragDelta(data, dx, dy, dt);
        return;
      }
      if (!holding && data.dragging) {
        data.dragging = false;
        data.dragTarget = null;
        data.dragStart = null;
        syncElectricField(data);
      }
      return;
    }
    if (state.expId === 'gauss_theorem') {
      const data = state.data;
      if (holding && data.dragArmed) {
        const { dx, dy } = mouseDragDelta(data);
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
    return !!state.data.hallDragArmed;
  }

  function endManipulation(_target, context = {}) {
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
    equipment.electro?.clearHallIdentifyVisuals?.();
    equipment.electro?.cancelHallWirePreview?.();
    equipment.electro?.setMode?.('hall');
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
