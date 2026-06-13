import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { motion } from 'motion/react';
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
// 宸ュ叿鍑芥暟
// ============================================================

/** 鐐瑰埌绾挎鐨勬渶鐭窛绂?*/
function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 鐐瑰埌鍦嗗懆鐨勮窛绂?(鍒板渾鐜嚎鏈韩, 涓嶆槸鍦嗗績) */
function distPointToCircle(px: number, py: number, cx: number, cy: number, r: number): number {
  return Math.abs(Math.hypot(px - cx, py - cy) - r);
}

/** Ray casting: 鍒ゆ柇鐐?(px, py) 鏄惁鍦ㄥ杈瑰舰 (鎸夐『搴忕殑椤剁偣鏁扮粍) 鍐呴儴 */
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

/** 澶氳竟褰㈤潰绉?(鏈夌鍙?, 鐢ㄤ簬杩囨护瓒呭ぇ澶栫幆 */
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
  isFree: boolean; // 鏄惁鏄嚜鐢辩偣锛堝嵆鍙互琚敤鎴锋嫋鍔ㄧ殑锛?
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
  radiusPointId: string; // 杈圭紭涓婄殑鐐癸紝鐢ㄤ簬纭畾鍗婂緞
}

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;

export function GeometryBoard() {
  const activeTab = useARStore(state => state.activeTab);
  const setInteractMode = useARStore(state => state.setInteractMode);
  const interactMode = useARStore(state => state.interactMode);
  const isEraser = useARStore(state => state.isEraser);
  const theme = useARStore(state => state.theme);

  const pages = useARStore(state => state.pages);
  const currentPageIndex = useARStore(state => state.currentPageIndex);
  const whiteboardRestoreVersion = useARStore(state => state.whiteboardRestoreVersion);
  const saveCurrentPageGeometry = useARStore(state => state.saveCurrentPageGeometry);

  // 鐢绘澘鐘舵€?
  const [points, setPoints] = useState<Point[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);

  // 褰撳墠鐢绘澘閫夋嫨鐨勫伐鍏? 'drag' | 'add_point' | 'add_segment' | 'add_circle'
  const [activeTool, setActiveTool] = useState<'drag' | 'add_point' | 'add_segment' | 'add_circle'>('drag');
  
  // 閫変腑鐨勭偣锛堢敤浜庤繛绾挎垨鐢诲渾锛?
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  
  // 姝ｅ湪鎷栨嫿鐨勭偣 ID
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

  // 姝ｅ湪鎷栨嫿鐨勫杈瑰舰 (鐐?ID 闆嗗悎) 涓庤捣濮嬩綅缃?
  const [draggingPolygon, setDraggingPolygon] = useState<{
    pointIds: Set<string>;
    startMouse: { x: number; y: number };
    startPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  // 榧犳爣鎮仠鐨勫璞?(鐢ㄤ簬鍙戝厜楂樹寒)
  type HoverEntity =
    | { type: 'point'; id: string }
    | { type: 'segment'; id: string }
    | { type: 'circle'; id: string }
    | { type: 'polygon'; pointIds: string[] }
    | null;
  const [hoverEntity, setHoverEntity] = useState<HoverEntity>(null);

  // 瀹氱悊婕旂ず閫夋嫨锛?board' | 'pythagoras' | 'circle_area'
  const [subModule, setSubModule] = useState<'board' | 'pythagoras' | 'circle_area'>('board');

  // 瀹氱悊鍔ㄧ敾鐘舵€?
  const [pythagorasStep, setPythagorasStep] = useState<number>(0); // 0: 鍒濆, 1: 鎷煎悎
  const [circleSlicesCount, setCircleSlicesCount] = useState<number>(16);
  const [circleAreaAnimProgress, setCircleAreaAnimProgress] = useState<boolean>(false); // false: 鍦? true: 闀挎柟褰?

  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const pointerToBoard = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WHITEBOARD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * WHITEBOARD_HEIGHT,
    };
  };


  // 鍒濆鍖栦竴涓粡鍏哥殑鈥滀笁瑙掑舰涓変腑绾夸氦浜庨噸蹇冣€濇紨绀?
  const loadCentroidDemo = () => {
    const pA: Point = { id: 'pA', name: 'A', x: 400, y: 150, isFree: true };
    const pB: Point = { id: 'pB', name: 'B', x: 250, y: 450, isFree: true };
    const pC: Point = { id: 'pC', name: 'C', x: 600, y: 480, isFree: true };
    
    // 涓偣鍧愭爣 (鍙€氳繃渚濊禆绠楋紝涓嶆斁鍏?points state锛屽噺灏戞洿鏂板啑浣?
    setPoints([pA, pB, pC]);

    const segs: Segment[] = [
      // 涓夎褰笁杈?
      { id: 'sAB', p1Id: 'pA', p2Id: 'pB', color: 'rgba(255,255,255,0.4)' },
      { id: 'sBC', p1Id: 'pB', p2Id: 'pC', color: 'rgba(255,255,255,0.4)' },
      { id: 'sCA', p1Id: 'pC', p2Id: 'pA', color: 'rgba(255,255,255,0.4)' },
      // 涓夋潯涓嚎锛堝湪娓叉煋鏃惰绠椾腑鐐瑰苟缁樺埗锛?
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

  // 鍝嶅簲鍏ㄥ眬娓呯┖淇″彿: 鍚屾椂娓呯┖鎵€鏈夊嚑浣曞璞?(鐐?/ 绾挎 / 鍦?/ 閫変腑鎬?
  const triggerClearCanvas = useARStore(state => state.triggerClearCanvas);
  useEffect(() => {
    if (triggerClearCanvas === 0) return; // 璺宠繃鍒濆鎸傝浇
    setPoints([]);
    setSegments([]);
    setCircles([]);
    setSelectedPointId(null);
    setDraggingPointId(null);
    setDraggingPolygon(null);
    setHoverEntity(null);
    
    // 濡傛灉鏄櫘閫氭竻绌轰笉鏄崲椤碉紝涔熷悓姝ユ洿鏂颁笅 store
    saveCurrentPageGeometry([], [], []);
  }, [triggerClearCanvas]);

  const isSwitchingPageRef = useRef(false);

  // 鐩戝惉鎹㈤〉锛屼粠 store 鎭㈠鍑犱綍鐘舵€?
  useEffect(() => {
    const currentPage = pages[currentPageIndex];
    if (currentPage && currentPage.geometry) {
      const scaleX = currentPage.boardWidth ? WHITEBOARD_WIDTH / currentPage.boardWidth : 1;
      const scaleY = currentPage.boardHeight ? WHITEBOARD_HEIGHT / currentPage.boardHeight : 1;
      const scalePoint = (point: Point): Point => ({
        ...point,
        x: point.x * scaleX,
        y: point.y * scaleY,
      });

      isSwitchingPageRef.current = true;
      setPoints((currentPage.geometry.points || []).map(scalePoint));
      setSegments(currentPage.geometry.segments || []);
      setCircles(currentPage.geometry.circles || []);
      setSelectedPointId(null);
      setDraggingPointId(null);
      setDraggingPolygon(null);
      setHoverEntity(null);
      
      // 鎭㈠瀹屾瘯鍚庯紝閲嶇疆 flag
      setTimeout(() => {
        isSwitchingPageRef.current = false;
      }, 50);
    }
  }, [currentPageIndex, whiteboardRestoreVersion]); // 娉ㄦ剰涓嶈鎶?pages 鏀捐繘渚濊禆锛屽惁鍒欎細鏃犻檺寰幆

  // 鐩戝惉鍑犱綍鐘舵€佹敼鍙橈紝淇濆瓨鍒?store
  useEffect(() => {
    if (!isSwitchingPageRef.current) {
      saveCurrentPageGeometry(points, segments, circles);
    }
  }, [points, segments, circles]); // 褰撳眬閮ㄧ姸鎬佹敼鍙樻椂淇濆瓨

  // 娉? 涔嬪墠鐨?鑷姩鍔犺浇涓夎褰㈤噸蹇冩紨绀?宸茬Щ闄? 鐧芥澘榛樿涓虹┖鐢绘澘,
  // 鐢ㄦ埛鍙€氳繃椤堕儴宸ュ叿鏉′富鍔ㄦ弿鐐?/ 鐢荤嚎 / 鐢诲渾銆?

  // 璁＄畻涓嚎鐩稿叧鐨勪緷璧栫偣
  const getDerivedElements = () => {
    const ptA = points.find(p => p.id === 'pA');
    const ptB = points.find(p => p.id === 'pB');
    const ptC = points.find(p => p.id === 'pC');

    if (!ptA || !ptB || !ptC) return { midPoints: [], centroid: null };

    // 涓偣 D (鍦?BC 涓?, E (鍦?CA 涓?, F (鍦?AB 涓?
    const ptD = { id: 'pD', name: 'D', x: (ptB.x + ptC.x) / 2, y: (ptB.y + ptC.y) / 2, isFree: false };
    const ptE = { id: 'pE', name: 'E', x: (ptC.x + ptA.x) / 2, y: (ptC.y + ptA.y) / 2, isFree: false };
    const ptF = { id: 'pF', name: 'F', x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2, isFree: false };

    // 閲嶅績 G
    const ptG = { 
      id: 'pG', 
      name: '閲嶅績 G', 
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
  // 鐢?segments 璁＄畻鎵€鏈夌畝鍗曠幆 (鍗抽棴鍚堝杈瑰舰)
  // 澶嶆潅搴? 鍦ㄥ皬鍥?(~ 20 鐐? 涓嬭冻澶熷揩
  // ============================================================
  const polygons = useMemo<Array<string[]>>(() => {
    if (points.length < 3 || segments.length < 3) return [];
    // 閭绘帴琛?
    const adj = new Map<string, Set<string>>();
    for (const p of points) adj.set(p.id, new Set());
    for (const s of segments) {
      adj.get(s.p1Id)?.add(s.p2Id);
      adj.get(s.p2Id)?.add(s.p1Id);
    }
    const cycles: string[][] = [];
    const seenCycles = new Set<string>();

    /** 鎶婄幆瑙勮寖鍖? 鎵炬渶灏忚捣鐐?+ 閫夊瓧鍏稿簭杈冨皬鐨勬柟鍚?*/
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

    // DFS: 浠庢瘡涓妭鐐瑰紑濮嬫壘鍥炶矾
    for (const start of points) {
      const stack: Array<{ node: string; path: string[] }> = [{ node: start.id, path: [start.id] }];
      while (stack.length) {
        const { node, path } = stack.pop()!;
        if (path.length > 8) continue; // 闄愬埗鐜暱搴﹂伩鍏嶇垎鐐?
        for (const nb of adj.get(node) ?? []) {
          if (nb === start.id && path.length >= 3) {
            // 鎵惧埌鐜?
            const key = canonicalize(path);
            if (!seenCycles.has(key)) {
              seenCycles.add(key);
              cycles.push([...path]);
            }
          } else if (!path.includes(nb) && nb > start.id) {
            // 鍙蛋 id 瀛楀吀搴忓ぇ浜?start 鐨? 閬垮厤閲嶅
            stack.push({ node: nb, path: [...path, nb] });
          }
        }
      }
    }
    return cycles;
  }, [points, segments]);

  /** 鎶婄幆 (point id 鏁扮粍) 杞崲涓哄潗鏍囨暟缁?*/
  const polygonCoords = useCallback((cycle: string[]): Array<{ x: number; y: number }> => {
    return cycle.map(id => {
      const p = points.find(pp => pp.id === id);
      return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
    });
  }, [points]);


  // ============================================================
  // 鍛戒腑妫€娴?(杩斿洖鏈€杩戠殑瀵硅薄)
  // ============================================================
  const HIT_RADIUS = 24;
  const SEG_HIT = 16;

  /** 鍦ㄥ睆骞曞潗鏍?(x, y) 澶勬壘鍒版渶杩戠殑瀵硅薄, 浼樺厛绾? 鐐?> 绾挎 > 鍦嗗懆 > 澶氳竟褰㈠唴閮?*/
  const hitTest = useCallback((x: number, y: number): HoverEntity => {
    // 鐐?
    let bestPoint: { id: string; d: number } | null = null;
    for (const p of points) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < HIT_RADIUS && (!bestPoint || d < bestPoint.d)) bestPoint = { id: p.id, d };
    }
    if (bestPoint) return { type: 'point', id: bestPoint.id };

    // 绾挎
    let bestSeg: { id: string; d: number } | null = null;
    for (const s of segments) {
      const p1 = points.find(p => p.id === s.p1Id);
      const p2 = points.find(p => p.id === s.p2Id);
      if (!p1 || !p2) continue;
      const d = distPointToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      if (d < SEG_HIT && (!bestSeg || d < bestSeg.d)) bestSeg = { id: s.id, d };
    }
    if (bestSeg) return { type: 'segment', id: bestSeg.id };

    // 鍦嗗懆
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

    // 澶氳竟褰㈠唴閮?(鍙栭潰绉渶灏忕殑, 鍐呭眰浼樺厛)
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
  // 榧犳爣/瑙︽帶浜や簰
  // ============================================================
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const { x, y } = pointerToBoard(e);

    const hit = hitTest(x, y);

    // 姗＄毊鎿︽ā寮? 鍛戒腑鍗冲垹闄?
    if (isEraser) {
      if (hit?.type === 'point') {
        // 鍒犻櫎鐐?+ 涓庝箣鐩稿叧鐨勭嚎娈?鍦?
        setPoints(prev => prev.filter(p => p.id !== hit.id));
        setSegments(prev => prev.filter(s => s.p1Id !== hit.id && s.p2Id !== hit.id));
        setCircles(prev => prev.filter(c => c.centerId !== hit.id && c.radiusPointId !== hit.id));
      } else if (hit?.type === 'segment') {
        setSegments(prev => prev.filter(s => s.id !== hit.id));
      } else if (hit?.type === 'circle') {
        setCircles(prev => prev.filter(c => c.id !== hit.id));
      } else if (hit?.type === 'polygon') {
        // 鍒犻櫎鏋勬垚澶氳竟褰㈢殑鎵€鏈夌嚎娈?(淇濈暀鐐? 鐢ㄦ埛鍙兘杩樿鐢?
        const ids = new Set(hit.pointIds);
        setSegments(prev => prev.filter(s => !(ids.has(s.p1Id) && ids.has(s.p2Id))));
      }
      return;
    }

    if (activeTool === 'drag') {
      // 浼樺厛鎷栧崟涓偣
      if (hit?.type === 'point') {
        const p = points.find(pp => pp.id === hit.id);
        if (p && p.isFree) {
          setDraggingPointId(p.id);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      // 鍏舵: 鎷栨暣涓杈瑰舰
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
    const { x, y } = pointerToBoard(e);

    // 鎷栧崟涓偣
    if (draggingPointId) {
      const cx = Math.max(10, Math.min(WHITEBOARD_WIDTH - 10, x));
      const cy = Math.max(10, Math.min(WHITEBOARD_HEIGHT - 10, y));
      setPoints(points.map(p => p.id === draggingPointId ? { ...p, x: cx, y: cy } : p));
      return;
    }

    // 鎷栨暣涓杈瑰舰
    if (draggingPolygon) {
      const dx = x - draggingPolygon.startMouse.x;
      const dy = y - draggingPolygon.startMouse.y;
      setPoints(prev => prev.map(p => {
        const start = draggingPolygon.startPositions[p.id];
        if (!start) return p;
        const nx = Math.max(10, Math.min(WHITEBOARD_WIDTH - 10, start.x + dx));
        const ny = Math.max(10, Math.min(WHITEBOARD_HEIGHT - 10, start.y + dy));
        return { ...p, x: nx, y: ny };
      }));
      return;
    }

    // 鏅€氭偓鍋? 鍛戒腑妫€娴嬩互楂樹寒
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
      {/* 椤堕儴涓ぎ鎮诞宸ュ叿鏉?- 鍦ㄨ秴绾х櫧鏉夸笅鏄剧ず */}
      {activeTab === 'whiteboard' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-xl select-none z-[38] transition-all duration-500">
          <button
            onClick={() => { setActiveTool('drag'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "relative p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium cursor-pointer",
              activeTool === 'drag' 
                ? "text-zinc-900 dark:text-white" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
            title="拖拽点移动"
          >
            {activeTool === 'drag' && (
              <motion.div
                layoutId="activeToolPill"
                className="absolute inset-0 bg-black/5 dark:bg-white/10 rounded-xl"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <MousePointer className="w-4 h-4" />
              <span>拖拽</span>
            </span>
          </button>
          
          <button
            onClick={() => { setActiveTool('add_point'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "relative p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium cursor-pointer",
              activeTool === 'add_point' 
                ? "text-zinc-900 dark:text-white" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
            title="鍦ㄧ┖鐧藉鍔犵偣"
          >
            {activeTool === 'add_point' && (
              <motion.div
                layoutId="activeToolPill"
                className="absolute inset-0 bg-black/5 dark:bg-white/10 rounded-xl"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>描点</span>
            </span>
          </button>

          <button
            onClick={() => { setActiveTool('add_segment'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "relative p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium cursor-pointer",
              activeTool === 'add_segment' 
                ? "text-zinc-900 dark:text-white" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
            title="鐐瑰嚮涓ょ偣杩炴帴鎴愮嚎"
          >
            {activeTool === 'add_segment' && (
              <motion.div
                layoutId="activeToolPill"
                className="absolute inset-0 bg-black/5 dark:bg-white/10 rounded-xl"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <span className="w-4 h-0.5 bg-current rounded-full" />
              <span>画线段</span>
            </span>
          </button>

          <button
            onClick={() => { setActiveTool('add_circle'); setSelectedPointId(null); setInteractMode('interact'); }}
            className={cn(
              "relative p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium cursor-pointer",
              activeTool === 'add_circle' 
                ? "text-zinc-900 dark:text-white" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
            title="閫夋嫨鍦嗗績鍜屽崐寰勭偣鐢诲渾"
          >
            {activeTool === 'add_circle' && (
              <motion.div
                layoutId="activeToolPill"
                className="absolute inset-0 bg-black/5 dark:bg-white/10 rounded-xl"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-current rounded-full" />
              <span>画圆</span>
            </span>
          </button>
        </div>
      )}

      {/* 涓绘帰绌跺尯 - 鎾戞弧鍏ㄥ眬锛屽交搴曡В鍐充笌瓒呯骇鐧芥澘鍒囨崲鏃剁殑 Layout Shift */}
      <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-8 z-[35]">
        
        {/* 1. 鑷敱鍑犱綍鐢绘澘娓叉煋 (SVG) */}
        {subModule === 'board' && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerLeave}
            className={cn(
              'aspect-video w-[min(100vw,calc(100vh*16/9))] max-w-full max-h-full bg-white/40 dark:bg-zinc-950/40 rounded-[2rem] border border-black/5 dark:border-white/5 shadow-inner transition-colors duration-500',
              // cursor 鍙嶉
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
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke={theme === 'dark' ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.04)"} strokeWidth="1" />
              </pattern>
              {/* 鍑犱綍瑕佺礌鍙戝厜婊ら暅 (hover 鏃? */}
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

            {/* === 澶氳竟褰㈤珮浜?(鎷栧姩 / 姗＄毊鎿︽偓鍋? === */}
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

            {/* === 鍦?=== */}
            {circles.map(circle => {
              const cp = points.find(p => p.id === circle.centerId);
              const rp = points.find(p => p.id === circle.radiusPointId);
              if (!cp || !rp) return null;
              const radius = Math.sqrt((rp.x - cp.x) ** 2 + (rp.y - cp.y) ** 2);
              const isHover = hoverEntity?.type === 'circle' && hoverEntity.id === circle.id;
              const stroke = isHover
                ? (isEraser ? '#fb7185' : '#22d3ee')
                : (theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(15, 23, 42, 0.5)');
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

            {/* === 绾挎 === */}
            {segments.map(seg => {
              const p1 = points.find(p => p.id === seg.p1Id);
              const p2 = points.find(p => p.id === seg.p2Id);
              if (!p1 || !p2) return null;
              const isHover = hoverEntity?.type === 'segment' && hoverEntity.id === seg.id;
              const stroke = isHover
                ? (isEraser ? '#fb7185' : '#22d3ee')
                : (seg.color
                    ? (seg.color.includes('rgba(255,255,255') 
                        ? (theme === 'dark' ? seg.color : seg.color.replace('255,255,255', '15,23,42'))
                        : seg.color)
                    : (theme === 'dark' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 23, 42, 0.75)'));
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

            {/* === 鐐?=== */}
            {points.map(p => {
              const isSelected = selectedPointId === p.id;
              const isDragging = draggingPointId === p.id;
              const isHover = hoverEntity?.type === 'point' && hoverEntity.id === p.id;
              const isPolyMember =
                hoverEntity?.type === 'polygon' && hoverEntity.pointIds.includes(p.id);

              const baseFill = isSelected ? '#38bdf8' : p.isFree ? (theme === 'dark' ? '#ffffff' : '#09090b') : '#a1a1aa';
              const r = isDragging ? 9 : isHover ? 9 : 7;
              const accent = isEraser ? '#fb7185' : '#22d3ee';
              const stroke = isHover || isPolyMember ? accent : '#0284c7';
              const sw = isHover ? 3.5 : isSelected || isDragging ? 3 : 1;

              return (
                <g key={p.id}>
                  {/* 鎮仠鍏夋檿鐜?*/}
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
                    fill={theme === 'dark' ? '#ffffff' : '#374151'}
                    className="text-sm font-semibold select-none filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none transition-colors duration-500"
                  >
                    {p.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* 2. 鍕捐偂瀹氱悊鍓茶ˉ婕旂ず鍖?*/}
        {subModule === 'pythagoras' && (
          <div className="w-full h-full flex items-center justify-center relative select-none">
            {/* 鍥惧舰鍗＄墖 */}
            <div className="relative w-[450px] h-[450px] bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-black/5 dark:border-white/10 p-8 flex items-center justify-center shadow-2xl overflow-hidden transition-all duration-500 text-zinc-800 dark:text-white">
              <svg width="360" height="360" className="overflow-visible">
                {/* 瀹氱悊涓讳綋姝ｆ柟褰㈡锛岃竟闀夸负 a+b = 150 + 90 = 240 */}
                {/* a = 150px, b = 90px, c = sqrt(150^2 + 90^2) = 174.9px */}
                <rect x="60" y="60" width="240" height="240" fill="none" stroke={theme === 'dark' ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.15)"} strokeWidth="3" strokeDasharray="5,5" />
                
                {/* 鍥涗釜鎷煎浘鐩磋涓夎褰?(a=150, b=90) */}
                {/* 涓夎褰?1 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(0px, 0px) rotate(0deg)' : 'translate(0px, 0px)',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="60,60 210,60 60,150" fill="rgba(59, 130, 246, 0.4)" stroke="#3b82f6" strokeWidth="2" />
                  <text x="110" y="85" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs">c</text>
                </g>

                {/* 涓夎褰?2 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(90px, -90px) rotate(90deg)' : 'translate(0px, 0px)',
                  transformOrigin: '210px 150px',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="210,60 300,60 300,210" fill="rgba(239, 68, 68, 0.4)" stroke="#ef4444" strokeWidth="2" />
                  <text x="265" y="110" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs">c</text>
                </g>

                {/* 涓夎褰?3 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(0px, 0px) rotate(0deg)' : 'translate(0px, 0px)',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="300,210 300,300 150,300" fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
                  <text x="235" y="275" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs">c</text>
                </g>

                {/* 涓夎褰?4 */}
                <g style={{ 
                  transform: pythagorasStep === 1 ? 'translate(-90px, 90px) rotate(-90deg)' : 'translate(0px, 0px)',
                  transformOrigin: '150px 210px',
                  transition: 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)'
                }}>
                  <polygon points="150,300 60,300 60,150" fill="rgba(245, 158, 11, 0.4)" stroke="#f59e0b" strokeWidth="2" />
                  <text x="85" y="240" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs">c</text>
                </g>

                {/* 涓棿鍊炬枩鐨?c^2 姝ｆ柟褰㈢殑闈?*/}
                {pythagorasStep === 0 && (
                  <polygon 
                    points="60,150 210,60 300,210 150,300" 
                    fill={theme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)"} 
                    stroke={theme === 'dark' ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.2)"} 
                    strokeWidth="1.5"
                  />
                )}

                {/* 鍓茶ˉ娉曞畬鎴愭椂鐨?a^2 鍜?b^2 鐭╁舰杈圭嚎 */}
                {pythagorasStep === 1 && (
                  <>
                    {/* a*a 姝ｆ柟褰?(150x150) 鍦ㄥ彸涓?*/}
                    <rect x="150" y="150" width="150" height="150" fill={theme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)"} stroke={theme === 'dark' ? "#a1a1aa" : "#475569"} strokeWidth="2" />
                    <text x="215" y="235" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-lg font-bold">a虏</text>

                    {/* b*b 姝ｆ柟褰?(90x90) 鍦ㄥ乏涓?*/}
                    <rect x="60" y="60" width="90" height="90" fill={theme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)"} stroke={theme === 'dark' ? "#a1a1aa" : "#475569"} strokeWidth="2" />
                    <text x="95" y="115" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-base font-bold">b虏</text>
                  </>
                )}

                {/* 鏍囪瘑 */}
                <text x="35" y="110" fill={theme === 'dark' ? "#a1a1aa" : "#475569"} className="text-sm">b</text>
                <text x="130" y="50" fill={theme === 'dark' ? "#a1a1aa" : "#475569"} className="text-sm">a</text>
              </svg>
            </div>

            {/* 鍙充笂瑙掓瘺鐜荤拑瀹氱悊璇存槑娴獥 */}
            <div className="absolute top-8 right-8 w-80 p-5 rounded-2xl bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-2xl z-[38] select-none text-zinc-800 dark:text-white transition-all duration-500">
              <h3 className="text-sm font-bold text-orange-600 dark:text-orange-400 mb-2 font-sans flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-orange-500 rounded-full" />
                勾股定理割补证明
              </h3>
              <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                <p>直角三角形两直角边的平方和等于斜边平方。</p>
                <p className="font-mono bg-black/5 dark:bg-white/5 p-2 rounded-lg text-orange-600 dark:text-amber-300 text-center border border-black/5 dark:border-white/5">
                  a² + b² = c²
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                  {pythagorasStep === 0 
                    ? "通过 4 个直角三角形围成边长为 c 的斜正方形。"
                    : "重新排列 4 个直角三角形，剩余部分拼成面积为 a² 和 b² 的两个正方形。"}
                </p>
              </div>
            </div>

            {/* 搴曢儴鎮诞鎺у埗鏍?*/}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 p-2 rounded-2xl bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-xl flex items-center gap-4 z-[38] transition-all duration-500">
              <button
                onClick={() => setPythagorasStep(prev => prev === 0 ? 1 : 0)}
                className="px-6 py-3 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95 text-sm cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{pythagorasStep === 0 ? "一键割补拼图" : "还原几何关系"}</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. 鍦嗛潰绉瀬闄愬睍寮€鎷兼帴婕旂ず鍖?*/}
        {subModule === 'circle_area' && (
          <div className="w-full h-full flex items-center justify-center relative select-none">
            {/* 涓荤粯鍥惧尯 */}
            <div className="relative w-[650px] h-[380px] bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-black/5 dark:border-white/10 p-8 flex flex-col items-center justify-center shadow-2xl overflow-hidden transition-all duration-500 text-zinc-800 dark:text-white">
              <svg width="600" height="320" className="overflow-visible">
                {/* 1. 鍦嗗舰鐘舵€?*/}
                {!circleAreaAnimProgress && (
                  <g transform="translate(300, 160)">
                    {/* 鐢绘墖褰㈠垏鐗?*/}
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
                      
                      // 鎵囧舰 path
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
                    <circle cx="0" cy="0" r="100" fill="none" stroke={theme === 'dark' ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.15)"} strokeWidth="1" />
                    <text x="-25" y="5" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-sm font-bold">鍗婂緞 r</text>
                  </g>
                )}

                {/* 2. 鏋侀檺鎷兼帴鐘舵€?(杩戜技闀挎柟褰? */}
                {circleAreaAnimProgress && (
                  <g transform="translate(100, 110)">
                    {/* 涓婃帓鍒囩墖锛氬€掓寕锛岀孩鑹诧紝8 涓?*/}
                    {Array.from({ length: circleSlicesCount / 2 }).map((_, i) => {
                      const w = 360 / (circleSlicesCount / 2); // 瀹藉害
                      const xOffset = i * w;
                      const r = 100; // 楂樺害鍗冲崐寰?
                      
                      // 杩戜技涓夎褰?鎵囧舰锛氶《瑙掑湪搴曢潰
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

                    {/* 涓嬫帓鍒囩墖锛氭绔嬶紝钃濊壊锛屼氦閿欙紝8 涓?*/}
                    {Array.from({ length: circleSlicesCount / 2 }).map((_, i) => {
                      const w = 360 / (circleSlicesCount / 2); // 瀹藉害
                      const xOffset = i * w + w/2;
                      const r = 100; // 楂樺害鍗冲崐寰?
                      
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

                    {/* 闀挎柟褰㈣緟鍔╂绾?*/}
                    <rect x="0" y="0" width="380" height="100" fill="none" stroke={theme === 'dark' ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.2)"} strokeWidth="2" strokeDasharray="6,4" />
                    
                    {/* 闀垮鏍囩ず绾?*/}
                    {/* 楂樺嵆鍗婂緞 r */}
                    <line x1="-20" y1="0" x2="-20" y2="100" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <line x1="-25" y1="0" x2="-15" y2="0" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <line x1="-25" y1="100" x2="-15" y2="100" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <text x="-65" y="55" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs font-semibold">瀹?= r</text>

                    {/* 闀垮嵆鍦嗗懆闀夸竴鍗?蟺r */}
                    <line x1="0" y1="120" x2="380" y2="120" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <line x1="0" y1="115" x2="0" y2="125" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <line x1="380" y1="115" x2="380" y2="125" stroke={theme === 'dark' ? '#fff' : '#475569'} strokeWidth="1.5" />
                    <text x="160" y="145" fill={theme === 'dark' ? '#fff' : '#1e293b'} className="text-xs font-semibold">闀?= 陆C = 蟺r</text>
                  </g>
                )}
              </svg>
            </div>

            {/* 鍙充笂瑙掓瘺鐜荤拑瀹氱悊璇存槑娴獥 */}
            <div className="absolute top-8 right-8 w-80 p-5 rounded-2xl bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-2xl z-[38] select-none text-zinc-800 dark:text-white transition-all duration-500">
              <h3 className="text-sm font-bold text-pink-600 dark:text-pink-400 mb-2 font-sans flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-pink-500 rounded-full" />
                圆面积拼接极限证明
              </h3>
              <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                <p>将圆等分成若干份，拼成的图形近似于长方形。</p>
                <p className="font-mono bg-black/5 dark:bg-white/5 p-2 rounded-lg text-pink-600 dark:text-pink-300 text-center border border-black/5 dark:border-white/5">
                  S = πr²
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                  {circleAreaAnimProgress 
                    ? "此时近似长方形的长为圆周长的一半 πr，宽为半径 r，因此面积约为 πr²。"
                    : `当前圆等分为 ${circleSlicesCount} 份。等分越多，拼成的图形越接近长方形。`}
                </p>
              </div>
            </div>

            {/* 搴曢儴鎮诞鎺у埗鏍?*/}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 p-3.5 rounded-2xl bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-xl flex items-center gap-6 z-[38] transition-all duration-500">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">等分数</span>
                <input
                  type="range"
                  min="8"
                  max="64"
                  step="8"
                  value={circleSlicesCount}
                  onChange={(e) => {
                    setCircleSlicesCount(Number(e.target.value));
                    setCircleAreaAnimProgress(false); // 璋冭妭浠芥暟鏃跺己鍒跺洖鍒板渾褰㈠紡
                  }}
                  className="w-40 h-1 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-zinc-800 dark:text-white text-xs font-bold w-6">{circleSlicesCount}</span>
              </div>

              <button
                onClick={() => setCircleAreaAnimProgress(prev => !prev)}
                className="px-6 py-2.5 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95 text-sm cursor-pointer"
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

