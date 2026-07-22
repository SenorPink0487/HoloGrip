/** True when a point lies inside an axis-aligned rectangle centred at the origin. */
export function isInsideBlock(point, halfX, halfZ) {
  return Math.abs(point.x) < halfX && Math.abs(point.z) < halfZ;
}

/**
 * Move a player point around a rectangular obstacle with axis sliding.
 * If an animation placed the root inside the obstacle, project it onto the
 * nearest exterior edge first so normal movement can never remain trapped.
 */
export function resolveFloorMovement(current, delta, bounds) {
  const {
    roomHalfX,
    roomHalfZ,
    blockHalfX,
    blockHalfZ,
    separation = 0.001,
  } = bounds;

  let oldX = clamp(current.x, -roomHalfX, roomHalfX);
  let oldZ = clamp(current.z, -roomHalfZ, roomHalfZ);

  if (isInsideBlock({ x: oldX, z: oldZ }, blockHalfX, blockHalfZ)) {
    const distanceToXEdge = blockHalfX - Math.abs(oldX);
    const distanceToZEdge = blockHalfZ - Math.abs(oldZ);
    if (distanceToXEdge <= distanceToZEdge) {
      const sign = oldX === 0 ? (delta.x < 0 ? -1 : 1) : Math.sign(oldX);
      oldX = sign * (blockHalfX + separation);
    } else {
      const sign = oldZ === 0 ? (delta.z < 0 ? -1 : 1) : Math.sign(oldZ);
      oldZ = sign * (blockHalfZ + separation);
    }
  }

  const blocked = (x, z) => isInsideBlock({ x, z }, blockHalfX, blockHalfZ);
  let x = clamp(oldX + delta.x, -roomHalfX, roomHalfX);
  let z = clamp(oldZ + delta.z, -roomHalfZ, roomHalfZ);

  if (blocked(x, z)) {
    if (!blocked(x, oldZ)) z = oldZ;
    else if (!blocked(oldX, z)) x = oldX;
    else {
      x = oldX;
      z = oldZ;
    }
  }

  return { x, z };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
