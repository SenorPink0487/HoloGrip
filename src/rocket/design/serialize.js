/**
 * Serialize / deserialize rocket design (craft graph v2, migrates v1).
 * Never executes code from imported files.
 */

import { DESIGN_VERSION } from './partsLibrary.js';
import {
  createDefaultStarshipDesign,
  cloneDesign,
  normalizeDesign,
} from './designModel.js';
import { asCraft, isCraftDocument, migrateV1StagesToCraft } from './craftGraph.js';

const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;
const MAX_TEXTURES = 24;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg']);

/**
 * Serialize design to a versioned JSON string.
 * @param {object} design
 * @returns {string}
 */
export function serializeDesign(design) {
  const d = normalizeDesign(design);
  const payload = {
    format: 'huojian-rocket-design',
    version: DESIGN_VERSION,
    design: {
      ...d,
      version: DESIGN_VERSION,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Deserialize from JSON string or object.
 * @param {string|object} input
 * @returns {{ design: object, warnings: string[] }}
 */
export function deserializeDesign(input) {
  const warnings = [];
  let raw;
  if (typeof input === 'string') {
    if (!input.trim()) {
      throw new Error('空的设计文件');
    }
    try {
      raw = JSON.parse(input);
    } catch {
      throw new Error('损坏的 JSON：无法解析');
    }
  } else if (input && typeof input === 'object') {
    raw = input;
  } else {
    throw new Error('无效的设计输入');
  }

  if (raw === null || Array.isArray(raw)) {
    throw new Error('设计根节点必须是对象');
  }

  let version = raw.version ?? raw.design?.version;
  let designBody = raw.design ?? raw;

  if (raw.format && raw.format !== 'huojian-rocket-design') {
    throw new Error(`未知文件格式: ${raw.format}`);
  }

  if (version == null) {
    if (designBody.parts && typeof designBody.parts === 'object') {
      version = 2;
      warnings.push('缺少版本号，按 v2 零件树处理');
    } else if (designBody.stages || designBody.stageCount) {
      version = 1;
      warnings.push('缺少版本号，按 v1 级段文档处理');
    } else {
      throw new Error('无法识别的设计文档');
    }
  }

  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new Error('无效的版本号');
  }

  if (version > DESIGN_VERSION) {
    throw new Error(`未知的未来版本 ${version}（当前支持 ≤ ${DESIGN_VERSION}）`);
  }

  if (version < 1) {
    throw new Error(`不支持的版本 ${version}`);
  }

  let design = migrateDesign(designBody, version, warnings);
  design.textures = sanitizeTextures(design.textures || {}, warnings);
  design = normalizeDesign(design);

  if (!design.rootId || !design.parts || Object.keys(design.parts).length === 0) {
    throw new Error('设计缺少零件树');
  }

  return { design, warnings };
}

function migrateDesign(body, fromVersion, warnings) {
  let d = cloneDesign(body);

  if (fromVersion < 2) {
    // v1 stage document → craft graph
    if (!isCraftDocument(d) || (Array.isArray(d.stages) && !d.rootId)) {
      d = migrateV1StagesToCraft(d);
      warnings.push(`已从版本 ${fromVersion} 迁移到零件树 v${DESIGN_VERSION}`);
    }
  } else if (fromVersion < DESIGN_VERSION) {
    warnings.push(`已从版本 ${fromVersion} 迁移到 ${DESIGN_VERSION}`);
  }

  d.version = DESIGN_VERSION;
  return asCraft(d);
}

function sanitizeTextures(textures, warnings) {
  const out = {};
  if (!textures || typeof textures !== 'object' || Array.isArray(textures)) {
    return out;
  }
  const keys = Object.keys(textures).slice(0, MAX_TEXTURES);
  if (Object.keys(textures).length > MAX_TEXTURES) {
    warnings.push(`纹理数量超过 ${MAX_TEXTURES}，已截断`);
  }
  for (const key of keys) {
    const t = textures[key];
    if (!t || typeof t !== 'object') continue;
    const mime = String(t.mime || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime) && !String(t.dataUrl || '').startsWith('data:image/')) {
      warnings.push(`跳过非法纹理 ${key}`);
      continue;
    }
    const dataUrl = String(t.dataUrl || '');
    if (dataUrl.length > MAX_TEXTURE_BYTES) {
      warnings.push(`纹理 ${key} 过大，已跳过`);
      continue;
    }
    if (dataUrl && !dataUrl.startsWith('data:image/')) {
      warnings.push(`纹理 ${key} 非 data URL，已跳过`);
      continue;
    }
    out[key] = {
      mime: mime || 'image/png',
      dataUrl,
      width: t.width || 0,
      height: t.height || 0,
    };
  }
  return out;
}

/**
 * @param {File} file
 */
export function validateTextureFile(file) {
  if (!file) return { ok: false, reason: '无文件' };
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, reason: '仅支持 PNG/JPEG/WebP' };
  }
  if (file.size > MAX_TEXTURE_BYTES) {
    return { ok: false, reason: '文件过大' };
  }
  return { ok: true };
}

export function createEmptyDesignFallback() {
  return createDefaultStarshipDesign();
}
