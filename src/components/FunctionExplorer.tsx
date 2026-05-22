import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
  Sliders, RotateCcw, Eye, EyeOff,
  ChevronLeft, ChevronRight, Activity,
  Plus, Trash2, Sigma, AlertCircle, Crosshair, Keyboard
} from 'lucide-react';
import { tryCompile, findRoots, findExtrema, type CompiledExpression } from '../lib/mathExpression';
import { MathKeyboard } from './MathKeyboard';

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

// ============================================================
// 主组件
// ============================================================

export function FunctionExplorer() {
  // ---------- 侧栏 ----------
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // ---------- 对象列表 (代数视图) ----------
  const [objects, setObjects] = useState<GeoObject[]>(() => {
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
  const [hasInitializedOrigin, setHasInitializedOrigin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOriginStart = useRef({ x: 0, y: 0 });

  // ---------- 显示开关 ----------
  const [showLabels, setShowLabels] = useState(true);
  const [showFeaturePoints, setShowFeaturePoints] = useState(true);
  const [showTrace, setShowTrace] = useState(true);

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
    // 数学单位的极限
    const L = MATH_SPACE_LIMIT;
    // origin 的左侧最多让 -L 出现在 left=0 处 → origin.x ≥ -L*scale (即数学 0 在 -L*scale 像素位置)
    // origin 的右侧最多让 +L 出现在 right=canvasW 处 → origin.x ≤ canvasW + L*scale ... 不对
    // 正确做法: 屏幕可见 x ∈ [-origin.x/s, (canvasW-origin.x)/s]
    //   要求 -L ≤ -origin.x/s  →  origin.x ≤ L*s
    //   要求 (canvasW-origin.x)/s ≤ L  →  origin.x ≥ canvasW - L*s
    const minOx = canvasW - L * s;
    const maxOx = L * s;
    const minOy = canvasH - L * s;
    const maxOy = L * s;
    // 当 maxOx < minOx (即 2L*s < canvasW),整个 ±L 都在屏幕里, 居中
    let nx = o.x;
    let ny = o.y;
    if (maxOx < minOx) nx = canvasW / 2;
    else nx = Math.min(maxOx, Math.max(minOx, o.x));
    if (maxOy < minOy) ny = canvasH / 2;
    else ny = Math.min(maxOy, Math.max(minOy, o.y));
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

    // 小网格
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
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
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let x = Math.ceil(xMin / major) * major; x <= xMax; x += major) {
      const px = origin.x + x * scale;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    }
    for (let y = Math.ceil(yMin / major) * major; y <= yMax; y += major) {
      const py = origin.y - y * scale;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }

    // ---- 2. 坐标轴 ----
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    // X 轴
    ctx.beginPath();
    ctx.moveTo(0, origin.y); ctx.lineTo(W, origin.y); ctx.stroke();
    // Y 轴
    ctx.beginPath();
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, H); ctx.stroke();

    // 箭头
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(W, origin.y); ctx.lineTo(W - 9, origin.y - 4); ctx.lineTo(W - 9, origin.y + 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x - 4, 9); ctx.lineTo(origin.x + 4, 9);
    ctx.closePath(); ctx.fill();

    // ---- 3. 坐标刻度文字 ----
    if (showLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
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
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
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
              ctx.shadowBlur = 6;
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
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, origin.y); ctx.lineTo(px, py);
        ctx.moveTo(origin.x, py); ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);
        // 圆点
        ctx.fillStyle = fn.color;
        ctx.shadowBlur = 14;
        ctx.shadowColor = fn.glowColor;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff';
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
        ctx.fillStyle = 'rgba(15,17,23,0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(bx, by, bw, bh, 6);
        } else {
          ctx.rect(bx, by, bw, bh);
        }
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
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
      ctx.strokeStyle = '#fff';
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
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, draggingPointId === p.id ? 8 : 6.5, 0, Math.PI * 2); ctx.stroke();
      // 标签
      if (showLabels) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px system-ui';
        ctx.fillText(p.name, px + 10, py - 8);
        ctx.font = '11px Menlo, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
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
      ctx.fillStyle = 'rgba(15,17,23,0.95)';
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(bx, by, bw, bh, 6);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(hoveredFeature.label, bx + 8, by + 17);
      ctx.restore();
    }
  }, [
    functions, points, scale, origin, showLabels, showTrace, traceCursor,
    allFeaturePoints, hoveredFeature, draggingPointId, evalFunc
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
  return (
    <div className="w-full h-full flex bg-[#0c0d0e] select-none relative text-white overflow-hidden">

      {/* ===== 1. 左侧 GeoGebra 风格代数视图 ===== */}
      <div
        className={cn(
          'h-full border-r border-white/10 bg-zinc-950/80 backdrop-blur-2xl flex flex-col transition-all duration-300 relative z-[35] shadow-[10px_0_30px_rgba(0,0,0,0.5)] select-none overflow-hidden',
          isSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0 pointer-events-none' : 'w-[400px] opacity-100'
        )}
      >
        <div className="w-[400px] h-full flex flex-col shrink-0 px-6 pt-6 pb-4 gap-4">

          {/* 标题 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 text-cyan-400">
              <Activity className="w-6 h-6 animate-pulse" />
              <h2 className="text-2xl font-extrabold tracking-wide text-white">代数 Algebra</h2>
            </div>
            <p className="text-zinc-400 text-sm">输入函数、参数或点,自由组合</p>
          </div>

          {/* 表达式输入条 */}
          <div className="flex flex-col gap-1.5">
            <div className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-900/70 border transition-all',
              inputError ? 'border-red-500/50' : 'border-white/10 focus-within:border-cyan-400/60 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.15)]'
            )}>
              <Sigma className="w-4 h-4 text-cyan-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInput(); }}
                onFocus={() => { setKeyboardTarget('main'); setKeyboardOpen(true); }}
                onBlur={(e) => {
                  const next = e.relatedTarget as HTMLElement | null;
                  if (next && next.closest && next.closest('[data-mathkbd]')) return;
                  setKeyboardOpen(false);
                }}
                // 只读 inputMode 防系统键盘弹出 (移动端);桌面键盘照常可用
                inputMode="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="f(x)=sin(a*x)+b   ·   a=2   ·   (1,2)"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500 font-mono"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setKeyboardTarget('main'); setKeyboardOpen(v => !v); inputRef.current?.focus(); }}
                className={cn(
                  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95',
                  keyboardOpen ? 'bg-cyan-500/30 text-cyan-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                )}
                title={keyboardOpen ? '收起键盘' : '展开数学键盘'}
              >
                <Keyboard className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmitInput}
                className="shrink-0 w-7 h-7 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 flex items-center justify-center transition-colors active:scale-95"
                title="添加"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {inputError && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 px-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{inputError}</span>
              </div>
            )}
          </div>

          {/* 对象列表 */}
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            <div className="text-xs font-bold text-zinc-300 tracking-wider uppercase border-b border-white/10 pb-2 sticky top-0 bg-zinc-950/80 backdrop-blur-md z-[1]">
              对象列表 · {objects.length}
            </div>

            {objects.length === 0 && (
              <div className="text-center text-zinc-500 text-sm py-12">
                <p>暂无对象</p>
                <p className="text-xs text-zinc-600 mt-2">在上方输入框创建第一个对象</p>
              </div>
            )}

            {/* === 函数卡片 === */}
            {functions.map(fn => {
              const isEditing = editingId === fn.id;
              return (
                <div
                  key={fn.id}
                  className={cn(
                    'p-3 rounded-2xl border transition-all flex flex-col gap-2 bg-zinc-900/40 group/card',
                    fn.visible ? 'border-white/10' : 'border-transparent opacity-50'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* 显隐切换 */}
                    <button
                      onClick={() => updateObject(fn.id, { visible: !fn.visible } as Partial<FunctionObject>)}
                      className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                      style={{
                        backgroundColor: fn.visible ? fn.color : 'transparent',
                        borderColor: fn.color,
                      }}
                      title={fn.visible ? '隐藏' : '显示'}
                    >
                      {fn.visible
                        ? <Eye className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />
                        : <EyeOff className="w-3.5 h-3.5 text-zinc-400" />}
                    </button>

                    {/* 名称 */}
                    <div className="font-mono font-bold text-sm shrink-0" style={{ color: fn.color }}>
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
                        onBlur={(e) => {
                          // 如果焦点移到键盘 (具有 mathkbd 类) 上,不真正 commit;由键盘内部处理
                          const next = e.relatedTarget as HTMLElement | null;
                          if (next && next.closest && next.closest('[data-mathkbd]')) return;
                          updateFunctionSource(fn.id, editingValue);
                          setEditingId(null);
                          setKeyboardOpen(false);
                        }}
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
                        className="flex-1 min-w-0 bg-zinc-950/60 border border-cyan-400/40 rounded-md px-2 py-0.5 text-sm font-mono text-white outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(fn.id); setEditingValue(fn.source); }}
                        className="flex-1 min-w-0 text-left text-sm font-mono truncate hover:text-white transition-colors"
                        style={{ color: fn.visible ? fn.color : '#a1a1aa' }}
                        title="点击编辑"
                      >
                        {prettifyExpression(fn.source)}
                      </button>
                    )}

                    {/* 删除 */}
                    <button
                      onClick={() => deleteObject(fn.id)}
                      className="opacity-0 group-hover/card:opacity-100 w-6 h-6 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {fn.error && (
                    <div className="text-xs text-red-400 ml-9 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>{fn.error}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* === 滑动条卡片 === */}
            {sliders.length > 0 && (
              <div className="text-xs font-bold text-zinc-400 tracking-wider uppercase pt-2 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>滑动条 · {sliders.length}</span>
              </div>
            )}
            {sliders.map(sl => (
              <div
                key={sl.id}
                className="p-3 rounded-2xl border border-white/10 bg-zinc-900/40 flex flex-col gap-2.5 group/card"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-xs"
                    style={{ borderColor: sl.color, color: sl.color, backgroundColor: `${sl.color}20` }}
                  >
                    {sl.name}
                  </div>
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-sm text-zinc-300 font-mono">=</span>
                    <span className="text-sm font-mono font-bold" style={{ color: sl.color }}>
                      {sl.value.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      [{sl.min}, {sl.max}]
                    </span>
                  </div>
                  <button
                    onClick={() => deleteObject(sl.id)}
                    className="opacity-0 group-hover/card:opacity-100 w-6 h-6 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0"
                    title="删除"
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
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: sl.color }}
                />
                {/* 范围微调 */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <input
                    type="number"
                    value={sl.min}
                    onChange={(e) => updateObject(sl.id, { min: parseFloat(e.target.value) || sl.min } as Partial<SliderObject>)}
                    className="w-14 bg-zinc-950/60 border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 outline-none focus:border-cyan-400/40 font-mono"
                    step={0.5}
                  />
                  <span className="text-zinc-600">〜</span>
                  <input
                    type="number"
                    value={sl.max}
                    onChange={(e) => updateObject(sl.id, { max: parseFloat(e.target.value) || sl.max } as Partial<SliderObject>)}
                    className="w-14 bg-zinc-950/60 border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 outline-none focus:border-cyan-400/40 font-mono"
                    step={0.5}
                  />
                  <span className="ml-auto text-zinc-500">步长</span>
                  <input
                    type="number"
                    value={sl.step}
                    onChange={(e) => updateObject(sl.id, { step: parseFloat(e.target.value) || sl.step } as Partial<SliderObject>)}
                    className="w-12 bg-zinc-950/60 border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 outline-none focus:border-cyan-400/40 font-mono"
                    step={0.01}
                    min={0.001}
                  />
                </div>
              </div>
            ))}

            {/* === 自由点卡片 === */}
            {points.length > 0 && (
              <div className="text-xs font-bold text-zinc-400 tracking-wider uppercase pt-2 flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-pink-400" />
                <span>点 · {points.length}</span>
              </div>
            )}
            {points.map(p => (
              <div
                key={p.id}
                className="p-3 rounded-2xl border border-white/10 bg-zinc-900/40 flex items-center gap-2.5 group/card"
              >
                <button
                  onClick={() => updateObject(p.id, { visible: !p.visible } as Partial<PointObject>)}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all"
                  style={{
                    backgroundColor: p.visible ? p.color : 'transparent',
                    borderColor: p.color,
                  }}
                >
                  {p.visible
                    ? <Eye className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />
                    : <EyeOff className="w-3.5 h-3.5 text-zinc-400" />}
                </button>
                <div className="flex-1 font-mono text-sm" style={{ color: p.color }}>
                  <span className="font-bold">{p.name}</span>
                  <span className="text-zinc-400"> = </span>
                  <span>({formatNum(p.x)}, {formatNum(p.y)})</span>
                </div>
                <button
                  onClick={() => deleteObject(p.id)}
                  className="opacity-0 group-hover/card:opacity-100 w-6 h-6 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* 底栏: 重置 */}
          <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
            <button
              onClick={handleReset}
              className="w-full py-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重置全部</span>
            </button>
          </div>
        </div>
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-[38] w-6 h-28 bg-zinc-950/90 hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center rounded-r-2xl border-y border-r border-white/10 shadow-[4px_0_15px_rgba(0,0,0,0.5)] transition-all duration-300 active:scale-y-95 cursor-pointer',
          isSidebarCollapsed ? 'left-0' : 'left-[400px]'
        )}
        title={isSidebarCollapsed ? '展开代数视图' : '收起代数视图'}
      >
        {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* ===== 2. 右侧绘图视图 ===== */}
      <div className="flex-1 relative overflow-hidden bg-[#121316] z-[35]">
        {/* 数学黑板点状底纹 */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full"
        />

        {/* 缩放快捷条 (左下;键盘弹出时上移避让) */}
        <div className={cn(
          'absolute left-5 flex flex-col gap-1.5 bg-zinc-900/75 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 shadow-2xl select-none z-[36] transition-all duration-300',
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
            className="w-9 h-9 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
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
            className="w-9 h-9 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
            title="缩小"
          >
            <span className="text-lg font-bold">−</span>
          </button>
          <div className="w-full h-px bg-white/10 my-0.5" />
          <button
            onClick={() => {
              const c = canvasRef.current;
              if (!c) return;
              const { w, h } = getCanvasSize();
              setScale(45);
              setOrigin({ x: w / 2, y: h / 2 });
            }}
            className="w-9 h-9 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
            title="居中 (默认视野)"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const c = canvasRef.current;
              if (!c) return;
              const { w, h } = getCanvasSize();
              const fitScale = Math.min(w, h) / (2 * MATH_SPACE_LIMIT) * 0.95;
              setScale(Math.max(getMinScaleForCanvas(w, h), fitScale));
              setOrigin({ x: w / 2, y: h / 2 });
            }}
            className="w-9 h-9 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
            title="全景 (±300 视野)"
          >
            <span className="text-[10px] font-bold tracking-tighter">±300</span>
          </button>
        </div>

        {/* 当前缩放比 (左下角文字) */}
        <div className={cn(
          'absolute left-20 text-[10px] font-mono text-zinc-500 select-none transition-all duration-300',
          keyboardOpen ? 'bottom-[423px]' : 'bottom-8'
        )}>
          1 : {scale.toFixed(0)}px
        </div>
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
