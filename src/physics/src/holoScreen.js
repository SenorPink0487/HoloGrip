
/**
 * Draw interactive experiment UI onto hologram canvas textures
 * and resolve UV picks like a flat computer screen.
 */

import { diffractionHalfSpan, diffractionIntensity } from './experiments/optics.js';

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

function drawHallButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false) {
  ctx.fillStyle = active ? `${accent}55` : 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = active ? accent : 'rgba(148, 163, 184, 0.38)';
  ctx.lineWidth = active ? 2.2 : 1.4;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? '#ffffff' : '#dbeafe';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 按按钮宽度收缩字号，避免长中文撑破按钮
  let fontSize = Math.max(13, Math.min(27, h * 0.42));
  const text = String(label || '');
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
  while (fontSize > 12 && ctx.measureText(text).width > w - 12) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`;
  }
  ctx.fillText(text, x + w / 2, y + h / 2);
  hits.push({ x, y, w, h, action, ...meta });
}

function drawHallExperiment(ctx, W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  const d = hud?.data || {};
  const target = d.target === 'solenoid' ? 'solenoid' : 'helmholtz';
  const records = Array.isArray(d.records) ? d.records : [];
  const stepIndex = Number(hud?.stepIndex || 0);
  const identified = d.identified || {};
  const identifyRoles = ['hall_helmholtz', 'hall_solenoid', 'hall_probe', 'hall_console'];
  const allIdentified = identifyRoles.every((role) => identified[role]);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
  ctx.fillText(experiment.name, innerX + 4, contentTop);
  ctx.fillStyle = 'rgba(186, 230, 253, 0.82)';
  ctx.font = '22px "Microsoft YaHei", sans-serif';
  const totalSteps = experiment.steps?.length || 6;
  ctx.fillText(`步骤 ${Math.min(stepIndex + 1, totalSteps)}/${totalSteps} · ${experiment.steps?.[stepIndex]?.text || '自由测量'}`, innerX + 270, contentTop + 8);

  if (stepIndex === 0 && !allIdentified) {
    const panelY = contentTop + 52;
    const panelH = contentH - 56;
    ctx.fillStyle = 'rgba(2, 12, 27, 0.72)';
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.38)';
    ctx.lineWidth = 1.6;
    roundRect(ctx, innerX, panelY, innerW, panelH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f9a8d4';
    ctx.font = 'bold 25px "Microsoft YaHei", sans-serif';
    ctx.fillText('实验器材识别', innerX + 18, panelY + 16);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.86)';
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('回到 3D 实验台，用准星逐件瞄准实物并按 E 确认。', innerX + 180, panelY + 20);

    const items = [
      { role: 'hall_helmholtz', n: '01', name: '亥姆霍兹线圈', desc: '一对同轴圆线圈，在中心区域产生近似均匀磁场。' },
      { role: 'hall_solenoid', n: '02', name: '长螺线管', desc: '通电后内部形成轴向磁场，用于测量 B–X 分布。' },
      { role: 'hall_probe', n: '03', name: '霍尔探头与标尺', desc: '沿线圈轴线移动，将局部磁场转换为霍尔电压。' },
      { role: 'hall_console', n: '04', name: 'HCC-2 测磁仪面板', desc: '绿色框内含三组接线柱、Im/Is/VH 数码屏及其调节旋钮。' },
    ];
    const gap = 14;
    const cardW = (innerW - gap - 32) / 2;
    const cardH = Math.min(112, (panelH - 150) / 2);
    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = innerX + 16 + col * (cardW + gap);
      const y = panelY + 58 + row * (cardH + gap);
      const done = !!identified[item.role];
      ctx.fillStyle = done ? 'rgba(34, 197, 94, 0.13)' : 'rgba(14, 165, 233, 0.09)';
      ctx.strokeStyle = done ? 'rgba(74, 222, 128, 0.72)' : 'rgba(125, 211, 252, 0.28)';
      roundRect(ctx, x, y, cardW, cardH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = done ? '#4ade80' : accentHex;
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText(done ? '✓' : item.n, x + 14, y + 14);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
      ctx.fillText(item.name, x + 56, y + 12);
      ctx.fillStyle = 'rgba(186, 230, 253, 0.84)';
      ctx.font = '19px "Microsoft YaHei", sans-serif';
      wrapText(ctx, item.desc, cardW - 28).slice(0, 2).forEach((line, li) => {
        ctx.fillText(line, x + 14, y + 52 + li * 26);
      });
    });
    drawHallButton(
      ctx, hits, innerX + innerW * 0.27, panelY + panelH - 62,
      innerW * 0.46, 48, '辅助识别下一件', 'hall-identify', {}, accentHex, true,
    );
    return;
  }

  const targetY = contentTop + 48;
  const targetH = 58;
  const targetGap = 12;
  const targetW = (innerW - targetGap) / 2;
  drawHallButton(ctx, hits, innerX, targetY, targetW, targetH, '◉ 亥姆霍兹线圈', 'hall-target', { target: 'helmholtz' }, accentHex, target === 'helmholtz');
  drawHallButton(ctx, hits, innerX + targetW + targetGap, targetY, targetW, targetH, '▰ 长螺线管', 'hall-target', { target: 'solenoid' }, accentHex, target === 'solenoid');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const bodyY = targetY + targetH + 12;
  const bottomH = 60;
  const bodyH = contentTop + contentH - bodyY - bottomH - 10;
  const colGap = 14;
  const leftW = innerW * 0.47;
  const rightX = innerX + leftW + colGap;
  const rightW = innerW - leftW - colGap;

  ctx.fillStyle = 'rgba(2, 12, 27, 0.64)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, innerX, bodyY, leftW, bodyH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText('实验参数控制', innerX + 16, bodyY + 14);

  const params = [
    { key: 'Im', label: '励磁电流 Im', value: Number(d.Im || 0), unit: 'A', step: 0.05, digits: 2 },
    { key: 'Is', label: '霍尔电流 Is', value: Number(d.Is || 0), unit: 'mA', step: 0.5, digits: 1 },
    { key: 'probePos', label: '探头位置 X', value: Number(d.probePos || 0), unit: 'cm', step: 1, digits: 1 },
    target === 'helmholtz'
      ? { key: 'rightCoilPos', label: '右线圈位置', value: Number(d.rightCoilPos || 0), unit: 'cm', step: 0.5, digits: 1 }
      : { key: 'turns', label: '螺线管匝数 N', value: Number(d.turns || 0), unit: '匝', step: 10, digits: 0 },
  ];
  const rowY0 = bodyY + 48;
  const rowH = Math.min(68, (bodyH - 58) / 4);
  params.forEach((p, i) => {
    const y = rowY0 + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.beginPath(); ctx.moveTo(innerX + 14, y); ctx.lineTo(innerX + leftW - 14, y); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '21px "Microsoft YaHei", sans-serif';
    ctx.fillText(p.label, innerX + 16, y + 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 25px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${p.value.toFixed(p.digits)} ${p.unit}`, innerX + leftW - 94, y + 16);
    ctx.textAlign = 'left';
    drawHallButton(ctx, hits, innerX + leftW - 86, y + 8, 34, 42, '−', 'hall-adjust', { key: p.key, delta: -p.step }, accentHex);
    drawHallButton(ctx, hits, innerX + leftW - 44, y + 8, 34, 42, '+', 'hall-adjust', { key: p.key, delta: p.step }, accentHex);
  });

  // Right side: recorded groups by default; curve is generated on demand.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(2, 12, 27, 0.64)';
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.32)';
  roundRect(ctx, rightX, bodyY, rightW, bodyH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f9a8d4';
  ctx.font = 'bold 21px "Microsoft YaHei", sans-serif';
  ctx.fillText(d.showCurve ? 'B–X 磁场分布' : '实验数据记录', rightX + 16, bodyY + 14);
  ctx.fillStyle = '#fff1f2';
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 8;
  ctx.font = 'bold 28px Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${Number(d.vh || 0).toFixed(2)} mV`, rightX + rightW - 16, bodyY + 12);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  const chartX = rightX + 18;
  const chartY = bodyY + 54;
  const chartW = rightW - 36;
  const chartH = Math.max(110, bodyH - 104);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
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

    const plotL = chartX + 58;
    const plotR = chartX + chartW - 14;
    const plotT = chartY + 27;
    const plotB = chartY + chartH - 34;
    const px = (x) => plotL + ((x - xMin) / (xMax - xMin)) * (plotR - plotL);
    const py = (b) => plotB - ((b - yMin) / Math.max(1e-9, yMax - yMin)) * (plotB - plotT);

    // Grid and numeric axes for the physically meaningful B=f(x) relation.
    ctx.lineWidth = 1;
    ctx.font = '13px Consolas, monospace';
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const gx = plotL + (plotR - plotL) * t;
      const gy = plotB - (plotB - plotT) * t;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath(); ctx.moveTo(gx, plotT); ctx.lineTo(gx, plotB); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotR, gy); ctx.stroke();
      ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
      ctx.textAlign = 'center';
      ctx.fillText((xMin + (xMax - xMin) * t).toFixed(1), gx, plotB + 7);
      ctx.textAlign = 'right';
      ctx.fillText((yMin + (yMax - yMin) * t).toFixed(2), plotL - 7, gy - 7);
    }
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(plotL, plotT); ctx.lineTo(plotL, plotB); ctx.lineTo(plotR, plotB); ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('B / mT', chartX + 5, chartY + 7);
    ctx.textAlign = 'right';
    ctx.fillText('X / cm', plotR, plotB + 20);

    // Theoretical distribution: directly sampled from the physical formula,
    // never interpolated through the measurements.
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    theory.forEach((p, i) => {
      if (i === 0) ctx.moveTo(px(p.x), py(p.b));
      else ctx.lineTo(px(p.x), py(p.b));
    });
    ctx.stroke();

    // Measurements are independent points, matching the lecture's manual plot method.
    measured.forEach((p) => {
      if (p.x < xMin || p.x > xMax) return;
      ctx.fillStyle = '#fdf2f8';
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(p.x), py(p.b), 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    const condition = target === 'solenoid'
      ? `L=26cm  N=${Number(d.turns || 100)}`
      : (() => {
        const separation = Number(d.rightCoilPos ?? 2.5) + 2.5;
        return `间距 d=${separation.toFixed(1)}cm ${Math.abs(separation - 5) < 1e-6 ? '=R' : separation > 5 ? '>R' : '<R'}`;
      })();
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText(`— 理论线　${condition}`, plotR, chartY + 5);
    ctx.fillStyle = '#f9a8d4';
    ctx.fillText(`● 实测点 ${shown.length} 组`, plotR, chartY + 20);
    ctx.textAlign = 'left';
  } else {
    const cols = [
      { label: '#', x: 0.03 }, { label: '对象', x: 0.11 }, { label: 'X/cm', x: 0.29 },
      { label: 'VH/mV', x: 0.43 }, { label: 'B/mT', x: 0.62 }, { label: 'Im/Is', x: 0.80 },
    ];
    ctx.fillStyle = 'rgba(244, 114, 182, 0.12)';
    ctx.fillRect(chartX, chartY, chartW, 34);
    ctx.fillStyle = '#f9a8d4';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    cols.forEach((col) => ctx.fillText(col.label, chartX + chartW * col.x, chartY + 8));
    const rowH = 30;
    const maxRows = Math.max(1, Math.floor((chartH - 40) / rowH));
    const start = Math.max(0, records.length - maxRows);
    const visibleRows = records.slice(start);
    visibleRows.forEach((r, i) => {
      const y = chartY + 36 + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
        ctx.fillRect(chartX, y, chartW, rowH);
      }
      ctx.fillStyle = '#dbeafe';
      ctx.font = '15px Consolas, "Microsoft YaHei", monospace';
      const values = [
        String(start + i + 1), r.target === 'solenoid' ? '螺线管' : '亥姆',
        Number(r.pos || 0).toFixed(1), Number(r.vh || 0).toFixed(2),
        hallRecordedB(r).toFixed(3), `${Number(r.Im || 0).toFixed(2)}/${Number(r.Is || 0).toFixed(1)}`,
      ];
      cols.forEach((col, ci) => ctx.fillText(values[ci], chartX + chartW * col.x, y + 7));
    });
    if (!records.length) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.font = '19px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('点击「记录当前读数」添加第一组数据', chartX + chartW / 2, chartY + chartH / 2);
      ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '16px "Microsoft YaHei", sans-serif';
  const wiringText = d.wiring?.energized
    ? `${d.wiring.label} · ${d.wiring.reversed ? '反接' : '正接'}`
    : d.wiring?.status === 'invalid' ? '接线无效/未闭合' : 'Im 输出未接线';
  ctx.fillText(`共 ${records.length} 组 · K=${HALL_K} mV·mA⁻¹·T⁻¹ · ${wiringText}`, rightX + 18, bodyY + bodyH - 24);

  const btnY = bodyY + bodyH + 8;
  const btnGap = 10;
  const labels = [
    { label: '↔ 交换红黑接线', action: 'hall-direction' },
    { label: '记录当前读数', action: 'hall-record', active: true },
    { label: d.showCurve ? '返回记录' : '生成曲线', action: 'hall-chart' },
    { label: '清空', action: 'hall-clear' },
    { label: d.completed ? '实验已完成' : '完成实验', action: 'hall-complete' },
  ];
  const bw = (innerW - btnGap * (labels.length - 1)) / labels.length;
  labels.forEach((b, i) => drawHallButton(ctx, hits, innerX + i * (bw + btnGap), btnY, bw, 52, b.label, b.action, {}, accentHex, b.active));
}

// ── Optics experiment screens ──────────────────────────────────────
// 设计原则：
// 1) 字号够大（全息/全屏可读）  2) 按步骤渐进展示，不堆满  3) 用布局计算而非 clip 裁切

function drawHallDemoExperiment(ctx, _W, _H, cfg) {
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  const d = hud?.data || {};
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
  ctx.fillText(experiment.name, innerX + 4, contentTop);
  ctx.fillStyle = 'rgba(186, 230, 253, 0.82)';
  ctx.font = '20px "Microsoft YaHei", sans-serif';
  ctx.fillText('自由观察 · 演示数值为相对量', innerX + 390, contentTop + 10);

  const formulaY = contentTop + 54;
  const formulaH = 82;
  ctx.fillStyle = 'rgba(2, 12, 27, 0.72)';
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.38)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, innerX, formulaY, innerW, formulaH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f9a8d4';
  ctx.font = 'bold 31px Consolas, monospace';
  ctx.fillText('Vₕ ∝ I · B / (n · d)', innerX + 24, formulaY + 21);
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'right';
  ctx.font = 'bold 32px Consolas, monospace';
  ctx.fillText(`Vₕ = ${Number(d.vh || 0).toFixed(3)} rel.`, innerX + innerW - 24, formulaY + 20);
  ctx.textAlign = 'left';

  const bodyY = formulaY + formulaH + 14;
  const footerH = 122;
  const bodyH = contentTop + contentH - bodyY - footerH;
  const gap = 16;
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
  ctx.font = 'bold 23px "Microsoft YaHei", sans-serif';
  ctx.fillText('动效参数', innerX + 18, bodyY + 14);
  const params = [
    { key: 'I', label: '电流 I', value: Number(d.I || 0), range: '0.00 — 2.00', step: 0.1 },
    { key: 'B', label: '磁场 B', value: Number(d.B || 0), range: '−2.00 — 2.00', step: 0.1 },
    { key: 'n', label: '载流子浓度 n', value: Number(d.n || 0), range: '0.30 — 2.50', step: 0.1 },
    { key: 'd', label: '样品厚度 d', value: Number(d.d || 0), range: '0.10 — 1.20', step: 0.05 },
  ];
  const rowY = bodyY + 50;
  const rowH = Math.max(64, (bodyH - 62) / params.length);
  params.forEach((p, i) => {
    const y = rowY + i * rowH;
    if (i) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.beginPath(); ctx.moveTo(innerX + 16, y); ctx.lineTo(innerX + leftW - 16, y); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '21px "Microsoft YaHei", sans-serif';
    ctx.fillText(p.label, innerX + 18, y + 13);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '15px Consolas, monospace';
    ctx.fillText(p.range, innerX + 18, y + 42);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = 'bold 27px Consolas, monospace';
    ctx.fillText(p.value.toFixed(2), innerX + leftW - 112, y + 18);
    ctx.textAlign = 'left';
    drawHallButton(ctx, hits, innerX + leftW - 100, y + 11, 40, 44, '−', 'hall-demo-adjust', { key: p.key, delta: -p.step }, accentHex);
    drawHallButton(ctx, hits, innerX + leftW - 52, y + 11, 40, 44, '+', 'hall-demo-adjust', { key: p.key, delta: p.step }, accentHex);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f9a8d4';
  ctx.font = 'bold 23px "Microsoft YaHei", sans-serif';
  ctx.fillText('当前状态', rightX + 18, bodyY + 14);
  const metrics = [
    ['载流子', d.nType ? 'n 型 · 电子 e⁻' : 'p 型 · 空穴 h⁺'],
    ['霍尔极性', Math.abs(Number(d.vh || 0)) < 0.005 ? '—' : Number(d.vh) < 0 ? '负极性' : '正极性'],
    ['|I · B|', Number(d.force || 0).toFixed(3)],
    ['动效', d.paused ? '已暂停' : '运行中'],
  ];
  metrics.forEach(([label, value], i) => {
    const y = bodyY + 58 + i * 62;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(label, rightX + 20, y);
    ctx.fillStyle = i === 1 ? '#f9a8d4' : '#f8fafc';
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(value, rightX + rightW - 20, y - 2);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = 'rgba(186, 230, 253, 0.78)';
  ctx.font = '17px "Microsoft YaHei", sans-serif';
  wrapText(ctx, '粒子流向表示载流子漂移；横向偏转随 I、B 增强，并随 n、d 增大而减弱。', rightW - 38)
    .slice(0, 3).forEach((line, i) => ctx.fillText(line, rightX + 20, bodyY + bodyH - 74 + i * 23));

  const buttonY1 = bodyY + bodyH + 10;
  const bw1 = (innerW - 12) / 2;
  drawHallButton(ctx, hits, innerX, buttonY1, bw1, 48, 'n 型 · 电子', 'hall-demo-type', { nType: true }, accentHex, d.nType !== false);
  drawHallButton(ctx, hits, innerX + bw1 + 12, buttonY1, bw1, 48, 'p 型 · 空穴', 'hall-demo-type', { nType: false }, accentHex, d.nType === false);
  const buttonY2 = buttonY1 + 58;
  const actions = [
    { label: '反转 B', action: 'hall-demo-flip' },
    { label: d.paused ? '继续动效' : '暂停动效', action: 'hall-demo-pause', active: d.paused },
    { label: d.showB === false ? '显示 B' : '隐藏 B', action: 'hall-demo-field', active: d.showB === false },
    { label: d.autoCam ? '停止旋转' : '自动旋转', action: 'hall-demo-auto', active: d.autoCam },
    { label: '重置', action: 'hall-demo-reset' },
  ];
  const actionGap = 10;
  const actionW = (innerW - actionGap * (actions.length - 1)) / actions.length;
  actions.forEach((button, i) => drawHallButton(
    ctx, hits, innerX + i * (actionW + actionGap), buttonY2, actionW, 48,
    button.label, button.action, {}, accentHex, button.active,
  ));
}

function drawOptButton(ctx, hits, x, y, w, h, label, action, meta, accent, active = false) {
  ctx.fillStyle = active ? `${accent}55` : 'rgba(15, 23, 42, 0.78)';
  ctx.strokeStyle = active ? accent : 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = active ? 2.4 : 1.5;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? '#ffffff' : '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = Math.min(26, Math.max(16, Math.floor(h * 0.4)));
  const text = String(label || '');
  ctx.font = `bold ${fs}px "Microsoft YaHei", sans-serif`;
  while (fs > 14 && ctx.measureText(text).width > w - 16) {
    fs -= 1;
    ctx.font = `bold ${fs}px "Microsoft YaHei", sans-serif`;
  }
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  hits.push({ x, y, w, h, action, ...meta });
}

function drawOptPanel(ctx, x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(2, 12, 27, 0.78)';
  ctx.strokeStyle = `${accent}55`;
  ctx.lineWidth = 1.6;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

function drawOptHeader(ctx, experiment, step, stepIndex, stepsLen, innerX, contentTop, innerW) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
  ctx.fillText(experiment.name, innerX, contentTop);

  ctx.fillStyle = 'rgba(253, 230, 138, 0.95)';
  ctx.font = '22px "Microsoft YaHei", sans-serif';
  const stepLine = `步骤 ${stepIndex + 1}/${stepsLen}  ·  ${step?.text || ''}`;
  const lines = wrapText(ctx, stepLine, innerW - 4).slice(0, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, innerX, contentTop + 42 + i * 28));
  return 42 + lines.length * 28 + 14;
}

function drawOptFooter(ctx, hits, buttons, innerX, btnY, innerW, accentHex) {
  const gap = 12;
  const n = buttons.length;
  const bw = (innerW - gap * (n - 1)) / n;
  buttons.forEach((b, i) => {
    drawOptButton(
      ctx, hits, innerX + i * (bw + gap), btnY, bw, 56,
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
  const { hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex } = cfg;
  const d = hud?.data || {};
  const steps = experiment.steps || [];
  const stepIndex = Number(hud?.stepIndex || 0);
  const step = steps[stepIndex] || {};
  const footerH = 68;
  const headerH = drawOptHeader(ctx, experiment, step, stepIndex, steps.length, innerX, contentTop, innerW);
  const bodyTop = contentTop + headerH;
  const bodyH = Math.max(300, contentH - headerH - footerH);
  const gap = 14;
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
  const pad = 16;
  let y = bodyTop + pad;
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText('实验预设', innerX + pad, y);
  y += 32;
  const presetGap = 7;
  const presetW = (leftW - pad * 2 - presetGap * 2) / 3;
  presets.forEach(([label, preset], i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    drawOptButton(
      ctx, hits,
      innerX + pad + col * (presetW + presetGap), y + row * 46,
      presetW, 39, label, 'optics-diff-preset', { preset }, accentHex, d.preset === preset,
    );
  });
  y += 100;

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
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText(label, innerX + pad, y + 12);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 21px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Number(value).toFixed(digits)} ${unit}`, innerX + leftW - 132, y + 12);
    ctx.textAlign = 'left';
    drawOptButton(ctx, hits, innerX + leftW - 118, y, 48, 42, '−', 'optics-diff-param', { key, delta: -delta }, accentHex);
    drawOptButton(ctx, hits, innerX + leftW - 62, y, 48, 42, '+', 'optics-diff-param', { key, delta }, accentHex);
    y += 54;
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = d.farField ? '#4ade80' : '#fb7185';
  ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
  ctx.fillText(d.farField ? '✓ Fraunhofer 远场近似可用' : '△ 菲涅耳数偏大，近场效应显著', innerX + pad, y + 4);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px Consolas, monospace';
  ctx.fillText(`F=${Number(d.fresnel || 0).toExponential(2)}`, innerX + pad, y + 34);
  drawOptButton(ctx, hits, innerX + leftW - 238, y, 72, 42, '光锥', 'optics-diff-toggle', { key: 'showBeam' }, accentHex, d.showBeam !== false);
  drawOptButton(ctx, hits, innerX + leftW - 158, y, 72, 42, '波前', 'optics-diff-toggle', { key: 'showWave' }, accentHex, d.showWave !== false);
  drawOptButton(ctx, hits, innerX + leftW - 78, y, 64, 42, d.demoOn ? '停止' : '扫频', 'optics-diff-demo', {}, accentHex, d.demoOn);

  // Right: theoretical curve, stripe preview, derived values, and records.
  const rx = rightX + pad;
  const rw = rightW - pad * 2;
  const plotTop = bodyTop + pad + 22;
  const plotH = Math.min(250, bodyH * 0.38);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#bae6fd';
  ctx.font = 'bold 21px "Microsoft YaHei", sans-serif';
  ctx.fillText('Fraunhofer 理论强度  I(x)/I₀', rx, bodyTop + pad);
  ctx.fillStyle = '#050914';
  ctx.strokeStyle = 'rgba(56,189,248,0.38)';
  ctx.lineWidth = 1.4;
  roundRect(ctx, rx, plotTop, rw, plotH, 8);
  ctx.fill();
  ctx.stroke();
  const px0 = rx + 42;
  const py0 = plotTop + 14;
  const pw = rw - 56;
  const ph = plotH - 42;
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
  ctx.font = '15px Consolas, monospace';
  ctx.fillText(`${(-half * 1e3).toFixed(1)} mm`, px0, plotTop + plotH - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`${(half * 1e3).toFixed(1)} mm`, px0 + pw, plotTop + plotH - 20);
  ctx.textAlign = 'left';

  const stripeY = plotTop + plotH + 10;
  const stripeH = 54;
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

  const metricY = stripeY + stripeH + 14;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '19px Consolas, monospace';
  ctx.fillText(`Δx≈${Number(d.fringeSpacingMm || 0).toFixed(3)} mm`, rx, metricY);
  ctx.fillText(`中央包络全宽≈${Number(d.centralWidthMm || 0).toFixed(3)} mm`, rx + rw * 0.42, metricY);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '17px "Microsoft YaHei", sans-serif';
  ctx.fillText('理论线为方程密集采样；记录保存当前完整配置', rx, metricY + 30);

  const records = Array.isArray(d.records) ? d.records : [];
  const tableY = metricY + 62;
  ctx.fillStyle = '#bae6fd';
  ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
  ctx.fillText(`测量记录（${records.length} 组）`, rx, tableY);
  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  roundRect(ctx, rx, tableY + 28, rw, Math.max(70, bodyTop + bodyH - (tableY + 38)), 8);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px Consolas, monospace';
  ctx.fillText('#   λ/nm   N   a/mm   d/mm   L/m   Δx/mm', rx + 10, tableY + 38);
  const recent = records.slice(-4);
  recent.forEach((r, i) => {
    ctx.fillStyle = i === recent.length - 1 ? '#f8fafc' : '#cbd5e1';
    const index = records.length - recent.length + i + 1;
    ctx.fillText(
      `${String(index).padStart(2)}  ${Number(r.lambdaNm).toFixed(0).padStart(4)}   ${String(r.N).padStart(2)}  ${Number(r.slitMm).toFixed(3)}  ${Number(r.pitchMm).toFixed(3)}  ${Number(r.distM).toFixed(2)}  ${Number(r.fringeSpacingMm).toFixed(3)}`,
      rx + 10, tableY + 63 + i * 24,
    );
  });
  if (!records.length) {
    ctx.fillStyle = '#64748b';
    ctx.fillText('尚无记录 · 调整参数后点击“记录本组”', rx + 10, tableY + 68);
  }

  drawOptFooter(ctx, hits, [
    { label: d.lightOn ? '关闭激光' : '打开激光', action: 'optics-diff-power', active: !d.lightOn },
    { label: '记录本组', action: 'optics-diff-record' },
    { label: d.chartOpen ? '曲线已核对' : '核对理论曲线', action: 'optics-diff-chart', active: d.chartOpen },
    { label: '清空记录', action: 'optics-diff-clear' },
    { label: d.completed ? '实验已完成' : '完成实验', action: 'optics-diff-complete', active: d.completed },
  ], innerX, bodyTop + bodyH + 8, innerW, accentHex);
}

/**
 * Return the logical canvas size required by the current hologram UI.
 * Dense experiment screens grow vertically instead of squeezing their rows,
 * while station menus grow with the number of experiment cards.
 */
export function getHoloScreenLayoutSize(opts = {}) {
  const { active = false, hud = null } = opts;
  const width = 1024;
  if (!active) return { width, height: 640 };

  const experiment = hud?.experiment;
  const running = !!(hud?.running && experiment);
  if (!running) {
    const cardCount = hud?.station?.experiments?.length || 0;
    const menuHeight = 194 + cardCount * 120 + Math.max(0, cardCount - 1) * 14;
    return { width, height: Math.max(640, menuHeight) };
  }

  const denseExperimentHeights = {
    hall_carrier_demo: 752,
    hall_effect: 720,
    multi_slit_diffraction: 720,
  };
  const denseHeight = denseExperimentHeights[experiment.id];
  if (denseHeight) return { width, height: denseHeight };

  const stepCount = experiment.steps?.length || 0;
  const dataLines = String(opts.dataHtml || '').split(/<br\s*\/?\s*>|\n/i).filter(Boolean).length;
  const contentHeight = 300 + stepCount * 54 + Math.min(dataLines, 6) * 30;
  return { width, height: Math.max(640, Math.min(800, contentHeight)) };
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
  } = opts;

  const hits = [];
  const pad = 28;
  const innerX = pad;
  const innerY = pad;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  // Shared type scale (large for readability on 3D hologram / fullscreen)
  const F = {
    headerMeta: 26,
    headerTitle: 38,
    idleTitle: 72,
    idleSub: 30,
    idleCta: 38,
    idleHint: 26,
    listHint: 26,
    cardNum: 24,
    cardName: 36,
    cardGoal: 26,
    expName: 38,
    theory: 24,
    section: 24,
    step: 26,
    stepActive: 28,
    hint: 24,
    data: 24,
    btn: 26,
    close: 36,
  };

  ctx.clearRect(0, 0, W, H);

  // glass body
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (active) {
    bg.addColorStop(0, 'rgba(6, 40, 64, 0.92)');
    bg.addColorStop(0.45, 'rgba(8, 55, 88, 0.9)');
    bg.addColorStop(1, 'rgba(6, 32, 54, 0.94)');
  } else {
    bg.addColorStop(0, 'rgba(15, 23, 42, 0.78)');
    bg.addColorStop(0.5, 'rgba(30, 58, 95, 0.72)');
    bg.addColorStop(1, 'rgba(15, 23, 42, 0.82)');
  }
  ctx.fillStyle = bg;
  roundRect(ctx, 12, 12, W - 24, H - 24, 20);
  ctx.fill();

  // frame
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.globalAlpha = active ? 0.95 : 0.65;
  roundRect(ctx, 16, 16, W - 32, H - 32, 16);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // corner brackets
  ctx.lineWidth = 4;
  ctx.strokeStyle = accentHex;
  const br = 28;
  [[32, 32], [W - 32, 32], [32, H - 32], [W - 32, H - 32]].forEach(([x, y], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x + sx * br, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * br);
    ctx.stroke();
  });

  // header bar (taller for larger type)
  const headerH = 70;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, innerX, innerY, innerW, headerH, 10);
  ctx.fill();

  ctx.fillStyle = accentHex;
  ctx.font = `bold ${F.headerMeta}px "Segoe UI", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`HOLO // ${enTitle}`, innerX + 14, innerY + headerH / 2);

  ctx.fillStyle = '#f0f9ff';
  ctx.font = `bold ${F.headerTitle}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(fullTitle, W / 2, innerY + headerH / 2);

  // window chrome: maximize + close (active only)
  if (active) {
    const cy = innerY + 10;
    const cw = 54;
    const ch = 50;
    const gap = 10;
    const closeX = innerX + innerW - cw - 8;
    const maxX = closeX - cw - gap;

    ctx.fillStyle = maximized ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.22)';
    roundRect(ctx, maxX, cy, cw, ch, 10);
    ctx.fill();
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    roundRect(ctx, maxX, cy, cw, ch, 10);
    ctx.stroke();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2.2;
    if (maximized) {
      ctx.strokeRect(maxX + 12, cy + 14, 16, 16);
      ctx.strokeRect(maxX + 18, cy + 10, 16, 16);
    } else {
      ctx.strokeRect(maxX + 14, cy + 12, 18, 18);
    }
    hits.push({
      id: 'maximize',
      x: maxX - 6,
      y: cy - 4,
      w: cw + 12,
      h: ch + 10,
      action: 'maximize',
      chrome: true,
    });

    ctx.fillStyle = 'rgba(248, 113, 113, 0.3)';
    roundRect(ctx, closeX, cy, cw, ch, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(252, 165, 165, 0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, closeX, cy, cw, ch, 10);
    ctx.stroke();
    ctx.fillStyle = '#fecaca';
    ctx.font = `bold ${F.close}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + cw / 2, cy + ch / 2 + 1);
    hits.push({
      id: 'close',
      x: closeX - 6,
      y: cy - 4,
      w: cw + 12,
      h: ch + 10,
      action: 'close',
      chrome: true,
    });
  }

  // scanlines
  ctx.fillStyle = 'rgba(125, 211, 252, 0.04)';
  for (let y = 20; y < H - 20; y += 4) ctx.fillRect(20, y, W - 40, 1);

  if (!active) {
    ctx.fillStyle = '#f0f9ff';
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

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${F.idleCta}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('瞄准投影 · 按 E / 点击 打开菜单', W / 2, H * 0.54 + 58);

    ctx.fillStyle = 'rgba(186, 230, 253, 0.8)';
    ctx.font = `${F.idleHint}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('界面显示于全息屏 · 准星点选操作', W / 2, H * 0.78);
    return { hits };
  }

  // ── Active menu / experiment ──
  const station = hud?.station;
  const experiment = hud?.experiment;
  const running = !!(hud?.running && experiment);
  const contentTop = innerY + headerH + 12;
  const contentH = innerH - headerH - 16;

  if (!running) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
    ctx.font = `${F.listHint}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('选择实验 · 准星对准卡片后按 E / 点击', innerX + 4, contentTop);

    const experiments = station?.experiments || [];
    const cardH = 120;
    const gap = 14;
    let y = contentTop + 40;
    experiments.forEach((ex, i) => {
      if (y + cardH > contentTop + contentH) return;
      const x = innerX;
      const w = innerW;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, cardH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accentHex;
      ctx.font = `bold ${F.cardNum}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 16, y + 26);

      ctx.fillStyle = '#f0f9ff';
      ctx.font = `bold ${F.cardName}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(ex.name, x + 64, y + 20);

      ctx.fillStyle = 'rgba(186, 230, 253, 0.9)';
      ctx.font = `${F.cardGoal}px "Microsoft YaHei", sans-serif`;
      const goals = wrapText(ctx, ex.goal, w - 80);
      goals.slice(0, 2).forEach((ln, li) => {
        ctx.fillText(ln, x + 64, y + 62 + li * 30);
      });

      hits.push({
        id: `exp-${ex.id}`,
        x, y, w, h: cardH,
        action: 'start',
        expId: ex.id,
      });
      y += cardH + gap;
    });
  } else {
    const stepIndex = hud.stepIndex || 0;
    const steps = experiment.steps || [];
    const dataText = stripHtml(opts.dataHtml || '');

    if (experiment.id === 'hall_effect') {
      drawHallExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex,
      });
      return { hits };
    }
    if (experiment.id === 'hall_carrier_demo') {
      drawHallDemoExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex,
      });
      return { hits };
    }
    if (experiment.id === 'multi_slit_diffraction') {
      drawDiffractionExperiment(ctx, W, H, {
        hits, innerX, innerW, contentTop, contentH, experiment, hud, accentHex,
      });
      return { hits };
    }

    ctx.fillStyle = '#f0f9ff';
    ctx.font = `bold ${F.expName}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(experiment.name, innerX + 4, contentTop);

    let y = contentTop + 48;
    const theoryH = 68;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
    roundRect(ctx, innerX, y, innerW, theoryH, 8);
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.font = `${F.theory}px Consolas, "SF Mono", monospace`;
    const theoryLines = wrapText(ctx, experiment.theory, innerW - 24);
    theoryLines.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, innerX + 12, y + 12 + i * 28);
    });
    y += theoryH + 12;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
    ctx.font = `${F.section}px "Microsoft YaHei", sans-serif`;
    ctx.fillText('实验步骤', innerX + 4, y);
    y += 32;
    const stepLineH = 38;
    const stepMaxH = Math.min(steps.length * stepLineH + 16, contentTop + contentH - y - 200);
    const stepBoxH = Math.max(110, stepMaxH);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, innerX, y, innerW, stepBoxH, 8);
    ctx.fill();

    let sy = y + 14;
    steps.forEach((s, i) => {
      if (sy > y + stepBoxH - 32) return;
      const done = i < stepIndex;
      const cur = i === stepIndex;
      ctx.fillStyle = done ? '#4ade80' : cur ? accentHex : 'rgba(148,163,184,0.75)';
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
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    roundRect(ctx, innerX, y, innerW, hintH, 8);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.font = `${F.hint}px "Microsoft YaHei", sans-serif`;
    const hints = wrapText(ctx, hint, innerW - 24);
    hints.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, innerX + 12, y + 12 + i * 28);
    });
    y += hintH + 12;

    const dataLineH = 28;
    const dataH = Math.min(150, contentTop + contentH - y - 68);
    if (dataH > 52) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      roundRect(ctx, innerX, y, innerW, dataH, 8);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `${F.data}px Consolas, monospace`;
      const dlines = dataText.split('\n').filter(Boolean);
      dlines.slice(0, Math.floor((dataH - 16) / dataLineH)).forEach((ln, i) => {
        ctx.fillText(ln.slice(0, 48), innerX + 12, y + 14 + i * dataLineH);
      });
      y += dataH + 10;
    }

    const btnY = Math.min(y, contentTop + contentH - 60);
    const btnH = 56;
    const gap = 12;
    const btns = [
      { label: '返回列表', action: 'back', color: 'rgba(56, 189, 248, 0.2)' },
    ];
    btns.push({ label: '执行 (E)', action: 'action', color: 'rgba(34, 211, 238, 0.35)' });

    const btnW = (innerW - gap * (btns.length - 1)) / btns.length;
    btns.forEach((b, i) => {
      const bx = innerX + i * (btnW + gap);
      ctx.fillStyle = b.color;
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, btnY, btnW, btnH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f0f9ff';
      ctx.font = `bold ${F.btn}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, bx + btnW / 2, btnY + btnH / 2);
      hits.push({ id: b.action, x: bx, y: btnY, w: btnW, h: btnH, action: b.action });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
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
    // Larger pad: 3D hologram UV picks are less precise than fullscreen
    const hit = hitTestPoint(px, py, hits, 10);
    if (hit) return hit;
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
    if (best) return best;
  }

  return null;
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
