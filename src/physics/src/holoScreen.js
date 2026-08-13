
/**
 * Draw interactive experiment UI onto hologram canvas textures
 * and resolve UV picks like a flat computer screen.
 */

import {
  diffractionEnvelopeZeros,
  diffractionHalfSpan,
  diffractionIntensity,
  diffractionPrincipalMaxima,
  formatOpticsRecordCell,
  geoOpticsRecordColumns,
  getModulesForExperiment,
  isGeometricOpticsExp,
  isReflectionExp,
  opticsRecordColumns,
  SHAPE_LABELS,
} from './experiments/optics.js';
import { MEDIUM_PRESETS } from './guangxue/catalog.js';
import {
  buildThermoRecordRow,
  computeThermoMetrics,
  formatThermoRecordCell,
  thermoCanRecord,
  thermoRecordBlockedReason,
  thermoRecordCaption,
  thermoRecordColumns,
} from './experiments/thermo.js';
import {
  drawMathFormula,
  formatPhysicsNumber,
} from './physicsFormula.js';

/**
 * Global UI scale for hologram surfaces.
 * Display is only mildly larger than full — prefer density over empty padding.
 */
export function holoUiScale(surface = 'full') {
  if (surface === 'display') return 2.15;
  if (surface === 'selector') return 1.15;
  return 1.12;
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
const HALL_K = 220; // calibrated representative value, mV·mA⁻¹·T⁻¹

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
  // Proportional font calculation: fit nicely within button height and width
  let fontSize = Math.max(14, Math.min(24, Math.round(h * 0.52)));
  const text = String(label || '');
  const textColor = active ? (isLight ? '#0f172a' : '#ffffff') : (isLight ? '#1e293b' : 'rgba(224, 242, 254, 0.92)');
  if (/[\\_^{}]|[A-Za-z]/.test(text)) {
    drawMathFormula(ctx, text, x + w / 2, y + h / 2, {
      fontSize,
      color: textColor,
      align: 'center',
      textBaseline: 'middle',
    });
  } else {
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
    while (fontSize > 11 && ctx.measureText(text).width > w - 12) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
    }
    ctx.fillText(text, x + w / 2, y + h / 2);
  }
  ctx.restore();

  if (w >= 120 && h >= 52 && !isLight && action && !/[\u4e00-\u9fa5]/.test(text)) {
    ctx.save();
    ctx.fillStyle = active ? `${accent}bb` : 'rgba(56, 189, 248, 0.38)';
    ctx.font = '9px "Microsoft YaHei", sans-serif';
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

/**
 * Shared numeric parameter slider for content screens.
 * Replaces − / + steppers with a continuous track + thumb.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} hits
 * @param {object} opts
 * @param {number} opts.x left of full control row
 * @param {number} opts.y top of row
 * @param {number} opts.w row width
 * @param {number} opts.h row height
 * @param {string} opts.label
 * @param {number} opts.value
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {string} opts.setAction experiment uiAction that accepts { key, value, axis? }
 * @param {string} [opts.key]
 * @param {string} [opts.axis]
 * @param {string} [opts.unit]
 * @param {number} [opts.digits=2]
 * @param {string} [opts.accentHex]
 * @param {boolean} [opts.compact] denser layout for twin-column editors
 * @param {string} [opts.id]
 */
function drawParamSlider(ctx, hits, opts) {
  const {
    x, y, w, h,
    label,
    value,
    min,
    max,
    setAction,
    key = null,
    axis = null,
    target = null,
    unit = '',
    digits = 2,
    accentHex = '#38bdf8',
    compact = false,
    /** Bigger label/value type for content screens that prioritize readability. */
    largeType = false,
    /** Hide min/max ticks under the track (cleaner when largeType). */
    hideRange = false,
    id = null,
  } = opts;
  const P = screenPalette(_uiTheme, accentHex, false);
  const v = Number(value || 0);
  const lo = Number(min);
  const hi = Number(max);
  const range = Math.max(1e-9, hi - lo);
  const norm = Math.max(0, Math.min(1, (v - lo) / range));
  const padX = largeType
    ? Math.round(h * 0.12)
    : compact ? Math.round(h * 0.18) : Math.round(h * 0.22);
  const labelH = largeType
    ? Math.round(h * 0.46)
    : compact ? Math.round(h * 0.38) : Math.round(h * 0.42);

  const labelPx = largeType
    ? Math.max(20, Math.round(h * 0.36))
    : Math.max(11, Math.round(h * 0.22));
  const valuePx = largeType
    ? Math.max(22, Math.round(h * 0.40))
    : Math.max(12, Math.round(h * 0.28));
  const rangePx = largeType
    ? Math.max(13, Math.round(h * 0.18))
    : Math.max(9, Math.round(h * 0.14));

  const labelStr = String(label || '');
  const labelY = y + Math.round(h * (largeType ? 0.06 : 0.08));
  if (/[\\_^{}]|[A-Za-z]/.test(labelStr)) {
    drawMathFormula(ctx, labelStr, x + padX, labelY, {
      fontSize: labelPx,
      color: P.muted,
      align: 'left',
      textBaseline: 'top',
    });
  } else {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${labelPx}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(labelStr, x + padX, labelY);
  }

  ctx.fillStyle = P.text;
  ctx.font = `bold ${valuePx}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'right';
  const valueText = `${v.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
  ctx.fillText(valueText, x + w - padX, y + Math.round(h * (largeType ? 0.04 : 0.06)));
  ctx.textAlign = 'left';

  const trackX = x + padX;
  const trackW = Math.max(8, w - padX * 2);
  const trackH = Math.max(largeType ? 10 : 8, Math.round(h * (largeType ? 0.16 : compact ? 0.18 : 0.2)));
  const trackY = y + labelH + Math.round((h - labelH - trackH) * (largeType ? 0.2 : 0.35));
  const thumbR = Math.max(largeType ? 9 : 7, Math.round(trackH * (largeType ? 1.05 : 0.95)));

  ctx.fillStyle = _uiTheme === 'light' ? 'rgba(148,163,184,.45)' : 'rgba(148,163,184,.34)';
  roundRect(ctx, trackX, trackY, trackW, trackH, trackH / 2);
  ctx.fill();
  ctx.fillStyle = accentHex;
  roundRect(ctx, trackX, trackY, trackW * norm, trackH, trackH / 2);
  ctx.fill();

  if (!hideRange) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${rangePx}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(lo.toFixed(Math.min(2, digits)), trackX, trackY + trackH + Math.round(h * 0.04));
    ctx.textAlign = 'right';
    ctx.fillText(hi.toFixed(Math.min(2, digits)), trackX + trackW, trackY + trackH + Math.round(h * 0.04));
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(trackX + trackW * norm, trackY + trackH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = Math.max(2, Math.round(h * 0.05));
  ctx.stroke();

  hits.push({
    id: id || `param-slider-${setAction}-${key || axis || 'v'}`,
    role: 'param-slider',
    action: 'param-slider',
    setAction,
    key,
    axis,
    target,
    x: trackX - Math.round(padX * 0.6),
    y: y + Math.round(h * (largeType ? 0.22 : 0.28)),
    w: trackW + Math.round(padX * 1.2),
    h: Math.max(trackH + thumbR * 2, Math.round(h * (largeType ? 0.7 : 0.62))),
    trackX,
    trackW,
    min: lo,
    max: hi,
    dragAxis: 'x',
  });
}

/** True for any continuous content-screen slider hit. */
export function isParamSliderAction(action) {
  return action === 'param-slider'
    || action === 'faraday-b-slider'
    || action === 'induced-e-slider';
}

/**
 * Map a slider hit (with optional px / value) → absolute numeric value.
 * Prefer trackX/trackW when present so padded hit boxes stay accurate.
 */
export function valueFromParamSliderPick(pick) {
  if (!pick || !isParamSliderAction(pick.action)) return null;
  const min = Number(pick.min);
  const max = Number(pick.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (Number.isFinite(pick.value)) {
    return Math.max(min, Math.min(max, Number(pick.value)));
  }
  if (!Number.isFinite(pick.px)) return null;
  const trackX = Number.isFinite(pick.trackX) ? Number(pick.trackX) : Number(pick.x || 0);
  const trackW = Math.max(1, Number.isFinite(pick.trackW) ? Number(pick.trackW) : Number(pick.w || 1));
  const u = Math.max(0, Math.min(1, (Number(pick.px) - trackX) / trackW));
  return min + u * (max - min);
}

/**
 * Faraday content screen: set target B/x + duration, play a smooth change,
 * watch live E / Lenz sense, then review motion vs induction results.
 */
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
  const gap = Math.round(10 * scale);
  const x = innerX;
  const w = innerW;
  const animating = !!d.pendingAnim;
  const channelX = d.animChannel === 'x';
  const liveEmf = Number(d.liveEmf || 0);

  // —— Compact metric strip ——
  const statY = contentTop;
  const statH = Math.round(66 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 1.6 : 1.2;
  roundRect(ctx, x, statY, w, statH, 10);
  ctx.fill();
  ctx.stroke();
  const stats = [
    ['\\Phi_B', `${fmt(d.flux)} Wb`],
    ['\\varepsilon_i', `${liveEmf >= 0 ? '+' : ''}${fmt(liveEmf, 2)} V`],
  ];
  stats.forEach(([label, value], i) => {
    const colW = w / stats.length;
    const cx = x + i * colW + colW / 2;
    const labelY = statY + Math.round(statH * 0.12);
    const valY = statY + Math.round(statH * 0.48);
    if (/[\\_^{}]/.test(label)) {
      drawMathFormula(ctx, label, cx, labelY, {
        fontSize: Math.round(16 * scale),
        color: P.muted,
        align: 'center',
        textBaseline: 'top',
      });
    } else {
      ctx.fillStyle = P.muted;
      ctx.font = `italic bold ${Math.round(16 * scale)}px "Times New Roman", "Cambria Math", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, cx, labelY);
    }
    if (i === 1 && (animating || Math.abs(liveEmf) > 1e-6)) {
      ctx.fillStyle = _uiTheme === 'light' ? '#0284c7' : '#38bdf8';
    } else {
      ctx.fillStyle = P.text;
    }
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(value, cx, valY);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let cy = statY + statH + gap;

  // —— Dual result cards fill remaining height ——
  const cardBottom = contentTop + contentH;
  const cardW = (w - gap) / 2;
  const cardH = Math.max(80, cardBottom - cy);
  const cards = [
    {
      title: '动生 · x 变化',
      data: motion,
      lines: motion
        ? [`x: ${fmt(motion.x0)} \\rightarrow ${fmt(motion.x1)}`, `\\Delta x = ${fmt(motion.dx)} \\quad \\Delta t = ${fmt(motion.dt, 3)} \\mathrm{s}`, `\\varepsilon_i = ${fmt(motion.emf, 4)} \\mathrm{V}`, motion.senseLabel]
        : ['设目标 x 后播放', '或手拖铜棒'],
    },
    {
      title: '感生 · B 变化',
      data: induction,
      lines: induction
        ? [`B: ${fmt(induction.B0, 2)} \\rightarrow ${fmt(induction.B1, 2)} \\mathrm{T}`, `\\Delta B = ${fmt(induction.dB, 3)} \\quad \\Delta t = ${fmt(induction.dt, 3)} \\mathrm{s}`, `\\varepsilon_i = ${fmt(induction.emf, 4)} \\mathrm{V}`, induction.senseLabel]
        : ['设目标 B 后播放', '或点「反向 B」'],
    },
  ];
  cards.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    const cardAccent = i === 0 ? '#f472b6' : '#38bdf8';
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = isDisplay ? 1.6 : 1.2;
    roundRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    drawMathFormula(ctx, card.title, cx + Math.round(12 * scale), cy + Math.round(12 * scale), {
      fontSize: Math.round(17 * scale),
      color: cardAccent,
      align: 'left',
      textBaseline: 'top',
    });
    const lineH = Math.round(26 * scale);
    card.lines.forEach((line, li) => {
      const lineX = cx + Math.round(12 * scale);
      const lineY = cy + Math.round(42 * scale) + li * lineH;
      const color = (li === 2 && card.data)
        ? (_uiTheme === 'light' ? '#0284c7' : '#38bdf8')
        : P.text;
      const fontSize = (li === 2 && card.data)
        ? Math.round(17 * scale)
        : Math.round(15 * scale);

      if (/[\\_^{}]|[A-Za-z]/.test(line)) {
        drawMathFormula(ctx, line, lineX, lineY, {
          fontSize,
          color,
          align: 'left',
          textBaseline: 'top',
        });
      } else {
        ctx.fillStyle = color;
        ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(line, lineX, lineY);
      }
    });
    ctx.textBaseline = 'alphabetic';
  });
}

/**
 * Compact induced-E content screen (thermo-style density):
 * header + metric strip → 2×2 sliders → chip toolbar → E–r chart → actions.
 */
function drawInducedElectricExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const scale = holoUiScale(cfg.surface);
  const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
  const gap = Math.round(10 * scale);
  const x = innerX;
  const w = innerW;
  const isAuto = d.auto === true;
  const senseText = d.sense === 'cw' ? '顺时针' : d.sense === 'ccw' ? '逆时针' : '无';
  const q0Pos = Number(d.probe?.q0 || 0) >= 0;

  // —— Compact metric strip ——
  const statY = contentTop;
  const statH = Math.round(66 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 1.6 : 1.2;
  roundRect(ctx, x, statY, w, statH, 10);
  ctx.fill();
  ctx.stroke();
  const probeQ0 = Number(d.probe?.q0 ?? 1);
  const stats = [
    ['q_0', `${probeQ0 >= 0 ? '+' : ''}${fmt(probeQ0, 1)} \\mu\\mathrm{C}`],
    ['R', `${fmt(d.R * 10, 1)} \\mathrm{cm}`],
    ['B', `${fmt(d.B, 2)} \\mathrm{T}`],
    ['\\frac{\\mathrm{d}B}{\\mathrm{d}t}', `${fmt(d.dBdt, 2)} \\mathrm{T/s}`],
  ];
  stats.forEach(([label, value], i) => {
    const colW = w / stats.length;
    const cx = x + i * colW + colW / 2;
    const labelY = statY + Math.round(statH * 0.12);
    const valY = statY + Math.round(statH * 0.48);
    drawMathFormula(ctx, label, cx, labelY, {
      fontSize: Math.round(16 * scale),
      color: P.muted,
      align: 'center',
      textBaseline: 'top',
    });
    drawMathFormula(ctx, value, cx, valY, {
      fontSize: Math.round(15 * scale),
      color: P.text,
      align: 'center',
      textBaseline: 'top',
    });
  });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // —— Params live on the tabletop desk panel; screen keeps chart ——
  let cy = statY + statH + gap;

  // —— E–r textbook chart fills remaining space ——
  const chartH = Math.max(100, contentTop + contentH - cy);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  roundRect(ctx, x, cy, w, chartH, 12);
  ctx.fill();
  ctx.stroke();

  const profile = Array.isArray(d.profile) ? d.profile : [];
  const currR = Math.max(0.2, Number(d.R || 2));
  const absD = Math.abs(Number(d.dBdt || 0));

  // Theoretical peak height E_max = 0.5 * R * |dBdt|
  const theoreticalPeak = 0.5 * currR * absD;

  // Probe charge position & value
  const pr = Number(d.probeR || 0);
  const pe = Number(d.magnitudeE || 0);

  // Dynamic Y-axis scale so the curve occupies ~70-75% of plot height
  const maxVal = Math.max(theoreticalPeak, pe, 0.1);
  const E_SCALE_MAX = Math.max(0.5, maxVal * 1.35);

  const plotX = x + Math.round(58 * scale);
  const plotY = cy + Math.round(18 * scale);
  const plotW = w - Math.round(84 * scale);
  const plotH = chartH - Math.round(64 * scale);

  const axisColor = _uiTheme === 'light' ? 'rgba(100,116,139,.75)' : 'rgba(148,163,184,.65)';
  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = 1.4;

  // Y-axis line + Arrow ▲
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH);
  ctx.lineTo(plotX, plotY - Math.round(8 * scale));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(plotX - Math.round(4.5 * scale), plotY - Math.round(6 * scale));
  ctx.lineTo(plotX, plotY - Math.round(15 * scale));
  ctx.lineTo(plotX + Math.round(4.5 * scale), plotY - Math.round(6 * scale));
  ctx.closePath();
  ctx.fill();

  // X-axis line + Arrow ►
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW + Math.round(10 * scale), plotY + plotH);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(plotX + plotW + Math.round(6 * scale), plotY + plotH - Math.round(4.5 * scale));
  ctx.lineTo(plotX + plotW + Math.round(15 * scale), plotY + plotH);
  ctx.lineTo(plotX + plotW + Math.round(6 * scale), plotY + plotH + Math.round(4.5 * scale));
  ctx.closePath();
  ctx.fill();

  // Axis labels (E_k at Y-top, r at X-right, 0 at origin)
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('0', plotX - Math.round(12 * scale), plotY + plotH + Math.round(12 * scale));

  drawMathFormula(
    ctx,
    'E_k',
    plotX - Math.round(24 * scale),
    plotY - Math.round(18 * scale),
    {
      fontSize: Math.round(13 * scale),
      color: P.text,
      align: 'left',
      textBaseline: 'top',
    }
  );

  drawMathFormula(
    ctx,
    'r',
    plotX + plotW + Math.round(18 * scale),
    plotY + plotH,
    {
      fontSize: Math.round(13 * scale),
      color: P.text,
      align: 'left',
      textBaseline: 'middle',
    }
  );

  const rMax = 4.8;
  const rLineX = plotX + (currR / rMax) * plotW;
  const peakPy = plotY + plotH - (theoreticalPeak / E_SCALE_MAX) * (plotH * 0.88);
  const prx = plotX + (pr / rMax) * plotW;
  const pry = plotY + plotH - (pe / E_SCALE_MAX) * (plotH * 0.88);

  // 1. Plot E-r Curve
  if (profile.length > 1) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.max(2, Math.round(2.6 * scale));
    ctx.beginPath();
    profile.forEach((pt, i) => {
      const px = plotX + (pt.r / rMax) * plotW;
      const py = plotY + plotH - (pt.E / E_SCALE_MAX) * (plotH * 0.88);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // 3. Formula annotations along curve (clean & borderless, collision-free)
  if (rLineX > plotX + Math.round(20 * scale) && absD > 0.01) {
    const midR = currR * 0.5;
    const midX = plotX + (midR / rMax) * plotW;
    const midE = 0.5 * midR * absD;
    const midY = plotY + plotH - (midE / E_SCALE_MAX) * (plotH * 0.88);

    // Collision check with probe dot
    const isProbeCloseToFormula = Math.hypot(prx - midX, pry - midY) < Math.round(36 * scale);
    const labelOffsetX = isProbeCloseToFormula ? Math.round(-24 * scale) : 0;
    const labelOffsetY = isProbeCloseToFormula ? Math.round(-18 * scale) : Math.round(-14 * scale);

    drawMathFormula(
      ctx,
      'E_k \\propto r',
      midX + labelOffsetX,
      midY + labelOffsetY,
      {
        fontSize: Math.round(12 * scale),
        color: '#ef4444',
        align: 'center',
        textBaseline: 'bottom',
      }
    );
  }

  if (rLineX < plotX + plotW - Math.round(30 * scale) && absD > 0.01) {
    const outR = Math.min(rMax * 0.88, currR * 1.8);
    const outX = plotX + (outR / rMax) * plotW;
    const outE = (0.5 * currR * currR * absD) / outR;
    const outY = plotY + plotH - (outE / E_SCALE_MAX) * (plotH * 0.88);
    drawMathFormula(
      ctx,
      'E_k \\propto \\frac{1}{r}',
      outX + Math.round(10 * scale),
      outY - Math.round(14 * scale),
      {
        fontSize: Math.round(12 * scale),
        color: '#ef4444',
        align: 'center',
        textBaseline: 'bottom',
      }
    );
  }

  // 4. PEAK POINT GUIDELINES & AXIS LABELS
  if (theoreticalPeak > 0.01) {
    ctx.save();
    const dashPattern = [Math.round(6 * scale), Math.round(4 * scale)];

    // Background dark contrast line for peak guidelines
    ctx.strokeStyle = _uiTheme === 'light' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = Math.round(3.6 * scale);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(plotX, peakPy);
    ctx.lineTo(rLineX, peakPy);
    ctx.moveTo(rLineX, plotY + plotH);
    ctx.lineTo(rLineX, peakPy);
    ctx.stroke();

    // Solid bright red dashed line for peak guidelines
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.round(2.2 * scale);
    ctx.beginPath();
    ctx.moveTo(plotX, peakPy);
    ctx.lineTo(rLineX, peakPy);
    ctx.moveTo(rLineX, plotY + plotH);
    ctx.lineTo(rLineX, peakPy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Y-axis tick & label for Peak (strictly on the left of Y-axis)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(plotX - Math.round(4 * scale), peakPy);
    ctx.lineTo(plotX, peakPy);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${fmt(theoreticalPeak, 2)} V/m`, plotX - Math.round(6 * scale), peakPy);

    // X-axis tick & label for R (strictly below X-axis)
    ctx.beginPath();
    ctx.moveTo(rLineX, plotY + plotH);
    ctx.lineTo(rLineX, plotY + plotH + Math.round(4 * scale));
    ctx.stroke();

    drawMathFormula(
      ctx,
      `R = ${fmt(currR * 10, 1)}\\mathrm{cm}`,
      rLineX,
      plotY + plotH + Math.round(6 * scale),
      {
        fontSize: Math.round(11 * scale),
        color: accentHex,
        align: 'center',
        textBaseline: 'top',
      }
    );

    // Peak Dot on curve (no floating text box!)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(rLineX, peakPy, Math.round(5 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. PROBE POINT GUIDELINES & AXIS LABELS
  if (pr > 0.01) {
    ctx.save();
    const dashPattern = [Math.round(6 * scale), Math.round(4 * scale)];

    // Background dark contrast line for probe guidelines
    ctx.strokeStyle = _uiTheme === 'light' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = Math.round(3.6 * scale);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(prx, pry);
    ctx.lineTo(prx, plotY + plotH);
    ctx.moveTo(prx, pry);
    ctx.lineTo(plotX, pry);
    ctx.stroke();

    // Solid bright amber dashed line for probe guidelines
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = Math.round(2.2 * scale);
    ctx.beginPath();
    ctx.moveTo(prx, pry);
    ctx.lineTo(prx, plotY + plotH);
    ctx.moveTo(prx, pry);
    ctx.lineTo(plotX, pry);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Y-axis Probe Tick & Label (strictly on the left of Y-axis)
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plotX - Math.round(4 * scale), pry);
    ctx.lineTo(plotX, pry);
    ctx.stroke();

    // Check collision with Peak Y label
    const isYTooClose = Math.abs(pry - peakPy) < Math.round(14 * scale);
    const yLabelOffsetY = isYTooClose ? (pry > peakPy ? Math.round(10 * scale) : Math.round(-10 * scale)) : 0;

    ctx.fillStyle = '#d97706';
    ctx.font = `bold ${Math.round(10.5 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${fmt(pe, 2)} V/m`, plotX - Math.round(6 * scale), pry + yLabelOffsetY);

    // X-axis Probe Tick & Label (strictly below X-axis)
    ctx.beginPath();
    ctx.moveTo(prx, plotY + plotH);
    ctx.lineTo(prx, plotY + plotH + Math.round(4 * scale));
    ctx.stroke();

    const isXTooClose = Math.abs(prx - rLineX) < Math.round(48 * scale);
    const xLabelOffsetY = isXTooClose ? Math.round(16 * scale) : 0;

    drawMathFormula(
      ctx,
      `r = ${fmt(pr * 10, 1)}\\mathrm{cm}`,
      prx,
      plotY + plotH + Math.round(6 * scale) + xLabelOffsetY,
      {
        fontSize: Math.round(11 * scale),
        color: '#d97706',
        align: 'center',
        textBaseline: 'top',
      }
    );

    // Probe Dot on curve (no floating text box!)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(prx, pry, Math.round(5 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // Title positioned at bottom-center with clean vertical clearance from X-axis ticks
  drawMathFormula(
    ctx,
    'E_k-r \\text{ 关系曲线}',
    x + w / 2,
    cy + chartH - Math.round(6 * scale),
    {
      fontSize: Math.round(13 * scale),
      color: P.title || P.text,
      align: 'center',
      textBaseline: 'bottom',
    }
  );
}

function drawGaussExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const charges = Array.isArray(d.charges) ? d.charges : [];
  const selected = charges.find((charge) => charge.id === d.selectedId) || null;
  const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);

  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));

  // 1. 4 个核心物理量指标卡片 (Metrics Grid)
  const statY = contentTop;
  const statH = Math.round(72 * scale);
  const statGap = Math.round(10 * scale);
  const statW = (innerW - statGap * 3) / 4;
  const qEnclosedVal = Number(d.qEnclosed || 0);

  const stats = [
    {
      label: '面内净电荷 Q内',
      value: `${qEnclosedVal > 0 ? '+' : ''}${fmt(qEnclosedVal)} μC`,
      color: qEnclosedVal > 0 ? '#ef4444' : (qEnclosedVal < 0 ? '#3b82f6' : P.title),
    },
    {
      label: '总电通量 \\Phi_E',
      value: formatPhysicsNumber(d.flux, { digits: 2, unit: 'N·m²/C' }),
      color: P.title,
    },
    {
      label: '高斯面半径 R',
      value: `${fmt(d.radius * 10, 1)} cm`,
      color: P.title,
    },
    {
      label: '面平均 E',
      value: formatPhysicsNumber(d.meanField, { digits: 2, unit: 'N/C' }),
      color: P.title,
    },
  ];

  stats.forEach((st, index) => {
    const x = innerX + index * (statW + statGap);
    ctx.fillStyle = P.card;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, statY, statW, statH, 9);
    ctx.fill();
    ctx.stroke();

    // 指标名称 Label
    ctx.fillStyle = P.muted;
    ctx.font = `${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(st.label, x + Math.round(10 * scale), statY + Math.round(7 * scale));

    // 指标数值 Value（防重叠/溢出的智能字体自适应）
    ctx.fillStyle = st.color;
    let valFontSize = Math.round(19 * scale);
    const maxValW = statW - Math.round(16 * scale);
    ctx.font = `bold ${valFontSize}px "Microsoft YaHei", sans-serif`;

    while (valFontSize > Math.round(11 * scale) && ctx.measureText(st.value).width > maxValW) {
      valFontSize -= 1;
      ctx.font = `bold ${valFontSize}px "Microsoft YaHei", sans-serif`;
    }
    ctx.fillText(st.value, x + Math.round(10 * scale), statY + Math.round(33 * scale));
  });

  // 3. 下半部分主操作与编辑控制双栏 (bodyY, bodyH)
  const bodyY = statY + statH + Math.round(10 * scale);
  const bodyH = _H - bodyY - Math.round(20 * scale);
  const gap = Math.round(14 * scale);
  const leftW = Math.round((innerW - gap) * 0.49);
  const rightX = innerX + leftW + gap;
  const rightW = innerW - leftW - gap;

  // 左右两栏高科技底板
  [
    [innerX, leftW],
    [rightX, rightW],
  ].forEach(([x, w]) => {
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, bodyY, w, bodyH, 11);
    ctx.fill();
    ctx.stroke();
  });

  const padIn = Math.round(14 * scale);

  // ====================================================
  // 左栏: 高斯面与可视层控制 + 电荷列表
  // ====================================================
  const innerLeftW = leftW - padIn * 2;

  // 标题
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('高斯面与可视层', innerX + padIn, bodyY + Math.round(12 * scale));

  // 半径与操作提示 Badge
  ctx.fillStyle = P.muted;
  ctx.font = `${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(
    `高斯面 R = ${fmt(d.radius * 10, 1)}cm`,
    innerX + padIn,
    bodyY + Math.round(36 * scale),
  );

  // 视效 Switch 按钮 (表面 / 场线)
  const btnY1 = bodyY + Math.round(60 * scale);
  const btnH = Math.round(40 * scale);
  const tWidth = Math.round((innerLeftW - Math.round(8 * scale)) / 2);
  const tx1 = innerX + padIn;
  const tx2 = tx1 + tWidth + Math.round(8 * scale);

  drawHallButton(ctx, hits, tx1, btnY1, tWidth, btnH, '表面', 'gauss-toggle', { key: 'surface' }, accentHex, d.showSurface !== false);
  drawHallButton(ctx, hits, tx2, btnY1, tWidth, btnH, '场线', 'gauss-toggle', { key: 'lines' }, accentHex, d.showLines !== false);

  // 电荷列表 Header
  const listTitleY = btnY1 + btnH + Math.round(14 * scale);
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`电荷列表（${charges.length}/6）`, innerX + padIn, listTitleY);

  // 电荷 Chips 区域
  const chipY0 = listTitleY + Math.round(24 * scale);
  const chipH = Math.round(36 * scale);
  const chipW = Math.round((innerLeftW - Math.round(12 * scale)) / 3);

  charges.forEach((charge, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const cx = innerX + padIn + col * (chipW + Math.round(6 * scale));
    const cy = chipY0 + row * (chipH + Math.round(6 * scale));
    const isSel = charge.id === d.selectedId;
    const qColor = charge.q >= 0 ? '#ef4444' : '#3b82f6';
    const labelStr = `Q_{${index + 1}} ${charge.q > 0 ? '+' : ''}${fmt(charge.q, 1)}μC`;

    drawHallButton(
      ctx, hits,
      cx, cy, chipW, chipH,
      labelStr,
      'gauss-select', { id: charge.id },
      qColor, isSel,
    );
  });

  // 底部控制按钮 (+正电荷 / +负电荷 / 重置)
  const bottomBtnH = Math.round(40 * scale);
  const bottomBtnW = Math.round((innerLeftW - Math.round(10 * scale)) / 2);
  const bottomY2 = bodyY + bodyH - padIn - bottomBtnH;
  const bottomY1 = bottomY2 - bottomBtnH - Math.round(8 * scale);

  drawHallButton(ctx, hits, innerX + padIn, bottomY1, bottomBtnW, bottomBtnH, '+ 正电荷', 'gauss-add', { sign: 1 }, '#ef4444');
  drawHallButton(ctx, hits, innerX + padIn + bottomBtnW + Math.round(10 * scale), bottomY1, bottomBtnW, bottomBtnH, '+ 负电荷', 'gauss-add', { sign: -1 }, '#3b82f6');
  drawHallButton(ctx, hits, innerX + padIn, bottomY2, innerLeftW, bottomBtnH, '重置实验', 'gauss-reset', {}, accentHex);


  // ====================================================
  // 右栏: 选中电荷属性编辑面板
  // ====================================================
  const innerRightW = rightW - padIn * 2;

  if (!selected) {
    // 1) 未选中电荷时的空状态 (Empty State)
    ctx.fillStyle = P.title;
    ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('电荷属性控制', rightX + padIn, bodyY + Math.round(12 * scale));

    const emptyBoxY = bodyY + Math.round(52 * scale);
    const emptyBoxH = bodyH - Math.round(70 * scale);
    ctx.fillStyle = P.card;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1;
    roundRect(ctx, rightX + padIn, emptyBoxY, innerRightW, emptyBoxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = P.muted;
    ctx.font = `${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('请选择或添加电荷进行配置', rightX + padIn + innerRightW / 2, emptyBoxY + emptyBoxH / 2 - Math.round(12 * scale));
    ctx.font = `${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('支持 3D 界面拖动与极性切换', rightX + padIn + innerRightW / 2, emptyBoxY + emptyBoxH / 2 + Math.round(14 * scale));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    return;
  }

  // 2) 选中电荷时的控制界面
  const selIndex = charges.indexOf(selected) + 1;
  const distFromCenter = Math.hypot(selected.x, selected.y, selected.z);
  const inside = distFromCenter < Number(d.radius) - 1e-4;

  // 标题
  drawMathFormula(
    ctx,
    `编辑 Q_{${selIndex}}`,
    rightX + padIn,
    bodyY + Math.round(12 * scale),
    { fontSize: Math.round(18 * scale), color: P.title, align: 'left', textBaseline: 'top' },
  );

  // 高斯面内 / 高斯面外 Badge
  const badgeText = inside ? '● 高斯面内' : '○ 高斯面外';
  const badgeColor = inside ? '#10b981' : '#f59e0b';
  ctx.fillStyle = badgeColor;
  ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(badgeText, rightX + rightW - padIn, bodyY + Math.round(14 * scale));

  // 极性切换 & 移到中心 按钮
  const editBtnY = bodyY + Math.round(44 * scale);
  const editBtnW = Math.round((innerRightW - Math.round(12 * scale)) / 3);
  drawHallButton(ctx, hits, rightX + padIn, editBtnY, editBtnW, btnH, '正 (+)', 'gauss-sign', { sign: 1 }, '#ef4444', selected.q >= 0);
  drawHallButton(ctx, hits, rightX + padIn + editBtnW + Math.round(6 * scale), editBtnY, editBtnW, btnH, '负 (−)', 'gauss-sign', { sign: -1 }, '#3b82f6', selected.q < 0);
  drawHallButton(ctx, hits, rightX + padIn + (editBtnW + Math.round(6 * scale)) * 2, editBtnY, editBtnW, btnH, '移至中心', 'gauss-center', {}, accentHex);

  // 参数属性 Card 2列3行 网格 (Property Grid) - 完美自适应且绝不重叠！
  const deleteBtnY = bodyY + bodyH - padIn - bottomBtnH;
  const gridY0 = editBtnY + btnH + Math.round(10 * scale);
  const gridAvailH = deleteBtnY - gridY0 - Math.round(10 * scale);

  const props = [
    { label: '电量 |Q|', val: `${Math.abs(selected.q).toFixed(1)} μC` },
    { label: '距中心 r', val: `${distFromCenter.toFixed(2)} m` },
    { label: '坐标 X', val: `${Number(selected.x).toFixed(2)}` },
    { label: '坐标 Y', val: `${Number(selected.y).toFixed(2)}` },
    { label: '坐标 Z', val: `${Number(selected.z).toFixed(2)}` },
    { label: '移动控制', val: '拖动 / 滚轮' },
  ];

  const propCardW = Math.round((innerRightW - Math.round(8 * scale)) / 2);
  const propCardH = Math.max(Math.round(28 * scale), Math.round((gridAvailH - Math.round(6 * scale) * 2) / 3));

  props.forEach((pr, i) => {
    const r = Math.floor(i / 2);
    const c = i % 2;
    const px = rightX + padIn + c * (propCardW + Math.round(8 * scale));
    const py = gridY0 + r * (propCardH + Math.round(6 * scale));

    ctx.fillStyle = P.card;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, propCardW, propCardH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = P.muted;
    ctx.font = `${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(pr.label, px + Math.round(8 * scale), py + Math.round(4 * scale));

    ctx.fillStyle = P.title;
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(pr.val, px + Math.round(8 * scale), py + propCardH - Math.round(16 * scale));
  });

  // 最底部删除按钮（完美避开 Property Grid 碰撞）
  drawHallButton(ctx, hits, rightX + padIn, deleteBtnY, innerRightW, bottomBtnH, '删除选中电荷', 'gauss-delete', {}, '#ef4444');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/**
 * Compact electric-field HUD: formula + source tools.
 * Probe charge (q₀ / r / E / F) is drawn as a live 3D label above the sphere —
 * not duplicated on this content screen.
 */
function drawElectricFieldExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const rawScale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const scale = isDisplay ? Math.min(rawScale, 1.30) : rawScale;
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const charges = Array.isArray(d.charges) ? d.charges : [];
  const selected = charges.find((charge) => charge.id === d.selectedId) || null;
  const probe = d.probe || { x: 0, y: 0, z: 0, q0: 1 };
  const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
  const sumQ = charges.reduce((sum, charge) => sum + Number(charge.q || 0), 0);
  const pad = Math.round(14 * scale);
  const gap = Math.round(10 * scale);
  const btnH = Math.round(36 * scale);
  const chipH = Math.round(36 * scale);
  const bottom = contentTop + contentH;

  // ── Row 0: 3 或 4 等距分布常数与总结栏 ──
  const headH = Math.round(52 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 2.0 : 1.2;
  roundRect(ctx, innerX, contentTop, innerW, headH, 10);
  ctx.fill();
  ctx.stroke();

  const headItems = [
    `k = 9.0\\times 10^{9} \\text{ N}\\cdot\\text{m}^{2}/\\text{C}^{2}`,
    `\\varepsilon_{0} = 8.85\\times 10^{-12} \\text{ F/m}`,
    `\\Sigma q_{i} = ${sumQ >= 0 ? '+' : ''}${fmt(sumQ, 1)} \\mu\\text{C}`,
  ];
  if (Boolean(d.showGauss)) {
    const qEnc = Number(d.qEnclosed || 0);
    headItems.push(
      `Q_{\\text{内}} = ${qEnc > 0 ? '+' : ''}${fmt(qEnc, 1)} \\mu\\text{C}`,
    );
  }

  const secW = (innerW - pad * 2) / headItems.length;
  const headFontSize = Math.round(16 * scale);

  headItems.forEach((text, i) => {
    const cx = innerX + pad + (i + 0.5) * secW;
    drawMathFormula(
      ctx,
      text,
      cx,
      contentTop + headH / 2,
      { fontSize: headFontSize, color: P.title, align: 'center', textBaseline: 'middle', fontWeight: 'bold' },
    );
  });

  // ── Box 1: Action Buttons + Toggles + Charge Matrix (Outer container) ──
  let y = contentTop + headH + gap;
  const chipGap = Math.round(6 * scale);
  const maxChips = 12;

  // Row A: +正电荷 / +负电荷 / 重置 (Top line per draft swap)
  const actionItems = [
    { label: '+ 正电荷', action: 'electric-add', meta: { sign: 1 }, color: '#ef4444' },
    { label: '+ 负电荷', action: 'electric-add', meta: { sign: -1 }, color: '#3b82f6' },
    { label: '重置', action: 'electric-reset', meta: {}, color: accentHex },
  ];

  // Row B: 等势面 / 高斯面 / 试探电荷 (Merged probe toggle + sign per draft)
  const probeLabel = probe.q0 >= 0 ? '试探电荷 q₀(+)' : '试探电荷 q₀(−)';
  const equipotMode = d.showEquipot;
  const equipotLabel = equipotMode === 'concentric' ? '等势面(立体)' : (equipotMode ? '等势面(平面)' : '等势面');
  const toggleItems = [
    { label: equipotLabel, action: 'electric-toggle', meta: { key: 'equipot' }, color: accentHex, active: Boolean(d.showEquipot) },
    { label: '高斯面', action: 'electric-toggle', meta: { key: 'gauss' }, color: accentHex, active: Boolean(d.showGauss) },
    { label: probeLabel, action: 'electric-probe-sign', meta: { sign: probe.q0 >= 0 ? -1 : 1 }, color: '#f59e0b', active: d.showProbe !== false },
  ];

  // Row C & D: Charges list (up to 12)
  const chipItems = charges.slice(0, maxChips).map((charge, i) => ({
    label: `Q_{${i + 1}} ${charge.q >= 0 ? '+' : ''}${fmt(charge.q, 1)}μC`,
    action: 'electric-select',
    meta: { id: charge.id },
    color: charge.q >= 0 ? '#ef4444' : '#3b82f6',
    active: charge.id === d.selectedId,
  }));

  const itemsPerRow = 3;
  const topBtnW = (innerW - (itemsPerRow - 1) * gap) / itemsPerRow;

  // Box 1 Outer Container Height calculation
  const matrixItemsPerRow = Math.max(4, Math.min(6, chipItems.length || 1));
  const matrixRows = Math.ceil(chipItems.length / matrixItemsPerRow) || 1;
  const itemH = Math.round(38 * scale);
  const box1InnerPad = Math.round(10 * scale);
  const box1Height = box1InnerPad * 2 + btnH * 2 + gap * 2 + matrixRows * (itemH + chipGap);

  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 2.0 : 1.2;
  roundRect(ctx, innerX, y, innerW, box1Height, 14);
  ctx.fill();
  ctx.stroke();

  let innerY = y + box1InnerPad;

  // Draw Row A (Actions)
  actionItems.forEach((item, i) => {
    drawHallButton(
      ctx, hits,
      innerX + box1InnerPad + i * (topBtnW + gap - (box1InnerPad * 2 / itemsPerRow)),
      innerY,
      topBtnW - box1InnerPad, btnH,
      item.label, item.action, item.meta, item.color, false,
    );
  });
  innerY += btnH + gap;

  // Draw Row B (Toggles with merged Probe)
  toggleItems.forEach((item, i) => {
    drawHallButton(
      ctx, hits,
      innerX + box1InnerPad + i * (topBtnW + gap - (box1InnerPad * 2 / itemsPerRow)),
      innerY,
      topBtnW - box1InnerPad, btnH,
      item.label, item.action, item.meta, item.color, !!item.active,
    );
  });
  innerY += btnH + gap;

  // Draw Charge Chips Matrix
  const chipW = (innerW - box1InnerPad * 2 - (matrixItemsPerRow - 1) * chipGap) / matrixItemsPerRow;
  chipItems.forEach((item, i) => {
    const col = i % matrixItemsPerRow;
    const row = Math.floor(i / matrixItemsPerRow);
    drawHallButton(
      ctx, hits,
      innerX + box1InnerPad + col * (chipW + chipGap),
      innerY + row * (itemH + chipGap),
      chipW, itemH,
      item.label, item.action, item.meta, item.color, !!item.active,
    );
  });

  y += box1Height + gap;

  // ── Row 3: Axis Locks Only (3 equal-width controls per draft) ──
  const axisLock = d.axisLock || {};
  const lockControls = [
    { label: axisLock.x ? 'X · 锁' : '锁 X', action: 'electric-axis-lock', meta: { axis: 'x' }, color: axisLock.x ? '#f59e0b' : accentHex, active: axisLock.x === true },
    { label: axisLock.y ? 'Y · 锁' : '锁 Y', action: 'electric-axis-lock', meta: { axis: 'y' }, color: axisLock.y ? '#f59e0b' : accentHex, active: axisLock.y === true },
    { label: axisLock.z ? 'Z · 锁' : '锁 Z', action: 'electric-axis-lock', meta: { axis: 'z' }, color: axisLock.z ? '#f59e0b' : accentHex, active: axisLock.z === true },
  ];
  const lockGap = Math.round(8 * scale);
  const lockBtnW = (innerW - lockGap * (lockControls.length - 1)) / lockControls.length;
  const lockH = Math.round(38 * scale);
  lockControls.forEach((item, i) => {
    drawHallButton(
      ctx, hits,
      innerX + i * (lockBtnW + lockGap),
      y,
      lockBtnW, lockH,
      item.label,
      item.action, item.meta,
      item.color,
      !!item.active,
    );
  });
  y += lockH + gap;

  // ── Box 2: Source-charge editor panel (Bottom container) ──
  const editorH = Math.max(Math.round(124 * scale), bottom - y - pad);
  const leftX = innerX;
  const colW = innerW;

  function drawEditorPanel(x, w, title, subtitle) {
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    ctx.lineWidth = isDisplay ? 2.0 : 1.2;
    roundRect(ctx, x, y, w, editorH, 14);
    ctx.fill();
    ctx.stroke();
    if (/[\\_^{}]|[A-Za-z]/.test(title)) {
      drawMathFormula(ctx, title, x + pad, y + Math.round(12 * scale), { fontSize: Math.round(18 * scale), color: P.title, align: 'left', textBaseline: 'top' });
    } else {
      ctx.fillStyle = P.title;
      ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, x + pad, y + Math.round(12 * scale));
    }
    if (subtitle) {
      if (/[\\_^{}]|[A-Za-z]/.test(subtitle)) {
        drawMathFormula(ctx, subtitle, x + pad, y + Math.round(44 * scale), { fontSize: Math.round(14 * scale), color: P.muted, align: 'left', textBaseline: 'top' });
      } else {
        ctx.fillStyle = P.muted;
        ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(subtitle, x + pad, y + Math.round(44 * scale));
      }
    }
  }

  if (selected) {
    const idx = charges.findIndex((c) => c.id === selected.id) + 1;
    drawEditorPanel(
      leftX, colW,
      `源电荷 Q_{${idx}}`,
      `|Q| = ${fmt(Math.abs(selected.q), 1)}\\mu\\text{C} \\quad x = ${fmt(selected.x)}\\text{m} \\quad y = ${fmt(selected.y)}\\text{m} \\quad z = ${fmt(selected.z)}\\text{m}`,
    );
    const toolsY = y + Math.round(74 * scale);
    const btnW = (colW - 2 * pad - 2 * gap) / 3;
    const toolBtnH = Math.round(36 * scale);
    drawHallButton(ctx, hits, leftX + pad, toolsY, btnW, toolBtnH, '正(+)', 'electric-sign', { sign: 1 }, '#ef4444', selected.q >= 0);
    drawHallButton(ctx, hits, leftX + pad + btnW + gap, toolsY, btnW, toolBtnH, '负(−)', 'electric-sign', { sign: -1 }, '#3b82f6', selected.q < 0);
    drawHallButton(ctx, hits, leftX + pad + (btnW + gap) * 2, toolsY, btnW, toolBtnH, '删除选中', 'electric-delete', {}, '#ef4444');
  } else {
    drawEditorPanel(leftX, colW, '源电荷 Q', '点击上方列表或 3D 电荷以选中 · 试探电荷读数在球体上方');
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('未选中源电荷（试探电荷信息见 3D 头顶标签）', leftX + colW / 2, y + editorH / 2 + Math.round(18 * scale));
  }
}

/**
 * Hall-effect B–X bench (霍尔效应测磁): dual panel with reserved footer.
 * Display scale is capped so fixed chrome + dense rows never stack/collide
 * (same lesson as geometric optics / hall carrier demo).
 */
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
  const gap = Math.round(10 * scale);
  const pad = Math.round(14 * scale);

  const fillSoftText = (color, draw) => {
    ctx.save();
    ctx.fillStyle = color;
    if (isLight) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 4;
    }
    draw();
    ctx.restore();
  };

  // Step indicator (no experiment title)
  const totalSteps = experiment.steps?.length || 6;
  const stepText = `步骤 ${Math.min(stepIndex + 1, totalSteps)}/${totalSteps} · ${experiment.steps?.[stepIndex]?.text || '自由测量'}`;
  ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.16)' : 'rgba(56, 189, 248, 0.14)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 1.2;
  ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
  const badgeW = Math.min(innerW - Math.round(20 * scale), ctx.measureText(stepText).width + Math.round(40 * scale));
  const badgeH = 0;
  // roundRect(ctx, innerX, contentTop, badgeW, badgeH, badgeH / 2);
  // ctx.fill();
  // ctx.stroke();
  fillSoftText(isLight ? '#0369a1' : '#7dd3fc', () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    // ctx.fillText(stepText, innerX + Math.round(16 * scale), contentTop + badgeH / 2);
  });

  if (stepIndex === 0 && !allIdentified) {
    // Identify step: list the four apparatus (name + status). Compact vertical layout (no bottom overflow).
    const panelY = contentTop + Math.round(4 * scale);
    const availH = contentH - Math.round(8 * scale);
    
    // Exactly four recognition targets (order 01→04).
    const items = [
      { role: 'hall_helmholtz', n: '01', name: '亥姆霍兹线圈' },
      { role: 'hall_solenoid', n: '02', name: '长螺线管' },
      { role: 'hall_probe', n: '03', name: '霍尔探头与标尺' },
      { role: 'hall_console', n: '04', name: 'HCC-2 测磁仪' },
    ];
    const nextRole = items.find((item) => !identified[item.role])?.role || null;
    const nextItem = items.find((item) => item.role === nextRole) || null;
    const feedback = d.identifyFeedback || null;

    const headH = Math.round(36 * scale);
    const cardGap = Math.round(10 * scale);
    const cardTop = panelY + headH + Math.round(8 * scale);
    const cardW = (innerW - pad * 2 - cardGap) / 2;
    const cardH = Math.round(52 * scale);
    
    const gridH = cardH * 2 + cardGap;
    const btnH = Math.round(38 * scale);
    const btnY = cardTop + gridH + Math.round(10 * scale);
    const calculatedPanelH = (btnY + btnH + Math.round(10 * scale)) - panelY;
    const panelH = Math.min(availH, calculatedPanelH);

    // Draw main panel background
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(10, 22, 44, 0.75)';
    ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.6;
    roundRect(ctx, innerX, panelY, innerW, panelH, 14);
    ctx.fill();
    ctx.stroke();

    // Panel Header Title
    fillSoftText(isLight ? '#0284c7' : accentHex, () => {
      ctx.font = `bold ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('实验器材识别', innerX + pad, panelY + Math.round(14 * scale));
    });

    // 2×2 Cards Grid
    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = innerX + pad + col * (cardW + cardGap);
      const y = cardTop + row * (cardH + cardGap);
      const done = !!identified[item.role];
      const current = !done && item.role === nextRole;

      ctx.save();
      if (current && !isLight) {
        ctx.shadowColor = accentHex;
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = done
        ? (isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(34, 197, 94, 0.14)')
        : current
          ? (isLight ? 'rgba(240, 249, 255, 0.98)' : 'rgba(56, 189, 248, 0.20)')
          : (isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 30, 56, 0.45)');
      ctx.strokeStyle = done
        ? (isLight ? '#16a34a' : '#4ade80')
        : current
          ? (isLight ? '#0284c7' : accentHex)
          : (isLight ? 'rgba(14, 165, 233, 0.35)' : 'rgba(148, 163, 184, 0.24)');
      ctx.lineWidth = current ? 2.4 : 1.2;
      roundRect(ctx, x, y, cardW, cardH, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (current) {
        ctx.fillStyle = isLight ? '#0284c7' : accentHex;
        roundRect(ctx, x + Math.round(14 * scale), y + 2, cardW - Math.round(28 * scale), 4, 2);
        ctx.fill();
      }

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const cy = y + cardH / 2;

      // Status Tag Pill layout calculations
      const statusTag = done ? '已识别' : current ? '当前' : '待识别';
      const pillW = Math.round(done ? 64 : 56) * scale;
      const pillH = Math.round(26 * scale);
      const pillX = x + cardW - pillW - Math.round(10 * scale);
      const pillY = y + (cardH - pillH) / 2;

      // Number tag [01] / ✓
      ctx.fillStyle = done
        ? (isLight ? '#15803d' : '#4ade80')
        : current
          ? (isLight ? '#0284c7' : accentHex)
          : (isLight ? '#64748b' : '#94a3b8');
      if (isLight) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
        ctx.shadowBlur = 4;
      }
      const numPx = Math.max(14, Math.min(20, Math.round(cardH * 0.28)));
      ctx.font = `bold ${numPx}px "Microsoft YaHei", sans-serif`;
      const numLabel = done ? '✓' : `[${item.n}]`;
      const numW = ctx.measureText(numLabel).width;
      const numX = x + Math.round(12 * scale);
      ctx.fillText(numLabel, numX, cy);

      // Device Name text with dynamic width protection (prevents overlap with status pill)
      const nameX = numX + numW + Math.round(8 * scale);
      const maxNameW = pillX - nameX - Math.round(6 * scale);
      ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      let namePx = Math.max(12, Math.min(18, Math.round(cardH * 0.28)));
      ctx.font = `bold ${namePx}px "Microsoft YaHei", sans-serif`;
      const actualNameW = ctx.measureText(item.name).width;
      if (actualNameW > maxNameW && maxNameW > 10) {
        namePx = Math.max(10, Math.floor(namePx * (maxNameW / actualNameW)));
        ctx.font = `bold ${namePx}px "Microsoft YaHei", sans-serif`;
      }
      ctx.fillText(item.name, nameX, cy, Math.max(10, maxNameW));
      ctx.restore();

      // Right status pill badge
      ctx.fillStyle = done
        ? (isLight ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.22)')
        : current
          ? (isLight ? 'rgba(14,165,233,0.22)' : 'rgba(56,189,248,0.28)')
          : (isLight ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.14)');
      roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = done
        ? (isLight ? '#15803d' : '#86efac')
        : current
          ? (isLight ? '#0369a1' : '#7dd3fc')
          : (isLight ? '#64748b' : '#94a3b8');
      ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusTag, pillX + pillW / 2, pillY + pillH / 2);
    });

    drawHallButton(
      ctx, hits,
      innerX + innerW * 0.2,
      btnY,
      innerW * 0.6,
      btnH,
      nextItem ? `确认瞄准：${nextItem.n} ${nextItem.name}` : '✓ 全部器材识别完成',
      'hall-identify', {}, accentHex, true,
    );
    return;
  }

  // ── Measurement UI: bottom-up bands so footer never collides with panels ──
  const contentBottom = contentTop + contentH;
  const btnH = Math.round(36 * scale);
  const btnY = contentBottom - btnH;
  const targetH = Math.round(34 * scale);
  const targetY = contentTop + badgeH + (badgeH ? gap : 0);
  const bodyY = targetY + targetH + gap;
  const bodyH = Math.max(Math.round(160 * scale), btnY - gap - bodyY);
  const colGap = Math.round(12 * scale);
  const leftW = Math.round(innerW * 0.42);
  const rightX = innerX + leftW + colGap;
  const rightW = innerW - leftW - colGap;

  // Target mode chips (Helmholtz vs Solenoid selector)
  const targetW = (innerW - colGap) / 2;
  drawHallButton(
    ctx, hits,
    innerX, targetY, targetW, targetH,
    '亥姆霍兹线圈', 'hall-target', { target: 'helmholtz' }, accentHex, target === 'helmholtz',
  );
  drawHallButton(
    ctx, hits,
    innerX + targetW + colGap, targetY, targetW, targetH,
    '长螺线管', 'hall-target', { target: 'solenoid' }, accentHex, target === 'solenoid',
  );

  // ── Left: live parameter readout card ──
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(2, 12, 27, 0.72)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.28)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, innerX, bodyY, leftW, bodyH, 12);
  ctx.fill();
  ctx.stroke();

  const leftHeadH = Math.round(38 * scale);
  const leftFootH = 0;
  const paramAreaTop = bodyY + leftHeadH;
  const paramAreaH = Math.max(0, bodyH - leftHeadH);

  fillSoftText(isLight ? '#0284c7' : accentHex, () => {
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('实验参数', innerX + pad, bodyY + leftHeadH / 2);
  });

  const params = [
    { key: 'Im', label: '励磁电流 Im', value: Number(d.Im || 0), unit: 'A', digits: 2 },
    { key: 'Is', label: '霍尔电流 Is', value: Number(d.Is || 0), unit: 'mA', digits: 1 },
    { key: 'probePos', label: '探头位置 X', value: Number(d.probePos || 0), unit: 'cm', digits: 1 },
    target === 'helmholtz'
      ? { key: 'rightCoilPos', label: '右线圈位置', value: Number(d.rightCoilPos || 0), unit: 'cm', digits: 1 }
      : { key: 'turns', label: '螺线管匝数 N', value: Number(d.turns || 0), unit: '匝', digits: 0 },
  ];

  // Divide paramAreaH strictly by params.length to guarantee no footer collisions
  const paramRowH = paramAreaH / Math.max(1, params.length);
  const labelPx = Math.max(12, Math.min(15, Math.round(paramRowH * 0.38)));
  const valuePx = Math.max(14, Math.min(18, Math.round(paramRowH * 0.46)));

  params.forEach((p, i) => {
    const y = paramAreaTop + i * paramRowH;
    const cy = y + paramRowH / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.05)' : 'rgba(56, 189, 248, 0.04)';
      roundRect(ctx, innerX + Math.round(6 * scale), y + 2, leftW - Math.round(12 * scale), Math.max(0, paramRowH - 4), 6);
      ctx.fill();
    } else if (i > 0) {
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerX + pad, y);
      ctx.lineTo(innerX + leftW - pad, y);
      ctx.stroke();
    }

    ctx.textBaseline = 'middle';
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${labelPx}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(p.label, innerX + pad, cy);

    ctx.fillStyle = isLight ? '#0369a1' : '#7dd3fc';
    ctx.font = `bold ${valuePx}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(
      `${Number(p.value).toFixed(p.digits)}${p.unit ? ` ${p.unit}` : ''}`,
      innerX + leftW - pad,
      cy,
    );
  });

  // ── Right: VH readout strip + data table / curve ──
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(2, 12, 27, 0.72)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, rightX, bodyY, rightW, bodyH, 12);
  ctx.fill();
  ctx.stroke();

  const rightHeadH = Math.round(38 * scale);
  const rightFootH = Math.round(30 * scale);
  const titleText = d.showCurve ? 'B–X 磁场分布' : '实验数据记录';
  const vhText = `${Number(d.vh || 0).toFixed(2)} mV`;

  // Calculate Title text width and position Title left
  ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
  const titleW = ctx.measureText(titleText).width;
  fillSoftText(isLight ? '#0284c7' : accentHex, () => {
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, rightX + pad, bodyY + rightHeadH / 2);
  });

  // VH digital readout pill: positioned with guaranteed clearance from titleText
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  const vhPadX = Math.round(8 * scale);
  const vhPillH = Math.round(24 * scale);
  const vhContentW = ctx.measureText(vhText).width + vhPadX * 2;
  const vhPillW = Math.min(rightW * 0.38, vhContentW);
  // Ensure vhPillX never overlaps titleText
  const minVhPillX = rightX + pad + titleW + Math.round(6 * scale);
  const preferredVhPillX = rightX + rightW - pad - vhPillW;
  const vhPillX = Math.max(minVhPillX, preferredVhPillX);
  const vhPillY = bodyY + (rightHeadH - vhPillH) / 2;

  ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.14)' : 'rgba(56, 189, 248, 0.18)';
  ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, vhPillX, vhPillY, vhPillW, vhPillH, vhPillH / 2);
  ctx.fill();
  ctx.stroke();

  fillSoftText(isLight ? '#0369a1' : '#7dd3fc', () => {
    ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(vhText, vhPillX + vhPillW / 2, vhPillY + vhPillH / 2);
  });

  const chartX = rightX + pad;
  const chartY = bodyY + rightHeadH;
  const chartW = rightW - pad * 2;
  const chartH = Math.max(Math.round(96 * scale), bodyH - rightHeadH - rightFootH);
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(15, 23, 42, 0.78)';
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

    const plotL = chartX + Math.round(44 * scale);
    const plotR = chartX + chartW - Math.round(10 * scale);
    const plotT = chartY + Math.round(24 * scale);
    const plotB = chartY + chartH - Math.round(24 * scale);
    const px = (x) => plotL + ((x - xMin) / (xMax - xMin)) * (plotR - plotL);
    const py = (b) => plotB - ((b - yMin) / Math.max(1e-9, yMax - yMin)) * (plotB - plotT);

    ctx.lineWidth = 1;
    ctx.font = `${Math.round(10 * scale)}px "Microsoft YaHei", sans-serif`;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const gx = plotL + (plotR - plotL) * t;
      const gy = plotB - (plotB - plotT) * t;
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath(); ctx.moveTo(gx, plotT); ctx.lineTo(gx, plotB); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotR, gy); ctx.stroke();
      fillSoftText(isLight ? '#0f172a' : 'rgba(203, 213, 225, 0.78)', () => {
        ctx.font = `${Math.round(10 * scale)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText((xMin + (xMax - xMin) * t).toFixed(1), gx, plotB + Math.round(3 * scale));
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText((yMin + (yMax - yMin) * t).toFixed(2), plotL - Math.round(4 * scale), gy);
      });
    }
    ctx.strokeStyle = isLight ? '#64748b' : 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(plotL, plotT); ctx.lineTo(plotL, plotB); ctx.lineTo(plotR, plotB); ctx.stroke();

    fillSoftText(isLight ? '#0f172a' : '#cbd5e1', () => {
      ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('B / mT', chartX + Math.round(4 * scale), chartY + Math.round(4 * scale));
      ctx.textAlign = 'right';
      ctx.fillText('X / cm', plotR, plotB + Math.round(14 * scale));
    });

    measured.forEach((p) => {
      if (p.x < xMin || p.x > xMax) return;
      const cx = px(p.x);
      const cy = py(p.b);
      const r = Math.round(3.5 * scale);
      ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
      ctx.lineWidth = Math.max(1.2, Math.round(1.5 * scale));
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
    });

    fillSoftText(isLight ? '#0284c7' : '#38bdf8', () => {
      ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`+ 实测 ${shown.length} 组`, plotR, chartY + Math.round(4 * scale));
    });
  } else {
    // Non-overlapping, compact column headers with clear gaps
    const cols = [
      { label: '#', x: 0.04, align: 'left' },
      { label: 'X (cm)', x: 0.35, align: 'right' },
      { label: 'VH (mV)', x: 0.68, align: 'right' },
      { label: 'B (mT)', x: 0.96, align: 'right' },
    ];
    const headRowH = Math.round(24 * scale);
    ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.14)' : 'rgba(56, 189, 248, 0.16)';
    roundRect(ctx, chartX, chartY, chartW, headRowH, 4);
    ctx.fill();
    fillSoftText(isLight ? '#0284c7' : '#7dd3fc', () => {
      ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'middle';
      cols.forEach((col) => {
        ctx.textAlign = col.align || 'left';
        ctx.fillText(col.label, chartX + chartW * col.x, chartY + headRowH / 2);
      });
    });

    const dataRowH = Math.max(Math.round(22 * scale), Math.round(24 * scale));
    const maxRows = Math.max(1, Math.floor((chartH - headRowH - Math.round(4 * scale)) / dataRowH));
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
      maxRows,
      maxStart,
      rowH: dataRowH,
      scrollable: maxStart > 0,
    });

    visibleRows.forEach((r, i) => {
      const y = chartY + headRowH + i * dataRowH;
      if (i % 2 === 0) {
        ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(chartX, y, chartW, dataRowH);
      }
      fillSoftText(isLight ? '#0f172a' : '#dbeafe', () => {
        ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
        ctx.textBaseline = 'middle';
        const values = [
          String(start + i + 1),
          Number(r.pos || 0).toFixed(1),
          Number(r.vh || 0).toFixed(2),
          hallRecordedB(r).toFixed(2),
        ];
        cols.forEach((col, ci) => {
          ctx.textAlign = col.align || 'left';
          ctx.fillText(values[ci], chartX + chartW * col.x, y + dataRowH / 2);
        });
      });
    });

    if (!records.length) {
      ctx.fillStyle = isLight ? '#475569' : 'rgba(148, 163, 184, 0.75)';
      ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const emptyStr = wrapText(ctx, '在桌面控制面板点击「记录当前读数」', chartW - Math.round(16 * scale))[0] || '在控制面板点击「记录读数」';
      ctx.fillText(emptyStr, chartX + chartW / 2, chartY + headRowH + (chartH - headRowH) / 2);
    }

    if (records.length > maxRows) {
      const trackW = Math.round(5 * scale);
      const trackX = chartX + chartW - trackW - Math.round(4 * scale);
      const trackY = chartY + headRowH + Math.round(2 * scale);
      const trackH = chartH - headRowH - Math.round(6 * scale);
      ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.1)';
      roundRect(ctx, trackX, trackY, trackW, trackH, Math.round(3 * scale));
      ctx.fill();

      const thumbH = Math.max(Math.round(24 * scale), trackH * (maxRows / records.length));
      const thumbY = trackY + (start / Math.max(1, maxStart)) * (trackH - thumbH);
      ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.65)' : 'rgba(56, 189, 248, 0.75)';
      roundRect(ctx, trackX, thumbY, trackW, thumbH, Math.round(3 * scale));
      ctx.fill();
    }
  }

  // Right footer: record count + K + wiring status with tight padding
  const wiringText = d.wiring?.energized
    ? `${d.wiring.label || '励磁'}${d.wiring.reversed ? '·反接' : '·正接'}`
    : d.wiring?.status === 'invalid' ? '接线未闭合' : 'Im未接线';
  const isConnected = !!d.wiring?.energized;
  const statusColor = isConnected
    ? (isLight ? '#15803d' : '#4ade80')
    : (isLight ? '#b91c1c' : '#f87171');

  const rightFootY = bodyY + bodyH - rightFootH / 2;

  fillSoftText(isLight ? '#334155' : '#cbd5e1', () => {
    ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`K=${HALL_K}`, rightX + pad, rightFootY);
  });

  fillSoftText(statusColor, () => {
    ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(wiringText, rightX + rightW - pad, rightFootY);
  });

  // Action bar buttons with pure text labels
  const btnGap = Math.round(10 * scale);
  const labels = [
    { label: d.showCurve ? '返回记录' : '生成曲线', action: 'hall-chart' },
    { label: '导出数据', action: 'hall-export' },
    { label: '清空', action: 'hall-clear' },
  ];
  const bw = (innerW - btnGap * (labels.length - 1)) / labels.length;
  labels.forEach((b, i) => {
    drawHallButton(
      ctx, hits,
      innerX + i * (bw + btnGap), btnY, bw, btnH,
      b.label, b.action, {}, accentHex, !!b.active,
    );
  });
}

// ── Optics experiment screens ──────────────────────────────────────
// 设计原则：
// 1) 字号够大（全息/全屏可读）  2) 按步骤渐进展示，不堆满  3) 用布局计算而非 clip 裁切

/**
 * Hall carrier demo (霍尔效应原理): compact single-column flow.
 * Formula strip → live metrics → 2×2 sliders → type chips → action bar.
 * Avoids the old dual-panel layout that let status text collide with hints.
 */
function drawHallDemoExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, hud, accentHex } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = cfg.surface === 'display';
  const scale = holoUiScale(cfg.surface || (isDisplay ? 'display' : 'full'));
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const d = hud?.data || {};
  const gap = Math.round(10 * scale);
  const x = innerX;
  const w = innerW;
  const pink = _uiTheme === 'light' ? '#be185d' : '#f9a8d4';
  const vh = Number(d.vh || 0);
  const isNType = d.nType !== false;

  const nVal = Math.max(0.01, Number(d.n || 1));
  const dVal = Math.max(0.01, Number(d.d || 0.5));
  const sign = isNType ? -1 : 1;
  const kVal = sign / (nVal * (dVal / 0.5));
  const kFormatted = (kVal >= 0 ? '+' : '') + kVal.toFixed(3);
  const vhFormatted = (vh >= 0 ? '+' : '') + vh.toFixed(3);
  const qFormatted = isNType ? '-e' : '+e';

  let cy = contentTop;

  // ── 顶部栏：电流 I · 磁场 B · 霍尔电压 U_H ──
  const topH = Math.round(60 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, cy, w, topH, 10);
  ctx.fill();
  ctx.stroke();

  const colW1 = w / 3;

  // 电流 I
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('电流 I', x + colW1 * 0.5, cy + Math.round(9 * scale));
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${Number(d.I || 0).toFixed(2)} A`, x + colW1 * 0.5, cy + Math.round(30 * scale));

  // 磁场 B
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('磁场 B', x + colW1 * 1.5, cy + Math.round(9 * scale));
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${Number(d.B || 0).toFixed(2)} T`, x + colW1 * 1.5, cy + Math.round(30 * scale));

  // 霍尔电压 U_H（与前两项保持一致的高对比颜色 P.text）
  drawMathFormula(
    ctx,
    '霍尔电压 U_{H}',
    x + colW1 * 2.5,
    cy + Math.round(9 * scale),
    { fontSize: Math.round(12 * scale), color: P.muted, align: 'center', textBaseline: 'top' },
  );
  drawMathFormula(
    ctx,
    `U_{H} = ${vhFormatted}`,
    x + colW1 * 2.5,
    cy + Math.round(30 * scale),
    { fontSize: Math.round(15 * scale), color: P.text, align: 'center', textBaseline: 'top' },
  );

  cy += topH + gap;

  // ── 中间主体框：载流子类型 ──
  const boxH = Math.round(108 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.4;
  roundRect(ctx, x, cy, w, boxH, 12);
  ctx.fill();
  ctx.stroke();

  const titlePadX = Math.round(16 * scale);
  const titlePadY = Math.round(12 * scale);
  ctx.fillStyle = P.title;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('载流子类型', x + titlePadX, cy + titlePadY);

  const btnH = Math.round(44 * scale);
  const btnY = cy + titlePadY + Math.round(28 * scale);
  const btnGap = Math.round(12 * scale);
  const innerPadX = Math.round(16 * scale);
  const typeW = (w - innerPadX * 2 - btnGap) / 2;

  // 上角标 e^- / h^+
  drawHallButton(
    ctx, hits, x + innerPadX, btnY, typeW, btnH,
    'n型电子 (e^{-})', 'hall-demo-type', { nType: true }, accentHex, isNType,
  );
  drawHallButton(
    ctx, hits, x + innerPadX + typeW + btnGap, btnY, typeW, btnH,
    'p型·空穴 (h^{+})', 'hall-demo-type', { nType: false }, accentHex, !isNType,
  );

  cy += boxH + gap;

  // ── 底部栏：载流子电量 q · 载流子浓度 n · 元件厚度 d · 元件灵敏度 K_H ──
  const botH = Math.round(60 * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, cy, w, botH, 10);
  ctx.fill();
  ctx.stroke();

  const colW3 = w / 4;

  // 1. 载流子电量 q
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('载流子电量 q', x + colW3 * 0.5, cy + Math.round(9 * scale));
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(qFormatted, x + colW3 * 0.5, cy + Math.round(30 * scale));

  // 2. 载流子浓度 n
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('载流子浓度 n', x + colW3 * 1.5, cy + Math.round(9 * scale));
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(nVal.toFixed(2), x + colW3 * 1.5, cy + Math.round(30 * scale));

  // 3. 元件厚度 d
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(11 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('元件厚度 d', x + colW3 * 2.5, cy + Math.round(9 * scale));
  ctx.fillStyle = P.text;
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(dVal.toFixed(2), x + colW3 * 2.5, cy + Math.round(30 * scale));

  // 4. 元件灵敏度 K_H（与前三栏保持相同大字号 15px 和高对比度颜色 P.text）
  drawMathFormula(
    ctx,
    '元件灵敏度 K_{H}',
    x + colW3 * 3.5,
    cy + Math.round(9 * scale),
    { fontSize: Math.round(11 * scale), color: P.muted, align: 'center', textBaseline: 'top' },
  );
  drawMathFormula(
    ctx,
    kFormatted,
    x + colW3 * 3.5,
    cy + Math.round(30 * scale),
    { fontSize: Math.round(15 * scale), color: P.text, align: 'center', textBaseline: 'top' },
  );
}

function drawOptButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false) {
  drawPremiumHoloButton(ctx, hits, x, y, w, h, label, action, meta, accent, active, _uiTheme);
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

/**
 * Optics content screen — zoned layout (no full-width plot stack):
 *
 *   ┌ metrics (large type) ──────────────────────────────────┐
 *   ├ controls ~62% ─────────────────┬ side card ~36% ──────┤
 *   │ presets · tall sliders · tools │ live I(x) / 标注核对  │
 *   │                                │ 或对照摘要            │
 *   ├────────────────────────────────┴──────────────────────┤
 *   └ action bar：写入对照 · 核对曲线 · 对照表 ─────────────┘
 *
 * 「写入对照」：把当前配置与模型可观测量写入对照表（改参后横向比较）。
 * 「核对曲线」：在理论 I(x) 上标注主极大、包络零点与远场条件。
 * 「对照表」：弹出多组参数对比表（非独立实测）。
 */
/**
 * Geometric optics content screen — large type + tight packing.
 * Bottom-up band reservation: footer / tools never collide with sliders.
 */
function drawGeometricOpticsExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface } = cfg;
  _uiTheme = theme || 'dark';
  const d = hud?.data || {};
  const P = screenPalette(_uiTheme, accentHex, surface === 'display');
  // Display canvas is 960×720; full holoUiScale(1.78) made chrome overflow and stack.
  // Cap geometric-optics display scale so bands always fit in contentH.
  const rawScale = holoUiScale(surface || 'full');
  const scale = surface === 'display' ? Math.min(rawScale, 1.28) : rawScale;
  const x = innerX;
  const w = innerW;
  const reflection = d.opticsMode === 'mirror' || isReflectionExp(experiment.id);
  const fmt = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : '—');
  const records = Array.isArray(d.records) ? d.records : [];
  const panelOpen = d.recordsPanelOpen === true;
  const modules = getModulesForExperiment(experiment.id);
  const hasModules = !!(modules && modules.length);
  const chipGap = Math.max(4, Math.round(5 * scale));

  // —— Bottom-up reserved bands (never let sliders invade these) ——
  let btnH = Math.round(48 * scale);
  let hintH = Math.round(20 * scale);
  let toolH = Math.round(42 * scale);
  let gap = Math.round(5 * scale);
  let theoryH = Math.round(26 * scale);
  let statH = Math.round(70 * scale);
  let chipH = Math.round(42 * scale);

  // Tools: toggles + data table only — record lives in footer (avoid duplicate).
  const tools = [];
  if (!reflection) {
    tools.push({
      label: d.dispersion ? '色散开' : '色散关',
      action: 'optics-geo-toggle',
      meta: { key: 'dispersion' },
      active: !!d.dispersion,
    });
    tools.push({
      label: d.showReflect !== false ? '反射线' : '反射关',
      action: 'optics-geo-toggle',
      meta: { key: 'showReflect' },
      active: d.showReflect !== false,
    });
  }
  tools.push({
    label: panelOpen ? '关闭表' : `数据表(${records.length})`,
    action: 'optics-geo-records-panel',
    meta: {},
    active: panelOpen,
  });
  const showTools = tools.length > 0;

  // Params list (may drop height on tight layouts)
  const params = [
    { key: 'angle', label: '入射角 θ', value: Number(d.angle || 0), unit: '°', min: 0, max: 75, digits: 1 },
    { key: 'rotate', label: '台面转角', value: Number(d.rotate || 0), unit: '°', min: -90, max: 90, digits: 0 },
    { key: 'rayCount', label: '光束数', value: Number(d.rayCount || 1), unit: '', min: 1, max: 12, digits: 0 },
  ];
  if (!reflection) {
    params.push(
      { key: 'ior', label: '折射率 n', value: Number(d.ior || 1.52), unit: '', min: 1.0, max: 2.6, digits: 2 },
    );
  }
  if (d.dispersion || experiment.id === 'dispersion') {
    params.push(
      { key: 'dispersionStrength', label: '色散系数', value: Number(d.dispersionStrength || 0.6), unit: '', min: 0, max: 1.5, digits: 2 },
    );
  }
  let showHeight = true;

  const chipRows = 1 // shapes
    + (hasModules ? 1 : 0)
    + (!reflection ? 1 : 0); // medium presets

  const minTheory = Math.round(18 * scale);
  const minStat = Math.round(52 * scale);
  const minChip = Math.round(32 * scale);
  const minTool = Math.round(32 * scale);
  const minBtn = Math.round(40 * scale);
  const minHint = Math.round(14 * scale);
  const minGap = 3;
  const minRowH = Math.round(36 * scale);

  function chromeHeight(_includeHeight) {
    // Param tracks moved to tabletop; reserve a short readout band only.
    const readoutNeed = Math.round(36 * scale);
    const toolNeed = showTools ? toolH + gap : 0;
    return theoryH + gap + statH + gap
      + chipRows * (chipH + gap)
      + readoutNeed + gap
      + toolNeed
      + hintH + gap
      + btnH;
  }

  // Shrink chrome until everything fits in contentH (never force overflow).
  let guard = 0;
  while (chromeHeight(showHeight) > contentH && guard < 40) {
    guard += 1;
    if (showHeight && chromeHeight(false) <= contentH) {
      showHeight = false;
      continue;
    }
    if (gap > minGap) { gap = Math.max(minGap, gap - 1); continue; }
    if (hintH > minHint) { hintH = Math.max(minHint, hintH - 2); continue; }
    if (toolH > minTool) { toolH = Math.max(minTool, toolH - 2); continue; }
    if (chipH > minChip) { chipH = Math.max(minChip, chipH - 2); continue; }
    if (btnH > minBtn) { btnH = Math.max(minBtn, btnH - 2); continue; }
    if (statH > minStat) { statH = Math.max(minStat, statH - 3); continue; }
    if (theoryH > minTheory) { theoryH = Math.max(minTheory, theoryH - 2); continue; }
    break;
  }
  if (showHeight) {
    params.push(
      { key: 'height', label: '光束高度', value: Number(d.height || 0), unit: '', min: -0.6, max: 0.6, digits: 2 },
    );
  }

  // Fixed bottom stack positions
  const bottom = contentTop + contentH;
  const btnY = bottom - btnH;
  const hintY = btnY - gap - hintH;
  const toolY = showTools ? (hintY - gap - toolH) : hintY;
  const midBottom = (showTools ? toolY : hintY) - gap; // sliders must end at or above this

  // Theory / formula
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = accentHex;
  const tTheory = Math.max(22, Math.round(theoryH * 0.92));
  ctx.font = `italic ${tTheory}px "Times New Roman", "Cambria Math", "Microsoft YaHei", serif`;
  const theory = String(experiment.theory || '');
  ctx.fillText(theory.length > 52 ? `${theory.slice(0, 50)}…` : theory, x + 2, contentTop + Math.round(2 * scale));

  // Metrics strip
  let readout;
  if (reflection) {
    const dTh = d.deltaTheta;
    readout = [
      ['θᵢ', d.theta1 == null ? '—' : `${fmt(d.theta1)}°`],
      ['θᵣ', d.theta2 == null ? '—' : `${fmt(d.theta2)}°`],
      ['|Δθ|', dTh == null ? '—' : `${fmt(dTh, 3)}°`],
      ['验证', d.verifyOk ? 'θᵢ≈θᵣ ✓' : (dTh == null ? '—' : '偏差')],
    ];
  } else {
    readout = [
      ['θ₁', d.theta1 == null ? '—' : `${fmt(d.theta1)}°`],
      ['θ₂', d.tir || d.theta2 == null ? 'TIR' : `${fmt(d.theta2)}°`],
      ['n', fmt(d.ior, 3)],
      ['sin比', d.snellRatio == null ? '—' : fmt(d.snellRatio, 3)],
    ];
  }

  const statY = contentTop + theoryH + Math.round(2 * scale);
  const tStatLabel = Math.max(14, Math.round(statH * 0.26));
  const tStatValue = Math.max(20, Math.round(statH * 0.42));
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.4;
  roundRect(ctx, x, statY, w, statH, 10);
  ctx.fill();
  ctx.stroke();
  readout.forEach(([label, value], i) => {
    const cw = w / readout.length;
    const cx = x + i * cw + cw / 2;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${tStatLabel}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, statY + Math.round(statH * 0.12));
    ctx.fillStyle = i === 0 ? accentHex : P.text;
    ctx.font = `bold ${tStatValue}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(String(value), cx, statY + Math.round(statH * 0.46));
  });
  ctx.textAlign = 'left';

  let cy = statY + statH + gap;

  // Module chips 1.1–1.4 / 2.1–2.4
  if (hasModules) {
    const nMod = modules.length;
    const modW = (w - chipGap * (nMod - 1)) / nMod;
    modules.forEach((mod, i) => {
      const short = mod.title.length > 4 ? `${mod.code} ${mod.title.slice(0, 2)}` : `${mod.code} ${mod.title}`;
      drawOptButton(
        ctx, hits,
        x + i * (modW + chipGap), cy, modW, chipH,
        short, 'optics-geo-module', { module: mod.id },
        accentHex, d.moduleId === mod.id,
      );
    });
    cy += chipH + gap;
  }

  // Shape chips
  let shapeChoices;
  if (experiment.id === 'reflection') {
    shapeChoices = d.moduleId === 'multi'
      ? [['平面镜', 'mirror'], ['凸面镜', 'mirror-convex']]
      : [['平面镜', 'mirror']];
  } else if (experiment.id === 'lens') {
    shapeChoices = [['球透镜', 'sphere'], ['柱透镜', 'cylinder']];
  } else if (experiment.id === 'dispersion') {
    shapeChoices = [['三棱镜', 'prism']];
  } else if (experiment.id === 'refraction') {
    shapeChoices = [['三棱镜', 'prism'], ['玻璃砖', 'block']];
  } else {
    shapeChoices = reflection
      ? [['平面镜', 'mirror'], ['凸面镜', 'mirror-convex']]
      : [['三棱镜', 'prism'], ['玻璃砖', 'block']];
  }
  const nShape = shapeChoices.length;
  const chipW = (w - chipGap * Math.max(0, nShape - 1)) / nShape;
  shapeChoices.forEach(([label, shape], i) => {
    drawOptButton(
      ctx, hits,
      x + i * (chipW + chipGap), cy, chipW, chipH,
      label, 'optics-geo-set', { key: 'shape', value: shape },
      accentHex, d.shape === shape,
    );
  });
  cy += chipH + gap;

  // Medium presets (dielectric only)
  if (!reflection) {
    const mW = (w - chipGap * 3) / 4;
    MEDIUM_PRESETS.forEach((m, i) => {
      drawOptButton(
        ctx, hits,
        x + i * (mW + chipGap), cy, mW, chipH,
        m.label, 'optics-geo-preset-ior', { ior: m.ior },
        accentHex, Math.abs(Number(d.ior) - m.ior) < 0.001,
      );
    });
    cy += chipH + gap;
  }

  // Params live on the tabletop desk panel — short readout only
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
  const paramSummary = params
    .map((p) => `${p.label.replace(/\s.*/, '')} ${Number(p.value).toFixed(p.digits ?? 1)}${p.unit || ''}`)
    .join(' · ');
  ctx.fillText(
    `参数（桌右侧滑条）：${paramSummary.length > 52 ? `${paramSummary.slice(0, 50)}…` : paramSummary}`,
    x + 2,
    cy + Math.round(4 * scale),
  );
  cy += Math.round(36 * scale) + gap;

  // Tools row (reserved Y — never Math.min into footer)
  if (showTools) {
    const toolW = (w - chipGap * (tools.length - 1)) / tools.length;
    tools.forEach((t, i) => {
      drawOptButton(
        ctx, hits,
        x + i * (toolW + chipGap), toolY, toolW, toolH,
        t.label, t.action, t.meta, accentHex, t.active,
      );
    });
  }

  // Hint line (reserved band)
  const tHint = Math.max(13, Math.round(hintH * 0.85));
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${tHint}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const activeMod = hasModules
    ? (modules.find((m) => m.id === d.moduleId) || modules[0])
    : null;
  const modTag = activeMod ? `${activeMod.code} ${activeMod.title} · ` : '';
  const hint = !reflection && d.criticalDeg != null
    ? `${modTag}θc≈${fmt(d.criticalDeg, 1)}° · ${SHAPE_LABELS[d.shape] || d.shape || '—'} · ${Number(d.rayCount || 1)} 束`
    : `${modTag}${SHAPE_LABELS[d.shape] || d.shape || '—'} · ${Number(d.rayCount || 1)} 束光`;
  ctx.fillText(hint.length > 48 ? `${hint.slice(0, 46)}…` : hint, x + 2, hintY + Math.round(1 * scale));

  // Footer actions (fixed bottom)
  const footerGap = Math.round(6 * scale);
  const footerW = (w - footerGap) / 2;
  drawPremiumHoloButton(
    ctx, hits, x, btnY, footerW, btnH,
    '重置', 'optics-geo-reset', {}, accentHex, false, theme,
  );
  drawPremiumHoloButton(
    ctx, hits, x + footerW + footerGap, btnY, footerW, btnH,
    records.length ? '再记一组' : '记录本组', 'optics-geo-record', {}, accentHex, false, theme,
  );

  if (panelOpen) {
    drawGeoOpticsRecordsPanel(ctx, hits, {
      x, y: contentTop, w, h: contentH,
      d, accentHex, theme, surface, experiment,
    });
  }
}

function drawGeoOpticsRecordsPanel(ctx, hits, cfg) {
  const { x, y, w, h, d, accentHex, theme, surface, experiment } = cfg;
  _uiTheme = theme || 'dark';
  const P = screenPalette(_uiTheme, accentHex, surface === 'display');
  const scale = holoUiScale(surface || 'full');
  const records = Array.isArray(d.records) ? d.records : [];
  const columns = geoOpticsRecordColumns(experiment.id);

  // Dimmer
  hits.push({
    x, y, w, h,
    action: 'optics-geo-records-panel',
    meta: { open: false },
    role: 'optics_records_dimmer',
  });

  const pad = Math.round(12 * scale);
  const panelW = Math.min(w - pad * 2, Math.round(w * 0.97));
  const panelH = Math.min(h - pad * 2, Math.round(h * 0.90));
  const px = x + (w - panelW) / 2;
  const py = y + (h - panelH) / 2;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  hits.push({
    x: px, y: py, w: panelW, h: panelH,
    action: 'optics-geo-records-panel',
    meta: { open: true },
    role: 'optics_records_panel',
  });

  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, panelW, panelH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(24 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('实验数据记录', px + pad, py + pad);

  drawPremiumHoloButton(
    ctx, hits,
    px + panelW - pad - Math.round(100 * scale), py + pad - 2,
    Math.round(100 * scale), Math.round(42 * scale),
    '关闭', 'optics-geo-records-panel', { open: false },
    accentHex, false, theme,
  );

  const tableTop = py + pad + Math.round(48 * scale);
  const rowH = Math.round(34 * scale);
  const headerH = Math.round(36 * scale);
  const maxRows = Math.max(4, Math.floor((panelH - pad * 3 - Math.round(100 * scale) - headerH) / rowH));
  const maxStart = Math.max(0, records.length - maxRows);
  let start = d.tableScrollAuto !== false
    ? maxStart
    : Math.max(0, Math.min(maxStart, Number(d.tableScrollTop || 0)));
  const visible = records.slice(start, start + maxRows);

  // Header
  let cx = px + pad;
  const tableW = panelW - pad * 2;
  ctx.fillStyle = P.stepBox;
  roundRect(ctx, px + pad, tableTop, tableW, headerH, 6);
  ctx.fill();
  columns.forEach((col) => {
    const cw = tableW * col.width;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(col.label, cx + cw / 2, tableTop + Math.round(9 * scale));
    cx += cw;
  });

  visible.forEach((row, i) => {
    const ry = tableTop + headerH + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(px + pad, ry, tableW, rowH);
    }
    let rx = px + pad;
    columns.forEach((col) => {
      const cw = tableW * col.width;
      ctx.fillStyle = P.text;
      ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(
        formatOpticsRecordCell(row, col.key, start + i),
        rx + cw / 2,
        ry + Math.round(8 * scale),
      );
      rx += cw;
    });
  });

  if (!records.length) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据 — 调节仪器后点击「记录本组」', px + panelW / 2, tableTop + headerH + Math.round(40 * scale));
  }

  // Scroll hit region
  if (maxStart > 0) {
    hits.push({
      x: px + pad,
      y: tableTop,
      w: tableW,
      h: headerH + maxRows * rowH,
      action: 'hall-scroll-table',
      meta: { maxRows, maxStart, rowH },
      role: 'table_scroll',
    });
  }

  const footY = py + panelH - pad - Math.round(42 * scale);
  const fGap = Math.round(8 * scale);
  const fW = (panelW - pad * 2 - fGap * 2) / 3;
  drawPremiumHoloButton(ctx, hits, px + pad, footY, fW, Math.round(40 * scale), '再记一组', 'optics-geo-record', {}, accentHex, true, theme);
  drawPremiumHoloButton(ctx, hits, px + pad + fW + fGap, footY, fW, Math.round(40 * scale), '清空', 'optics-geo-clear', {}, accentHex, false, theme);
  drawPremiumHoloButton(ctx, hits, px + pad + 2 * (fW + fGap), footY, fW, Math.round(40 * scale), '关闭', 'optics-geo-records-panel', { open: false }, accentHex, false, theme);
}

function drawDiffractionExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, surface = 'full' } = cfg;
  _uiTheme = cfg.theme || 'dark';
  const isDisplay = surface === 'display';
  const P = screenPalette(_uiTheme, accentHex, isDisplay);
  const scale = holoUiScale(surface);
  const d = hud?.data || {};
  const steps = experiment.steps || [];
  const stepIndex = Number(hud?.stepIndex || 0);
  const step = steps[stepIndex] || {};
  const records = Array.isArray(d.records) ? d.records : [];
  const chartOpen = !!d.chartOpen;
  const panelOpen = d.recordsPanelOpen === true;
  const gap = Math.round(10 * scale);
  const x = innerX;
  const w = innerW;
  const fmt = (v, n = 3) => Number(v || 0).toFixed(n);
  const half = diffractionHalfSpan(d);
  const lambdaNm = Number(d.lambdaNm || 550);
  const last = records.length ? records[records.length - 1] : null;
  const Nslit = Math.max(1, Math.round(Number(d.N || 1)));
  const isLight = _uiTheme === 'light';

  // —— Vertical bands derived from contentH (everything is dynamic, nothing overflows) ——
  // Prefer large chrome + tight gaps; when short, shrink proportionally so stacks never collide.
  const preferBtn = Math.round(54 * scale);
  const preferStep = Math.round(30 * scale);
  const preferStat = Math.round(88 * scale);
  const preferGap = Math.round(7 * scale);
  const minBtn = Math.round(42 * scale);
  const minStep = Math.round(24 * scale);
  const minStat = Math.round(68 * scale);
  const minGap = Math.round(4 * scale);
  const minMid = Math.round(220 * scale);

  // contentH = step + gap + stat + gap + mid + gap + btn
  const fixedPrefer = preferStep + preferStat + preferBtn + preferGap * 3;
  const roomForMid = contentH - fixedPrefer;
  let btnH = preferBtn;
  let stepH = preferStep;
  let statH = preferStat;
  let bandGap = preferGap;
  let midH = roomForMid;

  if (midH < minMid) {
    // Shrink non-mid chrome first so mid keeps working space.
    const deficit = minMid - midH;
    let left = deficit;
    const shrink = (cur, min) => {
      const take = Math.min(left, Math.max(0, cur - min));
      left -= take;
      return cur - take;
    };
    btnH = shrink(btnH, minBtn);
    statH = shrink(statH, minStat);
    stepH = shrink(stepH, minStep);
    bandGap = shrink(bandGap, minGap);
    bandGap = shrink(bandGap, minGap);
    bandGap = shrink(bandGap, minGap);
    midH = contentH - (stepH + statH + btnH + bandGap * 3);
  }
  midH = Math.max(Math.round(180 * scale), midH);

  const stepY = contentTop;
  const statY = stepY + stepH + bandGap;
  const midTop = statY + statH + bandGap;
  const btnY = contentTop + contentH - btnH;
  // Re-clamp mid bottom to action bar (hard guarantee)
  midH = Math.max(Math.round(160 * scale), btnY - midTop - bandGap);

  const btnGap = Math.round(6 * scale);
  const split = Math.round(8 * scale);
  const leftW = Math.floor(w * 0.62);
  const rightW = w - leftW - split;
  const rightX = x + leftW + split;
  const pad = Math.max(Math.round(6 * scale), Math.min(Math.round(10 * scale), Math.round(midH * 0.025)));
  const chipGap = Math.round(6 * scale);

  // Type scale tracks band height — higher floors for content-screen readability
  const tStep = Math.max(18, Math.round(stepH * 0.78));
  const tStatLabel = Math.max(16, Math.round(statH * 0.26));
  const tStatValue = Math.max(24, Math.round(statH * 0.42));

  // —— Step ——
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${tStep}px "Microsoft YaHei", sans-serif`;
  const stepText = `步骤 ${stepIndex + 1}/${Math.max(1, steps.length)} · ${step?.text || experiment.theory || ''}`;
  ctx.fillText(stepText.length > 38 ? `${stepText.slice(0, 36)}…` : stepText, x + 2, stepY + Math.round(2 * scale));

  // —— Metrics ——
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = isDisplay ? 1.6 : 1.2;
  roundRect(ctx, x, statY, w, statH, 12);
  ctx.fill();
  ctx.stroke();

  const stats = [
    ['Δx', `${fmt(d.fringeSpacingMm, 3)}mm`, accentHex],
    ['包络宽', `${fmt(d.centralWidthMm, 2)}mm`, P.text],
    ['F', Number(d.fresnel || 0).toExponential(1), P.text],
    ['远场', d.farField ? '可用' : '近场', d.farField ? '#4ade80' : '#fb7185'],
  ];
  stats.forEach(([label, value, color], i) => {
    const colW = w / stats.length;
    const cx = x + i * colW + colW / 2;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${tStatLabel}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, statY + Math.round(statH * 0.16));
    ctx.fillStyle = color;
    ctx.font = `bold ${tStatValue}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(value, cx, statY + Math.round(statH * 0.48));
  });
  ctx.textAlign = 'left';

  // —— Middle panels ——
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  roundRect(ctx, x, midTop, leftW, midH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  roundRect(ctx, rightX, midTop, rightW, midH, 12);
  ctx.fill();
  ctx.stroke();

  // Dynamic left-column pack: presets + param readout + tools (sliders on desk)
  const presets = [
    ['单缝', 'single'], ['双缝', 'double'], ['三缝', 'triple'],
    ['六缝', 'multi'], ['光栅', 'grating'], ['He-Ne', 'hene2'],
  ];
  const params = [
    { key: 'lambdaNm', label: '波长 λ', value: Number(d.lambdaNm || 550), unit: 'nm', digits: 0 },
    { key: 'N', label: '缝数 N', value: Number(d.N || 2), unit: '', digits: 0 },
    { key: 'slitMm', label: '缝宽 a', value: Number(d.slitMm || 0.05), unit: 'mm', digits: 3 },
    { key: 'pitchMm', label: '缝距 d', value: Number(d.pitchMm || 0.25), unit: 'mm', digits: 3 },
    { key: 'distM', label: '屏距 L', value: Number(d.distM || 1), unit: 'm', digits: 2 },
  ];
  const tools = [
    { label: d.lightOn ? '激光开' : '激光关', action: 'optics-diff-power', meta: {}, active: !!d.lightOn },
    { label: d.showBeam !== false ? '光锥' : '光锥关', action: 'optics-diff-toggle', meta: { key: 'showBeam' }, active: d.showBeam !== false },
    { label: d.showWave !== false ? '波前' : '波前关', action: 'optics-diff-toggle', meta: { key: 'showWave' }, active: d.showWave !== false },
    { label: d.demoOn ? '扫频中' : '扫频', action: 'optics-diff-demo', meta: {}, active: !!d.demoOn },
  ];

  const colInnerH = Math.max(1, midH - pad * 2);
  const toolH = Math.round(40 * scale);
  const pCols = 3;
  const pGap = Math.max(4, Math.round(chipGap * 0.75));
  const pH = Math.round(36 * scale);
  const pW = (leftW - pad * 2 - pGap * (pCols - 1)) / pCols;

  let ly = midTop + pad;
  presets.forEach(([label, preset], i) => {
    const col = i % pCols;
    const row = Math.floor(i / pCols);
    drawOptButton(
      ctx, hits,
      x + pad + col * (pW + pGap), ly + row * (pH + pGap),
      pW, pH, label, 'optics-diff-preset', { preset }, accentHex, d.preset === preset,
    );
  });
  ly += 2 * pH + pGap + Math.round(10 * scale);

  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('参数（桌右侧滑条调节）', x + pad, ly);
  ly += Math.round(22 * scale);
  const rowH = Math.max(Math.round(28 * scale), Math.floor((midTop + midH - pad - toolH - ly - Math.round(12 * scale)) / params.length));
  params.forEach((p, i) => {
    const py = ly + i * rowH;
    if (py + rowH > midTop + midH - pad - toolH) return;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(p.label, x + pad, py + Math.round(4 * scale));
    ctx.fillStyle = P.text;
    ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(
      `${Number(p.value).toFixed(p.digits)}${p.unit ? ` ${p.unit}` : ''}`,
      x + leftW - pad,
      py + Math.round(4 * scale),
    );
  });
  ctx.textAlign = 'left';

  const toolY = midTop + midH - pad - toolH;
  const toolW = (leftW - pad * 2 - chipGap * 3) / 4;
  tools.forEach((t, i) => {
    drawOptButton(
      ctx, hits,
      x + pad + i * (toolW + chipGap), toolY, toolW, Math.max(Math.round(28 * scale), toolH),
      t.label, t.action, t.meta, accentHex, t.active,
    );
  });

  // —— Right card: live preview OR annotated verification ——
  const rp = Math.max(Math.round(6 * scale), Math.round(rightW * 0.035));
  const tSideTitle = Math.max(18, Math.round(22 * scale * Math.min(1, midH / (340 * scale))));
  const tSideMeta = Math.max(15, Math.round(18 * scale * Math.min(1, midH / (340 * scale))));
  const tSumLabel = Math.max(16, Math.round(18 * scale * Math.min(1, midH / (340 * scale))));
  const tSumValue = Math.max(18, Math.round(24 * scale * Math.min(1, midH / (340 * scale))));

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${tSideTitle}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(chartOpen ? '核对 I(x)' : '强度预览', rightX + rp, midTop + Math.round(8 * scale));
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${tSideMeta}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(
    `λ ${fmt(lambdaNm, 0)} · N ${Nslit}`,
    rightX + rightW - rp,
    midTop + Math.round(10 * scale),
  );
  ctx.textAlign = 'left';

  const titleBand = Math.round(Math.max(28 * scale, midH * 0.08));
  // Verification mode: give the plot most of the card so markers stay readable.
  const plotShare = chartOpen
    ? (midH < Math.round(320 * scale) ? 0.72 : 0.68)
    : (midH < Math.round(320 * scale) ? 0.48 : 0.42);
  const sidePlotTop = midTop + titleBand;
  const sidePlotH = Math.max(Math.round(56 * scale), Math.floor((midH - titleBand - pad) * plotShare));
  const stripeH = chartOpen
    ? Math.max(Math.round(10 * scale), Math.round(sidePlotH * 0.12))
    : Math.max(Math.round(14 * scale), Math.round(sidePlotH * 0.18));
  const px0 = rightX + Math.round(14 * scale);
  const pw = rightW - Math.round(28 * scale);
  const py0 = sidePlotTop + Math.round(4 * scale);
  const ph = Math.max(Math.round(16 * scale), sidePlotH - stripeH - Math.round(12 * scale));
  const xToPx = (xv) => px0 + ((xv + half) / Math.max(1e-12, 2 * half)) * pw;

  ctx.fillStyle = isLight ? 'rgba(15,23,42,0.06)' : 'rgba(2,6,23,0.55)';
  roundRect(ctx, rightX + Math.round(6 * scale), sidePlotTop, rightW - Math.round(12 * scale), sidePlotH, 8);
  ctx.fill();

  // Markers under the curve (draw first)
  if (chartOpen) {
    const zeros = diffractionEnvelopeZeros(d, half);
    const maxima = diffractionPrincipalMaxima(d, half);
    zeros.forEach(({ x: zx }) => {
      [zx, -zx].forEach((xv) => {
        if (Math.abs(xv) > half) return;
        const mx = xToPx(xv);
        ctx.strokeStyle = isLight ? 'rgba(249, 115, 22, 0.55)' : 'rgba(251, 146, 60, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(mx, py0);
        ctx.lineTo(mx, py0 + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    });
    maxima.forEach(({ x: mxv, p }) => {
      if (Math.abs(mxv) > half) return;
      // Skip dense labels for |p| large when many peaks
      const mx = xToPx(mxv);
      ctx.strokeStyle = isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = p === 0 ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(mx, py0);
      ctx.lineTo(mx, py0 + ph);
      ctx.stroke();
    });
  }

  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const xv = -half + (2 * half * i) / 200;
    const intensity = diffractionIntensity(xv, d);
    const px = px0 + (i / 200) * pw;
    const py = py0 + ph * (1 - intensity);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = diffractionColor(lambdaNm);
  ctx.shadowColor = diffractionColor(lambdaNm);
  ctx.shadowBlur = chartOpen ? 8 : 6;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Axis ticks for verification
  if (chartOpen) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.max(10, Math.round(11 * scale))}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('−x', px0 + 2, py0 + ph + Math.round(2 * scale));
    ctx.fillText('0', xToPx(0), py0 + ph + Math.round(2 * scale));
    ctx.fillText('+x', px0 + pw - 2, py0 + ph + Math.round(2 * scale));
    ctx.textAlign = 'left';
  }

  const stripeY = sidePlotTop + sidePlotH - stripeH - Math.round(4 * scale);
  const stripeGrad = ctx.createLinearGradient(px0, 0, px0 + pw, 0);
  for (let i = 0; i <= 80; i++) {
    const xv = -half + (2 * half * i) / 80;
    const I = diffractionIntensity(xv, d);
    const soft = Math.min(1, (I / (I + 0.08)) ** 0.85);
    stripeGrad.addColorStop(i / 80, diffractionColor(lambdaNm, 0.05 + soft * 0.95));
  }
  ctx.fillStyle = '#030509';
  roundRect(ctx, px0, stripeY, pw, stripeH, 4);
  ctx.fill();
  ctx.fillStyle = stripeGrad;
  roundRect(ctx, px0, stripeY, pw, stripeH, 4);
  ctx.fill();

  // Peak markers on the stripe (verification)
  if (chartOpen) {
    const maxima = diffractionPrincipalMaxima(d, half);
    maxima.forEach(({ x: mxv }) => {
      if (Math.abs(mxv) > half) return;
      const mx = xToPx(mxv);
      ctx.fillStyle = isLight ? '#0284c7' : '#7dd3fc';
      ctx.fillRect(mx - 1, stripeY, 2, stripeH);
    });
  }

  // Summary / verification legend under the plot
  const sumTop = sidePlotTop + sidePlotH + Math.round(8 * scale);
  const sumBottom = midTop + midH - pad;
  let summary;
  if (chartOpen) {
    const zero1Mm = (() => {
      const z = diffractionEnvelopeZeros(d, half)[0];
      return z ? (z.x * 1e3).toFixed(2) : '—';
    })();
    summary = [
      ['主极大 Δx', Nslit <= 1 ? '单缝（无干涉）' : `${fmt(d.fringeSpacingMm, 3)} mm`],
      ['包络零点 ±λL/a', `${zero1Mm} mm`],
      ['菲涅耳 F', Number(d.fresnel || 0).toExponential(1)],
      ['远场条件', d.farField ? 'F≪1 可用' : '近场 · 慎用'],
    ];
  } else {
    summary = [
      ['条纹间距 Δx', `${fmt(d.fringeSpacingMm, 3)} mm`],
      ['包络全宽', `${fmt(d.centralWidthMm, 2)} mm`],
      ['屏距 L', `${fmt(d.distM, 2)} m`],
      ['对照表', `${records.length} 组`],
    ];
  }
  const sumRows = (!chartOpen && last) ? summary.length + 1 : summary.length + (chartOpen ? 1 : 0);
  const sumLine = Math.max(Math.round(16 * scale), Math.floor((sumBottom - sumTop) / Math.max(1, sumRows)));
  summary.forEach(([label, value], i) => {
    const sy = sumTop + i * sumLine;
    if (sy + sumLine * 0.55 > sumBottom) return;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${tSumLabel}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, rightX + rp, sy);
    ctx.fillStyle = chartOpen && label.startsWith('远场')
      ? (d.farField ? '#4ade80' : '#fb7185')
      : P.text;
    ctx.font = `bold ${tSumValue}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    const val = String(value);
    ctx.fillText(val.length > 14 ? `${val.slice(0, 12)}…` : val, rightX + rightW - rp, sy);
  });
  ctx.textAlign = 'left';
  if (chartOpen) {
    const sy = sumTop + summary.length * sumLine;
    if (sy < sumBottom) {
      ctx.fillStyle = P.muted;
      ctx.font = `bold ${Math.max(11, tSumLabel - 2)}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(
        Nslit <= 1 ? '虚线=包络零点' : '细线=主极大 · 虚线=包络零点',
        rightX + rp,
        sy,
      );
    }
  } else if (last) {
    const sy = sumTop + summary.length * sumLine;
    if (sy < sumBottom) {
      ctx.fillStyle = P.muted;
      ctx.font = `bold ${Math.max(12, tSumLabel - 2)}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(
        `末组 N=${Math.round(last.N)} Δx=${fmt(last.fringeSpacingMm, 3)}`,
        rightX + rp,
        sy,
      );
    }
  }

  // —— Action bar ——
  // 写入对照：参数快照入表；核对曲线：标注 I(x)；对照表：打开多组对比
  const actions = [
    { label: records.length ? `写入 #${records.length + 1}` : '写入对照', action: 'optics-diff-record', active: false },
    { label: chartOpen ? '关闭标注' : '核对曲线', action: 'optics-diff-chart', active: chartOpen },
    {
      label: records.length ? `对照表 ${records.length}` : '对照表',
      action: 'optics-diff-records-panel',
      active: panelOpen || records.length > 0,
    },
  ];
  const bw = (w - btnGap * (actions.length - 1)) / actions.length;
  actions.forEach((b, i) => {
    drawOptButton(
      ctx, hits,
      x + i * (bw + btnGap), btnY, bw, btnH,
      b.label, b.action, {}, accentHex, b.active,
    );
  });

  if (panelOpen) {
    drawOpticsRecordsPanel(ctx, hits, {
      innerX, innerW, contentTop, contentH, accentHex, theme: _uiTheme, scale, d, records, P,
    });
  }
}

/**
 * Overlay comparison table for multi-slit diffraction records.
 * Purpose: change one parameter, write another row, compare Δx / envelope / far-field.
 */
function drawOpticsRecordsPanel(ctx, hits, cfg) {
  const {
    innerX, innerW, contentTop, contentH, accentHex, theme, scale, d, records, P,
  } = cfg;
  const isLight = theme === 'light';
  const x = innerX;
  const w = innerW;

  ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.28)' : 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(innerX - Math.round(8 * scale), contentTop - Math.round(4 * scale), innerW + Math.round(16 * scale), contentH + Math.round(8 * scale));
  hits.push({
    x: innerX - Math.round(8 * scale),
    y: contentTop - Math.round(4 * scale),
    w: innerW + Math.round(16 * scale),
    h: contentH + Math.round(8 * scale),
    action: 'optics-diff-records-panel',
    open: true,
    role: 'optics_records_dimmer',
  });

  const pad = Math.round(14 * scale);
  const panelW = w;
  const panelH = Math.min(contentH - Math.round(12 * scale), Math.round(420 * scale));
  const panelX = x;
  const panelY = contentTop + Math.round(8 * scale);
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(15, 23, 42, 0.96)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2;
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.stroke();

  hits.push({
    x: panelX,
    y: panelY,
    w: panelW,
    h: panelH,
    action: 'optics-diff-records-panel',
    open: true,
    role: 'optics_records_panel',
  });

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`参数对照表 · ${records.length} 组`, panelX + pad, panelY + Math.round(12 * scale));
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('改一个量再写入；比较 Δx=λL/d 与包络宽∝λL/a（模型导出，非实测）', panelX + pad, panelY + Math.round(36 * scale));

  const closeW = Math.round(88 * scale);
  const closeH = Math.round(34 * scale);
  drawPremiumHoloButton(
    ctx, hits,
    panelX + panelW - pad - closeW, panelY + Math.round(10 * scale), closeW, closeH,
    '关闭', 'optics-diff-records-panel', { open: false },
    accentHex, false, theme,
  );

  const columns = opticsRecordColumns();
  const chartX = panelX + Math.round(10 * scale);
  const chartY = panelY + Math.round(58 * scale);
  const chartW = panelW - Math.round(20 * scale);
  const footerH = Math.round(52 * scale);
  const chartH = panelH - Math.round(70 * scale) - footerH;
  const headerH = Math.round(28 * scale);
  ctx.fillStyle = isLight ? 'rgba(245, 158, 11, 0.14)' : 'rgba(251, 191, 36, 0.14)';
  ctx.fillRect(chartX, chartY, chartW, headerH);
  ctx.fillStyle = isLight ? '#92400e' : '#fcd34d';
  ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
  let colX = chartX + Math.round(4 * scale);
  const totalW = columns.reduce((s, c) => s + c.width, 0) || 1;
  columns.forEach((col) => {
    const cw = (chartW - Math.round(8 * scale)) * (col.width / totalW);
    ctx.fillText(col.label, colX, chartY + Math.round(7 * scale));
    col.xPx = colX;
    colX += cw;
  });

  const bodyY = chartY + headerH;
  const bodyH = chartH - headerH;
  const rowHTable = Math.round(26 * scale);
  const maxRows = Math.max(1, Math.floor(bodyH / rowHTable));
  const maxStart = Math.max(0, records.length - maxRows);
  let start = maxStart;
  if (Number.isFinite(d.tableScrollTop) && d.tableScrollTop >= 0 && !d.tableScrollAuto) {
    start = Math.max(0, Math.min(maxStart, Math.round(d.tableScrollTop)));
  } else {
    d.tableScrollTop = maxStart;
    d.tableScrollAuto = true;
  }
  const visible = records.slice(start, start + maxRows);

  hits.push({
    x: chartX,
    y: chartY,
    w: chartW,
    h: chartH,
    action: 'hall-scroll-table',
    role: 'scrollable_table',
    maxRows,
    maxStart,
    rowH: rowHTable,
    scrollable: maxStart > 0,
  });

  visible.forEach((row, i) => {
    const y = bodyY + i * rowHTable;
    if (i % 2 === 0) {
      ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(chartX, y, chartW, rowHTable);
    }
    ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
    ctx.font = `bold ${Math.round(12 * scale)}px "Microsoft YaHei", sans-serif`;
    columns.forEach((col) => {
      ctx.fillText(
        formatOpticsRecordCell(row, col.key, start + i),
        col.xPx,
        y + Math.round(6 * scale),
      );
    });
  });

  if (!records.length) {
    ctx.fillStyle = isLight ? '#64748b' : 'rgba(148, 163, 184, 0.75)';
    ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('点「写入对照」添加第一行 · 改参后再写可横向比较', chartX + chartW / 2, bodyY + bodyH / 2);
    ctx.textAlign = 'left';
  }

  const footY = panelY + panelH - footerH + Math.round(4 * scale);
  const footGap = Math.round(8 * scale);
  const footBtns = [
    { label: '再写一组', action: 'optics-diff-record', active: true },
    { label: '清空', action: 'optics-diff-clear', active: false },
    { label: '关闭', action: 'optics-diff-records-panel', meta: { open: false }, active: false },
  ];
  const fbw = (panelW - pad * 2 - footGap * (footBtns.length - 1)) / footBtns.length;
  footBtns.forEach((b, i) => {
    drawPremiumHoloButton(
      ctx, hits,
      panelX + pad + i * (fbw + footGap), footY, fbw, Math.round(40 * scale),
      b.label, b.action, b.meta || {},
      accentHex, b.active, theme,
    );
  });
}

/**
 * Compact thermodynamics content screen.
 * Larger type for hologram readability; tight gaps so the layout stays dense.
 * Data table lives in a separate overlay opened by 「数据表」.
 */
function drawThermoExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface } = cfg;
  _uiTheme = theme || 'dark';
  const d = hud?.data || {};
  const P = screenPalette(_uiTheme, accentHex, surface === 'display');
  const scale = holoUiScale(surface || 'full');
  // Prefer denser packing over empty padding so bigger type still feels compact.
  const gap = Math.round(7 * scale);
  const x = innerX;
  const w = innerW;
  const isLight = _uiTheme === 'light';
  const expId = experiment.id;
  const m = computeThermoMetrics(expId, d);
  const canRecord = thermoCanRecord(expId, d);
  const blocked = thermoRecordBlockedReason(expId, d);
  const columns = thermoRecordColumns(expId);
  const records = Array.isArray(d.records) ? d.records : [];
  const panelOpen = d.recordsPanelOpen === true;
  const fmt = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : '—');

  const btnH = Math.round(48 * scale);
  const btnY = contentTop + contentH - btnH;

  // —— Formula only (no experiment title) ——
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  const theory = String(experiment.theory || '');
  ctx.fillText(theory.length > 48 ? `${theory.slice(0, 46)}…` : theory, x + 2, contentTop);

  // —— Compact metric strip (type fills the band; band only slightly taller) ——
  let readout = [];
  if (expId === 'calorimetry') {
    readout = [
      ['T测', m.tNow == null ? '—' : `${fmt(m.tNow)}°C`],
      ['Tₑq', m.teq == null ? '—' : `${fmt(m.teq)}°C`],
      ['|ΔT|', m.err == null ? '—' : fmt(m.err, 2)],
      ['状态', d.pouring ? `倒入${Math.round((d.pourProgress || 0) * 100)}%` : (m.poured ? `混合${m.mixPct}%` : '待倒水')],
    ];
  } else if (expId === 'convection') {
    readout = [
      ['ΔT', `${fmt(m.deltaT, 0)}K`],
      ['Ra', m.ra >= 1e6 ? `${(m.ra / 1e6).toFixed(1)}e6` : fmt(m.ra, 0)],
      ['h', fmt(m.h, 1)],
      ['Q', `${fmt(m.q, 0)}W`],
    ];
  } else if (expId === 'heat-conduction') {
    readout = [
      ['T中', `${fmt(m.mid, 0)}K`],
      ['q', fmt(m.heatFlux, 0)],
      ['ΔT', `${fmt(m.deltaT, 0)}K`],
      ['趋稳', `${fmt(m.steadyPct, 0)}%`],
    ];
  } else if (expId === 'ideal-gas') {
    readout = [
      ['P', `${fmt(m.pressure, 1)}kPa`],
      ['V', `${fmt(m.V, 2)}×`],
      ['v̄', fmt(m.avgSpeed, 0)],
      ['碰撞', `${fmt(m.collisions, 0)}Hz`],
    ];
  } else {
    readout = [
      ['ΔL', `${fmt(m.deltaL * 1000, 3)}mm`],
      ['L', `${fmt(m.length * 1000, 1)}mm`],
      ['α×10⁶', fmt(m.alpha * 1e6, 1)],
      ['材料', m.materialLabel || '—'],
    ];
  }

  const statY = contentTop + Math.round(26 * scale);
  const statH = Math.round(66 * scale);
  const tStatLabel = Math.max(14, Math.round(statH * 0.24));
  const tStatValue = Math.max(20, Math.round(statH * 0.38));
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, statY, w, statH, 10);
  ctx.fill();
  ctx.stroke();
  readout.forEach(([label, value], i) => {
    const cw = w / readout.length;
    const cx = x + i * cw + cw / 2;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${tStatLabel}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, statY + Math.round(statH * 0.14));
    ctx.fillStyle = i === 0 ? accentHex : P.text;
    ctx.font = `bold ${tStatValue}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(String(value), cx, statY + Math.round(statH * 0.48));
  });
  ctx.textAlign = 'left';

  // —— Sliders (2-col): largeType + hideRange = bigger glyphs without extra chrome ——
  let cy = statY + statH + gap;
  const params = [];
  if (expId === 'calorimetry') {
    params.push(
      { key: 'tHot', label: '热水 T', value: d.tHot, min: 40, max: 95, unit: '°C', digits: 0 },
      { key: 'tCold', label: '冷水 T', value: d.tCold, min: 5, max: 40, unit: '°C', digits: 0 },
      { key: 'mHot', label: '热水 m', value: d.mHot, min: 50, max: 400, unit: 'g', digits: 0 },
      { key: 'mCold', label: '冷水 m', value: d.mCold, min: 50, max: 400, unit: 'g', digits: 0 },
    );
  } else if (expId === 'convection') {
    params.push(
      { key: 'tPlate', label: '热板 T', value: d.tPlate, min: 300, max: 900, unit: 'K', digits: 0 },
      { key: 'tAir', label: '环境 T', value: d.tAir, min: 250, max: 350, unit: 'K', digits: 0 },
      { key: 'area', label: '面积 A', value: d.area, min: 0.05, max: 0.25, unit: 'm²', digits: 2 },
    );
  } else if (expId === 'heat-conduction') {
    params.push(
      { key: 'tHot', label: '热端 T', value: d.tHot, min: 200, max: 900, unit: 'K', digits: 0 },
      { key: 'tCold', label: '冷端 T', value: d.tCold, min: 200, max: 900, unit: 'K', digits: 0 },
      { key: 'conductivity', label: '导热 k', value: d.conductivity, min: 0.15, max: 3.5, unit: '', digits: 2 },
    );
  } else if (expId === 'ideal-gas') {
    params.push(
      { key: 'temperature', label: '温度 T', value: d.temperature, min: 150, max: 600, unit: 'K', digits: 0 },
      { key: 'volume', label: '体积 V', value: d.volume, min: 0.4, max: 1.25, unit: '×', digits: 2 },
    );
  } else if (expId === 'thermal-expansion') {
    params.push(
      { key: 'temperature', label: '温度 T', value: d.temperature, min: 20, max: 400, unit: '°C', digits: 0 },
      { key: 'length0', label: 'L₀', value: d.length0, min: 0.6, max: 1.4, unit: 'm', digits: 2 },
    );
  }

  const colGap = Math.round(6 * scale);
  const colW = (w - colGap) / 2;
  const rowH = Math.round(48 * scale);
  const rowGap = Math.round(4 * scale);
  if (params.length) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('参数在桌右侧滑条调节', x + 2, cy);
    cy += Math.round(20 * scale);
  }
  params.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = x + col * (colW + colGap);
    const py = cy + row * (rowH + rowGap);
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    roundRect(ctx, px, py, colW, rowH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(p.label, px + Math.round(12 * scale), py + Math.round(10 * scale));
    ctx.fillStyle = P.text;
    ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(
      `${Number(p.value).toFixed(p.digits ?? 2)}${p.unit ? ` ${p.unit}` : ''}`,
      px + Math.round(12 * scale),
      py + Math.round(28 * scale),
    );
  });
  cy += Math.ceil(Math.max(params.length, 1) / 2) * (rowH + rowGap) + gap;

  // —— Context tools (pour / flow / material) as one chip row ——
  const chipH = Math.round(42 * scale);
  if (expId === 'calorimetry') {
    const cw = (w - colGap) / 2;
    drawPremiumHoloButton(ctx, hits, x, cy, cw, chipH, d.cupHot ? '热水✓' : '倒入热水', 'thermo-pour-hot', {}, accentHex, !!d.cupHot, theme);
    drawPremiumHoloButton(ctx, hits, x + cw + colGap, cy, cw, chipH, d.cupCold ? '冷水✓' : '倒入冷水', 'thermo-pour-cold', {}, accentHex, !!d.cupCold, theme);
    cy += chipH + gap;
  } else if (expId === 'convection' || expId === 'heat-conduction') {
    drawPremiumHoloButton(
      ctx, hits, x, cy, Math.min(w * 0.42, Math.round(220 * scale)), chipH,
      d.running ? '暂停流动' : '开启流动',
      'thermo-toggle', { key: 'running' },
      accentHex, !!d.running, theme,
    );
    cy += chipH + gap;
  } else if (expId === 'thermal-expansion') {
    const labels = [['aluminum', '铝'], ['copper', '铜'], ['steel', '钢'], ['invar', '殷钢']];
    const cw = (w - colGap * 3) / 4;
    labels.forEach(([key, label], i) => {
      drawPremiumHoloButton(
        ctx, hits, x + i * (cw + colGap), cy, cw, chipH,
        label, 'thermo-set', { key: 'material', value: key },
        accentHex, d.material === key, theme,
      );
    });
    cy += chipH + gap;
  }

  // —— Hint line (single, no big insight card) ——
  const hintH = Math.round(20 * scale);
  ctx.fillStyle = canRecord ? P.muted : (isLight ? '#b45309' : '#fdba74');
  ctx.font = `bold ${Math.round(15 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(
    canRecord
      ? `可写入 · 已存 ${records.length} 组 · ${thermoRecordCaption(expId).slice(0, 28)}…`
      : blocked,
    x + 2,
    Math.min(cy, btnY - hintH),
  );

  // —— Main action bar: 写入 | 数据表 | 重置 ——
  const btnGap = Math.round(6 * scale);
  const mainButtons = [
    {
      label: canRecord ? '写入数据' : '不可写入',
      action: 'thermo-record',
      active: canRecord,
    },
    {
      label: records.length ? `数据表 ${records.length}` : '数据表',
      action: 'thermo-records-panel',
      meta: { open: true },
      active: panelOpen || records.length > 0,
    },
    { label: '重置', action: 'thermo-reset', active: false },
  ];
  const bw = (w - btnGap * (mainButtons.length - 1)) / mainButtons.length;
  mainButtons.forEach((b, i) => {
    drawPremiumHoloButton(
      ctx, hits,
      x + i * (bw + btnGap), btnY, bw, btnH,
      b.label, b.action, b.meta || {},
      accentHex, b.active, theme,
    );
  });

  // —— Overlay: data table panel (opened by button) ——
  if (!panelOpen) return;

  // Dim main content so the panel reads as a separate surface.
  ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.28)' : 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(innerX - Math.round(8 * scale), contentTop - Math.round(4 * scale), innerW + Math.round(16 * scale), contentH + Math.round(8 * scale));
  // Capture clicks on the dimmer (no-op) so controls underneath are not hit.
  hits.push({
    x: innerX - Math.round(8 * scale),
    y: contentTop - Math.round(4 * scale),
    w: innerW + Math.round(16 * scale),
    h: contentH + Math.round(8 * scale),
    action: 'thermo-records-panel',
    open: true,
    role: 'thermo_records_dimmer',
  });

  const pad = Math.round(12 * scale);
  const panelW = w;
  const panelH = Math.min(contentH - Math.round(12 * scale), Math.round(420 * scale));
  const panelX = x;
  const panelY = contentTop + Math.round(8 * scale);
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(15, 23, 42, 0.96)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2;
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.stroke();

  // Block underlying hits inside the panel body (except explicit controls added after).
  hits.push({
    x: panelX,
    y: panelY,
    w: panelW,
    h: panelH,
    action: 'thermo-records-panel',
    open: true,
    role: 'thermo_records_panel',
  });

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`对照数据表 · ${records.length} 组`, panelX + pad, panelY + Math.round(10 * scale));
  ctx.fillStyle = P.muted;
  ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(thermoRecordCaption(expId), panelX + pad, panelY + Math.round(36 * scale));

  const closeW = Math.round(88 * scale);
  const closeH = Math.round(36 * scale);
  drawPremiumHoloButton(
    ctx, hits,
    panelX + panelW - pad - closeW, panelY + Math.round(8 * scale), closeW, closeH,
    '关闭', 'thermo-records-panel', { open: false },
    accentHex, false, theme,
  );

  const chartX = panelX + Math.round(10 * scale);
  const chartY = panelY + Math.round(58 * scale);
  const chartW = panelW - Math.round(20 * scale);
  const footerH = Math.round(52 * scale);
  const chartH = panelH - Math.round(70 * scale) - footerH;
  const headerH = Math.round(30 * scale);
  ctx.fillStyle = isLight ? 'rgba(249, 115, 22, 0.12)' : 'rgba(251, 146, 60, 0.14)';
  ctx.fillRect(chartX, chartY, chartW, headerH);
  ctx.fillStyle = isLight ? '#9a3412' : '#fdba74';
  ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
  let colX = chartX + Math.round(4 * scale);
  const totalW = columns.reduce((s, c) => s + c.width, 0) || 1;
  columns.forEach((col) => {
    const cw = (chartW - Math.round(8 * scale)) * (col.width / totalW);
    ctx.fillText(col.label, colX, chartY + Math.round(7 * scale));
    col.xPx = colX;
    colX += cw;
  });

  const bodyY = chartY + headerH;
  const bodyH = chartH - headerH;
  const rowHTable = Math.round(28 * scale);
  const maxRows = Math.max(1, Math.floor(bodyH / rowHTable));
  const maxStart = Math.max(0, records.length - maxRows);
  let start = maxStart;
  if (Number.isFinite(d.tableScrollTop) && d.tableScrollTop >= 0 && !d.tableScrollAuto) {
    start = Math.max(0, Math.min(maxStart, Math.round(d.tableScrollTop)));
  } else {
    d.tableScrollTop = maxStart;
    d.tableScrollAuto = true;
  }
  const visible = records.slice(start, start + maxRows);

  hits.push({
    x: chartX,
    y: chartY,
    w: chartW,
    h: chartH,
    action: 'hall-scroll-table',
    role: 'scrollable_table',
    maxRows,
    maxStart,
    rowH: rowHTable,
    scrollable: maxStart > 0,
  });

  visible.forEach((row, i) => {
    const y = bodyY + i * rowHTable;
    if (i % 2 === 0) {
      ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(chartX, y, chartW, rowHTable);
    }
    ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    columns.forEach((col) => {
      ctx.fillText(
        formatThermoRecordCell(expId, row, col.key, start + i),
        col.xPx,
        y + Math.round(6 * scale),
      );
    });
  });

  if (!records.length) {
    ctx.fillStyle = isLight ? '#64748b' : 'rgba(148, 163, 184, 0.75)';
    ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      canRecord ? '点「写入数据」添加第一行' : (blocked || '条件就绪后再写入'),
      chartX + chartW / 2,
      bodyY + bodyH / 2,
    );
    ctx.textAlign = 'left';
  }

  const footY = panelY + panelH - footerH + Math.round(4 * scale);
  const footGap = Math.round(6 * scale);
  const footBtns = [
    { label: canRecord ? '写入数据' : '不可写入', action: 'thermo-record', active: canRecord },
    { label: '清空', action: 'thermo-clear-records', active: false },
    { label: '关闭', action: 'thermo-records-panel', meta: { open: false }, active: false },
  ];
  const fbw = (panelW - pad * 2 - footGap * (footBtns.length - 1)) / footBtns.length;
  footBtns.forEach((b, i) => {
    drawPremiumHoloButton(
      ctx, hits,
      panelX + pad + i * (fbw + footGap), footY, fbw, Math.round(42 * scale),
      b.label, b.action, b.meta || {},
      accentHex, b.active, theme,
    );
  });
}

/** Source-faithful mechanics controls/readouts hosted on the holographic screen. */
function drawSourceMechanicsExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface } = cfg;
  _uiTheme = theme || 'dark';
  const data = hud?.data || {};
  const params = data.params || experiment.defaults || {};
  const P = screenPalette(_uiTheme, accentHex, surface === 'display');
  const scale = holoUiScale(surface || 'full');
  const gap = Math.round(7 * scale);
  const x = innerX;
  const w = innerW;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = accentHex;
  ctx.font = `bold ${Math.round(18 * scale)}px "Microsoft YaHei", sans-serif`;
  const theory = String(experiment.theory || '');
  ctx.fillText(theory.length > 72 ? `${theory.slice(0, 70)}…` : theory, x + 2, contentTop);

  let y = contentTop + Math.round(28 * scale);
  const readouts = Array.isArray(data.readouts) ? data.readouts.slice(0, 6) : [];
  const statH = Math.round((readouts.length > 3 ? 116 : 62) * scale);
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = P.panelStroke;
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, y, w, statH, 10);
  ctx.fill();
  ctx.stroke();
  const statCols = 3;
  const statRows = Math.max(1, Math.ceil(readouts.length / statCols));
  const statCellW = w / statCols;
  const statCellH = statH / statRows;
  readouts.forEach((item, index) => {
    const col = index % statCols;
    const row = Math.floor(index / statCols);
    const cx = x + col * statCellW + statCellW / 2;
    const cy = y + row * statCellH;
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(item.label || ''), cx, cy + Math.round(7 * scale));
    ctx.fillStyle = index === 0 ? accentHex : P.text;
    ctx.font = `bold ${Math.round(17 * scale)}px "Microsoft YaHei", sans-serif`;
    const value = String(item.value || '—');
    ctx.fillText(value.length > 24 ? `${value.slice(0, 22)}…` : value, cx, cy + Math.round(28 * scale));
  });
  if (!readouts.length) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(16 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('源仿真正在初始化…', x + w / 2, y + statH / 2 - 8);
  }
  ctx.textAlign = 'left';
  y += statH + gap;

  const controls = Array.isArray(experiment.controls) ? experiment.controls : [];
  const selects = controls.filter((control) => control.kind === 'select');
  const ranges = controls.filter((control) => control.kind !== 'select');
  const chipH = Math.round(42 * scale);
  selects.forEach((control) => {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(control.label, x + 2, y + Math.round(10 * scale));
    const labelW = Math.round(130 * scale);
    const options = control.options || [];
    const optionGap = Math.round(5 * scale);
    const optionW = (w - labelW - optionGap * Math.max(0, options.length - 1)) / Math.max(1, options.length);
    options.forEach((option, index) => {
      drawPremiumHoloButton(
        ctx, hits,
        x + labelW + index * (optionW + optionGap), y, optionW, chipH,
        option.label,
        'mechanics-source-select',
        { key: control.key, value: option.value },
        accentHex,
        params[control.key] === option.value,
        theme,
      );
    });
    y += chipH + gap;
  });

  const colGap = Math.round(7 * scale);
  const colW = (w - colGap) / 2;
  const sliderH = Math.round(48 * scale);
  const sliderGap = Math.round(4 * scale);
  if (ranges.length) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(13 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('连续参数在桌右侧滑条调节', x + 2, y);
    y += Math.round(20 * scale);
  }
  ranges.forEach((control, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const px = x + col * (colW + colGap);
    const py = y + row * (sliderH + sliderGap);
    ctx.fillStyle = P.panel;
    ctx.strokeStyle = P.panelStroke;
    roundRect(ctx, px, py, colW, sliderH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(control.label, px + Math.round(12 * scale), py + Math.round(10 * scale));
    ctx.fillStyle = P.text;
    ctx.font = `bold ${Math.round(20 * scale)}px "Microsoft YaHei", sans-serif`;
    const digits = control.digits ?? 2;
    const unit = control.unit || '';
    ctx.fillText(
      `${Number(params[control.key] ?? 0).toFixed(digits)}${unit ? ` ${unit}` : ''}`,
      px + Math.round(12 * scale),
      py + Math.round(28 * scale),
    );
  });
  y += Math.ceil(Math.max(ranges.length, 1) / 2) * (sliderH + sliderGap) + gap;
  y += Math.round(12 * scale);

  const footerH = Math.round(48 * scale);
  const footerY = contentTop + contentH - footerH;
  const actionGap = Math.round(6 * scale);
  const sourceActions = Array.isArray(experiment.actions) ? experiment.actions : [];
  if (sourceActions.length) {
    y = Math.min(y, footerY - chipH - gap);
    const actionW = (w - actionGap * (sourceActions.length - 1)) / sourceActions.length;
    sourceActions.forEach((item, index) => {
      drawPremiumHoloButton(
        ctx, hits,
        x + index * (actionW + actionGap), y, actionW, chipH,
        item.label,
        'mechanics-source-action',
        { id: item.id },
        accentHex,
        false,
        theme,
      );
    });
    y += chipH + gap;
  }

  const step = experiment.steps?.[hud?.stepIndex || 0];
  if (y < footerY - Math.round(20 * scale)) {
    ctx.fillStyle = P.muted;
    ctx.font = `bold ${Math.round(14 * scale)}px "Microsoft YaHei", sans-serif`;
    const hint = step?.hint || step?.text || '调节参数后观察源仿真读数';
    ctx.fillText(`步骤 ${(hud?.stepIndex || 0) + 1}/${experiment.steps?.length || 1} · ${hint}`, x + 2, y);
  }

  const footerGap = Math.round(8 * scale);
  const footerW = (w - footerGap) / 2;
  drawPremiumHoloButton(
    ctx, hits, x, footerY, footerW, footerH,
    data.paused ? '继续仿真' : '暂停仿真',
    'mechanics-source-pause', {}, accentHex, !!data.paused, theme,
  );
  drawPremiumHoloButton(
    ctx, hits, x + footerW + footerGap, footerY, footerW, footerH,
    '重置实验', 'mechanics-source-reset', {}, accentHex, false, theme,
  );
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
      // Electromagnetism content panels: keep shorter so the bench stays visible.
      hall_carrier_demo: 760,
      hall_effect: 880,
      gauss_theorem: 880,
      electric_field: 920,
      faraday_induction: 780,
      induced_electric_field: 820,
      multi_slit_diffraction: 1040,
      reflection: 980,
      refraction: 1000,
      dispersion: 960,
      lens: 940,
      calorimetry: 880,
      convection: 840,
      'heat-conduction': 840,
      'ideal-gas': 800,
      'thermal-expansion': 880,
      'free-fall': 940,
      'inclined-plane': 900,
      pendulum: 940,
      collision: 1020,
      projectile: 1020,
      viscosity: 1120,
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
    hall_carrier_demo: 540,
    hall_effect: 600,
    gauss_theorem: 600,
    electric_field: 620,
    faraday_induction: 580,
    induced_electric_field: 600,
    multi_slit_diffraction: 720,
    reflection: 700,
    refraction: 720,
    dispersion: 700,
    lens: 680,
    calorimetry: 640,
    convection: 600,
    'heat-conduction': 600,
    'ideal-gas': 560,
    'thermal-expansion': 620,
    'free-fall': 660,
    'inclined-plane': 640,
    pendulum: 660,
    collision: 700,
    projectile: 700,
    viscosity: 960,
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
  // Keep the layout scale available to the compact content-display chrome.
  // The display path evaluates this value before entering each experiment
  // drawer; leaving it undefined makes the whole canvas draw abort with a
  // ReferenceError while the glass shell remains visible.
  const scale = scaleF;
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
    theory: Math.round(36 * scaleF),
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

  // Content display with a running experiment: no station header bar — experiment UI owns the title.
  const compactChrome = isDisplay && active && !!(hud?.running && hud?.experiment);
  const headerH = compactChrome ? 0 : (isDisplay ? 96 : 64);

  if (!compactChrome) {
    if (isDisplay && active) {
      ctx.font = `bold ${isDisplay ? 22 : 12}px "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = theme === 'light' ? '#0369a1' : 'rgba(56, 189, 248, 0.65)';
      ctx.textAlign = 'left';
      ctx.fillText('// ' + (hud?.experiment?.name || 'EXPERIMENT') + '.HUD • OPTICAL', 38, 26);
      ctx.textAlign = 'right';
      ctx.fillText('[ONLINE • STREAM OK]', W - 38, 26);
      ctx.textAlign = 'left';
    }

    // Header Bar (Sci-Fi Cyber Header) — menu / idle surfaces only
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
    const headerTag = isDisplay ? `[ ${hud?.experiment?.name || 'EXPERIMENT'} • HUD ]` : `HOLO // ${enTitle}`;
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
  }

  // window chrome: maximize + close (active only; floating when compact)
  if (active) {
    const cy = compactChrome ? (innerY + 4) : (innerY + (isDisplay ? 18 : 12));
    const cw = compactChrome ? 44 : (isDisplay ? 68 : 48);
    const ch = compactChrome ? 40 : (isDisplay ? 60 : 40);
    const gap = compactChrome ? 8 : 10;
    const closeX = innerX + innerW - cw - (compactChrome ? 6 : 12);
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
        ctx.strokeRect(maxX + cw * 0.22, cy + ch * 0.28, cw * 0.28, ch * 0.32);
        ctx.strokeRect(maxX + cw * 0.34, cy + ch * 0.2, cw * 0.28, ch * 0.32);
      } else {
        ctx.strokeRect(maxX + cw * 0.28, cy + ch * 0.26, cw * 0.36, ch * 0.4);
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
    ctx.font = `bold ${compactChrome ? 28 : (isDisplay ? 48 : 32)}px sans-serif`;
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

    // Full-panel hit so UV pickers (and tests) can activate the idle terminal.
    // Runtime also treats any idle-screen UV as action:'activate'.
    hits.push({
      x: 0,
      y: 0,
      w: W,
      h: H,
      action: 'activate',
      role: 'holo_activate',
      chrome: false,
    });
    return { hits };
  }

  // ── Active menu / experiment ──
  const station = hud?.station;
  const experiment = hud?.experiment;
  const running = !!(hud?.running && experiment);
  // Compact display: reserve top margin for window controls (close / maximize)
  const contentTop = compactChrome ? (innerY + Math.round(20 * scale)) : (innerY + headerH + 12);
  const contentH = compactChrome ? (innerH - Math.round(24 * scale)) : (innerH - headerH - 16);

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
    let y = contentTop + (running && isSelector ? 72 : 24);
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
    if (experiment.id === 'induced_electric_field') {
      drawInducedElectricExperiment(ctx, W, H, {
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
    if (isGeometricOpticsExp(experiment.id)) {
      drawGeometricOpticsExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (['calorimetry', 'convection', 'heat-conduction', 'ideal-gas', 'thermal-expansion'].includes(experiment.id)) {
      drawThermoExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }
    if (['free-fall', 'inclined-plane', 'pendulum', 'collision', 'projectile', 'viscosity'].includes(experiment.id)) {
      drawSourceMechanicsExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex, theme, surface,
      });
      return { hits };
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = contentTop;
    const theoryH = 68;
    ctx.fillStyle = P.theoryBg;
    roundRect(ctx, innerX, y, innerW, theoryH, 8);
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.font = `${F.theory}px "Microsoft YaHei", sans-serif`;
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
      ctx.font = `${F.data}px "Microsoft YaHei", sans-serif`;
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

  const facingSide = Number.isFinite(_facingSide) ? _facingSide : 1;
  const candidates = facingSide < 0
    ? [[(1 - u) * W, (1 - v) * H], [u * W, (1 - v) * H]]
    : [[u * W, (1 - v) * H], [(1 - u) * W, (1 - v) * H]];

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

/** Map a faraday-b-slider hit (desk value or canvas px) to B ∈ [min, max]. */
export function faradayBFromSliderPick(pick) {
  if (!pick || pick.action !== 'faraday-b-slider') return null;
  const min = Number(pick.min ?? -3);
  const max = Number(pick.max ?? 3);
  if (Number.isFinite(pick.value)) {
    return Math.max(min, Math.min(max, Number(pick.value)));
  }
  if (!Number.isFinite(pick.px)) return null;
  const trackX = Number.isFinite(pick.trackX) ? Number(pick.trackX) : Number(pick.x || 0);
  const trackW = Math.max(1, Number.isFinite(pick.trackW) ? Number(pick.trackW) : Number(pick.w || 1));
  const u = Math.max(0, Math.min(1, (Number(pick.px) - trackX) / trackW));
  return min + u * (max - min);
}

/**
 * Map an induced-e / param slider hit (with optional px) → { key, value }.
 * Prefer trackX/trackW when present so padded hit boxes stay accurate.
 */
export function inducedEFromSliderPick(pick) {
  if (!pick || (pick.action !== 'induced-e-slider' && !(pick.action === 'param-slider' && pick.setAction === 'induced-e-set'))) {
    return null;
  }
  if (!pick.key) return null;
  const value = valueFromParamSliderPick(pick);
  if (!Number.isFinite(value)) return null;
  return { key: pick.key, value };
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
