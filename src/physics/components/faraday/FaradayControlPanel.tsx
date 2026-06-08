import React, { useState, useEffect } from 'react';
import { Settings, ChevronRight, Magnet, Activity, Globe, SlidersHorizontal, Eye } from 'lucide-react';

interface FaradayControlPanelProps {
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
  
  // 系统交互配置
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

// 公共样板：分类标题
const SectionHeader = ({ title, icon, color }: { title: string, icon: React.ReactNode, color: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: `1px solid ${color}40`, paddingBottom: '0.4rem' }}>
    <span style={{ color }}>{icon}</span>
    <h3 style={{ margin: 0, fontSize: '1.05rem', color, fontWeight: 600 }}>{title}</h3>
  </div>
);

// 公共样板：滑块包装（彻底切断拖拽时的全局渲染，松手时才提交）
const SliderControl = ({ label, value, min, max, step, suffix, color, onChange }: any) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(Number(e.target.value));
  };

  const handleCommit = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{label}</span>
        <span style={{ color, fontWeight: 600, fontSize: '0.9rem' }}>{localValue.toFixed(step < 0.1 ? 2 : 1)}{suffix}</span>
      </div>
      <input 
        type="range" min={min} max={max} step={step} 
        value={localValue} 
        onChange={handleChange}
        onPointerUp={handleCommit}
        onKeyUp={handleCommit}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );
};

// 公共样板：颜色选择器
const ColorControl = ({ label, value, onChange }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
    <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{label}</span>
    <input 
      type="color" 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      style={{ cursor: 'pointer', background: 'none', border: 'none', width: '32px', height: '32px', padding: 0 }} 
    />
  </div>
);

// 公共样板：复选框
const ToggleControl = ({ label, checked, onChange, color }: any) => (
  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '0.8rem' }}>
    <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{label}</span>
    <input 
      type="checkbox" 
      checked={checked} 
      onChange={e => onChange(e.target.checked)}
      style={{ width: '1.2rem', height: '1.2rem', accentColor: color }}
    />
  </label>
);

export const FaradayControlPanel: React.FC<FaradayControlPanelProps> = ({
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
  const [isOpen, setIsOpen] = useState(false);



  return (
    <>
      {/* 悬浮打开按钮 */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          style={{
            position: 'absolute', top: '5rem', left: '1.5rem', zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(129, 140, 248, 0.3)', color: '#818cf8',
            padding: '0.8rem 1.2rem', borderRadius: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, letterSpacing: '0.05em',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), 0 0 10px rgba(129, 140, 248, 0.2)', transition: 'all 0.3s'
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(129, 140, 248, 0.2)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)'; e.currentTarget.style.color = '#818cf8'; }}
        >
          <Settings size={18} />
          参数调节
        </button>
      )}

      {/* 侧边滑动菜单 */}
      <div style={{
        position: 'absolute', top: '1.5rem', left: '1.5rem', bottom: '1.5rem', width: '360px',
        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '24px',
        zIndex: 1000, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
        transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% - 3rem))',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            <Settings size={20} color="#818cf8" /> 参数调节
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>

        {/* 可滚动容器，承载所有调节滑块 */}
        <div 
          className="faraday-sliders-container"
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem',
            flex: 1,
            overflowY: 'auto',
            paddingRight: '0.5rem'
          }}
        >

          {/* 1. 螺线管(线圈)参数 */}
          <SectionHeader title="螺线管属性" icon={<Activity size={18} />} color="#4f46e5" />
          <SliderControl label="线圈匝数 (N)" value={coils} min={10} max={200} step={1} suffix=" 匝" color="#4f46e5" onChange={setCoils} />
          <SliderControl label="线圈半径 (r)" value={radius} min={0.5} max={4.0} step={0.1} suffix=" unit" color="#4f46e5" onChange={setRadius} />
          <SliderControl label="线圈回路电阻 (R)" value={wireResistance} min={0.1} max={10.0} step={0.1} suffix=" Ω" color="#4f46e5" onChange={setWireResistance} />
          <SliderControl label="外加叠加电流" value={solenoidCurrent} min={-10} max={10} step={0.5} suffix=" A" color="#818cf8" onChange={setSolenoidCurrent} />

          {/* 2. 磁铁参数 */}
          <SectionHeader title="磁场属性" icon={<Magnet size={18} />} color="#ef4444" />
          <SliderControl label="真实磁极中心场强 (B₀)" value={baseMagneticField} min={0.1} max={5.0} step={0.1} suffix=" T" color="#ef4444" onChange={setBaseMagneticField} />
          <SliderControl label="磁极视觉渲染强度" value={magnetStrength} min={1} max={20} step={0.5} suffix="" color="#fca5a5" onChange={setMagnetStrength} />

          {/* 3. 环境常数与渲染 */}
          <SectionHeader title="空间与环境配置" icon={<Globe size={18} />} color="#fbbf24" />
          <SliderControl label="空间比例尺 (1 unit = ?)" value={metersPerUnit} min={0.001} max={0.1} step={0.001} suffix=" m" color="#fbbf24" onChange={setMetersPerUnit} />
          <SliderControl label="环境温度" value={temperature} min={-50} max={150} step={1} suffix=" °C" color={temperature > 80 ? '#ef4444' : '#fbbf24'} onChange={setTemperature} />
          <SliderControl label="线圈金属材质反光率" value={metalness} min={0} max={1} step={0.05} suffix="" color="#fcd34d" onChange={setMetalness} />
          
          <SectionHeader title="手势交互配置" icon={<SlidersHorizontal size={18} />} color="#34d399" />
          <SliderControl label="右手拖拽位移灵敏度" value={rightDragSensitivity} min={5} max={200} step={1} suffix="" color="#34d399" onChange={setRightDragSensitivity} />
          <SliderControl label="左手旋转视角灵敏度" value={leftRotateSensitivity} min={0.1} max={3.0} step={0.1} suffix=" x" color="#34d399" onChange={setLeftRotateSensitivity} />
          <SliderControl label="双指缩放距离灵敏度" value={zoomSensitivity} min={1.0} max={10.0} step={0.5} suffix="" color="#34d399" onChange={setZoomSensitivity} />
          <SliderControl label="手指关节白点大小" value={skeletonDotSize} min={1.0} max={8.0} step={0.5} suffix=" px" color="#6ee7b7" onChange={setSkeletonDotSize} />

          <SectionHeader title="模型与场线外观" icon={<Settings size={18} />} color="#ec4899" />
          <ColorControl label="磁铁磁感线颜色" value={lineColor} onChange={setLineColor} />
          <ColorControl label="磁铁粒子颜色" value={particleColor} onChange={setParticleColor} />
          <ColorControl label="螺线管磁感线颜色" value={solenoidLineColor} onChange={setSolenoidLineColor} />
          <ColorControl label="螺线管粒子颜色" value={solenoidParticleColor} onChange={setSolenoidParticleColor} />
          <SliderControl label="整体磁感线粗细" value={lineThickness} min={0.5} max={5.0} step={0.1} suffix="" color="#ec4899" onChange={setLineThickness} />
          <SliderControl label="整体粒子大小" value={particleSize} min={0.5} max={4.0} step={0.1} suffix="" color="#ec4899" onChange={setParticleSize} />

          <ToggleControl label="显示手部跟踪骨骼" checked={showSkeleton} onChange={setShowSkeleton} color="#fbbf24" />
          
          <SectionHeader title="实验器材显示" icon={<Eye size={18} />} color="#10b981" />
          <ToggleControl label="灯泡 (串联在回路)" checked={showLightBulb} onChange={setShowLightBulb} color="#10b981" />
          <ToggleControl label="检流计 (3D模型)" checked={showGalvanometer} onChange={setShowGalvanometer} color="#10b981" />
          <ToggleControl label="电池 (指示电流)" checked={showBattery} onChange={setShowBattery} color="#10b981" />
          <ToggleControl label="指南针 (空间磁场)" checked={showCompass} onChange={setShowCompass} color="#10b981" />

          {/* 5. 底层可视化图层 */}
          <div style={{ marginTop: '0.5rem' }}>
            <SectionHeader title="可视化图层 (高级)" icon={<Eye size={18} />} color="#818cf8" />
            
            {/* 磁感线层 */}
            <ToggleControl label="三维磁感线" checked={showLines} onChange={setShowLines} color="#818cf8" />
            {showLines && (
              <div style={{ paddingLeft: '0.8rem', borderLeft: '2px solid rgba(129, 140, 248, 0.3)', marginBottom: '1rem' }}>
                <ToggleControl label="使用单色 (关闭场强渐变)" checked={useCustomColor} onChange={setUseCustomColor} color="#818cf8" />
                <SliderControl label="线条密度" value={density} min={4} max={48} step={2} suffix=" 条/极" color="#818cf8" onChange={setDensity} />
                <SliderControl label="积分步长 (Step)" value={stepSize} min={0.05} max={0.30} step={0.01} suffix="" color="#818cf8" onChange={setStepSize} />
                <SliderControl label="最大步数 (Steps)" value={maxSteps} min={50} max={400} step={10} suffix="" color="#818cf8" onChange={setMaxSteps} />
              </div>
            )}

            {/* 流动粒子层 */}
            <ToggleControl label="流动磁感颗粒" checked={showParticles} onChange={setShowParticles} color="#c084fc" />
            {showParticles && (
              <div style={{ paddingLeft: '0.8rem', borderLeft: '2px solid rgba(192, 132, 252, 0.3)', marginBottom: '1rem' }}>
                <SliderControl label="流动速度" value={particleSpeed} min={0.2} max={3.0} step={0.1} suffix="" color="#c084fc" onChange={setParticleSpeed} />
                <SliderControl label="单线颗粒数" value={particlesPerLine} min={1} max={4} step={1} suffix=" 个" color="#c084fc" onChange={setParticlesPerLine} />
              </div>
            )}

            {/* 二维场强切片 (Heatmap) */}
            <ToggleControl label="二维场强切片 (GPU 热力图)" checked={showHeatmap} onChange={setShowHeatmap} color="#38bdf8" />
            {showHeatmap && (
              <div style={{ paddingLeft: '0.8rem', borderLeft: '2px solid rgba(56, 189, 248, 0.3)', marginBottom: '1rem' }}>
                <SliderControl label="切片高度 (Y)" value={heatmapHeight} min={-2} max={4} step={0.1} suffix="" color="#38bdf8" onChange={setHeatmapHeight} />
                <SliderControl label="切片不透明度" value={heatmapOpacity} min={0.1} max={1.0} step={0.05} suffix="" color="#38bdf8" onChange={setHeatmapOpacity} />
              </div>
            )}
          </div>

        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <p style={{ margin: '0 0 0.4rem 0' }}><strong>左手：</strong>捏合拖拽旋转视角，双手缩放。</p>
          <p style={{ margin: 0 }}><strong>右手：</strong>捏合拖拽直接控制磁铁位移。</p>
        </div>
      </div>
    </>
  );
};
