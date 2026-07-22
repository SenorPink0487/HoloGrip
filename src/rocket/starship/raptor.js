import * as THREE from 'three';

/**
 * Procedural Raptor engine (sea-level or vacuum-optimized).
 * Visual cues from Raptor 2/3 flight hardware: copper chamber,
 * regen-cooled bell, turbopump stack, actuator stubs.
 * Scale units: meters.
 */
export function createRaptor(mats, { vacuum = false, scale = 1 } = {}) {
  const group = new THREE.Group();
  group.name = vacuum ? 'RaptorVacuum' : 'Raptor';

  // Approximate real dimensions: ~1.3 m dia, ~2.9–3.1 m height (sea-level)
  // RVac has a much larger expansion nozzle (~2.4 m exit)
  const bodyR = 0.55 * scale;
  const throatR = 0.22 * scale;
  const exitR = vacuum ? 1.15 * scale : 0.65 * scale;
  const bellH = vacuum ? 2.4 * scale : 1.35 * scale;
  const chamberH = 0.55 * scale;
  const turbopumpH = 0.55 * scale;

  // --- Turbopump / upper assembly stack ---
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyR * 0.75, bodyR * 0.92, turbopumpH * 0.55, 20),
    mats.steelDark
  );
  upper.position.y = chamberH + bellH + turbopumpH * 0.72;
  group.add(upper);

  // Powerhead dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR * 0.72, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mats.steel
  );
  dome.position.y = chamberH + bellH + turbopumpH * 0.95;
  group.add(dome);

  // Secondary turbopump housing (offset cylinder — Raptor signature)
  const pump = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyR * 0.32, bodyR * 0.35, turbopumpH * 0.5, 14),
    mats.steelBright
  );
  pump.position.set(bodyR * 0.55, chamberH + bellH + turbopumpH * 0.55, 0);
  pump.rotation.z = 0.35;
  group.add(pump);

  // Preburner / pipe stubs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.45 * scale, 8),
      mats.steelDark
    );
    pipe.position.set(
      Math.cos(a) * bodyR * 0.7,
      chamberH + bellH + turbopumpH * 0.35,
      Math.sin(a) * bodyR * 0.7
    );
    pipe.rotation.z = Math.cos(a) * 0.5;
    pipe.rotation.x = Math.sin(a) * 0.5;
    group.add(pipe);
  }

  // --- Combustion chamber (copper alloy) ---
  const chamber = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyR * 0.72, throatR * 1.45, chamberH, 28),
    mats.copper
  );
  chamber.position.y = bellH + chamberH * 0.5;
  group.add(chamber);

  // Chamber cooling rings
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const r = THREE.MathUtils.lerp(bodyR * 0.72, throatR * 1.45, t) * 1.02;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.015 * scale, 6, 24),
      mats.copper
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = bellH + chamberH * (1 - t);
    group.add(ring);
  }

  // Gimbal mount ring (sea-level engines)
  if (!vacuum) {
    const gimbal = new THREE.Mesh(
      new THREE.TorusGeometry(bodyR * 0.95, 0.04 * scale, 8, 28),
      mats.steelBright
    );
    gimbal.rotation.x = Math.PI / 2;
    gimbal.position.y = chamberH + bellH + 0.05 * scale;
    group.add(gimbal);

    // Actuator stubs
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.3;
      const act = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * scale, 0.06 * scale, 0.55 * scale, 8),
        mats.accent
      );
      act.position.set(
        Math.cos(a) * bodyR * 0.85,
        chamberH + bellH + 0.25 * scale,
        Math.sin(a) * bodyR * 0.85
      );
      act.rotation.z = Math.cos(a) * 0.6;
      group.add(act);
    }
  }

  // --- Regeneratively cooled nozzle bell (multi-segment contour) ---
  // CylinderGeometry(radiusTop, radiusBottom, height); exit at y=0 is widest
  const segsBottomUp = vacuum
    ? [
        { top: exitR * 0.75, bot: exitR, h: bellH * 0.4 },
        { top: exitR * 0.45, bot: exitR * 0.75, h: bellH * 0.35 },
        { top: throatR, bot: exitR * 0.45, h: bellH * 0.25 },
      ]
    : [
        { top: exitR * 0.55, bot: exitR, h: bellH * 0.65 },
        { top: throatR, bot: exitR * 0.55, h: bellH * 0.35 },
      ];

  let y = 0;
  for (const seg of segsBottomUp) {
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(seg.top, seg.bot, seg.h, 36, 1, true),
      vacuum ? mats.rvacBell : mats.nozzle
    );
    bell.position.y = y + seg.h / 2;
    group.add(bell);

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(seg.top * 0.97, seg.bot * 0.97, seg.h * 0.98, 28, 1, true),
      mats.nozzleInner
    );
    inner.position.y = y + seg.h / 2;
    group.add(inner);

    y += seg.h;
  }

  // Cooling channel rings on bell exterior
  const ringCount = vacuum ? 10 : 6;
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 1) / (ringCount + 1);
    const r = THREE.MathUtils.lerp(throatR, exitR, 1 - t) * 1.02;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.011 * scale, 6, 32),
      mats.steelDark
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = bellH * t;
    group.add(ring);
  }

  // Exit rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(exitR, 0.028 * scale, 8, 40),
    mats.steelBright
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  group.add(rim);

  // Engine glow disc (bloom source)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(exitR * 0.78, 28),
    mats.engineGlow.clone()
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  glow.name = 'engineGlow';
  glow.visible = false;
  group.add(glow);

  // Hot core — bright amber-white (toneMapped keeps 33× stack from pure white)
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(exitR * 0.38, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd080,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    })
  );
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.01;
  core.name = 'engineGlow';
  core.visible = false;
  group.add(core);

  // Animated jet plumes — flowing noise, not flat color cones
  const makePlume =
    typeof mats.createPlumeMaterial === 'function'
      ? mats.createPlumeMaterial.bind(mats)
      : null;

  // Open cones — closed bases read as a fake disc from above
  const plumeLen = bellH * (vacuum ? 5.8 : 5.0);
  const plumeMat = makePlume
    ? makePlume('sheath', { vacuum })
    : mats.plume.clone();
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(exitR * (vacuum ? 0.85 : 0.65), plumeLen, 24, 1, true),
    plumeMat
  );
  plume.position.y = -plumeLen * 0.48;
  plume.rotation.x = Math.PI;
  plume.name = 'plume';
  plume.visible = false;
  group.add(plume);

  const corePlumeLen = plumeLen * 0.58;
  const coreMat = makePlume
    ? makePlume('core', { vacuum })
    : new THREE.MeshBasicMaterial({
        color: vacuum ? 0xa8d0ff : 0xffa050,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
  const corePlume = new THREE.Mesh(
    new THREE.ConeGeometry(exitR * 0.34, corePlumeLen, 18, 1, true),
    coreMat
  );
  corePlume.position.y = -corePlumeLen * 0.42;
  corePlume.rotation.x = Math.PI;
  corePlume.name = 'plume';
  corePlume.visible = false;
  group.add(corePlume);

  // ---------------------------------------------------------------------------
  // Mach diamonds — shock diamonds in underexpanded / overexpanded plume
  // Semi-transparent additive torii stacked below the nozzle exit
  // ---------------------------------------------------------------------------
  const machGroup = new THREE.Group();
  machGroup.name = 'machDiamonds';
  machGroup.visible = false;
  const diamondCount = vacuum ? 4 : 5;
  const diamondColors = [
    0xffe8b8, // warm core
    0xc8e4ff, // blue-white
    0x7ab8ff, // cooler blue
    0xffa060, // outer orange sheath
    0x6a9fff, // distant cell
  ];
  for (let i = 0; i < diamondCount; i++) {
    const t = (i + 1) / (diamondCount + 1);
    // Spacing increases downstream (shock cell growth)
    const y = -0.28 * scale - i * (0.48 + i * 0.16) * scale;
    const r = exitR * (0.26 + t * 0.28);
    const tube = 0.032 * scale * (1 - t * 0.4);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 8, 32),
      new THREE.MeshBasicMaterial({
        color: diamondColors[i] ?? 0xaad4ff,
        transparent: true,
        opacity: 0.38 - i * 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.name = 'machRing';
    ring.userData.baseOpacity = ring.material.opacity;
    ring.userData.baseScale = 1 + i * 0.05;
    machGroup.add(ring);
  }
  group.add(machGroup);

  group.userData.height = bellH + chamberH + turbopumpH;
  group.userData.exitR = exitR;
  group.userData.machDiamonds = machGroup;

  return group;
}

/**
 * Place n engines on a circle of radius `radius` around origin.
 */
export function placeEnginesOnRing(parent, mats, count, radius, options = {}) {
  const engines = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (options.phase || 0);
    const eng = createRaptor(mats, options);
    eng.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    parent.add(eng);
    engines.push(eng);
  }
  return engines;
}
