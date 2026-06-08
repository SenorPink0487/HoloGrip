// main.js — 应用入口：场景、相机、渲染、UI 绑定、主循环
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildLab } from './lab.js';
import { Effects } from './effects.js';
import { calibrateMagneticField, computeHall, computeHallState } from './physics.js';
import { UI } from './ui.js';

// ---------------- 仿真状态 ----------------
const sim = {
  carrier: 'N',
  materialId: 'N_Ge',
  current: 3.0,
  magnetCurrent: 0.8,
  field: calibrateMagneticField(0.8),
  thickness: 0.5,
  measurementMode: 'measured',
  power: false,
};

// ---------------- 场景 ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 35, 75);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_HOME = new THREE.Vector3(14, 10, 18);
camera.position.copy(CAM_HOME);

// CSS2D label renderer
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '10';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI * 0.52;
controls.target.set(0, -1, 0);

// ---------------- 灯光 ----------------
scene.add(new THREE.AmbientLight(0x6a7da8, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(12, 20, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.camera.left = -25; key.shadow.camera.right = 25;
key.shadow.camera.top = 25; key.shadow.camera.bottom = -25;
key.shadow.bias = -0.0003;
scene.add(key);

const fill = new THREE.DirectionalLight(0x4ea1ff, 0.5);
fill.position.set(-14, 8, -6);
scene.add(fill);

const rim = new THREE.PointLight(0x38e8c8, 0.8, 40);
rim.position.set(0, 6, -8);
scene.add(rim);

// ---------------- 构建实验室 ----------------
const { root, refs } = buildLab();
scene.add(root);

const effects = new Effects(scene, refs.sampleGroup, refs.sampleDims, refs);

// ---------------- UI ----------------
const ui = new UI(sim, {
  onChange: refresh,
  onMagnetChange: () => {
    sim.field = calibrateMagneticField(sim.magnetCurrent);
    const fieldSlider = document.getElementById('sld-field');
    if (fieldSlider) fieldSlider.value = sim.field;
    refresh();
  },
  onPower: (on) => { sim.power = on; refresh(); },
});
ui.init();

// ---------------- 计算 + 刷新 UI/可视化 ----------------
let lastHall = computeHall(sim);
let lastState = computeHallState({
  carrierType: sim.carrier,
  materialId: sim.materialId,
  currentMa: sim.current,
  magnetCurrentA: sim.magnetCurrent,
  magneticFieldT: sim.field,
  thicknessMm: sim.thickness,
  measurementMode: sim.measurementMode,
});
function refresh() {
  const state = computeHallState({
    carrierType: sim.carrier,
    materialId: sim.materialId,
    currentMa: sim.current,
    magnetCurrentA: sim.magnetCurrent,
    magneticFieldT: sim.field,
    thicknessMm: sim.thickness,
    measurementMode: sim.measurementMode,
  });
  const hall = computeHall(sim);
  hall.state = state;
  lastHall = hall;
  lastState = state;
  effects.setState(sim, hall);
  ui.updateReadouts(sim, hall);
  drawVoltmeter(sim, hall);
  drawPowerSupply(sim);
}

function drawVoltmeter(s, hall) {
  const vm = refs.voltmeter;
  if (!vm) return;
  const { ctx, canvas: c, tex } = vm;
  ctx.fillStyle = '#03120c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = s.power ? '#6dffb0' : '#1b3a2a';
  ctx.font = 'bold 46px Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const txt = s.power ? `${hall.state.measuredHallVoltageMv.toFixed(3)}` : '----';
  ctx.fillText(txt, c.width - 56, c.height / 2);
  ctx.font = '20px Consolas, monospace';
  ctx.fillStyle = s.power ? '#2fae6b' : '#1b3a2a';
  ctx.fillText('mV', c.width - 8, c.height / 2 + 4);
  ctx.textAlign = 'left';
  ctx.fillText('V_H', 10, 22);
  tex.needsUpdate = true;
}

function drawPowerSupply(s) {
  const updateLed = (disp, text) => {
    if (!disp) return;
    const { ctx, cvs, tex, colorStr } = disp;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillStyle = s.power ? colorStr : '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.power ? text : '----', 64, 32);
    tex.needsUpdate = true;
  };
  
  // 工作电流 Is (红屏) 和 励磁电流 Im (绿屏)
  updateLed(refs.psVoltage, s.current.toFixed(2) + ' mA');
  updateLed(refs.psCurrent, s.magnetCurrent.toFixed(2) + ' A');
}

refresh();

// ---------------- 交互按钮 ----------------
document.getElementById('btn-view-reset').addEventListener('click', () => {
  animateCamera(CAM_HOME, new THREE.Vector3(0, -1, 0));
});
document.getElementById('chk-rotate').addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
  controls.autoRotateSpeed = 0.8;
});

// 显示开关事件 (来自 ui.js)
window.addEventListener('hall-visibility', (e) => {
  effects.setVisibility(e.detail);
});

// 帮助弹窗
const helpModal = document.getElementById('help-modal');
document.getElementById('btn-help').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('btn-help-close').addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });

// 实验步骤弹窗
const stepsModal = document.getElementById('steps-modal');
document.getElementById('btn-steps').addEventListener('click', () => stepsModal.classList.remove('hidden'));
document.getElementById('btn-steps-close').addEventListener('click', () => stepsModal.classList.add('hidden'));
stepsModal.addEventListener('click', (e) => { if (e.target === stepsModal) stepsModal.classList.add('hidden'); });

// 折线图弹窗
const plotModal = document.getElementById('plot-modal');
if (document.getElementById('btn-open-plot')) {
  document.getElementById('btn-open-plot').addEventListener('click', () => {
    plotModal.classList.remove('hidden');
  });
}
if (document.getElementById('btn-plot-close')) {
  document.getElementById('btn-plot-close').addEventListener('click', () => plotModal.classList.add('hidden'));
}
if (plotModal) {
  plotModal.addEventListener('click', (e) => { if (e.target === plotModal) plotModal.classList.add('hidden'); });
}

// ---------------- 相机过渡动画 ----------------
let camAnim = null;
function animateCamera(toPos, toTarget) {
  camAnim = {
    fromPos: camera.position.clone(), toPos: toPos.clone(),
    fromTgt: controls.target.clone(), toTgt: toTarget.clone(),
    t: 0, dur: 0.9,
  };
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (camAnim) {
    camAnim.t += dt;
    const k = Math.min(1, camAnim.t / camAnim.dur);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
    controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e);
    if (k >= 1) camAnim = null;
  }

  effects.update(dt, t);
  controls.update();

  // 励磁线圈随磁场轻微发光脉动
  if (refs.coils) {
    const glow = sim.power ? (0.5 + sim.field) : 0.2;
    refs.coils.forEach(cg => cg.children.forEach(r => {
      r.material.emissive = new THREE.Color(0x331100);
      r.material.emissiveIntensity = glow * 0.4;
    }));
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------------- 自适应 ----------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- 隐藏 loader ----------------
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('loader').classList.add('hide'), 350);
});
// 兜底：若 load 已触发
setTimeout(() => document.getElementById('loader').classList.add('hide'), 1500);

// 暴露给调试
window.__hall = {
  sim,
  refresh,
  get hall() { return lastHall; },
  get state() { return lastState; },
};
