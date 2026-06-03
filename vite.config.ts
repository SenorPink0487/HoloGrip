import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * 多入口配置：
 *  - index.html  → HoloGrip 门户（静态壳，纯原生 JS+CSS）
 *  - app.html    → React 主体（HoloMath 空间几何画板）
 *
 * Tauri 默认装载 index.html（即门户），点击「启动在线程序」时由 Rust 后端
 * 调 WebviewWindowBuilder 打开新窗口加载 app.html；浏览器调试模式下则走
 * `location.href = 'app.html'` 跳转。
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
          portal: path.resolve(__dirname, 'index.html'),
          app: path.resolve(__dirname, 'app.html'),
          physics: path.resolve(__dirname, 'physics.html'),
        },
      },
    },
    server: {
      // HMR 在 AI Studio 通过 DISABLE_HMR 关闭，避免代理刷新抖动。
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
