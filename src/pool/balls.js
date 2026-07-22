import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  BALL_R,
  BALL_D,
  BALL_Y,
  BALL_DEFS,
  TABLE_LENGTH,
  PHYSICS,
  RESTITUTION_BALL,
  FRICTION_BALL,
} from './constants.js';

const textureCache = new Map();

function makeBallTexture(def) {
  const key = `${def.id}-${def.color}-${def.stripe}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (def.isCue) {
    // Cream cue ball with red aiming dots
    const g = ctx.createRadialGradient(size * 0.35, size * 0.35, 10, size * 0.5, size * 0.5, size * 0.55);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#e8e0d4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#c0392b';
    for (const [u, v] of [
      [0.5, 0.22],
      [0.5, 0.78],
      [0.22, 0.5],
      [0.78, 0.5],
    ]) {
      ctx.beginPath();
      ctx.arc(u * size, v * size, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const hex = `#${def.color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, size, size);

    if (def.stripe) {
      // Equatorial white band (mapped as horizontal band on lat-long approx)
      ctx.fillStyle = '#f7f4ef';
      ctx.fillRect(0, size * 0.32, size, size * 0.36);
    }

    // Number circle
    const cx = size * 0.5;
    const cy = size * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#f7f4ef';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = def.id === 8 ? '#111' : '#111';
    ctx.font = `bold ${def.id >= 10 ? 42 : 48}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(def.id), cx, cy + 2);
  }

  // Subtle gloss highlight
  const gloss = ctx.createRadialGradient(size * 0.32, size * 0.28, 5, size * 0.32, size * 0.28, size * 0.35);
  gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

export function createBallMaterial(world) {
  const mat = new CANNON.Material('ball');
  // Ball-ball contact
  world.addContactMaterial(
    new CANNON.ContactMaterial(mat, mat, {
      friction: FRICTION_BALL,
      restitution: RESTITUTION_BALL,
      contactEquationStiffness: 1e8,
      contactEquationRelaxation: 3,
    }),
  );
  return mat;
}

export function createBalls(scene, world, ballMaterial, clothMaterial, cushionMaterial) {
  // Ball-cloth & ball-cushion contacts
  world.addContactMaterial(
    new CANNON.ContactMaterial(ballMaterial, clothMaterial, {
      // Cloth friction is integrated by PoolPhysics so it can distinguish
      // sliding from rolling. A zero solver value avoids double-counting it.
      friction: 0,
      restitution: 0.02,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4,
    }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(ballMaterial, cushionMaterial, {
      friction: PHYSICS.cushionFriction,
      restitution: PHYSICS.cushionRestitution,
      contactEquationStiffness: 1e8,
      contactEquationRelaxation: 3,
    }),
  );

  const balls = [];
  const positions = getRackPositions();

  for (const def of BALL_DEFS) {
    const pos = positions[def.id];
    const mesh = createBallMesh(def);
    mesh.position.copy(pos);
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: PHYSICS.ballMass,
      shape: new CANNON.Sphere(BALL_R),
      material: ballMaterial,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0,
      angularDamping: 0,
      allowSleep: true,
      sleepSpeedLimit: PHYSICS.stopLinearSpeed,
      sleepTimeLimit: 0.25,
    });
    body.userData = { type: 'ball', id: def.id, isCue: !!def.isCue };
    world.addBody(body);

    balls.push({
      id: def.id,
      def,
      mesh,
      body,
      pocketed: false,
      isCue: !!def.isCue,
    });
  }

  return balls;
}

function createBallMesh(def) {
  const geo = new THREE.SphereGeometry(BALL_R, 32, 24);
  const map = makeBallTexture(def);
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.28,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `ball-${def.id}`;
  return mesh;
}

/**
 * Standard triangle rack on the foot spot, cue on the head spot.
 * +X is toward foot of table.
 */
export function getRackPositions() {
  const positions = {};
  const footX = TABLE_LENGTH * 0.25;
  const headX = -TABLE_LENGTH * 0.25;
  const gap = BALL_D * 1.02;

  // Cue ball
  positions[0] = new THREE.Vector3(headX, BALL_Y, 0);

  // Triangle: apex toward head (cue), so apex at smaller x
  // Rows 1..5 going toward foot (+x)
  const order = [
    [1],
    [9, 2],
    [3, 8, 10],
    [11, 4, 12, 5],
    [6, 13, 14, 15, 7],
  ];
  // Better classic rack: apex = 1, 8 in center, corners solid/stripe mix
  const classic = [
    [1],
    [2, 9],
    [10, 8, 3],
    [4, 11, 5, 12],
    [13, 6, 14, 15, 7],
  ];

  classic.forEach((row, rowIndex) => {
    const x = footX + rowIndex * gap * Math.cos(Math.PI / 6);
    const count = row.length;
    const z0 = -((count - 1) * gap) / 2;
    row.forEach((id, i) => {
      positions[id] = new THREE.Vector3(x, BALL_Y, z0 + i * gap);
    });
  });

  void order;
  return positions;
}

export function resetBalls(balls) {
  const positions = getRackPositions();
  for (const ball of balls) {
    ball.pocketed = false;
    ball.mesh.visible = true;
    const p = positions[ball.id];
    ball.body.wakeUp();
    ball.body.velocity.set(0, 0, 0);
    ball.body.angularVelocity.set(0, 0, 0);
    ball.body.position.set(p.x, p.y, p.z);
    ball.body.quaternion.set(0, 0, 0, 1);
    if (!ball.body.world) {
      // re-added if removed on pocket — handled in main
    }
    ball.mesh.position.copy(p);
    ball.mesh.quaternion.identity();
  }
}

export function respotCueBall(cueBall, world) {
  const headX = -TABLE_LENGTH * 0.25;
  let x = headX;
  let z = 0;
  // Simple clear-spot search
  const others = [];
  // caller may pass only cue; position is fixed head spot unless blocked
  cueBall.pocketed = false;
  cueBall.mesh.visible = true;
  cueBall.body.wakeUp();
  cueBall.body.velocity.set(0, 0, 0);
  cueBall.body.angularVelocity.set(0, 0, 0);
  cueBall.body.position.set(x, BALL_Y, z);
  if (!cueBall.body.world && world) world.addBody(cueBall.body);
  void others;
}
