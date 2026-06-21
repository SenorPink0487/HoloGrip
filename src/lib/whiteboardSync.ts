import type { PageData } from '../store';

export interface WhiteboardSnapshot {
  version: 1;
  pages: PageData[];
  currentPageIndex: number;
}

interface LoadResponse {
  snapshot?: unknown;
}

const TOKEN_KEY = 'hg_token';
const LOCAL_SNAPSHOT_KEY = 'hologrip_ipad_whiteboard_snapshot';
const IS_IPAD_STANDALONE = import.meta.env.HOLO_TARGET === 'ipad';

export async function loadWhiteboardSnapshot(): Promise<WhiteboardSnapshot | null> {
  if (IS_IPAD_STANDALONE) {
    return loadLocalSnapshot();
  }

  const resp = await request('/api/whiteboard', { method: 'GET' });
  const data = (await resp.json()) as LoadResponse;
  if (data.snapshot == null) return null;
  return parseSnapshot(data.snapshot);
}

export async function saveWhiteboardSnapshot(snapshot: WhiteboardSnapshot): Promise<void> {
  if (IS_IPAD_STANDALONE) {
    localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return;
  }

  await request('/api/whiteboard', {
    method: 'PUT',
    headers: [['Content-Type', 'application/json']],
    body: JSON.stringify(snapshot),
  });
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    redirectToLogin();
    throw new Error('Not logged in');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let resp: Response;
  try {
    resp = await fetch(url, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new Error(`Whiteboard sync network error: ${String(error)}`);
  }

  if (resp.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('hg_user');
    redirectToLogin();
    throw new Error('Login expired');
  }
  if (!resp.ok) {
    throw new Error(`Whiteboard sync failed: HTTP ${resp.status}`);
  }
  return resp;
}

function parseSnapshot(value: unknown): WhiteboardSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<WhiteboardSnapshot>;
  if (snapshot.version !== 1) return null;
  if (!Array.isArray(snapshot.pages)) return null;
  if (typeof snapshot.currentPageIndex !== 'number') return null;

  return {
    version: 1,
    pages: snapshot.pages,
    currentPageIndex: snapshot.currentPageIndex,
  };
}

function loadLocalSnapshot(): WhiteboardSnapshot | null {
  const raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
  if (!raw) return null;

  try {
    return parseSnapshot(JSON.parse(raw));
  } catch {
    localStorage.removeItem(LOCAL_SNAPSHOT_KEY);
    return null;
  }
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `login.html?next=${encodeURIComponent(next)}`;
}
