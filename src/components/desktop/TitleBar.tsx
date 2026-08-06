/**
 * 桌面端无边框窗口的自绘标题栏。
 *
 * 仅在 Tauri 容器内被 App.tsx 挂载(`isDesktop && <TitleBar />`),
 * 因此 web 构建虽然会包含本文件源码,但运行时不会被实例化,
 * `getCurrentWindow()` 也不会触发 — 不影响浏览器版本。
 *
 * 行为:
 * - 整条 titlebar(除按钮外)是 OS 拖拽区,双击切换最大化(Tauri 默认行为)
 * - 右上三按钮:最小化 / 最大化↔还原 / 关闭
 * - AR 模式下 titlebar 半透明,避免遮挡空间几何画面
 */
import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X, Lock, Sparkles, UserCheck, LayoutGrid, ArrowLeft } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import type { AppTab } from '../../stores/types';

const SUBJECT_TITLES: Record<string, string> = {
  launcher: 'HoloGrip · 白板',
  whiteboard: '数学 · 空间几何超级白板',
  function: '数学 · 三维动态函数探究',
  calculator3d: '数学 · 空间计算器与几何模型',
  ar_3d: '数学 · 空间 AR 交互体验',
  physics: '物理 · 3D 经典力学与实验室',
  chem: '化学 · 3D 分子结构观象台',
  rocket: '航天 · 矢量轨道与推进仿真',
  pool: '台球 · 三维碰撞物理引擎',
};

interface TitleBarProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
}

export function TitleBar({ activeTab, onNavigate }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const lockScreen = useSessionStore(state => state.lockScreen);
  const currentUser = useSessionStore(state => state.currentUser);
  const isAR = activeTab === 'ar_3d';

  useEffect(() => {
    try {
      const win = getCurrentWindow();
      let unlisten: (() => void) | undefined;

      win.isMaximized().then(setMaximized).catch(() => {});
      win
        .onResized(async () => {
          try {
            setMaximized(await win.isMaximized());
          } catch {
            /* 忽略关闭中的窗口报错 */
          }
        })
        .then(fn => {
          unlisten = fn;
        })
        .catch(() => {});

      return () => {
        unlisten?.();
      };
    } catch {
      // 兼容 Web 预览环境
    }
  }, []);

  const handleMinimize = () => {
    try { getCurrentWindow().minimize().catch(() => {}); } catch {}
  };
  const handleToggleMaximize = () => {
    try { getCurrentWindow().toggleMaximize().catch(() => {}); } catch {}
  };
  const handleClose = () => {
    try { getCurrentWindow().close().catch(() => {}); } catch {}
  };

  return (
    <div
      data-tauri-drag-region
      className={[
        'h-9 w-full flex items-center justify-between select-none px-3 border-none transition-colors duration-300 z-50',
        activeTab === 'launcher'
          ? 'bg-[#f8fafc] text-slate-800'
          : isAR
          ? 'bg-zinc-950/40 backdrop-blur-sm text-zinc-300/80'
          : 'bg-zinc-950/90 backdrop-blur-xl text-zinc-200',
      ].join(' ')}
      style={{
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 左侧空拖拽区 */}
      <div className="flex items-center gap-2" data-tauri-drag-region />

      {/* 右侧：返回白板按钮与窗口控制 */}
      <div className="flex items-center gap-2">
        {activeTab !== 'launcher' && activeTab !== 'whiteboard' && (
          <button
            onClick={() => onNavigate('whiteboard')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
            title="返回白板"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>返回白板</span>
          </button>
        )}

        {/* 标准窗口操作控制（针对 Windows/Linux 窗口） */}
        <div className="flex items-center pl-2 space-x-1">
          <button
            type="button"
            onClick={handleMinimize}
            className={['p-1 rounded transition-colors cursor-pointer', activeTab === 'launcher' ? 'hover:bg-slate-200/70 text-slate-600 hover:text-slate-900' : 'hover:bg-white/10 text-zinc-400 hover:text-white'].join(' ')}
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className={['p-1 rounded transition-colors cursor-pointer', activeTab === 'launcher' ? 'hover:bg-slate-200/70 text-slate-600 hover:text-slate-900' : 'hover:bg-white/10 text-zinc-400 hover:text-white'].join(' ')}
          >
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-red-500/80 hover:text-white rounded text-slate-500 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlusIcon(props: any) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 1V7M1 4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
