import * as THREE from 'three';

/**
 * Procedural sci-fi scout interceptor — flyable 6DOF craft.
 * Design cues: sleek fighter / recon ship (tapered hull, dual nacelles,
 * hard-surface plating, ion thrusters, glass canopy).
 *
 * Coordinate frame (must match flightController):
 *   +X = nose forward
 *   +Y = up
 *   +Z = right
 * Units: 1 unit ≈ 1 m. Overall length ~24 m (scale ~0.85 in main → ~20 m).
 */
export function createPlayerShip() {
  const root = new THREE.Group();
  root.name = 'PlayerScout';

  // ── Materials — bright stainless silver ─────────────────────
  // Keep metalness moderate: pure metal + vacuum IBL≈0 reads pure black.
  // Slight emissive lift so hull stays readable under hard sunlight only.
  const hull = new THREE.MeshStandardMaterial({
    color: 0xf4f7fa,
    metalness: 0.72,
    roughness: 0.28,
    envMapIntensity: 1.8,
    emissive: 0xd8e0e8,
    emissiveIntensity: 0.14,
  });
  const hullMid = new THREE.MeshStandardMaterial({
    color: 0xe2e8ee,
    metalness: 0.68,
    roughness: 0.34,
    envMapIntensity: 1.55,
    emissive: 0xc8d0d8,
    emissiveIntensity: 0.1,
  });
  const hullDark = new THREE.MeshStandardMaterial({
    color: 0xc8d0d8,
    metalness: 0.65,
    roughness: 0.4,
    envMapIntensity: 1.35,
    emissive: 0xa8b0b8,
    emissiveIntensity: 0.08,
  });
  const hullBlack = new THREE.MeshStandardMaterial({
    color: 0x9aa4b0,
    metalness: 0.7,
    roughness: 0.38,
    envMapIntensity: 1.2,
    emissive: 0x6a727c,
    emissiveIntensity: 0.06,
  });
  // Cool chrome accent lines
  const accent = new THREE.MeshStandardMaterial({
    color: 0xd0e4f4,
    metalness: 0.78,
    roughness: 0.22,
    emissive: 0x88aacc,
    emissiveIntensity: 0.16,
    envMapIntensity: 1.6,
  });
  const accentWarm = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0xc0b8a8,
    emissiveIntensity: 0.1,
    envMapIntensity: 1.35,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xc0e8ff,
    metalness: 0.2,
    roughness: 0.06,
    transparent: true,
    opacity: 0.45,
    emissive: 0x3a88b0,
    emissiveIntensity: 0.28,
    envMapIntensity: 1.5,
  });
  const thruster = new THREE.MeshStandardMaterial({
    color: 0x5a6470,
    metalness: 0.8,
    roughness: 0.28,
    envMapIntensity: 1.15,
    emissive: 0x2a3038,
    emissiveIntensity: 0.05,
  });
  const thrusterInner = new THREE.MeshStandardMaterial({
    color: 0x8898a8,
    metalness: 0.75,
    roughness: 0.32,
    side: THREE.DoubleSide,
    envMapIntensity: 1.05,
  });
  // Brushed silver heat-radiator
  const copper = new THREE.MeshStandardMaterial({
    color: 0xe8ecf0,
    metalness: 0.7,
    roughness: 0.38,
    envMapIntensity: 1.3,
    emissive: 0xc8d0d8,
    emissiveIntensity: 0.08,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x88eeff,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lightMat = (col) =>
    new THREE.MeshBasicMaterial({ color: col, toneMapped: false });

  // ── Main fuselage (tapered multi-segment, +X forward) ──────
  // Profile: nose tip → mid body → tail taper
  const fuse = new THREE.Group();
  fuse.name = 'Fuselage';

  // Nose ogive / cone blend
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(1.05, 4.5, 20),
    hull
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 8.6;
  nose.castShadow = true;
  fuse.add(nose);

  // Nose ring detail
  const noseRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.06, 8, 28),
    hullMid
  );
  noseRing.rotation.y = Math.PI / 2;
  noseRing.position.x = 6.4;
  fuse.add(noseRing);

  // Forward fuselage (slight taper)
  const fwd = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.05, 4.2, 24),
    hull
  );
  fwd.rotation.z = Math.PI / 2;
  fwd.position.x = 4.2;
  fwd.castShadow = true;
  fuse.add(fwd);

  // Mid body (main volume, slightly flattened)
  const mid = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.25, 5.5, 28),
    hull
  );
  mid.rotation.z = Math.PI / 2;
  mid.position.x = -0.5;
  mid.scale.set(1, 0.88, 1.12); // wider in Z (beam), flatter in Y
  mid.castShadow = true;
  fuse.add(mid);

  // Aft body taper into engines
  const aft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.45, 4.0, 24),
    hullMid
  );
  aft.rotation.z = Math.PI / 2;
  aft.position.x = -5.2;
  aft.scale.set(1, 0.9, 1.08);
  aft.castShadow = true;
  fuse.add(aft);

  // Tail cone / spine stub
  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 1.15, 2.2, 18),
    hullDark
  );
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -8.2;
  fuse.add(tail);

  root.add(fuse);

  // ── Hard-surface panel bands ───────────────────────────────
  for (const x of [5.5, 3.0, 0.5, -2.0, -4.5, -6.8]) {
    const r = x > 2 ? 1.15 : x > -3 ? 1.4 : 1.2;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.035, 6, 32),
      hullDark
    );
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
    band.scale.set(1, 0.88, 1.1);
    root.add(band);
  }

  // Longitudinal armor ridges
  for (const z of [-0.95, 0.95]) {
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.1, 0.14),
      hullMid
    );
    ridge.position.set(-0.5, 0.55, z);
    root.add(ridge);
  }
  // Underside keel
  const keel = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.18, 0.35),
    hullDark
  );
  keel.position.set(-0.5, -1.05, 0);
  root.add(keel);

  // ── Cockpit canopy ─────────────────────────────────────────
  const cockpit = new THREE.Group();
  cockpit.name = 'Cockpit';

  // Frame base (dark housing)
  const canopyBase = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.35, 1.9),
    hullDark
  );
  canopyBase.position.set(3.4, 0.95, 0);
  cockpit.add(canopyBase);

  // Bubble glass (stretched hemisphere)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
    glassMat
  );
  canopy.scale.set(1.85, 0.95, 1.05);
  canopy.position.set(3.3, 1.15, 0);
  cockpit.add(canopy);

  // Frame bars over glass
  const frameFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.9, 1.7),
    hullBlack
  );
  frameFront.position.set(4.85, 1.35, 0);
  frameFront.rotation.z = -0.35;
  cockpit.add(frameFront);

  const frameMid = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.75, 1.85),
    hullBlack
  );
  frameMid.position.set(3.3, 1.85, 0);
  cockpit.add(frameMid);

  const frameAft = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.7, 1.6),
    hullBlack
  );
  frameAft.position.set(1.9, 1.45, 0);
  frameAft.rotation.z = 0.4;
  cockpit.add(frameAft);

  // Side canopy frames
  for (const z of [-1, 1]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.08, 0.08),
      hullBlack
    );
    side.position.set(3.3, 1.55, z * 0.95);
    cockpit.add(side);
  }

  // HUD brow / sensor strip
  const brow = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.12, 1.5),
    accent
  );
  brow.position.set(4.6, 1.55, 0);
  cockpit.add(brow);

  root.add(cockpit);

  // ── Wings (delta / slight forward sweep) ───────────────────
  function makeWing(side) {
    const g = new THREE.Group();
    // Main wing plate — trapezoid extruded
    const shape = new THREE.Shape();
    // Root at z=0, tip outward; +X is forward on wing local after placement
    shape.moveTo(2.2, 0); // forward root
    shape.lineTo(-3.8, 0.15); // aft root
    shape.lineTo(-2.6, side * 4.2); // aft tip
    shape.lineTo(0.8, side * 3.6); // forward tip
    shape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.04,
      bevelSegments: 1,
    });
    // Shape XY → wing XZ (span along +Z when side > 0)
    wingGeo.rotateX(Math.PI / 2);
    wingGeo.translate(0, 0.06, 0);

    const wing = new THREE.Mesh(wingGeo, hullDark);
    wing.castShadow = true;
    g.add(wing);

    // Upper armor plate (slightly smaller)
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 2.4),
      hullMid
    );
    plate.position.set(-0.6, 0.14, side * 1.6);
    plate.rotation.y = side * -0.12;
    plate.rotation.x = side * 0.04;
    g.add(plate);

    // Leading edge strip
    const le = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 3.5),
      accent
    );
    le.position.set(1.2, 0.08, side * 1.8);
    le.rotation.y = side * 0.35;
    g.add(le);

    // Wing tip fin / blade
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.1),
      hullDark
    );
    tip.position.set(-0.6, 0.35, side * 3.9);
    tip.rotation.y = side * 0.15;
    tip.rotation.z = side * -0.2;
    g.add(tip);

    // Tip glow bar
    const tipGlow = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.12, 0.12),
      accent
    );
    tipGlow.position.set(-0.4, 0.75, side * 3.95);
    g.add(tipGlow);

    // Control surface (elevon) line
    const elevon = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.06, 1.8),
      hullBlack
    );
    elevon.position.set(-2.8, 0.05, side * 1.8);
    elevon.rotation.y = side * -0.08;
    g.add(elevon);

    // Weapon hardpoint stub under wing
    const hard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.8, 8),
      hullBlack
    );
    hard.position.set(-0.5, -0.25, side * 2.0);
    g.add(hard);
    const pod = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 1.4, 4, 8),
      hullMid
    );
    pod.rotation.z = Math.PI / 2;
    pod.position.set(-0.3, -0.45, side * 2.0);
    g.add(pod);

    g.position.set(-0.8, -0.15, side * 1.15);
    g.rotation.x = side * 0.08; // slight anhedral/dihedral
    return g;
  }
  root.add(makeWing(1));
  root.add(makeWing(-1));

  // ── Engine nacelles (twin, aft) ────────────────────────────
  function makeNacelle(side) {
    const g = new THREE.Group();
    const z = side * 2.55;

    // Pod body
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.85, 5.2, 16),
      hullDark
    );
    pod.rotation.z = Math.PI / 2;
    pod.position.set(-2.8, -0.4, z);
    pod.castShadow = true;
    g.add(pod);

    // Intake scoop (forward of nacelle)
    const intake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.72, 1.1, 14),
      hullBlack
    );
    intake.rotation.z = Math.PI / 2;
    intake.position.set(0.2, -0.4, z);
    g.add(intake);

    // Intake lip
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.05, 8, 20),
      hullMid
    );
    lip.rotation.y = Math.PI / 2;
    lip.position.set(0.75, -0.4, z);
    g.add(lip);

    // Pylon to fuselage
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.35, 0.55),
      hullMid
    );
    pylon.position.set(-2.5, -0.15, side * 1.55);
    pylon.rotation.y = side * -0.15;
    g.add(pylon);

    // Heat radiator fins on outboard
    for (let i = 0; i < 5; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.6, 0.04),
        copper
      );
      fin.position.set(-3.2, -0.4 + (i - 2) * 0.08, z + side * 0.75);
      fin.rotation.x = side * 0.4;
      g.add(fin);
    }

    // Thruster bell
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.78, 1.35, 16, 1, true),
      thruster
    );
    bell.rotation.z = Math.PI / 2;
    bell.position.set(-5.9, -0.4, z);
    g.add(bell);

    const bellInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.7, 1.2, 14, 1, true),
      thrusterInner
    );
    bellInner.rotation.z = Math.PI / 2;
    bellInner.position.set(-5.9, -0.4, z);
    g.add(bellInner);

    // Bell rings
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4;
      const r = THREE.MathUtils.lerp(0.5, 0.78, t);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.025, 6, 16),
        hullBlack
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-5.9 - 0.5 + t * 1.1, -0.4, z);
      g.add(ring);
    }

    // Engine glow + plume
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 14, 12),
      glowMat.clone()
    );
    glow.position.set(-6.7, -0.4, z);
    glow.name = 'engineGlow';
    g.add(glow);

    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 4.2, 14, 1, true),
      plumeMat.clone()
    );
    plume.rotation.z = Math.PI / 2;
    plume.position.set(-8.5, -0.4, z);
    plume.name = 'plume';
    g.add(plume);

    return g;
  }
  root.add(makeNacelle(1));
  root.add(makeNacelle(-1));

  // ── Center main thruster ───────────────────────────────────
  const mainGroup = new THREE.Group();
  const mainHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 2.0, 18),
    hullDark
  );
  mainHousing.rotation.z = Math.PI / 2;
  mainHousing.position.set(-7.6, 0, 0);
  mainGroup.add(mainHousing);

  const mainBell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 1.15, 1.7, 20, 1, true),
    thruster
  );
  mainBell.rotation.z = Math.PI / 2;
  mainBell.position.set(-9.0, 0, 0);
  mainGroup.add(mainBell);

  const mainInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 1.05, 1.55, 18, 1, true),
    thrusterInner
  );
  mainInner.rotation.z = Math.PI / 2;
  mainInner.position.set(-9.0, 0, 0);
  mainGroup.add(mainInner);

  // Cooling rings on main bell
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    const r = THREE.MathUtils.lerp(0.75, 1.15, t);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.03, 6, 20),
      hullBlack
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-9.0 - 0.7 + t * 1.5, 0, 0);
    mainGroup.add(ring);
  }

  const mainGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 16, 14),
    glowMat.clone()
  );
  mainGlow.position.set(-10.0, 0, 0);
  mainGlow.name = 'engineGlow';
  mainGroup.add(mainGlow);

  // Core hot spot
  const mainCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  mainCore.position.set(-10.0, 0, 0);
  mainCore.name = 'engineGlow';
  mainGroup.add(mainCore);

  const mainPlume = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 7.5, 16, 1, true),
    plumeMat.clone()
  );
  mainPlume.rotation.z = Math.PI / 2;
  mainPlume.position.set(-13.2, 0, 0);
  mainPlume.name = 'plume';
  mainGroup.add(mainPlume);

  // Secondary plume sheath
  const mainPlume2 = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 5.5, 14, 1, true),
    plumeMat.clone()
  );
  mainPlume2.rotation.z = Math.PI / 2;
  mainPlume2.position.set(-12.2, 0, 0);
  mainPlume2.name = 'plume';
  mainGroup.add(mainPlume2);

  root.add(mainGroup);

  // ── Dorsal fin / vertical stabilizer ───────────────────────
  const finShape = new THREE.Shape();
  finShape.moveTo(1.5, 0);
  finShape.lineTo(-3.2, 0);
  finShape.lineTo(-2.4, 2.4);
  finShape.lineTo(0.2, 2.1);
  finShape.closePath();
  // Shape already in XY (length X, height Y); extrude thin in Z
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  finGeo.translate(0, 0, -0.05);
  const fin = new THREE.Mesh(finGeo, hullDark);
  fin.position.set(-2.2, 1.15, 0);
  fin.castShadow = true;
  root.add(fin);

  const finEdge = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.1, 0.12),
    accent
  );
  finEdge.position.set(-2.5, 3.25, 0);
  finEdge.rotation.z = 0.18;
  root.add(finEdge);

  // Ventral strake
  const strake = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 0.7, 0.1),
    hullDark
  );
  strake.position.set(-1.5, -1.35, 0);
  strake.rotation.z = -0.15;
  root.add(strake);

  // ── Sensors, antennas, greebles ─────────────────────────────
  // Nose sensor array
  const noseSensor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 0.6, 12),
    accent
  );
  noseSensor.rotation.z = Math.PI / 2;
  noseSensor.position.set(10.5, 0, 0);
  root.add(noseSensor);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hullBlack
  );
  dish.rotation.z = -Math.PI / 2;
  dish.position.set(6.8, -0.85, 0);
  root.add(dish);

  // Side sensor blisters
  for (const z of [-1, 1]) {
    const blister = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      hullMid
    );
    blister.scale.set(1.4, 0.7, 0.9);
    blister.position.set(5.2, 0.15, z * 1.15);
    root.add(blister);
  }

  // Dorsal antenna
  const antBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.25, 8),
    hullDark
  );
  antBase.position.set(1.2, 1.35, 0);
  root.add(antBase);
  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 1.6, 6),
    hullMid
  );
  ant.position.set(1.2, 2.2, 0);
  root.add(ant);
  const antTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    accent
  );
  antTip.position.set(1.2, 3.0, 0);
  root.add(antTip);

  // RCS thruster pods (small)
  const rcsPositions = [
    [4, 0.9, 1.1],
    [4, 0.9, -1.1],
    [4, -0.9, 1.0],
    [4, -0.9, -1.0],
    [-5.5, 0.8, 1.0],
    [-5.5, 0.8, -1.0],
    [-5.5, -0.7, 1.0],
    [-5.5, -0.7, -1.0],
  ];
  for (const [x, y, z] of rcsPositions) {
    const rcs = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 0.22),
      thruster
    );
    rcs.position.set(x, y, z);
    root.add(rcs);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.15, 8),
      hullBlack
    );
    // Point roughly outward
    nozzle.position.set(x, y + Math.sign(y) * 0.15, z + Math.sign(z) * 0.05);
    root.add(nozzle);
  }

  // Accent racing stripes along hull
  for (const z of [-0.75, 0.75]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.07, 0.1),
      accent
    );
    stripe.position.set(0.8, 0.35, z);
    root.add(stripe);
  }
  // Warm ID stripe
  const idStripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.06, 0.08),
    accentWarm
  );
  idStripe.position.set(2.5, -0.5, 0);
  root.add(idStripe);

  // ── Running / nav lights ───────────────────────────────────
  const lights = [
    [9.8, 0.15, 0.55, 0xff2233], // nose red
    [9.8, 0.15, -0.55, 0x33ff66], // nose green
    [-0.5, 0.55, 4.0, 0xffffff], // wing tip
    [-0.5, 0.55, -4.0, 0xffffff],
    [-7.5, 0.9, 0, 0xffaa44], // aft amber
    [3.0, 1.95, 0, 0x66ccff], // canopy beacon
  ];
  for (const [x, y, z, col] of lights) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), lightMat(col));
    light.position.set(x, y, z);
    root.add(light);
    // Soft halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.25,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.set(x, y, z);
    root.add(halo);
  }

  // Belly sensor / cargo hatch
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.12, 1.4),
    hullBlack
  );
  hatch.position.set(1.0, -1.15, 0);
  root.add(hatch);
  const hatchAccent = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, 0.9),
    accent
  );
  hatchAccent.position.set(1.0, -1.2, 0);
  root.add(hatchAccent);

  // ── Orientation & userData ─────────────────────────────────
  root.rotation.order = 'YXZ';

  const glows = [];
  const plumes = [];
  root.traverse((o) => {
    if (o.name === 'engineGlow') glows.push(o);
    if (o.name === 'plume') plumes.push(o);
  });

  // ── Hyper / warp exhaust stack (ion beam + sheath + shock rings) ──
  const hyperFx = new THREE.Group();
  hyperFx.name = 'HyperExhaust';
  hyperFx.visible = false;
  root.add(hyperFx);

  /** Soft radial falloff cylinder for ion beams (axis = local Y before rotate). */
  function makeBeamMat(opts = {}) {
    const {
      core = new THREE.Color(0xffffff),
      mid = new THREE.Color(0x66e0ff),
      edge = new THREE.Color(0x2266ff),
      power = 2.2,
      scroll = 1.0,
    } = opts;
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uCore: { value: core },
        uMid: { value: mid },
        uEdge: { value: edge },
        uPower: { value: power },
        uScroll: { value: scroll },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uCore;
        uniform vec3 uMid;
        uniform vec3 uEdge;
        uniform float uPower;
        uniform float uScroll;
        varying vec2 vUv;
        void main() {
          // vUv.x = around tube, vUv.y = along axis (0 nose-side → 1 aft)
          float along = vUv.y;
          float radial = abs(vUv.x - 0.5) * 2.0;
          // Animated streamers along the beam
          float stream =
            0.55 +
            0.45 * sin(along * 28.0 - uTime * 22.0 * uScroll + radial * 6.0) *
              sin(along * 11.0 + uTime * 9.0);
          float coreMask = pow(1.0 - radial, uPower) * stream;
          float body = pow(1.0 - radial, 1.55) * (0.5 + 0.5 * stream);
          // Fade tip (aft) and throat (engine)
          float tip = smoothstep(0.0, 0.1, along) * (1.0 - smoothstep(0.68, 1.0, along));
          // Keep alpha modest so additive layers don't wash out the hull
          float a = (coreMask * 0.7 + body * 0.32) * tip * uIntensity;
          if (a < 0.012) discard;
          vec3 col = mix(uEdge, uMid, body);
          col = mix(col, uCore, coreMask);
          col = mix(col, vec3(1.0, 0.98, 0.95), (1.0 - along) * coreMask * 0.4);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.72));
        }
      `,
    });
  }

  const coreBeamMat = makeBeamMat({
    core: new THREE.Color(0xffffff),
    mid: new THREE.Color(0xaaf0ff),
    edge: new THREE.Color(0x44aaff),
    power: 3.2,
    scroll: 1.35,
  });
  const midBeamMat = makeBeamMat({
    core: new THREE.Color(0xccf6ff),
    mid: new THREE.Color(0x55d0ff),
    edge: new THREE.Color(0x1a66cc),
    power: 1.8,
    scroll: 0.9,
  });
  const outerBeamMat = makeBeamMat({
    core: new THREE.Color(0x88ddff),
    mid: new THREE.Color(0x3388ff),
    edge: new THREE.Color(0x1144aa),
    power: 1.15,
    scroll: 0.55,
  });

  // Cylinders: default axis Y; rotate so +Y → -X (aft of ship)
  function makeBeam(radiusTop, radiusBot, length, mat, xCenter) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBot, length, 20, 1, true),
      mat
    );
    mesh.rotation.z = Math.PI / 2; // Y → X
    mesh.position.set(xCenter, 0, 0);
    mesh.frustumCulled = false;
    hyperFx.add(mesh);
    return mesh;
  }

  // Compact ion lance — stays behind the hull so the ship remains readable
  const coreBeam = makeBeam(0.08, 0.28, 9, coreBeamMat, -13.5);
  // Mid cyan sheath (thin)
  const midBeam = makeBeam(0.18, 0.55, 7, midBeamMat, -12.8);
  // Outer soft halo (very thin, short)
  const outerBeam = makeBeam(0.32, 0.9, 5.5, outerBeamMat, -12.2);

  // Small muzzle flash at nozzle only
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const muzzleFlash = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 18),
    flashMat
  );
  muzzleFlash.rotation.y = Math.PI / 2;
  muzzleFlash.position.set(-10.2, 0, 0);
  hyperFx.add(muzzleFlash);

  const muzzleFlash2 = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 14),
    flashMat.clone()
  );
  muzzleFlash2.rotation.y = Math.PI / 2;
  muzzleFlash2.position.set(-10.05, 0, 0);
  hyperFx.add(muzzleFlash2);

  // Traveling shock rings — fewer, smaller, mostly aft of ship
  const RING_COUNT = 3;
  const shockRings = [];
  const ringMatBase = new THREE.MeshBasicMaterial({
    color: 0x88eeff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < RING_COUNT; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.035, 6, 36),
      ringMatBase.clone()
    );
    ring.rotation.y = Math.PI / 2;
    ring.userData.phase = i / RING_COUNT;
    hyperFx.add(ring);
    shockRings.push(ring);
  }

  // Side nacelle micro-beams (short)
  const nacelleBeams = [];
  for (const z of [2.55, -2.55]) {
    const m = makeBeamMat({
      core: new THREE.Color(0xeeffff),
      mid: new THREE.Color(0x66ccff),
      edge: new THREE.Color(0x2288dd),
      power: 2.6,
      scroll: 1.1,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.18, 4.5, 10, 1, true),
      m
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(-11.5, -0.4, z);
    beam.frustumCulled = false;
    hyperFx.add(beam);
    nacelleBeams.push({ mesh: beam, mat: m });
  }

  const hyperBeamMats = [coreBeamMat, midBeamMat, outerBeamMat, ...nacelleBeams.map((n) => n.mat)];
  const _hyperColor = new THREE.Color();
  const _ringColor = new THREE.Color();
  let lastHyperBlend = 0;

  root.userData = {
    length: 24,
    setThrustVisual(amount) {
      const a = THREE.MathUtils.clamp(amount, 0, 1.5);
      const a1 = Math.min(1, a);
      const over = Math.max(0, a - 1);
      for (const g of glows) {
        g.material.opacity = 0.2 + a1 * 0.65 + over * 0.08;
        g.scale.setScalar(0.65 + a1 * 0.75 + over * 0.25);
      }
      for (const p of plumes) {
        // Modest stretch — keep plumes smaller than the hull silhouette
        p.material.opacity = Math.min(0.7, a * 0.42 + over * 0.12);
        p.scale.set(
          0.5 + a1 * 0.55 + over * 0.2,
          0.45 + a1 * 1.0 + over * 0.9,
          0.5 + a1 * 0.55 + over * 0.2
        );
        if (p.material.color) {
          p.material.color.setHSL(0.52 - over * 0.05, 0.7, 0.52 + over * 0.12);
        }
      }
    },
    /**
     * blend 0..1 — cruise→warp visual envelope.
     * speedFrac 0..1 — slight length/intensity boost at speed.
     * Kept compact so the ship hull stays visible in chase cam.
     */
    setHyperVisual(blend = 0, t = 0, speedFrac = 0) {
      const b = THREE.MathUtils.clamp(blend, 0, 1);
      const sf = THREE.MathUtils.clamp(speedFrac, 0, 1);
      lastHyperBlend = b;
      const on = b > 0.03;
      hyperFx.visible = on;
      if (!on) {
        for (const mat of hyperBeamMats) mat.uniforms.uIntensity.value = 0;
        return;
      }

      // Lower intensity so additive beams don't white-out the craft
      const coreI = Math.pow(b, 0.9) * 0.55 * (0.85 + sf * 0.15);
      const midI = b * 0.38 * (0.85 + sf * 0.15);
      const outerI = b * 0.22 * (0.9 + sf * 0.1);
      coreBeamMat.uniforms.uIntensity.value = coreI;
      midBeamMat.uniforms.uIntensity.value = midI;
      outerBeamMat.uniforms.uIntensity.value = outerI;
      for (const mat of hyperBeamMats) mat.uniforms.uTime.value = t;

      // Short, thin beams only — max ~1.5× base geometry
      const lenScale = 0.85 + b * 0.55 + sf * 0.2;
      const radScale = 0.75 + b * 0.35 + sf * 0.1;
      coreBeam.scale.set(radScale * 0.85, lenScale, radScale * 0.85);
      midBeam.scale.set(radScale, lenScale * 0.9, radScale);
      outerBeam.scale.set(radScale * 1.1, lenScale * 0.75, radScale * 1.1);
      // Anchor near nozzle (x≈-10..-16), never under the fuselage
      coreBeam.position.x = -10.5 - lenScale * 2.2;
      midBeam.position.x = -10.5 - lenScale * 1.6;
      outerBeam.position.x = -10.5 - lenScale * 1.1;

      for (const { mesh, mat } of nacelleBeams) {
        mat.uniforms.uIntensity.value = midI * 0.55;
        mesh.scale.set(0.75 + b * 0.25, 0.8 + b * 0.4, 0.75 + b * 0.25);
        mesh.position.x = -10.5 - b * 1.5;
      }

      // Soft muzzle flash (small)
      const flash =
        b * (0.22 + 0.12 * Math.sin(t * 36) * Math.sin(t * 15 + 1.3));
      flashMat.opacity = flash * 0.55;
      muzzleFlash.scale.setScalar(0.55 + b * 0.45 + Math.sin(t * 24) * 0.04);
      muzzleFlash2.material.opacity = flash * 0.7;
      muzzleFlash2.scale.setScalar(0.45 + b * 0.35);

      _hyperColor.setHSL(0.55 - b * 0.1, 0.85, 0.55 + b * 0.18);
      flashMat.color.copy(_hyperColor);
      muzzleFlash2.material.color.setHSL(0.55 - b * 0.08, 0.45, 0.78);

      // Shock rings — short travel, small radius, low opacity
      for (let i = 0; i < RING_COUNT; i++) {
        const ring = shockRings[i];
        const phase = (ring.userData.phase + t * (0.45 + b * 0.55)) % 1;
        const x = -10.8 - phase * (6 + b * 10);
        const rad = (0.55 + phase * (0.55 + b * 0.7)) * (0.7 + b * 0.35);
        ring.position.set(x, 0, 0);
        ring.scale.setScalar(rad);
        const fade = Math.sin(phase * Math.PI) * b;
        ring.material.opacity = fade * (0.28 + b * 0.18) * (1 - phase * 0.4);
        _ringColor.setHSL(0.54 - phase * 0.06 - b * 0.04, 0.8, 0.55 + (1 - phase) * 0.15);
        ring.material.color.copy(_ringColor);
        ring.rotation.z = t * (1.5 + i) * b;
      }
    },
    pulse(t, thrust) {
      const a = THREE.MathUtils.clamp(thrust, 0, 1.2);
      const a1 = Math.min(1, a);
      for (const g of glows) {
        const flick =
          0.9 + Math.sin(t * 28 + g.id * 1.7) * 0.1 * a1 +
          Math.sin(t * 48 + g.id) * 0.04 * lastHyperBlend;
        g.material.opacity = (0.2 + a1 * 0.55 + lastHyperBlend * 0.1) * flick;
      }
      if (lastHyperBlend > 0.03) {
        for (const mat of hyperBeamMats) mat.uniforms.uTime.value = t;
      }
    },
  };

  root.visible = false;
  return root;
}
