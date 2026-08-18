import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Sparkles, UserRound } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { apiUrl } from '../../lib/apiOrigin';

export function LoginModal() {
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn);
  const currentUser = useSessionStore((state) => state.currentUser);
  const login = useSessionStore((state) => state.login);
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const logout = useSessionStore((state) => state.logout);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const visible = !isLoggedIn;

  // 初始化时使用 real token 校验 /api/user/me
  useEffect(() => {
    const token = localStorage.getItem('hg_token');
    if (!token) return;

    fetch(apiUrl('/api/user/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Session expired');
        return res.json();
      })
      .then((user) => {
        if (user && user.email) {
          localStorage.setItem('hg_user', JSON.stringify(user));
          setCurrentUser({
            name: user.username || user.email,
            email: user.email,
            avatar: '',
            role: 'HoloGrip 用户',
          });
          login(user.username || user.email);
        }
      })
      .catch(() => {
        localStorage.removeItem('hg_token');
        localStorage.removeItem('hg_user');
        logout();
      });
  }, []);

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setShakeKey((prev) => prev + 1);
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim() || !password) {
      triggerError('请输入邮箱和密码');
      return;
    }
    if (isRegisterMode && !username.trim()) {
      triggerError('请输入用户名');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const endpoint = isRegisterMode ? '/api/user/register' : '/api/user/login';
      const body = isRegisterMode
        ? { username: username.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || (!payload?.token && !payload?.user)) {
        throw new Error(
          payload?.error ||
            payload?.message ||
            (isRegisterMode ? '注册失败，请稍后重试。' : '邮箱或密码错误，请检查后重试。')
        );
      }

      let user = payload.user;
      let token = payload.token;

      if (isRegisterMode && !token) {
        const loginRes = await fetch(apiUrl('/api/user/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const loginData = await loginRes.json();
        if (loginRes.ok && loginData.token) {
          token = loginData.token;
          user = loginData.user;
        }
      }

      if (token) localStorage.setItem('hg_token', token);
      if (user) localStorage.setItem('hg_user', JSON.stringify(user));

      setCurrentUser({
        name: user?.username || username || email,
        email: user?.email || email,
        avatar: '',
        role: 'HoloGrip 用户',
      });
      login(user?.username || username || email);
      setPassword('');
      setIsRegisterMode(false);
    } catch (error) {
      triggerError(error instanceof Error ? error.message : '无法连接到 HoloGrip 认证服务。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestEntry = () => {
    login('访客用户');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed inset-0 z-[9990] flex items-center justify-center p-4 overflow-hidden bg-black/60 backdrop-blur-2xl text-white select-none"
        >
          <motion.div
            key={`shake-${shakeKey}`}
            animate={shakeKey > 0 ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
            transition={{ duration: 0.38, ease: 'easeInOut' }}
          >
            {/* Apple Pure Frosted Glass Modal */}
            <form
              onSubmit={submit}
              className="relative flex w-[360px] flex-col rounded-[26px] p-7 bg-[#202024]/75 dark:bg-[#161618]/80 backdrop-blur-3xl border border-white/[0.14] border-t-white/[0.28] shadow-[0_28px_60px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.25)] transition-[height] duration-200"
            >
              {/* Header: Apple Frosted Avatar Disk */}
              <div className="flex flex-col items-center text-center mb-5">
                <div
                  className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.1] border border-white/[0.2] border-t-white/[0.35] shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.4)] backdrop-blur-xl"
                >
                  <AnimatePresence mode="wait">
                    {isRegisterMode ? (
                      <motion.div
                        key="sparkles"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Sparkles className="h-6 w-6 text-white" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="user"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <UserRound className="h-6 w-6 text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-white">
                  {isRegisterMode ? '创建 HoloGrip 账户' : '登录你的工作空间'}
                </h2>
                <p className="mt-0.5 text-xs text-white/50 font-normal">
                  {isRegisterMode ? '接入空间协作与多端云同步' : '使用云端凭证访问个性化空间'}
                </p>
              </div>

              {/* Apple Segmented Control */}
              <div className="mb-4 flex rounded-xl bg-black/30 p-1 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(false);
                    setErrorMessage('');
                  }}
                  className={`relative flex-1 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    !isRegisterMode ? 'text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {!isRegisterMode && (
                    <motion.div
                      layoutId="apple-seg-tab"
                      transition={{ type: 'spring', damping: 28, stiffness: 400 }}
                      className="absolute inset-0 rounded-lg bg-white/[0.18] border border-white/[0.15] border-t-white/[0.25] shadow-sm"
                    />
                  )}
                  <span className="relative z-10">登录</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(true);
                    setErrorMessage('');
                  }}
                  className={`relative flex-1 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    isRegisterMode ? 'text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {isRegisterMode && (
                    <motion.div
                      layoutId="apple-seg-tab"
                      transition={{ type: 'spring', damping: 28, stiffness: 400 }}
                      className="absolute inset-0 rounded-lg bg-white/[0.18] border border-white/[0.15] border-t-white/[0.25] shadow-sm"
                    />
                  )}
                  <span className="relative z-10">注册账号</span>
                </button>
              </div>

              {/* Input Fields */}
              <div className="flex flex-col gap-2.5">
                <AnimatePresence initial={false}>
                  {isRegisterMode && (
                    <motion.div
                      key="register-username"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        height: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
                        opacity: { duration: 0.18, ease: 'easeOut' },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="group relative flex items-center rounded-xl bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.12] border border-white/[0.1] focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10 transition-colors duration-150">
                        <User className="absolute left-3.5 h-4 w-4 text-white/40 group-focus-within:text-white/80 transition-colors duration-150 pointer-events-none" />
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="用户名"
                          className="w-full bg-transparent py-2.5 pl-10 pr-3.5 text-[13px] text-white placeholder-white/30 outline-none font-normal"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="group relative flex items-center rounded-xl bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.12] border border-white/[0.1] focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10 transition-colors duration-150">
                  <Mail className="absolute left-3.5 h-4 w-4 text-white/40 group-focus-within:text-white/80 transition-colors duration-150 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="邮箱地址"
                    className="w-full bg-transparent py-2.5 pl-10 pr-3.5 text-[13px] text-white placeholder-white/30 outline-none font-normal"
                  />
                </div>

                <div className="group relative flex items-center rounded-xl bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.12] border border-white/[0.1] focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10 transition-colors duration-150">
                  <Lock className="absolute left-3.5 h-4 w-4 text-white/40 group-focus-within:text-white/80 transition-colors duration-150 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="密码"
                    className="w-full bg-transparent py-2.5 pl-10 pr-10 text-[13px] text-white placeholder-white/30 outline-none font-normal"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 p-1 text-white/40 hover:text-white/80 active:scale-90 transition-transform duration-100 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/25 px-3 py-2 text-[12px] text-red-300"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Primary Action Button: Apple High-Contrast Solid White */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="mt-5 relative flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-zinc-100 active:bg-zinc-200 py-2.5 text-[13px] font-semibold text-zinc-950 shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-950" />
                    <span>正在验证…</span>
                  </>
                ) : (
                  <>
                    <span>{isRegisterMode ? '立即注册' : '登录并进入桌面'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </motion.button>

              {/* Secondary Option: Guest / Offline Mode */}
              <div className="mt-3.5 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleGuestEntry}
                  className="text-[12px] text-white/40 hover:text-white/80 active:scale-95 transition-all duration-150 cursor-pointer"
                >
                  暂不登录，以访客身份进入 →
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

