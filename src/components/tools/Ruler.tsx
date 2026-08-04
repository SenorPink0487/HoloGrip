import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Move } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';

interface RulerProps {
  onDrawLine?: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
}

export function Ruler({ onDrawLine }: RulerProps) {
  const theme = useSessionStore(state => state.theme);
  const isDark = theme === 'dark';
  const [pos, setPos] = useState({ x: 250, y: 200 });
  const [angle, setAngle] = useState(0); // 旋转角度 (度)
  const [length, setLength] = useState(400); // 直尺长度 (像素)

  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const rotateStartAngle = useRef(0);
  const rotateStartMouseAngle = useRef(0);

  const rulerRef = useRef<HTMLDivElement>(null);

  // 1. 拖动平移
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
    e.stopPropagation();
  };

  // 2. 旋转
  const handleRotateStart = (e: React.MouseEvent) => {
    setIsRotating(true);
    rotateStartAngle.current = angle;

    // 计算鼠标相对于直尺中心的方向角
    if (rulerRef.current) {
      const rect = rulerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      rotateStartMouseAngle.current = Math.atan2(dy, dx);
    }
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPos({
          x: posStart.current.x + dx,
          y: posStart.current.y + dy
        });
      }

      if (isRotating && rulerRef.current) {
        const rect = rulerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const currentMouseAngle = Math.atan2(dy, dx);
        
        const deltaAngle = ((currentMouseAngle - rotateStartMouseAngle.current) * 180) / Math.PI;
        setAngle(rotateStartAngle.current + deltaAngle);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsRotating(false);
    };

    if (isDragging || isRotating) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isRotating, angle, pos]);

  // 一键沿着直尺边缘画一条直线的快捷仿真功能
  const handleQuickDrawLine = () => {
    if (!onDrawLine) return;
    
    // 直尺长为 length (400px)，沿尺子长方向的两个端点坐标
    const rad = (angle * Math.PI) / 180;
    
    // 假设在直尺上边缘 (y = -20) 划线
    const halfL = length / 2 - 20;
    const startX = pos.x - halfL * Math.cos(rad) - 20 * Math.sin(rad);
    const startY = pos.y - halfL * Math.sin(rad) + 20 * Math.cos(rad);
    
    const endX = pos.x + halfL * Math.cos(rad) - 20 * Math.sin(rad);
    const endY = pos.y + halfL * Math.sin(rad) + 20 * Math.cos(rad);

    onDrawLine({ x: startX, y: startY }, { x: endX, y: endY });
  };

  return (
    <div
      ref={rulerRef}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) rotate(${angle}deg)`,
        transformOrigin: 'center center',
        width: `${length}px`,
        height: '64px',
        left: `-${length / 2}px`,
        top: '-32px'
      }}
      className="absolute cursor-grab active:cursor-grabbing select-none bg-white/70 dark:bg-white/10 border border-slate-350 dark:border-white/20 backdrop-blur-xl shadow-2xl rounded-lg flex items-center justify-between pointer-events-auto transition-shadow transition-colors duration-500 hover:shadow-[0_15px_35px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_15px_35px_rgba(255,255,255,0.1)]"
    >
      {/* 刻度尺刻度 */}
      <div className="absolute top-0 left-0 w-full h-[22px] border-b border-slate-300 dark:border-white/10 overflow-hidden flex justify-between px-2">
        {Array.from({ length: 41 }).map((_, i) => {
          const isMajor = i % 10 === 0;
          const isMedium = i % 5 === 0 && !isMajor;
          let h = '6px';
          if (isMajor) h = '16px';
          else if (isMedium) h = '11px';

          return (
            <div key={i} className="flex flex-col items-center justify-start flex-1" style={{ height: '22px' }}>
              <div className="bg-slate-500/50 dark:bg-white/40" style={{ width: '1px', height: h }} />
              {isMajor && (
                <span className="text-[8px] text-slate-500 dark:text-white/50 scale-90 -mt-1 font-mono">{i / 10}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 直尺中间按钮组：拖动手柄 & 旋转手柄 & 吸附画线按钮 */}
      <div className="w-full flex items-center justify-center gap-4 mt-4 px-4">
        {/* 平移拖拽图标 */}
        <div
          onMouseDown={handleDragStart}
          className="p-1 rounded bg-slate-200/50 dark:bg-white/10 text-slate-650 dark:text-white/60 hover:text-slate-800 dark:hover:text-white cursor-move hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
          title="拖动平移"
        >
          <Move className="w-4 h-4" />
        </div>

        {/* 快捷画线 */}
        <button
          onClick={handleQuickDrawLine}
          className="px-2.5 py-1 rounded-full bg-cyan-600/80 hover:bg-cyan-500 text-white text-[10px] font-bold tracking-wide transition-all border border-cyan-400/20 active:scale-95 shadow-md"
          title="沿尺子边缘画直线"
        >
          贴边画线
        </button>

        {/* 旋转把手 */}
        <div
          onMouseDown={handleRotateStart}
          className="p-1 rounded bg-slate-200/50 dark:bg-white/10 text-slate-650 dark:text-white/60 hover:text-slate-800 dark:hover:text-white cursor-alias hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
          title="按住拖拽旋转"
        >
          <RotateCw className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
