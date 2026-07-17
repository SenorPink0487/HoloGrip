/**
 * 热力学实验台 — 元数据 + 交互 / 仿真
 * 量热法测比热 · 金属热传导
 */

export const station = {
  id: 'thermo',
  title: '热力学实验台',
  accent: '#f97316',
  experiments: [
    {
      id: 'calorimetry',
      name: '量热法测比热容',
      goal: '用混合法粗测金属样品比热容',
      theory: 'c₁m₁ΔT₁ = c₂m₂ΔT₂（忽略热损失时）',
      steps: [
        { id: 'heat', text: '加热金属样品（按住加热）', hint: '瞄准加热台按住 E' },
        { id: 'drop', text: '将样品投入量热器冷水中', hint: '瞄准量热器按 E' },
        { id: 'equilibrate', text: '等待热平衡，读取终温', hint: '自动平衡中…' },
        { id: 'compute_c', text: '计算样品比热容 c', hint: '查看计算结果' },
      ],
    },
    {
      id: 'conduction',
      name: '金属热传导对比',
      goal: '比较不同金属棒的导热快慢',
      theory: '傅里叶定律：热流密度 j = −κ ∇T',
      steps: [
        { id: 'heater_on', text: '开启加热端', hint: '按 E 加热' },
        { id: 'watch', text: '观察三根金属棒的温度色阶传播', hint: '铜 > 铝 > 铁 导热更快' },
        { id: 'rank', text: '按导热快慢排序并确认', hint: '按 E 完成' },
      ],
    },
  ],
};

export function createHandlers(ctx) {
  const {
    state, equipment, toast, pushHud, advanceStep, setStep, currentStep,
  } = ctx;

  function initData(expId) {
    if (expId === 'calorimetry') {
      return {
        heating: false, sampleT: 25, waterT: 22, mixed: false, equilibrating: false,
        finalT: 0, cSample: 0, mSample: 0.05, mWater: 0.12, cWater: 4180,
      };
    }
    if (expId === 'conduction') {
      return { heaterOn: false, progress: 0 };
    }
    return {};
  }

  function applyVisualDefaults() {
    /* no-op */
  }

  function interact(target, t, step) {
    const eid = state.expId;

    if (eid === 'calorimetry') {
      if (step.id === 'heat' || (!state.data.mixed && step.id === 'heat')) {
        state.data.heating = true;
        toast('加热中…松手停止（在更新循环中升温）');
        pushHud();
        return true;
      }
      if (step.id === 'drop' || (state.data.sampleT > 60 && !state.data.mixed)) {
        state.data.mixed = true;
        state.data.heating = false;
        state.data.equilibrating = true;
        state.data.tMix = t;
        setStep('drop');
        advanceStep();
        toast('样品已投入冷水，热平衡中…');
        pushHud();
        return true;
      }
      if (step.id === 'compute_c' || state.data.finalT) {
        state.data.completed = true;
        toast(`比热容 c ≈ ${state.data.cSample.toFixed(0)} J/(kg·K)`);
        pushHud();
        return true;
      }
    }

    if (eid === 'conduction') {
      if (step.id === 'heater_on') {
        state.data.heaterOn = true;
        advanceStep();
        toast('加热端已开启');
        pushHud();
        return true;
      }
      if (step.id === 'watch') {
        if (state.data.progress > 0.6) advanceStep();
        else toast('请继续观察温度传播…');
        pushHud();
        return true;
      }
      if (step.id === 'rank') {
        state.data.completed = true;
        toast('导热排序：铜 > 铝 > 铁');
        pushHud();
        return true;
      }
    }

    if (target?.userData?.role === 'ui_action' || target?.userData?.role === 'generic') {
      if (eid === 'calorimetry') {
        if (step.id === 'heat') {
          state.data.heating = true;
          toast('按住 E 持续加热');
          pushHud();
          return true;
        }
        if (step.id === 'drop') {
          state.data.mixed = true;
          state.data.heating = false;
          state.data.equilibrating = true;
          state.data.tMix = t;
          advanceStep();
          toast('投入冷水');
          pushHud();
          return true;
        }
        if (step.id === 'compute_c') {
          state.data.completed = true;
          toast(`c ≈ ${state.data.cSample?.toFixed(0)}`);
          pushHud();
          return true;
        }
      }
      if (eid === 'conduction') {
        if (step.id === 'heater_on') {
          state.data.heaterOn = true;
          advanceStep();
          toast('加热开启');
          pushHud();
          return true;
        }
        if (step.id === 'watch' && state.data.progress > 0.55) {
          advanceStep();
          pushHud();
          return true;
        }
        if (step.id === 'rank') {
          state.data.completed = true;
          toast('铜 > 铝 > 铁');
          pushHud();
          return true;
        }
      }
    }

    return false;
  }

  function onKey() {
    return false;
  }

  function onWheel() {
    return false;
  }

  function holdInteract(holding, t, dt) {
    if (state.expId !== 'calorimetry') return;
    if (holding && !state.data.mixed && currentStep()?.id === 'heat') {
      state.data.heating = true;
      state.data.sampleT = Math.min(95, state.data.sampleT + dt * 18);
      if (state.data.sampleT >= 80 && currentStep()?.id === 'heat') {
        advanceStep();
        toast(`样品温度 ${state.data.sampleT.toFixed(0)}°C，可以投入水中`);
      }
      pushHud();
    } else {
      state.data.heating = false;
    }
  }

  function update(t, dt) {
    const eid = state.expId;
    const d = state.data;

    if (eid === 'calorimetry' && d.equilibrating) {
      const elapsed = t - (d.tMix || t);
      const Teq = (d.mSample * 385 * d.sampleT + d.mWater * d.cWater * d.waterT)
        / (d.mSample * 385 + d.mWater * d.cWater);
      d.finalT = d.waterT + (Teq - d.waterT) * (1 - Math.exp(-elapsed * 0.8));
      d.sampleT = d.finalT;
      if (equipment.thermo?.setTempDisplay) {
        equipment.thermo.setTempDisplay(d.finalT);
      }
      if (elapsed > 2.5) {
        d.equilibrating = false;
        const Ts0 = 80;
        const heated = Math.max(Ts0, d.sampleT);
        d.cSample = (d.cWater * d.mWater * (d.finalT - d.waterT))
          / (d.mSample * Math.max(1, heated - d.finalT));
        if (!isFinite(d.cSample) || d.cSample < 100) d.cSample = 385;
        setStep('compute_c');
        toast(`终温 ${d.finalT.toFixed(1)}°C，c ≈ ${d.cSample.toFixed(0)} J/(kg·K)`);
        pushHud();
      }
    }

    if (eid === 'conduction' && d.heaterOn) {
      d.progress = Math.min(1, d.progress + dt * 0.15);
      if (equipment.thermo?.setRodHeat) {
        equipment.thermo.setRodHeat(d.progress);
      }
    }

    return d;
  }

  return { initData, applyVisualDefaults, interact, onKey, onWheel, holdInteract, update };
}
