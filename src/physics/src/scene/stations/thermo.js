/** Build and expose all thermodynamics-station apparatus. */
export function createStationEquipment(ctx) {
  const { THREE, materials: mat, primitives, shared } = ctx;
  const { rbox, box, cyl, sphere } = primitives;
  const animators = [];

  function makeThermoSetup() {
    const g = new THREE.Group();
    const base = rbox(0.7, 0.04, 0.42, mat.whiteGloss, 0.02);
    base.position.y = 0.02;
    g.add(base);
    const baseLed = rbox(0.65, 0.01, 0.38, mat.orangeGlow, 0.005);
    baseLed.position.y = 0.045;
    g.add(baseLed);

    // calorimeter
    const caloOuter = cyl(0.07, 0.07, 0.16, mat.chrome, 24);
    caloOuter.position.set(-0.18, 0.14, 0.02);
    g.add(caloOuter);
    const caloInner = cyl(0.055, 0.055, 0.12, mat.glass, 20);
    caloInner.position.set(-0.18, 0.14, 0.02);
    g.add(caloInner);
    const liquid = cyl(0.05, 0.05, 0.07, new THREE.MeshPhysicalMaterial({
      color: 0xff6b35, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.75,
      emissive: 0xff4400, emissiveIntensity: 0.2,
    }), 16);
    liquid.position.set(-0.18, 0.11, 0.02);
    g.add(liquid);
    const lid = cyl(0.075, 0.075, 0.02, mat.carbon, 20);
    lid.position.set(-0.18, 0.23, 0.02);
    g.add(lid);
    const stir = cyl(0.008, 0.008, 0.12, mat.chrome, 8);
    stir.position.set(-0.18, 0.28, 0.02);
    g.add(stir);

    // heat conduction rods (copper / aluminum / iron colors)
    const rodColors = [
      { c: 0xb87333, e: 0xff4400 },
      { c: 0xc0c8d0, e: 0xff8844 },
      { c: 0x6b7280, e: 0xff6622 },
    ];
    rodColors.forEach((rc, i) => {
      const rod = cyl(0.012, 0.012, 0.28, new THREE.MeshStandardMaterial({
        color: rc.c, metalness: 0.85, roughnessRoughness: 0.3,
        emissive: rc.e, emissiveIntensity: 0.15 + i * 0.05,
      }), 12);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0.12, 0.14, -0.1 + i * 0.1);
      g.add(rod);
      // cold / hot ends
      const cold = sphere(0.02, mat.blueGlow, 10);
      cold.position.set(-0.02, 0.14, -0.1 + i * 0.1);
      g.add(cold);
      const hot = sphere(0.02, mat.orangeGlow, 10);
      hot.position.set(0.26, 0.14, -0.1 + i * 0.1);
      g.add(hot);
    });
    // heater block on righ
    const heater = rbox(0.1, 0.08, 0.28, mat.carbon, 0.015);
    heater.position.set(0.32, 0.1, 0);
    g.add(heater);
    const heatPadMat = new THREE.MeshStandardMaterial({
      color: 0xfdba74, emissive: 0xf97316, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.35,
    });
    const heatPad = rbox(0.08, 0.02, 0.24, heatPadMat, 0.008);
    heatPad.position.set(0.32, 0.15, 0);
    g.add(heatPad);

    // digital thermometer panel
    const panel = rbox(0.16, 0.12, 0.02, mat.carbon, 0.01);
    panel.position.set(-0.18, 0.32, -0.14);
    g.add(panel);
    const screen = rbox(0.13, 0.08, 0.01, new THREE.MeshStandardMaterial({
      color: 0xffddaa, emissive: 0xff6600, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.4,
    }), 0.005);
    screen.position.set(-0.18, 0.32, -0.125);
    g.add(screen);

    // molecular motion / gas model — floating spheres in a glass box
    const boxFrame = rbox(0.18, 0.14, 0.12, mat.glass, 0.01);
    boxFrame.position.set(0.05, 0.16, 0.12);
    g.add(boxFrame);
    const molecules = [];
    for (let i = 0; i < 8; i++) {
      const m = sphere(0.012, mat.orangeGlow, 8);
      m.position.set(
        0.05 + (Math.random() - 0.5) * 0.1,
        0.16 + (Math.random() - 0.5) * 0.08,
        0.12 + (Math.random() - 0.5) * 0.06
      );
      g.add(m);
      molecules.push({ mesh: m, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() });
    }

    animators.push((t) => {
      molecules.forEach(({ mesh, phase, speed }) => {
        mesh.position.x = 0.05 + Math.sin(t * speed + phase) * 0.05;
        mesh.position.y = 0.16 + Math.cos(t * speed * 1.3 + phase) * 0.04;
        mesh.position.z = 0.12 + Math.sin(t * speed * 0.8 + phase * 1.5) * 0.03;
      });
      heatPadMat.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 3);
      liquid.material.emissiveIntensity = 0.15 + 0.1 * Math.sin(t * 2);
    });

    g.userData.rods = [];
    g.children.forEach((ch) => {
      if (ch.isMesh && Math.abs(ch.position.y - 0.14) < 0.001 && Math.abs(ch.rotation.z - Math.PI / 2) < 0.01) {
        // clone material so heat can be unique per rod
        ch.material = ch.material.clone();
        g.userData.rods.push(ch);
      }
    });
    g.userData.heatPadMat = heatPadMat;
    g.userData.setRodHeat = (progress) => {
      g.userData.rods.forEach((rod, i) => {
        const speed = [1.0, 0.72, 0.48][i] || 0.5;
        const heat = Math.min(1, progress * speed * 1.35);
        rod.material.emissiveIntensity = 0.12 + heat * 1.3;
      });
      if (g.userData.heatPadMat) g.userData.heatPadMat.emissiveIntensity = 0.5 + progress * 0.9;
    };
    g.userData.interactive = true;
    g.userData.role = 'thermo';

    return g;
  }


  const root = new THREE.Group();
  root.name = 'thermo-station';
  const thermo = makeThermoSetup();
  thermo.position.set(4.2, 0.93, 2.6);
  root.add(thermo);

  [
    { o: shared.makeBeaker(0.13, 0.04, 0xff6644), p: [5.2, 0.93, 2.35] },
    { o: shared.makeBeaker(0.12, 0.038, 0x44aaff), p: [5.45, 0.93, 2.55] },
  ].forEach(({ o, p }) => {
    o.position.set(...p);
    root.add(o);
  });

  thermo.userData.interactive = true;
  const equipment = {
    setRodHeat: thermo.userData.setRodHeat,
    setTempDisplay: thermo.userData.setTempDisplay,
  };

  return {
    root,
    equipment,
    animators,
    prewarm: {},
    refs: { thermo },
  };
}
