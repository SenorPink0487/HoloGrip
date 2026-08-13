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

/** 物理仿真系统字体栈标准 */
export const FONT_STACKS = {
  /** UI 文本、按钮、菜单、提示与动态读数 */
  ui: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  /** 物理数学斜体变量（B, x, E, r, t, ε_i） */
  mathVar: '"Times New Roman", "Cambria Math", "STIX Two Math", serif',
  /** 物理正体单位与运算符（V, T, Wb, s, d） */
  mathText: '"Times New Roman", "Cambria Math", serif',
  /** 调试终端与纯代码控制台 */
  code: 'Consolas, "SF Mono", monospace',
};

export function buildUiFont(size, weight = 'bold') {
  return `${weight} ${Math.round(size)}px ${FONT_STACKS.ui}`;
}

export function buildMathVarFont(size, weight = 'bold') {
  return `${weight} italic ${Math.round(size)}px ${FONT_STACKS.mathVar}`;
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

function findMatchingBrace(str, openIndex) {
  if (str[openIndex] !== '{') return -1;
  let depth = 0;
  for (let i = openIndex; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Calligraphic script map for standard physics notation (e.g. Electromotive Force 花体 E = ℰ).
 */
const SCRIPT_MAP = {
  E: 'ℰ',
  B: 'ℬ',
  L: 'ℒ',
  M: 'ℳ',
  H: 'ℋ',
  F: 'ℱ',
  R: 'ℛ',
  P: '𝒫',
};

/**
 * 将 markup 拆成绘制 token。
 * 支持标准大学物理规范：
 *   - 花体字母 \mathcal{E} 或 ℰ (感应/动生/自感电动势)
 *   - 矢量符号 \vec{E} 或 \boldsymbol{E} (带箭头/加粗)
 *   - 下标角标 _{...} 或 _k, _i, _B, _E, _H, _0, _m, _p, _1, _2, _A 等 (带角标)
 *   - 上标角标 ^{...} 或 ^2, ^3
 *   - 希腊字母与数学符号 \oint, \sum, \Delta, \varepsilon, \mu, \theta 等
 * @returns {{ kind: 'var'|'text'|'sub'|'sup'|'cn'|'calligraphic'|'vec', text: string }[]}
 */
export function tokenizeFormula(formula) {
  const s = String(formula || '');
  const tokens = [];
  let i = 0;

  const isCjk = (ch) => /[\u3000-\u9fff\uff00-\uffef]/.test(ch);
  const isVarStart = (ch) => /[A-Za-zΑ-Ωα-ωΦφθΘεεΔδπμνλρστωℰℬℒℳℋℱℛΣ∑σ]/.test(ch);

  while (i < s.length) {
    // 0. 分数: \frac{num}{den} (支持嵌套括号如 \mathrm{d})
    if (s.slice(i).startsWith('\\frac{')) {
      const numStart = i + 5;
      const numEnd = findMatchingBrace(s, numStart);
      if (numEnd !== -1 && s[numEnd + 1] === '{') {
        const denStart = numEnd + 1;
        const denEnd = findMatchingBrace(s, denStart);
        if (denEnd !== -1) {
          const numStr = s.slice(numStart + 1, numEnd);
          const denStr = s.slice(denStart + 1, denEnd);
          tokens.push(...tokenizeFormula(numStr), { kind: 'text', text: ' / ' }, ...tokenizeFormula(denStr));
          i = denEnd + 1;
          continue;
        }
      }
    }

    // 1. 花体: \mathcal{E}, \script{E}, \mathscr{E} 或 ℰ
    if (s.slice(i).startsWith('\\mathcal{') || s.slice(i).startsWith('\\script{') || s.slice(i).startsWith('\\mathscr{')) {
      const braceStart = s.indexOf('{', i);
      const braceEnd = s.indexOf('}', braceStart);
      if (braceEnd !== -1) {
        const char = s.slice(braceStart + 1, braceEnd).trim();
        tokens.push({ kind: 'calligraphic', text: SCRIPT_MAP[char] || char });
        i = braceEnd + 1;
        continue;
      }
    }
    if (s[i] === 'ℰ' || s[i] === 'ℬ' || s[i] === 'ℒ' || s[i] === 'ℳ' || s[i] === 'ℋ' || s[i] === 'ℱ' || s[i] === 'ℛ') {
      tokens.push({ kind: 'calligraphic', text: s[i] });
      i += 1;
      continue;
    }

    // 2. 矢量: \vec{E}, \boldsymbol{E}
    if (s.slice(i).startsWith('\\vec{') || s.slice(i).startsWith('\\boldsymbol{')) {
      const braceStart = s.indexOf('{', i);
      const braceEnd = s.indexOf('}', braceStart);
      if (braceEnd !== -1) {
        const text = s.slice(braceStart + 1, braceEnd).trim();
        tokens.push({ kind: 'vec', text });
        i = braceEnd + 1;
        continue;
      }
    }

    // 3. LaTeX 常见数学符号与变量
    if (s[i] === '\\') {
      // 支持 \mathrm{...} 和 \text{...} 提取正体文本
      if (s.slice(i).startsWith('\\mathrm{') || s.slice(i).startsWith('\\text{')) {
        const braceStart = s.indexOf('{', i);
        const braceEnd = findMatchingBrace(s, braceStart);
        if (braceEnd !== -1) {
          const txt = s.slice(braceStart + 1, braceEnd);
          tokens.push(isCjk(txt) ? { kind: 'cn', text: txt } : { kind: 'text', text: txt });
          i = braceEnd + 1;
          continue;
        }
      }

      const latexCmds = [
        ['\\rightarrow', ' → '],
        ['\\Rightarrow', ' ⇒ '],
        ['\\to', ' → '],
        ['\\uparrow', '↑'],
        ['\\downarrow', '↓'],
        ['\\quad', '   '],
        ['\\qquad', '     '],
        ['\\oint', '∮'],
        ['\\sum', '∑'],
        ['\\Sigma', 'Σ'],
        ['\\sigma', 'σ'],
        ['\\Delta', 'Δ'],
        ['\\nabla', '∇'],
        ['\\partial', '∂'],
        ['\\cdot', '·'],
        ['\\times', '×'],
        ['\\propto', '∝'],
        ['\\perp', '⊥'],
        ['\\le', '≤'],
        ['\\ge', '≥'],
        ['\\approx', '≈'],
        ['\\infty', '∞'],
        ['\\Phi', 'Φ'],
        ['\\varepsilon', 'ε'],
        ['\\mu', 'μ'],
        ['\\theta', 'θ'],
        ['\\pi', 'π'],
        ['\\lambda', 'λ'],
        ['\\alpha', 'α'],
        ['\\rho', 'ρ'],
        ['\\eta', 'η'],
        ['\\delta', 'δ'],
      ];
      let matched = false;
      for (const [cmd, rep] of latexCmds) {
        if (s.slice(i).startsWith(cmd)) {
          tokens.push(isVarStart(rep) ? { kind: 'var', text: rep } : { kind: 'text', text: rep });
          i += cmd.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // 4. 下标 _{...} 或无括号单字符/文本下标 (如 E_k, \Phi_B, \Phi_E, U_H, K_H, q_0, \varepsilon_0, E_1, k_B)
    if (s[i] === '_') {
      if (s[i + 1] === '{') {
        const end = findMatchingBrace(s, i + 1);
        if (end !== -1) {
          const subContent = s.slice(i + 2, end);
          if (subContent.startsWith('\\mathrm{') || subContent.startsWith('\\text{')) {
            const bStart = subContent.indexOf('{');
            const bEnd = findMatchingBrace(subContent, bStart);
            const innerText = bEnd !== -1 ? subContent.slice(bStart + 1, bEnd) : subContent;
            tokens.push({ kind: 'sub', text: innerText });
          } else {
            tokens.push({ kind: 'sub', text: subContent });
          }
          i = end + 1;
          continue;
        }
      } else if (i + 1 < s.length && /[A-Za-z0-9\u3000-\u9fff]/.test(s[i + 1])) {
        let j = i + 1;
        if (/[A-Za-z]/.test(s[j])) {
          while (j < s.length && /[A-Za-z]/.test(s[j])) j += 1;
        } else if (/[\u3000-\u9fff]/.test(s[j])) {
          while (j < s.length && /[\u3000-\u9fff]/.test(s[j])) j += 1;
        } else {
          j += 1;
        }
        tokens.push({ kind: 'sub', text: s.slice(i + 1, j) });
        i = j;
        continue;
      }
    }

    // 5. 上标 ^{...} 或单字符上标 ^2
    if (s[i] === '^') {
      if (s[i + 1] === '{') {
        const end = findMatchingBrace(s, i + 1);
        if (end !== -1) {
          tokens.push({ kind: 'sup', text: s.slice(i + 2, end) });
          i = end + 1;
          continue;
        }
      } else if (i + 1 < s.length && /[0-9+\-−]/.test(s[i + 1])) {
        tokens.push({ kind: 'sup', text: s[i + 1] });
        i += 2;
        continue;
      }
    }

    // 6. 中文字符
    const ch = s[i];
    if (isCjk(ch)) {
      let j = i + 1;
      while (j < s.length && isCjk(s[j])) j += 1;
      tokens.push({ kind: 'cn', text: s.slice(i, j) });
      i = j;
      continue;
    }

    // 7. 变量名 (如 A-Z, a-z, 希腊字母)
    if (isVarStart(ch)) {
      if (i + 1 < s.length && /^[a-z]{2,}/.test(s.slice(i))) {
        const match = s.slice(i).match(/^(cos|sin|tan|arctan|arcsin|arccos|ln|log|lim|min|max|exp)/i);
        if (match) {
          tokens.push({ kind: 'text', text: match[0] });
          i += match[0].length;
          continue;
        }
      }
      tokens.push({ kind: 'var', text: ch });
      i += 1;
      continue;
    }

    // 8. 数字、运算符、空格、标点
    let j = i + 1;
    while (
      j < s.length
      && !isCjk(s[j])
      && !isVarStart(s[j])
      && s[j] !== '_'
      && s[j] !== '^'
      && s[j] !== '\\'
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
export function measureMathFormula(ctx, formula, fontSize = 18, opts = {}) {
  const tokens = tokenizeFormula(formula);
  const size = fontSize;
  const subSize = Math.max(10, Math.round(size * 0.65));
  const weight = opts.fontWeight || 'bold';
  const cnFont = opts.cnFont || '"Microsoft YaHei", "PingFang SC", sans-serif';
  let w = 0;
  for (const tok of tokens) {
    if (tok.kind === 'calligraphic') {
      ctx.font = `${weight} italic ${size}px "STIX Two Math", "Cambria Math", "TeX Gyre Termes Math", "Segoe Script", "Lucida Calligraphy", cursive, serif`;
      w += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'vec') {
      ctx.font = `${weight} italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      w += ctx.measureText(tok.text).width + 1;
    } else if (tok.kind === 'var') {
      ctx.font = `${weight} italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      w += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'cn') {
      ctx.font = `${weight} ${size}px ${cnFont}`;
      w += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'sub' || tok.kind === 'sup') {
      const isCn = /[\u3000-\u9fff]/.test(tok.text);
      const font = isCn
        ? `${weight} ${subSize}px ${cnFont}`
        : `${weight} ${subSize}px "Times New Roman", "Cambria Math", serif`;
      ctx.font = font;
      w += ctx.measureText(tok.text).width * 0.96;
    } else {
      ctx.font = `${weight} ${size}px "Times New Roman", "Cambria Math", ${cnFont}`;
      w += ctx.measureText(tok.text).width;
    }
  }
  return w;
}

/**
 * 在 canvas 上绘制大学物理规范风格公式。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} formula markup，如 "E=kQ/r^{2}"、"\Phi_{E}=Q_{内}/\varepsilon_{0}"、"\mathcal{E}_{i}=-n\Delta\Phi_{B}/\Delta t"
 * @param {number} x 基线起点（align=left）或中心（align=center）
 * @param {number} y 字母基线 y
 * @param {{ fontSize?: number, color?: string, align?: 'left'|'center', maxWidth?: number, textBaseline?: string, fontWeight?: string, cnFont?: string }} [opts]
 * @returns {{ width: number, height: number }}
 */
export function drawMathFormula(ctx, formula, x, y, opts = {}) {
  const size = opts.fontSize || 18;
  const color = opts.color || '#0c4a6e';
  const align = opts.align || 'left';
  const weight = opts.fontWeight || 'bold';
  const cnFont = opts.cnFont || '"Microsoft YaHei", "PingFang SC", sans-serif';
  const subSize = Math.max(10, Math.round(size * 0.65));
  const tokens = tokenizeFormula(formula);

  let totalW = measureMathFormula(ctx, formula, size, opts);
  if (opts.maxWidth && totalW > opts.maxWidth) {
    const scale = opts.maxWidth / totalW;
    return drawMathFormula(ctx, formula, x, y, {
      ...opts,
      fontSize: Math.max(11, Math.floor(size * scale)),
      maxWidth: undefined,
    });
  }

  let penX = align === 'center' ? x - totalW / 2 : (align === 'right' ? x - totalW : x);
  const startX = penX;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textAlign = 'left';

  let baseY = y;
  if (opts.textBaseline === 'top') {
    baseY = y + size * 0.82;
  } else if (opts.textBaseline === 'middle') {
    baseY = y + size * 0.32;
  }
  ctx.textBaseline = 'alphabetic';

  for (const tok of tokens) {
    if (tok.kind === 'calligraphic') {
      ctx.font = `${weight} italic ${size}px "STIX Two Math", "Cambria Math", "TeX Gyre Termes Math", "Segoe Script", "Lucida Calligraphy", cursive, serif`;
      ctx.fillText(tok.text, penX, baseY);
      penX += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'vec') {
      ctx.font = `${weight} italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      const vw = ctx.measureText(tok.text).width;
      ctx.fillText(tok.text, penX, baseY);

      // 绘制顶部矢量头标 →
      const arrowY = baseY - size * 0.85;
      const arrowW = vw;
      ctx.lineWidth = Math.max(1.2, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(penX + 1, arrowY);
      ctx.lineTo(penX + arrowW, arrowY);
      ctx.lineTo(penX + arrowW - size * 0.18, arrowY - size * 0.12);
      ctx.moveTo(penX + arrowW, arrowY);
      ctx.lineTo(penX + arrowW - size * 0.18, arrowY + size * 0.12);
      ctx.stroke();

      penX += vw + 1;
    } else if (tok.kind === 'var') {
      ctx.font = `${weight} italic ${size}px "Times New Roman", "Cambria Math", "STIX Two Math", serif`;
      ctx.fillText(tok.text, penX, baseY);
      penX += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'cn') {
      ctx.font = `${weight} ${size}px ${cnFont}`;
      ctx.fillText(tok.text, penX, baseY);
      penX += ctx.measureText(tok.text).width;
    } else if (tok.kind === 'sub') {
      const isCn = /[\u3000-\u9fff]/.test(tok.text);
      const isVar = /^[A-Za-z]/.test(tok.text);
      const fontStyle = isVar ? `${weight} italic` : `${weight}`;
      ctx.font = isCn
        ? `${weight} ${subSize}px ${cnFont}`
        : `${fontStyle} ${subSize}px "Times New Roman", "Cambria Math", serif`;
      const sw = ctx.measureText(tok.text).width;
      ctx.fillText(tok.text, penX, baseY + size * 0.16);
      penX += sw * 0.96;
    } else if (tok.kind === 'sup') {
      const isCn = /[\u3000-\u9fff]/.test(tok.text);
      const isVar = /^[A-Za-z]/.test(tok.text);
      const fontStyle = isVar ? `${weight} italic` : `${weight}`;
      ctx.font = isCn
        ? `${weight} ${subSize}px ${cnFont}`
        : `${fontStyle} ${subSize}px "Times New Roman", "Cambria Math", serif`;
      const sw = ctx.measureText(tok.text).width;
      ctx.fillText(tok.text, penX, baseY - size * 0.40);
      penX += sw * 0.96;
    } else {
      ctx.font = `${size}px "Times New Roman", "Cambria Math", serif`;
      ctx.fillText(tok.text, penX, baseY);
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
