/**
 * IndexedDB autosave for designs + textures.
 * Falls back to in-memory when IDB is unavailable (Node/tests).
 */

const DB_NAME = 'huojian-rocket-design';
const DB_VERSION = 1;
const STORE = 'designs';
const KEY_CURRENT = 'current';

/** @type {Map<string, object>} */
const memoryFallback = new Map();

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Save design under key (default: current autosave).
 * @param {object} design
 * @param {string} [key]
 */
export async function saveDesignLocal(design, key = KEY_CURRENT) {
  const payload = {
    savedAt: Date.now(),
    design,
  };
  memoryFallback.set(key, payload);
  try {
    const db = await openDb();
    if (!db) return { ok: true, backend: 'memory' };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(payload, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close?.();
    return { ok: true, backend: 'indexeddb' };
  } catch (err) {
    return { ok: true, backend: 'memory', error: String(err?.message || err) };
  }
}

/**
 * Load design by key.
 * @param {string} [key]
 * @returns {Promise<object|null>}
 */
export async function loadDesignLocal(key = KEY_CURRENT) {
  try {
    const db = await openDb();
    if (!db) {
      return memoryFallback.get(key)?.design ?? null;
    }
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close?.();
    if (row?.design) {
      memoryFallback.set(key, row);
      return row.design;
    }
    return memoryFallback.get(key)?.design ?? null;
  } catch {
    return memoryFallback.get(key)?.design ?? null;
  }
}

/**
 * Clear saved design.
 */
export async function clearDesignLocal(key = KEY_CURRENT) {
  memoryFallback.delete(key);
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close?.();
  } catch {
    /* ignore */
  }
}

/** Test helper: direct memory put */
export function __memoryPut(key, design) {
  memoryFallback.set(key, { savedAt: Date.now(), design });
}

export function __memoryGet(key) {
  return memoryFallback.get(key)?.design ?? null;
}

export function __memoryClear() {
  memoryFallback.clear();
}
