import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Magnet, getPolePositions } from '../math/physics';

interface HeatmapPlaneProps {
  magnets: Magnet[];
  height: number;
  size?: number;
  visible: boolean;
  opacity: number;
}

export const HeatmapPlane: React.FC<HeatmapPlaneProps> = ({
  magnets,
  height,
  size = 30,
  visible,
  opacity,
}) => {
  const shaderUniforms = useMemo(() => {
    const poles: THREE.Vector3[] = [];
    const strengths: number[] = [];

    magnets.forEach((magnet) => {
      const { north, south } = getPolePositions(magnet);
      poles.push(north);
      strengths.push(magnet.strength);
      poles.push(south);
      strengths.push(-magnet.strength);
    });

    const MAX_POLES = 20;
    while (poles.length < MAX_POLES) {
      poles.push(new THREE.Vector3(0, 9999, 0));
      strengths.push(0);
    }

    return {
      uPoles: { value: poles },
      uStrengths: { value: strengths },
      uPoleCount: { value: magnets.length * 2 },
      uSoftening: { value: 0.15 },
      uOpacity: { value: opacity },
    };
  }, [magnets, opacity]);

  const materialRef = React.useRef<THREE.ShaderMaterial>(null);
  React.useEffect(() => {
    if (materialRef.current) {
      const poles: THREE.Vector3[] = [];
      const strengths: number[] = [];

      magnets.forEach((magnet) => {
        const { north, south } = getPolePositions(magnet);
        poles.push(north);
        strengths.push(magnet.strength);
        poles.push(south);
        strengths.push(-magnet.strength);
      });

      const MAX_POLES = 20;
      while (poles.length < MAX_POLES) {
        poles.push(new THREE.Vector3(0, 9999, 0));
        strengths.push(0);
      }

      materialRef.current.uniforms.uPoles.value = poles;
      materialRef.current.uniforms.uStrengths.value = strengths;
      materialRef.current.uniforms.uPoleCount.value = magnets.length * 2;
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniformsNeedUpdate = true;
    }
  }, [magnets, opacity]);

  const shaderArgs = useMemo(() => {
    return {
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uPoles[20];
        uniform float uStrengths[20];
        uniform int uPoleCount;
        uniform float uSoftening;
        uniform float uOpacity;
        varying vec3 vWorldPosition;

        // Calculate the superimposed B field at world position
        vec3 calcB(vec3 pos) {
          vec3 B = vec3(0.0);
          float soft2 = uSoftening * uSoftening;
          for (int i = 0; i < 20; i++) {
            if (i >= uPoleCount) break;
            vec3 r = pos - uPoles[i];
            float dist2 = dot(r, r) + soft2;
            float dist3 = pow(dist2, 1.5);
            B += uStrengths[i] * r / dist3;
          }
          return B;
        }

        void main() {
          if (uPoleCount == 0) {
            gl_FragColor = vec4(0.02, 0.02, 0.12, uOpacity);
            return;
          }

          vec3 B = calcB(vWorldPosition);
          float B_len = length(B);

          // --- Intensity mapping with log scale ---
          float intensity = log(1.0 + B_len * 15.0) / 4.0;
          intensity = clamp(intensity, 0.0, 1.0);

          // --- Scientific color ramp: deep blue -> cyan -> green -> yellow -> red -> white ---
          vec3 color;
          if (intensity < 0.15) {
            color = mix(vec3(0.01, 0.01, 0.08), vec3(0.05, 0.15, 0.45), intensity / 0.15);
          } else if (intensity < 0.3) {
            color = mix(vec3(0.05, 0.15, 0.45), vec3(0.0, 0.6, 0.85), (intensity - 0.15) / 0.15);
          } else if (intensity < 0.5) {
            color = mix(vec3(0.0, 0.6, 0.85), vec3(0.15, 0.85, 0.3), (intensity - 0.3) / 0.2);
          } else if (intensity < 0.7) {
            color = mix(vec3(0.15, 0.85, 0.3), vec3(1.0, 0.9, 0.1), (intensity - 0.5) / 0.2);
          } else if (intensity < 0.88) {
            color = mix(vec3(1.0, 0.9, 0.1), vec3(1.0, 0.25, 0.05), (intensity - 0.7) / 0.18);
          } else {
            color = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.95, 0.9), (intensity - 0.88) / 0.12);
          }

          // --- Neutral point highlighting: mark where |B| ≈ 0 ---
          // This is the key superposition indicator: where fields cancel
          float neutralGlow = exp(-B_len * B_len * 800.0);
          // Pulsing ring around neutral points
          float neutralRing = smoothstep(0.015, 0.02, B_len) - smoothstep(0.02, 0.04, B_len);
          color = mix(color, vec3(1.0, 1.0, 1.0), neutralGlow * 0.9);
          color += vec3(0.3, 0.8, 1.0) * neutralRing * 0.6;

          // --- Field direction indicator using screen-space derivative trick ---
          // Creates subtle "flow" streaks aligned with B direction
          vec3 Bnorm = B_len > 0.001 ? normalize(B) : vec3(0.0);
          // Project B onto the XZ plane for directional texture
          vec2 Bdir2d = normalize(vec2(Bnorm.x, Bnorm.z) + vec2(0.0001));
          // Create flow-aligned coordinate
          float flowCoord = dot(vec2(vWorldPosition.x, vWorldPosition.z), Bdir2d);
          float flowPattern = sin(flowCoord * 12.0) * 0.5 + 0.5;
          flowPattern = pow(flowPattern, 3.0);
          // Only show flow streaks where field is moderate (not at poles or neutral)
          float flowMask = smoothstep(0.0, 0.15, intensity) * smoothstep(0.9, 0.5, intensity);
          color = mix(color, color * 1.35, flowPattern * flowMask * 0.25);

          // --- Subtle scientific grid overlay ---
          float gridX = abs(fract(vWorldPosition.x - 0.5) - 0.5) / (fwidth(vWorldPosition.x));
          float gridZ = abs(fract(vWorldPosition.z - 0.5) - 0.5) / (fwidth(vWorldPosition.z));
          float grid = 1.0 - min(gridX, gridZ);
          grid = clamp(grid, 0.0, 1.0);
          color = mix(color, vec3(0.4, 0.6, 1.0), grid * 0.08);

          gl_FragColor = vec4(color, uOpacity);
        }
      `,
    };
  }, []);

  if (!visible) return null;

  return (
    <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size, 256, 256]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={shaderArgs.vertexShader}
        fragmentShader={shaderArgs.fragmentShader}
        uniforms={shaderUniforms}
        transparent={true}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
