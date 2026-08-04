import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShieldCheck, Cpu, Orbit, CheckCircle2 } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';

const INIT_STEPS = [
  { text: '正在初始化 Tauri 2 桌面内核引擎...', icon: Cpu },
  { text: '预热 3D WebGL / Canvas 渲染管线...', icon: Orbit },
  { text: '校验空间实验室身份与加密凭据...', icon: ShieldCheck },
  { text: '准备就绪，欢迎来到 HoloGrip 全景工作台', icon: CheckCircle2 },
];

export function SplashScreen() {
  const isSplashActive = useSessionStore(state => state.isSplashActive);
  const dismissSplash = useSessionStore(state => state.dismissSplash);
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    if (!isSplashActive) return;

    const timer1 = setTimeout(() => {
      setCurrentStepIndex(1);
      setProgress(45);
    }, 700);

    const timer2 = setTimeout(() => {
      setCurrentStepIndex(2);
      setProgress(80);
    }, 1400);

    const timer3 = setTimeout(() => {
      setCurrentStepIndex(3);
      setProgress(100);
    }, 2000);

    const timer4 = setTimeout(() => {
      dismissSplash();
    }, 2700);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [isSplashActive, dismissSplash]);

  return (
    <AnimatePresence>
      {isSplashActive && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 text-white select-none overflow-hidden"
        >
          {/* 背景大线色彩光晕 */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />

          {/* Logo 与光圈 */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 200, damping: 20 }}
            className="relative flex flex-col items-center mb-10"
          >
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 p-[1.5px] shadow-2xl shadow-cyan-500/30">
              <div className="w-full h-full bg-zinc-950/90 backdrop-blur-xl rounded-[22px] flex items-center justify-center overflow-hidden">
                <Sparkles className="w-12 h-12 text-cyan-400 animate-pulse" />
              </div>
            </div>
            
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              HoloGrip
            </h1>
            <p className="mt-1 text-xs font-medium tracking-widest text-cyan-400/90 uppercase">
              Tauri 2 · Apple Edition
            </p>
          </motion.div>

          {/* 初始化状态与进度条 */}
          <div className="w-72 flex flex-col items-center space-y-4">
            {/* 进度条 Track */}
            <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden p-[0.5px] border border-white/5 shadow-inner">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.8)]"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* 步骤提示文字 */}
            <motion.div
              key={currentStepIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="flex items-center space-y-0 space-x-2 text-xs text-zinc-400 font-medium h-6"
            >
              {React.createElement(INIT_STEPS[currentStepIndex].icon, {
                className: 'w-3.5 h-3.5 text-cyan-400 shrink-0',
              })}
              <span className="truncate">{INIT_STEPS[currentStepIndex].text}</span>
            </motion.div>
          </div>

          {/* 底部极简版本号 */}
          <div className="absolute bottom-8 text-[11px] font-mono text-zinc-600 tracking-wider">
            v0.1.1 · Tauri 2.11 · macOS Native Engine
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
