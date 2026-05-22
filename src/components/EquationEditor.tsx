import React from 'react';
import { cn } from '../lib/utils';
import { X, Binary } from 'lucide-react';
import { useARStore, FormulaCard } from '../store';

export function EquationEditor() {
  const isFormulaModalOpen = useARStore(state => state.isFormulaModalOpen);
  const setFormulaModalOpen = useARStore(state => state.setFormulaModalOpen);
  const addFormulaCard = useARStore(state => state.addFormulaCard);
  const formulaCards = useARStore(state => state.formulaCards);

  // 可视化模板库，直接映射到原生 MathML，确保大屏零依赖无损排版
  const templates = [
    {
      id: 'quadratic',
      name: '求根公式',
      mathML: `
        <math display="block" style="font-size: 26px; color: #fff;">
          <mi>x</mi>
          <mo>=</mo>
          <mfrac>
            <mrow>
              <mo>−</mo>
              <mi>b</mi>
              <mo>±</mo>
              <msqrt>
                <msup><mi>b</mi><mn>2</mn></msup>
                <mo>−</mo>
                <mn>4</mn>
                <mi>a</mi>
                <mi>c</mi>
              </msqrt>
            </mrow>
            <mrow>
              <mn>2</mn>
              <mi>a</mi>
            </mrow>
          </mfrac>
        </math>
      `
    },
    {
      id: 'pythagoras',
      name: '勾股定理',
      mathML: `
        <math display="block" style="font-size: 26px; color: #fff;">
          <msup><mi>a</mi><mn>2</mn></msup>
          <mo>+</mo>
          <msup><mi>b</mi><mn>2</mn></msup>
          <mo>=</mo>
          <msup><mi>c</mi><mn>2</mn></msup>
        </math>
      `
    },
    {
      id: 'circle_area',
      name: '圆面积',
      mathML: `
        <math display="block" style="font-size: 26px; color: #fff;">
          <mi>S</mi>
          <mo>=</mo>
          <mi>π</mi>
          <msup><mi>r</mi><mn>2</mn></msup>
        </math>
      `
    },
    {
      id: 'derivative',
      name: '导数定义',
      mathML: `
        <math display="block" style="font-size: 20px; color: #fff;">
          <msup><mi>f</mi><mo>′</mo></msup>
          <mo>(</mo><mi>x</mi><mo>)</mo>
          <mo>=</mo>
          <munder>
            <mo>lim</mo>
            <mrow><mi>Δ</mi><mi>x</mi><mo>→</mo><mn>0</mn></mrow>
          </munder>
          <mfrac>
            <mrow>
              <mi>f</mi>
              <mo>(</mo>
              <mi>x</mi>
              <mo>+</mo>
              <mi>Δ</mi>
              <mi>x</mi>
              <mo>)</mo>
              <mo>−</mo>
              <mi>f</mi>
              <mo>(</mo>
              <mi>x</mi>
              <mo>)</mo>
            </mrow>
            <mrow>
              <mi>Δ</mi>
              <mi>x</mi>
            </mrow>
          </mfrac>
        </math>
      `
    },
    {
      id: 'integral',
      name: '微积分基本定理',
      mathML: `
        <math display="block" style="font-size: 22px; color: #fff;">
          <msubsup>
            <mo>∫</mo>
            <mi>a</mi>
            <mi>b</mi>
          </msubsup>
          <mi>f</mi>
          <mo>(</mo>
          <mi>x</mi>
          <mo>)</mo>
          <mi>d</mi>
          <mi>x</mi>
          <mo>=</mo>
          <mi>F</mi>
          <mo>(</mo>
          <mi>b</mi>
          <mo>)</mo>
          <mo>−</mo>
          <mi>F</mi>
          <mo>(</mo>
          <mi>a</mi>
          <mo>)</mo>
        </math>
      `
    },
    {
      id: 'trig',
      name: '欧拉公式',
      mathML: `
        <math display="block" style="font-size: 26px; color: #fff;">
          <msup>
            <mi>e</mi>
            <mrow>
              <mi>i</mi>
              <mi>π</mi>
            </mrow>
          </msup>
          <mo>+</mo>
          <mn>1</mn>
          <mo>=</mo>
          <mn>0</mn>
        </math>
      `
    }
  ];

  // 生成一张公式卡片投射到屏幕中
  const handleCreateCard = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;

    const newCard: FormulaCard = {
      id: `card_${Date.now()}`,
      mathML: tmpl.mathML,
      // 投在屏幕中央偏随机位置
      x: window.innerWidth / 2 - 150 + (formulaCards.length * 25) % 150,
      y: window.innerHeight / 2 - 100 + (formulaCards.length * 20) % 150,
      scale: 1.2
    };

    addFormulaCard(newCard);
    setFormulaModalOpen(false); // 选完自动关闭
  };

  if (!isFormulaModalOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto">
      {/* 模态框主体 */}
      <div 
        className="w-[900px] max-w-[95%] max-h-[85vh] flex flex-col rounded-3xl bg-zinc-900/90 backdrop-blur-2xl border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-zinc-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Binary className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">可视化公式牌选择</h2>
              <p className="text-zinc-500 text-xs mt-0.5">选择公式生成卡片投射到大屏白板上进行拖拽与教学剖析</p>
            </div>
          </div>
          <button 
            onClick={() => setFormulaModalOpen(false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域：公式卡片网格 */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-6">
            {templates.map(tmpl => (
              <div 
                key={tmpl.id}
                onClick={() => handleCreateCard(tmpl.id)}
                className="group p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 shadow-lg flex flex-col gap-4 transition-all duration-300 cursor-pointer hover:shadow-[0_12px_24px_rgba(0,0,0,0.2)]"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-zinc-300 group-hover:text-cyan-400 transition-colors">{tmpl.name}</span>
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[11px] font-bold">印制卡片</span>
                </div>
                
                {/* 利用 MathML 渲染预览 */}
                <div 
                  className="py-6 flex justify-center bg-black/40 rounded-xl min-h-[100px] items-center border border-white/5 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: tmpl.mathML }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 底部小提示 */}
        <div className="px-8 py-4 bg-zinc-950/30 border-t border-white/5 text-center text-xs text-zinc-500">
          🎓 点击任意公式即可将其投射为白板背景上的浮动卡片，投射后可拖拽移动、缩放大小。
        </div>
      </div>
    </div>
  );
}
