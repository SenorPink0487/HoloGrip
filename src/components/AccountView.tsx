import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useARStore } from '../store';
import { apiUrl } from '../lib/apiOrigin';
import { 
  User, 
  LogOut, 
  Save, 
  Lock,
  ArrowLeft,
  Users,
  Plus,
  Copy,
  GraduationCap,
  Building2,
  KeyRound,
  Mail,
  X,
  BookOpen,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface ClassItem {
  id: number;
  name: string;
  description: string;
  teacher_id?: number;
  teacher_name: string;
  invite_code: string;
}

export function AccountView() {
  const currentUser = useARStore(state => state.currentUser);
  const setCurrentUser = useARStore(state => state.setCurrentUser);
  const logout = useARStore(state => state.logout);
  const lockScreen = useARStore(state => state.lockScreen);
  const setActiveTab = useARStore(state => state.setActiveTab);

  const [activeMenu, setActiveMenu] = useState<'class' | 'settings'>('class');

  // Form states for settings (referenced from dashboard.html)
  const [usernameInput, setUsernameInput] = useState(currentUser?.name || '');
  const [emailInput, setEmailInput] = useState(currentUser?.email || '');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordCode, setPasswordCode] = useState('');
  const [codeSending, setCodeSending] = useState(false);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'info' | 'error' | 'success';
  }>({ isOpen: false, title: '', message: '' });

  // Modals for creating and joining classes
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Classes list loaded from /api/class/list
  const [teachingList, setTeachingList] = useState<ClassItem[]>([]);
  const [joinedList, setJoinedList] = useState<ClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const showAlert = (title: string, message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  };

  const requestApi = async (path: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('hg_token');
    if (!token) {
      throw new Error('未登录，请先登录');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(apiUrl(path), { ...options, headers });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      throw new Error(`服务器响应异常 (${res.status})`);
    }

    if (!res.ok || json.status === 'error' || json.error) {
      throw new Error(json.message || json.error || `请求失败 (${res.status})`);
    }
    return json;
  };

  // 1. 获取用户信息与班级列表
  const loadUserDataAndClasses = async () => {
    setLoadingClasses(true);
    try {
      const userJson = await requestApi('/api/user/me', { method: 'GET' });
      if (userJson && userJson.username) {
        setUsernameInput(userJson.username);
        setEmailInput(userJson.email || '');
        setCurrentUser({
          name: userJson.username,
          email: userJson.email || '',
          avatar: '',
          role: 'HoloGrip 用户',
        });
      }
    } catch {
      // 忽略未校验异常
    }

    try {
      const classJson = await requestApi('/api/class/list', { method: 'GET' });
      if (classJson && classJson.data) {
        setTeachingList(classJson.data.teaching || []);
        setJoinedList(classJson.data.joined || []);
      }
    } catch (err: any) {
      console.warn('获取班级列表报错:', err?.message);
    } finally {
      setLoadingClasses(false);
    }
  };

  useEffect(() => {
    loadUserDataAndClasses();
  }, []);

  // 2. 发送邮箱验证码 (dashboard.html 对应逻辑)
  const handleSendPasswordCode = async () => {
    setCodeSending(true);
    try {
      await requestApi('/api/user/password/code', { method: 'POST' });
      showAlert('验证码已发送', '验证码已发送至您的电子邮箱，请在 10 分钟内完成修改。', 'success');
    } catch (err: any) {
      showAlert('发送失败', err.message || '验证码发送失败，请稍后重试', 'error');
    } finally {
      setCodeSending(false);
    }
  };

  // 3. 修改密码 (dashboard.html 对应逻辑)
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword || !passwordCode.trim()) {
      showAlert('提示', '请填写当前密码、新密码、确认密码和邮箱验证码。', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('提示', '新密码长度至少需要 6 位。', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('提示', '两次输入的确认密码不一致。', 'error');
      return;
    }
    if (!/^\d{6}$/.test(passwordCode.trim())) {
      showAlert('提示', '请输入 6 位数字邮箱验证码。', 'error');
      return;
    }

    try {
      await requestApi('/api/user/password/change', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          code: passwordCode.trim(),
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordCode('');
      showAlert('修改成功', '密码已更正，下次登录请使用新密码。', 'success');
    } catch (err: any) {
      showAlert('修改失败', err.message || '密码修改失败，请稍后重试', 'error');
    }
  };

  // 4. 修改用户名 / 基本信息
  const handleSaveProfile = async () => {
    if (!usernameInput.trim()) {
      showAlert('提示', '用户名不能为空', 'error');
      return;
    }
    try {
      await requestApi('/api/user/profile/update', {
        method: 'POST',
        body: JSON.stringify({ username: usernameInput.trim() }),
      });
      setCurrentUser({
        name: usernameInput.trim(),
        email: emailInput,
        avatar: '',
        role: 'HoloGrip 用户',
      });
      showAlert('保存成功', '个人用户名信息已更新', 'success');
    } catch {
      // 容错: 更新本地 store
      setCurrentUser({
        name: usernameInput.trim(),
        email: emailInput,
        avatar: '',
        role: 'HoloGrip 用户',
      });
      showAlert('保存成功', '个人用户名信息已存入本地', 'success');
    }
  };

  // 5. 创建班级 (dashboard.html 对应逻辑)
  const handleCreateClass = async () => {
    if (!createName.trim()) {
      showAlert('提示', '请输入班级名称', 'error');
      return;
    }
    try {
      await requestApi('/api/class/create', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || '无班级描述',
        }),
      });
      setShowCreateClassModal(false);
      setCreateName('');
      setCreateDesc('');
      showAlert('创建成功', '新班级创建完成！', 'success');
      loadUserDataAndClasses();
    } catch (err: any) {
      showAlert('创建失败', err.message || '网络错误，无法创建班级', 'error');
    }
  };

  // 6. 加入班级 (dashboard.html 对应逻辑)
  const handleJoinClass = async () => {
    if (!joinCode.trim()) {
      showAlert('提示', '请输入班级邀请码', 'error');
      return;
    }
    try {
      await requestApi('/api/class/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      setShowJoinClassModal(false);
      setJoinCode('');
      showAlert('加入成功', '您已成功加入该班级！', 'success');
      loadUserDataAndClasses();
    } catch (err: any) {
      showAlert('加入失败', err.message || '邀请码无效或已加入该班级', 'error');
    }
  };

  const handleCopyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showAlert('已复制', `班级邀请码 [${code}] 已复制到剪贴板`, 'success');
  };

  return (
    <div className="w-full h-full bg-[#f8fafc] text-slate-800 flex flex-col overflow-y-auto selection:bg-cyan-500/20">
      {/* Soft Light Background Accent */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-cyan-100/50 via-slate-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      <div className="relative z-10 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6 pb-28">
        
        {/* Top Navbar */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 border border-white/20">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">个人中心</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('whiteboard')}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-2 border border-slate-200"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-600" />
              返回数学白板
            </button>

            <button
              onClick={() => {
                logout();
                lockScreen();
              }}
              className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-2 border border-rose-200"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Left Sidebar */}
          <div className="flex flex-col gap-6 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-md border-4 border-white">
                {usernameInput ? usernameInput.charAt(0).toUpperCase() : 'H'}
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">{usernameInput || '未知用户'}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{emailInput || '无邮箱信息'}</p>
              </div>
            </div>

            <div className="h-px w-full bg-slate-100" />

            {/* Menu Items (matching dashboard.html IDs) */}
            <div className="flex flex-col gap-2 text-left">
              <button
                onClick={() => setActiveMenu('class')}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer",
                  activeMenu === 'class'
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Users className="w-4 h-4" />
                <span>班级管理 (Classes)</span>
              </button>

              <button
                onClick={() => setActiveMenu('settings')}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer",
                  activeMenu === 'settings'
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <User className="w-4 h-4" />
                <span>账户设置 (Settings)</span>
              </button>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="md:col-span-3 flex flex-col gap-6">
            
            {/* View: Class Management */}
            {activeMenu === 'class' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Class Management</h2>
                    <p className="text-xs text-slate-500 mt-1">创建您教学的班级或使用 6 位邀请码加入班级。</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreateClassModal(true)}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      创建班级
                    </button>

                    <button
                      onClick={() => setShowJoinClassModal(true)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Building2 className="w-4 h-4 text-cyan-600" />
                      加入班级
                    </button>
                  </div>
                </div>

                {/* Section: Teaching List */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 px-1">
                    <GraduationCap className="w-4 h-4 text-cyan-600" />
                    我教的课 (Teaching)
                  </h3>

                  {teachingList.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-white border border-slate-200 text-xs text-slate-400 text-center">
                      暂无创办的班级，点击右上角「创建班级」开始教学
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {teachingList.map(item => (
                        <div key={item.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">{item.name}</span>
                              <span className="text-[11px] text-slate-400">教师: {item.teacher_name}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{item.description || '无班级描述'}</p>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-mono text-cyan-700 font-semibold bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 flex items-center gap-1">
                              邀请码: {item.invite_code}
                              <button onClick={() => handleCopyInviteCode(item.invite_code)} className="p-0.5 hover:text-cyan-900">
                                <Copy className="w-3 h-3" />
                              </button>
                            </span>
                            <button onClick={() => setActiveTab('whiteboard')} className="text-cyan-600 hover:underline font-semibold">
                              进入课件 →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section: Joined List */}
                <div className="flex flex-col gap-3 mt-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 px-1">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    我听的课 (Joined)
                  </h3>

                  {joinedList.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-white border border-slate-200 text-xs text-slate-400 text-center">
                      暂无加入的班级，点击右上角「加入班级」输入邀请码
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {joinedList.map(item => (
                        <div key={item.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">{item.name}</span>
                              <span className="text-[11px] text-slate-400">主讲: {item.teacher_name}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{item.description || '无班级描述'}</p>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <span>已加入该研讨组</span>
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 已连接
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* View: Settings (referenced from dashboard.html) */}
            {activeMenu === 'settings' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 rounded-3xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm flex flex-col gap-8"
              >
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">账户设置 (Settings)</h2>
                  <p className="text-xs text-slate-500 mt-1">管理个人基本资料与账户安全凭证。</p>
                </div>

                {/* Section 1: 基本信息 */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <User className="w-4 h-4 text-cyan-600" />
                    基本信息
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">用户名</label>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={e => setUsernameInput(e.target.value)}
                        className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">邮箱地址 (只读)</label>
                      <input
                        type="email"
                        value={emailInput}
                        disabled
                        className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveProfile}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      保存基本信息
                    </button>
                  </div>
                </div>

                {/* Section 2: 安全与密码 */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Lock className="w-4 h-4 text-cyan-600" />
                    安全与密码
                  </h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">当前密码</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="请输入原密码"
                        className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600">新密码</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="至少 6 位新密码"
                          className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600">确认新密码</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="再次输入新密码"
                          className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                      <div className="flex-1 flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-semibold text-slate-600">邮箱验证码</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={passwordCode}
                          onChange={e => setPasswordCode(e.target.value)}
                          placeholder="6 位数字验证码"
                          className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm tracking-wider font-mono focus:outline-none focus:border-cyan-600 focus:bg-white transition-all"
                        />
                      </div>

                      <button
                        onClick={handleSendPasswordCode}
                        disabled={codeSending}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
                      >
                        {codeSending ? '发送中...' : '获取验证码'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      onClick={() => {
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordCode('');
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-all cursor-pointer active:scale-95"
                    >
                      取消更改
                    </button>

                    <button
                      onClick={handleChangePassword}
                      className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      修改密码
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* Modal Dialog */}
      <AnimatePresence>
        {modalState.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-[360px] p-6 rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col gap-4 text-slate-800"
            >
              <div className="flex items-center gap-2">
                {modalState.type === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                )}
                <h3 className="text-base font-bold text-slate-900">{modalState.title}</h3>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{modalState.message}</p>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setModalState({ isOpen: false, title: '', message: '' })}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Create Class */}
      <AnimatePresence>
        {showCreateClassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-[380px] p-6 rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col gap-4 text-slate-800"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">创建班级</h3>
                <button onClick={() => setShowCreateClassModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">班级名称</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder="如: 高一 (1) 班"
                    className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-cyan-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">班级描述</label>
                  <input
                    type="text"
                    value={createDesc}
                    onChange={e => setCreateDesc(e.target.value)}
                    placeholder="如: 空间几何立体课件"
                    className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-cyan-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateClassModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateClass}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold shadow-sm"
                >
                  创建
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Join Class */}
      <AnimatePresence>
        {showJoinClassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-[360px] p-6 rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col gap-4 text-slate-800"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">加入班级</h3>
                <button onClick={() => setShowJoinClassModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">班级邀请码</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="如: ABC123"
                  className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:border-cyan-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowJoinClassModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold"
                >
                  取消
                </button>
                <button
                  onClick={handleJoinClass}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold shadow-sm"
                >
                  加入
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
