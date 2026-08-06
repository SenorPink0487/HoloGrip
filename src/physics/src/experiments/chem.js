/**
 * Chemistry station handlers — same interaction contract as thermo:
 *   interact(role) / beginManipulation / endManipulation / holdInteract / onUiAction / onKey
 */

import { getReagent, getElement } from '../chem/reagentCatalog.js';

export const station = {
  id: 'chem',
  title: '化学实验台',
  accent: '#94a3b8',
  experiments: [
    {
      id: 'reagent-mix',
      name: '试剂混合与结构',
      goal: '选元素→选试剂→装入烧杯→倾倒混合→查看成分 3D 结构',
      theory: '试剂可倾倒混合；点击右侧成分可在桌上查看分子结构',
      steps: [
        { id: 'pick_cup', text: '点击烧杯打开元素周期表', hint: '瞄准烧杯按 E 或点击' },
        { id: 'fill', text: '选择元素与常见试剂装入烧杯', hint: '在前方悬浮屏中点选' },
        { id: 'pour', text: '拖动烧杯向另一杯倾倒混合', hint: '按住拖到另一杯松开' },
        { id: 'inspect', text: '在右侧面板查看成分并显示 3D 结构', hint: '点击成分行' },
      ],
    },
  ],
};

function snapshotCups(eq) {
  const s = eq?.getCupState?.();
  if (!s) {
    return {
      cupA: { reagents: [], fill: 0, color: 0x94a3b8, formula: '' },
      cupB: { reagents: [], fill: 0, color: 0x94a3b8, formula: '' },
    };
  }
  return { cupA: s.A, cupB: s.B };
}

function buildComponents(data) {
  const map = new Map();
  for (const cup of [data.cupA, data.cupB]) {
    for (const r of cup?.reagents || []) {
      if (!map.has(r.id)) map.set(r.id, { ...r });
    }
  }
  return [...map.values()];
}

function roleToKind(role) {
  if (role === 'chem_cup_a') return 'A';
  if (role === 'chem_cup_b') return 'B';
  return null;
}

export function createHandlers(ctx) {
  const { state, equipment, toast, pushHud, setStep, currentStep } = ctx;

  function eq() {
    return equipment.chem;
  }

  function syncFromRig() {
    const cups = snapshotCups(eq());
    state.data.cupA = cups.cupA;
    state.data.cupB = cups.cupB;
    state.data.components = buildComponents(state.data);
    pushHud();
  }

  function openPickerForCup(kind) {
    const k = kind === 'B' ? 'B' : 'A';
    state.data.activeCup = k;
    state.data.pickerOpen = true;
    state.data.pickerPhase = 'elements';
    state.data.pickedElement = null;
    setStep('pick_cup');
    toast(`烧杯 ${k} · 选择元素`);
    pushHud();
    return true;
  }

  function pourBetween(from, to) {
    const e = eq();
    if (!e) return false;
    const cups = e.getCupState?.() || {};
    if ((cups[from]?.fill || 0) <= 0.02) {
      toast(`烧杯 ${from} 为空 · 先装入试剂`);
      openPickerForCup(from);
      return true;
    }
    const ok = e.pour?.(from, to) || e.startPour?.(from, to);
    if (!ok) {
      toast('无法倾倒');
      return false;
    }
    // Poll pour completion briefly then sync (rig owns animation).
    const started = performance.now();
    const poll = () => {
      if (e.rig?.pour || e.pour) {
        if (performance.now() - started < 2500) {
          requestAnimationFrame(poll);
          return;
        }
      }
      syncFromRig();
      state.data.hint = '混合完成 · 在右侧查看成分并显示 3D 结构';
      setStep('inspect');
      toast('试剂已倾倒混合');
      pushHud();
    };
    requestAnimationFrame(poll);
    setStep('pour');
    toast(`烧杯 ${from} → ${to}`);
    return true;
  }

  return {
    initData() {
      return {
        activeCup: 'A',
        pickerOpen: false,
        pickerPhase: 'elements',
        pickedElement: null,
        selectedComponentId: null,
        cupA: { reagents: [], fill: 0, color: 0x94a3b8, formula: '' },
        cupB: { reagents: [], fill: 0, color: 0x94a3b8, formula: '' },
        components: [],
        dragging: null,
        hint: '瞄准烧杯按 E / 点击选择试剂 · 拖到另一杯倾倒',
        completed: false,
      };
    },

    applyVisualDefaults(expId) {
      // Same as thermo: equipment owns apparatus mode.
      eq()?.setMode?.(expId || 'reagent-mix');
      eq()?.showcase?.();
      eq()?.getPickSet?.();
    },

    cleanup() {},

    /**
     * Thermo pattern: interact(target, t, step) reads userData.role.
     * Cup click / E → open periodic picker (primary action).
     */
    interact(target, _t, step) {
      const role = target?.userData?.role;
      const kind = roleToKind(role);
      if (kind) return openPickerForCup(kind);

      if (role === 'ui_action' || role === 'generic') {
        const sid = step?.id;
        if (sid === 'pick_cup' || sid === 'fill') {
          return openPickerForCup(state.data.activeCup || 'A');
        }
        if (sid === 'pour') {
          const from = state.data.activeCup === 'B' ? 'B' : 'A';
          const to = from === 'A' ? 'B' : 'A';
          return pourBetween(from, to);
        }
        return openPickerForCup(state.data.activeCup || 'A');
      }
      return false;
    },

    /**
     * Thermo pattern: arm drag role only — no heavy work on pointerdown.
     */
    beginManipulation(target) {
      const role = target?.userData?.role;
      if (role !== 'chem_cup_a' && role !== 'chem_cup_b') return false;
      state.data.dragging = role;
      const kind = roleToKind(role);
      state.data.activeCup = kind;
      // Visual lift (optional, like calorimetry drag); ignore failure.
      try { eq()?.beginDrag?.(kind, null, null); } catch { /* ignore */ }
      return true;
    },

    updateManipulation(_target, context = {}) {
      if (!state.data.dragging) return false;
      const kind = roleToKind(state.data.dragging);
      if (!kind) return false;
      const ray = context.raycaster;
      const root = eq()?.rig?.root;
      if (ray && root) {
        const hits = ray.intersectObject(root, true);
        if (hits[0]) {
          const p = hits[0].point.clone();
          root.worldToLocal(p);
          eq()?.updateDrag?.(p.x, p.z);
          return true;
        }
      }
      return false;
    },

    /**
     * Thermo pattern: commit on release.
     * Near other cup → pour; otherwise open picker (click).
     */
    endManipulation() {
      const role = state.data?.dragging;
      state.data.dragging = null;
      if (!role) return false;
      const kind = roleToKind(role);
      if (!kind) return false;

      const result = eq()?.endDrag?.() || { poured: false };
      if (result.poured) {
        syncFromRig();
        state.data.hint = '混合完成 · 在右侧查看成分并显示 3D 结构';
        setStep('inspect');
        toast('试剂已倾倒混合');
        pushHud();
        return true;
      }
      // Click / release without pour → open picker (primary chem action).
      return openPickerForCup(kind);
    },

    holdInteract(holding) {
      // Thermo: release clears armed drag.
      if (!holding && state.data?.dragging) this.endManipulation();
    },

    onKey(code) {
      if (code === 'KeyR') return this.onUiAction('chem-reset');
      if (code !== 'KeyE') return false;
      const step = currentStep?.() || null;
      return this.interact({ userData: { role: 'ui_action' } }, 0, step);
    },

    onUiAction(action, payload = {}) {
      const d = state.data;
      if (!d) return false;

      switch (action) {
        case 'chem-select-cup':
          return openPickerForCup(payload.cup === 'B' ? 'B' : 'A');
        case 'chem-close-picker':
          d.pickerOpen = false;
          pushHud();
          return true;
        case 'chem-picker-back':
          d.pickerPhase = 'elements';
          d.pickedElement = null;
          pushHud();
          return true;
        case 'chem-pick-element': {
          const el = getElement(payload.element);
          if (!el) return false;
          d.pickedElement = el.symbol;
          d.pickerPhase = 'reagents';
          toast(`${el.symbol} · ${el.name_zh}`);
          setStep('fill');
          pushHud();
          return true;
        }
        case 'chem-pick-reagent': {
          const reagent = getReagent(payload.reagentId);
          if (!reagent) return false;
          const cup = d.activeCup === 'B' ? 'B' : 'A';
          eq()?.assignReagent?.(cup, reagent);
          syncFromRig();
          d.pickerOpen = false;
          d.hint = `已装入 ${reagent.formula} · 拖向另一杯倾倒或按 E`;
          toast(`${reagent.formula} → 烧杯 ${cup}`);
          setStep('pour');
          pushHud();
          return true;
        }
        case 'chem-reset': {
          eq()?.resetAll?.();
          eq()?.reset?.(state.expId);
          Object.assign(d, this.initData());
          eq()?.setMode?.(state.expId || 'reagent-mix');
          toast('实验台已重置');
          pushHud();
          return true;
        }
        case 'chem-show-component': {
          const id = payload.componentId;
          const comp = (d.components || []).find((c) => c.id === id);
          if (!comp) return false;
          d.selectedComponentId = id;
          setStep('inspect');
          void loadAndShowMolecule(eq(), comp, toast);
          pushHud();
          return true;
        }
        case 'chem-pour-a-to-b':
          return pourBetween('A', 'B');
        case 'chem-pour-b-to-a':
          return pourBetween('B', 'A');
        default:
          return false;
      }
    },

    update() {
      // no continuous sim; pour animation is rig-owned
    },
  };
}

async function loadAndShowMolecule(equipment, comp, toast) {
  if (!equipment || !comp) return;
  toast?.(`加载 ${comp.formula || comp.name_zh} 结构…`);
  try {
    const { lookupMolecule } = await import('../../../chem/src/pubchem.js');
    const query = comp.query || comp.formula || comp.name_zh;
    const mol = await lookupMolecule(query);
    const sdf = mol?.sdf || mol?.mol || '';
    equipment.showMoleculeFromSdf?.(sdf || null, comp.formula);
    toast?.(sdf ? `已显示 ${comp.formula || comp.name_zh}` : `示意模型 · ${comp.formula || ''}`);
  } catch (err) {
    console.warn('[chem] molecule load failed', err);
    equipment.showMoleculeFromSdf?.(null, comp.formula);
    toast?.(`结构加载失败 · ${comp.formula || ''}`);
  }
}
