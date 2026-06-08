import { forwardRef } from 'react';
import * as THREE from 'three';

interface LightBulbModelProps {
  position: [number, number, number];
  visualInducedCurrent: number;
}

export const LightBulbModel = forwardRef<THREE.Group, LightBulbModelProps>(
  ({ position, visualInducedCurrent }, ref) => {
    // Determine glow intensity.
    // Boost raw current significantly: even tiny induction currents will light it up strongly.
    const rawCurrent = Math.abs(visualInducedCurrent);
    // Use an aggressive multiplier (e.g. 500) and clamp
    const intensity = Math.min(1.0, Math.sqrt(rawCurrent * 500));
    
    // Dynamic Color: low intensity = deep orange/red, high intensity = blazing yellow/white
    const hue = 0.05 + intensity * 0.1;
    const lightness = 0.4 + intensity * 0.6; // Can reach 1.0 (pure white)
    const color = new THREE.Color().setHSL(hue, 1.0, lightness);
    
    // We consider it glowing if intensity is above a tiny threshold
    const isGlowing = intensity > 0.01;

    return (
      <group ref={ref} position={position} scale={2.5} name="lightbulb">
        {/* === Lamp Stand / Socket Base === */}
        {/* Wooden Base */}
        <mesh position={[0, -0.85, 0]} receiveShadow castShadow>
          <boxGeometry args={[1.4, 0.15, 0.8]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
        </mesh>
        
        {/* Porcelain Socket */}
        <mesh position={[0, -0.65, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.3, 0.35, 0.3, 32]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </mesh>
        
        {/* Metal threaded insert visible at the top of socket */}
        <mesh position={[0, -0.48, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 32]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.4} />
        </mesh>

        {/* === Terminals (aligned with wire offsets x=±0.6, y=-0.85) === */}
        {/* Positive Binding Post (Right) */}
        <group position={[0.6, -0.85, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
             <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
             <cylinderGeometry args={[0.04, 0.04, 0.04, 16]} />
             <meshStandardMaterial color="#b91c1c" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>

        {/* Negative Binding Post (Left) */}
        <group position={[-0.6, -0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh position={[0, 0.05, 0]}>
             <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
             <meshStandardMaterial color="#0f172a" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
             <cylinderGeometry args={[0.04, 0.04, 0.04, 16]} />
             <meshStandardMaterial color="#020617" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>

        {/* === The Light Bulb === */}
        <group position={[0, 0, 0]}>
          {/* Glass Envelope (Edison shape using Sphere + Cylinder) */}
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshPhysicalMaterial 
              color="#ffffff"
              transmission={0.95}
              opacity={1}
              metalness={0.1}
              roughness={0.05}
              ior={1.5}
              thickness={0.05}
              transparent
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            {/* Neck of the bulb */}
            <cylinderGeometry args={[0.2, 0.35, 0.4, 32]} />
            <meshPhysicalMaterial 
              color="#ffffff"
              transmission={0.95}
              opacity={1}
              metalness={0.1}
              roughness={0.05}
              ior={1.5}
              thickness={0.05}
              transparent
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Inner Glass Stem */}
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.05, 0.08, 0.4, 16]} />
            <meshPhysicalMaterial color="#ffffff" transmission={0.8} opacity={1} transparent />
          </mesh>

          {/* Filament Support Wires */}
          <mesh position={[-0.1, -0.1, 0]} rotation={[0, 0, Math.PI/12]}>
            <cylinderGeometry args={[0.005, 0.005, 0.3, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} />
          </mesh>
          <mesh position={[0.1, -0.1, 0]} rotation={[0, 0, -Math.PI/12]}>
            <cylinderGeometry args={[0.005, 0.005, 0.3, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} />
          </mesh>

          {/* Glowing Filament Coil */}
          <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI/2]}>
            {/* Using a torus to simulate the coiled filament span */}
            <torusGeometry args={[0.1, 0.02, 8, 24, Math.PI]} />
            <meshStandardMaterial 
              color={isGlowing ? color : "#1e293b"} 
              emissive={isGlowing ? color : "#000000"} 
              emissiveIntensity={isGlowing ? intensity * 20 : 0} 
              toneMapped={false}
            />
          </mesh>
          
          {/* Central Bright Filament Core (visible only when glowing strongly) */}
          <mesh position={[0, 0.15, 0]} rotation={[0, 0, Math.PI/2]}>
            <cylinderGeometry args={[0.015, 0.015, 0.2, 8]} />
            <meshStandardMaterial 
              color="#ffffff" 
              emissive="#ffffff" 
              emissiveIntensity={intensity > 0.3 ? (intensity - 0.3) * 50 : 0} 
              toneMapped={false}
            />
          </mesh>

          {/* === Dynamic Glow / Halo Effect === */}
          {/* A soft glowing sphere to create a halo inside the bulb */}
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.48, 32, 32]} />
            <meshBasicMaterial 
              color={color} 
              transparent 
              opacity={isGlowing ? intensity * 0.85 : 0} 
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Real Light Source for illuminating the scene */}
          {isGlowing && (
            <pointLight color={color} intensity={intensity * 10} distance={15} decay={2} />
          )}
        </group>
      </group>
    );
  }
);

LightBulbModel.displayName = 'LightBulbModel';
