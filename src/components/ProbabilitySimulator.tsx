import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Dices, RefreshCw, BarChart2, TrendingUp, Play } from 'lucide-react';

type SimType = 'coin' | 'dice' | 'spinner' | 'large_number';

export function ProbabilitySimulator() {
  const [simType, setSimType] = useState<SimType>('coin');

  // 1. 投硬币状态
  const [coinResult, setCoinResult] = useState<'heads' | 'tails' | null>(null);
  const [coinStats, setCoinStats] = useState({ heads: 0, tails: 0, total: 0 });
  const [isFlipping, setIsFlipping] = useState(false);

  // 2. 掷骰子状态
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [diceStats, setDiceStats] = useState<number[]>([0, 0, 0, 0, 0, 0]); // 对应1-6的频数
  const [diceTotal, setDiceTotal] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  // 3. 转盘状态
  const [spinnerAngle, setSpinnerAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinnerStats, setSpinnerStats] = useState<number[]>([0, 0, 0, 0]); // 四个扇区
  const [spinnerTotal, setSpinnerTotal] = useState(0);

  // 4. 大数定律模拟状态
  const [largeNumTimes, setLargeNumTimes] = useState<number>(5000);
  const [isSimulating, setIsSimulating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 模拟硬币抛掷
  const handleFlipCoin = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    setCoinResult(null);

    setTimeout(() => {
      const isHeads = Math.random() < 0.5;
      const res = isHeads ? 'heads' : 'tails';
      setCoinResult(res);
      setCoinStats(prev => ({
        heads: prev.heads + (isHeads ? 1 : 0),
        tails: prev.tails + (!isHeads ? 1 : 0),
        total: prev.total + 1
      }));
      setIsFlipping(false);
    }, 1000); // 1秒的翻转动画
  };

  // 模拟掷骰子
  const handleRollDice = () => {
    if (isRolling) return;
    setIsRolling(true);
    setDiceResult(null);

    setTimeout(() => {
      const rolled = Math.floor(Math.random() * 6) + 1;
      setDiceResult(rolled);
      setDiceStats(prev => {
        const next = [...prev];
        next[rolled - 1] += 1;
        return next;
      });
      setDiceTotal(prev => prev + 1);
      setIsRolling(false);
    }, 1000);
  };

  // 模拟转盘旋转 (四个等份扇区: 红, 蓝, 绿, 黄)
  const handleSpinWheel = () => {
    if (isSpinning) return;
    setIsSpinning(true);

    const randomRotations = 10 + Math.random() * 5; // 旋转圈数
    const newAngle = spinnerAngle + randomRotations * 360;
    setSpinnerAngle(newAngle);

    setTimeout(() => {
      // 算出落入哪一个扇区 (0-360的余数)
      const normalizedAngle = (newAngle % 360);
      // 转盘逆时针转，相当于指针顺时针扫
      // 四个象限：
      // 0-90: 绿 (区2), 90-180: 蓝 (区1), 180-270: 红 (区0), 270-360: 黄 (区3)
      const sector = Math.floor(normalizedAngle / 90);
      // 调整一下扇区映射顺序
      const mappedSector = (3 - sector) % 4; // 映射成 0, 1, 2, 3

      setSpinnerStats(prev => {
        const next = [...prev];
        next[mappedSector] += 1;
        return next;
      });
      setSpinnerTotal(prev => prev + 1);
      setIsSpinning(false);
    }, 2500); // 2.5秒的摩擦减速动画
  };

  // 运行大数定律 10000 次模拟
  const handleLargeNumberSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);

    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const margin = 40;

      // 运行循环计算投硬币正面频率
      let headsCount = 0;
      const points: { x: number; y: number }[] = [];
      const totalSteps = largeNumTimes;
      const samplingCount = 100; // 仅抽样 100 个点绘制，防止大屏上 Canvas 巨慢卡死
      const samplingInterval = Math.max(1, Math.floor(totalSteps / samplingCount));

      for (let i = 1; i <= totalSteps; i++) {
        if (Math.random() < 0.5) {
          headsCount++;
        }
        if (i % samplingInterval === 0 || i === totalSteps) {
          points.push({
            x: i,
            y: headsCount / i // 正面占比频率 (0 ~ 1)
          });
        }
      }

      // 1. 绘制网格背景与理论线 (y = 0.5)
      ctx.lineWidth = 1;
      
      // X、Y 轴线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(margin, margin);
      ctx.lineTo(margin, height - margin);
      ctx.lineTo(width - margin, height - margin);
      ctx.stroke();

      // 0.5 理论收敛虚线 (绿色)
      const y05 = height - margin - (height - 2 * margin) * 0.5;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(margin, y05);
      ctx.lineTo(width - margin, y05);
      ctx.stroke();
      ctx.setLineDash([]); // 还原实线

      // 0.5 标志文本
      ctx.fillStyle = '#10b981';
      ctx.font = '12px font-semibold sans-serif';
      ctx.fillText('理论概率 0.50', width - 110, y05 - 6);

      // Y轴 0, 0.25, 0.5, 0.75, 1 刻度
      const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px font-mono';
      yTicks.forEach(tick => {
        const py = height - margin - (height - 2 * margin) * tick;
        ctx.fillText(tick.toFixed(2), margin - 30, py + 4);
        // 虚线辅助线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(margin, py);
        ctx.lineTo(width - margin, py);
        ctx.stroke();
      });

      // 2. 绘制频率折线 (cyan 渐变)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      points.forEach((pt, idx) => {
        // x轴映射：margin 到 width - margin
        const px = margin + ((pt.x - 1) / (totalSteps - 1)) * (width - 2 * margin);
        // y轴映射：频率 0-1 对应 height - margin 到 margin
        const py = height - margin - pt.y * (height - 2 * margin);

        if (idx === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();

      // 标示 X 轴试验次数
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px font-mono';
      ctx.fillText('1', margin, height - margin + 15);
      ctx.fillText(`试验次数 N = ${totalSteps}`, width / 2 - 50, height - margin + 20);
      ctx.fillText(totalSteps.toString(), width - margin - 20, height - margin + 15);

      setIsSimulating(false);
    }, 800); // 假装计算中，给大屏老师仪式感
  };

  // 大数定律选项改变时自适应渲染
  useEffect(() => {
    if (simType === 'large_number') {
      handleLargeNumberSimulation();
    }
  }, [simType, largeNumTimes]);

  const handleResetStats = () => {
    setCoinStats({ heads: 0, tails: 0, total: 0 });
    setCoinResult(null);
    setDiceStats([0, 0, 0, 0, 0, 0]);
    setDiceResult(null);
    setDiceTotal(0);
    setSpinnerStats([0, 0, 0, 0]);
    setSpinnerTotal(0);
  };

  return (
    <div className="w-full h-full flex bg-transparent select-none relative">
      
      {/* 侧边导航栏 - z-[35] 保证始终可交互 */}
      <div className="w-64 border-r border-white/10 bg-zinc-950/70 p-6 flex flex-col gap-6 select-none relative z-[35]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">概率发生器</h2>
          <p className="text-zinc-500 text-xs mt-1">概率统计与大数收敛教学工具</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => setSimType('coin')}
            className={cn(
              "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
              simType === 'coin' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span>投硬币试验</span>
          </button>
          <button
            onClick={() => setSimType('dice')}
            className={cn(
              "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
              simType === 'dice' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Dices className="w-4 h-4 text-orange-400" />
            <span>掷骰子试验</span>
          </button>
          <button
            onClick={() => setSimType('spinner')}
            className={cn(
              "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
              simType === 'spinner' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <RefreshCw className="w-4 h-4 text-pink-400" />
            <span>幸运大转盘</span>
          </button>
          <button
            onClick={() => setSimType('large_number')}
            className={cn(
              "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-2",
              simType === 'large_number' ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <BarChart2 className="w-4 h-4 text-lime-400" />
            <span>大数定律收敛</span>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <button
            onClick={handleResetStats}
            className="w-full py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-400 hover:text-white flex items-center justify-center gap-2 transition-colors"
          >
            <span>重置所有统计数据</span>
          </button>
        </div>
      </div>

      {/* 试验展示桌面 */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-8 z-[35]">
        
        {/* 1. 投硬币试验面板 */}
        {simType === 'coin' && (
          <div className="flex flex-col items-center gap-8 w-full max-w-lg">
            
            {/* 3D 硬币动画容器 */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <div 
                className={cn(
                  "w-36 h-36 rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600 border-[3px] border-amber-200 shadow-2xl flex items-center justify-center text-white text-4xl font-extrabold select-none",
                  isFlipping && "animate-spin" // 利用 tailwind 默认的简易旋转模拟翻转
                )}
                style={{
                  boxShadow: 'inset 0 4px 12px rgba(255,255,255,0.4), 0 10px 25px rgba(0,0,0,0.5)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              >
                {isFlipping ? "?" : coinResult === 'heads' ? "正" : coinResult === 'tails' ? "反" : "Coin"}
              </div>
            </div>

            {/* 统计图表 */}
            <div className="w-full bg-zinc-900/60 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-xl text-sm">
              <div className="flex justify-between items-center text-zinc-400 font-bold border-b border-white/5 pb-2">
                <span>投掷统计</span>
                <span>总次数: {coinStats.total}</span>
              </div>
              
              {/* 正面占比 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-zinc-300">
                  <span>正面 (Heads)</span>
                  <span>{coinStats.heads} 次 ({coinStats.total > 0 ? ((coinStats.heads / coinStats.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${coinStats.total > 0 ? (coinStats.heads / coinStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* 反面占比 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-zinc-300">
                  <span>反面 (Tails)</span>
                  <span>{coinStats.tails} 次 ({coinStats.total > 0 ? ((coinStats.tails / coinStats.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-pink-500 transition-all duration-300"
                    style={{ width: `${coinStats.total > 0 ? (coinStats.tails / coinStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleFlipCoin}
              disabled={isFlipping}
              className="px-8 py-3.5 rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-semibold shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isFlipping ? "抛掷中..." : "抛掷硬币"}
            </button>
          </div>
        )}

        {/* 2. 掷骰子面板 */}
        {simType === 'dice' && (
          <div className="flex flex-col items-center gap-8 w-full max-w-lg">
            
            {/* 骰子盒子 */}
            <div className="w-32 h-32 flex items-center justify-center bg-zinc-900 border border-white/20 rounded-2xl shadow-2xl relative">
              <div 
                className={cn(
                  "w-20 h-20 bg-white text-zinc-900 rounded-xl flex items-center justify-center text-4xl font-extrabold shadow-inner select-none",
                  isRolling && "animate-bounce" // 立体旋转这里用 bounce 代替
                )}
              >
                {isRolling ? "?" : diceResult || 6}
              </div>
            </div>

            {/* 1-6点数统计柱状图 */}
            <div className="w-full bg-zinc-900/60 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-xl">
              <div className="flex justify-between items-center text-zinc-400 font-bold border-b border-white/5 pb-2 text-sm">
                <span>点数频率统计</span>
                <span>总掷数: {diceTotal}</span>
              </div>
              
              <div className="grid grid-cols-6 gap-3 pt-2 items-end h-28">
                {diceStats.map((count, idx) => {
                  const maxCount = Math.max(...diceStats, 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[10px] text-zinc-400 font-bold">{count}</span>
                      <div className="w-full bg-white/5 rounded-t-md overflow-hidden" style={{ height: '70px' }}>
                        <div 
                          className="w-full bg-cyan-500 rounded-t-md transition-all duration-500" 
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-white font-bold">{idx + 1}点</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleRollDice}
              disabled={isRolling}
              className="px-8 py-3.5 rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-semibold shadow-lg active:scale-95"
            >
              {isRolling ? "滚动中..." : "抛掷骰子"}
            </button>
          </div>
        )}

        {/* 3. 转盘面板 */}
        {simType === 'spinner' && (
          <div className="flex flex-col items-center gap-8 w-full max-w-lg">
            
            {/* 转盘主体 */}
            <div className="relative w-56 h-56 flex items-center justify-center">
              {/* 指针 */}
              <div className="absolute -top-3 z-10 w-4 h-8 bg-red-500 clip-path-pointer shadow-lg" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
              <div
                style={{
                  transform: `rotate(-${spinnerAngle}deg)`,
                  transition: isSpinning ? 'transform 2.5s cubic-bezier(0.1, 0.8, 0.2, 1)' : 'none'
                }}
                className="w-full h-full rounded-full border-[4px] border-white/20 shadow-2xl flex items-center justify-center overflow-hidden"
              >
                {/* 四色SVG盘 */}
                <svg width="220" height="220" viewBox="0 0 220 220" className="rotate-45">
                  <path d="M 110,110 L 220,110 A 110,110 0 0,1 110,220 Z" fill="#ef4444" /> {/* 红 */}
                  <path d="M 110,110 L 110,220 A 110,110 0 0,1 0,110 Z" fill="#3b82f6" /> {/* 蓝 */}
                  <path d="M 110,110 L 0,110 A 110,110 0 0,1 110,0 Z" fill="#10b981" /> {/* 绿 */}
                  <path d="M 110,110 L 110,0 A 110,110 0 0,1 220,110 Z" fill="#f59e0b" /> {/* 黄 */}
                </svg>
              </div>
            </div>

            {/* 饼图统计 */}
            <div className="w-full bg-zinc-900/60 border border-white/10 p-5 rounded-2xl flex flex-col gap-3 shadow-xl">
              <div className="flex justify-between items-center text-zinc-400 font-bold border-b border-white/5 pb-2 text-sm">
                <span>转盘频数统计</span>
                <span>总旋转: {spinnerTotal}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[
                  { name: '红区', color: 'bg-red-500', count: spinnerStats[0] },
                  { name: '蓝区', color: 'bg-blue-500', count: spinnerStats[1] },
                  { name: '绿区', color: 'bg-green-500', count: spinnerStats[2] },
                  { name: '黄区', color: 'bg-yellow-500', count: spinnerStats[3] }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center bg-white/5 p-2 rounded-xl border border-white/5">
                    <div className={cn("w-3.5 h-3.5 rounded-full mb-1", item.color)} />
                    <span className="text-[10px] text-zinc-400 font-semibold">{item.name}</span>
                    <span className="text-xs text-white font-bold mt-1">{item.count} 次</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSpinWheel}
              disabled={isSpinning}
              className="px-8 py-3.5 rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500 transition-all font-semibold shadow-lg active:scale-95"
            >
              {isSpinning ? "旋转中..." : "旋转转盘"}
            </button>
          </div>
        )}

        {/* 4. 大数定律收敛折线图面板 */}
        {simType === 'large_number' && (
          <div className="flex flex-col items-center gap-6 w-full h-full max-w-3xl justify-center">
            
            {/* 折线图 Canvas 区域 */}
            <div className="relative w-full h-[280px] bg-zinc-900/60 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex items-center justify-center overflow-hidden">
              <canvas ref={canvasRef} width="650" height="260" className="w-full h-full" />
              {isSimulating && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-cyan-400 text-xs font-bold">10,000次概率极限收敛计算中...</span>
                  </div>
                </div>
              )}
            </div>

            {/* 控制器 */}
            <div className="flex items-center gap-6 bg-zinc-900/40 px-5 py-3 rounded-2xl border border-white/5 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-xs font-semibold">模拟总次数:</span>
                <input
                  type="range"
                  min="1000"
                  max="15000"
                  step="1000"
                  value={largeNumTimes}
                  onChange={(e) => setLargeNumTimes(Number(e.target.value))}
                  className="w-40 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-white text-xs font-bold w-12">{largeNumTimes.toLocaleString()} 次</span>
              </div>

              <button
                onClick={handleLargeNumberSimulation}
                className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 shadow transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5" />
                <span>一键大数计算</span>
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
