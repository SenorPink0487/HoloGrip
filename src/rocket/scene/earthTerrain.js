import * as THREE from 'three';

/**
 * KSP-style Earth crust: equirectangular heightmap → radial vertex displacement.
 *
 * Large-scale shape comes from NASA GEBCO-style elevation (earth_bump_hi).
 * Fine ridges use cheap procedural noise (like PQS fractal layers).
 * Ocean stays near sphere radius so the launch pad frame still reads as sea level.
 *
 * Units: same as the rest of the scene (EARTH_RADIUS visual metres).
 * Relief is deliberately exaggerated so mountains read from low orbit
 * (true Everest ≈ 0.14% of Earth radius — nearly invisible at our tessellation).
 */

/** Default relief as a fraction of planet radius (KSP-like exaggeration). */
export const EARTH_MAX_HEIGHT_RATIO = 0.011;

/** Elevation samples below this are treated as ocean / flat sea level. */
export const EARTH_OCEAN_LEVEL = 0.32;

export function createEarthTerrainGeometry(
  radius,
  widthSegments = 384,
  heightSegments = 256
) {
  // High tessellation so displaced ridges do not look like low-poly pyramids.
  const geo = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  geo.name = 'EarthTerrainSphere';
  return geo;
}

/**
 * Opaque day-map Earth with heightmap displacement + soft sun wrap.
 * API-compatible enough for space.js fade code: .opacity / .transparent /
 * .depthWrite / .map assignment after async texture load.
 */
export function createEarthTerrainMaterial({
  dayMap,
  elevMap = null,
  maxHeight = 150,
  oceanLevel = EARTH_OCEAN_LEVEL,
  sunDir = new THREE.Vector3(1, 0.2, 0.4),
}) {
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    // Keep day-map chroma out of ACES crush (same as MeshBasic path)
    toneMapped: false,
    uniforms: {
      uDay: { value: dayMap },
      uElev: { value: elevMap },
      uHasElev: { value: elevMap ? 1 : 0 },
      uMaxHeight: { value: maxHeight },
      uOceanLevel: { value: oceanLevel },
      uAlpha: { value: 1.0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uDetail: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>

      uniform sampler2D uElev;
      uniform float uHasElev;
      uniform float uMaxHeight;
      uniform float uOceanLevel;
      uniform float uDetail;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vHeight01;
      varying float vLand;

      // Cheap value noise for PQS-style micro-relief (land only)
      float hash13(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float valueNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      float fbm(vec3 p) {
        float a = 0.5;
        float s = 0.0;
        for (int i = 0; i < 4; i++) {
          s += a * valueNoise(p);
          p = p * 2.07 + 17.3;
          a *= 0.5;
        }
        return s;
      }

      void main() {
        vUv = uv;
        vec3 nObj = normalize(normal);
        float elev = 0.5;
        float land = 0.0;
        float h = 0.0;

        if (uHasElev > 0.5) {
          elev = texture2D(uElev, uv).r;
          // Soft beach band so coasts do not clip as cliffs
          land = smoothstep(uOceanLevel - 0.02, uOceanLevel + 0.1, elev);
          float hNorm = clamp(
            (elev - uOceanLevel) / max(1e-4, 1.0 - uOceanLevel),
            0.0,
            1.0
          );
          // Emphasize high peaks (Himalayas / Andes read from orbit)
          hNorm = pow(hNorm, 1.25);
          h = hNorm * land * uMaxHeight;

          // Procedural fine ridges — only on land, scaled with macro height
          float detail = fbm(nObj * 48.0) * 2.0 - 1.0;
          h += detail * uMaxHeight * 0.08 * land * uDetail * (0.35 + 0.65 * hNorm);
        }

        vHeight01 = uMaxHeight > 1e-4 ? clamp(h / uMaxHeight, 0.0, 1.0) : 0.0;
        vLand = land;

        vec3 displaced = position + nObj * h;
        vec4 wp = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = wp.xyz;
        // Approximate normal: radial (good enough at planet scale)
        vWorldNormal = normalize((modelMatrix * vec4(nObj, 0.0)).xyz);

        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>

      uniform sampler2D uDay;
      uniform sampler2D uElev;
      uniform float uHasElev;
      uniform float uAlpha;
      uniform vec3 uSunDir;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vHeight01;
      varying float vLand;

      void main() {
        #include <logdepthbuf_fragment>
        if (uAlpha < 0.01) discard;

        vec3 daySample = texture2D(uDay, vUv).rgb;
        float dayLum = max(daySample.r, max(daySample.g, daySample.b));
        vec3 placeholder = mix(
          vec3(0.08, 0.18, 0.42),
          vec3(0.22, 0.45, 0.2),
          smoothstep(0.25, 0.75, vUv.y)
        );
        vec3 albedo = mix(placeholder, daySample, smoothstep(0.0, 0.04, dayLum));

        // Mild chroma + contrast so land holds under exposure
        albedo = pow(max(albedo, 0.0), vec3(0.96)) * 1.03;
        float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
        albedo = mix(vec3(lum), albedo, 1.22);

        // High terrain slightly brighter (snow-cap cue even without snow mask)
        albedo *= 1.0 + vHeight01 * vLand * 0.08;

        vec3 Ng = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        // Soft wrap so night side is not pure black (matches prior earth look)
        float wrap = clamp(dot(Ng, L) * 0.5 + 0.5, 0.0, 1.0);
        float day = mix(0.62, 1.08, pow(wrap, 1.05));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float NdotV = max(dot(Ng, V), 0.0);
        float facing = 0.88 + 0.12 * NdotV;

        // Slope cue from height: darken land flanks slightly
        float relief = 1.0 - vHeight01 * vLand * 0.06;
        vec3 col = albedo * day * facing * relief;

        // Thin blue limb
        float rim = pow(1.0 - NdotV, 2.6);
        col += vec3(0.28, 0.48, 0.95) * rim * 0.09;

        gl_FragColor = vec4(clamp(col, 0.0, 1.6), uAlpha);
      }
    `,
  });

  // --- space.js compatibility: treat like MeshBasicMaterial for fade / map ---
  Object.defineProperty(mat, 'opacity', {
    get() {
      return mat.uniforms.uAlpha.value;
    },
    set(v) {
      mat.uniforms.uAlpha.value = v;
    },
    configurable: true,
  });

  Object.defineProperty(mat, 'map', {
    get() {
      return mat.uniforms.uDay.value;
    },
    set(v) {
      mat.uniforms.uDay.value = v;
      mat.needsUpdate = true;
    },
    configurable: true,
  });

  mat.setElevationMap = (tex) => {
    mat.uniforms.uElev.value = tex;
    mat.uniforms.uHasElev.value = tex ? 1 : 0;
    mat.needsUpdate = true;
  };

  mat.setMaxHeight = (h) => {
    mat.uniforms.uMaxHeight.value = h;
  };

  return mat;
}

/**
 * Convenience: geometry + material for a KSP-style Earth body.
 * @param {number} radius
 * @param {{ dayMap: THREE.Texture, elevMap?: THREE.Texture, sunDir?: THREE.Vector3, maxHeightRatio?: number }} opts
 */
export function createKspStyleEarth(radius, opts) {
  const maxHeightRatio = opts.maxHeightRatio ?? EARTH_MAX_HEIGHT_RATIO;
  const maxHeight = radius * maxHeightRatio;
  const geometry = createEarthTerrainGeometry(
    radius,
    opts.widthSegments ?? 384,
    opts.heightSegments ?? 256
  );
  const material = createEarthTerrainMaterial({
    dayMap: opts.dayMap,
    elevMap: opts.elevMap ?? null,
    maxHeight,
    oceanLevel: opts.oceanLevel ?? EARTH_OCEAN_LEVEL,
    sunDir: opts.sunDir ?? new THREE.Vector3(1, 0.2, 0.4),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'EarthTerrain';
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.renderOrder = 0;
  mesh.userData.radius = radius;
  mesh.userData.maxHeight = maxHeight;
  return { mesh, material, geometry, maxHeight };
}
