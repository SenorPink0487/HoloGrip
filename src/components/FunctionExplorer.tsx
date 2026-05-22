import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Sliders, RotateCcw, HelpCircle, Eye, EyeOff } from 'lucide-react';

type FunctionType = 'linear' | 'quadratic' | 'sinusoidal' | 'exponential';

export function FunctionExplorer() {
  // 当前选中的函数模板
  const [funcType, setFuncType] = useState<FunctionType>('quadratic');

  // 参数状态
  const [paramA, setParamA] = useState<number>(1);
  const [paramB, setParamB] = useState<number>(0);
  const [paramC, setParamC] = useState<number>(0);
  const [paramD, setParamD] = useState<number>(0);

  // 坐标系状态
  const [scale, setScale] = useState<number>(45); // 像素 / 数学单位
  const [origin, setOrigin] = useState<{ x: number; y: number }>({ x: 300, y: 250 });
  const [hasInitializedOrigin, setHasInitializedOrigin] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOriginStart = useRef({ x: 0, y: 0 });

  // 辅助开关
  const [showValues, setShowValues] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 当参数或坐标系发生改变时，重绘函数图像
  useEffect(() => {
    drawGraph();
  }, [funcType, paramA, paramB, paramC, paramD, scale, origin, showValues]);

  // 重置坐标系和参数
  const handleReset = () => {
    setScale(45);
    const canvas = canvasRef.current;
    if (canvas) {
      setOrigin({ x: canvas.width / 2, y: canvas.height / 2 });
    } else {
      setOrigin({ x: 300, y: 250 });
    }
    setParamA(1);
    setParamB(0);
    setParamC(0);
    setParamD(0);
  };

  // 根据函数类型计算 y
  const calculateY = (x: number): number => {
    switch (funcType) {
      case 'linear':
        // y = ax + b (用 paramB 作为常量 b)
        return paramA * x + paramB;
      case 'quadratic':
        // y = ax^2 + bx + c
        return paramA * x * x + paramB * x + paramC;
      case 'sinusoidal':
        // y = a * sin(b * x + c) + d
        return paramA * Math.sin(paramB * x + paramC) + paramD;
      case 'exponential':
        // y = a * e^(bx) + c (用 paramC 作为常量 c)
        return paramA * Math.exp(paramB * x) + paramC;
      default:
        return 0;
    }
  };

  // 获取函数的文本解析式
  const getFormulaText = (): string => {
    const round = (val: number) => Math.round(val * 100) / 100;
    const a = round(paramA);
    const b = round(paramB);
    const c = round(paramC);
    const d = round(paramD);

    switch (funcType) {
      case 'linear':
        return `y = ${a}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)}`;
      case 'quadratic':
        return `y = ${a === 1 ? '' : a === -1 ? '-' : a}x² ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}`;
      case 'sinusoidal':
        return `y = ${a}·sin(${b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}) ${d >= 0 ? '+ ' + d : '- ' + Math.abs(d)}`;
      case 'exponential':
        return `y = ${a}·e^(${b}x) ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}`;
      default:
        return '';
    }
  };

  // 核心 Canvas 图像绘制逻辑
  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清屏
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;

    // 1. 绘制虚线背景网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // 垂直网格线 (从原点向左右拓展)
    const startGridX = Math.floor(-origin.x / scale);
    const endGridX = Math.ceil((width - origin.x) / scale);
    for (let i = startGridX; i <= endGridX; i++) {
      const px = origin.x + i * scale;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();

      // 绘制 X 轴刻度文字 (排除 0)
      if (i !== 0 && showValues) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px sans-serif';
        ctx.setLineDash([]); // 绘文字不能用虚线
        ctx.fillText(i.toString(), px - 5, origin.y + 15);
        ctx.setLineDash([4, 4]);
      }
    }

    // 水平网格线 (从原点向上下拓展)
    const startGridY = Math.floor((origin.y - height) / scale);
    const endGridY = Math.ceil(origin.y / scale);
    for (let i = startGridY; i <= endGridY; i++) {
      const py = origin.y - i * scale;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();

      // 绘制 Y 轴刻度文字 (排除 0)
      if (i !== 0 && showValues) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px sans-serif';
        ctx.setLineDash([]);
        ctx.fillText(i.toString(), origin.x - 18, py + 4);
        ctx.setLineDash([4, 4]);
      }
    }

    // 2. 绘制实线 X、Y 轴
    ctx.setLineDash([]); // 实线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;

    // X 轴
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();

    // Y 轴
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();

    // 绘制原点 'O'
    if (showValues) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px sans-serif';
      ctx.fillText('0', origin.x - 12, origin.y + 14);
      ctx.fillText('x', width - 15, origin.y - 8);
      ctx.fillText('y', origin.x + 8, 15);
    }

    // 3. 绘制函数图像曲线
    ctx.strokeStyle = '#ec4899'; // 桃红色函数曲线，极致对比
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(236, 72, 153, 0.4)';

    ctx.beginPath();
    let first = true;

    // 遍历每一个像素点 X 坐标，映射为数学坐标，计算 y，再画线
    for (let px = 0; px < width; px++) {
      const x = (px - origin.x) / scale;
      const y = calculateY(x);

      // 转化为像素坐标
      const py = origin.y - y * scale;

      // 如果 py 在合理范围内，进行画线，防止指数函数等爆屏
      if (!isNaN(py) && isFinite(py) && py >= -100 && py <= height + 100) {
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
    
    // 重置阴影，防止影响其他绘制
    ctx.shadowBlur = 0;
  };

  // 画布鼠标事件支持平移
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOriginStart.current = { ...origin };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOrigin({
      x: dragOriginStart.current.x + dx,
      y: dragOriginStart.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 鼠标滚轮支持缩放
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(15, Math.min(250, scale * zoomFactor));

    // 让缩放以鼠标所在点为中心
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mathX = (mouseX - origin.x) / scale;
    const mathY = (origin.y - mouseY) / scale;

    setScale(newScale);
    setOrigin({
      x: mouseX - mathX * newScale,
      y: mouseY + mathY * newScale
    });
  };

  // 尺寸调整
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
        if (!hasInitializedOrigin && width > 0 && height > 0) {
          setOrigin({ x: width / 2, y: height / 2 });
          setHasInitializedOrigin(true);
        }
        drawGraph();
      }
    });

    resizeObserver.observe(canvas.parentElement);
    return () => resizeObserver.disconnect();
  }, [funcType, paramA, paramB, paramC, paramD, scale, origin, showValues, hasInitializedOrigin]);

  return (
    <div className="w-full h-full flex bg-transparent select-none relative">
      {/* 侧边控制器 (Apple Design) - z-[35] 保证始终可交互 */}
      <div className="w-80 border-r border-white/10 bg-zinc-950/70 p-6 flex flex-col gap-6 select-none overflow-y-auto relative z-[35]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">函数图像联动</h2>
          <p className="text-zinc-500 text-xs mt-1">拖动滑块实时观测解析式与平移翻转</p>
        </div>

        {/* 函数模板选择 */}
        <div className="flex flex-col gap-2">
          <span className="text-zinc-500 text-xs font-semibold">函数类型</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { type: 'linear', label: '一次函数' },
              { type: 'quadratic', label: '二次函数' },
              { type: 'sinusoidal', label: '三角函数' },
              { type: 'exponential', label: '指数函数' }
            ].map(item => (
              <button
                key={item.type}
                onClick={() => {
                  setFuncType(item.type as FunctionType);
                  // 切换类型时，重置一些合理的默认参数
                  if (item.type === 'linear') { setParamA(1); setParamB(0); }
                  if (item.type === 'quadratic') { setParamA(1); setParamB(0); setParamC(0); }
                  if (item.type === 'sinusoidal') { setParamA(1.5); setParamB(1); setParamC(0); setParamD(0); }
                  if (item.type === 'exponential') { setParamA(1); setParamB(0.5); setParamC(0); }
                }}
                className={cn(
                  "p-2.5 rounded-xl text-xs font-medium border transition-all text-center",
                  funcType === item.type 
                    ? "bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-600/20" 
                    : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 动态公式牌展示 */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-lg">
          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">实时解析式</span>
          <div className="text-pink-400 font-serif text-lg font-semibold tracking-wide">
            {getFormulaText()}
          </div>
        </div>

        <div className="h-px bg-white/10" />

        {/* 参数调节滑块 */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 text-xs font-semibold flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>参数调节</span>
            </span>
            <button 
              onClick={handleReset}
              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置状态</span>
            </button>
          </div>

          {/* 参数 A */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400 font-mono">系数 a = {paramA.toFixed(2)}</span>
              <span className="text-zinc-600 text-[10px]">(控制开口与缩放)</span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.05"
              value={paramA}
              onChange={(e) => setParamA(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* 参数 B */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400 font-mono">系数 b = {paramB.toFixed(2)}</span>
              <span className="text-zinc-600 text-[10px]">(控制对称轴/周期)</span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.05"
              value={paramB}
              onChange={(e) => setParamB(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* 参数 C */}
          {['quadratic', 'sinusoidal', 'exponential'].includes(funcType) && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400 font-mono">常数 c = {paramC.toFixed(2)}</span>
                <span className="text-zinc-600 text-[10px]">(控制上下/左右平移)</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.05"
                value={paramC}
                onChange={(e) => setParamC(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          )}

          {/* 参数 D */}
          {funcType === 'sinusoidal' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400 font-mono">常数 d = {paramD.toFixed(2)}</span>
                <span className="text-zinc-600 text-[10px]">(控制垂直偏移)</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.05"
                value={paramD}
                onChange={(e) => setParamD(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <button
            onClick={() => setShowValues(!showValues)}
            className="w-full py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            {showValues ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showValues ? "隐藏坐标系标签" : "显示坐标系标签"}</span>
          </button>
        </div>
      </div>

      {/* 主绘图画布区 */}
      <div className="flex-1 relative overflow-hidden bg-zinc-950/40 cursor-grab active:cursor-grabbing z-[35]">
        {/* 鼠标拖拽、滚轮事件 */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full"
        />

        {/* 辅助指示信息 */}
        <div className="absolute top-6 right-6 p-3 rounded-xl bg-black/60 border border-white/10 text-[10px] text-zinc-400 font-medium flex items-center gap-1.5 shadow-lg select-none">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>大屏提示：鼠标拖拽平移，滚轮上下滑动可以缩放刻度大小</span>
        </div>
      </div>
    </div>
  );
}
