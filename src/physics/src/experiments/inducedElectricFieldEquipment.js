import * as THREE from 'three';
import {
  inducedEDirection,
  inducedEMagnitude,
  inducedESense,
} from './electro.js';
import { formatPhysicsNumber, drawMathFormula } from '../physicsFormula.js';

const WORLD_PER_SOURCE = 0.12;
/** Fixed source-space radii r_source (0.45 to 4.50) for the concentric induced electric field lines.
 *  Their spatial extent is FIXED to cover the entire black measurement disk (R_disk = 4.8)
 *  and DOES NOT change when the magnetic cylinder radius R changes.
 */
const MAX_E_RINGS = 28;
const E_MARKERS_PER_RING = 8;
/** Source-space R max (matches desk slider R max). Lattice covers densest fill of this disk. */
const B_R_MAX = 3.2;
/** Faraday-style lattice spacing in source units: sparse ↔ dense vs |B|. */
const B_SPACING_SPARSE = 1.45;
const B_SPACING_DENSE = 0.48;
const B_EDGE_FADE = 0.35;

/** Frameless two-line billboard: q and E only, above the probe charge. */
function createFloatingHudLabel({ worldScale = 1 } = {}) {
  if (typeof document === 'undefined') {
    return { sprite: new THREE.Group(), setQE: () => {} };
  }
  const canvas = document.createElement('canvas');
  canvas.width = 440;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 1,
  }));
  sprite.center.set(0.5, 0);
  const baseW = 0.48 * worldScale;
  const heightFor = (n) => (0.040 + 0.045 * Math.max(1, n)) * worldScale;
  sprite.scale.set(baseW, heightFor(2), 1);
  sprite.renderOrder = 24;
  sprite.raycast = () => {};
  let lastKey = '';

  function setQE(qText, eText, accent = '#fbbf24', rText = null) {
    const key = `${accent}|${qText}|${eText}|${rText || ''}`;
    if (key === lastKey) return;
    lastKey = key;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Frameless pure floating text (no card box / no container background)
    const drawLine = (text, y, size, color) => {
      if (!text) return;
      // High-contrast dark outline stroke behind pure floating text
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(text, W / 2, y);
      ctx.restore();

      drawMathFormula(ctx, text, W / 2, y, {
        font: `bold ${size}px "Microsoft YaHei", sans-serif`,
        color,
        align: 'center',
        textBaseline: 'middle',
        fontWeight: 'bold',
      });
    };
    const lines = [
      rText ? { text: rText, color: '#38bdf8', size: 44 } : null,
      { text: eText, color: accent || '#fbbf24', size: 42 },
    ].filter(Boolean);
    sprite.scale.set(baseW, heightFor(lines.length), 1);
    const lineSpacing = 50;
    const centerY = H * 0.50;
    const startY = centerY - ((lines.length - 1) * lineSpacing) / 2;
    lines.forEach((line, i) => {
      const y = startY + i * lineSpacing;
      drawLine(line.text, y, line.size, line.color);
    });
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
  // Shift apparatus to the left (-0.26m) so the enlarged measurement disk does not overlap the right-side control panel.
  root.position.set(-0.26, 0.05, 0.02);

  const S = WORLD_PER_SOURCE;
  const fieldGroup = new THREE.Group();
  const eGroup = new THREE.Group();
  const probeGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  root.add(fieldGroup, eGroup, probeGroup, labelGroup);
  const _tangentDir = new THREE.Vector3(1, 0, 0);

  // Dark, emissive measurement plane: enlarged floor disk.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6.8 * S, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0b1630,
      transparent: true,
      opacity: 0.78,
      metalness: 0.42,
      roughness: 0.38,
      emissive: 0x071426,
      emissiveIntensity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  fieldGroup.add(floor);

  // Physical rim: retains a clear usable-probe boundary at shallow angles.
  const workRim = new THREE.Mesh(
    new THREE.TorusGeometry(6.8 * S, 0.026 * S, 8, 96),
    new THREE.MeshStandardMaterial({
      color: 0x334e72,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.22,
      metalness: 0.64,
      roughness: 0.24,
    }),
  );
  workRim.rotation.x = Math.PI / 2;
  workRim.position.y = 0.008;
  fieldGroup.add(workRim);

  // Glass cylinder marking the uniform-B region boundary.
  const regionMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.38,
    transmission: 0.06,
    roughness: 0.24,
    metalness: 0.16,
    emissive: 0x075985,
    emissiveIntensity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const region = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8 * S, 48, 1, true), regionMat);
  region.position.y = 0.9 * S;
  fieldGroup.add(region);

  const regionCapMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const regionTop = new THREE.Mesh(new THREE.CircleGeometry(1, 48), regionCapMat);
  regionTop.rotation.x = -Math.PI / 2;
  regionTop.position.y = 1.8 * S;
  const regionBottom = regionTop.clone();
  regionBottom.position.y = 0.01;
  fieldGroup.add(regionTop, regionBottom);
  const regionRim = new THREE.Mesh(
    // Radius is scaled from source R below; use an unscaled tube width so the
    // rim remains legible instead of shrinking into a hairline at small R.
    new THREE.TorusGeometry(1, 0.024, 8, 64),
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x0891b2,
      emissiveIntensity: 1.35,
      metalness: 0.36,
      roughness: 0.22,
    }),
  );
  regionRim.rotation.x = Math.PI / 2;
  regionRim.position.y = 0.14 * S;
  fieldGroup.add(regionRim);
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
    const baseLineOp = THREE.MathUtils.lerp(0.76, 0.98, strength);
    const baseConeOp = THREE.MathUtils.lerp(0.82, 1, strength);
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

  for (let index = 0; index < MAX_E_RINGS; index += 1) {
    const ring = new THREE.Group();
    eGroup.add(ring);

    const mat = new THREE.LineBasicMaterial({
      color: 0xf472b6,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(ringGeometry(72), mat);
    line.position.y = 0.12 * S;
    ring.add(line);

    // Tangent E markers — well-proportioned, crisp arrows.
    const E_ARROW_LEN = 0.36 * S;
    const E_ARROW_HEAD_LEN = 0.18 * S;
    const E_ARROW_HEAD_W = 0.10 * S;
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
    eRings.push({ ring, line, mat, markers });
  }

  // Probe charge.
  const probe = new THREE.Group();
  const probeCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.105 * S, 20, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffd43b,
      emissive: 0xffb000,
      emissiveIntensity: 0.95,
      metalness: 0.2,
      roughness: 0.28,
    }),
  );
  probeCore.renderOrder = 22;
  probeCore.frustumCulled = false;

  const probeHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.20 * S, 14, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffd43b,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
    }),
  );
  probeHalo.renderOrder = 21;
  probeHalo.frustumCulled = false;

  const probeHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.38 * S, 14, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  // Probe force arrow — fixed length; hide when |F|≈0 (same rule as Faraday tips).
  const FORCE_ARROW_LEN = 0.48 * S;
  const forceArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    FORCE_ARROW_LEN,
    0x4ade80,
    0.16 * S,
    0.09 * S,
  );
  forceArrow.line.material.transparent = true;
  forceArrow.line.material.depthWrite = false;
  forceArrow.cone.material.transparent = true;
  forceArrow.cone.material.depthWrite = false;
  forceArrow.line.raycast = () => {};
  forceArrow.cone.raycast = () => {};
  forceArrow.raycast = () => {};
  const probeHud = createFloatingHudLabel({ worldScale: S * 11 });
  probeHud.sprite.position.set(0, 0.22 * S, 0);
  probeHud.sprite.renderOrder = 24;
  probeHud.sprite.frustumCulled = false;
  probe.add(probeHalo, probeCore, probeHit, forceArrow, probeHud.sprite);
  probe.frustumCulled = false;
  probeGroup.frustumCulled = false;
  [probe, probeCore, probeHalo, probeHit].forEach((node) => {
    node.userData.interactive = true;
    node.userData.role = 'induced_e_probe';
  });
  probeGroup.add(probe);

  // Axis ticks.
  const axisMat = new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.78 });
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
      regionRim.scale.set(rWorld, rWorld, 1);
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
      regionRim.material.color.setHex(color);
      regionRim.material.emissive.setHex(color);
      regionRim.material.emissiveIntensity = absB < 0.02 ? 0.28 : 0.9 + strength * 0.75;
      regionMat.opacity = absB < 0.02
        ? 0.18
        : 0.28 + strength * 0.2;
    }

    // E rings: style + spin; tangent arrows keep fixed length (opacity encodes |E|).
    eGroup.visible = showE;
    if (showE) {
      const eColor = sense === 'ccw' ? 0xa78bfa : sense === 'cw' ? 0xf472b6 : 0x64748b;
      const eOpacityBase = sense === 'none'
        ? 0.22
        : THREE.MathUtils.lerp(0.52, 0.98, THREE.MathUtils.clamp(absD / 2.2, 0, 1));
      const eAtR = Math.max(1e-9, inducedEMagnitude(R, R, dBdt));
      const maxMag = Math.max(1e-6, eAtR || absD * R * 0.5);
      // Angular rate ∝ |E|/r (constant inside B region; falls ~1/r² outside).
      // Positive rotation.y is CCW when looking from +y.
      const dirSign = sense === 'ccw' ? 1 : sense === 'cw' ? -1 : 0;
      const baseAng = 0.16 + THREE.MathUtils.clamp(absD / 2.5, 0, 1) * 0.4;
      const stepDt = Math.max(0, Number(dt || 0));
      const canSpin = showSpin && sense !== 'none' && absD > 1e-4;

      const dynamicRadii = (function computePhysicalRingRadii(regionR, rateD, Rdisk = 6.5) {
        const absRate = Math.abs(Number(rateD || 0));
        if (absRate < 0.02) return [];

        const safeR = Math.max(0.6, Math.min(3.6, Number(regionR || 2)));
        // 物理规律：电场线密度 ∝ 局部场强 E
        // 面内 E ∝ r：从约 0.3R 起起始，越靠近边界 R 越紧密（避免圆心过空，同时展现渐变）
        // 面外 E ∝ 1/r：边界 R 处最紧密，向外延伸间距逐渐拉开
        const nIn = Math.min(6, Math.max(3, Math.round(2.0 + absRate * 0.7)));
        const nOut = Math.min(7, Math.max(4, Math.round(3.0 + absRate * 0.8)));

        const radii = [];
        // 1. 面内环 (E ∝ r)：间距随 r 增大显著变密，呈现明显的阶梯渐变
        for (let i = 1; i <= nIn; i += 1) {
          const frac = Math.pow(i / (nIn + 1), 0.42);
          radii.push(safeR * frac);
        }
        // 2. 边界环 r = R (场强最大 E_max)
        radii.push(safeR);
        // 3. 面外环 (E ∝ 1/r)：随半径增大间距平滑拉开
        const ratio = Math.max(1.12, Rdisk / safeR);
        for (let k = 1; k <= nOut; k += 1) {
          const frac = k / nOut;
          radii.push(safeR * Math.pow(ratio, Math.pow(frac, 1.25)));
        }
        return radii;
      }(R, dBdt));

      eRings.forEach(({ ring, line, mat, markers }, index) => {
        if (index >= dynamicRadii.length || absD < 0.02) {
          ring.visible = false;
          return;
        }
        ring.visible = true;
        const sourceR = dynamicRadii[index];
        const rWorld = sourceR * S;
        const mag = inducedEMagnitude(sourceR, R, dBdt);
        line.scale.set(rWorld, 1, rWorld);

        const isBoundary = Math.abs(sourceR - R) < 0.08;
        const isInside = sourceR <= R + 1e-6;
        const ringColor = isBoundary
          ? 0xf43f5e
          : isInside
            ? (sense === 'cw' ? 0xf472b6 : sense === 'ccw' ? 0xa78bfa : 0xec4899)
            : (sense === 'cw' ? 0xc084fc : sense === 'ccw' ? 0x818cf8 : 0x64748b);
        mat.color.setHex(ringColor);

        // Field strength weighting: dense/strong regions (near R) are vivid (opacity ~0.95);
        // weak/sparse regions (r->0 and r->4.5) are translucent (opacity ~0.22).
        const relStrength = THREE.MathUtils.clamp(mag / maxMag, 0, 1);
        mat.opacity = eOpacityBase * THREE.MathUtils.lerp(0.22, 0.96, Math.pow(relStrength, 0.75));

        markers.forEach(({ marker, phase }) => {
          if (sense === 'none' || mag < 1e-5) {
            marker.visible = false;
            return;
          }
          marker.visible = true;
          // Local positions on the ring; parent spin carries them around.
          const lx = Math.cos(phase) * rWorld;
          const lz = Math.sin(phase) * rWorld;
          marker.position.set(lx, 0.12 * S, lz);
          // Local tangent; ring.rotation.y maps it to the correct world direction.
          const dir = inducedEDirection(Math.cos(phase), Math.sin(phase), sense);
          _tangentDir.set(dir.x, 0, dir.z);
          if (_tangentDir.lengthSq() > 1e-12) marker.setDirection(_tangentDir);
          // Length is created fixed — never call setLength.
          const strength = THREE.MathUtils.clamp(mag / maxMag, 0, 1);
          marker.setColor(ringColor);
          if (marker.line?.material) {
            marker.line.material.color?.setHex?.(ringColor);
            marker.line.material.opacity = THREE.MathUtils.lerp(0.72, 1, strength);
          }
          if (marker.cone?.material) {
            marker.cone.material.color?.setHex?.(ringColor);
            marker.cone.material.opacity = THREE.MathUtils.lerp(0.78, 1, strength);
          }
        });

        if (canSpin) {
          const CONSTANT_SPIN_SPEED = 0.22; // 始终保持不变的转速 (revolutions/s)
          ring.rotation.y += dirSign * CONSTANT_SPIN_SPEED * stepDt * Math.PI * 2;
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
      probeHud.sprite.visible = data?.showProbe !== false;

      const pr = Number(data?.probeR ?? Math.hypot(Number(data?.probe?.x || 0), Number(data?.probe?.z || 0)));
      probeHud.setQE(
        `q₀=${qPos ? '+' : ''}${q0.toFixed(1)} μC`,
        `|E| = ${formatPhysicsNumber(data?.magnitudeE, { digits: 2, unit: 'N/C' })}`,
        qPos ? '#fbbf24' : '#60a5fa',
        `r = ${pr.toFixed(2)} m`,
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
      if (child.userData?.role === 'induced_e_probe') {
        if (child.isMesh) {
          child.raycast = raycast;
          child.userData.interactive = !!on;
        }
      } else if (child.isMesh || child.isLine || child.isLineSegments || child.isSprite) {
        child.raycast = () => {};
      }
    });
  };

  return root;
}
