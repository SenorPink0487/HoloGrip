import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  TABLE_LENGTH,
  TABLE_WIDTH,
  RAIL_HEIGHT,
  RAIL_WIDTH,
  POCKET_R,
  POCKET_CAPTURE_CORNER,
  POCKET_CAPTURE_SIDE,
  CLOTH_Y,
  LEG_HEIGHT,
  APRON,
  RESTITUTION_CUSHION,
  FRICTION_CLOTH,
  BALL_R,
} from './constants.js';

const HALF_L = TABLE_LENGTH / 2;
const HALF_W = TABLE_WIDTH / 2;

export function createTable(scene, world) {
  const group = new THREE.Group();
  group.name = 'table';

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5a2d12,
    roughness: 0.55,
    metalness: 0.08,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x3a1c0b,
    roughness: 0.65,
    metalness: 0.05,
  });
  const feltMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
  });
  const feltDark = new THREE.MeshStandardMaterial({
    color: 0x6a8f6a,
    roughness: 0.94,
    metalness: 0.0,
  });
  const pocketMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.9,
    metalness: 0.1,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.7,
    metalness: 0.05,
  });

  // Cloth playing surface — PBR baize from TextureCan (async; solid green until loaded)
  applyFeltPBR(feltMat, feltDark);

  const clothGeo = new THREE.BoxGeometry(TABLE_LENGTH, 0.03, TABLE_WIDTH);
  // aoMap in three.js samples uv2; mirror uv so AO works without a second unwrap
  clothGeo.setAttribute('uv2', clothGeo.attributes.uv.clone());
  const cloth = new THREE.Mesh(clothGeo, feltMat);
  cloth.position.y = CLOTH_Y - 0.015;
  cloth.receiveShadow = true;
  group.add(cloth);

  // Bed under cloth
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_LENGTH + RAIL_WIDTH * 2 + 0.02, 0.08, TABLE_WIDTH + RAIL_WIDTH * 2 + 0.02),
    woodDark,
  );
  bed.position.y = CLOTH_Y - 0.055;
  bed.receiveShadow = true;
  group.add(bed);

  // Outer apron / frame
  const frameH = 0.12;
  const outerL = TABLE_LENGTH + (RAIL_WIDTH + APRON) * 2;
  const outerW = TABLE_WIDTH + (RAIL_WIDTH + APRON) * 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(outerL, frameH, outerW), woodMat);
  frame.position.y = CLOTH_Y - 0.1;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // Rails (visual) with cutouts approximated by segments between pockets
  addRails(group, woodMat, feltDark, leatherMat);

  // Pocket mouths (visual) — side pockets slightly larger, matching regulation
  const pocketPositions = getPocketPositions();
  for (const p of pocketPositions) {
    const pr = p.corner ? POCKET_CAPTURE_CORNER : POCKET_CAPTURE_SIDE;
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(pr * 0.95, pr * 1.05, 0.06, 24),
      pocketMat,
    );
    hole.position.set(p.x, CLOTH_Y - 0.02, p.z);
    group.add(hole);

    // Leather rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(pr * 0.92, 0.012, 8, 24),
      leatherMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(p.x, CLOTH_Y + 0.002, p.z);
    group.add(rim);
  }

  // Legs
  const legGeo = new THREE.BoxGeometry(0.1, LEG_HEIGHT, 0.1);
  const legPositions = [
    [outerL / 2 - 0.12, -LEG_HEIGHT / 2 - 0.12, outerW / 2 - 0.12],
    [-outerL / 2 + 0.12, -LEG_HEIGHT / 2 - 0.12, outerW / 2 - 0.12],
    [outerL / 2 - 0.12, -LEG_HEIGHT / 2 - 0.12, -outerW / 2 + 0.12],
    [-outerL / 2 + 0.12, -LEG_HEIGHT / 2 - 0.12, -outerW / 2 + 0.12],
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    group.add(leg);
  }

  // Floor is provided by pool hall environment
  scene.add(group);

  // ---- Physics ----
  const clothMaterial = new CANNON.Material('cloth');
  const cushionMaterial = new CANNON.Material('cushion');

  // Floor plane for balls
  const groundBody = new CANNON.Body({
    mass: 0,
    material: clothMaterial,
    shape: new CANNON.Plane(),
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.position.set(0, CLOTH_Y, 0);
  world.addBody(groundBody);

  // Cushion segments (static boxes) — leave gaps at pockets
  const cushions = createCushionBodies(cushionMaterial);
  for (const b of cushions) world.addBody(b);

  // Contact materials
  world.addContactMaterial(
    new CANNON.ContactMaterial(clothMaterial, clothMaterial, {
      friction: FRICTION_CLOTH,
      restitution: 0.02,
    }),
  );

  return {
    group,
    clothMaterial,
    cushionMaterial,
    pocketPositions,
    materials: { woodMat, feltMat },
  };
}

/**
 * Load TextureCan snooker baize PBR maps into felt materials.
 * Files live in public/pool/textures/felt/ (see SOURCES.txt).
 */
function applyFeltPBR(feltMat, feltDark) {
  const loader = new THREE.TextureLoader();
  // Table is ~2:1; denser tile reads more like woven baize at table scale
  const repeatX = 3.2;
  const repeatZ = 1.6;
  const anisotropy = 8;

  const setup = (tex, { srgb = false } = {}) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatZ);
    tex.anisotropy = anisotropy;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const base = '/pool/textures/felt';
  let pending = 3;
  const done = () => {
    pending -= 1;
    if (pending <= 0) {
      feltMat.needsUpdate = true;
      feltDark.needsUpdate = true;
    }
  };

  // Fallback green while maps load (or if a request fails)
  feltMat.color.set(0x0d7a42);
  feltDark.color.set(0x086335);

  loader.load(
    `${base}/color.jpg`,
    (map) => {
      setup(map, { srgb: true });
      feltMat.map = map;
      feltMat.color.set(0xffffff);
      // Darker tint on shared map for rail cushions / inner felt
      feltDark.map = map;
      feltDark.color.set(0x6a8f6a);
      done();
    },
    undefined,
    () => {
      console.warn('[table] felt color map failed to load');
      done();
    },
  );

  loader.load(
    `${base}/normal.jpg`,
    (normal) => {
      setup(normal);
      feltMat.normalMap = normal;
      feltMat.normalScale = new THREE.Vector2(0.55, 0.55);
      feltDark.normalMap = normal;
      feltDark.normalScale = new THREE.Vector2(0.4, 0.4);
      done();
    },
    undefined,
    () => {
      console.warn('[table] felt normal map failed to load');
      done();
    },
  );

  loader.load(
    `${base}/roughness.jpg`,
    (rough) => {
      setup(rough);
      feltMat.roughnessMap = rough;
      feltMat.roughness = 1;
      feltDark.roughnessMap = rough;
      feltDark.roughness = 1;
      done();
    },
    undefined,
    () => {
      console.warn('[table] felt roughness map failed to load');
      done();
    },
  );

  // AO only on main cloth (has uv2). Rail prisms share feltDark without a second UV set.
  loader.load(
    `${base}/ao.jpg`,
    (ao) => {
      setup(ao);
      feltMat.aoMap = ao;
      feltMat.aoMapIntensity = 0.65;
      feltMat.needsUpdate = true;
    },
    undefined,
    () => {
      /* optional */
    },
  );
}

function addRails(group, woodMat, feltDark, leatherMat) {
  const h = RAIL_HEIGHT;
  const w = RAIL_WIDTH;
  // Rail cutbacks: side full mouth ≈ 2*sideMouth (~129 mm); corner cutback for ~116 mm.
  const cornerMouth = POCKET_CAPTURE_CORNER * 1.48;
  const sideMouth = POCKET_CAPTURE_SIDE * 1.0;
  const outerMouth = POCKET_R * 0.52;
  const cushionDepth = w * 0.31;
  const cushionHeight = h * 0.62;
  const seamGap = 0.0008;

  const addPrism = (points, height, material, minY = CLOTH_Y) => {
    const mesh = new THREE.Mesh(makePrismGeometry(points, minY, minY + height), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // Each rail is a single mitred solid. The outer corners reach toward a
  // pocket while the inner cushion face stops earlier, forming a clean jaw.
  for (const zSign of [-1, 1]) {
    const innerZ = zSign * HALF_W;
    const outerZ = zSign * (HALF_W + w);
    for (const xSign of [-1, 1]) {
      const innerCornerX = xSign * (HALF_L - cornerMouth);
      const innerSideX = xSign * sideMouth;
      const outerCornerX = xSign * (HALF_L - outerMouth);
      const outerSideX = xSign * outerMouth;
      const points = [
        [innerCornerX, innerZ],
        [innerSideX, innerZ],
        [outerSideX, outerZ],
        [outerCornerX, outerZ],
      ];
      addPrism(points, h, woodMat);

      // The rubber cushion sits on the playing side of the wooden rail.
      // Keeping the two volumes adjacent (instead of nested) prevents their
      // coincident faces from flickering as the camera moves.
      const cushionOuterZ = innerZ - zSign * seamGap;
      const cushionZ = innerZ - zSign * (cushionDepth + seamGap);
      addPrism([
        [innerCornerX, cushionOuterZ],
        [innerSideX, cushionOuterZ],
        [xSign * (sideMouth + cushionDepth * 0.55), cushionZ],
        [xSign * (HALF_L - cornerMouth - cushionDepth * 0.55), cushionZ],
      ], cushionHeight, feltDark, CLOTH_Y + 0.001);
    }
  }

  for (const xSign of [-1, 1]) {
    const innerX = xSign * HALF_L;
    const outerX = xSign * (HALF_L + w);
    const points = [
      [innerX, -HALF_W + cornerMouth],
      [innerX, HALF_W - cornerMouth],
      [outerX, HALF_W - outerMouth],
      [outerX, -HALF_W + outerMouth],
    ];
    addPrism(points, h, woodMat);

    const cushionOuterX = innerX - xSign * seamGap;
    const cushionX = innerX - xSign * (cushionDepth + seamGap);
    addPrism([
      [cushionOuterX, -HALF_W + cornerMouth],
      [cushionOuterX, HALF_W - cornerMouth],
      [cushionX, HALF_W - cornerMouth - cushionDepth * 0.55],
      [cushionX, -HALF_W + cornerMouth + cushionDepth * 0.55],
    ], cushionHeight, feltDark, CLOTH_Y + 0.001);
  }

  void leatherMat;
}

/** Build a vertical prism from an XZ polygon without rotated/intersecting boxes. */
function makePrismGeometry(points, minY, maxY) {
  const vertices = [];
  const indices = [];
  const signedArea = points.reduce((area, [x, z], i) => {
    const [nextX, nextZ] = points[(i + 1) % points.length];
    return area + x * nextZ - nextX * z;
  }, 0);
  // In XZ coordinates, clockwise polygons produce upward-facing triangles.
  // Normalizing here prevents half of the mirrored rail pieces from having
  // their top faces removed by back-face culling.
  const orderedPoints = signedArea > 0 ? [...points].reverse() : points;
  const count = orderedPoints.length;

  for (const y of [minY, maxY]) {
    for (const [x, z] of orderedPoints) vertices.push(x, y, z);
  }

  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(count, count + i, count + i + 1);
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, next, count + next, i, count + next, count + i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function getPocketPositions() {
  return [
    { x: HALF_L, z: HALF_W, corner: true },
    { x: HALF_L, z: -HALF_W, corner: true },
    { x: -HALF_L, z: HALF_W, corner: true },
    { x: -HALF_L, z: -HALF_W, corner: true },
    { x: 0, z: HALF_W, corner: false },
    { x: 0, z: -HALF_W, corner: false },
  ];
}

function getPocketJawSegments(w, h, y) {
  const jaws = [];
  const jawLength = POCKET_CAPTURE_SIDE * 1.45;
  const sideX = POCKET_CAPTURE_SIDE * 1.22;
  const sideZ = HALF_W + w * 0.15;
  for (const zSign of [-1, 1]) {
    jaws.push(
      { sx: jawLength, sy: h, sz: w, x: -sideX, y, z: zSign * sideZ, yaw: zSign * -0.30 },
      { sx: jawLength, sy: h, sz: w, x: sideX, y, z: zSign * sideZ, yaw: zSign * 0.30 },
    );
  }

  const cornerX = HALF_L - POCKET_CAPTURE_CORNER * 0.72;
  const cornerZ = HALF_W - POCKET_CAPTURE_CORNER * 0.72;
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      jaws.push(
        {
          sx: jawLength,
          sy: h,
          sz: w,
          x: xSign * cornerX,
          y,
          z: zSign * (HALF_W + w * 0.12),
          yaw: xSign * zSign * -0.48,
        },
        {
          sx: w,
          sy: h,
          sz: jawLength,
          x: xSign * (HALF_L + w * 0.12),
          y,
          z: zSign * cornerZ,
          yaw: xSign * zSign * 0.48,
        },
      );
    }
  }
  return jaws;
}

/** Static cushion boxes (rails + jaws). Shared by live play and shot prediction. */
export function createCushionBodies(cushionMaterial) {
  const bodies = [];
  const h = RAIL_HEIGHT + 0.02;
  const w = RAIL_WIDTH * 0.85;
  const y = CLOTH_Y + h / 2;
  // Slightly raise so balls hit cushion face
  const faceInset = BALL_R * 0.15;

  const addBox = (sx, sy, sz, x, py, z, yaw = 0, jaw = false) => {
    const body = new CANNON.Body({
      mass: 0,
      material: cushionMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)),
      position: new CANNON.Vec3(x, py, z),
    });
    if (yaw) body.quaternion.setFromEuler(0, yaw, 0);
    // Tag for audio
    body.userData = { type: 'cushion', jaw };
    bodies.push(body);
  };

  // Long cushions (+Z / -Z), two segments each — leave gaps for side + corner mouths
  const longLen = HALF_L - POCKET_CAPTURE_SIDE - POCKET_CAPTURE_CORNER * 0.95;
  const longX = HALF_L / 2 - POCKET_CAPTURE_CORNER * 0.28;
  addBox(longLen, h, w, -longX, y, HALF_W + w / 2 - faceInset);
  addBox(longLen, h, w, longX, y, HALF_W + w / 2 - faceInset);
  addBox(longLen, h, w, -longX, y, -HALF_W - w / 2 + faceInset);
  addBox(longLen, h, w, longX, y, -HALF_W - w / 2 + faceInset);

  // Short cushions (+X / -X)
  const shortLen = TABLE_WIDTH - POCKET_CAPTURE_CORNER * 3.35;
  addBox(w, h, shortLen, HALF_L + w / 2 - faceInset, y, 0);
  addBox(w, h, shortLen, -HALF_L - w / 2 + faceInset, y, 0);

  // Angled pocket jaws replace the abrupt square ends of the rail boxes. They
  // leave the capture area open while giving near-miss shots a natural rattle.
  for (const jaw of getPocketJawSegments(w, h, y)) {
    addBox(jaw.sx, jaw.sy, jaw.sz, jaw.x, jaw.y, jaw.z, jaw.yaw, true);
  }

  // Restitution via contact material is set in main/physics against ball material
  void RESTITUTION_CUSHION;

  return bodies;
}
