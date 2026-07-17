/**
 * 光学实验台 — 单缝衍射 · 多缝干涉
 *
 * 调节波长、缝宽、缝距、缝数和屏距，观察 Fraunhofer 衍射包络与多缝干涉主极大。
 */

export const station = {
  id: 'optics',
  title: '光学实验台',
  accent: '#f59e0b',
  experiments: [
    {
      id: 'multi_slit_diffraction',
      name: '单缝衍射 · 多缝干涉',
      goal: '调节波长、缝宽、缝距、缝数和屏距，观察 Fraunhofer 衍射包络与多缝干涉主极大的变化',
      theory: 'I/I₀=(sinβ/β)²[sin(Nγ)/(N sinγ)]²；β=πa sinθ/λ，γ=πd sinθ/λ',
      steps: [
        {
          id: 'setup',
          text: '点亮激光器并选择单缝、双缝或多缝预设',
          hint: '在全息屏选择预设；也可瞄准激光器按 E 开关光束',
        },
        {
          id: 'observe',
          text: '改变 λ、a、d、N、L，观察屏上条纹与强度曲线同步变化',
          hint: '用全息屏精调；滚轮对准激光器、光阑或观察屏可直接调参',
        },
        {
          id: 'measure',
          text: '记录一组参数，比较条纹间距与衍射包络宽度',
          hint: '记录会保存完整配置、Δx、中央亮纹宽度与菲涅耳数',
        },
        {
          id: 'curve',
          text: '查看理论强度曲线，核对主极大、包络零点和远场条件',
          hint: '理论线由 Fraunhofer 方程密集采样，不对记录点做平滑拟合',
        },
        {
          id: 'result',
          text: '完成实验并总结 N、a、d、λ、L 对条纹的影响',
          hint: '至少记录一组数据后即可结束实验',
        },
      ],
    },
  ],
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

const DIFF_PRESETS = {
  single: { lambdaNm: 550, slitMm: 0.1, pitchMm: 0.25, N: 1, distM: 1 },
  double: { lambdaNm: 550, slitMm: 0.05, pitchMm: 0.25, N: 2, distM: 1 },
  triple: { lambdaNm: 550, slitMm: 0.04, pitchMm: 0.2, N: 3, distM: 1 },
  multi: { lambdaNm: 532, slitMm: 0.03, pitchMm: 0.15, N: 6, distM: 1.2 },
  grating: { lambdaNm: 632.8, slitMm: 0.02, pitchMm: 0.1, N: 10, distM: 1 },
  hene2: { lambdaNm: 632.8, slitMm: 0.05, pitchMm: 0.3, N: 2, distM: 1 },
};

export function diffractionIntensity(x, data) {
  const lambda = Number(data.lambdaNm) * 1e-9;
  const a = Number(data.slitMm) * 1e-3;
  const d = Number(data.pitchMm) * 1e-3;
  const N = Math.max(1, Math.round(Number(data.N)));
  const L = Number(data.distM);
  const sinTheta = x / Math.hypot(x, L);
  const beta = (Math.PI * a * sinTheta) / lambda;
  const gamma = (Math.PI * d * sinTheta) / lambda;
  const env = Math.abs(beta) < 1e-10 ? 1 : (Math.sin(beta) / beta) ** 2;
  if (N <= 1) return env;
  const den = Math.sin(gamma);
  const interference = Math.abs(gamma) < 1e-10 || Math.abs(den) < 1e-14
    ? 1
    : (Math.sin(N * gamma) / (N * den)) ** 2;
  return env * interference;
}

export function diffractionHalfSpan(data) {
  const lambda = Number(data.lambdaNm) * 1e-9;
  const a = Number(data.slitMm) * 1e-3;
  const d = Number(data.pitchMm) * 1e-3;
  const L = Number(data.distM);
  const N = Math.max(1, Math.round(Number(data.N)));
  const env = (lambda * L / a) * 3.2;
  const fringes = (lambda * L / d) * Math.min(12, 2 + N * 2);
  return Math.min(0.15, Math.max(0.01, Math.max(env, fringes)));
}

export function createHandlers(ctx) {
  const {
    state, equipment, toast, pushHud, setStep, currentStep,
  } = ctx;
  let directManipulation = null;

  function initData(expId) {
    directManipulation = null;
    if (expId === 'multi_slit_diffraction') {
      return {
        mode: 'diffraction',
        lightOn: true,
        preset: 'double',
        ...DIFF_PRESETS.double,
        showBeam: true,
        showWave: true,
        demoOn: false,
        demoPhase: 0,
        demoElapsed: 0,
        chartOpen: false,
        records: [],
        completed: false,
        _hudThrottle: 0,
        dragArmed: false,
      };
    }
    return {};
  }

  function syncDiffraction(data, refresh = true) {
    data.lambdaNm = clamp(Number(data.lambdaNm || 550), 380, 780);
    data.slitMm = clamp(Number(data.slitMm || 0.05), 0.01, 0.4);
    data.pitchMm = clamp(Number(data.pitchMm || 0.25), 0.02, 1);
    data.N = clamp(Math.round(Number(data.N || 2)), 1, 12);
    data.distM = clamp(Number(data.distM || 1), 0.4, 2);
    if (data.pitchMm <= data.slitMm) {
      data.pitchMm = Math.min(1, data.slitMm + 0.01);
    }
    const lambda = data.lambdaNm * 1e-9;
    const a = data.slitMm * 1e-3;
    const d = data.pitchMm * 1e-3;
    data.fringeSpacingMm = (lambda * data.distM / d) * 1e3;
    data.centralWidthMm = (2 * lambda * data.distM / a) * 1e3;
    data.principalHalfWidthMm = (lambda * data.distM / (data.N * d)) * 1e3;
    const aperture = Math.max(a, (data.N - 1) * d + a);
    data.fresnel = (aperture * aperture) / (lambda * data.distM);
    data.farField = data.fresnel < 0.15;
    data.halfSpanMm = diffractionHalfSpan(data) * 1e3;
    equipment.optics?.updateOptics?.(data);
    if (refresh) pushHud();
  }

  function applyVisualDefaults(expId) {
    if (!equipment.optics) return;
    equipment.optics.clearIdentifyVisuals?.();
    equipment.optics.setMode?.('diffraction');
    if (expId === 'multi_slit_diffraction') syncDiffraction(state.data, false);
  }

  function armDrag(kind, value) {
    const data = state.data;
    data.dragArmed = true;
    data.dragging = false;
    data.holdAccum = 0;
    data.dragKind = kind;
    data.dragStartValue = Number(value || 0);
    data.dragStartMouseX = Number(equipment.optics?.mouseDrag?.movementX || 0);
  }

  function onUiAction(action, payload = {}) {
    const eid = state.expId;
    const data = state.data;

    if (eid !== 'multi_slit_diffraction') return false;

    if (action === 'optics-diff-power') {
      data.lightOn = !data.lightOn;
      if (data.lightOn && currentStep()?.id === 'setup') setStep('observe');
      toast(data.lightOn ? '激光器已打开' : '激光器已关闭');
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-preset') {
      const key = payload.preset || 'double';
      const preset = DIFF_PRESETS[key] || DIFF_PRESETS.double;
      Object.assign(data, preset, { preset: key, lightOn: true, chartOpen: false, demoOn: false });
      setStep('observe');
      toast(`已切换：${{ single: '单缝', double: '双缝', triple: '三缝', multi: '六缝', grating: '十缝光栅', hene2: 'He-Ne 双缝' }[key] || key}`);
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-param') {
      const key = payload.key;
      const ranges = {
        lambdaNm: [380, 780], slitMm: [0.01, 0.4], pitchMm: [0.02, 1], N: [1, 12], distM: [0.4, 2],
      };
      if (!ranges[key]) return false;
      const next = payload.value != null
        ? Number(payload.value)
        : Number(data[key]) + Number(payload.delta || 0);
      data[key] = clamp(key === 'N' ? Math.round(next) : next, ...ranges[key]);
      data.preset = 'custom';
      data.demoOn = false;
      if (currentStep()?.id === 'setup') setStep('observe');
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-toggle') {
      const key = payload.key;
      if (key === 'showBeam' || key === 'showWave') data[key] = !data[key];
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-demo') {
      data.demoOn = !data.demoOn;
      data.demoElapsed = 0;
      toast(data.demoOn ? '自动扫频：430–680 nm' : '自动扫频已停止');
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-record') {
      syncDiffraction(data, false);
      const record = {
        lambdaNm: data.lambdaNm,
        slitMm: data.slitMm,
        pitchMm: data.pitchMm,
        N: data.N,
        distM: data.distM,
        fringeSpacingMm: data.fringeSpacingMm,
        centralWidthMm: data.centralWidthMm,
        fresnel: data.fresnel,
      };
      data.records.push(record);
      setStep('measure');
      toast(`已记录第 ${data.records.length} 组：Δx≈${data.fringeSpacingMm.toFixed(3)} mm`);
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-clear') {
      data.records = [];
      data.chartOpen = false;
      toast('测量记录已清空');
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-chart') {
      data.chartOpen = !data.chartOpen;
      if (data.chartOpen) setStep('curve');
      syncDiffraction(data);
      return true;
    }
    if (action === 'optics-diff-complete') {
      if (!data.records.length) {
        toast('请先记录至少一组参数');
        return true;
      }
      data.completed = true;
      state.stepIndex = 4;
      toast(`实验完成：已保存 ${data.records.length} 组可复现实验配置`);
      syncDiffraction(data);
      return true;
    }
    return false;
  }

  function interact(target, _t, step) {
    if (!step || state.expId !== 'multi_slit_diffraction') return false;
    const role = target?.userData?.role;
    const data = state.data;

    if (role === 'diff_source') return onUiAction('optics-diff-power');
    if (role === 'diff_screen') {
      armDrag('distM', data.distM);
      toast('拖动观察屏：调节缝屏距 L');
      return true;
    }
    if (role === 'diff_slit') {
      toast('滚轮调节缝宽 a；在全息屏可调缝数与缝距');
      return true;
    }
    if (role === 'ui_action' || role === 'generic') {
      if (step.id === 'setup') return onUiAction('optics-diff-power');
      if (step.id === 'curve') return onUiAction('optics-diff-chart');
      if (step.id === 'result') return onUiAction('optics-diff-complete');
      return onUiAction('optics-diff-record');
    }
    return false;
  }

  function onKey(code) {
    if (state.expId !== 'multi_slit_diffraction') return false;
    if (code === 'KeyL') return onUiAction('optics-diff-power');
    if (code === 'KeyR' || code === 'KeyF') return onUiAction('optics-diff-record');
    if (code === 'KeyC') return onUiAction('optics-diff-chart');
    return false;
  }

  function onWheel(delta, target) {
    if (state.expId !== 'multi_slit_diffraction') return false;
    const sign = delta > 0 ? -1 : 1;
    const role = target?.userData?.role;
    if (role === 'diff_source') {
      return onUiAction('optics-diff-param', { key: 'lambdaNm', delta: sign * 2 });
    }
    if (role === 'diff_screen') {
      return onUiAction('optics-diff-param', { key: 'distM', delta: sign * 0.02 });
    }
    if (role === 'diff_slit') {
      return onUiAction('optics-diff-param', { key: 'slitMm', delta: sign * 0.002 });
    }
    return onUiAction('optics-diff-param', { key: 'pitchMm', delta: sign * 0.005 });
  }

  function holdInteract(holding, _t, dt) {
    const data = state.data;
    if (!data?.dragArmed || state.expId !== 'multi_slit_diffraction') return;
    if (holding) {
      data.holdAccum = (data.holdAccum || 0) + dt;
      if (!data.dragging && data.holdAccum > 0.08) data.dragging = true;
      if (!data.dragging) return;
      const mouseX = Number(equipment.optics?.mouseDrag?.movementX || 0);
      const deltaPx = mouseX - Number(data.dragStartMouseX || 0);
      const kind = data.dragKind;
      const start = Number(data.dragStartValue || 0);
      if (kind === 'distM') {
        data.distM = clamp(start + deltaPx * 0.003, 0.4, 2);
        data.preset = 'custom';
        syncDiffraction(data, false);
      }
      return;
    }
    const moved = !!data.dragging;
    data.dragArmed = false;
    data.dragging = false;
    data.holdAccum = 0;
    data.dragKind = null;
    if (!moved) return;
    syncDiffraction(data);
    toast(`缝屏距 L=${data.distM.toFixed(2)} m`);
  }

  function beginManipulation(target, context = {}) {
    if (state.expId !== 'multi_slit_diffraction') return false;
    const role = target?.userData?.role;
    const keyByRole = {
      diff_source: 'lambdaNm',
      diff_screen: 'distM',
      diff_slit: 'slitMm',
    };
    const key = keyByRole[role];
    if (!key) return interact(target, context.time || 0, currentStep());
    directManipulation = {
      role,
      key,
      start: Number(state.data[key]),
      dragged: false,
    };
    if (role === 'diff_source') toast('短捏合开关激光；水平拖动调节波长');
    if (role === 'diff_screen') toast('水平拖动观察屏，调节缝屏距 L');
    if (role === 'diff_slit') toast('水平拖动狭缝，调节缝宽 a');
    return true;
  }

  function updateManipulation(_target, context = {}) {
    if (!directManipulation || !context.dragged) return !!directManipulation;
    directManipulation.dragged = true;
    const totalX = Number(context.totalX || 0);
    const sensitivities = { lambdaNm: 0.4, distM: 0.003, slitMm: 0.0005 };
    return onUiAction('optics-diff-param', {
      key: directManipulation.key,
      value: directManipulation.start + totalX * sensitivities[directManipulation.key],
    });
  }

  function endManipulation(target, context = {}) {
    if (!directManipulation) return false;
    const direct = directManipulation;
    directManipulation = null;
    if (context.cancelled) return true;
    if (!context.dragged && direct.role === 'diff_source') {
      return onUiAction('optics-diff-power');
    }
    if (!context.dragged) return true;
    const labels = {
      lambdaNm: `波长 λ=${state.data.lambdaNm.toFixed(0)} nm`,
      distM: `缝屏距 L=${state.data.distM.toFixed(2)} m`,
      slitMm: `缝宽 a=${state.data.slitMm.toFixed(3)} mm`,
    };
    syncDiffraction(state.data);
    toast(labels[direct.key] || '调节完成');
    return true;
  }

  function onFocus() {
    /* 光学不以「识别框」为主 */
  }

  function update(_t, dt) {
    if (!state.data || state.expId !== 'multi_slit_diffraction') return state.data;
    const data = state.data;
    syncDiffraction(data, false);
    if (data.demoOn) {
      data.demoElapsed = (data.demoElapsed || 0) + dt;
      if (data.demoElapsed >= 0.08) {
        data.demoElapsed = 0;
        data.demoPhase = (data.demoPhase || 0) + 0.06;
        data.lambdaNm = Math.round(555 + 125 * Math.sin(data.demoPhase));
        data.preset = 'custom';
        syncDiffraction(data, false);
      }
    }
    data._hudThrottle = (data._hudThrottle || 0) + dt;
    if (data._hudThrottle > 0.4) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }

  function cleanup() {
    equipment.optics?.clearIdentifyVisuals?.();
    equipment.optics?.setMode?.('idle');
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
