import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { generateAllFieldLines } from '../../math/physics';

interface LenzFieldLinesProps {
  radius: number;
  inducedCurrentRef: React.MutableRefObject<number>;
  solenoidCurrent?: number;
  position?: [number, number, number];
}

export const LenzFieldLines: React.FC<LenzFieldLinesProps> = ({ radius, inducedCurrentRef, solenoidCurrent = 0, position = [0, 0, 0] }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const alphaAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maxParticles = 1000; 
  const alphasBuffer = useMemo(() => new Float32Array(maxParticles).fill(1.0), []);
  const timeRef = useRef(0);
  const lineMaterialsRef = useRef<any[]>([]);

  // 1. Generate base field lines for the solenoid (strength = 1 for positive direction)
  const linesData = useMemo(() => {
    const fakeMagnets = [{
      id: 'lenz-dummy',
      name: '感应磁场',
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, Math.PI / 2] as [number, number, number],
      strength: 1.0, 
      length: 4,
      width: radius,
      shape: 'cylinder' as const
    }];
    
    // We use a lower density for the induced field to not clutter the screen
    const { lines } = generateAllFieldLines(fakeMagnets, 8, 0.2, 100);
    const color = new THREE.Color("#10b981"); // 翠绿色，代表感应场

    return lines.map((lineData, idx) => {
      const path = lineData.path;
      const points: [number, number, number][] = [];
      const colors: [number, number, number][] = [];
      for (let j = 0; j < path.length; j++) {
        const p = path[j];
        points.push([p.x, p.y, p.z]);
        colors.push([color.r, color.g, color.b]);
      }
      return { id: idx, points, colors, originalPoints: path };
    });
  }, [radius]);

  // 2. Real-time update in useFrame based on inducedCurrentRef
  useFrame((_, delta) => {
    const current = (inducedCurrentRef.current * 100) + solenoidCurrent;
    const absCurrent = Math.abs(current);
    
    if (absCurrent === 0) {
      if (instancedMeshRef.current) {
        instancedMeshRef.current.count = 0;
      }
      lineMaterialsRef.current.forEach(mat => {
        if (mat) {
          mat.opacity = 0;
          mat.needsUpdate = true;
        }
      });
      return;
    }
    
    // 如果电流为0，强制流动方向为正（避免卡死），但透明度为0
    const sign = current < 0 ? -1 : 1; 
    
    // 动态调整透明度，只有电流大于 0.01 才开始渐渐显现
    const targetOpacity = Math.min(0.8, Math.max(0, (absCurrent - 0.01) * 3.0));

    // 更新固态线框的透明度
    lineMaterialsRef.current.forEach(mat => {
      if (mat) {
        mat.opacity = targetOpacity;
        mat.transparent = true;
        mat.needsUpdate = true;
      }
    });

    if (!instancedMeshRef.current || linesData.length === 0 || targetOpacity <= 0) {
      if (instancedMeshRef.current) {
        instancedMeshRef.current.count = 0;
      }
      return;
    }

    // 更新流动粒子的速度与方向 (楞次定律方向体现)
    const speed = sign * (1.5 + absCurrent * 3.0);
    timeRef.current += delta * speed * 0.22;

    let particleIdx = 0;
    const particlesPerLine = 2;
    const maxP = linesData.length * particlesPerLine;

    for (let i = 0; i < linesData.length; i++) {
      const linePoints = linesData[i].originalPoints;
      const numPoints = linePoints.length;
      if (numPoints < 2) continue;

      for (let j = 0; j < particlesPerLine; j++) {
        if (particleIdx >= maxP) break;

        const phaseOffset = j / particlesPerLine;
        let progress = (timeRef.current + phaseOffset) % 1.0;
        if (progress < 0) progress += 1.0; // 保证 progress 在 0~1 之间

        const rawIdx = progress * (numPoints - 1);
        const idx0 = Math.floor(rawIdx);
        const idx1 = Math.min(numPoints - 1, idx0 + 1);
        const frac = rawIdx - idx0;

        const p0 = linePoints[idx0];
        const p1 = linePoints[idx1];

        const py = p0.y + (p1.y - p0.y) * frac;
        dummy.position.set(
          p0.x + (p1.x - p0.x) * frac,
          py,
          p0.z + (p1.z - p0.z) * frac,
        );

        const scaleVal = 0.08 * (1.0 - Math.pow(2.0 * progress - 1.0, 4.0));
        dummy.scale.setScalar(Math.max(0.015, scaleVal) * 1.5);

        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(particleIdx, dummy.matrix);

        alphasBuffer[particleIdx] = targetOpacity;
        particleIdx++;
      }
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (alphaAttrRef.current) alphaAttrRef.current.needsUpdate = true;
    instancedMeshRef.current.count = particleIdx;
    
    if (instancedMeshRef.current.material) {
        (instancedMeshRef.current.material as THREE.Material).opacity = targetOpacity;
    }
  });

  return (
    <group position={position}>
      {linesData.map((data, i) => (
        <Line
          key={data.id}
          points={data.points}
          vertexColors={data.colors}
          lineWidth={2}
          ref={(r) => { if(r) lineMaterialsRef.current[i] = r.material; }}
        />
      ))}
      <instancedMesh
        ref={instancedMeshRef}
        args={[null as any, null as any, maxParticles]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]}>
          <instancedBufferAttribute
            ref={alphaAttrRef}
            attach="attributes-instanceAlpha"
            args={[alphasBuffer, 1]}
          />
        </sphereGeometry>
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0.0}
          onBeforeCompile={(shader) => {
            shader.vertexShader = `
              attribute float instanceAlpha;
              varying float vInstanceAlpha;
              ${shader.vertexShader}
            `.replace(
              `#include <begin_vertex>`,
              `#include <begin_vertex>
               vInstanceAlpha = instanceAlpha;`
            );
            shader.fragmentShader = `
              varying float vInstanceAlpha;
              ${shader.fragmentShader}
            `.replace(
              `vec4 diffuseColor = vec4( diffuse, opacity );`,
              `vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );`
            );
          }}
        />
      </instancedMesh>
    </group>
  );
};
