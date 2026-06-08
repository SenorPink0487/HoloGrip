import {
  createReportHtml,
  fitHallLine,
  makeExperimentRecord,
  MATERIALS,
  recordsToCsv,
  sci,
} from './physics.js';

const STEPS = [
  '选择材料和载流子类型',
  '接通电源，建立工作电流 I_S',
  '调节励磁电流并读取标定磁场 B',
  '观察载流子偏转与霍尔电压 V_H',
  '固定控制变量并记录多组数据',
  '拟合曲线，反推 R_H 与载流子浓度 n',
];

export class UI {
  constructor(sim, handlers) {
    this.sim = sim;
    this.handlers = handlers;
    this.records = [];
    this.fit = null;
    this.stepState = new Array(STEPS.length).fill(false);
    this.currentStep = 0;
    this.acquisitionMode = 'fixedB';
    this.connectPoints = false;
  }

  init() {
    this._buildSteps();
    this._bindMaterial();
    this._bindCarrier();
    this._bindSliders();
    this._bindToggles();
    this._bindPower();
    this._bindData();
    this._bindMode();
    this._bindSaveLoad();
    this._advanceStep(0);
  }

  _buildSteps() {
    const ol = document.getElementById('steps');
    ol.innerHTML = '';
    STEPS.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    });
    this._renderSteps();
  }

  _renderSteps() {
    const ol = document.getElementById('steps');
    [...ol.children].forEach((li, i) => {
      li.classList.toggle('active', i === this.currentStep);
      li.classList.toggle('done', this.stepState[i]);
    });
  }

  _markDone(idx) {
    if (idx >= 0 && idx < this.stepState.length) this.stepState[idx] = true;
  }

  _advanceStep(idx) {
    this.currentStep = Math.min(idx, STEPS.length - 1);
    this._renderSteps();
  }

  _bindMaterial() {
    const select = document.getElementById('sel-material');
    select.value = this.sim.materialId;
    select.addEventListener('change', () => {
      const material = MATERIALS[select.value];
      this.sim.materialId = material.id;
      this.sim.carrier = material.carrierType;
      this.sim.thickness = material.defaultThicknessMm;
      this._syncCarrierButtons();
      this._syncSliderValues();
      this._markDone(0);
      this._advanceStep(1);
      this._status(`已选择 ${material.name}：${material.note}`);
      this.handlers.onChange();
    });
  }

  _bindCarrier() {
    const seg = document.getElementById('seg-carrier');
    seg.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sim.carrier = btn.dataset.type;
        const preferred = this.sim.carrier === 'P' ? 'P_Ge' : 'N_Ge';
        this.sim.materialId = preferred;
        document.getElementById('sel-material').value = preferred;
        this._syncCarrierButtons();
        this._markDone(0);
        this._advanceStep(1);
        this._status(`已切换为 ${this.sim.carrier} 型载流子。`);
        this.handlers.onChange();
      });
    });
    this._syncCarrierButtons();
  }

  _bindSliders() {
    const current = document.getElementById('sld-current');
    const magnet = document.getElementById('sld-magnet');
    const field = document.getElementById('sld-field');
    const thickness = document.getElementById('sld-thickness');

    current.addEventListener('input', () => {
      this.sim.current = parseFloat(current.value);
      if (this.sim.power && this.sim.current > 0) {
        this._markDone(1);
        this._advanceStep(2);
      }
      this.handlers.onChange();
    });

    magnet.addEventListener('input', () => {
      this.sim.magnetCurrent = parseFloat(magnet.value);
      this.handlers.onMagnetChange();
      if (this.sim.field > 0.05) {
        this._markDone(2);
        this._advanceStep(this.sim.power ? 4 : 3);
      }
    });

    field.addEventListener('input', () => {
      this.sim.field = parseFloat(field.value);
      if (this.sim.field > 0.05) {
        this._markDone(2);
        this._advanceStep(this.sim.power ? 4 : 3);
      }
      this.handlers.onChange();
    });

    thickness.addEventListener('input', () => {
      this.sim.thickness = parseFloat(thickness.value);
      this.handlers.onChange();
    });

    this._syncSliderValues();
  }

  _bindToggles() {
    const measured = document.getElementById('chk-measured');
    measured.checked = this.sim.measurementMode === 'measured';
    measured.addEventListener('change', () => {
      this.sim.measurementMode = measured.checked ? 'measured' : 'ideal';
      this._status(measured.checked ? '当前记录使用测量值：包含仪表分辨率和小幅噪声。' : '当前记录使用理论值。');
      this.handlers.onChange();
    });

    const map = {
      'chk-carriers': 'carriers',
      'chk-field': 'field',
      'chk-force': 'force',
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => {
        window.dispatchEvent(new CustomEvent('hall-visibility', { detail: { [key]: el.checked } }));
      });
    });
  }

  _bindPower() {
    const btn = document.getElementById('btn-power');
    btn.addEventListener('click', () => {
      this.sim.power = !this.sim.power;
      btn.classList.toggle('on', this.sim.power);
      btn.textContent = this.sim.power ? '断开电源' : '接通电源';
      if (this.sim.power) {
        this._markDone(1);
        this._advanceStep(this.sim.field > 0.05 ? 3 : 2);
        this._status('电源已接通，载流子开始定向漂移。');
      } else {
        this._status('电源已断开。');
      }
      this.handlers.onPower(this.sim.power);
    });
  }

  _bindMode() {
    const seg = document.getElementById('seg-mode');
    seg.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.acquisitionMode = btn.dataset.mode;
        seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._status(this.acquisitionMode === 'fixedB'
          ? '固定 B 采集：改变 I_S，保持 B 和 d 不变后拟合 V_H-I_S。'
          : '固定 I 采集：改变 B，观察 V_H-B 趋势，拟合仅作参考。');
      });
    });
  }

  _bindData() {
    document.getElementById('btn-record').addEventListener('click', () => this._record());
    document.getElementById('btn-clear').addEventListener('click', () => this._clear());
    document.getElementById('btn-plot').addEventListener('click', () => this._plot());
    document.getElementById('btn-export-csv').addEventListener('click', () => this._exportCsv());
    document.getElementById('btn-export-json').addEventListener('click', () => this._exportJson());
    document.getElementById('btn-report').addEventListener('click', () => this._openReport());

    const chkConnect = document.getElementById('chk-connect-points');
    if (chkConnect) {
      chkConnect.checked = this.connectPoints;
      chkConnect.addEventListener('change', (e) => {
        this.connectPoints = e.target.checked;
        this._drawPlot(this.fit);
      });
    }
  }

  updateReadouts(s, hall) {
    const state = hall.state;
    const displayV = s.power ? state.measuredHallVoltageMv : 0;
    document.getElementById('meter-vh').textContent = `${displayV.toFixed(3)} mV`;
    document.getElementById('mini-is').textContent = `${state.currentMa.toFixed(2)} mA`;
    document.getElementById('mini-im').textContent = `${state.magnetCurrentA.toFixed(2)} A`;
    document.getElementById('mini-b').textContent = `${state.magneticFieldT.toFixed(3)} T`;
    document.getElementById('mini-d').textContent = `${state.thicknessMm.toFixed(2)} mm`;
    document.getElementById('mini-n').textContent = `${sci(state.carrierDensity, 2)} /m^3`;
    document.getElementById('mini-rh').textContent = sci(state.hallCoefficient, 3);
    document.getElementById('val-current').textContent = `${state.currentMa.toFixed(2)} mA`;
    document.getElementById('val-magnet').textContent = `${state.magnetCurrentA.toFixed(2)} A`;
    document.getElementById('val-field').textContent = `${state.magneticFieldT.toFixed(3)} T`;
    document.getElementById('val-thickness').textContent = `${state.thicknessMm.toFixed(2)} mm`;
    document.getElementById('material-note').textContent = state.material.note;
  }

  _record() {
    if (!this.sim.power) {
      this._status('请先接通电源再记录数据。');
      return;
    }
    if (this.sim.current <= 0 || this.sim.field <= 0.01) {
      this._status('需要非零工作电流和磁场才能记录有效霍尔电压。');
      return;
    }
    const state = window.__hall?.state;
    if (!state) return;
    this.records.push(makeExperimentRecord(state, this.acquisitionMode));
    this.fit = null;
    this._renderTable();
    this._drawPlot(null);
    this._markDone(4);
    this._advanceStep(this.records.length >= 3 ? 5 : 4);
    this._status(`已记录第 ${this.records.length} 组数据。`);
  }

  _renderTable() {
    const tb = document.querySelector('#data-table tbody');
    tb.innerHTML = '';
    this.records.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${r.currentMa.toFixed(2)}</td><td>${r.magneticFieldT.toFixed(3)}</td><td>${r.thicknessMm.toFixed(2)}</td><td>${r.measuredHallVoltageMv.toFixed(4)}</td>`;
      tb.appendChild(tr);
    });
  }

  _clear() {
    this.records = [];
    this.fit = null;
    this._renderTable();
    this._drawPlot(null);
    document.getElementById('fit-summary').textContent = '尚未拟合';
    this._status('本轮数据已清空。');
  }

  _plot() {
    if (this.records.length < 2) {
      this._status('至少记录 2 组数据后才能拟合。');
      return;
    }
    this.fit = fitHallLine(this.records);
    this._drawPlot(this.fit);
    this._renderFit();
    this._markDone(5);
    this._advanceStep(5);
    this._status(this.fit.warnings.length ? this.fit.warnings.join(' ') : '已完成 V_H-I_S 拟合并反推霍尔系数。');
  }

  _drawPlot(fit) {
    const cvs = document.getElementById('plot');
    const ctx = cvs.getContext('2d');
    const W = cvs.width;
    const H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    // Dark background with subtle grid
    ctx.fillStyle = 'rgba(10, 14, 23, 0.6)';
    ctx.fillRect(0, 0, W, H);
    
    const pad = 38;
    const xs = this.records.map((r) => r.currentMa);
    const ys = this.records.map((r) => r.measuredHallVoltageMv);

    let xmin = 0;
    let xmax = Math.max(...xs, 1);
    let ymin = Math.min(0, ...ys);
    let ymax = Math.max(0, ...ys, 0.01);
    
    // Add 10% padding to max/min for better visibility
    xmax = xmax * 1.1;
    const yRange = Math.max(ymax - ymin, 0.1);
    ymin -= yRange * 0.1;
    ymax += yRange * 0.1;

    const sx = (x) => pad + (x - xmin) / (xmax - xmin || 1) * (W - 2 * pad);
    const sy = (y) => H - pad - (y - ymin) / (ymax - ymin || 1) * (H - 2 * pad);
    
    // Draw grid lines and labels
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i <= 4; i++) {
        // Y grid
        const yVal = ymin + (ymax - ymin) * (i / 4);
        const yLine = sy(yVal);
        const isZero = Math.abs(yVal) < yRange * 0.02; // Close to 0
        ctx.strokeStyle = isZero ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = isZero ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(pad, yLine);
        ctx.lineTo(W - pad, yLine);
        ctx.stroke();
        
        ctx.fillStyle = isZero ? '#cbd5e1' : '#64748b';
        ctx.fillText(yVal.toFixed(2), pad - 6, yLine);

        // X grid
        const xVal = xmin + (xmax - xmin) * (i / 4);
        const xLine = sx(xVal);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xLine, pad);
        ctx.lineTo(xLine, H - pad);
        ctx.stroke();
        
        if (i > 0) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#64748b';
            ctx.fillText(xVal.toFixed(1), xLine, H - pad + 6);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
        }
    }

    if (!this.records.length) return;

    // Axes lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, pad - 10);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(W - pad + 10, H - pad);
    ctx.stroke();

    // Title / Axis names
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('V_H / mV', 8, pad - 12);
    ctx.textAlign = 'right';
    ctx.fillText('I_S / mA', W - 8, H - 6);

    // Draw fit line and fill
    if (fit) {
      const startX = sx(xmin);
      const startY = sy(fit.slopeMvPerMa * xmin + fit.interceptMv);
      const endX = sx(xmax);
      const endY = sy(fit.slopeMvPerMa * xmax + fit.interceptMv);
      
      // Gradient fill to zero line
      const zeroY = sy(0);
      ctx.beginPath();
      ctx.moveTo(startX, zeroY);
      ctx.lineTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(endX, zeroY);
      ctx.closePath();
      
      const grad = ctx.createLinearGradient(0, Math.min(startY, endY), 0, zeroY);
      grad.addColorStop(0, fit.warnings.length ? 'rgba(251,191,36,0.3)' : 'rgba(0,210,255,0.3)');
      grad.addColorStop(1, 'rgba(0,210,255,0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.strokeStyle = fit.warnings.length ? '#fbbf24' : '#00d2ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = fit.warnings.length ? '#fbbf24' : '#00d2ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }

    // Connect points if manually enabled
    if (this.connectPoints && this.records.length > 1) {
       ctx.strokeStyle = fit ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)';
       ctx.lineWidth = 2;
       ctx.beginPath();
       const sorted = [...this.records].sort((a,b)=>a.currentMa - b.currentMa);
       ctx.moveTo(sx(sorted[0].currentMa), sy(sorted[0].measuredHallVoltageMv));
       for(let i=1; i<sorted.length; i++) {
           ctx.lineTo(sx(sorted[i].currentMa), sy(sorted[i].measuredHallVoltageMv));
       }
       ctx.stroke();
    }

    // Draw points
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 8;
    this.records.forEach((r) => {
      ctx.beginPath();
      ctx.arc(sx(r.currentMa), sy(r.measuredHallVoltageMv), 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  _renderFit() {
    const el = document.getElementById('fit-summary');
    if (!this.fit) {
      el.textContent = '尚未拟合';
      return;
    }
    const warn = this.fit.warnings.length ? `；提示：${this.fit.warnings.join(' ')}` : '';
    el.textContent = `k=${this.fit.slopeMvPerMa.toFixed(5)} mV/mA，R²=${this.fit.rSquared.toFixed(4)}，R_H=${sci(this.fit.estimatedHallCoefficient, 3)} m^3/C，n=${sci(this.fit.estimatedCarrierDensity, 3)} /m^3，误差=${this.fit.relativeErrorPercent.toFixed(2)}%${warn}`;
  }

  _exportCsv() {
    if (!this.records.length) {
      this._status('没有可导出的数据。');
      return;
    }
    downloadText('hall-effect-data.csv', recordsToCsv(this.records, this.fit), 'text/csv;charset=utf-8');
    this._status('CSV 数据已生成。');
  }

  _exportJson() {
    if (!this.records.length) {
      this._status('没有可导出的数据。');
      return;
    }
    const payload = {
      state: window.__hall?.state,
      records: this.records,
      fit: this.fit,
      exportedAt: new Date().toISOString(),
    };
    downloadText('hall-effect-experiment.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    this._status('JSON 实验数据已生成。');
  }

  _openReport() {
    if (!this.records.length) {
      this._status('请先记录数据再生成实验报告。');
      return;
    }
    if (!this.fit) this.fit = fitHallLine(this.records);
    this._renderFit();
    const win = window.open('', '_blank');
    if (!win) {
      this._status('浏览器阻止了报告窗口，请允许弹窗后重试。');
      return;
    }
    win.document.write(createReportHtml({ state: window.__hall.state, records: this.records, fit: this.fit }));
    win.document.close();
  }

  _syncCarrierButtons() {
    const seg = document.getElementById('seg-carrier');
    seg.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === this.sim.carrier);
    });
  }

  _syncSliderValues() {
    document.getElementById('sld-current').value = this.sim.current;
    document.getElementById('sld-magnet').value = this.sim.magnetCurrent;
    document.getElementById('sld-field').value = this.sim.field;
    document.getElementById('sld-thickness').value = this.sim.thickness;
  }

  _status(msg) {
    document.getElementById('status-text').textContent = msg;
  }

  _bindSaveLoad() {
    const btnSave = document.getElementById('btn-save-local');
    const btnLoad = document.getElementById('btn-load-local');
    if (btnSave) btnSave.addEventListener('click', () => this._saveLocal());
    if (btnLoad) btnLoad.addEventListener('click', () => this._loadLocal());
  }

  _saveLocal() {
    const data = {
      sim: this.sim,
      records: this.records,
      fit: this.fit,
      currentStep: this.currentStep,
      stepState: this.stepState,
      acquisitionMode: this.acquisitionMode
    };
    try {
      localStorage.setItem('hall_effect_save', JSON.stringify(data));
      this._status('进度已保存到本地。下次打开可读取。');
    } catch (e) {
      this._status('保存失败：' + e.message);
    }
  }

  _loadLocal() {
    const saved = localStorage.getItem('hall_effect_save');
    if (!saved) {
      this._status('没有找到本地存档。');
      return;
    }
    try {
      const data = JSON.parse(saved);
      Object.assign(this.sim, data.sim);
      this.records = data.records || [];
      this.fit = data.fit || null;
      this.currentStep = data.currentStep || 0;
      this.stepState = data.stepState || new Array(STEPS.length).fill(false);
      this.acquisitionMode = data.acquisitionMode || 'fixedB';

      this._syncCarrierButtons();
      this._syncSliderValues();
      this._renderTable();
      this._drawPlot(this.fit);
      this._renderFit();
      this._renderSteps();

      const sel = document.getElementById('sel-material');
      if (sel) sel.value = this.sim.materialId;

      const chk = document.getElementById('chk-measured');
      if (chk) chk.checked = this.sim.measurementMode === 'measured';
      
      const powerBtn = document.getElementById('btn-power');
      if (powerBtn) {
        powerBtn.classList.toggle('on', this.sim.power);
        powerBtn.textContent = this.sim.power ? '断开电源' : '接通电源';
      }
      
      const seg = document.getElementById('seg-mode');
      if (seg) {
        seg.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('active', b.dataset.mode === this.acquisitionMode);
        });
      }

      this.handlers.onChange();
      this._status('本地存档已成功读取！');
    } catch (e) {
      this._status('读取失败，存档数据可能已损坏。');
    }
  }
}

function downloadText(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
