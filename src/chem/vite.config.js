import { defineConfig, loadEnv } from 'vite'
import { deepseekPlugin } from './server/deepseekPlugin.js'

const host = process.env.TAURI_DEV_HOST
const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      // 纯 Web 开发时由 Vite 中间件代理 DeepSeek；Tauri 桌面端走 Rust 命令
      deepseekPlugin({
        apiKey: env.DEEPSEEK_API_KEY || '',
        model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      }),
    ],
    // 避免 Vite 清屏盖住 Rust 编译错误
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      host: host || false,
      // 桌面端由 Tauri 开窗口，不必再弹浏览器
      open: !isTauri,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    preview: {
      port: 4173,
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      // Tauri 使用 Chromium / WebKit，Web 保留 esnext
      target: isTauri
        ? process.env.TAURI_ENV_PLATFORM === 'windows' ||
          process.env.TAURI_ENV_PLATFORM === 'linux'
          ? 'chrome105'
          : 'safari13'
        : 'esnext',
      minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  }
})
