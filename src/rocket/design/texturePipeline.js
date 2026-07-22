/**
 * Texture upload validation, compress to max edge 2048, UV helpers.
 * Browser-oriented; Node tests can exercise pure helpers + validation.
 */

import { validateTextureFile } from './serialize.js';
import { createPartId } from './partsLibrary.js';

export const MAX_TEXTURE_EDGE = 2048;

/**
 * Apply UV params onto a THREE texture (mutates).
 * @param {import('three').Texture} texture
 * @param {{ scale?: number, offsetX?: number, offsetY?: number, rotation?: number, repeatX?: number, repeatY?: number, tile?: boolean }} uv
 */
export function applyUvToTexture(texture, uv = {}) {
  if (!texture) return texture;
  const scale = uv.scale ?? 1;
  const rx = (uv.repeatX ?? 1) * scale;
  const ry = (uv.repeatY ?? 1) * scale;
  texture.repeat.set(rx, ry);
  texture.offset.set(uv.offsetX ?? 0, uv.offsetY ?? 0);
  texture.rotation = ((uv.rotation ?? 0) * Math.PI) / 180;
  texture.center.set(0.5, 0.5);
  if (texture.wrapS !== undefined) {
    // THREE.RepeatWrapping = 1000, ClampToEdge = 1001
    const wrap = uv.tile === false ? 1001 : 1000;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * Crop region in normalized 0–1 coords → canvas draw params.
 * @param {{ x: number, y: number, w: number, h: number }} crop normalized
 * @param {number} imgW
 * @param {number} imgH
 */
export function cropRectFromNormalized(crop, imgW, imgH) {
  const x = clamp01(crop?.x ?? 0) * imgW;
  const y = clamp01(crop?.y ?? 0) * imgH;
  const w = Math.max(1, clamp01(crop?.w ?? 1) * imgW);
  const h = Math.max(1, clamp01(crop?.h ?? 1) * imgH);
  return {
    sx: Math.min(x, imgW - 1),
    sy: Math.min(y, imgH - 1),
    sw: Math.min(w, imgW - x),
    sh: Math.min(h, imgH - y),
  };
}

function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}

/**
 * Compute target size with longest edge ≤ maxEdge.
 */
export function fitMaxEdge(width, height, maxEdge = MAX_TEXTURE_EDGE) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h, scale: 1 };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/**
 * Process a File/Blob into a texture asset (Data URL, compressed).
 * Requires browser canvas APIs.
 * @param {File|Blob} file
 * @param {{ crop?: object, maxEdge?: number }} [opts]
 * @returns {Promise<{ id: string, mime: string, dataUrl: string, width: number, height: number }>}
 */
export async function processTextureUpload(file, opts = {}) {
  const check = validateTextureFile(file);
  if (!check.ok) {
    throw new Error(check.error || '无效图片');
  }
  const maxEdge = opts.maxEdge ?? MAX_TEXTURE_EDGE;

  const bitmap = await loadImageBitmap(file);
  try {
    const crop = opts.crop
      ? cropRectFromNormalized(opts.crop, bitmap.width, bitmap.height)
      : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };

    const fitted = fitMaxEdge(crop.sw, crop.sh, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    ctx.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      fitted.width,
      fitted.height
    );

    const mime =
      (file.type || '').toLowerCase().includes('png')
        ? 'image/png'
        : (file.type || '').toLowerCase().includes('webp')
          ? 'image/webp'
          : 'image/jpeg';
    const quality = mime === 'image/jpeg' || mime === 'image/webp' ? 0.85 : undefined;
    const dataUrl = canvas.toDataURL(mime, quality);

    return {
      id: createPartId('tex'),
      mime,
      dataUrl,
      width: fitted.width,
      height: fitted.height,
    };
  } finally {
    bitmap.close?.();
  }
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Fallback via HTMLImageElement
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片加载失败'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Create a THREE.Texture from a design texture asset (browser).
 * Caller owns disposal.
 */
export function createThreeTextureFromAsset(THREE, asset, uv) {
  if (!asset?.dataUrl) return null;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(asset.dataUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  applyUvToTexture(tex, uv);
  return tex;
}
