/** Render the compact data strip shown below a station's hologram controls. */
export function formatExperimentData(stationId, expId, data) {
  if (!data) return '—';
  if (stationId === 'mechanics' && Array.isArray(data.readouts)) {
    const lines = data.readouts.slice(0, 6).map((item) => `${item.label}: ${item.value}`);
    lines.push(`<span class="ok">${data.paused ? '仿真已暂停' : '源仿真运行中'}</span>`);
    return lines.join('\n');
  }
  if (expId === 'multi_slit_diffraction') {
    const nRec = Array.isArray(data.records) ? data.records.length : 0;
    const mode = data.chartOpen ? '核对标注中' : (data.farField ? 'Fraunhofer ✓' : '近场警告');
    return `${data.N === 1 ? '单缝衍射' : `${data.N} 缝干涉`}　λ=${Number(data.lambdaNm || 0).toFixed(0)} nm\na=${Number(data.slitMm || 0).toFixed(3)} mm　d=${Number(data.pitchMm || 0).toFixed(3)} mm\nL=${Number(data.distM || 0).toFixed(2)} m　Δx≈${Number(data.fringeSpacingMm || 0).toFixed(3)} mm\n<span class="ok">对照 ${nRec} 组　${mode}</span>`;
  }
  if (data.mode === 'geometric' || ['reflection', 'refraction', 'dispersion', 'lens'].includes(expId)) {
    const nRec = Array.isArray(data.records) ? data.records.length : 0;
    const mod = data.moduleCode ? `${data.moduleCode} ` : '';
    const mirror = data.opticsMode === 'mirror' || expId === 'reflection';
    const t1 = data.theta1 != null ? Number(data.theta1).toFixed(1) : '—';
    const t2 = data.theta2 == null ? (mirror ? '—' : 'TIR') : Number(data.theta2).toFixed(1);
    if (mirror) {
      const dth = data.deltaTheta != null ? Number(data.deltaTheta).toFixed(3) : '—';
      return `${mod}反射　θᵢ=${t1}°　θᵣ=${t2}°\n|Δθ|=${dth}°　转角=${Number(data.rotate || 0).toFixed(0)}°\n<span class="ok">记录 ${nRec} 组　${data.verifyOk ? 'θᵢ≈θᵣ ✓' : '调节中'}</span>`;
    }
    const ratio = data.snellRatio != null ? Number(data.snellRatio).toFixed(3) : '—';
    return `${mod}折射/色散　n=${Number(data.ior || 0).toFixed(3)}　θ₁=${t1}°　θ₂=${t2}°\nsinθ₁/sinθ₂=${ratio}　光束=${Number(data.rayCount || 1)}\n<span class="ok">记录 ${nRec} 组${data.dispersion ? '　色散开' : ''}</span>`;
  }
  if (expId === 'hall_effect') {
    const target = data.target === 'solenoid' ? '长螺线管' : '亥姆霍兹线圈';
    const records = Array.isArray(data.records) ? data.records : [];
    const wiringText = data.wiring?.energized ? `${data.wiring.label}${data.wiring.reversed ? '（反接）' : '（正接）'}` : data.wiring?.status === 'invalid' ? '接线无效/未闭合' : 'Im 输出未接线';
    return `对象: ${target}\n接线: ${wiringText}\nVH = ${Number(data.vh || 0).toFixed(2)} mV　X = ${Number(data.probePos || 0).toFixed(1)} cm\nIm = ${Number(data.Im || 0).toFixed(2)} A　Is = ${Number(data.Is || 0).toFixed(1)} mA\n记录: ${records.length} 组`;
  }
  if (expId === 'faraday_induction') {
    const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
    return `B = ${fmt(data.B, 2)} T · S = ${fmt(data.area)} m² · Φ_B = ${fmt(data.flux)} Wb\n铜棒 x = ${fmt(data.x)} · 楞次方向: ${data.currentSense || '无'}\n动生 ε_i = ${data.lastMotion ? fmt(data.lastMotion.emf, 4) : '—'} V · 感生 ε_i = ${data.lastInduction ? fmt(data.lastInduction.emf, 4) : '—'} V\n记录: ${Array.isArray(data.records) ? data.records.length : 0} 组`;
  }
  if (expId === 'induced_electric_field') {
    const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
    const region = Number(data.probeR || 0) <= Number(data.R || 0) + 1e-6 ? '面内' : '面外';
    return `B = ${fmt(data.B, 2)} · dB/dt = ${fmt(data.dBdt, 2)}\nR = ${fmt(data.R, 2)} · r = ${fmt(data.probeR, 2)}（${region}）\n|E| = ${fmt(data.magnitudeE, 3)} · ${data.senseLabel || '—'}\n${data.paused ? '振荡已暂停' : 'B = B₀ sin(ωt) 振荡中'}`;
  }
  if (expId === 'hall_carrier_demo') return `I = ${Number(data.I || 0).toFixed(2)}　B = ${Number(data.B || 0).toFixed(2)}\nn = ${Number(data.n || 0).toFixed(2)}　d = ${Number(data.d || 0).toFixed(2)}\nU_H(相对) = ${Number(data.vh || 0).toFixed(3)}　${data.nType ? 'n 型' : 'p 型'}\n${data.paused ? '动画已暂停' : '载流子运动中'}`;
  if (expId === 'calorimetry') {
    const teq = data.cupHot && data.cupCold ? (data.mHot * data.tHot + data.mCold * data.tCold) / (data.mHot + data.mCold) : null;
    const motion = data.pouring ? `倒入${data.pouring === 'hot' ? '热水' : '冷水'} · ${Math.round((data.pourProgress || 0) * 100)}%` : data.mixProgress > 0 && data.mixProgress < 1 ? `混合中 · ${Math.round(data.mixProgress * 100)}%` : '静置';
    return `热水 ${Number(data.tHot || 0).toFixed(0)} °C / ${Number(data.mHot || 0).toFixed(0)} g\n冷水 ${Number(data.tCold || 0).toFixed(0)} °C / ${Number(data.mCold || 0).toFixed(0)} g\n过程：${motion} · 终温 ${data.tCurrent == null ? '—' : Number(data.tCurrent).toFixed(1) + ' °C'}\n<span class="ok">理论平衡 = ${teq == null ? '—' : teq.toFixed(1) + ' °C'} · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'convection') {
    const deltaT = Math.max(0, Number(data.tPlate || 0) - Number(data.tAir || 0));
    const L = Math.sqrt(Number(data.area || 0.12));
    const ra = 1e8 * deltaT * L ** 3;
    const nu = 0.15 * Math.pow(Math.max(ra, 1), 1 / 3);
    const h = deltaT < 1 ? 2 : Math.max(3, nu * 0.028 / L);
    return `热板 ${Number(data.tPlate || 0).toFixed(0)} K · 环境 ${Number(data.tAir || 0).toFixed(0)} K\nRa = ${ra.toFixed(0)} · Nu = ${nu.toFixed(1)}\n<span class="ok">h = ${h.toFixed(1)} W/(m²·K) · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'heat-conduction') return `热端 ${Number(data.tHot || 0).toFixed(0)} K · 冷端 ${Number(data.tCold || 0).toFixed(0)} K\nk = ${Number(data.conductivity || 0).toFixed(2)} · 中点 ${Number(data.temps?.[24] || 0).toFixed(1)} K\n<span class="ok">记录 ${data.records?.length || 0} 组</span>`;
  if (expId === 'ideal-gas') {
    const p = (Number(data.n || 0) * 8.314 * Number(data.temperature || 0) / Math.max(0.01, Number(data.volume || 1)) / 1000) * 12;
    return `T = ${Number(data.temperature || 0).toFixed(0)} K · V = ${Number(data.volume || 0).toFixed(2)} ×\nP = ${p.toFixed(1)} kPa · n = ${Number(data.n || 0).toFixed(3)} mol\n<span class="ok">碰撞率 ${data.collisionsPerSec || 0} Hz · 记录 ${data.records?.length || 0} 组</span>`;
  }
  if (expId === 'thermal-expansion') {
    const alpha = ({ aluminum: 23.1, copper: 16.5, steel: 12, invar: 1.2 }[data.material] || 23.1) * 1e-6;
    const dL = alpha * Number(data.length0 || 1) * (Number(data.temperature || 20) - 20);
    return `材料 ${data.material || 'aluminum'} · T = ${Number(data.temperature || 0).toFixed(0)} °C\nΔL = ${(dL * 1000).toFixed(3)} mm · L = ${((Number(data.length0 || 1) + dL) * 1000).toFixed(2)} mm\n<span class="ok">α = ${(alpha * 1e6).toFixed(1)} ×10⁻⁶/K · 记录 ${data.records?.length || 0} 组</span>`;
  }
  return JSON.stringify(data);
}
