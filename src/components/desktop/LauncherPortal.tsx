import React from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  Atom, 
  FlaskConical, 
  Rocket, 
  CircleDot,
  ArrowUpRight,
  LogOut,
  LogIn
} from 'lucide-react';
import { useARStore, AppTab } from '../../store';

interface LaunchApp {
  id: string;
  tab: AppTab;
  name: string;
  enName: string;
  tagline: string;
  icon: React.ReactNode;
  accentColor: string;
  glowColor: string;
}

export function LauncherPortal() {
  const setActiveTab = useARStore(state => state.setActiveTab);
  const isLoggedIn = useARStore(state => state.isLoggedIn);
  const currentUser = useARStore(state => state.currentUser);
  const logout = useARStore(state => state.logout);

  const apps: LaunchApp[] = [
    {
      id: 'math',
      tab: 'whiteboard',
      name: 'HoloMath',
      enName: 'SPATIAL GEOMETRY',
      tagline: '空间几何与超级白板',
      icon: <Sparkles className="w-10 h-10 text-cyan-600" />,
      accentColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.12)',
    },
    {
      id: 'physics',
      tab: 'physics',
      name: 'HoloPhysics',
      enName: 'QUANTUM MECHANICS',
      tagline: '经典力学与量子电磁场',
      icon: <Atom className="w-10 h-10 text-amber-600" />,
      accentColor: '#f59e0b',
      glowColor: 'rgba(245, 158, 11, 0.12)',
    },
    {
      id: 'chem',
      tab: 'chem',
      name: 'HoloChem',
      enName: 'MOLECULAR SYNTHESIZER',
      tagline: '晶体结构与 AI 分子观象台',
      icon: <FlaskConical className="w-10 h-10 text-emerald-600" />,
      accentColor: '#10b981',
      glowColor: 'rgba(16, 185, 129, 0.12)',
    },
    {
      id: 'rocket',
      tab: 'rocket',
      name: 'HoloRocket',
      enName: 'VECTOR ORBIT',
      tagline: '火箭推进与离心轨道仿真',
      icon: <Rocket className="w-10 h-10 text-fuchsia-600" />,
      accentColor: '#d946ef',
      glowColor: 'rgba(217, 70, 239, 0.12)',
    },
    {
      id: 'pool',
      tab: 'pool',
      name: 'HoloPool',
      enName: 'IMPULSE BILLIARDS',
      tagline: '刚体碰撞与动量预测台球',
      icon: <CircleDot className="w-10 h-10 text-indigo-600" />,
      accentColor: '#6366f1',
      glowColor: 'rgba(99, 102, 241, 0.12)',
    },
  ];

  return (
    <div className="w-full h-full overflow-hidden relative bg-[#f8fafc] text-slate-800 flex flex-col justify-center items-center select-none p-6 font-sans antialiased">
      
      {/* 顶部账号 / 登录工具栏 */}
      <header className="absolute top-6 left-8 right-8 z-30 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800 tracking-tight">HoloGrip OS</span>
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-cyan-100/80 text-cyan-800">
            v2.0 Desktop
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-sm border border-slate-200/60">
              <span className="text-xs font-semibold text-slate-700">
                {currentUser?.name || '已登录用户'}
              </span>
              <div className="h-3 w-px bg-slate-200 mx-0.5" />
              <button
                onClick={logout}
                title="退出登录"
                className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">退出登录</span>
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-md transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              <span>登录账户</span>
            </button>
          )}
        </div>
      </header>

      {/* 静态微弱晕色背景 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vh] rounded-full bg-cyan-100/35 blur-[130px]" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[55vw] h-[55vh] rounded-full bg-indigo-100/35 blur-[130px]" />
      </div>

      {/* 纯粹极简无边框 (Borderless) 5 大应用启动入口卡片 */}
      <main className="relative z-20 w-full max-w-7xl mx-auto px-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {apps.map((app, index) => (
          <motion.div
            key={app.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
            onClick={() => setActiveTab(app.tab)}
            className="group relative rounded-3xl bg-white/70 hover:bg-white p-7 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:-translate-y-2 shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] h-[380px] overflow-hidden border-none"
          >
            {/* 悬停浅发光渲染 */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
              style={{
                background: `radial-gradient(280px circle at 50% 30%, ${app.glowColor}, transparent 80%)`
              }}
            />

            {/* 顶栏 */}
            <div className="relative z-10 flex items-center justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-cyan-600 transition-colors" />
            </div>

            {/* 图标与文字 */}
            <div className="relative z-10 my-auto flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-100/80 group-hover:bg-slate-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                {app.icon}
              </div>

              <div className="mt-5 space-y-1">
                <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-cyan-600 transition-colors tracking-tight">
                  {app.name}
                </h3>
                <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-[0.2em]">
                  {app.enName}
                </div>
                <p className="text-xs text-slate-500 font-normal line-clamp-2 pt-1.5 leading-relaxed px-1">
                  {app.tagline}
                </p>
              </div>
            </div>

            {/* 启动提示 */}
            <div className="relative z-10 mt-2 text-center">
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-slate-900 transition-colors">
                <span>启动应用</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>

          </motion.div>
        ))}
      </main>

    </div>
  );
}
