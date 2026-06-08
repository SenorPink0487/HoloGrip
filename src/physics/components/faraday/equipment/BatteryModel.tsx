import { forwardRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface BatteryModelProps {
  position: [number, number, number];
  solenoidCurrent: number;
}

export const BatteryModel = forwardRef<THREE.Group, BatteryModelProps>(
  ({ position, solenoidCurrent }, ref) => {
    // Current defines activity
    const isActive = Math.abs(solenoidCurrent) > 0.01;
    
    // Format the current for display (e.g., "1.50 A")
    const displayCurrent = Math.abs(solenoidCurrent).toFixed(2);
    // Approximate voltage based on current (just for visual realism)
    const displayVoltage = (Math.abs(solenoidCurrent) * 12.0).toFixed(1);

    return (
      <group ref={ref} position={position} scale={2.5} name="current-source">
        {/* Main Casing (Beige/Grey Metal) */}
        <mesh position={[0, 0, -0.2]} receiveShadow castShadow>
          <boxGeometry args={[0.9, 0.8, 0.8]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.6} metalness={0.2} />
        </mesh>

        {/* Front Panel (Dark Grey) */}
        <mesh position={[0, 0, 0.21]} receiveShadow>
          <boxGeometry args={[0.85, 0.75, 0.05]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>

        {/* Digital Display Screen (Black glass) */}
        <mesh position={[0, 0.15, 0.24]}>
          <planeGeometry args={[0.7, 0.35]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.8} />
        </mesh>

        {/* LED Text - Current */}
        <Text
          position={[0, 0.22, 0.25]}
          fontSize={0.12}
          color={isActive ? "#ef4444" : "#475569"} // Red LED
          anchorX="center"
          anchorY="middle"
        >
          {displayCurrent} A
        </Text>

        {/* LED Text - Voltage (Simulated) */}
        <Text
          position={[0, 0.05, 0.25]}
          fontSize={0.1}
          color={isActive ? "#34d399" : "#475569"} // Green LED
          anchorX="center"
          anchorY="middle"
        >
          {displayVoltage} V
        </Text>
        
        {/* CV / CC indicators */}
        <mesh position={[-0.25, 0.25, 0.25]}>
          <circleGeometry args={[0.015, 16]} />
          <meshBasicMaterial color={isActive ? "#ef4444" : "#475569"} />
        </mesh>
        <Text position={[-0.15, 0.25, 0.25]} fontSize={0.03} color="#94a3b8">C.C.</Text>

        <mesh position={[-0.25, 0.1, 0.25]}>
          <circleGeometry args={[0.015, 16]} />
          <meshBasicMaterial color={!isActive ? "#475569" : "#475569"} />
        </mesh>
        <Text position={[-0.15, 0.1, 0.25]} fontSize={0.03} color="#94a3b8">C.V.</Text>


        {/* Knobs (Current & Voltage adjustment) */}
        <group position={[-0.2, -0.15, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.05, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </group>
        <group position={[0.2, -0.15, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.05, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </group>

        {/* Power Switch */}
        <mesh position={[-0.35, -0.15, 0.24]}>
          <boxGeometry args={[0.06, 0.1, 0.04]} />
          <meshStandardMaterial color={isActive ? "#ef4444" : "#111111"} />
        </mesh>

        {/* Output Terminals (Banana Jacks) on the sides to match wires */}
        
        {/* Right Terminal (Positive) */}
        <group position={[0.45, -0.2, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
             <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
             <cylinderGeometry args={[0.02, 0.02, 0.02, 16]} />
             <meshBasicMaterial color="#000000" />
          </mesh>
        </group>

        {/* Left Terminal (Negative) */}
        <group position={[-0.45, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
             <meshStandardMaterial color="#0f172a" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
             <cylinderGeometry args={[0.02, 0.02, 0.02, 16]} />
             <meshBasicMaterial color="#000000" />
          </mesh>
        </group>
        
        {/* Vent details on the sides */}
        {[...Array(5)].map((_, i) => (
          <mesh key={'r'+i} position={[0.46, 0.1 - i * 0.05, -0.2]} rotation={[0, Math.PI/2, 0]}>
            <boxGeometry args={[0.4, 0.015, 0.01]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        ))}
        {[...Array(5)].map((_, i) => (
          <mesh key={'l'+i} position={[-0.46, 0.1 - i * 0.05, -0.2]} rotation={[0, Math.PI/2, 0]}>
            <boxGeometry args={[0.4, 0.015, 0.01]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        ))}

      </group>
    );
  }
);

BatteryModel.displayName = 'BatteryModel';
