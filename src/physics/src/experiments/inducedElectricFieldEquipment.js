import * as THREE from 'three';
import {
  inducedEDirection,
  inducedEMagnitude,
  inducedESense,
} from './electro.js';

const WORLD_PER_SOURCE = 0.11;
const E_RING_RADII_NORM = [0.35, 0.55, 0.75, 1.0, 1.35, 1.75, 2.2];
const PARTICLE_COUNT = 48;
const B_ARROW_COUNT = 12;

/**
 * Tabletop apparatus: cylindrical uniform-B region + concentric induced E rings.
 * Source coordinates (R, r, B) stay in the controller; this adapter only scales.
 */
export function createInducedElectricFieldEquipment() {
  const root = new THREE.Group();
  root.name = 'induced-electric-field-apparatus';
  root.visible = false;
  root.position.set(0, 0.42, 0.02);

  const S = WORLD_PER_SOURCE;
  const fieldGroup = new THREE.Group();
  const eGroup = new THREE.Group();
  const particleGroup = new THREE.Group();
  const probeGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  root.add(fieldGroup, eGroup, particleGroup, probeGroup, labelGroup);

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

  const regionWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 1.8 * S, 32, 1, true)),
    new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55 }),
  );
  regionWire.position.y = 0.9 * S;
  fieldGroup.add(regionWire);

  // Vertical B arrows (reused, styled in place).
  const bArrows = [];
  const bArrowGroup = new THREE.Group();
  fieldGroup.add(bArrowGroup);
  for (let i = 0; i < B_ARROW_COUNT; i += 1) {
    const angle = (i / B_ARROW_COUNT) * Math.PI * 2;
    const radial = 0.35 + (i % 3) * 0.18;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.cos(angle) * radial, 0.15 * S, Math.sin(angle) * radial),
      1.2 * S,
      0x38bdf8,
      0.28 * S,
      0.14 * S,
    );
    arrow.line.material.transparent = true;
    arrow.cone.material.transparent = true;
    bArrowGroup.add(arrow);
    bArrows.push({ arrow, radial, angle });
  }

  // Concentric E rings + tangent markers.
  const eRings = [];
  const eMarkers = [];
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
    const mat = new THREE.LineBasicMaterial({
      color: index < 4 ? 0xf472b6 : 0xa78bfa,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(ringGeometry(72), mat);
    line.position.y = 0.12 * S;
    eGroup.add(line);
    eRings.push({ line, mat, norm });

    for (let k = 0; k < 8; k += 1) {
      const marker = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0.12 * S, 0),
        0.22 * S,
        0xf472b6,
        0.1 * S,
        0.06 * S,
      );
      marker.line.material.transparent = true;
      marker.cone.material.transparent = true;
      eGroup.add(marker);
      eMarkers.push({ marker, norm, phase: (k / 8) * Math.PI * 2 });
    }
  });

  // Flow particles along E.
  const particles = [];
  const particleProgress = [];
  const particleRadii = [];
  const pCore = new THREE.SphereGeometry(0.045 * S, 12, 10);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const mesh = new THREE.Mesh(
      pCore,
      new THREE.MeshBasicMaterial({
        color: 0xf9a8d4,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    particleGroup.add(mesh);
    particles.push(mesh);
    particleProgress.push(i / PARTICLE_COUNT);
    particleRadii.push(E_RING_RADII_NORM[i % E_RING_RADII_NORM.length]);
  }

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
  const forceArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    0.35 * S,
    0x4ade80,
    0.12 * S,
    0.07 * S,
  );
  forceArrow.line.material.transparent = true;
  forceArrow.cone.material.transparent = true;
  probe.add(probeHalo, probeCore, probeHit, forceArrow);
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
  let lastShowP = null;
  let lastShowProbe = null;

  function placeOnRing(mesh, rWorld, u, y = 0.12 * S) {
    const angle = u * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * rWorld, y, Math.sin(angle) * rWorld);
  }

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
    const showParticles = data?.showParticles !== false;
    const showProbe = data?.showProbe !== false;

    if (Math.abs(rWorld - lastRegionR) > 1e-5) {
      lastRegionR = rWorld;
      region.scale.set(rWorld, 1, rWorld);
      regionWire.scale.set(rWorld, 1, rWorld);
      regionTop.scale.set(rWorld, rWorld, 1);
      regionBottom.scale.set(rWorld, rWorld, 1);
      bArrows.forEach((slot, i) => {
        const radial = (0.28 + (i % 3) * 0.22) * rWorld;
        slot.arrow.position.set(
          Math.cos(slot.angle) * radial,
          0.12 * S,
          Math.sin(slot.angle) * radial,
        );
      });
    }

    // B styling
    bArrowGroup.visible = showB && absB > 0.02;
    if (showB) {
      const up = B >= 0;
      const color = up ? 0x38bdf8 : 0xfb923c;
      const len = THREE.MathUtils.lerp(0.55, 1.35, THREE.MathUtils.clamp(absB / 2.5, 0, 1)) * S;
      const opacity = THREE.MathUtils.lerp(0.35, 0.92, THREE.MathUtils.clamp(absB / 2.5, 0, 1));
      bArrows.forEach(({ arrow }) => {
        arrow.setDirection(new THREE.Vector3(0, up ? 1 : -1, 0));
        arrow.setLength(len, 0.28 * S, 0.14 * S);
        arrow.setColor(color);
        if (arrow.line?.material) arrow.line.material.opacity = opacity;
        if (arrow.cone?.material) arrow.cone.material.opacity = opacity;
      });
      const tint = up ? 0x38bdf8 : 0xfb923c;
      regionMat.color.setHex(tint);
      regionCapMat.color.setHex(tint);
      regionWire.material.color.setHex(tint);
      regionMat.opacity = 0.1 + THREE.MathUtils.clamp(absB / 2.5, 0, 1) * 0.12;
    }
    if (showB !== lastShowB) {
      bArrowGroup.visible = showB && absB > 0.02;
      lastShowB = showB;
    }

    // E rings
    eGroup.visible = showE;
    particleGroup.visible = showParticles && sense !== 'none' && absD > 1e-4;
    if (showE) {
      const eColor = sense === 'ccw' ? 0xa78bfa : sense === 'cw' ? 0xf472b6 : 0x64748b;
      const eOpacityBase = sense === 'none'
        ? 0.12
        : THREE.MathUtils.lerp(0.22, 0.88, THREE.MathUtils.clamp(absD / 2.2, 0, 1));
      eRings.forEach(({ line, mat, norm }) => {
        const r = norm * rWorld;
        // Outside rings use source radius beyond R (norm>1 → r>R).
        const sourceR = norm <= 1 ? norm * R : R * norm;
        const mag = inducedEMagnitude(sourceR, R, dBdt);
        const maxMag = Math.max(1e-6, inducedEMagnitude(R, R, dBdt) || absD * R * 0.5);
        line.scale.set(r, 1, r);
        mat.color.setHex(eColor);
        mat.opacity = eOpacityBase * THREE.MathUtils.clamp(0.35 + mag / maxMag, 0.25, 1);
        line.visible = mag > 1e-5 || sense === 'none';
      });
      eMarkers.forEach(({ marker, norm, phase }) => {
        const sourceR = norm <= 1 ? norm * R : R * norm;
        const mag = inducedEMagnitude(sourceR, R, dBdt);
        if (sense === 'none' || mag < 1e-5) {
          marker.visible = false;
          return;
        }
        marker.visible = true;
        const r = norm * rWorld;
        const x = Math.cos(phase) * r;
        const z = Math.sin(phase) * r;
        const dir = inducedEDirection(x / S, z / S, sense);
        const maxMag = Math.max(1e-6, inducedEMagnitude(R, R, dBdt));
        const len = THREE.MathUtils.lerp(0.12, 0.32, THREE.MathUtils.clamp(mag / maxMag, 0, 1)) * S;
        marker.position.set(x, 0.12 * S, z);
        marker.setDirection(new THREE.Vector3(dir.x, 0, dir.z));
        marker.setLength(len, 0.1 * S, 0.055 * S);
        marker.setColor(eColor);
        if (marker.line?.material) marker.line.material.opacity = 0.55 + 0.4 * (mag / maxMag);
        if (marker.cone?.material) marker.cone.material.opacity = 0.6 + 0.35 * (mag / maxMag);
      });
    }
    if (showE !== lastShowE) {
      eGroup.visible = showE;
      lastShowE = showE;
    }
    if (showParticles !== lastShowP) {
      particleGroup.visible = showParticles;
      lastShowP = showParticles;
    }

    // Particles flow with E: tangential speed ∝ |E|, so angular rate ∝ |E|/r
    // (constant inside the B region where E∝r; falls ~1/r² outside).
    if (particleGroup.visible) {
      const dirSign = sense === 'ccw' ? 1 : -1;
      const baseAng = 0.16 + THREE.MathUtils.clamp(absD / 2.5, 0, 1) * 0.4;
      const eAtR = Math.max(1e-9, inducedEMagnitude(R, R, dBdt));
      const color = sense === 'ccw' ? 0xc4b5fd : 0xf9a8d4;
      const stepDt = Math.max(0, Number(dt || 0));
      particles.forEach((mesh, i) => {
        const norm = particleRadii[i];
        const sourceR = Math.max(1e-3, norm * R);
        const mag = inducedEMagnitude(sourceR, R, dBdt);
        // Angular rate relative to the boundary: (E/r) / (E_R/R)
        const angRel = (mag / sourceR) / (eAtR / R);
        const angSpeed = baseAng * THREE.MathUtils.clamp(angRel, 0, 1.25);
        particleProgress[i] = ((particleProgress[i] + dirSign * angSpeed * stepDt) % 1 + 1) % 1;
        const r = norm * rWorld;
        placeOnRing(mesh, r, particleProgress[i], 0.14 * S + (i % 3) * 0.02 * S);
        mesh.material.color.setHex(color);
        const strength = THREE.MathUtils.clamp(mag / eAtR, 0, 1);
        mesh.material.opacity = 0.28 + 0.55 * strength + 0.1 * (1 - (i % 6) / 8);
        mesh.scale.setScalar(0.7 + 0.55 * strength);
      });
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

      const fx = Number(data?.force?.x || 0);
      const fz = Number(data?.force?.z || 0);
      const fMag = Math.hypot(fx, fz);
      if (fMag > 1e-5) {
        forceArrow.visible = true;
        forceArrow.setDirection(new THREE.Vector3(fx / fMag, 0, fz / fMag));
        const flen = THREE.MathUtils.clamp(0.18 + fMag * 0.35, 0.18, 0.7) * S;
        forceArrow.setLength(flen, 0.12 * S, 0.07 * S);
        forceArrow.setColor(qPos ? 0x4ade80 : 0x38bdf8);
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
