/**
 * 人教版高中物理：常量、科学计数法与公式绘制（斜体变量 + 下标/上标）。
 *
 * 公式 markup 约定：
 *   E_{k}  下标　　r^{2}  上标　　ε_{0}  希腊字母
 *   拉丁/希腊变量用斜体衬线；汉字、数字、运算符用正体。
 */

/** 静电力常量 k = 9.0×10⁹ N·m²/C²（人教版） */
export const K_COULOMB = 9.0e9;

/** 真空介电常量 ε₀ = 1/(4πk) C²/(N·m²) */
export const EPSILON_0 = 1 / (4 * Math.PI * K_COULOMB);

/**
 * 界面电荷读数单位：1 表示 1 μC = 10⁻⁶ C。
 * 位置按米 (m) 计，计算全部走 SI：E = kQ/r²，φ = kQ/r，F = qE。
 */
export const CHARGE_UI_TO_C = 1e-6;

export function chargeUiToCoulomb(qUi) {
  return Number(qUi || 0) * CHARGE_UI_TO_C;
}

const SUPER_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻',
};

/** 将整数指数转为上标字符，如 -3 → ⁻³ */
export function toSuperscript(exp) {
  const s = String(exp);
  let out = '';
  for (const ch of s) out += SUPER_MAP[ch] ?? ch;
  return out;
}

/**
 * 科学计数法 / 普通小数（人教版读数习惯）。
 * @param {number} value
 * @param {{ digits?: number, unit?: string, forceSci?: boolean }} [opts]
 */
export function formatPhysicsNumber(value, opts = {}) {
  const digits = opts.digits ?? 2;
  const unit = opts.unit ? ` ${opts.unit}` : '';
  const v = Number(value);
  if (!Number.isFinite(v)) return `—${unit}`;
  if (v === 0) return `0${unit}`;
  const abs = Math.abs(v);
  const useSci = opts.forceSci === true
    || abs >= 1000
    || (abs > 0 && abs < 0.01);
  if (useSci) {
    const exp = Math.floor(Math.log10(abs));
    const mant = v / 10 ** exp;
    return `${mant.toFixed(digits)}×10${toSuperscript(exp)}${unit}`;
  }
  // 中等量级：保留有效数字感
  if (abs >= 100) return `${v.toFixed(Math.max(0, digits - 1))}${unit}`;
  if (abs >= 10) return `${v.toFixed(digits)}${unit}`;
  return `${v.toFixed(digits + 1)}${unit}`;
}

/**
 * 将 markup 拆成绘制 token。
 * @returns {{ kind: 'var'|'text'|'sub'|'sup'|'cn', text: string }[]}
 */
export function tokenizeFormula(formula) {
  const s = String(formula || '');
  const tokens = [];
  let i = 0;

  const isCjk = (ch) => /[\u3000-\u9fff\uff00-\uffef]/.test(ch);
  const isVarStart = (ch) => /[A-Za-zΑ-Ωα-ωΦφθΘεεΔδπμνλρστω]/.test(ch);

  while (i < s.length) {
    if (s[i] === '_' && s[i + 1] === '{') {
      const end = s.indexOf('}', i + 2);
      if (end !== -1) {
        tokens.push({ kind: 'sub', text: s.slice(i + 2, end) });
        i = end + 1;
        continue;
      }
    }
    if (s[i] === '^' && s[i + 1] === '{') {
      const end = s.indexOf('}', i + 2);
      if (end !== -1) {
        tokens.push({ kind: 'sup', text: s.slice(i + 2, end) });
        i = end + 1;
        continue;
      }
    }
    // 单字符上标 ^2
    if (s[i] === '^' && i + 1 < s.length && /[0-9+\-−]/.test(s[i + 1])) {
      tokens.push({ kind: 'sup', text: s[i + 1] });
      i += 2;
      continue;
    }

    const ch = s[i];
    if (isCjk(ch)) {
      let j = i + 1;
      while (j < s.length && isCjk(s[j])) j += 1;
      tokens.push({ kind: 'cn', text: s.slice(i, j) });
      i = j;
      continue;
    }

    if (isVarStart(ch)) {
      // 单字母变量（物理习惯）；连续字母如 cos 作正体函数名
      if (i + 2 < s.length && /[a-z]{2}/i.test(s.slice(i, i + 2)) && !/[A-Z]/.test(ch)) {
        let j = i;
        while (j < s.length && /[a-z]/.test(s[j])) j += 1;
        tokens.push({ kind: 'text', text: s.slice(i, j) });
        i = j;
        continue;
      }
      tokens.push({ kind: 'var', text: ch });
      i += 1;
      continue;
    }

    // 数字、运算符、空格、标点
    let j = i + 1;
    while (
      j < s.length
      && !isCjk(s[j])
      && !isVarStart(s[j])
      && s[j] !== '_'
      && s[j] !== '^'
    ) {
      j += 1;
    }
    tokens.push({ kind: 'text', text: s.slice(i, j) });
    i = j;
  }
  return tokens;
}

/**
 * 测量公式像素宽度。
 */
export function measureMathFormula(ctx, formula, fontSize = 18) {
  const tokens = tokenizeFormula(formula);
  const size = fontSize;
  const subSize = Math.max(10, Math.round(size * 0.62));
  let w = 0;
  for (const tok of tokens) {
    if (tok.kind === 'var') {
      ctx.font = `italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      w += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'cn') {
      ctx.font = `${size}px "SimSun", "Songti SC", "Microsoft YaHei", serif`;
      w += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'sub' || tok.kind === 'sup') {
      ctx.font = `${subSize}px "Times New Roman", "SimSun", "Microsoft YaHei", serif`;
      w += ctx.measureText(tok.text).width * 0.96;
    } else {
      ctx.font = `${size}px "Times New Roman", "Cambria Math", serif`;
      w += ctx.measureText(tok.text).width;
    }
  }
  return w;
}

/**
 * 在 canvas 上绘制人教版风格公式。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} formula markup，如 "E=kQ/r^{2}"、"Φ_{E}=Q_{内}/ε_{0}"
 * @param {number} x 基线起点（align=left）或中心（align=center）
 * @param {number} y 字母基线 y
 * @param {{ fontSize?: number, color?: string, align?: 'left'|'center', maxWidth?: number }} [opts]
 * @returns {{ width: number, height: number }}
 */
export function drawMathFormula(ctx, formula, x, y, opts = {}) {
  const size = opts.fontSize || 18;
  const color = opts.color || '#0c4a6e';
  const align = opts.align || 'left';
  const subSize = Math.max(10, Math.round(size * 0.62));
  const tokens = tokenizeFormula(formula);

  let totalW = measureMathFormula(ctx, formula, size);
  if (opts.maxWidth && totalW > opts.maxWidth) {
    // 略缩以适配窄栏
    const scale = opts.maxWidth / totalW;
    return drawMathFormula(ctx, formula, x, y, {
      ...opts,
      fontSize: Math.max(11, Math.floor(size * scale)),
      maxWidth: undefined,
    });
  }

  let penX = align === 'center' ? x - totalW / 2 : x;
  const startX = penX;

  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  for (const tok of tokens) {
    if (tok.kind === 'var') {
      ctx.font = `italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      ctx.fillText(tok.text, penX, y);
      penX += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'cn') {
      ctx.font = `${size}px "SimSun", "Songti SC", "Microsoft YaHei", serif`;
      ctx.fillText(tok.text, penX, y);
      penX += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'sub') {
      ctx.font = `${subSize}px "Times New Roman", "SimSun", "Microsoft YaHei", serif`;
      // 若下标含中文，用宋体更清晰
      if (/[\u3000-\u9fff]/.test(tok.text)) {
        ctx.font = `${subSize}px "SimSun", "Songti SC", "Microsoft YaHei", serif`;
      }
      const sw = ctx.measureText(tok.text).width;
      ctx.fillText(tok.text, penX, y + size * 0.28);
      penX += sw * 0.96;
    } else if (tok.kind === 'sup') {
      ctx.font = `${subSize}px "Times New Roman", "Cambria Math", serif`;
      const sw = ctx.measureText(tok.text).width;
      ctx.fillText(tok.text, penX, y - size * 0.42);
      penX += sw * 0.96;
    } else {
      ctx.font = `${size}px "Times New Roman", "Cambria Math", serif`;
      ctx.fillText(tok.text, penX, y);
      penX += ctx.measureText(tok.text).width;
    }
  }

  ctx.restore();
  return { width: penX - startX, height: size * 1.35 };
}

/** 库仑场强矢量：E = kQ r̂ / r²（SI） */
export function coulombFieldContribution(qUi, dx, dy, dz, minR = 0.04) {
  const Q = chargeUiToCoulomb(qUi);
  if (Math.abs(Q) < 1e-20) return { x: 0, y: 0, z: 0 };
  const r2 = dx * dx + dy * dy + dz * dz;
  const minR2 = minR * minR;
  if (r2 < minR2) return { x: 0, y: 0, z: 0 };
  const r = Math.sqrt(r2);
  const scale = (K_COULOMB * Q) / (r2 * r);
  return { x: dx * scale, y: dy * scale, z: dz * scale };
}

/** 电势：φ = kQ / r（无穷远为零） */
export function coulombPotentialContribution(qUi, r, minR = 0.04) {
  const Q = chargeUiToCoulomb(qUi);
  return (K_COULOMB * Q) / Math.max(minR, r);
}
