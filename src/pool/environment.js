import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM } from './scene-config.js';

const TAU = Math.PI * 2;

export function createPoolHall(scene) {
  const root = new THREE.Group();
  root.name = 'reference-pool-room';
  const { width: roomW, depth: roomD, height: roomH, floorY } = ROOM;

  const stone = textureMaterial(makeStoneTexture(), 0xaaa399, 0.78);
  const wall = textureMaterial(makeWallTexture(), 0xbcb2a6, 0.92);
  const wood = textureMaterial(makeWoodTexture(), 0x4a2b1b, 0.58);
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.62 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a2019, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb48a48, roughness: 0.3, metalness: 0.72 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x62564b, roughness: 0.96 });
  const sheer = new THREE.MeshStandardMaterial({ color: 0xf0eee9, roughness: 1, transparent: true, opacity: 0.68, side: THREE.DoubleSide });

  addFloor(root, roomW, roomD, floorY, stone);
  addRoomShell(root, roomW, roomD, roomH, floorY, wall, trim);
  addLayeredCeiling(root, roomW, roomD, roomH, floorY);
  addBackWall(root, roomD, floorY, wall, wood, woodDark, brass);
  addFrontDetails(root, roomW, roomD, floorY, wall, wood, woodDark, brass, fabric, sheer);
  addPendant(root, floorY, brass);
  addLighting(root, roomW, roomD, roomH, floorY);

  scene.add(root);
  return { root, floorY, roomW, roomD, roomH };
}

function textureMaterial(map, color, roughness) {
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, color, roughness, metalness: 0.02 });
}

function addFloor(root, w, d, y, material) {
  material.map.repeat.set(5.5, 3.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.receiveShadow = true;
  root.add(floor);
  // No coplanar Line grid — thin lines at y+ε z-fight with the floor and flash on walls.

  const rugTexture = makeRugTexture();
  rugTexture.wrapS = rugTexture.wrapT = THREE.RepeatWrapping;
  rugTexture.repeat.set(3, 2);
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTexture, color: 0xc2b8ad, roughness: 0.98 });
  const rug = new THREE.Mesh(new RoundedBoxGeometry(4.45, 0.025, 2.55, 6, 0.12), rugMat);
  rug.position.set(0, y + 0.014, 0);
  rug.receiveShadow = true;
  root.add(rug);
}

function addRoomShell(root, w, d, h, floorY, wall, trim) {
  const wallY = floorY + h / 2;
  const doorX = 5.18;
  const doorOpeningW = 1.36;
  const doorOpeningH = 2.48;
  const doorLeft = doorX - doorOpeningW / 2;
  const doorRight = doorX + doorOpeningW / 2;
  // Keep the baseboards' bottom faces clear of the floor plane.  When they
  // share the exact same Y value, the depth buffer alternates between both
  // surfaces as the camera moves and produces a flickering, saw-toothed line.
  const trimHeight = 0.1;
  const trimFloorClearance = 0.004;
  const trimY = floorY + trimHeight / 2 + trimFloorClearance;
  box(root, [w, h, 0.12], [0, wallY, -d / 2], wall, false, true);
  // Build the front wall around a real doorway instead of hiding the door behind a solid wall.
  box(root, [doorLeft + w / 2, h, 0.12], [(-w / 2 + doorLeft) / 2, wallY, d / 2], wall, false, true);
  box(root, [w / 2 - doorRight, h, 0.12], [(doorRight + w / 2) / 2, wallY, d / 2], wall, false, true);
  box(root, [doorOpeningW, h - doorOpeningH, 0.12], [doorX, floorY + doorOpeningH + (h - doorOpeningH) / 2, d / 2], wall, false, true);
  box(root, [0.12, h, d], [-w / 2, wallY, 0], wall, false, true);
  box(root, [0.12, h, d], [w / 2, wallY, 0], wall, false, true);
  box(root, [w, trimHeight, 0.1], [0, trimY, -d / 2 + 0.08], trim);
  box(root, [0.1, trimHeight, d], [-w / 2 + 0.08, trimY, 0], trim);
  box(root, [0.1, trimHeight, d], [w / 2 - 0.08, trimY, 0], trim);
  box(root, [doorLeft + w / 2, trimHeight, 0.1], [(-w / 2 + doorLeft) / 2, trimY, d / 2 - 0.08], trim);
  box(root, [w / 2 - doorRight, trimHeight, 0.1], [(doorRight + w / 2) / 2, trimY, d / 2 - 0.08], trim);

  // Calm vertical wall panels give the room scale and avoid blank billboard-like walls.
  const panelTrim = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 0.84 });
  for (const z of [-d / 2 + 0.068, d / 2 - 0.068]) {
    for (let x = -4.8; x <= 4.8; x += 1.2) {
      if (z > 0 && x > doorLeft && x < doorRight) continue;
      box(root, [0.018, h - 0.5, 0.018], [x, floorY + h / 2, z + (z < 0 ? 0.01 : -0.01)], panelTrim);
    }
  }
  for (const x of [-w / 2 + 0.068, w / 2 - 0.068]) {
    for (let z = -2.5; z <= 2.5; z += 1.25) box(root, [0.018, h - 0.5, 0.018], [x + (x < 0 ? 0.01 : -0.01), floorY + h / 2, z], panelTrim);
  }
}

function addLayeredCeiling(root, w, d, h, floorY) {
  const ceilingY = floorY + h;
  const white = new THREE.MeshStandardMaterial({ color: 0xd7d0c7, roughness: 0.94, side: THREE.DoubleSide });
  const cove = new THREE.MeshStandardMaterial({ color: 0xffd49a, emissive: 0xffb55b, emissiveIntensity: 1.4, toneMapped: false });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), white);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceilingY;
  root.add(ceiling);

  const soffit = new THREE.MeshStandardMaterial({ color: 0xc9c1b7, roughness: 0.92 });
  box(root, [w - 0.2, 0.18, 0.62], [0, ceilingY - 0.09, -d / 2 + 0.31], soffit);
  box(root, [w - 0.2, 0.18, 0.62], [0, ceilingY - 0.09, d / 2 - 0.31], soffit);
  box(root, [0.62, 0.18, d - 1.24], [-w / 2 + 0.31, ceilingY - 0.09, 0], soffit);
  box(root, [0.62, 0.18, d - 1.24], [w / 2 - 0.31, ceilingY - 0.09, 0], soffit);

  // A quiet central tray ceiling: four continuous warm lines frame the billiard zone.
  const trayW = w - 1.65;
  const trayD = d - 1.5;
  box(root, [trayW, 0.035, 0.035], [0, ceilingY - 0.205, -trayD / 2], cove);
  box(root, [trayW, 0.035, 0.035], [0, ceilingY - 0.205, trayD / 2], cove);
  box(root, [0.035, 0.035, trayD], [-trayW / 2, ceilingY - 0.205, 0], cove);
  box(root, [0.035, 0.035, trayD], [trayW / 2, ceilingY - 0.205, 0], cove);
  const bronzeLine = new THREE.MeshStandardMaterial({ color: 0x7d6043, roughness: 0.42, metalness: 0.5 });
  box(root, [trayW - 0.35, 0.025, 0.018], [0, ceilingY - 0.225, -trayD / 2 + 0.22], bronzeLine);
  box(root, [trayW - 0.35, 0.025, 0.018], [0, ceilingY - 0.225, trayD / 2 - 0.22], bronzeLine);
}

function addWaveBand(root, width, z, y, depth, bend, material) {
  const segments = 48;
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const x = -width / 2 + (i / segments) * width;
    const wave = Math.cos((x / width) * TAU) * bend;
    vertices.push(x, y, z + wave, x, y, z + depth + wave);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  root.add(new THREE.Mesh(geometry, material));
}

function addWaveStrip(root, width, z, y, bend, material) {
  const points = [];
  for (let i = 0; i <= 72; i++) {
    const x = -width / 2 + (i / 72) * width;
    points.push(new THREE.Vector3(x, y, z + Math.cos((x / width) * TAU) * bend));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.025, 6, false), material));
}

function addBackWall(root, roomD, floorY, wall, wood, woodDark, brass) {
  const z = -roomD / 2 + 0.09;
  box(root, [3.15, 2.72, 0.08], [0, floorY + 1.42, z + 0.04], wall);
  for (const x of [-1.58, 1.58]) box(root, [0.035, 2.68, 0.05], [x, floorY + 1.42, z + 0.1], woodDark);
  addPicture(root, 0, floorY + 1.82, z + 0.12, 1.38, 0.68, 'landscape', woodDark);
  addCueRack(root, -2.45, floorY, z + 0.15, woodDark, brass);
  addArmchair(root, 2.08, floorY, z + 0.68, woodDark, Math.PI - 0.1);
  addArmchair(root, 3.32, floorY, z + 0.68, woodDark, Math.PI + 0.1);
  addSideTable(root, 2.7, floorY, z + 0.82, brass);
  addSconce(root, 3.35, floorY + 1.65, z + 0.17, brass);
}

function addFrontDetails(root, roomW, roomD, floorY, wall, wood, woodDark, brass, fabric, sheer) {
  const z = roomD / 2 - 0.08;
  addCabinet(root, -4.38, floorY, z, wood, woodDark, 'ceramics');
  addWindow(root, -2.72, floorY, z, fabric, sheer);
  addPlant(root, -1.47, floorY, z - 0.45);
  addCabinet(root, 3.55, floorY, z, wood, woodDark, 'collector');
  addConsole(root, 0.62, floorY, z - 0.17, wood, woodDark, brass);
  addPicture(root, 0.62, floorY + 1.58, z - 0.11, 0.82, 1.1, 'portrait', woodDark);
  addDoor(root, 5.18, floorY, z + 0.065, Math.PI, wood, brass);
}

function addConsole(root, x, floorY, z, wood, dark, brass) {
  const g = new THREE.Group();
  const body = roundedBox(g, [1.55, 0.48, 0.38], [0, floorY + 0.46, 0], wood, 0.035, true);
  for (const sx of [-0.37, 0.37]) box(g, [0.012, 0.36, 0.018], [sx, floorY + 0.46, -0.2], brass);
  for (const sx of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.25, 10), dark);
    leg.position.set(sx, floorY + 0.125, 0); g.add(leg);
  }
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.035, 0.42, 4, 0.025), new THREE.MeshPhysicalMaterial({ color: 0x9a8b7c, roughness: 0.3, clearcoat: 0.2 }));
  top.position.set(0, floorY + 0.72, 0); g.add(top);
  addSculpture(g, -0.37, floorY + 0.74, -0.02, brass);
  addCeramicVase(g, 0.43, floorY + 0.74, -0.02, 0.95, new THREE.MeshPhysicalMaterial({ color: 0xb8c2b6, roughness: 0.35 }));
  g.position.set(x, 0, z); root.add(g);
  void body;
}

function addCabinet(root, x, floorY, z, wood, dark, collection) {
  const g = new THREE.Group();
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xe8dfcf, roughness: 0.32, clearcoat: 0.35 });
  const celadon = new THREE.MeshPhysicalMaterial({ color: 0x779b8b, roughness: 0.38, clearcoat: 0.28 });
  const amber = new THREE.MeshPhysicalMaterial({ color: 0x9b5627, roughness: 0.3, metalness: 0.05, clearcoat: 0.45 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8d6738, roughness: 0.34, metalness: 0.74 });
  const bookMats = [0x493127, 0x7b6044, 0x33483d, 0xa08b68].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));

  // Recessed dark niche, thick side frames and floating shelves.
  box(g, [1.08, 2.28, 0.1], [0, floorY + 1.35, 0.08], dark);
  box(g, [0.08, 2.28, 0.44], [-0.54, floorY + 1.35, -0.1], wood);
  box(g, [0.08, 2.28, 0.44], [0.54, floorY + 1.35, -0.1], wood);
  roundedBox(g, [1.18, 0.13, 0.48], [0, floorY + 2.52, -0.1], wood, 0.025, true);
  box(g, [1.04, 0.035, 0.4], [0, floorY + 2.445, -0.1], dark);
  box(g, [0.94, 0.78, 0.44], [0, floorY + 0.39, -0.1], wood);
  box(g, [0.018, 0.62, 0.02], [0, floorY + 0.37, -0.33], bronze);
  for (let i = 0; i < 4; i++) {
    const sy = floorY + 0.88 + i * 0.39;
    box(g, [0.96, 0.038, 0.39], [0, sy, -0.12], wood, true);
  }

  if (collection === 'ceramics') {
    // Quiet oriental ceramics: asymmetrical groups with generous negative space.
    addLiddedJar(g, -0.25, floorY + 0.91, -0.19, 0.76, celadon, bronze);
    addBooks(g, 0.2, floorY + 0.91, -0.18, bookMats, 3, false);
    addCeramicVase(g, -0.29, floorY + 1.31, -0.18, 0.78, porcelain);
    addMiniBowl(g, 0.21, floorY + 1.31, -0.18, amber);
    addStoneOrb(g, 0.37, floorY + 1.36, -0.18, celadon, bronze);
    addBooks(g, -0.4, floorY + 1.69, -0.18, bookMats, 3, true);
    addCeramicVase(g, 0.12, floorY + 1.70, -0.18, 0.96, celadon);
    addArchObject(g, 0.35, floorY + 1.70, -0.18, bronze);
    addBirdSculpture(g, -0.22, floorY + 2.09, -0.18, bronze);
    addLiddedJar(g, 0.25, floorY + 2.08, -0.18, 0.62, porcelain, bronze);
  } else {
    // Personal collection: books, framed print, trophy, hourglass and modern art.
    addBooks(g, -0.37, floorY + 0.91, -0.18, bookMats, 5, true);
    addFramedMiniature(g, 0.18, floorY + 0.91, -0.19, dark, porcelain);
    addHourglass(g, 0.37, floorY + 0.91, -0.18, bronze, amber);
    addSculpture(g, -0.25, floorY + 1.30, -0.18, bronze);
    addBooks(g, 0.22, floorY + 1.30, -0.18, [...bookMats].reverse(), 3, false);
    addTrophy(g, -0.32, floorY + 1.69, -0.18, bronze);
    addBirdSculpture(g, 0.08, floorY + 1.69, -0.18, amber);
    addStoneOrb(g, 0.38, floorY + 1.75, -0.18, porcelain, bronze);
    addArchObject(g, -0.25, floorY + 2.08, -0.18, bronze);
    addFramedMiniature(g, 0.22, floorY + 2.08, -0.19, bronze, celadon);
  }

  g.position.set(x, 0, z);
  root.add(g);
}

function addFramedMiniature(root, x, y, z, frameMaterial, artMaterial) {
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.16, 0.025, 3, 0.012), frameMaterial);
  frame.position.set(x, y + 0.085, z); frame.castShadow = true; root.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.112), artMaterial);
  art.position.set(x, y + 0.085, z - 0.014); art.rotation.y = Math.PI; root.add(art);
  box(root, [0.16, 0.018, 0.08], [x, y + 0.009, z + 0.015], frameMaterial);
}

function addHourglass(root, x, y, z, metal, sand) {
  for (const yy of [y + 0.012, y + 0.16]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.018, 16), metal);
    plate.position.set(x, yy, z); root.add(plate);
  }
  for (const ox of [-0.047, 0.047]) for (const oz of [-0.028, 0.028]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 7), metal);
    post.position.set(x + ox, y + 0.086, z + oz); root.add(post);
  }
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.05, 0.07, 16), new THREE.MeshPhysicalMaterial({ color: 0xe8ddd0, transparent: true, opacity: 0.32, roughness: 0.05 }));
  glass.position.set(x, y + 0.052, z); root.add(glass);
  const upper = glass.clone(); upper.rotation.z = Math.PI; upper.position.y = y + 0.12; root.add(upper);
  const sandCone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.045, 14), sand);
  sandCone.position.set(x, y + 0.038, z); root.add(sandCone);
}

function addTrophy(root, x, y, z, material) {
  box(root, [0.12, 0.025, 0.09], [x, y + 0.012, z], material);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.09, 12), material);
  stem.position.set(x, y + 0.065, z); root.add(stem);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 9, 0, TAU, 0, Math.PI * 0.56), material);
  cup.scale.y = 0.8; cup.position.set(x, y + 0.14, z); root.add(cup);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.008, 7, 14, Math.PI), material);
    handle.rotation.z = side * Math.PI / 2; handle.position.set(x + side * 0.06, y + 0.14, z); root.add(handle);
  }
}

function addCeramicVase(root, x, y, z, scale, material) {
  const profile = [
    [0.035, 0], [0.075, 0.018], [0.085, 0.08], [0.074, 0.15],
    [0.046, 0.205], [0.04, 0.25], [0.052, 0.262],
  ].map(([px, py]) => new THREE.Vector2(px * scale, py * scale));
  const vase = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), material);
  vase.position.set(x, y, z); vase.castShadow = true; root.add(vase);
}

function addLiddedJar(root, x, y, z, scale, material, accent) {
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.095 * scale, 16, 10), material);
  body.scale.y = 1.2; body.position.set(x, y + 0.09 * scale, z); body.castShadow = true; root.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.055 * scale, 0.035 * scale, 14), accent);
  neck.position.set(x, y + 0.19 * scale, z); root.add(neck);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.024 * scale, 10, 6), accent);
  lid.position.set(x, y + 0.225 * scale, z); root.add(lid);
}

function addBooks(root, x, y, z, materials, count, upright) {
  for (let i = 0; i < count; i++) {
    const size = upright ? [0.035 + (i % 2) * 0.008, 0.16 - i * 0.008, 0.12] : [0.19 - i * 0.018, 0.025, 0.12];
    const pos = upright ? [x + i * 0.043, y + size[1] / 2, z] : [x, y + 0.014 + i * 0.027, z];
    const book = box(root, size, pos, materials[i % materials.length], true);
    if (upright) book.rotation.z = (i - 1) * 0.025;
    const band = box(root, upright ? [size[0] + 0.002, 0.012, 0.123] : [0.025, size[1] + 0.002, 0.123],
      upright ? [pos[0], y + size[1] * 0.68, z - 0.002] : [x + size[0] * 0.28, pos[1], z - 0.002],
      new THREE.MeshStandardMaterial({ color: 0xc7ad77, roughness: 0.62 }));
    band.rotation.copy(book.rotation);
  }
}

function addSculpture(root, x, y, z, material) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.025, 16), material);
  base.position.set(x, y + 0.012, z); root.add(base);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.065, 0.018, 48, 8, 2, 3), material);
  knot.scale.set(0.9, 1.2, 0.65); knot.rotation.x = 0.25; knot.position.set(x, y + 0.105, z); knot.castShadow = true; root.add(knot);
}

function addMiniBowl(root, x, y, z, material) {
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.48), material);
  bowl.scale.y = 0.55; bowl.rotation.x = Math.PI; bowl.position.set(x, y + 0.04, z); root.add(bowl);
}

function addStoneOrb(root, x, y, z, material, baseMaterial) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.025, 12), baseMaterial); base.position.set(x, y - 0.03, z); root.add(base);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.057, 16, 12), material); orb.position.set(x, y + 0.025, z); orb.castShadow = true; root.add(orb);
}

function addArchObject(root, x, y, z, material) {
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 22, Math.PI * 1.6), material);
  arch.rotation.z = Math.PI * 0.2; arch.position.set(x, y + 0.085, z); root.add(arch);
  box(root, [0.18, 0.022, 0.08], [x, y + 0.012, z], material);
}

function addBirdSculpture(root, x, y, z, material) {
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 9), material); body.scale.set(1.35, 0.72, 0.62); body.position.set(x, y + 0.085, z); root.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.1, 8), material); neck.rotation.z = -0.55; neck.position.set(x + 0.055, y + 0.14, z); root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 7), material); head.position.set(x + 0.09, y + 0.18, z); root.add(head);
  box(root, [0.18, 0.018, 0.08], [x, y + 0.012, z], material);
}

function addWindow(root, x, floorY, z, fabric, sheer) {
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.05), new THREE.MeshBasicMaterial({ color: 0xe9f3ee }));
  glow.position.set(x, floorY + 1.42, z - 0.02);
  glow.rotation.y = Math.PI;
  root.add(glow);
  box(root, [1.4, 0.07, 0.1], [x, floorY + 0.4, z - 0.08], new THREE.MeshStandardMaterial({ color: 0xddd7ce }));
  for (const [offset, mat, width] of [[-0.58, fabric, 0.46], [0.58, fabric, 0.46], [-0.25, sheer, 0.5], [0.25, sheer, 0.5]]) {
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.35, 12, 1), mat);
    const p = curtain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 38) * 0.035);
    p.needsUpdate = true;
    curtain.position.set(x + offset, floorY + 1.28, z - 0.16);
    curtain.rotation.y = Math.PI;
    root.add(curtain);
  }
}

function addDoor(root, x, floorY, z, rotY, material, brass) {
  const g = new THREE.Group();
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2b1c, roughness: 0.48, metalness: 0.02 });
  const insetMat = new THREE.MeshStandardMaterial({ color: 0x3a2117, roughness: 0.55 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x211b17, roughness: 0.32, metalness: 0.62 });
  // A slightly oversized jamb liner seals the wall opening at oblique camera angles.
  box(g, [1.39, 2.5, 0.075], [0, floorY + 1.25, -0.035], material, true);
  box(g, [1.08, 2.34, 0.12], [0, floorY + 1.17, 0.025], doorMat, true);

  // Deep casing and stepped architrave around the doorway.
  box(g, [1.39, 0.14, 0.18], [0, floorY + 2.41, 0.035], material, true);
  for (const sx of [-0.61, 0.61]) box(g, [0.15, 2.48, 0.18], [sx, floorY + 1.24, 0.035], material, true);
  box(g, [1.14, 0.035, 0.19], [0, floorY + 0.035, 0.04], blackMetal);

  // All decorative parts sit on the room-facing side of the rotated door group.
  for (const [yy, ph] of [[floorY + 0.62, 0.72], [floorY + 1.58, 0.82]]) {
    roundedBox(g, [0.78, ph, 0.035], [0, yy, 0.095], insetMat, 0.025, true);
    roundedBox(g, [0.66, ph - 0.12, 0.025], [0, yy, 0.118], doorMat, 0.02);
    for (const sx of [-0.355, 0.355]) box(g, [0.022, ph - 0.08, 0.018], [sx, yy, 0.137], brass);
    for (const sy of [yy - ph / 2 + 0.05, yy + ph / 2 - 0.05]) box(g, [0.72, 0.022, 0.018], [0, sy, 0.137], brass);
  }
  box(g, [0.9, 0.095, 0.04], [0, floorY + 1.12, 0.105], insetMat);

  const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.018, 24), brass);
  escutcheon.rotation.x = Math.PI / 2; escutcheon.position.set(0.36, floorY + 1.08, 0.145); g.add(escutcheon);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 16), brass);
  spindle.rotation.x = Math.PI / 2; spindle.position.set(0.36, floorY + 1.08, 0.19); g.add(spindle);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 5, 12), brass);
  handle.rotation.z = Math.PI / 2; handle.position.set(0.28, floorY + 1.08, 0.24); handle.castShadow = true; g.add(handle);
  const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.016, 12), blackMetal);
  keyhole.position.set(0.36, floorY + 0.94, 0.151); g.add(keyhole);

  for (const yy of [floorY + 0.42, floorY + 1.18, floorY + 1.94]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 12), brass);
    hinge.position.set(-0.56, yy, 0.11); hinge.castShadow = true; g.add(hinge);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
}

function addPicture(root, x, y, z, w, h, kind, frameMat) {
  box(root, [w + 0.07, h + 0.07, 0.035], [x, y, z], frameMat);
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 240;
  const c = canvas.getContext('2d');
  c.fillStyle = kind === 'portrait' ? '#40392d' : '#d8d0c1'; c.fillRect(0, 0, canvas.width, canvas.height);
  if (kind === 'portrait') {
    // The actual framed portrait is loaded below; this neutral fill avoids a flash of the old artwork.
  } else {
    c.fillStyle = '#de2910'; c.fillRect(0, 0, canvas.width, canvas.height);
    const star = (x, y, radius, tipAngle) => {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = tipAngle + i * Math.PI / 5;
        const r = i % 2 === 0 ? radius : radius * 0.382;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
    };
    const sx = canvas.width / 30, sy = canvas.height / 20;
    const bigX = 5 * sx, bigY = 5 * sy;
    c.fillStyle = '#ffde00';
    star(bigX, bigY, 3 * Math.min(sx, sy), -Math.PI / 2);
    for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) {
      const px = x * sx, py = y * sy;
      star(px, py, Math.min(sx, sy), Math.atan2(bigY - py, bigX - px));
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const artMaterial = new THREE.MeshBasicMaterial({ map });
  if (kind === 'portrait') {
    new THREE.TextureLoader().load('/pool/images/mona-avatar.jpg', (portrait) => {
      portrait.colorSpace = THREE.SRGBColorSpace;
      const imageAspect = portrait.image.width / portrait.image.height;
      const frameAspect = w / h;
      portrait.wrapS = portrait.wrapT = THREE.ClampToEdgeWrapping;
      if (imageAspect < frameAspect) {
        portrait.repeat.set(1, imageAspect / frameAspect);
        portrait.offset.set(0, (1 - portrait.repeat.y) / 2);
      } else {
        portrait.repeat.set(frameAspect / imageAspect, 1);
        portrait.offset.set((1 - portrait.repeat.x) / 2, 0);
      }
      artMaterial.map = portrait;
      artMaterial.needsUpdate = true;
      map.dispose();
    });
  }
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMaterial);
  art.position.set(x, y, z + (z > 0 ? -0.021 : 0.021));
  if (z > 0) art.rotation.y = Math.PI;
  root.add(art);
}

function addCueRack(root, x, floorY, z, dark, brass) {
  const rack = new THREE.Group();
  rack.position.set(x, floorY + 1.36, z);

  const walnut = new THREE.MeshStandardMaterial({ color: 0x3a1d10, roughness: 0.42, metalness: 0.02 });
  const maple = new THREE.MeshStandardMaterial({ color: 0xd8aa63, roughness: 0.3 });
  const ebony = new THREE.MeshStandardMaterial({ color: 0x17110e, roughness: 0.26 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf0e5ce, roughness: 0.22 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x426d78, roughness: 0.82 });

  // Bevelled hardwood cabinet with a recessed back and brass-lined display opening.
  roundedBox(rack, [0.68, 1.76, 0.095], [0, 0, 0], walnut, 0.035, true);
  roundedBox(rack, [0.56, 1.62, 0.025], [0, 0, 0.057], ebony, 0.018);
  for (const sx of [-0.3, 0.3]) box(rack, [0.022, 1.62, 0.025], [sx, 0, 0.081], brass);
  for (const yy of [-0.81, 0.81]) box(rack, [0.6, 0.022, 0.025], [0, yy, 0.081], brass);

  const cylinder = (radiusTop, radiusBottom, height, px, py, material, radial = 16) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), material);
    mesh.position.set(px, py, 0.115); mesh.castShadow = true; rack.add(mesh); return mesh;
  };
  const ring = (px, py) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.003, 6, 18), brass);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(px, py, 0.115); rack.add(mesh);
  };

  for (const [i, px] of [-0.19, 0, 0.19].entries()) {
    const base = -0.69;
    cylinder(0.021, 0.024, 0.055, px, base, ebony);
    cylinder(0.017, 0.021, 0.42, px, base + 0.235, walnut);
    cylinder(0.013, 0.017, 0.34, px, base + 0.615, maple);
    ring(px, base + 0.43); ring(px, base + 0.79);
    cylinder(0.008, 0.013, 0.49, px, base + 1.025, maple, 20);
    cylinder(0.008, 0.008, 0.036, px, base + 1.288, ivory);
    cylinder(0.008, 0.008, 0.022, px, base + 1.317, leather);
  }

  // Lower cups and upper spring clips visibly hold each cue in place.
  for (const px of [-0.19, 0, 0.19]) {
    cylinder(0.034, 0.038, 0.045, px, -0.75, dark);
    const clip = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 18, Math.PI * 1.45), brass);
    clip.rotation.x = Math.PI / 2; clip.rotation.z = -Math.PI * 0.22;
    clip.position.set(px, 0.68, 0.116); rack.add(clip);
  }
  root.add(rack);
}

function addPendant(root, floorY, brass) {
  // Fixture only — scene uses flat ambient (no spot/point lights).
  const y = floorY + 2.45;
  const shade = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.14, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.45 }),
  );
  shade.position.set(0, y, 0);
  root.add(shade);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.03, 0.53),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, y - 0.075, 0);
  root.add(glow);
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.22, 0.22]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.74, 6), brass);
      cable.position.set(x, y + 0.43, z);
      root.add(cable);
    }
  }
}

function addLighting(root, w, d, h, floorY) {
  // Decorative can rims only — no real lights (constant ambient in main.js).
  const canFixtures = [
    [-4.4, -2.1], [-2.2, -2.5], [2.2, -2.5], [4.4, -2.1],
    [-4.3, 1.9], [-2, 2.25], [2, 2.25], [4.3, 1.9],
  ];
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9b59e, metalness: 0.35, roughness: 0.45 });
  const canY = floorY + h - 0.23;
  for (const [x, z] of canFixtures) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.025, 16), rimMat);
    rim.position.set(x, canY + 0.03, z);
    root.add(rim);
  }
}

function addArmchair(root, x, floorY, z, material, rotation = -0.18) {
  const g = new THREE.Group();
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x302a26, roughness: 0.72, clearcoat: 0.08 });
  const cushion = new THREE.MeshPhysicalMaterial({ color: 0x4b433d, roughness: 0.86, sheen: 0.32, sheenColor: new THREE.Color(0x8b796c) });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x372219, roughness: 0.54 });
  roundedBox(g, [0.7, 0.18, 0.68], [0, floorY + 0.38, 0], leather, 0.055, true);
  const back = roundedBox(g, [0.58, 0.61, 0.15], [0, floorY + 0.75, 0.27], cushion, 0.065, true);
  back.rotation.x = -0.13;
  for (const sx of [-0.36, 0.36]) {
    const arm = roundedBox(g, [0.14, 0.3, 0.66], [sx, floorY + 0.55, 0.02], leather, 0.055, true);
    arm.rotation.z = -sx * 0.055;
  }
  for (const sx of [-0.27, 0.27]) for (const zz of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.033, 0.3, 10), legMat);
    leg.position.set(sx, floorY + 0.15, zz); leg.rotation.z = sx * 0.1; leg.castShadow = true; g.add(leg);
  }
  // Subtle button tufting breaks up the oversized flat back cushion.
  for (const bx of [-0.16, 0, 0.16]) for (const by of [floorY + 0.66, floorY + 0.84]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), leather);
    button.position.set(bx, by, 0.185); g.add(button);
  }
  g.position.set(x, 0, z); g.rotation.y = rotation; root.add(g);
}

function addSideTable(root, x, floorY, z, material) {
  const marble = new THREE.MeshPhysicalMaterial({ color: 0xb8aa95, roughness: 0.28, clearcoat: 0.18 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 32), marble); top.position.set(x, floorY + 0.5, z); top.castShadow = true; root.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.008, 7, 32), material); rim.rotation.x = Math.PI / 2; rim.position.set(x, floorY + 0.5, z); root.add(rim);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.027, 0.43, 12), material); stem.position.set(x, floorY + 0.275, z); root.add(stem);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.025, 24), material); base.position.set(x, floorY + 0.013, z); root.add(base);
  const smallVase = new THREE.Mesh(new THREE.LatheGeometry([[0.025,0],[0.055,0.01],[0.048,0.08],[0.025,0.12]].map(([a,b]) => new THREE.Vector2(a,b)), 16), new THREE.MeshPhysicalMaterial({ color: 0x6f857b, roughness: 0.36 }));
  smallVase.position.set(x, floorY + 0.518, z); root.add(smallVase);
}

function addSconce(root, x, y, z, brass) {
  box(root, [0.035, 0.55, 0.05], [x, y, z], brass);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd6a0 }),
  );
  glass.position.set(x, y, z + 0.12);
  root.add(glass);
}

function addPlant(root, x, floorY, z) {
  const g = new THREE.Group();
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x252522, roughness: 0.42, clearcoat: 0.34 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x21170f, roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x60452d, roughness: 0.96 });
  const leaves = [
    new THREE.MeshStandardMaterial({ color: 0x214d31, roughness: 0.82, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x356743, roughness: 0.86, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x487b50, roughness: 0.88, side: THREE.DoubleSide }),
  ];

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.34, 20, 1, false), ceramic);
  pot.position.y = floorY + 0.17; pot.castShadow = true; g.add(pot);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.018, 8, 24), ceramic);
  lip.rotation.x = Math.PI / 2; lip.position.y = floorY + 0.34; g.add(lip);
  const soilTop = new THREE.Mesh(new THREE.CylinderGeometry(0.174, 0.174, 0.018, 20), soil);
  soilTop.position.y = floorY + 0.335; g.add(soilTop);

  // A restrained indoor ficus: visible branching, sparse crown and varied leaf scale.
  const trunkPath = [
    new THREE.Vector3(0, floorY + 0.34, 0),
    new THREE.Vector3(-0.018, floorY + 0.67, 0.008),
    new THREE.Vector3(0.026, floorY + 1.0, -0.012),
    new THREE.Vector3(0.005, floorY + 1.31, 0.016),
    new THREE.Vector3(0.055, floorY + 1.6, 0),
  ];
  for (let i = 0; i < trunkPath.length - 1; i++) addBranch(g, trunkPath[i], trunkPath[i + 1], 0.045 - i * 0.006, bark);

  const branches = [
    [[0.01, 0.88, 0], [-0.34, 1.14, 0.1]],
    [[0.02, 1.02, 0], [0.38, 1.29, -0.08]],
    [[0.01, 1.16, 0], [-0.3, 1.48, -0.1]],
    [[0.02, 1.3, 0], [0.34, 1.56, 0.12]],
    [[0.04, 1.43, 0], [-0.18, 1.72, 0.06]],
    [[0.05, 1.55, 0], [0.18, 1.82, -0.04]],
  ];
  const leafGeometry = makeFicusLeafGeometry();
  branches.forEach(([a, b], branchIndex) => {
    const start = new THREE.Vector3(a[0], floorY + a[1], a[2]);
    const end = new THREE.Vector3(b[0], floorY + b[1], b[2]);
    addBranch(g, start, end, 0.023, bark);
    const side = b[0] < 0 ? -1 : 1;
    const twigEnd = end.clone().add(new THREE.Vector3(side * 0.11, 0.1, branchIndex % 2 ? 0.08 : -0.08));
    addBranch(g, end, twigEnd, 0.012, bark);
    addFicusLeaves(g, end, leafGeometry, leaves, branchIndex, side);
    addFicusLeaves(g, twigEnd, leafGeometry, leaves, branchIndex + 7, side);
  });
  addFicusLeaves(g, new THREE.Vector3(0.055, floorY + 1.72, 0), leafGeometry, leaves, 15, 1);
  g.position.set(x, 0, z); root.add(g);
}

function addBranch(root, start, end, radius, material) {
  const delta = end.clone().sub(start);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, delta.length(), 8), material);
  branch.position.copy(start).add(end).multiplyScalar(0.5);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  // Branches are thin; skip shadow casters to cut draw cost in the shadow pass.
  branch.castShadow = false; root.add(branch);
}

function makeFicusLeafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.018);
  shape.bezierCurveTo(0.045, -0.015, 0.075, 0.04, 0.068, 0.105);
  shape.bezierCurveTo(0.06, 0.17, 0.025, 0.22, 0, 0.245);
  shape.bezierCurveTo(-0.025, 0.22, -0.06, 0.17, -0.068, 0.105);
  shape.bezierCurveTo(-0.075, 0.04, -0.045, -0.015, 0, -0.018);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 });
  geometry.translate(0, -0.02, -0.003);
  return geometry;
}

function addFicusLeaves(root, center, geometry, materials, seed, side) {
  for (let i = 0; i < 3; i++) {
    const a = seed * 1.73 + i * 2.18;
    const leaf = new THREE.Mesh(geometry, materials[(seed + i) % materials.length]);
    const scale = 0.82 + ((seed * 7 + i * 3) % 5) * 0.055;
    leaf.scale.set(scale, scale, scale);
    leaf.position.set(
      center.x + Math.cos(a) * 0.07,
      center.y + (i - 1) * 0.045,
      center.z + Math.sin(a) * 0.065,
    );
    leaf.rotation.set(0.72 + i * 0.16, a + side * 0.35, side * (0.22 + i * 0.09));
    leaf.castShadow = false;
    root.add(leaf);
  }
}

function roundedBox(root, size, pos, material, radius = 0.04, cast = false) {
  const [w, h, d] = size;
  const geometry = new RoundedBoxGeometry(w, h, d, 4, Math.min(radius, w / 2, h / 2, d / 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos); mesh.castShadow = cast; root.add(mesh); return mesh;
}

function box(root, size, pos, material, cast = false, receive = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...pos); m.castShadow = cast; m.receiveShadow = receive; root.add(m); return m;
}

function canvasTexture(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d'); draw(ctx, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeStoneTexture() { return canvasTexture((c, s) => { c.fillStyle = '#aaa49d'; c.fillRect(0,0,s,s); for(let i=0;i<90;i++){ c.strokeStyle=`rgba(75,68,62,${Math.random()*0.045})`; c.lineWidth=Math.random()*2; c.beginPath(); const y=Math.random()*s; c.moveTo(0,y); c.bezierCurveTo(s*.25,y+Math.random()*30-15,s*.7,y+Math.random()*30-15,s,y); c.stroke(); } }); }
function makeRugTexture() { return canvasTexture((c, s) => { c.fillStyle='#77716b'; c.fillRect(0,0,s,s); for(let i=0;i<6500;i++){ const v=105+Math.random()*30; c.fillStyle=`rgba(${v},${v-4},${v-8},${0.05+Math.random()*0.08})`; c.fillRect(Math.random()*s,Math.random()*s,1,3); } c.strokeStyle='rgba(218,202,179,.32)'; c.lineWidth=5; c.strokeRect(18,18,s-36,s-36); c.lineWidth=1; c.strokeRect(27,27,s-54,s-54); }); }
function makeWallTexture() { return canvasTexture((c,s) => { c.fillStyle='#bcb5ab'; c.fillRect(0,0,s,s); for(let i=0;i<3500;i++){ c.fillStyle=`rgba(255,255,255,${Math.random()*.035})`; c.fillRect(Math.random()*s,Math.random()*s,1,2); } for(let x=0;x<s;x+=128){ c.fillStyle='rgba(55,48,42,.05)'; c.fillRect(x,0,1,s); } }); }
function makeWoodTexture() { return canvasTexture((c,s) => { c.fillStyle='#4d2c1c'; c.fillRect(0,0,s,s); for(let i=0;i<80;i++){ c.strokeStyle=`rgba(18,8,3,${.04+Math.random()*.08})`; c.beginPath(); const x=Math.random()*s; c.moveTo(x,0); c.bezierCurveTo(x+12,s*.3,x-10,s*.7,x+5,s); c.stroke(); } }); }
