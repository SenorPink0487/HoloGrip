import { forwardRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface GalvanometerModelProps {
  position: [number, number, number];
  visualInducedCurrent: number;
}

export const GalvanometerModel = forwardRef<THREE.Group, GalvanometerModelProps>(
  ({ position, visualInducedCurrent }, ref) => {
    
    // Convert the visual current back to a readable "mA" or "μA" value.
    // Assuming visualInducedCurrent is a small float (e.g., 0.05).
    const displayValue = (visualInducedCurrent * 1000).toFixed(1);
    const isPositive = visualInducedCurrent >= 0;
    const sign = isPositive ? (visualInducedCurrent === 0 ? " " : "+") : "";

    return (
      <group ref={ref} position={position} scale={2.5} name="digital-ammeter">
        {/* === Main Casing (Yellow Multimeter Style) === */}
        {/* Rubber Bumper (Black) */}
        <mesh position={[0, 0, -0.05]} receiveShadow castShadow>
          <boxGeometry args={[1.5, 1.3, 0.3]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>

        {/* Yellow Plastic Body */}
        <mesh position={[0, 0, 0.05]} receiveShadow castShadow>
          <boxGeometry args={[1.3, 1.1, 0.25]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>

        {/* === Digital Display Screen === */}
        {/* Screen Bezel */}
        <mesh position={[0, 0.25, 0.18]} receiveShadow castShadow>
          <boxGeometry args={[1.1, 0.45, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={0.7} />
        </mesh>
        
        {/* Screen Glass/LCD */}
        <mesh position={[0, 0.25, 0.21]}>
          <planeGeometry args={[1.0, 0.35]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.8} />
        </mesh>

        {/* Digital Text LED */}
        <Text 
          position={[0, 0.25, 0.22]} 
          fontSize={0.25} 
          color="#ef4444" // Bright Red LED
          anchorX="center" 
          anchorY="middle"
        >
          {`${sign}${displayValue} mA`}
        </Text>

        {/* === Control Panel / Rotary Dial (Decoration) === */}
        {/* Dial indented area */}
        <mesh position={[0, -0.2, 0.18]}>
          <circleGeometry args={[0.2, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>

        {/* Rotary Knob */}
        <group position={[0, -0.2, 0.2]} rotation={[0, 0, Math.PI / 6]}>
          <mesh rotation={[Math.PI/2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 16]} />
            <meshStandardMaterial color="#334155" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.08, 0.02]} rotation={[Math.PI/2, 0, 0]}>
            <boxGeometry args={[0.04, 0.06, 0.16]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        </group>

        {/* Brand/Model Text */}
        <Text position={[-0.4, -0.15, 0.18]} fontSize={0.06} color="#000000" anchorX="left" anchorY="middle">
          DMM-830
        </Text>
        <Text position={[-0.4, -0.25, 0.18]} fontSize={0.05} color="#000000" anchorX="left" anchorY="middle">
          TRUE RMS
        </Text>

        {/* === Terminals (aligned with wire offsets x=±0.6, y=-0.4) === */}
        {/* The wires in FaradayCanvas connect at local x=±0.6, y=-0.4 */}
        
        {/* Positive Terminal (Right) */}
        <group position={[0.6, -0.4, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
             <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
             <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
             <meshStandardMaterial color="#b91c1c" metalness={0.5} roughness={0.2} />
          </mesh>
        </group>

        {/* Negative Terminal (Left) */}
        <group position={[-0.6, -0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
             <meshStandardMaterial color="#0f172a" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
             <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
             <meshStandardMaterial color="#020617" metalness={0.5} roughness={0.2} />
          </mesh>
        </group>
      </group>
    );
  }
);

GalvanometerModel.displayName = 'GalvanometerModel';
