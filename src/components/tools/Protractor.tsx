import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Move } from 'lucide-react';
import { useARStore } from '../../store';

interface ProtractorProps {
  onDrawArc?: (center: { x: number; y: number }, radius: number, startAngle: number, endAngle: number) => void;
}

export function Protractor({ onDrawArc }: ProtractorProps) {
  const theme = useARStore(state => state.theme);
  const isDark = theme === 'dark';

  const [pos, setPos] = useState({ x: 350, y: 350 });
  const [angle, setAngle] = useState(0); // 量角器自身的倾斜角
  const [indicatorAngle, setIndicatorAngle] = useState(45); // 指针测角值 (0 - 180 度)

  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isDraggingIndicator, setIsDraggingIndicator] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const rotateStartAngle = useRef(0);
  const rotateStartMouseAngle = useRef(0);

  const protractorRef = useRef<HTMLDivElement>(null);
  const size = 320; // 直径

  // 1. 平移
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
    e.stopPropagation();
  };

  // 2. 旋转量角器
  const handleRotateStart = (e: React.MouseEvent) => {
    setIsRotating(true);
    rotateStartAngle.current = angle;

    if (protractorRef.current) {
      const rect = protractorRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      rotateStartMouseAngle.current = Math.atan2(dy, dx);
    }
    e.stopPropagation();
  };

  // 3. 拖动量角指针
  const handleIndicatorStart = (e: React.MouseEvent) => {
    setIsDraggingIndicator(true);
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 处理量角器拖动
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPos({
          x: posStart.current.x + dx,
          y: posStart.current.y + dy
        });
      }

      // 处理量角器自身旋转
      if (isRotating && protractorRef.current) {
        const rect = protractorRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const currentMouseAngle = Math.atan2(dy, dx);
        
        const deltaAngle = ((currentMouseAngle - rotateStartMouseAngle.current) * 180) / Math.PI;
        setAngle(rotateStartAngle.current + deltaAngle);
      }

      // 处理测角指针拖拽
      if (isDraggingIndicator && protractorRef.current) {
        const rect = protractorRef.current.getBoundingClientRect();
        // 原点（半圆中心）在量角器底边中心，即 (centerX, centerY)
        // 实际上半圆底边中心是 rect 下边缘中点 (因为量角器是半圆，高度是宽度的一半)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.bottom; // 物理原点在量角器底部水平线的中心

        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY; // y 轴向上为负，向底边以下为正
        
        // 计算鼠标相对于量角器局部坐标的角度
        // 局部 X 轴与底边重合，局部 Y 轴向上
        // 我们需要相对于底边右侧 (0度) 的角
        // 转化为带倾斜修正的角度
        const rad = (angle * Math.PI) / 180;
        
        // 旋转回量角器自身无倾斜状态下的 dx, dy
        const localX = dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const localY = dx * Math.sin(-rad) + dy * Math.cos(-rad);
        
        // 计算相对于左边/右边
        // 量角器半圆向上 (localY <= 0)
        let clickAngle = (Math.atan2(-localY, localX) * 180) / Math.PI;
        
        // 约束在 0 到 180 度之间
        if (clickAngle < 0) {
          if (localX > 0) clickAngle = 0;
          else clickAngle = 180;
        }
        setIndicatorAngle(Math.min(180, Math.max(0, clickAngle)));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsRotating(false);
      setIsDraggingIndicator(false);
    };

    if (isDragging || isRotating || isDraggingIndicator) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isRotating, isDraggingIndicator, angle, pos]);

  // 根据当前夹角在底下的白板画出带有该夹角度数的弧形
  const handleQuickDrawAngle = () => {
    if (!onDrawArc) return;

    // 量角器倾斜角 angle，指针 indicatorAngle
    // 起始角为 angle (弧度)，终止角为 angle + indicatorAngle (弧度)
    // 转化为数学坐标系的弧度（y轴向下）
    const radCenter = (angle * Math.PI) / 180;
    
    // 物理原点在量角器底边中心
    // 我们把量角器底边中心计算出来（在未旋转时是在 (0, size/2)）
    // 旋转后中心位置就是 pos
    const startRad = (-angle * Math.PI) / 180;
    const endRad = (-(angle + indicatorAngle) * Math.PI) / 180;

    // 半径取 100px
    onDrawArc(pos, 100, startRad, endRad);
  };

  const r = size / 2;

  // 测角指针的端点坐标
  const indRad = (indicatorAngle * Math.PI) / 180;
  const indX = r + (r - 10) * Math.cos(indRad);
  const indY = r - (r - 10) * Math.sin(indRad);

  return (
    <div
      ref={protractorRef}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) rotate(${angle}deg)`,
        transformOrigin: 'bottom center', // 旋转和缩放围绕量角器底边中心
        width: `${size}px`,
        height: `${r}px`,
        left: `-${r}px`,
        top: `-${r}px`
      }}
      className="absolute select-none pointer-events-auto cursor-grab active:cursor-grabbing"
    >
      {/* 半圆形 SVG */}
      <svg width={size} height={r} viewBox={`0 0 ${size} ${r}`} className="overflow-visible filter drop-shadow-2xl">
        <defs>
          {/* 半圆裁切 */}
          <clipPath id="semi-circle">
            <path d={`M 0,${r} A ${r},${r} 0 0,1 ${size},${r} Z`} />
          </clipPath>
        </defs>

        {/* 1. 磨砂玻璃半圆背景 */}
        <path
          d={`M 0,${r} A ${r},${r} 0 0,1 ${size},${r} Z`}
          fill={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.04)"}
          stroke={isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.15)"}
          strokeWidth="1.5"
          className="backdrop-blur-xl"
        />

        {/* 2. 0-180度刻度线 */}
        {Array.from({ length: 191 }).map((_, i) => {
          if (i % 2 !== 0) return null; // 每 2 度画一根线
          const rad = (i * Math.PI) / 180;
          const isMajor = i % 10 === 0;
          const isMedium = i % 5 === 0 && !isMajor;
          const h = isMajor ? 14 : isMedium ? 9 : 5;
          
          const x1 = r + r * Math.cos(rad);
          const y1 = r - r * Math.sin(rad);
          const x2 = r + (r - h) * Math.cos(rad);
          const y2 = r - (r - h) * Math.sin(rad);

          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(15, 23, 42, 0.35)"}
                strokeWidth="1"
              />
              {isMajor && i <= 180 && (
                <text
                  x={r + (r - 24) * Math.cos(rad)}
                  y={r - (r - 24) * Math.sin(rad) + 3}
                  fill={isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(15, 23, 42, 0.5)"}
                  fontSize="8px"
                  textAnchor="middle"
                  transform={`rotate(${90 - i}, ${r + (r - 24) * Math.cos(rad)}, ${r - (r - 24) * Math.sin(rad)})`}
                >
                  {i}
                </text>
              )}
            </g>
          );
        })}

        {/* 3. 夹角扇形高亮 */}
        <path
          d={`M ${r},${r} L ${size},${r} A ${r},${r} 0 0,0 ${r + r * Math.cos(indRad)},${r - r * Math.sin(indRad)} Z`}
          fill="rgba(6, 182, 212, 0.15)"
          stroke="#06b6d4"
          strokeWidth="1"
          style={{ transition: 'd 0.1s ease-out' }}
        />

        {/* 4. 测角指针线 */}
        <line
          x1={r}
          y1={r}
          x2={indX}
          y2={indY}
          stroke="#06b6d4"
          strokeWidth="2.5"
          className="shadow-lg"
        />

        {/* 5. 拖动指引圆把手 (放在指针尖端) */}
        <circle
          cx={indX}
          cy={indY}
          r="8"
          fill="#06b6d4"
          stroke="#ffffff"
          strokeWidth="2"
          className="cursor-alias hover:scale-125 transition-transform"
          onMouseDown={handleIndicatorStart}
        />
        
        {/* 中心点标记 */}
        <circle cx={r} cy={r} r="3" fill={isDark ? "#ffffff" : "#0f172a"} />
      </svg>

      {/* 控制中心 (小苹果气泡面板) */}
      <div
        className={`absolute flex flex-col items-center gap-1 p-2 rounded-xl backdrop-blur-md z-10 border transition-all ${
          isDark ? 'bg-black/60 border-white/10' : 'bg-white/70 border-black/10'
        }`}
        style={{
          left: '50%',
          bottom: '15px',
          transform: 'translateX(-50%)'
        }}
      >
        <span className={`text-[12px] font-bold font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
          当前角: {Math.round(indicatorAngle)}°
        </span>
        <div className="flex gap-2 mt-1">
          <div
            onMouseDown={handleDragStart}
            className={`p-1 rounded cursor-move transition-colors ${
              isDark ? 'bg-white/10 text-white/50 hover:text-white hover:bg-white/20' : 'bg-black/5 text-black/40 hover:text-black hover:bg-black/10'
            }`}
            title="拖动平移"
          >
            <Move className="w-3.5 h-3.5" />
          </div>
          <button
            onClick={handleQuickDrawAngle}
            className={`px-2 py-0.5 rounded text-white text-[9px] font-semibold transition-all border active:scale-95 ${
              isDark ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-400/20' : 'bg-cyan-500 hover:bg-cyan-600 border-cyan-600/20'
            }`}
            title="在白板上画出该扇形角度"
          >
            印刻角度
          </button>
          <div
            onMouseDown={handleRotateStart}
            className={`p-1 rounded cursor-alias transition-colors ${
              isDark ? 'bg-white/10 text-white/50 hover:text-white hover:bg-white/20' : 'bg-black/5 text-black/40 hover:text-black hover:bg-black/10'
            }`}
            title="按住旋转"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

    </div>
  );
}
