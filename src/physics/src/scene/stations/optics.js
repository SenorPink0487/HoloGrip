import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { diffractionHalfSpan, diffractionIntensity } from '../../experiments/optics.js';
import {
  createGeometricOpticsRig,
  GEO_HOST_SCALE,
} from '../../guangxue/geometricRig.js';
import {
  isGeometricOpticsExp,
  resolveExperimentConfig,
  getGeometricExperiment,
} from '../../guangxue/catalog.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Optics station: multi-slit diffraction + geometric optics (guangxue) bench. */
export function createStationEquipment(ctx) {
  const { THREE, primitives, shared, renderer } = ctx;
  const { rbox, cyl } = primitives;

  function makeOpticsBench() {
    const g = new THREE.Group();
    const lab = {
      brass: new THREE.MeshStandardMaterial({
        color: 0xc9a227, metalness: 0.92, roughness: 0.32, emissive: 0x3d3008, emissiveIntensity: 0.08,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x8b939e, metalness: 0.88, roughness: 0.3, emissive: 0x101418, emissiveIntensity: 0.05,
      }),
      matteBlack: new THREE.MeshStandardMaterial({
        color: 0x1a1d22, metalness: 0.2, roughness: 0.75, emissive: 0x050505, emissiveIntensity: 0.04,
      }),
      paper: new THREE.MeshStandardMaterial({
        color: 0xf3efe6, metalness: 0.02, roughness: 0.88, emissive: 0x1a1810, emissiveIntensity: 0.04,
      }),
    };

    function makeSelectOutline(sx, sy, sz) {
      const box = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(box);
      const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      box.dispose();
      edges.dispose();
      const lineMat = new LineMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        linewidth: 4,
        worldUnits: false,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        depthTest: true,
        toneMapped: false,
      });
      const outline = new LineSegments2(geometry, lineMat);
      outline.computeLineDistances();
      outline.visible = false;
      outline.userData.isOutline = true;
      return outline;
    }

    function addRecognitionTarget(host, role, size, outlinePos = [0, 0, 0]) {
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

    // ── Shared optical rail ──
    const rail = rbox(2.2, 0.045, 0.18, lab.matteBlack, 0.01);
    rail.position.y = 0.05;
    g.add(rail);
    const railTop = rbox(2.15, 0.012, 0.05, lab.steel, 0.003);
    railTop.position.y = 0.078;
    g.add(railTop);
    for (const z of [-0.095, 0.095]) {
      const side = rbox(2.2, 0.028, 0.018, lab.steel, 0.004);
      side.position.set(0, 0.095, z);
      g.add(side);
    }
    for (let i = 0; i <= 22; i++) {
      const tick = rbox(0.006, 0.01, i % 5 === 0 ? 0.07 : 0.04, lab.brass, 0.001);
      tick.position.set(-1.05 + i * 0.1, 0.09, 0);
      g.add(tick);
    }
    const railHit = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.12, 0.22),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    railHit.position.y = 0.08;
    railHit.userData.interactive = true;
    railHit.userData.role = 'opt_rail';
    g.add(railHit);

    // ── Fraunhofer single/multi-slit mode (ported from danfen source) ──
    const diffractionGroup = new THREE.Group();
    diffractionGroup.name = 'diffractionSetup';
    diffractionGroup.visible = false;

    function spectralColor(nm) {
      let r = 0; let gg = 0; let b = 0;
      if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
      else if (nm < 490) { gg = (nm - 440) / 50; b = 1; }
      else if (nm < 510) { gg = 1; b = -(nm - 510) / 20; }
      else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
      else if (nm < 645) { r = 1; gg = -(nm - 645) / 65; }
      else r = 1;
      let f = 1;
      if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
      if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
      return new THREE.Color(
        THREE.MathUtils.clamp(r * f, 0, 1),
        THREE.MathUtils.clamp(gg * f, 0, 1),
        THREE.MathUtils.clamp(b * f, 0, 1),
      );
    }

    function makeDiffPost(x) {
      const post = new THREE.Group();
      post.position.x = x;
      const base = rbox(0.13, 0.04, 0.15, lab.matteBlack, 0.008);
      base.position.y = 0.12;
      post.add(base);
      const rod = cyl(0.012, 0.015, 0.3, lab.steel, 14);
      rod.position.y = 0.25;
      post.add(rod);
      diffractionGroup.add(post);
      return post;
    }

    const diffSource = makeDiffPost(-0.9);
    const diffLaserBody = cyl(0.04, 0.045, 0.23, lab.matteBlack, 24);
    diffLaserBody.rotation.z = Math.PI / 2;
    diffLaserBody.position.set(0, 0.39, 0);
    diffSource.add(diffLaserBody);
    const diffLaserNose = cyl(0.018, 0.035, 0.06, lab.steel, 18);
    diffLaserNose.rotation.z = Math.PI / 2;
    diffLaserNose.position.set(0.145, 0.39, 0);
    diffSource.add(diffLaserNose);
    const diffEmitterMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
    const diffEmitter = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), diffEmitterMat);
    diffEmitter.position.set(0.18, 0.39, 0);
    diffSource.add(diffEmitter);
    const diffHalo = new THREE.Mesh(
      new THREE.CircleGeometry(0.042, 32),
      new THREE.MeshBasicMaterial({
        color: 0x44ff88,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    diffHalo.rotation.y = Math.PI / 2;
    diffHalo.position.set(0.181, 0.39, 0);
    diffSource.add(diffHalo);
    diffSource.userData.interactive = true;
    diffSource.userData.role = 'diff_source';
    const sourceHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.24),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    sourceHit.position.y = 0.32;
    sourceHit.userData.interactive = true;
    sourceHit.userData.role = 'diff_source';
    diffSource.add(sourceHit);

    const diffSlitMount = makeDiffPost(-0.34);
    const diffSlitFrame = rbox(0.035, 0.34, 0.36, lab.matteBlack, 0.008);
    diffSlitFrame.position.y = 0.39;
    diffSlitMount.add(diffSlitFrame);
    const diffSlitBars = new THREE.Group();
    diffSlitBars.position.y = 0.39;
    diffSlitMount.add(diffSlitBars);
    const diffSlitGlows = new THREE.Group();
    diffSlitGlows.position.set(-0.019, 0.39, 0);
    diffSlitMount.add(diffSlitGlows);
    diffSlitMount.userData.interactive = true;
    diffSlitMount.userData.role = 'diff_slit';
    const slitHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.4, 0.42),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    slitHit.position.y = 0.36;
    slitHit.userData.interactive = true;
    slitHit.userData.role = 'diff_slit';
    diffSlitMount.add(slitHit);

    const diffScreen = makeDiffPost(0.5);
    const diffScreenBack = rbox(0.035, 0.48, 0.62, lab.matteBlack, 0.008);
    diffScreenBack.position.y = 0.39;
    diffScreen.add(diffScreenBack);
    const diffScreenCanvas = document.createElement('canvas');
    diffScreenCanvas.width = 640;
    diffScreenCanvas.height = 240;
    const diffScreenCtx = diffScreenCanvas.getContext('2d');
    const diffScreenTex = new THREE.CanvasTexture(diffScreenCanvas);
    diffScreenTex.colorSpace = THREE.SRGBColorSpace;
    const diffScreenFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.42),
      new THREE.MeshBasicMaterial({ map: diffScreenTex, side: THREE.DoubleSide, toneMapped: false }),
    );
    diffScreenFace.rotation.y = -Math.PI / 2;
    diffScreenFace.position.set(-0.02, 0.39, 0);
    diffScreen.add(diffScreenFace);
    diffScreen.userData.interactive = true;
    diffScreen.userData.role = 'diff_screen';
    const screenHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.55, 0.7),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    screenHit.position.y = 0.35;
    screenHit.userData.interactive = true;
    screenHit.userData.role = 'diff_screen';
    diffScreen.add(screenHit);

    const diffBeamGroup = new THREE.Group();
    diffractionGroup.add(diffBeamGroup);
    const diffWaveGroup = new THREE.Group();
    diffWaveGroup.position.set(diffSlitMount.position.x, 0.392, 0);
    diffractionGroup.add(diffWaveGroup);
    const waveArcPositions = [];
    for (let j = 0; j <= 48; j++) {
      const angle = -0.95 + (1.9 * j) / 48;
      waveArcPositions.push(Math.cos(angle), 0, Math.sin(angle));
    }
    for (let i = 0; i < 5; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(waveArcPositions, 3));
      const wave = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x44ff88,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      wave.frustumCulled = false;
      diffWaveGroup.add(wave);
    }
    const diffLaserLight = new THREE.PointLight(0x44ff88, 0.55, 1.8, 2);
    diffLaserLight.position.set(-0.7, 0.42, 0);
    diffractionGroup.add(diffLaserLight);
    g.add(diffractionGroup);

    let diffSignature = '';
    let diffWavePhase = 0;
    /** Deferred diffraction paint so experiment switch does not stall the click frame. */
    let deferredDiffraction = null;
    function disposeChildren(group) {
      while (group.children.length) {
        const child = group.children.pop();
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      }
    }

    function updateDiffraction(d, opts = {}) {
      if (!d) return;
      const signature = [d.lightOn, d.lambdaNm, d.slitMm, d.pitchMm, d.N, d.distM, d.showBeam, d.showWave].join('|');
      // Already painted (typical after boot prewarm / re-entry) — free switch.
      if (!opts.force && signature === diffSignature) {
        deferredDiffraction = null;
        return;
      }
      if (opts.defer) {
        deferredDiffraction = { ...d };
        return;
      }
      deferredDiffraction = null;
      diffSignature = signature;
      const color = spectralColor(Number(d.lambdaNm || 550));
      const lit = !!d.lightOn;
      diffEmitterMat.color.copy(color);
      diffEmitter.visible = lit;
      diffHalo.material.color.copy(color);
      diffHalo.visible = lit;
      diffLaserLight.color.copy(color);
      diffLaserLight.visible = lit;
      diffWaveGroup.visible = lit && d.showWave !== false;
      diffWaveGroup.children.forEach((wave) => wave.material.color.copy(color));

      const nSlits = Math.max(1, Math.round(Number(d.N || 2)));
      const aV = THREE.MathUtils.clamp(Number(d.slitMm || 0.05) * 0.45, 0.006, 0.08);
      const pitchV = THREE.MathUtils.clamp(Number(d.pitchMm || 0.25) * 0.45, 0.02, 0.12);
      const centers = Array.from({ length: nSlits }, (_, i) => nSlits === 1 ? 0 : (i - (nSlits - 1) / 2) * pitchV);
      const plateHalf = Math.max(0.16, ((nSlits - 1) * pitchV + aV) / 2 + 0.035);
      disposeChildren(diffSlitBars);
      disposeChildren(diffSlitGlows);
      const barMat = lab.matteBlack.clone();
      const segments = [[-plateHalf, centers[0] - aV / 2]];
      for (let i = 0; i < centers.length - 1; i++) segments.push([centers[i] + aV / 2, centers[i + 1] - aV / 2]);
      segments.push([centers[centers.length - 1] + aV / 2, plateHalf]);
      for (const [z0, z1] of segments) {
        if (z1 - z0 < 0.001) continue;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, z1 - z0), barMat);
        bar.position.z = (z0 + z1) / 2;
        diffSlitBars.add(bar);
      }
      for (const z of centers) {
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.max(0.004, aV * 0.85), 0.24),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: lit ? 0.85 : 0,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
          }),
        );
        glow.rotation.y = Math.PI / 2;
        glow.position.z = z;
        diffSlitGlows.add(glow);
      }

      const slitX = diffSlitMount.position.x;
      const screenX = slitX + 0.34 + ((Number(d.distM || 1) - 0.4) / 1.6) * 0.9;
      diffScreen.position.x = screenX;
      disposeChildren(diffBeamGroup);
      if (lit && d.showBeam !== false) {
        const inLen = slitX - (-0.72);
        const inBeam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.008, inLen, 12, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        inBeam.rotation.z = Math.PI / 2;
        inBeam.position.set(-0.72 + inLen / 2, 0.39, 0);
        diffBeamGroup.add(inBeam);
        const halfVisual = 0.28;
        const fanGeo = new THREE.BufferGeometry();
        fanGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          slitX, 0.39, 0,
          screenX - 0.025, 0.39, -halfVisual,
          screenX - 0.025, 0.39, halfVisual,
        ], 3));
        fanGeo.setIndex([0, 1, 2]);
        diffBeamGroup.add(new THREE.Mesh(
          fanGeo,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        ));
      }

      const W = diffScreenCanvas.width;
      const H = diffScreenCanvas.height;
      diffScreenCtx.fillStyle = '#030509';
      diffScreenCtx.fillRect(0, 0, W, H);
      if (lit) {
        const image = diffScreenCtx.createImageData(W, H);
        const pixels = image.data;
        const half = diffractionHalfSpan(d);
        for (let col = 0; col < W; col++) {
          const x = ((col / (W - 1)) * 2 - 1) * half;
          const intensity = diffractionIntensity(x, d);
          const soft = Math.min(1, Math.pow(intensity / (intensity + 0.06), 0.8) * 1.08);
          for (let row = 0; row < H; row++) {
            const v = (row / (H - 1)) * 2 - 1;
            const bright = soft * Math.exp(-v * v * 1.6);
            const idx = (row * W + col) * 4;
            pixels[idx] = 4 + Math.round(color.r * 245 * bright);
            pixels[idx + 1] = 4 + Math.round(color.g * 245 * bright);
            pixels[idx + 2] = 8 + Math.round(color.b * 245 * bright);
            pixels[idx + 3] = 255;
          }
        }
        diffScreenCtx.putImageData(image, 0, 0);
      }
      diffScreenTex.needsUpdate = true;
    }

    function flushDeferredDiffraction() {
      if (!deferredDiffraction) return;
      const pending = deferredDiffraction;
      deferredDiffraction = null;
      updateDiffraction(pending, { force: false });
    }

    function cancelDeferredDiffraction() {
      deferredDiffraction = null;
    }

    function animateDiffraction(t, dt) {
      if (!diffractionGroup.visible) return;
      flushDeferredDiffraction();
      if (diffEmitter.visible) {
        diffEmitter.scale.setScalar(1 + 0.12 * Math.sin(t * 10));
        diffHalo.material.opacity = 0.3 + 0.2 * Math.sin(t * 7);
        diffLaserLight.intensity = 0.5 + 0.18 * Math.sin(t * 7);
      }
      if (!diffWaveGroup.visible) return;
      diffWavePhase = (diffWavePhase + dt * 2.5) % 2.2;
      diffWaveGroup.children.forEach((wave, i) => {
        const p = (diffWavePhase + i * 0.45) % 2.2;
        const radius = 0.04 + p * 0.12;
        wave.scale.set(radius, 1, radius);
        wave.material.opacity = 0.55 * (1 - p / 2.2);
      });
    }


    // Recognition targets (diffraction only)
    const recognition = {
      diff_source: addRecognitionTarget(diffSource, 'diff_source', [0.34, 0.34, 0.24], [0, 0.32, 0]),
      diff_slit: addRecognitionTarget(diffSlitMount, 'diff_slit', [0.16, 0.4, 0.42], [0, 0.36, 0]),
      diff_screen: addRecognitionTarget(diffScreen, 'diff_screen', [0.14, 0.55, 0.7], [0, 0.35, 0]),
      opt_rail: addRecognitionTarget(g, 'opt_rail', [2.2, 0.1, 0.24], [0, 0.08, 0]),
    };
    const recognitionRings = Object.fromEntries(
      Object.entries(recognition).map(([k, v]) => [k, v.outline]),
    );

    function setPartState(role, mode) {
      const ring = recognitionRings[role];
      if (!ring) return;
      if (mode === 'off') {
        ring.visible = false;
        ring.material.opacity = 0;
        return;
      }
      ring.visible = true;
      ring.material.color.setHex(mode === 'done' ? 0x4ade80 : 0xfbbf24);
      ring.material.opacity = mode === 'done' ? 0.95 : 1;
      ring.scale.setScalar(mode === 'done' ? 1.015 : 1.03);
    }

    function clearIdentifyVisuals() {
      Object.keys(recognitionRings).forEach((role) => setPartState(role, 'off'));
    }

    function setMode(mode) {
      const m = mode || 'idle';
      const geo = m === 'geometric' || isGeometricOpticsExp(m);
      // idle and diffraction both show the multi-slit bench; geometric hides it
      diffractionGroup.visible = !geo && (m === 'diffraction' || m === 'idle' || !m);
    }

    function updateOptics(d, opts = {}) {
      if (!d) return;
      if (d.mode === 'geometric' || isGeometricOpticsExp(d.expId)) {
        setMode('geometric');
        return;
      }
      setMode(d.mode === 'idle' ? 'idle' : 'diffraction');
      if (d.mode === 'idle') return;
      updateDiffraction(d, opts);
    }

    // Default showcase
    updateOptics({
      mode: 'diffraction',
      lightOn: true,
      lambdaNm: 550,
      slitMm: 0.05,
      pitchMm: 0.25,
      N: 2,
      distM: 1,
      showBeam: true,
      showWave: true,
    });

    g.userData.setMode = setMode;
    g.userData.updateOptics = updateOptics;
    g.userData.updateDiffraction = updateDiffraction;
    g.userData.flushDeferredDiffraction = flushDeferredDiffraction;
    g.userData.cancelDeferredDiffraction = cancelDeferredDiffraction;
    g.userData.setPartState = setPartState;
    g.userData.clearIdentifyVisuals = clearIdentifyVisuals;
    g.userData.diffractionGroup = diffractionGroup;
    g.userData.animateDiffraction = animateDiffraction;
    g.userData.prewarmDiffraction = (webglRenderer, activeCamera, targetScene) => {
      const wasDiff = diffractionGroup.visible;
      setMode('diffraction');
      // Match multi_slit_diffraction initData / DIFF_PRESETS.double so first open skips repaint.
      updateDiffraction({
        mode: 'diffraction',
        lightOn: true,
        lambdaNm: 550,
        slitMm: 0.05,
        pitchMm: 0.25,
        N: 2,
        distM: 1,
        showBeam: true,
        showWave: true,
      }, { force: true });
      webglRenderer.compile(diffractionGroup, activeCamera, targetScene);
      setMode('idle');
      diffractionGroup.visible = wasDiff;
    };
    g.userData.interactive = true;
    g.userData.role = 'optics';
    return g;
  }

  const root = new THREE.Group();
  root.name = 'optics-station';
  const optics = makeOpticsBench();
  optics.position.set(4.2, 0.93, -2.8);
  optics.rotation.y = 0;
  root.add(optics);

  // RoomEnvironment for MeshPhysical glass/mirror (source uses PMREM RoomEnvironment).
  let geoEnvTex = null;
  try {
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const rt = pmrem.fromScene(room, 0.04);
      geoEnvTex = rt.texture;
      room.dispose?.();
      pmrem.dispose();
    }
  } catch { /* optional */ }

  // Geometric optics (guangxue): optical bench + rays only (no source room floor/wall).
  // Source bench top y≈-1.35; place so scaled top sits on host tabletop y≈0.93.
  const geoRig = createGeometricOpticsRig({
    renderer,
    getEnvironment: () => geoEnvTex,
  });
  const geoScale = GEO_HOST_SCALE;
  geoRig.scale.setScalar(geoScale);
  geoRig.position.set(4.2, 0.93 + 1.35 * geoScale, -2.8);
  geoRig.rotation.y = 0;
  geoRig.visible = false;
  root.add(geoRig);
  const geoApi = geoRig.userData.api;
  geoApi?.applyEnvironment?.(geoEnvTex);
  // Rebuild rays after parenting so matrixWorld includes host scale.
  try { geoApi?.updateRays?.(); } catch { /* ignore */ }

  const decorBeakers = [];
  [
    { o: shared.makeBeaker(0.1, 0.03, 0xaaddff), p: [5.5, 0.93, -2.5] },
    { o: shared.makeBeaker(0.09, 0.028, 0xffe8aa), p: [5.7, 0.93, -2.7] },
  ].forEach(({ o, p }) => {
    o.position.set(...p);
    root.add(o);
    decorBeakers.push(o);
  });

  let activeMode = 'idle';

  /** Visibility-only mode switch — never runs full ray tracing / canvas paint. */
  function setMode(mode) {
    const m = mode || 'idle';
    activeMode = m;
    const geo = m === 'geometric' || isGeometricOpticsExp(m);
    geoRig.visible = geo;
    // Hide host diffraction showcase + decor when geometric island is active
    optics.visible = !geo;
    decorBeakers.forEach((b) => { b.visible = !geo; });
    if (geo) {
      optics.userData.setMode?.('geometric');
    } else {
      optics.userData.setMode?.(m);
    }
  }

  function geoParamsFromData(data) {
    return {
      shape: data.shape,
      angle: data.angle,
      height: data.height,
      rayCount: data.rayCount,
      ior: data.ior,
      dispersion: data.dispersion,
      dispersionStrength: data.dispersionStrength,
      rotate: data.rotate,
      showReflect: data.showReflect,
      mode: data.opticsMode || (data.mode === 'mirror' || data.mode === 'dielectric' ? data.mode : undefined),
    };
  }

  /**
   * @param {object} data
   * @param {{ force?: boolean, defer?: boolean, deferRays?: boolean }} [opts]
   *   defer / deferRays: mesh now, full trace on next animator tick (experiment switch).
   */
  function updateGeometric(data, opts = {}) {
    if (!data || !geoApi) return geoApi?.snapshot?.() || null;
    const deferRays = !!(opts.defer || opts.deferRays);
    return geoApi.applyParams(geoParamsFromData(data), {
      force: !!opts.force,
      deferRays,
    });
  }

  function flushDeferredGeometry() {
    if (!geoRig.visible || !geoApi) return null;
    if (!geoApi.raysPending) return geoApi.snapshot?.() || null;
    return geoApi.flushDeferredRays?.() || null;
  }

  function cancelDeferred() {
    // Drop pending geometric ray rebuild + diffraction canvas paint so a
    // mid-switch exit cannot flush the previous experiment's config later.
    try {
      geoApi?.cancelDeferredRays?.();
    } catch { /* ignore */ }
    optics.userData.cancelDeferredDiffraction?.();
  }

  optics.userData.interactive = true;
  const equipment = {
    setMode,
    updateOptics: (data, opts = {}) => {
      if (data?.mode === 'geometric' || isGeometricOpticsExp(data?.expId)) {
        setMode('geometric');
        return updateGeometric(data, opts);
      }
      setMode(data?.mode === 'idle' ? 'idle' : 'diffraction');
      return optics.userData.updateOptics?.(data, opts);
    },
    updateGeometric,
    flushDeferredGeometry,
    flushDeferredDiffraction: () => optics.userData.flushDeferredDiffraction?.(),
    cancelDeferred,
    snapshotGeometric: () => geoApi?.snapshot?.() || null,
    setPartState: (part, mode) => optics.userData.setPartState?.(part, mode),
    clearIdentifyVisuals: () => optics.userData.clearIdentifyVisuals?.(),
    getCamera: () => ctx.camera,
    mouseDrag: { holdLMB: false, movementX: 0 },
    get activeMode() { return activeMode; },
    geoRig,
  };

  function defaultGeoData(expId) {
    const exp = getGeometricExperiment(expId);
    const cfg = resolveExperimentConfig(expId, exp?.defaultModule) || exp?.config || {};
    const shape = cfg.shape || 'mirror';
    const opticsMode = cfg.mode || (shape.startsWith('mirror') ? 'mirror' : 'dielectric');
    return {
      shape,
      angle: cfg.angle ?? 35,
      height: cfg.height ?? 0,
      rayCount: cfg.rayCount ?? 1,
      ior: cfg.ior ?? 1.52,
      dispersion: !!cfg.dispersion,
      dispersionStrength: cfg.dispersionStrength ?? 0.6,
      rotate: cfg.rotate ?? 0,
      showReflect: cfg.showReflect !== false,
      opticsMode,
      mode: opticsMode,
    };
  }

  const geoPrewarm = Object.fromEntries(
    ['reflection', 'refraction', 'dispersion', 'lens'].map((id) => [id, () => {
      setMode('geometric');
      // Showcase each optical sample once so transmission shaders compile
      const shapes = id === 'reflection'
        ? ['mirror', 'mirror-convex']
        : id === 'lens'
          ? ['sphere', 'cylinder']
          : id === 'dispersion'
            ? ['prism']
            : ['prism', 'block'];
      shapes.forEach((shape) => {
        geoApi?.applyParams?.({
          shape,
          angle: id === 'dispersion' ? 48 : 35,
          rayCount: id === 'dispersion' ? 9 : 3,
          dispersion: id === 'dispersion',
          dispersionStrength: 0.85,
          mode: shape.startsWith('mirror') ? 'mirror' : 'dielectric',
          ior: 1.52,
          force: true,
        });
      });
      // End on this experiment's default config so a matching first open skips the trace.
      geoApi?.applyParams?.(geoParamsFromData(defaultGeoData(id)), { force: true });
      try {
        ctx.renderer?.compile?.(geoRig, ctx.camera, ctx.scene);
      } catch { /* ignore */ }
      // Keep lastSignature: hide via visibility only (do not wipe ray cache state).
      setMode('idle');
    }]),
  );

  return {
    root,
    equipment,
    animators: [
      (t, dt) => {
        if (geoRig.visible) {
          // Flush deferred full ray builds one frame after setMode (秒切).
          flushDeferredGeometry();
          geoApi?.animate?.(t);
        } else {
          optics.userData.animateDiffraction?.(t, dt);
        }
      },
    ],
    prewarm: {
      multi_slit_diffraction: () => optics.userData.prewarmDiffraction?.(
        ctx.renderer,
        ctx.camera,
        ctx.scene,
      ),
      ...geoPrewarm,
    },
    refs: { optics, geoRig },
  };
}
