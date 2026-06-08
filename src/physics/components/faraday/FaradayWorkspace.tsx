import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useHandTracking } from '../../hooks/useHandTracking';
import { FaradayCanvas } from './FaradayCanvas';
import { HandSkeleton } from './HandSkeleton';
import { FaradayControlPanel } from './FaradayControlPanel';
import { FaradayDataPanel, PhysicsDataRecord } from './FaradayDataPanel';
import { TimerOverlay } from './TimerOverlay';

interface FaradayWorkspaceProps {
  onBack: () => void;
  showSkeleton: boolean;
  setShowSkeleton: (val: boolean) => void;
  coils: number;
  setCoils: (val: number) => void;
  radius: number;
  setRadius: (v: number) => void;
  metalness: number;
  setMetalness: (v: number) => void;
  magnetStrength: number;
  setMagnetStrength: (v: number) => void;
  solenoidCurrent: number;
  setSolenoidCurrent: (v: number) => void;
  temperature: number;
  setTemperature: (v: number) => void;

  metersPerUnit: number;
  setMetersPerUnit: (v: number) => void;
  baseMagneticField: number;
  setBaseMagneticField: (v: number) => void;
  wireResistance: number;
  setWireResistance: (v: number) => void;
  experiments: PhysicsDataRecord[][];
  setExperiments: React.Dispatch<React.SetStateAction<PhysicsDataRecord[][]>>;
  selectedExperimentIndex: number;
  setSelectedExperimentIndex: (v: number) => void;

  rightDragSensitivity: number;
  setRightDragSensitivity: (v: number) => void;
  leftRotateSensitivity: number;
  setLeftRotateSensitivity: (v: number) => void;
  zoomSensitivity: number;
  setZoomSensitivity: (v: number) => void;
  skeletonDotSize: number;
  setSkeletonDotSize: (v: number) => void;

  lineColor: string;
  setLineColor: (v: string) => void;
  lineThickness: number;
  setLineThickness: (v: number) => void;
  particleColor: string;
  setParticleColor: (v: string) => void;
  particleSize: number;
  setParticleSize: (v: number) => void;

  solenoidLineColor: string;
  setSolenoidLineColor: (v: string) => void;
  solenoidParticleColor: string;
  setSolenoidParticleColor: (v: string) => void;

  density: number;
  setDensity: (v: number) => void;
  stepSize: number;
  setStepSize: (v: number) => void;
  maxSteps: number;
  setMaxSteps: (v: number) => void;
  particleSpeed: number;
  setParticleSpeed: (v: number) => void;
  particlesPerLine: number;
  setParticlesPerLine: (v: number) => void;
  useCustomColor: boolean;
  setUseCustomColor: (v: boolean) => void;
  showLines: boolean;
  setShowLines: (v: boolean) => void;
  showParticles: boolean;
  setShowParticles: (v: boolean) => void;

  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
  heatmapHeight: number;
  setHeatmapHeight: (v: number) => void;
  heatmapOpacity: number;
  setHeatmapOpacity: (v: number) => void;

  showLightBulb: boolean;
  setShowLightBulb: (v: boolean) => void;
  showGalvanometer: boolean;
  setShowGalvanometer: (v: boolean) => void;
  showCompass: boolean;
  setShowCompass: (v: boolean) => void;
  showBattery: boolean;
  setShowBattery: (v: boolean) => void;
}

export const FaradayWorkspace: React.FC<FaradayWorkspaceProps> = ({
  onBack,
  showSkeleton, setShowSkeleton,
  coils, setCoils,
  radius, setRadius,
  metalness, setMetalness,
  magnetStrength, setMagnetStrength,
  solenoidCurrent, setSolenoidCurrent,
  temperature, setTemperature,
  metersPerUnit, setMetersPerUnit,
  baseMagneticField, setBaseMagneticField,
  wireResistance, setWireResistance,
  experiments, setExperiments,
  selectedExperimentIndex, setSelectedExperimentIndex,
  rightDragSensitivity, setRightDragSensitivity,
  leftRotateSensitivity, setLeftRotateSensitivity,
  zoomSensitivity, setZoomSensitivity,
  skeletonDotSize, setSkeletonDotSize,
  lineColor, setLineColor,
  lineThickness, setLineThickness,
  particleColor, setParticleColor,
  particleSize, setParticleSize,
  solenoidLineColor, setSolenoidLineColor,
  solenoidParticleColor, setSolenoidParticleColor,
  
  density, setDensity,
  stepSize, setStepSize,
  maxSteps, setMaxSteps,
  particleSpeed, setParticleSpeed,
  particlesPerLine, setParticlesPerLine,
  useCustomColor, setUseCustomColor,
  showLines, setShowLines,
  showParticles, setShowParticles,

  showHeatmap, setShowHeatmap,
  heatmapHeight, setHeatmapHeight,
  heatmapOpacity, setHeatmapOpacity,

  showLightBulb, setShowLightBulb,
  showGalvanometer, setShowGalvanometer,
  showCompass, setShowCompass,
  showBattery, setShowBattery
}) => {
  const { videoRef, isReady, handsDataRef } = useHandTracking();
  const [isRecording, setIsRecording] = React.useState(false);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      {/* 摄像头视频流底层 */}
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)', // 镜像翻转前置摄像头
          zIndex: 0,
          opacity: isReady ? 1 : 0.2,
          transition: 'opacity 0.5s ease'
        }}
        autoPlay
        playsInline
        muted
      />

      {/* 录制时的边缘高光 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        boxShadow: isRecording ? 'inset 0 0 80px rgba(244, 114, 182, 0.8), inset 0 0 40px rgba(79, 70, 229, 0.8)' : 'none',
        pointerEvents: 'none',
        transition: 'box-shadow 0.3s ease',
        zIndex: 10
      }} />

      {/* 顶部计时器 */}
      <TimerOverlay isRecording={isRecording} />

      {/* 当准备好之前显示提示 */}
      {!isReady && (
        <div style={{ 
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
          color: 'white', zIndex: 1, fontSize: '1.2rem', background: 'rgba(0,0,0,0.5)', 
          padding: '1rem 2rem', borderRadius: '12px', backdropFilter: 'blur(8px)'
        }}>
          正在加载 AI 模型并开启摄像头，请允许权限...
        </div>
      )}

      {/* 3D 渲染层 */}
      {isReady && (
        <FaradayCanvas 
          handsDataRef={handsDataRef} 
          coils={coils} 
          radius={radius} 
          metalness={metalness} 
          magnetStrength={magnetStrength}
          solenoidCurrent={solenoidCurrent}
          temperature={temperature}
          metersPerUnit={metersPerUnit}
          baseMagneticField={baseMagneticField}
          wireResistance={wireResistance}
          setRecordedData={(d) => {
            setExperiments(prev => [...prev, d]);
            setSelectedExperimentIndex(experiments.length);
          }}
          isRecordingForce={isRecording}
          rightDragSensitivity={rightDragSensitivity}
          leftRotateSensitivity={leftRotateSensitivity}
          zoomSensitivity={zoomSensitivity}
          lineColor={lineColor}
          lineThickness={lineThickness}
          particleColor={particleColor}
          particleSize={particleSize}
          solenoidLineColor={solenoidLineColor}
          solenoidParticleColor={solenoidParticleColor}

          density={density}
          stepSize={stepSize}
          maxSteps={maxSteps}
          particleSpeed={particleSpeed}
          particlesPerLine={particlesPerLine}
          useCustomColor={useCustomColor}
          showLines={showLines}
          showParticles={showParticles}

          showHeatmap={showHeatmap}
          heatmapHeight={heatmapHeight}
          heatmapOpacity={heatmapOpacity}

          showLightBulb={showLightBulb}
          showGalvanometer={showGalvanometer}
          showCompass={showCompass}
          showBattery={showBattery}
        />
      )}

      {/* 骨骼渲染层 */}
      {isReady && <HandSkeleton handsDataRef={handsDataRef} showSkeleton={showSkeleton} skeletonDotSize={skeletonDotSize} />}

      {/* 控制面板 */}
      <FaradayControlPanel 
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

      {/* 物理数据面板 */}
      <FaradayDataPanel 
        experiments={experiments} 
        selectedExperimentIndex={selectedExperimentIndex} 
        setSelectedExperimentIndex={setSelectedExperimentIndex} 
        coils={coils}
        wireResistance={wireResistance}
        radius={radius}
        baseMagneticField={baseMagneticField}
        metersPerUnit={metersPerUnit}
      />

      {/* 返回按钮 */}
      <button 
        onClick={onBack}
        style={{
          position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(12px)',
          padding: '0.6rem 1.2rem', borderRadius: '8px', color: '#cbd5e1', 
          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
          transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em'
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)'; e.currentTarget.style.color = '#cbd5e1'; }}
      >
        <ArrowLeft size={18} />
        返回启动器
      </button>

      {/* 录制开关按钮 */}
      <button
        onClick={() => setIsRecording(!isRecording)}
        style={{
          position: 'absolute', right: '1.5rem', top: '1.5rem', zIndex: 1000,
          padding: '0.8rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em',
          borderRadius: '8px', cursor: 'pointer', backdropFilter: 'blur(12px)',
          transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '0.6rem', textTransform: 'uppercase',
          border: isRecording ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(16, 185, 129, 0.3)',
          background: isRecording ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          color: isRecording ? '#fca5a5' : '#6ee7b7',
          boxShadow: isRecording ? '0 0 20px rgba(239, 68, 68, 0.4)' : '0 0 15px rgba(16, 185, 129, 0.2)'
        }}
        onMouseOver={e => e.currentTarget.style.background = isRecording ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}
        onMouseOut={e => e.currentTarget.style.background = isRecording ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}
      >
        {isRecording ? (
          <><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span> 停止记录</>
        ) : (
          <><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span> 开始记录</>
        )}
      </button>
    </div>
  );
};
