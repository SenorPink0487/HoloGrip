/**
 * 电磁学实验台 — 霍尔效应测磁
 */

export const station = {
  id: 'electro',
  title: '电磁学实验台',
  accent: '#ec4899',
  experiments: [
    {
      id: 'hall_effect',
      name: '霍尔效应测磁',
      goal: '调节励磁与霍尔电流，扫描探头位置并比较亥姆霍兹线圈和长螺线管的磁场分布',
      theory: 'V_H = K_H I_s B；轴线上 B 随探头位置、线圈间距与螺线管匝数变化',
      steps: [
        { id: 'identify', text: '认识器材：线圈、霍尔探头与 HCC-2 测磁仪', hint: '在全息屏查看器材说明，确认后进入实验配置' },
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
  ],
};

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
    return {};
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


  function refreshHallIdentifyVisuals(hoverRole) {
    const data = state.data;
    if (state.expId !== 'hall_effect' || currentStep()?.id !== 'identify') return;
    HALL_PART_ROLES.forEach((role) => {
      let mode = 'off';
      if (data.identified?.[role]) mode = 'done';
      else if (hoverRole === role) mode = 'hover';
      equipment.electro?.setHallPartState?.(role, mode);
    });
    data._hoverRole = hoverRole || null;
  }


  function identifyHallRole(role) {
    const data = state.data;
    const name = HALL_PART_NAMES[role];
    if (!name || !data.identified) return false;
    if (data.identified[role]) {
      toast(`已识别过：${name}（绿框为已完成）`);
      refreshHallIdentifyVisuals(role);
      return true;
    }
    data.identified[role] = true;
    const remaining = remainingHallParts(data);
    if (!remaining.length) {
      equipment.electro?.clearHallIdentifyVisuals?.();
      advanceStep();
      toast(`✓ 已识别：${name}。器材认识完成，请到全息屏选择测量对象`);
    } else {
      toast(`✓ 已识别：${name}。还需：${remaining.map((item) => HALL_PART_NAMES[item]).join('、')}`);
      refreshHallIdentifyVisuals(role);
    }
    pushHud();
    return true;
  }


  function identifyHallWrong(role) {
    const remaining = remainingHallParts(state.data);
    const wrong = role === 'ui_action' ? '面板按钮' : '该位置';
    toast(`选错了：「${wrong}」不是待识别目标。请瞄准：${remaining.map((item) => HALL_PART_NAMES[item]).join('、')}`);
    refreshHallIdentifyVisuals(state.data._hoverRole);
    pushHud();
    return true;
  }


  function applyVisualDefaults(expId) {
    if (expId === 'hall_effect' && equipment.electro) {
      equipment.electro.setMode?.('hall');
      syncHall(state.data, false);
      refreshHallIdentifyVisuals(null);
      return;
    }
    if (expId === 'hall_carrier_demo' && equipment.electro) {
      equipment.electro.setMode?.('hall-demo');
      syncHallDemo(state.data, false);
    }
  }



  function onUiAction(action, payload = {}) {
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
      const next = HALL_PART_ROLES.find((role) => !data.identified?.[role]);
      return next ? identifyHallRole(next) : true;
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
      syncHall(data);
      toast('霍尔测量记录已清空');
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
      if (HALL_PART_NAMES[role]) return identifyHallRole(role);
      if (role === 'ui_action') {
        const next = remainingHallParts(state.data)[0];
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

  function onWheel(delta, target) {
    if (state.expId !== 'hall_effect' || currentStep()?.id === 'identify') return false;
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

  function beginManipulation(target, context = {}) {
    return interact(target, context.time || 0, currentStep());
  }

  function updateManipulation(_target, context = {}) {
    if (state.expId !== 'hall_effect') return false;
    if (state.data.terminalDragFrom) {
      holdInteract(true, context.time || 0, context.dt || 0, context.hoverTarget);
      return true;
    }
    return !!state.data.hallDragArmed;
  }

  function endManipulation(_target, context = {}) {
    if (state.expId !== 'hall_effect') return false;
    const data = state.data;
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
