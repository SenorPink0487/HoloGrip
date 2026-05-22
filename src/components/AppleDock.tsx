import React, { useRef } from 'react';
import { useARStore, AppTab } from '../store';
import { cn } from '../lib/utils';
import { 
  PenTool, 
  TrendingUp, 
  Briefcase, 
  Compass, 
  Trash2,
  Moon,
  Sun
} from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

interface DockItem {
  tab: AppTab | 'clear';
  label: string;
  icon: React.ReactNode;
}

export function AppleDock() {
  const activeTab = useARStore(state => state.activeTab);
  const setActiveTab = useARStore(state => state.setActiveTab);
  const clearCanvas = useARStore(state => state.clearCanvas);
  const clearModelLines = useARStore(state => state.clearModelLines);

  const isToolboxOpen = useARStore(state => state.isToolboxOpen);
  const setToolboxOpen = useARStore(state => state.setToolboxOpen);

  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const items: DockItem[] = [
    { tab: 'whiteboard', label: '超级白板', icon: <PenTool className="w-6 h-6" /> },
    { tab: 'function', label: '函数探究', icon: <TrendingUp className="w-6 h-6" /> },
    { tab: 'toolbox', label: '授课工具', icon: <Briefcase className="w-6 h-6" /> },
    { tab: 'ar_3d', label: '空间AR', icon: <Compass className="w-6 h-6" /> },
  ];

  const getIsActive = (tab: AppTab) => {
    if (tab === 'toolbox') return isToolboxOpen;
    return activeTab === tab;
  };

  // Mouse positioning for magnifying effect
  const mouseX = useMotionValue(Infinity);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 select-none pointer-events-auto">
      {/* Themes & Clear panel */}
      <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-zinc-900/60 backdrop-blur-2xl border border-white/10 shadow-2xl">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-200 active:scale-90"
          title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        
        <button
          onClick={() => {
            clearCanvas();
            clearModelLines();
          }}
          className="p-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all duration-200 active:scale-90"
          title="清空画板内容"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Apple Dock */}
      <motion.div
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex items-end gap-3 px-4 py-2.5 rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/10 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] transition-colors duration-300"
      >
        {items.map((item) => (
          <DockIcon
            key={item.tab}
            mouseX={mouseX}
            item={item}
            active={getIsActive(item.tab as AppTab)}
            onClick={() => {
              if (item.tab === 'toolbox') {
                if (activeTab === 'ar_3d') {
                  setActiveTab('whiteboard');
                }
                setToolboxOpen(!isToolboxOpen);
              } else if (item.tab !== 'clear') {
                setActiveTab(item.tab);
              }
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function DockIcon({
  mouseX,
  item,
  active,
  onClick
}: {
  mouseX: any;
  item: DockItem;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // Compute distance from mouse to icon center to scale
  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Scale calculations for magnifying effect
  const widthTransform = useTransform(distance, [-150, 0, 150], [56, 76, 56]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [56, 76, 56]);

  const width = useSpring(widthTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.button
      ref={ref}
      style={{ width, height }}
      onClick={onClick}
      className={cn(
        "relative group flex items-center justify-center rounded-2xl text-white transition-[background-color,border-color,color,box-shadow] duration-300",
        active 
          ? "bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-[0_8px_20px_-4px_rgba(6,182,212,0.5)] border border-cyan-400/20" 
          : "bg-white/5 text-zinc-400 hover:bg-white/15 hover:text-white border border-white/5"
      )}
    >
      {/* Icon size reacts to scaling */}
      <div className="scale-100 group-hover:scale-110 transition-transform duration-200">
        {item.icon}
      </div>

      {/* Dynamic Indicator Dot */}
      {active && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
      )}

      {/* Tooltip */}
      <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl">
        {item.label}
      </span>
    </motion.button>
  );
}
