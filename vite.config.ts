import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * 多入口配置：
 *  - index.html     → HoloGrip 门户（静态展示页）
 *  - portfolio.html → 作品矩阵
 *  - profile.html   → 关于我们
 *  - holomath.html  → HoloMath 空间几何画板（React）
 *  - physics.html   → HoloPhysics 物理仿真（React）
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.HOLO_TARGET || process.env.HOLO_TARGET || 'all';
  const tauriDevHost = process.env.TAURI_DEV_HOST;
  const entries = {
    portal:    path.resolve(__dirname, 'index.html'),
    portfolio: path.resolve(__dirname, 'portfolio.html'),
    profile:   path.resolve(__dirname, 'profile.html'),
    about:     path.resolve(__dirname, 'about.html'),
    login:     path.resolve(__dirname, 'login.html'),
    dashboard: path.resolve(__dirname, 'dashboard.html'),
    admin:     path.resolve(__dirname, 'admin.html'),
    holomath:  path.resolve(__dirname, 'holomath.html'),
    physics:   path.resolve(__dirname, 'physics.html'),
    hall:      path.resolve(__dirname, 'hall.html'),
  };
  const targetInputs: Record<string, Record<string, string>> = {
    ipad: {
      holomath: entries.holomath,
    },
    all: entries,
  };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.HOLO_TARGET': JSON.stringify(target),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: targetInputs[target] ?? targetInputs.all,
      },
    },
    server: {
      // HMR 在 AI Studio 通过 DISABLE_HMR 关闭，避免代理刷新抖动。
      hmr: tauriDevHost
        ? {
            protocol: 'ws',
            host: tauriDevHost,
            port: 3002,
          }
        : process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          ws: true,
        }
      }
    },
  };
});
