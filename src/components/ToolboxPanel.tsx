import React from 'react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { 
  Ruler as RulerIcon, 
  Triangle as TriIcon, 
  Maximize,
  Compass as CompassIcon,
  Check,
  RotateCcw,
  Sparkles,
  HelpCircle
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

  // 一键关闭/重置所有尺规工具
  const resetAllTools = () => {
    setShowRuler(false);
    setShowTriangleRuler(false);
    setShowProtractor(false);
    setShowCompass(false);
  };

  const hasActiveTool = showRuler || showTriangleRuler || showProtractor || showCompass;

  const tools = [
    {
      id: 'ruler',
      name: '仿真直尺',
      icon: <RulerIcon className="w-5 h-5" />,
      active: showRuler,
      toggle: () => setShowRuler(!showRuler),
      desc: '贴边绘制完美直线',
      colorClass: {
        active: "bg-gradient-to-br from-cyan-500/20 to-blue-500/5 border-cyan-500/40 text-cyan-200 shadow-[0_8px_20px_-6px_rgba(6,182,212,0.3)]",
        inactive: "bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:border-white/10 hover:text-white",
        iconActive: "bg-cyan-500/20 text-cyan-400",
        iconInactive: "bg-white/5 text-zinc-400"
      }
    },
    {
      id: 'triangle',
      name: '三角板',
      icon: <TriIcon className="w-5 h-5" />,
      active: showTriangleRuler,
      toggle: () => setShowTriangleRuler(!showTriangleRuler),
      desc: '绘制 45°/30° 角斜边',
      colorClass: {
        active: "bg-gradient-to-br from-orange-500/20 to-amber-500/5 border-orange-500/40 text-orange-200 shadow-[0_8px_20px_-6px_rgba(249,115,22,0.3)]",
        inactive: "bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:border-white/10 hover:text-white",
        iconActive: "bg-orange-500/20 text-orange-400",
        iconInactive: "bg-white/5 text-zinc-400"
      }
    },
    {
      id: 'protractor',
      name: '量角器',
      icon: <Maximize className="w-5 h-5 rotate-45" />,
      active: showProtractor,
      toggle: () => setShowProtractor(!showProtractor),
      desc: '角度测量与扇面印刻',
      colorClass: {
        active: "bg-gradient-to-br from-pink-500/20 to-purple-500/5 border-pink-500/40 text-pink-200 shadow-[0_8px_20px_-6px_rgba(236,72,153,0.3)]",
        inactive: "bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:border-white/10 hover:text-white",
        iconActive: "bg-pink-500/20 text-pink-400",
        iconInactive: "bg-white/5 text-zinc-400"
      }
    },
    {
      id: 'compass',
      name: '圆规工具',
      icon: <CompassIcon className="w-5 h-5" />,
      active: showCompass,
      toggle: () => setShowCompass(!showCompass),
      desc: '精准旋转绘制圆弧',
      colorClass: {
        active: "bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border-emerald-500/40 text-emerald-200 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.3)]",
        inactive: "bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:border-white/10 hover:text-white",
        iconActive: "bg-emerald-500/20 text-emerald-400",
        iconInactive: "bg-white/5 text-zinc-400"
      }
    }
  ];

  return (
    <div className="w-full h-full flex flex-col p-5 bg-transparent select-none justify-between gap-4">
      {/* Header Area */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <h3 className="text-sm font-bold text-white tracking-wide">授课尺规工具</h3>
        </div>
        
        {hasActiveTool && (
          <button 
            onClick={resetAllTools}
            className="px-2 py-1 rounded-lg text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-1 transition-all active:scale-95 border border-red-500/20"
          >
            <RotateCcw className="w-3 h-3" />
            <span>重置所有</span>
          </button>
        )}
      </div>

      {/* Grid Layout Cards */}
      <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto pr-0.5 py-1">
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={tool.toggle}
            className={cn(
              "p-3 rounded-2xl text-left border flex flex-col justify-between gap-4 transition-all duration-300 relative group overflow-hidden active:scale-98",
              tool.active ? tool.colorClass.active : tool.colorClass.inactive
            )}
          >
            {/* Glossy overlay on active */}
            {tool.active && (
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-30 pointer-events-none" />
            )}

            <div className="flex w-full items-start justify-between">
              <div className={cn(
                "p-2.5 rounded-xl transition-all duration-300",
                tool.active ? tool.colorClass.iconActive : tool.colorClass.iconInactive
              )}>
                {tool.icon}
              </div>
              
              {tool.active && (
                <div className="w-4.5 h-4.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center p-0.5 shadow-sm text-white">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-wide">{tool.name}</span>
              <span className="text-[9px] text-zinc-500 mt-1 leading-snug font-normal group-hover:text-zinc-400 transition-colors">
                {tool.desc}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Tips / Instructions */}
      <div className="p-3.5 rounded-2xl bg-zinc-950/40 border border-white/5 flex items-start gap-2 shadow-inner">
        <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 text-[10px] text-zinc-400 leading-relaxed font-normal">
          <p className="font-bold text-zinc-300">使用秘籍：</p>
          <p>激活后工具会浮现于画布上，双指/鼠标可自由旋转和缩放。点击工具中间的“印刻”即可自动把精密图形印在白板上。</p>
        </div>
      </div>
    </div>
  );
}
