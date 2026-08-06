/**
 * Build a lightweight Three.js ball-stick group from SDF text or atom list.
 * Avoids mounting full-page 3Dmol so models live inside the lab scene.
 */

const ELEMENT_COLORS = {
  H: 0xffffff,
  C: 0x4b5563,
  N: 0x3b82f6,
  O: 0xef4444,
  S: 0xeab308,
  P: 0xf97316,
  F: 0x22c55e,
  CL: 0x14b8a6,
  BR: 0xb91c1c,
  I: 0x7c3aed,
  NA: 0xa855f7,
  K: 0x8b5cf6,
  CA: 0xa3e635,
  MG: 0x84cc16,
  FE: 0xea580c,
  CU: 0xf59e0b,
  ZN: 0x94a3b8,
  AG: 0xe2e8f0,
  AL: 0xd4d4d8,
  SI: 0xf5f5f4,
};

const ELEMENT_RADIUS = {
  H: 0.22,
  C: 0.38,
  N: 0.36,
  O: 0.34,
  S: 0.42,
  P: 0.42,
  default: 0.36,
};

/**
 * Parse a minimal SDF / MOL block into atoms + bonds.
 * @param {string} sdf
 * @returns {{ atoms: { elem: string, x: number, y: number, z: number }[], bonds: { a: number, b: number, order: number }[] }}
 */
export function parseSdf(sdf) {
  const lines = String(sdf || '').replace(/\r\n/g, '\n').split('\n');
  // Find counts line: " aaabb..." after 3 header lines, or scan for pattern
  let countsIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i += 1) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      countsIdx = i;
      break;
    }
  }
  if (countsIdx < 0) return { atoms: [], bonds: [] };
  const counts = lines[countsIdx].trim().split(/\s+/);
  const nAtoms = parseInt(counts[0], 10) || 0;
  const nBonds = parseInt(counts[1], 10) || 0;
  const atoms = [];
  for (let i = 0; i < nAtoms; i += 1) {
    const line = lines[countsIdx + 1 + i] || '';
    // Fixed-width-ish: x y z elem
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    atoms.push({
      x: parseFloat(parts[0]) || 0,
      y: parseFloat(parts[1]) || 0,
      z: parseFloat(parts[2]) || 0,
      elem: String(parts[3] || 'C').toUpperCase(),
    });
  }
  const bonds = [];
  for (let i = 0; i < nBonds; i += 1) {
    const line = lines[countsIdx + 1 + nAtoms + i] || '';
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const a = (parseInt(parts[0], 10) || 1) - 1;
    const b = (parseInt(parts[1], 10) || 1) - 1;
    const order = parseInt(parts[2], 10) || 1;
    if (a >= 0 && b >= 0 && a < atoms.length && b < atoms.length) {
      bonds.push({ a, b, order });
    }
  }
  return { atoms, bonds };
}

/**
 * @param {typeof import('three')} THREE
 * @param {{ atoms: any[], bonds: any[] } | string} source  atoms/bonds or SDF string
 * @param {{ scale?: number }} [opts]
 */
export function createMoleculeMesh(THREE, source, opts = {}) {
  const scale = opts.scale ?? 0.12;
  const parsed = typeof source === 'string' ? parseSdf(source) : source;
  const { atoms, bonds } = parsed || { atoms: [], bonds: [] };
  const root = new THREE.Group();
  root.name = 'chem-molecule';

  if (!atoms.length) {
    // Placeholder orb so empty still shows something
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 24, 24),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x059669,
        emissiveIntensity: 0.4,
        metalness: 0.2,
        roughness: 0.35,
      }),
    );
    root.add(orb);
    return root;
  }

  // Center atoms
  let cx = 0; let cy = 0; let cz = 0;
  atoms.forEach((a) => { cx += a.x; cy += a.y; cz += a.z; });
  cx /= atoms.length; cy /= atoms.length; cz /= atoms.length;

  const atomMeshes = [];
  atoms.forEach((a) => {
    const elem = String(a.elem || 'C').toUpperCase();
    const color = ELEMENT_COLORS[elem] ?? 0x94a3b8;
    const r = (ELEMENT_RADIUS[elem] ?? ELEMENT_RADIUS.default) * scale * 8;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 20),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        metalness: 0.15,
        roughness: 0.4,
      }),
    );
    mesh.position.set(
      (a.x - cx) * scale,
      (a.y - cy) * scale,
      (a.z - cz) * scale,
    );
    mesh.castShadow = false;
    root.add(mesh);
    atomMeshes.push(mesh);
  });

  const bondMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.3,
    roughness: 0.45,
  });
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _quat = new THREE.Quaternion();

  bonds.forEach((bond) => {
    const A = atomMeshes[bond.a];
    const B = atomMeshes[bond.b];
    if (!A || !B) return;
    _dir.subVectors(B.position, A.position);
    const len = _dir.length();
    if (len < 1e-5) return;
    _mid.addVectors(A.position, B.position).multiplyScalar(0.5);
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018 * (scale / 0.12), 0.018 * (scale / 0.12), len, 8),
      bondMat,
    );
    _dir.normalize();
    _quat.setFromUnitVectors(_up, _dir);
    cyl.quaternion.copy(_quat);
    cyl.position.copy(_mid);
    root.add(cyl);
  });

  return root;
}

/** Simple procedural fallback molecule when PubChem is offline. */
export function createFallbackMolecule(THREE, formula = 'H2O') {
  const f = String(formula || '').toUpperCase();
  if (f.includes('H2O') || f === 'WATER') {
    return createMoleculeMesh(THREE, {
      atoms: [
        { elem: 'O', x: 0, y: 0, z: 0 },
        { elem: 'H', x: 0.96, y: 0, z: 0 },
        { elem: 'H', x: -0.24, y: 0.93, z: 0 },
      ],
      bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }],
    });
  }
  if (f.includes('NACL') || f.includes('NACL')) {
    return createMoleculeMesh(THREE, {
      atoms: [
        { elem: 'NA', x: 0, y: 0, z: 0 },
        { elem: 'CL', x: 2.3, y: 0, z: 0 },
      ],
      bonds: [{ a: 0, b: 1, order: 1 }],
    });
  }
  // Generic triatomic
  return createMoleculeMesh(THREE, {
    atoms: [
      { elem: 'C', x: 0, y: 0, z: 0 },
      { elem: 'O', x: 1.2, y: 0.3, z: 0 },
      { elem: 'O', x: -1.2, y: 0.3, z: 0 },
    ],
    bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }],
  }, { scale: 0.14 });
}
