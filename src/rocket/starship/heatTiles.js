import * as THREE from 'three';

/** Shared hex prism geometry (unit radius 1, height 1 along Y). */
let _hexGeo = null;
function hexGeometry() {
  if (!_hexGeo) {
    // Flat-top hex; height (Y) = thin axis after we reorient radial
    _hexGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    _hexGeo.rotateY(Math.PI / 6);
  }
  return _hexGeo;
}

const _radial = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

/** Keep the TPS shell on the same blended-ogive profile as the nose mesh. */
function noseRadiusAt(radius, t) {
  const ogive = Math.sqrt(Math.max(0, 1 - t * t * 0.98));
  const blunt = Math.pow(1 - t, 1.15);
  return radius * (ogive * 0.55 + blunt * 0.45);
}

/**
 * Approximate windward heat-shield tile pattern on a cylindrical / ogive surface.
 * Uses hexagonal TPS tiles with staggered rows (Starship-style).
 */
export function addHeatTiles(parent, mats, {
  radius,
  y0,
  y1,
  segments = 28,
  rows = 36,
  arc = Math.PI * 0.95,
  arcCenter = Math.PI, // -Z windward
  tileGap = 0.028,
  isNose = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'HeatTiles';

  const height = y1 - y0;
  const tileH = height / rows - tileGap;
  const base = hexGeometry();

  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    const y = y0 + v * height;

    let r = radius;
    if (isNose) {
      // v runs from the nose base to its tip. The previous inverted curve
      // widened the tile shell toward the tip, creating the detached black
      // clump visible above the barrel.
      r = noseRadiusAt(radius, v);
    }

    const colCount = Math.max(6, Math.round(segments * (r / radius)));
    const tileW = (arc * r) / colCount - tileGap;
    // Hex circumradius so flat-to-flat ≈ tileW
    const hexR = Math.max(0.055, tileW * 0.52);
    // Thin radial thickness — close to real silica tile depth
    const hexThick = 0.032;

    for (let col = 0; col < colCount; col++) {
      const offset = (row % 2) * 0.5;
      const u = (col + 0.5 + offset) / colCount;
      if (u < 0.015 || u > 0.985) continue;
      const angle = arcCenter - arc / 2 + u * arc;

      // Mostly uniform TPS — sparse edge variation only (metal tiles read as noise mid-shot)
      const matPick =
        (row + col) % 17 === 0 ? mats.heatTileEdge : mats.heatTile;

      const tile = new THREE.Mesh(base, matPick);
      // scale: XZ = hex size, Y = thickness (then reorient Y → radial)
      tile.scale.set(hexR, hexThick, Math.max(0.05, tileH * 0.52));

      // Sit flush on the barrel (was +0.04 → “floating mesh” look)
      const rr = r + 0.018;
      tile.position.set(Math.sin(angle) * rr, y, Math.cos(angle) * rr);

      // Orient thin axis (local Y) radially outward
      _radial.set(Math.sin(angle), 0, Math.cos(angle));
      _quat.setFromUnitVectors(_up, _radial);
      tile.quaternion.copy(_quat);
      // Stagger hex flat orientation slightly with altitude for visual variety
      tile.rotateY((row % 2) * (Math.PI / 6));

      group.add(tile);
    }
  }

  parent.add(group);
  return group;
}

/** Tile the windward face of a flat flap plate with hex pattern. */
export function tileFlapFace(flap, mats, width, height) {
  return tileFlapTrapezoid(flap, mats, width, width, height);
}

/**
 * Tile a trapezoidal flap face (wTop may differ from wBot).
 * Local coords: plate centered at origin, width along X, height along Y, face +Z.
 */
export function tileFlapTrapezoid(flap, mats, wTop, wBot, height) {
  const group = new THREE.Group();
  group.name = 'FlapTiles';
  const base = hexGeometry();

  const rows = Math.max(5, Math.floor(height / 0.32));
  const th = height / rows;

  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows;
    const rowW = THREE.MathUtils.lerp(wBot, wTop, v);
    const cols = Math.max(2, Math.floor(rowW / 0.3));
    const tw = rowW / cols;
    const hexR = Math.min(tw, th) * 0.48;
    const xOff = (r % 2) * (tw * 0.5);

    for (let c = 0; c < cols; c++) {
      const x = -rowW / 2 + (c + 0.5) * tw + xOff;
      if (Math.abs(x) > rowW / 2 - 0.04) continue;
      const y = -height / 2 + (r + 0.5) * th;

      const tile = new THREE.Mesh(
        base,
        (r + c) % 8 === 0 ? mats.heatTileEdge : mats.heatTile
      );
      // Flat hex in XY of flap, thin along Z
      tile.scale.set(hexR, 0.038, hexR);
      tile.position.set(x, y, 0.045);
      tile.rotation.x = Math.PI / 2;
      group.add(tile);
    }
  }
  flap.add(group);
  return group;
}
