import { create } from 'zustand';
import type { UserProfile } from './types';

export interface SessionState {
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  currentUser: UserProfile | null;
  isLoggedIn: boolean;
  isLocked: boolean;
  isSplashActive: boolean;
  setCurrentUser: (user: UserProfile | null) => void;
  login: (username?: string) => void;
  logout: () => void;
  lockScreen: () => void;
  unlockScreen: () => void;
  dismissSplash: () => void;
}

const getInitialUser = (): UserProfile | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('hg_user');
    if (raw) {
      const user = JSON.parse(raw);
      return {
        name: user.username || user.name || user.email || 'Holo Explorer',
        avatar: user.avatar || '',
        role: user.role || 'HoloGrip 用户',
        email: user.email || '',
      };
    }
  } catch {}
  return null;
};

export const useSessionStore = create<SessionState>((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  currentUser: getInitialUser(),
  isLoggedIn: typeof window !== 'undefined' ? Boolean(localStorage.getItem('hg_token')) : false,
  isLocked: false,
  isSplashActive: true,
  setCurrentUser: (user) => set({ currentUser: user }),
  login: (username) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hologrip_logged_in', 'true');
    }
    set((state) => ({
      isLoggedIn: true,
      isLocked: false,
      currentUser: state.currentUser ? { ...state.currentUser, name: username || state.currentUser.name } : {
        name: username || 'Holo Explorer',
        avatar: '',
        role: 'HoloGrip 用户',
        email: '',
      },
    }));
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hologrip_logged_in', 'false');
      localStorage.removeItem('hg_token');
      localStorage.removeItem('hg_user');
    }
    set({ isLoggedIn: false, isLocked: false, currentUser: null });
  },
  lockScreen: () => set({ isLocked: true }),
  unlockScreen: () => set({ isLocked: false }),
  dismissSplash: () => set({ isSplashActive: false }),
}));
