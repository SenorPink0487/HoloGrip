/**
 * Canvas painters for chemistry holos: left status, right composition,
 * front periodic-table / reagent picker.
 *
 * Vision Pro Light Mode Frosted Glass styling:
 * Translucent frosted white glass background, crisp deep slate typography,
 * specular highlights, and elegant spatial computing aesthetics.
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
  // Vision Pro light mode frosted translucent glass background
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
  g.addColorStop(0.5, 'rgba(248, 250, 252, 0.80)');
  g.addColorStop(1, 'rgba(241, 245, 249, 0.90)');
  ctx.fillStyle = g;
  // Smooth Vision Pro corner radius
  roundRect(ctx, 0, 0, w, h, 44);
  ctx.fill();

  // Outer soft specular glass rim
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 42);
  ctx.stroke();

  // Inner subtle highlight rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 5, 5, w - 10, h - 10, 39);
  ctx.stroke();

  // Vision Pro window grab bar indicator at top
  const barW = 76;
  const barH = 5;
  roundRect(ctx, (w - barW) / 2, 12, barW, barH, 2.5);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.fill();
}

function cupLabel(cup) {
  if (!cup?.reagents?.length) return '空 · 点击选择试剂';
  return cup.reagents.map((r) => r.formula).join(' + ');
}

/**
 * Left always-on status panel (W=1200, H=920).
 * @returns {{ hits: object[] }}
 */
export function drawChemLeftPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 40;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 38px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('化学实验台', pad, 64);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 18px "Outfit", system-ui, sans-serif';
  ctx.fillText('REAGENT MIX · CENTER ISLAND', pad, 96);

  const cupA = data.cupA || {};
  const cupB = data.cupB || {};
  const cardH = 135;
  const cards = [
    { key: 'A', title: '烧杯 A', body: cupLabel(cupA), action: 'chem-select-cup', cup: 'A', y: 130 },
    { key: 'B', title: '烧杯 B', body: cupLabel(cupB), action: 'chem-select-cup', cup: 'B', y: 130 + cardH + 24 },
  ];

  for (const card of cards) {
    const active = data.activeCup === card.cup;
    roundRect(ctx, pad, card.y, W - pad * 2, cardH, 20);
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    ctx.strokeStyle = active ? '#0f172a' : 'rgba(203, 213, 225, 0.60)';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.stroke();

    // Active status pill tag
    if (active) {
      roundRect(ctx, W - pad - 120, card.y + 20, 100, 32, 16);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('当前选中', W - pad - 70, card.y + 42);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 32px "Outfit", "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.title, pad + 28, card.y + 48);
    ctx.fillStyle = active ? '#334155' : '#475569';
    ctx.font = '600 24px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.body, pad + 28, card.y + 94);
    hits.push({
      x: pad, y: card.y, w: W - pad * 2, h: cardH,
      action: card.action, cup: card.cup, role: 'chem_ui',
    });
  }

  // Hint
  ctx.fillStyle = '#475569';
  ctx.font = '600 20px "Noto Sans SC", system-ui, sans-serif';
  const hint = data.hint || '点击烧杯选择试剂 · 拖动倾倒到另一杯';
  wrapText(ctx, hint, pad, 480, W - pad * 2, 32);

  // Reset button (Vision Pro light glass pill style)
  const by = H - 100;
  roundRect(ctx, pad, by, W - pad * 2, 64, 20);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.50)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 26px "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('重置实验台', W / 2, by + 42);
  ctx.textAlign = 'left';
  hits.push({ x: pad, y: by, w: W - pad * 2, h: 64, action: 'chem-reset', role: 'chem_ui' });

  return { hits };
}

/**
 * Right always-on composition panel (W=1200, H=920).
 */
export function drawChemRightPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 40;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 38px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('成分构成', pad, 64);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 18px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('点击成分在桌上显示 3D 结构', pad, 96);

  const components = data.components || [];
  if (!components.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
    wrapText(ctx, '装入试剂或倾倒混合后，成分将显示在这里。', pad, 160, W - pad * 2, 36);
    return { hits };
  }

  let y = 130;
  components.forEach((comp) => {
    const rowH = 92;
    const active = data.selectedComponentId === comp.id;
    roundRect(ctx, pad, y, W - pad * 2, rowH, 20);
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    ctx.strokeStyle = active ? '#0f172a' : 'rgba(203, 213, 225, 0.60)';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.stroke();

    // Color swatch with specular border
    ctx.fillStyle = `#${(comp.color >>> 0).toString(16).padStart(6, '0')}`;
    roundRect(ctx, pad + 20, y + 22, 48, 48, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.40)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 28px "Outfit", system-ui, sans-serif';
    ctx.fillText(comp.formula || comp.id, pad + 84, y + 42);
    ctx.fillStyle = '#475569';
    ctx.font = '600 20px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(comp.name_zh || '', pad + 84, y + 70);

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
 * Front floating periodic table / reagent picker (W=1660, H=960).
 */
export function drawChemPeriodicPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 36;
  const phase = data.pickerPhase || 'elements';
  const activeCup = data.activeCup || 'A';

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 36px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(phase === 'elements' ? '元素周期表 · 选择元素' : '常见试剂 · 装入烧杯', pad, 58);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 20px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(`当前烧杯 ${activeCup}`, pad, 92);

  // Close button (Vision Pro glass pill)
  const closeW = 52;
  roundRect(ctx, W - pad - closeW, 26, closeW, 48, 14);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.60)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 26px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('×', W - pad - closeW / 2, 58);
  ctx.textAlign = 'left';
  hits.push({
    x: W - pad - closeW, y: 26, w: closeW, h: 48,
    action: 'chem-close-picker', role: 'chem_ui',
  });

  if (phase === 'reagents') {
    const el = getElement(data.pickedElement);
    const reagents = getReagentsForElement(data.pickedElement) || [];
    // Back button
    roundRect(ctx, pad, 116, 140, 48, 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.60)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 20px "Noto Sans SC", system-ui';
    ctx.fillText('← 返回', pad + 28, 146);
    hits.push({
      x: pad, y: 116, w: 140, h: 48,
      action: 'chem-picker-back', role: 'chem_ui',
    });

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 26px "Outfit", system-ui';
    ctx.fillText(`${el?.symbol || ''} · ${el?.name_zh || ''}`, pad + 164, 146);

    let y = 188;
    reagents.forEach((r) => {
      const rowH = 84;
      roundRect(ctx, pad, y, W - pad * 2, rowH, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.60)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = `#${(r.color >>> 0).toString(16).padStart(6, '0')}`;
      roundRect(ctx, pad + 20, y + 20, 44, 44, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.40)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 28px "Outfit", system-ui';
      ctx.fillText(r.formula, pad + 80, y + 38);
      ctx.fillStyle = '#475569';
      ctx.font = '600 20px "Noto Sans SC", system-ui';
      ctx.fillText(r.name_zh, pad + 80, y + 66);
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

  // Element grid
  const cols = 17;
  const rows = 5;
  const gridTop = 118;
  const gridLeft = pad;
  const gridW = W - pad * 2;
  const gridH = H - gridTop - pad;
  const cellW = gridW / cols;
  const cellH = Math.min(125, gridH / rows);

  for (const el of CHEM_ELEMENTS) {
    const { col, row } = elementGridCell(el);
    const x = gridLeft + col * cellW + 3;
    const y = gridTop + row * cellH + 3;
    const cw = cellW - 6;
    const ch = cellH - 6;
    roundRect(ctx, x, y, cw, ch, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.50)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    const symSize = Math.max(22, Math.min(36, cw * 0.55));
    ctx.font = `700 ${symSize}px "Outfit", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(el.symbol, x + cw / 2, y + ch * 0.48);
    ctx.fillStyle = '#475569';
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
