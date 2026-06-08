import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WireSegmentProps {
  startRef: React.RefObject<THREE.Object3D | null>;
  endRef: React.RefObject<THREE.Object3D | null>;
  startOffset?: [number, number, number];
  endOffset?: [number, number, number];
  color?: string;
  sag?: number;
  thickness?: number;
}

export const WireSegment: React.FC<WireSegmentProps> = ({ 
  startRef, 
  endRef, 
  startOffset = [0, 0, 0], 
  endOffset = [0, 0, 0],
  color = "#1e293b",
  sag = 1.0,
  thickness = 0.08
}) => {
  const startVec = useMemo(() => new THREE.Vector3(), []);
  const endVec = useMemo(() => new THREE.Vector3(), []);
  const midVec = useMemo(() => new THREE.Vector3(), []);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(), []);
  
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create an initial tube geometry
  const initialGeometry = useMemo(() => {
    // Initial dummy curve
    const dummyCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    );
    return new THREE.TubeGeometry(dummyCurve, 20, thickness, 8, false);
  }, [thickness]);

  useFrame(() => {
    if (!startRef.current || !endRef.current || !meshRef.current) return;

    startRef.current.getWorldPosition(startVec);
    startVec.x += startOffset[0];
    startVec.y += startOffset[1];
    startVec.z += startOffset[2];

    endRef.current.getWorldPosition(endVec);
    endVec.x += endOffset[0];
    endVec.y += endOffset[1];
    endVec.z += endOffset[2];

    midVec.addVectors(startVec, endVec).multiplyScalar(0.5);
    midVec.y -= sag;

    curve.v0.copy(startVec);
    curve.v1.copy(midVec);
    curve.v2.copy(endVec);

    // Update geometry dynamically
    meshRef.current.geometry.dispose();
    meshRef.current.geometry = new THREE.TubeGeometry(curve, 20, thickness, 8, false);
  });

  return (
    <mesh ref={meshRef} geometry={initialGeometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
};
