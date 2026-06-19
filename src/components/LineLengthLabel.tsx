import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface LineLengthLabelProps {
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  /** 文本颜色，默认白色 */
  color?: string;
  /** 背景色，默认半透明黑 */
  bgColor?: string;
  /** 标签偏移距离(垂直于线段方向)，默认 0.08 */
  offset?: number;
  /** 自定义显示文字，不传则自动计算距离 */
  label?: string;
  /** 字号, 默认 12px */
  fontSize?: number;
  /** 不透明度，默认 0.95 */
  opacity?: number;
}

/**
 * 3D 空间线段长度标注：在线段中点处(垂直偏移)显示距离数值的 HTML 悬浮标签
 */
export function LineLengthLabel({
  p1,
  p2,
  color = 'rgba(255,255,255,0.95)',
  bgColor = 'rgba(0,0,0,0.55)',
  offset = 0.08,
  label,
  fontSize = 12,
  opacity = 0.95,
}: LineLengthLabelProps) {
  const { position, text } = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const dist = p1.distanceTo(p2);
    const displayText = label ?? dist.toFixed(2);

    // 计算垂直于线段方向的偏移（在相机平面上偏移）
    // 用一个简单的方式：沿着 p1→p2 方向的法向量偏移
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    // 选择一个不平行的参考向量来求叉积
    const ref = Math.abs(dir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(dir, ref).normalize();
    mid.add(perp.multiplyScalar(offset));

    return { position: mid, text: displayText };
  }, [p1, p2, label, offset]);

  return (
    <Html
      position={[position.x, position.y, position.z]}
      center
      zIndexRange={[90, 0]}
      style={{ opacity }}
    >
      <div
        style={{
          color,
          backgroundColor: 'transparent',
          fontSize: '26px',
          fontWeight: '700',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
          padding: '2px 8px',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          letterSpacing: '0.5px',
          textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)',
          lineHeight: '1.2',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/**
 * 预设模型的棱边定义（用于自动标注）
 * 每条棱边由两个顶点索引组成（对应 PRESET_VERTEX_LABELS 中的索引）
 */
export const PRESET_EDGE_DEFS: Record<string, [number, number][]> = {
  cube: [
    // 底面 4 条
    [0, 1], [1, 2], [2, 3], [3, 0],
    // 顶面 4 条
    [4, 5], [5, 6], [6, 7], [7, 4],
    // 竖边 4 条
    [0, 4], [1, 5], [2, 6], [3, 7],
  ],
  pyramid: [
    // 正四面体 6 条棱
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ],
  cone: [],     // 圆锥无明确棱边
  cylinder: [], // 圆柱无明确棱边
  sphere: [],   // 球无棱边
};
