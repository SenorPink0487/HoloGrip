import React, { useEffect, useRef, useState } from 'react';
import { useARStore } from '../store';
import { cn } from '../lib/utils';
import { Palette, Eraser, Trash2, Edit3, Move, Plus, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { motion, useDragControls, AnimatePresence } from 'motion/react';

interface Point {
  x: number;
  y: number;
}

interface LiveStroke {
  pageIndex: number;
  from: Point;
  to: Point;
  color: string;
  thickness: number;
  eraser: boolean;
}

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;

export function WhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
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

  const pages = useARStore(state => state.pages);
  const currentPageIndex = useARStore(state => state.currentPageIndex);
  const whiteboardRestoreVersion = useARStore(state => state.whiteboardRestoreVersion);
  const addPage = useARStore(state => state.addPage);
  const switchPage = useARStore(state => state.switchPage);
  const removePage = useARStore(state => state.removePage);
  const totalPages = pages.length;

  const saveCurrentPageWhiteboard = useARStore(state => state.saveCurrentPageWhiteboard);

  const drawStrokeSegment = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    color: string,
    thickness: number,
    eraser: boolean,
  ) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = thickness;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = WHITEBOARD_WIDTH;
    canvas.height = WHITEBOARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
    }
  }, []);

  // 娓呯┖鐢绘澘
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
      // 娓呯┖鏃讹紝濡傛灉鏄櫘閫氭竻绌轰笉鏄崲椤碉紝鏈€濂戒篃鍚屾鏇存柊涓?store
      if (triggerClearCanvas > 0) {
        saveCurrentPageWhiteboard(canvas.toDataURL(), { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
      }
    }
  }, [triggerClearCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const currentPage = pages[currentPageIndex];
    if (currentPage && currentPage.whiteboardDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
        ctx.drawImage(img, 0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
      };
      img.src = currentPage.whiteboardDataUrl;
    } else {
      ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
    }
  }, [currentPageIndex, whiteboardRestoreVersion]); // 鐩戝惉褰撳墠椤电储寮曞彉鍖?
  // 缁樺浘浜嬩欢澶勭悊
  useEffect(() => {
    const handleRemoteStroke = (event: Event) => {
      const stroke = (event as CustomEvent<LiveStroke>).detail;
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!stroke || !canvas || !ctx) return;
      if (stroke.pageIndex !== currentPageIndex) return;

      drawStrokeSegment(
        ctx,
        stroke.from,
        stroke.to,
        stroke.color,
        stroke.thickness,
        stroke.eraser,
      );
    };

    window.addEventListener('holomath:whiteboard-remote-stroke', handleRemoteStroke);
    return () => window.removeEventListener('holomath:whiteboard-remote-stroke', handleRemoteStroke);
  }, [currentPageIndex]);

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

    const strokeColor = (!isDark && penColor === '#09090b') ? '#ffffff' : penColor;
    const strokeThickness = isEraser ? penThickness * 8 : penThickness;
    drawStrokeSegment(ctx, lastPoint.current, currentPoint, strokeColor, strokeThickness, isEraser);

    const canvas = canvasRef.current;
    if (canvas) {
      const stroke: LiveStroke = {
        pageIndex: currentPageIndex,
        from: lastPoint.current,
        to: currentPoint,
        color: strokeColor,
        thickness: strokeThickness,
        eraser: isEraser,
      };
      window.dispatchEvent(new CustomEvent('holomath:whiteboard-local-stroke', { detail: stroke }));
    }
    lastPoint.current = currentPoint;
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      // 淇濆瓨蹇収
      const canvas = canvasRef.current;
      if (canvas) {
        saveCurrentPageWhiteboard(canvas.toDataURL(), { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
      }
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const toLogicalPoint = (clientX: number, clientY: number): Point => ({
      x: ((clientX - rect.left) / rect.width) * WHITEBOARD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * WHITEBOARD_HEIGHT,
    });
    if ('touches' in e) {
      if (e.touches.length === 0) return lastPoint.current;
      return toLogicalPoint(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      return toLogicalPoint(e.clientX, e.clientY);
    }
  };


  useEffect(() => {
    if (activeTab === 'function') {
      setInteractMode('interact');
    } else if (activeTab === 'whiteboard') {
      setInteractMode('draw');
    }
  }, [activeTab]);

  // 鑷姩鏍规嵁浜殫鑹插垏鎹㈢櫧鑹蹭笌榛戣壊鐢荤瑪锛岄槻姝功鍐欑湅涓嶈
  useEffect(() => {
    if (theme === 'light' && penColor === '#ffffff') {
      setPenColor('#09090b');
    } else if (theme === 'dark' && penColor === '#09090b') {
      setPenColor('#ffffff');
    }
  }, [theme, penColor, setPenColor]);

  // 澶у睆蹇嵎閿垨鎵嬪娍鍒囨崲鐢荤瑪/鎿嶄綔妯″紡
  useEffect(() => {
    // 鍏佽閫氳繃绌烘牸閿揩閫熷垏鎹功鍐欎笌鎿嶄綔妯″紡
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
      {/* 2D Canvas 涔﹀啓灞?- 缃簬椤跺眰浣嗗彲琚┛閫?*/}
      <canvas
        ref={canvasRef}
        data-whiteboard-canvas="true"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={cn(
          "absolute left-1/2 top-1/2 aspect-video max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 transition-all duration-200",
          "w-[min(100vw,calc(100vh*16/9))] h-auto",
          interactMode === 'draw' 
            ? "z-[36] pointer-events-auto cursor-crosshair" 
            : "z-20 pointer-events-none"
        )}
        style={{
          filter: isDark ? 'none' : 'invert(1) hue-rotate(180deg)'
        }}
      />

      {/* 鎮诞鑻规灉缇庡鐢荤瑪宸ュ叿绠?*/}
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
        {/* 椤堕儴鎷栧姩鏉?*/}
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

        {/* 妯″紡鍒囨崲 (涔﹀啓 vs 鎿嶄綔) */}
        <div className={cn("relative flex rounded-xl p-1 gap-1 transition-colors", isDark ? "bg-white/5" : "bg-black/5")}>
          <button
            onClick={() => setInteractMode('draw')}
            className={cn(
              "relative p-2.5 rounded-lg flex items-center justify-center w-10 h-10 transition-colors z-10",
              interactMode === 'draw'
                ? (isDark ? "text-cyan-400" : "text-cyan-600")
                : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
            )}
            title="涔﹀啓妯″紡 (Space)"
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
            title="鎿嶄綔妯″紡 (Space)"
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

        {/* 棰滆壊闈㈡澘 */}
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

        {/* 鐢荤瑪绮楃粏 */}
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

        {/* 姗＄毊鎿? 鍦ㄤ功鍐欐ā寮忎笅鎿︾瑪杩? 鍦ㄦ搷浣滄ā寮忎笅鎿﹀嚑浣曞璞?*/}
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
          title={isEraser ? "閫€鍑烘鐨摝" : "姗＄毊鎿?(涔﹀啓妯″紡鎿︾瑪杩?/ 鎿嶄綔妯″紡鎿﹀嚑浣?"}
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

        <div className={cn("w-full h-px transition-colors my-1", isDark ? "bg-white/10" : "bg-black/10")} />

        {/* 鎶樺彔鎮诞寮忓垎椤垫帶浠?*/}
        <div 
          className="relative w-full flex justify-center"
          onMouseEnter={() => setIsPageMenuOpen(true)}
          onMouseLeave={() => setIsPageMenuOpen(false)}
        >
          {/* 涓绘寜閽?(鍙樉绀洪〉鐮佸浘鏍? */}
          <button
            className={cn(
              "p-2.5 rounded-xl transition-colors duration-200 relative cursor-pointer flex items-center justify-center",
              isPageMenuOpen 
                ? (isDark ? "bg-white/10 text-white" : "bg-black/5 text-black")
                : (isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-black")
            )}
            title="多页面管理"
          >
            <Layers className="w-5 h-5" />
            <div className="absolute top-1 right-1 px-[3px] py-[1px] rounded bg-cyan-500 text-white text-[8px] font-bold leading-none transform translate-x-1 -translate-y-1 shadow-sm">
              {currentPageIndex + 1}
            </div>
          </button>

          {/* 鎮诞寮瑰嚭鐨勬í鍚戝垎椤垫帶浠?*/}
          <AnimatePresence>
            {isPageMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: -5 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -5 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "absolute left-full ml-4 top-1/2 -translate-y-1/2 flex items-center gap-1 p-1.5 rounded-2xl backdrop-blur-2xl border shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
                  isDark ? "bg-zinc-900/90 border-white/10" : "bg-white/90 border-black/5"
                )}
              >
                {totalPages > 1 && (
                  <button
                    onClick={() => switchPage(currentPageIndex - 1)}
                    disabled={currentPageIndex === 0}
                    className={cn(
                      "p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center",
                      currentPageIndex === 0 
                        ? "opacity-30 cursor-not-allowed" 
                        : (isDark ? "hover:bg-white/10 text-zinc-300 hover:text-white" : "hover:bg-black/5 text-zinc-600 hover:text-black")
                    )}
                    title="上一页"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                <div className={cn("flex items-center justify-center", totalPages > 1 ? "min-w-[3rem]" : "min-w-[2rem]")}>
                  <span className={cn("text-xs font-bold tracking-wide", isDark ? "text-zinc-200" : "text-zinc-800")}>
                    {currentPageIndex + 1} 
                    {totalPages > 1 && (
                      <><span className="opacity-40 font-normal mx-0.5">/</span> {totalPages}</>
                    )}
                  </span>
                </div>

                {totalPages > 1 && (
                  <button
                    onClick={() => switchPage(currentPageIndex + 1)}
                    disabled={currentPageIndex === totalPages - 1}
                    className={cn(
                      "p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center",
                      currentPageIndex === totalPages - 1 
                        ? "opacity-30 cursor-not-allowed" 
                        : (isDark ? "hover:bg-white/10 text-zinc-300 hover:text-white" : "hover:bg-black/5 text-zinc-600 hover:text-black")
                    )}
                    title="下一页"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

                <div className={cn("w-px h-4 mx-1 rounded-full", isDark ? "bg-white/20" : "bg-black/10")} />

                <button
                  onClick={() => addPage()}
                  className={cn(
                    "p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center",
                    isDark ? "hover:bg-cyan-500/20 text-cyan-400" : "hover:bg-cyan-50 text-cyan-600"
                  )}
                  title="添加新页面"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {totalPages > 1 && (
                  <button
                    onClick={() => {
                      if (confirm('确定要删除当前页面吗？')) {
                        removePage(currentPageIndex);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center",
                      isDark ? "hover:bg-rose-500/20 text-rose-400" : "hover:bg-rose-50 text-rose-500"
                    )}
                    title="删除当前页"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </>
  );
}
