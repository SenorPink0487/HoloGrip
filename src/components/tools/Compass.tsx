import React, { useState, useRef, useEffect } from 'react';
import { Move } from 'lucide-react';

interface CompassProps {
  onDrawArc?: (center: { x: number; y: number }, radius: number, startAngle: number, endAngle: number) => void;
}

export function Compass({ onDrawArc }: CompassProps) {
  // 针尖位置 (圆心)
  const [needlePos, setNeedlePos] = useState({ x: 300, y: 300 });
  // 半径
  const [radius, setRadius] = useState(100);
  // 当前旋转角 (弧度)
  const [angle, setAngle] = useState(0);

  const [isDraggingNeedle, setIsDraggingNeedle] = useState(false);
  const [isDraggingPencil, setIsDraggingPencil] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const needleStart = useRef({ x: 0, y: 0 });
  const lastAngle = useRef(0);

  // 1. 拖动针脚 (平移圆规)
  const handleNeedleStart = (e: React.MouseEvent) => {
    setIsDraggingNeedle(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    needleStart.current = { ...needlePos };
    e.stopPropagation();
  };

  // 2. 拖动铅笔脚 (调节半径和夹角)
  const handlePencilStart = (e: React.MouseEvent) => {
    setIsDraggingPencil(true);
    e.stopPropagation();
  };

  // 3. 拖动顶部旋转手柄 (绕圆心画圆)
  const handleRotateStart = (e: React.MouseEvent) => {
    setIsRotating(true);
    lastAngle.current = angle;
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 平移
      if (isDraggingNeedle) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setNeedlePos({
          x: needleStart.current.x + dx,
          y: needleStart.current.y + dy
        });
      }

      // 调整半径
      if (isDraggingPencil) {
        const dx = e.clientX - needlePos.x;
        const dy = e.clientY - needlePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setRadius(Math.max(30, Math.min(250, dist)));
        setAngle(Math.atan2(dy, dx));
      }

      // 旋转圆规并生成轨迹
      if (isRotating) {
        const dx = e.clientX - needlePos.x;
        const dy = e.clientY - needlePos.y;
        const newAngle = Math.atan2(dy, dx);

        // 如果配置了轨迹生成，则在白板上画出这一小段弧线
        if (onDrawArc) {
          onDrawArc(needlePos, radius, lastAngle.current, newAngle);
        }

        lastAngle.current = newAngle;
        setAngle(newAngle);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingNeedle(false);
      setIsDraggingPencil(false);
      setIsRotating(false);
    };

    if (isDraggingNeedle || isDraggingPencil || isRotating) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingNeedle, isDraggingPencil, isRotating, needlePos, radius, angle]);

  // 计算圆规各关节顶点用于绘制金属框架
  // 枢轴头部在针尖与铅笔尖连线的中垂线上
  const pencilX = needlePos.x + radius * Math.cos(angle);
  const pencilY = needlePos.y + radius * Math.sin(angle);

  // 中点
  const midX = (needlePos.x + pencilX) / 2;
  const midY = (needlePos.y + pencilY) / 2;

  // 垂直向上偏移 (通过旋转角来控制垂直向量的方向)
  const height = 140; // 圆规腿的高度
  const headX = midX - height * Math.sin(angle);
  const headY = midY + height * Math.cos(angle);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none">
      
      {/* 渲染圆规金属骨架 (SVG) */}
      <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
        {/* 针尖腿 (灰色金属) */}
        <line
          x1={headX}
          y1={headY}
          x2={needlePos.x}
          y2={needlePos.y}
          stroke="rgba(200, 200, 200, 0.8)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        
        {/* 铅笔脚腿 (带色金属) */}
        <line
          x1={headX}
          y1={headY}
          x2={pencilX}
          y2={pencilY}
          stroke="rgba(6, 182, 212, 0.8)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* 顶部连接枢轴圆形 */}
        <circle cx={headX} cy={headY} r="8" fill="#a1a1aa" stroke="#ffffff" strokeWidth="2" />
        
        {/* 旋转手柄连线 (向上凸出的一小截把手) */}
        <line
          x1={headX}
          y1={headY}
          x2={headX - 25 * Math.sin(angle)}
          y2={headY + 25 * Math.cos(angle)}
          stroke="#ef4444"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>

      {/* 1. 针尖拖拽触发热区 */}
      <div
        style={{ left: `${needlePos.x}px`, top: `${needlePos.y}px` }}
        onMouseDown={handleNeedleStart}
        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-zinc-400/20 border border-zinc-200/40 cursor-move pointer-events-auto flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
        title="圆心 (拖拽平移)"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 shadow-md" />
        {/* 拖拽标签 */}
        <span className="absolute -top-6 text-[8px] bg-zinc-950/80 px-1 rounded border border-white/10 text-white font-bold whitespace-nowrap">圆心</span>
      </div>

      {/* 2. 铅笔尖拖拽触发热区 */}
      <div
        style={{ left: `${pencilX}px`, top: `${pencilY}px` }}
        onMouseDown={handlePencilStart}
        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-cyan-500/20 border border-cyan-400/40 cursor-alias pointer-events-auto flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
        title="半径 (拖拽调节半径和旋转)"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-md animate-pulse" />
        <span className="absolute -top-6 text-[8px] bg-zinc-950/80 px-1 rounded border border-white/10 text-white font-bold whitespace-nowrap">
          半径 {Math.round(radius)}px
        </span>
      </div>

      {/* 3. 顶部旋转手柄热区 */}
      <div
        style={{ 
          left: `${headX - 25 * Math.sin(angle)}px`, 
          top: `${headY + 25 * Math.cos(angle)}px` 
        }}
        onMouseDown={handleRotateStart}
        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-red-500/30 border border-red-400/40 cursor-grab active:cursor-grabbing pointer-events-auto flex items-center justify-center hover:scale-110 transition-transform"
        title="按住拖动绕圆心旋转画圆"
      >
        <div className="w-3 h-3 rounded-full bg-red-500 shadow-md" />
        <span className="absolute -top-6 text-[8px] bg-zinc-950/80 px-1 rounded border border-white/10 text-white font-bold whitespace-nowrap">旋转画圆</span>
      </div>

    </div>
  );
}
