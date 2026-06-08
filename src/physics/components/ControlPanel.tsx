import React from 'react';
import {
  Magnet as MagnetIcon,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Eye,
  Info,
  ChevronLeft,
  Menu,
  ArrowLeft
} from 'lucide-react';
import { HexColorPicker } from "react-colorful";
import { Magnet } from '../math/physics';

const PopoverPicker = ({ color, onChange, title }: { color: string, onChange: (c: string) => void, title?: string }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const popover = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (isOpen && popover.current && !popover.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div className="picker-container" ref={popover}>
      <div
        className="color-swatch"
        style={{ backgroundColor: color }}
        onClick={() => setIsOpen(!isOpen)}
        title={title}
      />
      {isOpen && (
        <div className="picker-popover">
          <HexColorPicker color={color} onChange={onChange} />
        </div>
      )}
    </div>
  );
};

interface ControlPanelProps {
  onBack: () => void;
  magnets: Magnet[];
  selectedId: string | null;
  controlMode: 'translate' | 'rotate';
  setControlMode: (mode: 'translate' | 'rotate') => void;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<Magnet>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  applyPreset: (presetName: string) => void;
  
  // Params
  density: number;
  setDensity: (v: number) => void;
  stepSize: number;
  setStepSize: (v: number) => void;
  maxSteps: number;
  setMaxSteps: (v: number) => void;
  lineColor: string;
  setLineColor: (v: string) => void;
  particleColor: string;
  setParticleColor: (v: string) => void;
  particleSpeed: number;
  setParticleSpeed: (v: number) => void;
  particlesPerLine: number;
  setParticlesPerLine: (v: number) => void;
  lineThickness: number;
  setLineThickness: (v: number) => void;
  particleSize: number;
  setParticleSize: (v: number) => void;
  useCustomColor: boolean;
  setUseCustomColor: (v: boolean) => void;
  showLines: boolean;
  setShowLines: (v: boolean) => void;
  showParticles: boolean;
  setShowParticles: (v: boolean) => void;
  
  // Heatmap
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
  heatmapHeight: number;
  setHeatmapHeight: (v: number) => void;
  heatmapOpacity: number;
  setHeatmapOpacity: (v: number) => void;
  
  // Filings
  showFilings: boolean;
  setShowFilings: (v: boolean) => void;
  filingsHeight: number;
  setFilingsHeight: (v: number) => void;
  filingsOpacity: number;
  setFilingsOpacity: (v: number) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onBack,
  magnets,
  selectedId,
  controlMode,
  setControlMode,
  onSelect,
  onUpdate,
  onAdd,
  onDelete,
  onReset,
  applyPreset,
  
  density,
  setDensity,
  stepSize,
  setStepSize,
  maxSteps,
  setMaxSteps,
  lineColor,
  setLineColor,
  particleColor,
  setParticleColor,
  particleSpeed,
  setParticleSpeed,
  particlesPerLine,
  setParticlesPerLine,
  lineThickness,
  setLineThickness,
  particleSize,
  setParticleSize,
  useCustomColor,
  setUseCustomColor,
  showLines,
  setShowLines,
  showParticles,
  setShowParticles,
  
  showHeatmap,
  setShowHeatmap,
  heatmapHeight,
  setHeatmapHeight,
  heatmapOpacity,
  setHeatmapOpacity,
  
  showFilings,
  setShowFilings,
  filingsHeight,
  setFilingsHeight,
  filingsOpacity,
  setFilingsOpacity,
}) => {
  const selectedMagnet = magnets.find((m) => m.id === selectedId);

  const radToDeg = (rad: number) => Math.round((rad * 180) / Math.PI);
  const degToRad = (deg: number) => (deg * Math.PI) / 180;

  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <>
      {isCollapsed && (
        <button 
          className="btn-toggle-sidebar" 
          onClick={() => setIsCollapsed(false)}
        >
          <Menu size={20} />
        </button>
      )}
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="sidebar-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#4f46e5', padding: '0.6rem 1rem',
              borderRadius: '10px', color: '#ffffff', border: 'none', 
              cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#4338ca'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.4)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)'; }}
          >
            <ArrowLeft size={18} />
            返回启动器
          </button>
          <button className="btn-icon" onClick={() => setIsCollapsed(true)}>
            <ChevronLeft size={20} />
          </button>
        </div>

      <div className="sidebar-content">
        {/* Presets */}
        <div className="sidebar-section">
          <h2 className="section-title">
            <Sparkles size={14} color="#818cf8" />
            快速场景预设
          </h2>
          <div className="preset-grid">
            <button onClick={() => applyPreset('attract')} className="preset-button">
              🧲 异极相吸 (N-S)
            </button>
            <button onClick={() => applyPreset('repel')} className="preset-button">
              🧲 同极相斥 (N-N)
            </button>
            <button onClick={() => applyPreset('parallel')} className="preset-button">
              🧲 平行偶极
            </button>
            <button onClick={() => applyPreset('single')} className="preset-button">
              🧲 单个磁体
            </button>
          </div>
        </div>

        {/* Magnet Manager */}
        <div className="sidebar-section">
          <div className="section-header-row">
            <h2 className="section-title">
              <MagnetIcon size={14} color="#818cf8" />
              磁铁管理器 ({magnets.length})
            </h2>
            <button onClick={onAdd} className="btn-primary">
              <Plus size={14} />
              添加磁体
            </button>
          </div>

          <div className="magnet-list">
            {magnets.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#555866', textAlign: 'center', padding: '12px 0' }}>
                场景中暂无磁铁
              </p>
            ) : (
              magnets.map((m) => (
                <div
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={`magnet-item ${selectedId === m.id ? 'selected' : ''}`}
                >
                  <span className="truncate">🧲 {m.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    className="btn-icon"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dual Magnet Distance Control */}
        {magnets.length === 2 && (() => {
          const m1 = magnets[0];
          const m2 = magnets[1];
          const dx = m2.position[0] - m1.position[0];
          const dy = m2.position[1] - m1.position[1];
          const dz = m2.position[2] - m1.position[2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          const handleUpdateDistance = (newDist: number) => {
            const cx = (m1.position[0] + m2.position[0]) / 2;
            const cy = (m1.position[1] + m2.position[1]) / 2;
            const cz = (m1.position[2] + m2.position[2]) / 2;
            
            let ux = 1, uy = 0, uz = 0;
            if (distance > 1e-4) {
              ux = dx / distance;
              uy = dy / distance;
              uz = dz / distance;
            }
            
            const half = newDist / 2;
            
            onUpdate(m1.id, {
              position: [cx - ux * half, cy - uy * half, cz - uz * half]
            });
            onUpdate(m2.id, {
              position: [cx + ux * half, cy + uy * half, cz + uz * half]
            });
          };

          return (
            <div className="sidebar-section" style={{ background: 'rgba(99, 102, 241, 0.06)', padding: '12px', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '8px' }}>
              <div className="control-label-row">
                <span style={{ color: '#818cf8', fontWeight: 600 }}>双磁体间距控制</span>
                <span style={{ fontFamily: 'monospace', color: '#818cf8', fontWeight: 600 }}>{distance.toFixed(2)}</span>
              </div>
              <div className="slider-row" style={{ marginTop: '6px' }}>
                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.05"
                  value={distance}
                  onChange={(e) => handleUpdateDistance(parseFloat(e.target.value))}
                  className="range-slider"
                />
              </div>
            </div>
          );
        })()}

        {/* Selected Magnet Editor */}
        <div className="sidebar-section">
          {selectedMagnet ? (
            <div className="magnet-editor">
              <div className="editor-header">
                <span className="editor-title">编辑：{selectedMagnet.name}</span>
                <div className="gizmo-toggles">
                  <button
                    onClick={() => setControlMode('translate')}
                    className={`gizmo-btn ${controlMode === 'translate' ? 'active' : ''}`}
                  >
                    移动
                  </button>
                  <button
                    onClick={() => setControlMode('rotate')}
                    className={`gizmo-btn ${controlMode === 'rotate' ? 'active' : ''}`}
                  >
                    旋转
                  </button>
                </div>
              </div>

              {/* Position Sliders */}
              <div>
                <div className="control-label-row">
                  <span>坐标位置 (X, Y, Z)</span>
                  <span>
                    [{selectedMagnet.position[0].toFixed(1)}, {selectedMagnet.position[1].toFixed(1)}, {selectedMagnet.position[2].toFixed(1)}]
                  </span>
                </div>
                <div className="sliders-stack">
                  <div className="slider-row">
                    <span className="axis-label">X</span>
                    <input
                      type="range"
                      min="-8"
                      max="8"
                      step="0.1"
                      value={selectedMagnet.position[0]}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          position: [parseFloat(e.target.value), selectedMagnet.position[1], selectedMagnet.position[2]],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                  <div className="slider-row">
                    <span className="axis-label">Y</span>
                    <input
                      type="range"
                      min="-2"
                      max="5"
                      step="0.1"
                      value={selectedMagnet.position[1]}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          position: [selectedMagnet.position[0], parseFloat(e.target.value), selectedMagnet.position[2]],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                  <div className="slider-row">
                    <span className="axis-label">Z</span>
                    <input
                      type="range"
                      min="-8"
                      max="8"
                      step="0.1"
                      value={selectedMagnet.position[2]}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          position: [selectedMagnet.position[0], selectedMagnet.position[1], parseFloat(e.target.value)],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                </div>
              </div>

              {/* Rotation Sliders */}
              <div>
                <div className="control-label-row">
                  <span>旋转角度 (Pitch, Yaw, Roll)</span>
                  <span>
                    {radToDeg(selectedMagnet.rotation[0])}°, {radToDeg(selectedMagnet.rotation[1])}°, {radToDeg(selectedMagnet.rotation[2])}°
                  </span>
                </div>
                <div className="sliders-stack">
                  <div className="slider-row">
                    <span className="axis-label">Pitch</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={radToDeg(selectedMagnet.rotation[0])}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          rotation: [degToRad(parseFloat(e.target.value)), selectedMagnet.rotation[1], selectedMagnet.rotation[2]],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                  <div className="slider-row">
                    <span className="axis-label">Yaw</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={radToDeg(selectedMagnet.rotation[1])}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          rotation: [selectedMagnet.rotation[0], degToRad(parseFloat(e.target.value)), selectedMagnet.rotation[2]],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                  <div className="slider-row">
                    <span className="axis-label">Roll</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={radToDeg(selectedMagnet.rotation[2])}
                      onChange={(e) =>
                        onUpdate(selectedMagnet.id, {
                          rotation: [selectedMagnet.rotation[0], selectedMagnet.rotation[1], degToRad(parseFloat(e.target.value))],
                        })
                      }
                      className="range-slider"
                    />
                  </div>
                </div>
              </div>

              {/* Physical Parameters */}
              <div className="num-inputs-row">
                <div className="num-input-group">
                  <label className="num-input-label">磁极强度 (q_m)</label>
                  <input
                    type="number"
                    min="0.1"
                    max="15"
                    step="0.1"
                    value={selectedMagnet.strength}
                    onChange={(e) =>
                      onUpdate(selectedMagnet.id, { strength: Math.max(0.1, parseFloat(e.target.value) || 1) })
                    }
                    className="num-input"
                  />
                </div>
                <div className="num-input-group">
                  <label className="num-input-label">磁铁长度 (L)</label>
                  <input
                    type="number"
                    min="0.5"
                    max="8"
                    step="0.1"
                    value={selectedMagnet.length}
                    onChange={(e) =>
                      onUpdate(selectedMagnet.id, { length: Math.max(0.5, parseFloat(e.target.value) || 2) })
                    }
                    className="num-input"
                  />
                </div>
              </div>

              {/* Width slider */}
              <div style={{ marginTop: '8px' }}>
                <div className="control-label-row">
                  <span>磁铁宽度</span>
                  <span>{selectedMagnet.width.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.05"
                  value={selectedMagnet.width}
                  onChange={(e) =>
                    onUpdate(selectedMagnet.id, { width: parseFloat(e.target.value) })
                  }
                  className="range-slider"
                />
              </div>

              {/* Shape selector */}
              <div style={{ marginTop: '8px' }}>
                <div className="control-label-row" style={{ marginBottom: '6px' }}>
                  <span>磁铁形状</span>
                </div>
                <div className="gizmo-toggles">
                  <button
                    onClick={() => onUpdate(selectedMagnet.id, { shape: 'box' })}
                    className={`gizmo-btn ${selectedMagnet.shape === 'box' ? 'active' : ''}`}
                  >
                    方形
                  </button>
                  <button
                    onClick={() => onUpdate(selectedMagnet.id, { shape: 'cylinder' })}
                    className={`gizmo-btn ${selectedMagnet.shape === 'cylinder' ? 'active' : ''}`}
                  >
                    圆柱
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="editor-info-box">
              <Info size={16} color="rgba(129, 140, 248, 0.7)" />
              <span>
                点击磁铁或列表项进行参数编辑，
                <br />
                或在3D视口中拖拽位置/旋转。
              </span>
            </div>
          )}
        </div>

        {/* Layer Manager */}
        <div className="sidebar-section">
          <h2 className="section-title">
            <Eye size={14} color="#818cf8" />
            可视化图层
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Field Lines Layer */}
            <div className="layer-box">
              <div className="layer-header-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showLines}
                    onChange={(e) => setShowLines(e.target.checked)}
                  />
                  三维磁感线
                </label>
                <PopoverPicker
                  color={lineColor}
                  onChange={(c) => {
                    setLineColor(c);
                    if (!useCustomColor) setUseCustomColor(true);
                  }}
                  title="线段颜色"
                />
              </div>
              {showLines && (
                <div className="layer-params">
                  <div className="layer-param-item">
                    <label className="checkbox-label" style={{ marginBottom: '4px' }}>
                      <input
                        type="checkbox"
                        checked={useCustomColor}
                        onChange={(e) => setUseCustomColor(e.target.checked)}
                      />
                      使用单色 (覆盖场强渐变)
                    </label>
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>线条粗细</span>
                      <span>{lineThickness.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="10.0"
                      step="0.5"
                      value={lineThickness}
                      onChange={(e) => setLineThickness(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>线条密度</span>
                      <span>{density} 条/极</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="48"
                      step="2"
                      value={density}
                      onChange={(e) => setDensity(parseInt(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>积分步长 (Step)</span>
                      <span>{stepSize.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.30"
                      step="0.01"
                      value={stepSize}
                      onChange={(e) => setStepSize(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>最大步数 (Steps)</span>
                      <span>{maxSteps}</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="400"
                      step="10"
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(parseInt(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Flowing Particles Layer */}
            <div className="layer-box">
              <div className="layer-header-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showParticles}
                    onChange={(e) => setShowParticles(e.target.checked)}
                  />
                  流动磁感颗粒
                </label>
                <PopoverPicker
                  color={particleColor}
                  onChange={(c) => setParticleColor(c)}
                  title="颗粒颜色"
                />
              </div>
              {showParticles && (
                <div className="layer-params">
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>颗粒大小</span>
                      <span>{particleSize.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="4.0"
                      step="0.1"
                      value={particleSize}
                      onChange={(e) => setParticleSize(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>流动速度</span>
                      <span>{particleSpeed.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="3.0"
                      step="0.1"
                      value={particleSpeed}
                      onChange={(e) => setParticleSpeed(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>单线颗粒数</span>
                      <span>{particlesPerLine} 个</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={particlesPerLine}
                      onChange={(e) => setParticlesPerLine(parseInt(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Heatmap Layer */}
            <div className="layer-box">
              <div className="layer-header-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  二维场强切片 (GPU)
                </label>
              </div>
              {showHeatmap && (
                <div className="layer-params">
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>切片高度 (Y)</span>
                      <span>{heatmapHeight.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="-2"
                      max="4"
                      step="0.1"
                      value={heatmapHeight}
                      onChange={(e) => setHeatmapHeight(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>不透明度</span>
                      <span>{Math.round(heatmapOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={heatmapOpacity}
                      onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Iron Filings Layer */}
            <div className="layer-box">
              <div className="layer-header-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showFilings}
                    onChange={(e) => setShowFilings(e.target.checked)}
                  />
                  铁屑面 (Compass)
                </label>
              </div>
              {showFilings && (
                <div className="layer-params">
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>铁屑面高度 (Y)</span>
                      <span>{filingsHeight.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="-2"
                      max="4"
                      step="0.1"
                      value={filingsHeight}
                      onChange={(e) => setFilingsHeight(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                  <div className="layer-param-item">
                    <div className="control-label-row">
                      <span>不透明度</span>
                      <span>{Math.round(filingsOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={filingsOpacity}
                      onChange={(e) => setFilingsOpacity(parseFloat(e.target.value))}
                      className="range-slider"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Reset */}
        <div>
          <button onClick={onReset} className="btn-reset">
            <RotateCcw size={16} />
            重置仿真场景
          </button>
        </div>
      </div>
      </div>
    </>
  );
};
