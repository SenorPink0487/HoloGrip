/**
 * Thin wrappers around the Tauri 2 JS API.
 * Safe to import from pure web builds — all calls no-op outside Tauri.
 */

export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** @returns {Promise<{ name: string, version: string, description: string } | null>} */
export async function getAppInfo() {
  if (!isTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('app_info');
}

/**
 * Open a URL in the system browser (desktop only).
 * @param {string} url
 */
export async function openUrl(url) {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { openUrl: open } = await import('@tauri-apps/plugin-opener');
  await open(url);
}
