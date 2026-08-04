import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
  Sliders, RotateCcw, Eye, EyeOff,
  ChevronLeft, ChevronRight, Activity,
  Plus, Trash2, Sigma, AlertCircle, Crosshair, Keyboard
} from 'lucide-react';
import { tryCompile, findRoots, findExtrema, type CompiledExpression } from '../lib/mathExpression';
import { MathKeyboard } from './MathKeyboard';
import { useWhiteboardStore } from '../stores/whiteboardStore';
import { useSessionStore } from '../stores/sessionStore';

// ============================================================
// 数学空间限定: 函数图像有效定义域 [-300, 300]
// ============================================================
const MATH_SPACE_LIMIT = 300;
const MIN_SCALE = 1;       // 1 px / 单位 → 600px 画布可显示 ±300 全部范围
const MAX_SCALE = 1000;    // 高度放大极限

// ============================================================
// 类型定义
// ============================================================

type ObjectKind = 'function' | 'slider' | 'point';

/** 函数对象 (一条曲线) */
interface FunctionObject {
  id: string;
  kind: 'function';
  name: string;            // 例如 f, g
  source: string;          // 用户输入的表达式 (右边部分), 例如 "a*x^2 + b*x + c"
  visible: boolean;
  color: string;
  glowColor: string;
  compiled: CompiledExpression | null;
  error: string | null;
}

/** 滑动条参数对象 */
interface SliderObject {
  id: string;
  kind: 'slider';
  name: string;            // 单字母, 如 a, b, k
  value: number;
  min: number;
  max: number;
  step: number;
  visible: boolean;        // 是否在画布上展示对象
  color: string;
}

/** 自由点对象 */
interface PointObject {
  id: string;
  kind: 'point';
  name: string;            // 大写字母 A, B
  x: number;
  y: number;
  visible: boolean;
  color: string;
}

type GeoObject = FunctionObject | SliderObject | PointObject;

interface FeaturePoint {
  x: number;
  y: number;
  label: string;
  color: string;
  kind: 'root' | 'extremum' | 'intercept';
  ownerId: string;
}

// ============================================================
// 配色调色板 (沿用现有霓虹主题)
// ============================================================
const NEON_PALETTE = [
  { color: '#ffd700', glow: 'rgba(255, 215, 0, 0.45)' },   // 亮金
  { color: '#ff007f', glow: 'rgba(255, 0, 127, 0.45)' },   // 霓虹粉
  { color: '#00f2fe', glow: 'rgba(0, 242, 254, 0.45)' },   // 极光青
  { color: '#39ff14', glow: 'rgba(57, 255, 20, 0.45)' },   // 霓虹绿
  { color: '#ff6b00', glow: 'rgba(255, 107, 0, 0.45)' },   // 霓虹橙
  { color: '#b066ff', glow: 'rgba(176, 102, 255, 0.45)' }, // 霓虹紫
  { color: '#ff3366', glow: 'rgba(255, 51, 102, 0.45)' },  // 霓虹红
  { color: '#00ffaa', glow: 'rgba(0, 255, 170, 0.45)' },   // 薄荷
];

// 滑动条颜色 (柔和)
const SLIDER_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#fb923c'];
// 自由点颜色
const POINT_COLORS = ['#ec4899', '#22d3ee', '#fbbf24', '#a78bfa', '#34d399'];

// ============================================================
// 工具函数
// ============================================================

const FUNC_NAME_POOL = 'fghkpqrstuvw'.split('');
const SLIDER_NAME_POOL = 'abcdmnopq'.split('');
const POINT_NAME_POOL = 'ABCDEFGHIJK'.split('');

function nextAvailableName(pool: string[], used: Set<string>): string {
  for (const c of pool) if (!used.has(c)) return c;
  // 全部用完则加下标
  let i = 1;
  while (true) {
    for (const c of pool) {
      const candidate = `${c}${i}`;
      if (!used.has(candidate)) return candidate;
    }
    i++;
  }
}

function formatNum(n: number, digits = 2): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) < 1e-9) return '0';
  if (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4) return n.toExponential(2);
  return n.toFixed(digits);
}

/**
 * 把 ASCII 表达式美化为更接近教科书的数学符号显示。
 * 仅用于非编辑状态下的展示, 不影响内部解析。
 *  - "*"  →  "·"     (中圆点)
 *  - "/"  →  "÷"     (除号)
 *  - "-"  →  "−"     (Unicode 减号, 视觉一致)
 *  - "^2" →  "²", "^3" → "³", "^n" → 上标
 *  - "sqrt(...)" → "√(...)"
 *  - "abs(x)"    → "|x|"
 *  - "pi"        → "π"
 */
function prettifyExpression(src: string): string {
  if (!src) return '';
  let s = src;
  // sqrt(...) → √(...)
  s = s.replace(/\bsqrt\s*\(/g, '√(');
  // abs(...) → |...|  (一层不嵌套)
  s = s.replace(/\babs\s*\(([^()]*)\)/g, '|$1|');
  // pi → π
  s = s.replace(/\bpi\b/g, 'π');

  // 上标转换表
  const SUPS: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
    'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
    'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
    'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
    'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
    '·': '', // 上标内的 · 暂不显示
    '*': '', // ditto
  };

  /** 把一段字符串尝试转为上标; 任何字符无法转就返回 null */
  const toSup = (str: string): string | null => {
    let out = '';
    for (const ch of str) {
      if (ch in SUPS) out += SUPS[ch];
      else if (ch === ' ') out += ' ';
      else return null;
    }
    return out;
  };

  // ^(...) 整组括号转上标 (只在能完整转成功时使用)
  s = s.replace(/\^\(([^()]+)\)/g, (m, inner: string) => {
    const conv = toSup(inner);
    return conv !== null ? conv : m;
  });
  // ^单字符 (数字或字母)
  s = s.replace(/\^([0-9a-zA-Z+\-])/g, (m, ch: string) => SUPS[ch] ?? m);

  // * → ·
  s = s.replace(/\s*\*\s*/g, '·');
  // / → ÷  (两侧加空格)
  s = s.replace(/\s*\/\s*/g, ' ÷ ');
  // 全部 - → −  (Unicode minus, 视觉一致)
  s = s.replace(/-/g, '−');
  return s;
}

/** 根据当前缩放计算合适的网格间距 (使刻度永远在屏幕上不会过密或过疏) */
function calcGridStep(scale: number): { major: number; minor: number } {
  // scale = 像素/数学单位; 目标主刻度 ~70px
  const targetPx = 70;
  const rawStep = targetPx / scale;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const norm = rawStep / base;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  const major = nice * base;
  return { major, minor: major / 5 };
}

export type SerializedFunctionObject = Omit<FunctionObject, 'compiled'> | SliderObject | PointObject;

export interface FunctionExplorerState {
  objects: SerializedFunctionObject[];
  scale: number;
  origin: { x: number; y: number };
  showLabels: boolean;
  showFeaturePoints: boolean;
  showTrace: boolean;
}

export interface FunctionExplorerProps {
  embedded?: boolean;
  preview?: boolean;
  editorOnly?: boolean;
  initialState?: FunctionExplorerState;
  onStateChange?: (state: FunctionExplorerState) => void;
}

// ============================================================
// 主组件
// ============================================================

function createDefaultFunctionObjects(): GeoObject[] {
  const a: SliderObject = { id: 'sl_a', kind: 'slider', name: 'a', value: 1, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[0] };
  const b: SliderObject = { id: 'sl_b', kind: 'slider', name: 'b', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[1] };
  const c: SliderObject = { id: 'sl_c', kind: 'slider', name: 'c', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[2] };
  const fSrc = 'a*x^2 + b*x + c';
  const f: FunctionObject = {
    id: 'fn_f', kind: 'function', name: 'f', source: fSrc, visible: true,
    color: NEON_PALETTE[2].color, glowColor: NEON_PALETTE[2].glow,
    compiled: tryCompile(fSrc), error: null,
  };
  return [a, b, c, f];
}

function hydrateFunctionObjects(objects: SerializedFunctionObject[] | undefined): GeoObject[] {
  if (!objects?.length) return createDefaultFunctionObjects();
  return objects.map(object => object.kind === 'function'
    ? { ...object, compiled: tryCompile(object.source) }
    : { ...object });
}

function serializeFunctionObjects(objects: GeoObject[]): SerializedFunctionObject[] {
  return objects.map(object => {
    if (object.kind === 'function') {
      const { compiled: _compiled, ...serializable } = object;
      return serializable;
    }
    return { ...object };
  });
}

export function FunctionExplorer({ embedded = false, preview = false, editorOnly = false, initialState, onStateChange }: FunctionExplorerProps = {}) {
  const theme = useSessionStore(state => state.theme);
  const interactMode = useWhiteboardStore(state => state.interactMode);
  const isDark = theme === 'dark';

  // ---------- 侧栏 ----------
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // ---------- 对象列表 (代数视图) ----------
  const [objects, setObjects] = useState<GeoObject[]>(() => {
    if (initialState?.objects && initialState.objects.length > 0) {
      return initialState.objects.map(obj => {
        if (obj.kind === 'function') {
          return {
            ...obj,
            compiled: tryCompile(obj.source),
            error: null,
          };
        }
        return obj;
      });
    }
    // 启动示例: f(x) = a*x^2 + b*x + c, a=1 b=0 c=0
    const a: SliderObject = { id: 'sl_a', kind: 'slider', name: 'a', value: 1, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[0] };
    const b: SliderObject = { id: 'sl_b', kind: 'slider', name: 'b', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[1] };
    const c: SliderObject = { id: 'sl_c', kind: 'slider', name: 'c', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[2] };
    const fSrc = 'a*x^2 + b*x + c';
    const f: FunctionObject = {
      id: 'fn_f', kind: 'function', name: 'f', source: fSrc, visible: true,
      color: NEON_PALETTE[2].color, glowColor: NEON_PALETTE[2].glow,
      compiled: tryCompile(fSrc), error: null
    };
    return [a, b, c, f];
  });

  // 外部传入 initialState 动态同步
  const lastStateJsonRef = useRef<string>('');
  useEffect(() => {
    if (initialState?.objects && initialState.objects.length > 0) {
      const json = JSON.stringify(initialState.objects);
      if (json !== lastStateJsonRef.current) {
        lastStateJsonRef.current = json;
        setObjects(initialState.objects.map(obj => {
          if (obj.kind === 'function') {
            return {
              ...obj,
              compiled: tryCompile(obj.source),
              error: null,
            };
          }
          return obj;
        }));
      }
    }
  }, [initialState]);

  // ---------- 表达式输入栏 ----------
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------- 编辑中的对象 (重命名/改公式) ----------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ---------- 数学键盘状态 ----------
  // 当前正被键盘服务的目标 input (顶部主输入框 vs. 列表中的编辑框)
  type KeyboardTarget = 'main' | { type: 'edit'; id: string };
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget>('main');

  /** 在当前焦点 input 的光标位置插入文本 */
  const insertAtCursor = useCallback((text: string, opts?: { caretOffset?: number }) => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const newVal = before + text + after;
    const newCaret = start + text.length + (opts?.caretOffset ?? 0);

    if (keyboardTarget === 'main') {
      setInputValue(newVal);
      setInputError(null);
    } else {
      setEditingValue(newVal);
    }

    // 等 React 渲染后再设置 caret
    requestAnimationFrame(() => {
      target.focus();
      try { target.setSelectionRange(newCaret, newCaret); } catch {}
    });
  }, [keyboardTarget]);

  const handleBackspace = useCallback(() => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    let newVal: string;
    let newCaret: number;
    if (start !== end) {
      // 有选区, 删除选区
      newVal = target.value.slice(0, start) + target.value.slice(end);
      newCaret = start;
    } else if (start > 0) {
      newVal = target.value.slice(0, start - 1) + target.value.slice(start);
      newCaret = start - 1;
    } else {
      return;
    }
    if (keyboardTarget === 'main') {
      setInputValue(newVal);
      setInputError(null);
    } else {
      setEditingValue(newVal);
    }
    requestAnimationFrame(() => {
      target.focus();
      try { target.setSelectionRange(newCaret, newCaret); } catch {}
    });
  }, [keyboardTarget]);

  const handleArrow = useCallback((dir: 'left' | 'right') => {
    const target = keyboardTarget === 'main' ? inputRef.current : editInputRef.current;
    if (!target) return;
    const pos = target.selectionStart ?? 0;
    const newPos = dir === 'left' ? Math.max(0, pos - 1) : Math.min(target.value.length, pos + 1);
    target.focus();
    try { target.setSelectionRange(newPos, newPos); } catch {}
  }, [keyboardTarget]);

  // ---------- 坐标系 ----------
  const [scale, setScale] = useState<number>(45);
  const [origin, setOrigin] = useState<{ x: number; y: number }>({ x: 300, y: 250 });

  // ---------- 显示开关 ----------
  const [showLabels, setShowLabels] = useState(true);
  const [showFeaturePoints, setShowFeaturePoints] = useState(true);
  const [showTrace, setShowTrace] = useState(true);

  // 内部状态改变回调 onStateChange (只在编辑面板模式触发)
  useEffect(() => {
    if (!preview && onStateChange) {
      const json = JSON.stringify(objects);
      if (json !== lastStateJsonRef.current) {
        lastStateJsonRef.current = json;
        onStateChange({ objects, scale, origin, showLabels, showFeaturePoints, showTrace });
      }
    }
  }, [objects, scale, origin, showLabels, showFeaturePoints, showTrace, onStateChange, preview]);
  const [hasInitializedOrigin, setHasInitializedOrigin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOriginStart = useRef({ x: 0, y: 0 });

  // ---------- 鼠标悬浮态 ----------
  const [hoveredFeature, setHoveredFeature] = useState<FeaturePoint | null>(null);
  const [traceCursor, setTraceCursor] = useState<{ funcId: string; x: number; y: number } | null>(null);

  // ---------- 自由点拖拽态 ----------
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** 获取 canvas 当前的 CSS 像素尺寸 (用于所有屏幕坐标计算) */
  const getCanvasSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0 };
    const dpr = window.devicePixelRatio || 1;
    return { w: c.width / dpr, h: c.height / dpr };
  }, []);

  // ============================================================
  // 视图边界限制 (函数空间 ±300)
  // ============================================================
  /**
   * 给定缩放和画布尺寸,夹紧 origin 让屏幕中可见的数学区间不超过 ±MATH_SPACE_LIMIT
   * 的对称扩展(允许略微越界以容纳坐标轴标签)。
   */
  const clampOrigin = useCallback((o: { x: number; y: number }, s: number, canvasW: number, canvasH: number) => {
    const L = MATH_SPACE_LIMIT;
    const minOx = canvasW - L * s;
    const maxOx = L * s;
    const minOy = canvasH - L * s;
    const maxOy = L * s;
    let nx = o.x;
    let ny = o.y;
    if (maxOx < minOx) nx = canvasW / 2;
    else nx = Math.min(maxOx, Math.max(minOx, o.x));
    if (maxOy < minOy) ny = canvasH / 2;
    else ny = Math.min(maxOy, Math.max(minOy, o.y));
    if (nx === o.x && ny === o.y) return o;
    return { x: nx, y: ny };
  }, []);

  /** 计算当前画布下允许的最小 scale (即缩出极限),保证 ±300 始终在可视区) */
  const getMinScaleForCanvas = useCallback((canvasW: number, canvasH: number) => {
    // 缩出极限: 至少要显示 ±300 全宽 (2L 数学单位 = 2L*scale 像素 ≤ 屏幕尺寸).
    // 但用户可能希望略微缩小到 ±300 完全在中间。 我们用更宽松的: 2L*scale 至少 == 屏幕短边 / 4
    // 即 scale = 屏幕短边 / (8*L). 这样 ±300 大约占可视空间 25%, 仍然能看到全图。
    const minSide = Math.min(canvasW, canvasH);
    // 但是不能小于全局下限
    return Math.max(MIN_SCALE, minSide / (4 * MATH_SPACE_LIMIT));
  }, []);


  // ============================================================
  // 派生数据
  // ============================================================
  const sliders = useMemo(() => objects.filter((o): o is SliderObject => o.kind === 'slider'), [objects]);
  const functions = useMemo(() => objects.filter((o): o is FunctionObject => o.kind === 'function'), [objects]);
  const points = useMemo(() => objects.filter((o): o is PointObject => o.kind === 'point'), [objects]);
  const usedNames = useMemo(() => new Set(objects.map(o => o.name)), [objects]);

  // 选中的函数卡片 ID (默认 null: 第三块默认隐藏，选择第二块卡片后才伴随动画出现)
  const [selectedFuncId, setSelectedFuncId] = useState<string | null>(null);

  const activeFunc = useMemo(() => {
    if (!selectedFuncId) return null;
    return functions.find(f => f.id === selectedFuncId) ?? null;
  }, [selectedFuncId, functions]);

  const activeParamNames = useMemo(() => {
    if (!activeFunc || !activeFunc.compiled) return new Set<string>();
    return new Set(activeFunc.compiled.variables.filter(v => v !== 'x'));
  }, [activeFunc]);

  const activeSliders = useMemo(() => {
    if (!activeFunc) return [];
    return sliders.filter(sl => activeParamNames.has(sl.name));
  }, [sliders, activeFunc, activeParamNames]);

  /** 当前作用域: 把所有滑动条映射为变量 */
  const scope = useMemo(() => {
    const s: Record<string, number> = {};
    for (const sl of sliders) s[sl.name] = sl.value;
    return s;
  }, [sliders]);

  /** 计算单条函数在 x 处的值 */
  const evalFunc = useCallback((fn: FunctionObject, x: number): number => {
    if (!fn.compiled) return NaN;
    return fn.compiled.evaluate({ ...scope, x });
  }, [scope]);

  // ============================================================
  // 表达式解析与添加
  // ============================================================

  /**
   * 解析用户输入。支持以下格式:
   *  - "f(x) = a*x + b"  →  添加函数 f
   *  - "y = sin(x)"      →  添加函数 (自动命名)
   *  - "g(x) = x^2"      →  添加 g
   *  - "a = 2"           →  添加滑动条 a
   *  - "k=-3"            →  添加滑动条 k
   *  - "(1, 2)"          →  添加自由点
   *  - "A = (1, 2)"      →  指定名字
   *  - 单纯表达式 "sin(x)" → 自动命名为 f
   */
  const handleSubmitInput = () => {
    const raw = inputValue.trim();
    if (!raw) return;
    setInputError(null);

    // 1. 自由点: A = (1, 2) 或 (1, 2)
    const ptNamed = raw.match(/^([A-Z]\w*)\s*=\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
    const ptAnon = raw.match(/^\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
    if (ptNamed || ptAnon) {
      const name = ptNamed
        ? ptNamed[1]
        : nextAvailableName(POINT_NAME_POOL, usedNames);
      const xExpr = ptNamed ? ptNamed[2] : ptAnon![1];
      const yExpr = ptNamed ? ptNamed[3] : ptAnon![2];
      const xC = tryCompile(xExpr);
      const yC = tryCompile(yExpr);
      if (!xC || !yC) {
        setInputError('点坐标无法解析');
        return;
      }
      if (usedNames.has(name)) {
        setInputError(`名称 "${name}" 已被占用`);
        return;
      }
      const newP: PointObject = {
        id: `pt_${Date.now()}`,
        kind: 'point',
        name,
        x: xC.evaluate(scope),
        y: yC.evaluate(scope),
        visible: true,
        color: POINT_COLORS[points.length % POINT_COLORS.length],
      };
      setObjects(prev => [...prev, newP]);
      setInputValue('');
      return;
    }

    // 2. 函数: f(x) = ...  或  y = ...
    const funcMatch = raw.match(/^([a-zA-Z]\w*)\s*\(\s*([a-zA-Z]\w*)\s*\)\s*=\s*(.+)$/);
    const yMatch = raw.match(/^y\s*=\s*(.+)$/i);
    if (funcMatch || yMatch) {
      const name = funcMatch
        ? funcMatch[1]
        : nextAvailableName(FUNC_NAME_POOL, usedNames);
      const body = funcMatch ? funcMatch[3] : yMatch![1];
      // 检查重名 (如果是显式命名)
      if (funcMatch && usedNames.has(name)) {
        setInputError(`名称 "${name}" 已被占用,试试改名`);
        return;
      }
      const compiled = tryCompile(body);
      if (!compiled) {
        setInputError('表达式语法错误');
        return;
      }
      const palette = NEON_PALETTE[functions.length % NEON_PALETTE.length];
      const newFn: FunctionObject = {
        id: `fn_${Date.now()}`,
        kind: 'function',
        name,
        source: body,
        visible: true,
        color: palette.color,
        glowColor: palette.glow,
        compiled,
        error: null,
      };
      // 自动为未定义的变量创建滑动条 (排除 x)
      const missing = compiled.variables.filter(v => v !== 'x' && !objects.some(o => o.name === v));
      const newSliders: SliderObject[] = missing.map((v, i) => ({
        id: `sl_${Date.now()}_${i}`,
        kind: 'slider',
        name: v,
        value: 1,
        min: -5,
        max: 5,
        step: 0.1,
        visible: true,
        color: SLIDER_COLORS[(sliders.length + i) % SLIDER_COLORS.length],
      }));
      setObjects(prev => [...prev, ...newSliders, newFn]);
      setInputValue('');
      return;
    }

    // 3. 滑动条: name = number
    const sliderMatch = raw.match(/^([a-zA-Z]\w*)\s*=\s*(-?\d*\.?\d+)$/);
    if (sliderMatch) {
      const name = sliderMatch[1];
      const value = parseFloat(sliderMatch[2]);
      if (usedNames.has(name)) {
        // 已存在 → 更新值
        setObjects(prev => prev.map(o =>
          o.kind === 'slider' && o.name === name ? { ...o, value } : o
        ));
        setInputValue('');
        return;
      }
      const newSl: SliderObject = {
        id: `sl_${Date.now()}`,
        kind: 'slider',
        name,
        value,
        min: Math.min(-5, value - 5),
        max: Math.max(5, value + 5),
        step: 0.1,
        visible: true,
        color: SLIDER_COLORS[sliders.length % SLIDER_COLORS.length],
      };
      setObjects(prev => [...prev, newSl]);
      setInputValue('');
      return;
    }

    // 4. 裸表达式 → 当作函数处理
    const compiled = tryCompile(raw);
    if (!compiled) {
      setInputError('无法识别的输入。试试 f(x)=x^2 或 a=3 或 (1,2)');
      return;
    }
    const fname = nextAvailableName(FUNC_NAME_POOL, usedNames);
    const palette = NEON_PALETTE[functions.length % NEON_PALETTE.length];
    const newFn: FunctionObject = {
      id: `fn_${Date.now()}`,
      kind: 'function',
      name: fname,
      source: raw,
      visible: true,
      color: palette.color,
      glowColor: palette.glow,
      compiled,
      error: null,
    };
    const missing = compiled.variables.filter(v => v !== 'x' && !objects.some(o => o.name === v));
    const newSliders: SliderObject[] = missing.map((v, i) => ({
      id: `sl_${Date.now()}_${i}`,
      kind: 'slider',
      name: v,
      value: 1,
      min: -5, max: 5, step: 0.1,
      visible: true,
      color: SLIDER_COLORS[(sliders.length + i) % SLIDER_COLORS.length],
    }));
    setObjects(prev => [...prev, ...newSliders, newFn]);
    setInputValue('');
  };

  // ============================================================
  // 对象操作
  // ============================================================

  const updateObject = (id: string, patch: Partial<GeoObject>) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...patch } as GeoObject : o));
  };

  const updateFunctionSource = (id: string, newSrc: string) => {
    const compiled = tryCompile(newSrc);
    setObjects(prev => prev.map(o => {
      if (o.id !== id || o.kind !== 'function') return o;
      return { ...o, source: newSrc, compiled, error: compiled ? null : '语法错误' };
    }));
    // 创建缺失的滑动条
    if (compiled) {
      const missing = compiled.variables.filter(v => v !== 'x' && !objects.some(o2 => o2.name === v));
      if (missing.length) {
        const newSliders: SliderObject[] = missing.map((v, i) => ({
          id: `sl_${Date.now()}_${i}`,
          kind: 'slider', name: v, value: 1,
          min: -5, max: 5, step: 0.1,
          visible: true,
          color: SLIDER_COLORS[(sliders.length + i) % SLIDER_COLORS.length],
        }));
        setObjects(prev => [...prev, ...newSliders]);
      }
    }
  };

  const deleteObject = (id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
  };

  const handleReset = () => {
    setObjects(() => {
      const a: SliderObject = { id: 'sl_a', kind: 'slider', name: 'a', value: 1, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[0] };
      const b: SliderObject = { id: 'sl_b', kind: 'slider', name: 'b', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[1] };
      const c: SliderObject = { id: 'sl_c', kind: 'slider', name: 'c', value: 0, min: -5, max: 5, step: 0.1, visible: true, color: SLIDER_COLORS[2] };
      const fSrc = 'a*x^2 + b*x + c';
      const f: FunctionObject = {
        id: 'fn_f', kind: 'function', name: 'f', source: fSrc, visible: true,
        color: NEON_PALETTE[2].color, glowColor: NEON_PALETTE[2].glow,
        compiled: tryCompile(fSrc), error: null
      };
      return [a, b, c, f];
    });
    setScale(45);
    const { w, h } = getCanvasSize();
    setOrigin({ x: (w || 600) / 2, y: (h || 500) / 2 });
  };

  // ============================================================
  // 特征点
  // ============================================================
  const allFeaturePoints = useMemo(() => {
    if (!showFeaturePoints) return [] as FeaturePoint[];
    const canvas = canvasRef.current;
    if (!canvas) return [];
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const xMin = -origin.x / scale;
    const xMax = (W - origin.x) / scale;
    const out: FeaturePoint[] = [];

    for (const fn of functions) {
      if (!fn.visible || !fn.compiled) continue;
      const f = (x: number) => evalFunc(fn, x);

      // 1) y 截距
      const y0 = f(0);
      if (isFinite(y0) && 0 >= xMin && 0 <= xMax) {
        out.push({
          x: 0, y: y0,
          label: `${fn.name}(0) = ${formatNum(y0)}`,
          color: '#00d2ff',
          kind: 'intercept',
          ownerId: fn.id,
        });
      }

      // 2) 零点
      const roots = findRoots(f, xMin, xMax, 600);
      for (const r of roots) {
        out.push({
          x: r, y: 0,
          label: `${fn.name} 零点: (${formatNum(r)}, 0)`,
          color: '#ffd700',
          kind: 'root',
          ownerId: fn.id,
        });
      }

      // 3) 极值
      const exts = findExtrema(f, xMin, xMax, 500);
      for (const ex of exts) {
        out.push({
          x: ex.x, y: ex.y,
          label: `${fn.name} ${ex.kind === 'max' ? '极大值' : '极小值'}: (${formatNum(ex.x)}, ${formatNum(ex.y)})`,
          color: ex.kind === 'max' ? '#39ff14' : '#00ffaa',
          kind: 'extremum',
          ownerId: fn.id,
        });
      }
    }
    return out;
  }, [functions, scope, origin, scale, showFeaturePoints, evalFunc]);

  // ============================================================
  // Canvas 绘制
  // ============================================================
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = theme === 'dark';
    const dpr = window.devicePixelRatio || 1;
    // 内部位图尺寸 = CSS 尺寸 × dpr; 我们后续所有绘制坐标都使用 CSS 像素
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    // 重置变换,然后按 dpr 缩放,使逻辑坐标 = CSS 像素
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // ---- 1. 自适应网格 ----
    const { major, minor } = calcGridStep(scale);
    const xMin = -origin.x / scale;
    const xMax = (W - origin.x) / scale;
    const yMin = -(H - origin.y) / scale;
    const yMax = origin.y / scale;

    if (!embedded) {
      // 小网格
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let x = Math.ceil(xMin / minor) * minor; x <= xMax; x += minor) {
        const px = origin.x + x * scale;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      }
      for (let y = Math.ceil(yMin / minor) * minor; y <= yMax; y += minor) {
        const py = origin.y - y * scale;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
      }

      // 主网格
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
      for (let x = Math.ceil(xMin / major) * major; x <= xMax; x += major) {
        const px = origin.x + x * scale;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      }
      for (let y = Math.ceil(yMin / major) * major; y <= yMax; y += major) {
        const py = origin.y - y * scale;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
      }
    }

    // ---- 2. 坐标轴 ----
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    // X 轴
    ctx.beginPath();
    ctx.moveTo(0, origin.y); ctx.lineTo(W, origin.y); ctx.stroke();
    // Y 轴
    ctx.beginPath();
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, H); ctx.stroke();

    // 箭头
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(W, origin.y); ctx.lineTo(W - 9, origin.y - 4); ctx.lineTo(W - 9, origin.y + 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x - 4, 9); ctx.lineTo(origin.x + 4, 9);
    ctx.closePath(); ctx.fill();

    // ---- 3. 坐标刻度文字 ----
    if (showLabels) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
      ctx.font = '11px Menlo, monospace, system-ui';
      // X
      for (let x = Math.ceil(xMin / major) * major; x <= xMax; x += major) {
        if (Math.abs(x) < major / 2) continue;
        const px = origin.x + x * scale;
        const txt = formatNum(x, major < 1 ? 2 : 1);
        const tw = ctx.measureText(txt).width;
        ctx.fillText(txt, px - tw / 2, origin.y + 14);
      }
      // Y
      for (let y = Math.ceil(yMin / major) * major; y <= yMax; y += major) {
        if (Math.abs(y) < major / 2) continue;
        const py = origin.y - y * scale;
        const txt = formatNum(y, major < 1 ? 2 : 1);
        const tw = ctx.measureText(txt).width;
        ctx.fillText(txt, origin.x - tw - 6, py + 4);
      }
      // 原点
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
      ctx.font = '12px system-ui';
      ctx.fillText('O', origin.x - 14, origin.y + 14);
      ctx.fillText('x', W - 14, origin.y - 8);
      ctx.fillText('y', origin.x + 8, 14);
    }

    // ---- 3.5 函数空间边界 (±300) ----
    // 仅在画布上至少能看见两条边时绘制 (即 scale 较小)
    {
      const L = MATH_SPACE_LIMIT;
      const lx = origin.x + (-L) * scale;
      const rx = origin.x + L * scale;
      const ty = origin.y - L * scale;
      const by = origin.y - (-L) * scale;
      // 只要至少一条边能看到,就画
      const visible = lx > -50 || rx < W + 50 || ty > -50 || by < H + 50;
      if (visible) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 80, 80, 0.4)';
        ctx.strokeRect(lx, ty, rx - lx, by - ty);
        ctx.restore();

        // 边界标注 (右上角)
        if (rx < W && ty > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 120, 120, 0.7)';
          ctx.font = '10px Menlo, monospace';
          ctx.fillText(`±${L}`, rx - 28, ty - 6);
          ctx.restore();
        }
      }
    }

    // ---- 4. 函数曲线 (霓虹发光) ----
    for (const fn of functions) {
      if (!fn.visible || !fn.compiled) continue;
      ctx.save();
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = fn.glowColor;
      ctx.beginPath();

      let first = true;
      let prevPy = 0;
      for (let px = 0; px <= W; px++) {
        const x = (px - origin.x) / scale;
        // 函数定义域限制: 只在 [-300, 300] 内绘制
        if (x < -MATH_SPACE_LIMIT || x > MATH_SPACE_LIMIT) {
          first = true;
          continue;
        }
        const y = evalFunc(fn, x);
        if (!isFinite(y)) {
          first = true;
          continue;
        }
        // y 也限制在 ±300 内
        if (y < -MATH_SPACE_LIMIT || y > MATH_SPACE_LIMIT) {
          first = true;
          continue;
        }
        const py = origin.y - y * scale;
        if (py < -5000 || py > H + 5000) {
          first = true;
          continue;
        }
        // 跳跃检测 (避免 tan 之类的奇点用直线相连)
        if (!first && Math.abs(py - prevPy) > H * 0.9) {
          first = true;
        }
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
        prevPy = py;
      }
      ctx.stroke();
      ctx.restore();

      // 曲线右侧贴标签
      if (showLabels) {
        // 找最右侧屏幕内有效点 (且 x 在 ±300 内)
        for (let px = W - 30; px > W * 0.6; px -= 5) {
          const x = (px - origin.x) / scale;
          if (x < -MATH_SPACE_LIMIT || x > MATH_SPACE_LIMIT) continue;
          const y = evalFunc(fn, x);
          if (isFinite(y) && y >= -MATH_SPACE_LIMIT && y <= MATH_SPACE_LIMIT) {
            const py = origin.y - y * scale;
            if (py > 10 && py < H - 10) {
              ctx.save();
              ctx.fillStyle = fn.color;
              ctx.shadowBlur = embedded ? 0 : 4;
              ctx.shadowColor = fn.glowColor;
              ctx.font = 'bold 13px system-ui';
              ctx.fillText(fn.name, px + 4, py - 4);
              ctx.restore();
              break;
            }
          }
        }
      }
    }

    // ---- 5. 鼠标轨迹追踪点 (cursor on curve) ----
    if (showTrace && traceCursor) {
      const fn = functions.find(f => f.id === traceCursor.funcId);
      if (fn && fn.visible) {
        const px = origin.x + traceCursor.x * scale;
        const py = origin.y - traceCursor.y * scale;
        ctx.save();
        // 垂线
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, origin.y); ctx.lineTo(px, py);
        ctx.moveTo(origin.x, py); ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);
        // 圆点
        ctx.fillStyle = fn.color;
        ctx.shadowBlur = embedded ? 0 : 4;
        ctx.shadowColor = fn.glowColor;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = isDark ? '#fff' : '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // 坐标气泡
        const label = `${fn.name}(${formatNum(traceCursor.x)}) = ${formatNum(traceCursor.y)}`;
        ctx.save();
        ctx.font = '12px system-ui';
        const tw = ctx.measureText(label).width;
        const bw = tw + 16, bh = 24;
        let bx = px + 12, by = py - bh - 8;
        if (bx + bw > W - 8) bx = px - bw - 12;
        if (by < 8) by = py + 12;
        ctx.fillStyle = isDark ? 'rgba(15,17,23,0.95)' : 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(bx, by, bw, bh, 6);
        } else {
          ctx.rect(bx, by, bw, bh);
        }
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = isDark ? '#fff' : '#1e293b';
        ctx.fillText(label, bx + 8, by + 16);
        ctx.restore();
      }
    }

    // ---- 6. 特征点 ----
    for (const pt of allFeaturePoints) {
      const px = origin.x + pt.x * scale;
      const py = origin.y - pt.y * scale;
      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      ctx.save();
      ctx.fillStyle = pt.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = pt.color;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isDark ? '#fff' : '#f8fafc';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ---- 7. 自由点 ----
    for (const p of points) {
      if (!p.visible) continue;
      const px = origin.x + p.x * scale;
      const py = origin.y - p.y * scale;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(px, py, draggingPointId === p.id ? 8 : 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isDark ? '#fff' : '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, draggingPointId === p.id ? 8 : 6.5, 0, Math.PI * 2); ctx.stroke();
      // 标签
      if (showLabels) {
        ctx.fillStyle = isDark ? '#fff' : '#1e293b';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText(p.name, px + 10, py - 8);
        ctx.font = '11px Menlo, monospace';
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
        ctx.fillText(`(${formatNum(p.x)}, ${formatNum(p.y)})`, px + 10, py + 6);
      }
      ctx.restore();
    }

    // ---- 8. 悬浮特征点气泡 ----
    if (hoveredFeature) {
      const px = origin.x + hoveredFeature.x * scale;
      const py = origin.y - hoveredFeature.y * scale;
      ctx.save();
      ctx.font = '12px system-ui';
      const tw = ctx.measureText(hoveredFeature.label).width;
      const bw = tw + 16, bh = 26;
      const bx = Math.max(8, Math.min(W - bw - 8, px - bw / 2));
      const by = Math.max(8, py - bh - 12);
      ctx.fillStyle = isDark ? 'rgba(15,17,23,0.95)' : 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(bx, by, bw, bh, 6);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isDark ? '#fff' : '#1e293b';
      ctx.fillText(hoveredFeature.label, bx + 8, by + 17);
      ctx.restore();
    }
  }, [
    functions, points, scale, origin, showLabels, showTrace, traceCursor,
    allFeaturePoints, hoveredFeature, draggingPointId, evalFunc, theme
  ]);

  // ============================================================
  // 鼠标交互
  // ============================================================
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // 点击画布即关闭键盘 (符合 GeoGebra 行为)
    if (keyboardOpen) {
      setKeyboardOpen(false);
      inputRef.current?.blur();
      editInputRef.current?.blur();
    }

    // 1. 自由点拖拽
    for (const p of points) {
      if (!p.visible) continue;
      const px = origin.x + p.x * scale;
      const py = origin.y - p.y * scale;
      if (Math.hypot(mx - px, my - py) < 12) {
        setDraggingPointId(p.id);
        return;
      }
    }

    // 2. 平移
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOriginStart.current = { ...origin };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // 拖动自由点
    if (draggingPointId) {
      const newX = (mx - origin.x) / scale;
      const newY = (origin.y - my) / scale;
      // 自由点也限制在 ±300 内
      const cx = Math.min(MATH_SPACE_LIMIT, Math.max(-MATH_SPACE_LIMIT, newX));
      const cy = Math.min(MATH_SPACE_LIMIT, Math.max(-MATH_SPACE_LIMIT, newY));
      updateObject(draggingPointId, { x: cx, y: cy } as Partial<PointObject>);
      return;
    }

    // 平移画布
    if (isDragging) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const tentative = {
        x: dragOriginStart.current.x + dx,
        y: dragOriginStart.current.y + dy,
      };
      const { w, h } = getCanvasSize();
      setOrigin(clampOrigin(tentative, scale, w, h));
      return;
    }

    // 检测特征点悬浮
    let hover: FeaturePoint | null = null;
    for (const pt of allFeaturePoints) {
      const px = origin.x + pt.x * scale;
      const py = origin.y - pt.y * scale;
      if (Math.hypot(mx - px, my - py) < 10) { hover = pt; break; }
    }
    setHoveredFeature(hover);

    // 追踪曲线: 在鼠标 x 处取最近的可见函数 y
    if (showTrace && !hover) {
      const x = (mx - origin.x) / scale;
      let best: { funcId: string; x: number; y: number; dist: number } | null = null;
      for (const fn of functions) {
        if (!fn.visible || !fn.compiled) continue;
        const y = evalFunc(fn, x);
        if (!isFinite(y)) continue;
        const py = origin.y - y * scale;
        const d = Math.abs(py - my);
        if (d < 50 && (!best || d < best.dist)) {
          best = { funcId: fn.id, x, y, dist: d };
        }
      }
      if (best) setTraceCursor({ funcId: best.funcId, x: best.x, y: best.y });
      else setTraceCursor(null);
    } else {
      setTraceCursor(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingPointId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const { w, h } = getCanvasSize();
    const minScale = getMinScaleForCanvas(w, h);
    const newScale = Math.max(minScale, Math.min(MAX_SCALE, scale * factor));
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mathX = (mx - origin.x) / scale;
    const mathY = (origin.y - my) / scale;
    setScale(newScale);
    setOrigin(clampOrigin(
      { x: mx - mathX * newScale, y: my + mathY * newScale },
      newScale, w, h
    ));
  };

  // ============================================================
  // 副作用
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    // 用 canvas 自身作为观察目标 (而不是 parentElement),保证物理像素与显示像素分离
    const ro = new ResizeObserver(entries => {
      for (const ent of entries) {
        // contentRect 是 CSS 像素的显示尺寸
        const cssW = ent.contentRect.width;
        const cssH = ent.contentRect.height;
        // canvas 内部位图设为高分辨率
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        if (!hasInitializedOrigin && cssW > 0 && cssH > 0) {
          setOrigin({ x: cssW / 2, y: cssH / 2 });
          setHasInitializedOrigin(true);
        } else {
          const minS = getMinScaleForCanvas(cssW, cssH);
          if (scale < minS) setScale(minS);
          setOrigin(o => clampOrigin(o, Math.max(scale, minS), cssW, cssH));
        }
        drawGraph();
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [hasInitializedOrigin, drawGraph, scale, getMinScaleForCanvas, clampOrigin]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  // ============================================================
  // 渲染
  // ============================================================
  if (editorOnly) {
    return (
      <div className={cn("w-full h-full flex items-stretch p-3 gap-3 select-none overflow-hidden transition-colors duration-500 font-sans", isDark ? "text-white" : "text-slate-800")}>
        
        {/* ==================== 1. 第一块：表达式与参数输入 (Apple Style) ==================== */}
        <div className={cn("w-[280px] shrink-0 flex flex-col justify-between p-3 rounded-2xl border backdrop-blur-xl transition-all", isDark ? "bg-white/[0.03] border-white/10" : "bg-slate-900/[0.02] border-black/[0.06]")}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 tracking-tight">
                <span>输入表达式 / 参数</span>
              </div>
              <button onClick={handleReset} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer active:scale-95">
                <RotateCcw className="w-3 h-3" /> 重置全部
              </button>
            </div>

            <div className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-200 shadow-sm',
              isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white/90 border-black/10',
              inputError 
                ? 'border-rose-500/50 focus-within:ring-2 focus-within:ring-rose-500/20' 
                : 'focus-within:border-[#007AFF] focus-within:ring-2 focus-within:ring-[#007AFF]/20'
            )}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInput(); }}
                onFocus={() => { setKeyboardTarget('main'); setKeyboardOpen(true); }}
                inputMode="none"
                autoComplete="off"
                spellCheck={false}
                placeholder=""
                className={cn(
                  "flex-1 bg-transparent outline-none text-xs font-mono tracking-tight min-w-0",
                  isDark ? "text-white placeholder:text-zinc-500" : "text-slate-800 placeholder:text-slate-400"
                )}
              />
              <button
                onPointerDown={(e) => { e.preventDefault(); setKeyboardTarget('main'); setKeyboardOpen(v => !v); inputRef.current?.focus(); }}
                className={cn(
                  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer',
                  keyboardOpen 
                    ? 'bg-[#007AFF]/20 text-[#007AFF]' 
                    : isDark 
                      ? 'bg-white/10 text-zinc-400 hover:bg-white/20' 
                      : 'bg-black/5 text-slate-500 hover:bg-black/10'
                )}
                title="数学键盘"
              >
                <Keyboard className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleSubmitInput}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#007AFF] hover:bg-[#0062CC] active:scale-[0.97] text-white font-semibold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1"
                title="添加表达式"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </div>
            {inputError && (
              <div className="flex items-center gap-1 text-[11px] text-rose-500 px-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="truncate">{inputError}</span>
              </div>
            )}
          </div>


        </div>

        {/* ==================== 2. 第二块：函数卡片列表 (Apple Style 竖向滑动, 固定 320px) ==================== */}
        <div className={cn(
          "w-[320px] shrink-0 flex flex-col p-2.5 rounded-2xl border backdrop-blur-xl overflow-hidden transition-all duration-300",
          isDark ? "bg-white/[0.03] border-white/10" : "bg-slate-900/[0.02] border-black/[0.06]"
        )}>
          <div className="flex items-center justify-between px-1 mb-1.5 shrink-0">
            <span className="text-xs font-bold text-slate-600 dark:text-zinc-300 tracking-tight">函数列表 ({functions.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5 scrollbar-thin">
            {functions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400 dark:text-zinc-500">暂无函数</div>
            ) : (
              functions.map(fn => {
                const isSelected = activeFunc?.id === fn.id;
                return (
                  <div
                    key={fn.id}
                    onClick={() => setSelectedFuncId(prev => prev === fn.id ? null : fn.id)}
                    className={cn(
                      'p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 shadow-sm cursor-pointer relative group active:scale-[0.98]',
                      isSelected
                        ? isDark 
                          ? 'bg-[#007AFF]/15 border-[#007AFF]/50 shadow-[0_0_15px_rgba(0,122,255,0.15)] ring-1 ring-[#007AFF]/30' 
                          : 'bg-blue-50/90 border-[#007AFF]/40 shadow-sm ring-1 ring-[#007AFF]/25'
                        : isDark 
                          ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]' 
                          : 'bg-white/80 border-slate-200/80 hover:bg-white',
                      !fn.visible && 'opacity-50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-base font-bold truncate text-slate-800 dark:text-zinc-100 tracking-tight">
                        <span style={{ color: fn.color }}>{fn.name}(x)</span> = {prettifyExpression(fn.source)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteObject(fn.id);
                          if (selectedFuncId === fn.id) setSelectedFuncId(null);
                        }}
                        className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", isSelected ? "text-[#007AFF] rotate-90 font-bold" : "text-slate-300 dark:text-zinc-600 opacity-60")} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ==================== 3. 第三块：点击第二块函数卡片后伴随动画展开 (Apple Style Liquid Spring) ==================== */}
        <div
          className={cn(
            "shrink-0 flex flex-col rounded-2xl border backdrop-blur-xl overflow-hidden shadow-sm",
            "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            activeFunc
              ? "w-[300px] max-w-[300px] opacity-100 scale-100 translate-x-0 p-2.5"
              : "w-0 max-w-0 opacity-0 scale-95 -translate-x-3 p-0 border-0 pointer-events-none",
            isDark ? "bg-white/[0.03] border-white/10" : "bg-slate-900/[0.02] border-black/[0.06]"
          )}
        >
          <div className="w-[280px] shrink-0 h-full flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-zinc-200 tracking-tight">
                <span>{activeFunc ? `${activeFunc.name}(x) 参数调节` : '参数调节'}</span>
              </div>
              <button
                onClick={() => setSelectedFuncId(null)}
                className="text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
              >
                收起
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
              {activeSliders.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-3 text-slate-400 dark:text-zinc-500 gap-1.5">
                  <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">暂无关联变量参数</span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 leading-normal">在表达式中使用字母变量<br/>(例如 a*x^2 + b) 即可自动生成调节棒</span>
                </div>
              ) : (
                activeSliders.map(sl => (
                  <div
                    key={sl.id}
                    className={cn(
                      'p-2.5 rounded-xl border transition-all duration-200 flex flex-col gap-1.5 shadow-sm',
                      isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white/90 border-slate-200/80'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-xs font-bold">
                        <span className="w-5 h-5 rounded-md bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center text-xs font-bold">{sl.name}</span>
                        <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal">当前值:</span>
                        <span className="text-xs font-extrabold text-[#007AFF]">{formatNum(sl.value)}</span>
                      </div>
                      <button
                        onClick={() => deleteObject(sl.id)}
                        className="w-5 h-5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                        title="删除参数"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={sl.min}
                      max={sl.max}
                      step={sl.step}
                      value={sl.value}
                      onChange={(e) => updateObject(sl.id, { value: parseFloat(e.target.value) } as Partial<SliderObject>)}
                      className="w-full h-1.5 bg-slate-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#007AFF] transition-all"
                    />
                    {/* 范围微调输入框 (min ~ max) */}
                    <div className={cn("flex items-center gap-1.5 text-xs font-medium pt-0.5", isDark ? "text-zinc-400" : "text-slate-500")}>
                      <input
                        type="number"
                        value={sl.min}
                        onChange={(e) => updateObject(sl.id, { min: parseFloat(e.target.value) || sl.min } as Partial<SliderObject>)}
                        className={cn(
                          "w-14 border rounded-lg px-1.5 py-0.5 text-center font-mono outline-none transition-colors text-xs font-bold",
                          isDark 
                            ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-[#007AFF]/50" 
                            : "bg-white border-slate-300 text-slate-800 focus:border-[#007AFF]/50"
                        )}
                        step={0.5}
                      />
                      <span className={isDark ? "text-zinc-500" : "text-slate-400"}>〜</span>
                      <input
                        type="number"
                        value={sl.max}
                        onChange={(e) => updateObject(sl.id, { max: parseFloat(e.target.value) || sl.max } as Partial<SliderObject>)}
                        className={cn(
                          "w-14 border rounded-lg px-1.5 py-0.5 text-center font-mono outline-none transition-colors text-xs font-bold",
                          isDark 
                            ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-[#007AFF]/50" 
                            : "bg-white border-slate-300 text-slate-800 focus:border-[#007AFF]/50"
                        )}
                        step={0.5}
                      />
                      <span className={cn("ml-auto text-[11px]", isDark ? "text-zinc-500" : "text-slate-400")}>步长</span>
                      <input
                        type="number"
                        value={sl.step}
                        onChange={(e) => updateObject(sl.id, { step: parseFloat(e.target.value) || sl.step } as Partial<SliderObject>)}
                        className={cn(
                          "w-12 border rounded-lg px-1 py-0.5 text-center font-mono outline-none transition-colors text-xs font-bold",
                          isDark 
                            ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-[#007AFF]/50" 
                            : "bg-white border-slate-300 text-slate-800 focus:border-[#007AFF]/50"
                        )}
                        step={0.01}
                        min={0.001}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 浮动数学键盘 (以 fixed 独立层级悬浮在编辑条上方) */}
        <MathKeyboard
          position="fixed"
          visible={keyboardOpen}
          onClose={() => { setKeyboardOpen(false); inputRef.current?.blur(); editInputRef.current?.blur(); }}
          onInsert={insertAtCursor}
          onBackspace={handleBackspace}
          onArrow={handleArrow}
          onSubmit={() => {
            if (keyboardTarget === 'main') {
              handleSubmitInput();
            } else if (typeof keyboardTarget === 'object' && keyboardTarget.type === 'edit') {
              updateFunctionSource(keyboardTarget.id, editingValue);
              setEditingId(null);
              setKeyboardOpen(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div data-embed-content={embedded ? 'function' : undefined} data-function-preview={preview ? 'true' : undefined} className={cn("w-full h-full flex select-none relative overflow-hidden transition-colors duration-500", embedded ? "bg-transparent text-slate-800 dark:text-white" : isDark ? "bg-[#0c0d0e] text-white" : "bg-[#f8fafc] text-slate-800")}>

      {/* ===== 1. 左侧 GeoGebra 风格代数视图 ===== */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300 select-none overflow-hidden backdrop-blur-2xl transition-colors duration-500',
          embedded
            ? 'absolute left-4 top-4 bottom-4 z-[45] w-[360px] max-w-[calc(100%-2rem)] rounded-2xl border shadow-2xl'
            : 'h-full relative z-[35] border-r w-[400px]',
          isDark 
            ? 'border-white/10 bg-zinc-950/90 text-zinc-100 shadow-[10px_0_30px_rgba(0,0,0,0.5)]' 
            : 'border-slate-200/80 bg-white/90 text-slate-800 shadow-[10px_0_30px_rgba(0,0,0,0.08)]',
          preview ? 'hidden' : isSidebarCollapsed ? 'w-0 border-0 p-0 opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        <div className={cn(embedded ? "w-full" : "w-[400px]", "h-full flex flex-col shrink-0 px-6 pt-6 pb-4 gap-4 overflow-y-auto")}>

          {/* 标题 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 text-cyan-500 dark:text-cyan-400">
              <Activity className="w-6.5 h-6.5 animate-pulse" />
              <h2 className={cn("text-[26px] font-black tracking-wide", isDark ? "text-white" : "text-slate-900")}>代数 Algebra</h2>
            </div>
            <p className={isDark ? "text-zinc-400 text-[15px]" : "text-slate-500 text-[15px]"}>输入函数、参数或点，自由组合</p>
          </div>

          {/* 表达式输入条 */}
          <div className="flex flex-col gap-1.5">
            <div className={cn(
              'flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all duration-300',
              isDark ? 'bg-zinc-900/50 border-white/10' : 'bg-slate-100/70 border-slate-200',
              inputError 
                ? 'border-red-500/50 focus-within:border-red-500/80 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]' 
                : 'focus-within:border-cyan-500 focus-within:shadow-[0_0_0_3px_rgba(6,182,212,0.15)]'
            )}>
              <svg className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="19" x2="21" y2="19" />
                <line x1="5" y1="3" x2="5" y2="21" />
                <path d="M5 14C9 6 13 18 20 7" strokeWidth="2.2" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInput(); }}
                onFocus={() => { setKeyboardTarget('main'); setKeyboardOpen(true); }}
                inputMode="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="f(x)=sin(a*x)+b   ·   a=2   ·   (1,2)"
                className={cn(
                  "flex-1 bg-transparent outline-none text-[15px] font-mono",
                  isDark ? "text-white placeholder:text-zinc-500" : "text-slate-800 placeholder:text-slate-400"
                )}
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setKeyboardTarget('main'); setKeyboardOpen(v => !v); inputRef.current?.focus(); }}
                className={cn(
                  'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer',
                  keyboardOpen 
                    ? 'bg-cyan-500/30 text-cyan-200' 
                    : isDark 
                      ? 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white' 
                      : 'bg-slate-200/60 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                )}
                title={keyboardOpen ? '收起键盘' : '展开数学键盘'}
              >
                <Keyboard className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={handleSubmitInput}
                className={cn(
                  'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer',
                  isDark
                    ? 'bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300'
                    : 'bg-cyan-100 hover:bg-cyan-250 text-cyan-700'
                )}
                title="添加"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            </div>
            {inputError && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 px-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{inputError}</span>
              </div>
            )}
          </div>

          {/* 对象列表 */}
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            <div className={cn(
              "text-[13px] font-extrabold tracking-wider uppercase border-b pb-2 sticky top-0 backdrop-blur-md z-[1] transition-colors duration-500",
              isDark 
                ? "text-zinc-300 border-white/10 bg-zinc-950/85" 
                : "text-slate-500 border-slate-200/80 bg-white/85"
            )}>
              对象列表 · {objects.length}
            </div>

            {objects.length === 0 && (
              <div className={cn("text-center py-12 transition-colors duration-500", isDark ? "text-zinc-500" : "text-slate-400")}>
                <p className="text-[15px] font-medium">暂无对象</p>
                <p className="text-xs mt-2 opacity-80">在上方输入框创建第一个对象</p>
              </div>
            )}

            {/* === 函数卡片 === */}
            {functions.map(fn => {
              const isEditing = editingId === fn.id;
              return (
                <div
                  key={fn.id}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all duration-300 flex flex-col gap-2.5 group/card shadow-sm',
                    isDark 
                      ? 'bg-zinc-900/30' 
                      : 'bg-slate-50/65 hover:bg-slate-50/90',
                    fn.visible 
                      ? isDark ? 'border-white/10' : 'border-slate-200/80' 
                      : 'border-transparent opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* 显隐切换 */}
                    <button
                      onClick={() => updateObject(fn.id, { visible: !fn.visible } as Partial<FunctionObject>)}
                      className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                      style={{
                        backgroundColor: fn.visible ? fn.color : 'transparent',
                        borderColor: fn.color,
                      }}
                      title={fn.visible ? '隐藏' : '显示'}
                    >
                      {fn.visible
                        ? <Eye className="w-4 h-4 text-zinc-950 stroke-[3]" />
                        : <EyeOff className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-slate-400")} />}
                    </button>

                    {/* 名称 */}
                    <div className="font-mono font-bold text-[15px] shrink-0" style={{ color: fn.color }}>
                      {fn.name}(x) =
                    </div>

                    {/* 表达式 (可编辑) */}
                    {isEditing ? (
                      <input
                        autoFocus
                        ref={editInputRef}
                        type="text"
                        inputMode="none"
                        autoComplete="off"
                        spellCheck={false}
                        value={editingValue}
                        onFocus={() => { setKeyboardTarget({ type: 'edit', id: fn.id }); setKeyboardOpen(true); }}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateFunctionSource(fn.id, editingValue);
                            setEditingId(null);
                            setKeyboardOpen(false);
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                            setKeyboardOpen(false);
                          }
                        }}
                        className={cn(
                          "flex-1 min-w-0 border rounded-md px-2.5 py-1 text-[15px] font-mono outline-none transition-colors",
                          isDark 
                            ? "bg-zinc-950/60 border-cyan-400/40 text-white focus:border-cyan-400" 
                            : "bg-white border-cyan-500/45 text-slate-800 focus:border-cyan-500"
                        )}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(fn.id); setEditingValue(fn.source); }}
                        className={cn(
                          "flex-1 min-w-0 text-left text-[15px] font-mono truncate transition-colors cursor-pointer hover:font-bold",
                          fn.visible 
                            ? isDark ? "hover:text-white" : "hover:text-slate-900" 
                            : isDark ? "text-zinc-500" : "text-slate-400"
                        )}
                        style={{ color: fn.visible ? fn.color : undefined }}
                        title="点击编辑"
                      >
                        {prettifyExpression(fn.source)}
                      </button>
                    )}

                    {/* 删除 */}
                    <button
                      onClick={() => deleteObject(fn.id)}
                      className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {fn.error && (
                    <div className="text-xs text-red-500 dark:text-red-400 ml-11 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{fn.error}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* === 滑动条卡片 === */}
            {sliders.length > 0 && (
              <div className={cn(
                "text-[13px] font-extrabold tracking-wider uppercase pt-3 flex items-center gap-1.5 transition-colors duration-500",
                isDark ? "text-zinc-400" : "text-slate-500"
              )}>
                <Sliders className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                <span>滑动条 · {sliders.length}</span>
              </div>
            )}
            {sliders.map(sl => (
              <div
                key={sl.id}
                className={cn(
                  "p-3.5 rounded-2xl border transition-all duration-300 flex flex-col gap-3 group/card shadow-sm",
                  isDark 
                    ? "bg-zinc-900/30 border-white/10" 
                    : "bg-slate-50/65 hover:bg-slate-50/90 border-slate-200/80"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 font-extrabold text-[13px]"
                    style={{ borderColor: sl.color, color: sl.color, backgroundColor: `${sl.color}15` }}
                  >
                    {sl.name}
                  </div>
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className={cn("text-sm font-mono", isDark ? "text-zinc-300" : "text-slate-400")}>=</span>
                    <span className="text-[15px] font-mono font-bold" style={{ color: sl.color }}>
                      {sl.value.toFixed(2)}
                    </span>
                    <span className={cn("text-xs font-mono", isDark ? "text-zinc-500" : "text-slate-400")}>
                      [{sl.min}, {sl.max}]
                    </span>
                  </div>
                  <button
                    onClick={() => deleteObject(sl.id)}
                    className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={sl.step}
                  value={sl.value}
                  onChange={(e) => updateObject(sl.id, { value: parseFloat(e.target.value) } as Partial<SliderObject>)}
                  className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: sl.color }}
                />
                {/* 范围微调 */}
                <div className={cn("flex items-center gap-1.5 text-xs font-medium", isDark ? "text-zinc-400" : "text-slate-500")}>
                  <input
                    type="number"
                    value={sl.min}
                    onChange={(e) => updateObject(sl.id, { min: parseFloat(e.target.value) || sl.min } as Partial<SliderObject>)}
                    className={cn(
                      "w-16 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors",
                      isDark 
                        ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40" 
                        : "bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40"
                    )}
                    step={0.5}
                  />
                  <span className={isDark ? "text-zinc-600" : "text-slate-300"}>〜</span>
                  <input
                    type="number"
                    value={sl.max}
                    onChange={(e) => updateObject(sl.id, { max: parseFloat(e.target.value) || sl.max } as Partial<SliderObject>)}
                    className={cn(
                      "w-16 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors",
                      isDark 
                        ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40" 
                        : "bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40"
                    )}
                    step={0.5}
                  />
                  <span className={cn("ml-auto", isDark ? "text-zinc-500" : "text-slate-400")}>步长</span>
                  <input
                    type="number"
                    value={sl.step}
                    onChange={(e) => updateObject(sl.id, { step: parseFloat(e.target.value) || sl.step } as Partial<SliderObject>)}
                    className={cn(
                      "w-14 border rounded px-1.5 py-0.5 text-center font-mono outline-none transition-colors",
                      isDark 
                        ? "bg-zinc-950/60 border-white/10 text-zinc-200 focus:border-cyan-400/40" 
                        : "bg-white border-slate-200 text-slate-700 focus:border-cyan-500/40"
                    )}
                    step={0.01}
                    min={0.001}
                  />
                </div>
              </div>
            ))}

            {/* === 自由点卡片 === */}
            {points.length > 0 && (
              <div className={cn(
                "text-[13px] font-extrabold tracking-wider uppercase pt-3 flex items-center gap-1.5 transition-colors duration-500",
                isDark ? "text-zinc-400" : "text-slate-500"
              )}>
                <Crosshair className="w-4 h-4 text-pink-500 dark:text-pink-400" />
                <span>点 · {points.length}</span>
              </div>
            )}
            {points.map(p => (
              <div
                key={p.id}
                className={cn(
                  "p-3.5 rounded-2xl border transition-all duration-300 flex items-center gap-3 group/card shadow-sm",
                  isDark 
                    ? "bg-zinc-900/30 border-white/10" 
                    : "bg-slate-50/65 hover:bg-slate-50/90 border-slate-200/80"
                )}
              >
                <button
                  onClick={() => updateObject(p.id, { visible: !p.visible } as Partial<PointObject>)}
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                  style={{
                    backgroundColor: p.visible ? p.color : 'transparent',
                    borderColor: p.color,
                  }}
                >
                  {p.visible
                    ? <Eye className="w-4 h-4 text-zinc-950 stroke-[3]" />
                    : <EyeOff className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-slate-400")} />}
                </button>
                <div className="flex-1 font-mono text-[15px]" style={{ color: p.color }}>
                  <span className="font-bold">{p.name}</span>
                  <span className={isDark ? "text-zinc-400" : "text-slate-400"}> = </span>
                  <span>({formatNum(p.x)}, {formatNum(p.y)})</span>
                </div>
                <button
                  onClick={() => deleteObject(p.id)}
                  className="opacity-0 group-hover/card:opacity-100 w-7 h-7 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 底栏: 重置 */}
          <div className={cn("flex flex-col gap-2 pt-3 border-t transition-colors duration-500", isDark ? "border-white/10" : "border-slate-200/80")}>
            <button
              onClick={handleReset}
              className={cn(
                "w-full py-2.5 rounded-xl border text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer",
                isDark 
                  ? "border-white/5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white" 
                  : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-650 hover:text-slate-800"
              )}
            >
              <RotateCcw className="w-4 h-4" />
              <span>重置全部</span>
            </button>
          </div>
        </div>
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-[38] w-6 h-28 flex items-center justify-center rounded-r-2xl border-y border-r transition-all duration-300 active:scale-y-95 cursor-pointer',
          isDark 
            ? 'bg-zinc-950/90 hover:bg-zinc-900 border-white/10 text-zinc-400 hover:text-white shadow-[4px_0_15px_rgba(0,0,0,0.5)]' 
            : 'bg-white hover:bg-slate-55 border-slate-200/80 text-slate-400 hover:text-slate-800 shadow-[4px_0_15px_rgba(0,0,0,0.03)]',
          preview ? 'hidden' : isSidebarCollapsed ? 'left-0' : embedded ? 'left-[364px]' : 'left-[400px]'
        )}
        title={isSidebarCollapsed ? '展开代数视图' : '收起代数视图'}
      >
        {isSidebarCollapsed ? <ChevronRight className="w-4.5 h-4.5" /> : <ChevronLeft className="w-4.5 h-4.5" />}
      </button>

      {/* ===== 2. 右侧绘图视图 ===== */}
      <div className={cn("flex-1 relative overflow-hidden z-[35] transition-colors duration-500", embedded ? "bg-transparent" : isDark ? "bg-[#121316]" : "bg-[#f8fafc]")}>
        {/* 数学黑板点状底纹 */}
        {!embedded && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: isDark 
                ? 'radial-gradient(circle, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)' 
                : 'radial-gradient(circle, rgba(0,0,0,0.08) 1.5px, transparent 1.5px)',
              backgroundSize: '32px 32px',
            }}
          />
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onPointerDown={(e) => {
            handleMouseDown(e as unknown as React.MouseEvent);
          }}
          onPointerMove={(e) => {
            if (isDragging || draggingPointId) {
              handleMouseMove(e as unknown as React.MouseEvent);
            }
          }}
          onPointerUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-crosshair touch-none"
        />

        {/* 缩放快捷条 (仅在操作模式或非嵌入模式下弹出显示) */}
        {(!embedded || interactMode === 'interact') && (
          <div className={cn(
            'absolute left-5 flex flex-col gap-1.5 backdrop-blur-md rounded-2xl p-1.5 select-none z-[36] border animate-in fade-in slide-in-from-bottom-3 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            embedded
              ? isDark
                ? 'bg-zinc-900/40 border-white/10 shadow-lg'
                : 'bg-white/40 border-slate-200/50 shadow-sm'
              : isDark 
                ? 'bg-zinc-900/75 border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]' 
                : 'bg-white/80 border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.06)]',
            keyboardOpen ? 'bottom-[420px]' : 'bottom-5'
          )}>
            <button
              onClick={() => {
                const c = canvasRef.current;
                if (!c) return;
                const { w, h } = getCanvasSize();
                const cx = w / 2;
                const cy = h / 2;
                const newScale = Math.min(MAX_SCALE, scale * 1.25);
                const mathX = (cx - origin.x) / scale;
                const mathY = (origin.y - cy) / scale;
                setScale(newScale);
                setOrigin(clampOrigin({ x: cx - mathX * newScale, y: cy + mathY * newScale }, newScale, w, h));
              }}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 cursor-pointer",
                isDark 
                  ? "text-zinc-300 hover:text-white hover:bg-white/10" 
                  : "text-slate-650 hover:text-slate-900 hover:bg-slate-100"
              )}
              title="放大"
            >
              <span className="text-lg font-bold">+</span>
            </button>
            <button
              onClick={() => {
                const c = canvasRef.current;
                if (!c) return;
                const { w, h } = getCanvasSize();
                const cx = w / 2;
                const cy = h / 2;
                const minScale = getMinScaleForCanvas(w, h);
                const newScale = Math.max(minScale, scale / 1.25);
                const mathX = (cx - origin.x) / scale;
                const mathY = (origin.y - cy) / scale;
                setScale(newScale);
                setOrigin(clampOrigin({ x: cx - mathX * newScale, y: cy + mathY * newScale }, newScale, w, h));
              }}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 cursor-pointer",
                isDark 
                  ? "text-zinc-300 hover:text-white hover:bg-white/10" 
                  : "text-slate-650 hover:text-slate-900 hover:bg-slate-100"
              )}
              title="缩小"
            >
              <span className="text-lg font-bold">−</span>
            </button>
            <div className={cn("w-full h-px my-0.5", isDark ? "bg-white/10" : "bg-slate-200")} />
            <button
              onClick={() => {
                const c = canvasRef.current;
                if (!c) return;
                const { w, h } = getCanvasSize();
                setScale(45);
                setOrigin({ x: w / 2, y: h / 2 });
              }}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 cursor-pointer",
                isDark 
                  ? "text-zinc-300 hover:text-white hover:bg-white/10" 
                  : "text-slate-650 hover:text-slate-900 hover:bg-slate-100"
              )}
              title="居中 (默认视野)"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
        )}


      </div>

      {/* ===== 3. 浮动数学键盘 (GeoGebra 风格) ===== */}
      <MathKeyboard
        visible={keyboardOpen}
        onClose={() => {
          setKeyboardOpen(false);
          inputRef.current?.blur();
          editInputRef.current?.blur();
        }}
        onInsert={insertAtCursor}
        onBackspace={handleBackspace}
        onArrow={handleArrow}
        onSubmit={() => {
          if (keyboardTarget === 'main') {
            handleSubmitInput();
          } else if (typeof keyboardTarget === 'object' && keyboardTarget.type === 'edit') {
            updateFunctionSource(keyboardTarget.id, editingValue);
            setEditingId(null);
            setKeyboardOpen(false);
          }
        }}
      />
    </div>
  );
}
