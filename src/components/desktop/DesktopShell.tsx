import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import type { AppTab } from '../../stores/types';
import { isIPadOS } from '../../lib/platform';

interface SubjectFrameProps {
  tab: AppTab;
  src: string;
  title: string;
}

const SUBJECT_IFRAMES: Record<string, { src: string; title: string }> = {
  physics: { src: '/physics.html', title: 'HoloPhysics 三维物理实验室' },
  // Chemistry is a mode of the shared physics laboratory shell. Keep this
  // entry on the canonical physics page so desktop and direct web launches
  // exercise the same scene/runtime instead of a stale HTML copy.
  chem: { src: '/physics.html?mode=chem', title: 'HoloChem Three.js 三维化学实验室' },
  rocket: { src: '/rocket.html', title: 'HoloRocket 火箭发射仿真' },
  pool: { src: '/pool.html', title: 'HoloPool 三维台球室' },
};

export function SubjectIFrameView({ tab }: { tab: AppTab }) {
  const config = SUBJECT_IFRAMES[tab];
  const setActiveTab = useWhiteboardStore(state => state.setActiveTab);
  const showIPadBackButton = isIPadOS && (tab === 'physics' || tab === 'chem');

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
      {showIPadBackButton && (
        <button
          type="button"
          aria-label="返回白板"
          onClick={() => setActiveTab('whiteboard')}
          className="absolute left-4 z-50 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/65 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-xl transition-colors hover:bg-black/80 active:scale-95"
          style={{ top: 'max(env(safe-area-inset-top), 16px)' }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回白板
        </button>
      )}
      <iframe
        src={config.src}
        title={config.title}
        className="w-full h-full border-none bg-transparent select-none"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; xr-spatial-tracking"
      />
    </motion.div>
  );
}
