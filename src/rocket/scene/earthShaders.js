import * as THREE from 'three';

/**
 * Solid opaque Earth day map with real ocean lightening.
 *
 * Why not MeshBasicMaterial.color?
 *   final = map * color  (multiply). Texture oceans are already dark navy
 *   (~0.05–0.2). Multiplying by near-white (0.93–0.99) barely changes them.
 *   Brightening requires mix/max/power, not multiply.
 */
/**
 * Solid opaque Earth — ocean graded toward ISS/photo cyan-azure
 * (bright turquoise water under white cloud swirls, not navy).
 */
export function createSolidEarthMaterial({ dayMap, oceanLift = 0.92 }) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
    uniforms: {
      uDay: { value: dayMap },
      uOceanLift: { value: oceanLift },
      uAlpha: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uDay;
      uniform float uOceanLift;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 albedo = texture2D(uDay, vUv).rgb;

        // Ocean mask: blue dominates + dark cool navy from day maps
        float blueDom = albedo.b - max(albedo.r, albedo.g);
        float ocean = smoothstep(0.015, 0.14, blueDom);
        float luma = dot(albedo, vec3(0.299, 0.587, 0.114));
        float cool = albedo.b - (albedo.r + albedo.g) * 0.5;
        float darkWater =
          (1.0 - smoothstep(0.06, 0.48, luma)) * smoothstep(-0.02, 0.1, cool);
        ocean = clamp(max(ocean, darkWater * 0.95), 0.0, 1.0);
        // Avoid painting green land as ocean
        float greenLand = smoothstep(0.04, 0.14, albedo.g - albedo.b);
        ocean *= 1.0 - greenLand;

        // ISS-style bright cyan-azure (reference photo), not deep navy
        // approx #5AB4F0 / #6EC4F5 mid, brighter highlights
        vec3 deepCyan = vec3(0.22, 0.52, 0.82);
        vec3 midCyan  = vec3(0.38, 0.68, 0.94);
        vec3 shallow  = vec3(0.52, 0.78, 0.98);
        // Brighter original texels → shallower look
        float depth = 1.0 - smoothstep(0.05, 0.45, luma);
        vec3 target = mix(shallow, mix(midCyan, deepCyan, depth), 0.55);

        // Strong remap toward target (multiply alone cannot reach this)
        vec3 lifted = mix(albedo, target, 0.88);
        lifted = max(lifted, target * 0.85);
        // Keep a little original variation so it is not flat paint
        lifted = mix(lifted, albedo * vec3(0.9, 1.4, 1.55) + vec3(0.08, 0.2, 0.35), 0.22);
        albedo = mix(albedo, lifted, ocean * uOceanLift);

        // Vibrancy + mild contrast — avoid washed pastel land under ACES
        float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
        albedo = mix(vec3(lum), albedo, 1.28);
        albedo = (albedo - 0.5) * 1.1 + 0.5;
        albedo = pow(max(albedo, 0.0), vec3(0.96)) * 1.03;

        gl_FragColor = vec4(clamp(albedo, 0.0, 1.5), uAlpha);
      }
    `,
  });
}

/**
 * Photoreal "Blue Marble from space" surface.
 *
 * Target look: ISS / dome window — deep ocean blue, natural land,
 * soft limb darkening, thin Rayleigh haze on the disc edge.
 * (No hard night terminator; optional soft sun shading for volume.)
 */
export function createEarthSurfaceMaterial({
  dayMap,
  nightMap,
  normalMap,
  specMap,
  sunDir,
  bumpMap = null,
  cloudMap = null,
}) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uDay: { value: dayMap },
      uNight: { value: nightMap },
      uNormal: { value: normalMap },
      uSpec: { value: specMap },
      uBump: { value: bumpMap },
      uHasBump: { value: bumpMap ? 1 : 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uLightColor: { value: new THREE.Color(0xfff6e8) },
      uAmbient: { value: 1.0 },
      uAlpha: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uDay;
      uniform sampler2D uNormal;
      uniform sampler2D uSpec;
      uniform sampler2D uBump;
      uniform float uHasBump;
      uniform vec3 uSunDir;
      uniform vec3 uLightColor;
      uniform float uAmbient;
      uniform float uAlpha;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      vec3 sphereTBN(vec3 N) {
        vec3 up = abs(N.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 T = normalize(cross(up, N));
        vec3 B = cross(N, T);
        return mat3(T, B, N);
      }

      void main() {
        #include <logdepthbuf_fragment>
        if (uAlpha < 0.01) discard;

        vec3 Ng = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float NdotV = max(dot(Ng, V), 0.0);

        vec3 mapN = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
        mapN.xy *= 0.55;
        vec3 N = normalize(sphereTBN(Ng) * mapN);

        float elev = 0.5;
        if (uHasBump > 0.5) {
          vec2 texel = vec2(1.0 / 4096.0, 1.0 / 2048.0);
          elev = texture2D(uBump, vUv).r;
          float hx = texture2D(uBump, vUv + vec2(texel.x * 1.5, 0.0)).r;
          float hy = texture2D(uBump, vUv + vec2(0.0, texel.y * 1.5)).r;
          vec3 bN = normalize(vec3((elev - hx) * 8.0, (elev - hy) * 8.0, 1.0));
          N = normalize(mix(N, normalize(sphereTBN(Ng) * bN), 0.55));
        }

        // --- Albedo (never go pure black if map is still loading) ---
        vec3 daySample = texture2D(uDay, vUv).rgb;
        float dayLum = max(daySample.r, max(daySample.g, daySample.b));
        // Placeholder blue-marble while texture streams in
        vec3 placeholder = mix(vec3(0.08, 0.18, 0.42), vec3(0.22, 0.45, 0.2), step(0.5, vUv.y));
        vec3 albedo = mix(placeholder, daySample, smoothstep(0.0, 0.04, dayLum));
        // Slight gamma + chroma so land is not milky under filmic tonemap
        albedo = pow(max(albedo, 0.0), vec3(0.94)) * 1.06;
        float dayL = dot(albedo, vec3(0.299, 0.587, 0.114));
        albedo = mix(vec3(dayL), albedo, 1.32);

        float ocean = texture2D(uSpec, vUv).r;
        ocean = smoothstep(0.1, 0.72, ocean);
        float land = 1.0 - ocean;

        // Richer ocean azure + slightly warm land
        vec3 oceanTint = vec3(0.78, 0.9, 1.12);
        vec3 landTint = vec3(1.04, 1.06, 0.96);
        albedo *= mix(landTint, oceanTint, ocean * 0.55);
        albedo *= mix(0.96, 1.04, elev);

        float polar = smoothstep(0.14, 0.0, min(vUv.y, 1.0 - vUv.y));
        float ice = smoothstep(0.52, 0.88, (albedo.r + albedo.g + albedo.b) / 3.0) * polar;
        albedo = mix(albedo, vec3(0.94, 0.96, 0.99), ice * 0.45);

        // Soft wrap lighting — floor so the night side never goes pure black
        vec3 L = normalize(uSunDir);
        float wrap = clamp(dot(Ng, L) * 0.5 + 0.5, 0.0, 1.0);
        float day = mix(0.55, 1.05, pow(wrap, 1.1));

        float facing = 0.86 + 0.14 * NdotV;
        float relief = 0.92 + 0.08 * max(dot(N, V), 0.0);

        vec3 col = albedo * uLightColor * uAmbient * day * facing * relief;

        // Ocean Fresnel
        float fresnel = pow(1.0 - NdotV, 3.2);
        col += vec3(0.45, 0.72, 1.0) * ocean * fresnel * 0.2;

        // Thin blue limb airlight
        float rim = pow(1.0 - NdotV, 2.5);
        col += vec3(0.3, 0.5, 0.95) * rim * 0.1;

        gl_FragColor = vec4(col, uAlpha);
      }
    `,
  });
}

/**
 * Real satellite cloud deck — Blue Marble / ISS photo white swirls.
 * Works with SSS 8K, NASA Blue Marble cloud_combined, fair_clouds, etc.
 * soft=true → thin high cirrus (bright cores only).
 */
export function createCloudMaterial({ cloudMap, sunDir, soft = false }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCloud: { value: cloudMap },
      uSunDir: { value: sunDir.clone().normalize() },
      uOpacity: { value: soft ? 0.22 : 0.75 },
      uTime: { value: 0 },
      uSoft: { value: soft ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uCloud;
      uniform vec3 uSunDir;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uSoft;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        #include <logdepthbuf_fragment>
        // Slight dual-sample drift for softer edges (not enough to band)
        vec2 uvA = vUv + vec2(uTime * 0.0008, 0.0);
        vec2 uvB = vUv * 1.0015 + vec2(-uTime * 0.00035, uTime * 0.00008);
        // Maps are white-on-black RGB or grayscale — use max channel
        vec3 sA = texture2D(uCloud, uvA).rgb;
        vec3 sB = texture2D(uCloud, uvB).rgb;
        float cA = max(sA.r, max(sA.g, sA.b));
        float cB = max(sB.r, max(sB.g, sB.b));
        float c = max(cA, cB * 0.45);

        float dens;
        if (uSoft > 0.5) {
          // High cirrus: only bright cores (avoid full white shell)
          dens = smoothstep(0.62, 0.92, c);
          dens = dens * dens;
        } else {
          // Main deck: NASA/SSS style — keep soft fringes + solid cores
          dens = smoothstep(0.12, 0.58, c);
          dens = dens * dens * (3.0 - 2.0 * dens);
          dens = clamp(dens, 0.0, 1.0);
          // Boost mid-density storm bands (photo-like cotton)
          dens = mix(dens, pow(dens, 0.85), 0.55);
        }
        float a = dens * uOpacity;
        if (a < 0.018) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float NdotV = max(dot(N, V), 0.0);
        vec3 L = normalize(uSunDir);
        float wrap = max(dot(N, L) * 0.4 + 0.6, 0.0);

        // Bright white cotton with soft blue-grey shadow side (ISS photo)
        vec3 col = mix(vec3(0.86, 0.89, 0.94), vec3(1.0, 1.0, 1.0), smoothstep(0.2, 0.88, c));
        col *= 0.82 + 0.24 * dens;
        col *= 0.72 + 0.28 * wrap;
        // Soft limb brighten + sun silver lining
        float rim = pow(1.0 - NdotV, 2.6);
        col += vec3(0.7, 0.85, 1.0) * rim * 0.1;
        col += vec3(1.0, 0.98, 0.94) * pow(max(dot(N, L), 0.0), 5.0) * dens * 0.1;

        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

/**
 * Soft photo atmosphere limb (ISS window / Blue Marble).
 * Outer = BackSide halo; inner = FrontSide near-surface scatter.
 * Far-side wall is discarded so no hard circle is drawn on the disc.
 */
export function createAtmosphereMaterial({ sunDir, outer = true, planetRadius = 1 }) {
  return new THREE.ShaderMaterial({
    side: outer ? THREE.BackSide : THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uIntensity: { value: 1.0 },
      uPower: { value: outer ? 4.2 : 5.5 },
      uScale: { value: outer ? 1.0 : 0.55 },
      uPlanetRadius: { value: planetRadius },
      uIsOuter: { value: outer ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vEarthCenter;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vEarthCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uIntensity;
      uniform float uPower;
      uniform float uScale;
      uniform float uPlanetRadius;
      uniform float uIsOuter;
      uniform vec3 uSunDir;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vEarthCenter;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(N, V), 0.0);

        if (uIsOuter > 0.5) {
          // Discard far-side shell wall (ghost ring on disc)
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vWorldPos - cameraPosition);
          vec3 oc = ro - vEarthCenter;
          float b = dot(oc, rd);
          float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
          float h = b * b - c;
          if (h > 0.0) {
            float tEarth = -b - sqrt(h);
            float tAtmo = length(vWorldPos - cameraPosition);
            if (tEarth > 0.0 && tEarth < tAtmo * 0.998) discard;
          }
          vec3 toFrag = normalize(vWorldPos - vEarthCenter);
          vec3 toCam = normalize(cameraPosition - vEarthCenter);
          float mu = abs(dot(toFrag, toCam));
          // Soft limb band — wider than before for photo haze, still no disc fill
          if (mu > 0.55) discard;
          float limbMask = 1.0 - smoothstep(0.28, 0.55, mu);
          // fresnel * limbMask below
          float fresnel = pow(1.0 - ndv, uPower);
          // Photo limb: soft cyan-blue haze (Blue Marble / ISS window)
          vec3 rayleigh = vec3(0.38, 0.62, 1.0);
          vec3 ozone = vec3(0.5, 0.4, 0.95);
          float rimMix = smoothstep(0.0, 0.45, fresnel);
          vec3 col = mix(rayleigh, ozone, rimMix * 0.2);
          // Slight day-side boost
          float sunSide = max(dot(toFrag, normalize(uSunDir)), 0.0);
          col *= 0.88 + 0.28 * sunSide;
          float alpha = fresnel * 0.95 * uIntensity * uScale * limbMask;
          alpha += pow(1.0 - ndv, uPower * 1.35) * 0.2 * uIntensity * uScale * limbMask;
          alpha = clamp(alpha, 0.0, 0.68);
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(col, alpha);
          return;
        }

        // Inner front-side: soft near-surface scatter (disc airlight)
        float fresnel = pow(1.0 - ndv, uPower);
        vec3 col = vec3(0.42, 0.66, 1.0);
        float alpha = fresnel * 0.52 * uIntensity * uScale;
        alpha = clamp(alpha, 0.0, 0.36);
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}
