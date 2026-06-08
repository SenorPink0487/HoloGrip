import { useState } from 'react';
import './App.css';
import { Magnet } from './math/physics';
import { Canvas3D } from './components/Canvas3D';
import { ControlPanel } from './components/ControlPanel';
import { Launcher } from './components/Launcher';
import { FaradayApp } from './components/faraday/FaradayApp';
import { ArrowLeft } from 'lucide-react';

const defaultMagnets: Magnet[] = [
  {
    id: 'magnet-1',
    name: '磁铁 A',
    position: [-2.5, 1.5, 0],
    rotation: [0, 0, -Math.PI / 2],
    strength: 4.0,
    length: 2.5,
    width: 0.6,
    shape: 'box',
  },
  {
    id: 'magnet-2',
    name: '磁铁 B',
    position: [2.5, 1.5, 0],
    rotation: [0, 0, -Math.PI / 2],
    strength: 4.0,
    length: 2.5,
    width: 0.6,
    shape: 'box',
  },
];

function MagnetApp({ onBack }: { onBack: () => void }) {
  // Magnet states
  const [magnets, setMagnets] = useState<Magnet[]>(defaultMagnets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'translate' | 'rotate'>('translate');

  // Visualization states
  const [density, setDensity] = useState(16);
  const [stepSize, setStepSize] = useState(0.12);
  const [maxSteps, setMaxSteps] = useState(250);
  const [lineColor, setLineColor] = useState('#4f46e5');
  const [particleColor, setParticleColor] = useState('#1e293b');
  const [particleSpeed, setParticleSpeed] = useState(1.4);
  const [particlesPerLine, setParticlesPerLine] = useState(2);
  const [lineThickness, setLineThickness] = useState(1.5);
  const [particleSize, setParticleSize] = useState(1.0);
  const [showLines, setShowLines] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [useCustomColor, setUseCustomColor] = useState(true);

  // Heatmap slice plane states
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapHeight, setHeatmapHeight] = useState(1.5);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.75);

  // Iron filings grid states
  const [showFilings, setShowFilings] = useState(false);
  const [filingsHeight, setFilingsHeight] = useState(1.5);
  const [filingsOpacity, setFilingsOpacity] = useState(0.75);

  // Update a single magnet's fields
  const handleUpdateMagnet = (id: string, updates: Partial<Magnet>) => {
    setMagnets((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  // Add a new magnet with random offset
  const handleAddMagnet = () => {
    const newId = `magnet-${Date.now()}`;
    const newMagnet: Magnet = {
      id: newId,
      name: `新建磁铁 ${magnets.length + 1}`,
      position: [
        (Math.random() - 0.5) * 3,
        1.5 + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 3,
      ],
      rotation: [0, (Math.random() - 0.5) * Math.PI, 0],
      strength: 4.0,
      length: 2.2,
      width: 0.55,
      shape: 'box',
    };
    setMagnets((prev) => [...prev, newMagnet]);
    setSelectedId(newId);
  };

  // Delete a magnet
  const handleDeleteMagnet = (id: string) => {
    setMagnets((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  // Reset scene
  const handleReset = () => {
    setMagnets(defaultMagnets);
    setSelectedId(null);
    setControlMode('translate');
    // reset vis toggles
    setShowLines(true);
    setShowParticles(true);
    setShowHeatmap(false);
    setShowFilings(false);
    setHeatmapHeight(1.5);
    setFilingsHeight(1.5);
  };

  // Apply visual preset environments
  const handleApplyPreset = (preset: string) => {
    setSelectedId(null);
    if (preset === 'attract') {
      setMagnets([
        {
          id: 'magnet-1',
          name: '磁铁 N极',
          position: [-2.4, 1.5, 0],
          rotation: [0, 0, -Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
        {
          id: 'magnet-2',
          name: '磁铁 S极',
          position: [2.4, 1.5, 0],
          rotation: [0, 0, -Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
      ]);
    } else if (preset === 'repel') {
      setMagnets([
        {
          id: 'magnet-1',
          name: '磁铁 A (N极向右)',
          position: [-2.4, 1.5, 0],
          rotation: [0, 0, -Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
        {
          id: 'magnet-2',
          name: '磁铁 B (N极向左)',
          position: [2.4, 1.5, 0],
          rotation: [0, 0, Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
      ]);
    } else if (preset === 'parallel') {
      setMagnets([
        {
          id: 'magnet-1',
          name: '磁铁 A',
          position: [0, 1.5, -1.8],
          rotation: [0, 0, -Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
        {
          id: 'magnet-2',
          name: '磁铁 B',
          position: [0, 1.5, 1.8],
          rotation: [0, 0, -Math.PI / 2],
          strength: 4.5,
          length: 2.5,
          width: 0.6,
          shape: 'box',
        },
      ]);
    } else if (preset === 'single') {
      setMagnets([
        {
          id: 'magnet-single',
          name: '单极磁体',
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
          strength: 5.0,
          length: 3.2,
          width: 0.7,
          shape: 'box',
        },
      ]);
    }
  };

  return (
    <div className="app-container">
      <ControlPanel
        onBack={onBack}
        magnets={magnets}
        selectedId={selectedId}
        controlMode={controlMode}
        setControlMode={setControlMode}
        onSelect={setSelectedId}
        onUpdate={handleUpdateMagnet}
        onAdd={handleAddMagnet}
        onDelete={handleDeleteMagnet}
        onReset={handleReset}
        applyPreset={handleApplyPreset}
        
        density={density}
        setDensity={setDensity}
        stepSize={stepSize}
        setStepSize={setStepSize}
        maxSteps={maxSteps}
        setMaxSteps={setMaxSteps}
        lineColor={lineColor}
        setLineColor={setLineColor}
        particleColor={particleColor}
        setParticleColor={setParticleColor}
        particleSpeed={particleSpeed}
        setParticleSpeed={setParticleSpeed}
        particlesPerLine={particlesPerLine}
        setParticlesPerLine={setParticlesPerLine}
        lineThickness={lineThickness}
        setLineThickness={setLineThickness}
        particleSize={particleSize}
        setParticleSize={setParticleSize}
        useCustomColor={useCustomColor}
        setUseCustomColor={setUseCustomColor}
        showLines={showLines}
        setShowLines={setShowLines}
        showParticles={showParticles}
        setShowParticles={setShowParticles}
        
        showHeatmap={showHeatmap}
        setShowHeatmap={setShowHeatmap}
        heatmapHeight={heatmapHeight}
        setHeatmapHeight={setHeatmapHeight}
        heatmapOpacity={heatmapOpacity}
        setHeatmapOpacity={setHeatmapOpacity}
        
        showFilings={showFilings}
        setShowFilings={setShowFilings}
        filingsHeight={filingsHeight}
        setFilingsHeight={setFilingsHeight}
        filingsOpacity={filingsOpacity}
        setFilingsOpacity={setFilingsOpacity}
      />

      {/* Main 3D canvas filling the entire screen */}
      <div className="canvas-container">
        <Canvas3D
          magnets={magnets}
          selectedId={selectedId}
          controlMode={controlMode}
          onSelect={setSelectedId}
          onUpdate={handleUpdateMagnet}
          
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
          
          showHeatmap={showHeatmap}
          heatmapHeight={heatmapHeight}
          heatmapOpacity={heatmapOpacity}
          
          showFilings={showFilings}
          filingsHeight={filingsHeight}
          filingsOpacity={filingsOpacity}
        />
      </div>
    </div>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState<'launcher' | 'magnet' | 'faraday'>('launcher');

  if (currentPage === 'launcher') {
    return <Launcher onSelectProject={setCurrentPage} />;
  }

  if (currentPage === 'magnet') {
    return <MagnetApp onBack={() => setCurrentPage('launcher')} />;
  }

  if (currentPage === 'faraday') {
    return <FaradayApp onBack={() => setCurrentPage('launcher')} />;
  }

  return null;
}

export default App;
