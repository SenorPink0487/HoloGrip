/**
 * 反代模式下的 token 生命周期管理。
 *
 * ── 设计 ─────────────────────────────────────────────────────────
 * 1. 首次调用 `getToken()` 时向 `/api/auth/issue` 申请,缓存到 localStorage。
 * 2. 后续调用走缓存,直到:
 *    - 过期(用 issue 时返回的 expires_in + 本地 issued_at 估算,留 30s 余量)
 *    - 调用方主动 invalidate(收到 401 时)
 * 3. 多个并发 caller 同时拿 token 时,共享同一个 in-flight Promise,
 *    避免连发导致服务端反复签发。
 *
 * ── 注意 ─────────────────────────────────────────────────────────
 * 这套机制只在反代模式下需要;直连模式(VITE_GEMINI_BASE_URL 是绝对地址)
 * 仍然走 API key,跳过本模块。
 */

import { apiUrl } from './apiOrigin';

const LS_KEY = 'hologrip.proxyToken.v1';
// 服务端默认 1 小时过期,我们提前 30 秒作废,留出网络抖动余量
const EXPIRY_BUFFER_SEC = 30;

interface CachedToken {
  token: string;
  expiresAt: number; // epoch seconds
}

interface IssueResponse {
  token: string;
  expires_in: number;
  quota: number;
}

let inflight: Promise<string> | null = null;

/**
 * 取一个可用 token。已缓存且未过期时直接返回,否则向后端申请。
 * 同时只发出一个 issue 请求(并发 caller 共享 Promise)。
 */
export async function getProxyToken(force = false): Promise<string> {
  if (!force) {
    const cached = readCache();
    if (cached && cached.expiresAt > nowSec() + EXPIRY_BUFFER_SEC) {
      return cached.token;
    }
  }
  if (!inflight) {
    inflight = issueNew()
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** 主动作废本地 token(收到 401 时调用) */
export function invalidateProxyToken(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // localStorage 不可用时静默忽略
  }
}

async function issueNew(): Promise<string> {
  const resp = await fetch(apiUrl('/api/auth/issue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    throw new Error(`签发 token 失败: HTTP ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  const data = (await resp.json()) as IssueResponse;
  if (!data?.token) {
    throw new Error('签发响应缺少 token 字段');
  }
  const cached: CachedToken = {
    token: data.token,
    expiresAt: nowSec() + (data.expires_in || 0),
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cached));
  } catch {
    // 隐私模式 localStorage 不可写,只在内存暂存(由调用方持有 Promise)
  }
  return data.token;
}

function readCache(): CachedToken | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as CachedToken;
    if (typeof obj?.token === 'string' && typeof obj?.expiresAt === 'number') {
      return obj;
    }
  } catch {
    // 读到坏数据就当无缓存
  }
  return null;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
