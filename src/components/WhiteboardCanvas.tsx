import React, { useEffect, useRef, useState } from 'react';
import { useARStore } from '../store';
import { cn } from '../lib/utils';
import { Palette, Eraser, Trash2, Edit3, Move } from 'lucide-react';
import { motion, useDragControls } from 'motion/react';

interface Point {
  x: number;
  y: number;
}

export function WhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPoint = useRef<Point>({ x: 0, y: 0 });

  const activeTab = useARStore(state => state.activeTab);
  const penColor = useARStore(state => state.penColor);
  const setPenColor = useARStore(state => state.setPenColor);
  const penThickness = useARStore(state => state.penThickness);
  const setPenThickness = useARStore(state => state.setPenThickness);
  const isEraser = useARStore(state => state.isEraser);
  const setIsEraser = useARStore(state => state.setIsEraser);
  const triggerClearCanvas = useARStore(state => state.triggerClearCanvas);
  const interactMode = useARStore(state => state.interactMode);
  const setInteractMode = useARStore(state => state.setInteractMode);
  const theme = useARStore(state => state.theme);
  const isDark = theme === 'dark';

  // 悬浮画笔栏
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  // 初始化和大小自适应
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 关键：bitmap 必须与 canvas 真实渲染尺寸一致，否则浏览器会缩放绘制结果，
    // 在 Tauri 桌面端因为顶部标题栏让父容器比 window 矮 36px，
    // 用 window.inner* 设位图会让笔迹纵向偏移。
    const parent = canvas.parentElement;
    const initW = parent?.clientWidth || canvas.clientWidth || window.innerWidth;
    const initH = parent?.clientHeight || canvas.clientHeight || window.innerHeight;
    canvas.width = initW;
    canvas.height = initH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
    }

    const handleResize = () => {
      // 保持画布内容不丢失
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx && canvas.width > 0 && canvas.height > 0) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      const p = canvas.parentElement;
      canvas.width = p?.clientWidth || canvas.clientWidth || window.innerWidth;
      canvas.height = p?.clientHeight || canvas.clientHeight || window.innerHeight;
      const newCtx = canvas.getContext('2d');
      if (newCtx) {
        newCtx.lineCap = 'round';
        newCtx.lineJoin = 'round';
        ctxRef.current = newCtx;
        if (tempCanvas.width > 0 && tempCanvas.height > 0) {
          newCtx.drawImage(tempCanvas, 0, 0);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 清空画板
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [triggerClearCanvas]);

  // 绘图事件处理
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (interactMode === 'interact') return;
    
    setIsDrawing(true);
    const pos = getCoordinates(e);
    lastPoint.current = pos;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || interactMode === 'interact') return;
    e.preventDefault();

    const ctx = ctxRef.current;
    if (!ctx) return;

    const currentPoint = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);

    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = penThickness * 8; // 橡皮擦适当加宽
    } else {
      ctx.globalCompositeOperation = 'source-over';
      // 亮色模式下黑色画笔实际用白色在 canvas 上绘图，再通过 filter 反转滤镜还原为黑色，保持亮暗切换时已画出的线条均清晰可见
      ctx.strokeStyle = (!isDark && penColor === '#09090b') ? '#ffffff' : penColor;
      ctx.lineWidth = penThickness;
    }

    ctx.stroke();
    lastPoint.current = currentPoint;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      if (e.touches.length === 0) return lastPoint.current;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };


  // 根据当前 Tab 自动切换交互模式
  // 进入 2D 板块时自动切到操作模式（穿透画布），回白板时自动切到书写模式
  useEffect(() => {
    if (activeTab === 'function') {
      setInteractMode('interact');
    } else if (activeTab === 'whiteboard') {
      setInteractMode('draw');
    }
  }, [activeTab]);

  // 自动根据亮暗色切换白色与黑色画笔，防止书写看不见
  useEffect(() => {
    if (theme === 'light' && penColor === '#ffffff') {
      setPenColor('#09090b');
    } else if (theme === 'dark' && penColor === '#09090b') {
      setPenColor('#ffffff');
    }
  }, [theme, penColor, setPenColor]);

  // 大屏快捷键或手势切换画笔/操作模式
  useEffect(() => {
    // 允许通过空格键快速切换书写与操作模式
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }
      if (e.code === 'Space') {
        setInteractMode(useARStore.getState().interactMode === 'draw' ? 'interact' : 'draw');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (activeTab !== 'whiteboard' && activeTab !== 'function') return null;

  return (
    <>
      {/* 2D Canvas 书写层 - 置于顶层但可被穿透 */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={cn(
          "absolute inset-0 transition-all duration-200",
          interactMode === 'draw' 
            ? "z-[36] pointer-events-auto cursor-crosshair" 
            : "z-20 pointer-events-none"
        )}
        style={{
          filter: isDark ? 'none' : 'invert(1) hue-rotate(180deg)'
        }}
      />

      {/* 悬浮苹果美学画笔工具箱 */}
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        initial={{ x: 100, y: 150 }}
        style={{ position: 'absolute', left: 0, top: 0 }}
        className={cn(
          "absolute z-40 flex flex-col items-center gap-3 p-3 rounded-2xl backdrop-blur-xl border select-none pointer-events-auto cursor-default",
          !isDragging && "transition-[background-color,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isDark
            ? "bg-zinc-900/80 border-white/10 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
            : "bg-white/80 border-black/10 text-zinc-800 shadow-[0_12px_40px_rgba(15,23,42,0.08)] hover:shadow-[0_20px_50px_rgba(15,23,42,0.15)]"
        )}
      >
        {/* 顶部拖动条 */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className={cn(
            "w-full py-1.5 flex justify-center items-center cursor-grab active:cursor-grabbing rounded-t-2xl transition-colors",
            isDark ? "hover:bg-white/5" : "hover:bg-black/5"
          )}
          title="拖动工具栏"
        >
          <div className={cn("w-12 h-1.5 rounded-full transition-colors", isDark ? "bg-white/20" : "bg-black/15")} />
        </div>

        {/* 模式切换 (书写 vs 操作) */}
        <div className={cn("relative flex rounded-xl p-1 gap-1 transition-colors", isDark ? "bg-white/5" : "bg-black/5")}>
          <button
            onClick={() => setInteractMode('draw')}
            className={cn(
              "relative p-2.5 rounded-lg flex items-center justify-center w-10 h-10 transition-colors z-10",
              interactMode === 'draw'
                ? (isDark ? "text-cyan-400" : "text-cyan-600")
                : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
            )}
            title="书写模式 (Space)"
          >
            <Edit3 className="w-4 h-4" />
            {interactMode === 'draw' && (
              <motion.div
                layoutId="activeModeBg"
                className={cn(
                  "absolute inset-0 rounded-lg -z-10",
                  isDark ? "bg-cyan-500/20" : "bg-cyan-500/15 shadow-sm"
                )}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
          <button
            onClick={() => setInteractMode('interact')}
            className={cn(
              "relative p-2.5 rounded-lg flex items-center justify-center w-10 h-10 transition-colors z-10",
              interactMode === 'interact'
                ? (isDark ? "text-cyan-400" : "text-cyan-600")
                : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
            )}
            title="操作模式 (Space)"
          >
            <Move className="w-4 h-4" />
            {interactMode === 'interact' && (
              <motion.div
                layoutId="activeModeBg"
                className={cn(
                  "absolute inset-0 rounded-lg -z-10",
                  isDark ? "bg-cyan-500/20" : "bg-cyan-500/15 shadow-sm"
                )}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        </div>

        <div className={cn("w-full h-px transition-colors", isDark ? "bg-white/10" : "bg-black/10")} />

        {/* 颜色面板 */}
        <div className="flex flex-col gap-2.5 items-center">
          {(isDark 
            ? ['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'] 
            : ['#09090b', '#ef4444', '#3b82f6', '#10b981', '#f59e0b']
          ).map(color => {
            const isActive = penColor === color && !isEraser;
            return (
              <div key={color} className="relative flex items-center justify-center w-7 h-7">
                <motion.button
                  onClick={() => {
                    setPenColor(color);
                    setIsEraser(false);
                    setInteractMode('draw');
                  }}
                  whileHover={{ scale: 1.18 }}
                  whileTap={{ scale: 0.85 }}
                  className={cn(
                    "w-5.5 h-5.5 rounded-full shadow-sm cursor-pointer",
                    isActive ? "shadow-md" : "hover:shadow-md"
                  )}
                  style={{ backgroundColor: color }}
                />
                {isActive && (
                  <motion.div
                    layoutId="activeColorRing"
                    className={cn(
                      "absolute inset-0 rounded-full border-2 -z-10",
                      isDark ? "border-white" : "border-zinc-800"
                    )}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className={cn("w-full h-px transition-colors", isDark ? "bg-white/10" : "bg-black/10")} />

        {/* 画笔粗细 */}
        <div className={cn("relative flex flex-col gap-2 items-center rounded-xl p-1.5 transition-colors", isDark ? "bg-white/5" : "bg-black/5")}>
          {[3, 6, 12].map(thickness => {
            const isActive = penThickness === thickness;
            return (
              <motion.button
                key={thickness}
                onClick={() => {
                  setPenThickness(thickness);
                  setInteractMode('draw');
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "relative w-6 h-6 rounded-full flex items-center justify-center z-10 transition-colors duration-200 cursor-pointer",
                  isActive
                    ? (isDark ? "text-white" : "text-zinc-900")
                    : (isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700")
                )}
              >
                <div
                  className={cn(
                    "rounded-full transition-all duration-200",
                    isActive ? (isDark ? "bg-white" : "bg-zinc-800") : "bg-zinc-500"
                  )}
                  style={{ width: `${Math.max(2, thickness / 1.5)}px`, height: `${Math.max(2, thickness / 1.5)}px` }}
                />
                {isActive && (
                  <motion.div
                    layoutId="activeThicknessBg"
                    className={cn(
                      "absolute inset-0 rounded-full -z-10",
                      isDark ? "bg-white/20" : "bg-black/10"
                    )}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        <div className={cn("w-full h-px transition-colors", isDark ? "bg-white/10" : "bg-black/10")} />

        {/* 橡皮擦: 在书写模式下擦笔迹, 在操作模式下擦几何对象 */}
        <motion.button
          onClick={() => setIsEraser(!isEraser)}
          whileHover={{ 
            rotate: [0, -6, 6, -6, 6, 0],
            transition: { duration: 0.45, ease: "easeInOut" }
          }}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "p-2.5 rounded-xl transition-colors duration-200 relative cursor-pointer",
            isEraser
              ? (isDark ? "text-rose-300 shadow-md ring-1 ring-rose-400/30" : "text-rose-600 shadow-sm ring-1 ring-rose-300/50")
              : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
          )}
          title={isEraser ? "退出橡皮擦" : "橡皮擦 (书写模式擦笔迹 / 操作模式擦几何)"}
        >
          {isEraser && (
            <motion.div
              layoutId="activeEraserBg"
              className={cn(
                "absolute inset-0 rounded-xl -z-10",
                isDark ? "bg-rose-500/20" : "bg-rose-500/10"
              )}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />
          )}
          <Eraser className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </>
  );
}
