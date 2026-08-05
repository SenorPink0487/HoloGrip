/**
 * Interactive classroom formula board — browse formulas & concepts.
 * Drawn on canvas texture; UV hit-test like a touch screen.
 *
 * 公式采用人教版写法：斜体变量 + 下标/上标（见 physicsFormula.drawMathFormula）。
 * Layout/fonts sized for wall-scale readability (~1.4× classroom poster scale).
 */

import { drawMathFormula } from './physicsFormula.js';

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
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Catalog: categories + formula/concept entries for school lab */
export const FORMULA_CATALOG = {
  categories: [
    { id: 'all', name: '全部', en: 'ALL' },
    { id: 'mechanics', name: '力学', en: 'MECH' },
    { id: 'electro', name: '电磁', en: 'EM' },
    { id: 'optics', name: '光学', en: 'OPT' },
    { id: 'thermo', name: '热学', en: 'THERM' },
    { id: 'quantum', name: '量子', en: 'QM' },
  ],
  items: [
    // 力学（人教版高中）
    {
      id: 'newton2',
      cat: 'mechanics',
      title: '牛顿第二定律',
      formula: 'F=ma',
      concept: '物体的加速度跟作用力成正比，跟物体的质量成反比，加速度的方向跟作用力的方向相同。',
      symbols: 'F — 合外力 (N)　m — 质量 (kg)　a — 加速度 (m/s²)',
    },
    {
      id: 'kinetic',
      cat: 'mechanics',
      title: '动能',
      formula: 'E_{k}=(1/2)mv^{2}',
      concept: '物体由于运动而具有的能。动能定理：合外力做的功等于物体动能的变化。',
      symbols: 'E_k — 动能　m — 质量　v — 速率',
    },
    {
      id: 'pendulum',
      cat: 'mechanics',
      title: '单摆周期',
      formula: 'T=2π√(l/g)',
      concept: '在偏角很小的情况下，单摆做简谐运动，周期与振幅无关，只与摆长 l 和重力加速度 g 有关。可用来测定 g。',
      symbols: 'T — 周期　l — 摆长　g — 重力加速度',
    },
    {
      id: 'hooke',
      cat: 'mechanics',
      title: '胡克定律',
      formula: 'F=−kx',
      concept: '弹簧发生弹性形变时，弹力的大小跟弹簧伸长（或缩短）的长度成正比，方向与形变方向相反。',
      symbols: 'k — 劲度系数　x — 形变量',
    },
    {
      id: 'shm',
      cat: 'mechanics',
      title: '简谐运动周期',
      formula: 'T=2π√(m/k)',
      concept: '弹簧振子的周期由质量与劲度系数决定，与振幅无关。',
      symbols: 'm — 质量　k — 劲度系数',
    },
    {
      id: 'momentum',
      cat: 'mechanics',
      title: '动量与冲量',
      formula: 'p=mv；I=FΔt=Δp',
      concept: '动量是矢量。物体所受合外力的冲量等于它的动量变化（动量定理）。封闭系统碰撞中动量守恒。',
      symbols: 'p — 动量　I — 冲量',
    },
    // 电磁（人教版选修 3-1 / 3-2）
    {
      id: 'e_field_def',
      cat: 'electro',
      title: '电场强度（定义）',
      formula: 'E=F/q',
      concept: '放入电场中某点的探测电荷所受的电场力 F 跟它的电荷量 q 的比值，叫做该点的电场强度。方向与正电荷受力方向相同。',
      symbols: 'E — 电场强度　F — 电场力　q — 探测电荷电荷量',
    },
    {
      id: 'point_charge_e',
      cat: 'electro',
      title: '点电荷的场强',
      formula: 'E=kQ/r^{2}',
      concept: '真空中点电荷 Q 在距离 r 处产生的电场强度。k 为静电力常量，k = 9.0×10⁹ N·m²/C²。',
      symbols: 'k — 静电力常量　Q — 场源电荷　r — 距离',
    },
    {
      id: 'coulomb',
      cat: 'electro',
      title: '库仑定律',
      formula: 'F=k(Q_{1}Q_{2})/r^{2}',
      concept: '真空中两个静止点电荷之间的相互作用力，跟它们的电荷量的乘积成正比，跟它们的距离的二次方成反比，作用力的方向在它们的连线上。',
      symbols: 'k — 静电力常量　Q₁、Q₂ — 电荷量　r — 距离',
    },
    {
      id: 'faraday',
      cat: 'electro',
      title: '法拉第电磁感应定律',
      formula: 'E=nΔΦ/Δt',
      concept: '电路中感应电动势的大小，跟穿过这一电路的磁通量的变化率成正比。方向由楞次定律判定。',
      symbols: 'E — 感应电动势　n — 匝数　Φ — 磁通量',
    },
    {
      id: 'induced_e',
      cat: 'electro',
      title: '感生电场',
      formula: 'E·2πr=ΔΦ/Δt',
      concept: '变化的磁场激发涡旋感生电场。均匀柱形磁场区内 r≤R 时 E∝r，区外 r>R 时 E∝1/r；方向由楞次定律判定。',
      symbols: 'E — 感生电场强度　Φ — 磁通量　r — 到轴线距离',
    },
    {
      id: 'flux',
      cat: 'electro',
      title: '磁通量',
      formula: 'Φ=BS cosθ',
      concept: '在磁感应强度为 B 的匀强磁场中，与磁场方向垂直的面积 S 的磁通量 Φ = BS；一般情况要乘 cosθ。',
      symbols: 'B — 磁感应强度　S — 面积　θ — B 与法线夹角',
    },
    {
      id: 'gauss',
      cat: 'electro',
      title: '高斯定理',
      formula: 'Φ_{E}=Q_{内}/ε_{0}',
      concept: '通过任意闭合曲面的电通量，等于包围在该闭合曲面内的电荷的代数和除以 ε₀，与面外电荷无关。',
      symbols: 'Φ_E — 电通量　Q内 — 面内净电荷　ε₀ — 真空介电常量',
    },
    {
      id: 'lorentz',
      cat: 'electro',
      title: '洛伦兹力',
      formula: 'F=qvB（v⊥B）',
      concept: '运动电荷在磁场中所受的力。当速度与磁场垂直时 F = qvB；方向由左手定则判定。磁场力不做功，只改变速度方向。',
      symbols: 'q — 电荷量　v — 速率　B — 磁感应强度',
    },
    {
      id: 'right_hand',
      cat: 'electro',
      title: '安培定则（右手螺旋定则）',
      formula: '四指电流 → 拇指 N 极',
      concept: '通电螺线管：用右手握住螺线管，让四指弯向螺线管中电流的方向，大拇指所指的那端就是螺线管的 N 极。',
      symbols: '螺线管 · 电流 · 磁极',
    },
    {
      id: 'ohm',
      cat: 'electro',
      title: '欧姆定律',
      formula: 'I=U/R',
      concept: '导体中的电流跟导体两端的电压成正比，跟导体的电阻成反比。',
      symbols: 'I — 电流　U — 电压　R — 电阻',
    },
    // 光学
    {
      id: 'lens',
      cat: 'optics',
      title: '薄透镜成像公式',
      formula: '1/u+1/v=1/f',
      concept: '物距 u、像距 v 与焦距 f 满足此关系。凸透镜焦距 f 取正；实像像距为正，虚像像距为负（符号规则依教材）。',
      symbols: 'u — 物距　v — 像距　f — 焦距',
    },
    {
      id: 'lens_conj',
      cat: 'optics',
      title: '共轭法测焦距',
      formula: 'f=(L^{2}−d^{2})/(4L)',
      concept: '物屏与像屏距离 L>4f 固定时，透镜有两个成像清晰的位置，间距为 d。两位置物像共轭互换。',
      symbols: 'L — 物屏像屏距　d — 两透镜位置间距　f — 焦距',
    },
    {
      id: 'snell',
      cat: 'optics',
      title: '折射定律',
      formula: 'n_{1} sin i = n_{2} sin r',
      concept: '光从一种介质射入另一种介质时，入射角的正弦与折射角的正弦之比是一个常数，等于两种介质折射率之比。',
      symbols: 'n — 折射率　i — 入射角　r — 折射角',
    },
    {
      id: 'prism',
      cat: 'optics',
      title: '色散',
      formula: 'n = n(λ)',
      concept: '同一介质对不同色光的折射率不同，白光经三棱镜后色散成光谱。一般紫光偏折更大。',
      symbols: 'λ — 波长　n — 折射率',
    },
    {
      id: 'prism_min',
      cat: 'optics',
      title: '最小偏向角测折射率',
      formula: 'n=sin[(A+δ_{m})/2]/sin(A/2)',
      concept: '三棱镜在最小偏向时入射、出射对称。测得顶角 A 与最小偏向角 δ_m 即可求折射率 n。',
      symbols: 'A — 顶角　δ_m — 最小偏向角　n — 折射率',
    },
    {
      id: 'wave',
      cat: 'optics',
      title: '波速、波长与频率',
      formula: 'v=λf',
      concept: '波速等于波长与频率的乘积。真空中光速 c = 3.00×10⁸ m/s。',
      symbols: 'v — 波速　λ — 波长　f — 频率',
    },
    // 热学
    {
      id: 'calorimetry',
      cat: 'thermo',
      title: '热平衡（量热）',
      formula: 'Q=cmΔt；Q_{放}=Q_{吸}',
      concept: '忽略热损失时，高温物体放出的热量等于低温物体吸收的热量。可用来测定未知比热容。',
      symbols: 'c — 比热容　m — 质量　Δt — 温度变化',
    },
    {
      id: 'fourier',
      cat: 'thermo',
      title: '热传导',
      formula: 'Q/t∝kA(ΔT/Δx)',
      concept: '单位时间内通过导体的热量，与横截面积、两端温度差成正比，与长度成反比；比例系数 k 为热导率。',
      symbols: 'k — 热导率　A — 横截面积　ΔT — 温差　Δx — 厚度',
    },
    {
      id: 'ideal_gas',
      cat: 'thermo',
      title: '理想气体状态方程',
      formula: 'pV=nRT',
      concept: '一定质量的理想气体，压强 p、体积 V 与热力学温度 T 满足 pV = nRT（或 pV/T = 常量）。',
      symbols: 'p — 压强　V — 体积　T — 热力学温度　R — 气体常量',
    },
    // 近代物理（高中选修）
    {
      id: 'debroglie',
      cat: 'quantum',
      title: '德布罗意波长',
      formula: 'λ=h/p',
      concept: '任何一个运动的物体，都有一种波与它对应，波长等于普朗克常量与动量之比。体现波粒二象性。',
      symbols: 'h — 普朗克常量　p — 动量　λ — 物质波波长',
    },
    {
      id: 'photon',
      cat: 'quantum',
      title: '光子的能量',
      formula: 'E=hν',
      concept: '光是一份一份地传播的，每一份叫做一个光子，光子的能量 E = hν，与光的频率成正比。',
      symbols: 'h — 普朗克常量　ν — 频率　E — 光子能量',
    },
    {
      id: 'photoelectric',
      cat: 'quantum',
      title: '光电效应方程',
      formula: 'E_{k}=hν−W_{0}',
      concept: '光电子的最大初动能等于光子能量减去金属的逸出功。只有 ν > ν₀（极限频率）时才能发生光电效应。',
      symbols: 'E_k — 最大初动能　W₀ — 逸出功　ν — 入射光频率',
    },
    {
      id: 'planck',
      cat: 'quantum',
      title: '能量子',
      formula: 'ε=hν',
      concept: '物体发射或吸收能量时，能量不是连续的，而是一份一份的，每一份就是一个能量子。',
      symbols: 'ε — 能量子　h — 普朗克常量　ν — 频率',
    },
  ],
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {{ category: string, selectedId: string|null }} state
 */
export function drawFormulaBoard(ctx, W, H, state) {
  const hits = [];
  const category = state.category || 'all';
  const selectedId = state.selectedId || null;
  const items = FORMULA_CATALOG.items.filter(
    (it) => category === 'all' || it.cat === category,
  );
  const selected = selectedId
    ? FORMULA_CATALOG.items.find((it) => it.id === selectedId)
    : null;

  // background glass
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(240,250,255,0.97)');
  grad.addColorStop(1, 'rgba(200,230,255,0.94)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // grid
  ctx.strokeStyle = 'rgba(14,165,233,0.10)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // header — large wall-readable title bar
  const headerH = 92;
  ctx.fillStyle = 'rgba(14,165,233,0.16)';
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 46px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('QUANTUM PHYSICS  ·  理论核心面板', 44, headerH / 2);

  ctx.fillStyle = '#0369a1';
  ctx.font = '26px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('瞄准条目 · 按 E / 点击 查看概念', W - 44, headerH / 2);

  // corner brackets
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 4;
  [[24, headerH + 14], [W - 24, headerH + 14], [24, H - 24], [W - 24, H - 24]].forEach(([x, y], i) => {
    const dx = i % 2 === 0 ? 40 : -40;
    const dy = i < 2 ? 40 : -40;
    ctx.beginPath();
    ctx.moveTo(x + dx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy);
    ctx.stroke();
  });

  // category tabs — chunky touch targets
  const tabY = headerH + 16;
  const tabH = 64;
  const tabGap = 14;
  const cats = FORMULA_CATALOG.categories;
  const tabW = Math.min(200, (W - 96 - tabGap * (cats.length - 1)) / cats.length);
  let tabX = 48;
  cats.forEach((cat) => {
    const on = cat.id === category;
    ctx.fillStyle = on ? 'rgba(14,165,233,0.28)' : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = on ? '#0284c7' : 'rgba(14,165,233,0.35)';
    ctx.lineWidth = on ? 3.5 : 2;
    roundRect(ctx, tabX, tabY, tabW, tabH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = on ? '#0c4a6e' : '#64748b';
    ctx.font = on
      ? 'bold 30px "Microsoft YaHei", sans-serif'
      : '28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.name, tabX + tabW / 2, tabY + tabH / 2);
    hits.push({
      id: `cat-${cat.id}`,
      x: tabX, y: tabY, w: tabW, h: tabH,
      action: 'category',
      categoryId: cat.id,
    });
    tabX += tabW + tabGap;
  });

  const contentTop = tabY + tabH + 22;
  const contentH = H - contentTop - 36;
  const pad = 44;

  if (!selected) {
    // list mode — formula cards in 2 columns
    ctx.fillStyle = '#64748b';
    ctx.font = '26px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`共 ${items.length} 条 · 选择一条查看详细概念`, pad, contentTop);

    const listTop = contentTop + 42;
    const cols = 2;
    const gapX = 28;
    const gapY = 20;
    const cardW = (W - pad * 2 - gapX) / cols;
    const cardH = 128;
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (cardW + gapX);
      const y = listTop + row * (cardH + gapY);
      if (y + cardH > H - 28) return;

      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.strokeStyle = 'rgba(14,165,233,0.4)';
      ctx.lineWidth = 2.5;
      roundRect(ctx, x, y, cardW, cardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(it.title, x + 22, y + 18);

      drawMathFormula(ctx, it.formula, x + 22, y + 88, {
        fontSize: 42,
        color: '#0c4a6e',
        align: 'left',
        maxWidth: cardW - 40,
      });

      hits.push({
        id: `item-${it.id}`,
        x, y, w: cardW, h: cardH,
        action: 'select',
        itemId: it.id,
      });
    });
  } else {
    // detail mode
    const backW = 180;
    const backH = 56;
    const backX = pad;
    const backY = contentTop;
    ctx.fillStyle = 'rgba(14,165,233,0.15)';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    roundRect(ctx, backX, backY, backW, backH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回列表', backX + backW / 2, backY + backH / 2);
    hits.push({
      id: 'back',
      x: backX, y: backY, w: backW, h: backH,
      action: 'back',
    });

    const detailX = pad;
    const detailY = contentTop + 72;
    const detailW = W - pad * 2;
    const detailH = contentH - 72;

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.strokeStyle = 'rgba(14,165,233,0.45)';
    ctx.lineWidth = 3;
    roundRect(ctx, detailX, detailY, detailW, detailH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 42px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(selected.title, detailX + 36, detailY + 28);

    // formula highlight box
    ctx.fillStyle = 'rgba(14,165,233,0.12)';
    roundRect(ctx, detailX + 36, detailY + 90, detailW - 72, 120, 16);
    ctx.fill();
    drawMathFormula(ctx, selected.formula, detailX + 56, detailY + 168, {
      fontSize: 58,
      color: '#0c4a6e',
      align: 'left',
      maxWidth: detailW - 100,
    });

    ctx.fillStyle = '#0e7490';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('概念解释', detailX + 36, detailY + 232);

    ctx.fillStyle = '#334155';
    ctx.font = '32px "Microsoft YaHei", sans-serif';
    const conceptLines = wrapText(ctx, selected.concept, detailW - 80);
    const lineH = 44;
    conceptLines.forEach((ln, i) => {
      ctx.fillText(ln, detailX + 36, detailY + 280 + i * lineH);
    });

    const symY = detailY + 280 + conceptLines.length * lineH + 28;
    const symH = 80;
    if (symY + symH < detailY + detailH - 16) {
      ctx.fillStyle = 'rgba(14,165,233,0.08)';
      roundRect(ctx, detailX + 36, symY, detailW - 72, symH, 14);
      ctx.fill();
      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
      ctx.fillText('符号说明', detailX + 56, symY + 14);
      ctx.fillStyle = '#0f172a';
      ctx.font = '28px Consolas, "Microsoft YaHei", monospace';
      ctx.fillText(selected.symbols, detailX + 56, symY + 46);
    }
  }

  return { hits };
}

export function pickFormulaBoard(u, v, W, H, hits) {
  if (!hits?.length || u == null || v == null) return null;
  // Plane UV: v often bottom-up
  const candidates = [
    [u * W, (1 - v) * H],
    [u * W, v * H],
    [(1 - u) * W, (1 - v) * H],
  ];
  for (const [px, py] of candidates) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
        return h;
      }
    }
  }
  return null;
}
