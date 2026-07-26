import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Lock, ShieldAlert, UserCheck } from 'lucide-react';
import { useARStore } from '../../store';
import { apiUrl } from '../../lib/apiOrigin';

export function LoginModal() {
  const isLoggedIn = useARStore((state) => state.isLoggedIn);
  const isLocked = useARStore((state) => state.isLocked);
  const currentUser = useARStore((state) => state.currentUser);
  const login = useARStore((state) => state.login);
  const setCurrentUser = useARStore((state) => state.setCurrentUser);

  const [email, setEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visible = !isLoggedIn || isLocked;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('请输入邮箱和密码。');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const response = await fetch(apiUrl('/api/user/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.token || !payload?.user) {
        throw new Error(payload?.error || '邮箱或密码错误，请重试。');
      }

      localStorage.setItem('hg_token', payload.token);
      localStorage.setItem('hg_user', JSON.stringify(payload.user));
      setCurrentUser({
        name: payload.user.username || payload.user.email,
        email: payload.user.email,
        avatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
        role: currentUser?.role || 'HoloGrip 用户',
      });
      login(payload.user.username || payload.user.email);
      setPassword('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法连接到 HoloGrip 服务。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9990] flex items-center justify-center overflow-hidden bg-zinc-950/90 text-white"
        >
          <div className="pointer-events-none absolute left-1/4 top-1/4 h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[150px]" />
          <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[460px] w-[460px] rounded-full bg-indigo-500/20 blur-[150px]" />

          <motion.form
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onSubmit={submit}
            className="relative flex w-[390px] flex-col rounded-3xl border border-white/10 bg-zinc-900/75 p-8 shadow-2xl shadow-black/80 backdrop-blur-2xl"
          >
            <div className="mb-7 flex items-center gap-2 text-xs font-medium tracking-wide text-cyan-300">
              <Lock className="h-4 w-4" />
              {isLocked ? 'HoloGrip 已锁定' : 'HoloGrip Desktop · 安全登录'}
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-lg shadow-cyan-500/20">
                <UserCheck className="h-6 w-6 text-zinc-950" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{isLocked ? currentUser?.name : '欢迎回来'}</h2>
                <p className="mt-1 text-sm text-zinc-400">{isLocked ? '输入密码以继续工作' : '登录你的 HoloGrip 工作空间'}</p>
              </div>
            </div>

            <label className="mb-3 block text-sm text-zinc-300">
              邮箱地址
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>

            <label className="block text-sm text-zinc-300">
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                placeholder="输入密码"
                className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-zinc-950 transition hover:from-cyan-300 hover:to-blue-400 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? '正在连接…' : isLocked ? '解锁桌面' : '进入桌面'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
