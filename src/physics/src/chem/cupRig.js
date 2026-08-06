/**
 * Chemistry island cup rig: two beakers, drag/pour, liquid fill, molecule pedestal.
 * Host (labShell / chem station) owns pointer/AR; this owns geometry + pour FSM.
 */

import { blendColors } from './reagentCatalog.js';
import { createMoleculeMesh, createFallbackMolecule } from './moleculeMesh.js';

const POUR_NEAR = 0.55;

/**
 * @param {typeof import('three')} THREE
 * @param {{ materials?: any, accent?: number }} [opts]
 */
export function createChemCupRig(THREE, opts = {}) {
  const accent = opts.accent ?? 0x34d399;
  const root = new THREE.Group();
  root.name = 'chem-cup-rig';

  // Pedestal for 3D molecule (rear center of island top, local space)
  const pedestal = new THREE.Group();
  pedestal.position.set(0, 0, -0.35);
  const pedBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.06, 28),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.35 }),
  );
  pedBase.position.y = 0.03;
  pedestal.add(pedBase);
  const pedRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 8, 32),
    new THREE.MeshStandardMaterial({
      color: accent, emissive: accent, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3,
    }),
  );
  pedRing.rotation.x = Math.PI / 2;
  pedRing.position.y = 0.07;
  pedestal.add(pedRing);
  root.add(pedestal);

  /** @type {THREE.Object3D | null} */
  let molecule = null;

  const homeA = new THREE.Vector3(-0.55, 0, 0.15);
  const homeB = new THREE.Vector3(0.55, 0, 0.15);

  const cupA = makeCup(THREE, 'A', 0x38bdf8, accent);
  cupA.position.copy(homeA);
  root.add(cupA);
  const cupB = makeCup(THREE, 'B', 0xf472b6, accent);
  cupB.position.copy(homeB);
  root.add(cupB);

  const stream = [];
  const pGeo = new THREE.SphereGeometry(0.022, 8, 8);
  for (let i = 0; i < 14; i += 1) {
    const m = new THREE.Mesh(
      pGeo,
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x059669,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    m.visible = false;
    root.add(m);
    stream.push(m);
  }

  /** @type {null | { from: 'A'|'B', to: 'A'|'B', phase: string, t: number, fromPos: any, fromRotZ: number }} */
  let pour = null;
  /** @type {null | { cup: any, kind: 'A'|'B', lift: number, offsetX: number, offsetZ: number }} */
  let drag = null;

  const state = {
    A: emptyCupState(),
    B: emptyCupState(),
  };

  function emptyCupState() {
    return {
      reagents: [],
      fill: 0,
      color: 0x38bdf8,
      formula: '',
    };
  }

  function applyCupVisual(kind) {
    const cup = kind === 'A' ? cupA : cupB;
    const s = state[kind];
    setCupLevel(cup, s.fill, s.color);
    setCupLabel(THREE, cup, s.reagents.map((r) => r.formula).join('+') || kind);
  }

  function assignReagent(kind, reagent) {
    if (!reagent || (kind !== 'A' && kind !== 'B')) return false;
    const s = state[kind];
    // Replace primary content for clarity in v1
    s.reagents = [{ ...reagent }];
    s.fill = 0.85;
    s.color = reagent.color;
    s.formula = reagent.formula;
    applyCupVisual(kind);
    return true;
  }

  function clearCup(kind) {
    if (kind !== 'A' && kind !== 'B') return;
    state[kind] = emptyCupState();
    applyCupVisual(kind);
  }

  function resetAll() {
    clearCup('A');
    clearCup('B');
    clearMolecule();
    snapHome(cupA, homeA);
    snapHome(cupB, homeB);
    pour = null;
    drag = null;
    hideStream();
  }

  function componentsList() {
    const map = new Map();
    for (const kind of ['A', 'B']) {
      for (const r of state[kind].reagents) {
        if (!map.has(r.id)) map.set(r.id, { ...r });
      }
    }
    return [...map.values()];
  }

  function beginDrag(kind, worldHit, islandLocalHit) {
    if (pour) return false;
    const cup = kind === 'A' ? cupA : cupB;
    if (state[kind].fill <= 0.02) {
      // Still allow drag empty cups for UX, but pour will no-op
    }
    const lift = 0.28;
    cup.position.y = lift;
    cup.rotation.set(0, 0, 0);
    if (cup.userData.halo) cup.userData.halo.material.opacity = 0.5;
    drag = {
      cup,
      kind,
      lift,
      offsetX: cup.position.x - (islandLocalHit?.x ?? cup.position.x),
      offsetZ: cup.position.z - (islandLocalHit?.z ?? cup.position.z),
    };
    return true;
  }

  function updateDrag(localX, localZ) {
    if (!drag) return;
    const { cup, lift, offsetX, offsetZ } = drag;
    cup.position.x = clamp(localX + offsetX, -1.2, 1.2);
    cup.position.z = clamp(localZ + offsetZ, -0.55, 0.55);
    cup.position.y = lift;
    const other = drag.kind === 'A' ? cupB : cupA;
    const near = Math.hypot(cup.position.x - other.position.x, cup.position.z - other.position.z) < POUR_NEAR;
    if (cup.userData.halo) {
      cup.userData.halo.material.opacity = near ? 0.9 : 0.45;
      cup.userData.halo.material.color.setHex(near ? 0x34d399 : accent);
    }
  }

  function endDrag() {
    if (!drag) return { poured: false };
    const { cup, kind } = drag;
    const otherKind = kind === 'A' ? 'B' : 'A';
    const other = otherKind === 'A' ? cupA : cupB;
    const near = Math.hypot(cup.position.x - other.position.x, cup.position.z - other.position.z) < POUR_NEAR;
    drag = null;
    if (near && state[kind].fill > 0.02) {
      startPour(kind, otherKind);
      return { poured: true, from: kind, to: otherKind };
    }
    snapHome(cup, kind === 'A' ? homeA : homeB);
    if (cup.userData.halo) cup.userData.halo.material.opacity = 0;
    return { poured: false };
  }

  function startPour(from, to) {
    if (pour) return false;
    if (state[from].fill <= 0.02) return false;
    const cup = from === 'A' ? cupA : cupB;
    const target = to === 'A' ? cupA : cupB;
    const sign = from === 'A' ? 1 : -1;
    pour = {
      from,
      to,
      phase: 'approach',
      t: 0,
      fromPos: cup.position.clone(),
      fromRotZ: cup.rotation.z,
      toPos: new THREE.Vector3(
        target.position.x + sign * 0.35,
        0.35,
        target.position.z,
      ),
      toRotZ: sign * 0.9,
      fillStart: state[from].fill,
    };
    if (cup.userData.halo) cup.userData.halo.material.opacity = 0;
    return true;
  }

  function update(dt) {
    if (molecule) molecule.rotation.y += dt * 0.6;
    if (drag || !pour) return;
    const p = pour;
    const cup = p.from === 'A' ? cupA : cupB;
    p.t += dt;

    if (p.phase === 'approach') {
      const u = Math.min(1, p.t / 0.35);
      const e = easeOut(u);
      cup.position.lerpVectors(p.fromPos, p.toPos, e);
      cup.rotation.z = THREE.MathUtils.lerp(p.fromRotZ, p.toRotZ * 0.35, e);
      if (u >= 1) {
        p.phase = 'pouring';
        p.t = 0;
        p.fromPos.copy(cup.position);
        p.fromRotZ = cup.rotation.z;
      }
      return;
    }

    if (p.phase === 'pouring') {
      const u = Math.min(1, p.t / 0.85);
      cup.position.copy(p.toPos);
      cup.rotation.z = THREE.MathUtils.lerp(p.fromRotZ, p.toRotZ, Math.min(1, u));
      state[p.from].fill = p.fillStart * (1 - u);
      applyCupVisual(p.from);
      updateStream(cup, p.to === 'A' ? cupA : cupB, state[p.from].color, u);
      if (u >= 1) {
        commitPour(p.from, p.to);
        hideStream();
        p.phase = 'return';
        p.t = 0;
        p.fromPos.copy(cup.position);
        p.fromRotZ = cup.rotation.z;
      }
      return;
    }

    if (p.phase === 'return') {
      const home = p.from === 'A' ? homeA : homeB;
      const u = Math.min(1, p.t / 0.4);
      const e = easeOut(u);
      cup.position.lerpVectors(p.fromPos, home, e);
      cup.rotation.z = THREE.MathUtils.lerp(p.fromRotZ, 0, Math.min(1, e * 1.5));
      if (u >= 1) {
        snapHome(cup, home);
        pour = null;
      }
    }
  }

  function commitPour(from, to) {
    const src = state[from];
    const dst = state[to];
    if (!src.reagents.length) return;
    if (!dst.reagents.length) {
      dst.reagents = src.reagents.map((r) => ({ ...r }));
      dst.color = src.color;
      dst.fill = Math.min(0.95, src.fillStart ?? 0.85);
    } else {
      // Merge unique reagents + blend color
      const ids = new Set(dst.reagents.map((r) => r.id));
      for (const r of src.reagents) {
        if (!ids.has(r.id)) dst.reagents.push({ ...r });
      }
      dst.color = blendColors(dst.color, src.color, 0.5);
      dst.fill = Math.min(0.95, Math.max(dst.fill, 0.7) + 0.15);
    }
    dst.formula = dst.reagents.map((r) => r.formula).join('+');
    src.reagents = [];
    src.fill = 0;
    src.formula = '';
    applyCupVisual(from);
    applyCupVisual(to);
  }

  function updateStream(fromCup, toCup, color, u) {
    const lip = new THREE.Vector3(
      fromCup.position.x - Math.sin(fromCup.rotation.z) * 0.55,
      fromCup.position.y + Math.cos(fromCup.rotation.z) * 0.55,
      fromCup.position.z,
    );
    const mouth = new THREE.Vector3(toCup.position.x, toCup.position.y + 0.55, toCup.position.z);
    stream.forEach((m, i) => {
      const t = (i / (stream.length - 1)) * Math.min(1, u * 1.2);
      const yArc = Math.sin(t * Math.PI) * 0.12;
      m.position.set(
        lip.x + (mouth.x - lip.x) * t,
        lip.y + (mouth.y - lip.y) * t + yArc,
        lip.z + (mouth.z - lip.z) * t,
      );
      m.visible = u > 0.05 && u < 0.98;
      m.material.color.setHex(color);
      m.material.emissive.setHex(color);
      m.material.opacity = m.visible ? 0.75 : 0;
    });
  }

  function hideStream() {
    stream.forEach((m) => {
      m.visible = false;
      m.material.opacity = 0;
    });
  }

  function showMoleculeFromSdf(sdf, formula) {
    clearMolecule();
    try {
      molecule = sdf
        ? createMoleculeMesh(THREE, sdf, { scale: 0.11 })
        : createFallbackMolecule(THREE, formula);
    } catch {
      molecule = createFallbackMolecule(THREE, formula);
    }
    molecule.position.set(0, 0.35, 0);
    molecule.scale.setScalar(1.1);
    pedestal.add(molecule);
  }

  function clearMolecule() {
    if (!molecule) return;
    pedestal.remove(molecule);
    molecule.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
    molecule = null;
  }

  function getPickables() {
    return [cupA, cupB];
  }

  function cupByKind(kind) {
    return kind === 'A' ? cupA : cupB;
  }

  // init empty visuals
  applyCupVisual('A');
  applyCupVisual('B');

  return {
    root,
    cupA,
    cupB,
    pedestal,
    state,
    get pour() { return pour; },
    get drag() { return drag; },
    assignReagent,
    clearCup,
    resetAll,
    componentsList,
    beginDrag,
    updateDrag,
    endDrag,
    startPour,
    update,
    showMoleculeFromSdf,
    clearMolecule,
    getPickables,
    cupByKind,
    homeA,
    homeB,
  };
}

function emptyCupState() {
  return { reagents: [], fill: 0, color: 0x38bdf8, formula: '' };
}

function makeCup(THREE, kind, tint, accent) {
  const g = new THREE.Group();
  g.name = `chem-cup-${kind}`;
  g.userData.kind = kind;
  g.userData.role = kind === 'A' ? 'chem_cup_a' : 'chem_cup_b';
  g.userData.interactive = true;
  g.userData.pick = kind;

  const rTop = 0.18;
  const rBot = 0.16;
  const h = 0.48;

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 28, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xd0e6f5,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      transmission: 0.45,
      thickness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  wall.position.y = 0.08 + h / 2;
  g.add(wall);

  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(rBot - 0.01, rBot, 0.03, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xb0cce0,
      transparent: true,
      opacity: 0.4,
      roughness: 0.15,
      transmission: 0.3,
    }),
  );
  bottom.position.y = 0.1;
  g.add(bottom);

  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(rBot - 0.025, rBot - 0.03, 0.28, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0,
      roughness: 0.2,
      depthWrite: false,
    }),
  );
  liquid.position.y = 0.22;
  liquid.visible = false;
  g.add(liquid);
  g.userData.liquid = liquid;
  g.userData.liqBaseY = 0.1;
  g.userData.liqMaxH = 0.32;

  const surf = new THREE.Mesh(
    new THREE.CircleGeometry(rBot - 0.03, 24),
    new THREE.MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0,
      roughness: 0.18,
      depthWrite: true,
    }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = 0.38;
  surf.visible = false;
  g.add(surf);
  g.userData.surf = surf;

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.04, 20),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 }),
  );
  stand.position.y = 0.02;
  g.add(stand);

  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop + 0.04, rBot + 0.04, h + 0.12, 14),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = 0.08 + h / 2;
  hit.userData.role = g.userData.role;
  hit.userData.interactive = true;
  hit.userData.kind = kind;
  g.add(hit);
  g.userData.hit = hit;

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.26, 28),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.015;
  g.add(halo);
  g.userData.halo = halo;

  // Label sprite placeholder — updated via setCupLabel
  g.userData.label = null;

  return g;
}

function setCupLevel(cup, level, color) {
  const liq = cup.userData.liquid;
  const surf = cup.userData.surf;
  if (!liq || !surf) return;
  const t = Math.max(0, Math.min(1, level));
  if (t < 0.02) {
    liq.visible = false;
    surf.visible = false;
    liq.material.opacity = 0;
    surf.material.opacity = 0;
    return;
  }
  liq.visible = true;
  surf.visible = true;
  const baseY = cup.userData.liqBaseY ?? 0.1;
  const maxH = cup.userData.liqMaxH ?? 0.32;
  const h = maxH * t;
  liq.scale.y = Math.max(0.05, t);
  liq.position.y = baseY + h / 2;
  surf.position.y = baseY + h;
  liq.material.color.setHex(color);
  liq.material.emissive.setHex(color);
  liq.material.opacity = 0.82;
  surf.material.color.setHex(color);
  surf.material.emissive.setHex(color);
  surf.material.opacity = 0.9;
}

function setCupLabel(THREE, cup, text) {
  if (cup.userData.label) {
    cup.remove(cup.userData.label);
    cup.userData.label.material?.map?.dispose?.();
    cup.userData.label.material?.dispose?.();
    cup.userData.label = null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  roundRectPath(ctx, 12, 12, 232, 40, 10);
  ctx.fill();
  ctx.font = '600 22px "Outfit", "Noto Sans SC", system-ui';
  ctx.fillStyle = '#ecfdf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').slice(0, 18), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.55, 0.14, 1);
  spr.position.set(0, 0.72, 0);
  cup.add(spr);
  cup.userData.label = spr;
}

function snapHome(cup, home) {
  cup.position.copy(home);
  cup.rotation.set(0, 0, 0);
  if (cup.userData.halo) cup.userData.halo.material.opacity = 0;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
