/**
 * KSP-style attach snap math: stack nodes + continuous radial cylinder projection.
 * Pure helpers (no DOM) — unit-testable without WebGL context.
 */

import * as THREE from 'three';
import { getPartDef } from './partDefs.js';
import { getPart } from './craftGraph.js';

/** World-unit thresholds scale with camera distance — generous like KSP magnets. */
export const SNAP_STACK_BASE = 5.5;
export const SNAP_RADIAL_BASE = 10;

/**
 * @param {number} baseAngle
 * @param {number} symmetry
 * @returns {number[]}
 */
export function computeSymmetryAngles(baseAngle, symmetry = 1) {
  const n = Math.max(1, Math.min(8, Math.round(symmetry || 1)));
  if (n <= 1) return [baseAngle || 0];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push((baseAngle || 0) + (i / n) * Math.PI * 2);
  }
  return out;
}

/**
 * Find host Object3D for a craft part on the assembled rocket.
 * @param {THREE.Object3D} rocket
 * @param {string} parentId
 * @returns {THREE.Object3D | null}
 */
export function findHostObject(rocket, parentId) {
  if (!rocket || !parentId) return null;
  let host = null;
  rocket.traverse((o) => {
    if (host) return;
    if (o.userData?.partId === parentId) host = o;
  });
  if (host) return host;
  rocket.traverse((o) => {
    if (host) return;
    if (o.userData?.stageId === parentId) host = o;
    if (o.userData?.tankPartIds?.includes?.(parentId)) host = o;
    if (o.userData?.partIds?.includes?.(parentId)) host = o;
  });
  return host;
}

/**
 * World-space cylinder bounds for stack/radial attach on a tank-like host.
 * @returns {{
 *   cx: number, cy: number, cz: number,
 *   radius: number, minY: number, maxY: number,
 *   center: THREE.Vector3
 * } | null}
 */
export function getHostCylinder(rocket, craft, parentId) {
  if (!rocket || !parentId) return null;
  const part = getPart(craft, parentId);
  const def = part ? getPartDef(part.defId) : null;
  const host = findHostObject(rocket, parentId);

  let minY;
  let maxY;
  let cx = 0;
  let cz = 0;
  let radius = (part?.params?.diameter || 9) / 2;

  if (host) {
    host.updateWorldMatrix(true, false);
    // Prefer stage group (has role / height) for full barrel bounds
    let stage = host;
    while (stage.parent && stage.parent !== rocket) {
      if (stage.userData?.role || stage.userData?.height != null) break;
      stage = stage.parent;
    }
    const box = new THREE.Box3().setFromObject(stage);
    if (!box.isEmpty()) {
      minY = box.min.y;
      maxY = box.max.y;
      cx = (box.min.x + box.max.x) / 2;
      cz = (box.min.z + box.max.z) / 2;
      const rx = (box.max.x - box.min.x) / 2;
      const rz = (box.max.z - box.min.z) / 2;
      radius = Math.max(radius, Math.min(rx, rz) * 0.92);
    } else {
      const wp = new THREE.Vector3();
      stage.getWorldPosition(wp);
      const h = part?.params?.height || stage.userData?.height || 40;
      const r = stage.userData?.radius || radius;
      minY = wp.y;
      maxY = wp.y + h;
      cx = wp.x;
      cz = wp.z;
      radius = r;
    }
  } else {
    const h = part?.params?.height || 40;
    const ec = rocket.userData?.engineClearance || 0;
    minY = ec;
    maxY = ec + h;
    radius = (part?.params?.diameter || 9) / 2;
  }

  // Decoupler / thin parts: still need a disk
  if (def?.category === 'decoupler' && maxY - minY < 1.5) {
    const mid = (minY + maxY) / 2;
    minY = mid - 0.4;
    maxY = mid + 0.4;
  }

  const cy = (minY + maxY) / 2;
  return {
    cx,
    cy,
    cz,
    radius: Math.max(0.4, radius),
    minY,
    maxY,
    center: new THREE.Vector3(cx, cy, cz),
  };
}

/**
 * World position for a stack or default radial marker.
 * @param {string} parentNode top|bottom|radial|mount
 * @param {number} [angle] for radial
 * @param {number} [yFraction] for radial
 * @param {number} [radialPad] extra outward offset
 */
export function nodeWorldPosition(cyl, parentNode, angle = 0, yFraction = 0.5, radialPad = 1.2) {
  if (!cyl) return null;
  if (parentNode === 'top') {
    return new THREE.Vector3(cyl.cx, cyl.maxY, cyl.cz);
  }
  if (parentNode === 'bottom' || parentNode === 'mount') {
    return new THREE.Vector3(cyl.cx, cyl.minY, cyl.cz);
  }
  // radial
  const yf = Math.min(1, Math.max(0, yFraction));
  const y = cyl.minY + yf * (cyl.maxY - cyl.minY);
  const r = cyl.radius + radialPad;
  return new THREE.Vector3(
    cyl.cx + Math.sin(angle) * r,
    y,
    cyl.cz + Math.cos(angle) * r
  );
}

/**
 * Ray–infinite vertical cylinder (axis Y at cx,cz), nearest positive hit.
 * @returns {{ t: number, point: THREE.Vector3, angle: number, y: number } | null}
 */
export function intersectVerticalCylinder(ray, cx, cz, radius) {
  if (!ray || radius <= 0) return null;
  const ox = ray.origin.x - cx;
  const oz = ray.origin.z - cz;
  const dx = ray.direction.x;
  const dz = ray.direction.z;
  const a = dx * dx + dz * dz;

  // Ray nearly parallel to axis — project origin onto cylinder surface in XZ
  if (a < 1e-10) {
    const dist = Math.hypot(ox, oz);
    if (dist < 1e-8) return null;
    const scale = radius / dist;
    const point = new THREE.Vector3(cx + ox * scale, ray.origin.y, cz + oz * scale);
    return {
      t: 0,
      point,
      angle: Math.atan2(point.x - cx, point.z - cz),
      y: point.y,
    };
  }

  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    // No intersection: closest approach on infinite cylinder exterior
    // Use ray point of closest approach to axis, then push to surface
    const tAxis = -(ox * dx + oz * dz) / a;
    if (tAxis < 0) return null;
    const px = ray.origin.x + tAxis * ray.direction.x;
    const py = ray.origin.y + tAxis * ray.direction.y;
    const pz = ray.origin.z + tAxis * ray.direction.z;
    const vx = px - cx;
    const vz = pz - cz;
    const d = Math.hypot(vx, vz);
    if (d < 1e-8) return null;
    const point = new THREE.Vector3(cx + (vx / d) * radius, py, cz + (vz / d) * radius);
    return {
      t: tAxis,
      point,
      angle: Math.atan2(point.x - cx, point.z - cz),
      y: py,
      exterior: true,
      approachDist: d - radius,
    };
  }

  const s = Math.sqrt(disc);
  let t0 = (-b - s) / (2 * a);
  let t1 = (-b + s) / (2 * a);
  if (t0 < 0) t0 = t1;
  if (t0 < 0) return null;
  const point = new THREE.Vector3(
    ray.origin.x + t0 * ray.direction.x,
    ray.origin.y + t0 * ray.direction.y,
    ray.origin.z + t0 * ray.direction.z
  );
  return {
    t: t0,
    point,
    angle: Math.atan2(point.x - cx, point.z - cz),
    y: point.y,
  };
}

/**
 * Distance from ray to a world point (perpendicular), and t along ray.
 */
export function rayPointMetrics(ray, point) {
  const closest = new THREE.Vector3();
  ray.closestPointToPoint(point, closest);
  const toClosest = closest.clone().sub(ray.origin);
  const t = toClosest.dot(ray.direction);
  const dist = closest.distanceTo(point);
  return { dist, t, closest };
}

/**
 * Build snap candidates from install targets + rocket geometry.
 * @param {object[]} targets from listValidAttachTargets
 * @returns {object[]}
 */
export function buildSnapCandidates(rocket, craft, targets) {
  const out = [];
  for (const t of targets || []) {
    if (!t.parentId || !t.parentNode) continue;
    const cyl = getHostCylinder(rocket, craft, t.parentId);
    if (!cyl) continue;
    const node = t.parentNode;
    const isStack = node === 'top' || node === 'bottom' || node === 'mount';
    const world = isStack
      ? nodeWorldPosition(cyl, node)
      : nodeWorldPosition(cyl, 'radial', 0, 0.5, 1.4);
    out.push({
      parentId: t.parentId,
      parentNode: node,
      scoreBase: t.score || 10,
      isStack,
      cyl,
      world,
    });
  }
  return out;
}

/**
 * Resolve best install snap from a picking ray.
 * @param {THREE.Ray} ray
 * @param {object[]} candidates
 * @param {{
 *   camDist?: number,
 *   rotation?: number,
 *   preferRadial?: boolean,
 *   defCategory?: string
 * }} [opts]
 * @returns {{
 *   parentId: string,
 *   parentNode: string,
 *   angle: number,
 *   yFraction: number,
 *   world: THREE.Vector3,
 *   score: number,
 *   isStack: boolean
 * } | null}
 */
export function resolveSnapFromRay(ray, candidates, opts = {}) {
  if (!ray || !candidates?.length) return null;
  const camDist = opts.camDist ?? 80;
  const rot = opts.rotation || 0;
  const stackThresh = SNAP_STACK_BASE + camDist * 0.028;
  const radialThresh = SNAP_RADIAL_BASE + camDist * 0.045;

  let best = null;

  for (const c of candidates) {
    if (c.isStack) {
      const { dist, t } = rayPointMetrics(ray, c.world);
      if (t < 0) continue;
      if (dist > stackThresh) continue;
      // Prefer closer to node; bias by part score
      const score = c.scoreBase * 2 - dist * 8 - t * 0.01;
      if (!best || score > best.score) {
        best = {
          parentId: c.parentId,
          parentNode: c.parentNode,
          angle: rot,
          yFraction: c.parentNode === 'top' ? 1 : 0,
          world: c.world.clone(),
          score,
          isStack: true,
        };
      }
    } else {
      // Continuous radial: intersect shell slightly outside skin for aim comfort
      const hitR = c.cyl.radius * 1.02;
      const hit = intersectVerticalCylinder(ray, c.cyl.cx, c.cyl.cz, hitR);
      if (!hit) continue;
      if (hit.t < 0) continue;
      // Soft Y clamp onto barrel
      let y = hit.y;
      if (y < c.cyl.minY - radialThresh || y > c.cyl.maxY + radialThresh) continue;
      y = Math.min(c.cyl.maxY, Math.max(c.cyl.minY, y));
      const yFraction = c.cyl.maxY > c.cyl.minY ? (y - c.cyl.minY) / (c.cyl.maxY - c.cyl.minY) : 0.5;
      const angle = hit.angle + rot;
      const exteriorPenalty = hit.exterior ? (hit.approachDist || 0) * 2 : 0;
      if (exteriorPenalty > radialThresh) continue;
      const world = nodeWorldPosition(c.cyl, 'radial', angle, yFraction, 1.4);
      const { dist } = rayPointMetrics(ray, world);
      const score =
        c.scoreBase +
        15 -
        exteriorPenalty * 3 -
        dist * 1.2 -
        Math.abs(hit.y - y) * 0.5;
      if (!best || score > best.score) {
        best = {
          parentId: c.parentId,
          parentNode: c.parentNode,
          angle,
          yFraction,
          world,
          score,
          isStack: false,
        };
      }
    }
  }

  // If nothing within threshold, still pick nearest stack node as soft preview
  // (ghost shows but click only commits when score high enough — handled by caller)
  if (!best) {
    let nearest = null;
    for (const c of candidates) {
      if (!c.isStack || !c.world) continue;
      const { dist, t } = rayPointMetrics(ray, c.world);
      if (t < 0) continue;
      const score = -dist;
      if (!nearest || score > nearest.score) {
        nearest = {
          parentId: c.parentId,
          parentNode: c.parentNode,
          angle: rot,
          yFraction: c.parentNode === 'top' ? 1 : 0,
          world: c.world.clone(),
          score: score - 1000, // mark as soft / weak
          isStack: true,
          soft: true,
        };
      }
    }
    best = nearest;
  }

  return best;
}

/**
 * Whether a snap is strong enough to commit on click.
 */
export function isSnapCommitable(snap) {
  if (!snap || snap.soft) return false;
  return snap.score > -50;
}

/**
 * Radial pad offset by category (ghost / final mesh alignment hint).
 */
export function radialPadForCategory(category) {
  if (category === 'side') return 2.2;
  if (category === 'aero') return 1.8;
  if (category === 'decor') return 0.6;
  return 1.2;
}
