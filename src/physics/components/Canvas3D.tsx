import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Magnet } from '../math/physics';
import { MagnetMesh } from './MagnetMesh';
import { FieldLines } from './FieldLines';
import { HeatmapPlane } from './HeatmapPlane';
import { IronFilings } from './IronFilings';

interface Canvas3DProps {
  magnets: Magnet[];
  selectedId: string | null;
  controlMode: 'translate' | 'rotate';
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<Magnet>) => void;
  // Simulation params
  density: number;
  stepSize: number;
  maxSteps: number;
  lineColor: string;
  particleColor: string;
  particleSpeed: number;
  particlesPerLine: number;
  lineThickness: number;
  particleSize: number;
  useCustomColor: boolean;
  showLines: boolean;
  showParticles: boolean;
  // Heatmap params
  showHeatmap: boolean;
  heatmapHeight: number;
  heatmapOpacity: number;
  // Filings params
  showFilings: boolean;
  filingsHeight: number;
  filingsOpacity: number;
}

export const Canvas3D: React.FC<Canvas3DProps> = ({
  magnets,
  selectedId,
  controlMode,
  onSelect,
  onUpdate,
  density,
  stepSize,
  maxSteps,
  lineColor,
  particleColor,
  particleSpeed,
  particlesPerLine,
  lineThickness,
  particleSize,
  useCustomColor,
  showLines,
  showParticles,
  showHeatmap,
  heatmapHeight,
  heatmapOpacity,
  showFilings,
  filingsHeight,
  filingsOpacity,
}) => {
  const [isDragging, setDragging] = useState(false);

  return (
    <div className="canvas-wrapper">
      <Canvas
        camera={{ position: [8, 8, 12], fov: 45 }}
        onPointerMissed={() => onSelect(null)}
      >
        {/* Sky / Deep background color & fog */}
        <color attach="background" args={['#07070c']} />

        {/* Ambient & Directional Lights */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1.2}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        {/* Orbit Controls (disable when user is dragging/manipulating a magnet) */}
        <OrbitControls
          makeDefault
          enabled={!isDragging}
          maxPolarAngle={Math.PI / 2 - 0.05} // don't go below floor
          minDistance={3}
          maxDistance={30}
        />

        {/* 1. Heatmap Slice Plane */}
        <HeatmapPlane
          magnets={magnets}
          height={heatmapHeight}
          size={30}
          visible={showHeatmap}
          opacity={heatmapOpacity}
        />

        {/* 2. Iron Filings Grid */}
        <IronFilings
          magnets={magnets}
          height={filingsHeight}
          gridSize={30}
          size={24}
          visible={showFilings}
          opacity={filingsOpacity}
        />

        {/* 3. Streamlines and flowing particles */}
        <FieldLines
          magnets={magnets}
          density={density}
          stepSize={stepSize}
          maxSteps={maxSteps}
          lineColor={lineColor}
          particleColor={particleColor}
          particleSpeed={particleSpeed}
          particlesPerLine={particlesPerLine}
          lineThickness={lineThickness}
          particleSize={particleSize}
          useCustomColor={useCustomColor}
          showLines={showLines}
          showParticles={showParticles}
          opacity={0.65}
        />

        {/* 4. Draggable Magnets */}
        {magnets.map((magnet) => (
          <MagnetMesh
            key={magnet.id}
            magnet={magnet}
            isSelected={selectedId === magnet.id}
            controlMode={controlMode}
            onSelect={onSelect}
            onUpdate={onUpdate}
            setDragging={setDragging}
          />
        ))}
      </Canvas>
    </div>
  );
};
