import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!['desktop', 'ipad'].includes(target)) {
  console.error('Usage: node scripts/build-target.mjs <desktop|ipad>');
  process.exit(1);
}

if (target === 'ipad') {
  // Tauri stages frontendDist into this generated directory and does not
  // remove files left by an earlier full/desktop build. Clear that staging
  // area so excluded web sections cannot leak into the iPad app bundle.
  rmSync(resolve('src-tauri/gen/apple/assets'), { recursive: true, force: true });
}

const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOLO_TARGET: target,
    ...(target === 'ipad'
      ? {
          // iPad 与网页生产环境共用 hologrip.cn 的 API 反代；允许调用方显式覆盖，
          // 但默认值必须保证直接执行 npm run build:ipad 也不会落到上游直连。
          VITE_API_ORIGIN: process.env.VITE_API_ORIGIN || 'https://hologrip.cn',
          VITE_GEMINI_BASE_URL: process.env.VITE_GEMINI_BASE_URL || '/api/gemini',
        }
      : {}),
  },
});

if (result.error) console.error(result.error);

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

if (target === 'ipad') {
  const distDir = resolve('dist');
  const requiredEntries = ['whiteboard.html', 'holomath.html', 'physics.html'];
  const forbiddenEntries = [
    'index.html',
    'chem.html',
    'rocket.html',
    'pool.html',
    'pool',
    'design-ui',
    'sounds',
    'textures',
  ];
  const missing = requiredEntries.filter((entry) => !existsSync(resolve(distDir, entry)));
  const forbidden = forbiddenEntries.filter((entry) => existsSync(resolve(distDir, entry)));

  if (missing.length || forbidden.length) {
    if (missing.length) console.error(`[build:ipad] missing required entries: ${missing.join(', ')}`);
    if (forbidden.length) console.error(`[build:ipad] forbidden content found: ${forbidden.join(', ')}`);
    process.exit(1);
  }

  // Keep Tauri's generated iOS resource staging directory in lockstep with
  // the verified dist output. This prevents stale full-site assets from a
  // previous desktop/dev build from leaking into the iPad app.
  const tauriAssetsDir = resolve('src-tauri/gen/apple/assets');
  rmSync(tauriAssetsDir, { recursive: true, force: true });
  cpSync(distDir, tauriAssetsDir, { recursive: true });

  console.log('[build:ipad] verified: whiteboard + math + physics/chem only');
}

process.exit(0);
