import type { AIVertex } from './gemini';

/**
 * 将顶点集合归一化：平移到中心 + 缩放到目标大小
 * 确保自定义模型与预设模型（如正方体1.2、球0.8）在同一视觉量级
 */
export function normalizeVertices(vertices: AIVertex[], targetSize: number = 1.5): AIVertex[] {
  if (vertices.length === 0) return [];

  // 1. 计算包围盒（Bounding Box）
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    minZ = Math.min(minZ, v.z);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
    maxZ = Math.max(maxZ, v.z);
  }

  // 2. 计算中心点
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  // 3. 计算最大跨度，用于等比缩放
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanY, spanZ, 0.001); // 避免除零

  const scale = targetSize / maxSpan;

  // 4. 平移到原点 + 等比缩放
  return vertices.map(v => ({
    label: v.label,
    x: (v.x - cx) * scale,
    y: (v.y - cy) * scale,
    z: (v.z - cz) * scale,
  }));
}

/**
 * 根据面数据（faces）三角化多边形面
 * Three.js 的 BufferGeometry 要求 index 为三角形
 * 将任意 N 边形面扇形拆分为 N-2 个三角形
 */
export function triangulateFaces(faces: number[][]): number[] {
  const indices: number[] = [];

  for (const face of faces) {
    if (face.length < 3) continue;

    // Fan triangulation: 以第一个顶点为扇心
    for (let i = 1; i < face.length - 1; i++) {
      indices.push(face[0], face[i], face[i + 1]);
    }
  }

  return indices;
}
