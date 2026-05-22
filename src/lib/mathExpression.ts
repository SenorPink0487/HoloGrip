/**
 * 轻量级数学表达式解析引擎 (Shunting-Yard + AST)
 * 
 * 支持:
 *  - 四则运算 + - * / ^ ( )
 *  - 隐式乘法: 2x, 3sin(x), (x+1)(x-1)
 *  - 一元函数: sin cos tan asin acos atan sinh cosh tanh
 *             ln log sqrt abs exp floor ceil round sign
 *  - 二元函数: max min pow atan2 mod
 *  - 常量: pi, e, π
 *  - 自定义变量绑定 (滑动条/x)
 */

export type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const ONE_ARG_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'ln', 'log', 'log10', 'log2',
  'sqrt', 'cbrt', 'abs', 'exp',
  'floor', 'ceil', 'round', 'sign',
]);

const TWO_ARG_FUNCS = new Set(['max', 'min', 'pow', 'atan2', 'mod']);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  inf: Infinity,
};

const PRECEDENCE: Record<string, number> = {
  '+': 1, '-': 1,
  '*': 2, '/': 2, '%': 2,
  // 一元负号: 优先级低于 ^,以匹配数学惯例 -x^2 = -(x^2)
  'u-': 3,
  'u+': 3,
  '^': 4,
};

const RIGHT_ASSOC = new Set(['^', 'u-', 'u+']);

// ==================== 词法分析 ====================
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input.replace(/\s+/g, '');

  while (i < src.length) {
    const ch = src[i];

    // 数字 (含小数)
    if (/[0-9.]/.test(ch)) {
      let j = i;
      let dot = false;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        if (src[j] === '.') {
          if (dot) break;
          dot = true;
        }
        j++;
      }
      // 科学计数 e+10 / e-3
      if (j < src.length && (src[j] === 'e' || src[j] === 'E')) {
        // 必须紧跟 + - 或数字
        if (j + 1 < src.length && /[0-9+\-]/.test(src[j + 1])) {
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
      }
      tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }

    // 标识符 (变量/函数/常量)
    if (/[a-zA-Zπ_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_π]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }

    // 运算符
    if ('+-*/^%'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }

    throw new Error(`未识别的字符: "${ch}" (位置 ${i})`);
  }

  return tokens;
}

// ==================== 隐式乘法插入 ====================
function insertImplicitMul(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    out.push(cur);
    if (i + 1 >= tokens.length) continue;
    const nxt = tokens[i + 1];

    const isCurValue =
      cur.type === 'num' || cur.type === 'rparen' ||
      (cur.type === 'ident' && !ONE_ARG_FUNCS.has(cur.value) && !TWO_ARG_FUNCS.has(cur.value));
    const isNxtStart =
      nxt.type === 'num' || nxt.type === 'lparen' || nxt.type === 'ident';

    // 但是数字后跟标识符: 2x, 3sin(x) 都需要插入
    // 标识符后跟左括号若是函数则不插
    if (cur.type === 'ident' && (ONE_ARG_FUNCS.has(cur.value) || TWO_ARG_FUNCS.has(cur.value)) && nxt.type === 'lparen') {
      continue;
    }

    if (isCurValue && isNxtStart) {
      out.push({ type: 'op', value: '*' });
    }
  }
  return out;
}

// ==================== Shunting-Yard 转 RPN ====================
type RPNToken =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'op'; value: string }
  | { type: 'fn'; name: string; arity: number };

function toRPN(tokens: Token[]): RPNToken[] {
  const out: RPNToken[] = [];
  const ops: Array<{ type: 'op' | 'fn' | 'lparen'; value?: string; name?: string; argCount?: number }> = [];
  let prevType: 'value' | 'op' | 'lparen' | null = null;

  const isFunc = (s: string) => ONE_ARG_FUNCS.has(s) || TWO_ARG_FUNCS.has(s);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === 'num') {
      out.push({ type: 'num', value: t.value });
      prevType = 'value';
      continue;
    }

    if (t.type === 'ident') {
      if (isFunc(t.value)) {
        ops.push({ type: 'fn', name: t.value, argCount: 1 });
        prevType = 'op';
      } else {
        // 变量或常量
        if (CONSTANTS[t.value] !== undefined) {
          out.push({ type: 'num', value: CONSTANTS[t.value] });
        } else {
          out.push({ type: 'var', name: t.value });
        }
        prevType = 'value';
      }
      continue;
    }

    if (t.type === 'op') {
      let opVal = t.value;
      // 一元 +/-
      if ((opVal === '-' || opVal === '+') && (prevType === null || prevType === 'op' || prevType === 'lparen')) {
        opVal = opVal === '-' ? 'u-' : 'u+';
      }

      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === 'lparen') break;
        if (top.type === 'fn') {
          out.push({ type: 'fn', name: top.name!, arity: top.argCount || 1 });
          ops.pop();
          continue;
        }
        const topPrec = PRECEDENCE[top.value!] ?? 0;
        const curPrec = PRECEDENCE[opVal] ?? 0;
        if (topPrec > curPrec || (topPrec === curPrec && !RIGHT_ASSOC.has(opVal))) {
          out.push({ type: 'op', value: top.value! });
          ops.pop();
        } else {
          break;
        }
      }
      ops.push({ type: 'op', value: opVal });
      prevType = 'op';
      continue;
    }

    if (t.type === 'lparen') {
      ops.push({ type: 'lparen' });
      prevType = 'lparen';
      continue;
    }

    if (t.type === 'rparen') {
      while (ops.length && ops[ops.length - 1].type !== 'lparen') {
        const top = ops.pop()!;
        if (top.type === 'op') out.push({ type: 'op', value: top.value! });
        else if (top.type === 'fn') out.push({ type: 'fn', name: top.name!, arity: top.argCount || 1 });
      }
      if (!ops.length) throw new Error('括号不匹配');
      ops.pop();
      // 如果上层就是函数，把它弹出
      if (ops.length && ops[ops.length - 1].type === 'fn') {
        const f = ops.pop()!;
        out.push({ type: 'fn', name: f.name!, arity: f.argCount || 1 });
      }
      prevType = 'value';
      continue;
    }

    if (t.type === 'comma') {
      // 函数参数分隔: 弹出运算符到 lparen
      while (ops.length && ops[ops.length - 1].type !== 'lparen') {
        const top = ops.pop()!;
        if (top.type === 'op') out.push({ type: 'op', value: top.value! });
        else if (top.type === 'fn') out.push({ type: 'fn', name: top.name!, arity: top.argCount || 1 });
      }
      // 找到最近的函数 (位于 lparen 之前)
      // 简化处理: 只增加最外层 fn 的 argCount
      for (let k = ops.length - 1; k >= 0; k--) {
        if (ops[k].type === 'fn') {
          ops[k].argCount = (ops[k].argCount || 1) + 1;
          break;
        }
        if (ops[k].type === 'lparen') break;
      }
      prevType = 'op';
      continue;
    }
  }

  while (ops.length) {
    const top = ops.pop()!;
    if (top.type === 'lparen') throw new Error('括号不匹配');
    if (top.type === 'op') out.push({ type: 'op', value: top.value! });
    else if (top.type === 'fn') out.push({ type: 'fn', name: top.name!, arity: top.argCount || 1 });
  }

  return out;
}

// ==================== 编译为快速求值闭包 ====================
export interface CompiledExpression {
  /** 求值: 传入变量字典 (如 { x: 0.5, a: 2 }) */
  evaluate(scope: Record<string, number>): number;
  /** 表达式中引用到的所有自由变量名 */
  variables: string[];
  /** 原始表达式文本 */
  source: string;
}

export function compile(source: string): CompiledExpression {
  const tokens = insertImplicitMul(tokenize(source));
  const rpn = toRPN(tokens);

  const variables = new Set<string>();
  for (const t of rpn) {
    if (t.type === 'var') variables.add(t.name);
  }

  // 编译期验证: 用 dummy 值跑一遍堆栈, 检查 token 数量是否平衡
  validateRPN(rpn);

  const evaluate = (scope: Record<string, number>): number => {
    const stack: number[] = [];

    for (const t of rpn) {
      if (t.type === 'num') {
        stack.push(t.value);
      } else if (t.type === 'var') {
        const v = scope[t.name];
        if (v === undefined) {
          // 默认按 0 处理，避免 throw 卡死渲染
          stack.push(NaN);
        } else {
          stack.push(v);
        }
      } else if (t.type === 'op') {
        if (t.value === 'u-') {
          if (stack.length < 1) return NaN;
          stack.push(-stack.pop()!);
        } else if (t.value === 'u+') {
          if (stack.length < 1) return NaN;
        } else {
          if (stack.length < 2) return NaN;
          const b = stack.pop()!;
          const a = stack.pop()!;
          switch (t.value) {
            case '+': stack.push(a + b); break;
            case '-': stack.push(a - b); break;
            case '*': stack.push(a * b); break;
            case '/': stack.push(a / b); break;
            case '^': stack.push(Math.pow(a, b)); break;
            case '%': stack.push(a % b); break;
            default: throw new Error('未知运算符: ' + t.value);
          }
        }
      } else if (t.type === 'fn') {
        if (t.arity === 1) {
          if (stack.length < 1) return NaN;
          const a = stack.pop()!;
          switch (t.name) {
            case 'sin': stack.push(Math.sin(a)); break;
            case 'cos': stack.push(Math.cos(a)); break;
            case 'tan': stack.push(Math.tan(a)); break;
            case 'asin': stack.push(Math.asin(a)); break;
            case 'acos': stack.push(Math.acos(a)); break;
            case 'atan': stack.push(Math.atan(a)); break;
            case 'sinh': stack.push(Math.sinh(a)); break;
            case 'cosh': stack.push(Math.cosh(a)); break;
            case 'tanh': stack.push(Math.tanh(a)); break;
            case 'ln': stack.push(Math.log(a)); break;
            case 'log': stack.push(Math.log10(a)); break;
            case 'log10': stack.push(Math.log10(a)); break;
            case 'log2': stack.push(Math.log2(a)); break;
            case 'sqrt': stack.push(Math.sqrt(a)); break;
            case 'cbrt': stack.push(Math.cbrt(a)); break;
            case 'abs': stack.push(Math.abs(a)); break;
            case 'exp': stack.push(Math.exp(a)); break;
            case 'floor': stack.push(Math.floor(a)); break;
            case 'ceil': stack.push(Math.ceil(a)); break;
            case 'round': stack.push(Math.round(a)); break;
            case 'sign': stack.push(Math.sign(a)); break;
            default: throw new Error('未知函数: ' + t.name);
          }
        } else if (t.arity === 2) {
          const b = stack.pop()!;
          const a = stack.pop()!;
          switch (t.name) {
            case 'max': stack.push(Math.max(a, b)); break;
            case 'min': stack.push(Math.min(a, b)); break;
            case 'pow': stack.push(Math.pow(a, b)); break;
            case 'atan2': stack.push(Math.atan2(a, b)); break;
            case 'mod': stack.push(((a % b) + b) % b); break;
            default: throw new Error('未知二元函数: ' + t.name);
          }
        }
      }
    }
    return stack.length ? stack[stack.length - 1] : NaN;
  };

  return {
    evaluate,
    variables: Array.from(variables),
    source,
  };
}

/** 安全编译: 失败返回 null */
export function tryCompile(source: string): CompiledExpression | null {
  try {
    if (!source.trim()) return null;
    return compile(source);
  } catch {
    return null;
  }
}

// ==================== 数值方法: 零点/极值 ====================

/** 在 [a,b] 上用变号法采样查找零点 */
export function findRoots(
  fn: (x: number) => number,
  a: number,
  b: number,
  samples = 800
): number[] {
  const roots: number[] = [];
  const step = (b - a) / samples;
  const eps = Math.max(1e-9, Math.abs(b - a) * 1e-12);

  let prevX = a;
  let prevY = fn(a);
  if (isFinite(prevY) && Math.abs(prevY) < eps) roots.push(prevX);

  for (let i = 1; i <= samples; i++) {
    const x = a + i * step;
    const y = fn(x);
    if (!isFinite(y) || !isFinite(prevY)) {
      prevX = x; prevY = y; continue;
    }

    // 1) 当前样本点恰好为零
    if (Math.abs(y) < eps) {
      if (!roots.some(rr => Math.abs(rr - x) < step * 0.5)) roots.push(x);
    }
    // 2) 严格变号 → 二分细化
    else if (prevY * y < 0) {
      let lo = prevX, hi = x;
      let fLo = prevY;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        const fMid = fn(mid);
        if (!isFinite(fMid)) break;
        if (Math.abs(fMid) < 1e-12) { lo = hi = mid; break; }
        if (fLo * fMid < 0) { hi = mid; } else { lo = mid; fLo = fMid; }
      }
      const r = (lo + hi) / 2;
      if (!roots.some(rr => Math.abs(rr - r) < step * 0.5)) roots.push(r);
    }

    prevX = x; prevY = y;
  }
  return roots;
}

/** 数值导数 (中心差分) */
export function numericDerivative(fn: (x: number) => number, x: number, h = 1e-5): number {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

/** 在 [a,b] 上查找极值点 (一阶导数变号) */
export function findExtrema(
  fn: (x: number) => number,
  a: number,
  b: number,
  samples = 600
): Array<{ x: number; y: number; kind: 'max' | 'min' }> {
  const result: Array<{ x: number; y: number; kind: 'max' | 'min' }> = [];
  const step = (b - a) / samples;
  let prevD = numericDerivative(fn, a);
  let prevX = a;

  for (let i = 1; i <= samples; i++) {
    const x = a + i * step;
    const d = numericDerivative(fn, x);
    if (!isFinite(d) || !isFinite(prevD)) { prevD = d; prevX = x; continue; }
    if (prevD * d < 0) {
      // 在 [prevX, x] 内导数变号 → 二分细化
      let lo = prevX, hi = x;
      let fLo = prevD;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        const dm = numericDerivative(fn, mid);
        if (!isFinite(dm)) break;
        if (Math.abs(dm) < 1e-10) { lo = hi = mid; break; }
        if (fLo * dm < 0) { hi = mid; } else { lo = mid; fLo = dm; }
      }
      const ex = (lo + hi) / 2;
      const ey = fn(ex);
      if (isFinite(ey)) {
        const kind = prevD > 0 ? 'max' : 'min';
        if (!result.some(r => Math.abs(r.x - ex) < step * 0.5)) {
          result.push({ x: ex, y: ey, kind });
        }
      }
    }
    prevD = d; prevX = x;
  }
  return result;
}


// ==================== 编译期 RPN 验证 ====================
function validateRPN(rpn: RPNToken[]): void {
  let stackSize = 0;
  for (const t of rpn) {
    if (t.type === 'num' || t.type === 'var') {
      stackSize++;
    } else if (t.type === 'op') {
      if (t.value === 'u-' || t.value === 'u+') {
        if (stackSize < 1) throw new Error('表达式不完整');
        // 一元: 1 进 1 出
      } else {
        if (stackSize < 2) throw new Error('表达式不完整');
        stackSize -= 1; // 二元: 2 进 1 出
      }
    } else if (t.type === 'fn') {
      if (stackSize < t.arity) throw new Error(`函数 ${t.name} 缺少参数`);
      stackSize -= t.arity - 1; // arity 进 1 出
    }
  }
  if (stackSize !== 1) throw new Error('表达式不完整或多余');
}
