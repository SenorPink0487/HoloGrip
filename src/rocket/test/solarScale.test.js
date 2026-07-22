import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AU_IN_EARTH_RADII,
  BODY_RADIUS_RATIOS,
  MOON_ORBIT_IN_EARTH_RADII,
  ORBIT_AU,
  SYSTEM_FAR_ORBIT_MULTIPLIER,
  createSolarScale,
} from '../scene/solarScale.js';

describe('solar-system display scale', () => {
  const earthRadius = 14_000;
  const scale = createSolarScale(earthRadius);

  it('uses real relative body radii', () => {
    assert.equal(BODY_RADIUS_RATIOS.sun, 109.2);
    assert.equal(BODY_RADIUS_RATIOS.mercury, 0.383);
    assert.equal(BODY_RADIUS_RATIOS.venus, 0.949);
    assert.equal(BODY_RADIUS_RATIOS.earth, 1);
    assert.equal(BODY_RADIUS_RATIOS.moon, 0.273);
    assert.equal(BODY_RADIUS_RATIOS.mars, 0.532);
    assert.equal(BODY_RADIUS_RATIOS.jupiter, 10.973);
    assert.equal(BODY_RADIUS_RATIOS.saturn, 9.14);
  });

  it('compresses one AU to 400 Earth radii', () => {
    assert.equal(AU_IN_EARTH_RADII, 400);
    assert.equal(scale.AU, earthRadius * 400);
  });

  it('keeps the real Earth–Moon distance ratio', () => {
    assert.equal(MOON_ORBIT_IN_EARTH_RADII, 60.34);
    assert.equal(scale.moonOrbitRadius, earthRadius * 60.34);
  });

  it('preserves the configured real AU ratios', () => {
    assert.deepEqual(ORBIT_AU, {
      mercury: 0.387,
      venus: 0.723,
      earth: 1,
      mars: 1.524,
      jupiter: 5.203,
      saturn: 9.537,
    });
    assert.equal(scale.outerOrbitRadius, scale.AU * ORBIT_AU.saturn);
  });

  it('places Mercury outside the true-scale solar photosphere', () => {
    const mercuryOrbit = scale.AU * ORBIT_AU.mercury;
    const requiredClearance =
      scale.sunRadius + earthRadius * BODY_RADIUS_RATIOS.mercury;
    assert.ok(mercuryOrbit > requiredClearance);
  });

  it('provides a far plane beyond every allowed system overview distance', () => {
    const far = scale.outerOrbitRadius * SYSTEM_FAR_ORBIT_MULTIPLIER;
    const maxOverviewDistance = scale.outerOrbitRadius * 8;
    assert.ok(far > maxOverviewDistance + scale.outerOrbitRadius);
  });
});
