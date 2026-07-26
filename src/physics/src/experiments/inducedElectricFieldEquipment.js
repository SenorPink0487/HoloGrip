import * as THREE from 'three';
import {
  inducedEDirection,
  inducedEMagnitude,
  inducedESense,
} from './electro.js';
import { formatPhysicsNumber } from '../physicsFormula.js';

const WORLD_PER_SOURCE = 0.11;
const E_RING_RADII_NORM = [0.35, 0.55, 0.75, 1.0, 1.35, 1.75, 2.2];
const E_MARKERS_PER_RING = 8;
/** Source-space R max (matches desk slider R max). Lattice covers densest fill of this disk. */
const B_R_MAX = 3.2;
/** Faraday-style lattice spacing in source units: sparse ↔ dense vs |B|. */
const B_SPACING_SPARSE = 1.45;
const B_SPACING_DENSE = 0.48;
const B_EDGE_FADE = 0.35;

/** Frameless two-line billboard: q and E only, above the probe charge. */
function createFloatingHudLabel({ worldScale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 1,
  }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.42 * worldScale, 0.13 * worldScale, 1);
  sprite.renderOrder = 24;
  sprite.raycast = () => {};
  let lastKey = '';

  function setQE(qText, eText, accent = '#fde68a') {
    const key = `${accent}|${qText}|${eText}`;
    if (key === lastKey) return;
    lastKey = key;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Soft stroke for readability without a panel box.
    const drawLine = (text, y, size, color) => {
      ctx.font = `bold ${size}px Consolas, "SF Mono", "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, y);
    };
    drawLine(qText, H * 0.36, 44, accent);
    drawLine(eText, H * 0.70, 40, '#e2e8f0');
    texture.needsUpdate = true;
  }

  return { sprite, setQE };
}

/**
 * Tabletop apparatus: cylindrical uniform-B region + concentric induced E rings.
 * Source coordinates (R, r, B) stay in the controller; this adapter only scales.
 */
export function createInducedElectricFieldEquipment() {
  const root = new THREE.Group();
  root.name = 'induced-electric-field-apparatus';
  root.visible = false;
  // Sit flush on the electro bench (same tabletop offset as Faraday), not mid-air.
  root.position.set(0, 0.05, 0.02);

  const S = WORLD_PER_SOURCE;
  const fieldGroup = new THREE.Group();
  const eGroup = new THREE.Group();
  const probeGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  root.add(fieldGroup, eGroup, probeGroup, labelGroup);
  const _tangentDir = new THREE.Vector3(1, 0, 0);

  // Floor disc for spatial reference.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.8 * S, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.35,
      metalness: 0.2,
      roughness: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  fieldGroup.add(floor);

  // Glass cylinder marking the uniform-B region boundary.
  const regionMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.14,
    transmission: 0.45,
    roughness: 0.18,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const region = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8 * S, 48, 1, true), regionMat);
  region.position.y = 0.9 * S;
  fieldGroup.add(region);

  const regionCapMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const regionTop = new THREE.Mesh(new THREE.CircleGeometry(1, 48), regionCapMat);
  regionTop.rotation.x = -Math.PI / 2;
  regionTop.position.y = 1.8 * S;
  const regionBottom = regionTop.clone();
  regionBottom.position.y = 0.01;
  fieldGroup.add(regionTop, regionBottom);
  // No wireframe cage — the soft glass cylinder + B arrows already mark the region.

  // Vertical B arrows — Faraday-style lattice:
  //   · length fixed at create (never setLength)
  //   · |B| drives spacing (sparse↔dense) + opacity continuously
  //   · soft circular mask to the current R region
  //   · sign flips direction / color; origin shifts so tips stay above the plane
  const B_ARROW_LEN = 1.05 * S;
  const B_ARROW_HEAD_LEN = 0.28 * S;
  const B_ARROW_HEAD_W = 0.14 * S;
  const B_ARROW_MID_Y = 0.12 * S + B_ARROW_LEN * 0.5;
  const B_NX = Math.max(3, Math.round((2 * B_R_MAX) / B_SPACING_DENSE) + 1);
  const B_NZ = B_NX;
  const B_HALF_IX = (B_NX - 1) * 0.5;
  const B_HALF_IZ = (B_NZ - 1) * 0.5;
  const B_POOL = B_NX * B_NZ;
  const bDir = new THREE.Vector3(0, 1, 0);
  const bArrows = [];
  const bArrowGroup = new THREE.Group();
  fieldGroup.add(bArrowGroup);
  for (let ix = 0; ix < B_NX; ix += 1) {
    for (let iz = 0; iz < B_NZ; iz += 1) {
      const arrow = new THREE.ArrowHelper(
        bDir,
        new THREE.Vector3(0, B_ARROW_MID_Y - B_ARROW_LEN * 0.5, 0),
        B_ARROW_LEN,
        0x38bdf8,
        B_ARROW_HEAD_LEN,
        B_ARROW_HEAD_W,
      );
      arrow.userData.ix = ix;
      arrow.userData.iz = iz;
      arrow.line.material.transparent = true;
      arrow.line.material.depthWrite = false;
      arrow.line.material.depthTest = true;
      arrow.cone.material.transparent = true;
      arrow.cone.material.depthWrite = false;
      arrow.cone.material.depthTest = true;
      arrow.renderOrder = 2;
      arrow.line.renderOrder = 2;
      arrow.cone.renderOrder = 3;
      arrow.visible = false;
      bArrowGroup.add(arrow);
      bArrows.push(arrow);
    }
  }
  let bLastB = NaN;
  let bLastSign = 0;
  let bLastR = NaN;

  /** Soft disk mask: 1 inside R, 0 outside, smooth rim (source units). */
  function bEdgeWeight(x, z, regionR) {
    const r = Math.hypot(x, z);
    const outer = regionR + B_EDGE_FADE;
    if (r >= outer) return 0;
    if (r <= regionR) return 1;
    return 1 - THREE.MathUtils.smoothstep(r, regionR, outer);
  }

  function applyBFieldLayout(B, regionR) {
    const b = Number(B || 0);
    const absB = Math.abs(b);
    const strength = THREE.MathUtils.clamp(absB / 2.5, 0, 1);
    const color = b >= 0 ? 0x38bdf8 : 0xea580c;
    const sign = b >= 0 ? 1 : -1;
    // Skip true no-ops; any change in B or R must re-breathe the lattice.
    if (
      sign === bLastSign
      && Number.isFinite(bLastB)
      && Math.abs(b - bLastB) < 1e-5
      && Number.isFinite(bLastR)
      && Math.abs(regionR - bLastR) < 1e-5
    ) {
      return { color, strength };
    }
    bLastB = b;
    bLastSign = sign;
    bLastR = regionR;

    if (absB < 0.02) {
      for (let i = 0; i < bArrows.length; i += 1) bArrows[i].visible = false;
      return { color, strength };
    }

    // Linear spacing vs |B|: no tier / no floor(count) — lattice breathes continuously.
    const spacing = THREE.MathUtils.lerp(B_SPACING_SPARSE, B_SPACING_DENSE, strength);
    bDir.set(0, sign, 0);
    const baseLineOp = THREE.MathUtils.lerp(0.5, 0.86, strength);
    const baseConeOp = THREE.MathUtils.lerp(0.55, 0.9, strength);
    const originY = B_ARROW_MID_Y - sign * (B_ARROW_LEN * 0.5);

    for (let i = 0; i < bArrows.length; i += 1) {
      const arrow = bArrows[i];
      const ix = arrow.userData.ix;
      const iz = arrow.userData.iz;
      // Source-space lattice root; scale to world with S.
      const x = (ix - B_HALF_IX) * spacing;
      const z = (iz - B_HALF_IZ) * spacing;
      const edge = bEdgeWeight(x, z, regionR);
      if (edge <= 0.012) {
        arrow.visible = false;
        continue;
      }
      arrow.visible = true;
      arrow.position.set(x * S, originY, z * S);
      arrow.setDirection(bDir);
      // Length is created fixed — never call setLength.
      arrow.setColor(color);
      const lineOp = baseLineOp * edge;
      const coneOp = baseConeOp * edge;
      if (arrow.line?.material) {
        arrow.line.material.color?.setHex?.(color);
        arrow.line.material.opacity = lineOp;
      }
      if (arrow.cone?.material) {
        arrow.cone.material.color?.setHex?.(color);
        arrow.cone.material.opacity = coneOp;
      }
    }
    return { color, strength };
  }

  // Concentric E rings: each ring is a group (line + tangent markers) that spins as a unit.
  const eRings = [];
  const ringGeoCache = new Map();
  function ringGeometry(segments = 64) {
    if (!ringGeoCache.has(segments)) {
      const pts = [];
      for (let i = 0; i <= segments; i += 1) {
        const t = (i / segments) * Math.PI * 2;
        pts.push(Math.cos(t), 0, Math.sin(t));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      ringGeoCache.set(segments, geo);
    }
    return ringGeoCache.get(segments);
  }

  E_RING_RADII_NORM.forEach((norm, index) => {
    const ring = new THREE.Group();
    eGroup.add(ring);

    const mat = new THREE.LineBasicMaterial({
      color: index < 4 ? 0xf472b6 : 0xa78bfa,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(ringGeometry(72), mat);
    line.position.y = 0.12 * S;
    ring.add(line);

    // Tangent E markers — fixed length like Faraday B; strength → opacity only.
    const E_ARROW_LEN = 0.22 * S;
    const E_ARROW_HEAD_LEN = 0.1 * S;
    const E_ARROW_HEAD_W = 0.055 * S;
    const markers = [];
    for (let k = 0; k < E_MARKERS_PER_RING; k += 1) {
      const phase = (k / E_MARKERS_PER_RING) * Math.PI * 2;
      const marker = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0.12 * S, 0),
        E_ARROW_LEN,
        0xf472b6,
        E_ARROW_HEAD_LEN,
        E_ARROW_HEAD_W,
      );
      marker.line.material.transparent = true;
      marker.line.material.depthWrite = false;
      marker.cone.material.transparent = true;
      marker.cone.material.depthWrite = false;
      marker.renderOrder = 2;
      marker.line.renderOrder = 2;
      marker.cone.renderOrder = 3;
      ring.add(marker);
      markers.push({ marker, phase });
    }
    eRings.push({ ring, line, mat, norm, markers });
  });

  // Probe charge.
  const probe = new THREE.Group();
  const probeCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.07 * S, 20, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffd43b,
      emissive: 0xffb000,
      emissiveIntensity: 0.85,
      metalness: 0.2,
      roughness: 0.28,
    }),
  );
  const probeHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.13 * S, 14, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffd43b,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  const probeHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.32 * S, 14, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  // Probe force arrow — fixed length; hide when |F|≈0 (same rule as Faraday tips).
  const FORCE_ARROW_LEN = 0.32 * S;
  const forceArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    FORCE_ARROW_LEN,
    0x4ade80,
    0.12 * S,
    0.07 * S,
  );
  forceArrow.line.material.transparent = true;
  forceArrow.line.material.depthWrite = false;
  forceArrow.cone.material.transparent = true;
  forceArrow.cone.material.depthWrite = false;
  const probeHud = createFloatingHudLabel({ worldScale: S * 8.5 });
  probeHud.sprite.position.set(0, 0.16 * S, 0);
  probe.add(probeHalo, probeCore, probeHit, forceArrow, probeHud.sprite);
  [probe, probeCore, probeHalo, probeHit].forEach((node) => {
    node.userData.interactive = true;
    node.userData.role = 'induced_e_probe';
  });
  probeGroup.add(probe);

  // Axis ticks.
  const axisMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 });
  const axisPts = new Float32Array([
    -4.6 * S, 0.004, 0, 4.6 * S, 0.004, 0,
    0, 0.004, -4.6 * S, 0, 0.004, 4.6 * S,
  ]);
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.BufferAttribute(axisPts, 3));
  labelGroup.add(new THREE.LineSegments(axisGeo, axisMat));

  let lastRegionR = -1;
  let lastSense = '';
  let lastShowB = null;
  let lastShowE = null;
  let lastShowProbe = null;

  root.userData.update = (data, dt = 0) => {
    const R = Math.max(0.2, Number(data?.R || 2));
    const rWorld = R * S;
    const B = Number(data?.B || 0);
    const dBdt = Number(data?.dBdt || 0);
    const sense = data?.sense || inducedESense(dBdt);
    const absB = Math.abs(B);
    const absD = Math.abs(dBdt);
    const showB = data?.showB !== false;
    const showE = data?.showE !== false;
    const showSpin = data?.showParticles !== false;
    const showProbe = data?.showProbe !== false;

    if (Math.abs(rWorld - lastRegionR) > 1e-5) {
      lastRegionR = rWorld;
      region.scale.set(rWorld, 1, rWorld);
      regionTop.scale.set(rWorld, rWorld, 1);
      regionBottom.scale.set(rWorld, rWorld, 1);
      // Force B lattice re-layout when the cylinder radius changes.
      bLastR = NaN;
    }

    // B field (Faraday): fixed length + continuous density breathing with |B|.
    if (!showB) {
      if (lastShowB !== false) {
        for (let i = 0; i < bArrows.length; i += 1) bArrows[i].visible = false;
        bArrowGroup.visible = false;
      }
      lastShowB = false;
    } else {
      bArrowGroup.visible = true;
      if (lastShowB !== true) {
        bLastB = NaN;
        bLastSign = 0;
        bLastR = NaN;
      }
      lastShowB = true;
      const { color, strength } = applyBFieldLayout(B, R);
      regionMat.color.setHex(color);
      regionCapMat.color.setHex(color);
      regionMat.opacity = absB < 0.02
        ? 0.08
        : 0.1 + strength * 0.12;
    }

    // E rings: style + spin; tangent arrows keep fixed length (opacity encodes |E|).
    eGroup.visible = showE;
    if (showE) {
      const eColor = sense === 'ccw' ? 0xa78bfa : sense === 'cw' ? 0xf472b6 : 0x64748b;
      const eOpacityBase = sense === 'none'
        ? 0.12
        : THREE.MathUtils.lerp(0.22, 0.88, THREE.MathUtils.clamp(absD / 2.2, 0, 1));
      const eAtR = Math.max(1e-9, inducedEMagnitude(R, R, dBdt));
      const maxMag = Math.max(1e-6, eAtR || absD * R * 0.5);
      // Angular rate ∝ |E|/r (constant inside B region; falls ~1/r² outside).
      // Positive rotation.y is CCW when looking from +y.
      const dirSign = sense === 'ccw' ? 1 : sense === 'cw' ? -1 : 0;
      const baseAng = 0.16 + THREE.MathUtils.clamp(absD / 2.5, 0, 1) * 0.4;
      const stepDt = Math.max(0, Number(dt || 0));
      const canSpin = showSpin && sense !== 'none' && absD > 1e-4;

      eRings.forEach(({ ring, line, mat, norm, markers }) => {
        const r = norm * rWorld;
        const sourceR = Math.max(1e-3, norm * R);
        const mag = inducedEMagnitude(sourceR, R, dBdt);
        line.scale.set(r, 1, r);
        mat.color.setHex(eColor);
        mat.opacity = eOpacityBase * THREE.MathUtils.clamp(0.35 + mag / maxMag, 0.25, 1);
        line.visible = mag > 1e-5 || sense === 'none';

        markers.forEach(({ marker, phase }) => {
          if (sense === 'none' || mag < 1e-5) {
            marker.visible = false;
            return;
          }
          marker.visible = true;
          // Local positions on the ring; parent spin carries them around.
          const lx = Math.cos(phase) * r;
          const lz = Math.sin(phase) * r;
          marker.position.set(lx, 0.12 * S, lz);
          // Local tangent; ring.rotation.y maps it to the correct world direction.
          const dir = inducedEDirection(Math.cos(phase), Math.sin(phase), sense);
          _tangentDir.set(dir.x, 0, dir.z);
          if (_tangentDir.lengthSq() > 1e-12) marker.setDirection(_tangentDir);
          // Length is created fixed — never call setLength.
          const strength = THREE.MathUtils.clamp(mag / maxMag, 0, 1);
          marker.setColor(eColor);
          if (marker.line?.material) {
            marker.line.material.color?.setHex?.(eColor);
            marker.line.material.opacity = THREE.MathUtils.lerp(0.5, 0.9, strength);
          }
          if (marker.cone?.material) {
            marker.cone.material.color?.setHex?.(eColor);
            marker.cone.material.opacity = THREE.MathUtils.lerp(0.55, 0.92, strength);
          }
        });

        if (canSpin) {
          const angRel = (mag / sourceR) / (eAtR / R);
          const angSpeed = baseAng * THREE.MathUtils.clamp(angRel, 0, 1.25);
          // angSpeed is revolutions/s (same units as the old particle progress rate).
          ring.rotation.y += dirSign * angSpeed * stepDt * Math.PI * 2;
        }
      });
    }
    if (showE !== lastShowE) {
      eGroup.visible = showE;
      lastShowE = showE;
    }
    lastSense = sense;

    // Probe
    probeGroup.visible = showProbe;
    if (showProbe) {
      const px = Number(data?.probe?.x || 0) * S;
      const pz = Number(data?.probe?.z || 0) * S;
      probe.position.set(px, 0.16 * S, pz);
      const q0 = Number(data?.probe?.q0 || 1);
      const qPos = q0 >= 0;
      probeCore.material.color.setHex(qPos ? 0xffd43b : 0x60a5fa);
      probeCore.material.emissive.setHex(qPos ? 0xffb000 : 0x2563eb);
      probeHalo.material.color.setHex(qPos ? 0xffd43b : 0x60a5fa);

      probeHud.setQE(
        `q₀=${qPos ? '+' : ''}${q0.toFixed(1)} μC`,
        `|E| ${formatPhysicsNumber(data?.magnitudeE, { digits: 2, unit: 'N/C' })}`,
        qPos ? '#fbbf24' : '#60a5fa',
      );

      const fx = Number(data?.force?.x || 0);
      const fz = Number(data?.force?.z || 0);
      const fMag = Math.hypot(fx, fz);
      if (fMag > 1e-5) {
        forceArrow.visible = true;
        forceArrow.setDirection(new THREE.Vector3(fx / fMag, 0, fz / fMag));
        // Length is created fixed — never call setLength.
        const fColor = qPos ? 0x4ade80 : 0x38bdf8;
        forceArrow.setColor(fColor);
        if (forceArrow.line?.material) forceArrow.line.material.color?.setHex?.(fColor);
        if (forceArrow.cone?.material) forceArrow.cone.material.color?.setHex?.(fColor);
      } else {
        forceArrow.visible = false;
      }
    }
    if (showProbe !== lastShowProbe) {
      probeGroup.visible = showProbe;
      lastShowProbe = showProbe;
    }

    // Interactive raycast gate (re-applied by setMode, kept safe here).
    const interactive = root.visible;
    [probe, probeCore, probeHalo, probeHit].forEach((node) => {
      node.userData.interactive = interactive;
    });
  };

  root.userData.setInteractive = (on) => {
    const raycast = on ? THREE.Mesh.prototype.raycast : () => {};
    root.traverse((child) => {
      if (!child.isMesh) return;
      if (child.userData?.role === 'induced_e_probe') {
        child.raycast = raycast;
        child.userData.interactive = !!on;
      } else {
        child.raycast = () => {};
      }
    });
  };

  root.userData.prewarm = (webglRenderer, activeCamera, targetScene) => {
    const wasVisible = root.visible;
    root.visible = true;
    root.userData.update({
      R: 2,
      B: 1,
      dBdt: 1.1,
      sense: 'cw',
      amp: 1.2,
      omega: 0.9,
      probe: { x: 1.4, y: 0, z: 0.5, q0: 1 },
      force: { x: 0.4, y: 0, z: -0.2 },
      showB: true,
      showE: true,
      showParticles: true,
      showProbe: true,
    }, 0.016);
    webglRenderer.compile(root, activeCamera, targetScene);
    root.visible = wasVisible;
  };

  return root;
}
