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

  // 悬浮画笔栏
  const dragControls = useDragControls();

  // 初始化和大小自适应
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
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
      ctx.strokeStyle = penColor;
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

  if (activeTab === 'ar_3d') return null;

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
      />

      {/* 悬浮苹果美学画笔工具箱 */}
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        initial={{ x: 100, y: 150 }}
        style={{ position: 'absolute', left: 0, top: 0 }}
        className="absolute z-40 flex flex-col items-center gap-3 p-3 rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] select-none pointer-events-auto transition-shadow hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)] cursor-default"
      >
        {/* 顶部拖动条 */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="w-full py-1.5 flex justify-center items-center cursor-grab active:cursor-grabbing hover:bg-white/5 rounded-t-2xl transition-colors"
          title="拖动工具栏"
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
        </div>

        {/* 模式切换 (书写 vs 操作) */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-1">
          <button
            onClick={() => setInteractMode('draw')}
            className={cn(
              "p-2.5 rounded-lg transition-all flex items-center justify-center w-10 h-10",
              interactMode === 'draw' ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-500 hover:text-white"
            )}
            title="书写模式 (Space)"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setInteractMode('interact')}
            className={cn(
              "p-2.5 rounded-lg transition-all flex items-center justify-center w-10 h-10",
              interactMode === 'interact' ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-500 hover:text-white"
            )}
            title="操作模式 (Space)"
          >
            <Move className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full h-px bg-white/10" />

        {/* 颜色面板 */}
        <div className="flex flex-col gap-2">
          {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
            <button
              key={color}
              onClick={() => {
                setPenColor(color);
                setIsEraser(false);
                setInteractMode('draw');
              }}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-transform duration-200",
                penColor === color && !isEraser ? "border-white scale-110 shadow-lg" : "border-transparent scale-100 hover:scale-105"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <div className="w-full h-px bg-white/10" />

        {/* 画笔粗细 */}
        <div className="flex flex-col gap-2 items-center bg-white/5 rounded-xl p-1.5">
          {[3, 6, 12].map(thickness => (
            <button
              key={thickness}
              onClick={() => {
                setPenThickness(thickness);
                setInteractMode('draw');
              }}
              className={cn(
                "w-6 h-6 rounded-full transition-colors flex items-center justify-center",
                penThickness === thickness ? "bg-white/20 text-white" : "text-zinc-500"
              )}
            >
              <div 
                className="bg-white rounded-full" 
                style={{ width: `${Math.max(2, thickness / 1.5)}px`, height: `${Math.max(2, thickness / 1.5)}px` }}
              />
            </button>
          ))}
        </div>

        <div className="w-full h-px bg-white/10" />

        {/* 橡皮擦: 在书写模式下擦笔迹, 在操作模式下擦几何对象 */}
        <button
          onClick={() => setIsEraser(!isEraser)}
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200",
            isEraser ? "bg-rose-500/20 text-rose-300 shadow-md ring-1 ring-rose-400/30" : "text-zinc-500 hover:text-white"
          )}
          title={isEraser ? "退出橡皮擦" : "橡皮擦 (书写模式擦笔迹 / 操作模式擦几何)"}
        >
          <Eraser className="w-5 h-5" />
        </button>
      </motion.div>
    </>
  );
}
