import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useWhiteboardStore } from '../../stores/whiteboardStore';
import type { AppTab } from '../../stores/types';

interface SubjectFrameProps {
  tab: AppTab;
  src: string;
  title: string;
}

const SUBJECT_IFRAMES: Record<string, { src: string; title: string }> = {
  physics: { src: '/physics.html', title: 'HoloPhysics 三维物理实验室' },
  chem: { src: '/chem.html', title: 'HoloChem 化学实验室' },
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
      <iframe
        src={config.src}
        title={config.title}
        className="w-full h-full border-none bg-transparent select-none"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; xr-spatial-tracking"
      />
    </motion.div>
  );
}
