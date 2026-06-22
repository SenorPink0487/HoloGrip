import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Trash2, X, Database, LineChart as LineChartIcon } from 'lucide-react';

export interface RecordPoint {
  id: string;
  pos: number;
  vh: number;
  im: number;
  is: number;
}

interface DataRecorderProps {
  data: RecordPoint[];
  onClear: () => void;
  onClose: () => void;
}

export function DataRecorder({ data, onClear, onClose }: DataRecorderProps) {
  // Sort data by pos for the line chart
  const chartData = useMemo(() => {
    return [...data].sort((a, b) => a.pos - b.pos);
  }, [data]);

  return (
    <div className="flex h-full w-full font-sans bg-neutral-950/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
      {/* Table Side */}
      <div className="w-1/3 border-r border-white/5 flex flex-col bg-black/40">
        <div className="flex justify-between items-center p-4 border-b border-white/5 shrink-0 relative">
          <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">实验数据记录</h3>
          </div>
          <button 
            onClick={onClear}
            className="group relative flex items-center justify-center p-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-300"
            title="清空记录"
          >
            <div className="absolute inset-0 bg-red-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
            <Trash2 className="w-4 h-4 text-red-400 relative z-10" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 transition-all relative">
          {data.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 z-0 pointer-events-none">
              <div className="p-4 rounded-full bg-white/5 mb-3">
                <Database className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-xs">暂无数据，请先记录</p>
            </div>
          )}
          <table className="w-full text-[13px] text-left text-neutral-300 relative z-10">
            <thead className="text-neutral-400 bg-black/60 sticky top-0 backdrop-blur-md z-10 shadow-sm border-b border-white/5">
              <tr>
                <th className="px-4 py-3 font-medium">位置 X</th>
                <th className="px-4 py-3 font-medium">VH (mV)</th>
                <th className="px-4 py-3 font-medium">Im (A)</th>
                <th className="px-4 py-3 font-medium">Is (mA)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
                  <td className="px-4 py-3 font-mono text-neutral-400 group-hover:text-neutral-200 transition-colors">{row.pos.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono text-purple-400 font-medium group-hover:text-purple-300 transition-colors">{row.vh.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-neutral-500 group-hover:text-neutral-300 transition-colors">{row.im.toFixed(3)}</td>
                  <td className="px-4 py-3 font-mono text-neutral-500 group-hover:text-neutral-300 transition-colors">{row.is.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Chart Side */}
      <div className="w-2/3 bg-black/20 p-5 flex flex-col relative overflow-hidden">
          {/* Subtle Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 blur-[100px] rounded-full pointer-events-none" />

          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all z-50 backdrop-blur-sm"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 mb-6 shrink-0 relative z-10">
            <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <LineChartIcon className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">VH - X 关系曲线</h3>
          </div>

          <div className="flex-1 min-h-0 w-full relative z-10">
            {chartData.length < 2 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
                记录至少 2 组数据以绘制曲线
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorVh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
                  <XAxis 
                    dataKey="pos" 
                    type="number"
                    domain={['dataMin', 'dataMax']} 
                    stroke="#444" 
                    tick={{fill: '#666', fontSize: 12, fontWeight: 500}}
                    tickFormatter={(val) => Number(val).toFixed(1)}
                    tickMargin={10}
                    label={{ value: '位置 X (cm)', position: 'insideBottom', offset: -15, fill: '#666', fontSize: 12, fontWeight: 500 }} 
                  />
                  <YAxis 
                    stroke="#444" 
                    domain={['auto', 'auto']}
                    tick={{fill: '#666', fontSize: 12, fontWeight: 500}}
                    tickMargin={10}
                    label={{ value: 'VH (mV)', angle: -90, position: 'insideLeft', offset: 25, fill: '#666', fontSize: 12, fontWeight: 500 }} 
                  />
                  <Tooltip 
                    cursor={{ stroke: '#a855f7', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      backdropFilter: 'blur(12px)',
                      borderColor: 'rgba(168,85,247,0.3)', 
                      color: '#fff', 
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }}
                    itemStyle={{ color: '#c084fc', fontWeight: 600 }}
                    labelStyle={{ color: '#888', marginBottom: '4px' }}
                    labelFormatter={(val) => `位置: ${Number(val).toFixed(1)} cm`}
                    formatter={(value: number) => [value.toFixed(3), 'VH (mV)']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="vh" 
                    stroke="#a855f7" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorVh)" 
                    activeDot={{ r: 6, fill: '#c084fc', stroke: '#fff', strokeWidth: 2, className: 'drop-shadow-md' }}
                    dot={{ fill: '#a855f7', stroke: '#111', strokeWidth: 2, r: 4 }}
                    isAnimationActive={true}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
      </div>
    </div>
  );
}
