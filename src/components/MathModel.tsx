import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box, Sphere, Cylinder, Cone, Tetrahedron, Edges, Line, Text, Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useARStore, Point3D, CustomModel, MathShape, AuxiliaryLine } from '../store';
import { triangulateFaces } from '../lib/geometry';
import { LineLengthLabel, PRESET_EDGE_DEFS } from './LineLengthLabel';
import {
  ROTATION_TUNING,
  smoothingAlpha,
  oneEuroFilter,
  createOneEuroState,
  computeArcballDelta,
  computeRollDelta,
  computeScaleFactor,
  adaptiveSensitivity,
} from '../lib/rotation';

function GlassMaterial() {
  return (
    <meshBasicMaterial
      color="#ffffff"
      opacity={0.3}
      transparent
      depthWrite={false}
      toneMapped={false}
    />
  );
}

/**
 * 预设模型的顶点标签定义
 * 坐标对应 Three.js 各几何体在默认参数下的实际顶点位置
 */
const PRESET_VERTEX_LABELS: Record<string, { label: string; x: number; y: number; z: number }[]> = {
  cube: [
    // 底面 ABCD (y = -0.6)
    { label: 'A', x: -0.6, y: -0.6, z: 0.6 },
    { label: 'B', x: 0.6, y: -0.6, z: 0.6 },
    { label: 'C', x: 0.6, y: -0.6, z: -0.6 },
    { label: 'D', x: -0.6, y: -0.6, z: -0.6 },
    // 顶面 A1B1C1D1 (y = 0.6)
    { label: "A'", x: -0.6, y: 0.6, z: 0.6 },
    { label: "B'", x: 0.6, y: 0.6, z: 0.6 },
    { label: "C'", x: 0.6, y: 0.6, z: -0.6 },
    { label: "D'", x: -0.6, y: 0.6, z: -0.6 },
  ],
  pyramid: (() => {
    // TetrahedronGeometry(1.2, 0) 的四个顶点
    const r = 1.2;
    const a = r / Math.sqrt(3);
    return [
      { label: 'A', x: a, y: a, z: a },
      { label: 'B', x: a, y: -a, z: -a },
      { label: 'C', x: -a, y: a, z: -a },
      { label: 'D', x: -a, y: -a, z: a },
    ];
  })(),
  cone: [
    // Cone(0.8, 1.5, 16): 顶点在 y=0.75，底面中心在 y=-0.75
    { label: 'S', x: 0, y: 0.75, z: 0 },
    { label: 'O', x: 0, y: -0.75, z: 0 },
  ],
  cylinder: [
    // Cylinder(0.6, 0.6, 1.6, 16): 顶面中心 y=0.8，底面中心 y=-0.8
    { label: "O'", x: 0, y: 0.8, z: 0 },
    { label: 'O', x: 0, y: -0.8, z: 0 },
  ],
  sphere: [
    // 球心
    { label: 'O', x: 0, y: 0, z: 0 },
  ],
};

/**
 * 顶点字母标记组件：在对应的 3D 坐标上方显示字母，始终面向摄像机
 */
function VertexLabels({ vertices }: { vertices: { label: string; x: number; y: number; z: number }[] }) {
  return (
    <>
      {vertices.map((v, idx) => {
        // 让字母朝着偏离中心的方向向外延伸，而不是全部往上（+y）偏移
        // 这样底部的点字母会往下，侧面的点会往侧面，避免和模型重叠
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
        const offset = 0.22; // 偏移距离
        const posX = v.x + (v.x / len) * offset;
        const posY = v.y + (v.y / len) * offset;
        const posZ = v.z + (v.z / len) * offset;

        return (
          <Html
            key={idx}
            position={[posX, posY, posZ]}
            center
            zIndexRange={[100, 0]}
          >
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.95)',
                fontSize: '26px',
                fontWeight: '600',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
                pointerEvents: 'none',
                userSelect: 'none',
                textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.8)',
                letterSpacing: '1px',
              }}
            >
              {v.label}
            </div>
          </Html>
        );
      })}
    </>
  );
}

/**
 * 自定义几何体组件：根据 AI 返回的顶点和面数据动态生成 BufferGeometry
 */
function CustomGeometry({ model, meshRef }: { model: CustomModel; meshRef: React.RefObject<THREE.Mesh | null> }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();

    // 填充顶点位置
    const positions = new Float32Array(model.vertices.length * 3);
    for (let i = 0; i < model.vertices.length; i++) {
      positions[i * 3] = model.vertices[i].x;
      positions[i * 3 + 1] = model.vertices[i].y;
      positions[i * 3 + 2] = model.vertices[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 三角化面并设置索引
    const indices = triangulateFaces(model.faces);
    if (indices.length > 0) {
      geom.setIndex(indices);
    }

    geom.computeVertexNormals();

    return geom;
  }, [model]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        color="#ffffff"
        opacity={0.3}
        transparent
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * 自定义模型的棱边渲染（显式渲染 AI 返回的 edges，比依赖 EdgesGeometry 更精准）
 */
function CustomEdges({ model }: { model: CustomModel }) {
  return (
    <>
      {model.edges.map((edge, idx) => {
        const v1 = model.vertices[edge[0]];
        const v2 = model.vertices[edge[1]];
        if (!v1 || !v2) return null;
        return (
          <Line
            key={idx}
            points={[
              new THREE.Vector3(v1.x, v1.y, v1.z),
              new THREE.Vector3(v2.x, v2.y, v2.z),
            ]}
            color="#ffffff"
            lineWidth={2}
            depthTest={false}
          />
        );
      })}
    </>
  );
}

export function MathModel() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const hoverSphereRef = useRef<THREE.Mesh>(null);
  const previewLineRef = useRef<THREE.Line>(null);
  const [isGrabbed, setIsGrabbed] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const prevRotateCursor = useRef<THREE.Vector2 | null>(null);
  const dragPlaneZ = useRef<number>(0);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const prevHovered = useRef<number | null>(null);

  // Smart inference snapping states & refs (SolidWorks style)
  const [inferenceActive, setInferenceActive] = useState<{
    start: THREE.Vector3;
    dir: THREE.Vector3;
    type: 'parallel' | 'perpendicular' | 'axis';
    refName: string;
  } | null>(null);
  const prevInferenceRef = useRef<any>(null);
  const inferenceTargetGroupRef = useRef<THREE.Group>(null);

  const grabOffset = useRef(new THREE.Vector3());
  const prevPinchDist = useRef<number | null>(null);
  const prevPinchAngle = useRef<number | null>(null);
  const prevPinchCenter = useRef<THREE.Vector2 | null>(null);
  
  // Extension dragging state
  const draggingExtRef = useRef<{ index: number, type: 'before'|'after', p1: THREE.Vector3, p2: THREE.Vector3, initHitDist: number, initialExt: number } | null>(null);

  const targetQuaternion = useRef(new THREE.Quaternion());

  // 一阶低通滤波后的光标(NDC)，用来吃掉 MediaPipe 的微抖动
  // 使用 One-Euro Filter：慢动作时强滤波吃抖动，快动作时弱滤波几乎零延迟
  const smoothLeft = useRef({ x: 0, y: 0, valid: false });
  const smoothRight = useRef({ x: 0, y: 0, valid: false });
  // 每个被过滤的标量需要独立的 OneEuroState
  const leftXFilter = useRef(createOneEuroState());
  const leftYFilter = useRef(createOneEuroState());
  const rightXFilter = useRef(createOneEuroState());
  const rightYFilter = useRef(createOneEuroState());

  // 复用的临时四元数 / 向量，避免每帧 new
  const tmpQ = useRef(new THREE.Quaternion());
  const tmpScaleVec = useRef(new THREE.Vector3());
  
  // Ref to prevent multiple click triggers in a single pinch
  const prevRightPinch = useRef(false);

  // 当前正在书写的"3D 表面笔迹" id；松开捏合或离开模型表面后置 null
  const activeSurfaceStrokeId = useRef<string | null>(null);
  // 上一次写到模型表面的局部坐标（用来做距离阈值判断，避免点过密）
  const lastSurfacePoint = useRef<THREE.Vector3 | null>(null);

  const activeModel = useARStore(state => state.activeModel);
  const activeCustomModelId = useARStore(state => state.activeCustomModelId);
  const customModels = useARStore(state => state.customModels);
  const presetDimensions = useARStore(state => state.presetDimensions);
  const snapPointsRef = useRef<{ coord: THREE.Vector3; label: string }[]>([]);
  const { camera, raycaster } = useThree();

  const logicalScale = useMemo(() => {
    const scale = new THREE.Vector3(1, 1, 1);
    if (!activeModel) return scale;
    const dims = presetDimensions[activeModel] as any;
    if (activeModel === 'cube') {
      const r = (dims.size || 1) / 1.2;
      scale.set(r, r, r);
    } else if (activeModel === 'sphere') {
      const r = (dims.radius || 1) / 0.8;
      scale.set(r, r, r);
    } else if (activeModel === 'cylinder') {
      scale.set((dims.radius || 1) / 0.6, (dims.height || 1) / 1.6, (dims.radius || 1) / 0.6);
    } else if (activeModel === 'cone') {
      scale.set((dims.radius || 1) / 0.8, (dims.height || 1) / 1.5, (dims.radius || 1) / 0.8);
    } else if (activeModel === 'pyramid') {
      const r = (dims.radius || 1) / 1.2;
      scale.set(r, r, r);
    }
    return scale;
  }, [activeModel, presetDimensions]);

  // 稳定的 preview line 对象（避免每次渲染创建新对象）
  const previewLineObj = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#fcd34d', depthTest: false, transparent: true, opacity: 0.8 });
    return new THREE.Line(geom, mat);
  }, []);

  // 获取当前激活的自定义模型
  const activeCustomModel = useMemo(() => {
    if (!activeCustomModelId) return null;
    return customModels.find(m => m.id === activeCustomModelId) || null;
  }, [activeCustomModelId, customModels]);

  // 是否有任何模型处于激活状态（预设或自定义）
  const hasActiveModel = activeModel !== null || activeCustomModel !== null;

  useEffect(() => {
    if (groupRef.current) {
      // 切换模型时重置位置到正中间，并重置旋转
      groupRef.current.position.set(0, 0, -2);
      groupRef.current.quaternion.set(0, 0, 0, 1);
      targetQuaternion.current.set(0, 0, 0, 1);
    }
  }, [activeModel, activeCustomModelId]);

  useEffect(() => {
    if (!meshRef.current || !hasActiveModel) return;
    const geom = (meshRef.current as any).geometry as THREE.BufferGeometry;
    if (!geom) return;

    try {
        const edgeGeom = new THREE.EdgesGeometry(geom, activeModel === 'sphere' ? 15 : 45);
        const pos = edgeGeom.attributes.position;
        const points: { coord: THREE.Vector3; label: string }[] = [];
        
        if (pos) {
          for (let i = 0; i < pos.count; i += 2) {
            const p1 = new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i);
            const p2 = new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i + 1);
            
            points.push({ coord: p1, label: '顶点' });
            points.push({ coord: p2, label: '顶点' });
            points.push({ coord: p1.clone().lerp(p2, 0.25), label: '四分之一' });
            points.push({ coord: p1.clone().lerp(p2, 0.75), label: '四分之一' });
            points.push({ coord: p1.clone().lerp(p2, 1/3), label: '三分之一' });
            points.push({ coord: p1.clone().lerp(p2, 2/3), label: '三分之一' });
            points.push({ coord: p1.clone().lerp(p2, 0.5), label: '二分之一' });
          }
        }

        const origPos = geom.attributes.position;
        if (origPos) {
          for (let i = 0; i < origPos.count; i++) {
              points.push({ coord: new THREE.Vector3().fromBufferAttribute(origPos as THREE.BufferAttribute, i), label: '顶点' });
          }
        }
        
        // Remove duplicates
        const uniquePoints: { coord: THREE.Vector3; label: string }[] = [];
        points.forEach(p => {
          if (!uniquePoints.some(up => up.coord.distanceToSquared(p.coord) < 0.001)) {
            uniquePoints.push(p);
          }
        });

        snapPointsRef.current = uniquePoints;
    } catch(e) {
        console.error(e);
    }
  }, [activeModel, activeCustomModel]);
  
  // A plane facing the camera, fixed at z=0, used to compute drag motion in 3D
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  useFrame((state, delta) => {
    const store = useARStore.getState();
    const { leftHand, rightHand, modelScale, activeTab } = store;

    // Scale smoothing: 帧率无关的指数逼近(基于半衰期)
    if (groupRef.current) {
      const scaleAlpha = smoothingAlpha(delta, ROTATION_TUNING.scaleHalfLife);
      tmpScaleVec.current.set(modelScale, modelScale, modelScale);
      groupRef.current.scale.lerp(tmpScaleVec.current, scaleAlpha);
    }

    if (!hasActiveModel) {
      if (hoverSphereRef.current) hoverSphereRef.current.visible = false;
      if (previewLineRef.current) previewLineRef.current.visible = false;
      return;
    }

    const bothPinched = leftHand.isVisible && rightHand.isVisible && leftHand.isPinched && rightHand.isPinched;
    const leftPinching = leftHand.isVisible && leftHand.isPinched;
    const rightPinching = rightHand.isVisible && rightHand.isPinched;

    // Handle Right Hand Vertex Hovering and Clicking
    let hoverVisible = false;
    let foundVertex = false;
    let closestVertLocal = new THREE.Vector3();

    const isEraser = store.isEraser;
    const isLineDrawingActive = store.isLineDrawingActive;
    const isXYZDrawingActive = store.isXYZDrawingActive;
    const modelLinesStore = store.modelLines;

    // Only allow vertex connection if line drawing or XYZ axis drawing is active and not erasing
    if ((isLineDrawingActive || isXYZDrawingActive) && !isEraser && rightHand.isVisible && !leftPinching) {
      raycaster.setFromCamera(rightHand.cursor, camera);
      const ray = raycaster.ray;

      if (meshRef.current) {
        meshRef.current.updateMatrixWorld();
        const geom = (meshRef.current as any).geometry as THREE.BufferGeometry;
        const posAttr = geom.attributes.position;

        // Calculate fallback coordinate projected onto a billboard plane facing the camera.
        // If drawing a line, use the starting point depth; otherwise, use the model origin depth.
        const billboardPlane = new THREE.Plane();
        const planeNormal = new THREE.Vector3();
        camera.getWorldDirection(planeNormal);
        planeNormal.negate(); // Face the camera

        const refPointLocal = new THREE.Vector3(0, 0, 0);
        if (store.activeLineStart) {
          refPointLocal.set(store.activeLineStart.x, store.activeLineStart.y, store.activeLineStart.z);
        }
        const refPointWorld = refPointLocal.clone().applyMatrix4(meshRef.current.matrixWorld);
        billboardPlane.setFromNormalAndCoplanarPoint(planeNormal, refPointWorld);

        const fallbackLocal = new THREE.Vector3();
        const intersectWorld = new THREE.Vector3();
        if (ray.intersectPlane(billboardPlane, intersectWorld)) {
          const invMatrix = new THREE.Matrix4().copy(meshRef.current.matrixWorld).invert();
          fallbackLocal.copy(intersectWorld).applyMatrix4(invMatrix);
        } else {
          let dist = 5;
          if (groupRef.current) dist = groupRef.current.position.distanceTo(camera.position);
          const cursorPtWorld = ray.at(dist, new THREE.Vector3());
          const invMatrix = new THREE.Matrix4().copy(meshRef.current.matrixWorld).invert();
          fallbackLocal.copy(cursorPtWorld).applyMatrix4(invMatrix);
        }
        
        let closestDistSq = Infinity;
        let matchedSnapLabel: string | null = null;
        
        const checkSnapPoint = (vLocal: THREE.Vector3, typeLabel: string) => {
          const vWorld = vLocal.clone().applyMatrix4(meshRef.current!.matrixWorld);
          
          // To ensure we don't snap to vertices behind the camera
          const vCam = vWorld.clone().applyMatrix4(camera.matrixWorldInverse);
          if (vCam.z > 0) return; 
          
          // Project to NDC screen space
          const vNDC = vWorld.clone().project(camera);
          
          // Aspect ratio correction for distance
          const aspect = window.innerWidth / window.innerHeight;
          const dx = (vNDC.x - rightHand.cursor.x) * aspect;
          const dy = vNDC.y - rightHand.cursor.y;
          const distSq = dx*dx + dy*dy;
          
          // NDC 距离阈值：sqrt(0.0035) ≈ 0.06，约 6% 屏幕高度。
          if (distSq < 0.0035 && distSq < closestDistSq) {
            closestDistSq = distSq;
            closestVertLocal.copy(vLocal);
            foundVertex = true;
            matchedSnapLabel = typeLabel;
          }
        };

        if (isXYZDrawingActive && store.activeLineStart) {
          // --- Force XYZ snap logic ---
          const S = new THREE.Vector3(store.activeLineStart.x, store.activeLineStart.y, store.activeLineStart.z);
          const invMatrix = new THREE.Matrix4().copy(meshRef.current.matrixWorld).invert();
          const localRayOrigin = ray.origin.clone().applyMatrix4(invMatrix);
          const localRayDir = ray.direction.clone().transformDirection(invMatrix).normalize();

          const axes = [
            { dir: new THREE.Vector3(1, 0, 0), name: 'X轴' },
            { dir: new THREE.Vector3(0, 1, 0), name: 'Y轴' },
            { dir: new THREE.Vector3(0, 0, 1), name: 'Z轴' }
          ];

          let bestAxis = null;
          let bestT = 0;
          let minRayDist = Infinity;

          axes.forEach(axis => {
            const A = axis.dir;
            const R = new THREE.Vector3().subVectors(localRayOrigin, S);
            const b = localRayDir.dot(A);
            const c = R.dot(localRayDir);
            const d = R.dot(A);

            let t = 0;
            const denom = 1 - b * b;
            if (Math.abs(denom) > 1e-6) {
              t = (d - b * c) / denom;
            } else {
              t = d;
            }

            const u = b * t - c;
            const P_axis = S.clone().add(A.clone().multiplyScalar(t));
            const P_ray = localRayOrigin.clone().add(localRayDir.clone().multiplyScalar(u));

            const dist = P_axis.distanceTo(P_ray);
            if (dist < minRayDist) {
              minRayDist = dist;
              bestAxis = axis;
              bestT = t;
            }
          });

          if (bestAxis) {
            const axisInfo = bestAxis as { dir: THREE.Vector3; name: string };
            let finalT = bestT;
            let alignedWithVertex = false;

            const scaleFactor = axisInfo.name === 'X轴' ? logicalScale.x : (axisInfo.name === 'Y轴' ? logicalScale.y : logicalScale.z);

            const snapThreshold = 0.08;
            for (let i = 0; i < snapPointsRef.current.length; i++) {
              const sp = snapPointsRef.current[i].coord;
              if (axisInfo.name === 'X轴') {
                const targetX = sp.x;
                if (Math.abs((S.x + finalT) - targetX) < snapThreshold) {
                  finalT = targetX - S.x;
                  alignedWithVertex = true;
                  break;
                }
              } else if (axisInfo.name === 'Y轴') {
                const targetY = sp.y;
                if (Math.abs((S.y + finalT) - targetY) < snapThreshold) {
                  finalT = targetY - S.y;
                  alignedWithVertex = true;
                  break;
                }
              } else if (axisInfo.name === 'Z轴') {
                const targetZ = sp.z;
                if (Math.abs((S.z + finalT) - targetZ) < snapThreshold) {
                  finalT = targetZ - S.z;
                  alignedWithVertex = true;
                  break;
                }
              }
            }

            // 强行对齐到整数逻辑长度 (终点必须是整数长度)
            const logicalLen = finalT * scaleFactor;
            const roundedLogicalLen = Math.round(logicalLen);
            finalT = roundedLogicalLen / scaleFactor;

            closestVertLocal.copy(S).add(axisInfo.dir.clone().multiplyScalar(finalT));
            foundVertex = true;
            matchedSnapLabel = alignedWithVertex 
              ? `${axisInfo.name}对齐 (对齐顶点, 长度: ${roundedLogicalLen})` 
              : `${axisInfo.name}对齐 (长度: ${roundedLogicalLen})`;
          }
        } else {
          // 1. Check original geometry snap points
          for (let i = 0; i < snapPointsRef.current.length; i++) {
            const sp = snapPointsRef.current[i];
            checkSnapPoint(sp.coord, sp.label);
          }
          
          // 2. Check dynamically drawn auxiliary lines
          for (let i = 0; i < modelLinesStore.length; i++) {
            const ml = modelLinesStore[i];
            const p1 = new THREE.Vector3(ml.p1.x, ml.p1.y, ml.p1.z);
            const p2 = new THREE.Vector3(ml.p2.x, ml.p2.y, ml.p2.z);
            
            // Create snap points on the drawn line
            checkSnapPoint(p1, '顶点');
            checkSnapPoint(p2, '顶点');
            checkSnapPoint(p1.clone().lerp(p2, 0.25), '四分之一');
            checkSnapPoint(p1.clone().lerp(p2, 0.75), '四分之一');
            checkSnapPoint(p1.clone().lerp(p2, 1/3), '三分之一');
            checkSnapPoint(p1.clone().lerp(p2, 2/3), '三分之一');
            checkSnapPoint(p1.clone().lerp(p2, 0.5), '二分之一');

            // 3. Check auxiliary line extension endpoints for snapping
            if (ml.isAuxiliary) {
              const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
              if (ml.extendBefore > 0) {
                const extP1 = p1.clone().sub(dir.clone().multiplyScalar(ml.extendBefore));
                checkSnapPoint(extP1, '延长线端点');
              }
              if (ml.extendAfter > 0) {
                const extP2 = p2.clone().add(dir.clone().multiplyScalar(ml.extendAfter));
                checkSnapPoint(extP2, '延长线端点');
              }
            }
          }

          // 4. Check line-line intersection points for snapping
          const allLineSegments: [THREE.Vector3, THREE.Vector3][] = modelLinesStore.map(ml => [
            new THREE.Vector3(ml.p1.x, ml.p1.y, ml.p1.z),
            new THREE.Vector3(ml.p2.x, ml.p2.y, ml.p2.z),
          ]);
          for (let i = 0; i < allLineSegments.length; i++) {
            for (let j = i + 1; j < allLineSegments.length; j++) {
              const [a1, a2] = allLineSegments[i];
              const [b1, b2] = allLineSegments[j];
              // Compute closest point between two 3D line segments
              const d1 = new THREE.Vector3().subVectors(a2, a1);
              const d2 = new THREE.Vector3().subVectors(b2, b1);
              const r = new THREE.Vector3().subVectors(a1, b1);
              const a = d1.dot(d1);
              const e = d2.dot(d2);
              const f = d2.dot(r);
              const denom = a * e - d1.dot(d2) * d1.dot(d2);
              if (Math.abs(denom) > 1e-8) {
                const b = d1.dot(d2);
                const c = d1.dot(r);
                let s = (b * f - c * e) / denom;
                let t = (a * f - b * c) / denom;
                s = Math.max(0, Math.min(1, s));
                t = Math.max(0, Math.min(1, t));
                const cp1 = a1.clone().add(d1.clone().multiplyScalar(s));
                const cp2 = b1.clone().add(d2.clone().multiplyScalar(t));
                if (cp1.distanceTo(cp2) < 0.05) {
                  checkSnapPoint(cp1.clone().add(cp2).multiplyScalar(0.5), '交点');
                }
              }
            }
          }
        }



        // --- 智能几何推导吸附逻辑 (SolidWorks 风格) ---
        let inferenceMatch = null;
        if (isLineDrawingActive && !isXYZDrawingActive && !isEraser && store.activeLineStart && !foundVertex) {
          const S = new THREE.Vector3(store.activeLineStart.x, store.activeLineStart.y, store.activeLineStart.z);
          
          let dist = 5; 
          if (groupRef.current) dist = groupRef.current.position.distanceTo(camera.position);
          const cursorPtWorld = ray.at(dist, new THREE.Vector3());
          const cursorPtLocal = groupRef.current ? groupRef.current.worldToLocal(cursorPtWorld.clone()) : cursorPtWorld.clone();
          
          const vCur = new THREE.Vector3().subVectors(cursorPtLocal, S);
          const lenCur = vCur.length();
          
          if (lenCur > 0.18) { // 限制最小长度，避免起点附近剧烈跳变，提升手势画线操控感
            const dCur = vCur.clone().normalize();
            const SNAP_THRESHOLD = 0.9975; // 约 4 度以内才吸附，避免磁吸感过强
            
            // 寻找最佳匹配方向 (仅允许 local X, Y, Z 轴向，对应起点所在面的法向/切向相对关系)
            let bestDot = 0;
            let bestRay: { dir: THREE.Vector3; type: 'axis'; refName: string } | null = null;
            
            // A. 测试坐标轴对齐
            const axes = [
              { dir: new THREE.Vector3(1, 0, 0), name: 'X轴' },
              { dir: new THREE.Vector3(0, 1, 0), name: 'Y轴' },
              { dir: new THREE.Vector3(0, 0, 1), name: 'Z轴' }
            ];
            axes.forEach(axis => {
              const dotVal = dCur.dot(axis.dir);
              const absDot = Math.abs(dotVal);
              if (absDot > SNAP_THRESHOLD && absDot > bestDot) {
                bestDot = absDot;
                bestRay = {
                  dir: axis.dir.clone().multiplyScalar(Math.sign(dotVal)),
                  type: 'axis',
                  refName: axis.name
                };
              }
            });
            
            if (bestRay) {
              const rayInfo = bestRay as { dir: THREE.Vector3; type: 'axis'; refName: string };
              const projLen = vCur.dot(rayInfo.dir);
              closestVertLocal.copy(S).add(rayInfo.dir.clone().multiplyScalar(projLen));
              foundVertex = true;
              matchedSnapLabel = `${rayInfo.refName}正交`;
              
              inferenceMatch = {
                start: S.clone(),
                dir: rayInfo.dir.clone(),
                type: rayInfo.type,
                refName: rayInfo.refName
              };
            }
          }
        }
        
        const hasChanged = (inferenceMatch === null && prevInferenceRef.current !== null) ||
                           (inferenceMatch !== null && prevInferenceRef.current === null) ||
                           (inferenceMatch !== null && prevInferenceRef.current !== null && (
                             inferenceMatch.refName !== prevInferenceRef.current.refName ||
                             inferenceMatch.type !== prevInferenceRef.current.type
                           ));
        if (hasChanged) {
          prevInferenceRef.current = inferenceMatch;
          setInferenceActive(inferenceMatch);
        }
        
        if (inferenceMatch && inferenceTargetGroupRef.current) {
          inferenceTargetGroupRef.current.position.copy(closestVertLocal);
        }

        if (!foundVertex) {
          closestVertLocal.copy(fallbackLocal);
        }

        // Update snap point info to Zustand store
        if (foundVertex && matchedSnapLabel) {
          store.setSnappedPointInfo(matchedSnapLabel);
        } else {
          store.setSnappedPointInfo(null);
        }

        if (foundVertex) {
          hoverVisible = true;
          if (hoverSphereRef.current) {
            hoverSphereRef.current.position.copy(closestVertLocal);
            hoverSphereRef.current.visible = true;
            
            const t = Math.max(0, Math.min(1, (rightHand.pinchDistance - 0.03) / 0.1));
            const scale = 0.02 + (t * 0.02);
            hoverSphereRef.current.scale.set(scale, scale, scale);
            
            const material = hoverSphereRef.current.material as THREE.MeshBasicMaterial;
            if (rightPinching) {
               material.color.setHex(0x22d3ee); 
            } else {
               material.color.setHex(0xfacc15); // Yellow hover highlight
            }
          }
        }

        if (rightPinching && !prevRightPinch.current) {
          if (foundVertex) {
            const pt: Point3D = { x: closestVertLocal.x, y: closestVertLocal.y, z: closestVertLocal.z };
            if (store.activeLineStart) {
              store.addModelLine(store.activeLineStart, pt, isXYZDrawingActive);
              store.setActiveLineStart(null);
            } else {
              store.setActiveLineStart(pt);
            }
          }
        }
      }

      // Handle Preview Line
      if (store.activeLineStart && previewLineRef.current) {
         const start = store.activeLineStart;
         const lineGeom = previewLineRef.current.geometry;
         const pos = lineGeom.attributes.position.array as Float32Array;
         if (pos) {
           pos[0] = start.x; pos[1] = start.y; pos[2] = start.z;
           pos[3] = closestVertLocal.x; pos[4] = closestVertLocal.y; pos[5] = closestVertLocal.z;
           
           lineGeom.attributes.position.needsUpdate = true;
           previewLineRef.current.visible = true;
         }
      } else if (previewLineRef.current) {
         previewLineRef.current.visible = false;
      }
    }
    
    if (!hoverVisible) {
      if (hoverSphereRef.current) hoverSphereRef.current.visible = false;
    }
    if (!rightHand.isVisible || leftPinching) {
      if (previewLineRef.current) previewLineRef.current.visible = false;
    }
    
    // Eraser Logic for Lines
    if (isEraser && rightHand.isVisible && !leftPinching) {
      if (groupRef.current) {
        let closestDistSq = Infinity;
        let currentHovered = null;
        
        for (let i = 0; i < modelLinesStore.length; i++) {
          const line = modelLinesStore[i];
          const p1Local = new THREE.Vector3(line.p1.x, line.p1.y, line.p1.z);
          const p2Local = new THREE.Vector3(line.p2.x, line.p2.y, line.p2.z);
          
          const p1World = p1Local.clone().applyMatrix4(groupRef.current.matrixWorld);
          const p2World = p2Local.clone().applyMatrix4(groupRef.current.matrixWorld);
          
          const p1Cam = p1World.clone().applyMatrix4(camera.matrixWorldInverse);
          const p2Cam = p2World.clone().applyMatrix4(camera.matrixWorldInverse);
          
          if (p1Cam.z > 0 && p2Cam.z > 0) continue;
          
          const p1NDC = p1World.clone().project(camera);
          const p2NDC = p2World.clone().project(camera);
          
          const aspect = window.innerWidth / window.innerHeight;
          const v = new THREE.Vector2((p2NDC.x - p1NDC.x) * aspect, p2NDC.y - p1NDC.y);
          const w = new THREE.Vector2((rightHand.cursor.x - p1NDC.x) * aspect, rightHand.cursor.y - p1NDC.y);
          
          const c1 = w.dot(v);
          const c2 = v.dot(v);
          
          let distSq = 0;
          if (c1 <= 0) {
              distSq = w.lengthSq();
          } else if (c2 <= c1) {
              const dx = (rightHand.cursor.x - p2NDC.x) * aspect;
              const dy = rightHand.cursor.y - p2NDC.y;
              distSq = dx*dx + dy*dy;
          } else {
              const b = c1 / c2;
              const projX = p1NDC.x * aspect + b * v.x;
              const projY = p1NDC.y + b * v.y;
              const dx = rightHand.cursor.x * aspect - projX;
              const dy = rightHand.cursor.y - projY;
              distSq = dx*dx + dy*dy;
          }
          
          // 线段命中阈值：sqrt(0.003) ≈ 0.055，~5.5% 屏高
          if (distSq < 0.003 && distSq < closestDistSq) {
              closestDistSq = distSq;
              currentHovered = i;
          }
        }
        
        if (currentHovered !== prevHovered.current) {
            prevHovered.current = currentHovered;
            setHoveredLineIndex(currentHovered);
        }
        
        if (selectedLineIndex !== null && currentHovered !== selectedLineIndex) {
            setSelectedLineIndex(null);
        }
        
        if (rightPinching && !prevRightPinch.current) {
            if (currentHovered !== null) {
                if (selectedLineIndex === currentHovered) {
                    useARStore.getState().removeModelLine(currentHovered);
                    setSelectedLineIndex(null);
                    setHoveredLineIndex(null);
                    prevHovered.current = null;
                } else {
                    setSelectedLineIndex(currentHovered);
                }
            }
        }
      }
    } else {
        if (prevHovered.current !== null) {
            prevHovered.current = null;
            setHoveredLineIndex(null);
            setSelectedLineIndex(null);
        }
    }
    
    prevRightPinch.current = rightPinching;

    if (bothPinched) {
      setIsGrabbed(false); // Stop dragging if we start manipulating
      setIsRotating(false); // Stop single hand rotation
      prevRotateCursor.current = null;

      // 进入新一轮双手交互(prevPinchCenter 为 null) → 强制重置滤波器到当前光标
      // 避免从单手交互带过来的旧值导致首帧 EMA 跳一下
      const isFirstFrame = prevPinchCenter.current === null;
      if (isFirstFrame) {
        smoothLeft.current.valid = false;
        smoothRight.current.valid = false;
        leftXFilter.current.inited = false;
        leftYFilter.current.inited = false;
        rightXFilter.current.inited = false;
        rightYFilter.current.inited = false;
      }

      // ─── 0. 输入低通滤波：用 One-Euro Filter 吃掉 MediaPipe 抖动 ───
      // 比 EMA 更优：慢动作时强滤波，快动作时几乎零延迟
      const minCut = ROTATION_TUNING.oneEuroMinCutoff;
      const beta = ROTATION_TUNING.oneEuroBeta;
      const dCut = ROTATION_TUNING.oneEuroDcutoff;

      smoothLeft.current.x = oneEuroFilter(leftXFilter.current, leftHand.cursor.x, delta, minCut, beta, dCut);
      smoothLeft.current.y = oneEuroFilter(leftYFilter.current, leftHand.cursor.y, delta, minCut, beta, dCut);
      smoothLeft.current.valid = true;
      smoothRight.current.x = oneEuroFilter(rightXFilter.current, rightHand.cursor.x, delta, minCut, beta, dCut);
      smoothRight.current.y = oneEuroFilter(rightYFilter.current, rightHand.cursor.y, delta, minCut, beta, dCut);
      smoothRight.current.valid = true;

      const lx = smoothLeft.current.x, ly = smoothLeft.current.y;
      const rx = smoothRight.current.x, ry = smoothRight.current.y;

      // 1. SCALING: 两手在 NDC 下的距离
      const dist = Math.hypot(rx - lx, ry - ly);

      // 2. ROLL(Z): 两手连线角度
      const angle = Math.atan2(ry - ly, rx - lx);

      // 3. PITCH/YAW(X/Y): 两手中点位置；用 Arcball 投影 → 与单手语义一致
      const centerX = (lx + rx) / 2;
      const centerY = (ly + ry) / 2;

      if (prevPinchDist.current !== null && prevPinchAngle.current !== null && prevPinchCenter.current !== null) {
        const sens = adaptiveSensitivity(modelScale);

        // ── 缩放：乘性 factor + 死区 + 自适应 ──
        const factor = computeScaleFactor(prevPinchDist.current, dist);
        if (factor !== 1.0) {
          const newScale = Math.max(0.2, Math.min(10.0, modelScale * factor));
          useARStore.getState().setModelScale(newScale);
          prevPinchDist.current = dist;
        }

        // ── Roll: 帧率无关 + 单帧上限 + 死区 ──
        if (computeRollDelta(tmpQ.current, prevPinchAngle.current, angle)) {
          targetQuaternion.current.premultiply(tmpQ.current);
          prevPinchAngle.current = angle;
        }

        // ── Pitch/Yaw: 用 Arcball,把"两手中点"当作虚拟单手 ──
        // 这样和单手分支语义一致，且自带球面投影、无路径漂移。
        // 灵敏度按 modelScale 自适应，模型越大手势越柔。
        if (
          computeArcballDelta(
            tmpQ.current,
            prevPinchCenter.current.x,
            prevPinchCenter.current.y,
            centerX,
            centerY,
            ROTATION_TUNING.arcballGain * sens * 2.0, // 双手的中点位移幅度通常较小，乘 2 补偿
          )
        ) {
          targetQuaternion.current.premultiply(tmpQ.current);
          prevPinchCenter.current.set(centerX, centerY);
        }
      } else {
        prevPinchDist.current = dist;
        prevPinchAngle.current = angle;
        if (prevPinchCenter.current === null) {
          prevPinchCenter.current = new THREE.Vector2(centerX, centerY);
        } else {
          prevPinchCenter.current.set(centerX, centerY);
        }
      }
    } else {
      prevPinchDist.current = null;
      prevPinchAngle.current = null;
      prevPinchCenter.current = null;
      // 不在双手交互时，重置滤波器，避免下次进入时的"残留漂移"
      smoothLeft.current.valid = false;
      smoothRight.current.valid = false;
      rightXFilter.current.inited = false;
      rightYFilter.current.inited = false;

      if (leftPinching && !rightPinching) {
        raycaster.setFromCamera(leftHand.cursor, camera);
        
        if (!isGrabbed && !isRotating && !draggingExtRef.current) {
          // Attempt to grab extension points first
          let hitExt = false;
          if (groupRef.current) {
            const extHits = raycaster.intersectObjects(groupRef.current.children, true).filter(hit => hit.object.name && hit.object.name.startsWith('ext-'));
            if (extHits.length > 0) {
              const name = extHits[0].object.name; // ext-<idx>-before
              const parts = name.split('-');
              const idx = parseInt(parts[1]);
              const type = parts[2] as 'before' | 'after';
              const line = useARStore.getState().modelLines[idx];
              if (line) {
                const p1 = new THREE.Vector3(line.p1.x, line.p1.y, line.p1.z);
                const p2 = new THREE.Vector3(line.p2.x, line.p2.y, line.p2.z);
                const lineDir = new THREE.Vector3().subVectors(p2, p1).normalize();
                
                const localHit = groupRef.current.worldToLocal(extHits[0].point.clone());
                const vec = new THREE.Vector3().subVectors(localHit, type === 'before' ? p1 : p2);
                const hitDist = type === 'before' ? -vec.dot(lineDir) : vec.dot(lineDir);

                draggingExtRef.current = {
                  index: idx, type, p1, p2, initHitDist: hitDist,
                  initialExt: type === 'before' ? line.extendBefore : line.extendAfter
                };
                dragPlaneZ.current = extHits[0].point.z;
                hitExt = true;
              }
            }
          }

          if (!hitExt) {
            // Attempt to grab model
            let hitModel = false;
            if (meshRef.current) {
              const hits = raycaster.intersectObject(meshRef.current);
              if (hits.length > 0) {
                setIsGrabbed(true);
                const hitPoint = hits[0].point;
                grabOffset.current.copy(groupRef.current!.position).sub(hitPoint);
                // 锁定初始抓取深度的 Z 坐标值，避免基准面漂移导致"橡皮筋"迟滞感
                dragPlaneZ.current = hitPoint.z;
                hitModel = true;
              }
            }
            if (!hitModel) {
              // 捏在模型之外的空白区域：启动 Arcball 单手旋转
              setIsRotating(true);
              prevRotateCursor.current = leftHand.cursor.clone();
              // 重置左手滤波器，以光标当前位置为起点
              smoothLeft.current.x = leftHand.cursor.x;
              smoothLeft.current.y = leftHand.cursor.y;
              smoothLeft.current.valid = true;
              leftXFilter.current.inited = false;
              leftYFilter.current.inited = false;
            }
          }
        } else if (draggingExtRef.current) {
          // Drag extension
          const extInfo = draggingExtRef.current;
          raycaster.setFromCamera(leftHand.cursor, camera);
          dragPlane.setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1), 
            new THREE.Vector3(0, 0, dragPlaneZ.current)
          );
          const targetPos = new THREE.Vector3();
          raycaster.ray.intersectPlane(dragPlane, targetPos);
          if (targetPos && groupRef.current) {
             groupRef.current.worldToLocal(targetPos);
             const lineDir = new THREE.Vector3().subVectors(extInfo.p2, extInfo.p1).normalize();
             let rawDist = 0;
             if (extInfo.type === 'before') {
                 const vec = new THREE.Vector3().subVectors(targetPos, extInfo.p1);
                 rawDist = -vec.dot(lineDir);
             } else {
                 const vec = new THREE.Vector3().subVectors(targetPos, extInfo.p2);
                 rawDist = vec.dot(lineDir);
             }
             const deltaDist = rawDist - extInfo.initHitDist;
             const newExt = Math.max(0, extInfo.initialExt + deltaDist);
             
             const line = useARStore.getState().modelLines[extInfo.index];
             if (line) {
                 useARStore.getState().updateLineExtension(
                     extInfo.index,
                     extInfo.type === 'before' ? newExt : line.extendBefore,
                     extInfo.type === 'after' ? newExt : line.extendAfter
                 );
             }
          }
        } else if (isGrabbed) {
          // 抓取模型平移：使用锁定的固定 Z 轴深度投影面进行计算
          raycaster.setFromCamera(leftHand.cursor, camera);
          dragPlane.setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1), 
            new THREE.Vector3(0, 0, dragPlaneZ.current)
          );

          const targetPos = new THREE.Vector3();
          raycaster.ray.intersectPlane(dragPlane, targetPos);
          
          if (targetPos) {
            targetPos.add(grabOffset.current);
            // 帧率无关的 lerp(基于半衰期)
            const dragAlpha = smoothingAlpha(delta, ROTATION_TUNING.dragHalfLife);
            groupRef.current!.position.lerp(targetPos, dragAlpha);
          }
        } else if (isRotating && prevRotateCursor.current) {
          // ── 单手 Arcball 空滑旋转 ──
          // 1) One-Euro 滤波光标，慢动作时强滤波吃抖动，快动作时几乎零延迟
          const minCut = ROTATION_TUNING.oneEuroMinCutoff;
          const beta = ROTATION_TUNING.oneEuroBeta;
          const dCut = ROTATION_TUNING.oneEuroDcutoff;
          smoothLeft.current.x = oneEuroFilter(leftXFilter.current, leftHand.cursor.x, delta, minCut, beta, dCut);
          smoothLeft.current.y = oneEuroFilter(leftYFilter.current, leftHand.cursor.y, delta, minCut, beta, dCut);

          // 2) 调用 Arcball 算法，得到与路径无关的旋转
          const sens = adaptiveSensitivity(modelScale);
          if (
            computeArcballDelta(
              tmpQ.current,
              prevRotateCursor.current.x,
              prevRotateCursor.current.y,
              smoothLeft.current.x,
              smoothLeft.current.y,
              ROTATION_TUNING.arcballGain * sens * 2.5, // 单手手势幅度通常较大，灵敏度可以稍高
            )
          ) {
            targetQuaternion.current.premultiply(tmpQ.current);
            prevRotateCursor.current.set(smoothLeft.current.x, smoothLeft.current.y);
          }
        }
      } else {
        // 松开左手：清空单手交互状态
        setIsGrabbed(false);
        setIsRotating(false);
        draggingExtRef.current = null;
        prevRotateCursor.current = null;
        // 同步重置左手滤波器，下次进入交互时重新从当前位置初始化
        leftXFilter.current.inited = false;
        leftYFilter.current.inited = false;
      }
    }

    // 使用 Slerp 球形插值平滑逼近目标旋转四元数，
    // 帧率无关：经过 slerpHalfLife 秒，剩余误差衰减一半。
    if (groupRef.current) {
      const slerpAlpha = smoothingAlpha(delta, ROTATION_TUNING.slerpHalfLife);
      groupRef.current.quaternion.slerp(targetQuaternion.current, slerpAlpha);
    }

    // ====== 写字到 3D 模型表面 ======
    // 触发条件：
    //   - 画笔激活、非橡皮擦、非连线模式
    //   - 右手可见且捏合
    //   - 不在双手手势 / 左手抓取 / 缩放中
    //   - raycaster 命中模型
    // 笔迹存储在模型局部坐标系，由 group 渲染，
    // 因此模型旋转/平移/缩放时笔迹会跟着走。
    const penState = useARStore.getState();
    const canDrawOnSurface =
      penState.isPenActive &&
      !penState.isLineDrawingActive &&
      !penState.isXYZDrawingActive &&
      !penState.isEraser &&
      rightHand.isVisible &&
      rightPinching &&
      !leftPinching &&
      !bothPinched &&
      !isGrabbed &&
      meshRef.current &&
      groupRef.current;

    if (canDrawOnSurface) {
      raycaster.setFromCamera(rightHand.cursor, camera);
      meshRef.current!.updateMatrixWorld();
      const hits = raycaster.intersectObject(meshRef.current!, false);
      if (hits.length > 0) {
        // 命中点是世界坐标，转换到 group 局部坐标系
        const localPt = groupRef.current!.worldToLocal(hits[0].point.clone());

        // 通知 Canvas2D 暂停 2D 写字，避免同一笔同时落到 2D 画布
        if (!useARStore.getState().isWritingOnSurface) {
          useARStore.getState().setWritingOnSurface(true);
        }

        if (activeSurfaceStrokeId.current === null) {
          // 起笔：开新 stroke
          const id = useARStore.getState().beginSurfaceStroke(
            penState.penColor,
            penState.penThickness * 2
          );
          activeSurfaceStrokeId.current = id;
          lastSurfacePoint.current = localPt.clone();
          useARStore.getState().appendSurfaceStrokePoint(id, {
            x: localPt.x, y: localPt.y, z: localPt.z,
          });
        } else {
          // 续笔：距离上一点足够远才追加（节流，避免点爆炸）
          const minDistSq = 0.0008; // ≈ 0.028 单位的局部距离
          const last = lastSurfacePoint.current;
          if (!last || localPt.distanceToSquared(last) > minDistSq) {
            useARStore.getState().appendSurfaceStrokePoint(
              activeSurfaceStrokeId.current,
              { x: localPt.x, y: localPt.y, z: localPt.z }
            );
            lastSurfacePoint.current = localPt.clone();
          }
        }
      } else {
        // 笔在空中：当前 stroke 收尾，下次命中再起一笔
        if (activeSurfaceStrokeId.current !== null) {
          useARStore.getState().endSurfaceStroke();
          activeSurfaceStrokeId.current = null;
          lastSurfacePoint.current = null;
        }
        if (useARStore.getState().isWritingOnSurface) {
          useARStore.getState().setWritingOnSurface(false);
        }
      }
    } else if (activeSurfaceStrokeId.current !== null) {
      // 松开捏合 / 切换工具 / 模型消失：收尾当前 stroke
      useARStore.getState().endSurfaceStroke();
      activeSurfaceStrokeId.current = null;
      lastSurfacePoint.current = null;
      if (useARStore.getState().isWritingOnSurface) {
        useARStore.getState().setWritingOnSurface(false);
      }
    } else if (useARStore.getState().isWritingOnSurface) {

      useARStore.getState().setWritingOnSurface(false);
    }
  });

  const activeTab = useARStore(state => state.activeTab);
  const modelLines = useARStore(state => state.modelLines);
  const activeLineStart = useARStore(state => state.activeLineStart);
  const isXYZDrawingActive = useARStore(state => state.isXYZDrawingActive);
  const surfaceStrokes = useARStore(state => state.surfaceStrokes);
  const showAllLengths = useARStore(state => state.showAllLengths);

  // 获取当前预设模型的顶点标签
  const presetLabels = activeModel ? (PRESET_VERTEX_LABELS[activeModel] || []) : [];

  // 预设模型棱边长度标注数据
  const presetEdgeLabels = useMemo(() => {
    if (!activeModel || !showAllLengths) return [];
    const edges = PRESET_EDGE_DEFS[activeModel];
    const vertices = PRESET_VERTEX_LABELS[activeModel];
    if (!edges || !vertices) return [];
    return edges.map(([i, j]) => {
      const v1 = vertices[i];
      const v2 = vertices[j];
      const p1 = new THREE.Vector3(v1.x, v1.y, v1.z);
      const p2 = new THREE.Vector3(v2.x, v2.y, v2.z);
      const label = p1.clone().multiply(logicalScale).distanceTo(p2.clone().multiply(logicalScale)).toFixed(0);
      return { p1, p2, label, key: `${v1.label}-${v2.label}` };
    });
  }, [activeModel, showAllLengths, logicalScale]);

  // 自定义模型棱边长度标注数据
  const customEdgeLabels = useMemo(() => {
    if (!activeCustomModel || !showAllLengths) return [];
    return activeCustomModel.edges.map((edge, idx) => {
      const v1 = activeCustomModel.vertices[edge[0]];
      const v2 = activeCustomModel.vertices[edge[1]];
      if (!v1 || !v2) return null;
      const p1 = new THREE.Vector3(v1.x, v1.y, v1.z);
      const p2 = new THREE.Vector3(v2.x, v2.y, v2.z);
      const label = p1.clone().multiply(logicalScale).distanceTo(p2.clone().multiply(logicalScale)).toFixed(0);
      return { p1, p2, label, key: `custom-edge-${idx}` };
    }).filter(Boolean) as { p1: THREE.Vector3; p2: THREE.Vector3; label: string; key: string }[];
  }, [activeCustomModel, showAllLengths, logicalScale]);

  return (
    <group ref={groupRef} position={[0, 0, -2]}>
      {hasActiveModel && (
        <group>
          {/* ========== 预设几何体 ========== */}
          {activeModel === 'cube' && (
            <Box ref={meshRef as any} args={[1.2, 1.2, 1.2]}>
              <GlassMaterial />
              <Edges linewidth={2} threshold={15} color="#ffffff" />
            </Box>
          )}
          {activeModel === 'sphere' && (
            <Sphere ref={meshRef as any} args={[0.8, 16, 16]}>
              <GlassMaterial />
            </Sphere>
          )}
          {activeModel === 'cylinder' && (
            <Cylinder ref={meshRef as any} args={[0.6, 0.6, 1.6, 16]}>
              <GlassMaterial />
              <Edges linewidth={2} threshold={45} color="#ffffff" />
            </Cylinder>
          )}
          {activeModel === 'cone' && (
            <Cone ref={meshRef as any} args={[0.8, 1.5, 16]}>
              <GlassMaterial />
              <Edges linewidth={2} threshold={45} color="#ffffff" />
            </Cone>
          )}
          {activeModel === 'pyramid' && (
            <Tetrahedron ref={meshRef as any} args={[1.2, 0]}>
              <GlassMaterial />
              <Edges linewidth={2} threshold={15} color="#ffffff" />
            </Tetrahedron>
          )}

          {/* 预设模型的顶点字母标记 */}
          {activeModel && presetLabels.length > 0 && (
            <VertexLabels vertices={presetLabels} />
          )}

          {/* ========== AI 生成的自定义几何体 ========== */}
          {activeCustomModel && (
            <>
              <CustomGeometry model={activeCustomModel} meshRef={meshRef} />
              <CustomEdges model={activeCustomModel} />
              <VertexLabels vertices={activeCustomModel.vertices} />
            </>
          )}

          {/* ========== 棱边长度自动标注 ========== */}
          {presetEdgeLabels.map(({ p1, p2, label, key }) => (
            <LineLengthLabel
              key={key}
              p1={p1}
              p2={p2}
              label={label}
              color="rgba(255,255,255,0.8)"
              offset={0.06}
            />
          ))}
          {customEdgeLabels.map(({ p1, p2, label, key }) => (
            <LineLengthLabel
              key={key}
              p1={p1}
              p2={p2}
              label={label}
              color="rgba(255,255,255,0.8)"
              offset={0.06}
            />
          ))}
          
          {/* Render User Drawn Lines connecting vertices */}
          {modelLines.map((line, idx) => {
            const p1 = new THREE.Vector3(line.p1.x, line.p1.y, line.p1.z);
            const p2 = new THREE.Vector3(line.p2.x, line.p2.y, line.p2.z);
            const isHovered = hoveredLineIndex === idx;
            const isSelected = selectedLineIndex === idx;

            // 辅助线：银灰色虚线；普通线：金黄实线
            const baseColor = line.isAuxiliary ? "#94a3b8" : "#facc15";
            const color = isSelected ? "#ef4444" : isHovered ? "#38bdf8" : baseColor;
            const width = isSelected ? 8 : isHovered ? 7 : (line.isAuxiliary ? 3 : 5);

            // 计算延伸端点
            const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
            const extP1 = line.isAuxiliary
              ? p1.clone().sub(dir.clone().multiplyScalar(line.extendBefore))
              : null;
            const extP2 = line.isAuxiliary
              ? p2.clone().add(dir.clone().multiplyScalar(line.extendAfter))
              : null;

            return (
              <group key={line.id}>
                {/* 主线段 */}
                <Line
                  points={[p1, p2]}
                  color={color}
                  lineWidth={width}
                  depthTest={false}
                  {...(line.isAuxiliary ? { dashed: true, dashSize: 0.08, gapSize: 0.04, dashScale: 1 } : {})}
                />
                 {/* 辅助线延伸部分（更细的虚线） */}
                 {extP1 && line.extendBefore > 0 && (
                   <Line
                     points={[extP1, p1]}
                     color={line.isAuxiliary ? "#64748b" : "#d4a017"}
                     lineWidth={Math.max(1, width - 2)}
                     depthTest={false}
                     dashed
                     dashSize={0.04}
                     gapSize={0.04}
                     dashScale={1}
                   />
                 )}
                 {extP2 && line.extendAfter > 0 && (
                   <Line
                     points={[p2, extP2]}
                     color={line.isAuxiliary ? "#64748b" : "#d4a017"}
                     lineWidth={Math.max(1, width - 2)}
                     depthTest={false}
                     dashed
                     dashSize={0.04}
                     gapSize={0.04}
                     dashScale={1}
                   />
                 )}
                {/* 延伸端点小球 */}
                {extP1 && (
                  <mesh name={`ext-${idx}-before`} position={[extP1.x, extP1.y, extP1.z]}>
                    <sphereGeometry args={[0.025, 8, 8]} />
                    <meshBasicMaterial color="#64748b" depthTest={false} transparent opacity={0.6} />
                  </mesh>
                )}
                {extP2 && (
                  <mesh name={`ext-${idx}-after`} position={[extP2.x, extP2.y, extP2.z]}>
                    <sphereGeometry args={[0.025, 8, 8]} />
                    <meshBasicMaterial color="#64748b" depthTest={false} transparent opacity={0.6} />
                  </mesh>
                )}
                {/* 长度标注 */}
                {line.showLength && (
                  <LineLengthLabel
                    p1={p1}
                    p2={p2}
                    label={p1.clone().multiply(logicalScale).distanceTo(p2.clone().multiply(logicalScale)).toFixed(0)}
                    color={line.isAuxiliary ? "rgba(148,163,184,0.95)" : "rgba(250,204,21,0.95)"}
                  />
                )}
              </group>
            );
          })}

            {/* Selected line floating context menu */}
            {selectedLineIndex !== null && modelLines[selectedLineIndex] && (
              (() => {
                const line = modelLines[selectedLineIndex];
                const p1 = new THREE.Vector3(line.p1.x, line.p1.y, line.p1.z);
                const p2 = new THREE.Vector3(line.p2.x, line.p2.y, line.p2.z);
                const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                return (
                  <group position={[midPoint.x, midPoint.y, midPoint.z]}>
                    <Html center zIndexRange={[150, 0]}>
                      <div className="flex flex-col gap-1.5 p-2 bg-slate-900/95 border border-slate-700/80 backdrop-blur-md rounded-xl shadow-2xl text-white text-xs select-none w-36 pointer-events-auto">
                        <div className="text-[10px] text-slate-400 font-bold border-b border-slate-700 pb-1 mb-1 text-center">
                          编辑已选线段
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useARStore.getState().toggleLineAuxiliary(selectedLineIndex);
                          }}
                          className={`w-full py-1 px-2 rounded-lg font-medium transition-all text-left flex items-center justify-between ${
                            line.isAuxiliary 
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-transparent'
                          }`}
                        >
                          <span>辅助虚线</span>
                          <span className="text-[10px] opacity-80">{line.isAuxiliary ? '开' : '关'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useARStore.getState().toggleLineLength(selectedLineIndex);
                          }}
                          className={`w-full py-1 px-2 rounded-lg font-medium transition-all text-left flex items-center justify-between ${
                            line.showLength 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-transparent'
                          }`}
                        >
                          <span>显示长度</span>
                          <span className="text-[10px] opacity-80">{line.showLength ? '开' : '关'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useARStore.getState().removeModelLine(selectedLineIndex);
                            setSelectedLineIndex(null);
                          }}
                          className="w-full py-1 px-2 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-500/30 text-red-300 font-medium transition-all text-left flex items-center justify-between"
                        >
                          <span>删除线段</span>
                          <span>✕</span>
                        </button>
                      </div>
                    </Html>
                  </group>
                );
              })()
            )}

            {/* Render handwriting on the 3D surface (in local coordinates) */}
          {surfaceStrokes.map((stroke) => {
            if (stroke.points.length < 2) return null;
            const pts = stroke.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
            return (
              <Line
                key={stroke.id}
                points={pts}
                color={stroke.color}
                lineWidth={stroke.thickness}
                depthTest={false}
              />
            );
          })}
          
          {/* Highlight active vertex selection */}
          {activeLineStart && (
             <mesh position={[activeLineStart.x, activeLineStart.y, activeLineStart.z]}>
                <sphereGeometry args={[0.08, 16, 16]} />
                <meshBasicMaterial color="#ef4444" depthTest={false} />
             </mesh>
          )}

          {/* Hover visualizer */}
          <mesh ref={hoverSphereRef as any} visible={false}>
             <sphereGeometry args={[1, 16, 16]} />
             <meshBasicMaterial color="#e2e8f0" depthTest={false} transparent opacity={0.8} />
          </mesh>

          {/* Smart Inference Snapping Indicator (SolidWorks style - clean and minimal) */}
          {inferenceActive && (
            <group ref={inferenceTargetGroupRef}>
              <Html center zIndexRange={[120, 0]}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    border: '1px solid #facc15',
                    backgroundColor: '#1e293b',
                    color: '#facc15',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                  }}
                  title={
                    inferenceActive.type === 'parallel' ? `平行于 ${inferenceActive.refName}` :
                    inferenceActive.type === 'perpendicular' ? `垂直于 ${inferenceActive.refName}` :
                    `对齐 ${inferenceActive.refName}`
                  }
                >
                  {inferenceActive.type === 'parallel' && '∥'}
                  {inferenceActive.type === 'perpendicular' && '⊥'}
                  {inferenceActive.type === 'axis' && '⇳'}
                </div>
              </Html>
            </group>
          )}

          {/* XYZ Axis Guide Lines for XYZ mode */}
          {isXYZDrawingActive && activeLineStart && (() => {
            const S = new THREE.Vector3(activeLineStart.x, activeLineStart.y, activeLineStart.z);
            return (
              <group>
                {/* X axis (Red) */}
                <Line
                  points={[[S.x - 15, S.y, S.z], [S.x + 15, S.y, S.z]]}
                  color="#ef4444"
                  lineWidth={2}
                  depthTest={false}
                  transparent
                  opacity={0.8}
                />
                {/* Y axis (Green) */}
                <Line
                  points={[[S.x, S.y - 15, S.z], [S.x, S.y + 15, S.z]]}
                  color="#10b981"
                  lineWidth={2}
                  depthTest={false}
                  transparent
                  opacity={0.8}
                />
                {/* Z axis (Blue) */}
                <Line
                  points={[[S.x, S.y, S.z - 15], [S.x, S.y, S.z + 15]]}
                  color="#3b82f6"
                  lineWidth={2}
                  depthTest={false}
                  transparent
                  opacity={0.8}
                />
              </group>
            );
          })()}

          {/* Preview line - 使用稳定的 useMemo 对象避免每帧重建 */}
          <primitive object={previewLineObj} ref={previewLineRef as any} visible={false} />
        </group>
      )}
    </group>
  );
}
