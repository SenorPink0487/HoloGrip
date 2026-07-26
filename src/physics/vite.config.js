import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  server: {
    port: 1420,
    // If 1420 is occupied, Vite automatically tries the next available port.
    strictPort: false,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Ignore Rust crate to avoid unnecessary reloads
      ignored: ['**/src-tauri/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // es2022 for top-level await (boot yields between station builds).
    // Tauri desktops: Chromium 105+ / Safari 15+ both support TLA.
    target: process.env.TAURI_ENV_PLATFORM === 'windows'
      ? 'chrome105'
      : process.env.TAURI_ENV_PLATFORM
        ? 'safari15'
        : 'es2022',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
