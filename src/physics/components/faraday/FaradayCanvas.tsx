import React, { useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SolenoidModel } from './SolenoidModel';
import { MagnetModel } from './MagnetModel';
import { InteractionManager } from './InteractionManager';
import { HandData } from '../../hooks/useHandTracking';
import { FieldLines } from '../FieldLines';
import { HeatmapPlane } from '../HeatmapPlane';
import { Magnet } from '../../math/physics';
import { PhysicsDataRecord } from './FaradayDataPanel';

import { LightBulbModel } from './equipment/LightBulbModel';
import { GalvanometerModel } from './equipment/GalvanometerModel';
import { CompassModel } from './equipment/CompassModel';
import { BatteryModel } from './equipment/BatteryModel';
import { WireSegment } from './equipment/WireSegment';

interface FaradayCanvasProps {
  handsDataRef: React.MutableRefObject<HandData[]>;
  coils: number;
  radius: number;
  metalness: number;
  magnetStrength: number;
  solenoidCurrent: number;
  temperature: number;
  metersPerUnit: number;
  baseMagneticField: number;
  wireResistance: number;
  setRecordedData: (d: PhysicsDataRecord[]) => void;
  isRecordingForce?: boolean;
  rightDragSensitivity: number;
  leftRotateSensitivity: number;
  zoomSensitivity: number;
  lineColor: string;
  lineThickness: number;
  particleColor: string;
  particleSize: number;
  solenoidLineColor: string;
  solenoidParticleColor: string;

  density: number;
  stepSize: number;
  maxSteps: number;
  particleSpeed: number;
  particlesPerLine: number;
  useCustomColor: boolean;
  showLines: boolean;
  showParticles: boolean;

  showHeatmap: boolean;
  heatmapHeight: number;
  heatmapOpacity: number;

  showLightBulb?: boolean;
  showGalvanometer?: boolean;
  showCompass?: boolean;
  showBattery?: boolean;
}

export const FaradayCanvas: React.FC<FaradayCanvasProps> = ({ 
  handsDataRef, coils, radius, metalness, magnetStrength, solenoidCurrent, temperature,
  metersPerUnit, baseMagneticField, wireResistance, setRecordedData, isRecordingForce,
  rightDragSensitivity, leftRotateSensitivity, zoomSensitivity,
  lineColor, lineThickness, particleColor, particleSize,
  solenoidLineColor, solenoidParticleColor,
  density, stepSize, maxSteps, particleSpeed, particlesPerLine, useCustomColor, showLines, showParticles,
  showHeatmap, heatmapHeight, heatmapOpacity,
  showLightBulb = true, showGalvanometer = true, showCompass = true, showBattery = true
}) => {
  const magnetRef = useRef<THREE.Group>(null);
  const solenoidRef = useRef<THREE.Group>(null);
  const compassRef = useRef<THREE.Group>(null);
  const lightBulbRef = useRef<THREE.Group>(null);
  const galvanometerRef = useRef<THREE.Group>(null);
  const batteryRef = useRef<THREE.Group>(null);

  const leftLightRef = useRef<THREE.PointLight>(null);
  const rightLightRef = useRef<THREE.PointLight>(null);
  const inducedCurrentRef = useRef<number>(0);
  const [magnetX, setMagnetX] = useState(4);
  const [solenoidX, setSolenoidX] = useState(0);
  const [visualInducedCurrent, setVisualInducedCurrent] = useState(0);

  // 1. 计算温度衰减系数
  // 假设 20°C 时磁性为100%，超过之后按抛物线衰减，120°C 左右磁场消失
  const tempFactor = temperature > 20 
    ? Math.max(0, 1 - Math.pow((temperature - 20) / 100, 2)) 
    : 1.0;
  const effectiveMagnetStrength = magnetStrength * tempFactor;

  // 3. 如果通电螺线管有电流或有感应电流，加入虚拟电磁铁叠加场
  // 放大感应电流的视觉权重，使得即使是毫安级电流也能造成明显的磁感线弯曲叠加
  const totalSolenoidCurrent = solenoidCurrent + (visualInducedCurrent * 100);

  const magnets: Magnet[] = useMemo(() => {
    return [
      {
        id: 'faraday-magnet',
        name: '磁铁',
        position: [magnetX, 0, 0] as [number, number, number],
        rotation: [0, 0, Math.PI / 2] as [number, number, number], // 使物理场引擎计算的 N极(默认+Y) 对齐到视觉模型的红极(-X)
        strength: effectiveMagnetStrength,
        length: 3,
        width: 0.8,
        shape: 'box' as const,
        color: lineColor,
        particleColor: particleColor
      },
      {
        id: 'solenoid-electromagnet',
        name: '螺线管',
        position: [solenoidX, 0, 0] as [number, number, number],
        rotation: [0, 0, Math.PI / 2] as [number, number, number],
        strength: totalSolenoidCurrent,
        length: 4,
        width: radius,
        shape: 'cylinder' as const,
        color: solenoidLineColor,
        particleColor: solenoidParticleColor
      }
    ];
  }, [magnetX, solenoidX, effectiveMagnetStrength, totalSolenoidCurrent, radius, lineColor, particleColor, solenoidLineColor, solenoidParticleColor]);

  // 构建导线连接节点列表
  const activeWireNodes = useMemo(() => {
    const nodes: { ref: React.RefObject<THREE.Group | null>, inOffset: [number, number, number], outOffset: [number, number, number] }[] = [];
    
    // 起点：螺线管左端 (x = -2)
    nodes.push({ ref: solenoidRef as any, inOffset: [-2, -radius + 0.2, 0], outOffset: [-2, -radius + 0.2, 0] });
    
    // 灯泡在左侧 (x = -6)。从螺线管左端连到灯泡右端 (+1.5)，然后从灯泡左端 (-1.5) 输出
    if (showLightBulb) nodes.push({ ref: lightBulbRef, inOffset: [1.5, -2.125, 0], outOffset: [-1.5, -2.125, 0] });
    
    // 电池在后方中央 (z = -5)。从灯泡左侧连到电池左侧 (-1.25)，然后从电池右侧 (+1.25) 输出
    if (showBattery) nodes.push({ ref: batteryRef, inOffset: [-1.25, -0.5, 0], outOffset: [1.25, -0.5, 0] });
    
    // 电流表在右侧 (x = 6)。从电池右侧连到电流表右侧 (+1.5)，然后从电流表左侧 (-1.5) 输出
    if (showGalvanometer) nodes.push({ ref: galvanometerRef, inOffset: [1.5, -1.0, 0], outOffset: [-1.5, -1.0, 0] });
    
    // 终点：螺线管右端 (x = 2)。电流表左侧连回螺线管右侧。
    nodes.push({ ref: solenoidRef as any, inOffset: [2, -radius + 0.2, 0], outOffset: [2, -radius + 0.2, 0] });
    
    return nodes;
  }, [showGalvanometer, showLightBulb, showBattery, radius]);

  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 45 }}
      // 设置背景透明
      gl={{ alpha: true }}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
      
      {/* 移除高光反射的环境贴图，换成较弱的普通光源以防止过曝 */}
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 10, 10]} intensity={1.0} />

      {/* 边界提示光效（当磁铁撞墙时发亮） */}
      <pointLight ref={leftLightRef} position={[-16, 2, 2]} intensity={0} color="#ff3333" distance={30} decay={1.5} />
      <pointLight ref={rightLightRef} position={[16, 2, 2]} intensity={0} color="#ff3333" distance={30} decay={1.5} />

      {/* 绘制出 Three.js 原本的网格线 */}
      <gridHelper args={[30, 30, '#888888', '#444444']} position={[0, -2, 0]} />

      <SolenoidModel ref={solenoidRef} position={[solenoidX, 0, 0]} coils={coils} radius={radius} metalness={metalness} />
      <MagnetModel ref={magnetRef} position={[magnetX, 0, 0]} />

      {/* 附加器材 */}
      {showLightBulb && <LightBulbModel ref={lightBulbRef} position={[-6, 0.125, -3]} visualInducedCurrent={visualInducedCurrent} />}
      {showGalvanometer && <GalvanometerModel ref={galvanometerRef} position={[6, -0.5, -3]} visualInducedCurrent={visualInducedCurrent} />}
      {showCompass && <CompassModel ref={compassRef} position={[0, -1.8125, 5]} magnets={magnets} />}
      {showBattery && <BatteryModel ref={batteryRef} position={[0, -0.75, -5]} solenoidCurrent={solenoidCurrent} />}

      {/* 连接导线 */}
      {activeWireNodes.map((node, i) => {
        if (i === activeWireNodes.length - 1) return null;
        const nextNode = activeWireNodes[i + 1];
        return (
          <WireSegment 
            key={i} 
            startRef={node.ref} 
            endRef={nextNode.ref} 
            startOffset={node.outOffset} 
            endOffset={nextNode.inOffset}
            color="#27272a"
            sag={1.0}
          />
        );
      })}

      {/* 渲染磁体周围的磁感线 */}
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

      <HeatmapPlane
        magnets={magnets}
        height={heatmapHeight}
        visible={showHeatmap}
        opacity={heatmapOpacity}
      />

      <InteractionManager 
        handsDataRef={handsDataRef} 
        magnetRef={magnetRef} 
        solenoidRef={solenoidRef}
        compassRef={compassRef}
        lightBulbRef={lightBulbRef}
        galvanometerRef={galvanometerRef}
        batteryRef={batteryRef}
        onMagnetMove={setMagnetX} 
        onSolenoidMove={setSolenoidX}
        rightDragSensitivity={rightDragSensitivity}
        leftRotateSensitivity={leftRotateSensitivity}
        zoomSensitivity={zoomSensitivity}
        leftLightRef={leftLightRef}
        rightLightRef={rightLightRef}
        
        coils={coils}
        radius={radius}
        metersPerUnit={metersPerUnit}
        baseMagneticField={baseMagneticField}
        wireResistance={wireResistance}
        setRecordedData={setRecordedData}
        isRecordingForce={isRecordingForce}
        inducedCurrentRef={inducedCurrentRef}
        onVisualCurrentChange={setVisualInducedCurrent}
        temperature={temperature}
        magnetStrength={magnetStrength}
        solenoidCurrent={solenoidCurrent}
      />
    </Canvas>
  );
};
