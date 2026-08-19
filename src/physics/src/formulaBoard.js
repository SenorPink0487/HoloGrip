/**
 * Interactive classroom formula board — clean sub-page hierarchical design.
 * Level 1: 实验室大厅 / 5大实验台总览 (Home Hub View)
 * Level 2: 实验台子页面 / 实验项目精选列表 (Clean Directory Cards — 无密集公式文本堆叠)
 * Level 3: 单实验深度解析看板 (Deep Dive — 完整展开公式、理论机理、SI量纲与3D实测)
 *
 * Drawn on 1920x900 canvas texture; UV hit-test like a touch screen.
 * 严格遵循人教版/大学物理标准，字体规范使用 FONT_STACKS 与 buildUiFont。
 */

import {
  FONT_STACKS,
  buildUiFont,
  buildMathVarFont,
  drawMathFormula,
  drawFormulaCardGroup,
} from './physicsFormula.js';

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

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(14, 165, 233, ${alpha})`;
  const cleanHex = hex.slice(1);
  const num = parseInt(cleanHex.length === 3 ? cleanHex.split('').map((c) => c + c).join('') : cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

/** 5 大实验台与 25 项项目实装实验知识库 */
export const FORMULA_CATALOG = {
  stations: [
    {
      id: 'mechanics',
      name: '力学实验台',
      en: 'MECHANICS STATION',
      color: '#0ea5e9',
      badge: '6 个实验项目',
      iconText: '🚀',
      desc: '自由落体 · 斜面动力学 · 单摆简谐 · 碰撞动量 · 抛体运动 · 液体粘度',
      expList: [
        '自由落体实验',
        '斜面运动实验',
        '单摆实验',
        '碰撞与动能实验',
        '抛体运动实验',
        '落球法测粘滞系数',
      ],
    },
    {
      id: 'electro',
      name: '电磁学实验台',
      en: 'ELECTRO STATION',
      color: '#ec4899',
      badge: '6 个实验项目',
      iconText: '⚡',
      desc: '法拉第感应 · 感生电场 · 静电场探索 · 高斯定理 · 霍尔效应 · 螺线管测磁',
      expList: [
        '法拉第电磁感应',
        '感生电场实验',
        '静电场探索实验',
        '静电场高斯定理',
        '霍尔效应原理',
        '霍尔效应测磁',
      ],
    },
    {
      id: 'optics',
      name: '光学实验台',
      en: 'OPTICS STATION',
      color: '#f59e0b',
      badge: '5 个实验项目',
      iconText: '🌈',
      desc: '光的反射 · 折射全反射 · 棱镜色散 · 透镜光路 · 单多缝衍射干涉',
      expList: [
        '光的反射实验',
        '光的折射实验',
        '光的色散实验',
        '透镜光路实验',
        '单缝衍射 · 多缝干涉',
      ],
    },
    {
      id: 'thermo',
      name: '热力学实验台',
      en: 'THERMO STATION',
      color: '#fb923c',
      badge: '5 个实验项目',
      iconText: '🔥',
      desc: '混合量热 · 固体热膨胀 · 稳态热传导 · 理想气体定律 · 自然对流换热',
      expList: [
        '混合量热实验',
        '固体热膨胀实验',
        '稳态热传导实验',
        '理想气体定律',
        '自然对流实验',
      ],
    },
    {
      id: 'chem',
      name: '化学微观台',
      en: 'CHEMISTRY STATION',
      color: '#8b5cf6',
      badge: '3 个实验项目',
      iconText: '🧪',
      desc: '试剂混合浓度 · 周期律与分子空间立体构型 · 质量守恒与化学计量',
      expList: [
        '试剂混合与溶液配制',
        '周期律与分子 3D 构型',
        '质量守恒与化学计量',
      ],
    },
  ],
  get categories() {
    return [
      { id: 'all', name: '全部实验', en: 'ALL LABS', color: '#0284c7', count: 25 },
      ...this.stations.map((s) => ({
        id: s.id,
        name: s.name,
        en: s.en,
        color: s.color,
        count: this.items.filter((it) => it.cat === s.id).length,
      })),
    ];
  },
  items: [
    // ════════════ 1. 力学实验台 ════════════
    {
      id: 'free_fall',
      cat: 'mechanics',
      expId: 'free-fall',
      expName: '自由落体实验',
      code: 'MECH-01',
      goal: '探究真空中重力加速度与物体质量无关规律及匀加速运动方程',
      tags: ['自由下落', '重力加速度 g', '光电测速'],
      title: '自由落体运动与重力加速度',
      formula: 'h=\\frac{1}{2}gt^{2}；v=\\sqrt{2gh}；t=\\sqrt{\\frac{2h}{g}}',
      concept: '物体只在重力作用下由静止开始下落的匀加速直线运动。真空中所有物体下落加速度相同，均等于当地重力加速度 g，与物体质量无关。',
      symbols: 'h — 下落高度 (m)　g — 重力加速度 (m/s²)　t — 下落时间 (s)　v — 落地瞬时速率 (m/s)',
      labLink: '力学实验台 · 自由落体：调节释放高度 h 与红蓝球质量 m₁/m₂，通过光电门测量时间并验证 g。',
    },
    {
      id: 'inclined_plane',
      cat: 'mechanics',
      expId: 'inclined-plane',
      expName: '斜面运动实验',
      code: 'MECH-02',
      goal: '测量斜面下滑加速度、摩擦因数及木块临界下滑倾角',
      tags: ['斜面动力学', '动摩擦因数 μ', '临界下滑角'],
      title: '斜面动力学与临界下滑角',
      formula: 'a=g(\\sin\\theta-\\mu\\cos\\theta)；\\tan\\theta_{c}=\\mu',
      concept: '物体在斜面上运动受重力分力与动摩擦力。当倾角增大至 tanθ_c = μ 时木块由静止转为加速下滑。',
      symbols: 'a — 下滑加速度 (m/s²)　θ — 斜面倾角 (°)　μ — 动摩擦因数　θ_c — 临界下滑角',
      labLink: '力学实验台 · 斜面运动：调节倾角 θ 与摩擦因数 μ，观察运动加速度并寻找临界角。',
    },
    {
      id: 'pendulum',
      cat: 'mechanics',
      expId: 'pendulum',
      expName: '单摆实验',
      code: 'MECH-03',
      goal: '研究单摆振动周期的等时性，验证摆长与重力加速度关系',
      tags: ['单摆周期', '摆长与 g', '小角简谐振动'],
      title: '单摆周期与小角简谐振动',
      formula: 'T=2\\pi\\sqrt{\\frac{l}{g}}；\\alpha=-\\frac{g}{l}\\sin\\theta',
      concept: '小摆角（θ ≤ 5°）下单摆做简谐运动，振动周期具有等时性，仅与摆长 l 和重力加速度 g 有关，与摆球质量无关。',
      symbols: 'T — 振动周期 (s)　l — 摆长 (m)　g — 重力加速度 (m/s²)　α — 角加速度',
      labLink: '力学实验台 · 单摆实验：改变摆长 L 与初始摆角 θ₀，对比小角简谐理论与阻尼大角度运动。',
    },
    {
      id: 'collision',
      cat: 'mechanics',
      expId: 'collision',
      expName: '碰撞与动能实验',
      code: 'MECH-04',
      goal: '在气垫导轨上检验一维碰撞中的动量守恒、能量转化与恢复系数',
      tags: ['动量守恒', '恢复系数 e', '速度交换'],
      title: '动量守恒定律与碰撞恢复系数',
      formula: 'm_{1}v_{1}+m_{2}v_{2}=m_{1}v_{1}\'+m_{2}v_{2}\'；e=\\frac{v_{2}\'-v_{1}\'}{v_{1}-v_{2}}',
      concept: '系统合外力为零时总动量守恒。完全弹性碰撞动能守恒（e = 1）；等质量完全弹性碰撞发生速度完全交换。',
      symbols: 'm — 质量 (kg)　v — 碰前速度 (m/s)　v\' — 碰后速度 (m/s)　e — 恢复系数',
      labLink: '力学实验台 · 碰撞实验：在气垫导轨切换弹性/非弹性模式，检验动量与动能变化。',
    },
    {
      id: 'projectile',
      cat: 'mechanics',
      expId: 'projectile',
      expName: '抛体运动实验',
      code: 'MECH-05',
      goal: '研究平抛与斜抛的正交分运动、飞行轨迹、射高与射程规律',
      tags: ['正交分运动', '初速度与仰角', '射高与射程'],
      title: '斜抛与平抛分运动轨迹',
      formula: 'x=v_{0}\\cos\\theta\\cdot t；y=v_{0}\\sin\\theta\\cdot t-\\frac{1}{2}gt^{2}',
      concept: '抛体运动可分解为水平匀速运动与竖直匀变速运动。发射仰角 45° 时射程最大；互补角射程相等。',
      symbols: 'v₀ — 初速度 (m/s)　θ — 发射仰角 (°)　x — 水平射程 (m)　y — 飞行高度 (m)',
      labLink: '力学实验台 · 抛体运动：开启频闪采样与分运动辅助线，对比射高、射程和飞行时间。',
    },
    {
      id: 'viscosity',
      cat: 'mechanics',
      expId: 'viscosity',
      expName: '落球法测粘滞系数',
      code: 'MECH-06',
      goal: '利用斯托克斯公式测定液体收尾速度与液体动力粘度',
      tags: ['液体粘滞阻力', '收尾速度', '管壁边界修正'],
      title: '斯托克斯公式与液体粘度测定',
      formula: '\\eta=\\frac{2r^{2}(\\rho-\\rho_{0})g}{9v(1+2.4r/R)}；v=\\frac{S}{\\Delta t}',
      concept: '小球在粘滞液体中达到收尾速度时重力、浮力与粘滞阻力平衡。采用 Stokes 定律结合管壁修正计算粘度。',
      symbols: 'η — 粘滞系数 (Pa·s)　r — 钢球半径 (m)　ρ — 钢球密度　ρ₀ — 液体密度　v — 终端速度',
      labLink: '力学实验台 · 粘滞系数：选择甘油/机油并释放钢球，通过双光电门测定终端速度。',
    },

    // ════════════ 2. 电磁学实验台 ════════════
    {
      id: 'faraday_induction',
      cat: 'electro',
      expId: 'faraday_induction',
      expName: '法拉第电磁感应实验',
      code: 'EM-01',
      goal: '研究动生与感生电动势，验证磁通量变化率与楞次定律方向',
      tags: ['磁通量变化', '感生/动生电动势', '楞次定律'],
      title: '法拉第电磁感应与楞次定律',
      formula: '\\mathcal{E}_{i}=-n\\frac{\\Delta\\Phi_{B}}{\\Delta t}；\\mathcal{E}=BLv',
      concept: '穿过闭合回路磁通量变化产生感应电动势。导体切割磁感线产生动生电动势；感应电流阻碍原磁通变化。',
      symbols: 'ℰ_i — 感应电动势 (V)　n — 线圈匝数　Φ_B — 磁通量 (Wb)　B — 磁感应强度 (T)',
      labLink: '电磁学实验台 · 电磁感应：拖动铜棒滑行或改变磁场强度，观察感生/动生电动势读数。',
    },
    {
      id: 'induced_electric_field',
      cat: 'electro',
      expId: 'induced_electric_field',
      expName: '感生电场实验',
      code: 'EM-02',
      goal: '观测随时间变化的磁场激发的闭合涡旋感生电场空间分布',
      tags: ['麦克斯韦方程', '涡旋电场', '柱内外场强'],
      title: '麦克斯韦涡旋感生电场',
      formula: '\\oint \\vec{E}_{k}\\cdot \\mathrm{d}\\vec{l}=-\\frac{\\mathrm{d}\\Phi_{B}}{\\mathrm{d}t}；E=\\frac{r}{2}\\left|\\frac{\\mathrm{d}B}{\\mathrm{d}t}\\right|',
      concept: '变化磁场激发闭合涡旋感生电场。圆柱磁场区内部场强与半径 r 成正比，外部与 1/r 成反比。',
      symbols: 'E_k — 感生电场强度 (V/m)　Φ_B — 磁通量 (Wb)　r — 离轴距离 (m)　dB/dt — 磁场变化率',
      labLink: '电磁学实验台 · 感生电场：拖动试探电荷在磁场柱内外移动，观察涡旋电场线与受力。',
    },
    {
      id: 'electric_field',
      cat: 'electro',
      expId: 'electric_field',
      expName: '静电场探索实验',
      code: 'EM-03',
      goal: '放置点电荷与试探电荷，观察空间电场线、等势面与库仑力',
      tags: ['库仑定律', '电场矢量叠加', '空间等势面'],
      title: '点电荷电场叠加与空间电势',
      formula: '\\vec{E}=\\frac{\\vec{F}}{q_{0}}；E=\\frac{1}{4\\pi\\varepsilon_{0}}\\frac{Q}{r^{2}}；\\varphi=\\frac{1}{4\\pi\\varepsilon_{0}}\\frac{Q}{r}',
      concept: '点电荷场强与距离平方成反比。空间多电荷满足电场矢量叠加原理；电场线与等势面处处正交。',
      symbols: 'E — 电场强度 (V/m)　Q — 场源电荷 (C)　φ — 电势 (V)　ε₀ — 真空介电常量',
      labLink: '电磁学实验台 · 静电场：放置点电荷与试探电荷，观察电力线、等势面与电势阱。',
    },
    {
      id: 'gauss_theorem',
      cat: 'electro',
      expId: 'electric_field',
      expName: '静电场高斯定理实验',
      code: 'EM-04',
      goal: '构建闭合高斯曲面，检验总电通量与内部包围净电荷的守恒关系',
      tags: ['高斯曲面', '电通量积分', '净电荷守恒'],
      title: '静电场高斯定理与通量守恒',
      formula: '\\Phi_{E}=\\oint \\vec{E}\\cdot \\mathrm{d}\\vec{S}=\\frac{Q_{内}}{\\varepsilon_{0}}',
      concept: '穿过任意闭合曲面的总电通量等于曲面所包围的净电荷代数和除以 ε₀，与面外电荷无关。',
      symbols: 'Φ_E — 电通量 (V·m)　E — 电场强度　Q内 — 闭合面内净电荷 (C)　S — 闭合高斯面',
      labLink: '电磁学实验台 · 静电场：构建闭合高斯面，检验电通量与内部净电荷量守恒关系。',
    },
    {
      id: 'hall_carrier_demo',
      cat: 'electro',
      expId: 'hall_carrier_demo',
      expName: '霍尔效应原理实验',
      code: 'EM-05',
      goal: '观察载流子受洛伦兹力偏转机理，判定 n 型电子与 p 型空穴导电极性',
      tags: ['洛伦兹力偏转', '横向霍尔电场', 'n/p 极性判定'],
      title: '霍尔效应微观机理与载流子',
      formula: 'U_{H}=K_{IB}\\cdot I\\cdot B；\\vec{F}=q(\\vec{E}+\\vec{v}\\times\\vec{B})',
      concept: '通电载流片置于磁场中，载流子受洛伦兹力偏转积累建立横向霍尔电场。正负判定 n/p 型。',
      symbols: 'U_H — 霍尔电势差 (V)　I — 工作电流 (A)　B — 磁感应强度 (T)　K_IB — 灵敏度',
      labLink: '电磁学实验台 · 霍尔原理：调节 I 与 B，切换 n/p 型半导体观察载流子偏转方向。',
    },
    {
      id: 'hall_effect',
      cat: 'electro',
      expId: 'hall_effect',
      expName: '霍尔效应测磁实验',
      code: 'EM-06',
      goal: '沿轴线移动标定霍尔探头，扫描亥姆霍兹线圈与长螺线管的磁场分布',
      tags: ['霍尔测磁仪', '亥姆霍兹匀强磁场', '轴线磁场扫描'],
      title: '亥姆霍兹线圈与螺线管磁场',
      formula: 'U_{H}=K_{H}I_{s}B；B_{H}=\\mu_{0}\\left(\\frac{4}{5}\\right)^{3/2}\\frac{NI}{R}',
      concept: '利用标定霍尔探头测量空间磁场。亥姆霍兹线圈中心区域高度均匀；长螺线管内部磁场均匀。',
      symbols: 'K_H — 探头灵敏度 (mV/(mA·T))　I_s — 霍尔电流 (mA)　B — 磁感应强度 (T)',
      labLink: '电磁学实验台 · 霍尔测磁：沿轴线移动探头，扫描线圈与螺线管的 B–X 空间曲线。',
    },

    // ════════════ 3. 光学实验台 ════════════
    {
      id: 'optics_reflection',
      cat: 'optics',
      expId: 'reflection',
      expName: '光的反射实验',
      code: 'OPT-01',
      goal: '验证光的反射定律，探究反射镜面旋转时出射光线的偏转倍率',
      tags: ['反射定律', '平面镜成像', '镜面旋转偏转'],
      title: '光的反射定律与镜面旋转偏转',
      formula: 'i=i\'；\\Delta\\theta_{r}=2\\alpha',
      concept: '反射角等于入射角。当平面镜绕法线垂直轴旋转 α 角时，反射光线偏转 2α 角。',
      symbols: 'i — 入射角 (°)　i\' — 反射角 (°)　α — 镜面旋转角 (°)　Δθ_r — 反射偏转角',
      labLink: '光学实验台 · 光的反射：旋转反射镜台并切换多光束/凸面镜，记录入射角与反射角。',
    },
    {
      id: 'optics_refraction',
      cat: 'optics',
      expId: 'refraction',
      expName: '光的折射实验',
      code: 'OPT-02',
      goal: '测量不同透明介质折射率，观察全反射临界角及平板玻璃侧移',
      tags: ['斯涅尔折射', '全反射临界角', '平板平行侧移'],
      title: '斯涅尔折射定律与全反射',
      formula: 'n_{1}\\sin i = n_{2}\\sin r；\\sin C=\\frac{n_{2}}{n_{1}}',
      concept: '光由光疏介质进入光密介质向法线偏折。入射角大于临界角 C 时折射光消失，发生全反射。',
      symbols: 'n₁、n₂ — 介质折射率　i — 入射角 (°)　r — 折射角 (°)　C — 全反射临界角',
      labLink: '光学实验台 · 光的折射：切换介质预设，观察光束偏折、全反射临界角及平板玻璃侧移。',
    },
    {
      id: 'optics_dispersion',
      cat: 'optics',
      expId: 'dispersion',
      expName: '光的色散实验',
      code: 'OPT-03',
      goal: '观察白光通过等边三棱镜的光谱展宽，测量三棱镜最小偏向角',
      tags: ['三棱镜分光', '折射率色散 n(λ)', '最小偏向角'],
      title: '三棱镜色散与最小偏向角',
      formula: 'n=n(\\lambda)；n=\\frac{\\sin[(A+\\delta_{m})/2]}{\\sin(A/2)}',
      concept: '透明介质对短波长紫光折射率大于长波长红光。白光经三棱镜色散成彩虹光谱。',
      symbols: 'n(λ) — 色散关系　A — 棱镜顶角 (°)　δ_m — 最小偏向角 (°)　λ — 光波长 (nm)',
      labLink: '光学实验台 · 光的色散：点亮白光入射等边三棱镜，在接收屏观察红到紫光谱展宽。',
    },
    {
      id: 'optics_lens',
      cat: 'optics',
      expId: 'lens',
      expName: '透镜光路实验',
      code: 'OPT-04',
      goal: '观察球透镜与柱面透镜光束会聚，采用共轭两次成像法精确测定焦距',
      tags: ['薄透镜成像', '共轭法测焦距', '柱面平行光会聚'],
      title: '薄透镜成像与共轭法测焦距',
      formula: '\\frac{1}{u}+\\frac{1}{v}=\\frac{1}{f}；f=\\frac{L^{2}-d^{2}}{4L}',
      concept: '凸透镜使平行光会聚。当物屏与像屏距离 L > 4f 时，存在两处清晰成像位置，间距为 d。',
      symbols: 'u — 物距 (m)　v — 像距 (m)　f — 透镜焦距 (m)　L — 物像屏距 (m)　d — 共轭位移',
      labLink: '光学实验台 · 透镜光路：选用球透镜与柱面透镜，观察光束会聚焦点并测量焦距。',
    },
    {
      id: 'optics_diffraction',
      cat: 'optics',
      expId: 'multi_slit_diffraction',
      expName: '单缝衍射 · 多缝干涉',
      code: 'OPT-05',
      goal: '研究光的波动性：调节缝宽、缝间距与波长，观察衍射与干涉图样',
      tags: ['夫琅禾费衍射', '双缝/多缝干涉', '明暗条纹光强'],
      title: '夫琅禾费衍射与多缝干涉条纹',
      formula: '\\sin\\theta=\\frac{\\lambda}{a}；\\Delta x=\\frac{\\lambda L}{d}；I(\\theta)=I_{0}\\left(\\frac{\\sin\\alpha}{\\alpha}\\right)^{2}\\left(\\frac{\\sin N\\beta}{\\sin\\beta}\\right)^{2}',
      concept: '单缝衍射中央亮纹由缝宽 a 决定；多缝干涉条纹间距由 d 决定。多缝受单缝衍射包络调制。',
      symbols: 'λ — 光波长 (nm)　a — 单缝宽度 (μm)　d — 双缝间距 (μm)　L — 屏距 (m)　Δx — 条纹间距',
      labLink: '光学实验台 · 衍射干涉：调节波长、缝宽与缝间距，在观察屏与强度曲线对照规律。',
    },

    // ════════════ 4. 热力学实验台 ════════════
    {
      id: 'thermo_calorimetry',
      cat: 'thermo',
      expId: 'calorimetry',
      expName: '混合量热实验',
      code: 'THERM-01',
      goal: '冷热水绝热混合，监测热平衡演化曲线并测定待测液体比热容',
      tags: ['热量传递', '热平衡温度', '比热容测定'],
      title: '热平衡方程与混合平衡温度',
      formula: 'Q=cm\\Delta t；Q_{放}=Q_{吸}；T_{eq}=\\frac{c_{1}m_{1}T_{1}+c_{2}m_{2}T_{2}}{c_{1}m_{1}+c_{2}m_{2}}',
      concept: '绝热系统内不同温度物质混合时发生热交换，高温放热等于低温吸热，达到平衡终温 T_eq。',
      symbols: 'Q — 热量 (J)　c — 比热容 (J/(kg·K))　m — 质量 (kg)　T_eq — 平衡终温 (°C)',
      labLink: '热力学实验台 · 混合量热：倒入冷热水，实时监测温度曲线并计算混合热平衡。',
    },
    {
      id: 'thermo_expansion',
      cat: 'thermo',
      expId: 'thermal-expansion',
      expName: '固体热膨胀实验',
      code: 'THERM-02',
      goal: '加热金属试样棒，测量微米级受热伸长量并测定线膨胀系数',
      tags: ['晶格热膨胀', '固体线膨胀定律', '金属材料对比'],
      title: '固体线膨胀定律与膨胀系数',
      formula: '\\Delta l=\\alpha l_{0}\\Delta t；l=l_{0}(1+\\alpha\\Delta t)',
      concept: '固体受热后原子点阵振动加剧使晶格膨胀。铝、铜、钢、殷钢等材料膨胀系数差异显著。',
      symbols: 'α — 线膨胀系数 (1/K)　l₀ — 试样初始长度 (m)　Δl — 伸长量 (mm)　Δt — 温升 (°C)',
      labLink: '热力学实验台 · 热膨胀：选择铝/铜/钢/殷钢试样棒加热，观察微米级伸长与读数。',
    },
    {
      id: 'thermo_conduction',
      cat: 'thermo',
      expId: 'heat-conduction',
      expName: '稳态热传导实验',
      code: 'THERM-03',
      goal: '设定热端与冷端恒温源，观测一维稳态线性温度分布与热通量',
      tags: ['傅里叶导热定律', '导热系数 k', '稳态温度分布'],
      title: '傅里叶导热定律与一维温度梯度',
      formula: '\\frac{\\mathrm{d}Q}{\\mathrm{d}t}=-kA\\frac{\\mathrm{d}T}{\\mathrm{d}x}；q=k\\frac{\\Delta T}{\\Delta x}',
      concept: '物体内部存在温度梯度时发生热传导。稳态下一维金属导热棒温度呈理想线性分布。',
      symbols: 'k — 导热系数 (W/(m·K))　A — 截面积 (m²)　dT/dx — 温度梯度 (K/m)　q — 热流密度',
      labLink: '热力学实验台 · 热传导：设定热冷端恒温源，观察试样管内稳态线性温度分布。',
    },
    {
      id: 'thermo_ideal_gas',
      cat: 'thermo',
      expId: 'ideal-gas',
      expName: '理想气体定律实验',
      code: 'THERM-04',
      goal: '推拉活塞改变气体体积与温度，验证 p-V-T 理想气体状态方程',
      tags: ['状态方程 pV=nRT', '分子平均动能', '等温/等容过程'],
      title: '理想气体状态方程与分子动能',
      formula: 'pV=nRT；p=\\frac{2}{3}n_{0}\\bar{\\varepsilon}_{k}；\\bar{\\varepsilon}_{k}=\\frac{3}{2}k_{B}T',
      concept: '一定质量理想气体满足 pV = nRT。温度是分子平均平动动能的标志，压强源于分子碰撞。',
      symbols: 'p — 气体压强 (Pa)　V — 气体体积 (m³)　T — 热力学温度 (K)　R — 摩尔气体常量',
      labLink: '热力学实验台 · 理想气体：推拉活塞改变体积，调节温度，验证 p-V-T 等温等压规律。',
    },
    {
      id: 'thermo_convection',
      cat: 'thermo',
      expId: 'convection',
      expName: '自然对流实验',
      code: 'THERM-05',
      goal: '调节热底板温度，观察封闭腔体内热浮力驱动的循环对流流动',
      tags: ['热浮力驱动', '牛顿冷却换热', '热羽流与 Ra 数'],
      title: '牛顿冷却定律与自然对流',
      formula: 'Q=hA\\Delta T；Ra=Gr\\cdot Pr',
      concept: '流体受热膨胀上升、遇冷收缩下沉，形成热浮力驱动对流。瑞利数 Ra 决定流动形态。',
      symbols: 'h — 换热系数 (W/(m²·K))　A — 换热面积 (m²)　ΔT — 壁面温差 (°C)　Ra — 瑞利数',
      labLink: '热力学实验台 · 自然对流：调节热底板温度，观察封闭腔体内热羽流演化与回流。',
    },
    {
      id: 'chem_molar',
      cat: 'chem',
      expId: 'reagent-mix',
      expName: '试剂混合与结构实验',
      code: 'CHEM-01',
      goal: '学习物质的量计量方法，完成不同浓度标准溶液的定量配制与混合',
      tags: ['物质的量 n', '物质的量浓度 c', '溶液稀释定理'],
      title: '物质的量与溶液浓度配制',
      formula: 'n=\\frac{m}{M}=\\frac{N}{N_{A}}；c=\\frac{n}{V}；c_{1}V_{1}=c_{2}V_{2}',
      concept: '物质的量 n 连接微观与宏观。溶液稀释前后溶质物质的量守恒，用于精准配制标准溶液。',
      symbols: 'n — 物质的量 (mol)　M — 摩尔质量 (g/mol)　c — 物质的量浓度 (mol/L)　V — 溶液体积',
      labLink: '化学实验台 · 试剂混合：在烧杯中添加无机试剂与溶剂，倾倒混合并查看成分浓度。',
    },
    {
      id: 'chem_structure',
      cat: 'chem',
      expId: 'reagent-mix',
      expName: '试剂混合与结构实验',
      code: 'CHEM-02',
      goal: '点选元素周期表试剂，在实验台生成并观察分子空间 3D 球棍立体构型',
      tags: ['元素周期律', '分子 3D 空间构型', 'SDF 势场模型'],
      title: '元素周期律与分子空间立体构型',
      formula: '\\Delta E = h\\nu；\\phi(\\vec{r})=\\text{SDF}(\\vec{r})',
      concept: '元素性质随原子序数递增呈周期性变化。分子空间构型由原子共价键与价层电子对互斥决定。',
      symbols: 'Z — 原子序数　h — 普朗克常量　ν — 跃迁频率　SDF — 空间带符号距离场',
      labLink: '化学实验台 · 分子结构：点选元素周期表试剂，在实验台全息展示分子的 3D 球棍立体构型。',
    },
    {
      id: 'chem_reaction',
      cat: 'chem',
      expId: 'reagent-mix',
      expName: '试剂混合与结构实验',
      code: 'CHEM-03',
      goal: '混合反应试剂验证质量守恒定律及反应物产物化学计量数配比',
      tags: ['质量守恒定律', '化学计量数配平', '沉淀反应平衡'],
      title: '质量守恒定律与化学计量反应',
      formula: '\\sum m_{\\text{反应物}}=\\sum m_{\\text{生成物}}；\\frac{\\Delta n_{A}}{\\nu_{A}}=\\frac{\\Delta n_{B}}{\\nu_{B}}',
      concept: '化学反应前后原子的种类、数目与质量守恒。反应物消耗量与生成物按化学计量比转化。',
      symbols: 'm — 质量 (g)　ν_A, ν_B — 化学计量数　Δn — 反应消耗/生成的物质的量 (mol)',
      labLink: '化学实验台 · 反应实验：混合酸碱或沉淀反应试剂，观察颜色变化与沉淀生成产物平衡。',
    },
  ],
};

function drawHomeView(ctx, W, H, hits) {
  const stations = FORMULA_CATALOG.stations;
  const headerH = 100;
  const padX = 40;
  const cardTop = 128;
  const gapX = 20;
  const cardW = (W - padX * 2 - gapX * (stations.length - 1)) / stations.length;
  const cardH = H - cardTop - 36;

  ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(W, headerH); ctx.stroke();
  ctx.fillStyle = '#10b981';
  ctx.beginPath(); ctx.arc(44, headerH / 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0369a1';
  ctx.font = buildUiFont(36, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHYSICS LABORATORY  ·  物理实验知识大厅', 64, headerH / 2);

  stations.forEach((st, i) => {
    const x = padX + i * (cardW + gapX);
    const y = cardTop;

    // 卡片背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = hexToRgba(st.color, 0.45);
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, y, cardW, cardH, 22);
    ctx.fill();
    ctx.stroke();

    // 顶部主题色带
    ctx.fillStyle = st.color;
    roundRect(ctx, x + 4, y + 4, cardW - 8, 10, 5);
    ctx.fill();

    // 居中大图标外圈圆盘 (直径 130px)
    const iconCenterY = y + 160;
    const iconR = 65;
    ctx.fillStyle = hexToRgba(st.color, 0.12);
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + cardW / 2, iconCenterY, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 实验台大图标
    ctx.font = buildUiFont(64, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.iconText, x + cardW / 2, iconCenterY);

    // 实验台主标题 (38px 超大号醒目字体)
    ctx.fillStyle = '#0f172a';
    ctx.font = buildUiFont(38, 'bold');
    ctx.fillText(st.name, x + cardW / 2, y + 280);

    // 英文标识 (18px)
    ctx.fillStyle = '#64748b';
    ctx.font = buildUiFont(18, 'bold');
    ctx.fillText(st.en, x + cardW / 2, y + 330);

    // 实验数量大胶囊徽章 (22px，采用主题色)
    const badgeW = 190;
    const badgeH = 50;
    const badgeY = y + 380;
    ctx.fillStyle = hexToRgba(st.color, 0.14);
    ctx.strokeStyle = hexToRgba(st.color, 0.4);
    ctx.lineWidth = 1.8;
    roundRect(ctx, x + (cardW - badgeW) / 2, badgeY, badgeW, badgeH, 25);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = st.color;
    ctx.font = buildUiFont(22, 'bold');
    ctx.fillText(st.badge, x + cardW / 2, badgeY + badgeH / 2);

    // 底部超大高亮进入按钮 (76px 高度，采用实验台主题色纯色填充 + 纯白文字，色彩准确醒目)
    const btnW = cardW - 44;
    const btnH = 76;
    const btnX = x + 22;
    const btnY = y + cardH - btnH - 32;

    ctx.fillStyle = st.color;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 2;
    roundRect(ctx, btnX, btnY, btnW, btnH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = buildUiFont(26, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('进入实验台 ➔', btnX + btnW / 2, btnY + btnH / 2);

    hits.push({
      id: `station-${st.id}`,
      x,
      y,
      w: cardW,
      h: cardH,
      action: 'station',
      stationId: st.id,
    });
  });
}

// ═════════════════════════════════════════════════════════
// 页面 2：实验台子页面 (Station Sub-page View) — 纯净目录卡片、大字号大按钮
// ═════════════════════════════════════════════════════════
function drawStationSubpageView(ctx, W, H, stationId, hits) {
  const st = FORMULA_CATALOG.stations.find((s) => s.id === stationId) || FORMULA_CATALOG.stations[0];
  const items = FORMULA_CATALOG.items.filter((it) => it.cat === st.id);
  const headerH = 92;
  const padX = 40;

  // 顶部导航栏背景
  ctx.fillStyle = hexToRgba(st.color, 0.12);
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = hexToRgba(st.color, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(W, headerH); ctx.stroke();

  // 返回大厅按钮 (加大，主题色描边与文字)
  const backW = 210;
  const backH = 52;
  const backX = padX;
  const backY = (headerH - backH) / 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = st.color;
  ctx.lineWidth = 2.2;
  roundRect(ctx, backX, backY, backW, backH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(22, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← 返回大厅', backX + backW / 2, backY + backH / 2);

  hits.push({
    id: 'back-home',
    x: backX,
    y: backY,
    w: backW,
    h: backH,
    action: 'home',
  });

  // 面包屑导航与当前实验台标题 (加大)
  ctx.fillStyle = '#64748b';
  ctx.font = buildUiFont(20, 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('实验室大厅  /  ', backX + backW + 28, headerH / 2);

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(28, 'bold');
  const breadcrumbText = `${st.name} · ${st.badge}`;
  ctx.fillText(breadcrumbText, backX + backW + 155, headerH / 2);

  // 右侧快速横向切换实验台 Tab (加大)
  const quickStations = FORMULA_CATALOG.stations;
  const qGap = 10;
  const qW = 115;
  const qH = 46;
  const qTotalW = quickStations.length * qW + (quickStations.length - 1) * qGap;
  let qX = W - padX - qTotalW;
  const qY = (headerH - qH) / 2;

  quickStations.forEach((otherSt) => {
    const isCur = otherSt.id === st.id;
    ctx.fillStyle = isCur ? otherSt.color : 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = isCur ? otherSt.color : hexToRgba(otherSt.color, 0.4);
    ctx.lineWidth = 2;
    roundRect(ctx, qX, qY, qW, qH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isCur ? '#ffffff' : otherSt.color;
    ctx.font = buildUiFont(18, isCur ? 'bold' : '600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(otherSt.name.slice(0, 3), qX + qW / 2, qY + qH / 2);

    hits.push({
      id: `tab-st-${otherSt.id}`,
      x: qX,
      y: qY,
      w: qW,
      h: qH,
      action: 'station',
      stationId: otherSt.id,
    });
    qX += qW + qGap;
  });

  // 实验卡片大尺寸网格（3 列 × 2 行，极简纯净，超大标题与超大按钮）
  const gridTop = headerH + 28;
  const cols = 3;
  const rows = 2;
  const gapX = 24;
  const gapY = 24;
  const cardW = (W - padX * 2 - gapX * (cols - 1)) / cols;
  const cardH = (H - gridTop - 32 - gapY * (rows - 1)) / rows;

  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gapX);
    const y = gridTop + row * (cardH + gapY);

    // 卡片外框
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = hexToRgba(st.color, 0.45);
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, y, cardW, cardH, 22);
    ctx.fill();
    ctx.stroke();

    // 顶部主题小色带
    ctx.fillStyle = st.color;
    roundRect(ctx, x + 4, y + 4, cardW - 8, 8, 4);
    ctx.fill();

    // 顶部编号胶囊 (居左，采用主题色)
    ctx.font = buildUiFont(16, 'bold');
    const codeText = `${it.code}`;
    const codeW = ctx.measureText(codeText).width + 24;
    const codeH = 34;
    ctx.fillStyle = hexToRgba(st.color, 0.14);
    ctx.strokeStyle = hexToRgba(st.color, 0.4);
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 24, y + 24, codeW, codeH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = st.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(codeText, x + 24 + codeW / 2, y + 24 + codeH / 2);

    // 实验主标题 (42px 超大号醒目粗体字，绝对居中)
    ctx.fillStyle = '#0f172a';
    ctx.font = buildUiFont(40, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.expName, x + cardW / 2, y + 148);

    // 底部超大高亮进入按钮 (72px 高度，采用主题色纯色填充 + 纯白文字)
    const btnW = cardW - 56;
    const btnH = 72;
    const btnX = x + 28;
    const btnY = y + cardH - btnH - 28;

    ctx.fillStyle = st.color;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 2;
    roundRect(ctx, btnX, btnY, btnW, btnH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = buildUiFont(26, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('进入实验 ➔', btnX + btnW / 2, btnY + btnH / 2);

    hits.push({
      id: `item-${it.id}`,
      x,
      y,
      w: cardW,
      h: cardH,
      action: 'select',
      itemId: it.id,
    });
  });
}

// ═════════════════════════════════════════════════════════
// 页面 3：单实验深度解析页 (Experiment Detail View) — 展开标准公式组、物理机理、SI符号与3D实测
// ═════════════════════════════════════════════════════════
function drawExperimentDetailView(ctx, W, H, state, hits) {
  const selected = FORMULA_CATALOG.items.find((it) => it.id === state.selectedId) || FORMULA_CATALOG.items[0];
  const st = FORMULA_CATALOG.stations.find((s) => s.id === selected.cat) || FORMULA_CATALOG.stations[0];
  const itemsInSt = FORMULA_CATALOG.items.filter((it) => it.cat === selected.cat);
  const curIdx = itemsInSt.findIndex((it) => it.id === selected.id);

  const headerH = 92;
  const padX = 40;

  // 顶部 Header
  ctx.fillStyle = hexToRgba(st.color, 0.14);
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = hexToRgba(st.color, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(W, headerH); ctx.stroke();

  // 返回实验列表按钮 (大字号、主题色)
  const backW = 210;
  const backH = 50;
  const backX = padX;
  const backY = (headerH - backH) / 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = st.color;
  ctx.lineWidth = 2.2;
  roundRect(ctx, backX, backY, backW, backH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(22, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← 返回实验列表', backX + backW / 2, backY + backH / 2);

  hits.push({
    id: 'back-station',
    x: backX,
    y: backY,
    w: backW,
    h: backH,
    action: 'back',
  });

  // 面包屑导航与当前实验标题 (加大加粗)
  ctx.fillStyle = '#64748b';
  ctx.font = buildUiFont(20, 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('大厅  /  ', backX + backW + 24, headerH / 2);

  ctx.fillStyle = st.color;
  ctx.fillText(`${st.name}  /  `, backX + backW + 96, headerH / 2);

  ctx.fillStyle = '#0c4a6e';
  ctx.font = buildUiFont(26, 'bold');
  ctx.fillText(`${selected.expName} · ${selected.title}`, backX + backW + 240, headerH / 2);

  // 右侧上一实验 / 下一实验切换按钮 (大字号、高对比)
  const navBtnW = 135;
  const navBtnH = 46;
  const nextX = W - padX - navBtnW;
  const prevX = nextX - navBtnW - 14;
  const navY = (headerH - navBtnH) / 2;

  const hasPrev = curIdx > 0;
  ctx.fillStyle = hasPrev ? st.color : 'rgba(203, 213, 225, 0.3)';
  ctx.strokeStyle = hasPrev ? st.color : 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1.8;
  roundRect(ctx, prevX, navY, navBtnW, navBtnH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hasPrev ? '#ffffff' : '#94a3b8';
  ctx.font = buildUiFont(18, 'bold');
  ctx.textAlign = 'center';
  ctx.fillText('◀ 上一实验', prevX + navBtnW / 2, navY + navBtnH / 2);

  if (hasPrev) {
    hits.push({
      id: 'nav-prev',
      x: prevX,
      y: navY,
      w: navBtnW,
      h: navBtnH,
      action: 'nav',
      itemId: itemsInSt[curIdx - 1].id,
    });
  }

  const hasNext = curIdx < itemsInSt.length - 1;
  ctx.fillStyle = hasNext ? st.color : 'rgba(203, 213, 225, 0.3)';
  ctx.strokeStyle = hasNext ? st.color : 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1.8;
  roundRect(ctx, nextX, navY, navBtnW, navBtnH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hasNext ? '#ffffff' : '#94a3b8';
  ctx.font = buildUiFont(18, 'bold');
  ctx.fillText('下一实验 ▶', nextX + navBtnW / 2, navY + navBtnH / 2);

  if (hasNext) {
    hits.push({
      id: 'nav-next',
      x: nextX,
      y: navY,
      w: navBtnW,
      h: navBtnH,
      action: 'nav',
      itemId: itemsInSt[curIdx + 1].id,
    });
  }

  // 左右双主卡片分栏布局 (左侧标准公式与物理量说明，右侧理论与实测指引)
  const contentTop = headerH + 20;
  const contentH = H - contentTop - 24;
  const gap = 28;
  const cardW = (W - padX * 2 - gap) / 2;
  const leftX = padX;
  const rightX = leftX + cardW + gap;

  // ════════════ 左侧主卡片 ════════════
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = hexToRgba(st.color, 0.45);
  ctx.lineWidth = 2.5;
  roundRect(ctx, leftX, contentTop, cardW, contentH, 20);
  ctx.fill();
  ctx.stroke();

  // 左侧顶部主题色带
  ctx.fillStyle = st.color;
  roundRect(ctx, leftX + 4, contentTop + 4, cardW - 8, 8, 4);
  ctx.fill();

  // 编号胶囊与实验分类
  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(22, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`【${selected.code} · ${selected.expName}】`, leftX + 28, contentTop + 24);

  // 主标题 (34px 超大号醒目字体)
  ctx.fillStyle = '#0f172a';
  ctx.font = buildUiFont(34, 'bold');
  ctx.fillText(selected.title, leftX + 28, contentTop + 58);

  // 核心公式展示区大盒 (支持多公式分栏 2D 专业排版)
  const fBoxX = leftX + 24;
  const fBoxY = contentTop + 106;
  const fBoxW = cardW - 48;
  const fBoxH = 240;

  ctx.fillStyle = hexToRgba(st.color, 0.06);
  ctx.strokeStyle = hexToRgba(st.color, 0.35);
  ctx.lineWidth = 1.8;
  roundRect(ctx, fBoxX, fBoxY, fBoxW, fBoxH, 16);
  ctx.fill();
  ctx.stroke();

  // 调用专业 2D 多公式分栏卡片渲染引擎
  drawFormulaCardGroup(
    ctx,
    selected.formulaCards || selected.formula,
    fBoxX + 16,
    fBoxY + 16,
    fBoxW - 32,
    fBoxH - 32,
    { themeColor: st.color },
  );

  // 📐 物理量与符号说明 (SI 标准) — 饱满大字号双列网格/列表卡片
  const symBoxY = fBoxY + fBoxH + 20;
  const symBoxH = contentH - (symBoxY - contentTop) - 24;

  ctx.fillStyle = hexToRgba(st.color, 0.05);
  ctx.strokeStyle = hexToRgba(st.color, 0.28);
  ctx.lineWidth = 1.5;
  roundRect(ctx, fBoxX, symBoxY, fBoxW, symBoxH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(24, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('📐 物理量与符号说明 (SI 标准)', fBoxX + 24, symBoxY + 18);

  // 解析符号列表并排版
  const rawTokens = (selected.symbols || '').split('　').map((t) => t.trim()).filter(Boolean);
  const parsedSymbols = rawTokens.map((tok) => {
    const parts = tok.split('—').map((p) => p.trim());
    return {
      sym: parts[0] || '',
      desc: parts.slice(1).join(' — ') || '',
    };
  });

  const symCount = parsedSymbols.length;
  const useTwoCols = symCount > 3;
  const cols = useTwoCols ? 2 : 1;
  const itemGapX = 18;
  const itemGapY = 12;
  const itemW = (fBoxW - 48 - itemGapX * (cols - 1)) / cols;
  const startItemY = symBoxY + 60;
  const rows = Math.ceil(symCount / cols);
  const availableH = symBoxH - 74;
  const itemH = Math.min(64, Math.max(50, (availableH - itemGapY * (rows - 1)) / rows));

  parsedSymbols.forEach((item, sIdx) => {
    const col = sIdx % cols;
    const row = Math.floor(sIdx / cols);
    const ix = fBoxX + 24 + col * (itemW + itemGapX);
    const iy = startItemY + row * (itemH + itemGapY);

    if (iy + itemH <= symBoxY + symBoxH - 8) {
      // 符号小卡片外框
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = hexToRgba(st.color, 0.3);
      ctx.lineWidth = 1.2;
      roundRect(ctx, ix, iy, itemW, itemH, 10);
      ctx.fill();
      ctx.stroke();

      // 左侧物理量符号胶囊徽章 (大字号数学公式渲染)
      const badgeW = 72;
      const badgeH = itemH - 12;
      const badgeX = ix + 6;
      const badgeY = iy + 6;

      ctx.fillStyle = hexToRgba(st.color, 0.14);
      ctx.strokeStyle = hexToRgba(st.color, 0.4);
      ctx.lineWidth = 1.2;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 7);
      ctx.fill();
      ctx.stroke();

      drawMathFormula(ctx, item.sym, badgeX + badgeW / 2, badgeY + badgeH / 2, {
        fontSize: 24,
        color: st.color,
        align: 'center',
        textBaseline: 'middle',
        maxWidth: badgeW - 6,
      });

      // 右侧中文说明与 SI 单位
      ctx.fillStyle = '#1e293b';
      ctx.font = buildUiFont(21, '600');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.desc, ix + badgeW + 16, iy + itemH / 2);
    }
  });

  // ════════════ 右侧主卡片 ════════════
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = hexToRgba(st.color, 0.45);
  ctx.lineWidth = 2.5;
  roundRect(ctx, rightX, contentTop, cardW, contentH, 20);
  ctx.fill();
  ctx.stroke();

  // 右侧顶部主题色带
  ctx.fillStyle = st.color;
  roundRect(ctx, rightX + 4, contentTop + 4, cardW - 8, 8, 4);
  ctx.fill();

  // 右上模块：📘 实验理论与物理机理 (大字号，深色饱满排版)
  const mechBoxY = contentTop + 24;
  const mechBoxH = 340;
  const mechBoxW = cardW - 48;
  const mechBoxX = rightX + 24;

  ctx.fillStyle = hexToRgba(st.color, 0.05);
  ctx.strokeStyle = hexToRgba(st.color, 0.28);
  ctx.lineWidth = 1.5;
  roundRect(ctx, mechBoxX, mechBoxY, mechBoxW, mechBoxH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(26, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('📘 实验理论与物理机理', mechBoxX + 24, mechBoxY + 20);

  ctx.fillStyle = '#1e293b';
  ctx.font = buildUiFont(25, '500');
  const conceptLines = wrapText(ctx, selected.concept, mechBoxW - 48);
  conceptLines.forEach((ln, idx) => {
    ctx.fillText(ln, mechBoxX + 24, mechBoxY + 70 + idx * 42);
  });

  // 右下模块：🔬 3D 实验室实测与操作指引 (大字号)
  const labBoxY = mechBoxY + mechBoxH + 20;
  const labBoxH = contentH - (labBoxY - contentTop) - 24;

  ctx.fillStyle = hexToRgba(st.color, 0.05);
  ctx.strokeStyle = hexToRgba(st.color, 0.28);
  ctx.lineWidth = 1.5;
  roundRect(ctx, mechBoxX, labBoxY, mechBoxW, labBoxH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = st.color;
  ctx.font = buildUiFont(26, 'bold');
  ctx.fillText('🔬 3D 实验室实测与操作指引', mechBoxX + 24, labBoxY + 20);

  ctx.fillStyle = '#1e293b';
  ctx.font = buildUiFont(25, '500');
  const labLines = wrapText(ctx, selected.labLink, mechBoxW - 48);
  labLines.forEach((ln, idx) => {
    ctx.fillText(ln, mechBoxX + 24, labBoxY + 70 + idx * 42);
  });
}

export function drawFormulaBoard(ctx, W, H, state = {}) {
  const hits = [];
  const stationId = state.stationId
    || (state.category && state.category !== 'all' ? state.category : null);
  const selectedId = state.selectedId || null;
  const background = ctx.createLinearGradient(0, 0, W, H);
  background.addColorStop(0, '#f8fafc');
  background.addColorStop(0.5, '#f1f5f9');
  background.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  if (selectedId) drawExperimentDetailView(ctx, W, H, state, hits);
  else if (stationId) drawStationSubpageView(ctx, W, H, stationId, hits);
  else drawHomeView(ctx, W, H, hits);
  return { hits };
}

/**
 * UV 交互坐标拾取。
 * @param {number} u
 * @param {number} v
 * @param {number} W
 * @param {number} H
 * @param {Array} hits
 */
export function pickFormulaBoard(u, v, W, H, hits) {
  if (!hits?.length || u == null || v == null) return null;
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
