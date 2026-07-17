/**
 * 力学实验台 — 元数据 + 交互 / 仿真
 * 单摆测 g · 弹簧测 k · 牛顿摆
 */

export const station = {
  id: 'mechanics',
  title: '力学实验台',
  accent: '#0ea5e9',
  experiments: [
    {
      id: 'pendulum_g',
      name: '单摆测重力加速度',
      goal: '测量单摆周期与摆长，计算当地重力加速度 g',
      theory: 'T = 2π√(L/g)  ⇒  g = 4π²L / T²  （小角度近似 θ≲5°–10°）',
      steps: [
        { id: 'set_L', text: '调节摆长 L（滚轮或 [ / ]）', hint: '瞄准单摆支架后滚动鼠标滚轮' },
        { id: 'pull', text: '拉动摆球至小角度后释放（E / 点击）', hint: '瞄准摆球按下 E 或左键' },
        { id: 'measure', text: '自动计时 10 个周期，读取平均周期 T', hint: '释放后将自动计时' },
        { id: 'compute', text: '根据公式计算 g 并记录结果', hint: '计时完成后自动计算' },
      ],
    },
    {
      id: 'spring_k',
      name: '弹簧振子测劲度系数',
      goal: '通过周期法测定弹簧劲度系数 k',
      theory: 'T = 2π√(m/k)  ⇒  k = 4π²m / T²',
      steps: [
        { id: 'set_m', text: '选择挂载质量 m（滚轮）', hint: '瞄准弹簧振子后滚轮调质量' },
        { id: 'oscillate', text: '下拉重物并释放，启动简谐振动', hint: '瞄准重物按 E' },
        { id: 'measure', text: '测量振动周期 T', hint: '自动计时中…' },
        { id: 'compute', text: '计算劲度系数 k', hint: '完成后查看结果' },
      ],
    },
    {
      id: 'cradle_demo',
      name: '牛顿摆 · 动量传递',
      goal: '观察弹性碰撞中动量与能量的传递',
      theory: '一球抬起释放 → 对端一球飞出；两球抬起 → 两球飞出（近似弹性碰撞）',
      steps: [
        { id: 'lift1', text: '抬起左侧 1 个球并释放', hint: '按 1 或点选「抬起 1 球」' },
        { id: 'lift2', text: '抬起左侧 2 个球并释放，对比现象', hint: '按 2 或点选「抬起 2 球」' },
        { id: 'observe', text: '观察对端飞出球的数量是否守恒', hint: '可反复试验' },
      ],
    },
  ],
};

/**
 * @param {object} ctx shared manager context
 */
export function createHandlers(ctx) {
  const {
    state, equipment, toast, pushHud, advanceStep, setStep, currentStep,
  } = ctx;
  let directManipulation = null;

  function initData(expId) {
    directManipulation = null;
    if (expId === 'pendulum_g') {
      return { L: 0.72, gTrue: 9.8, angle: 0, released: false, timing: false, periods: 0, tStart: 0, T: 0, g: 0, phase: 0 };
    }
    if (expId === 'spring_k') {
      return { m: 0.2, kTrue: 25, timing: false, T: 0, k: 0, amp: 0, phase: 0 };
    }
    if (expId === 'cradle_demo') {
      return { mode: 0, t0: 0 };
    }
    return {};
  }

  function applyVisualDefaults() {
    /* no-op */
  }

  function interact(target, t, step) {
    const eid = state.expId;

    if (eid === 'pendulum_g') {
      if (target?.userData?.role === 'pendulum_bob' || target?.userData?.role === 'pendulum') {
        if (step.id === 'set_L') {
          toast('先调节摆长，再用 E 拉起摆球');
          return true;
        }
        if (step.id === 'pull' || step.id === 'set_L') {
          state.data.released = false;
          state.data.angle = 0.35;
          state.data.phase = 0;
          state.data.timing = false;
          setStep('pull');
          state.data.pendingRelease = t + 0.4;
          toast('摆球已拉起，即将释放…');
          pushHud();
          return true;
        }
      }
    }

    if (eid === 'spring_k') {
      if (target?.userData?.role === 'spring_mass' || target?.userData?.role === 'spring') {
        state.data.amp = 0.1;
        state.data.phase = 0;
        state.data.timing = true;
        state.data.tStart = t;
        state.data.periods = 0;
        setStep('oscillate');
        toast('开始振动，计时中…');
        pushHud();
        return true;
      }
    }

    if (eid === 'cradle_demo') {
      if (step.id === 'lift1' || step.id === 'observe') {
        state.data.mode = 1;
        state.data.t0 = t;
        setStep('lift1');
        if (step.id === 'lift1') advanceStep();
        toast('抬起 1 球释放');
        pushHud();
        return true;
      }
      if (step.id === 'lift2') {
        state.data.mode = 2;
        state.data.t0 = t;
        advanceStep();
        toast('抬起 2 球释放');
        pushHud();
        return true;
      }
    }

    // UI / generic fallbacks
    if (target?.userData?.role === 'ui_action' || target?.userData?.role === 'generic') {
      if (eid === 'pendulum_g') {
        return interact({ userData: { role: 'pendulum_bob' } }, t, step);
      }
      if (eid === 'spring_k') {
        return interact({ userData: { role: 'spring_mass' } }, t, step);
      }
      if (eid === 'cradle_demo') {
        if (step.id === 'lift1' || step.id === 'observe') {
          state.data.mode = 1;
          state.data.t0 = t;
          if (step.id === 'lift1') advanceStep();
          toast('抬起 1 球释放');
          pushHud();
          return true;
        }
        if (step.id === 'lift2') {
          state.data.mode = 2;
          state.data.t0 = t;
          advanceStep();
          toast('抬起 2 球释放');
          pushHud();
          return true;
        }
      }
    }

    return false;
  }

  function onKey(code, t) {
    if (state.expId !== 'cradle_demo') return false;
    if (code === 'Digit1' || code === 'Numpad1') {
      state.data.mode = 1;
      state.data.t0 = t;
      toast('抬起 1 球');
      if (currentStep()?.id === 'lift1') advanceStep();
      pushHud();
      return true;
    }
    if (code === 'Digit2' || code === 'Numpad2') {
      state.data.mode = 2;
      state.data.t0 = t;
      toast('抬起 2 球');
      if (currentStep()?.id === 'lift2') advanceStep();
      pushHud();
      return true;
    }
    return false;
  }

  function onWheel(delta) {
    const d = Math.sign(delta);
    const eid = state.expId;

    if (eid === 'pendulum_g') {
      state.data.L = Math.min(1.0, Math.max(0.4, state.data.L - d * 0.02));
      if (equipment.mechanics?.setPendulumLength) {
        equipment.mechanics.setPendulumLength(state.data.L);
      }
      toast(`摆长 L = ${state.data.L.toFixed(2)} m`);
      pushHud();
      return true;
    }
    if (eid === 'spring_k') {
      const masses = [0.1, 0.15, 0.2, 0.25, 0.3];
      let idx = masses.findIndex((m) => Math.abs(m - state.data.m) < 0.01);
      idx = Math.min(masses.length - 1, Math.max(0, idx - d));
      state.data.m = masses[idx];
      toast(`质量 m = ${state.data.m.toFixed(2)} kg`);
      pushHud();
      return true;
    }
    return false;
  }

  function holdInteract() {
    /* no-op */
  }

  function beginManipulation(target, context = {}) {
    const role = target?.userData?.role;
    const step = currentStep();
    if (!step) return false;
    if (state.expId === 'pendulum_g' && (role === 'pendulum' || role === 'pendulum_bob')) {
      directManipulation = step.id === 'set_L'
        ? { kind: 'pendulumLength', start: state.data.L, totalY: 0, dragged: false }
        : { kind: 'tap', target, time: context.time || 0, dragged: false };
      if (step.id === 'set_L') toast('上下拖动调节摆长 L');
      return true;
    }
    if (state.expId === 'spring_k' && (role === 'spring' || role === 'spring_mass')) {
      directManipulation = step.id === 'set_m'
        ? { kind: 'springMass', start: state.data.m, totalY: 0, dragged: false }
        : { kind: 'tap', target, time: context.time || 0, dragged: false };
      if (step.id === 'set_m') toast('上下拖动选择挂载质量 m');
      return true;
    }
    if (state.expId === 'cradle_demo' && role === 'cradle') {
      directManipulation = { kind: 'tap', target, time: context.time || 0, dragged: false };
      return true;
    }
    return interact(target, context.time || 0, step);
  }

  function updateManipulation(_target, context = {}) {
    if (!directManipulation) return false;
    directManipulation.totalY = Number(context.totalY || 0);
    directManipulation.dragged = !!context.dragged;
    if (!directManipulation.dragged) return true;
    if (directManipulation.kind === 'pendulumLength') {
      state.data.L = Math.min(1, Math.max(0.4, directManipulation.start - directManipulation.totalY * 0.0015));
      equipment.mechanics?.setPendulumLength?.(state.data.L);
      pushHud();
      return true;
    }
    if (directManipulation.kind === 'springMass') {
      const masses = [0.1, 0.15, 0.2, 0.25, 0.3];
      const startIndex = masses.findIndex((mass) => Math.abs(mass - directManipulation.start) < 0.01);
      const index = Math.min(
        masses.length - 1,
        Math.max(0, startIndex + Math.round(-directManipulation.totalY / 28)),
      );
      state.data.m = masses[index];
      pushHud();
      return true;
    }
    return true;
  }

  function endManipulation(target, context = {}) {
    if (!directManipulation) return false;
    const direct = directManipulation;
    directManipulation = null;
    if (context.cancelled) return true;
    if (direct.kind === 'tap' && !context.dragged) {
      return interact(target || direct.target, context.time || direct.time || 0, currentStep());
    }
    if (direct.kind === 'pendulumLength' && context.dragged) {
      setStep('pull');
      toast(`摆长 L = ${state.data.L.toFixed(2)} m`);
      pushHud();
      return true;
    }
    if (direct.kind === 'springMass' && context.dragged) {
      setStep('oscillate');
      toast(`质量 m = ${state.data.m.toFixed(2)} kg`);
      pushHud();
      return true;
    }
    return true;
  }

  function update(t, dt) {
    const eid = state.expId;
    const d = state.data;

    if (eid === 'pendulum_g' && equipment.mechanics?.pendulumPivot) {
      if (d.pendingRelease && t >= d.pendingRelease) {
        d.pendingRelease = 0;
        d.released = true;
        d.timing = true;
        d.tStart = t;
        d.periods = 0;
        d.lastZero = t;
        setStep('measure');
        toast('开始计时 10 个周期…');
        pushHud();
      }
      const omega = Math.sqrt(d.gTrue / d.L);
      if (d.released || d.timing) {
        const amp = 0.35 * Math.exp(-0.02 * (t - (d.tStart || t)));
        d.angle = amp * Math.cos(omega * (t - (d.tStart || t)));
        equipment.mechanics.pendulumPivot.rotation.z = d.angle;

        if (d.timing && d.angle * (d.prevAngle ?? d.angle) < 0 && d.angle > 0) {
          d.periods += 0.5;
          if (d.periods >= 10) {
            d.timing = false;
            d.T = (t - d.tStart) / 10;
            d.g = (4 * Math.PI * Math.PI * d.L) / (d.T * d.T);
            setStep('compute');
            d.completed = true;
            toast(`T=${d.T.toFixed(3)}s, g=${d.g.toFixed(2)} m/s²`);
            advanceStep();
            pushHud();
          }
        }
        d.prevAngle = d.angle;
      } else if (d.angle) {
        equipment.mechanics.pendulumPivot.rotation.z = d.angle;
      }
    }

    if (eid === 'spring_k' && equipment.mechanics?.springGroup) {
      if (d.amp > 0) {
        const omega = Math.sqrt(d.kTrue / d.m);
        const stretch = d.amp * Math.sin(omega * (t - (d.tStart || 0)));
        equipment.mechanics.springGroup.scale.y = 1 + stretch * 2;
        if (equipment.mechanics.springMass) {
          equipment.mechanics.springMass.position.y = -0.45 - stretch;
        }
        if (d.timing && t - d.tStart > (4 * Math.PI) / omega) {
          d.T = (2 * Math.PI) / omega;
          d.k = (4 * Math.PI * Math.PI * d.m) / (d.T * d.T);
          d.timing = false;
          d.completed = true;
          setStep('compute');
          toast(`T=${d.T.toFixed(3)}s, k=${d.k.toFixed(1)} N/m`);
          advanceStep();
          pushHud();
        }
      }
    }

    if (eid === 'cradle_demo' && equipment.mechanics?.cradleBalls) {
      const balls = equipment.mechanics.cradleBalls;
      const n = balls.length;
      const period = 1.35;
      const phase = ((t - (d.t0 || 0)) % period) / period;
      const ang = Math.sin(phase * Math.PI * 2) * 0.55;
      balls.forEach((b) => { b.rotation.z = 0; });
      if (d.mode === 1) {
        if (phase < 0.5) {
          balls[0].rotation.z = Math.max(0, ang);
          balls[n - 1].rotation.z = Math.min(0, -ang);
        } else {
          balls[0].rotation.z = Math.min(0, ang);
          balls[n - 1].rotation.z = Math.max(0, -ang);
        }
      } else if (d.mode === 2) {
        if (phase < 0.5) {
          balls[0].rotation.z = Math.max(0, ang);
          balls[1].rotation.z = Math.max(0, ang * 0.95);
          balls[n - 1].rotation.z = Math.min(0, -ang);
          balls[n - 2].rotation.z = Math.min(0, -ang * 0.95);
        } else {
          balls[0].rotation.z = Math.min(0, ang);
          balls[1].rotation.z = Math.min(0, ang * 0.95);
          balls[n - 1].rotation.z = Math.max(0, -ang);
          balls[n - 2].rotation.z = Math.max(0, -ang * 0.95);
        }
      }
    }

    return d;
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
    update,
  };
}
