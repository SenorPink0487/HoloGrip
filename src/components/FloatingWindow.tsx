import React, { useRef } from 'react';
import { motion, useDragControls } from 'motion/react';
import { useWhiteboardStore } from '../stores/whiteboardStore';
import { useSessionStore } from '../stores/sessionStore';
import { X, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FloatingWindowProps {
  id: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  height?: string;
  defaultPosition?: { x: number; y: number };
}

export function FloatingWindow({
  id,
  title,
  isOpen,
  onClose,
  children,
  width = '820px',
  height = '560px',
  defaultPosition = { x: 100, y: 80 }
}: FloatingWindowProps) {
  const focusedWindow = useWhiteboardStore(state => state.focusedWindow);
  const setFocusedWindow = useWhiteboardStore(state => state.setFocusedWindow);
  const theme = useSessionStore(state => state.theme);
  
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  
  const windowRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  
  if (!isOpen) return null;

  const isFocused = focusedWindow === id;

  const handleMouseDown = () => {
    setFocusedWindow(id);
  };

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.95, x: defaultPosition.x, y: defaultPosition.y }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      drag={!isMaximized}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onMouseDown={handleMouseDown}
      style={{
        width: isMaximized ? '100vw' : width,
        height: isMaximized ? '100vh' : (isMinimized ? '44px' : height),
        position: 'absolute',
        left: isMaximized ? 0 : undefined,
        top: isMaximized ? 0 : undefined,
        transform: isMaximized ? 'none' : undefined,
        zIndex: isFocused ? 20 : 10,
      }}
      className={cn(
        "flex flex-col bg-white/85 dark:bg-zinc-950/80 backdrop-blur-2xl border shadow-2xl overflow-hidden pointer-events-auto transition-colors duration-500",
        !isDragging && "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isMaximized ? "rounded-none" : "rounded-2xl",
        isFocused 
          ? "border-cyan-300/40 dark:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]" 
          : "border-slate-200/80 dark:border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
      )}
    >
      {/* 标题栏 / 拖拽手柄 */}
      <div 
        onPointerDown={(e) => !isMaximized && dragControls.start(e)}
        onDoubleClick={() => !isMaximized && setIsMinimized(!isMinimized)}
        className={cn(
          "window-drag-handle flex items-center justify-between px-4 py-3 bg-slate-100/50 dark:bg-zinc-900/40 border-b border-slate-200/80 dark:border-white/5 cursor-grab active:cursor-grabbing select-none transition-colors duration-500"
        )}
      >
        {/* 左侧苹果红绿灯按钮 */}
        <div className="flex items-center gap-1.5" onPointerDown={e => e.stopPropagation()}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group relative"
            title="关闭"
          >
            <X className="w-2 h-2 text-zinc-950 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 relative group flex items-center justify-center"
            title={isMinimized ? "展开" : "最小化"}
          >
            <Minimize2 className="w-2 h-2 text-zinc-950 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsMaximized(!isMaximized);
              if (isMinimized) setIsMinimized(false);
            }}
            className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 relative group flex items-center justify-center"
            title={isMaximized ? "还原" : "最大化"}
          >
            <Maximize2 className="w-2 h-2 text-zinc-950 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        {/* 居中标题 */}
        <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300 tracking-wider">
          {title}
        </div>

        {/* 占位，保持标题居中 */}
        <div className="w-14" />
      </div>

      {/* 内容区域 */}
      <div 
        className="flex-1 w-full h-full min-h-0 overflow-hidden relative"
        style={{ display: isMinimized ? 'none' : 'block' }}
      >
        {children}
      </div>
    </motion.div>
  );
}
