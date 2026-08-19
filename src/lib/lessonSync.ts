import type { WhiteboardSnapshot } from './whiteboardSync';
import { apiUrl, apiWebSocketUrl } from './apiOrigin';
import { isTauriRuntime } from './platform';

export interface ClassInfo {
  id: number;
  name: string;
  description: string;
  teacher_id: number;
  teacher_name: string;
  invite_code: string;
}

export interface ClassList {
  teaching: ClassInfo[];
  joined: ClassInfo[];
}

export interface LessonInfo {
  id: number;
  class_id: number;
  title: string;
  lesson_date: string;
  created_by: number;
  creator_name: string;
}

export interface LessonWhiteboard {
  snapshot: WhiteboardSnapshot | null;
  version: number;
}

export interface LiveWhiteboardEvent {
  type: 'stroke_commit' | 'canvas_clear' | 'page_add' | 'page_remove' | 'page_switch' | 'geometry_update' | 'snapshot_saved';
  client_id: string;
  snapshot?: WhiteboardSnapshot;
  stroke?: {
    pageIndex: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
    color: string;
    thickness: number;
    eraser: boolean;
  };
  pageIndex?: number;
  version?: number;
}

export class LessonVersionConflictError extends Error {
  snapshot: WhiteboardSnapshot | null;
  version: number;

  constructor(version: number, snapshot: WhiteboardSnapshot | null) {
    super('Lesson whiteboard version conflict');
    this.version = version;
    this.snapshot = snapshot;
  }
}

const TOKEN_KEY = 'hg_token';

export async function listClasses(): Promise<ClassList> {
  const resp = await request('/api/class/list', { method: 'GET' });
  const data = await resp.json();
  return data.data || { teaching: [], joined: [] };
}

export async function listLessons(classId: number, date: string): Promise<LessonInfo[]> {
  const resp = await request(`/api/classes/${classId}/lessons?date=${encodeURIComponent(date)}`, { method: 'GET' });
  const data = await resp.json();
  return Array.isArray(data.lessons) ? data.lessons : [];
}

export async function createLesson(classId: number, title: string, lessonDate: string): Promise<number> {
  const resp = await request(`/api/classes/${classId}/lessons`, {
    method: 'POST',
    headers: [['Content-Type', 'application/json']],
    body: JSON.stringify({ title, lesson_date: lessonDate }),
  });
  const data = await resp.json();
  return data.lesson_id;
}

export async function loadLessonWhiteboard(lessonId: number): Promise<LessonWhiteboard> {
  const resp = await request(`/api/lessons/${lessonId}/whiteboard`, { method: 'GET' });
  const data = await resp.json();
  return {
    snapshot: parseSnapshot(data.snapshot),
    version: typeof data.version === 'number' ? data.version : 0,
  };
}

export async function saveLessonWhiteboard(
  lessonId: number,
  snapshot: WhiteboardSnapshot,
  baseVersion: number,
): Promise<number> {
  const resp = await request(`/api/lessons/${lessonId}/whiteboard`, {
    method: 'PUT',
    headers: [['Content-Type', 'application/json']],
    body: JSON.stringify({ snapshot, base_version: baseVersion }),
    allowConflict: true,
  } as RequestInit & { allowConflict: boolean });

  if (resp.status === 409) {
    const data = await resp.json();
    throw new LessonVersionConflictError(
      typeof data.version === 'number' ? data.version : baseVersion,
      parseSnapshot(data.snapshot),
    );
  }

  const data = await resp.json();
  return typeof data.version === 'number' ? data.version : baseVersion;
}

export function openLessonWhiteboardSocket(
  lessonId: number,
  onEvent: (event: LiveWhiteboardEvent) => void,
): WebSocket | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const url = apiWebSocketUrl(`/api/lessons/${lessonId}/whiteboard/live?token=${encodeURIComponent(token)}`);
  const socket = new WebSocket(url);
  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as LiveWhiteboardEvent;
      if (event && event.type) onEvent(event);
    } catch (error) {
      console.warn('Invalid whiteboard live event', error);
    }
  };
  return socket;
}

async function request(url: string, init: RequestInit & { allowConflict?: boolean }): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    redirectToLogin();
    throw new Error('Not logged in');
  }
  const { allowConflict, ...fetchInit } = init;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const resp = await fetch(apiUrl(url), { ...fetchInit, headers });
  if (resp.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('hg_user');
    redirectToLogin();
    throw new Error('Login expired');
  }
  if (resp.status === 409 && allowConflict) return resp;
  if (!resp.ok) throw new Error(`Lesson request failed: HTTP ${resp.status}`);
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

function redirectToLogin(): void {
  // The desktop shell owns its login flow. Navigating a Tauri webview to the
  // standalone login page replaces the native-style desktop UI.
  if (isTauriRuntime) return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `login.html?next=${encodeURIComponent(next)}`;
}
