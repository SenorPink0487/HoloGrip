import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Move } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSessionStore } from '../../stores/sessionStore';

interface TriangleRulerProps {
  onDrawLine?: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
}

export function TriangleRuler({ onDrawLine }: TriangleRulerProps) {
  const theme = useSessionStore(state => state.theme);
  const isDark = theme === 'dark';
  // 三角板类型：'45' (等腰直角三角板) 或 '30' (30-60-90直角三角板)
  const [type, setType] = useState<'45' | '30'>('45');
  const [pos, setPos] = useState({ x: 450, y: 300 });
  const [angle, setAngle] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const rotateStartAngle = useRef(0);
  const rotateStartMouseAngle = useRef(0);

  const rulerRef = useRef<HTMLDivElement>(null);

  // 三角板尺寸参数
  const size = 260; // 像素

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
    e.stopPropagation();
  };

  const handleRotateStart = (e: React.MouseEvent) => {
    setIsRotating(true);
    rotateStartAngle.current = angle;

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

  // 沿斜边快速画一条直线段
  const handleQuickDrawLine = () => {
    if (!onDrawLine) return;

    const rad = (angle * Math.PI) / 180;
    
    // 直角三角板底边为底 (0, 0) -> (size, 0)
    // 根据三角板种类计算两个直角边端点的数学坐标，然后在旋转后映射回全局坐标
    // 假设以 pos.x, pos.y 作为三角形直角顶点 (0, size) 附近的参考位置
    const offsetLX = -size / 2;
    const offsetLY = size / 2;

    let p1Local = { x: 0, y: 0 };
    let p2Local = { x: 0, y: 0 };

    if (type === '45') {
      // 45度角三角板，直角在 (0, size)，两个45度端点在 (-size, size) 和 (0, 0) 
      p1Local = { x: -size, y: size };
      p2Local = { x: 0, y: 0 };
    } else {
      // 30-60度三角板，直角在 (0, size)，30度角在 (-size * 1.73, size)，60度角在 (0, 0)
      p1Local = { x: -size * 1.73, y: size };
      p2Local = { x: 0, y: 0 };
    }

    // 旋转坐标系映射：x_global = pos.x + (x_local - cx)*cos - (y_local - cy)*sin
    // 为了简单，我们直尺中心在 pos。我们直接定义在当前旋转下的世界线段端点：
    const rotatePoint = (px: number, py: number) => {
      const rx = px * Math.cos(rad) - py * Math.sin(rad);
      const ry = px * Math.sin(rad) + py * Math.cos(rad);
      return { x: pos.x + rx, y: pos.y + ry };
    };

    // 这里画斜边 (从 p1 到 p2)
    const start = rotatePoint(p1Local.x + size/3, p1Local.y - size/3);
    const end = rotatePoint(p2Local.x + size/3, p2Local.y - size/3);

    onDrawLine(start, end);
  };

  return (
    <div
      ref={rulerRef}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) rotate(${angle}deg)`,
        transformOrigin: 'center center',
        width: `${size}px`,
        height: `${size}px`,
        left: `-${size / 2}px`,
        top: `-${size / 2}px`
      }}
      className="absolute select-none pointer-events-auto cursor-grab active:cursor-grabbing"
    >
      {/* 使用 SVG 呈现精致的磨砂玻璃三角板 */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible filter drop-shadow-2xl">
        <defs>
          <clipPath id="inner-triangle">
            {type === '45' ? (
              <polygon points={`30,${size - 30} ${size - 90},${size - 30} ${size - 90},30`} />
            ) : (
              <polygon points={`30,${size - 30} ${size - 50},${size - 30} ${size - 50},100`} />
            )}
          </clipPath>
          {/* 高斯模糊滤镜 */}
          <filter id="glass-blur">
            <feGaussianBlur stdDeviation="15" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
          </filter>
        </defs>

        {/* 1. 磨砂玻璃主体 */}
        {type === '45' ? (
          <polygon
            points={`0,${size} ${size},${size} ${size},0`}
            fill={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.65)"}
            stroke={isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.25)"}
            strokeWidth="1.5"
            className="backdrop-blur-xl transition-all duration-500"
          />
        ) : (
          <polygon
            points={`0,${size} ${size},${size} ${size},80`}
            fill={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.65)"}
            stroke={isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.25)"}
            strokeWidth="1.5"
            className="backdrop-blur-xl transition-all duration-500"
          />
        )}

        {/* 2. 中空洞 */}
        {type === '45' ? (
          <polygon
            points={`50,${size - 50} ${size - 100},${size - 50} ${size - 100},100`}
            fill={isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(248, 250, 252, 0.55)"}
            stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.18)"}
            strokeWidth="1.5"
            className="transition-all duration-500"
          />
        ) : (
          <polygon
            points={`60,${size - 50} ${size - 60},${size - 50} ${size - 60},120`}
            fill={isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(248, 250, 252, 0.55)"}
            stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.18)"}
            strokeWidth="1.5"
            className="transition-all duration-500"
          />
        )}

        {/* 3. 直角边刻度 (沿着底边和右侧垂直边) */}
        {/* 底边刻度 */}
        {Array.from({ length: 21 }).map((_, i) => {
          const x = (size / 20) * i;
          const isMajor = i % 5 === 0;
          const h = isMajor ? 12 : 6;
          return (
            <line
              key={`h-${i}`}
              x1={x}
              y1={size}
              x2={x}
              y2={size - h}
              stroke={isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(15, 23, 42, 0.45)"}
              strokeWidth="1"
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      {/* 操作按钮卡片（浮在三角板镂空中心） */}
      <div 
        className="absolute flex flex-col items-center gap-1 p-1.5 rounded-xl bg-white/90 dark:bg-black/60 border border-slate-200 dark:border-white/10 z-10 shadow-lg dark:shadow-none transition-colors duration-500"
        style={{
          left: type === '45' ? '55%' : '65%',
          top: type === '45' ? '65%' : '60%',
          transform: 'translate(-50%, -50%) rotate(0deg)'
        }}
      >
        <div className="flex gap-1">
          <button
            onClick={() => setType(type === '45' ? '30' : '45')}
            className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all"
          >
            {type === '45' ? '45°三角板' : '30°三角板'}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {/* 拖动 */}
          <div
            onMouseDown={handleDragStart}
            className="p-1 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white cursor-move hover:bg-slate-300 dark:hover:bg-white/20 transition-all"
            title="拖动平移"
          >
            <Move className="w-3 h-3" />
          </div>
          {/* 沿斜边划线 */}
          <button
            onClick={handleQuickDrawLine}
            className="px-1.5 py-0.5 rounded bg-cyan-600 text-white text-[8px] font-semibold hover:bg-cyan-500 transition-all border border-cyan-400/20 active:scale-95"
          >
            斜边画线
          </button>
          {/* 旋转 */}
          <div
            onMouseDown={handleRotateStart}
            className="p-1 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white cursor-alias hover:bg-slate-300 dark:hover:bg-white/20 transition-all"
            title="按住旋转"
          >
            <RotateCw className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
