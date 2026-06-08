import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Database, ChevronRight, Download, LineChart as LineChartIcon, Play } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface PhysicsDataRecord {
  time: number;
  distance: number;
  flux: number;
  emf: number;
  current: number;
  dPhi?: number;
  dt?: number;
}

const formatSci = (val: number, digits: number = 3) => {
  if (val === 0 || isNaN(val)) return '0';
  const str = val.toExponential(digits);
  const [base, exp] = str.split('e');
  if (!exp) return str;
  const expNum = parseInt(exp, 10);
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'
  };
  const expStr = expNum.toString().split('').map(c => superscripts[c] || c).join('');
  return `${base} × 10${expStr}`;
};

interface FaradayDataPanelProps {
  experiments: PhysicsDataRecord[][];
  selectedExperimentIndex: number;
  setSelectedExperimentIndex: (index: number) => void;
  coils: number;
  wireResistance: number;
  radius: number;
  baseMagneticField: number;
  metersPerUnit: number;
}

export const FaradayDataPanel: React.FC<FaradayDataPanelProps> = ({ 
  experiments, 
  selectedExperimentIndex, 
  setSelectedExperimentIndex,
  coils,
  wireResistance,
  radius,
  baseMagneticField: _baseMagneticField,
  metersPerUnit
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectedParam, setSelectedParam] = useState<keyof Omit<PhysicsDataRecord, 'time'>>('emf');
  const [clickedData, setClickedData] = useState<PhysicsDataRecord | null>(null);
  const [hoveredData, setHoveredData] = useState<PhysicsDataRecord | null>(null);
  
  const [isRendered, setIsRendered] = useState(false);

  const data = experiments[selectedExperimentIndex] || [];
  const totalTime = data.length > 0 ? data[data.length - 1].time : 0;

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const t = d.time;
      if (startTime && !isNaN(parseFloat(startTime)) && t < parseFloat(startTime)) return false;
      if (endTime && !isNaN(parseFloat(endTime)) && t > parseFloat(endTime)) return false;
      return true;
    });
  }, [data, startTime, endTime]);

  if (experiments.length === 0) return null;

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "时间(s),位移(m),磁通量(Wb),电动势(V),电流(A)\n"
      + filteredData.map(r => `${r.time.toFixed(1)},${r.distance.toFixed(3)},${r.flux.toExponential(2)},${r.emf.toExponential(2)},${r.current.toExponential(2)}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `faraday_experiment_${selectedExperimentIndex + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateReport = () => {
    if (filteredData.length === 0) {
      alert("当前实验数据为空！");
      return;
    }
    
    const maxEmf = Math.max(...filteredData.map(d => Math.abs(d.emf)));
    const maxCurrent = Math.max(...filteredData.map(d => Math.abs(d.current)));
    const maxFlux = Math.max(...filteredData.map(d => Math.abs(d.flux)));
    const duration = filteredData[filteredData.length - 1].time - filteredData[0].time;

    const reportContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>法拉第电磁感应定律 - 实验报告 #${selectedExperimentIndex + 1}</title>
  <script src="${window.location.origin}/assets/chart.js"></script>
  <style>
    :root {
      --bg: #09090b; --card-bg: rgba(24, 24, 27, 0.6);
      --border: rgba(255, 255, 255, 0.1);
      --text: #f4f4f5; --text-muted: #a1a1aa;
      --primary: #8b5cf6; --accent: #ec4899;
      --success: #10b981; --warning: #f59e0b;
    }
    body {
      margin: 0; padding: 3rem 1rem; background-color: var(--bg);
      background-image: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.15), transparent 50%);
      color: var(--text); font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; justify-content: center; min-height: 100vh;
    }
    .dashboard { max-width: 1100px; width: 100%; display: flex; flex-direction: column; gap: 2rem; position: relative; }
    .header { text-align: center; margin-bottom: 1rem; }
    .header h1 {
      font-size: 3rem; font-weight: 700; margin: 0;
      background: linear-gradient(to right, #a78bfa, #f472b6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      letter-spacing: -0.05em;
    }
    .header p { color: var(--text-muted); font-size: 1.1rem; margin-top: 0.8rem; }
    .glass-card {
      background: var(--card-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border); border-radius: 20px; padding: 2rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .glass-card:hover { transform: translateY(-5px); box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.6); }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .stat { display: flex; flex-direction: column; gap: 0.5rem; }
    .stat-label { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 2rem; font-weight: 700; display: flex; align-items: baseline; gap: 0.5rem; }
    .stat-unit { font-size: 1rem; font-weight: 400; color: var(--text-muted); }
    .chart-container { position: relative; height: 450px; width: 100%; margin-top: 1.5rem; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 1rem; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px; }
    tr:last-child td { border-bottom: none; }
    tr { transition: background 0.2s; }
    tr:hover { background: rgba(255, 255, 255, 0.03); }
    .color-flux { color: #60a5fa; } .color-emf { color: #f472b6; } .color-current { color: #34d399; }
    .section-title { font-size: 1.3rem; font-weight: 600; margin: 0 0 1.5rem 0; display: flex; align-items: center; gap: 0.8rem; }
    .section-title::before { content: ''; display: block; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 10px var(--primary); }
    .print-btn {
      position: absolute; top: 0; right: 0;
      background: #4f46e5; color: white; border: none; padding: 0.8rem 1.5rem;
      border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s;
      display: flex; align-items: center; gap: 0.5rem; font-family: inherit;
    }
    .print-btn:hover { background: #4338ca; }
    
    @media print {
      body { background: white !important; color: black !important; padding: 0; }
      .dashboard { max-width: 100%; gap: 1rem; }
      .print-btn { display: none !important; }
      .glass-card { background: white !important; border: 1px solid #e2e8f0; box-shadow: none !important; break-inside: avoid; padding: 1.5rem; border-radius: 8px; filter: none !important; }
      .header h1 { background: none; -webkit-text-fill-color: black; color: black; }
      .header p, .stat-label, th, .stat-unit { color: #475569 !important; }
      .stat-value, td { color: black !important; }
      th, td { border-bottom: 1px solid #e2e8f0; }
      .section-title { color: black; }
      .section-title::before { background: #475569; box-shadow: none; }
      /* Force background printing for chart */
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <button class="print-btn" onclick="window.print()">🖨️ 打印报告</button>
    <div class="header">
      <h1>法拉第电磁感应定律</h1>
      <p>智能虚拟仿真分析报告 • 实验 #${selectedExperimentIndex + 1}</p>
    </div>

    <div class="glass-card">
      <h2 class="section-title" style="--primary: #a78bfa;">电磁感应动态曲线</h2>
      <div class="chart-container">
        <canvas id="physicsChart"></canvas>
      </div>
    </div>

    <div class="grid-2">
      <div class="glass-card">
        <h2 class="section-title" style="--primary: #38bdf8;">物理环境设定</h2>
        <div class="grid-2" style="margin-top: 1.5rem; gap: 2rem;">
          <div class="stat"><div class="stat-label">线圈匝数</div><div class="stat-value">${coils}<span class="stat-unit">N</span></div></div>
          <div class="stat"><div class="stat-label">回路电阻</div><div class="stat-value">${wireResistance.toFixed(2)}<span class="stat-unit">Ω</span></div></div>
          <div class="stat"><div class="stat-label">线圈半径</div><div class="stat-value">${radius.toFixed(2)}<span class="stat-unit">R</span></div></div>
          <div class="stat"><div class="stat-label">磁极场强</div><div class="stat-value">${_baseMagneticField.toFixed(2)}<span class="stat-unit">T</span></div></div>
        </div>
      </div>

      <div class="glass-card">
        <h2 class="section-title" style="--primary: #ec4899;">核心峰值分析</h2>
        <div class="grid-2" style="margin-top: 1.5rem; gap: 2rem;">
          <div class="stat"><div class="stat-label">记录时长</div><div class="stat-value">${duration.toFixed(1)}<span class="stat-unit">s</span></div></div>
          <div class="stat"><div class="stat-label">最大磁通量</div><div class="stat-value color-flux">${maxFlux.toExponential(2)}<span class="stat-unit">Wb</span></div></div>
          <div class="stat"><div class="stat-label">峰值电动势</div><div class="stat-value color-emf">${maxEmf.toExponential(2)}<span class="stat-unit">V</span></div></div>
          <div class="stat"><div class="stat-label">峰值电流</div><div class="stat-value color-current">${maxCurrent.toExponential(2)}<span class="stat-unit">A</span></div></div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <h2 class="section-title" style="--primary: #10b981;">完整实验数据记录</h2>
      <div style="overflow-x: auto;">
        <table>
          <thead><tr><th>时间 (s)</th><th>位移 (m)</th><th>磁通量 (Wb)</th><th>电动势 (V)</th><th>电流 (A)</th></tr></thead>
          <tbody>
            ${filteredData.map(d => `
            <tr>
              <td>${d.time.toFixed(2)}</td><td>${d.distance.toFixed(3)}</td>
              <td class="color-flux">${d.flux.toExponential(3)}</td>
              <td class="color-emf">${d.emf.toExponential(3)}</td>
              <td class="color-current">${d.current.toExponential(3)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const ctx = document.getElementById('physicsChart').getContext('2d');
    const timeData = ${JSON.stringify(filteredData.map(d => d.time.toFixed(2)))};
    const fluxData = ${JSON.stringify(filteredData.map(d => d.flux))};
    const emfData = ${JSON.stringify(filteredData.map(d => d.emf))};
    const currentData = ${JSON.stringify(filteredData.map(d => d.current))};

    // Chart.js global color adjustments for print media queries
    Chart.defaults.color = '#a1a1aa';
    
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: timeData,
        datasets: [
          { label: '磁通量 (Wb)', data: fluxData, borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)', yAxisID: 'y', tension: 0.4, pointRadius: 0, borderWidth: 2 },
          { label: '电动势 (V)', data: emfData, borderColor: '#f472b6', backgroundColor: 'rgba(244, 114, 182, 0.1)', yAxisID: 'y1', tension: 0.4, pointRadius: 0, borderWidth: 2 },
          { label: '电流 (A)', data: currentData, borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', yAxisID: 'y1', tension: 0.4, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: 'rgba(24, 24, 27, 0.95)', titleColor: '#f4f4f5', bodyColor: '#f4f4f5', padding: 12, cornerRadius: 8, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
          y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255, 255, 255, 0.05)' }, title: { display: true, text: '磁通量', color: '#60a5fa', font: {size: 13} } },
          y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '电动势 / 电流', color: '#f472b6', font: {size: 13} } }
        }
      }
    });

    // Detect print event and update chart colors for light mode printing
    window.matchMedia('print').addEventListener('change', (mql) => {
      if (mql.matches) {
        chart.options.scales.x.grid.color = 'rgba(0, 0, 0, 0.1)';
        chart.options.scales.y.grid.color = 'rgba(0, 0, 0, 0.1)';
        chart.options.plugins.legend.labels.color = '#333';
        chart.options.scales.x.ticks.color = '#333';
        chart.options.scales.y.ticks.color = '#333';
        chart.options.scales.y1.ticks.color = '#333';
        chart.update();
      } else {
        chart.options.scales.x.grid.color = 'rgba(255, 255, 255, 0.05)';
        chart.options.scales.y.grid.color = 'rgba(255, 255, 255, 0.05)';
        chart.options.plugins.legend.labels.color = '#a1a1aa';
        chart.options.scales.x.ticks.color = '#a1a1aa';
        chart.options.scales.y.ticks.color = '#a1a1aa';
        chart.options.scales.y1.ticks.color = '#a1a1aa';
        chart.update();
      }
    });
  </script>
</body>
</html>`;

    const blob = new Blob([reportContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const paramLabels: Record<string, string> = {
    distance: '位移 (m)',
    flux: '磁通量 (Wb)',
    emf: '感应电动势 (V)',
    current: '感应电流 (A)'
  };
  const paramColors: Record<string, string> = {
    distance: '#a78bfa',
    flux: '#60a5fa',
    emf: '#f472b6',
    current: '#34d399'
  };

  const handleGenerate = () => {
    setIsRendered(true);
  };

const HoverableRow: React.FC<{
  symbol: React.ReactNode;
  desc: string;
  value: React.ReactNode;
  formula: React.ReactNode;
  valColor?: string;
}> = ({ symbol, desc, value, formula, valColor = 'white' }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div 
      style={{ position: 'relative', display: 'inline-block', width: '100%' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{ cursor: 'help', borderBottom: '1px dashed rgba(255,255,255,0.3)', paddingBottom: '2px', display: 'inline-block', marginBottom: '4px', transition: 'all 0.2s', background: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent', borderRadius: '4px' }}>
        <strong>{symbol}</strong> : {desc} = <span style={{ color: valColor }}>{value}</span>
      </span>
      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '10%',
          marginBottom: '8px',
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid #475569',
          padding: '0.6rem 0.8rem',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: '#e2e8f0',
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          lineHeight: '1.4'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.2rem' }}>计算过程</div>
          {formula}
        </div>
      )}
    </div>
  );
};

  const renderFormulaOverlay = (dataPoint: PhysicsDataRecord) => {
    switch (selectedParam) {
      case 'distance':
        return (
          <div style={{ color: '#a78bfa' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '1rem', fontWeight: 'bold' }}>
              位移 (Distance)
            </div>
            <div style={{ marginBottom: '0.8rem' }}>
              <span style={{ color: '#cbd5e1' }}>公式: </span>
              <span style={{ fontFamily: 'serif', fontSize: '1.3rem' }}>x = x(t)</span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.8' }}>
              <HoverableRow 
                symbol="x" desc="磁极中心相对线圈中心的距离" value={`${dataPoint.distance.toFixed(3)} m`}
                formula={<>x(t) = 来自物理引擎模拟的当前坐标位置</>}
              />
              <HoverableRow 
                symbol="t" desc="当前时间" value={`${dataPoint.time.toFixed(1)} s`}
                formula={<>当前动画或物理采样的时间戳</>}
              />
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.3rem', color: 'white', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.8rem' }}>
              结果: <span style={{ color: '#a78bfa' }}>{dataPoint.distance.toFixed(3)} m</span>
            </div>
          </div>
        );
      case 'flux':
        return (
          <div style={{ color: '#60a5fa' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '1rem', fontWeight: 'bold' }}>
              磁通量 (Magnetic Flux)
            </div>
            <div style={{ marginBottom: '0.8rem' }}>
              <span style={{ color: '#cbd5e1' }}>物理模型: </span>
              <span style={{ fontFamily: 'serif', fontSize: '1.3rem' }}>Φ = ∫ B·dA ≈ B(x) · A</span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.8' }}>
              <HoverableRow 
                symbol="Φ (Phi)" desc="穿过线圈的总磁通量" valColor="#60a5fa" value={`${formatSci(dataPoint.flux, 3)} Wb`}
                formula={<>
                  B(x) × A
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    = {formatSci(dataPoint.flux / (Math.PI * Math.pow(radius * metersPerUnit, 2)), 3)} T × {formatSci(Math.PI * Math.pow(radius * metersPerUnit, 2), 3)} m²
                    <br/>
                    = {formatSci(dataPoint.flux, 3)} Wb
                  </span>
                </>}
              />
              <HoverableRow 
                symbol="B(x)" desc="有效磁感应强度 (磁偶极子模型)" value={`${formatSci(dataPoint.flux / (Math.PI * Math.pow(radius * metersPerUnit, 2)), 3)} T`}
                formula={<>
                  B(x) = B₀ · r³ / (x² + r²)^(3/2)
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    * x = {dataPoint.distance.toFixed(3)} m (相对距离)<br/>
                    * B₀ 内部已包含居里温度的热退磁衰减因子
                  </span>
                </>}
              />
              <HoverableRow 
                symbol="A" desc="线圈横截面积 (πr²)" value={`${formatSci(Math.PI * Math.pow(radius * metersPerUnit, 2), 3)} m²`}
                formula={<span>π × ({radius * metersPerUnit} m)²</span>}
              />
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.3rem', color: 'white', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.8rem' }}>
              结果: <span style={{ color: '#60a5fa' }}>{formatSci(dataPoint.flux, 3)} Wb</span>
            </div>
          </div>
        );
      case 'emf':
        return (
          <div style={{ color: '#f472b6' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '1rem', fontWeight: 'bold' }}>
              法拉第电磁感应定律 (EMF)
            </div>
            <div style={{ marginBottom: '0.8rem' }}>
              <span style={{ color: '#cbd5e1' }}>推导公式: </span>
              <span style={{ fontFamily: 'serif', fontSize: '1.3rem' }}>E = -N · (dΦ / dt)</span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.8' }}>
              <HoverableRow 
                symbol="E" desc="感应电动势" valColor="#f472b6" value={`${formatSci(dataPoint.emf, 3)} V`}
                formula={<>
                  - N × (ΔΦ / Δt)
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    = - {coils} × {(dataPoint.dPhi && dataPoint.dt ? formatSci(dataPoint.dPhi / dataPoint.dt, 3) : formatSci(-dataPoint.emf / coils, 3))} Wb/s
                    <br/>
                    = {formatSci(dataPoint.emf, 3)} V
                  </span>
                </>}
              />
              <HoverableRow 
                symbol="-" desc="负号 (楞次定律)" value="阻碍变化"
                formula={<span style={{ color: '#fca5a5' }}>感应电流的磁场总要阻碍引起感应电流的磁通量的变化</span>}
              />
              <HoverableRow 
                symbol="N" desc="线圈匝数" value={`${coils} 匝`}
                formula={<span>用户在控制面板中设定的线圈匝数</span>}
              />
              <HoverableRow 
                symbol="ΔΦ" desc="磁通量瞬时变化量" value={`${dataPoint.dPhi ? formatSci(dataPoint.dPhi, 3) : formatSci((-dataPoint.emf / coils) * 0.1, 3)} Wb`}
                formula={<>
                  Φ(t) - Φ(t-Δt) (根据物理引擎高频采样计算积分差)
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    = {formatSci(dataPoint.flux, 3)} Wb - {formatSci(dataPoint.flux - (dataPoint.dPhi || ((-dataPoint.emf / coils) * 0.1)), 3)} Wb
                    <br/>
                    = {dataPoint.dPhi ? formatSci(dataPoint.dPhi, 3) : formatSci((-dataPoint.emf / coils) * 0.1, 3)} Wb
                  </span>
                </>}
              />
              <HoverableRow 
                symbol="Δt" desc="时间变化率 (采样帧间隔)" value={`${dataPoint.dt ? dataPoint.dt.toFixed(4) : '0.1000'} s`}
                formula={<span>物理引擎设定的更新时间步长 (固定或实际帧间隔)</span>}
              />
              <HoverableRow 
                symbol="(ΔΦ / Δt)" desc="瞬时变化率" value={`≈ ${dataPoint.dPhi && dataPoint.dt ? formatSci(dataPoint.dPhi / dataPoint.dt, 3) : formatSci(-dataPoint.emf / coils, 3)} Wb/s`}
                formula={<>
                  ΔΦ / Δt
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    = {dataPoint.dPhi ? formatSci(dataPoint.dPhi, 3) : formatSci((-dataPoint.emf / coils) * 0.1, 3)} Wb / {dataPoint.dt ? dataPoint.dt.toFixed(4) : '0.1000'} s
                    <br/>
                    = {dataPoint.dPhi && dataPoint.dt ? formatSci(dataPoint.dPhi / dataPoint.dt, 3) : formatSci(-dataPoint.emf / coils, 3)} Wb/s
                  </span>
                </>}
              />
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.3rem', color: 'white', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.8rem' }}>
              结果: <span style={{ color: '#f472b6' }}>{formatSci(dataPoint.emf, 3)} V</span>
            </div>
          </div>
        );
      case 'current':
        return (
          <div style={{ color: '#34d399' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '1rem', fontWeight: 'bold' }}>
              闭合电路欧姆定律 (Current)
            </div>
            <div style={{ marginBottom: '0.8rem' }}>
              <span style={{ color: '#cbd5e1' }}>推导公式: </span>
              <span style={{ fontFamily: 'serif', fontSize: '1.3rem' }}>I = E / R</span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.8' }}>
              <HoverableRow 
                symbol="I" desc="回路中的感应电流" valColor="#34d399" value={`${formatSci(dataPoint.current, 3)} A`}
                formula={<>
                  E / R
                  <br/>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    = {formatSci(dataPoint.emf, 3)} V / {wireResistance} Ω
                    <br/>
                    = {formatSci(dataPoint.current, 3)} A
                  </span>
                </>}
              />
              <HoverableRow 
                symbol="E" desc="法拉第感应电动势" valColor="#f472b6" value={`${formatSci(dataPoint.emf, 3)} V`}
                formula={<span>由法拉第定律计算得出的电动势</span>}
              />
              <HoverableRow 
                symbol="R" desc="线圈电路的总电阻" value={`${wireResistance} Ω`}
                formula={<span>用户在控制面板中设定的电阻值</span>}
              />
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.3rem', color: 'white', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.8rem' }}>
              结果: <span style={{ color: '#34d399' }}>{formatSci(dataPoint.current, 3)} A</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.8rem', color: 'white', fontSize: '0.85rem' }}>
          <div style={{ marginBottom: '0.3rem', color: '#cbd5e1' }}>时间: {Number(label).toFixed(1)}s (点击查看详细公式)</div>
          <div style={{ color: payload[0].color, fontWeight: 600 }}>
            {paramLabels[selectedParam]}: {formatSci(Number(payload[0].value), 3)}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* 悬浮打开按钮（在右侧） */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          style={{
            position: 'absolute', top: '5rem', right: '1.5rem', zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(244, 114, 182, 0.3)', color: '#f472b6',
            padding: '0.8rem 1.2rem', borderRadius: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, letterSpacing: '0.05em',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), 0 0 10px rgba(244, 114, 182, 0.2)', transition: 'all 0.3s'
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(244, 114, 182, 0.2)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)'; e.currentTarget.style.color = '#f472b6'; }}
        >
          <Database size={18} />
          数据面板
        </button>
      )}

      {/* 侧边滑动菜单（右侧） */}
      <div style={{
        position: 'absolute', top: '1.5rem', right: '1.5rem', bottom: '1.5rem', width: '520px',
        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '24px',
        zIndex: 1000, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
        transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 3rem))',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={() => setIsOpen(false)}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <ChevronRight size={20} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            <Database size={20} color="#f472b6" /> 实验数据记录
          </h2>
        </div>

        {/* 历史记录选择与总时间 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>选择实验:</span>
            <select 
              value={selectedExperimentIndex} 
              onChange={e => {
                setSelectedExperimentIndex(parseInt(e.target.value));
                setIsRendered(false); // 切换实验时隐藏图表，需重新点击生成
              }}
              style={{ background: 'transparent', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '4px', fontSize: '0.85rem' }}
            >
              {experiments.map((_, i) => (
                <option key={i} value={i} style={{ color: 'black' }}>实验记录 #{i + 1}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            总时长: <strong style={{ color: '#f472b6' }}>{totalTime.toFixed(1)} s</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>查询区间(s):</span>
            <input 
              type="number" step="0.1" placeholder="开始" value={startTime} onChange={e => setStartTime(e.target.value)}
              style={{ width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '4px', fontSize: '0.85rem' }}
            />
            <span>-</span>
            <input 
              type="number" step="0.1" placeholder="结束" value={endTime} onChange={e => setEndTime(e.target.value)}
              style={{ width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '4px', fontSize: '0.85rem' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>图表参数:</span>
            <select 
              value={selectedParam} onChange={e => setSelectedParam(e.target.value as any)}
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '4px', fontSize: '0.85rem' }}
            >
              <option value="distance" style={{ color: 'black' }}>位移 (m)</option>
              <option value="flux" style={{ color: 'black' }}>磁通量 (Wb)</option>
              <option value="emf" style={{ color: 'black' }}>电动势 (V)</option>
              <option value="current" style={{ color: 'black' }}>电流 (A)</option>
            </select>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={!startTime || !endTime}
            style={{
              background: (!startTime || !endTime) ? '#475569' : '#3b82f6', 
              border: 'none', color: 'white', padding: '0.4rem 1rem',
              borderRadius: '6px', cursor: (!startTime || !endTime) ? 'not-allowed' : 'pointer', 
              display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600
            }}
          >
            <Play size={14} /> 生成图表
          </button>
        </div>

        {isRendered ? (
          <>
            {/* 可视化图表 */}
            <div style={{ width: '100%', height: '240px', background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', cursor: 'crosshair', filter: 'drop-shadow(0 0 10px rgba(244, 114, 182, 0.2))' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={filteredData}
                  onMouseMove={(e: any) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      setHoveredData(e.activePayload[0].payload as PhysicsDataRecord);
                    } else {
                      setHoveredData(null);
                    }
                  }}
                  onMouseLeave={() => setHoveredData(null)}
                  onClick={() => {
                    if (hoveredData) {
                      setClickedData(hoveredData);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#94a3b8" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    tickFormatter={(t) => Number(t).toFixed(1)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    tickFormatter={(val) => formatSci(val, 1)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line 
                    type="monotone" 
                    dataKey={selectedParam} 
                    stroke={paramColors[selectedParam]} 
                    dot={false} 
                    activeDot={{
                      r: 6,
                      strokeWidth: 0,
                      fill: '#fff',
                      onClick: (_e: any, payload: any) => {
                        if (payload && payload.payload) {
                          setClickedData(payload.payload);
                        }
                      },
                      cursor: 'pointer'
                    }}
                    strokeWidth={3} 
                    isAnimationActive={true}
                    style={{ filter: `drop-shadow(0 0 8px ${paramColors[selectedParam]}80)` }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ overflowX: 'auto', flex: 1, maxHeight: '250px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>时间(s)</th>
                    <th style={{ padding: '0.5rem' }}>位移(m)</th>
                    <th style={{ padding: '0.5rem' }}>磁通量(Wb)</th>
                    <th style={{ padding: '0.5rem' }}>电动势(V)</th>
                    <th style={{ padding: '0.5rem' }}>电流(A)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem', textAlign: 'left' }}>{row.time.toFixed(1)}</td>
                      <td style={{ padding: '0.5rem' }}>{row.distance.toFixed(3)}</td>
                      <td style={{ padding: '0.5rem', color: '#60a5fa' }}>{formatSci(row.flux, 2)}</td>
                      <td style={{ padding: '0.5rem', color: '#f472b6' }}>{formatSci(row.emf, 2)}</td>
                      <td style={{ padding: '0.5rem', color: '#34d399' }}>{formatSci(row.current, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleExport}
                style={{
                  flex: 1, background: '#4f46e5', border: 'none', color: 'white', padding: '0.8rem',
                  borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center',
                  alignItems: 'center', gap: '0.5rem', fontWeight: 600
                }}
              >
                <Download size={18} />
                导出 CSV
              </button>
              <button
                onClick={handleGenerateReport}
                style={{
                  flex: 1, background: '#ec4899', border: 'none', color: 'white', padding: '0.8rem',
                  borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center',
                  alignItems: 'center', gap: '0.5rem', fontWeight: 600
                }}
              >
                📝 生成实验报告
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#64748b', flexDirection: 'column', gap: '1rem' }}>
            <LineChartIcon size={48} opacity={0.3} />
            <p>请在上方的输入框填入起止时间并点击“生成图表”</p>
          </div>
        )}
      </div>

      {clickedData && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${paramColors[selectedParam]}40`,
              padding: '2rem 3rem',
              borderRadius: '16px',
              boxShadow: `0 20px 50px ${paramColors[selectedParam]}30`,
              minWidth: '350px',
              maxWidth: 'min(90vw, 560px)',
              position: 'relative',
              pointerEvents: 'auto'
            }}
          >
            <button
              type="button"
              onClick={() => setClickedData(null)}
              aria-label="关闭公式卡片"
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                width: '2rem',
                height: '2rem',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(15, 23, 42, 0.7)',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '1.1rem',
                lineHeight: 1
              }}
            >
              ×
            </button>
            {renderFormulaOverlay(clickedData)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
