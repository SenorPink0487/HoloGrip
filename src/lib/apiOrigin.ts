/** Resolves API URLs for both website and packaged Tauri application builds. */
const DESKTOP_API_ORIGIN = 'https://hologrip.cn';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return isTauriRuntime() ? `${DESKTOP_API_ORIGIN}${path}` : path;
}

export function apiWebSocketUrl(path: string): string {
  const url = new URL(apiUrl(path), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
