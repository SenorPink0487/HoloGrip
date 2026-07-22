import * as THREE from 'three';

const WORLD_PER_SOURCE_UNIT = 0.13;
const CHARGE_LIMIT = 12;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
    child.material?.map?.dispose?.();
  });
}

function sourceDirs(count) {
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (index / Math.max(1, count - 1)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    return new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial);
  });
}

/** Scratch vectors — field integration must stay allocation-free in hot loops. */
const _field = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _point = new THREE.Vector3();
const _chargePos = new THREE.Vector3();
const _forceDir = new THREE.Vector3();
const _arrowOrigin = new THREE.Vector3();
const _arrowDir = new THREE.Vector3();
const _lerpA = new THREE.Color();
const _lerpB = new THREE.Color();

function fieldAtInto(charges, point, out) {
  out.set(0, 0, 0);
  for (let i = 0; i < charges.length; i += 1) {
    const charge = charges[i];
    const q = Number(charge?.q || 0);
    if (Math.abs(q) < 1e-6) continue;
    _delta.set(
      point.x - Number(charge.x || 0),
      point.y - Number(charge.y || 0),
      point.z - Number(charge.z || 0),
    );
    const r2 = _delta.lengthSq();
    if (r2 < 0.04 ** 2) continue;
    out.addScaledVector(_delta, q / (r2 * Math.sqrt(r2)));
  }
  return out;
}

function fieldAt(charges, point) {
  return fieldAtInto(charges, point, new THREE.Vector3());
}

function potentialAt(charges, point) {
  let value = 0;
  for (let i = 0; i < charges.length; i += 1) {
    const charge = charges[i];
    const distance = Math.max(0.04, Math.hypot(
      point.x - Number(charge.x || 0),
      point.y - Number(charge.y || 0),
      point.z - Number(charge.z || 0),
    ));
    value += Number(charge?.q || 0) / distance;
  }
  return value;
}

function colorForCharge(q) {
  if (q > 0.05) return 0xff6b6b;
  if (q < -0.05) return 0x4dabf7;
  return 0xadb5bd;
}

function nearAnyCharge(charges, point, minDist) {
  const minDistSq = minDist * minDist;
  for (let i = 0; i < charges.length; i += 1) {
    const charge = charges[i];
    const dx = point.x - Number(charge.x || 0);
    const dy = point.y - Number(charge.y || 0);
    const dz = point.z - Number(charge.z || 0);
    if (dx * dx + dy * dy + dz * dz < minDistSq) return true;
  }
  return false;
}

export function createElectricFieldEquipment() {
  const root = new THREE.Group();
  root.name = 'electric-field-equipment';
  root.visible = false;
  root.position.y = 0.42;

  const chargeGroup = new THREE.Group();
  const lineGroup = new THREE.Group();
  const arrowGroup = new THREE.Group();
  const equipotGroup = new THREE.Group();
  const probeGroup = new THREE.Group();
  root.add(lineGroup, equipotGroup, arrowGroup, chargeGroup, probeGroup);

  const chargeSlots = [];
  for (let index = 0; index < CHARGE_LIMIT; index += 1) {
    const slot = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 20, 14),
      new THREE.MeshStandardMaterial({ emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.18 }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false }),
    );
    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 14, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.055, depthWrite: false }),
    );
    const hit = new THREE.Mesh(
      // The source charges are visually small after the host coordinate
      // conversion; keep a generous invisible grab volume for mouse/AR.
      new THREE.SphereGeometry(0.32, 16, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    slot.add(outer, halo, core, hit);
    slot.userData = { interactive: true, role: 'electric_charge', core, halo, outer, hit };
    // Tag every mesh so resolveInteractive can stop on the first hit surface
    // without losing the charge id (hit proxy, core, and glow shells alike).
    [slot, outer, halo, core, hit].forEach((node) => {
      node.userData.interactive = true;
      node.userData.role = 'electric_charge';
    });
    slot.userData.core = core;
    slot.userData.halo = halo;
    slot.userData.outer = outer;
    slot.userData.hit = hit;
    chargeGroup.add(slot);
    chargeSlots.push(slot);
  }

  const probe = new THREE.Group();
  const probeCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffb000, emissiveIntensity: 0.75 }),
  );
  const probeHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  const probeHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  probe.add(probeHalo, probeCore, probeHit);
  probe.userData = { interactive: true, role: 'electric_probe', hit: probeHit };
  [probe, probeHalo, probeCore, probeHit].forEach((node) => {
    node.userData.interactive = true;
    node.userData.role = 'electric_probe';
  });
  probe.userData.hit = probeHit;
  probeGroup.add(probe);

  let forceArrow = null;
  let lastFieldSignature = '';
  let lastForceSignature = '';
  let lastResetView = -1;
  let lastSlotMetaSignature = '';
  let pendingDecoration = false;

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      disposeObject(child);
    }
  }

  /** Field decorations must never steal charge/probe picks (esp. AR frontmost). */
  function disablePick(object) {
    object?.traverse?.((child) => {
      if (child.isMesh || child.isLine || child.isLineSegments) child.raycast = () => {};
    });
  }

  function rebuildLines(charges) {
    clearGroup(lineGroup);
    if (!charges.length) return;
    let totalAbs = 0;
    for (let i = 0; i < charges.length; i += 1) totalAbs += Math.abs(Number(charges[i].q || 0));
    const lineCount = THREE.MathUtils.clamp(Math.round(18 + totalAbs * 10), 12, 72);
    for (let c = 0; c < charges.length; c += 1) {
      const charge = charges[c];
      if (Math.abs(Number(charge.q || 0)) < 0.05) continue;
      const sign = charge.q > 0 ? 1 : -1;
      const share = Math.max(6, Math.round(lineCount * Math.min(Math.abs(charge.q), 2.5) / Math.max(charges.length, 1)));
      const dirs = sourceDirs(share);
      for (let d = 0; d < dirs.length; d += 1) {
        const direction = dirs[d];
        _point.set(charge.x, charge.y, charge.z).addScaledVector(direction, 0.26);
        const points = [_point.clone()];
        for (let step = 0; step < 90; step += 1) {
          fieldAtInto(charges, _point, _field);
          const magnitude = _field.length();
          if (magnitude < 1e-5) break;
          _point.addScaledVector(_field, sign * 0.09 / magnitude);
          if (_point.length() > 9 || nearAnyCharge(charges, _point, 0.2)) break;
          points.push(_point.clone());
        }
        if (points.length < 2) continue;
        for (let p = 0; p < points.length; p += 1) points[p].multiplyScalar(WORLD_PER_SOURCE_UNIT);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: colorForCharge(charge.q), transparent: true, opacity: 0.5, depthWrite: false }),
        );
        line.frustumCulled = false;
        disablePick(line);
        lineGroup.add(line);
      }
    }
  }

  function rebuildArrows(charges) {
    clearGroup(arrowGroup);
    if (!charges.length) return;
    const samples = [];
    for (let x = -3; x <= 3.001; x += 1.2) {
      for (let y = -3; y <= 3.001; y += 1.2) {
        for (let z = -3; z <= 3.001; z += 1.2) samples.push(new THREE.Vector3(x, y, z));
      }
    }
    let maxMagnitude = 1e-5;
    const values = samples.map((point) => {
      const field = fieldAt(charges, point);
      maxMagnitude = Math.max(maxMagnitude, field.length());
      return field;
    });
    _lerpA.setHex(0x5ad4ff);
    _lerpB.setHex(0xff8a6b);
    values.forEach((field, index) => {
      const magnitude = field.length();
      if (magnitude < maxMagnitude * 0.012) return;
      _arrowDir.copy(field).normalize();
      const t = THREE.MathUtils.clamp(Math.log1p(magnitude / maxMagnitude * 12) / Math.log1p(12), 0, 1);
      // Slightly longer/thicker than the source grid so field direction stays readable
      // after WORLD_PER_SOURCE_UNIT scaling on the lab bench.
      const length = 0.18 + 0.48 * t;
      _arrowOrigin.copy(samples[index]).addScaledVector(_arrowDir, -length * 0.45).multiplyScalar(WORLD_PER_SOURCE_UNIT);
      const arrow = new THREE.ArrowHelper(
        _arrowDir.clone(),
        _arrowOrigin.clone(),
        length * WORLD_PER_SOURCE_UNIT,
        _lerpA.clone().lerp(_lerpB, t).getHex(),
        0.095 * WORLD_PER_SOURCE_UNIT,
        0.042 * WORLD_PER_SOURCE_UNIT,
      );
      disablePick(arrow);
      arrowGroup.add(arrow);
    });
  }

  function rebuildEquipotential(charges) {
    clearGroup(equipotGroup);
    if (!charges.length) return;
    const size = 96;
    const data = new Uint8Array(size * size * 4);
    const values = new Float32Array(size * size);
    let maxAbs = 0.1;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = Math.asinh(potentialAt(charges, {
          x: -4 + (8 * x) / (size - 1),
          y: -4 + (8 * y) / (size - 1),
          z: 0,
        }));
        values[y * size + x] = value;
        maxAbs = Math.max(maxAbs, Math.abs(value));
      }
    }
    for (let index = 0; index < values.length; index += 1) {
      const t = THREE.MathUtils.clamp(values[index] / maxAbs, -1, 1);
      const positive = t >= 0;
      const strength = Math.pow(Math.abs(t), 0.72);
      data[index * 4] = positive ? 18 + 220 * strength : 18 + 50 * strength;
      data[index * 4 + 1] = positive ? 24 + 70 * strength : 24 + 130 * strength;
      data[index * 4 + 2] = positive ? 40 + 70 * strength : 40 + 210 * strength;
      data[index * 4 + 3] = 72;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(8 * WORLD_PER_SOURCE_UNIT, 8 * WORLD_PER_SOURCE_UNIT),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.015;
    disablePick(plane);
    equipotGroup.add(plane);
  }

  function rebuildDecorations(charges, data) {
    if (data.showLines !== false) rebuildLines(charges);
    else clearGroup(lineGroup);
    if (data.showArrows !== false) rebuildArrows(charges);
    else clearGroup(arrowGroup);
    if (data.showEquipot === true) rebuildEquipotential(charges);
    else clearGroup(equipotGroup);
    pendingDecoration = false;
  }

  function syncForceArrow(data, probeData) {
    const showProbe = data.showProbe !== false;
    const forceSignature = `${Number(data.force?.x || 0).toFixed(4)}:${Number(data.force?.y || 0).toFixed(4)}:${Number(data.force?.z || 0).toFixed(4)}:${probeData.x}:${probeData.y}:${probeData.z}:${showProbe}`;
    if (forceSignature === lastForceSignature) return;
    lastForceSignature = forceSignature;

    if (!showProbe) {
      if (forceArrow) {
        forceArrow.parent?.remove(forceArrow);
        disposeObject(forceArrow);
        forceArrow = null;
      }
      return;
    }

    const fx = Number(data.force?.x || 0);
    const fy = Number(data.force?.y || 0);
    const fz = Number(data.force?.z || 0);
    const mag = Math.hypot(fx, fy, fz);
    if (mag < 1e-4) {
      if (forceArrow) {
        forceArrow.parent?.remove(forceArrow);
        disposeObject(forceArrow);
        forceArrow = null;
      }
      return;
    }

    _forceDir.set(fx, fy, fz).multiplyScalar(1 / mag);
    const length = Math.min(0.42, 0.12 + Math.log1p(mag) * 0.08) * WORLD_PER_SOURCE_UNIT;
    if (!forceArrow) {
      forceArrow = new THREE.ArrowHelper(
        _forceDir.clone(),
        probe.position.clone(),
        length,
        0x69db7c,
        0.08 * WORLD_PER_SOURCE_UNIT,
        0.035 * WORLD_PER_SOURCE_UNIT,
      );
      disablePick(forceArrow);
      probeGroup.add(forceArrow);
    } else {
      forceArrow.position.copy(probe.position);
      forceArrow.setDirection(_forceDir);
      forceArrow.setLength(length, 0.08 * WORLD_PER_SOURCE_UNIT, 0.035 * WORLD_PER_SOURCE_UNIT);
    }
  }

  root.userData.update = (data, dt = 0) => {
    if (!data) return;
    const charges = Array.isArray(data.charges) ? data.charges : [];
    const chargeSignature = charges.map((charge) => `${charge.id}:${charge.q}:${Number(charge.x).toFixed(2)}:${Number(charge.y).toFixed(2)}:${Number(charge.z).toFixed(2)}`).join('|');
    const slotMetaSignature = charges.map((charge) => `${charge.id}:${Number(charge.q || 0).toFixed(2)}`).join('|')
      + `|sel:${data.selectedId}|n:${charges.length}`;
    const metaChanged = slotMetaSignature !== lastSlotMetaSignature;
    if (metaChanged) lastSlotMetaSignature = slotMetaSignature;

    chargeSlots.forEach((slot, index) => {
      const charge = charges[index];
      slot.visible = !!charge;
      if (!charge) {
        if (metaChanged) {
          // Raycaster does not consistently inherit an invisible ancestor across
          // all Three.js versions. Disable stale slot hit meshes explicitly so an
          // unused slot can never steal the next drag gesture.
          slot.traverse((child) => {
            if (child.isMesh) child.raycast = () => {};
            if (child.userData) child.userData.chargeId = undefined;
          });
          slot.userData.chargeId = undefined;
        }
        return;
      }

      slot.position.set(charge.x, charge.y, charge.z).multiplyScalar(WORLD_PER_SOURCE_UNIT);
      slot.scale.setScalar(0.8 + Math.min(3, Math.abs(Number(charge.q || 0))) * 0.18);

      if (metaChanged) {
        const color = colorForCharge(Number(charge.q || 0));
        slot.traverse((child) => {
          if (child.isMesh) child.raycast = THREE.Mesh.prototype.raycast;
          if (child.userData) {
            child.userData.role = 'electric_charge';
            child.userData.interactive = true;
            child.userData.chargeId = charge.id;
          }
        });
        slot.userData.core.material.color.setHex(color);
        slot.userData.core.material.emissive.setHex(color);
        slot.userData.halo.material.color.setHex(color);
        slot.userData.outer.material.color.setHex(color);
      }
      slot.userData.halo.material.opacity = charge.id === data.selectedId ? 0.34 : 0.16;
    });

    const probeData = data.probe || { x: 0, y: 0, z: 0, q0: 1 };
    probe.position.set(probeData.x, probeData.y, probeData.z).multiplyScalar(WORLD_PER_SOURCE_UNIT);
    probe.visible = data.showProbe !== false;
    probeHit.raycast = data.showProbe !== false ? THREE.Mesh.prototype.raycast : () => {};
    syncForceArrow(data, probeData);

    lineGroup.visible = data.showLines !== false;
    arrowGroup.visible = data.showArrows !== false;
    equipotGroup.visible = data.showEquipot === true;

    // Heavy field decorations (lines / arrows / equipotential) allocate and
    // dispose hundreds of geometries. Doing that on every pointermove freezes
    // the main thread — keep charge/probe meshes live during drag, leave the
    // previous decorations in place, and rebuild once on release.
    const dragging = !!data.dragging;
    if (chargeSignature !== lastFieldSignature) {
      if (dragging) {
        pendingDecoration = true;
      } else {
        rebuildDecorations(charges, data);
        lastFieldSignature = chargeSignature;
      }
    } else if (pendingDecoration && !dragging) {
      rebuildDecorations(charges, data);
      lastFieldSignature = chargeSignature;
    } else {
      if (data.showLines !== false && lineGroup.children.length === 0) rebuildLines(charges);
      if (data.showArrows !== false && arrowGroup.children.length === 0) rebuildArrows(charges);
      if (data.showEquipot === true && equipotGroup.children.length === 0) rebuildEquipotential(charges);
    }

    if (data.autoRotate && dt > 0) root.rotation.y += dt * 0.18;
    if (data.resetView !== lastResetView) {
      root.rotation.set(0, 0, 0);
      lastResetView = data.resetView || 0;
    }
  };

  root.userData.prewarm = (renderer, camera, scene) => {
    const visible = root.visible;
    root.visible = true;
    // Build field lines / arrows / force before shader compile so first experiment
    // open does not allocate heavy decorations mid-frame.
    root.userData.update({
      charges: [{ id: 1, q: 1, x: 0, y: 0, z: 0 }],
      selectedId: 1,
      probe: { x: 2, y: 0.8, z: 0, q0: 1 },
      force: { x: 0.12, y: 0.02, z: 0 },
      showLines: true,
      showArrows: true,
      showEquipot: true,
      showProbe: true,
      dragging: false,
    }, 0);
    renderer.compile(root, camera, scene);
    root.visible = visible;
  };
  root.userData.setInteractive = (enabled) => {
    const raycast = enabled ? THREE.Mesh.prototype.raycast : () => {};
    chargeSlots.forEach((slot) => slot.traverse((child) => {
      if (child.isMesh) child.raycast = raycast;
    }));
    probeHit.raycast = enabled && probe.visible ? THREE.Mesh.prototype.raycast : () => {};
  };
  return root;
}
