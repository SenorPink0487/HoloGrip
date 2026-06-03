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

// Calculate the magnetic field B vector at a given position p
// B(p) = sum_i [ strength_i * ( (p - N_i)/|p - N_i|^3 - (p - S_i)/|p - S_i|^3 ) ]
export function calculateMagneticField(
  p: Vector3,
  magnets: Magnet[],
  softening: number = 0.08
): Vector3 {
  const B = new Vector3(0, 0, 0);
  const soft2 = softening * softening;

  for (const magnet of magnets) {
    const { north, south } = getPolePositions(magnet);

    // Field from North pole (+q_m)
    const rN = new Vector3().subVectors(p, north);
    const distN2 = rN.lengthSq() + soft2;
    const distN3 = Math.pow(distN2, 1.5);
    const fieldN = rN.multiplyScalar(magnet.strength / distN3);

    // Field from South pole (-q_m)
    const rS = new Vector3().subVectors(p, south);
    const distS2 = rS.lengthSq() + soft2;
    const distS3 = Math.pow(distS2, 1.5);
    const fieldS = rS.multiplyScalar(-magnet.strength / distS3);

    B.add(fieldN).add(fieldS);
  }

  return B;
}

// Generate uniform seeds on a sphere around a pole position using Fibonacci spiral
export function generateSphericalSeeds(
  center: Vector3,
  radius: number,
  numLines: number
): Vector3[] {
  const seeds: Vector3[] = [];
  if (numLines <= 0) return seeds;
  if (numLines === 1) {
    seeds.push(center.clone().add(new Vector3(0, radius, 0)));
    return seeds;
  }

  const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

  for (let i = 0; i < numLines; i++) {
    const y = 1 - (i / (numLines - 1)) * 2; // y goes from 1 to -1
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y)); // radius at y
    const theta = phi * i;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    seeds.push(new Vector3(x, y, z).multiplyScalar(radius).add(center));
  }

  return seeds;
}

// Trace a single field line from a seed point using RK4 integration
// direction = 1 for forward tracing, -1 for backward tracing
export function traceFieldLine(
  seed: Vector3,
  magnets: Magnet[],
  direction: 1 | -1,
  stepSize: number,
  maxSteps: number,
  boundary: number = 15,
  softening: number = 0.08
): Vector3[] {
  const path: Vector3[] = [seed.clone()];
  const current = seed.clone();
  const h = stepSize * direction;
  const stopDist = 0.25; // Stop tracing if we get very close to a pole

  // Keep track of the pole locations to check stop conditions
  const poles = magnets.map(m => getPolePositions(m));

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

      // Also stop if we accidentally loop back into the same pole (numerical sanity check)
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
    // B(x) = f(x)
    // v(x) = B(x) / |B(x)|
    const getDir = (pos: Vector3): Vector3 => {
      const B = calculateMagneticField(pos, magnets, softening);
      const len = B.length();
      if (len < 1e-6) return new Vector3(0, 0, 0);
      return B.normalize();
    };

    const k1 = getDir(current);
    if (k1.lengthSq() < 1e-4) break; // Field is too weak

    // current + 0.5 * h * k1
    const p1 = current.clone().addScaledVector(k1, 0.5 * h);
    const k2 = getDir(p1);

    // current + 0.5 * h * k2
    const p2 = current.clone().addScaledVector(k2, 0.5 * h);
    const k3 = getDir(p2);

    // current + h * k3
    const p3 = current.clone().addScaledVector(k3, h);
    const k4 = getDir(p3);

    // x_{next} = x + h/6 * (k1 + 2*k2 + 2*k3 + k4)
    const delta = new Vector3()
      .add(k1)
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
): { lines: Vector3[][]; debugInfo?: string } {
  const allLines: Vector3[][] = [];
  if (magnets.length === 0) return { lines: [] };

  const poles = magnets.map(m => getPolePositions(m));

  // 1. Trace FORWARD from North poles
  for (let i = 0; i < magnets.length; i++) {
    const { north } = poles[i];
    // Scale seed radius based on magnet width
    const rSeed = Math.max(0.1, magnets[i].width * 0.8);
    const seeds = generateSphericalSeeds(north, rSeed, density);

    for (const seed of seeds) {
      const path = traceFieldLine(seed, magnets, 1, stepSize, maxSteps, boundary, softening);
      if (path.length > 1) {
        allLines.push(path);
      }
    }
  }

  // 2. Trace BACKWARD from South poles
  // We filter out paths that land near any North pole to prevent double-drawing closed lines.
  for (let i = 0; i < magnets.length; i++) {
    const { south } = poles[i];
    const rSeed = Math.max(0.1, magnets[i].width * 0.8);
    const seeds = generateSphericalSeeds(south, rSeed, density);

    for (const seed of seeds) {
      const path = traceFieldLine(seed, magnets, -1, stepSize, maxSteps, boundary, softening);
      if (path.length > 1) {
        // Check if the final point is close to any North pole
        const endPoint = path[path.length - 1];
        let landsAtNorthPole = false;
        const stopDist = 0.35; // slightly larger window for checking endpoint alignment

        for (const p of poles) {
          if (endPoint.distanceTo(p.north) < stopDist) {
            landsAtNorthPole = true;
            break;
          }
        }

        // If it lands at a North pole, it was already traced forward by that North pole.
        // We only keep it if it goes to infinity (doesn't land at any North pole).
        if (!landsAtNorthPole) {
          path.reverse();
          allLines.push(path);
        }
      }
    }
  }

  return { lines: allLines };
}
