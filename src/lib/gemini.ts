/**
 * 几何识别 API 客户端。
 *
 * 支持两种模式,由 `VITE_GEMINI_BASE_URL` 自动判定:
 *   1. 直连模式(BASE_URL 是 https:// 开头的绝对地址,如 dev / Tauri 桌面端):
 *        前端必须带 `Authorization: Bearer ${VITE_GEMINI_API_KEY}`。
 *        密钥会被打进 bundle,对外公开,仅适合本地或桌面端。
 *   2. 反代模式(BASE_URL 是 `/api/gemini` 这类相对路径,Web 服务器部署):
 *        前端先调 `/api/auth/issue` 拿短期 token,后续请求带
 *        `Authorization: Bearer <token>`,真实 key 由服务端反代注入。
 *        bundle 里不再含密钥;token 1 小时过期、绑定 IP、有调用次数上限。
 *        token 失效(401)时自动重签并重试一次。
 *
 * 模型名 `[福利]gemini-3.5-flash` 含中文括号,encodeURIComponent 一下避免 URL 截断。
 */

import { getProxyToken, invalidateProxyToken } from './auth';

const RAW_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const RAW_BASE_URL = (import.meta.env.VITE_GEMINI_BASE_URL || 'https://api.gemai.cc').replace(/\/+$/, '');
const RAW_MODEL = import.meta.env.VITE_GEMINI_MODEL || '[福利]gemini-3.5-flash';

/** 是否走自家反代(BASE_URL 以 / 开头视为同源相对路径) */
const IS_PROXY_MODE = RAW_BASE_URL.startsWith('/');

/**
 * AI 返回的顶点数据结构
 */
export interface AIVertex {
  label: string; // 顶点标签，如 "A", "B", "P"
  x: number;
  y: number;
  z: number;
}

/**
 * AI 返回的完整几何体数据
 */
export interface AIGeometryResult {
  reasoning: string;     // AI 的推导与思考过程（强制先输出）
  name: string;          // 几何体名称，如 "四棱锥 P-ABCD"
  vertices: AIVertex[];  // 所有顶点（含标签和坐标）
  faces: number[][];     // 每个面由顶点索引组成，如 [[0,1,2], [0,2,3]]
  edges: number[][];     // 棱边，每项为 [起点索引, 终点索引]
}

/**
 * Gemini responseSchema：从 API 层面强约束 JSON，消灭格式错误。
 */
const GEOMETRY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reasoning: { type: 'STRING' },
    name:      { type: 'STRING' },
    vertices: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          x:     { type: 'NUMBER' },
          y:     { type: 'NUMBER' },
          z:     { type: 'NUMBER' },
        },
        required: ['label', 'x', 'y', 'z'],
      },
    },
    faces: {
      type: 'ARRAY',
      items: { type: 'ARRAY', items: { type: 'INTEGER' } },
    },
    edges: {
      type: 'ARRAY',
      items: { type: 'ARRAY', items: { type: 'INTEGER' } },
    },
  },
  required: ['reasoning', 'name', 'vertices', 'faces', 'edges'],
};

const SYSTEM_PROMPT = `你是一个精通中国高中立体几何的数学专家。你的任务是分析数学题目截图中的立体几何图形，输出精确的三维模型数据。

## 核心识图规则
中国数学教材中的立体几何图几乎全部使用斜二测画法绘制：
- 画面水平方向 → X 轴（向右为正）
- 画面垂直方向 → Y 轴（向上为正）
- 画面中向左上方倾斜约 45° 的方向 → Z 轴（深度，向观察者为正）
- 沿 Z 轴方向的实际长度在图中被缩短为一半

因此：
- 图中偏右下方的顶点 → Z 值为正（靠近观察者，前方）
- 图中偏左上方的顶点 → Z 值为负（远离观察者，后方）
- 实线表示可见的棱 → 连接的顶点在前方或侧面
- 虚线（点线/短划线）表示被遮挡的棱 → 连接的顶点在后方

## 拓扑结构精简规则（非常重要！）
1. 剔除辅助线：不要把底面的对角线、内部的垂线等作为几何体的棱（edges）输出。
2. 剔除动点和局部连线：动点 F、P 等不进 vertices；它们引出的内部线段不进 edges。
3. 虚线只有在它作为几何体真正的后方轮廓棱时才被采纳。

## 严格的比例还原规则（最重要）
你给出的坐标绝对不能是随便猜的标准正方体或等边三角形！必须严格还原图片上的长宽高比例：
1. 测算 XY 比例：观察图片中几何体最左侧到最右侧的视觉宽度，对比最底部到最顶部的视觉高度。
2. 测算 Z 轴深度：倾斜向左上/右下的线段代表深度。图上的视觉长度只有真实深度的一半！

## 坐标约定
- 底面大致在 y=0 平面
- 顶面/顶点在 y>0
- 几何体中心在原点附近
- 坐标范围: [-1.5, 1.5]

## 输出契约
只返回一个合法 JSON 对象，禁止 markdown / 注释 / 多余文字：
{
  "reasoning": string,        // 测量与剔除的思考过程
  "name": string,             // 如 "四棱锥 P-ABCD"
  "vertices": [ { "label": string, "x": number, "y": number, "z": number } ],
  "faces":   [ [int, int, ...] ],
  "edges":   [ [int, int] ]
}`;

/**
 * 调远程 Gemini 接口，从 2D 几何图片生成 3D 模型数据。
 *
 * @param imageBase64 不带前缀的纯 base64
 * @param mimeType    "image/png" / "image/jpeg" 等
 */
export async function parseGeometryImage(
  imageBase64: string,
  mimeType: string,
): Promise<AIGeometryResult> {
  if (!IS_PROXY_MODE && !RAW_API_KEY) {
    throw new Error('未配置 VITE_GEMINI_API_KEY(直连模式必填)');
  }

  const endpoint = `${RAW_BASE_URL}/v1beta/models/${encodeURIComponent(RAW_MODEL)}:generateContent`;
  const mime = mimeType || 'image/png';

  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: '请分析这张图片中的立体几何图形，输出三维模型数据。注意区分虚线和实线来判断前后关系。只返回 JSON 对象。' },
          {
            inlineData: {
              mimeType: mime,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEOMETRY_SCHEMA,
      temperature: 0.2,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!IS_PROXY_MODE) {
    // 直连:把 API key 直接挂请求头
    headers.Authorization = `Bearer ${RAW_API_KEY}`;
  } else {
    // 反代:从后端签发的短期 token
    headers.Authorization = `Bearer ${await getProxyToken()}`;
  }

  const bodyStr = JSON.stringify(body);
  let resp = await fetch(endpoint, { method: 'POST', headers, body: bodyStr });
  let rawText = await resp.text();

  if (IS_PROXY_MODE && resp.status === 401 && shouldRefreshProxyToken(rawText)) {
    invalidateProxyToken();
    headers.Authorization = `Bearer ${await getProxyToken(true)}`;
    resp = await fetch(endpoint, { method: 'POST', headers, body: bodyStr });
    rawText = await resp.text();
  }

  if (!resp.ok) {
    throw new Error(formatAiHttpError(resp.status, rawText));
  }

  let envelope: any;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    throw new Error(`响应不是合法 JSON: ${truncate(rawText, 500)}`);
  }

  // Gemini 原生返回结构：candidates[0].content.parts[0].text
  const content =
    envelope?.candidates?.[0]?.content?.parts?.[0]?.text ??
    // 兼容部分中转网关把 text 直接挂在 message.content 上的情况
    envelope?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`响应缺少 candidates[0].content.parts[0].text: ${truncate(rawText, 500)}`);
  }

  const cleaned = stripJsonFence(content);

  let result: AIGeometryResult;
  try {
    result = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AI 返回内容不是合法 JSON: ${(e as Error).message}; raw=${truncate(content, 300)}`);
  }

  // 基础校验
  if (!result || !Array.isArray(result.vertices) || result.vertices.length < 3) {
    throw new Error('AI 返回的顶点数据无效或不足');
  }
  if (!Array.isArray(result.faces) || result.faces.length < 1) {
    throw new Error('AI 返回的面数据无效');
  }
  if (!Array.isArray(result.edges) || result.edges.length === 0) {
    result.edges = derivedEdgesFromFaces(result.faces);
  }

  // 校验索引越界
  const maxIdx = result.vertices.length - 1;
  for (const face of result.faces) {
    for (const idx of face) {
      if (idx < 0 || idx > maxIdx) {
        throw new Error(`面数据中存在越界索引: ${idx}（共 ${result.vertices.length} 个顶点）`);
      }
    }
  }
  for (const edge of result.edges) {
    for (const idx of edge) {
      if (idx < 0 || idx > maxIdx) {
        throw new Error(`棱边数据中存在越界索引: ${idx}`);
      }
    }
  }

  return result;
}

/** 把 ```json ... ``` 这种 markdown 包装去掉 */
function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.slice(7).replace(/```\s*$/, '').trim();
  }
  if (trimmed.startsWith('```')) {
    return trimmed.slice(3).replace(/```\s*$/, '').trim();
  }
  return trimmed;
}

function shouldRefreshProxyToken(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  if (lower.includes('new_api_error') || lower.includes('invalid token')) {
    return false;
  }
  return true;
}

function formatAiHttpError(status: number, rawText: string): string {
  const message = extractErrorMessage(rawText);
  if (status === 401 && /invalid token/i.test(message)) {
    return 'AI 服务认证失败：服务器配置的上游 API Key 无效或已过期。请检查 UPSTREAM_API_KEY / UPSTREAM_BASE_URL，然后重启后端服务。';
  }
  if (status === 401) {
    return `AI 服务认证失败：${message || '请求未通过鉴权，请稍后重试'}`;
  }
  return `AI 接口返回 ${status}: ${truncate(message || rawText, 500)}`;
}

function extractErrorMessage(rawText: string): string {
  try {
    const data = JSON.parse(rawText);
    return String(data?.error?.message || data?.message || rawText);
  } catch {
    return rawText;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

/**
 * 从 faces 自动推导出不重复的 edges
 */
function derivedEdgesFromFaces(faces: number[][]): number[][] {
  const edgeSet = new Set<string>();
  const edges: number[][] = [];

  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([a, b]);
      }
    }
  }

  return edges;
}
