/**
 * Unit tests for KSP-style attach snap math.
 * Run: node --test tests/attachSnap.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  computeSymmetryAngles,
  intersectVerticalCylinder,
  rayPointMetrics,
  resolveSnapFromRay,
  isSnapCommitable,
  nodeWorldPosition,
  buildSnapCandidates,
  radialPadForCategory,
  SNAP_STACK_BASE,
} from '../design/attachSnap.js';
import { createDefaultStarshipCraft } from '../design/craftGraph.js';
import { createRocketFromDesign } from '../design/generator.js';

describe('computeSymmetryAngles', () => {
  it('returns single angle for symmetry 1', () => {
    assert.deepEqual(computeSymmetryAngles(0.5, 1), [0.5]);
  });

  it('spreads angles evenly for ×4', () => {
    const a = computeSymmetryAngles(0, 4);
    assert.equal(a.length, 4);
    assert.ok(Math.abs(a[1] - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(a[2] - Math.PI) < 1e-9);
  });
});

describe('intersectVerticalCylinder', () => {
  it('hits a unit cylinder from outside', () => {
    const ray = new THREE.Ray(
      new THREE.Vector3(5, 2, 0),
      new THREE.Vector3(-1, 0, 0).normalize()
    );
    const hit = intersectVerticalCylinder(ray, 0, 0, 1);
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.x - 1) < 1e-6);
    assert.ok(Math.abs(hit.point.y - 2) < 1e-6);
    assert.ok(Math.abs(hit.angle - Math.atan2(1, 0)) < 1e-6);
  });

  it('returns exterior approach when missing the shell', () => {
    const ray = new THREE.Ray(
      new THREE.Vector3(5, 0, 5),
      new THREE.Vector3(-1, 0, 0).normalize()
    );
    // Cylinder radius 1 at origin — ray along x at z=5 never hits
    const hit = intersectVerticalCylinder(ray, 0, 0, 1);
    assert.ok(hit);
    assert.equal(hit.exterior, true);
    assert.ok(hit.approachDist > 0);
  });
});

describe('rayPointMetrics', () => {
  it('measures perpendicular distance to a point', () => {
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
    const m = rayPointMetrics(ray, new THREE.Vector3(3, 2, 0));
    assert.ok(Math.abs(m.dist - 2) < 1e-6);
    assert.ok(Math.abs(m.t - 3) < 1e-6);
  });
});

describe('nodeWorldPosition', () => {
  const cyl = {
    cx: 0,
    cy: 20,
    cz: 0,
    radius: 4.5,
    minY: 0,
    maxY: 40,
    center: new THREE.Vector3(0, 20, 0),
  };

  it('places top / bottom on axis', () => {
    const top = nodeWorldPosition(cyl, 'top');
    const bot = nodeWorldPosition(cyl, 'bottom');
    assert.equal(top.y, 40);
    assert.equal(bot.y, 0);
    assert.equal(top.x, 0);
  });

  it('places radial with angle and yFraction (sin/cos convention)', () => {
    const p = nodeWorldPosition(cyl, 'radial', Math.PI / 2, 0.5, 1);
    assert.ok(Math.abs(p.y - 20) < 1e-6);
    assert.ok(Math.abs(p.x - (4.5 + 1)) < 1e-6);
    assert.ok(Math.abs(p.z) < 1e-6);
  });
});

describe('resolveSnapFromRay', () => {
  it('prefers nearby stack node', () => {
    const top = new THREE.Vector3(0, 40, 0);
    const candidates = [
      {
        parentId: 'a',
        parentNode: 'top',
        scoreBase: 50,
        isStack: true,
        cyl: { cx: 0, cy: 20, cz: 0, radius: 4.5, minY: 0, maxY: 40 },
        world: top,
      },
    ];
    // Ray from camera toward top node
    const ray = new THREE.Ray(
      new THREE.Vector3(30, 40, 30),
      new THREE.Vector3(-1, 0, -1).normalize()
    );
    const snap = resolveSnapFromRay(ray, candidates, { camDist: 50, rotation: 0 });
    assert.ok(snap);
    assert.equal(snap.parentNode, 'top');
    assert.equal(snap.isStack, true);
    assert.ok(isSnapCommitable(snap) || snap.soft);
  });

  it('resolves radial hit with yFraction on barrel', () => {
    const cyl = { cx: 0, cy: 20, cz: 0, radius: 4.5, minY: 0, maxY: 40 };
    const candidates = [
      {
        parentId: 'tank1',
        parentNode: 'radial',
        scoreBase: 40,
        isStack: false,
        cyl,
        world: nodeWorldPosition(cyl, 'radial', 0, 0.5, 1.4),
      },
    ];
    // Aim at side of cylinder at y=30
    const ray = new THREE.Ray(
      new THREE.Vector3(20, 30, 0),
      new THREE.Vector3(-1, 0, 0).normalize()
    );
    const snap = resolveSnapFromRay(ray, candidates, { camDist: 40 });
    assert.ok(snap);
    assert.equal(snap.parentNode, 'radial');
    assert.ok(snap.yFraction > 0.6 && snap.yFraction < 0.9);
    assert.ok(isSnapCommitable(snap));
  });
});

describe('buildSnapCandidates + real craft', () => {
  it('builds candidates from default Starship craft mesh', () => {
    const craft = createDefaultStarshipCraft();
    const rocket = createRocketFromDesign(craft);
    const rootId = craft.rootId;
    const targets = [
      { parentId: rootId, parentNode: 'top', score: 50 },
      { parentId: rootId, parentNode: 'bottom', score: 50 },
      { parentId: rootId, parentNode: 'radial', score: 40 },
    ];
    const cands = buildSnapCandidates(rocket, craft, targets);
    assert.ok(cands.length >= 3);
    assert.ok(cands.some((c) => c.isStack && c.parentNode === 'top'));
    assert.ok(cands.some((c) => !c.isStack));
    rocket.userData?.dispose?.();
  });
});

describe('radialPadForCategory', () => {
  it('returns larger pad for side boosters', () => {
    assert.ok(radialPadForCategory('side') > radialPadForCategory('decor'));
    assert.ok(SNAP_STACK_BASE > 0);
  });
});
