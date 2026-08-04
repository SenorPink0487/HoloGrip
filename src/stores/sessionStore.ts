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

const defaultUser: UserProfile = {
  name: 'Holo Explorer',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
  role: '首席科学家 / 实验室研究员',
  email: 'scientist@hologrip.com',
};

export const useSessionStore = create<SessionState>((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  currentUser: defaultUser,
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
        ...defaultUser,
        name: username || defaultUser.name,
      },
    }));
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hologrip_logged_in', 'false');
    }
    set({ isLoggedIn: false, isLocked: false });
  },
  lockScreen: () => set({ isLocked: true }),
  unlockScreen: () => set({ isLocked: false }),
  dismissSplash: () => set({ isSplashActive: false }),
}));
