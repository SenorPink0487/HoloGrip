import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  value: string;
  onChange: (val: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PromptModal({
  isOpen,
  title,
  value,
  onChange,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus and select the input text after modal opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md"
            onClick={onCancel}
          />

          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 p-6 flex flex-col shadow-[0_24px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          >
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white mb-4">
              {title}
            </h2>
            
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-xl bg-slate-100/80 dark:bg-zinc-950/50 border border-slate-200 dark:border-white/10 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all mb-6"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={onConfirm}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-zinc-900 dark:bg-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-sm transition-colors"
              >
                确定
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
