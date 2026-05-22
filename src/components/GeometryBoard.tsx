import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { 
  Play, 
  RotateCcw, 
  Plus, 
  MousePointer, 
  Share2, 
  Activity,
  Maximize2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// ============================================================
// 工具函数
// ============================================================

/** 点到线段的最短距离 */
function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 点到圆周的距离 (到圆环线本身, 不是圆心) */
function distPointToCircle(px: number, py: number, cx: number, cy: number, r: number): number {
  return Math.abs(Math.hypot(px - cx, py - cy) - r);
}

/** Ray casting: 判断点 (px, py) 是否在多边形 (按顺序的顶点数组) 内部 */
function pointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 多边形面积 (有符号), 用于过滤超大外环 */
function polygonArea(poly: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
}
interface Point {
  id: string;
  name: string;
  x: number;
  y: number;
  isFree: boolean; // 是否是自由点（即可以被用户拖动的）
}

interface Segment {
  id: string;
  p1Id: string;
  p2Id: string;
  color?: string;
}

interface Circle {
  id: string;
  centerId: string;
  radiusPointId: string; // 边缘上的点，用于确定半径
}

export function GeometryBoard() {
  const activeTab = useARStore(state => state.activeTab);
  const setInteractMode = useARStore(state => state.setInteractMode);
  const interactMode = useARStore(state => state.interactMode);
  const isEraser = useARStore(state => state.isEraser);

  // 画板状态
  const [points, setPoints] = useState<Point[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);

  // 当前画板选择的工具: 'drag' | 'add_point' | 'add_segment' | 'add_circle'
  const [activeTool, setActiveTool] = useState<'drag' | 'add_point' | 'add_segment' | 'add_circle'>('drag');
  
  // 选中的点（用于连线或画圆）
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  
  // 正在拖拽的点 ID
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

  // 正在拖拽的多边形 (点 ID 集合) 与起始位置
  const [draggingPolygon, setDraggingPolygon] = useState<{
    pointIds: Set<string>;
    startMouse: { x: number; y: number };
    startPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  // 鼠标悬停的对象 (用于发光高亮)
  type HoverEntity =
    | { type: 'point'; id: string }
    | { type: 'segment'; id: string }
    | { type: 'circle'; id: string }
    | { type: 'polygon'; pointIds: string[] }
    | null;
  const [hoverEntity, setHoverEntity] = useState<HoverEntity>(null);

  // 定理演示选择：'board' | 'pythagoras' | 'circle_area'
  const [subModule, setSubModule] = useState<'board' | 'pythagoras' | 'circle_area'>('board');

  // 定理动画状态
  const [pythagorasStep, setPythagorasStep] = useState<number>(0); // 0: 初始, 1: 拼合
  const [circleSlicesCount, setCircleSlicesCount] = useState<number>(16);
  const [circleAreaAnimProgress, setCircleAreaAnimProgress] = useState<boolean>(false); // false: 圆, true: 长方形

  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // 初始化一个经典的“三角形三中线交于重心”演示
  const loadCentroidDemo = () => {
    const pA: Point = { id: 'pA', name: 'A', x: 400, y: 150, isFree: true };
    const pB: Point = { id: 'pB', name: 'B', x: 250, y: 450, isFree: true };
    const pC: Point = { id: 'pC', name: 'C', x: 600, y: 480, isFree: true };
    
    // 中点坐标 (只通过依赖算，不放入 points state，减少更新冗余)
    setPoints([pA, pB, pC]);

    const segs: Segment[] = [
      // 三角形三边
      { id: 'sAB', p1Id: 'pA', p2Id: 'pB', color: 'rgba(255,255,255,0.4)' },
      { id: 'sBC', p1Id: 'pB', p2Id: 'pC', color: 'rgba(255,255,255,0.4)' },
      { id: 'sCA', p1Id: 'pC', p2Id: 'pA', color: 'rgba(255,255,255,0.4)' },
      // 三条中线（在渲染时计算中点并绘制）
    ];
    setSegments(segs);
    setCircles([]);
    setSelectedPointId(null);
  };

  useEffect(() => {
    if (activeTab === 'whiteboard') {
      setSubModule('board');
    }
  }, [activeTab]);

  // 响应全局清空信号: 同时清空所有几何对象 (点 / 线段 / 圆 / 选中态)
  const triggerClearCanvas = useARStore(state => state.triggerClearCanvas);
  useEffect(() => {
    if (triggerClearCanvas === 0) return; // 跳过初始挂载
    setPoints([]);
    setSegments([]);
    setCircles([]);
    setSelectedPointId(null);
    setDraggingPointId(null);
    setDraggingPolygon(null);
    setHoverEntity(null);
  }, [triggerClearCanvas]);

  // 注: 之前的"自动加载三角形重心演示"已移除, 白板默认为空画板,
  // 用户可通过顶部工具条主动描点 / 画线 / 画圆。

  // 计算中线相关的依赖点
  const getDerivedElements = () => {
    const ptA = points.find(p => p.id === 'pA');
    const ptB = points.find(p => p.id === 'pB');
    const ptC = points.find(p => p.id === 'pC');

    if (!ptA || !ptB || !ptC) return { midPoints: [], centroid: null };

    // 中点 D (在 BC 上), E (在 CA 上), F (在 AB 上)
    const ptD = { id: 'pD', name: 'D', x: (ptB.x + ptC.x) / 2, y: (ptB.y + ptC.y) / 2, isFree: false };
    const ptE = { id: 'pE', name: 'E', x: (ptC.x + ptA.x) / 2, y: (ptC.y + ptA.y) / 2, isFree: false };
    const ptF = { id: 'pF', name: 'F', x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2, isFree: false };

    // 重心 G
    const ptG = { 
      id: 'pG', 
      name: '重心 G', 
      x: (ptA.x + ptB.x + ptC.x) / 3, 
      y: (ptA.y + ptB.y + ptC.y) / 3, 
      isFree: false 
    };

    return {
      midPoints: [ptD, ptE, ptF],
      centroid: ptG
    };
  };

  const { midPoints, centroid } = getDerivedElements();

  // ============================================================
  // 由 segments 计算所有简单环 (即闭合多边形)
  // 复杂度: 在小图 (~ 20 点) 下足够快
  // ============================================================
  const polygons = useMemo<Array<string[]>>(() => {
    if (points.length < 3 || segments.length < 3) return [];
    // 邻接表
    const adj = new Map<string, Set<string>>();
    for (const p of points) adj.set(p.id, new Set());
    for (const s of segments) {
      adj.get(s.p1Id)?.add(s.p2Id);
      adj.get(s.p2Id)?.add(s.p1Id);
    }
    const cycles: string[][] = [];
    const seenCycles = new Set<string>();

    /** 把环规范化: 找最小起点 + 选字典序较小的方向 */
    const canonicalize = (cycle: string[]): string => {
      const n = cycle.length;
      let minIdx = 0;
      for (let i = 1; i < n; i++) {
        if (cycle[i] < cycle[minIdx]) minIdx = i;
      }
      const fwd = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
      const bwd = [fwd[0], ...fwd.slice(1).reverse()];
      const a = fwd.join(',');
      const b = bwd.join(',');
      return a < b ? a : b;
    };

    // DFS: 从每个节点开始找回路
    for (const start of points) {
      const stack: Array<{ node: string; path: string[] }> = [{ node: start.id, path: [start.id] }];
      while (stack.length) {
        const { node, path } = stack.pop()!;
        if (path.length > 8) continue; // 限制环长度避免爆炸
        for (const nb of adj.get(node) ?? []) {
          if (nb === start.id && path.length >= 3) {
            // 找到环
            const key = canonicalize(path);
            if (!seenCycles.has(key)) {
              seenCycles.add(key);
              cycles.push([...path]);
            }
          } else if (!path.includes(nb) && nb > start.id) {
            // 只走 id 字典序大于 start 的, 避免重复
            stack.push({ node: nb, path: [...path, nb] });
          }
        }
      }
    }
    return cycles;
  }, [points, segments]);

  /** 把环 (point id 数组) 转换为坐标数组 */
  const polygonCoords = useCallback((cycle: string[]): Array<{ x: number; y: number }> => {
    return cycle.map(id => {
      const p = points.find(pp => pp.id === id);
      return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
    });
  }, [points]);


  // ============================================================
  // 命中检测 (返回最近的对象)
  // ============================================================
  const HIT_RADIUS = 12;
  const SEG_HIT = 8;

  /** 在屏幕坐标 (x, y) 处找到最近的对象, 优先级: 点 > 线段 > 圆周 > 多边形内部 */
  const hitTest = useCallback((x: number, y: number): HoverEntity => {
    // 点
    let bestPoint: { id: string; d: number } | null = null;
    for (const p of points) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < HIT_RADIUS && (!bestPoint || d < bestPoint.d)) bestPoint = { id: p.id, d };
    }
    if (bestPoint) return { type: 'point', id: bestPoint.id };

    // 线段
    let bestSeg: { id: string; d: number } | null = null;
    for (const s of segments) {
      const p1 = points.find(p => p.id === s.p1Id);
      const p2 = points.find(p => p.id === s.p2Id);
      if (!p1 || !p2) continue;
      const d = distPointToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      if (d < SEG_HIT && (!bestSeg || d < bestSeg.d)) bestSeg = { id: s.id, d };
    }
    if (bestSeg) return { type: 'segment', id: bestSeg.id };

    // 圆周
    let bestCircle: { id: string; d: number } | null = null;
    for (const c of circles) {
      const cp = points.find(p => p.id === c.centerId);
      const rp = points.find(p => p.id === c.radiusPointId);
      if (!cp || !rp) continue;
      const r = Math.hypot(rp.x - cp.x, rp.y - cp.y);
      const d = distPointToCircle(x, y, cp.x, cp.y, r);
      if (d < SEG_HIT && (!bestCircle || d < bestCircle.d)) bestCircle = { id: c.id, d };
    }
    if (bestCircle) return { type: 'circle', id: bestCircle.id };

    // 多边形内部 (取面积最小的, 内层优先)
    let bestPoly: { ids: string[]; area: number } | null = null;
    for (const cy of polygons) {
      const coords = polygonCoords(cy);
      if (pointInPolygon(x, y, coords)) {
        const a = polygonArea(coords);
        if (!bestPoly || a < bestPoly.area) bestPoly = { ids: cy, area: a };
      }
    }
    if (bestPoly) return { type: 'polygon', pointIds: bestPoly.ids };

    return null;
  }, [points, segments, circles, polygons, polygonCoords]);

  // ============================================================
  // 鼠标/触控交互
  // ============================================================
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = hitTest(x, y);

    // 橡皮擦模式: 命中即删除
    if (isEraser) {
      if (hit?.type === 'point') {
        // 删除点 + 与之相关的线段/圆
        setPoints(prev => prev.filter(p => p.id !== hit.id));
        setSegments(prev => prev.filter(s => s.p1Id !== hit.id && s.p2Id !== hit.id));
        setCircles(prev => prev.filter(c => c.centerId !== hit.id && c.radiusPointId !== hit.id));
      } else if (hit?.type === 'segment') {
        setSegments(prev => prev.filter(s => s.id !== hit.id));
      } else if (hit?.type === 'circle') {
        setCircles(prev => prev.filter(c => c.id !== hit.id));
      } else if (hit?.type === 'polygon') {
        // 删除构成多边形的所有线段 (保留点, 用户可能还要用)
        const ids = new Set(hit.pointIds);
        setSegments(prev => prev.filter(s => !(ids.has(s.p1Id) && ids.has(s.p2Id))));
      }
      return;
    }

    if (activeTool === 'drag') {
      // 优先拖单个点
      if (hit?.type === 'point') {
        const p = points.find(pp => pp.id === hit.id);
        if (p && p.isFree) {
          setDraggingPointId(p.id);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      // 其次: 拖整个多边形
      if (hit?.type === 'polygon') {
        const ids = new Set(hit.pointIds);
        const startPositions: Record<string, { x: number; y: number }> = {};
        for (const p of points) {
          if (ids.has(p.id) && p.isFree) startPositions[p.id] = { x: p.x, y: p.y };
        }
        if (Object.keys(startPositions).length > 0) {
          setDraggingPolygon({
            pointIds: ids,
            startMouse: { x, y },
            startPositions,
          });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      return;
    }

    if (activeTool === 'add_point') {
      if (!hit || hit.type !== 'point') {
        const newPoint: Point = {
          id: `p_${Date.now()}`,
          name: String.fromCharCode(65 + (points.length % 26)),
          x,
          y,
          isFree: true,
        };
        setPoints([...points, newPoint]);
      }
      return;
    }

    if (activeTool === 'add_segment') {
      if (hit?.type === 'point') {
        if (!selectedPointId) {
          setSelectedPointId(hit.id);
        } else {
          if (selectedPointId !== hit.id) {
            const newSeg: Segment = {
              id: `s_${Date.now()}`,
              p1Id: selectedPointId,
              p2Id: hit.id,
            };
            setSegments([...segments, newSeg]);
          }
          setSelectedPointId(null);
        }
      }
      return;
    }

    if (activeTool === 'add_circle') {
      if (hit?.type === 'point') {
        if (!selectedPointId) {
          setSelectedPointId(hit.id);
        } else {
          if (selectedPointId !== hit.id) {
            const newCircle: Circle = {
              id: `c_${Date.now()}`,
              centerId: selectedPointId,
              radiusPointId: hit.id,
            };
            setCircles([...circles, newCircle]);
          }
          setSelectedPointId(null);
        }
      }
      return;
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 拖单个点
    if (draggingPointId) {
      const cx = Math.max(10, Math.min(rect.width - 10, x));
      const cy = Math.max(10, Math.min(rect.height - 10, y));
      setPoints(points.map(p => p.id === draggingPointId ? { ...p, x: cx, y: cy } : p));
      return;
    }

    // 拖整个多边形
    if (draggingPolygon) {
      const dx = x - draggingPolygon.startMouse.x;
      const dy = y - draggingPolygon.startMouse.y;
      setPoints(prev => prev.map(p => {
        const start = draggingPolygon.startPositions[p.id];
        if (!start) return p;
        const nx = Math.max(10, Math.min(rect.width - 10, start.x + dx));
        const ny = Math.max(10, Math.min(rect.height - 10, start.y + dy));
        return { ...p, x: nx, y: ny };
      }));
      return;
    }

    // 普通悬停: 命中检测以高亮
    const hit = hitTest(x, y);
    setHoverEntity(hit);
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPointId) {
      setDraggingPointId(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    }
    if (draggingPolygon) {
      setDraggingPolygon(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  const handleSvgPointerLeave = () => {
    setHoverEntity(null);
  };


  return (
    <div className="w-full h-full bg-transparent select-none relative">
      {/* 顶部中央悬浮工具条 - 在超级白板下显示 */}
      {activeTab === 'whiteboard' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-xl select-none z-[38]">
          <button
            onClick={() => { setActiveTool('drag'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
              activeTool === 'drag' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
            title="拖拽点移动"
          >
            <MousePointer className="w-4 h-4" />
            <span>拖拽</span>
          </button>
          
          <button
            onClick={() => { setActiveTool('add_point'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
              activeTool === 'add_point' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
            title="在空白处加点"
          >
            <Plus className="w-4 h-4" />
            <span>描点</span>
          </button>

          <button
            onClick={() => { setActiveTool('add_segment'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
              activeTool === 'add_segment' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
            title="点击两点连接成线"
          >
            <span className="w-4 h-0.5 bg-current rounded-full" />
            <span>画线段</span>
          </button>

          <button
            onClick={() => { setActiveTool('add_circle'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
              activeTool === 'add_circle' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
            title="选择圆心和半径点画圆"
          >
            <span className="w-3.5 h-3.5 border-2 border-current rounded-full" />
            <span>画圆</span>
          </button>
        </div>
      )}

      {/* 主探究区 - 撑满全局，彻底解决与超级白板切换时的 Layout Shift */}
      <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-8 z-[35]">
        
        {/* 1. 自由几何画板渲染 (SVG) */}
        {subModule === 'board' && (
          <svg
            ref={svgRef}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerLeave}
            className={cn(
              'w-full h-full bg-zinc-950/40 rounded-[2rem] border border-white/5 shadow-inner',
              // cursor 反馈
              isEraser
                ? 'cursor-crosshair'
                : activeTool === 'drag'
                  ? hoverEntity ? 'cursor-grab' : 'cursor-default'
                  : 'cursor-crosshair'
            )}
            style={isEraser && hoverEntity ? { cursor: 'pointer' } : undefined}
          >
            <defs>
              <pattern id="geometry-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
              </pattern>
              {/* 几何要素发光滤镜 (hover 时) */}
              <filter id="geo-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="geo-glow-rose" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#geometry-grid)" />

            {/* === 多边形高亮 (拖动 / 橡皮擦悬停) === */}
            {hoverEntity?.type === 'polygon' && (() => {
              const coords = polygonCoords(hoverEntity.pointIds);
              const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x},${c.y}`).join(' ') + ' Z';
              const stroke = isEraser ? '#fb7185' : '#22d3ee';
              const fill = isEraser ? 'rgba(251, 113, 133, 0.10)' : 'rgba(34, 211, 238, 0.10)';
              return (
                <path
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray="6,4"
                  filter={isEraser ? 'url(#geo-glow-rose)' : 'url(#geo-glow-cyan)'}
                  className="pointer-events-none"
                />
              );
            })()}

            {/* === 圆 === */}
            {circles.map(circle => {
              const cp = points.find(p => p.id === circle.centerId);
              const rp = points.find(p => p.id === circle.radiusPointId);
              if (!cp || !rp) return null;
              const radius = Math.sqrt((rp.x - cp.x) ** 2 + (rp.y - cp.y) ** 2);
              const isHover = hoverEntity?.type === 'circle' && hoverEntity.id === circle.id;
              const stroke = isHover
                ? (isEraser ? '#fb7185' : '#22d3ee')
                : 'rgba(255, 255, 255, 0.5)';
              return (
                <circle
                  key={circle.id}
                  cx={cp.x}
                  cy={cp.y}
                  r={radius}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isHover ? 3 : 2}
                  filter={isHover ? (isEraser ? 'url(#geo-glow-rose)' : 'url(#geo-glow-cyan)') : undefined}
                  className="transition-[stroke-width] duration-150"
                />
              );
            })}

            {/* === 线段 === */}
            {segments.map(seg => {
              const p1 = points.find(p => p.id === seg.p1Id);
              const p2 = points.find(p => p.id === seg.p2Id);
              if (!p1 || !p2) return null;
              const isHover = hoverEntity?.type === 'segment' && hoverEntity.id === seg.id;
              const stroke = isHover
                ? (isEraser ? '#fb7185' : '#22d3ee')
                : (seg.color || 'rgba(255, 255, 255, 0.75)');
              return (
                <line
                  key={seg.id}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={stroke}
                  strokeWidth={isHover ? 5 : 3}
                  strokeLinecap="round"
                  filter={isHover ? (isEraser ? 'url(#geo-glow-rose)' : 'url(#geo-glow-cyan)') : undefined}
                  className="transition-[stroke-width] duration-150"
                />
              );
            })}

            {/* === 点 === */}
            {points.map(p => {
              const isSelected = selectedPointId === p.id;
              const isDragging = draggingPointId === p.id;
              const isHover = hoverEntity?.type === 'point' && hoverEntity.id === p.id;
              const isPolyMember =
                hoverEntity?.type === 'polygon' && hoverEntity.pointIds.includes(p.id);

              const baseFill = isSelected ? '#38bdf8' : p.isFree ? '#ffffff' : '#a1a1aa';
              const r = isDragging ? 9 : isHover ? 9 : 7;
              const accent = isEraser ? '#fb7185' : '#22d3ee';
              const stroke = isHover || isPolyMember ? accent : '#0284c7';
              const sw = isHover ? 3.5 : isSelected || isDragging ? 3 : 1;

              return (
                <g key={p.id}>
                  {/* 悬停光晕环 */}
                  {(isHover || isPolyMember) && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r + 6}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.5}
                      opacity={0.5}
                      className="pointer-events-none"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={baseFill}
                    stroke={stroke}
                    strokeWidth={sw}
                    filter={isHover ? (isEraser ? 'url(#geo-glow-rose)' : 'url(#geo-glow-cyan)') : undefined}
                    className="transition-[r,stroke,stroke-width] duration-150"
                  />
                  <text
                    x={p.x + 10}
                    y={p.y - 10}
                    fill="#ffffff"
                    className="text-sm font-semibold select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none"
                  >
                    {p.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* 2. 勾股定理割补演示区 */}
        {subModule === 'pythagoras' && (
          <div className="w-full h-full flex items-center justify-center relative select-none">
            {/* 图形卡片 */}
            <div className="relative w-[450px] h-[450px] bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/10 p-8 flex items-center justify-center shadow-2xl overflow-hidden">
              <svg width="360" height="360" className="overflow-visible">
                {/* 定理主体正方形框，边长为 a+b = 150 + 90 = 240 */}
                {/* a = 150px, b = 90px, c = sqrt(150^2 + 90^2) = 174.9px */}
                <rect x="60" y="60" width="240" height="240" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" strokeDasharray="5,5" />
                
                {/* 四个拼图直角三角形 (a=150, b=90) */}
                {/* 三角形 1 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(0px, 0px) rotate(0deg)' : 'translate(0px, 0px)',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="60,60 210,60 60,150" fill="rgba(59, 130, 246, 0.4)" stroke="#3b82f6" strokeWidth="2" />
                  <text x="110" y="85" fill="#fff" className="text-xs">c</text>
                </g>

                {/* 三角形 2 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(90px, -90px) rotate(90deg)' : 'translate(0px, 0px)',
                  transformOrigin: '210px 150px',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="210,60 300,60 300,210" fill="rgba(239, 68, 68, 0.4)" stroke="#ef4444" strokeWidth="2" />
                  <text x="265" y="110" fill="#fff" className="text-xs">c</text>
                </g>

                {/* 三角形 3 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(0px, 0px) rotate(0deg)' : 'translate(0px, 0px)',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="300,210 300,300 150,300" fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
                  <text x="235" y="275" fill="#fff" className="text-xs">c</text>
                </g>

                {/* 三角形 4 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(-90px, 90px) rotate(-90deg)' : 'translate(0px, 0px)',
                  transformOrigin: '150px 210px',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="150,300 60,300 60,150" fill="rgba(245, 158, 11, 0.4)" stroke="#f59e0b" strokeWidth="2" />
                  <text x="85" y="240" fill="#fff" className="text-xs">c</text>
                </g>

                {/* 中间倾斜的 c^2 正方形的面 */}
                {pythagorasStep === 0 && (
                  <polygon 
                    points="60,150 210,60 300,210 150,300" 
                    fill="rgba(255,255,255,0.05)" 
                    stroke="rgba(255,255,255,0.3)" 
                    strokeWidth="1.5"
                  />
                )}

                {/* 割补法完成时的 a^2 和 b^2 矩形边线 */}
                {pythagorasStep === 1 && (
                  <>
                    {/* a*a 正方形 (150x150) 在右下 */}
                    <rect x="150" y="150" width="150" height="150" fill="rgba(255,255,255,0.05)" stroke="#a1a1aa" strokeWidth="2" />
                    <text x="215" y="235" fill="#fff" className="text-lg font-bold">a²</text>

                    {/* b*b 正方形 (90x90) 在左上 */}
                    <rect x="60" y="60" width="90" height="90" fill="rgba(255,255,255,0.05)" stroke="#a1a1aa" strokeWidth="2" />
                    <text x="95" y="115" fill="#fff" className="text-base font-bold">b²</text>
                  </>
                )}

                {/* 标识 */}
                <text x="35" y="110" fill="#a1a1aa" className="text-sm">b</text>
                <text x="130" y="50" fill="#a1a1aa" className="text-sm">a</text>
              </svg>
            </div>

            {/* 右上角毛玻璃定理说明浮窗 */}
            <div className="absolute top-8 right-8 w-80 p-5 rounded-2xl bg-zinc-900/75 backdrop-blur-md border border-white/10 shadow-2xl z-[38] select-none text-white">
              <h3 className="text-sm font-bold text-orange-400 mb-2 font-sans flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-orange-500 rounded-full" />
                勾股定理割补证明
              </h3>
              <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                <p>直角三角形两直角边平方和等于斜边平方。</p>
                <p className="font-mono bg-white/5 p-2 rounded-lg text-amber-300 text-center border border-white/5">
                  a² + b² = c²
                </p>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  {pythagorasStep === 0 
                    ? "通过 4 个直角三角形围成边长为 c 的斜方形，其大正方形总面积 S = c² + 4 × (ab/2)。" 
                    : "重新排列这 4 个直角三角形，将其割补拼凑成两个面积分别为 a² 和 b² 的正方形，大正方形总面积 S = a² + b² + 4 × (ab/2)。"}
                </p>
              </div>
            </div>

            {/* 底部悬浮控制栏 */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 p-2 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-xl flex items-center gap-4 z-[38]">
              <button
                onClick={() => setPythagorasStep(prev => prev === 0 ? 1 : 0)}
                className="px-6 py-3 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95 text-sm"
              >
                <Play className="w-4 h-4" />
                <span>{pythagorasStep === 0 ? "一键割补拼图" : "还原几何关系"}</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. 圆面积极限展开拼接演示区 */}
        {subModule === 'circle_area' && (
          <div className="w-full h-full flex items-center justify-center relative select-none">
            {/* 主绘图区 */}
            <div className="relative w-[650px] h-[380px] bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/10 p-8 flex flex-col items-center justify-center shadow-2xl overflow-hidden">
              <svg width="600" height="320" className="overflow-visible">
                {/* 1. 圆形状态 */}
                {!circleAreaAnimProgress && (
                  <g transform="translate(300, 160)">
                    {/* 画扇形切片 */}
                    {Array.from({ length: circleSlicesCount }).map((_, i) => {
                      const angleStep = 360 / circleSlicesCount;
                      const startAngle = i * angleStep;
                      const endAngle = (i + 1) * angleStep;
                      
                      const radStart = (startAngle * Math.PI) / 180;
                      const radEnd = (endAngle * Math.PI) / 180;
                      
                      const r = 100;
                      const x1 = r * Math.cos(radStart);
                      const y1 = r * Math.sin(radStart);
                      const x2 = r * Math.cos(radEnd);
                      const y2 = r * Math.sin(radEnd);
                      
                      // 扇形 path
                      const pathData = `M 0,0 L ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2} Z`;
                      const fill = i % 2 === 0 ? 'rgba(6, 182, 212, 0.6)' : 'rgba(236, 72, 153, 0.6)';
                      const stroke = i % 2 === 0 ? '#06b6d4' : '#ec4899';
                      
                      return (
                        <path 
                          key={i} 
                          d={pathData} 
                          fill={fill} 
                          stroke={stroke} 
                          strokeWidth="1.5"
                          style={{
                            transform: 'scale(1)',
                            transition: 'all 0.8s ease-in-out'
                          }}
                        />
                      );
                    })}
                    <circle cx="0" cy="0" r="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    <text x="-25" y="5" fill="#fff" className="text-sm font-bold">半径 r</text>
                  </g>
                )}

                {/* 2. 极限拼接状态 (近似长方形) */}
                {circleAreaAnimProgress && (
                  <g transform="translate(100, 110)">
                    {/* 上排切片：倒挂，红色，8 个 */}
                    {Array.from({ length: circleSlicesCount / 2 }).map((_, i) => {
                      const w = 360 / (circleSlicesCount / 2); // 宽度
                      const xOffset = i * w;
                      const r = 100; // 高度即半径
                      
                      // 近似三角形/扇形：顶角在底面
                      const pathData = `M ${xOffset},0 L ${xOffset + w/2},${r} L ${xOffset + w},0 Z`;
                      
                      return (
                        <path 
                          key={`top-${i}`} 
                          d={pathData} 
                          fill="rgba(6, 182, 212, 0.6)" 
                          stroke="#06b6d4" 
                          strokeWidth="1.5"
                        />
                      );
                    })}

                    {/* 下排切片：正立，蓝色，交错，8 个 */}
                    {Array.from({ length: circleSlicesCount / 2 }).map((_, i) => {
                      const w = 360 / (circleSlicesCount / 2); // 宽度
                      const xOffset = i * w + w/2;
                      const r = 100; // 高度即半径
                      
                      const pathData = `M ${xOffset},${r} L ${xOffset + w/2},0 L ${xOffset + w},${r} Z`;
                      
                      return (
                        <path 
                          key={`bottom-${i}`} 
                          d={pathData} 
                          fill="rgba(236, 72, 153, 0.6)" 
                          stroke="#ec4899" 
                          strokeWidth="1.5"
                        />
                      );
                    })}

                    {/* 长方形辅助框线 */}
                    <rect x="0" y="0" width="380" height="100" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="6,4" />
                    
                    {/* 长宽标示线 */}
                    {/* 高即半径 r */}
                    <line x1="-20" y1="0" x2="-20" y2="100" stroke="#fff" strokeWidth="1.5" />
                    <line x1="-25" y1="0" x2="-15" y2="0" stroke="#fff" strokeWidth="1.5" />
                    <line x1="-25" y1="100" x2="-15" y2="100" stroke="#fff" strokeWidth="1.5" />
                    <text x="-65" y="55" fill="#fff" className="text-xs font-semibold">宽 = r</text>

                    {/* 长即圆周长一半 πr */}
                    <line x1="0" y1="120" x2="380" y2="120" stroke="#fff" strokeWidth="1.5" />
                    <line x1="0" y1="115" x2="0" y2="125" stroke="#fff" strokeWidth="1.5" />
                    <line x1="380" y1="115" x2="380" y2="125" stroke="#fff" strokeWidth="1.5" />
                    <text x="160" y="145" fill="#fff" className="text-xs font-semibold">长 = ½C = πr</text>
                  </g>
                )}
              </svg>
            </div>

            {/* 右上角毛玻璃定理说明浮窗 */}
            <div className="absolute top-8 right-8 w-80 p-5 rounded-2xl bg-zinc-900/75 backdrop-blur-md border border-white/10 shadow-2xl z-[38] select-none text-white">
              <h3 className="text-sm font-bold text-pink-400 mb-2 font-sans flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-pink-500 rounded-full" />
                圆面积拼接极限证明
              </h3>
              <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                <p>将圆等分成若干份，拼成的图形近似于长方形。</p>
                <p className="font-mono bg-white/5 p-2 rounded-lg text-pink-300 text-center border border-white/5">
                  S = πr²
                </p>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  {circleAreaAnimProgress 
                    ? "此时近似长方形的长为圆周长的一半 (πr)，宽为圆的半径 (r)。其面积 S ≈ 长 × 宽 = πr × r = πr²。" 
                    : `当前圆等分为 ${circleSlicesCount} 份。等分份数越多，拼成的图形越接近长方形，极限状态下即为长方形。`}
                </p>
              </div>
            </div>

            {/* 底部悬浮控制栏 */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 p-3.5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-xl flex items-center gap-6 z-[38]">
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-xs">等分数:</span>
                <input
                  type="range"
                  min="8"
                  max="64"
                  step="8"
                  value={circleSlicesCount}
                  onChange={(e) => {
                    setCircleSlicesCount(Number(e.target.value));
                    setCircleAreaAnimProgress(false); // 调节份数时强制回到圆形式
                  }}
                  className="w-40 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-white text-xs font-bold w-6">{circleSlicesCount}</span>
              </div>

              <button
                onClick={() => setCircleAreaAnimProgress(prev => !prev)}
                className="px-6 py-2.5 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95 text-sm"
              >
                <Play className="w-4 h-4" />
                <span>{circleAreaAnimProgress ? "还原为圆形" : "极限拼接演示"}</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
