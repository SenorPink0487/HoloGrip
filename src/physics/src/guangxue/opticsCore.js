/**
 * Geometric optics core — ported from guangxue-source `optics.ts`.
 * Single source of truth for ray–mesh intersection, Snell / reflection, and Cauchy n(λ).
 */
import * as THREE from 'three';

/** Wavelength (nm) → approximate RGB for visible spectrum visualization */
export function wavelengthToRGB(nm) {
  let r = 0;
  let g = 0;
  let b = 0;

  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }

  let factor = 1;
  if (nm >= 380 && nm < 420) factor = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm > 700 && nm <= 780) factor = 0.3 + (0.7 * (780 - nm)) / 80;

  const gamma = 0.85;
  return new THREE.Color(
    Math.pow(r * factor, gamma),
    Math.pow(g * factor, gamma),
    Math.pow(b * factor, gamma),
  );
}

/** Cauchy's equation: n(λ) = A + B/λ²  (λ in μm), anchored at sodium D. */
export function cauchyIOR(baseIOR, nm, strength) {
  const lambdaUm = nm / 1000;
  const B = 0.008 * strength;
  const A = baseIOR - B / (0.589 * 0.589);
  return A + B / (lambdaUm * lambdaUm);
}

function rayTriangle(origin, dir, v0, v1, v2, tMin, tMax) {
  const eps = 1e-8;
  const e1 = new THREE.Vector3().subVectors(v1, v0);
  const e2 = new THREE.Vector3().subVectors(v2, v0);
  const pvec = new THREE.Vector3().crossVectors(dir, e2);
  const det = e1.dot(pvec);
  if (Math.abs(det) < eps) return null;
  const invDet = 1 / det;
  const tvec = new THREE.Vector3().subVectors(origin, v0);
  const u = tvec.dot(pvec) * invDet;
  if (u < 0 || u > 1) return null;
  const qvec = new THREE.Vector3().crossVectors(tvec, e1);
  const v = dir.dot(qvec) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = e2.dot(qvec) * invDet;
  if (t < tMin || t > tMax) return null;

  const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
  if (normal.dot(dir) > 0) normal.negate();

  return {
    point: origin.clone().addScaledVector(dir, t),
    normal,
    distance: t,
  };
}

/** Find nearest intersection of a ray with a BufferGeometry mesh */
export function intersectMesh(origin, dir, mesh, tMin = 1e-4, tMax = 100) {
  const geom = mesh.geometry;
  const pos = geom.attributes.position;
  if (!pos) return null;

  const invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const localOrigin = origin.clone().applyMatrix4(invMatrix);
  const localDir = dir.clone().transformDirection(invMatrix).normalize();

  let best = null;
  const index = geom.index;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const triCount = index ? index.count / 3 : pos.count / 3;

  for (let i = 0; i < triCount; i++) {
    let i0; let i1; let i2;
    if (index) {
      i0 = index.getX(i * 3);
      i1 = index.getX(i * 3 + 1);
      i2 = index.getX(i * 3 + 2);
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }
    v0.fromBufferAttribute(pos, i0);
    v1.fromBufferAttribute(pos, i1);
    v2.fromBufferAttribute(pos, i2);

    const hit = rayTriangle(localOrigin, localDir, v0, v1, v2, tMin, tMax);
    if (hit && (!best || hit.distance < best.distance)) {
      best = hit;
      best.faceIndex = i;
    }
  }

  if (!best) return null;

  best.point.applyMatrix4(mesh.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  best.normal.applyMatrix3(normalMatrix).normalize();
  best.distance = best.point.distanceTo(origin);
  if (best.normal.dot(dir) > 0) best.normal.negate();
  return best;
}

/** Snell's law refraction. Returns null on total internal reflection. */
export function refract(incident, normal, n1, n2) {
  const I = incident.clone().normalize();
  let N = normal.clone().normalize();
  let eta = n1 / n2;
  let cosi = -I.dot(N);

  if (cosi < 0) {
    cosi = -cosi;
    N.negate();
    eta = n2 / n1;
  }

  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;

  return I.multiplyScalar(eta).addScaledVector(N, eta * cosi - Math.sqrt(k)).normalize();
}

export function reflect(incident, normal) {
  const I = incident.clone().normalize();
  const N = normal.clone().normalize();
  return I.sub(N.multiplyScalar(2 * I.dot(N))).normalize();
}

const MAX_BOUNCES = 8;
const RAY_LENGTH = 12;

function angleFromNormal(dir, normal) {
  const cosi = Math.abs(dir.clone().normalize().dot(normal.clone().normalize()));
  return Math.acos(Math.min(1, Math.max(0, cosi))) * (180 / Math.PI);
}

function traceMirrorRay(origin, direction, mesh, color, options) {
  const maxBounces = options.mirrorBounces ?? 4;
  const segments = [];
  let pos = origin.clone();
  let dir = direction.clone().normalize();
  let firstIncidentAngle = null;
  let firstReflectAngle = null;
  let bounce = 0;

  while (bounce <= maxBounces) {
    const hit = intersectMesh(pos, dir, mesh);
    if (!hit) {
      segments.push({
        start: pos.clone(),
        end: pos.clone().addScaledVector(dir, RAY_LENGTH),
        color: bounce === 0
          ? color.clone()
          : color.clone().lerp(new THREE.Color(0xa8d4ff), 0.12),
        kind: bounce === 0 ? 'incident' : 'reflected',
        intensity: bounce === 0 ? 1 : 0.95,
      });
      break;
    }

    segments.push({
      start: pos.clone(),
      end: hit.point.clone(),
      color: bounce === 0
        ? color.clone()
        : color.clone().lerp(new THREE.Color(0xa8d4ff), 0.12),
      kind: bounce === 0 ? 'incident' : 'reflected',
      intensity: bounce === 0 ? 1 : 0.92,
    });

    if (bounce >= maxBounces) break;

    const N = hit.normal.clone();
    const incidentAngle = angleFromNormal(dir, N);
    if (firstIncidentAngle === null) firstIncidentAngle = incidentAngle;

    const R = reflect(dir, N);
    const reflectAngle = angleFromNormal(R, N);
    if (firstReflectAngle === null) firstReflectAngle = reflectAngle;

    dir = R;
    pos = hit.point.clone().addScaledVector(dir, 1e-3);
    bounce++;
  }

  return {
    segments,
    firstIncidentAngle,
    firstRefractAngle: null,
    firstReflectAngle,
  };
}

function traceDielectricRay(origin, direction, mesh, ior, color, options) {
  const showReflect = options.showReflect ?? true;
  const airIOR = options.airIOR ?? 1.0;
  const segments = [];
  let pos = origin.clone();
  let dir = direction.clone().normalize();
  let inside = false;
  let firstIncidentAngle = null;
  let firstRefractAngle = null;
  let firstReflectAngle = null;

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    const hit = intersectMesh(pos, dir, mesh);
    const endFar = pos.clone().addScaledVector(dir, RAY_LENGTH);

    if (!hit) {
      segments.push({
        start: pos.clone(),
        end: endFar,
        color: color.clone(),
        kind: inside ? 'refracted' : bounce === 0 ? 'incident' : 'refracted',
        intensity: inside ? 0.85 : 1,
      });
      break;
    }

    segments.push({
      start: pos.clone(),
      end: hit.point.clone(),
      color: color.clone(),
      kind: bounce === 0 ? 'incident' : inside ? 'refracted' : 'incident',
      intensity: inside ? 0.9 : 1,
    });

    const n1 = inside ? ior : airIOR;
    const n2 = inside ? airIOR : ior;
    const N = hit.normal.clone();
    const incidentAngle = angleFromNormal(dir, N);

    if (firstIncidentAngle === null && !inside) {
      firstIncidentAngle = incidentAngle;
    }

    if (showReflect) {
      const R = reflect(dir, N);
      const reflectAngle = angleFromNormal(R, N);
      if (firstReflectAngle === null && !inside) firstReflectAngle = reflectAngle;
      const reflectEnd = hit.point.clone().addScaledVector(R, RAY_LENGTH * 0.55);
      const cosi = Math.abs(dir.dot(N));
      const fresnel = Math.pow(1 - cosi, 2) * 0.35 + 0.08;
      segments.push({
        start: hit.point.clone(),
        end: reflectEnd,
        color: color.clone().lerp(new THREE.Color(0xffffff), 0.25),
        kind: 'reflected',
        intensity: fresnel,
      });
    }

    const T = refract(dir, N, n1, n2);
    if (!T) {
      dir = reflect(dir, N);
      pos = hit.point.clone().addScaledVector(dir, 1e-3);
      continue;
    }

    if (firstRefractAngle === null && !inside) {
      firstRefractAngle = angleFromNormal(T, N);
    }

    inside = !inside;
    dir = T;
    pos = hit.point.clone().addScaledVector(dir, 1e-3);
  }

  return { segments, firstIncidentAngle, firstRefractAngle, firstReflectAngle };
}

/**
 * Trace a light ray through a refractive mesh or off a mirror using geometric optics.
 * mode: 'dielectric' | 'mirror'
 */
export function traceRay(origin, direction, mesh, ior, color, options = {}) {
  const mode = options.mode ?? 'dielectric';
  if (mode === 'mirror') {
    return traceMirrorRay(origin, direction, mesh, color, options);
  }
  return traceDielectricRay(origin, direction, mesh, ior, color, options);
}

/** Sample wavelengths across visible spectrum */
export function spectrumWavelengths(count) {
  if (count <= 1) return [580];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(400 + (700 - 400) * (i / (count - 1)));
  }
  return out;
}

/** Ideal Snell ratio from air into medium (for table verification). */
export function snellRatio(theta1Deg, theta2Deg) {
  if (theta2Deg == null || !Number.isFinite(theta2Deg) || theta2Deg <= 0.05) return null;
  const s1 = Math.sin((theta1Deg * Math.PI) / 180);
  const s2 = Math.sin((theta2Deg * Math.PI) / 180);
  if (Math.abs(s2) < 1e-9) return null;
  return s1 / s2;
}

/** Critical angle (deg) from denser n1 into air n2≈1. */
export function criticalAngleDeg(n1, n2 = 1) {
  if (!(n1 > n2) || n1 <= 0) return null;
  const s = n2 / n1;
  if (s >= 1) return null;
  return (Math.asin(s) * 180) / Math.PI;
}
