
/**
 * Draw interactive experiment UI onto hologram canvas textures
 * and resolve UV picks like a flat computer screen.
 */

import { diffractionHalfSpan, diffractionIntensity } from './experiments/optics.js';

/**
 * Global UI scale for hologram surfaces.
 * Display is only mildly larger than full — prefer density over empty padding.
 */
export function holoUiScale(surface = 'full') {
  if (surface === 'display') return 1.78;
  if (surface === 'selector') return 1.08;
  return 1.05;
}

/** Experiment-card height on the station menu / tabletop selector. */
export const HOLO_MENU_CARD_H = 148;
export const HOLO_MENU_CARD_GAP = 18;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const s = String(text || '');
  if (!s) return [''];
  const lines = [];
  let line = '';
  for (const ch of s) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const HALL_MU0 = 4 * Math.PI * 1e-7;
const HALL_K = 200; // calibrated representative value, mV·mA⁻¹·T⁻¹

/** Magnetic flux density in mT from standard on-axis field equations. */
function hallTheoreticalB(data, pos) {
  if (data.wiring && !data.wiring.energized) return 0;
  const x = Number(pos || 0) / 100;
  const Im = Number(data.Im || 0);
  let bTesla = 0;
  if (data.target === 'solenoid') {
    const length = 0.26;
    const halfL = length / 2;
    const radius = 0.014;
    const n = Number(data.turns || 100) / length;
    const endCos = (z) => z / Math.sqrt(z * z + radius * radius);
    bTesla = HALL_MU0 * n * Im * 0.5
      * (endCos(x + halfL) - endCos(x - halfL));
  } else {
    const radius = 0.05;
    const turns = 210;
    const fixedX = -0.025;
    const movingX = Number(data.rightCoilPos ?? 2.5) / 100;
    const fieldAt = (centreX) => (
      HALL_MU0 * turns * Im * radius ** 2
      / (2 * Math.pow(radius ** 2 + (x - centreX) ** 2, 1.5))
    );
    bTesla = fieldAt(fixedX) + fieldAt(movingX);
  }
  return bTesla * 1000 * Number(data.direction || 1);
}

function hallRecordedB(record) {
  if (Number.isFinite(Number(record.b))) return Number(record.b);
  const Is = Math.max(1e-9, Number(record.Is || 0));
  return ((Number(record.vh || 0) - Number(record.zeroOffset || 0)) / (Number(record.hallK || HALL_K) * Is)) * 1000;
}

/** Shared chrome / text palette for dark holo vs light content display. */
function screenPalette(theme = 'dark', accentHex = '#38bdf8', isDisplay = false) {
  if (theme === 'light') {
    return {
      theme: 'light',
      accent: accentHex,
      title: '#0f172a',
      text: '#1e293b',
      muted: '#334155',
      soft: '#1e293b',
      headerBg: isDisplay ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.76)',
      panel: isDisplay ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.72)',
      panelAlt: isDisplay ? 'rgba(248, 250, 252, 0.42)' : 'rgba(248, 250, 252, 0.76)',
      panelStroke: 'rgba(14, 165, 233, 0.48)',
      card: isDisplay ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.75)',
      cardStroke: 'rgba(2, 132, 199, 0.65)',
      dataBg: isDisplay ? 'rgba(248, 250, 252, 0.42)' : 'rgba(248, 250, 252, 0.78)',
      dataText: '#0f172a',
      hintBg: 'rgba(240, 249, 255, 0.82)',
      hintText: '#0369a1',
      btnFill: 'rgba(14, 165, 233, 0.20)',
      btnFillStrong: 'rgba(14, 165, 233, 0.32)',
      btnText: '#0f172a',
      btnIdle: isDisplay ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.78)',
      btnIdleText: '#0f172a',
      closeFill: 'rgba(248, 113, 113, 0.18)',
      closeStroke: 'rgba(239, 68, 68, 0.65)',
      closeText: '#b91c1c',
      maxFill: 'rgba(14, 165, 233, 0.18)',
      maxFillOn: 'rgba(14, 165, 233, 0.35)',
      maxIcon: '#0369a1',
      scanline: 'rgba(14, 165, 233, 0.012)',
      done: '#15803d',
      theoryBg: 'rgba(240, 249, 255, 0.82)',
      stepBox: isDisplay ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.78)',
    };
  }
  return {
    theme: 'dark',
    accent: accentHex,
    title: '#ffffff',
    text: '#f8fafc',
    muted: 'rgba(148, 163, 184, 0.92)',
    soft: 'rgba(186, 230, 253, 0.88)',
    headerBg: isDisplay ? 'rgba(6, 16, 36, 0.45)' : 'rgba(6, 16, 32, 0.82)',
    panel: isDisplay ? 'rgba(10, 22, 48, 0.38)' : 'rgba(10, 22, 44, 0.72)',
    panelAlt: isDisplay ? 'rgba(14, 30, 60, 0.40)' : 'rgba(14, 30, 58, 0.72)',
    panelStroke: 'rgba(56, 189, 248, 0.52)',
    card: isDisplay ? 'rgba(15, 30, 58, 0.35)' : 'rgba(15, 30, 56, 0.62)',
    cardStroke: accentHex,
    dataBg: isDisplay ? 'rgba(6, 16, 36, 0.45)' : 'rgba(6, 16, 32, 0.85)',
    dataText: '#f8fafc',
    hintBg: 'rgba(56, 189, 248, 0.16)',
    hintText: '#7dd3fc',
    btnFill: 'rgba(56, 189, 248, 0.25)',
    btnFillStrong: 'rgba(34, 211, 238, 0.42)',
    btnText: '#ffffff',
    btnIdle: isDisplay ? 'rgba(15, 30, 58, 0.45)' : 'rgba(15, 30, 56, 0.75)',
    btnIdleText: '#e0f2fe',
    closeFill: 'rgba(248, 113, 113, 0.24)',
    closeStroke: 'rgba(239, 68, 68, 0.8)',
    closeText: '#fecaca',
    maxFill: 'rgba(56, 189, 248, 0.24)',
    maxFillOn: 'rgba(56, 189, 248, 0.45)',
    maxIcon: '#e0f2fe',
    scanline: 'rgba(56, 189, 248, 0.025)',
    done: '#4ade80',
    theoryBg: 'rgba(34, 211, 238, 0.12)',
    stepBox: isDisplay ? 'rgba(6, 16, 36, 0.42)' : 'rgba(6, 16, 32, 0.72)',
  };
}

/** Threaded through specialized experiment drawers for light content screens. */
let _uiTheme = 'dark';

function drawPremiumHoloButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false, theme = 'dark') {
  const isLight = theme === 'light';
  ctx.save();

  if (active && !isLight) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
  }

  const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  if (active) {
    if (isLight) {
      bgGrad.addColorStop(0, 'rgba(14, 165, 233, 0.28)');
      bgGrad.addColorStop(1, 'rgba(14, 165, 233, 0.12)');
    } else {
      bgGrad.addColorStop(0, `${accent}40`);
      bgGrad.addColorStop(1, `${accent}15`);
    }
  } else {
    if (isLight) {
      bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
      bgGrad.addColorStop(1, 'rgba(240, 244, 248, 0.65)');
    } else {
      bgGrad.addColorStop(0, 'rgba(14, 30, 60, 0.45)');
      bgGrad.addColorStop(1, 'rgba(6, 14, 30, 0.58)');
    }
  }
  ctx.fillStyle = bgGrad;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = active ? 2.0 : 1.2;
  if (active) {
    ctx.strokeStyle = isLight ? '#0284c7' : accent;
  } else {
    ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.28)';
  }
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // Sci-fi HUD L-shaped corner brackets
  ctx.strokeStyle = active ? (isLight ? '#0284c7' : '#ffffff') : (isLight ? 'rgba(14, 165, 233, 0.65)' : `${accent}70`);
  ctx.lineWidth = 1.6;
  const tickSize = Math.min(8, h * 0.2);
  ctx.beginPath();
  ctx.moveTo(x + tickSize, y); ctx.lineTo(x, y); ctx.lineTo(x, y + tickSize);
  ctx.moveTo(x + w - tickSize, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + tickSize);
  ctx.moveTo(x + tickSize, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - tickSize);
  ctx.moveTo(x + w - tickSize, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - tickSize);
  ctx.stroke();

  if (active) {
    ctx.fillStyle = isLight ? '#0284c7' : accent;
    roundRect(ctx, x + 10, y + 2, w - 20, 3, 1.5);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = active ? (isLight ? '#0f172a' : '#ffffff') : (isLight ? '#1e293b' : 'rgba(224, 242, 254, 0.92)');
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  } else {
    ctx.shadowColor = active ? accent : 'rgba(56, 189, 248, 0.35)';
    ctx.shadowBlur = active ? 4 : 2;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = Math.max(18, Math.min(64, h * 0.56));
  const text = String(label || '');
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
  while (fontSize > 14 && ctx.measureText(text).width > w - 18) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
  }
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();

  if (w >= 96 && h >= 48 && !isLight && action) {
    ctx.save();
    ctx.fillStyle = active ? `${accent}bb` : 'rgba(56, 189, 248, 0.38)';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const code = String(action).replace(/^(gauss|hall|optics|demo)-?/g, '').toUpperCase().slice(0, 6);
    if (code) ctx.fillText(`[${code}]`, x + w - 6, y + h - 3);
    ctx.restore();
  }

  hits.push({ x, y, w, h, action, ...meta });
}

function drawHallButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false) {
  drawPremiumHoloButton(ctx, hits, x, y, w, h, label, action, meta, accent, active, _uiTheme);
}

function drawFaradayExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const fmt = (v, n = 3) => Number(v || 0).toFixed(n);
  const motion = d.lastMotion;
  const induction = d.lastInduction;
  const gap = Math.round(14 * scale);
  const x = innerX;
  const y = contentTop;
  const w = innerW;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.title;
  if (isDisplay && _uiTheme !== 'light') {
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 10;
  }
  const titleFont = Math.round(32 * scale);
  ctx.font = `bold ${titleFont}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(experiment.name, x + 6, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = accentHex;
  const formulaFont = Math.round(23 * scale);
  ctx.font = `bold ${formulaFont}px Cambria Math, Consolas, serif`;
  ctx.fillText('Φ = B·A    A = (x − x₀)L    ε = −dΦ/dt', x + 6, y + Math.round(44 * scale));
  ctx.restore();

  const statY = y + Math.round(86 * scale);
  const topH = Math.round(108 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 2.0 : 1.4;
  roundRect(ctx, x, statY, w, topH, 14); ctx.fill(); ctx.stroke();
  const stats = [
    ['B', `${fmt(d.B, 2)} T`], ['x', `${fmt(d.x, 3)}`], ['A', `${fmt(d.area)} m²`],
    ['Φ', `${fmt(d.flux)} Wb`], ['楞次方向', d.currentSense === 'cw' ? '顺时针' : d.currentSense === 'ccw' ? '逆时针' : '无'],
  ];
  stats.forEach(([label, value], i) => {
    const colW = w / stats.length;
    const colX = x + i * colW + Math.round(18 * scale);
    ctx.fillStyle = P.muted; ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(label, colX, statY + Math.round(16 * scale));
    if (i === 4 && d.currentSense !== 'none') {
      ctx.fillStyle = d.currentSense === 'cw' ? '#fb923c' : '#4ade80';
    } else {
      ctx.fillStyle = P.text;
    }
    ctx.font = `bold ${Math.round(28 * scale)}px Consolas, "Microsoft YaHei", monospace`;
    ctx.fillText(value, colX, statY + Math.round(54 * scale));
  });

  let cy = statY + topH + gap;
  ctx.fillStyle = P.muted; ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('磁场控制（改变 B 时自动记录感生测量）', x + 6, cy);
  cy += Math.round(34 * scale);
  const btnW = (w - gap * 3) / 4;
  const rowH = Math.round(56 * scale);
  drawHallButton(ctx, hits, x, cy, btnW, rowH, 'B − 0.2', 'faraday-b-step', { delta: -0.2 }, accentHex);
  drawHallButton(ctx, hits, x + btnW + gap, cy, btnW, rowH, 'B + 0.2', 'faraday-b-step', { delta: 0.2 }, accentHex);
  drawHallButton(ctx, hits, x + (btnW + gap) * 2, cy, btnW, rowH, '反向 B', 'faraday-reverse', {}, accentHex);
  drawHallButton(ctx, hits, x + (btnW + gap) * 3, cy, btnW, rowH, d.showField === false ? '显示磁场' : '隐藏磁场', 'faraday-toggle-field', {}, accentHex, d.showField !== false);
  cy += rowH + Math.round(16 * scale);

  const sliderY = cy;
  const sliderX = x + Math.round(20 * scale);
  const sliderW = w - Math.round(40 * scale);
  const trackY = sliderY + Math.round(36 * scale);
  const minB = -3;
  const maxB = 3;
  const normB = Math.max(0, Math.min(1, (Number(d.B || 0) - minB) / (maxB - minB)));
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('连续调节磁场 B（−3 T ～ +3 T）', sliderX, sliderY);
  const trackH = Math.round(18 * scale);
  ctx.fillStyle = _uiTheme === 'light' ? 'rgba(148,163,184,.45)' : 'rgba(148,163,184,.34)';
  roundRect(ctx, sliderX, trackY, sliderW, trackH, trackH / 2); ctx.fill();
  ctx.fillStyle = accentHex;
  roundRect(ctx, sliderX, trackY, sliderW * normB, trackH, trackH / 2); ctx.fill();
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(18 * scale)}px Consolas, monospace`;
  ctx.fillText('−3', sliderX, trackY + trackH + Math.round(12 * scale));
  ctx.textAlign = 'center'; ctx.fillText('0', sliderX + sliderW / 2, trackY + trackH + Math.round(12 * scale));
  ctx.textAlign = 'right'; ctx.fillText('+3', sliderX + sliderW, trackY + trackH + Math.round(12 * scale));
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const thumbR = Math.round(16 * scale);
  ctx.arc(sliderX + sliderW * normB, trackY + trackH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accentHex; ctx.lineWidth = Math.round(4 * scale); ctx.stroke();
  hits.push({
    id: 'faraday-b-slider',
    role: 'faraday-b-slider',
    action: 'faraday-b-slider',
    x: sliderX - 20,
    y: sliderY - 10,
    w: sliderW + 40,
    h: Math.round(80 * scale),
    min: minB,
    max: maxB,
    dragAxis: 'x',
  });
  cy = sliderY + Math.round(82 * scale);

  const bottomBtnH = Math.round(52 * scale);
  const completeY = contentTop + contentH - bottomBtnH;
  const cardW = (w - gap) / 2;
  const cardH = Math.max(Math.round(160 * scale), completeY - cy - gap);
  const cards = [
    { title: '动生电动势 · 拖动铜棒', data: motion, lines: motion
      ? [`x₀ → x₁: ${fmt(motion.x0)} → ${fmt(motion.x1)}`, `Δx = ${fmt(motion.dx)} · Δt = ${fmt(motion.dt, 4)} s`, `ε = ${fmt(motion.emf, 4)} V`, motion.senseLabel]
      : ['等待拖动铜棒…', '沿导轨移动后松开鼠标。'] },
    { title: '感生电动势 · 调节磁场', data: induction, lines: induction
      ? [`B₀ → B₁: ${fmt(induction.B0, 2)} → ${fmt(induction.B1, 2)} T`, `ΔB = ${fmt(induction.dB, 3)} · Δt = ${fmt(induction.dt, 4)} s`, `ε = ${fmt(induction.emf, 4)} V`, induction.senseLabel]
      : ['等待改变磁场…', '点击上方 B 控制按钮。'] },
  ];
  cards.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    ctx.fillStyle = P.panel; ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = isDisplay ? 1.8 : 1.3;
    roundRect(ctx, cx, cy, cardW, cardH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accentHex; ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(card.title, cx + Math.round(20 * scale), cy + Math.round(18 * scale));
    ctx.strokeStyle = _uiTheme === 'light' ? 'rgba(14, 165, 233, 0.25)' : 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.round(20 * scale), cy + Math.round(54 * scale));
    ctx.lineTo(cx + cardW - Math.round(20 * scale), cy + Math.round(54 * scale));
    ctx.stroke();
    ctx.font = `bold ${Math.round(19 * scale)}px Consolas, "Microsoft YaHei", monospace`;
    card.lines.forEach((line, li) => {
      if (li === 2 && card.data) {
        ctx.fillStyle = _uiTheme === 'light' ? '#0284c7' : '#38bdf8';
        ctx.font = `bold ${Math.round(22 * scale)}px Consolas, "Microsoft YaHei", monospace`;
      } else {
        ctx.fillStyle = P.text;
        ctx.font = `bold ${Math.round(19 * scale)}px Consolas, "Microsoft YaHei", monospace`;
      }
      ctx.fillText(line, cx + Math.round(20 * scale), cy + Math.round(68 * scale) + li * Math.round(38 * scale));
    });
  });

  drawHallButton(ctx, hits, x, completeY, w * 0.485, bottomBtnH, '重置', 'faraday-reset', {}, accentHex);
  drawHallButton(ctx, hits, x + w * 0.515, completeY, w * 0.485, bottomBtnH, '完成实验', 'faraday-complete', {}, accentHex, !!d.completed);
}

function drawGaussExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const charges = Array.isArray(d.charges) ? d.charges : [];
  const selected = charges.find((charge) => charge.id === d.selectedId) || null;
  const isLight = _uiTheme === 'light';
  const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);

  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.title;
  if (isLight) {
    ctx.shadowColor = 'rgba(255,255,255,.98)';
    ctx.shadowBlur = 5;
  }
  ctx.font = `bold ${Math.round(32 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(experiment.name, innerX + 4, contentTop);
  ctx.restore();

  const formulaY = contentTop + Math.round(44 * scale);
  const formulaH = Math.round(52 * scale);
  ctx.fillStyle = P.theoryBg;
  roundRect(ctx, innerX, formulaY, innerW, formulaH, 10);
  ctx.fill();
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(24 * scale)}px "Cambria Math", "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('∯S E·dA = Q内 / ε₀', innerX + innerW / 2, formulaY + formulaH / 2);

  const statY = formulaY + formulaH + Math.round(10 * scale);
  const statH = Math.round(64 * scale);
  const statGap = Math.round(12 * scale);
  const statW = (innerW - statGap * 3) / 4;
  const stats = [
    ['面内净电荷 Q内', `${fmt(d.qEnclosed)} e`],
    ['总电通量 ΦE', `${fmt(d.flux)} / ε₀`],
    ['高斯面半径 R', fmt(d.radius)],
    ['面平均 |E|', fmt(d.meanField, 3)],
  ];
  stats.forEach(([label, value], index) => {
    const x = innerX + index * (statW + statGap);
    ctx.fillStyle = P.card;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, statY, statW, statH, 9);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.muted;
    ctx.font = `${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(label, x + Math.round(12 * scale), statY + Math.round(8 * scale));
    ctx.fillStyle = index === 0 && Number(d.qEnclosed) < 0 ? '#2563eb' : P.title;
    ctx.font = `bold ${Math.round(21 * scale)}px Consolas, monospace`;
    ctx.fillText(value, x + Math.round(12 * scale), statY + Math.round(33 * scale));
  });

  const bodyY = statY + statH + Math.round(12 * scale);
  const bodyH = _H - bodyY - Math.round(28 * (isDisplay ? 1.0 : 1.0));
  const leftW = isDisplay ? Math.round(innerW * 0.46) : 350;
  const gap = Math.round(16 * scale);
  const rightX = innerX + leftW + gap;
  const rightW = innerW - leftW - gap;
  [
    [innerX, leftW], [rightX, rightW],
  ].forEach(([x, w]) => {
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, bodyY, w, bodyH, 11);
    ctx.fill(); ctx.stroke();
  });

  const padIn = Math.round(14 * scale);
  const innerLeftW = leftW - padIn * 2;
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('高斯面与可视层', innerX + padIn, bodyY + Math.round(14 * scale));
  ctx.fillStyle = P.muted;
  ctx.font = `${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`R = ${fmt(d.radius)}（源实验范围 1.2–4.2）`, innerX + padIn, bodyY + Math.round(44 * scale));

  const btnY1 = bodyY + Math.round(72 * scale);
  const btnH = Math.round(44 * scale);
  const rWidth = Math.round(innerLeftW * 0.21);
  const tWidth = Math.round(innerLeftW * 0.26);
  const gap1 = Math.round((innerLeftW - (rWidth * 2 + tWidth * 2)) / 3);
  const rx1 = innerX + padIn;
  const rx2 = rx1 + rWidth + gap1;
  const tx1 = rx2 + rWidth + gap1;
  const tx2 = tx1 + tWidth + gap1;
  drawHallButton(ctx, hits, rx1, btnY1, rWidth, btnH, 'R −', 'gauss-radius', { delta: -0.1 }, accentHex);
  drawHallButton(ctx, hits, rx2, btnY1, rWidth, btnH, 'R +', 'gauss-radius', { delta: 0.1 }, accentHex);
  drawHallButton(ctx, hits, tx1, btnY1, tWidth, btnH, '表面', 'gauss-toggle', { key: 'surface' }, accentHex, d.showSurface !== false);
  drawHallButton(ctx, hits, tx2, btnY1, tWidth, btnH, '场线', 'gauss-toggle', { key: 'lines' }, accentHex, d.showLines !== false);

  const btnY2 = btnY1 + btnH + Math.round(12 * scale);
  const pWidth = Math.round(innerLeftW * 0.52);
  drawHallButton(ctx, hits, innerX + padIn, btnY2, pWidth, btnH, '通量粒子', 'gauss-toggle', { key: 'flux' }, accentHex, d.showFlux !== false);

  const listTitleY = btnY2 + btnH + Math.round(16 * scale);
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(19 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`电荷列表（${charges.length}/6）`, innerX + padIn, listTitleY);

  const chipY0 = listTitleY + Math.round(28 * scale);
  const chipH = Math.round(40 * scale);
  const chipW = Math.round((innerLeftW - Math.round(16 * scale)) / 3);
  charges.forEach((charge, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    drawHallButton(
      ctx, hits,
      innerX + padIn + col * (chipW + Math.round(8 * scale)), chipY0 + row * (chipH + Math.round(8 * scale)),
      chipW, chipH,
      `Q${index + 1} ${charge.q > 0 ? '+' : ''}${Number(charge.q).toFixed(1)}`,
      'gauss-select', { id: charge.id },
      charge.q >= 0 ? '#ef4444' : '#3b82f6', charge.id === d.selectedId,
    );
  });

  const bottomBtnH = Math.round(46 * scale);
  const bottomBtnW = Math.round((innerLeftW - Math.round(12 * scale)) / 2);
  const chargeRows = Math.ceil(Math.max(1, charges.length) / 3);
  const chipsBottomY = chipY0 + chargeRows * (chipH + Math.round(8 * scale));
  const bottomY1 = Math.max(chipsBottomY + Math.round(14 * scale), bodyY + bodyH - bottomBtnH * 2 - padIn - Math.round(10 * scale));
  const bottomY2 = bottomY1 + bottomBtnH + Math.round(10 * scale);
  drawHallButton(ctx, hits, innerX + padIn, bottomY1, bottomBtnW, bottomBtnH, '+ 正电荷', 'gauss-add', { sign: 1 }, '#ef4444');
  drawHallButton(ctx, hits, innerX + padIn + bottomBtnW + Math.round(12 * scale), bottomY1, bottomBtnW, bottomBtnH, '+ 负电荷', 'gauss-add', { sign: -1 }, '#3b82f6');
  drawHallButton(ctx, hits, innerX + padIn, bottomY2, bottomBtnW, bottomBtnH, '重置', 'gauss-reset', {}, accentHex);
  drawHallButton(ctx, hits, innerX + padIn + bottomBtnW + Math.round(12 * scale), bottomY2, bottomBtnW, bottomBtnH, '完成验证', 'gauss-complete', {}, accentHex, d.completed);

  const innerRightW = rightW - padIn * 2;
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(21 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(selected ? `编辑 Q${charges.indexOf(selected) + 1}` : '编辑电荷', rightX + padIn, bodyY + Math.round(14 * scale));
  if (!selected) {
    ctx.fillStyle = P.muted;
    ctx.font = `${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('请添加或选择一个电荷', rightX + padIn, bodyY + Math.round(56 * scale));
    return;
  }
  ctx.fillStyle = P.muted;
  ctx.font = `${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
  const inside = Math.hypot(selected.x, selected.y, selected.z) < Number(d.radius) - 1e-4;
  ctx.fillText(`${inside ? '高斯面内' : '高斯面外'} · 距中心 ${Math.hypot(selected.x, selected.y, selected.z).toFixed(2)}`, rightX + padIn, bodyY + Math.round(46 * scale));

  const editBtnY = bodyY + Math.round(74 * scale);
  const editBtnW = Math.round((innerRightW - Math.round(16 * scale)) / 3);
  drawHallButton(ctx, hits, rightX + padIn, editBtnY, editBtnW, btnH, '正 (+)', 'gauss-sign', { sign: 1 }, '#ef4444', selected.q >= 0);
  drawHallButton(ctx, hits, rightX + padIn + editBtnW + Math.round(8 * scale), editBtnY, editBtnW, btnH, '负 (−)', 'gauss-sign', { sign: -1 }, '#3b82f6', selected.q < 0);
  drawHallButton(ctx, hits, rightX + padIn + (editBtnW + Math.round(8 * scale)) * 2, editBtnY, editBtnW, btnH, '移到中心', 'gauss-center', {}, accentHex);

  const rowY0 = editBtnY + btnH + Math.round(14 * scale);
  const rowH = Math.round((bodyY + bodyH - bottomBtnH - padIn - rowY0 - Math.round(10 * scale)) / 4);
  const rows = [
    ['电荷量 |Q|', 'q', Math.abs(selected.q), 0.1],
    ['位置 X', 'x', selected.x, 0.25],
    ['位置 Y', 'y', selected.y, 0.25],
    ['位置 Z', 'z', selected.z, 0.25],
  ];
  rows.forEach(([label, key, value, step], index) => {
    const y = rowY0 + index * rowH;
    ctx.fillStyle = P.text;
    ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, rightX + padIn, y + rowH / 2);
    ctx.fillStyle = P.title;
    ctx.font = `bold ${Math.round(20 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(Number(value).toFixed(key === 'q' ? 1 : 2), rightX + rightW - Math.round(124 * scale), y + rowH / 2);
    const action = key === 'q' ? 'gauss-charge' : 'gauss-move';
    const metaMinus = key === 'q' ? { delta: -step } : { axis: key, delta: -step };
    const metaPlus = key === 'q' ? { delta: step } : { axis: key, delta: step };
    const adjH = Math.min(Math.round(46 * scale), rowH - 6);
    const adjW = adjH;
    const adjY = y + (rowH - adjH) / 2;
    drawHallButton(ctx, hits, rightX + rightW - padIn - adjW * 2 - Math.round(8 * scale), adjY, adjW, adjH, '−', action, metaMinus, accentHex);
    drawHallButton(ctx, hits, rightX + rightW - padIn - adjW, adjY, adjW, adjH, '+', action, metaPlus, accentHex);
  });
  const deleteBtnY = bodyY + bodyH - bottomBtnH - padIn;
  drawHallButton(ctx, hits, rightX + padIn, deleteBtnY, innerRightW, bottomBtnH, '删除选中电荷', 'gauss-delete', {}, '#ef4444');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/**
 * Compact electric-field HUD: top strip (title + formula + live stats),
 * middle toolbar (tabs / view / session), bottom twin editor columns.
 * Designed for high control density with minimal empty padding.
 */
function drawElectricFieldExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const charges = Array.isArray(d.charges) ? d.charges : [];
  const selected = charges.find((charge) => charge.id === d.selectedId) || null;
  const probe = d.probe || { x: 0, y: 0, z: 0, q0: 1 };
  const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
  const formula = {
    def: 'E = F / q₀',
    force: 'F = q₀ E',
    point: 'E = q r̂ / r²',
    super: 'E总 = Σ Eᵢ',
    dipole: 'E远场 ∝ 2p / r³',
  }[d.formulaTab || 'def'];
  const tabs = [
    ['def', '定义'], ['force', '受力'], ['point', '点电荷'], ['super', '叠加'], ['dipole', '偶极'],
  ];
  const sumQ = charges.reduce((sum, charge) => sum + Number(charge.q || 0), 0);
  const pad = Math.round(14 * scale);
  const gap = Math.round(10 * scale);
  const btnH = Math.round(36 * scale);
  const chipH = Math.round(36 * scale);
  const bottom = contentTop + contentH;

  // ── Row 0: title + formula on left, live stats separated on right (zero horizontal overlap) ──
  const headH = Math.round(54 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 2.0 : 1.2;
  roundRect(ctx, innerX, contentTop, innerW, headH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(experiment.name, innerX + pad, contentTop + Math.round(10 * scale));

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(16 * scale)}px "Cambria Math", "Microsoft YaHei", Consolas, serif`;
  ctx.fillText(`${formula}  ·  K=1`, innerX + pad, contentTop + Math.round(34 * scale));

  const stats = [
    ['N', `${charges.length}/12`],
    ['ΣQ', fmt(sumQ)],
    ['|E|', fmt(d.magnitudeE, 3)],
    ['|F|', fmt(d.magnitudeF, 3)],
    ['V', fmt(d.potential, 3)],
  ];
  const statBlockW = Math.round(74 * scale);
  const statsStart = innerX + innerW - pad - stats.length * statBlockW;
  stats.forEach(([label, value], i) => {
    const x = statsStart + i * statBlockW;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x, contentTop + Math.round(8 * scale));
    if (label === '|E|' || label === 'V') {
      ctx.fillStyle = label === '|E|' ? '#38bdf8' : '#f59e0b';
    } else {
      ctx.fillStyle = P.title;
    }
    ctx.font = `bold ${Math.round(19 * scale)}px Consolas, monospace`;
    ctx.fillText(value, x, contentTop + Math.round(28 * scale));
  });

  // ── Row 1: formula tabs + view toggles ──
  let y = contentTop + headH + gap;
  const tabW = (innerW * 0.52 - pad - (tabs.length - 1) * gap) / tabs.length;
  tabs.forEach(([key, label], i) => {
    drawHallButton(
      ctx, hits, innerX + i * (tabW + gap), y, tabW, btnH,
      label, 'electric-formula', { key }, accentHex, d.formulaTab === key,
    );
  });
  const viewItems = [
    ['lines', '场线', d.showLines !== false],
    ['arrows', '矢量', d.showArrows !== false],
    ['equipot', '等势', d.showEquipot === true],
    ['probe', '探针', d.showProbe !== false],
  ];
  const viewX0 = innerX + innerW * 0.52 + gap;
  const viewW = (innerW * 0.48 - pad - gap - (viewItems.length - 1) * gap) / viewItems.length;
  viewItems.forEach(([key, label, active], i) => {
    drawHallButton(
      ctx, hits, viewX0 + i * (viewW + gap), y, viewW, btnH,
      label, 'electric-toggle', { key }, accentHex, active,
    );
  });
  y += btnH + gap;

  // ── Row 2: charge list chips (wrap cleanly) ──
  const maxChips = 12;
  const chipsPerRow = 6;
  const chipGap = Math.round(8 * scale);
  const chipCount = Math.max(1, Math.min(charges.length || 0, maxChips));
  const chipW = Math.min(
    Math.round(150 * scale),
    (innerW - (Math.min(chipCount, chipsPerRow) - 1) * chipGap) / Math.min(Math.max(chipCount, 1), chipsPerRow),
  );
  if (charges.length === 0) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('尚未添加点电荷 — 点击下方“+ 正/负电荷”添加', innerX + pad, y + chipH / 2);
  } else {
    charges.slice(0, maxChips).forEach((charge, i) => {
      const col = i % chipsPerRow;
      const row = Math.floor(i / chipsPerRow);
      drawHallButton(
        ctx, hits,
        innerX + col * (chipW + chipGap),
        y + row * (chipH + chipGap),
        chipW, chipH,
        `Q${i + 1} ${charge.q >= 0 ? '+' : ''}${fmt(charge.q, 1)}`,
        'electric-select', { id: charge.id },
        charge.q >= 0 ? '#ef4444' : '#3b82f6',
        charge.id === d.selectedId,
      );
    });
  }
  const chipRows = Math.max(1, Math.ceil(Math.min(charges.length || 1, maxChips) / chipsPerRow));
  y += chipRows * (chipH + chipGap) + gap - chipGap;

  // ── Row 3: primary actions ──
  const actions = [
    { label: '+ 正电荷', action: 'electric-add', meta: { sign: 1 }, color: '#ef4444' },
    { label: '+ 负电荷', action: 'electric-add', meta: { sign: -1 }, color: '#3b82f6' },
    { label: '重置', action: 'electric-reset', meta: {}, color: accentHex },
    { label: '完成探索', action: 'electric-complete', meta: {}, color: accentHex, active: d.completed },
  ];
  const actionGap = Math.round(10 * scale);
  const actionW = (innerW - actionGap * (actions.length - 1)) / actions.length;
  const actionH = Math.round(44 * scale);
  actions.forEach((a, i) => {
    drawHallButton(
      ctx, hits,
      innerX + i * (actionW + actionGap),
      y,
      actionW, actionH,
      a.label, a.action, a.meta, a.color, !!a.active,
    );
  });
  y += actionH + gap;

  // ── Row 4: twin editors (selected charge | probe) with strict vertical partition to prevent overlaps ──
  const editorH = Math.max(Math.round(280 * scale), bottom - y - pad);
  const colW = (innerW - gap) / 2;
  const leftX = innerX;
  const rightX = innerX + colW + gap;

  function drawEditorPanel(x, w, title, subtitle) {
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = isDisplay ? 2.0 : 1.2;
    roundRect(ctx, x, y, w, editorH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.title;
    ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + pad, y + Math.round(12 * scale));
    if (subtitle) {
      ctx.fillStyle = P.muted;
      ctx.font = `bold ${Math.round(15 * scale)}px Consolas, "Microsoft YaHei", monospace`;
      ctx.fillText(subtitle, x + pad, y + Math.round(38 * scale));
    }
  }

  // Left: selected source charge
  if (selected) {
    const idx = charges.findIndex((c) => c.id === selected.id) + 1;
    drawEditorPanel(
      leftX, colW,
      `源电荷 Q${idx}`,
      `|Q|=${fmt(Math.abs(selected.q), 1)}  (${fmt(selected.x)}, ${fmt(selected.y)}, ${fmt(selected.z)})`,
    );
    const toolsY = y + Math.round(62 * scale);
    const tw = (colW - 2 * pad - 2 * gap) / 3;
    const toolBtnH = Math.round(36 * scale);
    drawHallButton(ctx, hits, leftX + pad, toolsY, tw, toolBtnH, '正(+)', 'electric-sign', { sign: 1 }, '#ef4444', selected.q >= 0);
    drawHallButton(ctx, hits, leftX + pad + tw + gap, toolsY, tw, toolBtnH, '负(−)', 'electric-sign', { sign: -1 }, '#3b82f6', selected.q < 0);
    drawHallButton(ctx, hits, leftX + pad + 2 * (tw + gap), toolsY, tw, toolBtnH, '居中', 'electric-center', {}, accentHex);

    const paramRows = [
      ['|Q|', 'q', Math.abs(selected.q), 'electric-charge', 0.1, 1],
      ['X', 'x', selected.x, 'electric-move', 0.25, 2],
      ['Y', 'y', selected.y, 'electric-move', 0.25, 2],
      ['Z', 'z', selected.z, 'electric-move', 0.25, 2],
    ];
    const footBtnH = Math.round(44 * scale);
    const footY = y + editorH - footBtnH - pad;
    const rowStart = toolsY + toolBtnH + Math.round(8 * scale);
    const rowH = Math.max(20, (footY - Math.round(8 * scale) - rowStart) / paramRows.length);
    const adj = Math.min(Math.round(42 * scale), Math.floor(rowH - Math.round(4 * scale)));
    paramRows.forEach(([label, key, value, action, step, digits], i) => {
      const ry = rowStart + i * rowH;
      ctx.fillStyle = P.text;
      ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", Consolas, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${label}  ${fmt(value, digits)}`, leftX + pad, ry + rowH / 2);
      const metaM = key === 'q' ? { delta: -step } : { axis: key, delta: -step };
      const metaP = key === 'q' ? { delta: step } : { axis: key, delta: step };
      drawHallButton(ctx, hits, leftX + colW - pad - adj * 2 - Math.round(8 * scale), ry + (rowH - adj) / 2, adj, adj, '−', action, metaM, accentHex);
      drawHallButton(ctx, hits, leftX + colW - pad - adj, ry + (rowH - adj) / 2, adj, adj, '+', action, metaP, accentHex);
    });
    drawHallButton(
      ctx, hits, leftX + pad, footY, colW - 2 * pad, footBtnH,
      '删除选中', 'electric-delete', {}, '#ef4444',
    );
  } else {
    drawEditorPanel(leftX, colW, '源电荷', '点击上方列表或 3D 电荷以选中');
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('未选中电荷', leftX + colW / 2, y + editorH / 2);
  }

  // Right: probe + camera
  drawEditorPanel(
    rightX, colW,
    '试探电荷 q₀',
    `q₀=${fmt(probe.q0, 1)}  (${fmt(probe.x)}, ${fmt(probe.y)}, ${fmt(probe.z)})`,
  );
  {
    const toolsY = y + Math.round(62 * scale);
    const tw = (colW - 2 * pad - 3 * gap) / 4;
    const toolBtnH = Math.round(36 * scale);
    drawHallButton(ctx, hits, rightX + pad, toolsY, tw, toolBtnH, 'q₀正', 'electric-probe-sign', { sign: 1 }, '#f59e0b', probe.q0 >= 0);
    drawHallButton(ctx, hits, rightX + pad + tw + gap, toolsY, tw, toolBtnH, 'q₀负', 'electric-probe-sign', { sign: -1 }, '#f59e0b', probe.q0 < 0);
    drawHallButton(ctx, hits, rightX + pad + 2 * (tw + gap), toolsY, tw, toolBtnH, 'q₀−', 'electric-probe-charge', { delta: -0.1 }, accentHex);
    drawHallButton(ctx, hits, rightX + pad + 3 * (tw + gap), toolsY, tw, toolBtnH, 'q₀+', 'electric-probe-charge', { delta: 0.1 }, accentHex);

    const probeRows = [
      ['X', 'x', probe.x],
      ['Y', 'y', probe.y],
      ['Z', 'z', probe.z],
    ];
    const footBtnH = Math.round(44 * scale);
    const footY = y + editorH - footBtnH - pad;
    const rowStart = toolsY + toolBtnH + Math.round(8 * scale);
    const rowH = Math.max(20, (footY - Math.round(8 * scale) - rowStart) / probeRows.length);
    const adj = Math.min(Math.round(42 * scale), Math.floor(rowH - Math.round(4 * scale)));
    probeRows.forEach(([label, axis, value], i) => {
      const ry = rowStart + i * rowH;
      ctx.fillStyle = P.text;
      ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", Consolas, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${label}  ${fmt(value)}`, rightX + pad, ry + rowH / 2);
      drawHallButton(ctx, hits, rightX + colW - pad - adj * 2 - Math.round(8 * scale), ry + (rowH - adj) / 2, adj, adj, '−', 'electric-probe-move', { axis, delta: -0.25 }, accentHex);
      drawHallButton(ctx, hits, rightX + colW - pad - adj, ry + (rowH - adj) / 2, adj, adj, '+', 'electric-probe-move', { axis, delta: 0.25 }, accentHex);
    });
    const fw = (colW - 2 * pad - gap) / 2;
    drawHallButton(ctx, hits, rightX + pad, footY, fw, footBtnH, '重置视角', 'electric-reset-view', {}, accentHex);
    drawHallButton(ctx, hits, rightX + pad + fw + gap, footY, fw, footBtnH, d.autoRotate ? '停转' : '旋转', 'electric-auto', {}, accentHex, d.autoRotate);
  }
}

function drawHallExperiment(ctx, W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const isLight = _uiTheme === 'light';
  const identified = d.identified || {};
  const allIdentified = !!(identified.hall_helmholtz && identified.hall_solenoid && identified.hall_probe && identified.hall_console);
  const target = d.target || 'helmholtz';
  const stepIndex = Number(d.stepIndex || 0);
  const records = Array.isArray(d.records) ? d.records : [];

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.title;
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 6;
  }
  ctx.font = `bold ${Math.round(34 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(experiment.name, innerX + 4, contentTop);
  ctx.restore();

  // Step indicator pill badge
  const totalSteps = experiment.steps?.length || 6;
  const stepText = `步骤 ${Math.min(stepIndex + 1, totalSteps)}/${totalSteps} · ${experiment.steps?.[stepIndex]?.text || '自由测量'}`;
  ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.16)' : 'rgba(56, 189, 248, 0.14)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 1.2;
  const badgeW = Math.min(innerW - Math.round(250 * scale), ctx.measureText(stepText).width + Math.round(48 * scale));
  const badgeH = Math.round(34 * scale);
  roundRect(ctx, innerX + Math.round(260 * scale), contentTop + 4, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = isLight ? '#0369a1' : '#7dd3fc';
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  }
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(stepText, innerX + Math.round(278 * scale), contentTop + Math.round(10 * scale));
  ctx.restore();

  if (stepIndex === 0 && !allIdentified) {
    const panelY = contentTop + Math.round(48 * scale);
    const panelH = contentH - Math.round(52 * scale);
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(10, 22, 44, 0.65)';
    ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.32)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, innerX, panelY, innerW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = isLight ? '#0284c7' : accentHex;
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.font = `bold ${Math.round(23 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('实验器材识别 · 3D 实验台瞄准指引', innerX + Math.round(20 * scale), panelY + Math.round(16 * scale));
    ctx.restore();

    const items = [
      { role: 'hall_helmholtz', n: '01', name: '亥姆霍兹线圈', desc: '一对同轴圆线圈，在中心区域产生近似均匀磁场。' },
      { role: 'hall_solenoid', n: '02', name: '长螺线管', desc: '通电后内部形成轴向磁场，用于测量 B–X 分布。' },
      { role: 'hall_probe', n: '03', name: '霍尔探头与标尺', desc: '沿线圈轴线移动，将局部磁场转换为霍尔电压。' },
      { role: 'hall_console', n: '04', name: 'HCC-2 测磁仪面板', desc: '绿色框内含三组接线柱、Im/Is/VH 数码屏及其调节旋钮。' },
    ];
    const nextRole = items.find((item) => !identified[item.role])?.role || null;
    const nextItem = items.find((item) => item.role === nextRole) || null;
    const feedback = d.identifyFeedback || null;

    const tipY = panelY + Math.round(52 * scale);
    const tipH = Math.round(46 * scale);
    if (feedback?.text) {
      const ok = feedback.ok !== false;
      ctx.fillStyle = ok ? 'rgba(34, 197, 94, 0.16)' : 'rgba(248, 113, 113, 0.18)';
      ctx.strokeStyle = ok ? '#4ade80' : '#f87171';
      ctx.lineWidth = 1.5;
      roundRect(ctx, innerX + Math.round(16 * scale), tipY, innerW - Math.round(32 * scale), tipH, 8);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.fillStyle = ok ? (isLight ? '#15803d' : '#86efac') : (isLight ? '#b91c1c' : '#fecaca');
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 4;
      }
      ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'middle';
      const tipPrefix = ok ? '✓ ' : '✗ ';
      const tipLines = wrapText(ctx, tipPrefix + feedback.text, innerW - Math.round(56 * scale));
      ctx.fillText(tipLines[0] || '', innerX + Math.round(30 * scale), tipY + tipH / 2);
      ctx.restore();
    } else {
      ctx.fillStyle = isLight ? 'rgba(240, 249, 255, 0.95)' : 'rgba(56, 189, 248, 0.14)';
      ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.2;
      roundRect(ctx, innerX + Math.round(16 * scale), tipY, innerW - Math.round(32 * scale), tipH, 8);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.fillStyle = isLight ? '#0369a1' : '#e0f2fe';
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 4;
      }
      ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(nextItem ? `◉ 当前瞄准目标：【 ${nextItem.n} ${nextItem.name} 】 —— 移动视野准星对准后，按 [E] 键或点击确认` : '全部器材识别完成！', innerX + Math.round(30 * scale), tipY + tipH / 2);
      ctx.restore();
    }

    const gap = Math.round(16 * scale);
    const cardW = (innerW - gap - Math.round(32 * scale)) / 2;
    const cardTop = tipY + tipH + Math.round(16 * scale);
    const cardH = Math.min(Math.round(118 * scale), (panelH - (cardTop - panelY) - Math.round(76 * scale)) / 2);
    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = innerX + Math.round(16 * scale) + col * (cardW + gap);
      const y = cardTop + row * (cardH + gap);
      const done = !!identified[item.role];
      const current = !done && item.role === nextRole;
      const locked = !done && !current;

      ctx.save();
      if (current && !isLight) {
        ctx.shadowColor = accentHex;
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = done
        ? (isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(34, 197, 94, 0.14)')
        : current
          ? (isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(56, 189, 248, 0.20)')
          : (isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(15, 30, 56, 0.45)');
      ctx.strokeStyle = done
        ? (isLight ? '#16a34a' : '#4ade80')
        : current
          ? (isLight ? '#0284c7' : accentHex)
          : (isLight ? 'rgba(14, 165, 233, 0.35)' : 'rgba(148, 163, 184, 0.24)');
      ctx.lineWidth = current ? 2.4 : 1.2;
      roundRect(ctx, x, y, cardW, cardH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (current) {
        ctx.fillStyle = isLight ? '#0284c7' : accentHex;
        roundRect(ctx, x + Math.round(12 * scale), y + 2, cardW - Math.round(24 * scale), 3, 1.5);
        ctx.fill();
      }

      ctx.save();
      ctx.fillStyle = done ? (isLight ? '#15803d' : '#4ade80') : current ? (isLight ? '#0284c7' : accentHex) : P.muted;
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 4;
      }
      ctx.font = `bold ${Math.round(22 * scale)}px Consolas, monospace`;
      ctx.fillText(done ? '✓' : `[${item.n}]`, x + Math.round(16 * scale), y + Math.round(14 * scale));
      ctx.restore();

      ctx.save();
      ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 4;
      }
      ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(item.name, x + Math.round(68 * scale), y + Math.round(14 * scale));
      ctx.restore();

      const statusTag = done ? '已解锁' : current ? '当前目标' : '待解锁';
      ctx.fillStyle = done ? (isLight ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.22)') : current ? (isLight ? 'rgba(14,165,233,0.22)' : 'rgba(56,189,248,0.28)') : (isLight ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.15)');
      roundRect(ctx, x + cardW - Math.round(86 * scale), y + Math.round(12 * scale), Math.round(72 * scale), Math.round(24 * scale), Math.round(12 * scale));
      ctx.fill();
      ctx.fillStyle = done ? (isLight ? '#15803d' : '#86efac') : current ? (isLight ? '#0369a1' : '#7dd3fc') : (isLight ? '#475569' : '#94a3b8');
      ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(statusTag, x + cardW - Math.round(50 * scale), y + Math.round(24 * scale));
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
      ctx.font = `${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
      wrapText(ctx, locked ? `请按顺序先完成前置器材识别` : item.desc, cardW - Math.round(32 * scale))
        .slice(0, 2)
        .forEach((line, li) => {
          ctx.fillText(line, x + Math.round(16 * scale), y + Math.round(50 * scale) + li * Math.round(22 * scale));
        });
    });

    drawHallButton(
      ctx, hits, innerX + innerW * 0.22, panelY + panelH - Math.round(58 * scale),
      innerW * 0.56, Math.round(46 * scale),
      nextItem ? `◉ 确认当前瞄准：【 ${nextItem.n} ${nextItem.name} 】` : '✓ 全部器材识别完成',
      'hall-identify', {}, accentHex, true,
    );
    return;
  }

  const targetY = contentTop + Math.round(48 * scale);
  const targetH = Math.round(58 * scale);
  const targetGap = Math.round(12 * scale);
  const targetW = (innerW - targetGap) / 2;
  drawHallButton(ctx, hits, innerX, targetY, targetW, targetH, '◉ 亥姆霍兹线圈', 'hall-target', { target: 'helmholtz' }, accentHex, target === 'helmholtz');
  drawHallButton(ctx, hits, innerX + targetW + targetGap, targetY, targetW, targetH, '▰ 长螺线管', 'hall-target', { target: 'solenoid' }, accentHex, target === 'solenoid');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const bodyY = targetY + targetH + Math.round(12 * scale);
  const bottomH = Math.round(60 * scale);
  const bodyH = contentTop + contentH - bodyY - bottomH - Math.round(10 * scale);
  const colGap = Math.round(14 * scale);
  const leftW = innerW * 0.47;
  const rightX = innerX + leftW + colGap;
  const rightW = innerW - leftW - colGap;

  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(2, 12, 27, 0.64)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.48)' : 'rgba(56, 189, 248, 0.24)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, innerX, bodyY, leftW, bodyH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = isLight ? '#0284c7' : accentHex;
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  }
  ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('实验参数控制', innerX + Math.round(16 * scale), bodyY + Math.round(14 * scale));
  ctx.restore();

  const params = [
    { key: 'Im', label: '励磁电流 Im', value: Number(d.Im || 0), unit: 'A', step: 0.05, digits: 2 },
    { key: 'Is', label: '霍尔电流 Is', value: Number(d.Is || 0), unit: 'mA', step: 0.5, digits: 1 },
    { key: 'probePos', label: '探头位置 X', value: Number(d.probePos || 0), unit: 'cm', step: 1, digits: 1 },
    target === 'helmholtz'
      ? { key: 'rightCoilPos', label: '右线圈位置', value: Number(d.rightCoilPos || 0), unit: 'cm', step: 0.5, digits: 1 }
      : { key: 'turns', label: '螺线管匝数 N', value: Number(d.turns || 0), unit: '匝', step: 10, digits: 0 },
  ];
  const rowY0 = bodyY + Math.round(48 * scale);
  const rowH = Math.min(Math.round(72 * scale), (bodyH - Math.round(58 * scale)) / 4);
  params.forEach((p, i) => {
    const y = rowY0 + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.16)';
      ctx.beginPath(); ctx.moveTo(innerX + Math.round(14 * scale), y); ctx.lineTo(innerX + leftW - Math.round(14 * scale), y); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.save();
    ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.font = `${Math.round(21 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(p.label, innerX + Math.round(16 * scale), y + Math.round(18 * scale));
    ctx.restore();

    ctx.save();
    ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.font = `bold ${Math.round(25 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${p.value.toFixed(p.digits)} ${p.unit}`, innerX + leftW - Math.round(104 * scale), y + Math.round(16 * scale));
    ctx.restore();
    ctx.textAlign = 'left';
    const btnW = Math.round(40 * scale);
    const btnH = Math.min(Math.round(46 * scale), rowH - 6);
    drawHallButton(ctx, hits, innerX + leftW - btnW * 2 - Math.round(10 * scale), y + (rowH - btnH) / 2, btnW, btnH, '−', 'hall-adjust', { key: p.key, delta: -p.step }, accentHex);
    drawHallButton(ctx, hits, innerX + leftW - btnW - Math.round(4 * scale), y + (rowH - btnH) / 2, btnW, btnH, '+', 'hall-adjust', { key: p.key, delta: p.step }, accentHex);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(2, 12, 27, 0.64)';
  ctx.strokeStyle = isLight ? 'rgba(236, 72, 153, 0.48)' : 'rgba(244, 114, 182, 0.32)';
  roundRect(ctx, rightX, bodyY, rightW, bodyH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = isLight ? '#be185d' : '#f9a8d4';
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  }
  ctx.font = `bold ${Math.round(21 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(d.showCurve ? 'B–X 磁场分布' : '实验数据记录', rightX + Math.round(16 * scale), bodyY + Math.round(14 * scale));
  ctx.restore();

  ctx.save();
  ctx.fillStyle = isLight ? '#831843' : '#fff1f2';
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  } else {
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 8;
  }
  ctx.font = `bold ${Math.round(28 * scale)}px Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`${Number(d.vh || 0).toFixed(2)} mV`, rightX + rightW - Math.round(16 * scale), bodyY + Math.round(12 * scale));
  ctx.restore();
  ctx.textAlign = 'left';

  const chartX = rightX + Math.round(18 * scale);
  const chartY = bodyY + Math.round(54 * scale);
  const chartW = rightW - Math.round(36 * scale);
  const chartH = Math.max(110, bodyH - Math.round(104 * scale));
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 23, 42, 0.72)';
  roundRect(ctx, chartX, chartY, chartW, chartH, 8);
  ctx.fill();
  if (d.showCurve) {
    const same = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) <= eps;
    const shown = records.filter((r) => r.target === target
      && same(r.Im ?? d.Im, d.Im)
      && Number(r.direction ?? d.direction) === Number(d.direction)
      && (target === 'solenoid'
        ? same(r.turns ?? d.turns, d.turns)
        : same(r.rightCoilPos ?? d.rightCoilPos, d.rightCoilPos)));
    const xMin = -15;
    const xMax = 15;
    const theory = Array.from({ length: 161 }, (_, i) => {
      const x = xMin + ((xMax - xMin) * i) / 160;
      return { x, b: hallTheoreticalB(d, x) };
    });
    const measured = shown.map((r) => ({ x: Number(r.pos || 0), b: hallRecordedB(r) }));
    const allB = theory.map((p) => p.b).concat(measured.map((p) => p.b), [0]);
    const rawMin = Math.min(...allB);
    const rawMax = Math.max(...allB);
    let yMin;
    let yMax;
    if (rawMin >= 0) {
      yMin = 0;
      yMax = Math.max(0.02, rawMax * 1.12);
    } else if (rawMax <= 0) {
      yMin = Math.min(-0.02, rawMin * 1.12);
      yMax = 0;
    } else {
      const yPad = Math.max(0.02, (rawMax - rawMin) * 0.1);
      yMin = rawMin - yPad;
      yMax = rawMax + yPad;
    }

    const plotL = chartX + Math.round(58 * scale);
    const plotR = chartX + chartW - Math.round(14 * scale);
    const plotT = chartY + Math.round(27 * scale);
    const plotB = chartY + chartH - Math.round(34 * scale);
    const px = (x) => plotL + ((x - xMin) / (xMax - xMin)) * (plotR - plotL);
    const py = (b) => plotB - ((b - yMin) / Math.max(1e-9, yMax - yMin)) * (plotB - plotT);

    ctx.lineWidth = 1;
    ctx.font = `${Math.round(13 * scale)}px Consolas, monospace`;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const gx = plotL + (plotR - plotL) * t;
      const gy = plotB - (plotB - plotT) * t;
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath(); ctx.moveTo(gx, plotT); ctx.lineTo(gx, plotB); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotR, gy); ctx.stroke();
      ctx.save();
      ctx.fillStyle = isLight ? '#0f172a' : 'rgba(203, 213, 225, 0.78)';
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 3;
      }
      ctx.textAlign = 'center';
      ctx.fillText((xMin + (xMax - xMin) * t).toFixed(1), gx, plotB + Math.round(7 * scale));
      ctx.textAlign = 'right';
      ctx.fillText((yMin + (yMax - yMin) * t).toFixed(2), plotL - Math.round(7 * scale), gy - Math.round(7 * scale));
      ctx.restore();
    }
    ctx.strokeStyle = isLight ? '#64748b' : 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(plotL, plotT); ctx.lineTo(plotL, plotB); ctx.lineTo(plotR, plotB); ctx.stroke();
    ctx.save();
    ctx.fillStyle = isLight ? '#0f172a' : '#cbd5e1';
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.font = `bold ${Math.round(14 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('B / mT', chartX + Math.round(5 * scale), chartY + Math.round(7 * scale));
    ctx.textAlign = 'right';
    ctx.fillText('X / cm', plotR, plotB + Math.round(20 * scale));
    ctx.restore();

    ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    theory.forEach((p, i) => {
      if (i === 0) ctx.moveTo(px(p.x), py(p.b));
      else ctx.lineTo(px(p.x), py(p.b));
    });
    ctx.stroke();

    measured.forEach((p) => {
      if (p.x < xMin || p.x > xMax) return;
      ctx.fillStyle = isLight ? '#be185d' : '#fdf2f8';
      ctx.strokeStyle = isLight ? '#831843' : '#f472b6';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(p.x), py(p.b), Math.round(5 * scale), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    const condition = target === 'solenoid'
      ? `L=26cm  N=${Number(d.turns || 100)}`
      : (() => {
        const separation = Number(d.rightCoilPos ?? 2.5) + 2.5;
        return `间距 d=${separation.toFixed(1)}cm ${Math.abs(separation - 5) < 1e-6 ? '=R' : separation > 5 ? '>R' : '<R'}`;
      })();
    ctx.save();
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.fillStyle = isLight ? '#0369a1' : '#7dd3fc';
    ctx.fillText(`— 理论线　${condition}`, plotR, chartY + Math.round(5 * scale));
    ctx.fillStyle = isLight ? '#be185d' : '#f9a8d4';
    ctx.fillText(`● 实测点 ${shown.length} 组`, plotR, chartY + Math.round(20 * scale));
    ctx.restore();
    ctx.textAlign = 'left';
  } else {
    const cols = [
      { label: '#', x: 0.03 }, { label: '对象', x: 0.11 }, { label: 'X/cm', x: 0.29 },
      { label: 'VH/mV', x: 0.43 }, { label: 'B/mT', x: 0.62 }, { label: 'Im/Is', x: 0.80 },
    ];
    ctx.fillStyle = isLight ? 'rgba(244, 114, 182, 0.2)' : 'rgba(244, 114, 182, 0.12)';
    ctx.fillRect(chartX, chartY, chartW, Math.round(34 * scale));
    ctx.save();
    ctx.fillStyle = isLight ? '#9d174d' : '#f9a8d4';
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    cols.forEach((col) => ctx.fillText(col.label, chartX + chartW * col.x, chartY + Math.round(8 * scale)));
    ctx.restore();
    const rowH = Math.round(30 * scale);
    const maxRows = Math.max(1, Math.floor((chartH - Math.round(40 * scale)) / rowH));
    const maxStart = Math.max(0, records.length - maxRows);
    let start = maxStart;
    if (Number.isFinite(d.tableScrollTop) && d.tableScrollTop >= 0 && !d.tableScrollAuto) {
      start = Math.max(0, Math.min(maxStart, Math.round(d.tableScrollTop)));
    } else {
      d.tableScrollTop = maxStart;
      d.tableScrollAuto = true;
    }
    const visibleRows = records.slice(start, start + maxRows);

    hits.push({
      x: chartX,
      y: chartY,
      w: chartW,
      h: chartH,
      action: 'hall-scroll-table',
      role: 'scrollable_table',
      // Keep the rendered viewport in the hit region so wheel / drag handlers
      // share the same scroll range as the canvas (incl. scaled fullscreen).
      maxRows,
      maxStart,
      rowH,
      scrollable: maxStart > 0,
    });

    visibleRows.forEach((r, i) => {
      const y = chartY + Math.round(36 * scale) + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.025)';
        ctx.fillRect(chartX, y, chartW, rowH);
      }
      ctx.save();
      ctx.fillStyle = isLight ? '#0f172a' : '#dbeafe';
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 3;
      }
      ctx.font = `bold ${Math.round(15 * scale)}px Consolas, "Microsoft YaHei", monospace`;
      const values = [
        String(start + i + 1), r.target === 'solenoid' ? '螺线管' : '亥姆',
        Number(r.pos || 0).toFixed(1), Number(r.vh || 0).toFixed(2),
        hallRecordedB(r).toFixed(3), `${Number(r.Im || 0).toFixed(2)}/${Number(r.Is || 0).toFixed(1)}`,
      ];
      cols.forEach((col, ci) => ctx.fillText(values[ci], chartX + chartW * col.x, y + Math.round(7 * scale)));
      ctx.restore();
    });
    if (!records.length) {
      ctx.fillStyle = isLight ? '#475569' : 'rgba(148, 163, 184, 0.65)';
      ctx.font = `bold ${Math.round(19 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('点击「记录当前读数」添加第一组数据', chartX + chartW / 2, chartY + chartH / 2);
      ctx.textAlign = 'left';
    }
    if (records.length > maxRows) {
      const trackW = Math.round(6 * scale);
      const trackX = chartX + chartW - trackW - Math.round(6 * scale);
      const trackY = chartY + Math.round(36 * scale);
      const trackH = chartH - Math.round(42 * scale);
      ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.1)';
      roundRect(ctx, trackX, trackY, trackW, trackH, Math.round(3 * scale));
      ctx.fill();

      const thumbH = Math.max(Math.round(28 * scale), trackH * (maxRows / records.length));
      const thumbY = trackY + (start / Math.max(1, maxStart)) * (trackH - thumbH);
      ctx.fillStyle = isLight ? 'rgba(236, 72, 153, 0.75)' : 'rgba(244, 114, 182, 0.85)';
      if (!isLight) {
        ctx.shadowColor = '#f472b6';
        ctx.shadowBlur = 6;
      }
      roundRect(ctx, trackX, thumbY, trackW, thumbH, Math.round(3 * scale));
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.save();
  ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
  if (isLight) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 4;
  }
  ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
  const wiringText = d.wiring?.energized
    ? `${d.wiring.label} · ${d.wiring.reversed ? '反接' : '正接'}`
    : d.wiring?.status === 'invalid' ? '接线无效/未闭合' : 'Im 输出未接线';
  ctx.fillText(`共 ${records.length} 组 · K=${HALL_K} mV·mA⁻¹·T⁻¹ · ${wiringText}`, rightX + Math.round(18 * scale), bodyY + bodyH - Math.round(24 * scale));
  ctx.restore();

  const btnY = bodyY + bodyH + Math.round(10 * scale);
  const btnGap = Math.round(12 * scale);
  const labels = [
    { label: '↔ 交换红黑接线', action: 'hall-direction' },
    { label: '记录当前读数', action: 'hall-record', active: true },
    { label: d.showCurve ? '返回记录' : '生成曲线', action: 'hall-chart' },
    { label: '清空', action: 'hall-clear' },
    { label: d.completed ? '实验已完成' : '完成实验', action: 'hall-complete' },
  ];
  const bw = (innerW - btnGap * (labels.length - 1)) / labels.length;
  labels.forEach((b, i) => drawHallButton(ctx, hits, innerX + i * (bw + btnGap), btnY, bw, Math.round(56 * scale), b.label, b.action, {}, accentHex, b.active));
}

// ── Optics experiment screens ──────────────────────────────────────
// 设计原则：
// 1) 字号够大（全息/全屏可读）  2) 按步骤渐进展示，不堆满  3) 用布局计算而非 clip 裁切

function drawHallDemoExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(36 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(experiment.name, innerX + 4, contentTop);
  ctx.fillStyle = P.soft;
  ctx.font = `${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('自由观察 · 演示数值为相对量', innerX + Math.round(390 * scale), contentTop + Math.round(10 * scale));

  const formulaY = contentTop + Math.round(54 * scale);
  const formulaH = Math.round(82 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.38)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, innerX, formulaY, innerW, formulaH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = _uiTheme === 'light' ? '#be185d' : '#f9a8d4';
  ctx.font = `bold ${Math.round(31 * scale)}px Consolas, monospace`;
  ctx.fillText('Vₕ ∝ I · B / (n · d)', innerX + Math.round(24 * scale), formulaY + formulaH / 2 - Math.round(16 * scale));
  ctx.fillStyle = P.title;
  ctx.textAlign = 'right';
  ctx.font = `bold ${Math.round(32 * scale)}px Consolas, monospace`;
  ctx.fillText(`Vₕ = ${Number(d.vh || 0).toFixed(3)} rel.`, innerX + innerW - Math.round(24 * scale), formulaY + formulaH / 2 - Math.round(16 * scale));
  ctx.textAlign = 'left';

  const bodyY = formulaY + formulaH + Math.round(14 * scale);
  const footerH = Math.round(132 * scale);
  const bodyH = contentTop + contentH - bodyY - footerH;
  const gap = Math.round(16 * scale);
  const leftW = innerW * 0.53;
  const rightX = innerX + leftW + gap;
  const rightW = innerW - leftW - gap;
  for (const [x, w] of [[innerX, leftW], [rightX, rightW]]) {
    ctx.fillStyle = 'rgba(2, 12, 27, 0.64)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    roundRect(ctx, x, bodyY, w, bodyH, 12);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(23 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('动效参数', innerX + Math.round(18 * scale), bodyY + Math.round(14 * scale));
  const params = [
    { key: 'I', label: '电流 I', value: Number(d.I || 0), range: '0.00 — 2.00', step: 0.1 },
    { key: 'B', label: '磁场 B', value: Number(d.B || 0), range: '−2.00 — 2.00', step: 0.1 },
    { key: 'n', label: '载流子浓度 n', value: Number(d.n || 0), range: '0.30 — 2.50', step: 0.1 },
    { key: 'd', label: '样品厚度 d', value: Number(d.d || 0), range: '0.10 — 1.20', step: 0.05 },
  ];
  const rowY = bodyY + Math.round(50 * scale);
  const rowH = Math.max(Math.round(68 * scale), (bodyH - Math.round(62 * scale)) / params.length);
  params.forEach((p, i) => {
    const y = rowY + i * rowH;
    if (i) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.beginPath(); ctx.moveTo(innerX + Math.round(16 * scale), y); ctx.lineTo(innerX + leftW - Math.round(16 * scale), y); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.round(21 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(p.label, innerX + Math.round(18 * scale), y + Math.round(13 * scale));
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = `${Math.round(15 * scale)}px Consolas, monospace`;
    ctx.fillText(p.range, innerX + Math.round(18 * scale), y + Math.round(42 * scale));
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.round(27 * scale)}px Consolas, monospace`;
    ctx.fillText(p.value.toFixed(2), innerX + leftW - Math.round(124 * scale), y + Math.round(18 * scale));
    ctx.textAlign = 'left';
    const btnW = Math.round(44 * scale);
    const btnH = Math.min(Math.round(48 * scale), rowH - 6);
    drawHallButton(ctx, hits, innerX + leftW - btnW * 2 - Math.round(12 * scale), y + (rowH - btnH) / 2, btnW, btnH, '−', 'hall-demo-adjust', { key: p.key, delta: -p.step }, accentHex);
    drawHallButton(ctx, hits, innerX + leftW - btnW - Math.round(6 * scale), y + (rowH - btnH) / 2, btnW, btnH, '+', 'hall-demo-adjust', { key: p.key, delta: p.step }, accentHex);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f9a8d4';
  ctx.font = `bold ${Math.round(23 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('当前状态', rightX + Math.round(18 * scale), bodyY + Math.round(14 * scale));
  const metrics = [
    ['载流子', d.nType ? 'n 型 · 电子 e⁻' : 'p 型 · 空穴 h⁺'],
    ['霍尔极性', Math.abs(Number(d.vh || 0)) < 0.005 ? '—' : Number(d.vh) < 0 ? '负极性' : '正极性'],
    ['|I · B|', Number(d.force || 0).toFixed(3)],
    ['动效', d.paused ? '已暂停' : '运行中'],
  ];
  metrics.forEach(([label, value], i) => {
    const y = bodyY + Math.round(58 * scale) + i * Math.round(62 * scale);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
    ctx.font = `${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(label, rightX + Math.round(20 * scale), y);
    ctx.fillStyle = i === 1 ? '#f9a8d4' : '#f8fafc';
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(value, rightX + rightW - Math.round(20 * scale), y - 2);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = 'rgba(186, 230, 253, 0.78)';
  ctx.font = `${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
  wrapText(ctx, '粒子流向表示载流子漂移；横向偏转随 I、B 增强，并随 n、d 增大而减弱。', rightW - Math.round(38 * scale))
    .slice(0, 3).forEach((line, i) => ctx.fillText(line, rightX + Math.round(20 * scale), bodyY + bodyH - Math.round(74 * scale) + i * Math.round(23 * scale)));

  const buttonY1 = bodyY + bodyH + Math.round(12 * scale);
  const bw1 = (innerW - Math.round(14 * scale)) / 2;
  const topBtnH = Math.round(54 * scale);
  drawHallButton(ctx, hits, innerX, buttonY1, bw1, topBtnH, 'n 型 · 电子', 'hall-demo-type', { nType: true }, accentHex, d.nType !== false);
  drawHallButton(ctx, hits, innerX + bw1 + Math.round(14 * scale), buttonY1, bw1, topBtnH, 'p 型 · 空穴', 'hall-demo-type', { nType: false }, accentHex, d.nType === false);
  const buttonY2 = buttonY1 + topBtnH + Math.round(12 * scale);
  const bottomBtnH = Math.round(54 * scale);
  const actions = [
    { label: '反转 B', action: 'hall-demo-flip' },
    { label: d.paused ? '继续动效' : '暂停动效', action: 'hall-demo-pause', active: d.paused },
    { label: d.showB === false ? '显示 B' : '隐藏 B', action: 'hall-demo-field', active: d.showB === false },
    { label: d.autoCam ? '停止旋转' : '自动旋转', action: 'hall-demo-auto', active: d.autoCam },
    { label: '重置', action: 'hall-demo-reset' },
  ];
  const actionGap = Math.round(12 * scale);
  const actionW = (innerW - actionGap * (actions.length - 1)) / actions.length;
  actions.forEach((button, i) => drawHallButton(
    ctx, hits, innerX + i * (actionW + actionGap), buttonY2, actionW, bottomBtnH,
    button.label, button.action, {}, accentHex, button.active,
  ));
}

function drawOptButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false) {
  drawPremiumHoloButton(ctx, hits, x, y, w, h, label, action, meta, accent, active, _uiTheme);
}

function drawOptPanel(ctx, x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(2, 12, 27, 0.78)';
  ctx.strokeStyle = `${accent}55`;
  ctx.lineWidth = 1.6;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

function drawOptHeader(ctx, experiment, step, stepIndex, stepsLen, innerX, contentTop, innerW, scale = 1.0) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${Math.round(34 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(experiment.name, innerX, contentTop);

  ctx.fillStyle = 'rgba(253, 230, 138, 0.95)';
  ctx.font = `${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
  const stepLine = `步骤 ${stepIndex + 1}/${stepsLen}  ·  ${step?.text || ''}`;
  const lines = wrapText(ctx, stepLine, innerW - 4).slice(0, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, innerX, contentTop + Math.round(42 * scale) + i * Math.round(28 * scale)));
  return Math.round(42 * scale) + lines.length * Math.round(28 * scale) + Math.round(14 * scale);
}

function drawOptFooter(ctx, hits, buttons, innerX, btnY, innerW, accentHex, surface = 'full') {
  const scale = holoUiScale(surface);
  const gap = Math.round(12 * scale);
  const n = buttons.length;
  const bw = (innerW - gap * (n - 1)) / n;
  buttons.forEach((b, i) => {
    drawOptButton(
      ctx, hits, innerX + i * (bw + gap), btnY, bw, Math.round(56 * scale),
      b.label, b.action, b.meta || {}, accentHex, !!b.active,
    );
  });
}

function diffractionColor(nm, alpha = 1) {
  let r = 0; let g = 0; let b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  let f = 1;
  if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
  if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
  return `rgba(${Math.round(Math.max(0, r * f) * 255)},${Math.round(Math.max(0, g * f) * 255)},${Math.round(Math.max(0, b * f) * 255)},${alpha})`;
}

/** 单缝/多缝：参数、条纹、理论曲线与可复现实验记录同屏。 */
function drawDiffractionExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, surface = 'full' } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const scale = holoUiScale(surface);
  const d = hud?.data || {};
  const steps = experiment.steps || [];
  const stepIndex = Number(hud?.stepIndex || 0);
  const step = steps[stepIndex] || {};
  const footerH = Math.round(68 * scale);
  const headerH = drawOptHeader(ctx, experiment, step, stepIndex, steps.length, innerX, contentTop, innerW, scale);
  const bodyTop = contentTop + headerH;
  const bodyH = Math.max(Math.round(300 * scale), contentH - headerH - footerH);
  const gap = Math.round(14 * scale);
  const leftW = Math.floor(innerW * 0.42);
  const rightX = innerX + leftW + gap;
  const rightW = innerW - leftW - gap;
  drawOptPanel(ctx, innerX, bodyTop, leftW, bodyH, '#fbbf24');
  drawOptPanel(ctx, rightX, bodyTop, rightW, bodyH, '#38bdf8');

  // Presets — source experiment's six canonical configurations.
  const presets = [
    ['单缝', 'single'], ['双缝', 'double'], ['三缝', 'triple'],
    ['六缝', 'multi'], ['十缝光栅', 'grating'], ['He-Ne 双缝', 'hene2'],
  ];
  const pad = Math.round(16 * scale);
  let y = bodyTop + pad;
  ctx.fillStyle = '#fde68a';
  ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('实验预设', innerX + pad, y);
  y += Math.round(32 * scale);
  const presetGap = Math.round(7 * scale);
  const presetW = (leftW - pad * 2 - presetGap * 2) / 3;
  const presetH = Math.round(42 * scale);
  presets.forEach(([label, preset], i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    drawOptButton(
      ctx, hits,
      innerX + pad + col * (presetW + presetGap), y + row * (presetH + Math.round(6 * scale)),
      presetW, presetH, label, 'optics-diff-preset', { preset }, accentHex, d.preset === preset,
    );
  });
  y += Math.round(108 * scale);

  const params = [
    ['波长 λ', 'lambdaNm', Number(d.lambdaNm || 550), 'nm', 5, 0],
    ['缝数 N', 'N', Number(d.N || 2), '条', 1, 0],
    ['缝宽 a', 'slitMm', Number(d.slitMm || 0.05), 'mm', 0.005, 3],
    ['缝距 d', 'pitchMm', Number(d.pitchMm || 0.25), 'mm', 0.01, 3],
    ['屏距 L', 'distM', Number(d.distM || 1), 'm', 0.05, 2],
  ];
  params.forEach(([label, key, value, unit, delta, digits]) => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(label, innerX + pad, y + Math.round(12 * scale));
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold ${Math.round(21 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Number(value).toFixed(digits)} ${unit}`, innerX + leftW - Math.round(146 * scale), y + Math.round(12 * scale));
    ctx.textAlign = 'left';
    const btnW = Math.round(52 * scale);
    const btnH = Math.round(44 * scale);
    drawOptButton(ctx, hits, innerX + leftW - btnW * 2 - Math.round(20 * scale), y, btnW, btnH, '−', 'optics-diff-param', { key, delta: -delta }, accentHex);
    drawOptButton(ctx, hits, innerX + leftW - btnW - Math.round(12 * scale), y, btnW, btnH, '+', 'optics-diff-param', { key, delta }, accentHex);
    y += Math.round(56 * scale);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = d.farField ? '#4ade80' : '#fb7185';
  ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(d.farField ? '✓ Fraunhofer 远场近似可用' : '△ 菲涅耳数偏大，近场效应显著', innerX + pad, y + 4);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.round(18 * scale)}px Consolas, monospace`;
  ctx.fillText(`F=${Number(d.fresnel || 0).toExponential(2)}`, innerX + pad, y + Math.round(34 * scale));
  const toggleW = Math.round(78 * scale);
  const toggleH = Math.round(44 * scale);
  drawOptButton(ctx, hits, innerX + leftW - toggleW * 3 - Math.round(24 * scale), y, toggleW, toggleH, '光锥', 'optics-diff-toggle', { key: 'showBeam' }, accentHex, d.showBeam !== false);
  drawOptButton(ctx, hits, innerX + leftW - toggleW * 2 - Math.round(16 * scale), y, toggleW, toggleH, '波前', 'optics-diff-toggle', { key: 'showWave' }, accentHex, d.showWave !== false);
  drawOptButton(ctx, hits, innerX + leftW - toggleW - Math.round(8 * scale), y, toggleW, toggleH, d.demoOn ? '停止' : '扫频', 'optics-diff-demo', {}, accentHex, d.demoOn);

  // Right: theoretical curve, stripe preview, derived values, and records.
  const rx = rightX + pad;
  const rw = rightW - pad * 2;
  const plotTop = bodyTop + pad + Math.round(22 * scale);
  const plotH = Math.min(Math.round(250 * scale), bodyH * 0.38);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#bae6fd';
  ctx.font = `bold ${Math.round(21 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('Fraunhofer 理论强度  I(x)/I₀', rx, bodyTop + pad);
  ctx.fillStyle = '#050914';
  ctx.strokeStyle = 'rgba(56,189,248,0.38)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, rx, plotTop, rw, plotH, 8);
  ctx.fill();
  ctx.stroke();
  const px0 = rx + Math.round(42 * scale);
  const py0 = plotTop + Math.round(14 * scale);
  const pw = rw - Math.round(56 * scale);
  const ph = plotH - Math.round(42 * scale);
  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = py0 + (ph * i) / 4;
    ctx.beginPath(); ctx.moveTo(px0, gy); ctx.lineTo(px0 + pw, gy); ctx.stroke();
  }
  const half = diffractionHalfSpan(d);
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const x = -half + (2 * half * i) / 360;
    const intensity = diffractionIntensity(x, d);
    const px = px0 + (i / 360) * pw;
    const py = py0 + ph * (1 - intensity);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = diffractionColor(Number(d.lambdaNm || 550));
  ctx.shadowColor = diffractionColor(Number(d.lambdaNm || 550));
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.round(15 * scale)}px Consolas, monospace`;
  ctx.fillText(`${(-half * 1e3).toFixed(1)} mm`, px0, plotTop + plotH - Math.round(20 * scale));
  ctx.textAlign = 'right';
  ctx.fillText(`${(half * 1e3).toFixed(1)} mm`, px0 + pw, plotTop + plotH - Math.round(20 * scale));
  ctx.textAlign = 'left';

  const stripeY = plotTop + plotH + Math.round(10 * scale);
  const stripeH = Math.round(54 * scale);
  const stripeGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  const stops = 120;
  for (let i = 0; i <= stops; i++) {
    const x = -half + (2 * half * i) / stops;
    const I = diffractionIntensity(x, d);
    const soft = Math.min(1, Math.pow(I / (I + 0.08), 0.85));
    stripeGrad.addColorStop(i / stops, diffractionColor(Number(d.lambdaNm || 550), 0.04 + soft * 0.96));
  }
  ctx.fillStyle = '#030509';
  roundRect(ctx, rx, stripeY, rw, stripeH, 7); ctx.fill();
  ctx.fillStyle = stripeGrad;
  roundRect(ctx, rx, stripeY, rw, stripeH, 7); ctx.fill();

  const metricY = stripeY + stripeH + Math.round(14 * scale);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `${Math.round(19 * scale)}px Consolas, monospace`;
  ctx.fillText(`Δx≈${Number(d.fringeSpacingMm || 0).toFixed(3)} mm`, rx, metricY);
  ctx.fillText(`中央包络全宽≈${Number(d.centralWidthMm || 0).toFixed(3)} mm`, rx + rw * 0.42, metricY);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('理论线为方程密集采样；记录保存当前完整配置', rx, metricY + Math.round(30 * scale));

  const records = Array.isArray(d.records) ? d.records : [];
  const tableY = metricY + Math.round(62 * scale);
  ctx.fillStyle = '#bae6fd';
  ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`测量记录（${records.length} 组）`, rx, tableY);
  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  roundRect(ctx, rx, tableY + Math.round(28 * scale), rw, Math.max(Math.round(70 * scale), bodyTop + bodyH - (tableY + Math.round(38 * scale))), 8);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.round(16 * scale)}px Consolas, monospace`;
  ctx.fillText('#   λ/nm   N   a/mm   d/mm   L/m   Δx/mm', rx + Math.round(10 * scale), tableY + Math.round(38 * scale));
  const recent = records.slice(-4);
  recent.forEach((r, i) => {
    ctx.fillStyle = i === recent.length - 1 ? '#f8fafc' : '#cbd5e1';
    const index = records.length - recent.length + i + 1;
    ctx.fillText(
      `${String(index).padStart(2)}  ${Number(r.lambdaNm).toFixed(0).padStart(4)}   ${String(r.N).padStart(2)}  ${Number(r.slitMm).toFixed(3)}  ${Number(r.pitchMm).toFixed(3)}  ${Number(r.distM).toFixed(2)}  ${Number(r.fringeSpacingMm).toFixed(3)}`,
      rx + Math.round(10 * scale), tableY + Math.round(63 * scale) + i * Math.round(24 * scale),
    );
  });
  if (!records.length) {
    ctx.fillStyle = '#64748b';
    ctx.fillText('尚无记录 · 调整参数后点击“记录本组”', rx + Math.round(10 * scale), tableY + Math.round(68 * scale));
  }

  drawOptFooter(ctx, hits, [
    { label: d.lightOn ? '关闭激光' : '打开激光', action: 'optics-diff-power', active: !d.lightOn },
    { label: '记录本组', action: 'optics-diff-record' },
    { label: d.chartOpen ? '曲线已核对' : '核对理论曲线', action: 'optics-diff-chart', active: d.chartOpen },
    { label: '清空记录', action: 'optics-diff-clear' },
    { label: d.completed ? '实验已完成' : '完成实验', action: 'optics-diff-complete', active: d.completed },
  ], innerX, bodyTop + bodyH + Math.round(8 * scale), innerW, accentHex, surface);
}

/**
 * Return the logical canvas size required by the current hologram UI.
 * Dense experiment screens grow vertically instead of squeezing their rows,
 * while station menus grow with the number of experiment cards.
 *
 * surface:
 *  - 'selector' — tabletop terminal (activate + pick experiment only)
 *  - 'display'  — large floating content panel in front of the bench
 *  - 'full'     — legacy single-panel mode (menu + experiment on one surface)
 */
export function getHoloScreenLayoutSize(opts = {}) {
  const { active = false, hud = null, surface = 'full' } = opts;
  const width = 1024;
  if (!active) return { width, height: 640 };

  const experiment = hud?.experiment;
  const running = !!(hud?.running && experiment);

  // Tabletop selector never hosts dense experiment controls.
  if (surface === 'selector') {
    const cardCount = hud?.station?.experiments?.length || 0;
    const menuHeight = 220 + cardCount * HOLO_MENU_CARD_H
      + Math.max(0, cardCount - 1) * HOLO_MENU_CARD_GAP;
    return { width, height: Math.max(720, menuHeight + (running ? 88 : 0)) };
  }

  // Content display idles compact until an experiment is running.
  if (surface === 'display' && !running) {
    return { width: 1280, height: 780 };
  }

  if (surface === 'display' && running) {
    // Compact canvases: fill with controls, not empty glass.
    const denseDisplayHeights = {
      hall_carrier_demo: 1320,
      hall_effect: 1320,
      gauss_theorem: 1350,
      electric_field: 1450,
      faraday_induction: 1350,
      multi_slit_diffraction: 1320,
    };
    const denseHeight = denseDisplayHeights[experiment?.id];
    if (denseHeight) return { width: 1280, height: denseHeight };

    const stepCount = experiment?.steps?.length || 0;
    const dataLines = String(opts.dataHtml || '').split(/<br\s*\/?\s*>|\n/i).filter(Boolean).length;
    const contentHeight = Math.round((300 + stepCount * 54 + Math.min(dataLines, 6) * 30) * 1.2);
    return { width: 1280, height: Math.max(780, Math.min(1450, contentHeight)) };
  }

  if (!running) {
    const cardCount = hud?.station?.experiments?.length || 0;
    const menuHeight = 220 + cardCount * HOLO_MENU_CARD_H
      + Math.max(0, cardCount - 1) * HOLO_MENU_CARD_GAP;
    return { width, height: Math.max(720, menuHeight) };
  }

  const denseExperimentHeights = {
    hall_carrier_demo: 780,
    hall_effect: 760,
    gauss_theorem: 780,
    electric_field: 780,
    faraday_induction: 840,
    multi_slit_diffraction: 760,
  };
  const denseHeight = denseExperimentHeights[experiment.id];
  if (denseHeight) return { width, height: denseHeight };

  const stepCount = experiment.steps?.length || 0;
  const dataLines = String(opts.dataHtml || '').split(/<br\s*\/?\s*>|\n/i).filter(Boolean).length;
  const contentHeight = 300 + stepCount * 54 + Math.min(dataLines, 6) * 30;
  return { width, height: Math.max(680, Math.min(900, contentHeight)) };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @returns {{ hits: Array<{id:string,x:number,y:number,w:number,h:number,action:string,expId?:string}> }}
 */
export function drawHoloScreen(ctx, W, H, opts) {
  const {
    accentHex = '#38bdf8',
    fullTitle = '实验台',
    enTitle = 'STATION',
    active = false,
    hud = null,
    maximized = false,
    surface = 'full',
    theme: themeOpt,
  } = opts;

  const hits = [];
  const pad = 28;
  const innerX = pad;
  const innerY = pad;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const isSelector = surface === 'selector';
  const isDisplay = surface === 'display';
  const theme = themeOpt || (isDisplay ? 'dark' : 'dark');
  _uiTheme = theme;
  const P = screenPalette(theme, accentHex, isDisplay);

  // Shared type scale (large for readability + easy UV/AR clicks)
  const scaleF = holoUiScale(surface);
  const F = {
    headerMeta: Math.round(28 * scaleF),
    headerTitle: Math.round(40 * scaleF),
    idleTitle: Math.round(76 * scaleF),
    idleSub: Math.round(32 * scaleF),
    idleCta: Math.round(40 * scaleF),
    idleHint: Math.round(28 * scaleF),
    listHint: Math.round(28 * scaleF),
    cardNum: Math.round(28 * scaleF),
    cardName: Math.round(40 * scaleF),
    cardGoal: Math.round(28 * scaleF),
    expName: Math.round(40 * scaleF),
    theory: Math.round(26 * scaleF),
    section: Math.round(26 * scaleF),
    step: Math.round(28 * scaleF),
    stepActive: Math.round(30 * scaleF),
    hint: Math.round(26 * scaleF),
    data: Math.round(26 * scaleF),
    btn: Math.round(30 * scaleF),
    close: Math.round(40 * scaleF),
  };

  ctx.clearRect(0, 0, W, H);

  // High-Tech Holographic Cyber Glass Body
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (theme === 'light') {
    if (active) {
      bg.addColorStop(0, isDisplay ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.68)');
      bg.addColorStop(0.45, isDisplay ? 'rgba(248, 250, 252, 0.30)' : 'rgba(248, 250, 252, 0.62)');
      bg.addColorStop(1, isDisplay ? 'rgba(241, 245, 249, 0.34)' : 'rgba(241, 245, 249, 0.66)');
    } else {
      bg.addColorStop(0, isDisplay ? 'rgba(248, 250, 252, 0.28)' : 'rgba(248, 250, 252, 0.55)');
      bg.addColorStop(0.5, isDisplay ? 'rgba(241, 245, 249, 0.22)' : 'rgba(241, 245, 249, 0.48)');
      bg.addColorStop(1, isDisplay ? 'rgba(226, 232, 240, 0.28)' : 'rgba(226, 232, 240, 0.55)');
    }
  } else if (isDisplay) {
    // Ultra-clean translucent obsidian-sapphire crystal HUD glass
    bg.addColorStop(0, 'rgba(6, 16, 36, 0.38)');
    bg.addColorStop(0.45, 'rgba(10, 24, 48, 0.30)');
    bg.addColorStop(1, 'rgba(4, 12, 28, 0.40)');
  } else if (active) {
    bg.addColorStop(0, 'rgba(6, 40, 64, 0.92)');
    bg.addColorStop(0.45, 'rgba(8, 55, 88, 0.9)');
    bg.addColorStop(1, 'rgba(6, 32, 54, 0.94)');
  } else {
    bg.addColorStop(0, 'rgba(15, 23, 42, 0.78)');
    bg.addColorStop(0.5, 'rgba(30, 58, 95, 0.72)');
    bg.addColorStop(1, 'rgba(15, 23, 42, 0.82)');
  }
  ctx.fillStyle = bg;
  roundRect(ctx, 12, 12, W - 24, H - 24, 18);
  ctx.fill();

  // Glass Specular Gloss and Reflection Highlights
  if (theme === 'light') {
    ctx.save();
    // 1. Diagonal Glass Reflection / Gloss Sweep
    if (active) {
      const sheen = ctx.createLinearGradient(0, 0, W * 0.75, H * 0.55);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0.18)');
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(W * 0.72, 12);
      ctx.lineTo(12, H * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    // 2. Crystal Specular Edge Highlight (Light bouncing off top-left rim of thick glass)
    const borderGrad = ctx.createLinearGradient(12, 12, W - 12, H - 12);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    borderGrad.addColorStop(0.35, 'rgba(186, 230, 253, 0.75)');
    borderGrad.addColorStop(0.75, 'rgba(148, 163, 184, 0.42)');
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.85)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2.2;
    roundRect(ctx, 12, 12, W - 24, H - 24, 18);
    ctx.stroke();
    ctx.restore();
  }

  // Isometric / Orthogonal Cyber HUD Grid (Only on non-display or subtle top/bottom ruler marks)
  if (theme === 'dark' || isDisplay) {
    if (!isDisplay) {
      ctx.strokeStyle = theme === 'light' ? 'rgba(14, 165, 233, 0.08)' : 'rgba(56, 189, 248, 0.055)';
      ctx.lineWidth = 1;
      const gridSpacing = 32;
      for (let gx = 20; gx < W - 20; gx += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, H - 20); ctx.stroke();
      }
      for (let gy = 20; gy < H - 20; gy += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(20, gy); ctx.lineTo(W - 20, gy); ctx.stroke();
      }
    } else {
      // For content screen, keep middle perfectly clean and only draw precision ruler ticks along edges
      ctx.fillStyle = theme === 'light' ? 'rgba(2, 132, 199, 0.28)' : 'rgba(56, 189, 248, 0.22)';
      for (let tx = 40; tx < W - 40; tx += 20) {
        ctx.fillRect(tx, 14, 1, tx % 100 === 0 ? 6 : 3);
        ctx.fillRect(tx, H - (tx % 100 === 0 ? 20 : 17), 1, tx % 100 === 0 ? 6 : 3);
      }
    }
  }

  // Outer Neon Cyber Frame
  ctx.strokeStyle = theme === 'light' ? '#0284c7' : accentHex;
  ctx.lineWidth = isDisplay ? 1.8 : 2.5;
  ctx.globalAlpha = active ? 0.95 : 0.65;
  if (isDisplay && active && theme !== 'light') {
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 12;
  }
  roundRect(ctx, 14, 14, W - 28, H - 28, 16);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Inner Subtle Framing Wire
  if (isDisplay) {
    ctx.strokeStyle = theme === 'light' ? 'rgba(2, 132, 199, 0.32)' : 'rgba(56, 189, 248, 0.24)';
    ctx.lineWidth = 1;
    roundRect(ctx, 20, 20, W - 40, H - 40, 12);
    ctx.stroke();
  }

  // High-Tech Cyber Corner Ticks (Precision L-brackets)
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = theme === 'light' ? '#0284c7' : accentHex;
  const br = isDisplay ? 24 : 28;
  [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]].forEach(([x, y], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x + sx * br, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * br);
    ctx.stroke();
  });

  if (isDisplay && active) {
    ctx.font = `bold ${isDisplay ? 22 : 12}px Consolas, monospace`;
    ctx.fillStyle = theme === 'light' ? '#0369a1' : 'rgba(56, 189, 248, 0.65)';
    ctx.textAlign = 'left';
    ctx.fillText('// ELECTRO.HUD • OPTICAL', 38, 26);
    ctx.textAlign = 'right';
    ctx.fillText('[ONLINE • STREAM OK]', W - 38, 26);
    ctx.textAlign = 'left';
  }

  // Header Bar (Sci-Fi Cyber Header)
  const headerH = isDisplay ? 96 : 64;
  if (theme === 'light') {
    const hBg = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY);
    hBg.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
    hBg.addColorStop(0.5, 'rgba(241, 245, 249, 0.72)');
    hBg.addColorStop(1, 'rgba(255, 255, 255, 0.78)');
    ctx.fillStyle = hBg;
  } else if (isDisplay) {
    const hBg = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY);
    hBg.addColorStop(0, 'rgba(8, 20, 42, 0.88)');
    hBg.addColorStop(0.5, 'rgba(12, 28, 56, 0.82)');
    hBg.addColorStop(1, 'rgba(8, 20, 42, 0.88)');
    ctx.fillStyle = hBg;
  } else {
    ctx.fillStyle = P.headerBg;
  }
  roundRect(ctx, innerX, innerY, innerW, headerH, 10);
  ctx.fill();
  if (isDisplay) {
    ctx.strokeStyle = theme === 'light' ? 'rgba(2, 132, 199, 0.42)' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(innerX + 12, innerY + headerH);
    ctx.lineTo(innerX + innerW - 12, innerY + headerH);
    ctx.stroke();
  }

  // Header Tag / Badge
  ctx.fillStyle = theme === 'light' ? '#0284c7' : accentHex;
  ctx.font = `bold ${isDisplay ? 30 : 22}px "Segoe UI", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const headerTag = isDisplay ? `[ ELECTRO • HUD ]` : `HOLO // ${enTitle}`;
  if (isDisplay && theme !== 'light') {
    ctx.save();
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(innerX + 26, innerY + headerH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillText(headerTag, innerX + 42, innerY + headerH / 2);
  } else if (isDisplay && theme === 'light') {
    ctx.beginPath();
    ctx.arc(innerX + 26, innerY + headerH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 6;
    ctx.fillText(headerTag, innerX + 42, innerY + headerH / 2);
    ctx.restore();
  } else {
    ctx.save();
    if (theme === 'light') {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 6;
    }
    ctx.fillText(headerTag, innerX + 14, innerY + headerH / 2);
    ctx.restore();
  }

  // Header Title
  ctx.save();
  ctx.fillStyle = P.title;
  ctx.font = `bold ${isDisplay ? 52 : 34}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  if (isDisplay && theme !== 'light') {
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 10;
  } else if (theme === 'light') {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
    ctx.shadowBlur = 6;
  }
  const headerTitle = isDisplay && hud?.running && hud?.experiment?.name
    ? `${fullTitle} · ${hud.experiment.name}`
    : fullTitle;
  ctx.fillText(headerTitle, W / 2, innerY + headerH / 2);
  ctx.restore();

  // window chrome: maximize + close (active only; maximize mainly for content display)
  if (active) {
    const cy = innerY + (isDisplay ? 18 : 12);
    const cw = isDisplay ? 68 : 48;
    const ch = isDisplay ? 60 : 40;
    const gap = 10;
    const closeX = innerX + innerW - cw - 12;
    const maxX = closeX - cw - gap;

    if (!isSelector) {
      ctx.fillStyle = maximized ? P.maxFillOn : P.maxFill;
      roundRect(ctx, maxX, cy, cw, ch, 8);
      ctx.fill();
      ctx.strokeStyle = theme === 'light' ? '#0284c7' : accentHex;
      ctx.lineWidth = 1.5;
      roundRect(ctx, maxX, cy, cw, ch, 8);
      ctx.stroke();
      ctx.strokeStyle = P.maxIcon;
      ctx.lineWidth = 2.0;
      if (maximized) {
        ctx.strokeRect(maxX + 12, cy + 12, 14, 14);
        ctx.strokeRect(maxX + 16, cy + 9, 14, 14);
      } else {
        ctx.strokeRect(maxX + 13, cy + 11, 16, 16);
      }
      hits.push({
        id: 'maximize',
        x: maxX - 4,
        y: cy - 4,
        w: cw + 8,
        h: ch + 8,
        action: 'maximize',
        chrome: true,
      });
    }

    ctx.fillStyle = P.closeFill;
    roundRect(ctx, closeX, cy, cw, ch, 8);
    ctx.fill();
    ctx.strokeStyle = P.closeStroke;
    ctx.lineWidth = 1.5;
    roundRect(ctx, closeX, cy, cw, ch, 8);
    ctx.stroke();
    ctx.fillStyle = P.closeText;
    ctx.font = `bold ${isDisplay ? 48 : 32}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + cw / 2, cy + ch / 2 + 1);
    hits.push({
      id: 'close',
      x: closeX - 4,
      y: cy - 4,
      w: cw + 8,
      h: ch + 8,
      action: 'close',
      chrome: true,
    });
  }

  // scanlines
  if (isDisplay) {
    ctx.fillStyle = theme === 'light' ? 'rgba(14, 165, 233, 0.012)' : 'rgba(56, 189, 248, 0.015)';
    for (let y = 20; y < H - 20; y += 4) ctx.fillRect(20, y, W - 40, 1);
  } else {
    ctx.fillStyle = P.scanline;
    for (let y = 20; y < H - 20; y += 4) ctx.fillRect(20, y, W - 40, 1);
  }
  ctx.restore();

  if (!active) {
    // Display panels stay hidden until an experiment is chosen — idle art is for tabletop only.
    if (isDisplay) return { hits };

    ctx.fillStyle = P.title;
    ctx.font = `bold ${F.idleTitle}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 16;
    ctx.fillText(fullTitle, W / 2, H * 0.36);
    ctx.shadowBlur = 0;

    ctx.fillStyle = accentHex;
    ctx.font = `${F.idleSub}px "Segoe UI", monospace`;
    ctx.fillText('HOLOGRAPHIC WORKSTATION', W / 2, H * 0.46);

    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    roundRect(ctx, W * 0.12, H * 0.54, W * 0.76, 100, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = P.text;
    ctx.font = `bold ${F.idleCta}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('瞄准桌面终端 · 按 E / 点击 激活', W / 2, H * 0.54 + 58);

    ctx.fillStyle = P.soft;
    ctx.font = `${F.idleHint}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('选实验后，内容投射到前方悬浮大屏', W / 2, H * 0.78);
    return { hits };
  }

  // ── Active menu / experiment ──
  const station = hud?.station;
  const experiment = hud?.experiment;
  const running = !!(hud?.running && experiment);
  const contentTop = innerY + headerH + 12;
  const contentH = innerH - headerH - 16;

  // Large front display only hosts running experiment content (hidden when idle).
  if (isDisplay && !running) {
    return { hits };
  }

  // Tabletop selector always shows experiment cards (never dense experiment UI).
  if (isSelector || !running) {
    if (running && isSelector) {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.6;
      roundRect(ctx, innerX, contentTop, innerW, 54, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e0f2fe';
      ctx.font = `bold ${F.listHint}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `进行中：${experiment?.name || '实验'} · 内容见前方大屏`,
        innerX + 14,
        contentTop + 27,
      );
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
      ctx.font = `${F.listHint}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        isSelector
          ? '选择实验 · 内容将显示于前方悬浮大屏'
          : '选择实验 · 准星对准卡片后按 E / 点击',
        innerX + 4,
        contentTop,
      );
    }

    const experiments = station?.experiments || [];
    const cardH = HOLO_MENU_CARD_H;
    const gap = HOLO_MENU_CARD_GAP;
    let y = contentTop + (running && isSelector ? 84 : 48);
    experiments.forEach((ex, i) => {
      if (y + cardH > contentTop + contentH) return;
      const x = innerX;
      const w = innerW;
      const selected = running && experiment?.id === ex.id;
      ctx.fillStyle = selected ? 'rgba(14, 165, 233, 0.28)' : 'rgba(14, 165, 233, 0.12)';
      ctx.strokeStyle = selected ? '#67e8f9' : accentHex;
      ctx.lineWidth = selected ? 3.5 : 2.4;
      roundRect(ctx, x, y, w, cardH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accentHex;
      ctx.font = `bold ${F.cardNum}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 20, y + 32);

      ctx.fillStyle = '#f0f9ff';
      ctx.font = `bold ${F.cardName}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(ex.name, x + 72, y + 24);

      ctx.fillStyle = 'rgba(186, 230, 253, 0.9)';
      ctx.font = `${F.cardGoal}px "Microsoft YaHei", sans-serif`;
      const goals = wrapText(ctx, selected ? '当前实验 · 前方大屏操作控件' : ex.goal, w - 96);
      goals.slice(0, 2).forEach((ln, li) => {
        ctx.fillText(ln, x + 72, y + 74 + li * 34);
      });

      hits.push({
        id: `exp-${ex.id}`,
        x, y, w, h: cardH,
        action: 'start',
        expId: ex.id,
      });
      y += cardH + gap;
    });

    if (running && isSelector) {
      const btnH = 64;
      const btnY = Math.min(y + 10, contentTop + contentH - btnH);
      const btnW = (innerW - 16) / 2;
      [
        { label: '返回列表', action: 'back', x: innerX },
        { label: '关闭终端', action: 'close', x: innerX + btnW + 12 },
      ].forEach((b) => {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.strokeStyle = accentHex;
        ctx.lineWidth = 1.5;
        roundRect(ctx, b.x, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f0f9ff';
        ctx.font = `bold ${F.btn}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, b.x + btnW / 2, btnY + btnH / 2);
        hits.push({ id: b.action, x: b.x, y: btnY, w: btnW, h: btnH, action: b.action });
      });
    }
  } else {
    const stepIndex = hud.stepIndex || 0;
    const steps = experiment.steps || [];
    const dataText = stripHtml(opts.dataHtml || '');

    if (experiment.id === 'hall_effect') {
      drawHallExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (experiment.id === 'hall_carrier_demo') {
      drawHallDemoExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (experiment.id === 'gauss_theorem') {
      drawGaussExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (experiment.id === 'electric_field') {
      drawElectricFieldExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (experiment.id === 'faraday_induction') {
      drawFaradayExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (experiment.id === 'multi_slit_diffraction') {
      drawDiffractionExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }

    ctx.fillStyle = P.title;
    ctx.font = `bold ${F.expName}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(experiment.name, innerX + 4, contentTop);

    let y = contentTop + 48;
    const theoryH = 68;
    ctx.fillStyle = P.theoryBg;
    roundRect(ctx, innerX, y, innerW, theoryH, 8);
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.font = `${F.theory}px Consolas, "SF Mono", monospace`;
    const theoryLines = wrapText(ctx, experiment.theory, innerW - 24);
    theoryLines.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, innerX + 12, y + 12 + i * 28);
    });
    y += theoryH + 12;

    ctx.fillStyle = P.muted;
    ctx.font = `${F.section}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('实验步骤', innerX + 4, y);
    y += 32;
    const stepLineH = 38;
    const stepMaxH = Math.min(steps.length * stepLineH + 16, contentTop + contentH - y - 200);
    const stepBoxH = Math.max(110, stepMaxH);
    ctx.fillStyle = P.stepBox;
    roundRect(ctx, innerX, y, innerW, stepBoxH, 8);
    ctx.fill();

    let sy = y + 14;
    steps.forEach((s, i) => {
      if (sy > y + stepBoxH - 32) return;
      const done = i < stepIndex;
      const cur = i === stepIndex;
      ctx.fillStyle = done ? P.done : cur ? accentHex : P.muted;
      ctx.font = cur
        ? `bold ${F.stepActive}px "Microsoft YaHei", sans-serif`
        : `${F.step}px "Microsoft YaHei", sans-serif`;
      const mark = done ? '✓' : String(i + 1);
      ctx.fillText(`${mark}  ${s.text}`, innerX + 14, sy);
      sy += stepLineH;
    });
    y += stepBoxH + 12;

    const hint = hud.step?.hint || '按 E 交互';
    const hintH = 58;
    ctx.fillStyle = P.hintBg;
    roundRect(ctx, innerX, y, innerW, hintH, 8);
    ctx.fill();
    ctx.fillStyle = P.hintText;
    ctx.font = `${F.hint}px "Microsoft YaHei", sans-serif`;
    const hints = wrapText(ctx, hint, innerW - 24);
    hints.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, innerX + 12, y + 12 + i * 28);
    });
    y += hintH + 12;

    const dataLineH = 28;
    const dataH = Math.min(150, contentTop + contentH - y - 68);
    if (dataH > 52) {
      ctx.fillStyle = P.dataBg;
      roundRect(ctx, innerX, y, innerW, dataH, 8);
      ctx.fill();
      ctx.fillStyle = P.dataText;
      ctx.font = `${F.data}px Consolas, monospace`;
      const dlines = dataText.split('\n').filter(Boolean);
      dlines.slice(0, Math.floor((dataH - 16) / dataLineH)).forEach((ln, i) => {
        ctx.fillText(ln.slice(0, 48), innerX + 12, y + 14 + i * dataLineH);
      });
      y += dataH + 10;
    }

    const btnY = Math.min(y, contentTop + contentH - (isDisplay ? 66 : 60));
    const btnH = isDisplay ? 64 : 56;
    const gap = isDisplay ? 16 : 12;
    const btns = [
      { label: '返回列表', action: 'back', active: false },
      { label: '执行 (E)', action: 'action', active: true },
    ];

    const btnW = (innerW - gap * (btns.length - 1)) / btns.length;
    btns.forEach((b, i) => {
      const bx = innerX + i * (btnW + gap);
      drawPremiumHoloButton(ctx, hits, bx, btnY, btnW, btnH, b.label, b.action, {}, accentHex, b.active, theme);
    });
  }

  return { hits };
}

function hitTestPoint(px, py, hits, pad = 0) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (
      px >= h.x - pad
      && px <= h.x + h.w + pad
      && py >= h.y - pad
      && py <= h.y + h.h + pad
    ) {
      return h;
    }
  }
  return null;
}

/**
 * Map UV → canvas and resolve button. Tries several UV conventions so
 * front/back faces and Three.js UV orientation never “dead-click” chrome.
 */
/**
 * Attach the matched canvas pixel so continuous controls (e.g. Faraday B slider)
 * can map aim position → absolute value without a second UV conversion.
 */
function withPickPoint(hit, px, py) {
  if (!hit) return null;
  return { ...hit, px, py };
}

export function pickHoloScreen(u, v, W, H, hits, _facingSide = 1) {
  if (!hits?.length || u == null || v == null || !Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }

  const candidates = [
    [u * W, (1 - v) * H],
    [(1 - u) * W, (1 - v) * H],
    [u * W, v * H],
    [(1 - u) * W, v * H],
  ];

  for (const [px, py] of candidates) {
    // Generous pad: free-aim / AR UV picks are much noisier than mouse on 2D UI.
    const hit = hitTestPoint(px, py, hits, 22);
    if (hit) return withPickPoint(hit, px, py);
  }

  for (const [px, py] of candidates) {
    if (px < W * 0.62 || py > H * 0.18) continue;
    let best = null;
    let bestD = Infinity;
    for (const h of hits) {
      if (!h.chrome) continue;
      const cx = h.x + h.w / 2;
      const cy = h.y + h.h / 2;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best) return withPickPoint(best, px, py);
  }

  return null;
}

/** Map a faraday-b-slider hit (with optional px) to B ∈ [min, max]. */
export function faradayBFromSliderPick(pick) {
  if (!pick || pick.action !== 'faraday-b-slider') return null;
  const min = Number(pick.min ?? -3);
  const max = Number(pick.max ?? 3);
  if (!Number.isFinite(pick.px)) return null;
  const u = Math.max(0, Math.min(1, (Number(pick.px) - Number(pick.x || 0)) / Math.max(1, Number(pick.w || 1))));
  return min + u * (max - min);
}

export function uvFromRayAndMesh(raycaster, mesh) {
  if (!raycaster || !mesh) return null;
  const hits = raycaster.intersectObject(mesh, false);
  if (!hits.length) return null;
  const h = hits[0];
  if (h.uv) return { u: h.uv.x, v: h.uv.y, distance: h.distance, point: h.point };
  if (!h.point) return null;
  const local = mesh.worldToLocal(h.point.clone());
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return null;
  const u = (local.x - bb.min.x) / Math.max(1e-6, bb.max.x - bb.min.x);
  const v = (local.y - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
  return { u, v, distance: h.distance, point: h.point };
}
