import { useState, useMemo } from 'react';
import { Experiment3D } from './components/Experiment3D';
import { Settings2, Zap, Scale3D, Activity, Cable, Save, LineChart as LineChartIcon, Database } from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { DataRecorder, RecordPoint } from './components/DataRecorder';

export default function App() {
  const [Im, setIm] = useState<number>(0.5); // A
  const [Is, setIs] = useState<number>(5.0); // mA
  const [probePos, setProbePos] = useState<number>(0.0); // cm
  const [probeTarget, setProbeTarget] = useState<'helmholtz' | 'solenoid'>('helmholtz');
  const [rightCoilPos, setRightCoilPos] = useState<number>(2.5); // cm
  const [turns, setTurns] = useState<number>(100); // 匝数
  const [connections, setConnections] = useState<any[]>([]);
  const [records, setRecords] = useState<RecordPoint[]>([]);
  const [showDataRecorder, setShowDataRecorder] = useState(false);

  const handleRecord = () => {
    setRecords(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        pos: probePos,
        vh: currentVH * 1000,
        im: Im,
        is: Is
      }
    ]);
  };

  const handleClear = () => {
    setRecords([]);
  };

  // Determine active coil based on wiring
  const coilState = useMemo(() => {
    const connectedToImPos = connections.map(c => c.start === 'im_out_pos' ? c.end : (c.end === 'im_out_pos' ? c.start : null)).filter(Boolean);
    const connectedToImNeg = connections.map(c => c.start === 'im_out_neg' ? c.end : (c.end === 'im_out_neg' ? c.start : null)).filter(Boolean);
    
    // Helmholtz
    if (connectedToImPos.includes('helm_pos') && connectedToImNeg.includes('helm_neg')) return { type: 'helmholtz', dir: 1 };
    if (connectedToImPos.includes('helm_neg') && connectedToImNeg.includes('helm_pos')) return { type: 'helmholtz', dir: -1 };
    
    // Solenoid
    if (connectedToImPos.includes('solenoid_pos') && connectedToImNeg.includes('solenoid_neg')) return { type: 'solenoid', dir: 1 };
    if (connectedToImPos.includes('solenoid_neg') && connectedToImNeg.includes('solenoid_pos')) return { type: 'solenoid', dir: -1 };
    
    return { type: 'none', dir: 0 };
  }, [connections]);

  const activeCoil = coilState.type;
  const activeDir = coilState.dir;

  // Calculate Hall Voltage
  const calculateVH = () => {
    let B = 0;
    const R = 5.0; // Coil radius
    const p = probePos; // Current position
    
    if (activeCoil === 'helmholtz' && probeTarget === 'helmholtz') {
      const B1 = Math.pow(R, 2) / Math.pow(Math.pow(R, 2) + Math.pow(p - rightCoilPos, 2), 1.5);
      const B2 = Math.pow(R, 2) / Math.pow(Math.pow(R, 2) + Math.pow(p + 2.5, 2), 1.5);
      B = (B1 + B2) * activeDir;
    } else if (activeCoil === 'solenoid' && probeTarget === 'solenoid') {
      const B_center = (turns / 50); 
      // Approximate shape: field is strong inside [-13, 13]
      const bScale = Math.max(0, 1 - Math.pow(p/13, 2));
      B = B_center * bScale * activeDir;
    }
    
    // Hall coefficient constant scaled for realistic display (mV)
    const K = 14; 
    
    // Add realistic 0.01 fluctuation
    const noise = (activeCoil !== 'none' && Im > 0 && Is > 0) ? (Math.random() - 0.5) * 0.02 : 0;
    
    return (K * Im * Is * B + noise) / 1000; // Return V, display as mV
  };

  const currentVH = calculateVH();

  return (
    <ErrorBoundary>
    <div className="flex h-screen bg-neutral-900 text-neutral-200 overflow-hidden font-sans">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 3D Canvas Area */}
        <div className="flex-1 relative cursor-grab active:cursor-grabbing min-h-0">
          <Experiment3D 
            Im={Im} 
            Is={Is} 
            probePos={probePos}
            probeTarget={probeTarget}
            rightCoilPos={rightCoilPos}
            turns={turns}
            setProbePos={setProbePos}
            setRightCoilPos={setRightCoilPos}
            setIm={setIm}
            setIs={setIs}
            VH={currentVH} 
            connections={connections}
            setConnections={setConnections}
            imDirection={activeDir}
          />
          <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 shadow-xl pointer-events-none">
            <h1 className="text-lg font-bold tracking-tight text-white">霍尔效应测磁平台</h1>
            <p className="text-xs text-neutral-400">HCC-2 3D 可视化模拟</p>
          </div>
          
          {/* Data Recorder Modal/Overlay */}
          {showDataRecorder && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-5xl h-[600px] animate-in fade-in zoom-in-95 duration-200">
                <DataRecorder 
                  data={records} 
                  onClear={handleClear} 
                  onClose={() => setShowDataRecorder(false)} 
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls Sidebar */}
      <div className="w-[340px] bg-neutral-950/80 backdrop-blur-2xl border-l border-white/5 p-6 flex flex-col gap-6 shadow-2xl z-10 shrink-0 overflow-y-auto
                      [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 transition-all">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10 relative">
          <div className="absolute inset-x-0 -bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Settings2 className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">实验参数控制</h2>
        </div>

        <div className="flex flex-col gap-5">
          {/* Target Selection */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 block">测量对象位置</label>
            <div className="flex bg-black/50 border border-white/10 rounded-xl p-1 relative">
              <div 
                className="absolute inset-y-1 bg-white/10 rounded-lg transition-all duration-300 ease-out shadow-sm border border-white/10"
                style={{ 
                  width: 'calc(50% - 4px)', 
                  left: probeTarget === 'helmholtz' ? '4px' : 'calc(50%)' 
                }}
              />
              <button 
                onClick={() => setProbeTarget('helmholtz')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors relative z-10 ${probeTarget === 'helmholtz' ? 'text-white drop-shadow-md' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                亥姆霍兹线圈
              </button>
              <button 
                onClick={() => setProbeTarget('solenoid')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors relative z-10 ${probeTarget === 'solenoid' ? 'text-white drop-shadow-md' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                长螺线管
              </button>
            </div>
          </div>

          {/* Data Recording Controls */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300 group">
            <div className="flex items-center gap-2 mb-4 text-neutral-300">
              <div className="p-1.5 bg-emerald-500/10 rounded-md">
                <Database className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-sm font-medium">数据记录</span>
              <span className="ml-auto text-xs px-2.5 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/5 font-mono">
                已记录 {records.length} 组
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRecord}
                className="group/btn relative flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 hover:from-emerald-500/20 hover:to-emerald-500/10 text-emerald-400 p-3 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 overflow-hidden"
                title="记录当前位置的读数"
              >
                <div className="absolute inset-0 bg-emerald-400/20 blur-xl opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500 rounded-full scale-150" />
                <Save className="w-5 h-5 relative z-10 drop-shadow-md" />
                <span className="text-xs font-semibold tracking-wide relative z-10">记录数据</span>
              </button>
              <button
                onClick={() => setShowDataRecorder(true)}
                className="group/btn relative flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-purple-500/10 to-purple-500/5 hover:from-purple-500/20 hover:to-purple-500/10 text-purple-400 p-3 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 overflow-hidden"
                title="查看关系曲线"
              >
                <div className="absolute inset-0 bg-purple-400/20 blur-xl opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500 rounded-full scale-150" />
                <LineChartIcon className="w-5 h-5 relative z-10 drop-shadow-md" />
                <span className="text-xs font-semibold tracking-wide relative z-10">关系曲线</span>
              </button>
            </div>
          </div>

          {/* Active Coil Status */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/10 rounded-md">
                  <Cable className="w-4 h-4 text-purple-400" />
                </div>
                当前接入线圈
              </label>
            </div>
            <div className={`mt-3 flex items-center justify-center py-2.5 rounded-lg border transition-all duration-300 ${activeCoil === 'none' ? 'bg-neutral-800/50 border-neutral-700/50 text-neutral-400' : 'bg-purple-500/10 border-purple-500/30 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.15)]'}`}>
              <span className="font-semibold text-sm tracking-wide">
                {activeCoil === 'none' ? '未接入' : activeCoil === 'helmholtz' ? '亥姆霍兹线圈' : '长螺线管'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed text-center">
              在 3D 视图中拖动接线柱进行连线<br/>单击接线柱可移除连线
            </p>
          </div>

          {/* Excitation Current Control */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <div className="p-1.5 bg-yellow-500/10 rounded-md shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                  <Zap className="w-4 h-4 text-yellow-400" />
                </div>
                励磁电流 (Im)
              </label>
              <div className="flex items-center bg-black/50 border border-white/10 rounded-lg p-0.5 focus-within:border-yellow-500/50 focus-within:ring-1 focus-within:ring-yellow-500/20 transition-all">
                <input 
                  type="number" 
                  value={Im}
                  onChange={(e) => setIm(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                  step="0.001"
                  min="0"
                  max="1"
                  className="w-16 bg-transparent text-yellow-400 font-mono text-sm px-2 py-1 outline-none text-right placeholder-neutral-600"
                />
                <span className="font-mono text-neutral-500 text-xs pr-2">A</span>
              </div>
            </div>
            <div className="relative group">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.001" 
                value={Im}
                onChange={(e) => setIm(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-yellow-400 hover:accent-yellow-300 transition-all"
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-2 px-1">
              <span>0.000 A</span>
              <span>1.000 A</span>
            </div>
          </div>

          {/* Hall Current Control */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <div className="p-1.5 bg-green-500/10 rounded-md shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                  <Activity className="w-4 h-4 text-green-400" />
                </div>
                霍尔电流 (Is)
              </label>
              <div className="flex items-center bg-black/50 border border-white/10 rounded-lg p-0.5 focus-within:border-green-500/50 focus-within:ring-1 focus-within:ring-green-500/20 transition-all">
                <input 
                  type="number" 
                  value={Is}
                  onChange={(e) => setIs(Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)))}
                  step="0.01"
                  min="0"
                  max="10"
                  className="w-16 bg-transparent text-green-400 font-mono text-sm px-2 py-1 outline-none text-right"
                />
                <span className="font-mono text-neutral-500 text-xs pr-2">mA</span>
              </div>
            </div>
            <div className="relative group">
              <input 
                type="range" 
                min="0" 
                max="10" 
                step="0.01" 
                value={Is}
                onChange={(e) => setIs(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-green-400 hover:accent-green-300 transition-all"
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-2 px-1">
              <span>0.00 mA</span>
              <span>10.00 mA</span>
            </div>
          </div>

          {/* Position & Measurement Control */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300 flex flex-col gap-5">
            {/* Probe Position */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/10 rounded-md shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                    <Scale3D className="w-4 h-4 text-blue-400" />
                  </div>
                  探头位置 (X)
                </label>
                <div className="flex items-center bg-black/50 border border-white/10 rounded-lg p-0.5 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
                  <input 
                    type="number" 
                    value={probePos}
                    onChange={(e) => setProbePos(Math.min(15, Math.max(-15, parseFloat(e.target.value) || 0)))}
                    step="0.1"
                    min="-15"
                    max="15"
                    className="w-16 bg-transparent text-blue-400 font-mono text-sm px-2 py-1 outline-none text-right"
                  />
                  <span className="font-mono text-neutral-500 text-xs pr-2">cm</span>
                </div>
              </div>
              <div className="relative group">
                <input 
                  type="range" 
                  min="-15" 
                  max="15" 
                  step="0.1" 
                  value={probePos}
                  onChange={(e) => setProbePos(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-blue-400 hover:accent-blue-300 transition-all"
                />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-2 px-1">
                <span>-15.0</span>
                <span>0.0</span>
                <span>+15.0</span>
              </div>
            </div>

            {/* Right Coil Position */}
            <div className="pt-5 border-t border-white/5">
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/10 rounded-md shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                    <Settings2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  右侧线圈位置 (X)
                </label>
                <div className="flex items-center bg-black/50 border border-white/10 rounded-lg p-0.5 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
                  <input 
                    type="number" 
                    value={rightCoilPos}
                    onChange={(e) => setRightCoilPos(Math.min(13, Math.max(-0.5, parseFloat(e.target.value) || 0)))}
                    step="0.1"
                    min="-0.5"
                    max="13"
                    className="w-16 bg-transparent text-indigo-400 font-mono text-sm px-2 py-1 outline-none text-right"
                  />
                  <span className="font-mono text-neutral-500 text-xs pr-2">cm</span>
                </div>
              </div>
              <div className="relative group">
                <input 
                  type="range" 
                  min="-0.5" 
                  max="13" 
                  step="0.1" 
                  value={rightCoilPos}
                  onChange={(e) => setRightCoilPos(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-indigo-400 hover:accent-indigo-300 transition-all"
                />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-2 px-1">
                <span>-0.5</span>
                <span>+13.0</span>
              </div>
            </div>

          </div>

          {/* Solenoid Turns Control */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors duration-300 mb-4">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <div className="p-1.5 bg-orange-500/10 rounded-md shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                  <Settings2 className="w-4 h-4 text-orange-400" />
                </div>
                螺线管匝数 (N)
              </label>
              <div className="flex items-center bg-black/50 border border-white/10 rounded-lg p-0.5 focus-within:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/20 transition-all">
                <input 
                  type="number" 
                  value={turns}
                  onChange={(e) => setTurns(Math.min(300, Math.max(10, parseInt(e.target.value) || 10)))}
                  step="2"
                  min="10"
                  max="300"
                  className="w-16 bg-transparent text-orange-400 font-mono text-sm px-2 py-1 outline-none text-right"
                />
                <span className="font-mono text-neutral-500 text-xs pr-2">匝</span>
              </div>
            </div>
            <div className="relative group">
              <input 
                type="range" 
                min="10" 
                max="300" 
                step="2" 
                value={turns}
                onChange={(e) => setTurns(parseInt(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-orange-400 hover:accent-orange-300 transition-all"
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-2 px-1">
              <span>10</span>
              <span>300</span>
            </div>
          </div>

        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
