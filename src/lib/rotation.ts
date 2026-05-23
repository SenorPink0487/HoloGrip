/**
 * 3D 模型旋转算法工具集
 *
 * 设计目标：
 *   1. 帧率无关（所有运动量都基于 delta 归一化）
 *   2. 路径无关（Arcball 球面投影，绕一圈回到原点）
 *   3. 抖动鲁棒（死区 + 一阶低通滤波 + 单帧上限 clamp）
 *   4. 自适应缩放灵敏度（modelScale 越大手势越柔）
 *   5. 零分配（关键路径全部使用预分配的复用对象）
 *
 * 所有运算都直接在传入的 Quaternion / Vector 上原地完成，不返回新对象。
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// 可调参数（集中放在这里，方便调手感）
// ─────────────────────────────────────────────────────────────

export const ROTATION_TUNING = {
  /** 单手 Arcball 灵敏度：值越大，同样手势转得越多。1.0 = 1:1 比例 */
  arcballGain: 1.0,
  /** 双手 Roll(Z 轴) 灵敏度倍率 */
  rollGain: 1.0,
  /** Slerp 平滑半衰期(秒)：值越小越跟手，越大越柔和。0.08s 在 60fps 下相当于 ~lerp(0.4) */
  slerpHalfLife: 0.06,
  /** 缩放(modelScale)的 lerp 半衰期(秒)。调小 → 缩放更跟手 */
  scaleHalfLife: 0.05,
  /** 拖拽位置的 lerp 半衰期(秒) */
  dragHalfLife: 0.04,
  /** 单帧最大旋转角度(弧度)，超过截断，防止识别跳变带来的瞬间大角度 */
  maxAngleStepPerFrame: Math.PI / 4, // 45°
  /** 光标位移死区：归一化屏幕坐标(NDC)下，位移小于此值不触发旋转。抑制识别抖动
   *  调大可以让"手不动时模型彻底静止"，代价是慢速精细旋转的最小可感知步长变粗 */
  cursorDeadzone: 0.0028,
  /** Pinch 距离变化死区(NDC)：小于此值不触发缩放。
   *  注意：值过大会"动半天才动一点"，过小会原地呼吸。0.0008 既能吃抖又能跟手 */
  pinchDistDeadzone: 0.0008,
  /** 缩放灵敏度：deltaDist 乘子。值越大，同样手势缩放变化越大、越跟手。
   *  4.0 = 在 NDC 下两手分开 0.5(屏幕半宽)，scale 大约翻 3 倍，幅度适中不过激 */
  scaleGain: 4.0,

  // ─── One-Euro Filter 参数(用于光标输入抖动抑制) ───
  // 比单 EMA 强：慢动作时强滤波吃抖动，快动作时弱滤波几乎零延迟
  /** 速度截止频率(Hz)：用来计算"动得多快"的阈值，建议固定 1.0 */
  oneEuroDcutoff: 1.0,
  /** 静止时的截止频率(Hz)：越小越平滑越能吃抖动，但停顿时延迟也越大；0.6~1.0 是常用范围 */
  oneEuroMinCutoff: 0.8,
  /** 速度耦合系数：值越大，快速运动时滤波越宽松、跟手越好。建议 0.5~1.5 */
  oneEuroBeta: 0.7,
};

// ─────────────────────────────────────────────────────────────
// 通用工具：基于 delta 的帧率无关插值系数
// ─────────────────────────────────────────────────────────────

/**
 * 把"半衰期"换算成当前帧的 lerp 系数。
 *
 * 公式: alpha = 1 - 0.5^(delta / halfLife)
 *
 * 含义: 经过 `halfLife` 秒，剩余误差衰减到 50%。
 * 保证不同帧率下视觉感受完全一致。
 */
export function smoothingAlpha(delta: number, halfLife: number): number {
  if (halfLife <= 0) return 1;
  return 1 - Math.pow(0.5, delta / halfLife);
}

/** 标量一阶低通滤波(EMA): 用 tau 换算 alpha */
export function lowPassScalar(prev: number, curr: number, delta: number, tau: number): number {
  if (tau <= 0) return curr;
  const alpha = 1 - Math.exp(-delta / tau);
  return prev + (curr - prev) * alpha;
}

// ─────────────────────────────────────────────────────────────
// One-Euro Filter (Casiez et al. 2012)
//   -- 抖动抑制神器：低速强滤波 + 高速弱滤波，几乎零延迟
//
// 原理：先用一个 EMA 估计原始值的瞬时速度，把速度反馈到截止频率：
//        cutoff = minCutoff + beta * |dx/dt|
// 速度大→截止高→滤波弱→跟手；速度小→截止低→滤波强→吃抖动。
// 对手势识别的随机噪声尤其有效。
// ─────────────────────────────────────────────────────────────

/** OneEuro 滤波器的内部状态(每个被过滤的标量需要独立维护一份) */
export interface OneEuroState {
  /** 是否已初始化(首帧无前值) */
  inited: boolean;
  /** 上一帧滤波后的值 */
  xPrev: number;
  /** 上一帧滤波后的速度估计 */
  dxPrev: number;
}

export function createOneEuroState(): OneEuroState {
  return { inited: false, xPrev: 0, dxPrev: 0 };
}

/** 把截止频率(Hz)换算成本帧的 EMA alpha：alpha = 1/(1 + tau/dt), tau = 1/(2π·cutoff) */
function alphaFromCutoff(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * 对单个标量做 One-Euro 滤波，原地更新 state。
 *
 * @param state      持续维护的滤波器状态
 * @param x          本帧原始值
 * @param dt         本帧时间步(秒)
 * @param minCutoff  静止时的截止频率(Hz)，越小越平滑
 * @param beta       速度耦合系数，越大快速运动时越跟手
 * @param dCutoff    速度估计的截止频率(Hz)，固定 1.0 即可
 * @returns          滤波后的值
 */
export function oneEuroFilter(
  state: OneEuroState,
  x: number,
  dt: number,
  minCutoff: number,
  beta: number,
  dCutoff: number,
): number {
  if (!state.inited || dt <= 0) {
    state.inited = true;
    state.xPrev = x;
    state.dxPrev = 0;
    return x;
  }
  // 1) 估计瞬时速度
  const dx = (x - state.xPrev) / dt;
  // 2) 用固定截止频率 dCutoff 平滑速度
  const aD = alphaFromCutoff(dCutoff, dt);
  const dxHat = state.dxPrev + aD * (dx - state.dxPrev);
  // 3) 用速度大小动态调整位置截止频率
  const cutoff = minCutoff + beta * Math.abs(dxHat);
  const aX = alphaFromCutoff(cutoff, dt);
  const xHat = state.xPrev + aX * (x - state.xPrev);

  state.xPrev = xHat;
  state.dxPrev = dxHat;
  return xHat;
}

/** 把任意角度差归一到 (-π, π] */
export function wrapAngle(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** 把绝对值截断到 max */
export function clampMag(v: number, max: number): number {
  return v > max ? max : v < -max ? -max : v;
}

// ─────────────────────────────────────────────────────────────
// Arcball: 屏幕光标 → 单位球面点 → 旋转四元数
// ─────────────────────────────────────────────────────────────

/**
 * 把 NDC 坐标 (x,y ∈ [-1,1]) 投影到单位球面。
 *
 * Bell's Trackball 公式（Holroyd 改进版）：
 *   - 球内：z = sqrt(r² - d²)         （半球面）
 *   - 球外：z = (r²/2) / d            （双曲线，平滑过渡，避免边缘失控）
 *
 * 这是行业标准 Arcball 投影，保证模型旋转无累积漂移、无路径依赖。
 *
 * @param out 写入结果的 Vector3 (会被 normalize)
 * @param x   NDC x
 * @param y   NDC y
 * @param r   球半径，默认 0.8（略小于 1，让边缘行为更稳定）
 */
export function projectToSphere(out: THREE.Vector3, x: number, y: number, r = 0.8): THREE.Vector3 {
  const d2 = x * x + y * y;
  const r2 = r * r;
  let z: number;
  if (d2 <= r2 * 0.5) {
    // 球内：标准半球
    z = Math.sqrt(r2 - d2);
  } else {
    // 球外：双曲线过渡（Holroyd），保证 C1 连续
    z = (r2 * 0.5) / Math.sqrt(d2);
  }
  out.set(x, y, z).normalize();
  return out;
}

// 模块级临时对象池（避免 useFrame 内 new）
const _arcA = new THREE.Vector3();
const _arcB = new THREE.Vector3();
const _arcAxis = new THREE.Vector3();

/**
 * 根据"前一帧光标"和"当前光标"生成增量旋转四元数。
 *
 * 算法：把两个光标各自投到单位球，得到 a, b，旋转轴 = a × b，旋转角 = acos(a·b)。
 * 这样产生的旋转**只取决于起止点位置**，与中间路径无关。
 *
 * @param outQ      写入结果四元数(增量)
 * @param prevX/Y   前一帧光标 NDC
 * @param currX/Y   当前光标 NDC
 * @param gain      灵敏度（建议 0.5–1.5；> 1 让小手势也能转动大角度）
 * @returns         真正写入了旋转 → true；位移在死区内 → false
 */
export function computeArcballDelta(
  outQ: THREE.Quaternion,
  prevX: number,
  prevY: number,
  currX: number,
  currY: number,
  gain: number,
): boolean {
  const dx = currX - prevX;
  const dy = currY - prevY;
  if (dx * dx + dy * dy < ROTATION_TUNING.cursorDeadzone * ROTATION_TUNING.cursorDeadzone) {
    outQ.identity();
    return false;
  }

  projectToSphere(_arcA, prevX, prevY);
  projectToSphere(_arcB, currX, currY);

  // 旋转轴 = a × b
  _arcAxis.crossVectors(_arcA, _arcB);
  const axisLen = _arcAxis.length();
  if (axisLen < 1e-6) {
    outQ.identity();
    return false;
  }
  _arcAxis.divideScalar(axisLen); // normalize

  // 旋转角 = acos(a·b)，乘以 gain 调整灵敏度
  const dot = Math.max(-1, Math.min(1, _arcA.dot(_arcB)));
  let angle = Math.acos(dot) * gain;

  // 单帧角度上限，防止识别跳变
  if (angle > ROTATION_TUNING.maxAngleStepPerFrame) {
    angle = ROTATION_TUNING.maxAngleStepPerFrame;
  }

  outQ.setFromAxisAngle(_arcAxis, angle);
  return true;
}

// ─────────────────────────────────────────────────────────────
// 双手 Roll: 屏幕内两手连线角度差驱动绕屏幕法线轴旋转
// ─────────────────────────────────────────────────────────────

const _rollAxis = new THREE.Vector3(0, 0, 1);

/**
 * 计算双手"扭手腕"产生的 Z 轴 Roll 增量。
 *
 * @param outQ        写入结果四元数(增量)
 * @param prevAngle   前一帧双手连线的 atan2(dy,dx)
 * @param currAngle   当前双手连线的 atan2(dy,dx)
 * @returns           是否真正写入了旋转
 */
export function computeRollDelta(
  outQ: THREE.Quaternion,
  prevAngle: number,
  currAngle: number,
): boolean {
  let delta = wrapAngle(currAngle - prevAngle);
  // 单帧上限：防止双手 cursor 突然交换位置时产生 ±π 级跳变
  delta = clampMag(delta, ROTATION_TUNING.maxAngleStepPerFrame);
  if (Math.abs(delta) < 1e-4) {
    outQ.identity();
    return false;
  }
  outQ.setFromAxisAngle(_rollAxis, -delta * ROTATION_TUNING.rollGain);
  return true;
}

// ─────────────────────────────────────────────────────────────
// 缩放：将 pinch 间距变化映射为 modelScale
// ─────────────────────────────────────────────────────────────

/**
 * 计算 pinch 间距变化对应的缩放增量(乘性)。
 *
 * 用乘性缩放(scale *= factor)而非加性，能保证大尺寸下手势仍流畅、小尺寸下不会过度敏感。
 *
 * @param prevDist  前一帧两手 NDC 距离
 * @param currDist  当前两手 NDC 距离
 * @returns         scale 乘子(默认 1.0=无变化)，已应用死区
 */
export function computeScaleFactor(prevDist: number, currDist: number): number {
  const d = currDist - prevDist;
  if (Math.abs(d) < ROTATION_TUNING.pinchDistDeadzone) return 1.0;
  // 把"加性 deltaDist * gain"转成"乘性 1 + deltaDist * gain"，更符合直觉
  // d 通常在 ±0.02 量级，gain=5 → factor 在 ±0.1 范围内
  return 1.0 + d * ROTATION_TUNING.scaleGain;
}

/**
 * 根据当前 modelScale 计算"自适应灵敏度系数"。
 *
 * 模型放得越大，用户视觉上感受同样手势带来的位移越大，因此应该把灵敏度降低。
 * 经验公式：1 / sqrt(scale)，在 [0.45, 2.2] 范围内平滑变化。
 */
export function adaptiveSensitivity(modelScale: number): number {
  return 1.0 / Math.sqrt(Math.max(0.5, Math.min(10, modelScale)));
}
