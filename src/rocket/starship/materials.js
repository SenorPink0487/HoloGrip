import * as THREE from 'three';

/** Shared materials for stainless steel Starship / Super Heavy look. */

export function createMaterials() {
  // Primary 301 stainless — clean metallic silver with realistic sheen
  const steel = new THREE.MeshStandardMaterial({
    color: 0xd8dde5,
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.6,
  });

  // Weld seams / ring edges / darker banding
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x868d98,
    metalness: 0.84,
    roughness: 0.38,
    envMapIntensity: 1.25,
  });

  // Highlight rings, catch pins, polished edges
  const steelBright = new THREE.MeshStandardMaterial({
    color: 0xf2f6fa,
    metalness: 0.94,
    roughness: 0.12,
    envMapIntensity: 1.85,
  });

  // Brushed circumferential bands
  const steelBrushed = new THREE.MeshStandardMaterial({
    color: 0xc4cace,
    metalness: 0.85,
    roughness: 0.42,
    envMapIntensity: 1.3,
  });

  // Hexagonal TPS heat tiles — near-black silica
  const heatTile = new THREE.MeshStandardMaterial({
    color: 0x16181c,
    metalness: 0.06,
    roughness: 0.88,
  });

  // Slightly lighter / worn tile edges & gaps
  const heatTileEdge = new THREE.MeshStandardMaterial({
    color: 0x2c2e34,
    metalness: 0.12,
    roughness: 0.78,
  });

  // Occasional metallic / test tile tone
  const heatTileMetal = new THREE.MeshStandardMaterial({
    color: 0x3a342c,
    metalness: 0.45,
    roughness: 0.55,
  });

  const carbon = new THREE.MeshStandardMaterial({
    color: 0x121418,
    metalness: 0.38,
    roughness: 0.58,
  });

  // Grid fins — dark steel / titanium look
  const gridFin = new THREE.MeshStandardMaterial({
    color: 0x22262e,
    metalness: 0.72,
    roughness: 0.38,
    envMapIntensity: 1.2,
  });

  const nozzle = new THREE.MeshStandardMaterial({
    color: 0x3a3f48,
    metalness: 0.88,
    roughness: 0.3,
  });

  const nozzleInner = new THREE.MeshStandardMaterial({
    color: 0x6a4830,
    metalness: 0.72,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });

  const rvacBell = new THREE.MeshStandardMaterial({
    color: 0x4a505c,
    metalness: 0.92,
    roughness: 0.26,
  });

  // Regeneratively cooled chamber / copper alloy
  const copper = new THREE.MeshStandardMaterial({
    color: 0xb87333,
    metalness: 0.92,
    roughness: 0.32,
  });

  // Warm throat glow — white-amber core under full thrust without stack white-out
  const engineGlow = new THREE.MeshBasicMaterial({
    color: 0xffb060,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });

  // Fallback solid plume (icons / simple paths)
  const plume = new THREE.MeshBasicMaterial({
    color: 0x8ec4ff,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });

  // Raceways, COPV housings, accent panels
  const accent = new THREE.MeshStandardMaterial({
    color: 0x1e222a,
    metalness: 0.62,
    roughness: 0.42,
  });

  // White / light logo panel fill
  const labelWhite = new THREE.MeshBasicMaterial({ color: 0xf0f2f5 });

  // Soft soot / reentry stain overlay
  const soot = new THREE.MeshStandardMaterial({
    color: 0x4a4e56,
    metalness: 0.55,
    roughness: 0.7,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });

  return {
    steel,
    steelDark,
    steelBright,
    steelBrushed,
    heatTile,
    heatTileEdge,
    heatTileMetal,
    carbon,
    gridFin,
    nozzle,
    nozzleInner,
    rvacBell,
    copper,
    engineGlow,
    plume,
    createPlumeMaterial,
    accent,
    labelWhite,
    soot,
  };
}

/**
 * Animated methalox jet material (core / sheath).
 * Not a flat color cone — radial core, turbulent flow along length.
 * @param {'core'|'sheath'} kind
 * @param {{ vacuum?: boolean }} [opts]
 */
export function createPlumeMaterial(kind = 'sheath', opts = {}) {
  const vacuum = !!opts.vacuum;
  const isCore = kind === 'core';
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Off so green pad terrain never depth-occludes nozzle plumes from chase cam
    depthTest: false,
    // Additive gas — soft filaments under each nozzle (not plastic orange cones)
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    // Keep MeshBasic-like opacity API for launchSequence setGlowIntensity
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: isCore ? 0.55 : 0.42 },
      uVacuum: { value: vacuum ? 1 : 0 },
      uCore: { value: isCore ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uVacuum;
      uniform float uCore;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main() {
        float radial = abs(vUv.x - 0.5) * 2.0;
        // Cone UV: after tip-down flip, base(near nozzle) ≈ high v, tip ≈ low v
        float fromNozzle = 1.0 - vUv.y;
        float t = uTime;

        float n = noise(vec2(radial * 4.0 + fromNozzle, fromNozzle * 8.0 - t * 10.0));
        float n2 = noise(vec2(radial * 9.0 - t, fromNozzle * 14.0 - t * 16.0));

        float halfW = mix(0.18, 1.0, pow(fromNozzle, 0.72)) * mix(1.0, 1.4, uVacuum);
        halfW += n * 0.12 * fromNozzle;
        float edge = 1.0 - smoothstep(0.35, 1.02, radial / max(0.08, halfW));
        float core = 1.0 - smoothstep(0.0, 0.38, radial / max(0.08, halfW));

        // Dense continuous jet — mild noise, not sparse firefly holes
        float dens = edge * exp(-fromNozzle * mix(1.05, 0.7, uVacuum));
        dens *= 0.72 + n * 0.35 + n2 * 0.18;
        dens *= smoothstep(1.05, 0.35, fromNozzle);
        dens *= mix(1.0, 1.2, uCore);
        dens *= mix(1.0, 0.82 + core * 0.35, 1.0 - uCore);
        dens *= 0.92 + 0.08 * sin(t * 20.0 + fromNozzle * 12.0);

        float alpha = dens * uOpacity;
        if (alpha < 0.025) discard;

        vec3 colCore = mix(vec3(1.0, 0.96, 0.84), vec3(0.72, 0.88, 1.0), uVacuum);
        vec3 colHot = vec3(1.0, 0.62, 0.16);
        vec3 colAmber = vec3(1.0, 0.32, 0.04);
        vec3 colCool = mix(vec3(0.95, 0.42, 0.08), vec3(0.38, 0.62, 1.0), uVacuum);

        vec3 col;
        if (uCore > 0.5) {
          col = mix(colHot, colCore, core * (1.0 - fromNozzle * 0.55));
          col = mix(col, colAmber, fromNozzle * 0.4 * (1.0 - core));
        } else {
          col = mix(colAmber, colCool, fromNozzle * 0.75);
          col = mix(col, colCore, core * 0.5 * (1.0 - fromNozzle));
        }
        col += colCore * n2 * core * 0.2;

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
      }
    `,
  });
}
