import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useARStore, AppTab } from '../../store';
import { LayoutGrid, ArrowLeft } from 'lucide-react';

interface SubjectFrameProps {
  tab: AppTab;
  src: string;
  title: string;
}

const SUBJECT_IFRAMES: Record<string, { src: string; title: string }> = {
  physics: { src: '/physics.html', title: 'HoloPhysics 三维物理实验室' },
  chem: { src: '/chem.html', title: 'HoloChem 分子结构观象台' },
  rocket: { src: '/rocket.html', title: 'HoloRocket 火箭发射仿真' },
  pool: { src: '/pool.html', title: 'HoloPool 三维台球室' },
};

export function SubjectIFrameView({ tab }: { tab: AppTab }) {
  const config = SUBJECT_IFRAMES[tab];
  const setActiveTab = useARStore(state => state.setActiveTab);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'hologrip:exit' || event.data?.type === 'hologrip:exit') {
        setActiveTab('launcher');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setActiveTab]);

  if (!config) return null;

  return (
    <motion.div
      key={tab}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full h-full bg-zinc-950 flex flex-col overflow-hidden"
    >
      {/* 悬浮原网页科技风“返回大厅”导航按钮 */}
      <div className="absolute top-6 left-6 z-40 pointer-events-auto">
        <button
          onClick={() => setActiveTab('launcher')}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-950/70 hover:bg-zinc-900/90 text-zinc-300 hover:text-white border border-white/10 hover:border-cyan-500/40 backdrop-blur-xl shadow-[0_8px_25px_rgba(0,0,0,0.6)] hover:shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all duration-300 active:scale-95 cursor-pointer"
          title="返回 Launchpad 空间实验室大厅"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
          <LayoutGrid className="w-4 h-4 text-zinc-400 group-hover:text-cyan-300 transition-colors" />
          <span className="text-xs font-medium tracking-wide">返回大厅</span>
        </button>
      </div>

      <iframe
        src={config.src}
        title={config.title}
        className="w-full h-full border-none bg-transparent select-none"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; xr-spatial-tracking"
      />
    </motion.div>
  );
}
