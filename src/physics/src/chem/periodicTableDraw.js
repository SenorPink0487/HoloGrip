/**
 * Canvas painters for chemistry holos: left status, right composition,
 * front periodic-table / reagent picker.
 *
 * Vision Pro Light Mode Frosted Glass styling:
 * High-clarity frosted glass background, bold crystal-clear slate typography,
 * spacious layout proportions, and elegant spatial computing aesthetics.
 */

import {
  CHEM_ELEMENTS,
  elementGridCell,
  getElement,
  getReagentsForElement,
} from './reagentCatalog.js';
import { pickHoloScreen } from '../holoScreen.js';

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
  g.addColorStop(0.5, 'rgba(241, 245, 249, 0.78)');
  g.addColorStop(1, 'rgba(226, 232, 240, 0.85)');
  ctx.fillStyle = g;
  // Smooth Vision Pro corner radius
  roundRect(ctx, 0, 0, w, h, 48);
  ctx.fill();

  // Soft specular outer glass rim
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.75)';
  ctx.lineWidth = 2.5;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 46);
  ctx.stroke();

  // Inner highlight rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 6, 6, w - 12, h - 12, 42);
  ctx.stroke();

  // Vision Pro window grab bar indicator at top
  const barW = 84;
  const barH = 6;
  roundRect(ctx, (w - barW) / 2, 14, barW, barH, 3);
  ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.fill();
}

function cupLabel(cup) {
  if (!cup?.reagents?.length) return '空 · 点击选择试剂';
  return cup.reagents.map((r) => r.formula).join(' + ');
}

/**
 * Left always-on status panel (W=1400, H=1040).
 * @returns {{ hits: object[] }}
 */
export function drawChemLeftPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 44;
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 48px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('化学实验台', pad, 72);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 22px "Outfit", system-ui, sans-serif';
  ctx.fillText('REAGENT MIX · CENTER ISLAND', pad, 108);

  const cupA = data.cupA || {};
  const cupB = data.cupB || {};
  const cardH = 160;
  const cards = [
    { key: 'A', title: '烧杯 A', body: cupLabel(cupA), action: 'chem-select-cup', cup: 'A', y: 140 },
    { key: 'B', title: '烧杯 B', body: cupLabel(cupB), action: 'chem-select-cup', cup: 'B', y: 140 + cardH + 28 },
  ];

  for (const card of cards) {
    const active = data.activeCup === card.cup;
    roundRect(ctx, pad, card.y, W - pad * 2, cardH, 24);
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.60)';
    ctx.fill();
    ctx.strokeStyle = active ? '#0f172a' : 'rgba(203, 213, 225, 0.70)';
    ctx.lineWidth = active ? 3.5 : 1.8;
    ctx.stroke();

    // Active status pill tag
    if (active) {
      roundRect(ctx, W - pad - 140, card.y + 24, 116, 36, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('当前选中', W - pad - 82, card.y + 48);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 38px "Outfit", "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.title, pad + 32, card.y + 54);
    ctx.fillStyle = active ? '#1e293b' : '#475569';
    ctx.font = '600 28px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(card.body, pad + 32, card.y + 110);
    hits.push({
      x: pad, y: card.y, w: W - pad * 2, h: cardH,
      action: card.action, cup: card.cup, role: 'chem_ui',
    });
  }

  // Hint
  ctx.fillStyle = '#475569';
  ctx.font = '600 24px "Noto Sans SC", system-ui, sans-serif';
  const hint = data.hint || '点击烧杯选择试剂 · 拖动倾倒到另一杯';
  wrapText(ctx, hint, pad, 530, W - pad * 2, 38);

  // Reset button (Vision Pro light glass pill style)
  const by = H - 110;
  roundRect(ctx, pad, by, W - pad * 2, 74, 24);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.60)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 28px "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('重置实验台', W / 2, by + 48);
  ctx.textAlign = 'left';
  hits.push({ x: pad, y: by, w: W - pad * 2, h: 74, action: 'chem-reset', role: 'chem_ui' });

  return { hits };
}

/**
 * Right always-on composition panel (W=1400, H=1040).
 */
export function drawChemRightPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 44;
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 48px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('成分构成', pad, 72);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText('点击成分在桌上显示 3D 结构', pad, 108);

  const components = data.components || [];
  if (!components.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 26px "Noto Sans SC", system-ui, sans-serif';
    wrapText(ctx, '装入试剂或倾倒混合后，成分将显示在这里。', pad, 180, W - pad * 2, 40);
    return { hits };
  }

  let y = 140;
  components.forEach((comp) => {
    const rowH = 104;
    const active = data.selectedComponentId === comp.id;
    roundRect(ctx, pad, y, W - pad * 2, rowH, 24);
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.60)';
    ctx.fill();
    ctx.strokeStyle = active ? '#0f172a' : 'rgba(203, 213, 225, 0.70)';
    ctx.lineWidth = active ? 3.5 : 1.8;
    ctx.stroke();

    // Color swatch with specular border
    ctx.fillStyle = `#${(comp.color >>> 0).toString(16).padStart(6, '0')}`;
    roundRect(ctx, pad + 24, y + 26, 52, 52, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.50)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 34px "Outfit", system-ui, sans-serif';
    ctx.fillText(comp.formula || comp.id, pad + 96, y + 46);
    ctx.fillStyle = '#475569';
    ctx.font = '600 24px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(comp.name_zh || '', pad + 96, y + 80);

    hits.push({
      x: pad, y, w: W - pad * 2, h: rowH,
      action: 'chem-show-component',
      componentId: comp.id,
      role: 'chem_ui',
    });
    y += rowH + 18;
    if (y > H - 90) return;
  });

  return { hits };
}

/**
 * Front floating periodic table / reagent picker (W=1920, H=1120).
 */
export function drawChemPeriodicPanel(ctx, W, H, data = {}) {
  const hits = [];
  fillGlass(ctx, W, H);
  const pad = 44;
  const phase = data.pickerPhase || 'elements';
  const activeCup = data.activeCup || 'A';

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 44px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(phase === 'elements' ? '元素周期表 · 选择元素' : '常见试剂 · 装入烧杯', pad, 64);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 22px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillText(`当前烧杯 ${activeCup}  ·  选择元素或在下方输入 AI 检索`, pad, 102);

  // Embedded container slot for the HTML search dock at the bottom of the selection panel
  const slotY = H - 94;
  const slotH = 58;
  roundRect(ctx, pad, slotY, W - pad * 2, slotH, 20);
  ctx.fillStyle = 'rgba(241, 245, 249, 0.60)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Close button (Prominent Vision Pro Red Glass Badge)
  const closeW = 160;
  const closeH = 68;
  const closeX = W - pad - closeW;
  const closeY = 20;
  roundRect(ctx, closeX, closeY, closeW, closeH, 22);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px "Outfit", "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('关闭  ×', closeX + closeW / 2, closeY + 44);
  ctx.textAlign = 'left';

  if (phase === 'reagents') {
    const el = getElement(data.pickedElement);
    const reagents = getReagentsForElement(data.pickedElement) || [];
    // Back button
    roundRect(ctx, pad, 120, 160, 50, 16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.70)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 22px "Noto Sans SC", system-ui';
    ctx.fillText('← 返回', pad + 32, 152);
    hits.push({
      x: pad, y: 120, w: 160, h: 50,
      action: 'chem-picker-back', role: 'chem_ui',
    });

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 30px "Outfit", "Noto Sans SC", system-ui';
    ctx.fillText(`${el?.symbol || ''} · ${el?.name_zh || ''} · ${reagents.length} 种试剂`, pad + 190, 154);

    // Two-column card grid so more reagents fit on the picker panel.
    const listTop = 200;
    const gapX = 18;
    const gapY = 14;
    const listCols = reagents.length > 6 ? 2 : 1;
    const cardW = (W - pad * 2 - gapX * (listCols - 1)) / listCols;
    const cardH = reagents.length > 10 ? 76 : 92;
    reagents.forEach((r, i) => {
      const col = i % listCols;
      const row = Math.floor(i / listCols);
      const x = pad + col * (cardW + gapX);
      const y = listTop + row * (cardH + gapY);
      if (y + cardH > H - pad) return;

      roundRect(ctx, x, y, cardW, cardH, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.70)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const sw = Math.min(48, cardH - 28);
      ctx.fillStyle = `#${(r.color >>> 0).toString(16).padStart(6, '0')}`;
      roundRect(ctx, x + 20, y + (cardH - sw) / 2, sw, sw, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.50)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const textX = x + 20 + sw + 18;
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${cardH >= 88 ? 30 : 24}px "Outfit", system-ui`;
      ctx.fillText(r.formula, textX, y + cardH * 0.42);
      ctx.fillStyle = '#475569';
      ctx.font = `600 ${cardH >= 88 ? 22 : 18}px "Noto Sans SC", system-ui`;
      ctx.fillText(r.name_zh, textX, y + cardH * 0.72);
      hits.push({
        x, y, w: cardW, h: cardH,
        action: 'chem-pick-reagent',
        reagentId: r.id,
        role: 'chem_ui',
      });
    });
  } else {
    // Element grid — leave bottom band free for AI search-dock hint
    const cols = 18;
    const rows = 6;
    const gridTop = 130;
    const gridLeft = pad;
    const gridW = W - pad * 2;
    const gridH = H - gridTop - pad - 100;
    const cellW = gridW / cols;
    const cellH = Math.min(130, gridH / rows);

    for (const el of CHEM_ELEMENTS) {
      const { col, row } = elementGridCell(el);
      const x = gridLeft + col * cellW + 4;
      const y = gridTop + row * cellH + 4;
      const cw = cellW - 8;
      const ch = cellH - 8;
      roundRect(ctx, x, y, cw, ch, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      const symSize = Math.max(26, Math.min(42, cw * 0.58));
      ctx.font = `800 ${symSize}px "Outfit", system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(el.symbol, x + cw / 2, y + ch * 0.48);
      ctx.fillStyle = '#334155';
      const nameSize = Math.max(16, Math.min(22, cw * 0.35));
      ctx.font = `700 ${nameSize}px "Noto Sans SC", system-ui`;
      ctx.fillText(el.name_zh, x + cw / 2, y + ch * 0.80);
      ctx.textAlign = 'left';
      hits.push({
        x, y, w: cw, h: ch,
        action: 'chem-pick-element',
        element: el.symbol,
        role: 'chem_ui',
      });
    }
  }

  // Dedicated hit region for enlarged close button aligned with visual badge
  hits.push({
    x: closeX,
    y: closeY,
    w: closeW,
    h: closeH,
    action: 'chem-close-picker',
    role: 'chem_ui',
  });

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

/** Hit-test helper for chemistry holos with precise pixel-perfect alignment. */
export function pickChemHits(hits, u, v, W, H) {
  if (!hits?.length || u == null || v == null || !Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }
  const px = u * W;
  const py = (1 - v) * H;
  const pad = 12;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const h = hits[i];
    if (
      px >= h.x - pad
      && px <= h.x + h.w + pad
      && py >= h.y - pad
      && py <= h.y + h.h + pad
    ) {
      return { ...h, px, py };
    }
  }
  return null;
}
