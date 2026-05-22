import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { X, Delete, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';

/**
 * GeoGebra 风格的浮动数学虚拟键盘
 * 
 * 用法: 在父组件中保留输入框 ref, 监听光标位置, 通过 onInsert 把文本片段
 * 插入到光标处。键盘的所有按钮都用 onMouseDown + preventDefault 来防止
 * 输入框失焦。
 */

interface MathKeyboardProps {
  visible: boolean;
  onClose: () => void;
  onInsert: (text: string, opts?: { caretOffset?: number }) => void;
  onBackspace: () => void;
  onArrow: (dir: 'left' | 'right') => void;
  onSubmit: () => void;
}

type Tab = 'num' | 'fn' | 'abc' | 'sym';

interface KeyDef {
  /** 显示文本 (支持 react node) */
  label: React.ReactNode;
  /** 实际插入的字符串 */
  insert: string;
  /** 插入后光标相对偏移 (默认插入后停在末尾;如果是 sin(),通常希望停在括号内) */
  caretOffset?: number;
  /** 占用网格列数 */
  span?: number;
  /** 高亮配色: 主色按钮 (运算符等) */
  variant?: 'default' | 'accent' | 'op' | 'danger';
  /** 自定义点击 (覆盖 insert 行为) */
  onClick?: () => void;
}

const ROW_HEIGHT = 'h-11';

export function MathKeyboard({
  visible,
  onClose,
  onInsert,
  onBackspace,
  onArrow,
  onSubmit,
}: MathKeyboardProps) {
  const [tab, setTab] = useState<Tab>('num');

  // 把按钮事件挂到 mouseDown 上,并 preventDefault, 避免输入框失焦
  const handleKey = (k: KeyDef) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (k.onClick) {
      k.onClick();
      return;
    }
    onInsert(k.insert, { caretOffset: k.caretOffset });
  };

  // ----- 数字面板 (123) -----
  // 仿 GeoGebra: 顶行变量 (x, y, π, e), 三列字母数字, 两列运算符, 底部 ans/逗号/括号/箭头
  const numKeys: KeyDef[][] = [
    [
      { label: <i>x</i>, insert: 'x', variant: 'accent' },
      { label: <i>y</i>, insert: 'y', variant: 'accent' },
      { label: <span>π</span>, insert: 'pi', variant: 'accent' },
      { label: <i>e</i>, insert: 'e', variant: 'accent' },
      { label: '7', insert: '7' },
      { label: '8', insert: '8' },
      { label: '9', insert: '9' },
      { label: '×', insert: '*', variant: 'op' },
      { label: '÷', insert: '/', variant: 'op' },
    ],
    [
      { label: <span>x²</span>, insert: '^2' },
      { label: <span>xⁿ</span>, insert: '^', },
      { label: '√', insert: 'sqrt()', caretOffset: -1 },
      { label: <span>|x|</span>, insert: 'abs()', caretOffset: -1 },
      { label: '4', insert: '4' },
      { label: '5', insert: '5' },
      { label: '6', insert: '6' },
      { label: '+', insert: '+', variant: 'op' },
      { label: '−', insert: '-', variant: 'op' },
    ],
    [
      { label: '<', insert: '<' },
      { label: '>', insert: '>' },
      { label: '(', insert: '(' },
      { label: ')', insert: ')' },
      { label: '1', insert: '1' },
      { label: '2', insert: '2' },
      { label: '3', insert: '3' },
      { label: '=', insert: '=', variant: 'op' },
      { label: <Delete className="w-4 h-4" />, insert: '', variant: 'danger', onClick: onBackspace },
    ],
    [
      { label: <i>x</i>, insert: 'x', variant: 'accent' },
      { label: ',', insert: ',' },
      { label: '0', insert: '0' },
      { label: '.', insert: '.' },
      { label: <ChevronLeft className="w-4 h-4" />, insert: '', onClick: () => onArrow('left') },
      { label: <ChevronRight className="w-4 h-4" />, insert: '', onClick: () => onArrow('right') },
      { label: <CornerDownLeft className="w-4 h-4" />, insert: '', variant: 'accent', span: 3, onClick: onSubmit },
    ],
  ];

  // ----- 函数面板 f(x) -----
  const fnKeys: KeyDef[][] = [
    [
      { label: 'sin', insert: 'sin()', caretOffset: -1 },
      { label: 'cos', insert: 'cos()', caretOffset: -1 },
      { label: 'tan', insert: 'tan()', caretOffset: -1 },
      { label: 'ln', insert: 'ln()', caretOffset: -1 },
      { label: 'log', insert: 'log()', caretOffset: -1 },
      { label: <span>e<sup>x</sup></span>, insert: 'exp()', caretOffset: -1 },
      { label: <span>x<sup>n</sup></span>, insert: '^' },
    ],
    [
      { label: 'asin', insert: 'asin()', caretOffset: -1 },
      { label: 'acos', insert: 'acos()', caretOffset: -1 },
      { label: 'atan', insert: 'atan()', caretOffset: -1 },
      { label: 'sinh', insert: 'sinh()', caretOffset: -1 },
      { label: 'cosh', insert: 'cosh()', caretOffset: -1 },
      { label: 'tanh', insert: 'tanh()', caretOffset: -1 },
      { label: '√', insert: 'sqrt()', caretOffset: -1 },
    ],
    [
      { label: 'abs', insert: 'abs()', caretOffset: -1 },
      { label: 'floor', insert: 'floor()', caretOffset: -1 },
      { label: 'ceil', insert: 'ceil()', caretOffset: -1 },
      { label: 'round', insert: 'round()', caretOffset: -1 },
      { label: 'sign', insert: 'sign()', caretOffset: -1 },
      { label: 'max', insert: 'max(,)', caretOffset: -2 },
      { label: 'min', insert: 'min(,)', caretOffset: -2 },
    ],
    [
      { label: 'π', insert: 'pi', variant: 'accent' },
      { label: 'e', insert: 'e', variant: 'accent' },
      { label: '(', insert: '(' },
      { label: ')', insert: ')' },
      { label: <ChevronLeft className="w-4 h-4" />, insert: '', onClick: () => onArrow('left') },
      { label: <ChevronRight className="w-4 h-4" />, insert: '', onClick: () => onArrow('right') },
      { label: <Delete className="w-4 h-4" />, insert: '', variant: 'danger', onClick: onBackspace },
    ],
  ];

  // ----- 字母面板 ABC -----
  const abcKeys: KeyDef[][] = [
    'qwertyuiop'.split('').map(c => ({ label: c, insert: c })),
    'asdfghjkl'.split('').map(c => ({ label: c, insert: c })),
    'zxcvbnm'.split('').map(c => ({ label: c, insert: c })),
    [
      { label: 'a', insert: 'a', variant: 'accent' },
      { label: 'b', insert: 'b', variant: 'accent' },
      { label: 'c', insert: 'c', variant: 'accent' },
      { label: 'k', insert: 'k', variant: 'accent' },
      { label: '(', insert: '(' },
      { label: ')', insert: ')' },
      { label: <ChevronLeft className="w-4 h-4" />, insert: '', onClick: () => onArrow('left') },
      { label: <ChevronRight className="w-4 h-4" />, insert: '', onClick: () => onArrow('right') },
      { label: <Delete className="w-4 h-4" />, insert: '', variant: 'danger', onClick: onBackspace },
    ],
  ];

  // ----- 符号面板 #&¬ -----
  const symKeys: KeyDef[][] = [
    [
      { label: '+', insert: '+', variant: 'op' },
      { label: '−', insert: '-', variant: 'op' },
      { label: '×', insert: '*', variant: 'op' },
      { label: '÷', insert: '/', variant: 'op' },
      { label: '%', insert: '%', variant: 'op' },
      { label: '^', insert: '^', variant: 'op' },
      { label: '=', insert: '=', variant: 'op' },
    ],
    [
      { label: '(', insert: '(' },
      { label: ')', insert: ')' },
      { label: ',', insert: ',' },
      { label: '.', insert: '.' },
      { label: '<', insert: '<' },
      { label: '>', insert: '>' },
      { label: '|', insert: '|' },
    ],
    [
      { label: 'π', insert: 'pi', variant: 'accent' },
      { label: 'e', insert: 'e', variant: 'accent' },
      { label: '∞', insert: 'inf', variant: 'accent' },
      { label: '√', insert: 'sqrt()', caretOffset: -1 },
      { label: 'x²', insert: '^2' },
      { label: 'x³', insert: '^3' },
      { label: 'xⁿ', insert: '^' },
    ],
    [
      { label: <ChevronLeft className="w-4 h-4" />, insert: '', onClick: () => onArrow('left') },
      { label: <ChevronRight className="w-4 h-4" />, insert: '', onClick: () => onArrow('right') },
      { label: <Delete className="w-4 h-4" />, insert: '', variant: 'danger', span: 2, onClick: onBackspace },
      { label: <CornerDownLeft className="w-4 h-4" />, insert: '', variant: 'accent', span: 3, onClick: onSubmit },
    ],
  ];

  const keysByTab: Record<Tab, KeyDef[][]> = {
    num: numKeys,
    fn: fnKeys,
    abc: abcKeys,
    sym: symKeys,
  };

  const tabKeys = keysByTab[tab];

  return (
    <div
      className={cn(
        'absolute left-0 right-0 bottom-[108px] z-[40] transition-transform duration-300 ease-out',
        visible ? 'translate-y-0' : 'translate-y-[calc(100%+108px)] pointer-events-none'
      )}
      data-mathkbd
      // 整个键盘容器吃掉 mouseDown,避免 click outside 触发 blur
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mx-auto max-w-[760px] m-3 rounded-3xl bg-zinc-900/85 backdrop-blur-2xl border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* 顶部分类条 */}
        <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5 border-b border-white/10">
          <TabButton active={tab === 'num'} onClick={() => setTab('num')}>
            <span className="font-mono">123</span>
          </TabButton>
          <TabButton active={tab === 'fn'} onClick={() => setTab('fn')}>
            <span className="italic">f(x)</span>
          </TabButton>
          <TabButton active={tab === 'abc'} onClick={() => setTab('abc')}>
            <span>ABC</span>
          </TabButton>
          <TabButton active={tab === 'sym'} onClick={() => setTab('sym')}>
            <span className="font-mono">#&¬</span>
          </TabButton>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onClose(); }}
              className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 按键区 */}
        <div className="p-2.5 flex flex-col gap-1.5">
          {tabKeys.map((row, rIdx) => (
            <div
              key={rIdx}
              className={cn('grid gap-1.5', ROW_HEIGHT)}
              style={{
                gridTemplateColumns: `repeat(${row.reduce((s, k) => s + (k.span ?? 1), 0)}, minmax(0,1fr))`,
              }}
            >
              {row.map((k, kIdx) => (
                <button
                  key={kIdx}
                  type="button"
                  onMouseDown={handleKey(k)}
                  className={cn(
                    'rounded-xl flex items-center justify-center text-sm font-medium select-none transition-all active:scale-[0.94] border',
                    k.span && k.span > 1 ? '' : '',
                    k.variant === 'accent' && 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/25',
                    k.variant === 'op' && 'bg-amber-500/12 border-amber-400/25 text-amber-200 hover:bg-amber-500/22',
                    k.variant === 'danger' && 'bg-rose-500/12 border-rose-400/25 text-rose-300 hover:bg-rose-500/22',
                    (!k.variant || k.variant === 'default') && 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:text-white'
                  )}
                  style={k.span ? { gridColumn: `span ${k.span} / span ${k.span}` } : undefined}
                >
                  {k.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border',
        active
          ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
          : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
      )}
    >
      {children}
    </button>
  );
}
