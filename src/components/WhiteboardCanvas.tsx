import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWhiteboardStore } from '../stores/whiteboardStore';
import { useSessionStore } from '../stores/sessionStore';
import { cn } from '../lib/utils';
import { isIPadOS } from '../lib/platform';
import { Eraser, Edit3, Move, LineChart, Sigma, Box, Calculator } from 'lucide-react';
import { motion, useDragControls, AnimatePresence } from 'motion/react';
import { Tooltip } from './Tooltip';
import { StrokeBuilder, renderStrokeSegments } from '../lib/strokeEngine';
import type { StrokePoint } from '../lib/strokeEngine';
import { createEmbed } from './WhiteboardEmbedsLayer';

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

const Function2DIcon = ({ className = "w-4 h-4 text-cyan-500" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="19" x2="21" y2="19" />
    <line x1="5" y1="3" x2="5" y2="21" />
    <path d="M5 14C9 6 13 18 20 7" strokeWidth="2.2" />
  </svg>
);

const Geometry3DIcon = ({ className = "w-4 h-4 text-violet-500" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v9m0 0l-7.5 4.5M12 12l7.5 4.5" />
    <path d="M21 8.5L12 3 3 8.5v7L12 21l9-5.5z" />
  </svg>
);

interface StrokeSample extends Point {
  pressure: number;
  tilt: number;
  pointerType: string;
  timestamp: number;
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
const useARStore = useWhiteboardStore;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05
    }
  }
} as const;

const cardVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 8 },
  show: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 24
    }
  }
} as const;

export function WhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const lastSample = useRef<StrokeSample | null>(null);
  const activePointerId = useRef<number | null>(null);
  const activeTouchId = useRef<number | null>(null);
  const isToolbarForwardedStroke = useRef(false);
  const lastPenInputAt = useRef(0);
  const strokeBuilderRef = useRef<StrokeBuilder | null>(null);

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
  const theme = useSessionStore(state => state.theme);
  const isDark = theme === 'dark';

  const addWhiteboardEmbed = useARStore(state => state.addWhiteboardEmbed);
  const [showGraphCalcMenu, setShowGraphCalcMenu] = useState(false);
  const pages = useARStore(state => state.pages);
  const currentPageIndex = useARStore(state => state.currentPageIndex);
  const page = pages[currentPageIndex];
  const embeds = page?.embeds ?? [];
  const maxZ = useMemo(() => embeds.reduce((max, embed) => Math.max(max, embed.zIndex), 0), [embeds]);
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

      // 挂载时立即还原当前页笔迹，解决从物理/化学等板块切回时画板空白的问题
      const currentPage = pages[currentPageIndex];
      if (currentPage && currentPage.whiteboardDataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
          ctx.drawImage(img, 0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
        };
        img.src = currentPage.whiteboardDataUrl;
      }
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
  }, [currentPageIndex, whiteboardRestoreVersion, pages]);

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
      timestamp: e.timeStamp || performance.now(),
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
      timestamp: performance.now(),
    };
  }, [toLogicalPoint]);

  const getStrokeWidth = useCallback((sample: StrokeSample) => {
    if (isEraser) {
      return penThickness * (5.5 + sample.pressure * 3);
    }

    if (sample.pointerType === 'pen') {
      const pressureFactor = 0.72 + sample.pressure * 0.45;
      const tiltFactor = 1 + sample.tilt * 0.12;
      return clamp(penThickness * pressureFactor * tiltFactor, penThickness * 0.65, penThickness * 1.35);
    }

    return penThickness;
  }, [isEraser, penThickness]);

  const paintWithEngine = useCallback((sample: StrokeSample) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const strokeColor = (!isDark && penColor === '#09090b') ? '#ffffff' : penColor;

    // Initialize builder on first sample of stroke
    const isFirstSample = !strokeBuilderRef.current;
    if (isFirstSample) {
      strokeBuilderRef.current = new StrokeBuilder(penThickness, isEraser);
    }

    const point: StrokePoint = {
      x: sample.x,
      y: sample.y,
      pressure: sample.pressure,
      tilt: sample.tilt,
      timestamp: sample.timestamp,
      pointerType: sample.pointerType,
    };

    // Show ink at contact immediately. The spline catches up with it after the
    // next samples arrive; without this dot, taps and the first part of a fast
    // stroke look as if the pen starts late.
    if (isFirstSample) {
      const width = getStrokeWidth(sample);
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, width / 2, 0, Math.PI * 2);
      ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
      if (!isEraser) ctx.fillStyle = strokeColor;
      ctx.fill();
    }

    const segments = strokeBuilderRef.current.addSample(point);
    if (segments.length > 0) {
      renderStrokeSegments(ctx, segments, strokeColor, isEraser);
    }

    // Still emit legacy events for remote sync compatibility
    if (lastSample.current) {
      const strokeThickness = (getStrokeWidth(lastSample.current) + getStrokeWidth(sample)) / 2;
      const stroke: LiveStroke = {
        pageIndex: currentPageIndex,
        from: lastSample.current,
        to: sample,
        color: strokeColor,
        thickness: strokeThickness,
        eraser: isEraser,
      };
      window.dispatchEvent(new CustomEvent('holomath:whiteboard-local-stroke', { detail: stroke }));
    }
  }, [currentPageIndex, getStrokeWidth, isDark, isEraser, penColor, penThickness]);

  const finishStroke = useCallback(() => {
    const ctx = ctxRef.current;
    const builder = strokeBuilderRef.current;
    if (!ctx || !builder) return;

    const strokeColor = (!isDark && penColor === '#09090b') ? '#ffffff' : penColor;
    const finalSegments = builder.finish();
    if (finalSegments.length > 0) {
      renderStrokeSegments(ctx, finalSegments, strokeColor, isEraser);
    }
    strokeBuilderRef.current = null;
  }, [isDark, isEraser, penColor]);

  const shouldAcceptPointerEvent = useCallback((e: PointerEvent) => {
    if (interactMode === 'interact') return false;
    // iPadOS exposes Pencil samples as PointerEvents in current WKWebView and
    // Safari. The whiteboard also deliberately supports one-finger writing;
    // requiring pointerType=pen made the canvas appear completely broken to
    // users without an Apple Pencil.
    if (isIPadOS) {
      return e.pointerType === 'pen' || (e.pointerType === 'touch' && e.isPrimary);
    }
    if (activePointerId.current !== null) {
      return e.pointerId === activePointerId.current || (e.type === 'pointerdown' && e.pointerType === 'pen');
    }
    if (e.pointerType === 'touch' && Date.now() - lastPenInputAt.current < 700) return false;
    return e.isPrimary || e.pointerType === 'pen' || e.pointerType === 'mouse';
  }, [interactMode]);

  const startDrawingFromPointer = useCallback((e: PointerEvent, captureTarget?: HTMLElement) => {
    if (!shouldAcceptPointerEvent(e)) return false;

    if (activePointerId.current !== null && activePointerId.current !== e.pointerId && e.pointerType === 'pen') {
      finishStroke();
      isDrawingRef.current = false;
      activePointerId.current = null;
      isToolbarForwardedStroke.current = false;
      lastSample.current = null;
    }

    activePointerId.current = e.pointerId;
    activeTouchId.current = null;
    if (e.pointerType === 'pen') lastPenInputAt.current = Date.now();
    strokeBuilderRef.current = null; // Reset builder for new stroke
    isDrawingRef.current = true;
    setIsDrawing(true);
    const sample = getPointerSample(e);
    lastSample.current = sample;
    paintWithEngine(sample);
    if (captureTarget) {
      try { captureTarget.setPointerCapture(e.pointerId); } catch {}
    }
    return true;
  }, [finishStroke, getPointerSample, paintWithEngine, shouldAcceptPointerEvent]);

  const drawFromPointer = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !shouldAcceptPointerEvent(e)) return false;

    if (e.pointerType === 'pen') lastPenInputAt.current = Date.now();
    const nativeEvent = e as NativePointerEvent;
    const events = nativeEvent.getCoalescedEvents?.() ?? [nativeEvent];
    for (const pointerEvent of events) {
      const currentSample = getPointerSample(pointerEvent);
      paintWithEngine(currentSample);
      lastSample.current = currentSample;
    }
    return true;
  }, [getPointerSample, paintWithEngine, shouldAcceptPointerEvent]);

  const stopDrawingFromPointer = useCallback((e?: PointerEvent, captureTarget?: HTMLElement) => {
    if (e && activePointerId.current !== e.pointerId) return false;
    if (e && captureTarget) {
      try { captureTarget.releasePointerCapture(e.pointerId); } catch {}
    }
    const wasDrawing = isDrawingRef.current;
    if (wasDrawing) finishStroke();
    isDrawingRef.current = false;
    setIsDrawing(false);
    activePointerId.current = null;
    isToolbarForwardedStroke.current = false;
    lastSample.current = null;
    if (wasDrawing) saveCurrentCanvasSnapshot();
    return wasDrawing;
  }, [finishStroke, saveCurrentCanvasSnapshot]);

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
    // Older WKWebViews may expose Pencil/finger input only as TouchEvents.
    // The caller rejects multi-touch before reaching here, which preserves
    // palm/gesture rejection while allowing intentional one-finger writing.
    return touches[0] as AppleTouch | undefined;
  }, []);

  const startDrawingFromTouch = useCallback((touch: AppleTouch) => {
    if (interactMode === 'interact') return false;

    activeTouchId.current = touch.identifier;
    activePointerId.current = null;
    isToolbarForwardedStroke.current = false;
    strokeBuilderRef.current = null; // Reset builder for new stroke
    isDrawingRef.current = true;
    setIsDrawing(true);
    const sample = getTouchSample(touch);
    lastSample.current = sample;
    paintWithEngine(sample);
    if (touch.touchType === 'stylus') lastPenInputAt.current = Date.now();
    return true;
  }, [getTouchSample, interactMode, paintWithEngine]);

  const drawFromTouch = useCallback((touch: AppleTouch) => {
    if (!isDrawingRef.current || activeTouchId.current !== touch.identifier) return false;

    const currentSample = getTouchSample(touch);
    paintWithEngine(currentSample);
    lastSample.current = currentSample;
    if (touch.touchType === 'stylus') lastPenInputAt.current = Date.now();
    return true;
  }, [getTouchSample, paintWithEngine]);

  const stopDrawingFromTouch = useCallback((touch?: AppleTouch) => {
    if (touch && activeTouchId.current !== touch.identifier) return false;
    const wasDrawing = isDrawingRef.current;
    if (wasDrawing) finishStroke();
    activeTouchId.current = null;
    isDrawingRef.current = false;
    setIsDrawing(false);
    lastSample.current = null;
    if (wasDrawing) saveCurrentCanvasSnapshot();
    return wasDrawing;
  }, [finishStroke, saveCurrentCanvasSnapshot]);

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
      // Pointer Events win whenever the WebView provides them for Pencil. This
      // prevents Safari from starting the same stroke through both APIs.
      if (activePointerId.current !== null || Date.now() - lastPenInputAt.current < 100) return;
      const hasStylus = Array.from(e.changedTouches).some(
        (touch) => (touch as AppleTouch).touchType === 'stylus',
      );
      if (!hasStylus && e.touches.length !== 1) return;
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
    if (activeTab === 'whiteboard') {
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


  if (activeTab !== 'whiteboard') return null;

  return (
    <>
      {/* 2D Canvas 书写层 - 置于顶层但可被穿透 */}
      <canvas
        ref={canvasRef}
        data-whiteboard-canvas="true"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onLostPointerCapture={stopDrawing}
        className={cn(
          "absolute inset-0 h-full w-full transition-all duration-200",
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

      {/* 悬浮苹果美学画笔工具箱 */}
      <motion.div
        ref={toolbarRef}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        initial={{ x: 32, y: 96 }}
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
        <Tooltip content="拖动工具栏" position="right">
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className={cn(
              "w-28 py-1.5 flex justify-center items-center cursor-grab active:cursor-grabbing rounded-t-2xl transition-colors",
              isDark ? "hover:bg-white/5" : "hover:bg-black/5"
            )}
          >
            <div className={cn("w-12 h-1.5 rounded-full transition-colors", isDark ? "bg-white/20" : "bg-black/15")} />
          </div>
        </Tooltip>

        {/* 模式切换 (书写 vs 操作) */}
        <div className={cn("relative flex rounded-xl p-1 gap-1 transition-colors", isDark ? "bg-white/5" : "bg-black/5")}>
          <Tooltip content="书写模式 (Space)" position="right">
            <button
              onClick={() => setInteractMode('draw')}
              className={cn(
                "relative p-2.5 rounded-lg flex items-center justify-center w-10 h-10 transition-colors z-10 cursor-pointer",
                interactMode === 'draw'
                  ? (isDark ? "text-cyan-400" : "text-cyan-600")
                  : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
              )}
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
          </Tooltip>
          <Tooltip content="操作模式 (Space)" position="right">
            <button
              onClick={() => setInteractMode('interact')}
              className={cn(
                "relative p-2.5 rounded-lg flex items-center justify-center w-10 h-10 transition-colors z-10 cursor-pointer",
                interactMode === 'interact'
                  ? (isDark ? "text-cyan-400" : "text-cyan-600")
                  : (isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800")
              )}
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
          </Tooltip>
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

        {/* 橡皮擦：书写模式下擦笔迹，操作模式下擦几何对象 */}
        <Tooltip content={isEraser ? "退出橡皮擦" : "橡皮擦（书写模式擦笔迹 / 操作模式擦几何对象）"} position="right">
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
        </Tooltip>

        <div className={cn("w-full h-px transition-colors", isDark ? "bg-white/10" : "bg-black/10")} />

        {/* 图形计算器 (合入左侧栏，平面函数 / 空间几何) */}
        <Tooltip content={showGraphCalcMenu ? "" : "图形计算器"} position="right">
          <div className="relative">
            <motion.button
              onClick={() => setShowGraphCalcMenu(prev => !prev)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={cn(
                "p-2.5 rounded-xl transition-all duration-200 relative cursor-pointer flex items-center justify-center",
                showGraphCalcMenu
                  ? (isDark ? "text-cyan-300 bg-cyan-500/20 shadow-md ring-1 ring-cyan-400/30" : "text-cyan-600 bg-cyan-500/15 shadow-sm ring-1 ring-cyan-300/50")
                  : (isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-800")
              )}
            >
              <Calculator className="w-5 h-5" />
            </motion.button>

            {/* Apple 极简弹出子菜单 */}
            <AnimatePresence>
              {showGraphCalcMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, x: -8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: -8 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className={cn(
                    "absolute left-full ml-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 p-1.5 rounded-2xl backdrop-blur-xl border shadow-xl z-50 whitespace-nowrap",
                    isDark ? "bg-zinc-900/90 border-white/10 text-white" : "bg-white/90 border-black/10 text-slate-800"
                  )}
                >
                  <button
                    onClick={() => {
                      addWhiteboardEmbed(createEmbed('function', maxZ + 1));
                      setShowGraphCalcMenu(false);
                      setInteractMode('interact');
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      isDark ? "hover:bg-cyan-500/20 text-cyan-300" : "hover:bg-cyan-50 text-cyan-700"
                    )}
                  >
                    <Function2DIcon className="w-4 h-4 text-cyan-500" />
                    <span>平面函数</span>
                  </button>
                  <div className={cn("w-px h-4", isDark ? "bg-white/15" : "bg-black/10")} />
                  <button
                    onClick={() => {
                      addWhiteboardEmbed(createEmbed('calculator3d', maxZ + 1));
                      setShowGraphCalcMenu(false);
                      setInteractMode('interact');
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      isDark ? "hover:bg-violet-500/20 text-violet-300" : "hover:bg-violet-50 text-violet-700"
                    )}
                  >
                    <Geometry3DIcon className="w-4 h-4 text-violet-500" />
                    <span>空间几何</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Tooltip>

      </motion.div>
    </>
  );
}
