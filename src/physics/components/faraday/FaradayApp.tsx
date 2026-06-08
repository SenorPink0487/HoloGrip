import React, { useState } from 'react';
import { FaradayWorkspace } from './FaradayWorkspace';
import { PhysicsDataRecord } from './FaradayDataPanel';

interface FaradayAppProps {
  onBack: () => void;
}

export const FaradayApp: React.FC<FaradayAppProps> = ({ onBack }) => {
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [coils, setCoils] = useState(15);
  const [radius, setRadius] = useState(1.5);
  const [metalness, setMetalness] = useState(0.9);
  
  // 基础渲染/UI 物理参数
  const [magnetStrength, setMagnetStrength] = useState(6.0);
  const [solenoidCurrent, setSolenoidCurrent] = useState(0.0);
  const [temperature, setTemperature] = useState(20);

  // 新增：真实的物理常数参数
  const [metersPerUnit, setMetersPerUnit] = useState(0.01); // 默认 1单位 = 1厘米
  const [baseMagneticField, setBaseMagneticField] = useState(1.2); // 钕磁铁大概 1.2T
  const [wireResistance, setWireResistance] = useState(0.5); // 0.5欧姆

  // 新增：数据记录状态 (历史实验记录)
  const [experiments, setExperiments] = useState<PhysicsDataRecord[][]>([]);
  const [selectedExperimentIndex, setSelectedExperimentIndex] = useState<number>(0);

  // 系统级控制参数
  const [rightDragSensitivity, setRightDragSensitivity] = useState(100.0);
  const [leftRotateSensitivity, setLeftRotateSensitivity] = useState(1.0);
  const [zoomSensitivity, setZoomSensitivity] = useState(2.5);
  const [skeletonDotSize, setSkeletonDotSize] = useState(2.5);

  // 渲染细节外观参数 (完整模式)
  const [lineColor, setLineColor] = useState('#4f46e5');
  const [lineThickness, setLineThickness] = useState(1.5);
  const [particleColor, setParticleColor] = useState('#ffffff');
  const [particleSize, setParticleSize] = useState(1.2);

  const [solenoidLineColor, setSolenoidLineColor] = useState('#ec4899');
  const [solenoidParticleColor, setSolenoidParticleColor] = useState('#ffffff');

  // 磁感线高级控制参数
  const [density, setDensity] = useState(18);
  const [stepSize, setStepSize] = useState(0.15);
  const [maxSteps, setMaxSteps] = useState(150);
  const [particleSpeed, setParticleSpeed] = useState(1.4);
  const [particlesPerLine, setParticlesPerLine] = useState(2);
  const [useCustomColor, setUseCustomColor] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showParticles, setShowParticles] = useState(true);

  // 二维场强切片(Heatmap)参数
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapHeight, setHeatmapHeight] = useState(0);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.75);

  // 实验器材显示状态
  const [showLightBulb, setShowLightBulb] = useState(true);
  const [showGalvanometer, setShowGalvanometer] = useState(true);
  const [showCompass, setShowCompass] = useState(false);
  const [showBattery, setShowBattery] = useState(true);

  return (
    <FaradayWorkspace 
      onBack={onBack}
      showSkeleton={showSkeleton} setShowSkeleton={setShowSkeleton}
      coils={coils} setCoils={setCoils}
      radius={radius} setRadius={setRadius}
      metalness={metalness} setMetalness={setMetalness}
      magnetStrength={magnetStrength} setMagnetStrength={setMagnetStrength}
      solenoidCurrent={solenoidCurrent} setSolenoidCurrent={setSolenoidCurrent}
      temperature={temperature} setTemperature={setTemperature}
      
      metersPerUnit={metersPerUnit} setMetersPerUnit={setMetersPerUnit}
      baseMagneticField={baseMagneticField} setBaseMagneticField={setBaseMagneticField}
      wireResistance={wireResistance} setWireResistance={setWireResistance}
      experiments={experiments} setExperiments={setExperiments}
      selectedExperimentIndex={selectedExperimentIndex} setSelectedExperimentIndex={setSelectedExperimentIndex}

      rightDragSensitivity={rightDragSensitivity} setRightDragSensitivity={setRightDragSensitivity}
      leftRotateSensitivity={leftRotateSensitivity} setLeftRotateSensitivity={setLeftRotateSensitivity}
      zoomSensitivity={zoomSensitivity} setZoomSensitivity={setZoomSensitivity}
      skeletonDotSize={skeletonDotSize} setSkeletonDotSize={setSkeletonDotSize}

      lineColor={lineColor} setLineColor={setLineColor}
      lineThickness={lineThickness} setLineThickness={setLineThickness}
      particleColor={particleColor} setParticleColor={setParticleColor}
      particleSize={particleSize} setParticleSize={setParticleSize}

      solenoidLineColor={solenoidLineColor} setSolenoidLineColor={setSolenoidLineColor}
      solenoidParticleColor={solenoidParticleColor} setSolenoidParticleColor={setSolenoidParticleColor}

      density={density} setDensity={setDensity}
      stepSize={stepSize} setStepSize={setStepSize}
      maxSteps={maxSteps} setMaxSteps={setMaxSteps}
      particleSpeed={particleSpeed} setParticleSpeed={setParticleSpeed}
      particlesPerLine={particlesPerLine} setParticlesPerLine={setParticlesPerLine}
      useCustomColor={useCustomColor} setUseCustomColor={setUseCustomColor}
      showLines={showLines} setShowLines={setShowLines}
      showParticles={showParticles} setShowParticles={setShowParticles}

      showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
      heatmapHeight={heatmapHeight} setHeatmapHeight={setHeatmapHeight}
      heatmapOpacity={heatmapOpacity} setHeatmapOpacity={setHeatmapOpacity}

      showLightBulb={showLightBulb} setShowLightBulb={setShowLightBulb}
      showGalvanometer={showGalvanometer} setShowGalvanometer={setShowGalvanometer}
      showCompass={showCompass} setShowCompass={setShowCompass}
      showBattery={showBattery} setShowBattery={setShowBattery}
    />
  );
};

