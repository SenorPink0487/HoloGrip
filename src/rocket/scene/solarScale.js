/**
 * Solar-system display scale.
 *
 * Body radii are real ratios relative to Earth's mean radius. Heliocentric
 * distances retain their real AU ratios, but one display AU is deliberately
 * compressed to 400 Earth radii so the system remains explorable.
 */
export const AU_IN_EARTH_RADII = 400;
export const MOON_ORBIT_IN_EARTH_RADII = 60.34;
export const SYSTEM_FAR_ORBIT_MULTIPLIER = 12;

export const BODY_RADIUS_RATIOS = Object.freeze({
  sun: 109.2,
  mercury: 0.383,
  venus: 0.949,
  earth: 1,
  moon: 0.273,
  mars: 0.532,
  jupiter: 10.973,
  saturn: 9.14,
});

export const ORBIT_AU = Object.freeze({
  mercury: 0.387,
  venus: 0.723,
  earth: 1,
  mars: 1.524,
  jupiter: 5.203,
  saturn: 9.537,
});

export function createSolarScale(earthRadius) {
  const AU = earthRadius * AU_IN_EARTH_RADII;
  return {
    AU,
    moonOrbitRadius: earthRadius * MOON_ORBIT_IN_EARTH_RADII,
    sunRadius: earthRadius * BODY_RADIUS_RATIOS.sun,
    outerOrbitRadius: AU * ORBIT_AU.saturn,
  };
}
