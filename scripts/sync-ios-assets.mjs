import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'dist');
const iosAssetsDir = resolve(root, 'src-tauri/gen/apple/assets');

if (!existsSync(iosAssetsDir)) {
  process.exit(0);
}

if (!existsSync(distDir)) {
  throw new Error(`Missing build output: ${distDir}`);
}

rmSync(iosAssetsDir, { recursive: true, force: true });
mkdirSync(iosAssetsDir, { recursive: true });
cpSync(distDir, iosAssetsDir, { recursive: true });

console.log(`Synced iOS web assets to ${iosAssetsDir}`);
