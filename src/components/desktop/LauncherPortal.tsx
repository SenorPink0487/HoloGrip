import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { 
  Sparkles, 
  Atom, 
  FlaskConical, 
  Rocket, 
  CircleDot,
  ArrowUpRight,
  Command,
  Sparkle,
  Wifi,
  Battery,
  Sliders,
  Compass
} from 'lucide-react';
import { useARStore, AppTab } from '../../store';

interface LaunchApp {
  id: string;
  tab: AppTab;
  name: string;
  enName: string;
  tagline: string;
  icon: React.ReactNode;
  gradient: string;
  glowColor: string;
  accentBorder: string;
  badge: string;
  specularGradient: string;
}

export function LauncherPortal() {
  const setActiveTab = useARStore(state => state.setActiveTab);
  const [timeStr, setTimeStr] = useState<string>('');

  // 实时时钟 (Apple Vision OS Top Bar Time)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const apps: LaunchApp[] = [
    {
      id: 'math',
      tab: 'whiteboard',
      name: 'HoloMath',
      enName: 'Spatial Geometry',
      tagline: '空间几何与曲面分析',
      icon: <Sparkles className="w-9 h-9 text-white drop-shadow-[0_4px_12px_rgba(6,182,212,0.8)]" />,
      gradient: 'from-cyan-400 via-blue-500 to-indigo-600',
      glowColor: 'rgba(6, 182, 212, 0.65)',
      accentBorder: 'rgba(56, 189, 248, 0.5)',
      badge: '几何学',
      specularGradient: 'from-cyan-400/20 via-blue-500/10 to-transparent',
    },
    {
      id: 'physics',
      tab: 'physics',
      name: 'HoloPhysics',
      enName: 'Mechanics & Fields',
      tagline: '经典力学与电磁场',
      icon: <Atom className="w-9 h-9 text-white drop-shadow-[0_4px_12px_rgba(245,158,11,0.8)] animate-[spin_10s_linear_infinite]" />,
      gradient: 'from-amber-400 via-orange-500 to-red-600',
      glowColor: 'rgba(245, 158, 11, 0.65)',
      accentBorder: 'rgba(251, 146, 60, 0.5)',
      badge: '物理场',
      specularGradient: 'from-amber-400/20 via-orange-500/10 to-transparent',
    },
    {
      id: 'chem',
      tab: 'chem',
      name: 'HoloChem',
      enName: 'Molecular Synthesizer',
      tagline: '晶体结构与 AI 分子',
      icon: <FlaskConical className="w-9 h-9 text-white drop-shadow-[0_4px_12px_rgba(16,185,129,0.8)]" />,
      gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
      glowColor: 'rgba(16, 185, 129, 0.65)',
      accentBorder: 'rgba(52, 211, 153, 0.5)',
      badge: '分子式',
      specularGradient: 'from-emerald-400/20 via-teal-500/10 to-transparent',
    },
    {
      id: 'rocket',
      tab: 'rocket',
      name: 'HoloRocket',
      enName: 'Vector Orbit',
      tagline: '火箭推进与离心轨道',
      icon: <Rocket className="w-9 h-9 text-white drop-shadow-[0_4px_12px_rgba(217,70,239,0.8)]" />,
      gradient: 'from-fuchsia-500 via-pink-500 to-rose-600',
      glowColor: 'rgba(217, 70, 239, 0.65)',
      accentBorder: 'rgba(244, 114, 182, 0.5)',
      badge: '航天轨',
      specularGradient: 'from-fuchsia-400/20 via-pink-500/10 to-transparent',
    },
    {
      id: 'pool',
      tab: 'pool',
      name: 'HoloPool',
      enName: 'Impulse Billiards',
      tagline: '刚体碰撞与动量预测',
      icon: <CircleDot className="w-9 h-9 text-white drop-shadow-[0_4px_12px_rgba(99,102,241,0.8)]" />,
      gradient: 'from-blue-500 via-indigo-600 to-violet-700',
      glowColor: 'rgba(99, 102, 241, 0.65)',
      accentBorder: 'rgba(129, 140, 248, 0.5)',
      badge: '动力学',
      specularGradient: 'from-indigo-400/20 via-violet-500/10 to-transparent',
    },
  ];

  return (
    <div className="w-screen h-screen overflow-hidden relative select-none bg-[#02050c] text-white flex flex-col items-center justify-between font-sans py-6 px-8 antialiased">
      
      {/* 1. 奢华微纹理噪点遮罩 (High-End Tactile Film Grain) */}
      <div 
        className="fixed inset-0 pointer-events-none z-10 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* 2. 动态光场背景 (Raytraced Spatial Fluid Aurora) */}
      <div className="fixed top-[-10%] left-[-5%] w-[800px] h-[600px] bg-gradient-to-tr from-cyan-600/20 via-blue-600/15 to-indigo-900/10 rounded-full blur-[180px] pointer-events-none animate-[pulse_7s_ease-in-out_infinite]" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[850px] h-[650px] bg-gradient-to-br from-purple-600/20 via-pink-600/15 to-rose-900/10 rounded-full blur-[190px] pointer-events-none animate-[pulse_9s_ease-in-out_infinite_2s]" />

      {/* 3. 苹果 Vision OS 系统顶栏 (Apple Vision OS Top Status Bar) */}
      <header className="relative z-30 w-full max-w-7xl flex items-center justify-between px-4">
        {/* 左侧系统与状态 */}
        <div className="flex items-center gap-3">
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 backdrop-blur-2xl text-xs font-mono text-zinc-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="font-bold text-white tracking-widest">HOLOGRIP OS</span>
            <span className="text-zinc-500">|</span>
            <span className="text-cyan-400 font-sans text-[11px]">v2.4 Spatial</span>
          </motion.div>
        </div>

        {/* 中央灵动岛/标语 */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden md:flex items-center gap-2 px-5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-2xl shadow-xl text-xs font-medium text-zinc-300"
        >
          <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
          <span className="tracking-wide">无界人机交互 • 多维空间实验室</span>
        </motion.div>

        {/* 右侧小组件 (时间、网络、电池) */}
        <motion.div 
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 backdrop-blur-2xl text-xs text-zinc-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        >
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <Battery className="w-4 h-4 text-zinc-300" />
          <span className="font-mono font-semibold text-white tracking-wider text-xs pl-1">{timeStr || '19:25'}</span>
        </motion.div>
      </header>

      {/* 4. 界面中央 - 5 个极致高级感 Apple Liquid Glass 启动卡片 */}
      <main className="relative z-20 w-full max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 my-auto px-2">
        {apps.map((app, idx) => (
          <LuxuryAppleCard key={app.id} app={app} index={idx} onLaunch={() => setActiveTab(app.tab)} />
        ))}
      </main>

      {/* 5. 底部高阶黑卡玻璃脚栏 (Apple Vision OS Dock Footer) */}
      <footer className="relative z-30 mb-1">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4 px-6 py-2.5 rounded-full bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-white/[0.06] border border-white/15 backdrop-blur-3xl text-xs text-zinc-300 shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
        >
          <div className="p-1 rounded-full bg-cyan-500/20 text-cyan-300">
            <Sparkle className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="font-semibold tracking-wide text-white">Apple Vision OS 空间渲染架构</span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-[11px] text-zinc-400">MediaPipe AR + 3D WebGL</span>
          <span className="text-zinc-600">•</span>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-300 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10 shadow-inner">
            <Sliders className="w-3 h-3 text-cyan-400" /> 点击手势控制
          </span>
        </motion.div>
      </footer>

    </div>
  );
}

// 极致高级感 苹果 Liquid Glass 卡片
function LuxuryAppleCard({
  app,
  index,
  onLaunch,
}: {
  app: LaunchApp;
  index: number;
  onLaunch: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // 苹果 Tactile Spring Physics (高灵敏柔和倾斜)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [12, -12]), { stiffness: 280, damping: 18, mass: 0.6 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-12, 12]), { stiffness: 280, damping: 18, mass: 0.6 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    
    x.set(px - 0.5);
    y.set(py - 0.5);
    setMousePos({ x: px * 100, y: py * 100 });
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.6, 
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1]
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={onLaunch}
      style={{
        perspective: 1200,
        rotateX: hovered ? rotateX : 0,
        rotateY: hovered ? rotateY : 0,
      }}
      className="group relative rounded-[38px] bg-gradient-to-b from-white/[0.09] via-white/[0.03] to-white/[0.015] border border-white/15 backdrop-blur-3xl p-6 flex flex-col items-center justify-between text-center cursor-pointer transition-all duration-300 shadow-[0_25px_60px_rgba(0,0,0,0.75)] hover:shadow-[0_35px_90px_rgba(0,0,0,0.95)] h-[335px] overflow-hidden"
    >
      {/* 1. 顶部镜面高光 Edge Rim Light (High Specular Reflection) */}
      <div 
        className="absolute inset-0 rounded-[38px] pointer-events-none transition-opacity duration-300 z-10"
        style={{
          boxShadow: hovered 
            ? `inset 0 1.5px 2.5px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 1.5px 0 rgba(255, 255, 255, 0.15)` 
            : `inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.3)`
        }}
      />

      {/* 2. 蓝宝石晶体光泽扫过动画 (Sapphire Crystal Sweep Glare) */}
      <div 
        className="absolute inset-0 rounded-[38px] pointer-events-none z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(500px circle at ${mousePos.x}% ${mousePos.y}%, rgba(255, 255, 255, 0.15), transparent 75%)`
        }}
      />

      {/* 3. 悬停品牌色空间外晕 (Dynamic Luxury Brand Glow) */}
      <div
        className="absolute -inset-[1px] rounded-[38px] opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none -z-10"
        style={{
          boxShadow: `0 0 55px ${app.glowColor}, inset 0 0 20px ${app.glowColor}`,
          border: `1.5px solid ${app.accentBorder}`,
        }}
      />

      {/* 4. 顶部学科角标 (Apple Floating Pill Badge) */}
      <div className="w-full flex justify-between items-center z-20">
        <span className="w-2 h-2 rounded-full bg-white/20 group-hover:bg-cyan-400 group-hover:shadow-[0_0_8px_#38bdf8] transition-all" />
        <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-400 group-hover:text-white bg-white/[0.06] group-hover:bg-white/20 border border-white/10 px-3 py-0.5 rounded-full backdrop-blur-md transition-all shadow-sm">
          {app.badge}
        </span>
      </div>

      {/* 5. 极致 3D 浮雕 App Icon (macOS Spatial App Icon) */}
      <div className="relative z-20 my-1">
        {/* 底层弥散高光影 */}
        <div 
          className="absolute inset-0 rounded-[28px] blur-2xl opacity-60 group-hover:opacity-100 group-hover:blur-3xl transition-all duration-500"
          style={{ background: `linear-gradient(to bottom right, ${app.glowColor}, transparent)` }}
        />

        {/* Apple Squircle Icon 实体 */}
        <div 
          className={`relative w-22 h-22 rounded-[26px] bg-gradient-to-br ${app.gradient} flex items-center justify-center border border-white/35 shadow-[0_16px_36px_rgba(0,0,0,0.5)] group-hover:-translate-y-2.5 group-hover:scale-105 transition-all duration-400 ease-out overflow-hidden`}
        >
          {/* 图标顶部玻璃镜面反光 */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
          
          {/* 内边框凸起划痕 */}
          <div className="absolute inset-0 rounded-[26px] border border-white/25 pointer-events-none" />

          {/* SVG 图标悬浮动画 */}
          <div className="relative z-10 transition-transform duration-400 group-hover:scale-110 drop-shadow-lg">
            {app.icon}
          </div>
        </div>
      </div>

      {/* 6. 标题与文字排版 (Luxury Apple Typography) */}
      <div className="space-y-1 z-20 my-auto">
        <h2 className="text-xl font-black text-white tracking-tight group-hover:text-cyan-300 transition-colors drop-shadow">
          {app.name}
        </h2>
        <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.25em]">
          {app.enName}
        </div>
        <p className="text-xs text-zinc-300/90 font-normal line-clamp-1 pt-0.5">
          {app.tagline}
        </p>
      </div>

      {/* 7. 苹果高级胶囊控制按钮 (Apple Vision Capsule Glass Button) */}
      <div className="w-full z-20 mt-1">
        <div className="w-full py-2.5 rounded-full bg-white/[0.08] group-hover:bg-gradient-to-r group-hover:from-white/25 group-hover:to-white/15 border border-white/15 group-hover:border-white/35 text-xs font-bold text-zinc-100 group-hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-md group-hover:shadow-[0_8px_25px_rgba(255,255,255,0.15)] active:scale-95">
          <span className="tracking-wide">启动应用</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-cyan-300" />
        </div>
      </div>

    </motion.div>
  );
}
