import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { diffractionHalfSpan, diffractionIntensity } from '../../experiments/optics.js';

/** Build and expose all optics-station apparatus. */
export function createStationEquipment(ctx) {
  const { THREE, primitives, shared } = ctx;
  const { rbox, box, cyl, torus } = primitives;

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
      warmGlass: new THREE.MeshPhysicalMaterial({
        color: 0xffe8aa, metalness: 0, roughness: 0.04, transmission: 0.9,
        thickness: 0.45, transparent: true, opacity: 0.55, clearcoat: 1,
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

    // ── Shared optical rail (full bench length ~2.2 m visual) ──
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
    // scale ticks
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

    // ── Prism mode group ──
    const prismGroup = new THREE.Group();
    prismGroup.name = 'prismSetup';

    // White light source + collimator / sli
    const source = new THREE.Group();
    source.position.set(-0.85, 0.22, 0);
    const sourceBody = rbox(0.22, 0.16, 0.16, lab.matteBlack, 0.015);
    source.add(sourceBody);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0xfff2cc, emissive: 0xffcc66, emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.35,
      }),
    );
    lamp.position.set(-0.02, 0.02, 0);
    source.add(lamp);
    const collimator = cyl(0.035, 0.04, 0.1, lab.steel, 16);
    collimator.rotation.z = Math.PI / 2;
    collimator.position.x = 0.14;
    source.add(collimator);
    const slit = rbox(0.01, 0.08, 0.012, lab.brass, 0.002);
    slit.position.x = 0.2;
    source.add(slit);
    source.userData.interactive = true;
    source.userData.role = 'opt_source';
    prismGroup.add(source);

    const sourceLight = new THREE.PointLight(0xffd28a, 0.15, 2.2, 2);
    sourceLight.position.set(-0.75, 0.28, 0);
    prismGroup.add(sourceLight);

    // Incident beam (white)
    const inBeamMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e7, emissive: 0xffe4a3, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.0, depthWrite: false,
    });
    const inBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.72, 8), inBeamMat);
    inBeam.rotation.z = Math.PI / 2;
    inBeam.position.set(-0.35, 0.22, 0);
    prismGroup.add(inBeam);

    // Prism on rotatable stage
    const prismStage = new THREE.Group();
    prismStage.position.set(0.15, 0.1, 0);
    const stageBase = cyl(0.12, 0.12, 0.03, lab.steel, 28);
    stageBase.position.y = 0.0;
    prismStage.add(stageBase);
    const stageDial = cyl(0.1, 0.1, 0.012, lab.brass, 48);
    stageDial.position.y = 0.02;
    prismStage.add(stageDial);
    // degree marks
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const mark = rbox(0.008, 0.004, 0.018, lab.matteBlack, 0.001);
      mark.position.set(Math.cos(a) * 0.088, 0.028, Math.sin(a) * 0.088);
      mark.rotation.y = -a;
      prismStage.add(mark);
    }

    const prismShape = new THREE.Shape();
    prismShape.moveTo(0, 0.1);
    prismShape.lineTo(0.09, -0.06);
    prismShape.lineTo(-0.09, -0.06);
    prismShape.closePath();
    const prismMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(prismShape, {
        depth: 0.12, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2,
      }),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8f4ff, metalness: 0, roughness: 0.02, transmission: 0.94,
        thickness: 1.0, transparent: true, opacity: 0.58, clearcoat: 1, ior: 1.5,
      }),
    );
    prismMesh.position.set(0, 0.1, -0.06);
    prismMesh.userData.interactive = true;
    prismMesh.userData.role = 'opt_prism';
    prismStage.add(prismMesh);
    prismStage.userData.interactive = true;
    prismStage.userData.role = 'opt_prism';
    prismGroup.add(prismStage);

    // Goniometer arm / readou
    const gonio = new THREE.Group();
    gonio.position.set(0.15, 0.05, 0.28);
    const gonioBody = rbox(0.28, 0.08, 0.16, lab.matteBlack, 0.012);
    gonio.add(gonioBody);
    const gonioScreen = rbox(0.16, 0.04, 0.02, new THREE.MeshStandardMaterial({
      color: 0x0a1a12, emissive: 0x22c55e, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.4,
    }), 0.004);
    gonioScreen.position.set(0, 0.02, 0.09);
    gonio.add(gonioScreen);
    // canvas readout on gonio
    const gonioCanvas = document.createElement('canvas');
    gonioCanvas.width = 256;
    gonioCanvas.height = 64;
    const gonioCtx = gonioCanvas.getContext('2d');
    const gonioTex = new THREE.CanvasTexture(gonioCanvas);
    gonioTex.colorSpace = THREE.SRGBColorSpace;
    const gonioReadout = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.038),
      new THREE.MeshBasicMaterial({ map: gonioTex, transparent: true }),
    );
    gonioReadout.position.set(0, 0.02, 0.101);
    gonio.add(gonioReadout);
    gonio.userData.interactive = true;
    gonio.userData.role = 'opt_goniometer';
    prismGroup.add(gonio);

    function paintGonio(deltaDeg, phiDeg) {
      gonioCtx.fillStyle = '#04140c';
      gonioCtx.fillRect(0, 0, 256, 64);
      gonioCtx.fillStyle = '#4ade80';
      gonioCtx.font = 'bold 22px Consolas, monospace';
      gonioCtx.fillText(`δ ${deltaDeg.toFixed(2)}°`, 12, 28);
      gonioCtx.fillStyle = '#86efac';
      gonioCtx.font = '16px Consolas, monospace';
      gonioCtx.fillText(`φ ${phiDeg.toFixed(1)}°`, 12, 52);
      gonioTex.needsUpdate = true;
    }
    paintGonio(38.9, 12);

    // Observation screen for spectrum
    const spectrumScreen = new THREE.Group();
    spectrumScreen.position.set(0.95, 0.24, 0);
    const scrPlate = rbox(0.03, 0.32, 0.42, lab.paper, 0.008);
    spectrumScreen.add(scrPlate);
    const scrStand = cyl(0.015, 0.02, 0.18, lab.steel, 10);
    scrStand.position.set(0, -0.16, 0);
    spectrumScreen.add(scrStand);
    spectrumScreen.userData.interactive = true;
    spectrumScreen.userData.role = 'opt_screen';
    prismGroup.add(spectrumScreen);

    const spectrumGroup = new THREE.Group();
    const spectrumColors = [0xff0044, 0xff6600, 0xffee00, 0x44dd66, 0x2288ff, 0x7722ff];
    const spectrumBars = [];
    spectrumColors.forEach((c, i) => {
      const barMat = new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 0, metalness: 0.05, roughness: 0.45,
        transparent: true, opacity: 0.15,
      });
      const s = rbox(0.012, 0.24, 0.045, barMat, 0.004);
      s.position.set(0.02, 0, -0.12 + i * 0.048);
      spectrumGroup.add(s);
      spectrumBars.push(barMat);
    });
    spectrumScreen.add(spectrumGroup);

    // Dispersed exit beams (fan)
    const exitBeams = new THREE.Group();
    const exitMats = [];
    spectrumColors.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 0.3,
        transparent: true, opacity: 0, depthWrite: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.7, 6), m);
      beam.rotation.z = Math.PI / 2;
      const spread = (i - 2.5) * 0.04;
      beam.position.set(0.55, 0.22, spread);
      beam.rotation.y = -spread * 0.8;
      exitBeams.add(beam);
      exitMats.push(m);
    });
    prismGroup.add(exitBeams);

    g.add(prismGroup);

    // ── Lens mode group ──
    const lensGroup = new THREE.Group();
    lensGroup.name = 'lensSetup';
    lensGroup.visible = false;

    // Object screen with illuminated cross
    const objectMount = new THREE.Group();
    objectMount.position.set(-0.9, 0.22, 0);
    const objBase = cyl(0.05, 0.05, 0.02, lab.matteBlack, 12);
    objBase.position.y = -0.14;
    objectMount.add(objBase);
    const objStand = cyl(0.012, 0.016, 0.16, lab.steel, 10);
    objStand.position.y = -0.06;
    objectMount.add(objStand);
    const objPlate = rbox(0.04, 0.2, 0.2, lab.matteBlack, 0.008);
    objectMount.add(objPlate);
    // glowing cross pattern
    const crossH = rbox(0.01, 0.02, 0.12, new THREE.MeshStandardMaterial({
      color: 0xffe4a0, emissive: 0xffcc55, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3,
    }), 0.002);
    const crossV = rbox(0.01, 0.12, 0.02, new THREE.MeshStandardMaterial({
      color: 0xffe4a0, emissive: 0xffcc55, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3,
    }), 0.002);
    crossH.position.x = 0.025;
    crossV.position.x = 0.025;
    objectMount.add(crossH);
    objectMount.add(crossV);
    const objLamp = new THREE.PointLight(0xffd080, 0.4, 1.5, 2);
    objLamp.position.set(-0.08, 0.05, 0);
    objectMount.add(objLamp);
    objectMount.userData.interactive = true;
    objectMount.userData.role = 'opt_object';
    lensGroup.add(objectMount);

    // Convex lens moun
    const lensMount = new THREE.Group();
    lensMount.position.set(-0.2, 0.22, 0);
    const lensBase = cyl(0.055, 0.055, 0.022, lab.matteBlack, 14);
    lensBase.position.y = -0.14;
    lensMount.add(lensBase);
    const lensStand = cyl(0.012, 0.018, 0.16, lab.steel, 10);
    lensStand.position.y = -0.06;
    lensMount.add(lensStand);
    const lensRing = torus(0.075, 0.01, lab.brass, 12, 32);
    lensRing.rotation.y = Math.PI / 2;
    lensMount.add(lensRing);
    const lensGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 24, 18),
      lab.warmGlass,
    );
    lensGlass.scale.set(0.22, 1, 1);
    lensMount.add(lensGlass);
    lensMount.userData.interactive = true;
    lensMount.userData.role = 'opt_lens';
    lensGroup.add(lensMount);

    // Image screen
    const imageMount = new THREE.Group();
    imageMount.position.set(0.55, 0.22, 0);
    const imgBase = cyl(0.05, 0.05, 0.02, lab.matteBlack, 12);
    imgBase.position.y = -0.14;
    imageMount.add(imgBase);
    const imgStand = cyl(0.012, 0.016, 0.16, lab.steel, 10);
    imgStand.position.y = -0.06;
    imageMount.add(imgStand);
    const imgPlate = rbox(0.025, 0.24, 0.24, lab.paper, 0.006);
    imageMount.add(imgPlate);
    // image of cross (blurred when out of focus)
    const imgCrossMat = new THREE.MeshStandardMaterial({
      color: 0x334155, emissive: 0xfbbf24, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.85, metalness: 0, roughness: 0.6,
    });
    const imgCrossH = rbox(0.008, 0.015, 0.1, imgCrossMat, 0.002);
    const imgCrossV = rbox(0.008, 0.1, 0.015, imgCrossMat, 0.002);
    imgCrossH.position.x = -0.015;
    imgCrossV.position.x = -0.015;
    imageMount.add(imgCrossH);
    imageMount.add(imgCrossV);
    imageMount.userData.interactive = true;
    imageMount.userData.role = 'opt_image';
    imageMount.userData.imgCross = [imgCrossH, imgCrossV];
    imageMount.userData.imgCrossMat = imgCrossMat;
    lensGroup.add(imageMount);

    // Ray guide lines (object → lens → image)
    const rayMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.35, depthWrite: false,
    });
    const ray1 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), rayMat);
    ray1.rotation.z = Math.PI / 2;
    lensGroup.add(ray1);
    const ray2 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), rayMat.clone());
    ray2.rotation.z = Math.PI / 2;
    lensGroup.add(ray2);

    g.add(lensGroup);

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
    function disposeChildren(group) {
      while (group.children.length) {
        const child = group.children.pop();
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      }
    }

    function updateDiffraction(d) {
      const signature = [d.lightOn, d.lambdaNm, d.slitMm, d.pitchMm, d.N, d.distM, d.showBeam, d.showWave].join('|');
      if (signature === diffSignature) return;
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

    function animateDiffraction(t, dt) {
      if (!diffractionGroup.visible) return;
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

    // Recognition targets
    const recognition = {
      opt_source: addRecognitionTarget(source, 'opt_source', [0.28, 0.22, 0.22], [0, 0, 0]),
      opt_prism: addRecognitionTarget(prismStage, 'opt_prism', [0.28, 0.28, 0.28], [0, 0.12, 0]),
      opt_screen: addRecognitionTarget(spectrumScreen, 'opt_screen', [0.1, 0.36, 0.46], [0, 0, 0]),
      opt_goniometer: addRecognitionTarget(gonio, 'opt_goniometer', [0.32, 0.12, 0.2], [0, 0, 0]),
      opt_object: addRecognitionTarget(objectMount, 'opt_object', [0.14, 0.28, 0.26], [0, 0, 0]),
      opt_lens: addRecognitionTarget(lensMount, 'opt_lens', [0.12, 0.28, 0.22], [0, 0, 0]),
      opt_image: addRecognitionTarget(imageMount, 'opt_image', [0.12, 0.32, 0.3], [0, 0, 0]),
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

    /** Map cm on optical bench to local X (object at -0.9 ≈ 0 cm, scale 0.018 m/cm) */
    const CM0 = -0.9;
    const CM_SCALE = 0.018;
    function cmToX(cm) {
      return CM0 + cm * CM_SCALE;
    }

    function setMode(mode) {
      // idle / diffraction 均展示单缝多缝装置
      prismGroup.visible = mode === 'prism';
      lensGroup.visible = mode === 'lens';
      diffractionGroup.visible = mode === 'diffraction' || mode === 'idle';
      if (mode === 'idle') {
        inBeamMat.opacity = 0;
        exitMats.forEach((m) => { m.opacity = 0; });
        spectrumBars.forEach((m) => { m.opacity = 0.12; m.emissiveIntensity = 0; });
        sourceLight.intensity = 0.1;
      }
    }

    function updateOptics(d) {
      if (!d) return;
      if (d.mode === 'diffraction') {
        setMode('diffraction');
        updateDiffraction(d);
        return;
      }
      if (d.mode === 'lens') {
        setMode('lens');
        lensMount.position.x = cmToX(Number(d.lensPos || 45));
        imageMount.position.x = cmToX(Number(d.screenPos || 80));
        objectMount.position.x = cmToX(Number(d.objectPos || 0));

        // rays: object → lens → screen
        const ox = objectMount.position.x;
        const lx = lensMount.position.x;
        const sx = imageMount.position.x;
        const y = 0.22;
        const mid1 = (ox + lx) / 2;
        const len1 = Math.max(0.05, Math.abs(lx - ox));
        ray1.position.set(mid1, y, 0);
        ray1.scale.set(1, len1, 1);
        const mid2 = (lx + sx) / 2;
        const len2 = Math.max(0.05, Math.abs(sx - lx));
        ray2.position.set(mid2, y, 0);
        ray2.scale.set(1, len2, 1);

        const score = Number(d.focusScore || 0);
        const mag = Math.max(0.15, Math.min(2.5, Math.abs(Number(d.magnification || 1))));
        // invert image when real image
        const flip = d.vImage != null && d.u > d.fTrue ? -1 : 1;
        imgCrossH.scale.set(1, 1 + (1 - score) * 2.5, mag);
        imgCrossV.scale.set(1, mag, 1 + (1 - score) * 2.5);
        imgCrossH.position.y = 0;
        imgCrossV.position.y = 0;
        imageMount.scale.y = flip > 0 ? 1 : 1; // keep upright visual, encode invert via color
        imgCrossMat.emissiveIntensity = 0.08 + score * 1.1;
        imgCrossMat.opacity = 0.35 + score * 0.6;
        imgCrossMat.emissive.setHex(score > 0.72 ? 0xfbbf24 : score > 0.4 ? 0x94a3b8 : 0x475569);
        rayMat.opacity = 0.2 + score * 0.35;
        if (ray2.material) ray2.material.opacity = rayMat.opacity;
        objLamp.intensity = 0.35 + score * 0.25;
        return;
      }

      // prism mode
      setMode('prism');
      const lightOn = !!d.lightOn;
      const angleDeg = Number(d.prismAngle || 0);
      prismStage.rotation.y = (angleDeg - 18) * (Math.PI / 180) * 0.6;
      paintGonio(Number(d.delta || 0), angleDeg);

      sourceLight.intensity = lightOn ? 1.1 : 0.08;
      lamp.material.emissiveIntensity = lightOn ? 1.6 : 0.15;
      inBeamMat.opacity = lightOn ? 0.55 : 0;
      inBeamMat.emissiveIntensity = lightOn ? 0.9 : 0.1;

      const spectrumOn = lightOn && !!d.spectrumVisible;
      const nearMin = !!d.atMinimum;
      const spreadGain = 0.7 + Math.min(1.2, Math.abs(angleDeg - 18) * 0.03);
      // shift spectrum laterally with deviation
      const zShift = (Number(d.delta || 40) - 40) * 0.004;
      spectrumGroup.position.z = zShift;
      spectrumBars.forEach((m, i) => {
        m.opacity = spectrumOn ? 0.55 + (nearMin ? 0.35 : 0) : 0.08;
        m.emissiveIntensity = spectrumOn ? (nearMin ? 1.4 : 0.7) : 0.05;
        // emphasize selected color line
        const names = ['red', 'red', 'yellow', 'green', 'blue', 'violet'];
        if (d.colorLine && d.colorLine !== 'white') {
          const active = names[i] === d.colorLine
            || (d.colorLine === 'red' && i <= 1)
            || (d.colorLine === 'violet' && i >= 4);
          m.opacity = spectrumOn ? (active ? 0.95 : 0.12) : 0.05;
          m.emissiveIntensity = spectrumOn && active ? 1.6 : 0.1;
        }
      });
      exitMats.forEach((m, i) => {
        m.opacity = spectrumOn ? 0.35 : 0;
        m.emissiveIntensity = spectrumOn ? 0.8 : 0;
        const beam = exitBeams.children[i];
        if (beam) {
          const spread = (i - 2.5) * 0.045 * spreadGain + zShift * 0.3;
          beam.position.set(0.55, 0.22, spread);
          beam.rotation.y = -spread * 0.9;
        }
      });
    }

    // Default showcase: single/double-slit diffraction bench
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
    g.userData.setPartState = setPartState;
    g.userData.clearIdentifyVisuals = clearIdentifyVisuals;
    g.userData.prismGroup = prismGroup;
    g.userData.lensGroup = lensGroup;
    g.userData.diffractionGroup = diffractionGroup;
    g.userData.animateDiffraction = animateDiffraction;
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

  [
    { o: shared.makeBeaker(0.1, 0.03, 0xaaddff), p: [5.5, 0.93, -2.5] },
    { o: shared.makeBeaker(0.09, 0.028, 0xffe8aa), p: [5.7, 0.93, -2.7] },
  ].forEach(({ o, p }) => {
    o.position.set(...p);
    root.add(o);
  });

  optics.userData.interactive = true;
  const equipment = {
    setMode: (mode) => optics.userData.setMode?.(mode),
    updateOptics: (data) => optics.userData.updateOptics?.(data),
    setPartState: (part, mode) => optics.userData.setPartState?.(part, mode),
    clearIdentifyVisuals: () => optics.userData.clearIdentifyVisuals?.(),
    getCamera: () => ctx.camera,
    mouseDrag: { holdLMB: false, movementX: 0 },
  };

  return {
    root,
    equipment,
    animators: [(t, dt) => optics.userData.animateDiffraction?.(t, dt)],
    prewarm: {},
    refs: { optics },
  };
}
