import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { 
  Play, 
  RotateCcw, 
  Plus, 
  MousePointer, 
  Share2, 
  Activity,
  Maximize2
} from 'lucide-react';

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

  // 定理演示选择：'board' | 'pythagoras' | 'circle_area'
  const [subModule, setSubModule] = useState<'board' | 'pythagoras' | 'circle_area'>('board');

  // 定理动画状态
  const [pythagorasStep, setPythagorasStep] = useState<number>(0); // 0: 初始, 1: 拼合
  const [circleSlicesCount, setCircleSlicesCount] = useState<number>(16);
  const [circleAreaAnimProgress, setCircleAreaAnimProgress] = useState<boolean>(false); // false: 圆, true: 长方形

  const svgRef = useRef<SVGSVGElement>(null);

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

  useEffect(() => {
    if (subModule === 'board') {
      loadCentroidDemo();
    }
  }, [subModule]);

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

  // 鼠标/触控交互
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 检查是否点在某个已有点附近 (吸附)
    const clickRadius = 15;
    const clickedPoint = points.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < clickRadius);

    if (activeTool === 'drag') {
      if (clickedPoint && clickedPoint.isFree) {
        setDraggingPointId(clickedPoint.id);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    } else if (activeTool === 'add_point') {
      if (!clickedPoint) {
        const newPoint: Point = {
          id: `p_${Date.now()}`,
          name: String.fromCharCode(65 + (points.length % 26)), // A, B, C...
          x,
          y,
          isFree: true
        };
        setPoints([...points, newPoint]);
      }
    } else if (activeTool === 'add_segment') {
      if (clickedPoint) {
        if (!selectedPointId) {
          setSelectedPointId(clickedPoint.id);
        } else {
          if (selectedPointId !== clickedPoint.id) {
            const newSeg: Segment = {
              id: `s_${Date.now()}`,
              p1Id: selectedPointId,
              p2Id: clickedPoint.id
            };
            setSegments([...segments, newSeg]);
          }
          setSelectedPointId(null);
        }
      }
    } else if (activeTool === 'add_circle') {
      if (clickedPoint) {
        if (!selectedPointId) {
          setSelectedPointId(clickedPoint.id);
        } else {
          if (selectedPointId !== clickedPoint.id) {
            const newCircle: Circle = {
              id: `c_${Date.now()}`,
              centerId: selectedPointId,
              radiusPointId: clickedPoint.id
            };
            setCircles([...circles, newCircle]);
          }
          setSelectedPointId(null);
        }
      }
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPointId) {
      const rect = svgRef.current!.getBoundingClientRect();
      const x = Math.max(10, Math.min(rect.width - 10, e.clientX - rect.left));
      const y = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));
      
      setPoints(points.map(p => p.id === draggingPointId ? { ...p, x, y } : p));
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPointId) {
      setDraggingPointId(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="w-full h-full flex bg-transparent select-none relative">
      {/* 侧边导航栏 (Apple Design) - z-35 保证始终可交互 */}
      {activeTab === 'geometry' && (
        <div className="w-64 border-r border-white/10 bg-zinc-950/70 p-6 flex flex-col gap-6 select-none relative z-[35]">
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">动态几何探究</h2>
            <p className="text-zinc-500 text-xs mt-1">数学概念与定理具象化引擎</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setSubModule('board')}
              className={cn(
                "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
                subModule === 'board' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>自由几何画板</span>
            </button>
            <button
              onClick={() => setSubModule('pythagoras')}
              className={cn(
                "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
                subModule === 'pythagoras' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Share2 className="w-4 h-4 text-orange-400" />
              <span>勾股定理割补</span>
            </button>
            <button
              onClick={() => setSubModule('circle_area')}
              className={cn(
                "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
                subModule === 'circle_area' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Maximize2 className="w-4 h-4 text-pink-400" />
              <span>圆面积极限拼接</span>
            </button>
          </div>

          <div className="mt-auto p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400/90 leading-relaxed">
            💡 <b>操作小提示：</b>
            {subModule === 'board' && "选择拖拽工具，在大屏上拖动 A, B, C 三角形顶点。观察中点 D, E, F 及重心 G 是否实时重算且始终三线交于一点！"}
            {subModule === 'pythagoras' && "点击【割补演示】按钮，观察直角三角形图形如何通过平移与旋转，完成经典割补推导证明。"}
            {subModule === 'circle_area' && "拖动切片滑块调节圆等分数，点击【极限展开】，观察圆形展开拼接为长方形的极限转化过程。"}
          </div>
        </div>
      )}

      {/* 主探究区 */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-8 z-[35]">
        
        {/* 顶部工具条 - 仅在自由画板模式下且激活几何Tab时显示 */}
        {activeTab === 'geometry' && subModule === 'board' && (
          <div className="absolute top-8 flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-xl select-none z-[35]">
            <button
              onClick={() => { setActiveTool('drag'); setSelectedPointId(null); }}
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
              onClick={() => { setActiveTool('add_point'); setSelectedPointId(null); }}
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
              onClick={() => { setActiveTool('add_segment'); setSelectedPointId(null); }}
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
              onClick={() => { setActiveTool('add_circle'); setSelectedPointId(null); }}
              className={cn(
                "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
                activeTool === 'add_circle' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              )}
              title="选择圆心和半径点画圆"
            >
              <span className="w-3.5 h-3.5 border-2 border-current rounded-full" />
              <span>画圆</span>
            </button>
            <div className="w-px h-8 bg-white/10 mx-1" />
            <button
              onClick={loadCentroidDemo}
              className="p-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all text-sm font-medium flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重置预设</span>
            </button>
          </div>
        )}

        {/* 1. 自由几何画板渲染 (SVG) */}
        {subModule === 'board' && (
          <svg
            ref={svgRef}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            className="w-full h-full bg-zinc-950/40 rounded-[2rem] border border-white/5 shadow-inner cursor-default"
          >
            {/* 网格底纹 */}
            <defs>
              <pattern id="geometry-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#geometry-grid)" />

            {/* 绘制预设的重心三中线 */}
            {points.find(p => p.id === 'pA') && midPoints.length === 3 && centroid && (
              <>
                {/* 绘制三条中线 AD, BE, CF */}
                <line 
                  x1={points.find(p => p.id === 'pA')!.x} y1={points.find(p => p.id === 'pA')!.y}
                  x2={midPoints[0].x} y2={midPoints[0].y}
                  stroke="#22d3ee" strokeWidth="2" strokeDasharray="6,4"
                />
                <line 
                  x1={points.find(p => p.id === 'pB')!.x} y1={points.find(p => p.id === 'pB')!.y}
                  x2={midPoints[1].x} y2={midPoints[1].y}
                  stroke="#22d3ee" strokeWidth="2" strokeDasharray="6,4"
                />
                <line 
                  x1={points.find(p => p.id === 'pC')!.x} y1={points.find(p => p.id === 'pC')!.y}
                  x2={midPoints[2].x} y2={midPoints[2].y}
                  stroke="#22d3ee" strokeWidth="2" strokeDasharray="6,4"
                />

                {/* 绘制中点 D, E, F 标记 */}
                {midPoints.map(mp => (
                  <g key={mp.id}>
                    <circle cx={mp.x} cy={mp.y} r="5" fill="#10b981" />
                    <text x={mp.x + 10} y={mp.y + 5} fill="#10b981" className="text-xs font-semibold select-none">{mp.name}</text>
                  </g>
                ))}

                {/* 绘制重心 G 标记 */}
                <g>
                  <circle cx={centroid.x} cy={centroid.y} r="7" fill="#ef4444" className="animate-pulse" />
                  <text x={centroid.x + 12} y={centroid.y + 5} fill="#ef4444" className="text-sm font-bold select-none">{centroid.name}</text>
                </g>
              </>
            )}

            {/* 绘制圆 */}
            {circles.map(circle => {
              const cp = points.find(p => p.id === circle.centerId);
              const rp = points.find(p => p.id === circle.radiusPointId);
              if (!cp || !rp) return null;
              const radius = Math.sqrt((rp.x - cp.x) ** 2 + (rp.y - cp.y) ** 2);
              return (
                <circle
                  key={circle.id}
                  cx={cp.x}
                  cy={cp.y}
                  r={radius}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth="2"
                />
              );
            })}

            {/* 绘制线段 */}
            {segments.map(seg => {
              const p1 = points.find(p => p.id === seg.p1Id);
              const p2 = points.find(p => p.id === seg.p2Id);
              if (!p1 || !p2) return null;
              return (
                <line
                  key={seg.id}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={seg.color || "rgba(255, 255, 255, 0.6)"}
                  strokeWidth="3"
                />
              );
            })}

            {/* 绘制点 */}
            {points.map(p => {
              const isSelected = selectedPointId === p.id;
              const isDragging = draggingPointId === p.id;
              return (
                <g key={p.id} className="cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isDragging ? 9 : 7}
                    fill={isSelected ? '#38bdf8' : p.isFree ? '#ffffff' : '#a1a1aa'}
                    stroke="#0284c7"
                    strokeWidth={isSelected || isDragging ? 3 : 1}
                    className="transition-[r,fill,stroke,stroke-width] duration-150"
                  />
                  <text
                    x={p.x + 10}
                    y={p.y - 10}
                    fill="#ffffff"
                    className="text-sm font-semibold select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
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
          <div className="flex flex-col items-center gap-8 w-full h-full max-w-4xl justify-center select-none">
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

              {/* 定理文字公式展示 */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-xl border border-white/10 text-white font-mono text-base font-semibold tracking-wider">
                {pythagorasStep === 0 ? "大正方形面积 S = c² + 4 × (ab/2)" : "重新割补 S = a² + b² + 4 × (ab/2)"}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setPythagorasStep(prev => prev === 0 ? 1 : 0)}
                className="px-6 py-3 rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95"
              >
                <Play className="w-4 h-4" />
                <span>{pythagorasStep === 0 ? "一键割补拼图" : "还原几何关系"}</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. 圆面积极限展开拼接演示区 */}
        {subModule === 'circle_area' && (
          <div className="flex flex-col items-center gap-8 w-full h-full max-w-4xl justify-center select-none">
            
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

              {/* 转换说明 */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-xl border border-white/10 text-white font-mono text-sm tracking-wider">
                {circleAreaAnimProgress 
                  ? "S ≈ 长方形面积 = 长 × 宽 = πr × r = πr²" 
                  : `当前圆等分为 ${circleSlicesCount} 份，等分数越多，拼接后越逼近矩形`}
              </div>
            </div>

            {/* 控制条 */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-sm">等分数:</span>
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
                <span className="text-white text-sm font-bold w-6">{circleSlicesCount}</span>
              </div>

              <button
                onClick={() => setCircleAreaAnimProgress(prev => !prev)}
                className="px-6 py-3 rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-medium flex items-center gap-2 shadow-lg active:scale-95"
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
