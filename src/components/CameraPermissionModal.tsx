import { motion } from 'motion/react';
import { Camera, ShieldAlert } from 'lucide-react';

interface CameraPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CameraPermissionModal({
  isOpen,
  onClose,
  onConfirm,
}: CameraPermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Background Mask
          注意：故意不绑定 onClick={onClose}。
          在 AppleDock 的"进入空间 AR"确认弹窗刚关闭、本弹窗紧接着出现的瞬间，
          用户首次安装后偶发的微小双击 / 长按余响会落到新弹窗的遮罩上，
          导致 onClose -> handleCancelPermission 把 activeTab 退回 whiteboard，
          表现为"第一次安装完程序进入 AR 空间会被退出来"，
          第二次因为 localStorage 已记住权限，本弹窗不出现，因此无复现。
          这里强制要求用户通过下方的两个明确按钮做选择。 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 p-8 flex flex-col items-center text-center shadow-[0_24px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.6)] select-none"
      >
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Camera Icon Wrapper */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 dark:from-cyan-500/10 dark:to-blue-500/10 border border-cyan-500/30 dark:border-cyan-500/20 flex items-center justify-center text-cyan-500 dark:text-cyan-400 shadow-[0_8px_30px_rgba(6,182,212,0.15)]">
            <Camera className="w-10 h-10 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-1.5 border-2 border-white dark:border-zinc-950 shadow-md">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3">
          开启相机以进入 AR 空间
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 mb-8 max-w-sm">
          HoloMath 需要使用您的摄像头来识别您的手势，并在物理空间中投影出可进行互动的三维几何模型。
        </p>

        {/* Action Buttons */}
        <div className="flex w-full gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-6 rounded-2xl text-sm font-semibold border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
          >
            暂不开启
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-6 rounded-2xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-[0_8px_20px_rgba(6,182,212,0.25)] dark:shadow-[0_8px_20px_rgba(6,182,212,0.4)] active:scale-95 transition-all cursor-pointer"
          >
            允许并开启
          </button>
        </div>
      </motion.div>
    </div>
  );
}
