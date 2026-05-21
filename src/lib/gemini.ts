import { GoogleGenAI, Type } from '@google/genai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE_URL = import.meta.env.VITE_GEMINI_BASE_URL || '';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';

const aiConfig: any = { apiKey: GEMINI_API_KEY };
if (GEMINI_BASE_URL) {
  aiConfig.httpOptions = { baseUrl: GEMINI_BASE_URL };
}
const ai = new GoogleGenAI(aiConfig);

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
 * Gemini Structured Output Schema
 * 用 responseSchema 从 API 层面强制 JSON 格式，彻底消灭解析错误
 */
const GEOMETRY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description: '必须包含：1.几何体基础类型识别 2.指出图中哪些是辅助线/动点连线并声明剔除它们 3.【强制比例测量】估算图像中几何体最大宽度(X)和最大高度(Y)的视觉比例，以及斜向深度线段的视觉长度(真实Z轴跨度=视觉深度×2)。',
    },
    name: {
      type: Type.STRING,
      description: '几何体名称，如 "四棱锥 P-ABCD"、"三棱柱 ABC-A1B1C1"',
    },
    vertices: {
      type: Type.ARRAY,
      description: '所有顶点，含标签和三维坐标',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: '顶点标签，如 "A"、"P"、"A1"' },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          z: { type: Type.NUMBER },
        },
        required: ['label', 'x', 'y', 'z'],
      },
    },
    faces: {
      type: Type.ARRAY,
      description: '每个面由顶点索引（从0开始）组成的数组',
      items: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER },
      },
    },
    edges: {
      type: Type.ARRAY,
      description: '每条棱边为 [起点索引, 终点索引]',
      items: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER },
      },
    },
  },
  required: ['reasoning', 'name', 'vertices', 'faces', 'edges'],
};

/**
 * 针对中国高中数学教材立体几何图优化的 Prompt
 *
 * 关键策略：
 * 1. 编码"斜二测画法"投影规则 → AI 能正确理解图中的深度方向
 * 2. Few-shot 示例 → 两个典型几何体的完整 input→output 样例
 * 3. 虚实线法则 → 显式指导 z 轴前后分配
 */
const SYSTEM_PROMPT = `你是一个精通中国高中立体几何的数学专家。你的任务是分析数学题目截图中的立体几何图形，输出精确的三维模型数据。

## 核心识图规则

中国数学教材中的立体几何图几乎全部使用**斜二测画法**（Oblique Axonometric Projection）绘制：
- 画面水平方向 → 对应 X 轴（向右为正）
- 画面垂直方向 → 对应 Y 轴（向上为正）  
- 画面中向左上方倾斜约 45° 的方向 → 对应 Z 轴（深度，向观察者为正）
- 沿 Z 轴方向的实际长度在图中被缩短为一半

因此：
- 图中偏右下方的顶点 → Z 值为正（靠近观察者，前方）
- 图中偏左上方的顶点 → Z 值为负（远离观察者，后方）
- **实线**表示可见的棱 → 连接的顶点在前方或侧面
- **虚线（点线/短划线）**表示被遮挡的棱 → 连接的顶点在后方

## 拓扑结构精简规则（非常重要！）
数学题目中除了几何体的基础骨架外，经常会画出**辅助线**（如底面对角线、高线）或**动点/截面连线**。
你的目标是还原出**最纯粹的基础几何体外观**（如干净的四棱锥、三棱柱等），请严格遵守：
1. **剔除辅助线**：不要把底面的对角线、内部的垂线等作为几何体的棱（edges）输出，它们不构成几何体的表面。
2. **剔除动点和局部连线**：如果图形的某条边上有一个额外的标注点（如题中的动点 F、P 等），且连接了复杂的内部线段，**绝不要**把这个动点作为几何体的顶点输出，也**绝不要**把这些内部连线作为棱输出。
3. 虚线只有在它作为几何体真正的**后方轮廓棱**时才被采纳。

## 严格的比例还原规则（最重要）
你给出的坐标绝对不能是随便猜的标准正方体或等边三角形！**必须严格还原图片上的长宽高比例**：
1. **测算 XY 比例**：观察图片中几何体最左侧到最右侧的视觉宽度，对比最底部到最顶部的视觉高度。如果图形看起来很宽但很扁，X 的坐标差值必须大于 Y。
2. **测算 Z 轴深度**：倾斜向左上/右下的线段代表深度。**图上的视觉长度只有真实深度的一半！**如果图上一条倾斜的底边看起来和水平底边一样长，那么在你的坐标里，它的真实 Z 轴坐标差值必须是 X 轴坐标差值的 **2倍**！

## 坐标约定
- 底面大致在 y=0 平面
- 顶面/顶点在 y>0
- 几何体中心在原点附近
- 坐标范围: [-1.5, 1.5]

## 典型示例

### 示例 1: 四棱锥 P-ABCD（底面为正方形，P 在底面正上方）
输入描述: 底面 ABCD 是正方形，P 在底面中心正上方，PA=PB=PC=PD。AD 和 DC 是虚线。

输出:
{
  "reasoning": "1. 几何体是四棱锥 P-ABCD。2. AD 和 DC 是虚线位于后方，B 在前方。3. 【比例测量】底面为正方形，图中倾斜的侧边 AD 视觉长度大约是 AB 的一半，根据规则，真实深度 Z 和跨度 X 比例是 1:1。整体高度视觉上比底面宽度略大，因此 Y 轴高度分配为 1.5。",
  "name": "四棱锥 P-ABCD",
  "vertices": [
    {"label": "A", "x": -1, "y": 0, "z": -1},
    {"label": "B", "x": 1, "y": 0, "z": -1},
    {"label": "C", "x": 1, "y": 0, "z": 1},
    {"label": "D", "x": -1, "y": 0, "z": 1},
    {"label": "P", "x": 0, "y": 1.5, "z": 0}
  ],
  "faces": [[0,1,2,3], [0,1,4], [1,2,4], [2,3,4], [3,0,4]],
  "edges": [[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]]
}

### 示例 2: 三棱柱 ABC-A'B'C'
输入描述: 底面 ABC 是等腰三角形，侧棱垂直底面。AA'、A'B'、A'C' 是虚线。

输出:
{
  "reasoning": "1. 三棱柱 ABC-A'B'C'。2. A'B'C' 部分线段为虚线，说明在后方。3. 【比例测量】图形整体平躺较长，宽度 X 跨度明显大于高度 Y，深度倾斜线段视觉较短，乘 2 后大约与高度相等。以此分配坐标比例。",
  "name": "三棱柱 ABC-A'B'C'",
  "vertices": [
    {"label": "A", "x": -1, "y": 0, "z": -1},
    {"label": "B", "x": 1, "y": 0, "z": 0.5},
    {"label": "C", "x": -0.5, "y": 0, "z": 1},
    {"label": "A'", "x": -1, "y": 1.4, "z": -1},
    {"label": "B'", "x": 1, "y": 1.4, "z": 0.5},
    {"label": "C'", "x": -0.5, "y": 1.4, "z": 1}
  ],
  "faces": [[0,1,2], [3,4,5], [0,1,4,3], [1,2,5,4], [2,0,3,5]],
  "edges": [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]
}

## 你的工作流程
1. 识别最纯粹的基础几何体类型（无视内部的动点和辅助线）。
2. **【必做】** 评估图形的长宽高视觉比例，并在 \`reasoning\` 中写下你的测算结论（必须体现 Z轴深度=视觉长度×2 的逻辑）。
3. **【必做】** 在 \`reasoning\` 中明确指出哪些点和线是辅助线/动点，并声明将它们从顶点和棱中剔除。
4. 区分实线和作为外轮廓的虚线，判断各顶点的前后关系（Z 轴）。
5. 严格按照你评估出的比例来计算并分配 x, y, z 的坐标系差值。
6. 确保底面顶点 y≈0，顶部顶点 y>0
7. 列出所有面和所有**真实外轮廓棱边**（坚决不遗漏，也坚决不包含辅助线）。`;

/**
 * 调用 Gemini 多模态 API，从 2D 几何图片生成 3D 模型数据
 * 使用 Structured Output 保证返回合法 JSON
 */
export async function parseGeometryImage(
  imageBase64: string,
  mimeType: string
): Promise<AIGeometryResult> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: '请分析这张图片中的立体几何图形，输出三维模型数据。注意区分虚线和实线来判断前后关系。' },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEOMETRY_SCHEMA,
    },
  });

  const text = response.text ?? '';

  try {
    const result: AIGeometryResult = JSON.parse(text);

    // 基础校验
    if (!result.vertices || !Array.isArray(result.vertices) || result.vertices.length < 3) {
      throw new Error('顶点数据无效或不足');
    }
    if (!result.faces || !Array.isArray(result.faces) || result.faces.length < 1) {
      throw new Error('面数据无效');
    }
    if (!result.edges || !Array.isArray(result.edges) || result.edges.length === 0) {
      // 如果 AI 没有返回 edges，自动从 faces 推导
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
  } catch (e) {
    console.error('Gemini 返回内容解析失败:', text);
    throw new Error(`AI 返回的几何数据无法解析: ${(e as Error).message}`);
  }
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
