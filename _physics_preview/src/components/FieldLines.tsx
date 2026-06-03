import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { Magnet, generateAllFieldLines, calculateMagneticField } from '../math/physics';

interface FieldLinesProps {
  magnets: Magnet[];
  density: number;
  stepSize: number;
  maxSteps: number;
  lineColor: string;
  particleColor: string;
  particleSpeed: number;
  particlesPerLine: number;
  lineThickness: number;
  particleSize: number;
  useCustomColor: boolean;
  showLines: boolean;
  showParticles: boolean;
  opacity: number;
}

export const FieldLines: React.FC<FieldLinesProps> = ({
  magnets,
  density,
  stepSize,
  maxSteps,
  lineColor: _lineColor,
  particleColor,
  particleSpeed,
  particlesPerLine,
  lineThickness,
  particleSize,
  useCustomColor,
  showLines,
  showParticles,
  opacity,
}) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const alphaAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maxParticles = 576 * 4; // sufficient safety buffer for particles
  const alphasBuffer = useMemo(() => new Float32Array(maxParticles).fill(1.0), []);
  const timeRef = useRef(0);

  // Generate lines and colors only when relevant parameters change
  const linesData = useMemo(() => {
    const { lines } = generateAllFieldLines(magnets, density, stepSize, maxSteps);
    const customColorObj = new THREE.Color(_lineColor);

    return lines.map((linePoints, idx) => {
      const points: [number, number, number][] = [];
      const colors: [number, number, number][] = [];

      for (let j = 0; j < linePoints.length; j++) {
        const p = linePoints[j];
        points.push([p.x, p.y, p.z]);

        if (useCustomColor) {
          colors.push([customColorObj.r, customColorObj.g, customColorObj.b]);
        } else {
          const B = calculateMagneticField(p, magnets, 0.1);
          const bMag = B.length();
          const t = Math.min(1.0, Math.log(1.0 + bMag * 8.0) / 3.5);
          
          let cr = 0, cg = 0, cb = 0;
          if (t < 0.2) {
            const s = t / 0.2; cr = 0.05; cg = 0.15 + s * 0.65; cb = 0.4 + s * 0.6;
          } else if (t < 0.45) {
            const s = (t - 0.2) / 0.25; cr = 0.05 + s * 0.1; cg = 0.8 + s * 0.15; cb = 1.0 - s * 0.7;
          } else if (t < 0.7) {
            const s = (t - 0.45) / 0.25; cr = 0.15 + s * 0.85; cg = 0.95 - s * 0.05; cb = 0.3 - s * 0.25;
          } else {
            const s = (t - 0.7) / 0.3; cr = 1.0; cg = 0.9 - s * 0.2; cb = 0.05 + s * 0.75;
          }
          colors.push([cr, cg, cb]);
        }
      }
      return { id: idx, points, colors, originalPoints: linePoints };
    });
  }, [magnets, density, stepSize, maxSteps, _lineColor, useCustomColor]);

  // Update particle positions every frame
  useFrame((state, delta) => {
    if (!showParticles || !instancedMeshRef.current || linesData.length === 0) {
      if (instancedMeshRef.current) instancedMeshRef.current.count = 0;
      return;
    }
    const camY = state.camera.position.y;

    timeRef.current += delta * particleSpeed * 0.22;
    let particleIdx = 0;
    const maxP = linesData.length * particlesPerLine;

    for (let i = 0; i < linesData.length; i++) {
      const linePoints = linesData[i].originalPoints;
      const numPoints = linePoints.length;
      if (numPoints < 2) continue;

      for (let j = 0; j < particlesPerLine; j++) {
        if (particleIdx >= maxP) break;

        const phaseOffset = j / particlesPerLine;
        const progress = (timeRef.current + phaseOffset) % 1.0;

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
        dummy.scale.setScalar(Math.max(0.015, scaleVal) * particleSize);

        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(particleIdx, dummy.matrix);

        alphasBuffer[particleIdx] = 1.0;

        particleIdx++;
      }
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (alphaAttrRef.current) alphaAttrRef.current.needsUpdate = true;
    instancedMeshRef.current.count = particleIdx;
  });

  return (
    <group>
      {/* Thick Streamlines using @react-three/drei Line (Line2) */}
      {showLines && linesData.map((data) => (
        <Line
          key={data.id}
          points={data.points}
          vertexColors={data.colors}
          lineWidth={lineThickness}
        />
      ))}

      {/* Flowing Particles */}
      {showParticles && (
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
            color={particleColor}
            transparent
            opacity={0.85}
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
      )}
    </group>
  );
};
