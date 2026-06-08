import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Magnet, calculateMagneticField } from '../math/physics';

interface IronFilingsProps {
  magnets: Magnet[];
  height: number;      // height Y of the filings plane
  gridSize?: number;   // number of columns/rows (e.g., 30 for 30x30 grid)
  size?: number;       // total width/depth of the square grid
  visible: boolean;
  opacity: number;
}

export const IronFilings: React.FC<IronFilingsProps> = ({
  magnets,
  height,
  gridSize = 35,
  size = 25,
  visible,
  opacity,
}) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const upVector = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tempB = useMemo(() => new THREE.Vector3(), []);

  const totalInstances = useMemo(() => gridSize * gridSize, [gridSize]);

  // Compute needle positions & orientations on every frame (since magnets move)
  useFrame(() => {
    if (!visible || !instancedMeshRef.current || magnets.length === 0) return;

    let index = 0;
    const step = size / (gridSize - 1);
    const halfSize = size / 2;

    for (let i = 0; i < gridSize; i++) {
      const x = -halfSize + i * step;

      for (let j = 0; j < gridSize; j++) {
        const z = -halfSize + j * step;
        const pos = new THREE.Vector3(x, height, z);

        // Get magnetic field vector at this point
        calculateMagneticField(pos, magnets, tempB, 0.1);
        const B_len = tempB.length();

        // Position
        dummy.position.copy(pos);

        // Rotation: align needle's local Y-axis with B direction
        if (B_len > 1e-5) {
          tempB.normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(upVector, tempB);
          dummy.quaternion.copy(q);
        } else {
          dummy.quaternion.set(0, 0, 0, 1);
        }

        // Scale: length is proportional to field strength, thinness is constant
        // Make it taper off if the field is extremely weak
        const lengthFactor = Math.min(1.0, 0.15 + B_len * 0.8);
        const thicknessFactor = Math.min(0.8, 0.08 + B_len * 0.15);
        dummy.scale.set(thicknessFactor, lengthFactor, thicknessFactor);

        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(index, dummy.matrix);
        index++;
      }
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!visible) return null;

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[null as any, null as any, totalInstances]}
      castShadow
      receiveShadow
    >
      {/* A double cone or double pyramid represents a magnetic needle pointer nicely */}
      <coneGeometry args={[0.06, 0.5, 4]} />
      <meshStandardMaterial
        color="#2c3e50"
        metalness={0.8}
        roughness={0.3}
        transparent
        opacity={opacity}
      />
    </instancedMesh>
  );
};
