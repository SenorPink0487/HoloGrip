/**
 * 智能手部追踪层
 *
 * 解决三个 MediaPipe 原始输出层面解决不了的问题：
 *   1. 短时识别丢失 → "coast 滑行" 模式 + 速度与加速度外推，避免模型跳一下
 *   2. 多人场景      → 主用户锁定，不被旁观者抢走控制
 *   3. 左右手抖动    → handedness 短窗口投票 + 位置匹配双保险 + 身份锁定门限
 *
 * 工作模型：
 *   每只被追踪的手有一个长期身份(TrackedHand)，包含最后已知位置、速度、加速度、
 *   handedness 投票等。每帧把 MediaPipe 检测到的若干"裸手"匹配到现有身份，
 *   匹配不上的进入 coast(滑行)，coast 超时才算丢失。
 *
 *   全程使用预分配数据结构，无 GC 压力。
 */

// ─────────────────────────────────────────────────────────────
// 可调参数
// ─────────────────────────────────────────────────────────────

export const TRACKING_TUNING = {
  /** 丢失多少毫秒后才真正置 invisible(coast 时间窗口) */
  coastDurationMs: 250,
  /** coast 期间最大允许的外推距离(NDC，0–2 区间)，超出则提前终止 coast */
  maxCoastExtrapolation: 0.35,
  /** 匹配代价阈值：距离 + handedness 不一致代价的总和 */
  matchCostThreshold: 0.6,
  /** handedness 不一致的固定代价(NDC 距离单位) */
  handednessMismatchCost: 0.25,
  /** handedness 投票窗口大小 */
  handednessVoteWindow: 10,
  /** 主用户锁定持久度：丢失多少 ms 后允许"陌生手"接管 */
  primaryLockTimeoutMs: 1500,
  /** 速度估计的低通时间常数(秒)，用于平滑速度避免外推炸 */
  velocitySmoothingTau: 0.08,
  /** 最大速度(NDC/s)，clamp 防异常输入 */
  maxVelocity: 6.0,
};

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** MediaPipe 单帧检测的"裸手"输入 */
export interface RawHandObservation {
  /** NDC 坐标 [-1, 1] */
  ndcX: number;
  ndcY: number;
  /** 屏幕像素坐标(用于点击) */
  pixelX: number;
  pixelY: number;
  /** 是否捏合 */
  isPinched: boolean;
  /** 食指到拇指距离 */
  pinchDistance: number;
  /**
   * MediaPipe 报告的 handedness：
   *   "Left"  = 镜像 selfie 视角下，是用户的"右手"
   *   "Right" = 镜像 selfie 视角下，是用户的"左手"
   *   undefined = 该帧未给出
   */
  rawHandedness?: 'Left' | 'Right';
  /** 该检测的置信度(0~1) */
  confidence: number;
}

/** 追踪输出：经过身份保持、coast、投票后的稳定结果 */
export interface TrackedHandSnapshot {
  /** NDC 坐标 */
  ndcX: number;
  ndcY: number;
  pixelX: number;
  pixelY: number;
  isPinched: boolean;
  pinchDistance: number;
  isVisible: boolean;
  /** 当前是否处于 coast(预测) 状态 */
  isCoasting: boolean;
}

/** 内部追踪条目 */
interface TrackedHand {
  /** 长期不变的身份 id */
  id: number;
  /** 当前推断的 handedness("user-left" / "user-right") */
  userSide: 'left' | 'right';
  /** 最后真实观测到的时间(ms) */
  lastSeenAt: number;
  /** 最后已知位置(NDC) */
  lastX: number;
  lastY: number;
  /** 速度(NDC/s)，用于 coast 外推 */
  vx: number;
  vy: number;
  /** 加速度(NDC/s^2)，用于高动态路径预测 */
  ax: number;
  ay: number;
  /** 上一帧位置，用于估速 */
  prevX: number;
  prevY: number;
  prevAt: number;
  /** 像素坐标 */
  pixelX: number;
  pixelY: number;
  /** 捏合状态 */
  isPinched: boolean;
  pinchDistance: number;
  /** handedness 投票环形缓冲(1 = userRight, -1 = userLeft, 0 = unknown) */
  handednessVotes: Int8Array;
  voteIndex: number;
  /** 是否是主用户的手(锁定状态) */
  isPrimary: boolean;

  // 卡尔曼滤波器状态 (X 轴: 位置、速度、加速度)
  xEst: number;
  vxEst: number;
  axEst: number;
  pXX: number;
  pXV: number;
  pXA: number;
  pVV: number;
  pVA: number;
  pAA: number;

  // 卡尔曼滤波器状态 (Y 轴: 位置、速度、加速度)
  yEst: number;
  vyEst: number;
  ayEst: number;
  pYY: number;
  pYV: number;
  pYA: number;
  pWW: number;
  pWA: number;
  pAA_y: number;
}

// ─────────────────────────────────────────────────────────────
// HandTracker 实现
// ─────────────────────────────────────────────────────────────

export class HandTracker {
  private tracks: TrackedHand[] = [];
  private nextId = 1;
  /** 最近一次出现"主用户的手"的时间戳；超过 primaryLockTimeoutMs 后才允许新手接管 */
  private lastPrimarySeenAt = 0;
  /** 复用的快照对象，避免每帧 new */
  private leftSnapshot: TrackedHandSnapshot = this.makeEmptySnapshot();
  private rightSnapshot: TrackedHandSnapshot = this.makeEmptySnapshot();

  // ── 输出层身份分配的锁定状态 ───────────────────────────────
  // 用 trackId 锁定"哪只 track 输出给 userLeft / userRight"。
  // 一旦锁定，只有 track 死亡(超出 coast)才解绑，绝不在生命周期内
  // 因为 X 坐标抖动而重排，避免双手靠近时光标乱跳。
  /** 当前给 userLeft 输出的 track id，0 表示未分配 */
  private currentLeftTrackId = 0;
  /** 当前给 userRight 输出的 track id，0 表示未分配 */
  private currentRightTrackId = 0;

  /** 工厂：创建空的 snapshot */
  private makeEmptySnapshot(): TrackedHandSnapshot {
    return {
      ndcX: -999,
      ndcY: -999,
      pixelX: 0,
      pixelY: 0,
      isPinched: false,
      pinchDistance: 1,
      isVisible: false,
      isCoasting: false,
    };
  }

  /**
   * 主入口：每一帧调用一次
   *
   * @param observations  MediaPipe 本帧的所有检测结果(可能 0~N 只手)
   * @param nowMs         当前时间戳(performance.now())
   * @returns             { left, right } 用户视角的左右手快照
   */
  update(
    observations: RawHandObservation[],
    nowMs: number,
  ): { left: TrackedHandSnapshot; right: TrackedHandSnapshot } {
    // 1. 把所有 track coast/expire
    this.coastAllTracks(nowMs);

    // 2. 把 observations 匹配到现有 track；多余 of 检测进入"待分配"队列
    const unmatched = this.matchObservations(observations, nowMs);

    // 3. 处理未匹配的检测：尝试创建新 track 或忽略(陌生人)
    this.handleUnmatched(unmatched, nowMs);

    // 4. 清理长时间无效的 track
    this.expireStaleTracks(nowMs);

    // 5. 选出"主用户的左/右手"，写到快照
    this.composeOutput(nowMs);

    return { left: this.leftSnapshot, right: this.rightSnapshot };
  }

  /** 重置全部状态(切出 AR 模式或切换摄像头时) */
  reset(): void {
    this.tracks.length = 0;
    this.nextId = 1;
    this.lastPrimarySeenAt = 0;
    this.currentLeftTrackId = 0;
    this.currentRightTrackId = 0;
    this.leftSnapshot = this.makeEmptySnapshot();
    this.rightSnapshot = this.makeEmptySnapshot();
  }

  // ── 内部步骤 ────────────────────────────────────────────────

  /** 步骤1：所有 track 按上一帧速度与加速度做位置外推(coast) */
  private coastAllTracks(nowMs: number): void {
    for (const t of this.tracks) {
      const dt = (nowMs - t.lastSeenAt) / 1000;
      if (dt <= 0) continue;
      // 注意：coast 不修改 lastX/lastY/lastSeenAt，那两个是"最后真实观测"
    }
  }

  /**
   * 步骤2：用最小代价匹配把检测分配到现有 track。
   *
   * 代价 = 预测位置到检测位置的欧氏距离 + handedness 不一致惩罚
   * 用贪心+全局最小法（hand 数最多 2~6，复杂度无所谓）。
   *
   * @returns 没被匹配上的 observations
   */
  private matchObservations(
    observations: RawHandObservation[],
    nowMs: number,
  ): RawHandObservation[] {
    if (observations.length === 0) return [];
    if (this.tracks.length === 0) return observations.slice();

    // 计算成本矩阵：cost[trackIdx][obsIdx]
    const matchCost: number[][] = [];
    const dynamicThresholds: number[] = [];

    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      // 预测位置 = lastX/Y + 速度 × dt + 0.5 × 加速度 × dt^2 (常加速度物理外推预测)
      const dt = Math.max(0, (nowMs - t.lastSeenAt) / 1000);
      const px = t.lastX + t.vx * dt + 0.5 * t.ax * dt * dt;
      const py = t.lastY + t.vy * dt + 0.5 * t.ay * dt * dt;

      // 实时速度估计
      const speed = Math.hypot(t.vx, t.vy);

      // 动态判定门限：
      // 低速模式：收紧判定范围以过滤微小的传感器随机抖动，防止错误吸附
      // 高速模式：快速挥动时，自动加宽匹配门限以确保轨迹不丢失
      let dynThreshold = TRACKING_TUNING.matchCostThreshold;
      if (speed < 0.15) {
        const factor = (0.15 - speed) / 0.15;
        dynThreshold *= (1.0 - factor * 0.3); // 极低速时范围收紧为 0.7x
      } else {
        dynThreshold *= (1.0 + (speed - 0.15) * 0.4 + dt * 0.8); // 高速或长时未匹配时自适应变大
      }
      dynamicThresholds.push(dynThreshold);

      // 计算左右手确信度强度 (用于防交叉互换跳变)
      let voteSum = 0;
      for (let k = 0; k < t.handednessVotes.length; k++) {
        voteSum += t.handednessVotes[k];
      }
      const voteConfidence = Math.abs(voteSum) / t.handednessVotes.length;

      const row: number[] = [];
      for (let j = 0; j < observations.length; j++) {
        const o = observations[j];
        const dx = px - o.ndcX;
        const dy = py - o.ndcY;
        let cost = Math.sqrt(dx * dx + dy * dy);
        
        // handedness 左右手防跳锁
        if (o.rawHandedness) {
          const observedSide: 'left' | 'right' = o.rawHandedness === 'Left' ? 'right' : 'left';
          if (observedSide !== t.userSide) {
            // 如果该 Track 的左右手身份确定度很高，则施加极大的惩罚代价，彻底杜绝交错时左右手乱跳
            cost += TRACKING_TUNING.handednessMismatchCost + voteConfidence * 1.5;
          }
        }
        row.push(cost);
      }
      matchCost.push(row);
    }

    // 贪心：每次找全局最小的 cost，标记该行/列为已用
    const trackUsed = new Array<boolean>(this.tracks.length).fill(false);
    const obsUsed = new Array<boolean>(observations.length).fill(false);
    const maxIter = Math.min(this.tracks.length, observations.length);
    for (let iter = 0; iter < maxIter; iter++) {
      let bestCost = Infinity;
      let bestT = -1;
      let bestO = -1;
      for (let i = 0; i < this.tracks.length; i++) {
        if (trackUsed[i]) continue;
        for (let j = 0; j < observations.length; j++) {
          if (obsUsed[j]) continue;
          if (matchCost[i][j] < bestCost) {
            bestCost = matchCost[i][j];
            bestT = i;
            bestO = j;
          }
        }
      }
      // 判定是否超出当前 track 的动态匹配门限
      if (bestT === -1 || bestCost > dynamicThresholds[bestT]) break;
      // 应用匹配
      this.applyObservation(this.tracks[bestT], observations[bestO], nowMs);
      trackUsed[bestT] = true;
      obsUsed[bestO] = true;
    }

    // 收集未匹配的观测
    const unmatched: RawHandObservation[] = [];
    for (let j = 0; j < observations.length; j++) {
      if (!obsUsed[j]) unmatched.push(observations[j]);
    }
    return unmatched;
  }

  /** 把一个观测应用到 track：更新位置、速度、加速度、handedness 投票 */
  private applyObservation(t: TrackedHand, o: RawHandObservation, nowMs: number): void {
    const dt = Math.max(0.001, (nowMs - t.prevAt) / 1000);

    // 1. 状态预测 (常加速度模型运动方程)
    const xPred = t.xEst + t.vxEst * dt + 0.5 * t.axEst * dt * dt;
    const vxPred = t.vxEst + t.axEst * dt;
    const axPred = t.axEst;

    const yPred = t.yEst + t.vyEst * dt + 0.5 * t.ayEst * dt * dt;
    const vyPred = t.vyEst + t.ayEst * dt;
    const ayPred = t.ayEst;

    // 2. 实时估算速度以调节自适应噪声闸门
    const speed = Math.hypot(t.vxEst, t.vyEst);

    // 低速去噪门限：手部微动时，显著扩大测量噪声 R，使卡尔曼滤波输出高度平滑，杜绝传感器的随机抖动
    let rScale = 1.0;
    if (speed < 0.15) {
      const factor = (0.15 - speed) / 0.15;
      rScale = 1.0 + factor * 14.0; // 速度最小时，R 扩大至 15x
    } else {
      rScale = Math.max(0.5, 1.0 - (speed - 0.15) * 0.3); // 高速挥动时，减小 R 以更灵敏贴合真实点
    }
    const r = (0.001 / Math.max(0.1, o.confidence)) * rScale;

    // 自适应过程噪声方差 Q：高速挥手时调大 Q 值以快速跟手并允许高加速度转折
    const qBase = 5.0;
    const q = qBase * (1.0 + speed * 4.0);

    // 3. 协方差外推矩阵简写 (常加速度 $3 \times 3$ 模型)
    const t2 = dt * dt;
    const t3 = t2 * dt;
    const t4 = t3 * dt;
    const t5 = t4 * dt;

    // X 轴协方差外推
    const pXX_p = t.pXX + 2 * dt * t.pXV + t2 * t.pXA + t2 * t.pVV + t3 * t.pVA + 0.25 * t4 * t.pAA + (t5 / 20) * q;
    const pXV_p = t.pXV + dt * (t.pVV + t.pXA) + 1.5 * t2 * t.pVA + 0.5 * t3 * t.pAA + (t4 / 8) * q;
    const pXA_p = t.pXA + dt * t.pVA + 0.5 * t2 * t.pAA + (t3 / 6) * q;
    const pVV_p = t.pVV + 2 * dt * t.pVA + t2 * t.pAA + (t3 / 3) * q;
    const pVA_p = t.pVA + dt * t.pAA + (t2 / 2) * q;
    const pAA_p = t.pAA + dt * q;

    // Y 轴协方差外推
    const pYY_p = t.pYY + 2 * dt * t.pYV + t2 * t.pYA + t2 * t.pWW + t3 * t.pWA + 0.25 * t4 * t.pAA_y + (t5 / 20) * q;
    const pYV_p = t.pYV + dt * (t.pWW + t.pYA) + 1.5 * t2 * t.pWA + 0.5 * t3 * t.pAA_y + (t4 / 8) * q;
    const pYA_p = t.pYA + dt * t.pWA + 0.5 * t2 * t.pAA_y + (t3 / 6) * q;
    const pWW_p = t.pWW + 2 * dt * t.pWA + t2 * t.pAA_y + (t3 / 3) * q;
    const pWA_p = t.pWA + dt * t.pAA_y + (t2 / 2) * q;
    const pAA_y_p = t.pAA_y + dt * q;

    // 4. 卡尔曼增益与测量更新 (X 轴)
    const yX = o.ndcX - xPred;
    const sX = pXX_p + r;
    const kXX = pXX_p / sX;
    const kXV = pXV_p / sX;
    const kXA = pXA_p / sX;

    t.xEst = xPred + kXX * yX;
    t.vxEst = vxPred + kXV * yX;
    t.axEst = axPred + kXA * yX;

    t.pXX = (1 - kXX) * pXX_p;
    t.pXV = (1 - kXX) * pXV_p;
    t.pXA = (1 - kXX) * pXA_p;
    t.pVV = pVV_p - kXV * pXV_p;
    t.pVA = pVA_p - kXV * pXA_p;
    t.pAA = pAA_p - kXA * pXA_p;

    // 5. 卡尔曼增益与测量更新 (Y 轴)
    const yY = o.ndcY - yPred;
    const sY = pYY_p + r;
    const kYY = pYY_p / sY;
    const kYV = pYV_p / sY;
    const kYA = pYA_p / sY;

    t.yEst = yPred + kYY * yY;
    t.vyEst = vyPred + kYV * yY;
    t.ayEst = ayPred + kYA * yY;

    t.pYY = (1 - kYY) * pYY_p;
    t.pYV = (1 - kYY) * pYV_p;
    t.pYA = (1 - kYY) * pYA_p;
    t.pWW = pWW_p - kYV * pYV_p;
    t.pWA = pWA_p - kYV * pYA_p;
    t.pAA_y = pAA_y_p - kYA * pYA_p;

    // 6. 速度限制及帧信息记录
    const vmax = TRACKING_TUNING.maxVelocity;
    t.vxEst = Math.max(-vmax, Math.min(vmax, t.vxEst));
    t.vyEst = Math.max(-vmax, Math.min(vmax, t.vyEst));

    t.prevX = t.lastX;
    t.prevY = t.lastY;
    t.prevAt = t.lastSeenAt;

    t.lastX = t.xEst;
    t.lastY = t.yEst;
    t.vx = t.vxEst;
    t.vy = t.vyEst;
    t.ax = t.axEst;
    t.ay = t.ayEst;
    t.lastSeenAt = nowMs;

    t.pixelX = o.pixelX;
    t.pixelY = o.pixelY;
    t.isPinched = o.isPinched;
    t.pinchDistance = o.pinchDistance;

    // handedness 投票
    if (o.rawHandedness) {
      const vote = o.rawHandedness === 'Left' ? 1 : -1;
      t.handednessVotes[t.voteIndex] = vote;
      t.voteIndex = (t.voteIndex + 1) % t.handednessVotes.length;
      let sum = 0;
      for (let k = 0; k < t.handednessVotes.length; k++) sum += t.handednessVotes[k];
      if (sum > 1) t.userSide = 'right';
      else if (sum < -1) t.userSide = 'left';
    }

    if (t.isPrimary) {
      this.lastPrimarySeenAt = nowMs;
    }
  }

  /**
   * 步骤3：处理未匹配的观测。
   *
   * 决策逻辑：
   *   a. 如果当前主用户的手都在(或刚消失不久)，且已有 2 只 track，则忽略陌生手
   *   b. 否则把未匹配的观测变成新 track；初始 isPrimary 视情况：
   *      - 主用户已锁定且仍有效 → 新 track 不是主用户(陌生人)
   *      - 主用户失效太久 / 还没主用户 → 新 track 自动成为主用户
   */
  private handleUnmatched(unmatched: RawHandObservation[], nowMs: number): void {
    if (unmatched.length === 0) return;

    const primaryStillLocked =
      this.lastPrimarySeenAt > 0 &&
      nowMs - this.lastPrimarySeenAt < TRACKING_TUNING.primaryLockTimeoutMs;

    // 现有的"主用户手"数量
    const primaryCount = this.tracks.filter((t) => t.isPrimary).length;

    for (const o of unmatched) {
      let willBePrimary = false;

      if (!primaryStillLocked && primaryCount === 0) {
        // 主用户失效或从未存在 → 新手成为主用户
        willBePrimary = true;
      } else if (primaryCount < 2 && !primaryStillLocked) {
        // 还在补主用户的另一只手
        willBePrimary = true;
      } else if (primaryCount < 2 && primaryStillLocked) {
        // 主用户锁着，但只有一只手；新手如果靠近、handedness 不冲突，可以补成主用户的另一只手
        willBePrimary = true;
      } else {
        // 已经有 2 只主手 → 这是陌生人，忽略(不创建 track，避免污染未来匹配)
        continue;
      }

      this.tracks.push(this.createTrack(o, nowMs, willBePrimary));
      if (willBePrimary) this.lastPrimarySeenAt = nowMs;
    }
  }

  private createTrack(o: RawHandObservation, nowMs: number, isPrimary: boolean): TrackedHand {
    // 由 rawHandedness 推断初始 userSide
    let userSide: 'left' | 'right' = 'right';
    if (o.rawHandedness) {
      userSide = o.rawHandedness === 'Left' ? 'right' : 'left';
    } else {
      // 没有 handedness 时,根据屏幕位置粗略猜：x < 0 是用户左手
      userSide = o.ndcX < 0 ? 'left' : 'right';
    }

    // 主用户互斥：如果新建 track 是主手，且现有主手已占了同一 userSide，
    // 把新手分到空的另一侧，避免"两只主手同侧"的死局
    if (isPrimary) {
      let leftTaken = false;
      let rightTaken = false;
      for (const t of this.tracks) {
        if (!t.isPrimary) continue;
        if (t.userSide === 'left') leftTaken = true;
        if (t.userSide === 'right') rightTaken = true;
      }
      if (leftTaken && !rightTaken) userSide = 'right';
      else if (rightTaken && !leftTaken) userSide = 'left';
      // 双方都被占或都没占 → 维持初始猜测
    }

    const votes = new Int8Array(TRACKING_TUNING.handednessVoteWindow);
    if (o.rawHandedness) {
      votes[0] = o.rawHandedness === 'Left' ? 1 : -1;
    }

    return {
      id: this.nextId++,
      userSide,
      lastSeenAt: nowMs,
      lastX: o.ndcX,
      lastY: o.ndcY,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      prevX: o.ndcX,
      prevY: o.ndcY,
      prevAt: nowMs,
      pixelX: o.pixelX,
      pixelY: o.pixelY,
      isPinched: o.isPinched,
      pinchDistance: o.pinchDistance,
      handednessVotes: votes,
      voteIndex: 1,
      isPrimary,

      // 初始化卡尔曼状态 (常加速度状态向量: 位置、速度、加速度)
      xEst: o.ndcX,
      vxEst: 0,
      axEst: 0,
      pXX: 0.1,
      pXV: 0,
      pXA: 0,
      pVV: 1.0,
      pVA: 0,
      pAA: 5.0,

      yEst: o.ndcY,
      vyEst: 0,
      ayEst: 0,
      pYY: 0.1,
      pYV: 0,
      pYA: 0,
      pWW: 1.0,
      pWA: 0,
      pAA_y: 5.0,
    };
  }

  /** 步骤4：清理 coast 超时的 track */
  private expireStaleTracks(nowMs: number): void {
    const cutoff = nowMs - TRACKING_TUNING.coastDurationMs * 8;
    // coast 期外多给 8x 的总缓冲;真正"完全失踪"才删
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      if (this.tracks[i].lastSeenAt < cutoff) {
        this.tracks.splice(i, 1);
      }
    }
  }

  /**
   * 步骤5：从 tracks 中挑出主用户的左/右手，写到 leftSnapshot / rightSnapshot
   *
   * 设计原则：**身份锁定 + 仅在不明时按 X 重排**
   *
   *   - 一旦给某只 track 分配了 left 槽，只要它还在 coast 期内，就一直占着 left
   *   - 解绑只在两种情况下发生：
   *       (a) 持有该槽的 track 已超出 coast(消失太久)
   *       (b) reset() 被调用
   *   - 不再每帧按 X 重排 ─ 这是上一版"光标乱跳"的根因：
   *       两只手在屏幕中线附近，因 MediaPipe 抖动 X 排序逐帧翻转
   *
   *   AR 学习场景下用户几乎不会真的物理交叉双手，
   *   优先保证"绝不乱跳"远比"支持交叉"更重要。
   */
  private composeOutput(nowMs: number): void {
    const coastBudget = TRACKING_TUNING.coastDurationMs;

    // 1) 把当前所有"还在可见/coast 期内"的主用户 track 拉出来
    const candidates: TrackedHand[] = [];
    for (const t of this.tracks) {
      if (!t.isPrimary) continue;
      if (nowMs - t.lastSeenAt > coastBudget) continue;
      candidates.push(t);
    }

    // 2) 检查现有锁定的 trackId 是否还有效；失效就解绑
    const isAlive = (id: number): TrackedHand | null => {
      if (id === 0) return null;
      const found = candidates.find((c) => c.id === id);
      return found ?? null;
    };
    let leftHeld = isAlive(this.currentLeftTrackId);
    let rightHeld = isAlive(this.currentRightTrackId);
    if (!leftHeld) this.currentLeftTrackId = 0;
    if (!rightHeld) this.currentRightTrackId = 0;

    // 3) 取出未被锁定的候选(可能 0~2 个)
    const heldIds = new Set<number>();
    if (this.currentLeftTrackId) heldIds.add(this.currentLeftTrackId);
    if (this.currentRightTrackId) heldIds.add(this.currentRightTrackId);
    const free = candidates.filter((c) => !heldIds.has(c.id));

    // 4) 把 free 的 track 按 X 排序，分配到空闲槽
    //    - 屏幕 X 较小的 → userLeft
    //    - 屏幕 X 较大的 → userRight
    //    一旦分配，下一帧就不再"按 X 重排"，只跟着 trackId 走
    free.sort((a, b) => a.lastX - b.lastX);

    if (!this.currentLeftTrackId && !this.currentRightTrackId) {
      // 两侧都空：常见情况是首次进入 / 双手同时回归
      if (free.length >= 2) {
        this.currentLeftTrackId = free[0].id;  // 屏幕左侧 → userLeft
        this.currentRightTrackId = free[1].id; // 屏幕右侧 → userRight
        leftHeld = free[0];
        rightHeld = free[1];
      } else if (free.length === 1) {
        // 只有 1 只手：根据 handedness 投票决定进哪个槽
        const only = free[0];
        if (only.userSide === 'left') {
          this.currentLeftTrackId = only.id;
          leftHeld = only;
        } else {
          this.currentRightTrackId = only.id;
          rightHeld = only;
        }
      }
    } else if (!this.currentLeftTrackId && this.currentRightTrackId) {
      // 左空右占：把第一个 free 给左槽；如果 free 里有"X 比 right 持有者更小"的，优先选它
      if (free.length > 0) {
        // 选 X 最小的(更可能是真左手)
        const best = free[0];
        this.currentLeftTrackId = best.id;
        leftHeld = best;
      }
    } else if (this.currentLeftTrackId && !this.currentRightTrackId) {
      // 右空左占：把 X 最大的 free 给右槽
      if (free.length > 0) {
        const best = free[free.length - 1];
        this.currentRightTrackId = best.id;
        rightHeld = best;
      }
    }
    // 否则：两侧都已锁定，free 中多余的 track 直接忽略(可能是误检/陌生人手)

    // 5) 写到 snapshot
    this.fillSnapshot(this.leftSnapshot, leftHeld, nowMs);
    this.fillSnapshot(this.rightSnapshot, rightHeld, nowMs);
  }

  /** 把 track 状态写到快照；track 缺失/超时则置 invisible */
  private fillSnapshot(snap: TrackedHandSnapshot, t: TrackedHand | null, nowMs: number): void {
    if (!t) {
      snap.isVisible = false;
      snap.isCoasting = false;
      snap.isPinched = false;
      snap.pinchDistance = 1;
      snap.ndcX = -999;
      snap.ndcY = -999;
      return;
    }
    const sinceMs = nowMs - t.lastSeenAt;
    if (sinceMs < 1) {
      // 刚刚有真实观测 → 直接用
      snap.ndcX = t.lastX;
      snap.ndcY = t.lastY;
      snap.pixelX = t.pixelX;
      snap.pixelY = t.pixelY;
      snap.isVisible = true;
      snap.isCoasting = false;
      snap.isPinched = t.isPinched;
      snap.pinchDistance = t.pinchDistance;
      return;
    }
    if (sinceMs <= TRACKING_TUNING.coastDurationMs) {
      // Coast 期：基于速度和加速度做恒定加速度外推
      const dt = sinceMs / 1000;
      const ex = t.lastX + t.vx * dt + 0.5 * t.ax * dt * dt;
      const ey = t.lastY + t.vy * dt + 0.5 * t.ay * dt * dt;
      
      // 外推距离合理性检查：基于运动速度自适应扩展外推上限
      const exDist = Math.hypot(ex - t.lastX, ey - t.lastY);
      const speed = Math.hypot(t.vx, t.vy);
      
      let dynamicMaxExtrapolation = TRACKING_TUNING.maxCoastExtrapolation;
      if (speed < 0.15) {
        dynamicMaxExtrapolation *= 0.8; // 低速收窄
      } else {
        dynamicMaxExtrapolation *= (1.0 + (speed - 0.15) * 0.7); // 高速放宽，支持大位移滑行
      }

      if (exDist > dynamicMaxExtrapolation) {
        // 外推太远，认为是异常 → 直接置 invisible
        snap.isVisible = false;
        snap.isCoasting = false;
        return;
      }
      snap.ndcX = ex;
      snap.ndcY = ey;
      snap.pixelX = t.pixelX; // 像素位置不外推(用于点击精度优先)
      snap.pixelY = t.pixelY;
      snap.isVisible = true;
      snap.isCoasting = true;
      // Coast 期间冻结捏合状态(不主动触发新点击，但维持原状态)
      snap.isPinched = t.isPinched;
      snap.pinchDistance = t.pinchDistance;
      return;
    }
    // 超出 coast → 不可见
    snap.isVisible = false;
    snap.isCoasting = false;
  }
}

// ─────────────────────────────────────────────────────────────
// 单例(模块级，App 只用一个 tracker 即可)
// ─────────────────────────────────────────────────────────────

export const handTracker = new HandTracker();
