import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box, Sphere, Cylinder, Cone, Tetrahedron, Edges, Line, Text, Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useARStore, Point3D, CustomModel, MathShape } from '../store';
import { triangulateFaces } from '../lib/geometry';

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
        const offset = 0.15; // 偏移距离
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
                fontSize: '18px',
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
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const prevHovered = useRef<number | null>(null);

  const grabOffset = useRef(new THREE.Vector3());
  const prevPinchDist = useRef<number | null>(null);
  const prevPinchAngle = useRef<number | null>(null);
  const prevPinchCenter = useRef<THREE.Vector2 | null>(null);
  const targetRotation = useRef(new THREE.Euler(0, 0, 0, 'XYZ'));
  
  // Ref to prevent multiple click triggers in a single pinch
  const prevRightPinch = useRef(false);

  const { camera, raycaster } = useThree();
  const activeModel = useARStore(state => state.activeModel);
  const activeCustomModelId = useARStore(state => state.activeCustomModelId);
  const customModels = useARStore(state => state.customModels);
  const snapPointsRef = useRef<THREE.Vector3[]>([]);

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
      groupRef.current.rotation.set(0, 0, 0);
      targetRotation.current.set(0, 0, 0);
    }
  }, [activeModel, activeCustomModelId]);

  useEffect(() => {
    if (!meshRef.current || !hasActiveModel) return;
    const geom = (meshRef.current as any).geometry as THREE.BufferGeometry;
    if (!geom) return;

    try {
        const edgeGeom = new THREE.EdgesGeometry(geom, activeModel === 'sphere' ? 15 : 45);
        const pos = edgeGeom.attributes.position;
        const points: THREE.Vector3[] = [];
        
        if (pos) {
          for (let i = 0; i < pos.count; i += 2) {
            const p1 = new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i);
            const p2 = new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i + 1);
            
            points.push(p1);
            points.push(p2);
            points.push(p1.clone().lerp(p2, 1/3));
            points.push(p1.clone().lerp(p2, 0.5));
            points.push(p1.clone().lerp(p2, 2/3));
          }
        }

        const origPos = geom.attributes.position;
        if (origPos) {
          for (let i = 0; i < origPos.count; i++) {
              points.push(new THREE.Vector3().fromBufferAttribute(origPos as THREE.BufferAttribute, i));
          }
        }
        
        // Remove duplicates
        const uniquePoints: THREE.Vector3[] = [];
        points.forEach(p => {
          if (!uniquePoints.some(up => up.distanceToSquared(p) < 0.001)) {
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
    const { leftHand, rightHand, modelScale, activeTab } = useARStore.getState();

    // Scale smoothing
    if (groupRef.current) {
      groupRef.current.scale.lerp(new THREE.Vector3(modelScale, modelScale, modelScale), 0.15);
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

    const isEraser = useARStore.getState().isEraser;
    const isLineDrawingActive = useARStore.getState().isLineDrawingActive;
    const modelLinesStore = useARStore.getState().modelLines;

    // Only allow vertex connection if line drawing is active and not erasing
    if (isLineDrawingActive && !isEraser && rightHand.isVisible && !leftPinching) {
      raycaster.setFromCamera(rightHand.cursor, camera);
      const ray = raycaster.ray;

      if (meshRef.current) {
        meshRef.current.updateMatrixWorld();
        const geom = (meshRef.current as any).geometry as THREE.BufferGeometry;
        const posAttr = geom.attributes.position;
        
        let closestDistSq = Infinity;
        
        for (let i = 0; i < snapPointsRef.current.length; i++) {
          const vLocal = snapPointsRef.current[i];
          const vWorld = vLocal.clone().applyMatrix4(meshRef.current.matrixWorld);
          
          // To ensure we don't snap to vertices behind the camera
          const vCam = vWorld.clone().applyMatrix4(camera.matrixWorldInverse);
          if (vCam.z > 0) continue; 
          
          // Project to NDC screen space
          const vNDC = vWorld.clone().project(camera);
          
          // Aspect ratio correction for distance
          const aspect = window.innerWidth / window.innerHeight;
          const dx = (vNDC.x - rightHand.cursor.x) * aspect;
          const dy = vNDC.y - rightHand.cursor.y;
          const distSq = dx*dx + dy*dy;
          
          // ~0.1 in NDC space corresponds to ~5% of screen width.
          if (distSq < 0.02 && distSq < closestDistSq) {
            closestDistSq = distSq;
            closestVertLocal.copy(vLocal);
            foundVertex = true;
          }
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

          if (rightPinching && !prevRightPinch.current) {
            const pt: Point3D = { x: closestVertLocal.x, y: closestVertLocal.y, z: closestVertLocal.z };
            const store = useARStore.getState();
            if (store.activeLineStart) {
              store.addModelLine(store.activeLineStart, pt);
              store.setActiveLineStart(null);
            } else {
              store.setActiveLineStart(pt);
            }
          }
        }
      }

      // Handle Preview Line
      const store = useARStore.getState();
      if (store.activeLineStart && previewLineRef.current) {
         const start = store.activeLineStart;
         const lineGeom = previewLineRef.current.geometry;
         const pos = lineGeom.attributes.position.array as Float32Array;
         if (pos) {
           pos[0] = start.x; pos[1] = start.y; pos[2] = start.z;
           
           if (foundVertex) {
             pos[3] = closestVertLocal.x; pos[4] = closestVertLocal.y; pos[5] = closestVertLocal.z;
           } else {
             let dist = 5; 
             if (groupRef.current) dist = groupRef.current.position.distanceTo(camera.position);
             const cursorPtWorld = ray.at(dist, new THREE.Vector3());
             let cursorPtLocal = cursorPtWorld;
             if (groupRef.current) cursorPtLocal = groupRef.current.worldToLocal(cursorPtWorld);
             
             pos[3] = cursorPtLocal.x; pos[4] = cursorPtLocal.y; pos[5] = cursorPtLocal.z;
           }
           
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
          const p1Local = new THREE.Vector3(line[0].x, line[0].y, line[0].z);
          const p2Local = new THREE.Vector3(line[1].x, line[1].y, line[1].z);
          
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
          
          // Threshold for line hover (~5% of screen width squared)
          if (distSq < 0.005 && distSq < closestDistSq) {
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

      // 1. SCALING: Screen distance between the two user pinches
      const dist = leftHand.cursor.distanceTo(rightHand.cursor);
      
      // 2. ROTATION Z (Roll): Angle between the two hands
      const dx = rightHand.cursor.x - leftHand.cursor.x;
      const dy = rightHand.cursor.y - leftHand.cursor.y;
      const angle = Math.atan2(dy, dx);

      // 3. ROTATION X/Y (Pitch/Yaw): Movement of the center point between hands
      const centerX = (leftHand.cursor.x + rightHand.cursor.x) / 2;
      const centerY = (leftHand.cursor.y + rightHand.cursor.y) / 2;
      const centerVec = new THREE.Vector2(centerX, centerY);
      
      if (prevPinchDist.current !== null && prevPinchAngle.current !== null && prevPinchCenter.current !== null) {
        // Apply Scaling
        const deltaDist = dist - prevPinchDist.current;
        const newScale = Math.max(0.2, Math.min(10.0, modelScale + deltaDist * 5.0));
        useARStore.getState().setModelScale(newScale);

        // Apply Roll (Z) - Twist arms
        let deltaAngle = angle - prevPinchAngle.current;
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        targetRotation.current.z -= deltaAngle * 1.5;

        // Apply Pitch/Yaw (X/Y) - Move hands together across screen
        const deltaCenter = centerVec.clone().sub(prevPinchCenter.current);
        targetRotation.current.x += deltaCenter.y * 3.0; // Y movement affects X rotation
        targetRotation.current.y += deltaCenter.x * 3.0; // X movement affects Y rotation
      }
      prevPinchDist.current = dist;
      prevPinchAngle.current = angle;
      prevPinchCenter.current = centerVec;
    } else {
      prevPinchDist.current = null;
      prevPinchAngle.current = null;
      prevPinchCenter.current = null;

      if (leftPinching && !rightPinching) {
        raycaster.setFromCamera(leftHand.cursor, camera);
        
        if (!isGrabbed) {
          // Attempt to grab
          if (meshRef.current) {
            const hits = raycaster.intersectObject(meshRef.current);
            if (hits.length > 0) {
              setIsGrabbed(true);
              const hitPoint = hits[0].point;
              grabOffset.current.copy(groupRef.current!.position).sub(hitPoint);
            }
          }
        }
      } else {
        // Release
        setIsGrabbed(false);
      }
    }

    // Process single hand drag
    if (isGrabbed && leftPinching && !rightPinching) {
      raycaster.setFromCamera(leftHand.cursor, camera);
      const planeZ = groupRef.current!.position.z - grabOffset.current.z;
      dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1), 
        new THREE.Vector3(0, 0, planeZ)
      );

      const targetPos = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, targetPos);
      
      if (targetPos) {
        targetPos.add(grabOffset.current);
        
        // Smoothly interpolate position
        groupRef.current!.position.lerp(targetPos, 0.2);
      }

    }

    // Smoothly apply target rotation to the actual geometry
    if (groupRef.current) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotation.current.x, 0.15);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation.current.y, 0.15);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetRotation.current.z, 0.15);
    }
  });

  const activeTab = useARStore(state => state.activeTab);
  const modelLines = useARStore(state => state.modelLines);
  const activeLineStart = useARStore(state => state.activeLineStart);

  // 获取当前预设模型的顶点标签
  const presetLabels = activeModel ? (PRESET_VERTEX_LABELS[activeModel] || []) : [];

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
          
          {/* Render User Drawn Lines connecting vertices */}
          {modelLines.map((line, idx) => {
            const p1 = new THREE.Vector3(line[0].x, line[0].y, line[0].z);
            const p2 = new THREE.Vector3(line[1].x, line[1].y, line[1].z);
            const isHovered = hoveredLineIndex === idx;
            const isSelected = selectedLineIndex === idx;
            const color = isSelected ? "#ef4444" : isHovered ? "#38bdf8" : "#facc15";
            const width = isSelected ? 8 : isHovered ? 7 : 5;
            return (
              <Line 
                key={idx} 
                points={[p1, p2]}
                color={color} 
                lineWidth={width}
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

          {/* Preview line - 使用稳定的 useMemo 对象避免每帧重建 */}
          <primitive object={previewLineObj} ref={previewLineRef as any} visible={false} />
        </group>
      )}
    </group>
  );
}
