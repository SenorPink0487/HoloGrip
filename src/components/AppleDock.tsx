import React, { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useARStore, AppTab } from '../store';
import { cn } from '../lib/utils';
import { 
  PenTool, 
  TrendingUp, 
  Box, 
  Compass, 
  Trash2,
  Moon,
  Sun,
  Atom,
  FlaskConical,
  Rocket,
  CircleDot,
  Lock,
  LayoutGrid
} from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'motion/react';

interface DockItem {
  tab: AppTab | 'clear';
  label: string;
  icon: React.ReactNode;
}

const MATH_TABS: AppTab[] = ['whiteboard', 'function', 'calculator3d'];

export function AppleDock() {
  const activeTab = useARStore(state => state.activeTab);
  // 除了数学板块，其它板块不应该有 Dock 栏
  if (!MATH_TABS.includes(activeTab)) return null;

  const setActiveTab = useARStore(state => state.setActiveTab);
  const clearCanvas = useARStore(state => state.clearCanvas);
  const clearModelLines = useARStore(state => state.clearModelLines);

  const isToolboxOpen = useARStore(state => state.isToolboxOpen);
  const setToolboxOpen = useARStore(state => state.setToolboxOpen);

  const theme = useARStore(state => state.theme);
  const setTheme = useARStore(state => state.setTheme);

  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    // @ts-ignore
    if (!document.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // @ts-ignore
    const transition = document.startViewTransition(() => {
      document.documentElement.classList.add('no-transitions');
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      flushSync(() => {
        setTheme(nextTheme);
      });
      document.documentElement.offsetHeight;
    });

    transition.finished.then(() => {
      document.documentElement.classList.remove('no-transitions');
    });

    const isAppearanceTransition = nextTheme === 'light';
    const pseudoElement = isAppearanceTransition
      ? '::view-transition-new(root)'
      : '::view-transition-old(root)';

    const clipPath = isAppearanceTransition
      ? [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`
        ]
      : [
          `circle(${endRadius}px at ${x}px ${y}px)`,
          `circle(0px at ${x}px ${y}px)`
        ];

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 600,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: pseudoElement,
          fill: 'forwards',
        }
      );
    });
  };

  const lockScreen = useARStore(state => state.lockScreen);

  const items: DockItem[] = [
    { tab: 'launcher', label: '🚀 启动器大厅', icon: <LayoutGrid className="w-6 h-6" /> },
    { tab: 'whiteboard', label: '📐 数学 · 白板', icon: <PenTool className="w-6 h-6" /> },
    { tab: 'function', label: '📈 函数探究', icon: <TrendingUp className="w-6 h-6" /> },
    { tab: 'calculator3d', label: '📦 3D计算器', icon: <Box className="w-6 h-6" /> },
    { tab: 'ar_3d', label: '🧭 空间AR', icon: <Compass className="w-6 h-6" /> },
  ];

  const getIsActive = (tab: AppTab) => {
    return activeTab === tab;
  };

  const [showARConfirm, setShowARConfirm] = useState(false);

  // Mouse positioning for magnifying effect
  const mouseX = useMotionValue(Infinity);

  return (
    <>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 select-none pointer-events-auto">
        {/* Themes, Lock & Clear panel */}
        <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-2xl transition-all duration-500">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 active:scale-90 cursor-pointer"
            title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          <button
            onClick={lockScreen}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 transition-all duration-200 active:scale-90 cursor-pointer"
            title="锁定屏幕 (macOS Lock)"
          >
            <Lock className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              clearCanvas();
              window.dispatchEvent(new CustomEvent('holomath:whiteboard-local-clear'));
              clearModelLines();
            }}
            className="p-2.5 rounded-xl text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-all duration-200 active:scale-90 cursor-pointer"
            title="清空画板内容"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Main Apple Dock */}
        <motion.div
          onMouseMove={(e) => mouseX.set(e.clientX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          className="flex items-end gap-3 px-4 py-2.5 rounded-[2rem] bg-white/50 dark:bg-zinc-900/40 backdrop-blur-3xl border border-black/5 dark:border-white/10 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-500"
        >
          {items.map((item) => (
            <DockIcon
              key={item.tab}
              mouseX={mouseX}
              item={item}
              active={getIsActive(item.tab as AppTab)}
              onClick={() => {
                if (item.tab === 'ar_3d') {
                  setShowARConfirm(true);
                } else if (item.tab !== 'clear') {
                  setActiveTab(item.tab as AppTab);
                }
              }}
            />
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {showARConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-[360px] p-6 rounded-2xl bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-black/10 dark:border-white/10 text-center shadow-2xl flex flex-col gap-4 text-zinc-800 dark:text-zinc-100"
            >
              <div className="flex justify-center text-cyan-500">
                <Compass className="w-12 h-12 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold">进入空间 AR 模块？</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                空间 AR 模块将启用您的摄像头以进行手势识别与 3D 空间教学建模交互。为获得最佳体验，请确保环境光线充足且无遮挡。
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowARConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowARConfirm(false);
                    flushSync(() => {
                      setActiveTab('ar_3d');
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 text-white text-sm font-medium shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  确认进入
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
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
        "relative group flex items-center justify-center rounded-2xl transition-[background-color,border-color,color,box-shadow] duration-300 cursor-pointer",
        active 
          ? "bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-[0_8px_20px_-4px_rgba(6,182,212,0.5)] border border-cyan-400/20" 
          : "bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/15 hover:text-zinc-800 dark:hover:text-white border border-black/5 dark:border-white/5"
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
