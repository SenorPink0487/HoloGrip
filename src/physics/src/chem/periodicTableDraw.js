/**
 * Canvas painters for chemistry holos: left status, right composition,
 * front periodic-table / reagent picker.
 *
 * Font sizes are intentionally large — panels are viewed from ~1–2 m in the lab.
 */

import {
  CHEM_ELEMENTS,
  elementGridCell,
  getElement,
  getReagentsForElement,
} from './reagentCatalog.js';

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

function fillGlass(ctx, w, h) {
  // Vision Pro style frosted glass background
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(15, 23, 42, 0.82)');
  g.addColorStop(0.4, 'rgba(6, 78, 59, 0.78)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
  ctx.fillStyle = g;
  // Large rounded rect for glass look
  roundRect(ctx, 0, 0, w, h, 48);
  ctx.fill();
  // Soft outer rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2.5;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 46);
  ctx.stroke();
  // Inner accent rim
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.28)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 6, 6, w - 12, h - 12, 40);
  ctx.stroke();
}

function cupLabel(cup) {
  if (!cup?.reagents?.length) return '空 · 点击选择试剂';
  return cup.reagents.map((r) => r.formula).join(' + ');
}

/**
 * Left always-on status panel.
 * @returns {{ hits: object[] }}
 */
export function drawChemLeftPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 36;
  ctx.fillStyle = '#34d399';
  ctx.font = '700 42px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('化学实验台', pad, 56);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
  ctx.font = '600 20px "Outfit", system-ui, sans-serif';
  ctx.fillText('REAGENT MIX · CENTER ISLAND', pad, 88);

  const cupA = data.cupA || {};
  const cupB = data.cupB || {};
  const cardH = 120;
  const cards = [
    { key: 'A', title: '烧杯 A', body: cupLabel(cupA), action: 'chem-select-cup', cup: 'A', y: 120 },
    { key: 'B', title: '烧杯 B', body: cupLabel(cupB), action: 'chem-select-cup', cup: 'B', y: 120 + cardH + 24 },
  ];

  for (const card of cards) {
    const active = data.activeCup === card.cup;
    roundRect(ctx, pad, card.y, W - pad * 2, cardH, 18);
    ctx.fillStyle = active ? 'rgba(52, 211, 153, 0.28)' : 'rgba(15, 23, 42, 0.55)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(52, 211, 153, 0.95)' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = '#ecfdf5';
    ctx.font = '700 32px "Outfit", "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.title, pad + 24, card.y + 44);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
    ctx.font = '600 24px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.body, pad + 24, card.y + 84);
    hits.push({
      x: pad, y: card.y, w: W - pad * 2, h: cardH,
      action: card.action, cup: card.cup, role: 'chem_ui',
    });
  }

  // Hint
  ctx.fillStyle = 'rgba(167, 243, 208, 0.95)';
  ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
  const hint = data.hint || '点击烧杯选择试剂 · 拖动倾倒到另一杯';
  wrapText(ctx, hint, pad, 420, W - pad * 2, 32);

  // Reset button
  const by = H - 96;
  roundRect(ctx, pad, by, W - pad * 2, 60, 16);
  ctx.fillStyle = 'rgba(248, 113, 113, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fecaca';
  ctx.font = '700 26px "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('重置实验台', W / 2, by + 40);
  ctx.textAlign = 'left';
  hits.push({ x: pad, y: by, w: W - pad * 2, h: 60, action: 'chem-reset', role: 'chem_ui' });

  return { hits };
}

/**
 * Right always-on composition panel.
 */
export function drawChemRightPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 36;
  ctx.fillStyle = '#34d399';
  ctx.font = '700 42px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('成分构成', pad, 56);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
  ctx.font = '600 20px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('点击成分在桌上显示 3D 结构', pad, 88);

  const components = data.components || [];
  if (!components.length) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.font = '600 24px "Noto Sans SC", system-ui, sans-serif';
    wrapText(ctx, '装入试剂或倾倒混合后，成分将显示在这里。', pad, 140, W - pad * 2, 36);
    return { hits };
  }

  let y = 120;
  components.forEach((comp) => {
    const rowH = 88;
    const active = data.selectedComponentId === comp.id;
    roundRect(ctx, pad, y, W - pad * 2, rowH, 16);
    ctx.fillStyle = active ? 'rgba(52, 211, 153, 0.3)' : 'rgba(15, 23, 42, 0.55)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(52, 211, 153, 0.95)' : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();

    // color swatch
    ctx.fillStyle = `#${(comp.color >>> 0).toString(16).padStart(6, '0')}`;
    roundRect(ctx, pad + 18, y + 22, 40, 40, 10);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 28px "Outfit", system-ui, sans-serif';
    ctx.fillText(comp.formula || comp.id, pad + 76, y + 38);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
    ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(comp.name_zh || '', pad + 76, y + 68);

    hits.push({
      x: pad, y, w: W - pad * 2, h: rowH,
      action: 'chem-show-component',
      componentId: comp.id,
      role: 'chem_ui',
    });
    y += rowH + 16;
    if (y > H - 80) return;
  });

  return { hits };
}

/**
 * Front floating periodic table / reagent picker.
 * data.pickerPhase: 'elements' | 'reagents'
 */
export function drawChemPeriodicPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 32;
  const phase = data.pickerPhase || 'elements';
  const activeCup = data.activeCup || 'A';

  ctx.fillStyle = '#34d399';
  ctx.font = '700 36px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(phase === 'elements' ? '元素周期表 · 选择元素' : '常见试剂 · 装入烧杯', pad, 52);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(`当前烧杯 ${activeCup}`, pad, 88);

  // Close
  const closeW = 56;
  roundRect(ctx, W - pad - closeW, 22, closeW, 48, 12);
  ctx.fillStyle = 'rgba(248, 113, 113, 0.25)';
  ctx.fill();
  ctx.fillStyle = '#fecaca';
  ctx.font = '700 28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('×', W - pad - closeW / 2, 56);
  ctx.textAlign = 'left';
  hits.push({
    x: W - pad - closeW, y: 22, w: closeW, h: 48,
    action: 'chem-close-picker', role: 'chem_ui',
  });

  if (phase === 'reagents') {
    const el = getElement(data.pickedElement);
    const reagents = getReagentsForElement(data.pickedElement) || [];
    // Back
    roundRect(ctx, pad, 110, 140, 48, 12);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 22px "Noto Sans SC", system-ui';
    ctx.fillText('← 返回', pad + 28, 142);
    hits.push({
      x: pad, y: 110, w: 140, h: 48,
      action: 'chem-picker-back', role: 'chem_ui',
    });

    ctx.fillStyle = 'rgba(167, 243, 208, 0.98)';
    ctx.font = '700 26px "Outfit", system-ui';
    ctx.fillText(`${el?.symbol || ''} · ${el?.name_zh || ''}`, pad + 160, 142);

    let y = 180;
    reagents.forEach((r) => {
      const rowH = 80;
      roundRect(ctx, pad, y, W - pad * 2, rowH, 16);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `#${(r.color >>> 0).toString(16).padStart(6, '0')}`;
      roundRect(ctx, pad + 18, y + 20, 40, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 28px "Outfit", system-ui';
      ctx.fillText(r.formula, pad + 76, y + 36);
      ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
      ctx.font = '600 22px "Noto Sans SC", system-ui';
      ctx.fillText(r.name_zh, pad + 76, y + 64);
      hits.push({
        x: pad, y, w: W - pad * 2, h: rowH,
        action: 'chem-pick-reagent',
        reagentId: r.id,
        role: 'chem_ui',
      });
      y += rowH + 14;
    });
    return { hits };
  }

  // Element grid — larger cells for readable symbols
  const cols = 17;
  const rows = 5;
  const gridTop = 110;
  const gridLeft = pad;
  const gridW = W - pad * 2;
  const gridH = H - gridTop - pad;
  const cellW = gridW / cols;
  const cellH = Math.min(110, gridH / rows);

  for (const el of CHEM_ELEMENTS) {
    const { col, row } = elementGridCell(el);
    const x = gridLeft + col * cellW + 3;
    const y = gridTop + row * cellH + 3;
    const cw = cellW - 6;
    const ch = cellH - 6;
    roundRect(ctx, x, y, cw, ch, 10);
    ctx.fillStyle = 'rgba(6, 78, 59, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ecfdf5';
    const symSize = Math.max(22, Math.min(36, cw * 0.55));
    ctx.font = `700 ${symSize}px "Outfit", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(el.symbol, x + cw / 2, y + ch * 0.48);
    ctx.fillStyle = 'rgba(167, 243, 208, 0.9)';
    const nameSize = Math.max(14, Math.min(20, cw * 0.32));
    ctx.font = `600 ${nameSize}px "Noto Sans SC", system-ui`;
    ctx.fillText(el.name_zh, x + cw / 2, y + ch * 0.78);
    ctx.textAlign = 'left';
    hits.push({
      x, y, w: cw, h: ch,
      action: 'chem-pick-element',
      element: el.symbol,
      role: 'chem_ui',
    });
  }

  return { hits };
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const chars = String(text || '').split('');
  let line = '';
  let cy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

/** Hit-test helper shared with holo pick. */
export function pickChemHits(hits, u, v, W, H) {
  if (!hits?.length) return null;
  const x = u * W;
  // Three.js PlaneGeometry UV: v=0 at bottom; canvas y=0 at top
  const y = (1 - v) * H;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}
