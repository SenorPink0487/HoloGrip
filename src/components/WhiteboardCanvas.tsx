import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useARStore } from '../store';
import { cn } from '../lib/utils';
import { isIPadOS } from '../lib/platform';
import { Eraser, Trash2, Edit3, Move, Plus, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
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

interface StrokeSample extends Point {
  pressure: number;
  tilt: number;
  pointerType: string;
}

type NativePointerEvent = PointerEvent & {
  getCoalescedEvents?: () => PointerEvent[];
};

type AppleTouch = Touch & {
  altitudeAngle?: number;
  azimuthAngle?: number;
  force?: number;
  touchType?: string;
};

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function WhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const isDrawingRef = useRef(false);
  const lastSample = useRef<StrokeSample | null>(null);
  const activePointerId = useRef<number | null>(null);
  const activeTouchId = useRef<number | null>(null);
  const isToolbarForwardedStroke = useRef(false);
  const lastPenInputAt = useRef(0);
  const pageMenuRef = useRef<HTMLDivElement>(null);

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
  const clearPageWhiteboard = useARStore(state => state.clearPageWhiteboard);

  const drawStrokeSegment = useCallback((
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
  }, []);

  const saveCurrentCanvasSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      saveCurrentPageWhiteboard(canvas.toDataURL(), { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
    }
  }, [saveCurrentPageWhiteboard]);

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

  // 清空画板
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
      // 清空时，如果是普通清空而不是换页，也同步更新 store
      if (triggerClearCanvas > 0) {
        saveCurrentPageWhiteboard(null, { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
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

  useEffect(() => {
    const handleRemoteClear = (event: Event) => {
      const detail = (event as CustomEvent<{ pageIndex: number }>).detail;
      const pageIndex = typeof detail?.pageIndex === 'number' ? detail.pageIndex : currentPageIndex;
      if (pageIndex === currentPageIndex) {
        const ctx = ctxRef.current;
        ctx?.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
      }
      clearPageWhiteboard(pageIndex);
    };

    window.addEventListener('holomath:whiteboard-remote-clear', handleRemoteClear);
    return () => window.removeEventListener('holomath:whiteboard-remote-clear', handleRemoteClear);
  }, [clearPageWhiteboard, currentPageIndex]);

  const toLogicalPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WHITEBOARD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * WHITEBOARD_HEIGHT,
    };
  }, []);

  const getPointerSample = useCallback((e: PointerEvent): StrokeSample => {
    const point = toLogicalPoint(e.clientX, e.clientY);
    const isPen = e.pointerType === 'pen';
    const pressure = isPen
      ? clamp(e.pressure || 0.35, 0.08, 1)
      : e.pointerType === 'touch'
        ? clamp(e.pressure || 0.5, 0.25, 1)
        : 0.55;
    const tilt = Math.hypot(e.tiltX || 0, e.tiltY || 0) / 90;

    return {
      ...point,
      pressure,
      tilt: clamp(tilt, 0, 1),
      pointerType: e.pointerType || 'mouse',
    };
  }, [toLogicalPoint]);

  const getTouchSample = useCallback((touch: AppleTouch): StrokeSample => {
    const point = toLogicalPoint(touch.clientX, touch.clientY);
    const isStylus = touch.touchType === 'stylus';
    const pressure = clamp(touch.force || (isStylus ? 0.45 : 0.5), isStylus ? 0.08 : 0.25, 1);
    const tilt = typeof touch.altitudeAngle === 'number'
      ? clamp(1 - touch.altitudeAngle / (Math.PI / 2), 0, 1)
      : 0;

    return {
      ...point,
      pressure,
      tilt,
      pointerType: isStylus ? 'pen' : 'touch',
    };
  }, [toLogicalPoint]);

  const getStrokeWidth = useCallback((sample: StrokeSample) => {
    if (isEraser) {
      return penThickness * (5.5 + sample.pressure * 3);
    }

    if (sample.pointerType === 'pen') {
      const pressureWidth = penThickness * (0.35 + sample.pressure * 1.25);
      const tiltBoost = penThickness * sample.tilt * 0.35;
      return clamp(pressureWidth + tiltBoost, penThickness * 0.35, penThickness * 1.9);
    }

    return penThickness;
  }, [isEraser, penThickness]);

  const paintSampleSegment = useCallback((from: StrokeSample, to: StrokeSample) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const strokeColor = (!isDark && penColor === '#09090b') ? '#ffffff' : penColor;
    const strokeThickness = (getStrokeWidth(from) + getStrokeWidth(to)) / 2;
    drawStrokeSegment(ctx, from, to, strokeColor, strokeThickness, isEraser);

    const stroke: LiveStroke = {
      pageIndex: currentPageIndex,
      from,
      to,
      color: strokeColor,
      thickness: strokeThickness,
      eraser: isEraser,
    };
    window.dispatchEvent(new CustomEvent('holomath:whiteboard-local-stroke', { detail: stroke }));
  }, [currentPageIndex, drawStrokeSegment, getStrokeWidth, isDark, isEraser, penColor]);

  const shouldAcceptPointerEvent = useCallback((e: PointerEvent) => {
    if (interactMode === 'interact') return false;
    if (isIPadOS && (e.pointerType === 'pen' || e.pointerType === 'touch')) return false;
    if (activePointerId.current !== null) {
      return e.pointerId === activePointerId.current || (e.type === 'pointerdown' && e.pointerType === 'pen');
    }
    if (e.pointerType === 'touch' && Date.now() - lastPenInputAt.current < 700) return false;
    return e.isPrimary || e.pointerType === 'pen' || e.pointerType === 'mouse';
  }, [interactMode]);

  const startDrawingFromPointer = useCallback((e: PointerEvent, captureTarget?: HTMLElement) => {
    if (!shouldAcceptPointerEvent(e)) return false;

    if (activePointerId.current !== null && activePointerId.current !== e.pointerId && e.pointerType === 'pen') {
      isDrawingRef.current = false;
      activePointerId.current = null;
      isToolbarForwardedStroke.current = false;
      lastSample.current = null;
    }

    activePointerId.current = e.pointerId;
    activeTouchId.current = null;
    if (e.pointerType === 'pen') lastPenInputAt.current = Date.now();
    isDrawingRef.current = true;
    setIsDrawing(true);
    lastSample.current = getPointerSample(e);
    if (captureTarget) {
      try { captureTarget.setPointerCapture(e.pointerId); } catch {}
    }
    return true;
  }, [getPointerSample, shouldAcceptPointerEvent]);

  const drawFromPointer = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !shouldAcceptPointerEvent(e)) return false;

    if (e.pointerType === 'pen') lastPenInputAt.current = Date.now();
    const nativeEvent = e as NativePointerEvent;
    const events = nativeEvent.getCoalescedEvents?.() ?? [nativeEvent];
    for (const pointerEvent of events) {
      const currentSample = getPointerSample(pointerEvent);
      if (lastSample.current) {
        paintSampleSegment(lastSample.current, currentSample);
      }
      lastSample.current = currentSample;
    }
    return true;
  }, [getPointerSample, paintSampleSegment, shouldAcceptPointerEvent]);

  const stopDrawingFromPointer = useCallback((e?: PointerEvent, captureTarget?: HTMLElement) => {
    if (e && activePointerId.current !== e.pointerId) return false;
    if (e && captureTarget) {
      try { captureTarget.releasePointerCapture(e.pointerId); } catch {}
    }
    const wasDrawing = isDrawingRef.current;
    isDrawingRef.current = false;
    setIsDrawing(false);
    activePointerId.current = null;
    isToolbarForwardedStroke.current = false;
    lastSample.current = null;
    if (wasDrawing) saveCurrentCanvasSnapshot();
    return wasDrawing;
  }, [saveCurrentCanvasSnapshot]);

  const findActiveTouch = useCallback((touches: TouchList) => {
    if (activeTouchId.current === null) return null;
    for (let i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === activeTouchId.current) {
        return touches[i] as AppleTouch;
      }
    }
    return null;
  }, []);

  const pickDrawingTouch = useCallback((touches: TouchList) => {
    for (let i = 0; i < touches.length; i += 1) {
      const touch = touches[i] as AppleTouch;
      if (touch.touchType === 'stylus') return touch;
    }
    return touches[0] as AppleTouch | undefined;
  }, []);

  const startDrawingFromTouch = useCallback((touch: AppleTouch) => {
    if (interactMode === 'interact') return false;

    activeTouchId.current = touch.identifier;
    activePointerId.current = null;
    isToolbarForwardedStroke.current = false;
    isDrawingRef.current = true;
    setIsDrawing(true);
    lastSample.current = getTouchSample(touch);
    if (touch.touchType === 'stylus') lastPenInputAt.current = Date.now();
    return true;
  }, [getTouchSample, interactMode]);

  const drawFromTouch = useCallback((touch: AppleTouch) => {
    if (!isDrawingRef.current || activeTouchId.current !== touch.identifier) return false;

    const currentSample = getTouchSample(touch);
    if (lastSample.current) {
      paintSampleSegment(lastSample.current, currentSample);
    }
    lastSample.current = currentSample;
    if (touch.touchType === 'stylus') lastPenInputAt.current = Date.now();
    return true;
  }, [getTouchSample, paintSampleSegment]);

  const stopDrawingFromTouch = useCallback((touch?: AppleTouch) => {
    if (touch && activeTouchId.current !== touch.identifier) return false;
    const wasDrawing = isDrawingRef.current;
    activeTouchId.current = null;
    isDrawingRef.current = false;
    setIsDrawing(false);
    lastSample.current = null;
    if (wasDrawing) saveCurrentCanvasSnapshot();
    return wasDrawing;
  }, [saveCurrentCanvasSnapshot]);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!startDrawingFromPointer(e.nativeEvent, e.currentTarget)) return;
    isToolbarForwardedStroke.current = false;
    e.preventDefault();
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawFromPointer(e.nativeEvent)) return;
    e.preventDefault();
  };

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    stopDrawingFromPointer(e?.nativeEvent, e?.currentTarget);
  };

  useEffect(() => {
    if (!isIPadOS) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = pickDrawingTouch(e.changedTouches);
      if (!touch || !startDrawingFromTouch(touch)) return;
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = findActiveTouch(e.changedTouches);
      if (!touch || !drawFromTouch(touch)) return;
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = findActiveTouch(e.changedTouches);
      if (!touch) return;
      stopDrawingFromTouch(touch);
      e.preventDefault();
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [drawFromTouch, findActiveTouch, pickDrawingTouch, startDrawingFromTouch, stopDrawingFromTouch]);

  useEffect(() => {
    if (isIPadOS) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      const toolbar = toolbarRef.current;
      if (!toolbar || !toolbar.contains(e.target as Node)) return;
      if (!startDrawingFromPointer(e)) return;
      isToolbarForwardedStroke.current = true;
      e.preventDefault();
      e.stopPropagation();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (
        e.pointerType !== 'pen' ||
        activePointerId.current !== e.pointerId ||
        !isToolbarForwardedStroke.current
      ) {
        return;
      }
      if (!drawFromPointer(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (
        e.pointerType !== 'pen' ||
        activePointerId.current !== e.pointerId ||
        !isToolbarForwardedStroke.current
      ) {
        return;
      }
      stopDrawingFromPointer(e);
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [drawFromPointer, startDrawingFromPointer, stopDrawingFromPointer]);


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

  useEffect(() => {
    if (!isPageMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pageMenuRef.current?.contains(target)) return;
      setIsPageMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPageMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPageMenuOpen]);

  if (activeTab !== 'whiteboard' && activeTab !== 'function') return null;

  return (
    <>
      {/* 2D Canvas 涔﹀啓灞?- 缃簬椤跺眰浣嗗彲琚┛閫?*/}
      <canvas
        ref={canvasRef}
        data-whiteboard-canvas="true"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onLostPointerCapture={stopDrawing}
        className={cn(
          "absolute left-1/2 top-1/2 aspect-video max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 transition-all duration-200",
          "w-[min(100vw,calc(100vh*16/9))] h-auto",
          interactMode === 'draw' 
            ? "z-[36] pointer-events-auto cursor-crosshair" 
            : "z-20 pointer-events-none"
        )}
        style={{
          filter: isDark ? 'none' : 'invert(1) hue-rotate(180deg)',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      />

      {/* 鎮诞鑻规灉缇庡鐢荤瑪宸ュ叿绠?*/}
      <motion.div
        ref={toolbarRef}
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

        {/* 橡皮擦：书写模式下擦笔迹，操作模式下擦几何对象 */}
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
          title={isEraser ? "退出橡皮擦" : "橡皮擦（书写模式擦笔迹 / 操作模式擦几何对象）"}
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
      <div
        ref={pageMenuRef}
        className="absolute bottom-[7.25rem] left-1/2 z-[41] flex -translate-x-1/2 justify-center pointer-events-auto"
      >
        <div
          className={cn(
            "overflow-hidden border backdrop-blur-md shadow-lg transition-[width,border-radius,padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isPageMenuOpen ? "w-[min(48rem,calc(100vw-2rem))] rounded-[28px] p-3" : "w-[104px] rounded-[26px] p-1.5",
            isDark ? "border-white/12 bg-zinc-950/92 text-white" : "border-black/10 bg-white/92 text-zinc-950"
          )}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPageMenuOpen(open => !open)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full px-3 transition-all cursor-pointer shrink-0",
                isDark ? "hover:bg-white/10" : "hover:bg-black/5"
              )}
              title="页面预览"
            >
              <Layers className="h-4 w-4" />
              <span className="text-xs font-semibold tabular-nums">{currentPageIndex + 1} / {totalPages}</span>
            </button>

            <AnimatePresence initial={false}>
              {isPageMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0.92, 
                    filter: "blur(6px)",
                    transition: { duration: 0.12, ease: "easeIn" }
                  }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex shrink-0 items-center gap-2 overflow-hidden"
                >
                  <div className={cn("h-8 w-px shrink-0", isDark ? "bg-white/10" : "bg-black/10")} />
                  <button
                    onClick={() => switchPage(currentPageIndex - 1)}
                    disabled={currentPageIndex === 0}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                      currentPageIndex === 0
                        ? "cursor-not-allowed opacity-30"
                        : (isDark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-black/5 hover:text-zinc-950")
                    )}
                    title="上一页"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex max-w-[min(32rem,calc(100vw-15rem))] gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {pages.map((page, index) => {
                      const isActive = index === currentPageIndex;
                      const geometryCount =
                        (page.geometry?.points?.length ?? 0) +
                        (page.geometry?.segments?.length ?? 0) +
                        (page.geometry?.circles?.length ?? 0);
                      const hasContent = Boolean(page.whiteboardDataUrl) || geometryCount > 0;

                      return (
                        <button
                          key={page.id}
                          onClick={() => switchPage(index)}
                          className={cn(
                            "group relative shrink-0 rounded-[1.15rem] p-1.5 text-left transition-all duration-200",
                            isActive
                              ? (isDark ? "bg-cyan-400/18 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_12px_34px_rgba(8,145,178,0.24)]" : "bg-cyan-500/12 shadow-[0_0_0_1px_rgba(8,145,178,0.28),0_12px_30px_rgba(8,145,178,0.16)]")
                              : (isDark ? "hover:bg-white/8" : "hover:bg-black/5")
                          )}
                          title={`第 ${index + 1} 页`}
                        >
                          <div className={cn(
                            "relative h-[4.1rem] w-[7rem] overflow-hidden rounded-xl border",
                            isActive
                              ? (isDark ? "border-cyan-300/65" : "border-cyan-500/55")
                              : (isDark ? "border-white/10" : "border-black/10")
                          )}>
                            <div className={cn("absolute inset-0", isDark ? "bg-zinc-950" : "bg-zinc-50")}>
                              <div
                                className={cn(
                                  "absolute inset-0 opacity-60",
                                  isDark
                                    ? "bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)]"
                                    : "bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)]"
                                )}
                                style={{ backgroundSize: '18px 18px' }}
                              />
                            </div>
                            {page.whiteboardDataUrl && (
                              <img
                                src={page.whiteboardDataUrl}
                                alt=""
                                className={cn("absolute inset-0 h-full w-full object-cover", !isDark && "invert hue-rotate-180")}
                                draggable={false}
                              />
                            )}
                            {!hasContent && (
                              <div className={cn("absolute inset-0 flex items-center justify-center text-[11px] font-medium", isDark ? "text-zinc-600" : "text-zinc-400")}>
                                空白
                              </div>
                            )}
                            {geometryCount > 0 && (
                              <div className={cn("absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-md", isDark ? "bg-zinc-950/70 text-cyan-200" : "bg-white/75 text-cyan-700")}>
                                {geometryCount}
                              </div>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between px-1">
                            <span className={cn("text-[11px] font-semibold", isActive ? (isDark ? "text-cyan-200" : "text-cyan-700") : (isDark ? "text-zinc-400" : "text-zinc-500"))}>
                              {index + 1}
                            </span>
                            {isActive && totalPages > 1 && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (confirm('确定要删除当前页面吗？')) removePage(currentPageIndex);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter' && event.key !== ' ') return;
                                  event.stopPropagation();
                                  if (confirm('确定要删除当前页面吗？')) removePage(currentPageIndex);
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-full opacity-80 transition-all hover:opacity-100",
                                  isDark ? "text-rose-300 hover:bg-rose-400/15" : "text-rose-500 hover:bg-rose-500/10"
                                )}
                                title="删除当前页"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => switchPage(currentPageIndex + 1)}
                    disabled={currentPageIndex === totalPages - 1}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                      currentPageIndex === totalPages - 1
                        ? "cursor-not-allowed opacity-30"
                        : (isDark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-black/5 hover:text-zinc-950")
                    )}
                    title="下一页"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={addPage}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                      isDark ? "bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400/25" : "bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/15"
                    )}
                    title="添加新页面"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
