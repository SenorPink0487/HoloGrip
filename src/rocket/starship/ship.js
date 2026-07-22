import * as THREE from 'three';
import { createRaptor } from './raptor.js';
import { addHeatTiles, tileFlapTrapezoid } from './heatTiles.js';

/**
 * Starship upper stage (Block 2 visual, grounded in public flight hardware).
 * Specs (approx): height ~52 m, diameter 9 m, 3 SL + 3 RVac.
 * Origin: base of ship (engine mount plane), +Y up.
 * Windward = -Z (black hex tiles).
 */
export function createShip(mats) {
  const ship = new THREE.Group();
  ship.name = 'Starship';

  const R = 4.5; // radius
  const BODY_H = 38; // cylindrical / payload section
  const NOSE_H = 12; // nosecone
  const AFT_H = 2.2; // aft skirt / engine bay
  const TOTAL = AFT_H + BODY_H + NOSE_H; // ~52 m
  const RING_H = 1.83; // real stainless ring height

  // --- Main stainless body barrel ---
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, BODY_H, 72, 1, false),
    mats.steel
  );
  body.position.y = AFT_H + BODY_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  ship.add(body);

  // Barrel ring welds — real 301 stainless stack (subtle; major every ~4 rings)
  const ringCount = Math.round(BODY_H / RING_H);
  for (let i = 0; i <= ringCount; i++) {
    const y = AFT_H + (i / ringCount) * BODY_H;
    const major = i % 4 === 0;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.012, major ? 0.028 : 0.014, 6, 64),
      major ? mats.steelBright : mats.steelDark
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ship.add(ring);
  }

  // Four primary longitudinal seams (thin)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.12;
    const weld = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, BODY_H * 0.98, 0.022),
      mats.steelDark
    );
    weld.position.set(Math.sin(a) * (R + 0.008), AFT_H + BODY_H / 2, Math.cos(a) * (R + 0.008));
    ship.add(weld);
  }

  // Single common-dome band (real ships show one clear mid interface, not two thick collars)
  const midBand = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.028, R + 0.028, 0.55, 64),
    mats.steelBrushed || mats.steelDark
  );
  midBand.position.y = AFT_H + BODY_H * 0.42;
  ship.add(midBand);

  // --- Nosecone (smooth ogive via LatheGeometry) ---
  const nose = createNosecone(mats, R, NOSE_H);
  nose.position.y = AFT_H + BODY_H;
  ship.add(nose);

  // --- Aft skirt / boat-tail ---
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.97, R * 1.03, AFT_H, 64),
    mats.steelDark
  );
  skirt.position.y = AFT_H / 2;
  ship.add(skirt);

  // Aft ring reinforcements
  for (let i = 0; i < 3; i++) {
    const y = 0.3 + i * 0.7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R * (0.98 + i * 0.015), 0.04, 8, 48),
      mats.steelBright
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ship.add(ring);
  }

  // --- Heat shield: windward only (−Z), ~half circumference like flight hardware ---
  // Real Starship: black TPS on reentry face; leeward is bare stainless rings.
  const tilesBody = addHeatTiles(ship, mats, {
    radius: R,
    y0: AFT_H + 0.35,
    y1: AFT_H + BODY_H - 0.1,
    segments: 20,
    rows: 34,
    arc: Math.PI * 0.78,
    arcCenter: Math.PI,
    tileGap: 0.032,
  });

  const tilesNose = addHeatTiles(ship, mats, {
    radius: R,
    y0: AFT_H + BODY_H,
    y1: AFT_H + BODY_H + NOSE_H * 0.88,
    segments: 14,
    rows: 12,
    arc: Math.PI * 0.72,
    arcCenter: Math.PI,
    isNose: true,
    tileGap: 0.03,
  });

  // Mild windward soot (partial arc — not a full dark sleeve)
  if (mats.soot) {
    const soot = new THREE.Mesh(
      new THREE.CylinderGeometry(
        R + 0.03,
        R + 0.03,
        5.5,
        36,
        1,
        true,
        Math.PI - 0.55,
        Math.PI * 1.1
      ),
      mats.soot
    );
    soot.position.y = AFT_H + 3.2;
    ship.add(soot);
  }

  // --- Flaps (IFT pad pose: large aft pair + smaller forward pair) ---
  const flaps = createFlaps(mats, R, AFT_H, BODY_H, NOSE_H);
  ship.add(flaps);

  // --- Pez door: leeward (+Z) flush outline only ---
  const pez = createPezDoor(mats, R, AFT_H, BODY_H);
  ship.add(pez);

  // Leeward raceway — thin stainless cable tray (flight hardware)
  const raceway = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, BODY_H * 0.48, 0.045),
    mats.steelDark
  );
  raceway.position.set(R * 0.22, AFT_H + BODY_H * 0.4, R + 0.02);
  raceway.rotation.y = -0.18;
  ship.add(raceway);

  // --- Engines: 3 sea-level center + 3 RVac around ---
  const engines = new THREE.Group();
  engines.name = 'ShipEngines';
  engines.position.y = 0.12;

  // Engine bay thrust structure (simplified)
  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.4, 0.35, 24),
    mats.steelDark
  );
  puck.position.y = 0.15;
  ship.add(puck);

  // 3 SL Raptors in triangle
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const eng = createRaptor(mats, { vacuum: false, scale: 1 });
    eng.position.set(Math.cos(a) * 1.35, -eng.userData.height + 0.25, Math.sin(a) * 1.35);
    engines.add(eng);
  }

  // 3 RVac larger bells
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const eng = createRaptor(mats, { vacuum: true, scale: 1 });
    eng.position.set(Math.cos(a) * 2.75, -eng.userData.height + 0.4, Math.sin(a) * 2.75);
    engines.add(eng);
  }
  ship.add(engines);

  // Aft heat-shield / engine bay cover ring
  const aftShield = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.78, 0.14, 10, 48),
    mats.carbon
  );
  aftShield.rotation.x = Math.PI / 2;
  aftShield.position.y = 0.22;
  ship.add(aftShield);

  // Aft skirt vents — shallow slots only (engine bay)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.32, 0.028),
      mats.carbon
    );
    vent.position.set(Math.sin(a) * (R * 0.998), AFT_H * 0.52, Math.cos(a) * (R * 0.998));
    vent.lookAt(0, AFT_H * 0.52, 0);
    ship.add(vent);
  }

  ship.userData = {
    height: TOTAL,
    radius: R,
    tiles: [tilesBody, tilesNose, ...flaps.userData.tileGroups],
    flaps: flaps.userData.flapParts,
    engines,
    setTilesVisible(v) {
      for (const t of ship.userData.tiles) t.visible = v;
    },
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

  return ship;
}

/** Smooth stainless ogive nose via lathe profile. */
function createNosecone(mats, R, H) {
  const g = new THREE.Group();

  // Profile points: x = radius, y = height (lathe spins around Y)
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 at base, 1 at tip
    // Sears-Haack / ogive-ish: r = R * sqrt(1 - t^2) blended with blunt tip
    const ogive = Math.sqrt(Math.max(0, 1 - t * t * 0.98));
    const blunt = Math.pow(1 - t, 1.15);
    const r = R * (ogive * 0.55 + blunt * 0.45);
    pts.push(new THREE.Vector2(Math.max(0.04, r), t * H));
  }
  // Tip radius
  pts[pts.length - 1].x = 0.06;

  const lathe = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 64),
    mats.steel
  );
  lathe.castShadow = true;
  lathe.receiveShadow = true;
  g.add(lathe);

  // Ring welds on nose
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const ogive = Math.sqrt(Math.max(0, 1 - t * t * 0.98));
    const blunt = Math.pow(1 - t, 1.15);
    const r = R * (ogive * 0.55 + blunt * 0.45);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.01, 0.02, 6, 48),
      mats.steelDark
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t * H;
    g.add(ring);
  }

  // Tip / FTS (clean cone — no random antenna clutter)
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.35, 16),
    mats.steelBright
  );
  tip.position.y = H + 0.1;
  g.add(tip);

  return g;
}

/**
 * Pez payload door on leeward (+Z) — closed flush panel like flight hardware photos.
 */
function createPezDoor(mats, R, aftH, bodyH) {
  const g = new THREE.Group();
  g.name = 'PezDoor';

  const doorH = 4.2;
  const doorW = 2.3;
  const y = aftH + bodyH * 0.76;
  const zFace = R + 0.018;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(doorW + 0.14, doorH + 0.14, 0.03),
    mats.steelDark
  );
  frame.position.set(0, y, zFace);
  g.add(frame);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorW, doorH, 0.022),
    mats.steel
  );
  door.position.set(0, y, zFace + 0.014);
  g.add(door);

  // One mid seal line only
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(doorW * 0.88, 0.022, 0.016),
    mats.steelDark
  );
  line.position.set(0, y, zFace + 0.028);
  g.add(line);

  return g;
}

/**
 * Create trapezoidal flap plate geometry (wider at root / bottom).
 * Local: height along Y, width along X, thickness along Z.
 */
function makeTrapezoidPlate(wTop, wBot, h, thickness) {
  const shape = new THREE.Shape();
  const ht = h / 2;
  shape.moveTo(-wBot / 2, -ht);
  shape.lineTo(wBot / 2, -ht);
  shape.lineTo(wTop / 2, ht);
  shape.lineTo(-wTop / 2, ht);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  // Center on Z
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

/**
 * Flaps matching IFT pad photos (Block 1/2):
 *  - Aft: large trapezoids on windward flanks, ~20–25° open, TPS on outer face
 *  - Forward: smaller near nose, more closed against the barrel
 *
 * Local plate: height Y, span +X from hinge, thickness Z (outer face +Z).
 * Pivot: rotation.y = azimuth so +Z is radial; open about local Y swings free edge out.
 */
function createFlaps(mats, R, aftH, bodyH, noseH) {
  const group = new THREE.Group();
  group.name = 'Flaps';
  const flapParts = [];
  const tileGroups = [];

  /**
   * @param {object} opts
   * @param {number} opts.side  +1 / −1
   * @param {number} opts.azFromWindward  angle from pure windward (−Z) toward ±X
   * @param {number} opts.y  hinge mid height
   * @param {number} opts.open  open angle from fully closed (rad)
   */
  function buildFlap({
    name,
    side,
    azFromWindward,
    y,
    open,
    wBot,
    wTop,
    h,
    thick,
    tile = true,
  }) {
    const pivot = new THREE.Group();
    pivot.name = name;

    // Hinge azimuth: windward center is π (cos=−1 → −Z)
    const az = Math.PI + side * azFromWindward;
    pivot.position.set(Math.sin(az) * R, y, Math.cos(az) * R);
    pivot.rotation.order = 'YXZ';
    // Closed = plate tangent; open swings free edge outboard
    pivot.rotation.y = az + side * open;

    const plate = new THREE.Mesh(
      makeTrapezoidPlate(wTop, wBot, h, thick),
      mats.steel
    );
    plate.position.set(side * (wBot / 2), 0, thick * 0.5 + 0.02);
    plate.castShadow = true;
    pivot.add(plate);

    // Thin outboard edge
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(thick * 0.55, thick * 0.55, h * 0.9, 10),
      mats.steelDark
    );
    cap.position.set(side * wBot, 0, thick * 0.5 + 0.02);
    pivot.add(cap);

    // Compact hinge fairing at root (stainless, flush scale)
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, h * 0.35, 10),
      mats.steelBright || mats.steelDark
    );
    hinge.position.set(side * 0.06, -h * 0.05, 0.04);
    pivot.add(hinge);

    if (tile) {
      const tiles = tileFlapTrapezoid(plate, mats, wTop, wBot, h);
      tileGroups.push(tiles);
    }

    group.add(pivot);
    flapParts.push({ mesh: pivot, axis: 'y', rest: az + side * open, sign: side });
    return pivot;
  }

  // Aft flaps — ~1/5 of ship height, windward flanks (IFT pad)
  for (const side of [1, -1]) {
    buildFlap({
      name: side > 0 ? 'AftFlapL' : 'AftFlapR',
      side,
      azFromWindward: 0.78,
      y: aftH + 5.2,
      open: 0.4,
      wBot: 3.2,
      wTop: 2.35,
      h: 8.4,
      thick: 0.11,
      tile: true,
    });
  }

  // Forward flaps — smaller, higher, closer to body (more closed)
  for (const side of [1, -1]) {
    buildFlap({
      name: side > 0 ? 'FwdFlapL' : 'FwdFlapR',
      side,
      azFromWindward: 1.05,
      y: aftH + bodyH + noseH * 0.2,
      open: 0.18,
      wBot: 2.0,
      wTop: 1.25,
      h: 4.2,
      thick: 0.09,
      tile: true,
    });
  }

  group.userData = { flapParts, tileGroups };
  return group;
}
