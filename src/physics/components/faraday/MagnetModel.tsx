import { forwardRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface MagnetModelProps {
  position?: [number, number, number];
}

export const MagnetModel = forwardRef<THREE.Group, MagnetModelProps>(({ position = [0, 0, 0] }, ref) => {
  const length = 3;
  const width = 0.8;
  const height = 0.8;

  return (
    <group ref={ref} position={position}>
      {/* N极 (红色) */}
      <mesh position={[-length / 4, 0, 0]}>
        <boxGeometry args={[length / 2, height, width]} />
        <meshStandardMaterial 
          color="#e62222" 
          metalness={0.1} 
          roughness={1.0}
        />
      </mesh>

      {/* Text 'N' */}
      <Text
        position={[-length / 4, height / 2 + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={width * 0.4}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        N
      </Text>

      {/* S极 (蓝色) */}
      <mesh position={[length / 4, 0, 0]}>
        <boxGeometry args={[length / 2, height, width]} />
        <meshStandardMaterial 
          color="#2255e6" 
          metalness={0.1} 
          roughness={1.0}
        />
      </mesh>

      {/* Text 'S' */}
      <Text
        position={[length / 4, height / 2 + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={width * 0.4}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        S
      </Text>
    </group>
  );
});

MagnetModel.displayName = 'MagnetModel';
