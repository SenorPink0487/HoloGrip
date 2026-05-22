import React from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { 
  Square, 
  Triangle as TriIcon, 
  CircleDot, 
  Maximize,
  Check
} from 'lucide-react';

export function ToolboxPanel() {
  const showRuler = useARStore(state => state.showRuler);
  const setShowRuler = useARStore(state => state.setShowRuler);
  
  const showTriangleRuler = useARStore(state => state.showTriangleRuler);
  const setShowTriangleRuler = useARStore(state => state.setShowTriangleRuler);
  
  const showProtractor = useARStore(state => state.showProtractor);
  const setShowProtractor = useARStore(state => state.setShowProtractor);
  
  const showCompass = useARStore(state => state.showCompass);
  const setShowCompass = useARStore(state => state.setShowCompass);

  const tools = [
    {
      id: 'ruler',
      name: '仿真直尺',
      icon: <Square className="w-5 h-5 text-cyan-400" />,
      active: showRuler,
      toggle: () => setShowRuler(!showRuler),
      desc: '支持沿尺脚边缘自动绘制完美直线'
    },
    {
      id: 'triangle',
      name: '多功能三角板',
      icon: <TriIcon className="w-5 h-5 text-orange-400" />,
      active: showTriangleRuler,
      toggle: () => setShowTriangleRuler(!showTriangleRuler),
      desc: '提供45°与30°板，支持沿斜边画线'
    },
    {
      id: 'protractor',
      name: '多视角量角器',
      icon: <Maximize className="w-5 h-5 text-pink-400" />,
      active: showProtractor,
      toggle: () => setShowProtractor(!showProtractor),
      desc: '支持蓝点测角并印刻扇形角度笔迹'
    },
    {
      id: 'compass',
      name: '互动圆规',
      icon: <CircleDot className="w-5 h-5 text-lime-400" />,
      active: showCompass,
      toggle: () => setShowCompass(!showCompass),
      desc: '自由调节半径，拖拽手柄画出完美圆弧'
    }
  ];

  return (
    <div className="w-full h-full flex flex-col p-6 bg-transparent select-none">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-zinc-300">激活授课工具</h3>
        <p className="text-zinc-500 text-[11px] mt-0.5">工具将直接浮现在超级白板底座上，可跨窗画线</p>
      </div>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={tool.toggle}
            className={cn(
              "w-full p-3.5 rounded-2xl text-left transition-all duration-300 flex items-center justify-between border group relative overflow-hidden",
              tool.active 
                ? "bg-cyan-500/10 text-white border-cyan-500/30 shadow-[0_4px_12px_rgba(6,182,212,0.15)]" 
                : "bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10"
            )}
          >
            <div className="flex items-center gap-3.5 z-10">
              <div className={cn(
                "p-2 rounded-xl transition-all duration-300",
                tool.active ? "bg-cyan-500/20" : "bg-white/5 group-hover:scale-105"
              )}>
                {tool.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-wide">{tool.name}</span>
                <span className="text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400 transition-colors leading-relaxed">{tool.desc}</span>
              </div>
            </div>
            {tool.active && (
              <div className="p-1 rounded-full bg-cyan-500 text-zinc-950 z-10">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 p-3.5 rounded-2xl bg-zinc-950/40 border border-white/5 text-[10px] text-zinc-500 leading-relaxed">
        💡 <b>教学小贴士：</b>
        <p className="mt-1">所有激活的尺规均支持自由拖动和旋转，点击工具中部的“贴边画线/印刻角度/旋转画圆”即可直接把仿真线条印在白板上。</p>
      </div>
    </div>
  );
}
