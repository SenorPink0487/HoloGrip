import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useARStore } from '../store';
import { X, Delete, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';

/**
 * GeoGebra 风格的苹果视效浮动数学虚拟键盘
 */

interface MathKeyboardProps {
  visible: boolean;
  position?: 'absolute' | 'fixed';
  onClose: () => void;
  onInsert: (text: string, opts?: { caretOffset?: number }) => void;
  onBackspace: () => void;
  onArrow: (dir: 'left' | 'right') => void;
  onSubmit: () => void;
}

type Tab = 'num' | 'fn' | 'abc' | 'sym';

interface KeyDef {
  label: React.ReactNode;
  insert: string;
  caretOffset?: number;
  span?: number;
  variant?: 'default' | 'accent' | 'op' | 'danger';
  onClick?: () => void;
}

const ROW_HEIGHT = 'h-11';

export function MathKeyboard({
  visible,
  position = 'absolute',
  onClose,
  onInsert,
  onBackspace,
  onArrow,
  onSubmit,
}: MathKeyboardProps) {
  const [tab, setTab] = useState<Tab>('num');
  const theme = useARStore(state => state.theme);
  const isDark = theme === 'dark';

  const handleKey = (k: KeyDef) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (k.onClick) {
      k.onClick();
      return;
    }
    onInsert(k.insert, { caretOffset: k.caretOffset });
  };

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
      { label: <span>xⁿ</span>, insert: '^' },
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
      { label: <Delete className="w-4.5 h-4.5" />, insert: '', onClick: onBackspace, variant: 'danger' },
    ],
    [
      { label: 'ans', insert: 'ans' },
      { label: ',', insert: ',' },
      { label: '0', insert: '0', span: 2 },
      { label: '.', insert: '.' },
      { label: <ChevronLeft className="w-4.5 h-4.5" />, insert: '', onClick: () => onArrow('left') },
      { label: <ChevronRight className="w-4.5 h-4.5" />, insert: '', onClick: () => onArrow('right') },
      { label: <CornerDownLeft className="w-4.5 h-4.5" />, insert: '', onClick: onSubmit, variant: 'op', span: 2 },
    ],
  ];

  const fnKeys: KeyDef[][] = [
    [
      { label: 'sin', insert: 'sin()', caretOffset: -1, variant: 'accent' },
      { label: 'cos', insert: 'cos()', caretOffset: -1, variant: 'accent' },
      { label: 'tan', insert: 'tan()', caretOffset: -1, variant: 'accent' },
      { label: 'asin', insert: 'asin()', caretOffset: -1 },
      { label: 'acos', insert: 'acos()', caretOffset: -1 },
      { label: 'atan', insert: 'atan()', caretOffset: -1 },
    ],
    [
      { label: 'ln', insert: 'ln()', caretOffset: -1, variant: 'accent' },
      { label: 'log₁₀', insert: 'log()', caretOffset: -1 },
      { label: 'eⁿ', insert: 'exp()', caretOffset: -1 },
      { label: '10ⁿ', insert: '10^', variant: 'accent' },
      { label: 'sec', insert: 'sec()', caretOffset: -1 },
      { label: 'csc', insert: 'csc()', caretOffset: -1 },
    ],
    [
      { label: 'sinh', insert: 'sinh()', caretOffset: -1 },
      { label: 'cosh', insert: 'cosh()', caretOffset: -1 },
      { label: 'tanh', insert: 'tanh()', caretOffset: -1 },
      { label: 'cot', insert: 'cot()', caretOffset: -1 },
      { label: 'sgn', insert: 'sgn()', caretOffset: -1 },
      { label: 'round', insert: 'round()', caretOffset: -1 },
    ],
    [
      { label: 'floor', insert: 'floor()', caretOffset: -1 },
      { label: 'ceil', insert: 'ceil()', caretOffset: -1 },
      { label: 'min(a,b)', insert: 'min(,)', caretOffset: -2 },
      { label: 'max(a,b)', insert: 'max(,)', caretOffset: -2 },
      { label: <Delete className="w-4.5 h-4.5" />, insert: '', onClick: onBackspace, variant: 'danger', span: 2 },
    ],
  ];

  const abcRows = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m'],
  ];
  const abcKeys: KeyDef[][] = [
    abcRows[0].map(ch => ({ label: ch, insert: ch })),
    abcRows[1].map(ch => ({ label: ch, insert: ch })),
    [
      ...abcRows[2].map(ch => ({ label: ch, insert: ch })),
      { label: <Delete className="w-4.5 h-4.5" />, insert: '', onClick: onBackspace, variant: 'danger', span: 2 },
    ],
    [
      { label: 'a', insert: 'a', variant: 'accent' },
      { label: 'b', insert: 'b', variant: 'accent' },
      { label: 'c', insert: 'c', variant: 'accent' },
      { label: 'k', insert: 'k', variant: 'accent' },
      { label: 'space', insert: ' ', span: 3 },
      { label: <CornerDownLeft className="w-4.5 h-4.5" />, insert: '', onClick: onSubmit, variant: 'op', span: 2 },
    ],
  ];

  const symKeys: KeyDef[][] = [
    [
      { label: '≤', insert: '<=' },
      { label: '≥', insert: '>=' },
      { label: '≠', insert: '!=' },
      { label: '≈', insert: 'approx' },
      { label: '∞', insert: 'infinity' },
      { label: 'θ', insert: 'theta' },
      { label: 'α', insert: 'alpha' },
      { label: 'β', insert: 'beta' },
    ],
    [
      { label: '{', insert: '{' },
      { label: '}', insert: '}' },
      { label: '[', insert: '[' },
      { label: ']', insert: ']' },
      { label: ':', insert: ':' },
      { label: ';', insert: ';' },
      { label: '!', insert: '!' },
      { label: '?', insert: '?' },
    ],
    [
      { label: '%', insert: '%' },
      { label: '^', insert: '^' },
      { label: '_', insert: '_' },
      { label: '~', insert: '~' },
      { label: '|', insert: '|' },
      { label: '&', insert: '&' },
      { label: <Delete className="w-4.5 h-4.5" />, insert: '', onClick: onBackspace, variant: 'danger', span: 2 },
    ],
  ];

  const keysByTab: Record<Tab, KeyDef[][]> = {
    num: numKeys,
    fn: fnKeys,
    abc: abcKeys,
    sym: symKeys,
  };

  const tabKeys = keysByTab[tab];

  const keyboardJSX = (
    <AnimatePresence key="mathkbd-anim">
      {visible && (
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={cn(
            position === 'fixed'
              ? 'fixed left-1/2 -translate-x-1/2 bottom-[215px] z-[9999] w-[740px] max-w-[95vw] pointer-events-auto'
              : 'absolute left-0 right-0 bottom-[108px] z-[40]'
          )}
          data-mathkbd
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className={cn(
            "mx-auto max-w-[760px] rounded-3xl backdrop-blur-3xl border shadow-2xl overflow-hidden transition-colors duration-300",
            isDark 
              ? "bg-zinc-950/90 border-white/15 text-white shadow-[0_30px_70px_rgba(0,0,0,0.7)]" 
              : "bg-white/90 border-black/10 text-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.15)]",
            position === 'absolute' && 'm-3'
          )}>
            <div className={cn("flex items-center gap-1 px-3 pt-2.5 pb-1.5 border-b", isDark ? "border-white/10" : "border-black/10")}>
              <TabButton active={tab === 'num'} onClick={() => setTab('num')} isDark={isDark}>
                <span className="font-mono">123</span>
              </TabButton>
              <TabButton active={tab === 'fn'} onClick={() => setTab('fn')} isDark={isDark}>
                <span className="italic">f(x)</span>
              </TabButton>
              <TabButton active={tab === 'abc'} onClick={() => setTab('abc')} isDark={isDark}>
                <span>ABC</span>
              </TabButton>
              <TabButton active={tab === 'sym'} onClick={() => setTab('sym')} isDark={isDark}>
                <span className="font-mono">#&¬</span>
              </TabButton>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onClose(); }}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 cursor-pointer",
                    isDark ? "text-zinc-400 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-slate-900 hover:bg-black/5"
                  )}
                  title="关闭键盘"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3">
              {tabKeys.map((row, rIdx) => (
                <div key={rIdx} className="flex gap-1.5 mb-1.5 last:mb-0">
                  {row.map((k, cIdx) => (
                    <button
                      key={cIdx}
                      type="button"
                      onMouseDown={handleKey(k)}
                      className={cn(
                        'flex-1 flex items-center justify-center rounded-xl font-mono text-sm transition-all select-none active:scale-95 border cursor-pointer',
                        ROW_HEIGHT,
                        k.variant === 'accent' && (
                          isDark 
                            ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/30' 
                            : 'bg-cyan-50 border-cyan-200 text-cyan-800 hover:bg-cyan-100 font-bold'
                        ),
                        k.variant === 'op' && (
                          isDark 
                            ? 'bg-amber-500/18 border-amber-400/30 text-amber-200 hover:bg-amber-500/28 font-bold' 
                            : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 font-bold'
                        ),
                        k.variant === 'danger' && (
                          isDark 
                            ? 'bg-rose-500/15 border-rose-400/25 text-rose-300 hover:bg-rose-500/25' 
                            : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 font-bold'
                        ),
                        (!k.variant || k.variant === 'default') && (
                          isDark 
                            ? 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:text-white' 
                            : 'bg-slate-100/90 border-slate-200 text-slate-800 hover:bg-slate-200 hover:text-slate-950 font-semibold'
                        )
                      )}
                      style={k.span ? { flex: k.span, minWidth: `${(k.span / row.length) * 100}%` } : undefined}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (position === 'fixed') {
    return createPortal(keyboardJSX, document.body);
  }

  return keyboardJSX;
}

function TabButton({
  active, onClick, children, isDark,
}: { active: boolean; onClick: () => void; children: React.ReactNode; isDark: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer',
        active
          ? isDark 
            ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]' 
            : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-700 shadow-sm font-black'
          : isDark 
            ? 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5' 
            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-900 hover:bg-black/5'
      )}
    >
      {children}
    </button>
  );
}
