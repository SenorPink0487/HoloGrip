import { forwardRef } from 'react';

import * as THREE from 'three';

interface SolenoidModelProps {
  coils?: number;
  radius?: number;
  metalness?: number;
  position?: [number, number, number];
}

export const SolenoidModel = forwardRef<THREE.Group, SolenoidModelProps>(({ 
  coils = 30, 
  radius = 1.5, 
  metalness = 0.9,
  position = [0, 0, 0]
}, ref) => {

  // 渲染一组环来模拟线圈
  const tube = 0.08;
  const length = 4;
  const spacing = length / coils;

  return (
    <group ref={ref} position={position} rotation={[0, 0, Math.PI / 2]}>


      {/* 外部铜线圈 */}
      {Array.from({ length: coils }).map((_, i) => (
        <mesh key={i} position={[0, -length / 2 + i * spacing, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, tube, 16, 100]} />
          {/* 逼真的紫铜材质 */}
          <meshPhysicalMaterial 
            color="#b87333" 
            metalness={metalness} 
            roughness={0.6} 
          />
        </mesh>
      ))}
    </group>
  );
});
