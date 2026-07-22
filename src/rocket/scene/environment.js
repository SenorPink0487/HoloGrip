import * as THREE from 'three';
import {
  CINEMATIC_HANDOFF_START,
  CINEMATIC_LEO_VISUAL,
  CINEMATIC_PAD_OUT_END,
} from './space.js';
import { createDynamicSky } from './dynamicSky.js';

/**
 * SpaceX Starbase Orbital Launch Site (Boca Chica) — procedural approximation.
 *
 * References (public):
 * - OLIT / "Mechazilla" ~146 m steel tower + chopsticks catch arms
 * - OLM: elevated steel launch table, water-cooled deck / flame path
 * - Pad B style bidirectional flame trench under mount
 * - Shared tank farm: LOX / CH4 / LN2 / water deluge
 * - Coastal scrub + Gulf of Mexico shoreline (Hwy 4 corridor)
 * - Ship QD arm on tower
 *
 * Units: 1 unit = 1 m. OLM deck ~20 m AGL.
 */
export const OLM_DECK_HEIGHT = 20;

/**
 * @param {THREE.Scene} scene
 * @param {{ sunDir?: THREE.Vector3 }} [opts] — shared sun direction from space.js
 */
export function createLaunchPad(scene, opts = {}) {
  const padRoot = new THREE.Group();
  padRoot.name = 'StarbaseOLS';
  scene.add(padRoot);

  // Single sun-dir source: reuse the same Vector3 instance from space.js
  const sharedSunDir =
    opts.sunDir instanceof THREE.Vector3
      ? opts.sunDir
      : new THREE.Vector3(2.4, 1.0, 1.6).normalize();

  const steel = new THREE.MeshStandardMaterial({
    color: 0x8a929c,
    metalness: 0.82,
    roughness: 0.38,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x4a525c,
    metalness: 0.75,
    roughness: 0.45,
  });
  const steelRust = new THREE.MeshStandardMaterial({
    color: 0x6a5a4a,
    metalness: 0.55,
    roughness: 0.62,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x6a6e74,
    metalness: 0.08,
    roughness: 0.9,
  });
  const concreteDark = new THREE.MeshStandardMaterial({
    color: 0x4a4e54,
    metalness: 0.1,
    roughness: 0.88,
  });
  const whiteTank = new THREE.MeshStandardMaterial({
    color: 0xe8eef2,
    metalness: 0.35,
    roughness: 0.45,
  });
  const silverTank = new THREE.MeshStandardMaterial({
    color: 0xc5ccd4,
    metalness: 0.7,
    roughness: 0.32,
  });
  const sand = new THREE.MeshStandardMaterial({
    color: 0xc2b28a,
    metalness: 0.05,
    roughness: 0.95,
    transparent: true,
    opacity: 1,
  });
  const scrub = new THREE.MeshStandardMaterial({
    color: 0x5a6a48,
    metalness: 0.05,
    roughness: 0.92,
    transparent: true,
    opacity: 1,
  });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1a5a7a,
    metalness: 0.35,
    roughness: 0.28,
    transparent: true,
    opacity: 0.92,
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x2a2c30,
    metalness: 0.1,
    roughness: 0.85,
  });

  // -------------------------------------------------------------------------
  // Terrain: Boca Chica coastal flats + Gulf
  // Independent flat site — Earth globe is separate and only fades in after
  // climb (see space.js). Large radius so low-altitude cameras never see
  // the ground rim (paired with lighter fog for aerial depth).
  // -------------------------------------------------------------------------
  const GROUND_R = 14000;
  // The flat launch-site terrain is only a low-altitude establishing set.
  // Dissolve it early and slowly so the disc edge never reads as a hard
  // green card against the thinning sky / emerging Earth limb.
  const TERRAIN_FADE_START_M = 1800;
  const TERRAIN_FADE_END_M = 22_000;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_R, 96), scrub);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  ground.receiveShadow = true;
  ground.name = 'PadGround';
  padRoot.add(ground);

  // Soft outer scrub ring — eases the disc edge into fog / sky
  const outerScrub = new THREE.Mesh(
    // Do not overlap the ground disc: the previous 0.88 inner radius left a
    // coplanar overlap which shimmered at the high-altitude chase near plane.
    new THREE.RingGeometry(GROUND_R * 1.002, GROUND_R * 1.35, 96),
    new THREE.MeshStandardMaterial({
      color: 0x4a5a40,
      metalness: 0.04,
      roughness: 0.96,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  outerScrub.rotation.x = -Math.PI / 2;
  outerScrub.position.y = 0.005;
  outerScrub.receiveShadow = true;
  padRoot.add(outerScrub);

  // Distant haze skirt — pale blue-grey band that sells “km of air”
  const hazeSkirt = new THREE.Mesh(
    new THREE.RingGeometry(GROUND_R * 0.55, GROUND_R * 1.38, 96),
    new THREE.MeshBasicMaterial({
      color: 0x9eb8d4,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: true,
    })
  );
  hazeSkirt.rotation.x = -Math.PI / 2;
  hazeSkirt.position.y = 0.02;
  hazeSkirt.name = 'PadHazeSkirt';
  hazeSkirt.renderOrder = -5;
  padRoot.add(hazeSkirt);

  // Sky Pro-style dynamic sky: Preetham-ish atmosphere + volumetric clouds
  const dynamicSky = createDynamicSky({ sunDir: sharedSunDir, radius: 48000 });
  const skyDome = dynamicSky.mesh;
  const skyDomeMat = dynamicSky.material;
  padRoot.add(skyDome);

  // Sand beach strip toward +Z (Gulf-ish)
  const beach = new THREE.Mesh(
    new THREE.RingGeometry(280, 720, 80, 1, -1.05, 2.1),
    sand
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, 80);
  beach.receiveShadow = true;
  padRoot.add(beach);

  // Gulf water — wide coastal shelf, slightly below deck zero
  const gulf = new THREE.Mesh(new THREE.CircleGeometry(1400, 80), waterMat);
  gulf.rotation.x = -Math.PI / 2;
  gulf.position.set(60, -0.55, 980);
  padRoot.add(gulf);

  // Near-shore shallow water tint
  const shallows = new THREE.Mesh(
    new THREE.RingGeometry(400, 780, 64, 1, -1.0, 2.0),
    new THREE.MeshStandardMaterial({
      color: 0x2a7a8a,
      metalness: 0.25,
      roughness: 0.35,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  shallows.rotation.x = -Math.PI / 2;
  shallows.position.set(40, -0.15, 520);
  padRoot.add(shallows);

  // Local concrete apron under OLS
  const apron = new THREE.Mesh(new THREE.CircleGeometry(85, 48), concrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.06;
  apron.receiveShadow = true;
  padRoot.add(apron);

  // Pad square hardstand
  const hardstand = new THREE.Mesh(new THREE.BoxGeometry(70, 0.4, 70), concreteDark);
  hardstand.position.set(0, 0.25, 0);
  hardstand.receiveShadow = true;
  padRoot.add(hardstand);

  // Hwy 4 style road (parallel, land side −X)
  const road = new THREE.Mesh(new THREE.BoxGeometry(12, 0.15, 500), asphalt);
  road.position.set(-95, 0.12, 40);
  padRoot.add(road);
  // road stripes
  for (let i = -12; i < 14; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.02, 6),
      new THREE.MeshBasicMaterial({ color: 0xd8c860 })
    );
    stripe.position.set(-95, 0.22, i * 18);
    padRoot.add(stripe);
  }

  // Fence line along road
  for (let i = -20; i < 24; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6),
      steelDark
    );
    post.position.set(-88, 1.1, i * 12);
    padRoot.add(post);
  }
  const fenceRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.08, 480),
    steelDark
  );
  fenceRail.position.set(-88, 1.6, 20);
  padRoot.add(fenceRail);

  // -------------------------------------------------------------------------
  // Flame trench (Pad B style — bidirectional east-west)
  // -------------------------------------------------------------------------
  const trenchGroup = new THREE.Group();
  trenchGroup.name = 'FlameTrench';
  // Central pit under OLM
  const pit = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 18), concreteDark);
  pit.position.set(0, -3.5, 0);
  trenchGroup.add(pit);
  // Open trench arms ±X (flame path out both sides)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(55, 6, 16), concreteDark);
    arm.position.set(side * 38, -2.5, 0);
    trenchGroup.add(arm);
    // Trench floor (heat-stained)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(54, 0.3, 14),
      steelRust
    );
    floor.position.set(side * 38, -5.2, 0);
    trenchGroup.add(floor);
    // Side walls
    for (const z of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(54, 5, 1.2),
        concrete
      );
      wall.position.set(side * 38, -2.8, z * 7.5);
      trenchGroup.add(wall);
    }
    // Exit mouth
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 18),
      concreteDark
    );
    lip.position.set(side * 66, -1.2, 0);
    trenchGroup.add(lip);
  }
  // Heat-darkened steel deflector plate under engines
  const deflector = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 10, 1.2, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3a3530,
      metalness: 0.85,
      roughness: 0.4,
      emissive: 0x221808,
      emissiveIntensity: 0.15,
    })
  );
  deflector.position.set(0, -0.4, 0);
  trenchGroup.add(deflector);
  padRoot.add(trenchGroup);

  // -------------------------------------------------------------------------
  // OLM — Orbital Launch Mount (raised steel table + legs)
  // -------------------------------------------------------------------------
  const olm = new THREE.Group();
  olm.name = 'OLM';
  const deckY = OLM_DECK_HEIGHT;

  // Six outer legs + inner structure (simplified OLM stilts)
  const legPositions = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    legPositions.push([Math.cos(a) * 9.5, Math.sin(a) * 9.5]);
  }
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.15, deckY, 10),
      steel
    );
    leg.position.set(lx, deckY / 2, lz);
    leg.castShadow = true;
    olm.add(leg);
    // base shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), steelDark);
    shoe.position.set(lx, 0.4, lz);
    olm.add(shoe);
  }

  // Cross bracing on legs
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    const y = deckY * 0.45;
    const x0 = Math.cos(a0) * 9.5;
    const z0 = Math.sin(a0) * 9.5;
    const x1 = Math.cos(a1) * 9.5;
    const z1 = Math.sin(a1) * 9.5;
    const brace = makeBeam(x0, y, z0, x1, y + 3, z1, 0.25, steelDark);
    olm.add(brace);
  }

  // Main deck ring / table
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(12.5, 13, 2.2, 32),
    steel
  );
  deck.position.y = deckY;
  deck.castShadow = true;
  deck.receiveShadow = true;
  olm.add(deck);

  // Inner open for engines
  const deckTop = new THREE.Mesh(
    new THREE.RingGeometry(7.5, 12.2, 32),
    steelDark
  );
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.y = deckY + 1.15;
  olm.add(deckTop);

  // Hold-down clamp stubs (20-ish around ring)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.9), steelDark);
    clamp.position.set(Math.cos(a) * 8.2, deckY + 1.8, Math.sin(a) * 8.2);
    clamp.lookAt(0, deckY + 1.8, 0);
    olm.add(clamp);
  }

  // QD / propellant plumbing stubs on −X side toward tank farm
  for (let i = 0; i < 4; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 14, 10),
      silverTank
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-14 - i * 0.2, deckY - 2 - i * 0.8, -3 + i * 2);
    olm.add(pipe);
  }

  // Deluge spray rings on deck
  for (let r = 8; r <= 11; r += 1.5) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.12, 6, 40),
      steelDark
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = deckY + 1.25;
    olm.add(ring);
  }

  padRoot.add(olm);

  // -------------------------------------------------------------------------
  // OLIT — Mechazilla tower (~146 m)
  // -------------------------------------------------------------------------
  const tower = createMechazilla(steel, steelDark, silverTank);
  // Tower stands next to OLM — chopsticks reach over pad center
  // Real layout: tower offset ~20–25 m from stack centerline
  tower.position.set(22, 0, 0);
  padRoot.add(tower);

  // -------------------------------------------------------------------------
  // Tank farm (shared LOX / CH4 / LN2 / water) — land side −X / −Z
  // -------------------------------------------------------------------------
  const farm = createTankFarm(whiteTank, silverTank, steel, steelDark, concrete);
  farm.position.set(-55, 0, -35);
  padRoot.add(farm);

  // Water deluge tanks closer to pad
  const waterFarm = createWaterTanks(whiteTank, steelDark, concrete);
  waterFarm.position.set(-40, 0, 35);
  padRoot.add(waterFarm);

  // -------------------------------------------------------------------------
  // GSE: pipe racks, cable trays, small buildings
  // -------------------------------------------------------------------------
  // Pipe rack from farm to OLM
  const pipeRack = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), steelDark);
    post.position.set(-45 + i * 5, 2, -8);
    pipeRack.add(post);
    for (let p = 0; p < 3; p++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 5.2, 8),
        p === 0 ? whiteTank : silverTank
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-42.5 + i * 5, 2.5 + p * 0.7, -8);
      pipeRack.add(pipe);
    }
  }
  padRoot.add(pipeRack);

  // Pad equipment sheds
  for (const [x, z, w, d] of [
    [-30, -55, 12, 8],
    [35, -40, 10, 6],
    [-25, 55, 14, 7],
  ]) {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(w, 4.5, d), steelDark);
    shed.position.set(x, 2.25, z);
    padRoot.add(shed);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6),
      steel
    );
    roof.position.set(x, 4.7, z);
    padRoot.add(roof);
  }

  // Flood light masts (tall pad lights)
  for (const [x, z] of [
    [45, 45],
    [-20, 50],
    [50, -25],
    [-15, -50],
    [40, 10],
  ]) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 28, 8),
      steelDark
    );
    mast.position.set(x, 14, z);
    padRoot.add(mast);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.8, 1.2),
      new THREE.MeshStandardMaterial({
        color: 0xfff0d0,
        emissive: 0xffcc88,
        // Low emissive — site is METERS_TO_VISUAL-scaled; HDR emissives white-out
        emissiveIntensity: 0.12,
      })
    );
    head.position.set(x, 28.2, z);
    padRoot.add(head);
    // Intensity tuned for siteMeters scale (~0.002): full-meter values (40)
    // become ~1/S² too bright and blow stainless + bloom to pure white.
    const spot = new THREE.SpotLight(0xffe8c8, 0.55, 90, Math.PI / 6, 0.55, 1.5);
    spot.position.set(x, 28, z);
    spot.target.position.set(0, deckY + 40, 0);
    padRoot.add(spot);
    padRoot.add(spot.target);
  }

  // Wind sock
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 12, 6),
    steelDark
  );
  sockPole.position.set(55, 6, 30);
  padRoot.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 3.5, 8, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xff6633,
      side: THREE.DoubleSide,
      roughness: 0.7,
    })
  );
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(57.5, 11.5, 30);
  padRoot.add(sock);

  // Sparse scrub bushes across the wider site
  for (let i = 0; i < 90; i++) {
    const bx = (Math.random() - 0.5) * 900;
    const bz = (Math.random() - 0.5) * 900;
    if (Math.hypot(bx, bz) < 90) continue;
    // Keep Gulf side (+Z far) clearer
    if (bz > 350 && Math.random() > 0.25) continue;
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 + Math.random() * 1.8, 6, 5),
      new THREE.MeshStandardMaterial({
        color: 0x4a5a38,
        roughness: 1,
        flatShading: true,
      })
    );
    bush.position.set(bx, 0.8, bz);
    bush.scale.y = 0.55;
    padRoot.add(bush);
  }

  // Small sign near road
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 0.2), steelDark);
  sign.position.set(-88, 3.5, 0);
  padRoot.add(sign);
  const signPole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), steelDark);
  signPole.position.set(-88, 1.5, 0);
  padRoot.add(signPole);

  // Terrain materials that soft-fade with altitude (structures hard-cut with padRoot)
  const fadeMats = [
    { mat: scrub, base: 1, terrain: true },
    { mat: outerScrub.material, base: 0.85, terrain: true },
    { mat: sand, base: 1, terrain: true },
    { mat: waterMat, base: 0.92, terrain: true },
    { mat: shallows.material, base: 0.55, terrain: true },
    { mat: concrete, base: 1 },
    { mat: concreteDark, base: 1 },
  ];
  // Ensure concrete can fade
  concrete.transparent = true;
  concreteDark.transparent = true;

  let lastPadFadeQ = -1;
  let lastPadAtmQ = -1;
  /** Once LEO is reached the whole site is detached — no pad draw / no updates. */
  let padLoaded = true;
  /** Parent group used to re-attach after unload (siteMeters). */
  let padParent = null;

  return {
    padRoot,
    tower,
    skyDome,
    dynamicSky,
    ground,
    olmDeckHeight: deckY,
    isLoaded() {
      return padLoaded;
    },
    /**
     * Detach the entire Starbase set from the scene graph (structures + sky).
     * Call after the rocket is in space so the pad is no longer updated or drawn.
     */
    unload() {
      if (!padLoaded) return;
      padLoaded = false;
      if (padRoot.parent) padParent = padRoot.parent;
      padRoot.visible = false;
      skyDome.visible = false;
      hazeSkirt.visible = false;
      dynamicSky.setOpacity(0);
      padRoot.removeFromParent();
      lastPadFadeQ = -1;
      lastPadAtmQ = -1;
    },
    /**
     * Re-attach the launch site (abort / reset / new launch).
     * @param {THREE.Object3D} [parent] — defaults to last known parent
     */
    reload(parent = padParent) {
      if (padLoaded) {
        padRoot.visible = true;
        return;
      }
      padLoaded = true;
      const host = parent || padParent;
      if (host && padRoot.parent !== host) host.add(padRoot);
      padRoot.visible = true;
      lastPadFadeQ = -1;
      lastPadAtmQ = -1;
      // Restore default pad look at altitude 0
      this.setVisibleByAltitude(0, 0);
    },
    /**
     * Keep pad sky sunDir in sync with space.js (pass shared Vector3 once, or call this).
     */
    setSunDir(dir) {
      if (!dir || !padLoaded) return;
      dynamicSky.setSunDir(dir);
    },
    /**
     * Animate volumetric cloud drift. Call every frame while pad is up.
     * @param {number} t elapsed seconds
     */
    updateSky(t) {
      if (!padLoaded) return;
      dynamicSky.update(t);
    },
    /**
     * Pin the sky shell to the camera so it never parallaxes like a nearby dome.
     * Call every frame while the pad set is visible.
     */
    syncSkyToCamera(camera) {
      if (!padLoaded || !camera || !skyDome.visible) return;
      dynamicSky.syncToCamera(camera, padRoot);
    },
    /**
     * Act I pad set visibility — same cinematic handoff window as space.js
     * earthFade (complement). Whole set crossfades out together (structures +
     * sky dome); no separate “fake thick sky” track.
     */
    setVisibleByAltitude(alt, physicalAltitude = null) {
      if (!padLoaded) return;
      const a = Math.max(0, alt);
      const atmosphereAlt = Math.max(
        0,
        physicalAltitude ?? (a / CINEMATIC_LEO_VISUAL) * 100000
      );
      // Structures linger longest; sky uses a softer, earlier dissolve so the
      // blue→black grade is driven by altitude, not a single opacity cliff.
      const structFade =
        1 -
        THREE.MathUtils.smoothstep(
          a,
          CINEMATIC_HANDOFF_START * 1.4,
          CINEMATIC_PAD_OUT_END
        );
      // Sky dissolves with climb; shader altitude does the blue→black grade.
      const skyFade =
        1 -
        THREE.MathUtils.smoothstep(
          atmosphereAlt,
          CINEMATIC_HANDOFF_START * 0.6,
          CINEMATIC_PAD_OUT_END * 0.92
        );
      const fade = Math.max(structFade, skyFade * 0.35);

      const fadeQ = Math.round(structFade * 200 + skyFade * 80);
      const atmQ = Math.round(atmosphereAlt / 200);
      if (fadeQ === lastPadFadeQ && atmQ === lastPadAtmQ) return;
      lastPadFadeQ = fadeQ;
      lastPadAtmQ = atmQ;

      const showPad = fade > 0.008;
      if (padRoot.visible !== showPad) padRoot.visible = showPad;
      if (!showPad) {
        dynamicSky.setOpacity(0);
        skyDome.visible = false;
        hazeSkirt.visible = false;
        return;
      }

      // Restore children if a previous frame hid them
      for (const child of padRoot.children) {
        if (!child.visible) child.visible = true;
      }

      const wantDepth = structFade > 0.82;
      // Terrain has a separate, earlier fade.  This keeps the actual launch
      // hardware readable while replacing the flat-site horizon with the
      // atmospheric dome before the disc edge becomes visible.
      const terrainFade =
        1 -
        THREE.MathUtils.smoothstep(
          atmosphereAlt,
          TERRAIN_FADE_START_M,
          TERRAIN_FADE_END_M
        );
      for (const { mat, base, terrain } of fadeMats) {
        const alpha = base * structFade * (terrain ? terrainFade : 1);
        mat.opacity = alpha;
        const depth = wantDepth && (!terrain || terrainFade > 0.72);
        if (mat.depthWrite !== depth) mat.depthWrite = depth;
      }
      // Drive Rayleigh thinning with real altitude — keep opacity high on pad
      dynamicSky.setAltitude(atmosphereAlt);
      dynamicSky.setOpacity(Math.max(skyFade, structFade * 0.55));
      if (!skyDome.visible) skyDome.visible = true;
      hazeSkirt.visible = structFade > 0.04 && terrainFade > 0.05;
      hazeSkirt.material.opacity =
        0.2 *
        structFade *
        terrainFade *
        Math.exp(-atmosphereAlt / 22_000);
      // Never depth-write the infinite shell (would punch holes in distant stacks)
      if (skyDomeMat.depthWrite) skyDomeMat.depthWrite = false;
    },
  };
}

function makeBeam(x0, y0, z0, x1, y1, z1, thickness, mat) {
  const start = new THREE.Vector3(x0, y0, z0);
  const end = new THREE.Vector3(x1, y1, z1);
  const dir = end.clone().sub(start);
  const len = dir.length();
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, thickness, len),
    mat
  );
  mesh.position.copy(mid);
  mesh.lookAt(end);
  mesh.rotateX(Math.PI / 2);
  return mesh;
}

/** Mechazilla / OLIT ~146 m with chopsticks + Ship QD */
function createMechazilla(steel, steelDark, silver) {
  const g = new THREE.Group();
  g.name = 'Mechazilla';
  const H = 146;

  // Twin vertical columns (lattice simplified as thick boxes + X braces)
  const colSep = 8;
  for (const z of [-colSep / 2, colSep / 2]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(3.2, H, 3.2), steel);
    col.position.set(0, H / 2, z);
    col.castShadow = true;
    g.add(col);
    // outer rail faces
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 4.2), steelDark);
    face.position.set(-1.6, H / 2, z);
    g.add(face);
  }

  // Horizontal platforms / floors every ~12 m
  for (let y = 12; y < H; y += 12) {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.6, colSep + 4),
      steelDark
    );
    platform.position.set(0, y, 0);
    g.add(platform);
    // X-brace
    const b1 = makeBeam(-1, y - 5, -colSep / 2, -1, y + 5, colSep / 2, 0.35, steelDark);
    const b2 = makeBeam(-1, y - 5, colSep / 2, -1, y + 5, -colSep / 2, 0.35, steelDark);
    g.add(b1, b2);
  }

  // Elevator / carriage rails on pad-facing side (−X toward stack is −local X if tower at +X)
  // Tower sits at +X; pad center is −X from tower local
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, H * 0.95, 0.5), steelDark);
  rail.position.set(-2.2, H / 2, 0);
  g.add(rail);

  // Chopsticks carriage (~ catch height band mid-tower, movable)
  const chopY = 72;
  const carriage = new THREE.Mesh(
    new THREE.BoxGeometry(6, 5, colSep + 6),
    steel
  );
  carriage.position.set(-1, chopY, 0);
  g.add(carriage);

  // Two chopstick arms reaching toward pad (−X)
  for (const side of [-1, 1]) {
    const armRoot = new THREE.Group();
    armRoot.position.set(-3, chopY, side * 2.5);
    // main boom
    const boom = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 1.6), steel);
    boom.position.set(-11, 0, 0);
    armRoot.add(boom);
    // tip pad / bumper
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.2, 2.5),
      new THREE.MeshStandardMaterial({
        color: 0x333840,
        metalness: 0.5,
        roughness: 0.5,
      })
    );
    tip.position.set(-22, 0, 0);
    armRoot.add(tip);
    // hydraulic rams
    const ram = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 8, 8),
      silver
    );
    ram.rotation.z = Math.PI / 2.5;
    ram.position.set(-6, -1.5, 0);
    armRoot.add(ram);
    // slight open angle for launch config
    armRoot.rotation.z = side * 0.04;
    armRoot.rotation.y = side * 0.08;
    g.add(armRoot);
  }

  // Ship Quick Disconnect arm (higher on tower)
  const qdY = 110;
  const qdCarriage = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), steelDark);
  qdCarriage.position.set(-2, qdY, 0);
  g.add(qdCarriage);
  const qdArm = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 1.4), steel);
  qdArm.position.set(-11, qdY, 0);
  g.add(qdArm);
  const qdHead = new THREE.Mesh(
    new THREE.BoxGeometry(2, 3, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.4 })
  );
  qdHead.position.set(-20, qdY, 0);
  g.add(qdHead);

  // Tower top crane / sheaves
  const top = new THREE.Mesh(new THREE.BoxGeometry(10, 4, colSep + 6), steel);
  top.position.set(0, H + 2, 0);
  g.add(top);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 1.5), steelDark);
  crane.position.set(-6, H + 5, 0);
  g.add(crane);

  // Base anchors
  for (const z of [-colSep / 2, colSep / 2]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), steelDark);
    base.position.set(0, 1, z);
    g.add(base);
  }

  // Work platforms near base
  const baseDeck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 16), steelDark);
  baseDeck.position.set(-4, 3, 0);
  g.add(baseDeck);

  // Access stairs (simplified zig-zag)
  for (let i = 0; i < 10; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 1.2), steelDark);
    step.position.set(3.5, 4 + i * 3.5, (i % 2 === 0 ? 1 : -1) * 5);
    g.add(step);
  }

  // Safety orange accents
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 8, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6, metalness: 0.3 })
  );
  accent.position.set(1.7, 20, 0);
  g.add(accent);

  return g;
}

function createTankFarm(white, silver, steel, steelDark, concrete) {
  const g = new THREE.Group();
  g.name = 'TankFarm';

  // Concrete pad
  const base = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 45), concrete);
  base.position.y = 0.25;
  g.add(base);

  // Horizontal cryo tanks (LOX / CH4 style)
  const horiz = [
    { x: -18, z: -8, l: 28, r: 2.8, mat: white, label: true },
    { x: -18, z: 0, l: 28, r: 2.8, mat: white },
    { x: -18, z: 8, l: 26, r: 2.5, mat: silver },
    { x: 12, z: -8, l: 24, r: 2.6, mat: white },
    { x: 12, z: 4, l: 24, r: 2.6, mat: silver },
  ];
  for (const t of horiz) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(t.r, t.r, t.l, 20),
      t.mat
    );
    body.rotation.z = Math.PI / 2;
    body.position.set(t.x, t.r + 0.8, t.z);
    body.castShadow = true;
    g.add(body);
    // saddles
    for (const sx of [-t.l * 0.3, t.l * 0.3]) {
      const saddle = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, t.r * 0.9, t.r * 2.2),
        steelDark
      );
      saddle.position.set(t.x + sx, t.r * 0.45, t.z);
      g.add(saddle);
    }
    // end caps already from cylinder; add dome feel
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(t.r, 12, 10), t.mat);
      cap.scale.x = 0.4;
      cap.position.set(t.x + end * (t.l / 2), t.r + 0.8, t.z);
      g.add(cap);
    }
  }

  // Vertical LN2 / storage bullets
  for (let i = 0; i < 4; i++) {
    const r = 2.2;
    const h = 10 + (i % 2) * 3;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), silver);
    v.position.set(28, h / 2 + 0.5, -12 + i * 7);
    g.add(v);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), silver);
    dome.position.set(28, h + 0.5, -12 + i * 7);
    g.add(dome);
  }

  // Vaporizer banks (finned boxes)
  for (let i = 0; i < 3; i++) {
    const vap = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 3), steelDark);
    vap.position.set(-5 + i * 8, 2.8, 16);
    g.add(vap);
    // fins
    for (let f = 0; f < 8; f++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.5, 0.08), steel);
      fin.position.set(-5 + i * 8, 2.8, 14.5 + f * 0.35);
      g.add(fin);
    }
  }

  // Pump skids
  for (let i = 0; i < 4; i++) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2), steel);
    skid.position.set(20 + (i % 2) * 5, 1, 12 + Math.floor(i / 2) * 4);
    g.add(skid);
  }

  // Pipe manifolds
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 20, 8),
      silver
    );
    p.rotation.z = Math.PI / 2;
    p.position.set(0, 1.5 + (i % 3) * 0.6, -18);
    g.add(p);
  }

  return g;
}

function createWaterTanks(white, steelDark, concrete) {
  const g = new THREE.Group();
  // Large horizontal water tanks for deluge
  const base = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 20), concrete);
  base.position.y = 0.2;
  g.add(base);
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 22, 20), white);
    t.rotation.z = Math.PI / 2;
    t.position.set(0, 4, -6 + i * 6);
    g.add(t);
    for (const e of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 10), white);
      cap.scale.x = 0.35;
      cap.position.set(e * 11, 4, -6 + i * 6);
      g.add(cap);
    }
  }
  // Pump house
  const house = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), steelDark);
  house.position.set(16, 2.5, 0);
  g.add(house);
  return g;
}

/** @deprecated */
export function createEnvironment(scene) {
  return createLaunchPad(scene);
}

export function createLights(scene) {
  // Extremely weak cool fill — primary key is space.js sun + shadow light.
  // Avoid competing directional lights that muddy the single-sun model.
  const fill = new THREE.HemisphereLight(0x6a8aaa, 0x2a3038, 0.12);
  scene.add(fill);
  // Warm tower rim (local practical, not a second sun)
  const rim = new THREE.PointLight(0xff8c42, 0.28, 160, 2);
  rim.position.set(-20, 50, -30);
  scene.add(rim);
  return { fill, rim };
}
