/**
 * Resolve the active design for pad boot / session restore.
 * Loads IndexedDB autosave when present; otherwise returns default Starship clone.
 */

import { createDefaultStarshipDesign, normalizeDesign } from './designModel.js';
import { loadDesignLocal } from './storage.js';

/**
 * @param {{ load?: () => Promise<object|null>, createDefault?: () => object }} [deps]
 *   injectable for unit tests
 * @returns {Promise<object>}
 */
export async function resolveBootDesign(deps = {}) {
  const load = deps.load || loadDesignLocal;
  const createDefault = deps.createDefault || createDefaultStarshipDesign;
  try {
    const saved = await load();
    if (saved && typeof saved === 'object') {
      return normalizeDesign(saved);
    }
  } catch {
    /* fall through to default */
  }
  return normalizeDesign(createDefault());
}
