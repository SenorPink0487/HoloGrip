// lab.js — 构建实验室静态 3D 模型
// Builds all static lab geometry: bench, electromagnet, Hall sample, wiring, axes, instruments.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---- 颜色 / 材质常量 ----
const COL = {
  bench: 0xe0e5ec,
  benchTop: 0xd0d6e0,
  metal: 0x9aa6bc,
  metalDark: 0x55607a,
  copper: 0xc8773a,
  sample: 0x2d6fd6,
  electrode: 0xd9b14a,
  magnet: 0x6a7388,
  pole: 0x9099af,
  panel: 0xe8eef2,
};

function makeLabel(text, className, color) {
  const div = document.createElement('div');
  div.className = 'label3d' + (className ? ' ' + className : '');
  div.textContent = text;
  const obj = new CSS2DObject(div);
  obj.element.style.pointerEvents = 'none';
  return obj;
}

/**
 * 构建整个实验台。返回一个 group 以及关键子对象引用，供动画使用。
 */
export function buildLab() {
  const root = new THREE.Group();
  const refs = {};

  // ---------------- 地面 ----------------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -6;
  floor.receiveShadow = true;
  root.add(floor);

  // 网格
  const grid = new THREE.GridHelper(60, 60, 0xdddddd, 0xeeeeee);
  grid.position.y = -5.98;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  root.add(grid);

  // ---------------- 实验台 ----------------
  const benchTop = new THREE.Mesh(
    new THREE.BoxGeometry(34, 1.2, 22),
    new THREE.MeshStandardMaterial({ color: COL.benchTop, roughness: 0.6, metalness: 0.2 })
  );
  benchTop.position.set(0, -5.4, 0);
  benchTop.receiveShadow = true;
  benchTop.castShadow = true;
  root.add(benchTop);

  // 桌腿
  const legGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.8, 16);
  const legMat = new THREE.MeshStandardMaterial({ color: COL.bench, roughness: 0.7, metalness: 0.3 });
  [[-15, 9], [15, 9], [-15, -9], [15, -9]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, -8.2, z);
    leg.castShadow = true;
    root.add(leg);
  });

  // ---------------- 电磁铁 ----------------
  const magnet = buildElectromagnet(refs);
  magnet.position.set(0, -1.2, 0);
  root.add(magnet);
  refs.magnetGroup = magnet;

  // ---------------- 霍尔样品 ----------------
  const sample = buildHallSample(refs);
  sample.position.set(0, -1.2, 0);
  root.add(sample);
  refs.sampleGroup = sample;

  // ---------------- 导线 ----------------
  const wires = buildWiring();
  root.add(wires);

  // ---------------- 仪器 ----------------
  const instrument = buildInstrument(refs);
  instrument.position.set(-11, -4.8, -6);
  root.add(instrument);

  // 电源
  const supply = buildPowerSupply(refs);
  supply.position.set(11, -4.8, -6);
  root.add(supply);

  // ---------------- 坐标轴 ----------------
  const axes = buildAxes();
  axes.position.set(0, -1.2, 0);
  root.add(axes);
  refs.axes = axes;

  return { root, refs };
}

// ============ 电磁铁 ============
function buildElectromagnet(refs) {
  const g = new THREE.Group();
  const yokeMat = new THREE.MeshStandardMaterial({ color: COL.magnet, roughness: 0.5, metalness: 0.7 });
  const poleMat = new THREE.MeshStandardMaterial({ color: COL.pole, roughness: 0.35, metalness: 0.85 });

  // C 形磁轭 (用几段拼)
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 5), yokeMat);
  back.position.set(0, 0, -6);
  g.add(back);

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 8), yokeMat);
  top.position.set(0, 5, -3.4);
  g.add(top);

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 8), yokeMat);
  bottom.position.set(0, -5, -3.4);
  g.add(bottom);

  [back, top, bottom].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

  // 上下极靴（朝向中间样品，留出气隙）
  const poleGeo = new THREE.CylinderGeometry(2.6, 3.2, 2.2, 40);
  const poleTop = new THREE.Mesh(poleGeo, poleMat);
  poleTop.position.set(0, 2.3, 0);
  g.add(poleTop);

  const poleBot = new THREE.Mesh(poleGeo, poleMat);
  poleBot.position.set(0, -2.3, 0);
  g.add(poleBot);
  [poleTop, poleBot].forEach(m => { m.castShadow = true; });

  // N/S 标记
  const nLabel = makeLabel('N', 'axis-x');
  nLabel.position.set(0, 3.6, 3.5);
  g.add(nLabel);
  const sLabel = makeLabel('S', 'axis-z');
  sLabel.position.set(0, -3.6, 3.5);
  g.add(sLabel);

  // 励磁线圈 (上下两组铜环)
  const coilMat = new THREE.MeshStandardMaterial({ color: COL.copper, roughness: 0.4, metalness: 0.8 });
  refs.coils = [];
  [3.4, -3.4].forEach(yc => {
    const coilGroup = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.0, 0.22, 12, 40),
        coilMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = (i - 3) * 0.34 + yc;
      coilGroup.add(ring);
    }
    g.add(coilGroup);
    refs.coils.push(coilGroup);
  });

  return g;
}

// ============ 霍尔样品 ============
function buildHallSample(refs) {
  const g = new THREE.Group();

  // 半导体薄片 (沿 x 方向长，y 方向为厚度被夸张显示，z 为宽度)
  const W = 8;   // 长 (x, 电流方向)
  const H = 1.2; // 厚 (y, 这里几何夸大，真实厚度由滑块控制)
  const D = 3.2; // 宽 (z, 霍尔电压方向)

  const sampleMat = new THREE.MeshPhysicalMaterial({
    color: COL.sample, roughness: 0.25, metalness: 0.1,
    transmission: 0.35, thickness: 1.0, transparent: true, opacity: 0.85,
    clearcoat: 0.6, clearcoatRoughness: 0.2,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), sampleMat);
  slab.castShadow = true;
  g.add(slab);
  refs.slab = slab;
  refs.sampleDims = { W, H, D };

  // 电流电极 (两端，x 方向)
  const elecMat = new THREE.MeshStandardMaterial({ color: COL.electrode, roughness: 0.3, metalness: 0.85 });
  [-1, 1].forEach(sx => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.6, H + 0.4, D + 0.4), elecMat);
    e.position.x = sx * (W / 2 + 0.3);
    e.castShadow = true;
    g.add(e);
  });

  // 霍尔电压电极 (两侧，z 方向)
  refs.hallElectrodes = [];
  [-1, 1].forEach(sz => {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 20), elecMat);
    e.rotation.x = Math.PI / 2;
    e.position.z = sz * (D / 2 + 0.3);
    e.castShadow = true;
    g.add(e);
    refs.hallElectrodes.push(e);
  });

  // 两侧电荷积累发光面 (用于显示 +/- 电荷)
  const faceGeo = new THREE.PlaneGeometry(W, H);
  const posFaceMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0 });
  const negFaceMat = new THREE.MeshBasicMaterial({ color: 0x4d8bff, transparent: true, opacity: 0 });

  const faceFront = new THREE.Mesh(faceGeo, posFaceMat); // +z 面
  faceFront.position.z = D / 2 + 0.01;
  g.add(faceFront);

  const faceBack = new THREE.Mesh(faceGeo, negFaceMat); // -z 面
  faceBack.position.z = -D / 2 - 0.01;
  faceBack.rotation.y = Math.PI;
  g.add(faceBack);

  refs.chargeFaces = { front: faceFront, back: faceBack };

  // 移除了重复的样品标签，减少画面杂乱

  return g;
}

// ============ 导线 ============
function buildWiring() {
  const g = new THREE.Group();
  const mkWire = (pts, color) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, 40, 0.12, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    return new THREE.Mesh(geo, mat);
  };
  // 样品 -> 电源 (红/黑)
  g.add(mkWire([[-4.6, -1.2, 0], [-6, -2.5, -1], [-4, -4.6, -3], [5, -4.6, -3], [9.5, -4.2, -3.6]], 0xd83b3b));
  g.add(mkWire([[4.6, -1.2, 0], [7, -2.5, -1], [10, -4.6, -2], [12.5, -4.2, -3.6]], 0x222831));
  // 霍尔电极 -> 电压表 (绿/蓝)
  g.add(mkWire([[0, -1.2, 2.1], [-4, -3, 3], [-8, -4.6, -1], [-10.5, -4.2, -3.9]], 0x2fae6b));
  g.add(mkWire([[0, -1.2, -2.1], [-3, -3.5, -4], [-7, -4.6, -2], [-9.5, -4.2, -3.9]], 0x2f7aae));
  return g;
}

// ============ 仪器（电压表）============
function buildInstrument(refs) {
  const g = new THREE.Group();
  
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdde0e5, roughness: 0.5, metalness: 0.1 });
  const frontMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.8, metalness: 0.1 });
  
  const W = 6, H = 3.6, D = 4;
  // 1. 机身主体
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
  body.position.set(0, H/2, 0);
  body.castShadow = true;
  g.add(body);

  // 2. 保护硅胶套 (前后护圈)
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.9 });
  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(W+0.4, H+0.4, 0.4), bumperMat);
  bumperFront.position.set(0, H/2, D/2 - 0.21);
  const bumperBack = new THREE.Mesh(new THREE.BoxGeometry(W+0.4, H+0.4, 0.4), bumperMat);
  bumperBack.position.set(0, H/2, -D/2 + 0.21);
  g.add(bumperFront);
  g.add(bumperBack);

  // 3. 前面板
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W-0.4, H-0.4, 0.1), frontMat);
  panel.position.set(0, H/2, D/2 + 0.05);
  g.add(panel);

  // 4. 屏幕外框
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5 });
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 0.15), bezelMat);
  bezel.position.set(-0.5, H/2 + 0.3, D/2 + 0.06);
  g.add(bezel);

  // 5. 屏幕 (用 canvas 纹理动态更新)
  const cvs = document.createElement('canvas');
  cvs.width = 256; cvs.height = 128;
  const tex = new THREE.CanvasTexture(cvs);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 1.8),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  screen.position.set(-0.5, H/2 + 0.3, D/2 + 0.14);
  g.add(screen);

  refs.voltmeter = { canvas: cvs, ctx: cvs.getContext('2d'), tex };

  // 6. 按钮区域 (右侧)
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), btnMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(2.2, H/2 + 0.8 - i * 0.6, D/2 + 0.1);
    g.add(btn);
  }

  // 7. 输入端子 (下方)
  const termGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16);
  const tRed = new THREE.Mesh(termGeo, new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
  tRed.rotation.x = Math.PI / 2;
  tRed.position.set(0.5, 0.6, D/2 + 0.1);
  g.add(tRed);

  const tBlack = new THREE.Mesh(termGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
  tBlack.rotation.x = Math.PI / 2;
  tBlack.position.set(1.5, 0.6, D/2 + 0.1);
  g.add(tBlack);

  return g;
}

function makeLedTexture(text, colorStr) {
  const cvs = document.createElement('canvas');
  cvs.width = 128; cvs.height = 64;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.fillStyle = colorStr;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(cvs);
  return { cvs, ctx, tex, colorStr };
}

// ============ 电源 ============
function buildPowerSupply(refs) {
  const g = new THREE.Group();
  
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe0e5ec, roughness: 0.6, metalness: 0.2 });
  const frontMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.8, metalness: 0.1 });

  const W = 5.5, H = 4.2, D = 4.5;
  // 1. 机箱
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
  body.position.set(0, H/2, 0);
  body.castShadow = true;
  g.add(body);

  // 2. 前面板
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, H - 0.2, 0.1), frontMat);
  panel.position.set(0, H/2, D/2 + 0.05);
  g.add(panel);

  // 3. 屏幕外框
  const screenBgMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  const screenBg = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.4, 0.1), screenBgMat);
  screenBg.position.set(0, H/2 + 0.8, D/2 + 0.1);
  g.add(screenBg);

  // LED数字
  refs.psVoltage = makeLedTexture('0.00 V', '#ff4d4d');
  const digit1 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: refs.psVoltage.tex }));
  digit1.position.set(-1.2, H/2 + 0.8, D/2 + 0.16);
  g.add(digit1);

  refs.psCurrent = makeLedTexture('0.00 A', '#4dff4d');
  const digit2 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: refs.psCurrent.tex }));
  digit2.position.set(1.2, H/2 + 0.8, D/2 + 0.16);
  g.add(digit2);

  // 4. 旋钮
  const knobBaseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const knobTopMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.7 });
  
  [-1.4, 0, 1.4].forEach(x => {
    const kBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 24), knobBaseMat);
    kBase.rotation.x = Math.PI / 2;
    kBase.position.set(x, H/2 - 0.4, D/2 + 0.1);
    g.add(kBase);

    const kTop = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 24), knobTopMat);
    kTop.rotation.x = Math.PI / 2;
    kTop.position.set(x, H/2 - 0.4, D/2 + 0.2);
    g.add(kTop);
  });

  // 5. 接线端子
  const termGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 16);
  const termZ = D/2 + 0.1;
  const termY = 0.6;
  
  const tRed = new THREE.Mesh(termGeo, new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
  tRed.rotation.x = Math.PI / 2;
  tRed.position.set(-1.5, termY, termZ);
  g.add(tRed);

  const tGnd = new THREE.Mesh(termGeo, new THREE.MeshStandardMaterial({ color: 0x22cc22 }));
  tGnd.rotation.x = Math.PI / 2;
  tGnd.position.set(0, termY, termZ);
  g.add(tGnd);

  const tBlack = new THREE.Mesh(termGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
  tBlack.rotation.x = Math.PI / 2;
  tBlack.position.set(1.5, termY, termZ);
  g.add(tBlack);

  // 6. 提手
  const handleGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 24, Math.PI);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.5, metalness: 0.8 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, H, 0);
  g.add(handle);

  return g;
}

// ============ 坐标轴 ============
function buildAxes() {
  const g = new THREE.Group();
  const mkAxis = (dir, color) => {
    const len = 6;
    const mat = new THREE.MeshBasicMaterial({ color });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), mat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), mat);
    const grp = new THREE.Group();
    shaft.position.y = len / 2;
    tip.position.y = len + 0.25;
    grp.add(shaft); grp.add(tip);
    // 旋转到目标方向
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    grp.setRotationFromQuaternion(quat);
    return grp;
  };
  g.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xff7a7a));  // x
  g.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x7affae));  // y
  g.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x7ab8ff));  // z

  const lx = makeLabel('x · 电流 I', 'axis-x'); lx.position.set(7.5, 0, 0); g.add(lx);
  const ly = makeLabel('y · 磁场 B', 'axis-y'); ly.position.set(0, 8.2, 0); g.add(ly);
  const lz = makeLabel('z · 霍尔电压 V_H', 'axis-z'); lz.position.set(0, 0, 7.5); g.add(lz);
  return g;
}
