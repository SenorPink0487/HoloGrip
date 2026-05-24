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
import { Minus, Square, Copy, X } from 'lucide-react';
import { useARStore } from '../../store';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const activeTab = useARStore(state => state.activeTab);
  const isAR = activeTab === 'ar_3d';

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    // 初始一次,以及窗口尺寸变化时同步最大化图标
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
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize().catch(() => {});
  };
  const handleToggleMaximize = () => {
    getCurrentWindow().toggleMaximize().catch(() => {});
  };
  const handleClose = () => {
    getCurrentWindow().close().catch(() => {});
  };

  return (
    <div
      data-tauri-drag-region
      className={[
        'h-9 w-full flex items-center justify-between select-none',
        'border-b border-white/5',
        'transition-colors duration-300',
        isAR
          ? 'bg-zinc-900/40 backdrop-blur-sm text-zinc-300/80'
          : 'bg-zinc-900/85 backdrop-blur-md text-zinc-200',
      ].join(' ')}
      style={{
        // Windows 透明窗口下,让 titlebar 跟随外层圆角
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* 左侧标识(也是拖拽区一部分) */}
      <div
        data-tauri-drag-region
        className="px-3 text-xs font-medium tracking-wide pointer-events-none flex items-center gap-2"
      >
        <span className="text-cyan-400">●</span>
        <span>HoloMath · Desktop</span>
      </div>

      {/* 右侧三按钮 */}
      <div className="flex h-full">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="最小化"
          className="h-full w-11 flex items-center justify-center hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={maximized ? '还原' : '最大化'}
          className="h-full w-11 flex items-center justify-center hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="关闭"
          className="h-full w-11 flex items-center justify-center hover:bg-red-500/85 hover:text-white active:bg-red-600 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
