import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { deepseekPlugin } from './src/chem/server/deepseekPlugin.js';

/**
 * Multi-page entry HTML files (e.g. pool.html) can collide with a same-named
 * public/ directory (e.g. public/pool/ assets). After Vite copies public → dist,
 * dist/pool/ is a folder without index.html, so nginx returns 403 for /pool/.
 *
 * Copy each colliding entry HTML into that folder as index.html so both
 * /pool.html and /pool/ serve the app, while /pool/sounds/... still works.
 */
function htmlIndexForPublicDirs(names: string[]): Plugin {
  return {
    name: 'html-index-for-public-dirs',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      for (const name of names) {
        const htmlFile = path.join(outDir, `${name}.html`);
        const dir = path.join(outDir, name);
        if (!fs.existsSync(htmlFile) || !fs.existsSync(dir)) continue;
        if (!fs.statSync(dir).isDirectory()) continue;
        fs.copyFileSync(htmlFile, path.join(dir, 'index.html'));
      }
    },
  };
}

/**
 * 多入口配置：
 *  - index.html     → HoloGrip 门户（静态展示页）
 *  - portfolio.html → 作品矩阵
 *  - profile.html   → 关于我们
 *  - launcher.html  → HoloGrip 桌面启动器（React）
 *  - holomath.html  → HoloMath 空间几何画板（React）
 *  - physics.html   → HoloPhysics 三维物理实验室（Three.js）
 *  - chem.html      → HoloChem 3D 分子结构观象台（3Dmol + PubChem）
 *  - rocket.html    → HoloRocket 火箭发射仿真（Three.js）
 *  - pool.html      → HoloPool 三维台球室（Three.js + cannon-es）
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
    launcher:  path.resolve(__dirname, 'launcher.html'),
    holomath:  path.resolve(__dirname, 'holomath.html'),
    physics:   path.resolve(__dirname, 'physics.html'),
    chem:      path.resolve(__dirname, 'chem.html'),
    rocket:    path.resolve(__dirname, 'rocket.html'),
    pool:      path.resolve(__dirname, 'pool.html'),
  };
  const targetInputs: Record<string, Record<string, string>> = {
    ipad: {
      launcher: entries.launcher,
      holomath: entries.holomath,
    },
    all: entries,
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      htmlIndexForPublicDirs(['pool']),
      // HoloChem: 自然语言 → 分子成分（密钥仅在 dev/preview 服务端）
      deepseekPlugin({
        apiKey: env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
        model: env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      }),
    ],
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
      // HoloPhysics boot uses top-level await (station cooperative load).
      // Aligns with standalone wuli vite target (es2022 / chrome105+).
      target: 'es2022',
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
