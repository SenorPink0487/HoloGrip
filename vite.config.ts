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
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          portal:    path.resolve(__dirname, 'index.html'),
          portfolio: path.resolve(__dirname, 'portfolio.html'),
          profile:   path.resolve(__dirname, 'profile.html'),
          about:     path.resolve(__dirname, 'about.html'),
          holomath:  path.resolve(__dirname, 'holomath.html'),
          physics:   path.resolve(__dirname, 'physics.html'),
        },
      },
    },
    server: {
      // HMR 在 AI Studio 通过 DISABLE_HMR 关闭，避免代理刷新抖动。
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
