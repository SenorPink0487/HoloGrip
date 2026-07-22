/** Build and expose all mechanics-station apparatus. */
export function createStationEquipment(ctx) {
  const { THREE, materials: mat, primitives, getExperimentState } = ctx;
  const { rbox, cyl, sphere, torus } = primitives;
  const animators = [];
  const expManager = { get state() { return getExperimentState?.() ?? null; } };

  function makeNewtonsCradle() {
    const g = new THREE.Group();
    const base = rbox(0.75, 0.05, 0.32, mat.whiteGloss, 0.025);
    base.position.y = 0.025;
    g.add(base);
    const baseLed = rbox(0.7, 0.01, 0.28, mat.cyanGlow, 0.005);
    baseLed.position.y = 0.055;
    g.add(baseLed);

    const frameW = 0.58, frameH = 0.48;
    // arched frame bars
    for (const z of [-0.11, 0.11]) {
      for (const x of [-frameW / 2, frameW / 2]) {
        const post = cyl(0.012, 0.012, frameH, mat.chrome, 10);
        post.position.set(x, frameH / 2 + 0.06, z);
        g.add(post);
      }
      const bar = cyl(0.01, 0.01, frameW, mat.chrome, 10);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, frameH + 0.06, z);
      g.add(bar);
    }

    const n = 5, r = 0.042, stringLen = 0.34;
    const balls = [];
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.position.set((i - (n - 1) / 2) * r * 2, frameH + 0.06, 0);

      const sGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -0.11),
        new THREE.Vector3(0, -stringLen, 0),
        new THREE.Vector3(0, 0, 0.11),
      ]);
      pivot.add(new THREE.Line(sGeo, new THREE.LineBasicMaterial({ color: 0x88d4ff, transparent: true, opacity: 0.7 })));

      const ball = sphere(r, mat.chrome, 28);
      ball.position.y = -stringLen;
      ball.userData.interactive = true;
      ball.userData.role = 'cradle';
      pivot.add(ball);
      const aura = sphere(r * 1.15, new THREE.MeshStandardMaterial({
        color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.2, depthWrite: false,
      }), 16);
      aura.position.y = -stringLen;
      pivot.add(aura);
      g.add(pivot);
      balls.push(pivot);
    }

    g.userData.cradleBalls = balls;
    g.userData.interactive = true;
    g.userData.role = 'cradle';

    animators.push((t) => {
      if (expManager?.state.running && expManager.state.expId === 'cradle_demo') return;
      const period = 1.35;
      const phase = (t % period) / period;
      const angle = Math.sin(phase * Math.PI * 2) * 0.55;
      balls[0].rotation.z = Math.max(0, angle);
      balls[n - 1].rotation.z = Math.min(0, -angle);
      if (phase >= 0.5) {
        balls[0].rotation.z = Math.min(0, angle);
        balls[n - 1].rotation.z = Math.max(0, -angle);
      }
    });
    return g;
  }

  // —— Quantum Pendulum ——
  function makePendulum() {
    const g = new THREE.Group();
    const base = rbox(0.4, 0.04, 0.28, mat.whiteGloss, 0.02);
    base.position.y = 0.02;
    g.add(base);
    const baseRing = torus(0.14, 0.012, mat.blueGlow, 8, 28);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.05;
    g.add(baseRing);

    const pole = cyl(0.018, 0.022, 1.0, mat.chrome, 12);
    pole.position.set(0, 0.55, -0.08);
    g.add(pole);
    const arm = rbox(0.5, 0.025, 0.025, mat.silver, 0.008);
    arm.position.set(0, 1.02, 0);
    g.add(arm);

    // holographic protractor
    const arcPts = [];
    for (let a = -55; a <= 55; a += 1.5) {
      const rad = THREE.MathUtils.degToRad(a);
      arcPts.push(new THREE.Vector3(Math.sin(rad) * 0.4, 1.0 - Math.cos(rad) * 0.4, 0.04));
    }
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })
    ));

    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, 0);
    pivot.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.72, 0)]),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc })
    ));
    const bob = sphere(0.075, mat.blueGlow, 24);
    bob.position.y = -0.72;
    bob.userData.interactive = true;
    bob.userData.role = 'pendulum_bob';
    pivot.add(bob);
    const bobRing = torus(0.09, 0.008, mat.cyanGlow, 8, 20);
    bobRing.position.y = -0.72;
    pivot.add(bobRing);
    g.add(pivot);

    g.userData.pendulumPivot = pivot;
    g.userData.bob = bob;
    g.userData.interactive = true;
    g.userData.role = 'pendulum';
    g.userData.stringLen = 0.72;

    animators.push((t) => {
      if (expManager?.state.running && expManager.state.expId === 'pendulum_g') return;
      pivot.rotation.z = Math.sin(t * 1.75) * 0.48;
    });
    return g;
  }

  // —— Magnetic spring oscillator ——
  function makeSpringMass() {
    const g = new THREE.Group();
    const base = rbox(0.38, 0.04, 0.38, mat.whiteGloss, 0.02);
    base.position.y = 0.02;
    g.add(base);

    // four corner posts forming open cube
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = cyl(0.012, 0.012, 0.78, mat.chrome, 10);
        post.position.set(sx * 0.14, 0.42, sz * 0.14);
        g.add(post);
      }
    }
    const top = rbox(0.32, 0.03, 0.32, mat.silver, 0.015);
    top.position.y = 0.8;
    g.add(top);
    const topLed = rbox(0.28, 0.01, 0.28, mat.greenGlow, 0.005);
    topLed.position.y = 0.78;
    g.add(topLed);

    const springGroup = new THREE.Group();
    springGroup.position.set(0, 0.78, 0);
    const springPts = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const ang = t * 12 * Math.PI * 2;
      springPts.push(new THREE.Vector3(Math.cos(ang) * 0.055, -t * 0.38, Math.sin(ang) * 0.055));
    }
    springGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(springPts),
      new THREE.LineBasicMaterial({ color: 0x34d399 })
    ));

    const mass = rbox(0.14, 0.1, 0.14, mat.greenGlow, 0.02);
    mass.position.y = -0.45;
    mass.userData.interactive = true;
    mass.userData.role = 'spring_mass';
    springGroup.add(mass);
    const floatRing = torus(0.1, 0.01, mat.cyanGlow, 8, 24);
    floatRing.rotation.x = Math.PI / 2;
    floatRing.position.y = -0.55;
    springGroup.add(floatRing);
    g.add(springGroup);

    g.userData.springGroup = springGroup;
    g.userData.springMass = mass;
    g.userData.interactive = true;
    g.userData.role = 'spring';

    animators.push((t) => {
      if (expManager?.state.running && expManager.state.expId === 'spring_k') return;
      const stretch = 0.1 * Math.sin(t * 3.0);
      springGroup.scale.y = 1 + stretch * 1.8;
      mass.position.y = -0.45 - stretch;
      floatRing.position.y = -0.55 - stretch * 0.5;
      floatRing.rotation.z = t * 2;
    });
    return g;
  }

  // —— Laser Optics Bench ——

  function makeBalance() {
    const g = new THREE.Group();
    const base = rbox(0.5, 0.05, 0.35, mat.whiteGloss, 0.025);
    base.position.y = 0.025;
    g.add(base);

    // digital display panel
    const display = rbox(0.28, 0.16, 0.02, mat.carbon, 0.01);
    display.position.set(0, 0.35, -0.12);
    g.add(display);
    const screen = rbox(0.24, 0.12, 0.01, new THREE.MeshStandardMaterial({
      color: 0x67e8f9, emissive: 0x0891b2, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.3,
    }), 0.005);
    screen.position.set(0, 0.35, -0.105);
    g.add(screen);

    const column = cyl(0.02, 0.03, 0.28, mat.chrome, 12);
    column.position.y = 0.18;
    g.add(column);

    const beamPivot = new THREE.Group();
    beamPivot.position.y = 0.34;
    const beam = rbox(0.55, 0.02, 0.03, mat.silver, 0.008);
    beamPivot.add(beam);

    for (const sx of [-1, 1]) {
      const chain = new THREE.Group();
      chain.position.set(sx * 0.24, 0, 0);
      const pan = cyl(0.09, 0.08, 0.012, mat.chrome, 20);
      pan.position.y = -0.14;
      chain.add(pan);
      const panRing = torus(0.09, 0.006, mat.violetGlow, 6, 20);
      panRing.rotation.x = Math.PI / 2;
      panRing.position.y = -0.13;
      chain.add(panRing);
      chain.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.14, 0)]),
        new THREE.LineBasicMaterial({ color: 0xa78bfa })
      ));
      beamPivot.add(chain);
    }
    g.add(beamPivot);

    // weight set in cradle
    [0.035, 0.03, 0.025, 0.02].forEach((r, i) => {
      const w = cyl(r, r, 0.028, mat.chrome, 14);
      w.position.set(0.15 + i * 0.01, 0.07, 0.12);
      g.add(w);
    });

    animators.push((t) => {
      beamPivot.rotation.z = Math.sin(t * 0.65) * 0.05;
    });
    return g;
  }

  // —— Holographic data terminal ——

  const root = new THREE.Group();
  root.name = 'mechanics-station';

  const cradle = makeNewtonsCradle();
  cradle.position.set(-3.6, 0.93, -2.8);
  root.add(cradle);

  const pendulum = makePendulum();
  pendulum.position.set(-4.5, 0.93, -2.75);
  root.add(pendulum);

  const spring = makeSpringMass();
  spring.position.set(-5.3, 0.93, -2.8);
  root.add(spring);

  // Kept constructed for parity with the previous scene; it was not mounted.
  const balance = makeBalance();

  cradle.userData.interactive = true;
  pendulum.userData.interactive = true;
  spring.userData.interactive = true;

  const equipment = {
    cradleBalls: cradle.userData.cradleBalls,
    pendulumPivot: pendulum.userData.pendulumPivot,
    springGroup: spring.userData.springGroup,
    springMass: spring.userData.springMass,
    setPendulumLength: (L) => {
      const pivot = pendulum.userData.pendulumPivot;
      const bob = pendulum.userData.bob;
      if (!pivot || !bob) return;
      const len = Math.min(0.9, Math.max(0.4, L));
      bob.position.y = -len;
      pendulum.userData.stringLen = len;
    },
  };

  return {
    root,
    equipment,
    animators,
    prewarm: {},
    refs: { cradle, pendulum, spring, balance },
  };
}
