import React, { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useARStore, AppTab } from '../store';
import { cn } from '../lib/utils';
import { 
  Compass, 
  Atom, 
  FlaskConical, 
  User, 
  Trash2, 
  Moon, 
  Sun,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  X
} from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'motion/react';

interface DockItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

export function AppleDock() {
  const activeTab = useARStore(state => state.activeTab);
  const setActiveTab = useARStore(state => state.setActiveTab);

  // Dock 栏仅在白板 ('whiteboard') 状态下呈现
  if (activeTab !== 'whiteboard') return null;

  const clearCanvas = useARStore(state => state.clearCanvas);
  const clearModelLines = useARStore(state => state.clearModelLines);

  const theme = useARStore(state => state.theme);
  const setTheme = useARStore(state => state.setTheme);

  const isLoggedIn = useARStore(state => state.isLoggedIn);
  const currentUser = useARStore(state => state.currentUser);
  const logout = useARStore(state => state.logout);
  const lockScreen = useARStore(state => state.lockScreen);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showARConfirm, setShowARConfirm] = useState(false);

  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    if (!document.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || (rect.left + rect.width / 2);
    const y = event.clientY || (rect.top + rect.height / 2);

    // 绑定 CSS 变量，确保首帧初始化 clip-path = circle(0px) 立刻生效，防闪全黑
    document.documentElement.style.setProperty('--click-x', `${x}px`);
    document.documentElement.style.setProperty('--click-y', `${y}px`);

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });

    const isDarkNext = nextTheme === 'dark';

    const pseudoElement = isDarkNext
      ? '::view-transition-new(root)'
      : '::view-transition-old(root)';

    const clipPath = isDarkNext
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
          duration: 700,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: pseudoElement,
          fill: 'forwards',
        }
      );
    });

    transition.finished.then(() => {
      document.documentElement.style.removeProperty('--click-x');
      document.documentElement.style.removeProperty('--click-y');
    });
  };

  const items: DockItem[] = [
    { key: 'math', label: '数学', icon: <Compass className="w-6 h-6" /> },
    { key: 'physics', label: '物理', icon: <Atom className="w-6 h-6" /> },
    { key: 'chem', label: '化学', icon: <FlaskConical className="w-6 h-6" /> },
    { key: 'account', label: '账户', icon: <User className="w-6 h-6" /> },
  ];

  const getIsActive = (key: string) => {
    const currentTab = activeTab as string;
    if (key === 'math') return currentTab === 'ar_3d'; // 默认在白板中不蓝色高亮
    if (key === 'physics') return currentTab === 'physics';
    if (key === 'chem') return currentTab === 'chem';
    if (key === 'account') return currentTab === 'profile';
    return false;
  };

  const handleItemClick = (key: string) => {
    if (key === 'math') {
      if (activeTab === 'whiteboard') {
        setShowARConfirm(true);
      } else {
        setActiveTab('whiteboard');
      }
    } else if (key === 'physics') {
      setActiveTab('physics');
    } else if (key === 'chem') {
      setActiveTab('chem');
    } else if (key === 'account') {
      if (!isLoggedIn) {
        lockScreen();
      } else {
        setActiveTab('profile');
      }
    }
  };

  // Mouse positioning for magnifying effect
  const mouseX = useMotionValue(Infinity);

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 select-none pointer-events-auto">
        {/* Themes & Clear panel */}
        <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-2xl transition-all duration-500">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 active:scale-90 cursor-pointer"
            title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {activeTab === 'whiteboard' && (
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
          )}
        </div>

        {/* Main Apple Dock */}
        <motion.div
          onMouseMove={(e) => mouseX.set(e.clientX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          className="flex items-end gap-3 px-4 py-2.5 rounded-[2rem] bg-white/50 dark:bg-zinc-900/40 backdrop-blur-3xl border border-black/5 dark:border-white/10 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-500"
        >
          {items.map((item) => (
            <React.Fragment key={item.key}>
              {item.key === 'account' && (
                <div className="w-px h-8 bg-black/10 dark:bg-white/15 mx-1 mb-3.5 self-center rounded-full" />
              )}
              <DockIcon
                mouseX={mouseX}
                item={item}
                active={getIsActive(item.key)}
                onClick={() => handleItemClick(item.key)}
              />
            </React.Fragment>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-[380px] p-6 rounded-3xl bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl border border-black/10 dark:border-white/10 text-center shadow-2xl flex flex-col gap-5 text-zinc-800 dark:text-zinc-100"
            >
              <button
                onClick={() => setShowAccountModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center gap-3 pt-2">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">
                    {currentUser?.name || 'HoloGrip 用户'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {currentUser?.email || '未登录云端账号'}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex flex-col gap-2 text-left text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">身份角色</span>
                  <span className="font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {currentUser?.role || '高级教师 / 实验管理员'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">云端同步状态</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isLoggedIn ? '已连接云云互联' : '离线本地模式'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAccountModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                >
                  关闭
                </button>
                {isLoggedIn ? (
                  <button
                    onClick={() => {
                      setShowAccountModal(false);
                      logout();
                      lockScreen();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-medium shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    退出登录
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowAccountModal(false);
                      lockScreen();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-500 text-white text-xs font-medium shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    前往登录
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showARConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-[360px] p-6 rounded-2xl bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl border border-black/10 dark:border-white/10 text-center shadow-2xl flex flex-col gap-4 text-zinc-800 dark:text-zinc-100"
            >
              <div className="flex justify-center text-cyan-500">
                <Compass className="w-12 h-12 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold">进入数学 3D 空间 AR？</h3>
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
