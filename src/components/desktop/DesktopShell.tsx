import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import type { AppTab } from '../../stores/types';
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
  const setActiveTab = useWhiteboardStore(state => state.setActiveTab);

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
      {/* 悬浮科技风“返回数字白板”导航按钮 */}
      <div className="absolute top-6 left-6 z-40 pointer-events-auto">
        <button
          onClick={() => setActiveTab('whiteboard')}
          className="group relative flex items-center gap-2.5 px-4.5 py-2.5 rounded-full bg-zinc-950/80 hover:bg-zinc-900 text-zinc-200 hover:text-white border border-white/15 hover:border-cyan-400/50 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-all duration-300 active:scale-95 cursor-pointer overflow-hidden"
          title="返回数字白板"
        >
          {/* 背景动态流光 */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform duration-300 ease-out" strokeWidth={2.2} />

          <span className="relative text-xs font-semibold tracking-wider text-zinc-200 group-hover:text-white transition-colors duration-300">
            返回数字白板
          </span>
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
