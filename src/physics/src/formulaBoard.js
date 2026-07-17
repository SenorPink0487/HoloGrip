/**
 * Interactive classroom formula board — browse formulas & concepts.
 * Drawn on canvas texture; UV hit-test like a touch screen.
 *
 * Layout/fonts sized for wall-scale readability (~1.4× classroom poster scale).
 */

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
    // 力学
    {
      id: 'newton2',
      cat: 'mechanics',
      title: '牛顿第二定律',
      formula: 'F = ma',
      concept: '物体加速度与所受合外力成正比，与质量成反比，方向与合外力相同。是经典力学的核心动力学方程。',
      symbols: 'F — 合外力 (N)　m — 质量 (kg)　a — 加速度 (m/s²)',
    },
    {
      id: 'kinetic',
      cat: 'mechanics',
      title: '动能',
      formula: 'Eₖ = ½mv²',
      concept: '物体因运动而具有的能量。动能定理：合外力做功等于动能变化。',
      symbols: 'Eₖ — 动能　m — 质量　v — 速率',
    },
    {
      id: 'pendulum',
      cat: 'mechanics',
      title: '单摆周期',
      formula: 'T = 2π√(L/g)',
      concept: '小角度近似下，单摆做简谐运动，周期与振幅无关，只与摆长 L 和重力加速度 g 有关。可用于测 g。',
      symbols: 'T — 周期　L — 摆长　g — 重力加速度',
    },
    {
      id: 'hooke',
      cat: 'mechanics',
      title: '胡克定律',
      formula: 'F = −kx',
      concept: '弹簧弹力与伸长量成正比，方向与形变相反。劲度系数 k 反映弹簧软硬。',
      symbols: 'k — 劲度系数　x — 形变量',
    },
    {
      id: 'shm',
      cat: 'mechanics',
      title: '简谐振动周期',
      formula: 'T = 2π√(m/k)',
      concept: '弹簧振子周期由质量与劲度系数决定，与振幅无关（理想情况）。',
      symbols: 'm — 质量　k — 劲度系数',
    },
    {
      id: 'momentum',
      cat: 'mechanics',
      title: '动量与冲量',
      formula: 'p = mv　·　I = FΔt = Δp',
      concept: '动量是矢量。冲量等于动量变化。封闭系统碰撞中动量守恒（牛顿摆演示）。',
      symbols: 'p — 动量　I — 冲量',
    },
    // 电磁
    {
      id: 'faraday',
      cat: 'electro',
      title: '法拉第电磁感应定律',
      formula: 'ε = −N dΦ_B/dt',
      concept: '闭合回路中磁通量变化会产生感应电动势。负号表示感应电动势的方向与磁通量变化相反。',
      symbols: 'ε — 感应电动势　N — 匝数　Φ_B — 磁通量',
    },
    {
      id: 'flux',
      cat: 'electro',
      title: '磁通量',
      formula: 'Φ_B = B·A = BA cosθ',
      concept: '穿过某一面积的磁感线“条数”。磁铁进出线圈时 Φ 变化，从而产生感应电动势。',
      symbols: 'B — 磁感应强度　A — 面积　θ — 夹角',
    },
    {
      id: 'ampere',
      cat: 'electro',
      title: '安培–麦克斯韦定律',
      formula: '∇ × B = μ₀J + μ₀ε₀ ∂E/∂t',
      concept: '电流与变化的电场都能产生磁场。是麦克斯韦方程组之一，预言了电磁波。',
      symbols: 'J — 电流密度　E — 电场',
    },
    {
      id: 'lorentz',
      cat: 'electro',
      title: '洛伦兹力',
      formula: 'F = q(E + v × B)',
      concept: '带电粒子在电磁场中受力：电场力 + 磁场力。磁场力不做功，只改变速度方向。',
      symbols: 'q — 电荷　v — 速度　E — 电场　B — 磁场',
    },
    {
      id: 'right_hand',
      cat: 'electro',
      title: '右手螺旋定则',
      formula: '四指电流 → 拇指 N 极',
      concept: '通电螺线管：四指沿电流环绕方向弯曲，拇指指向 N 极（磁场方向）。可用于判断指南针偏转。',
      symbols: '螺线管 · 电流 · 磁极',
    },
    {
      id: 'ohm',
      cat: 'electro',
      title: '欧姆定律',
      formula: 'U = IR',
      concept: '导体两端电压与通过的电流成正比，电阻 R 为比例系数（欧姆导体）。',
      symbols: 'U — 电压　I — 电流　R — 电阻',
    },
    // 光学
    {
      id: 'lens',
      cat: 'optics',
      title: '薄透镜成像公式',
      formula: '1/u + 1/v = 1/f',
      concept: '物距 u、像距 v 与焦距 f 的关系。凸透镜 f>0。实像 v>0，虚像 v<0（符号规则依教材约定）。',
      symbols: 'u — 物距　v — 像距　f — 焦距',
    },
    {
      id: 'lens_conj',
      cat: 'optics',
      title: '共轭法测焦距',
      formula: 'f = (L² − d²) / (4L)',
      concept: '物屏与像屏距 L>4f 固定，透镜有两个清晰位置，间距 d。两位置物像共轭互换。',
      symbols: 'L — 物屏像屏距　d — 两透镜位置间距　f — 焦距',
    },
    {
      id: 'snell',
      cat: 'optics',
      title: '折射定律（斯涅尔）',
      formula: 'n₁ sinθ₁ = n₂ sinθ₂',
      concept: '光从一种介质进入另一种介质时，入射角与折射角正弦之比等于折射率反比。',
      symbols: 'n — 折射率　θ — 入射/折射角',
    },
    {
      id: 'prism',
      cat: 'optics',
      title: '色散',
      formula: 'n = n(λ)',
      concept: '不同波长的光在介质中折射率不同，白光经棱镜色散成光谱。紫光偏折通常更大。',
      symbols: 'λ — 波长　n — 折射率',
    },
    {
      id: 'prism_min',
      cat: 'optics',
      title: '最小偏向角测折射率',
      formula: 'n = sin((A+δₘ)/2) / sin(A/2)',
      concept: '等边三棱镜在最小偏向时入射、出射对称。测得顶角 A 与最小偏向角 δₘ 即可求折射率 n。',
      symbols: 'A — 顶角　δₘ — 最小偏向角　n — 折射率',
    },
    {
      id: 'wave',
      cat: 'optics',
      title: '波速关系',
      formula: 'c = fλ',
      concept: '波速等于频率与波长的乘积。真空中光速 c ≈ 3×10⁸ m/s。',
      symbols: 'f — 频率　λ — 波长',
    },
    // 热学
    {
      id: 'calorimetry',
      cat: 'thermo',
      title: '热平衡（量热）',
      formula: 'c₁m₁ΔT₁ = c₂m₂ΔT₂',
      concept: '忽略热损失时，高温物体放出的热量等于低温物体吸收的热量。可测未知比热容。',
      symbols: 'c — 比热容　m — 质量　ΔT — 温度变化',
    },
    {
      id: 'fourier',
      cat: 'thermo',
      title: '傅里叶热传导定律',
      formula: 'j = −κ ∇T',
      concept: '热流密度与温度梯度成正比，方向从高温指向低温。κ 越大导热越快（铜 > 铝 > 铁）。',
      symbols: 'j — 热流密度　κ — 热导率　∇T — 温度梯度',
    },
    {
      id: 'ideal_gas',
      cat: 'thermo',
      title: '理想气体状态方程',
      formula: 'pV = nRT',
      concept: '理想气体压强、体积、物质的量与温度的关系。是热学基本方程之一。',
      symbols: 'p — 压强　V — 体积　T — 热力学温度　R — 气体常量',
    },
    // 量子
    {
      id: 'debroglie',
      cat: 'quantum',
      title: '德布罗意关系',
      formula: 'λ = h/p',
      concept: '实物粒子也具有波动性，波长与动量成反比。波粒二象性的定量表述。',
      symbols: 'h — 普朗克常量　p — 动量　λ — 德布罗意波长',
    },
    {
      id: 'photon',
      cat: 'quantum',
      title: '光子能量',
      formula: 'E = ħω = hν',
      concept: '光以光子形式传播能量，能量量子化，与频率成正比。',
      symbols: 'ħ = h/2π　ν — 频率　ω — 角频率',
    },
    {
      id: 'wavefn',
      cat: 'quantum',
      title: '平面波波函数',
      formula: 'Ψ(r,t) = Ae^{i(k·r−ωt)}',
      concept: '描述自由粒子的复波函数。|Ψ|² 给出概率密度（玻恩诠释）。',
      symbols: 'k — 波矢　ω — 角频率　A — 振幅',
    },
    {
      id: 'planck',
      cat: 'quantum',
      title: '普朗克关系',
      formula: 'E = nhν　(n = 0,1,2,…)',
      concept: '谐振子能量量子化，开启量子论。解释黑体辐射等经典物理无法说明的现象。',
      symbols: 'n — 量子数　h — 普朗克常量',
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
    const cardH = 108;
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

      ctx.fillStyle = '#0c4a6e';
      ctx.font = 'bold 36px Consolas, "SF Mono", monospace';
      ctx.fillText(it.formula, x + 22, y + 58);

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
    roundRect(ctx, detailX + 36, detailY + 90, detailW - 72, 88, 16);
    ctx.fill();
    ctx.fillStyle = '#0c4a6e';
    ctx.font = 'bold 48px Consolas, "SF Mono", monospace';
    ctx.fillText(selected.formula, detailX + 56, detailY + 112);

    ctx.fillStyle = '#0e7490';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('概念解释', detailX + 36, detailY + 204);

    ctx.fillStyle = '#334155';
    ctx.font = '32px "Microsoft YaHei", sans-serif';
    const conceptLines = wrapText(ctx, selected.concept, detailW - 80);
    const lineH = 44;
    conceptLines.forEach((ln, i) => {
      ctx.fillText(ln, detailX + 36, detailY + 252 + i * lineH);
    });

    const symY = detailY + 252 + conceptLines.length * lineH + 28;
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
