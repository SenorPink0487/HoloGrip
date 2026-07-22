/**
 * Approximate CoM / CoT for VAB gizmos (demo physics, not FEM).
 * CoM: wet-mass weighted stack centroid.
 * CoT: liftoff thrust plane near stack base (engines fire "up" the stack).
 */

import { calculateRocketPerformance } from './performance.js';
import { asStageDesign } from './compileFlight.js';
import { asCraft } from './craftGraph.js';

/**
 * @typedef {{
 *   comYFromStackBase: number,
 *   cotYFromStackBase: number,
 *   stackHeightM: number,
 *   totalMassKg: number,
 *   thrustN: number,
 *   twr: number,
 *   comFraction: number,
 *   canLiftOff: boolean,
 *   underpowered: boolean,
 * }} MassBalance
 */

/**
 * @param {object} design
 * @returns {MassBalance}
 */
export function estimateMassBalance(design) {
  const craft = asCraft(design);
  const perf = calculateRocketPerformance(craft);
  const d = asStageDesign(craft);

  let yCursor = 0;
  let moment = 0;
  let mass = 0;

  for (let i = 0; i < (perf.stages || []).length; i++) {
    const st = perf.stages[i];
    const h = Math.max(1, st.heightM || 10);
    // Fuel sits slightly lower in the barrel than dry structure
    const dry = st.dryMassKg || 0;
    const fuel = st.fuelMassKg || 0;
    const dryCy = yCursor + h * 0.52;
    const fuelCy = yCursor + h * 0.42;
    moment += dry * dryCy + fuel * fuelCy;
    mass += dry + fuel;
    yCursor += h;
  }

  // Side boosters: mass at ~45% of first stage height, radial (Y only for CoM ball)
  if ((perf.sideBoosters?.count || 0) > 0) {
    const sbM =
      (perf.sideBoosters.dryMassKg || 0) + (perf.sideBoosters.fuelMassKg || 0);
    const h0 = perf.stages[0]?.heightM || yCursor * 0.5;
    moment += sbM * (h0 * 0.45);
    mass += sbM;
  }

  const stackHeightM = Math.max(1, yCursor || perf.totalHeightM || 40);
  const comY = mass > 0 ? moment / mass : stackHeightM * 0.45;
  // Liftoff engines at stack base; CoT slightly above pad plane
  const cotY = Math.min(2.5, stackHeightM * 0.03 + 0.4);

  return {
    comYFromStackBase: Math.min(stackHeightM * 0.95, Math.max(0.5, comY)),
    cotYFromStackBase: cotY,
    stackHeightM,
    totalMassKg: mass || perf.liftoffMassKg || 0,
    thrustN: perf.totalThrustN || 0,
    twr: perf.twr || 0,
    comFraction: comY / stackHeightM,
    canLiftOff: !!perf.canLiftOff,
    underpowered: !!perf.underpowered,
    stageCount: d.stageCount || perf.stageCount || 1,
  };
}

/**
 * Build Three.js gizmo group: yellow CoM ball + cyan thrust arrow (up).
 * Local Y is measured from stack base (add engineClearance when parenting to rocket).
 * @param {import('three')} THREE
 * @param {MassBalance} balance
 * @returns {import('three').Group}
 */
export function createBalanceGizmoGroup(THREE, balance) {
  const root = new THREE.Group();
  root.name = 'MassBalanceGizmo';
  root.userData.isBalanceGizmo = true;
  root.userData.skipOutline = true;

  const b = balance || {};
  const comY = b.comYFromStackBase ?? 20;
  const cotY = b.cotYFromStackBase ?? 1;
  const twr = b.twr || 0;
  const thrustOk = twr >= 1 && (b.thrustN || 0) > 0;

  // ── CoM ball (KSP yellow) ──────────────────────────────
  const comGroup = new THREE.Group();
  comGroup.name = 'CoMMarker';
  comGroup.position.y = comY;

  const comCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffcc33,
      emissive: 0xaa8800,
      emissiveIntensity: 0.55,
      metalness: 0.25,
      roughness: 0.35,
      transparent: true,
      opacity: 0.92,
    })
  );
  comCore.userData.skipOutline = true;
  comGroup.add(comCore);

  const comHalo = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  comGroup.add(comHalo);

  // Crosshair rings
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff59d,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [rx, ry, rz] of [
    [Math.PI / 2, 0, 0],
    [0, 0, Math.PI / 2],
  ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.04, 6, 32), ringMat);
    ring.rotation.set(rx, ry, rz);
    comGroup.add(ring);
  }

  // Label sprite substitute: small diamond above
  const label = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshBasicMaterial({ color: 0xffeb3b })
  );
  label.position.y = 1.6;
  comGroup.add(label);

  root.add(comGroup);

  // ── Thrust arrow from CoT pointing UP (liftoff direction) ─
  const thrustGroup = new THREE.Group();
  thrustGroup.name = 'ThrustMarker';
  thrustGroup.position.y = cotY;

  const thrustColor = thrustOk ? 0x4fc3f7 : 0xef5350;
  const emissive = thrustOk ? 0x0288d1 : 0xb71c1c;

  // Arrow shaft length scales mildly with TWR (readable, not huge)
  const shaftLen = 6 + Math.min(14, Math.max(0, twr) * 4);
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, shaftLen, 10),
    new THREE.MeshStandardMaterial({
      color: thrustColor,
      emissive,
      emissiveIntensity: 0.45,
      metalness: 0.2,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9,
    })
  );
  shaft.position.y = shaftLen / 2;
  thrustGroup.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 2.2, 12),
    new THREE.MeshStandardMaterial({
      color: thrustColor,
      emissive,
      emissiveIntensity: 0.55,
      metalness: 0.15,
      roughness: 0.35,
    })
  );
  head.position.y = shaftLen + 1.0;
  thrustGroup.add(head);

  // CoT disc at base
  const cotDisc = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.1, 8, 28),
    new THREE.MeshBasicMaterial({
      color: thrustColor,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
  );
  cotDisc.rotation.x = Math.PI / 2;
  thrustGroup.add(cotDisc);

  // Soft glow column
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.35, shaftLen + 2, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: thrustColor,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  glow.position.y = (shaftLen + 2) / 2;
  thrustGroup.add(glow);

  root.add(thrustGroup);

  // Vertical guide line CoM ↔ CoT (stability read)
  const span = Math.max(0.5, comY - cotY);
  const guide = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, span, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
  );
  guide.position.y = cotY + span / 2;
  root.add(guide);

  root.userData.comY = comY;
  root.userData.cotY = cotY;
  root.userData.twr = twr;
  root.userData.thrustOk = thrustOk;

  return root;
}
