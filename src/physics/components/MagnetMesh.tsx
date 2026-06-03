import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { TransformControls, Text } from '@react-three/drei';
import { Magnet } from '../math/physics';

interface MagnetMeshProps {
  magnet: Magnet;
  isSelected: boolean;
  controlMode: 'translate' | 'rotate';
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Magnet>) => void;
  setDragging: (dragging: boolean) => void;
}

export const MagnetMesh: React.FC<MagnetMeshProps> = ({
  magnet,
  isSelected,
  controlMode,
  onSelect,
  onUpdate,
  setDragging,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const transformRef = useRef<any>(null);

  // Sync positions when selected and dragged
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...magnet.position);
      groupRef.current.rotation.set(...magnet.rotation);
    }
  }, [magnet.position, magnet.rotation]);

  const halfLen = magnet.length / 2;
  const poleOffset = halfLen / 2; // offset from center of magnet to center of pole

  return (
    <>
      <group
        ref={groupRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(magnet.id);
        }}
      >
        {/* North Pole Mesh (Red) */}
        <mesh position={[0, poleOffset, 0]}>
          {magnet.shape === 'cylinder' ? (
            <cylinderGeometry args={[magnet.width / 2, magnet.width / 2, halfLen, 32]} />
          ) : (
            <boxGeometry args={[magnet.width, halfLen, magnet.width]} />
          )}
          <meshStandardMaterial
            color={isSelected ? '#ff4d4d' : '#e62222'}
            roughness={0.2}
            metalness={0.4}
            emissive={isSelected ? '#550000' : '#220000'}
          />
        </mesh>

        {/* Text 'N' on North Pole */}
        <Text
          position={[magnet.width / 2 + 0.02, poleOffset, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={magnet.width * 0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          N
        </Text>
        <Text
          position={[-(magnet.width / 2 + 0.02), poleOffset, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          fontSize={magnet.width * 0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          N
        </Text>

        {/* South Pole Mesh (Blue) */}
        <mesh position={[0, -poleOffset, 0]}>
          {magnet.shape === 'cylinder' ? (
            <cylinderGeometry args={[magnet.width / 2, magnet.width / 2, halfLen, 32]} />
          ) : (
            <boxGeometry args={[magnet.width, halfLen, magnet.width]} />
          )}
          <meshStandardMaterial
            color={isSelected ? '#4d80ff' : '#2255e6'}
            roughness={0.2}
            metalness={0.4}
            emissive={isSelected ? '#000055' : '#000022'}
          />
        </mesh>

        {/* Text 'S' on South Pole */}
        <Text
          position={[magnet.width / 2 + 0.02, -poleOffset, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={magnet.width * 0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          S
        </Text>
        <Text
          position={[-(magnet.width / 2 + 0.02), -poleOffset, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          fontSize={magnet.width * 0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          S
        </Text>

        {/* Outline / Selection indicator */}
        {isSelected && (
          <mesh position={[0, 0, 0]}>
            {magnet.shape === 'cylinder' ? (
              <cylinderGeometry args={[magnet.width / 2 * 1.05, magnet.width / 2 * 1.05, magnet.length * 1.02, 32]} />
            ) : (
              <boxGeometry args={[magnet.width * 1.05, magnet.length * 1.02, magnet.width * 1.05]} />
            )}
            <meshBasicMaterial color="#00ffcc" wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </group>

      {/* Render TransformControls only when selected */}
      {isSelected && (
        <TransformControls
          ref={transformRef}
          object={groupRef as any}
          mode={controlMode}
          size={0.8}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onObjectChange={() => {
            if (groupRef.current) {
              const pos = groupRef.current.position;
              const rot = groupRef.current.rotation;
              onUpdate(magnet.id, {
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z],
              });
            }
          }}
        />
      )}
    </>
  );
};
