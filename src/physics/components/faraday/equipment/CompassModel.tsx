import { forwardRef, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Magnet, calculateMagneticField } from '../../../math/physics';

interface CompassModelProps {
  position: [number, number, number];
  magnets: Magnet[];
}

export const CompassModel = forwardRef<THREE.Group, CompassModelProps>(
  ({ position, magnets }, ref) => {
    const needleRef = useRef<THREE.Group>(null);
    const tempB = useRef(new THREE.Vector3());
    const tempPos = useRef(new THREE.Vector3(...position));

    useFrame(() => {
      if (needleRef.current) {
        // Update position in case it was dragged
        needleRef.current.getWorldPosition(tempPos.current);
        
        // Calculate B field
        calculateMagneticField(tempPos.current, magnets, tempB.current, 0.1);

        if (tempB.current.lengthSq() > 1e-10) {
          // Align needle with B field. The needle's local Y axis represents its North direction
          // We can use lookAt but it aligns Z-axis. We'll use a quaternion approach to align local Y to B.
          const dir = tempB.current.clone().normalize();
          const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          
          // Smooth rotation
          needleRef.current.quaternion.slerp(targetQ, 0.15);
        }
      }
    });

    return (
      <group ref={ref} position={position} scale={2.5} name="compass">
        {/* Base / Casing */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.15, 32]} />
          <meshStandardMaterial color="#c2c2c2" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Inner face */}
        <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.16, 32]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>

        {/* Pivot pin */}
        <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2]} />
          <meshStandardMaterial color="#333333" />
        </mesh>

        {/* Needle group to be rotated */}
        <group ref={needleRef} position={[0, 0, 0.1]}>
          {/* North (Red) */}
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0, 0.06, 0.44, 4]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          {/* South (Blue) */}
          <mesh position={[0, -0.22, 0]} rotation={[0, 0, Math.PI]}>
            <cylinderGeometry args={[0, 0.06, 0.44, 4]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </group>

        {/* Glass Cover */}
        <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.02, 32]} />
          <meshPhysicalMaterial 
            color="#ffffff"
            transmission={0.9}
            opacity={1}
            metalness={0.1}
            roughness={0.1}
            transparent
          />
        </mesh>
      </group>
    );
  }
);

CompassModel.displayName = 'CompassModel';
