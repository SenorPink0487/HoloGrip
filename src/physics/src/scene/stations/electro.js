import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { labFrameScheduler } from '../../frameBudget.js';
import { createHallDemoEquipment } from '../../experiments/hallDemoEquipment.js';
import { createElectricFieldEquipment } from '../../experiments/electricFieldEquipment.js';
import { createInducedElectricFieldEquipment } from '../../experiments/inducedElectricFieldEquipment.js';
import {
  gaussFluxParticleEmphasis,
  gaussFluxParticleRadiusNorm,
  gaussFluxParticleSpeed,
  gaussNormalFluxDensity,
} from '../../experiments/electro.js';

/** Build and expose all electromagnetism-station apparatus. */
export function createStationEquipment(ctx) {
  const { THREE, scene, camera, renderer, materials: mat, primitives } = ctx;
  const { rbox, box, cyl } = primitives;
  const animators = [];

  // —— Gauss-theorem closed-surface apparatus ——
  function createGaussEquipment() {
    const root = new THREE.Group();
    root.visible = false;
    root.position.y = 0.42;
    const WORLD_PER_SOURCE_UNIT = 0.13;

    const surfaceGroup = new THREE.Group();
    const fieldGroup = new THREE.Group();
    const chargeGroup = new THREE.Group();
    const fluxGroup = new THREE.Group();
    root.add(fieldGroup, surfaceGroup, fluxGroup, chargeGroup);

    const surfaceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      transmission: 0.58,
      roughness: 0.12,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    });
    const surface = new THREE.Mesh(new THREE.SphereGeometry(0.31, 48, 32), surfaceMaterial);
    surface.userData.interactive = true;
    surface.userData.role = 'gauss_surface';
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(0.31, 24, 16)),
      wireMaterial,
    );
    surfaceGroup.add(surface, wire);

    const positiveMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b6b, emissive: 0xff3344, emissiveIntensity: 0.88, roughness: 0.24,
    });
    const negativeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4dabf7, emissive: 0x1677ff, emissiveIntensity: 0.82, roughness: 0.24,
    });
    const glowMaterials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({
      color: 0xff6b6b, transparent: true, opacity: 0.16, depthWrite: false,
    }));
    const chargeSlots = Array.from({ length: 6 }, (_, index) => {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 18), positiveMaterial);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.068, 18, 12), glowMaterials[index]);
      const hit = new THREE.Mesh(
        // Match the electric-field grab volume so Gauss charges stay easy to drag.
        new THREE.SphereGeometry(0.14, 14, 10),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      group.add(glow, core, hit);
      group.userData.core = core;
      group.userData.glow = glow;
      group.userData.hit = hit;
      [group, glow, core, hit].forEach((node) => {
        node.userData.interactive = true;
        node.userData.role = 'gauss_charge';
      });
      group.userData.core = core;
      group.userData.glow = glow;
      group.userData.hit = hit;
      chargeGroup.add(group);
      return group;
    });

    const fieldLineObjects = [];

    // Flux tracers sample the sphere; each follows the local normal flux E·n
    // so the animation illustrates ∯ E·dA rather than a single global direction.
    // Instancing keeps dense surface coverage in one draw call.
    const fluxCount = 160;
    const fluxParticles = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < fluxCount; i += 1) {
      const y = 1 - (i / Math.max(1, fluxCount - 1)) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      fluxParticles.push({
        direction: new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial),
        // Stagger phases so the surface is continuously populated.
        t: (i * 0.61803398875) % 1,
        jitter: 0.85 + ((i * 17) % 23) / 23 * 0.35,
        density: 0,
      });
    }
    const fluxCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xc5a3ff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      depthTest: true,
    });
    const fluxCore = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.0048, 8, 6),
      fluxCoreMaterial,
      fluxCount,
    );
    fluxCore.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fluxCore.frustumCulled = false;
    fluxCore.renderOrder = 8;
    fluxCore.raycast = () => {};
    fluxGroup.add(fluxCore);
    const fluxMatrix = new THREE.Object3D();
    const fluxPosition = new THREE.Vector3();
    let fluxWorldRadius = 2.4 * WORLD_PER_SOURCE_UNIT;
    // Soft floor so weak external patches still animate; strong patches dominate size/speed.
    const FLUX_DENSITY_EPS = 1.5e-4;

    let lastRadius = NaN;
    let lastFieldSignature = '';
    let pendingFieldRebuild = false;
    let fieldRebuildGen = 0;
    const GAUSS_FIELD_JOB_ID = 'gauss:field-lines';
    function rebuildSurface(radius) {
      const worldRadius = radius * WORLD_PER_SOURCE_UNIT;
      fluxWorldRadius = worldRadius;
      surface.geometry.dispose();
      wire.geometry.dispose();
      surface.geometry = new THREE.SphereGeometry(worldRadius, 48, 32);
      wire.geometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(worldRadius, 24, 16));
    }

    function hideFluxParticle(index) {
      fluxMatrix.position.set(0, 0, 0);
      fluxMatrix.scale.setScalar(0);
      fluxMatrix.updateMatrix();
      fluxCore.setMatrixAt(index, fluxMatrix.matrix);
    }

    function updateFluxParticles(charges, enclosed, dt) {
      if (!charges.length) {
        for (let i = 0; i < fluxCount; i += 1) hideFluxParticle(i);
        fluxCore.instanceMatrix.needsUpdate = true;
        fluxCoreMaterial.opacity = 0;
        return;
      }

      const radius = Math.max(1e-6, Number(lastRadius) || 2.4);
      // Measure peak |E·n| so speed/size stay readable across charge layouts.
      let maxAbs = FLUX_DENSITY_EPS;
      for (let i = 0; i < fluxCount; i += 1) {
        const density = gaussNormalFluxDensity(charges, fluxParticles[i].direction, radius);
        fluxParticles[i].density = density;
        maxAbs = Math.max(maxAbs, Math.abs(density));
      }

      let outwardCount = 0;
      let inwardCount = 0;
      let activeCount = 0;
      const step = Math.max(0, Number(dt) || 0);

      fluxParticles.forEach((particle, index) => {
        const density = particle.density;
        const abs = Math.abs(density);
        // Relative threshold: hide patches that barely contribute to the surface integral.
        if (abs < maxAbs * 0.035 && abs < FLUX_DENSITY_EPS * 8) {
          hideFluxParticle(index);
          return;
        }

        const speed = gaussFluxParticleSpeed(density, {
          base: 0.32,
          gain: 0.55 / maxAbs,
          maxExtra: 1.05,
        }) * particle.jitter;
        particle.t += step * speed;
        if (particle.t >= 1) particle.t -= Math.floor(particle.t);
        if (particle.t < 0) particle.t += 1;

        const radiusNorm = gaussFluxParticleRadiusNorm(density, particle.t, {
          eps: 0,
          rIn: 0.56,
          rOut: 1.48,
        });
        if (radiusNorm == null) {
          hideFluxParticle(index);
          return;
        }

        if (density > 0) outwardCount += 1;
        else inwardCount += 1;
        activeCount += 1;

        fluxPosition.copy(particle.direction).multiplyScalar(radiusNorm * fluxWorldRadius);
        const emphasis = gaussFluxParticleEmphasis(density, radiusNorm, {
          refAbs: maxAbs * 0.65,
          surfaceWidth: 0.065,
        });
        fluxMatrix.position.copy(fluxPosition);
        fluxMatrix.scale.setScalar(emphasis);
        fluxMatrix.updateMatrix();
        fluxCore.setMatrixAt(index, fluxMatrix.matrix);
      });

      fluxCore.instanceMatrix.needsUpdate = true;

      // Color encodes net flux story; bidirectional zero-net cases stay neutral.
      const net = Number(enclosed) || 0;
      if (Math.abs(net) < 1e-4) {
        // Balanced enter/exit (external charge or canceling pair): cyan-lavender.
        fluxCoreMaterial.color.setHex(0xa5b4fc);
        fluxCoreMaterial.opacity = activeCount > 0 ? 0.78 : 0;
      } else if (net > 0) {
        fluxCoreMaterial.color.setHex(0xd8b4fe);
        fluxCoreMaterial.opacity = 0.9;
      } else {
        fluxCoreMaterial.color.setHex(0x7dd3fc);
        fluxCoreMaterial.opacity = 0.9;
      }
      // Slightly dim when few patches are active so empty-looking surfaces stay calm.
      if (activeCount > 0 && activeCount < fluxCount * 0.08) {
        fluxCoreMaterial.opacity *= 0.85;
      }
      // Keep counts available for HUD/debug consumers.
      fluxGroup.userData.fluxStats = { outwardCount, inwardCount, activeCount, maxAbs, net };
    }

    const _gField = new THREE.Vector3();
    const _gDelta = new THREE.Vector3();
    const _gPoint = new THREE.Vector3();

    function rebuildFieldLines(charges) {
      fieldLineObjects.forEach((line) => {
        fieldGroup.remove(line);
        line.geometry?.dispose?.();
        line.material?.dispose?.();
      });
      fieldLineObjects.length = 0;
      if (!charges.length) return;

      const fieldAtInto = (point, out) => {
        out.set(0, 0, 0);
        for (let i = 0; i < charges.length; i += 1) {
          const charge = charges[i];
          const q = Number(charge.q || 0);
          if (Math.abs(q) < 1e-6) continue;
          _gDelta.set(
            point.x - Number(charge.x || 0),
            point.y - Number(charge.y || 0),
            point.z - Number(charge.z || 0),
          );
          const r2 = _gDelta.lengthSq();
          if (r2 < 1e-5) continue;
          // E = kQ r̂/r²（与 electro.js 一致；Q 为 μC 界面读数）
          out.addScaledVector(_gDelta, (9.0e9 * 1e-6 * q) / (r2 * Math.sqrt(r2)));
        }
        return out;
      };
      const nearCharge = (point, minDist) => {
        const minDistSq = minDist * minDist;
        for (let i = 0; i < charges.length; i += 1) {
          const charge = charges[i];
          const dx = point.x - Number(charge.x || 0);
          const dy = point.y - Number(charge.y || 0);
          const dz = point.z - Number(charge.z || 0);
          if (dx * dx + dy * dy + dz * dz < minDistSq) return true;
        }
        return false;
      };
      const fibonacciDirs = (count) => Array.from({ length: count }, (_, i) => {
        const y = 1 - (i / Math.max(count - 1, 1)) * 2;
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        return new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial);
      });
      const integrate = (start, directionSign, maxSteps = 82, step = 0.1) => {
        _gPoint.copy(start);
        const points = [_gPoint.clone()];
        for (let i = 0; i < maxSteps; i += 1) {
          fieldAtInto(_gPoint, _gField);
          const magnitude = _gField.length();
          if (magnitude < 1e-6) break;
          _gPoint.addScaledVector(_gField, directionSign * step / magnitude);
          if (_gPoint.length() > 9.5) break;
          if (nearCharge(_gPoint, 0.22)) break;
          points.push(_gPoint.clone());
        }
        return points;
      };
      let chargeAbs = 0;
      charges.forEach((charge) => { chargeAbs += Math.abs(Number(charge.q || 0)); });
      const lineCount = THREE.MathUtils.clamp(Math.round(28 + 24 * Math.min(chargeAbs, 3)), 12, 96);
      charges.forEach((charge) => {
        if (Math.abs(Number(charge.q || 0)) < 0.05) return;
        const sign = charge.q > 0 ? 1 : -1;
        const share = Math.max(6, Math.round(
          lineCount * Math.min(Math.abs(Number(charge.q)), 2) / Math.max(charges.length, 1),
        ));
        const origin = new THREE.Vector3(charge.x, charge.y, charge.z);
        fibonacciDirs(share).forEach((direction) => {
          const points = integrate(origin.clone().addScaledVector(direction, 0.28), sign);
          if (points.length < 2) return;
          for (let p = 0; p < points.length; p += 1) points[p].multiplyScalar(WORLD_PER_SOURCE_UNIT);
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: sign > 0 ? 0xff6b6b : 0x4dabf7,
              transparent: true,
              opacity: 0.52,
              depthWrite: false,
            }),
          );
          line.frustumCulled = false;
          fieldGroup.add(line);
          fieldLineObjects.push(line);
        });
      });
      pendingFieldRebuild = false;
    }

    root.userData.update = (data, dt = 0) => {
      if (!data) return;
      const radius = Number(data.radius || 2.4);
      if (Math.abs(radius - lastRadius) > 1e-6) {
        rebuildSurface(radius);
        lastRadius = radius;
      }
      const charges = Array.isArray(data.charges) ? data.charges : [];
      chargeSlots.forEach((slot, index) => {
        const charge = charges[index];
        slot.visible = !!charge;
        // Invisible slots still raycast in Three.js — disable them explicitly.
        slot.traverse((child) => {
          if (!child.isMesh) return;
          child.raycast = charge ? THREE.Mesh.prototype.raycast : () => {};
        });
        if (!charge) {
          slot.traverse((child) => {
            if (child.userData) child.userData.chargeId = undefined;
          });
          return;
        }
        const positive = Number(charge.q || 0) >= 0;
        slot.position.set(charge.x, charge.y, charge.z).multiplyScalar(WORLD_PER_SOURCE_UNIT);
        slot.scale.setScalar(0.82 + Math.min(3, Math.abs(charge.q)) * 0.18);
        slot.traverse((child) => {
          if (child.userData) {
            child.userData.role = 'gauss_charge';
            child.userData.interactive = true;
            child.userData.chargeId = charge.id;
          }
        });
        slot.userData.core.material = positive ? positiveMaterial : negativeMaterial;
        slot.userData.glow.material.color.setHex(positive ? 0xff6b6b : 0x4dabf7);
        slot.userData.glow.material.opacity = charge.id === data.selectedId ? 0.34 : 0.15;
      });
      const fieldSignature = charges.map((charge) => (
        `${charge.id}:${charge.q}:${charge.x.toFixed(2)}:${charge.y.toFixed(2)}:${charge.z.toFixed(2)}`
      )).join('|');
      // Charge meshes follow the pointer every frame; field-line integration is
      // expensive (dispose + re-allocate dozens of geometries). Keep the last
      // lines while grabbed, then rebuild once on release via the post-render
      // frame budget so pointerup never freezes the camera.
      const chargeHeld = !!(data.dragArmed || data.dragging);
      const forceField = data._forceDecorations === true;
      const scheduleFieldRebuild = (list, signature) => {
        pendingFieldRebuild = true;
        lastFieldSignature = signature;
        const snap = list.map((c) => ({
          id: c.id,
          q: Number(c.q || 0),
          x: Number(c.x || 0),
          y: Number(c.y || 0),
          z: Number(c.z || 0),
        }));
        const gen = (fieldRebuildGen += 1);
        // soft:false — post-render only; avoid soft-switch sticky frames after drag.
        labFrameScheduler.schedule(GAUSS_FIELD_JOB_ID, () => {
          if (gen !== fieldRebuildGen) return;
          rebuildFieldLines(snap);
        }, { priority: 18, soft: false });
      };
      if (fieldSignature !== lastFieldSignature) {
        if (chargeHeld && !forceField) {
          fieldRebuildGen += 1;
          labFrameScheduler.cancel?.(GAUSS_FIELD_JOB_ID);
          pendingFieldRebuild = true;
        } else if (forceField) {
          fieldRebuildGen += 1;
          labFrameScheduler.cancel?.(GAUSS_FIELD_JOB_ID);
          rebuildFieldLines(charges);
          lastFieldSignature = fieldSignature;
        } else {
          scheduleFieldRebuild(charges, fieldSignature);
        }
      } else if (pendingFieldRebuild && !chargeHeld) {
        scheduleFieldRebuild(charges, fieldSignature);
      }
      surfaceGroup.visible = data.showSurface !== false;
      fieldGroup.visible = data.showLines !== false;
      fluxGroup.visible = data.showFlux !== false;
      const enclosed = Number(data.qEnclosed || 0);
      if (data.showFlux === false) {
        for (let i = 0; i < fluxCount; i += 1) hideFluxParticle(i);
        fluxCore.instanceMatrix.needsUpdate = true;
        fluxCoreMaterial.opacity = 0;
      } else {
        updateFluxParticles(charges, enclosed, dt);
      }
    };
    root.userData.prewarm = (webglRenderer, activeCamera, targetScene) => {
      const wasVisible = root.visible;
      root.visible = true;
      // First Gauss open rebuilds field lines + flux particles; do it under the loader.
      root.userData.update({
        radius: 2.4,
        charges: [{ id: 1, q: 1, x: 0, y: 0, z: 0 }],
        selectedId: 1,
        showSurface: true,
        showLines: true,
        showFlux: true,
        qEnclosed: 1,
        dragArmed: false,
        dragging: false,
        _forceDecorations: true,
      }, 0.016);
      webglRenderer.compile(root, activeCamera, targetScene);
      root.visible = wasVisible;
    };
    return root;
  }

  // —— Hall-effect magnetic-field bench ——
  function makeHallSetup() {
    const g = new THREE.Group();
    // ── Lab materials (matte / metallic, not neon toy glow) ──
    const lab = {
      brass: new THREE.MeshStandardMaterial({
        color: 0xc9a227, metalness: 0.95, roughness: 0.28, emissive: 0x3d3008, emissiveIntensity: 0.1,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x9aa3ad, metalness: 0.9, roughness: 0.28, emissive: 0x111418, emissiveIntensity: 0.05,
      }),
      paper: new THREE.MeshStandardMaterial({
        color: 0xf5f0e6, metalness: 0.02, roughness: 0.85, emissive: 0x222018, emissiveIntensity: 0.04,
      }),
      rubberRed: new THREE.MeshStandardMaterial({
        color: 0x991b1b, metalness: 0.05, roughness: 0.75, emissive: 0x2a0505, emissiveIntensity: 0.08,
      }),
      rubberBlack: new THREE.MeshStandardMaterial({
        color: 0x111111, metalness: 0.08, roughness: 0.72, emissive: 0x050505, emissiveIntensity: 0.06,
      }),
    };

    function bindingPost(x, y, z, colorMat, role, portId, wireColor) {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      const socket = cyl(0.018, 0.018, 0.008, colorMat, 24);
      socket.position.y = 0.004;
      grp.add(socket);
      const body = cyl(0.007, 0.007, 0.018, lab.brass, 16);
      body.position.y = 0.015;
      grp.add(body);
      const nut = cyl(0.012, 0.012, 0.007, lab.brass, 16);
      nut.position.y = 0.025;
      grp.add(nut);
      const socketHole = cyl(0.005, 0.005, 0.004, lab.rubberBlack, 16);
      socketHole.position.y = 0.031;
      grp.add(socketHole);

      const plug = new THREE.Group();
      const plugPin = cyl(0.0045, 0.0045, 0.018, lab.brass, 14);
      plugPin.position.y = 0.038;
      plug.add(plugPin);
      const plugSleeve = cyl(0.009, 0.011, 0.024, colorMat, 18);
      plugSleeve.position.y = 0.053;
      plug.add(plugSleeve);
      plug.visible = false;
      grp.add(plug);

      if (role) {
        grp.userData.interactive = true;
        grp.userData.role = role;
        grp.userData.portId = portId;
        grp.userData.wireColor = wireColor;
        grp.userData.plug = plug;
        // Keep the mouse hit volume close to the visible socket.  AR gets its
        // separate forgiving nearest-port fallback below, so this proxy mus
        // not grow large enough to shadow nearby mouse controls.
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.07, 0.055),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        hit.position.y = 0.03;
        hit.userData.interactive = true;
        hit.userData.role = role;
        hit.userData.portId = portId;
        grp.add(hit);
      }
      return grp;
    }

    // ═══ HCC-2 Hall-effect magnetic-field bench ═══
    // Faithful compact reconstruction of the original Hall project: the long
    // solenoid, Helmholtz pair, transparent guide tube, ruler/probe and the
    // three-readout HCC-2 console remain visible as one complete instrument.
    const hallGroup = new THREE.Group();
    hallGroup.visible = true;

    const deckMat = new THREE.MeshStandardMaterial({ color: 0xd6d8da, metalness: 0.16, roughness: 0.48 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.28, roughness: 0.55 });
    const hallCopper = new THREE.MeshStandardMaterial({
      color: 0xb85b27, metalness: 0.82, roughness: 0.34,
      emissive: 0x321006, emissiveIntensity: 0.08,
    });
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: 0xe8f7ff, transparent: true, opacity: 0.24, transmission: 0.76,
      roughness: 0.08, side: THREE.DoubleSide, depthWrite: false,
    });

    const hallBase = rbox(1.28, 0.08, 0.8, deckMat, 0.014);
    hallBase.position.y = 0.04;
    hallGroup.add(hallBase);

    // Long solenoid across the rear, always present just like the source model.
    // Full turn count N drawn procedurally with fwidth AA (no moiré). Wire
    // bump normals + roughness/metal variation restore copper depth and sheen.
    const hallSolenoid = new THREE.Group();
    hallSolenoid.position.set(0, 0.245, -0.24);
    const solTube = cyl(0.056, 0.056, 1.04, acrylic, 64);
    solTube.rotation.z = Math.PI / 2;
    hallSolenoid.add(solTube);

    const solWindUniforms = {
      uTurns: { value: 100 },
    };

    // Soft studio env so copper metalness has something to reflect (no scene env map)
    function makeSolenoidEnvMap() {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');
      const sky = ctx.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#e8eef8');
      sky.addColorStop(0.42, '#8a96a8');
      sky.addColorStop(0.55, '#3a4250');
      sky.addColorStop(1, '#1a1412');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 512, 256);
      // Key ligh
      ctx.fillStyle = 'rgba(255, 252, 245, 0.55)';
      ctx.beginPath();
      ctx.ellipse(160, 70, 70, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Warm fill (lab bounce)
      ctx.fillStyle = 'rgba(255, 170, 90, 0.4)';
      ctx.beginPath();
      ctx.ellipse(360, 190, 100, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cool rim
      ctx.fillStyle = 'rgba(140, 190, 255, 0.22)';
      ctx.beginPath();
      ctx.ellipse(420, 60, 50, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    }
    const solEnvMap = makeSolenoidEnvMap();

    const solWindMat = new THREE.MeshStandardMaterial({
      color: 0xd4894a,
      metalness: 0.9,
      roughness: 0.28,
      emissive: 0x3a1206,
      emissiveIntensity: 0.1,
      envMap: solEnvMap,
      envMapIntensity: 0.95,
    });
    solWindMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTurns = solWindUniforms.uTurns;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vSolUv;
          varying vec3 vSolAxis;
          varying vec3 vSolCirc;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float axis = uv.y;
            float ang = atan(position.z, position.x);
            vSolUv = vec2(ang * 0.15915494309, axis);
            vec3 oRadial = normalize(vec3(position.x, 0.0, position.z) + vec3(1e-6, 0.0, 0.0));
            vec3 oAxis = vec3(0.0, 1.0, 0.0);
            vec3 oCirc = normalize(cross(oAxis, oRadial));
            vSolAxis = normalize(normalMatrix * oAxis);
            vSolCirc = normalize(normalMatrix * oCirc);
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTurns;
          varying vec2 vSolUv;
          varying vec3 vSolAxis;
          varying vec3 vSolCirc;
          // Shared wind profile for color / normal / roughness (set in color_fragment)
          float solDetail;
          float solRidge;
          float solSin;
          float solCos;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float turns = max(uTurns, 1.0);
            float phase = vSolUv.y * turns + vSolUv.x;
            float fw = max(fwidth(phase), 1e-4);
            float pxPerTurn = 1.0 / fw;
            // Full N when readable; fade only when undersampled (anti-moiré)
            solDetail = smoothstep(1.15, 2.9, pxPerTurn);
            float ang = phase * 6.28318530718;
            solCos = cos(ang);
            solSin = sin(ang);
            // Round enamel-wire cross-section (crest = wire body, trough = groove)
            solRidge = 0.5 + 0.5 * solCos;
            float micro = 0.5 + 0.5 * cos(ang * 2.0);
            float ridge = solRidge * 0.82 + micro * 0.18;
            float tone = mix(0.52, ridge, solDetail);
            // Deep contact shadow between turns
            float ao = mix(1.0, mix(0.42, 1.0, pow(max(solRidge, 0.0), 0.55)), solDetail);
            vec3 darkC = vec3(0.32, 0.12, 0.04);
            vec3 midC  = vec3(0.78, 0.44, 0.17);
            vec3 litC  = vec3(1.0, 0.78, 0.48);
            vec3 wind = mix(darkC, midC, smoothstep(0.1, 0.48, tone));
            wind = mix(wind, litC, smoothstep(0.48, 0.9, tone));
            // Specular copper edge on the wire crown
            wind = mix(wind, vec3(1.0, 0.88, 0.65), 0.18 * pow(solRidge, 2.0) * solDetail);
            diffuseColor.rgb = wind * ao;
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            // Bright metal crowns, softer enamel in the valleys
            float rPeak = 0.14;
            float rValley = 0.55;
            roughnessFactor = mix(0.34, mix(rValley, rPeak, pow(solRidge, 1.35)), solDetail);
          }`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          {
            metalnessFactor = mix(0.78, mix(0.72, 0.96, solRidge), solDetail);
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            // Strong round-wire bump: each turn reads as a tube, not a flat stripe
            float bump = 1.15 * solDetail;
            float axialGain = clamp(uTurns * 0.014, 0.55, 1.85);
            float axial = solSin * bump * axialGain;
            float circ = solSin * bump * 0.38;
            float lift = solCos * bump * 0.55;
            // Slight helical twist on the normal for continuous-wire feel
            float twist = solCos * bump * 0.12;
            vec3 T = normalize(vSolAxis);
            vec3 B = normalize(vSolCirc);
            vec3 N = normalize(normal);
            vec3 nW = normalize(
              N * (1.0 + lift)
              - T * axial
              - B * (circ + twist)
            );
            normal = normalize(mix(N, nW, solDetail));
          }`,
        );
    };
    solWindMat.customProgramCacheKey = () => 'hall-solenoid-wind-aa-v5';

    // Corrugated radial profile gives real geometric depth (still one mesh, full N)
    function makeSolenoidWindGeometry(turns, length = 1.04, radius = 0.063, wireAmp = 0.0032) {
      const n = Math.round(THREE.MathUtils.clamp(turns, 10, 300));
      // ≥2 segs per turn so the sine profile is smooth; AA still handled in shader
      const heightSegs = Math.max(48, n * 2);
      const radialSegs = 64;
      const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegs, heightSegs, true);
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const v = new THREE.Vector3();
      const rad = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // Local Y is axis; map to 0..1 then to phase of N turns
        const t = THREE.MathUtils.clamp(v.y / length + 0.5, 0, 1);
        const ang = Math.atan2(v.z, v.x);
        const phase = t * n + ang / (Math.PI * 2);
        const ridge = Math.cos(phase * Math.PI * 2);
        const r = Math.hypot(v.x, v.z) || radius;
        const r2 = radius + wireAmp * ridge;
        const s = r2 / r;
        v.x *= s;
        v.z *= s;
        pos.setXYZ(i, v.x, v.y, v.z);
        // Approximate normal for round wire (outward + axial tilt)
        rad.set(v.x, 0, v.z).normalize();
        const dPhase = -Math.sin(phase * Math.PI * 2);
        const nrm = rad
          .clone()
          .multiplyScalar(1)
          .addScaledVector(new THREE.Vector3(0, 1, 0), dPhase * wireAmp * n * 0.35)
          .normalize();
        nor.setXYZ(i, nrm.x, nrm.y, nrm.z);
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    }

    let solWindBody = new THREE.Mesh(makeSolenoidWindGeometry(100), solWindMat);
    solWindBody.castShadow = true;
    solWindBody.receiveShadow = true;
    solWindBody.rotation.z = Math.PI / 2;
    hallSolenoid.add(solWindBody);

    let lastHallTurns = -1;
    function setHallSolenoidTurns(turns) {
      const count = Math.round(THREE.MathUtils.clamp(Number(turns || 100), 10, 300));
      if (count === lastHallTurns) return;
      lastHallTurns = count;
      // Full N in both shader and corrugated geometry
      solWindUniforms.uTurns.value = count;
      const prev = solWindBody.geometry;
      solWindBody.geometry = makeSolenoidWindGeometry(count);
      prev.dispose();
    }
    setHallSolenoidTurns(100);

    const solenoidSupportMat = new THREE.MeshStandardMaterial({
      color: 0x20282b,
      metalness: 0.52,
      roughness: 0.38,
    });
    const solenoidEndMat = new THREE.MeshPhysicalMaterial({
      color: 0x9bb8bd,
      transparent: true,
      opacity: 0.58,
      transmission: 0.18,
      metalness: 0.18,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    // Symmetrical end assemblies: a closed face and short collar flow into a
    // rounded cradle, then a slim stem and foot transfer the load to the deck.
    for (const sx of [-1, 1]) {
      const endX = sx * 0.52;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.071, 0.071, 0.03, 48, 1, true),
        solenoidSupportMat,
      );
      collar.rotation.z = Math.PI / 2;
      collar.position.x = endX;
      hallSolenoid.add(collar);

      const endFace = new THREE.Mesh(new THREE.CircleGeometry(0.058, 48), solenoidEndMat);
      endFace.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      endFace.position.x = sx * 0.536;
      hallSolenoid.add(endFace);

      const cradle = new THREE.Mesh(
        new THREE.TorusGeometry(0.063, 0.009, 10, 48),
        solenoidSupportMat,
      );
      cradle.rotation.y = Math.PI / 2;
      cradle.position.x = endX;
      hallSolenoid.add(cradle);

      const stem = rbox(0.042, 0.078, 0.07, solenoidSupportMat, 0.012);
      stem.position.set(endX, -0.112, 0);
      hallSolenoid.add(stem);

      const foot = rbox(0.1, 0.024, 0.15, solenoidSupportMat, 0.012);
      foot.position.set(endX, -0.164, 0);
      hallSolenoid.add(foot);
    }
    hallGroup.add(hallSolenoid);

    // Helmholtz coils: thick multi-layer copper windings and clear flanges.
    const hallHelm = new THREE.Group();
    hallHelm.position.set(-0.04, 0.28, -0.02);
    function makeHallCoil() {
      const cg = new THREE.Group();
      const widthTurns = 20;
      const layerTurns = 12;
      const windings = new THREE.InstancedMesh(
        new THREE.TorusGeometry(1, 0.014, 6, 48), hallCopper, widthTurns * layerTurns,
      );
      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let layer = 0; layer < layerTurns; layer++) {
        const radius = 0.1 + layer * ((0.132 - 0.1) / layerTurns);
        for (let w = 0; w < widthTurns; w++) {
          dummy.position.set(-0.02 + w * (0.04 / widthTurns), 0, 0);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.scale.setScalar(radius);
          dummy.updateMatrix();
          windings.setMatrixAt(idx++, dummy.matrix);
        }
      }
      windings.instanceMatrix.needsUpdate = true;
      cg.add(windings);
      for (const sx of [-1, 1]) {
        const flange = new THREE.Mesh(new THREE.RingGeometry(0.096, 0.152, 64), acrylic);
        flange.rotation.y = Math.PI / 2;
        flange.position.x = sx * 0.024;
        cg.add(flange);
      }
      const drum = cyl(0.096, 0.096, 0.048, acrylic, 64);
      drum.rotation.z = Math.PI / 2;
      cg.add(drum);
      const foot = rbox(0.06, 0.16, 0.085, blackMat, 0.004);
      foot.position.y = -0.19;
      cg.add(foot);
      return cg;
    }
    const hallLeftCoil = makeHallCoil();
    hallLeftCoil.position.x = -0.1;
    const hallRightCoil = makeHallCoil();
    hallRightCoil.position.x = 0.1;
    hallHelm.add(hallLeftCoil, hallRightCoil);
    hallGroup.add(hallHelm);

    // Transparent measuring tube runs through the Helmholtz pair.
    const guideTube = cyl(0.032, 0.032, 1, acrylic, 32);
    guideTube.rotation.z = Math.PI / 2;
    guideTube.position.set(0.04, 0.28, -0.02);
    hallGroup.add(guideTube);

    // Sliding white ruler and red Hall sensor; probe moves between both objects.
    const hallProbe = new THREE.Group();
    hallProbe.position.set(0, 0.28, -0.02);
    const probeRod = rbox(1, 0.016, 0.032, lab.paper, 0.002);
    probeRod.position.x = 0.5;
    hallProbe.add(probeRod);
    const tickGeometry = new THREE.BoxGeometry(0.0012, 0.0015, 0.012);
    const ticks = new THREE.InstancedMesh(tickGeometry, blackMat, 241);
    const tickDummy = new THREE.Object3D();
    for (let i = 0; i < 241; i++) {
      const scaleZ = i % 10 === 0 ? 2.4 : i % 5 === 0 ? 1.7 : 1;
      tickDummy.position.set(i * (0.96 / 240), 0.009, 0);
      tickDummy.scale.set(1, 1, scaleZ);
      tickDummy.updateMatrix();
      ticks.setMatrixAt(i, tickDummy.matrix);
    }
    ticks.instanceMatrix.needsUpdate = true;
    hallProbe.add(ticks);
    const sensorTip = rbox(0.036, 0.028, 0.035, new THREE.MeshStandardMaterial({
      color: 0xd71920, emissive: 0x68070a, emissiveIntensity: 0.42,
    }), 0.003);
    sensorTip.position.x = -0.02;
    hallProbe.add(sensorTip);
    hallGroup.add(hallProbe);

    function makeHallReadout(label, initial) {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 140;
      const cx = canvas.getContext('2d');
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, emissive: 0x5a0000, emissiveIntensity: 0.65, roughness: 0.24 });
      let lastValue = null;
      const paint = (value) => {
        if (value === lastValue) return;
        lastValue = value;
        cx.fillStyle = '#090202'; cx.fillRect(0, 0, 320, 140);
        cx.strokeStyle = '#3f4044'; cx.lineWidth = 8; cx.strokeRect(4, 4, 312, 132);
        cx.fillStyle = '#ff2028'; cx.font = 'bold 64px Consolas, monospace'; cx.textAlign = 'center';
        cx.fillText(value, 160, 78);
        cx.fillStyle = '#72757a'; cx.font = '20px "Microsoft YaHei", sans-serif'; cx.fillText(label, 160, 118);
        texture.needsUpdate = true;
      };
      paint(initial);
      return { material, paint };
    }

    const readoutDefs = [
      makeHallReadout('励磁电流 Im(A)', '0.500'),
      makeHallReadout('霍尔电流 Is(mA)', '5.00'),
      makeHallReadout('霍尔电压 VH(mV)', '0.0'),
    ];
    const hallKnobs = [];
    readoutDefs.forEach((readout, i) => {
      const x = -0.38 + i * 0.38;
      const bezel = rbox(0.29, 0.018, 0.12, blackMat, 0.005);
      bezel.position.set(x, 0.095, 0.2);
      hallGroup.add(bezel);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.1), readout.material);
      face.rotation.x = -Math.PI / 2;
      face.position.set(x, 0.106, 0.2);
      hallGroup.add(face);
      const knob = cyl(0.034, 0.038, 0.022, lab.steel, 22);
      knob.position.set(x, 0.1, 0.32);
      const knobRole = i === 0 ? 'hall_knob_im' : i === 1 ? 'hall_knob_is' : 'hall_knob_zero';
      knob.userData.interactive = true;
      knob.userData.role = knobRole;
      const knobHit = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.08, 0.09),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      knobHit.userData.interactive = true;
      knobHit.userData.role = knobRole;
      knob.add(knobHit);
      const indicator = rbox(0.008, 0.004, 0.032, lab.paper, 0.001);
      indicator.position.set(0, 0.014, 0.017);
      knob.add(indicator);
      hallGroup.add(knob);
      hallKnobs.push(knob);
    });

    // Exactly three terminal pairs. Ports occupy the left column; silk-screen
    // labels occupy a separate right column so neither the supports nor wires
    // can cover the text.
    function makeTerminalLabel(primary, secondary, z, kind) {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#30383d';
      ctx.fillStyle = '#30383d';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (kind !== 'output') {
        ctx.beginPath();
        ctx.moveTo(20, 72);
        ctx.lineTo(64, 72);
        for (let i = 0; i < 8; i++) {
          ctx.lineTo(64 + (i + 1) * 18, 72 + (i % 2 === 0 ? -18 : 18));
        }
        ctx.lineTo(250, 72);
        ctx.stroke();
        ctx.font = 'italic 32px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(kind === 'solenoid' ? 'L' : 'L1 — L2', 135, 42);
      } else {
        ctx.beginPath();
        ctx.moveTo(26, 72);
        ctx.lineTo(250, 72);
        ctx.stroke();
        ctx.font = 'italic 32px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('Im', 138, 42);
      }

      ctx.textAlign = 'left';
      ctx.font = 'bold 39px "Microsoft YaHei", sans-serif';
      ctx.fillText(primary, 286, 76);
      if (secondary) {
        ctx.fillStyle = '#5b6469';
        ctx.font = '28px "Microsoft YaHei", sans-serif';
        ctx.fillText(secondary, 286, 126);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.063),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(-0.37, 0.0815, z);
      hallGroup.add(label);
    }

    makeTerminalLabel('螺线管', '', -0.12, 'solenoid');
    makeTerminalLabel('亥姆霍兹线圈', '共轴线圈', -0.025, 'helmholtz');
    makeTerminalLabel('励磁电流输出', '', 0.07, 'output');

    const hallTerminalPorts = new Map();
    const terminalGroups = [
      {
        key: 'solenoid', role: 'hall_terminal_solenoid',
        sockets: [
          ['sol_black', -0.6, -0.12, lab.rubberBlack, 0x171717],
          ['sol_red', -0.535, -0.12, lab.rubberRed, 0xd72d2d],
        ],
      },
      {
        key: 'helmholtz', role: 'hall_terminal_helmholtz',
        sockets: [
          ['hh_black', -0.6, -0.025, lab.rubberBlack, 0x171717],
          ['hh_red', -0.535, -0.025, lab.rubberRed, 0xd72d2d],
        ],
      },
      {
        key: 'output', role: 'hall_terminal_output',
        sockets: [
          ['out_black', -0.6, 0.07, lab.rubberBlack, 0x171717],
          ['out_red', -0.535, 0.07, lab.rubberRed, 0xd72d2d],
        ],
      },
    ];
    terminalGroups.forEach(({ key, role, sockets }) => {
      sockets.forEach(([portId, x, z, material, wireColor]) => {
        const post = bindingPost(x, 0.084, z, material, role, portId, wireColor);
        post.userData.terminalGroup = key;
        hallGroup.add(post);
        hallTerminalPorts.set(portId, post);
      });
    });

    const hallWireLayer = new THREE.Group();
    hallGroup.add(hallWireLayer);
    const hallWirePreviewGeometry = new THREE.BufferGeometry();
    hallWirePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(32 * 3), 3));
    const hallWirePreviewMaterial = new THREE.LineBasicMaterial({ color: 0xd72d2d, transparent: true, opacity: 0.9 });
    const hallWirePreview = new THREE.Line(hallWirePreviewGeometry, hallWirePreviewMaterial);
    hallWirePreview.visible = false;
    hallWirePreview.frustumCulled = false;
    hallGroup.add(hallWirePreview);
    const hallWireRay = new THREE.Raycaster();
    const hallWirePlane = new THREE.Plane();
    const hallWireWorldPoint = new THREE.Vector3();
    const hallWirePlanePoint = new THREE.Vector3();
    const hallWirePlaneNormal = new THREE.Vector3();
    let hallWireSignature = '';

    const terminalAnchor = (portId) => {
      const post = hallTerminalPorts.get(portId);
      return post ? post.position.clone().add(new THREE.Vector3(0, 0.07, 0)) : null;
    };

    // AR aim is reconstructed from a camera-space fingertip, so it can miss a
    // small mesh even when the rendered pinch cursor appears to touch it.  Use
    // the nearest terminal to the aim ray as a semantic fallback.  This is
    // exposed to both hand and desktop resolvers; callers choose their own
    // tolerance so mouse picking stays tighter than hand tracking when needed.
    const hallTerminalProbeWorld = new THREE.Vector3();
    const getHallTerminalTarget = (raycaster, options = {}) => {
      const ray = raycaster?.ray;
      if (!ray) return null;
      // Hand aiming needs a forgiving target because the reconstructed fingertip
      // is not pixel accurate.  Desktop mouse aiming uses the same semantic
      // fallback, but with a slightly wider radius so the very small sockets can
      // still be grabbed reliably at normal bench distance.
      const maxAimDistance = Number.isFinite(options.maxDistance)
        ? Math.max(0, options.maxDistance)
        : 0.06;
      hallGroup.updateMatrixWorld(true);
      let best = null;
      let bestScore = Infinity;
      hallTerminalPorts.forEach((post, portId) => {
        const localAnchor = terminalAnchor(portId);
        if (!localAnchor) return;
        hallGroup.localToWorld(hallTerminalProbeWorld.copy(localAnchor));
        const toPoint = hallTerminalProbeWorld.clone().sub(ray.origin);
        const along = toPoint.dot(ray.direction);
        if (!(along > 0)) return;
        const distance = ray.distanceToPoint(hallTerminalProbeWorld);
        // About 4–6 cm at the bench depth: forgiving for hand tracking while
        // still separating the two closely spaced terminal columns.
        if (distance > maxAimDistance) return;
        const score = distance + along * 1e-4;
        if (score < bestScore) {
          bestScore = score;
          best = {
            target: post,
            hit: { object: post, distance: along },
          };
        }
      });
      return best;
    };

    const makeCableCurve = (from, to) => {
      const span = from.distanceTo(to);
      const lift = THREE.MathUtils.clamp(0.055 + span * 0.22, 0.07, 0.18);
      const controlA = from.clone().add(new THREE.Vector3(0, lift, 0));
      const controlB = to.clone().add(new THREE.Vector3(0, lift, 0));
      return new THREE.CubicBezierCurve3(from, controlA, controlB, to);
    };

    const setHallWires = (wires = []) => {
      const signature = JSON.stringify(wires);
      if (signature === hallWireSignature) return;
      hallWireSignature = signature;
      while (hallWireLayer.children.length) {
        const wire = hallWireLayer.children.pop();
        wire.geometry?.dispose?.();
        wire.material?.dispose?.();
      }
      hallTerminalPorts.forEach((post) => { post.userData.plug.visible = false; });
      wires.forEach((pair) => {
        const [from, to] = Array.isArray(pair) ? pair : [pair?.from, pair?.to];
        const start = terminalAnchor(from);
        const end = terminalAnchor(to);
        if (!start || !end || from === to) return;
        const sourcePost = hallTerminalPorts.get(from);
        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(makeCableCurve(start, end), 36, 0.006, 8, false),
          new THREE.MeshStandardMaterial({
            color: sourcePost?.userData.wireColor ?? 0xd72d2d,
            roughness: 0.68,
            metalness: 0.02,
          }),
        );
        cable.castShadow = true;
        hallWireLayer.add(cable);
        hallTerminalPorts.get(from).userData.plug.visible = true;
        hallTerminalPorts.get(to).userData.plug.visible = true;
      });
    };

    const startHallWirePreview = (portId) => {
      const post = hallTerminalPorts.get(portId);
      if (!post) return;
      hallWirePreviewMaterial.color.setHex(post.userData.wireColor ?? 0xd72d2d);
      hallWirePreview.visible = true;
    };

    const updateHallWirePreview = (fromPortId, aimSource, hoverPortId = null) => {
      const start = terminalAnchor(fromPortId);
      if (!start || !aimSource) return null;
      let snappedPortId = hoverPortId && hoverPortId !== fromPortId ? hoverPortId : null;
      let end = snappedPortId ? terminalAnchor(snappedPortId) : null;
      if (!end) {
        hallGroup.updateMatrixWorld(true);
        // AR supplies the fingertip ray for every drag frame.  Falling back to
        // the screen-centre camera ray made an unsnapped wire preview bend
        // toward one fixed side, regardless of where the hand moved.
        if (aimSource?.ray) {
          hallWireRay.ray.copy(aimSource.ray);
        } else if (aimSource?.isCamera) {
          hallWireRay.setFromCamera(new THREE.Vector2(0, 0), aimSource);
        }
        hallWirePlanePoint.set(0, 0.1, 0);
        hallGroup.localToWorld(hallWirePlanePoint);
        hallWirePlaneNormal.set(0, 1, 0).transformDirection(hallGroup.matrixWorld);
        hallWirePlane.setFromNormalAndCoplanarPoint(hallWirePlaneNormal, hallWirePlanePoint);
        if (hallWireRay.ray.intersectPlane(hallWirePlane, hallWireWorldPoint)) {
          end = hallWireWorldPoint.clone();
          hallGroup.worldToLocal(end);
        }
      }
      if (!end) end = start.clone();
      if (!snappedPortId) {
        let nearestDistance = 0.072;
        hallTerminalPorts.forEach((post, portId) => {
          if (portId === fromPortId) return;
          const anchor = terminalAnchor(portId);
          const distance = Math.hypot(anchor.x - end.x, anchor.z - end.z);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            snappedPortId = portId;
          }
        });
        if (snappedPortId) end = terminalAnchor(snappedPortId);
      }
      hallTerminalPorts.forEach((post, portId) => {
        post.scale.setScalar(portId === snappedPortId ? 1.18 : 1);
      });
      const curve = makeCableCurve(start, end);
      const attr = hallWirePreviewGeometry.attributes.position;
      for (let i = 0; i < 32; i++) {
        const point = curve.getPoint(i / 31);
        attr.setXYZ(i, point.x, point.y, point.z);
      }
      attr.needsUpdate = true;
      hallWirePreviewGeometry.computeBoundingSphere();
      hallWirePreview.visible = true;
      return snappedPortId;
    };

    const cancelHallWirePreview = () => {
      hallWirePreview.visible = false;
      hallTerminalPorts.forEach((post) => { post.scale.setScalar(1); });
    };
    const titleCanvas = document.createElement('canvas');
    titleCanvas.width = 640; titleCanvas.height = 96;
    const titleCtx = titleCanvas.getContext('2d');
    titleCtx.fillStyle = '#d6d8da'; titleCtx.fillRect(0, 0, 640, 96);
    titleCtx.fillStyle = '#dc2626'; titleCtx.font = 'bold 44px "Microsoft YaHei", sans-serif'; titleCtx.textAlign = 'center';
    titleCtx.fillText('HCC-2型  霍尔效应测磁仪', 320, 62);
    const titleTex = new THREE.CanvasTexture(titleCanvas); titleTex.colorSpace = THREE.SRGBColorSpace;
    const titlePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.072), new THREE.MeshStandardMaterial({ map: titleTex }));
    titlePlate.rotation.x = -Math.PI / 2;
    titlePlate.position.set(0.18, 0.081, 0.07);
    hallGroup.add(titlePlate);

    // Magnetic field-line tracing follows the source Experiment3D implementation:
    // numerically integrate the axial/radial field of circular current loops.
    // Keep one textbook-style meridian slice instead of duplicating it around
    // the axis; this makes the field readable without a 3D starburst of lines.
    const helmholtzFieldLines = new THREE.Group();
    const solenoidFieldLines = new THREE.Group();
    helmholtzFieldLines.visible = false;
    solenoidFieldLines.visible = false;
    hallGroup.add(helmholtzFieldLines, solenoidFieldLines);

    const hallFieldMaterials = new Set();
    const hallFieldFlow = { direction: 1, speed: 0 };
    let hallFieldViewportWidth = window.innerWidth;
    let hallFieldViewportHeight = window.innerHeight;
    let helmholtzFieldSignature = '';
    let solenoidFieldBuilt = false;

    function getLoopField2D(x, radial, centreX, radius) {
      let bx = 0;
      let br = 0;
      const samples = 32;
      const dTheta = (Math.PI * 2) / samples;
      for (let i = 0; i < samples; i++) {
        const cosTheta = Math.cos(i * dTheta);
        const dx = x - centreX;
        const distanceSq = dx * dx + radial * radial + radius * radius
          - 2 * radius * radial * cosTheta;
        const distancePow = Math.pow(Math.max(distanceSq, 1e-7), 1.5);
        bx += ((radius * radius - radius * radial * cosTheta) / distancePow) * dTheta;
        br += ((radius * cosTheta * dx) / distancePow) * dTheta;
      }
      return { bx, br };
    }

    function traceAxisymmetricField(fieldAt, startX, startRadial, bounds, step, maxSteps) {
      const walk = (sign, includeStart) => {
        const points = [];
        let x = startX;
        let radial = startRadial;
        for (let i = 0; i < maxSteps; i++) {
          if (includeStart || i > 0) points.push({ x, radial });
          const { bx, br } = fieldAt(x, radial);
          const magnitude = Math.hypot(bx, br);
          if (!Number.isFinite(magnitude) || magnitude < 1e-8) break;
          x += sign * (bx / magnitude) * step;
          radial += sign * (br / magnitude) * step;
          if (x < bounds.minX || x > bounds.maxX
            || radial < bounds.minRadial || radial > bounds.maxRadial) break;
        }
        return points;
      };
      return [
        ...walk(-1, false).reverse(),
        ...walk(1, true),
      ];
    }

    function clearHallFieldGroup(group) {
      while (group.children.length) {
        const line = group.children.pop();
        if (line.material) hallFieldMaterials.delete(line.material);
        line.geometry?.dispose?.();
        line.material?.dispose?.();
      }
    }

    function addFlowingFieldLine(group, traced, axisY, axisZ, mirror = false) {
      if (traced.length < 6) return;
      const draw = (sign) => {
        const positions = [];
        traced.forEach(({ x, radial }) => {
          const y = axisY + sign * radial;
          if (y >= 0.08) {
            positions.push(x, y, axisZ);
          }
        });
        if (positions.length < 6) return;
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          // Bright cyan reads clearly on the light lab background.
          color: 0x38bdf8,
          transparent: true,
          opacity: 0,
          // Screen-space thickness; wider dashes read as continuous flux tubes.
          linewidth: 5.6,
          worldUnits: false,
          dashed: true,
          dashScale: 1,
          dashSize: 0.2,
          gapSize: 0.028,
          resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
          alphaToCoverage: true,
        });
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.frustumCulled = false;
        line.renderOrder = 10;
        line.raycast = () => {};
        group.add(line);
        hallFieldMaterials.add(material);
      };
      draw(1);
      if (mirror) draw(-1);
    }

    function rebuildHelmholtzFieldLines() {
      const leftCentre = hallHelm.position.x + hallLeftCoil.position.x;
      const rightCentre = hallHelm.position.x + hallRightCoil.position.x;
      const signature = `${leftCentre.toFixed(3)}:${rightCentre.toFixed(3)}`;
      if (signature === helmholtzFieldSignature) return;
      helmholtzFieldSignature = signature;
      clearHallFieldGroup(helmholtzFieldLines);

      const radius = 0.116;
      const fieldAt = (x, radial) => {
        const left = getLoopField2D(x, radial, leftCentre, radius);
        const right = getLoopField2D(x, radial, rightCentre, radius);
        return { bx: left.bx + right.bx, br: left.br + right.br };
      };
      const bounds = { minX: -0.38, maxX: 0.34, minRadial: 0, maxRadial: 0.22 };
      const centreX = (leftCentre + rightCentre) / 2;

      // More radial samples → denser, easier-to-read field tube set.
      [0, 0.025, 0.05, 0.075, 0.1].forEach((radial) => {
        const traced = traceAxisymmetricField(fieldAt, centreX, radial, bounds, 0.006, 420);
        addFlowingFieldLine(helmholtzFieldLines, traced, 0.28, -0.02, radial > 0);
      });

      // Local return loops around each coil (top/bottom mirrors).
      [0.12, 0.15].forEach((radial) => {
        const tracedLeft = traceAxisymmetricField(fieldAt, leftCentre, radial, bounds, 0.006, 300);
        addFlowingFieldLine(helmholtzFieldLines, tracedLeft, 0.28, -0.02, true);

        const tracedRight = traceAxisymmetricField(fieldAt, rightCentre, radial, bounds, 0.006, 300);
        addFlowingFieldLine(helmholtzFieldLines, tracedRight, 0.28, -0.02, true);
      });
    }

    function buildSolenoidFieldLines() {
      if (solenoidFieldBuilt) return;
      solenoidFieldBuilt = true;
      const loopCentres = [];
      for (let x = -0.5; x <= 0.5001; x += 0.04) loopCentres.push(x);
      const fieldAt = (x, radial) => {
        let bx = 0;
        let br = 0;
        loopCentres.forEach((centreX) => {
          const field = getLoopField2D(x, radial, centreX, 0.063);
          bx += field.bx;
          br += field.br;
        });
        return { bx, br };
      };
      // 放宽至左右 -0.66 到 0.66，使两端的发散喇叭口能够充分舒展展开，同时防止超长远场发散
      const bounds = { minX: -0.66, maxX: 0.66, minRadial: 0, maxRadial: 0.20 };
      // Denser on-axis samples: parallel tubes inside, flare at the mouths.
      [0, 0.012, 0.024, 0.036, 0.048, 0.058].forEach((radial) => {
        const traced = traceAxisymmetricField(fieldAt, 0, radial, bounds, 0.006, 440);
        addFlowingFieldLine(solenoidFieldLines, traced, 0.245, -0.24, radial > 0);
      });
    }

    animators.push((time) => {
      // Only animate field dashes while Hall group is the live mode.
      if (!hallGroup.visible) return;
      if (hallFieldViewportWidth !== window.innerWidth
        || hallFieldViewportHeight !== window.innerHeight) {
        hallFieldViewportWidth = window.innerWidth;
        hallFieldViewportHeight = window.innerHeight;
        hallFieldMaterials.forEach((material) => {
          material.resolution.set(hallFieldViewportWidth, hallFieldViewportHeight);
        });
      }
      const offset = -time * hallFieldFlow.speed * hallFieldFlow.direction;
      hallFieldMaterials.forEach((material) => {
        material.dashOffset = offset;
      });
    });

    // Faraday induction apparatus ported from the standalone source.  The
    // controller keeps physical coordinates; this adapter applies only the
    // tabletop visual scale and offset.
    function createFaradayEquipment() {
      const root = new THREE.Group();
      root.name = 'faraday-induction-apparatus';
      root.visible = false;
      root.position.set(0, 0.06, 0.02);
      const S = 0.12;
      const OFFSET_X = -0.48;
      const ROD_LEN = 4;
      const X_END = 0.25;
      const X_MAX = 8;
      const RAIL_Z = ROD_LEN / 2;
      const Y = 0.08;
      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.78, roughness: 0.28 });
      const endMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.72, roughness: 0.34 });
      const copperMat = new THREE.MeshStandardMaterial({
        color: 0xc47a3a, metalness: 0.88, roughness: 0.26, emissive: 0x4a2208, emissiveIntensity: 0.16,
      });
      const fieldGroup = new THREE.Group();
      const circuitGroup = new THREE.Group();
      const currentGroup = new THREE.Group();
      root.add(fieldGroup, circuitGroup, currentGroup);

      const makeRail = (z) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * S, 0.08 * S, (X_MAX - 0.2) * S, 14), railMat);
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(OFFSET_X + (0.2 + (X_MAX - 0.2) / 2) * S, Y * S, z * S);
        mesh.castShadow = true;
        return mesh;
      };
      circuitGroup.add(makeRail(RAIL_Z), makeRail(-RAIL_Z));

      const end = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * S, 0.09 * S, ROD_LEN * S, 14), endMat);
      end.rotation.x = Math.PI / 2;
      end.position.set(OFFSET_X + X_END * S, Y * S, 0);
      circuitGroup.add(end);

      const areaMat = new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
      const areaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, ROD_LEN), areaMat);
      areaMesh.rotation.x = -Math.PI / 2;
      areaMesh.position.y = Y * S + 0.004;
      circuitGroup.add(areaMesh);

      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * S, 0.12 * S, ROD_LEN * S, 20), copperMat);
      rod.rotation.x = Math.PI / 2;
      rod.castShadow = true;
      circuitGroup.add(rod);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.28 * S, ROD_LEN * S + 0.08), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.interactive = true;
      hit.userData.role = 'faraday_rod';
      circuitGroup.add(hit);

      const fieldBounds = { x0: 0, x1: X_MAX + 1, z0: -RAIL_Z - 1, z1: RAIL_Z + 1, y0: -2.8, y1: 2.8 };
      // Single mid-plane. Fixed lattice indices; spacing = continuous f(|B|).
      // Arrows glide toward/away from center — no floor(nx) jumps. Length fixed forever.
      // Whole shaft+head stays ABOVE the rail/area plane so downward (B<0) tips are not buried in the table.
      const FIELD_LEN = 0.95 * S;
      const FIELD_HEAD_LEN = 0.28 * S;
      const FIELD_HEAD_W = 0.16 * S;
      // Vertical center of each arrow (local y). Origin shifts with sign so the body is centered here.
      const FIELD_MID_Y = Y * S + 0.018 + FIELD_LEN * 0.5;
      const FIELD_SPACING_SPARSE = 3.15;
      const FIELD_SPACING_DENSE = 1.12;
      const FIELD_X0 = fieldBounds.x0 + 0.8;
      const FIELD_X1 = fieldBounds.x1 - 0.15;
      const FIELD_Z0 = fieldBounds.z0 + 0.5;
      const FIELD_Z1 = fieldBounds.z1 - 0.15;
      const FIELD_CX = (FIELD_X0 + FIELD_X1) * 0.5;
      const FIELD_CZ = (FIELD_Z0 + FIELD_Z1) * 0.5;
      // Lattice sized so densest spacing exactly fills the draw box.
      const FIELD_NX = Math.max(2, Math.round((FIELD_X1 - FIELD_X0) / FIELD_SPACING_DENSE) + 1);
      const FIELD_NZ = Math.max(2, Math.round((FIELD_Z1 - FIELD_Z0) / FIELD_SPACING_DENSE) + 1);
      const FIELD_HALF_IX = (FIELD_NX - 1) * 0.5;
      const FIELD_HALF_IZ = (FIELD_NZ - 1) * 0.5;
      const FIELD_EDGE_FADE = 0.55;
      const FIELD_POOL = FIELD_NX * FIELD_NZ;
      let fieldShowKey = '';
      let fieldLastB = NaN;
      let fieldLastSign = 0;
      let fieldFrame = null;
      const fieldArrows = [];
      const fieldDir = new THREE.Vector3(0, 1, 0);
      function clearFieldMeshes() {
        while (fieldGroup.children.length) {
          const child = fieldGroup.children.pop();
          child.traverse?.((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
        }
        fieldFrame = null;
        fieldArrows.length = 0;
        fieldShowKey = '';
        fieldLastB = NaN;
        fieldLastSign = 0;
      }
      function ensureFieldAssets(color) {
        if (!fieldFrame) {
          const box = new THREE.BoxGeometry(
            (fieldBounds.x1 - fieldBounds.x0) * S,
            (fieldBounds.y1 - fieldBounds.y0) * S,
            (fieldBounds.z1 - fieldBounds.z0) * S,
          );
          const edges = new THREE.EdgesGeometry(box);
          box.dispose();
          fieldFrame = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.24 }),
          );
          fieldFrame.position.set(
            OFFSET_X + (fieldBounds.x0 + fieldBounds.x1) * S / 2,
            (fieldBounds.y0 + fieldBounds.y1) * S / 2,
            (fieldBounds.z0 + fieldBounds.z1) * S / 2,
          );
          fieldGroup.add(fieldFrame);
        }
        if (fieldArrows.length >= FIELD_POOL) return;
        // Fixed (ix,iz) pool — densest fill; layout only moves roots / fades edges.
        for (let ix = 0; ix < FIELD_NX; ix += 1) {
          for (let iz = 0; iz < FIELD_NZ; iz += 1) {
            if (fieldArrows.length >= FIELD_POOL) break;
            const arrow = new THREE.ArrowHelper(
              fieldDir,
              new THREE.Vector3(0, FIELD_MID_Y - FIELD_LEN * 0.5, 0),
              FIELD_LEN,
              color,
              FIELD_HEAD_LEN,
              FIELD_HEAD_W,
            );
            arrow.userData.ix = ix;
            arrow.userData.iz = iz;
            arrow.line.material.transparent = true;
            arrow.line.material.opacity = 0.7;
            arrow.line.material.depthWrite = false;
            arrow.line.material.depthTest = true;
            arrow.cone.material.transparent = true;
            arrow.cone.material.opacity = 0.88;
            arrow.cone.material.depthWrite = false;
            arrow.cone.material.depthTest = true;
            // Avoid z-fight with the area plane when looking from above.
            arrow.renderOrder = 2;
            arrow.line.renderOrder = 2;
            arrow.cone.renderOrder = 3;
            arrow.visible = false;
            fieldGroup.add(arrow);
            fieldArrows.push(arrow);
          }
        }
      }
      /** Soft mask: 1 inside the box, 0 outside, smooth band at the rim. */
      function fieldEdgeWeight(x, z) {
        const wx = THREE.MathUtils.smoothstep(x, FIELD_X0 - FIELD_EDGE_FADE, FIELD_X0)
          * (1 - THREE.MathUtils.smoothstep(x, FIELD_X1, FIELD_X1 + FIELD_EDGE_FADE));
        const wz = THREE.MathUtils.smoothstep(z, FIELD_Z0 - FIELD_EDGE_FADE, FIELD_Z0)
          * (1 - THREE.MathUtils.smoothstep(z, FIELD_Z1, FIELD_Z1 + FIELD_EDGE_FADE));
        return wx * wz;
      }
      function applyFieldLayout(B) {
        const b = Number(B || 0);
        const absB = Math.abs(b);
        const strength = THREE.MathUtils.clamp(absB / 3, 0, 1);
        const color = b >= 0 ? 0x38bdf8 : 0xea580c;
        const sign = b >= 0 ? 1 : -1;
        // Skip only true no-ops; every distinct B moves spacing continuously.
        if (sign === fieldLastSign && Number.isFinite(fieldLastB) && Math.abs(b - fieldLastB) < 1e-5) {
          return;
        }
        fieldLastB = b;
        fieldLastSign = sign;

        const frameOp = absB < 0.02 ? 0.14 : 0.24;
        if (fieldFrame?.material) {
          fieldFrame.material.color.setHex(color);
          fieldFrame.material.opacity = frameOp;
        }

        if (absB < 0.02) {
          for (let i = 0; i < fieldArrows.length; i += 1) fieldArrows[i].visible = false;
          return;
        }

        // Linear spacing vs |B|: no tier / no floor(count) — lattice breathes continuously.
        const spacing = THREE.MathUtils.lerp(FIELD_SPACING_SPARSE, FIELD_SPACING_DENSE, strength);
        fieldDir.set(0, sign, 0);
        const baseLineOp = THREE.MathUtils.lerp(0.5, 0.86, strength);
        const baseConeOp = THREE.MathUtils.lerp(0.55, 0.9, strength);

        for (let i = 0; i < fieldArrows.length; i += 1) {
          const arrow = fieldArrows[i];
          const ix = arrow.userData.ix;
          const iz = arrow.userData.iz;
          const x = FIELD_CX + (ix - FIELD_HALF_IX) * spacing;
          const z = FIELD_CZ + (iz - FIELD_HALF_IZ) * spacing;
          const edge = fieldEdgeWeight(x, z);
          if (edge <= 0.012) {
            arrow.visible = false;
            continue;
          }
          arrow.visible = true;
          // Origin at the trailing end: for ↓B the root sits higher so the tip stays above the table.
          const originY = FIELD_MID_Y - sign * (FIELD_LEN * 0.5);
          arrow.position.set(OFFSET_X + x * S, originY, z * S);
          arrow.setDirection?.(fieldDir);
          // Length is created fixed — never call setLength.
          arrow.setColor?.(color);
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
      }
      function rebuildField(B, show) {
        if (!show) {
          if (fieldShowKey !== 'off') clearFieldMeshes();
          fieldShowKey = 'off';
          return;
        }
        if (fieldShowKey !== 'on') {
          fieldShowKey = 'on';
          fieldLastB = NaN;
          fieldLastSign = 0;
        }
        ensureFieldAssets(Number(B || 0) >= 0 ? 0x38bdf8 : 0xea580c);
        applyFieldLayout(B);
      }

      // Induced-current flow: directional arrows along the closed circuit.
      // (Spheres were too small / slow / isotropic — hard to see direction.)
      // Fewer arrows → larger spacing along the closed circuit (reads clearer).
      const FLOW_COUNT = 14;
      const FLOW_ARROW_LEN = 0.58 * S;
      const FLOW_HEAD_LEN = 0.24 * S;
      const FLOW_HEAD_W = 0.15 * S;
      const flowArrows = [];
      const progress = [];
      let flowSense = 'none';
      let flowRodX = 4.5;
      const _loopPos = new THREE.Vector3();
      const _loopDir = new THREE.Vector3();
      const _loopPts = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ];
      // Closed loop path slightly above rails/rod so arrows read clearly.
      const loopSample = (u, rodX, outPos, outDir) => {
        const y = (Y + 0.42) * S;
        const z0 = -RAIL_Z * S;
        const z1 = RAIL_Z * S;
        _loopPts[0].set(OFFSET_X + X_END * S, y, z0);
        _loopPts[1].set(OFFSET_X + rodX * S, y, z0);
        _loopPts[2].set(OFFSET_X + rodX * S, y, z1);
        _loopPts[3].set(OFFSET_X + X_END * S, y, z1);
        _loopPts[4].set(OFFSET_X + X_END * S, y, z0);
        let total = 0;
        const segLen = [];
        for (let i = 0; i < 4; i += 1) {
          const len = _loopPts[i].distanceTo(_loopPts[i + 1]);
          segLen.push(len);
          total += len;
        }
        let distance = (((u % 1) + 1) % 1) * Math.max(total, 1e-8);
        for (let i = 0; i < 4; i += 1) {
          const len = Math.max(segLen[i], 1e-8);
          if (distance <= len) {
            const t = distance / len;
            outPos.lerpVectors(_loopPts[i], _loopPts[i + 1], t);
            outDir.subVectors(_loopPts[i + 1], _loopPts[i]).normalize();
            return;
          }
          distance -= len;
        }
        outPos.copy(_loopPts[0]);
        outDir.subVectors(_loopPts[1], _loopPts[0]).normalize();
      };
      // Soft neon path outlining the circuit when current is flowing.
      const pathGeo = new THREE.BufferGeometry();
      pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
      const pathMat = new THREE.LineBasicMaterial({
        color: 0xf472b6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const pathLine = new THREE.LineLoop(pathGeo, pathMat);
      pathLine.renderOrder = 4;
      pathLine.visible = false;
      currentGroup.add(pathLine);
      function updatePathLine(rodX, color, active) {
        pathLine.visible = active;
        if (!active) {
          pathMat.opacity = 0;
          return;
        }
        const y = (Y + 0.38) * S;
        const z0 = -RAIL_Z * S;
        const z1 = RAIL_Z * S;
        const arr = pathGeo.attributes.position.array;
        const corners = [
          [OFFSET_X + X_END * S, y, z0],
          [OFFSET_X + rodX * S, y, z0],
          [OFFSET_X + rodX * S, y, z1],
          [OFFSET_X + X_END * S, y, z1],
        ];
        for (let i = 0; i < 4; i += 1) {
          arr[i * 3] = corners[i][0];
          arr[i * 3 + 1] = corners[i][1];
          arr[i * 3 + 2] = corners[i][2];
        }
        pathGeo.attributes.position.needsUpdate = true;
        pathGeo.computeBoundingSphere?.();
        pathMat.color.setHex(color);
        pathMat.opacity = 0.72;
      }
      function clearFlow() {
        for (let i = flowArrows.length - 1; i >= 0; i -= 1) {
          const arrow = flowArrows[i];
          currentGroup.remove(arrow);
          arrow.line?.geometry?.dispose?.();
          arrow.line?.material?.dispose?.();
          arrow.cone?.geometry?.dispose?.();
          arrow.cone?.material?.dispose?.();
        }
        flowArrows.length = 0;
        progress.length = 0;
        flowSense = 'none';
        pathLine.visible = false;
        pathMat.opacity = 0;
      }
      function buildFlow(sense, rodX) {
        if (sense === flowSense && flowArrows.length) return;
        clearFlow();
        if (sense === 'none') return;
        flowSense = sense;
        flowRodX = rodX;
        const color = sense === 'ccw' ? 0xa78bfa : 0xf472b6;
        const dirSign = sense === 'ccw' ? 1 : -1;
        for (let i = 0; i < FLOW_COUNT; i += 1) {
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            FLOW_ARROW_LEN,
            color,
            FLOW_HEAD_LEN,
            FLOW_HEAD_W,
          );
          if (arrow.line?.material) {
            arrow.line.material.transparent = true;
            arrow.line.material.depthWrite = false;
            arrow.line.material.opacity = 0.9;
          }
          if (arrow.cone?.material) {
            arrow.cone.material.transparent = true;
            arrow.cone.material.depthWrite = false;
            arrow.cone.material.opacity = 1;
          }
          arrow.renderOrder = 6;
          if (arrow.line) arrow.line.renderOrder = 6;
          if (arrow.cone) arrow.cone.renderOrder = 7;
          const u = i / FLOW_COUNT;
          loopSample(u, rodX, _loopPos, _loopDir);
          if (dirSign < 0) _loopDir.negate();
          // ArrowHelper origin is the tail; shift so the body sits on the path.
          arrow.position.copy(_loopPos).addScaledVector(_loopDir, -FLOW_ARROW_LEN * 0.35);
          if (_loopDir.lengthSq() > 1e-12) arrow.setDirection(_loopDir);
          currentGroup.add(arrow);
          flowArrows.push(arrow);
          progress.push(u);
        }
        updatePathLine(rodX, color, true);
      }
      root.userData.update = (data, dt = 0) => {
        const x = THREE.MathUtils.clamp(Number(data?.x ?? 4.5), 1.2, 8);
        rod.position.set(OFFSET_X + x * S, Y * S, 0);
        hit.position.set(OFFSET_X + x * S, Y * S, 0);
        const width = Math.max(x - X_END, 0.01);
        areaMesh.scale.set(width * S, S, 1);
        areaMesh.position.x = OFFSET_X + (X_END + width / 2) * S;
        areaMat.color.setHex(Number(data?.B || 0) >= 0 ? 0x60a5fa : 0xfb923c);
        areaMat.opacity = 0.12 + Math.min(Math.abs(Number(data?.flux || 0)) * 0.012, 0.18);
        rebuildField(Number(data?.B || 0), data?.showField !== false);
        buildFlow(data?.currentSense || 'none', x);
        if (flowArrows.length) {
          const dirSign = flowSense === 'ccw' ? 1 : -1;
          // ~0.55–0.95 rev/s so motion reads immediately while dragging/sliding B.
          const speed = 0.55 * Math.max(0.85, Math.min(1.7, 1 + Math.abs(Number(data?.B || 0)) * 0.08));
          flowRodX = x;
          const color = flowSense === 'ccw' ? 0xa78bfa : 0xf472b6;
          updatePathLine(flowRodX, color, true);
          const step = dirSign * speed * Math.max(0, Number(dt || 0));
          flowArrows.forEach((arrow, i) => {
            progress[i] = ((progress[i] + step) % 1 + 1) % 1;
            loopSample(progress[i], flowRodX, _loopPos, _loopDir);
            // Flow direction: reverse geometric tangent when current is CW.
            if (dirSign < 0) _loopDir.negate();
            arrow.position.copy(_loopPos).addScaledVector(_loopDir, -FLOW_ARROW_LEN * 0.35);
            if (_loopDir.lengthSq() > 1e-12) arrow.setDirection(_loopDir);
            arrow.setColor(color);
            // Opacity wave (avoid setLength every frame — ArrowHelper rebuilds geometry).
            const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(progress[i] * Math.PI * 2 * 3 + i * 0.7));
            if (arrow.line?.material) arrow.line.material.opacity = 0.55 + 0.45 * pulse;
            if (arrow.cone?.material) arrow.cone.material.opacity = 0.7 + 0.3 * pulse;
          });
        }
      };
      root.userData.prewarm = (webglRenderer, activeCamera, targetScene) => {
        const wasVisible = root.visible;
        root.visible = true;
        // Compile both field arrows and current-flow arrows (sense active path).
        root.userData.update({ B: -1, x: 4.5, flux: -17, showField: true, currentSense: 'cw' }, 0.016);
        webglRenderer.compile(root, activeCamera, targetScene);
        root.userData.update({ B: -1, x: 4.5, flux: -17, showField: true, currentSense: 'none' }, 0);
        root.visible = wasVisible;
      };
      root.userData.hit = hit;
      return root;
    }
    const faradayGroup = createFaradayEquipment();
    const inducedEGroup = createInducedElectricFieldEquipment();

    // Physical recognition targets, matching the Faraday identify workflow.
    function addHallRecognitionTarget(host, role, size, outlinePos = [0, 0, 0]) {
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.set(...outlinePos);
      hit.userData.interactive = true;
      hit.userData.role = role;
      host.add(hit);

      const outline = makeSelectOutline(...size);
      outline.position.set(...outlinePos);
      host.add(outline);
      return { outline, hit };
    }
    // Recognition hit volumes (tight enough to avoid whole-bench grabs).
    // Probe covers most of the sliding ruler so it is easy to aim; during
    // sequential identify, completed parts disable raycast and the curren
    // target gets priority so the long ruler does not permanently shadow the solenoid.
    const hallTargets = {
      hall_helmholtz: addHallRecognitionTarget(hallHelm, 'hall_helmholtz', [0.42, 0.3, 0.3], [0.04, 0.02, 0]),
      hall_solenoid: addHallRecognitionTarget(hallSolenoid, 'hall_solenoid', [0.95, 0.24, 0.22], [0, 0.0, 0]),
      // Full usable ruler length (rod visual is ~1 m starting near x=0)
      hall_probe: addHallRecognitionTarget(hallProbe, 'hall_probe', [0.92, 0.07, 0.08], [0.52, 0.02, 0]),
      // Keep this tight: a broad console proxy sits in front of the coils and
      // can otherwise swallow AR recognition rays meant for the other parts.
      hall_console: addHallRecognitionTarget(hallGroup, 'hall_console', [0.72, 0.11, 0.22], [0, 0.06, 0.18]),
    };
    const hallRecognitionRings = {
      hall_helmholtz: hallTargets.hall_helmholtz.outline,
      hall_solenoid: hallTargets.hall_solenoid.outline,
      hall_probe: hallTargets.hall_probe.outline,
      hall_console: hallTargets.hall_console.outline,
    };
    const hallRecognitionHits = {
      hall_helmholtz: hallTargets.hall_helmholtz.hit,
      hall_solenoid: hallTargets.hall_solenoid.hit,
      hall_probe: hallTargets.hall_probe.hit,
      hall_console: hallTargets.hall_console.hit,
    };
    const probeHitMesh = hallTargets.hall_probe.hit;
    const meshRaycast = THREE.Mesh.prototype.raycast;
    function setHallRecognitionMode(role, mode) {
      const ring = hallRecognitionRings[role];
      const hit = hallRecognitionHits[role];
      if (!ring) return;
      // Already-identified parts stop blocking rays so rear apparatus (e.g. solenoid
      // behind Helmholtz) can be selected from the front during sequential identify.
      if (hit) {
        if (mode === 'done') {
          hit.raycast = () => {};
          hit.userData.interactive = false;
        } else {
          hit.raycast = meshRaycast;
          hit.userData.interactive = true;
        }
      }
      if (mode === 'off') {
        ring.visible = false;
        ring.material.opacity = 0;
        return;
      }
      if (mode === 'done') {
        // No permanent outline on completed parts (also avoids visual clutter).
        ring.visible = false;
        ring.material.opacity = 0;
        return;
      }
      ring.visible = true;
      // hover=cyan (aimed correct target), locked=amber (aimed wrong order)
      const colors = {
        done: 0x4ade80,
        current: 0x38bdf8,
        hover: 0x67e8f9,
        locked: 0xfbbf24,
      };
      ring.material.color.setHex(colors[mode] || 0x38bdf8);
      ring.material.opacity = mode === 'locked' ? 0.7 : 1;
      ring.scale.setScalar(mode === 'hover' ? 1.04 : 1.025);
    }
    // The source carrier animation is a second apparatus state on this same
    // electro bench. It never owns the renderer, camera, or page navigation.
    const hallDemoGroup = createHallDemoEquipment({ tabletop: true });
    const gaussGroup = createGaussEquipment();
    const electricFieldGroup = createElectricFieldEquipment();
    g.add(hallGroup, hallDemoGroup, gaussGroup, electricFieldGroup, faradayGroup, inducedEGroup);

    g.userData.hallGroup = hallGroup;
    g.userData.hallDemoGroup = hallDemoGroup;
    g.userData.gaussGroup = gaussGroup;
    g.userData.electricFieldGroup = electricFieldGroup;
    g.userData.faradayGroup = faradayGroup;
    g.userData.inducedEGroup = inducedEGroup;

    /** Skip work when mode is unchanged (experiment re-entry). */
    let electroActiveMode = null;
    let electroModeGen = 0;
    const electroModeGroups = [
      ['hall', hallGroup],
      ['hall-demo', hallDemoGroup],
      ['gauss', gaussGroup],
      ['electric-field', electricFieldGroup],
      ['faraday', faradayGroup],
      ['induced-e', inducedEGroup],
    ];
    // Parent that owns mode groups. Inactive modes are DETACHED (O(1)), never
    // freeze-walked — tree walks were the first-open hitch root cause.
    const electroModeParent = hallGroup?.parent || g;
    /**
     * Attach/detach a mode group. O(1) scene-graph op — no matrix freeze walk.
     * Detached graphs are invisible to updateMatrixWorld and picking.
     */
    function mountElectroMode(group, on) {
      if (!group) return;
      if (on) {
        if (!group.parent) electroModeParent.add(group);
        group.visible = true;
      } else {
        group.visible = false;
        if (group.parent) group.parent.remove(group);
      }
    }
    g.userData.setMode = (mode) => {
      const next = mode || null;
      if (electroActiveMode === next) return;
      electroActiveMode = next;
      electroModeGen += 1;
      // Visibility + mount only — never freeze/unfreeze trees on open.
      for (const [id, group] of electroModeGroups) {
        mountElectroMode(group, next === id);
      }
      electricFieldGroup.userData.setInteractive?.(next === 'electric-field');
      inducedEGroup.userData.setInteractive?.(next === 'induced-e');
      // Raycast stays default Mesh.raycast. Detached groups are not pickable;
      // no O(n) rebind walk on first open.
    };
    // Boot with a clear tabletop; mount a mode only for a selected experiment.
    for (const [, group] of electroModeGroups) {
      mountElectroMode(group, false);
    }
    g.userData.setMode(null);
    g.userData.updateHallDemo = (d, dt) => hallDemoGroup.userData.update?.(d, dt);
    g.userData.updateGauss = (d, dt) => gaussGroup.userData.update?.(d, dt);
    g.userData.updateElectricField = (d, dt) => electricFieldGroup.userData.update?.(d, dt);
    g.userData.updateFaraday = (d, dt) => faradayGroup.userData.update?.(d, dt);
    g.userData.updateInducedElectric = (d, dt) => inducedEGroup.userData.update?.(d, dt);

    g.userData.updateHall = (d) => {
      if (!d) return;
      const targetSolenoid = d.target === 'solenoid';
      if (probeHitMesh) {
        if (targetSolenoid) {
          // 长螺线管模式下放大探头拾取盒的 Y 和 Z，方便在管内被鼠标轻松点中
          probeHitMesh.scale.set(1, 3.8, 2.6);
        } else {
          probeHitMesh.scale.set(1, 1, 1);
        }
      }
      // Both devices remain present; only the probe changes measurement axis.
      hallProbe.position.z = targetSolenoid ? -0.24 : -0.02;
      hallProbe.position.y = targetSolenoid ? 0.245 : 0.28;
      // Source model maps the full −25…25 cm range to ±1.0 world units.
      hallProbe.position.x = THREE.MathUtils.clamp(Number(d.probePos || 0) / 25, -1, 1) * 1.0;
      hallRightCoil.position.x = -0.02
        + THREE.MathUtils.clamp((Number(d.rightCoilPos || 2.5) + 0.5) / 13.5, 0, 1) * 0.34;
      setHallSolenoidTurns(d.turns);
      const energy = d.wiring?.energized
        ? THREE.MathUtils.clamp(Number(d.Im || 0), 0, 1)
        : 0;
      hallCopper.emissiveIntensity = 0.12 + energy * 0.58;
      solWindMat.emissiveIntensity = 0.08 + energy * 0.5;
      const fieldVisible = energy > 0.01;
      if (fieldVisible) {
        if (targetSolenoid) buildSolenoidFieldLines();
        else rebuildHelmholtzFieldLines();
      }
      helmholtzFieldLines.visible = fieldVisible && !targetSolenoid;
      solenoidFieldLines.visible = fieldVisible && targetSolenoid;
      const turnGain = targetSolenoid
        ? THREE.MathUtils.clamp(Number(d.turns || 100) / 100, 0.2, 1.8)
        : 1;
      // Keep a readable floor opacity once the coil is energized so lines
      // never look like faint hairlines against the bright lab backdrop.
      const fieldOpacity = fieldVisible
        ? Math.min(1, 0.55 + energy * 1.15 * turnGain)
        : 0;
      const fieldColor = (d.direction || 1) > 0 ? 0x38bdf8 : 0xf472b6;
      hallFieldFlow.direction = (d.direction || 1) > 0 ? 1 : -1;
      hallFieldFlow.speed = fieldVisible ? 0.2 + energy * 0.32 : 0;
      hallFieldMaterials.forEach((material) => {
        material.opacity = fieldOpacity;
        material.color.setHex(fieldColor);
        material.linewidth = 5.6;
      });
      readoutDefs[0].paint(Number(d.Im || 0).toFixed(3));
      readoutDefs[1].paint(Number(d.Is || 0).toFixed(2));
      readoutDefs[2].paint(Number(d.vh || 0).toFixed(1));
      hallKnobs[0].rotation.y = -Math.PI * 0.75 + Number(d.Im || 0) * Math.PI * 1.5;
      hallKnobs[1].rotation.y = -Math.PI * 0.75 + (Number(d.Is || 0) / 10) * Math.PI * 1.5;
      setHallWires(d.wires || []);
    };
    g.userData.startHallWirePreview = startHallWirePreview;
    g.userData.updateHallWirePreview = updateHallWirePreview;
    g.userData.cancelHallWirePreview = cancelHallWirePreview;
    g.userData.getHallTerminalTarget = getHallTerminalTarget;
    g.userData.setHallPartState = setHallRecognitionMode;
    g.userData.clearHallIdentifyVisuals = () => {
      // After identify: keep probe/coil grab volumes, but disable the console-wide
      // recognition box so it cannot swallow Im/Is/zero knobs and terminals.
      Object.keys(hallRecognitionHits).forEach((role) => {
        const hit = hallRecognitionHits[role];
        if (hit) {
          if (role === 'hall_console') {
            hit.raycast = () => {};
            hit.userData.interactive = false;
          } else {
            hit.raycast = meshRaycast;
            hit.userData.interactive = true;
          }
        }
        setHallRecognitionMode(role, 'off');
      });
    };
    g.userData.prewarmHall = (webglRenderer, activeCamera, targetScene) => {
      const wasVisible = hallGroup.visible;
      hallGroup.visible = true;
      // Energized Helmholtz + solenoid materials / field lines compile under the loader.
      g.userData.updateHall?.({
        target: 'helmholtz',
        Im: 0.6,
        Is: 5,
        probePos: 0,
        rightCoilPos: 2.5,
        turns: 100,
        direction: 1,
        wiring: { energized: true, target: 'helmholtz', direction: 1 },
        wires: [['out_red', 'hh_red'], ['out_black', 'hh_black']],
        vh: 12,
      });
      g.userData.updateHall?.({
        target: 'solenoid',
        Im: 0.6,
        Is: 5,
        probePos: 0,
        rightCoilPos: 2.5,
        turns: 100,
        direction: 1,
        wiring: { energized: true, target: 'solenoid', direction: 1 },
        wires: [['out_red', 'sol_red'], ['out_black', 'sol_black']],
        vh: 8,
      });
      webglRenderer.compile(hallGroup, activeCamera, targetScene);
      // Rest idle visual so the bench is calm when the lab opens.
      g.userData.updateHall?.({
        target: 'helmholtz',
        Im: 0,
        Is: 0,
        probePos: 0,
        rightCoilPos: 2.5,
        turns: 100,
        direction: 1,
        wiring: { energized: false },
        wires: [],
        vh: 0,
      });
      hallGroup.visible = wasVisible;
    };
    g.userData.prewarmHallDemo = (webglRenderer, activeCamera, targetScene) => {
      hallDemoGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
    };
    g.userData.prewarmGauss = (webglRenderer, activeCamera, targetScene) => {
      gaussGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
    };
    g.userData.prewarmElectricField = (webglRenderer, activeCamera, targetScene) => {
      electricFieldGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
    };
    g.userData.prewarmFaraday = (webglRenderer, activeCamera, targetScene) => {
      faradayGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
    };
    g.userData.prewarmInducedElectric = (webglRenderer, activeCamera, targetScene) => {
      inducedEGroup.userData.prewarm?.(webglRenderer, activeCamera, targetScene);
    };

    // helpers for experiment handlers / rail picking
    const _ray = new THREE.Raycaster();
    const _railOrigin = new THREE.Vector3();
    const _railDir = new THREE.Vector3();
    const _railEnd = new THREE.Vector3();
    const _camOrigin = new THREE.Vector3();
    const _camDir = new THREE.Vector3();
    const _w = new THREE.Vector3();
    const _u = new THREE.Vector3();
    const _v = new THREE.Vector3();
    /**
     * Identify selection ring only (outline around equipment — no full-body glow).
     * mode: 'off' | 'hover' | 'done'
     */
    function makeSelectOutline(sx, sy, sz) {
      const box = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(box);
      const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      box.dispose();
      edges.dispose();
      const mat = new LineMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0,
        linewidth: 4,
        worldUnits: false,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        depthTest: true,
        toneMapped: false,
      });
      const outline = new LineSegments2(geometry, mat);
      outline.computeLineDistances();
      outline.visible = false;
      outline.userData.isSelectRing = true;
      outline.raycast = () => {}; // never block picks
      return outline;
    }

    g.userData.interactive = true;
    g.userData.role = 'electro';
    g.userData.getHallProbePos = (cam, target = 'helmholtz') => {
      if (!cam) return null;
      const y = target === 'solenoid' ? 0.245 : 0.28;
      const z = target === 'solenoid' ? -0.24 : -0.02;
      _railOrigin.set(-0.27, y, z);
      _railEnd.set(0.27, y, z);
      hallGroup.localToWorld(_railOrigin);
      hallGroup.localToWorld(_railEnd);
      _railDir.subVectors(_railEnd, _railOrigin);
      _ray.setFromCamera(new THREE.Vector2(0, 0), cam);
      _camOrigin.copy(_ray.ray.origin);
      _camDir.copy(_ray.ray.direction).normalize();
      _u.copy(_railDir);
      _v.copy(_camDir);
      _w.subVectors(_railOrigin, _camOrigin);
      const a = _u.dot(_u);
      const b = _u.dot(_v);
      const c = _v.dot(_v);
      const d0 = _u.dot(_w);
      const e0 = _v.dot(_w);
      const denom = a * c - b * b;
      let s = Math.abs(denom) < 1e-10 ? -d0 / a : (b * e0 - c * d0) / denom;
      s = THREE.MathUtils.clamp(s, 0, 1);
      return -25 + s * 50;
    };

    return g;
  }

  // —— Precision analysis station (balance + display) ——

  const root = new THREE.Group();
  root.name = 'electro-station';
  // Slightly toward table center / back of sitting edge so multi-row desk
  // sliders on z≈3.13 don't sit under the Faraday / Hall apparatus.
  const hallBench = makeHallSetup();
  hallBench.position.set(-4.15, 0.93, 2.42);
  root.add(hallBench);

  hallBench.userData.interactive = true;
  const equipment = {
    getHallProbePos: (cam, target) => hallBench.userData.getHallProbePos?.(cam, target) ?? null,
    setMode: (mode) => hallBench.userData.setMode?.(mode),
    /** Active Station Runtime: clear the tabletop while the station is idle. */
    showcase: () => hallBench.userData.setMode?.(null),
    shutdown: () => hallBench.userData.setMode?.(null),
    suspend: () => hallBench.userData.setMode?.(null),
    resume: () => { /* mode restored by experiment applyVisualDefaults */ },
    updateHall: (data) => hallBench.userData.updateHall?.(data),
    updateHallDemo: (data, dt) => hallBench.userData.updateHallDemo?.(data, dt),
    updateGauss: (data, dt) => hallBench.userData.updateGauss?.(data, dt),
    updateElectricField: (data, dt) => hallBench.userData.updateElectricField?.(data, dt),
    updateFaraday: (data, dt) => hallBench.userData.updateFaraday?.(data, dt),
    updateInducedElectric: (data, dt) => hallBench.userData.updateInducedElectric?.(data, dt),
    startHallWirePreview: (portId) => hallBench.userData.startHallWirePreview?.(portId),
    updateHallWirePreview: (fromPortId, aimSource, hoverPortId) => hallBench.userData.updateHallWirePreview?.(fromPortId, aimSource, hoverPortId),
    cancelHallWirePreview: () => hallBench.userData.cancelHallWirePreview?.(),
    setHallPartState: (part, mode) => hallBench.userData.setHallPartState?.(part, mode),
    clearHallIdentifyVisuals: () => hallBench.userData.clearHallIdentifyVisuals?.(),
    getCamera: () => camera,
    mouseDrag: { holdLMB: false, movementX: 0, movementY: 0, shiftKey: false },
  };
  const prewarm = {
    hall_effect: () => hallBench.userData.prewarmHall?.(renderer, camera, scene),
    hall_carrier_demo: () => hallBench.userData.prewarmHallDemo?.(renderer, camera, scene),
    gauss_theorem: () => hallBench.userData.prewarmGauss?.(renderer, camera, scene),
    electric_field: () => hallBench.userData.prewarmElectricField?.(renderer, camera, scene),
    faraday_induction: () => hallBench.userData.prewarmFaraday?.(renderer, camera, scene),
    induced_electric_field: () => hallBench.userData.prewarmInducedElectric?.(renderer, camera, scene),
  };

  return {
    root,
    equipment,
    animators,
    prewarm,
    refs: { hallBench },
  };
}
