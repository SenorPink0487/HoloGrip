import * as THREE from 'three';
import { createRaptor } from './raptor.js';

/**
 * Super Heavy booster (Block 2 visual, with detailed grid fins & chines).
 * Specs (approx): height ~71–72 m, diameter 9 m, 33 Raptors (3+10+20).
 * Origin: engine mount plane at y=0, +Y up.
 */
export function createSuperHeavy(mats) {
  const booster = new THREE.Group();
  booster.name = 'SuperHeavy';

  const R = 4.5;
  const H = 69;
  const INTERSTAGE = 3.2;
  const RING_H = 1.83;

  // Main barrel
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, H, 72),
    mats.steel
  );
  body.position.y = H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  booster.add(body);

  // Circumferential ring welds (subtle 1.83 m stack)
  const rings = Math.round(H / RING_H);
  for (let i = 0; i <= rings; i++) {
    const y = (i / rings) * H;
    const major = i % 4 === 0;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.012, major ? 0.026 : 0.013, 6, 64),
      major ? mats.steelBright : mats.steelDark
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    booster.add(ring);
  }

  // Longitudinal seams
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    const weld = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, H * 0.98, 0.02),
      mats.steelDark
    );
    weld.position.set(Math.sin(a) * (R + 0.008), H / 2, Math.cos(a) * (R + 0.008));
    booster.add(weld);
  }

  // Common dome band
  const domeBand = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.025, R + 0.025, 0.5, 64),
    mats.steelBrushed || mats.steelDark
  );
  domeBand.position.y = H * 0.58;
  booster.add(domeBand);

  // Hot-staging / interstage ring (vented lattice)
  const inter = createHotStageRing(mats, R, INTERSTAGE);
  inter.position.y = H;
  booster.add(inter);

  // Grid fins (4) — Block 1/2 waffle-iron style, permanently extended
  const gridFins = createGridFins(mats, R, H);
  booster.add(gridFins);

  // Catch hardpoints between grid fins (Mechazilla pins)
  createCatchPins(booster, mats, R, H);

  // Aerodynamic chines + COPV housings (lower oxygen tank region)
  createChines(booster, mats, R, H);

  // Aft section thickening / engine bay
  const aftBay = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.015, R * 1.04, 5.0, 64),
    mats.steelDark
  );
  aftBay.position.y = 2.5;
  booster.add(aftBay);

  // Aft bay rings
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R * (1.01 + i * 0.008), 0.035, 6, 48),
      mats.steelBright
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6 + i * 1.1;
    booster.add(ring);
  }

  // Aft vents — shallow only
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.45, 0.04),
      mats.carbon
    );
    vent.position.set(Math.sin(a) * (R * 1.005), 3.6, Math.cos(a) * (R * 1.005));
    vent.lookAt(0, 3.6, 0);
    booster.add(vent);
  }

  // Primary raceway — thin stainless cable tray (not a color block)
  const raceway = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, H * 0.65, 0.06),
    mats.steelDark
  );
  raceway.position.set(R + 0.04, H * 0.42, 0);
  booster.add(raceway);

  // 33 Raptor engines: 3 + 10 + 20
  const engines = new THREE.Group();
  engines.name = 'BoosterEngines';
  engines.position.y = 0.1;

  // Center triangle (3)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const eng = createRaptor(mats, { scale: 1 });
    eng.position.set(Math.cos(a) * 0.85, -eng.userData.height + 0.15, Math.sin(a) * 0.85);
    engines.add(eng);
  }
  // Middle ring (10)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const eng = createRaptor(mats, { scale: 1 });
    eng.position.set(Math.cos(a) * 1.85, -eng.userData.height + 0.15, Math.sin(a) * 1.85);
    engines.add(eng);
  }
  // Outer ring (20)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + Math.PI / 20;
    const eng = createRaptor(mats, { scale: 0.98 });
    eng.position.set(Math.cos(a) * 3.35, -eng.userData.height + 0.15, Math.sin(a) * 3.35);
    engines.add(eng);
  }
  booster.add(engines);

  // Engine bay heat shield ring under skirt
  const bayShield = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.95, 0.1, 8, 48),
    mats.carbon
  );
  bayShield.rotation.x = Math.PI / 2;
  bayShield.position.y = 0.15;
  booster.add(bayShield);

  // Mild soot / dark band near aft
  const soot = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.03, R + 0.03, 9, 48, 1, true),
    mats.soot ||
      new THREE.MeshStandardMaterial({
        color: 0x5a5e66,
        metalness: 0.7,
        roughness: 0.55,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
  );
  soot.position.y = 6.5;
  booster.add(soot);

  booster.userData = {
    height: H + INTERSTAGE,
    bodyHeight: H,
    radius: R,
    engines,
    gridFins,
    setEngineGlow(v) {
      engines.traverse((o) => {
        if (o.name === 'engineGlow' || o.name === 'plume') o.visible = v;
        // Mach diamonds only appear under real thrust (launchSequence)
        if (o.name === 'machDiamonds' || o.name === 'machRing') {
          if (!v) o.visible = false;
        }
      });
    },
  };

  return booster;
}

/** Vented hot-staging interstage with lattice openings. */
function createHotStageRing(mats, R, H) {
  const inter = new THREE.Group();
  inter.name = 'HotStageRing';

  // Outer shell (open cylinder)
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.01, R * 0.995, H, 48, 1, true),
    mats.steelDark
  );
  shell.position.y = H / 2;
  inter.add(shell);

  // Top & bottom rims
  for (const y of [0.08, H - 0.08]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.005, 0.06, 8, 48),
      mats.steelBright
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    inter.add(rim);
  }

  // Lattice vents — alternating tall openings
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Vertical stringers
    const strut = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, H * 0.92, 0.12),
      mats.steel
    );
    strut.position.set(Math.sin(a) * R, H / 2, Math.cos(a) * R);
    strut.lookAt(0, H / 2, 0);
    inter.add(strut);

    // Dark vent panel between stringers
    if (i % 2 === 0) {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, H * 0.55, 0.06),
        mats.carbon
      );
      const a2 = a + Math.PI / n;
      vent.position.set(Math.sin(a2) * (R * 0.99), H * 0.48, Math.cos(a2) * (R * 0.99));
      vent.lookAt(0, H * 0.48, 0);
      inter.add(vent);
    }
  }

  // Horizontal lattice bands
  for (let k = 1; k <= 2; k++) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.0, 0.04, 6, 48),
      mats.steelDark
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = (k / 3) * H;
    inter.add(band);
  }

  return inter;
}

/** Four permanently-deployed grid fins with waffle lattice. */
function createGridFins(mats, R, H) {
  const group = new THREE.Group();
  group.name = 'GridFins';
  const fins = [];

  // Paired 60° spacing like flight hardware (adjacent pairs)
  const angles = [
    Math.PI / 4 - 0.35,
    Math.PI / 4 + 0.35,
    Math.PI / 4 - 0.35 + Math.PI,
    Math.PI / 4 + 0.35 + Math.PI,
  ];

  for (let i = 0; i < 4; i++) {
    const a = angles[i];
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * (R + 0.08), H * 0.9, Math.cos(a) * (R + 0.08));
    pivot.rotation.y = a;

    const frameW = 2.9;
    const frameH = 2.6;
    const depth = 0.35;

    // Outer frame (hollow look via edge bars)
    const frameMat = mats.gridFin;
    // Back plate (thin)
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(frameW, frameH, 0.06),
      frameMat
    );
    back.position.set(frameW / 2 + 0.35, 0, 0);
    pivot.add(back);

    // Perimeter frame thicker
    const edges = [
      { s: [frameW, 0.12, depth], p: [frameW / 2 + 0.35, frameH / 2, depth / 2] },
      { s: [frameW, 0.12, depth], p: [frameW / 2 + 0.35, -frameH / 2, depth / 2] },
      { s: [0.12, frameH, depth], p: [0.35, 0, depth / 2] },
      { s: [0.12, frameH, depth], p: [frameW + 0.35, 0, depth / 2] },
    ];
    for (const e of edges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...e.s), frameMat);
      m.position.set(...e.p);
      pivot.add(m);
    }

    // Waffle lattice (grid)
    const gx = 7;
    const gy = 6;
    for (let x = 0; x <= gx; x++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, frameH * 0.9, depth * 0.75),
        mats.steelDark
      );
      bar.position.set(0.35 + (x / gx) * frameW, 0, depth * 0.4);
      pivot.add(bar);
    }
    for (let y = 0; y <= gy; y++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(frameW * 0.9, 0.045, depth * 0.75),
        mats.steelDark
      );
      bar.position.set(0.35 + frameW / 2, -frameH / 2 + (y / gy) * frameH, depth * 0.4);
      pivot.add(bar);
    }

    // Rounded leading edge (outboard tip)
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(depth * 0.45, depth * 0.45, frameH * 0.95, 12),
      frameMat
    );
    tip.position.set(frameW + 0.35, 0, depth * 0.35);
    pivot.add(tip);

    // Compact hinge root (real Super Heavy — no giant actuator cubes)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.7, 0.45),
      mats.steel
    );
    base.position.set(0.15, 0, 0.1);
    pivot.add(base);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.55, 10),
      mats.steelBright
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(0.38, 0, 0.08);
    pivot.add(shaft);

    pivot.userData.restX = -0.08;
    pivot.userData.phase = i * 1.2;
    pivot.rotation.x = pivot.userData.restX;
    group.add(pivot);
    fins.push(pivot);
  }

  group.userData.fins = fins;
  return group;
}

/** Mechazilla catch hardpoints — compact, not bulky boxes. */
function createCatchPins(booster, mats, R, H) {
  for (const side of [-1, 1]) {
    const yBase = H * 0.88;
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12),
      mats.steelBright
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(side * (R + 0.35), yBase, 0);
    booster.add(pin);

    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.2, 0.7),
      mats.steelDark
    );
    block.position.set(side * (R + 0.08), yBase, 0);
    booster.add(block);
  }
}

/**
 * Lower chines — low-profile fairings only (real Super Heavy has slender
 * aero strakes, not hanging COPV clusters).
 */
function createChines(booster, mats, R, H) {
  const angles = [0.45, Math.PI - 0.45, Math.PI + 0.45, -0.45];
  const y = H * 0.2;

  for (const a of angles) {
    const chine = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 7.2, 0.22),
      mats.steelDark
    );
    chine.position.set(Math.sin(a) * (R + 0.08), y, Math.cos(a) * (R + 0.08));
    chine.lookAt(0, y, 0);
    booster.add(chine);
  }
}
