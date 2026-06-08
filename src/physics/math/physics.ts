import { Vector3, Euler, Quaternion } from 'three';

export interface Magnet {
  id: string;
  name: string;
  position: [number, number, number]; // [x, y, z]
  rotation: [number, number, number]; // [rx, ry, rz] Euler angles in radians
  strength: number; // pole strength q_m
  length: number;   // physical length of the magnet
  width: number;    // width/radius for 3D model
  shape: 'box' | 'cylinder'; // magnet shape
  color?: string; // Optional field line color
  particleColor?: string; // Optional field particle color
}

// Get the North and South pole positions in world coordinates
export function getPolePositions(magnet: Magnet): { north: Vector3; south: Vector3 } {
  const center = new Vector3(...magnet.position);
  const rotEuler = new Euler(...magnet.rotation);
  const quaternion = new Quaternion().setFromEuler(rotEuler);

  // Local Y-axis is the magnetic axis of the magnet (from South to North)
  const dirY = new Vector3(0, 1, 0).applyQuaternion(quaternion);
  const halfLen = magnet.length / 2;

  const north = center.clone().addScaledVector(dirY, halfLen);
  const south = center.clone().addScaledVector(dirY, -halfLen);

  return { north, south };
}

export interface PolePair {
  north: Vector3;
  south: Vector3;
  strength: number;
}

const tempRN = new Vector3();
const tempRS = new Vector3();
const tempFieldN = new Vector3();
const tempFieldS = new Vector3();

// Calculate the magnetic field B vector at a given position p
// B(p) = sum_i [ field_from_magnet_i ]
export function calculateMagneticField(
  p: Vector3,
  magnets: Magnet[],
  outB: Vector3,
  softening: number = 0.08
): void {
  outB.set(0, 0, 0);
  const soft2 = softening * softening;

  for (let i = 0; i < magnets.length; i++) {
    const magnet = magnets[i];
    const { north, south } = getPolePositions(magnet);
    const strength = magnet.strength;

    // Field from North pole (+q_m)
    tempRN.subVectors(p, north);
    const distN2 = tempRN.lengthSq() + soft2;
    const distN3 = Math.pow(distN2, 1.5);
    tempFieldN.copy(tempRN).multiplyScalar(strength / distN3);

    // Field from South pole (-q_m)
    tempRS.subVectors(p, south);
    const distS2 = tempRS.lengthSq() + soft2;
    const distS3 = Math.pow(distS2, 1.5);
    tempFieldS.copy(tempRS).multiplyScalar(-strength / distS3);

    outB.add(tempFieldN).add(tempFieldS);

    // 对于螺线管，叠加内部近似匀强磁场，迫使磁感线闭合并平滑
    if (magnet.shape === 'cylinder') {
      const center = new Vector3(...magnet.position);
      const rotEuler = new Euler(...magnet.rotation);
      const quaternion = new Quaternion().setFromEuler(rotEuler);
      const dirY = new Vector3(0, 1, 0).applyQuaternion(quaternion); // 轴向 (South -> North)

      const rVec = new Vector3().subVectors(p, center);
      const yDist = rVec.dot(dirY);
      const radialVec = rVec.clone().sub(dirY.clone().multiplyScalar(yDist));
      const radialDist = radialVec.length();

      const L = magnet.length;
      const R = magnet.width;

      // 使用 smoothstep 平滑过渡，避免边界不连续导致 RK4 卡死
      const margin = 0.4;
      const smoothstep = (min: number, max: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
        return t * t * (3 - 2 * t);
      };

      const axialFactor = 1.0 - smoothstep(L/2 - margin, L/2 + margin, Math.abs(yDist));
      const radialFactor = 1.0 - smoothstep(R - margin, R + margin, radialDist);
      const insideFactor = axialFactor * radialFactor;

      if (insideFactor > 0) {
        // 抵消点磁荷在内部产生的反向场，并增加向前的真实磁通量场
        const backFieldEstimate = (8.0 * strength) / (L * L + 0.1);
        const forwardField = (4.0 * strength) / (R * R + 0.1);
        const internalB = (backFieldEstimate + forwardField) * insideFactor;
        
        outB.addScaledVector(dirY, internalB);
      }
    }
  }
}

// Generate seeds on a ring (circle) perpendicular to a given axis
export function generateRingSeeds(
  center: Vector3,
  radius: number,
  numLines: number,
  axis: Vector3
): Vector3[] {
  const seeds: Vector3[] = [];
  if (numLines <= 0) return seeds;

  const w = axis.clone().normalize();
  const u = new Vector3(1, 0, 0);
  if (Math.abs(w.x) > 0.9) u.set(0, 1, 0);
  u.cross(w).normalize();
  const v = new Vector3().crossVectors(w, u).normalize();

  if (numLines === 1) {
    seeds.push(center.clone().addScaledVector(u, radius));
    return seeds;
  }

  for (let i = 0; i < numLines; i++) {
    const angle = (Math.PI * 2 * i) / numLines;
    const p = center.clone()
      .addScaledVector(u, Math.cos(angle) * radius)
      .addScaledVector(v, Math.sin(angle) * radius);
    seeds.push(p);
  }

  return seeds;
}

// Pre-allocate RK4 temporary vectors to prevent massive GC pauses during 60fps real-time updates
const k1 = new Vector3();
const k2 = new Vector3();
const k3 = new Vector3();
const k4 = new Vector3();
const pTemp = new Vector3();
const delta = new Vector3();
const tempDirB = new Vector3();

// Trace a single field line from a seed point using RK4 integration
// direction = 1 for forward tracing, -1 for backward tracing
export function traceFieldLine(
  seed: Vector3,
  magnets: Magnet[],
  direction: 1 | -1,
  stepSize: number,
  maxSteps: number,
  boundary: number = 15,
  softening: number = 0.08,
  precalcPoles?: PolePair[]
): Vector3[] {
  const path: Vector3[] = [seed.clone()];
  const current = seed.clone();
  const h = stepSize * direction;
  const stopDist = 0.25; // Stop tracing if we get very close to a pole

  // Keep track of the pole locations to check stop conditions
  const poles = precalcPoles || magnets.map(m => {
    const p = getPolePositions(m);
    return { north: p.north, south: p.south, strength: m.strength };
  });

  for (let step = 0; step < maxSteps; step++) {
    // 1. Check if we are too close to any pole (excluding the starting pole region)
    let reachedPole = false;
    for (let i = 0; i < poles.length; i++) {
      const p = poles[i];
      // If tracing forward (from North), we want to stop at South poles
      // If tracing backward (from South), we want to stop at North poles
      const targetPole = direction === 1 ? p.south : p.north;
      const distToTarget = current.distanceTo(targetPole);
      
      if (distToTarget < stopDist) {
        // Snap to target pole and finish
        path.push(targetPole.clone());
        reachedPole = true;
        break;
      }

      // Also stop if we accidentally loop back into the same pole
      const startPole = direction === 1 ? p.north : p.south;
      if (step > 5 && current.distanceTo(startPole) < stopDist) {
        path.push(startPole.clone());
        reachedPole = true;
        break;
      }
    }

    if (reachedPole) break;

    // 2. Check boundary limit
    if (
      Math.abs(current.x) > boundary ||
      Math.abs(current.y) > boundary ||
      Math.abs(current.z) > boundary
    ) {
      break;
    }

    // 3. RK4 integration step
    const getDir = (pos: Vector3, outDir: Vector3) => {
      calculateMagneticField(pos, magnets, tempDirB, softening);
      const lenSq = tempDirB.lengthSq();
      if (lenSq < 1e-12) {
        outDir.set(0, 0, 0);
      } else {
        outDir.copy(tempDirB).multiplyScalar(1.0 / Math.sqrt(lenSq));
      }
    };

    getDir(current, k1);
    if (k1.lengthSq() < 1e-4) break; // Field is too weak

    // current + 0.5 * h * k1
    pTemp.copy(current).addScaledVector(k1, 0.5 * h);
    getDir(pTemp, k2);

    // current + 0.5 * h * k2
    pTemp.copy(current).addScaledVector(k2, 0.5 * h);
    getDir(pTemp, k3);

    // current + h * k3
    pTemp.copy(current).addScaledVector(k3, h);
    getDir(pTemp, k4);

    // x_{next} = x + h/6 * (k1 + 2*k2 + 2*k3 + k4)
    delta.copy(k1)
      .addScaledVector(k2, 2)
      .addScaledVector(k3, 2)
      .add(k4)
      .multiplyScalar(h / 6);

    current.add(delta);
    path.push(current.clone());
  }

  return path;
}

// Generate all visual field lines for a list of magnets
export function generateAllFieldLines(
  magnets: Magnet[],
  density: number, // lines per pole
  stepSize: number,
  maxSteps: number,
  boundary: number = 15,
  softening: number = 0.08
): { lines: { path: Vector3[]; sourceId: string }[]; debugInfo?: string } {
  const allLines: { path: Vector3[]; sourceId: string }[] = [];
  if (magnets.length === 0) return { lines: [] };

  const poles = magnets.map(m => {
    const p = getPolePositions(m);
    return { north: p.north, south: p.south, strength: m.strength };
  });

  // 1. Trace FORWARD from North poles
  for (let i = 0; i < magnets.length; i++) {
    const { north } = poles[i];
    // Scale seed radius based on magnet width
    const rSeed = Math.max(0.1, magnets[i].width * 0.8);
    
    const rotEuler = new Euler(...magnets[i].rotation);
    const quaternion = new Quaternion().setFromEuler(rotEuler);
    const dirY = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    
    // Outer seeds (for the large far-range loops)
    const seedCenterN_outer = north.clone().addScaledVector(dirY, rSeed * 0.8);
    const seeds_outer = generateRingSeeds(seedCenterN_outer, rSeed, Math.ceil(density * 0.6), dirY);

    // Inner seeds (for the tight close-up loops)
    const seedCenterN_inner = north.clone().addScaledVector(dirY, -rSeed * 0.6);
    const seeds_inner = generateRingSeeds(seedCenterN_inner, rSeed, Math.floor(density * 0.4), dirY);

    const seeds = [...seeds_outer, ...seeds_inner];

    for (const seed of seeds) {
      const path = traceFieldLine(seed, magnets, 1, stepSize, maxSteps, boundary, softening, poles);
      if (path.length > 1) {
        // Unshift the exact north pole so it perfectly converges to a point just like S pole
        path.unshift(north.clone());
        allLines.push({ path, sourceId: magnets[i].id });
      }
    }
  }

  // 2. Trace BACKWARD from South poles
  // We filter out paths that land near any North pole to prevent double-drawing closed lines.
  for (let i = 0; i < magnets.length; i++) {
    const { south } = poles[i];
    const rSeed = Math.max(0.1, magnets[i].width * 0.8);
    
    const rotEuler = new Euler(...magnets[i].rotation);
    const quaternion = new Quaternion().setFromEuler(rotEuler);
    const dirY = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    
    // Outer seeds (for the large far-range loops)
    const seedCenterS_outer = south.clone().addScaledVector(dirY, -rSeed * 0.8);
    const seeds_outer = generateRingSeeds(seedCenterS_outer, rSeed, Math.ceil(density * 0.6), dirY);

    // Inner seeds (for the tight close-up loops)
    const seedCenterS_inner = south.clone().addScaledVector(dirY, rSeed * 0.6);
    const seeds_inner = generateRingSeeds(seedCenterS_inner, rSeed, Math.floor(density * 0.4), dirY);

    const seeds = [...seeds_outer, ...seeds_inner];

    for (const seed of seeds) {
      const path = traceFieldLine(seed, magnets, -1, stepSize, maxSteps, boundary, softening, poles);
      if (path.length > 1) {
        // Check if the final point is close to any North pole
        const endPoint = path[path.length - 1];
        let landsAtNorthPole = false;
        const stopDist = 0.35; // Restore original filtering window

        for (const p of poles) {
          if (endPoint.distanceTo(p.north) < stopDist) {
            landsAtNorthPole = true;
            break;
          }
        }

        // If it lands at a North pole, it was already traced forward by that North pole.
        // We only keep it if it goes to infinity (doesn't land at any North pole).
        if (!landsAtNorthPole) {
          // Unshift the exact south pole so lines going to infinity also perfectly originate from the point
          path.unshift(south.clone());
          path.reverse();
          allLines.push({ path, sourceId: magnets[i].id });
        }
      }
    }
  }

  return { lines: allLines };
}
