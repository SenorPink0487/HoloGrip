import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!['desktop', 'ipad'].includes(target)) {
  console.error('Usage: node scripts/build-target.mjs <desktop|ipad>');
  process.exit(1);
}

const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, HOLO_TARGET: target },
});

if (result.error) console.error(result.error);

process.exit(result.status ?? 1);
