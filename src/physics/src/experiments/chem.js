/**
 * Chemistry station handlers — same interaction contract as thermo:
 *   interact(role) / beginManipulation / endManipulation / holdInteract / onUiAction / onKey
 */

import { getReagent, getElement } from '../chem/reagentCatalog.js';
import {
  showReagentSearchDock,
  hideReagentSearchDock,
  setReagentSearchHandler,
  setReagentSearchStatus,
  setReagentSearchBusy,
  setReagentSearchValue,
} from '../chem/reagentSearchDock.js';
import * as THREE from 'three';

const _invMat = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _vertPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.15);
const _hitPoint = new THREE.Vector3();

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
    toast(`烧杯 ${k} · 选择元素或下方输入检索`);
    pushHud();
    // Real HTML input (canvas holos cannot type). Unlock pointer focus for typing.
    try { document.exitPointerLock?.(); } catch { /* ignore */ }
    showReagentSearchDock({ activeCup: k });
    return true;
  }

  function closePicker() {
    state.data.pickerOpen = false;
    hideReagentSearchDock();
    pushHud();
    return true;
  }

  /**
   * Original HoloChem AI path: DeepSeek resolve + PubChem SDF, then fill active cup.
   */
  async function runAiReagentQuery(query, condition = '') {
    const cup = state.data.activeCup === 'B' ? 'B' : 'A';
    setReagentSearchBusy(true);
    setReagentSearchStatus('AI 正在解析…');
    toast('AI 解析中…');
    try {
      const { lookupMolecule } = await import('../../../chem/src/pubchem.js');
      const product = await lookupMolecule(query, {
        condition: condition || '',
        onStatus: (msg) => setReagentSearchStatus(String(msg || '')),
      });

      const comps = Array.isArray(product?.components) ? product.components : [];
      const primary = comps[0] || null;
      const formula = primary?.formula
        || product?.formula
        || product?.product_zh
        || query;
      const nameZh = primary?.name_zh
        || product?.product_zh
        || formula;
      const queryKey = primary?.query
        || primary?.formula
        || primary?.name_zh
        || formula
        || query;

      // Build a cup reagent entry (catalog-compatible shape)
      const reagent = {
        id: `ai-${Date.now().toString(36)}`,
        formula: String(formula),
        name_zh: String(nameZh),
        color: colorForFormula(String(formula)),
        query: String(queryKey),
        element: String(formula).replace(/[^A-Za-z].*$/, '') || 'C',
        ai: true,
      };

      eq()?.assignReagent?.(cup, reagent);

      // Map AI components into right-panel list + optional molecule show
      const mapped = comps.length
        ? comps.map((c, i) => ({
          id: c.id || `comp-${i}-${String(c.formula || c.name_zh || i)}`,
          formula: c.formula || c.name_zh || `成分${i + 1}`,
          name_zh: c.name_zh || c.formula || '',
          color: colorForFormula(String(c.formula || c.name_zh || '')),
          query: c.query || c.formula || c.name_zh || '',
          percent: c.percent,
        }))
        : [{ ...reagent }];

      // Merge into cup state components for right holo
      syncFromRig();
      const existing = state.data.components || [];
      const byId = new Map(existing.map((c) => [c.id, c]));
      mapped.forEach((c) => byId.set(c.id, c));
      state.data.components = [...byId.values()];
      state.data.hint = `已装入 ${reagent.formula}（AI）· 可倾倒或点右侧成分看 3D`;
      state.data.pickerOpen = false;
      hideReagentSearchDock();
      setStep('pour');
      pushHud();

      // Auto-show primary structure with original 3Dmol panel
      const showComp = mapped[0];
      if (showComp) {
        state.data.selectedComponentId = showComp.id;
        void loadAndShowMolecule(eq(), showComp, toast);
      }

      setReagentSearchStatus(`已装入 ${reagent.formula}`, 'ok');
      toast(`${reagent.formula} → 烧杯 ${cup}`);
      setReagentSearchValue('');
      return true;
    } catch (err) {
      console.warn('[chem] AI query failed', err);
      const msg = err?.message || 'AI 解析失败';
      setReagentSearchStatus(msg, 'error');
      toast(msg);
      return false;
    } finally {
      setReagentSearchBusy(false);
    }
  }

  // Wire dock once per handler instance
  setReagentSearchHandler((query, condition) => runAiReagentQuery(query, condition));

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
        dragStartTime: 0,
        dragLifted: false,
        hint: '点击烧杯选择试剂 · 长按或拖动烧杯向另一杯倾倒',
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
     * Cup click / E → open periodic picker (primary action).
     */
    /**
     * Cup click / E → open periodic picker only if clicking black label bar.
     */
    interact(target, _t, step) {
      const role = target?.userData?.role;
      const isLabel = target?.userData?.isLabel || role === 'chem_cup_a_label' || role === 'chem_cup_b_label';
      const kind = roleToKind(role);
      if (kind && isLabel) return openPickerForCup(kind);

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
     * Arm drag role — black label bar opens picker; beaker body drags/pours.
     */
    beginManipulation(target) {
      const role = target?.userData?.role;
      const isLabel = target?.userData?.isLabel || role === 'chem_cup_a_label' || role === 'chem_cup_b_label';
      const kind = roleToKind(role);
      if (!kind) return false;

      // Click on black label bar (A/B) -> open selection panel immediately
      if (isLabel) {
        state.data.dragging = null;
        return openPickerForCup(kind);
      }

      if (role !== 'chem_cup_a' && role !== 'chem_cup_b') return false;

      state.data.dragging = role;
      state.data.dragStartTime = performance.now();
      state.data.dragLifted = false;
      state.data.dragStartX = null;
      state.data.dragStartZ = null;
      state.data.activeCup = kind;
      return true;
    },

    updateManipulation(_target, context = {}) {
      if (!state.data.dragging) return false;
      const kind = roleToKind(state.data.dragging);
      if (!kind) return false;

      const raycaster = context.raycaster;
      const root = eq()?.rig?.root;
      if (raycaster && root) {
        root.updateWorldMatrix?.(true, false);
        const invMat = _invMat.copy(root.matrixWorld).invert();
        const localRay = _localRay.copy(raycaster.ray).applyMatrix4(invMat);
        const hitPoint = _hitPoint;
        if (localRay.intersectPlane(_vertPlane, hitPoint)) {
          if (state.data.dragStartX == null) {
            state.data.dragStartX = hitPoint.x;
            state.data.dragStartY = hitPoint.y;
            try { eq()?.beginDrag?.(kind, null, hitPoint); } catch { /* ignore */ }
          }

          const dist = Math.hypot(hitPoint.x - state.data.dragStartX, hitPoint.y - state.data.dragStartY);
          const duration = performance.now() - Number(state.data.dragStartTime || 0);

          // Only lift beaker if dragged significantly (>0.04 units) or held and moved (>0.015 units after 200ms)
          if (!state.data.dragLifted && (dist > 0.04 || (dist > 0.015 && duration > 200))) {
            state.data.dragLifted = true;
            if (state.data.pickerOpen) {
              closePicker();
            }
          }

          if (state.data.dragLifted) {
            eq()?.updateDrag?.(hitPoint.x, hitPoint.y);
          }
          return true;
        }
      }
      return false;
    },

    /**
     * Release: if dragged (lifted), attempt pour or snap home.
     * If click on beaker body, do not open picker panel.
     */
    endManipulation() {
      const role = state.data?.dragging;
      const lifted = !!state.data?.dragLifted;
      state.data.dragging = null;
      state.data.dragLifted = false;
      state.data.dragStartX = null;
      state.data.dragStartZ = null;
      if (!role) return false;

      // If beaker was actually lifted/dragged across the desk -> pour or snap home
      if (lifted) {
        const result = eq()?.endDrag?.() || { poured: false };
        if (result.poured) {
          syncFromRig();
          state.data.hint = '混合完成 · 在右侧查看成分并显示 3D 结构';
          setStep('inspect');
          toast('试剂已倾倒混合');
          pushHud();
          return true;
        }
        return true;
      }

      // Click on beaker body (not label bar) -> just relax beaker, do not open selection panel
      try { eq()?.endDrag?.(); } catch { /* ignore */ }
      return true;
    },

    holdInteract(holding) {
      if (holding && state.data?.dragging && !state.data?.dragLifted) {
        const kind = roleToKind(state.data.dragging);
        if (kind) {
          state.data.dragLifted = true;
          try { eq()?.beginDrag?.(kind, null, null); } catch { /* ignore */ }
        }
      }
      if (!holding && state.data?.dragging) this.endManipulation();
    },

    onKey(code) {
      if (code === 'Escape') {
        if (state.data?.pickerOpen) {
          return this.onUiAction('chem-close-picker');
        }
      }
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
          d.pickedElement = null;
          d.pickerPhase = 'elements';
          return closePicker();
        case 'chem-picker-back':
          d.pickerPhase = 'elements';
          d.pickedElement = null;
          showReagentSearchDock({ activeCup: d.activeCup || 'A', keepStatus: true });
          pushHud();
          return true;
        case 'chem-ai-search': {
          const q = String(payload.query || payload.q || '').trim();
          if (!q) {
            toast('请输入要检索的物质');
            return false;
          }
          void runAiReagentQuery(q, payload.condition || '');
          return true;
        }
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
          hideReagentSearchDock();
          d.hint = `已装入 ${reagent.formula} · 拖向另一杯倾倒或按 E`;
          toast(`${reagent.formula} → 烧杯 ${cup}`);
          setStep('pour');
          // Show 3D with original AI/PubChem path
          void loadAndShowMolecule(eq(), {
            id: reagent.id,
            formula: reagent.formula,
            name_zh: reagent.name_zh,
            query: reagent.query || reagent.formula,
            color: reagent.color,
          }, toast);
          pushHud();
          return true;
        }
        case 'chem-reset': {
          eq()?.resetAll?.();
          eq()?.reset?.(state.expId);
          Object.assign(d, this.initData());
          eq()?.setMode?.(state.expId || 'reagent-mix');
          hideReagentSearchDock();
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

function colorForFormula(formula) {
  const f = String(formula || '').toUpperCase();
  if (f.includes('CU')) return 0x2563eb;
  if (f.includes('FE')) return 0xea580c;
  if (f.includes('KMN') || f.includes('MNO4')) return 0xa21caf;
  if (f.includes('CL') || f.includes('HCL')) return 0xfbbf24;
  if (f.includes('OH') || f.includes('NAOH')) return 0x86efac;
  if (f.includes('H2O') || f === 'WATER') return 0x38bdf8;
  if (f.includes('SO4')) return 0xf59e0b;
  if (f.includes('NO3')) return 0xfb7185;
  if (f.includes('C')) return 0x64748b;
  // stable hash → soft pastel
  let h = 0;
  for (let i = 0; i < f.length; i += 1) h = (h * 31 + f.charCodeAt(i)) >>> 0;
  const r = 80 + (h & 0x7f);
  const g = 100 + ((h >> 8) & 0x7f);
  const b = 140 + ((h >> 16) & 0x7f);
  return (r << 16) | (g << 8) | b;
}

async function loadAndShowMolecule(equipment, comp, toast) {
  if (!equipment || !comp) return;
  toast?.(`加载 ${comp.formula || comp.name_zh} 结构…`);
  try {
    const { lookupMolecule } = await import('../../../chem/src/pubchem.js');
    const query = comp.query || comp.formula || comp.name_zh;
    const mol = await lookupMolecule(query);
    // lookupMolecule may return product with components; prefer first component sdf
    let sdf = mol?.sdf || mol?.mol || '';
    if (!sdf && Array.isArray(mol?.components) && mol.components[0]) {
      const c0 = mol.components[0];
      const sub = await lookupMolecule(c0.query || c0.formula || c0.name_zh || query);
      sdf = sub?.sdf || sub?.mol || '';
    }
    equipment.showMoleculeFromSdf?.(sdf || null, comp.formula || comp.name_zh);
    toast?.(sdf ? `已显示 ${comp.formula || comp.name_zh}` : `示意模型 · ${comp.formula || ''}`);
  } catch (err) {
    console.warn('[chem] molecule load failed', err);
    equipment.showMoleculeFromSdf?.(null, comp.formula);
    toast?.(`结构加载失败 · ${comp.formula || ''}`);
  }
}
