import * as THREE from 'three';

/**
 * Dynamic pad sky — free Sky Pro-style approximation.
 *
 * - Rayleigh-style atmosphere gradient + sun disc / Mie glow
 * - Raymarched volumetric cumulus with wind drift
 * - Altitude thinning for ascent handoff (pad solid → limb → transparent)
 */

const SKY_R = 48000;

/**
 * @param {{ sunDir?: THREE.Vector3, radius?: number }} [opts]
 */
export function createDynamicSky(opts = {}) {
  const sharedSunDir =
    opts.sunDir instanceof THREE.Vector3
      ? opts.sunDir
      : new THREE.Vector3(2.4, 1.0, 1.6).normalize();

  const radius = opts.radius ?? SKY_R;

  const uniforms = {
    uOpacity: { value: 1.0 },
    uAltitude: { value: 0.0 },
    uTime: { value: 0.0 },
    uSunDir: { value: sharedSunDir },
    uCloudCover: { value: 0.46 },
    uCloudDensity: { value: 1.7 },
    uWind: { value: new THREE.Vector2(0.02, 0.009) },
  };

  const material = new THREE.ShaderMaterial({
    name: 'DynamicSkyProStyle',
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        // No far-plane hack: logarithmicDepthBuffer breaks gl_Position.z = w
        // and was painting black / over the rocket. Huge shell + camera lock is enough.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uOpacity;
      uniform float uAltitude;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uCloudCover;
      uniform float uCloudDensity;
      uniform vec2 uWind;

      varying vec3 vLocalPos;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.02 + vec3(1.7, 9.2, 3.1);
          a *= 0.5;
        }
        return v;
      }

      vec3 atmosphere(vec3 dir, vec3 sunDir, float density, float highAir) {
        float elev = clamp(dir.y, -0.08, 1.0);
        float h = max(elev, 0.0);
        float sunElev = clamp(sunDir.y, -0.2, 1.0);

        float airMass = 1.0 / max(0.04, h * 0.88 + 0.05);
        float opticalDepth = 1.0 - exp(-(density * 0.85 + highAir * 0.35) * airMass * 1.65);

        vec3 horizon = mix(vec3(0.72, 0.84, 0.96), vec3(0.32, 0.52, 0.8), 1.0 - density);
        vec3 midSky  = mix(vec3(0.2, 0.48, 0.9),  vec3(0.06, 0.14, 0.36), 1.0 - density);
        vec3 zenith  = mix(vec3(0.02, 0.06, 0.24), vec3(0.0, 0.0, 0.02), 1.0 - highAir);

        float sunset = smoothstep(0.1, -0.05, sunElev) * smoothstep(-0.2, 0.0, sunElev);
        horizon = mix(horizon, vec3(0.98, 0.55, 0.28), sunset * 0.85);
        midSky  = mix(midSky,  vec3(0.7, 0.32, 0.4), sunset * 0.45);
        zenith  = mix(zenith,  vec3(0.08, 0.05, 0.16), sunset * 0.35);

        vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.38, h));
        col = mix(col, zenith, pow(h, 1.05));

        float horizonBand = exp(-h * 9.0);
        col = mix(col, mix(vec3(0.84, 0.9, 0.98), vec3(1.0, 0.72, 0.42), sunset), horizonBand * 0.34 * density);

        float volumeHaze = density * exp(-h * 2.5) * (0.12 + 0.1 * opticalDepth);
        col = mix(col, vec3(0.7, 0.8, 0.94), volumeHaze);
        col *= 0.82 + opticalDepth * 0.22;

        float sun = max(dot(dir, sunDir), 0.0);
        float mie = pow(sun, 12.0) * opticalDepth * density;
        col = mix(col, mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.55, 0.28), sunset), mie * 0.16);
        col += vec3(1.0, 0.94, 0.8) * pow(sun, 80.0) * density * 0.28;
        col += vec3(1.0, 0.97, 0.9) * pow(sun, 2400.0) * step(0.002, density);

        if (elev < 0.0) {
          col = mix(col, vec3(0.4, 0.5, 0.6), clamp(-elev * 7.0, 0.0, 0.55));
        }
        return col;
      }

      float cloudDensity(vec3 p, float cover) {
        vec3 q = p * 0.00032;
        q.xz += uWind * uTime * 10.0;
        q.y *= 1.6;
        q.y += uTime * 0.008;

        float weather = fbm(q * 0.5 + vec3(3.1, 0.0, 7.2));
        float base = fbm(q * 1.0);
        float billow = fbm(q * 1.8 + vec3(11.0, 2.0, 5.0));
        float detail = fbm(q * 3.4 + vec3(5.2, 1.1, 8.3));

        float region = smoothstep(1.0 - cover, 1.0 - cover + 0.2, weather);
        float dens = base * 0.52 + billow * 0.33 + detail * 0.15;
        dens = smoothstep(0.45, 0.75, dens) * region;

        float h01 = clamp((p.y - 1500.0) / 4500.0, 0.0, 1.0);
        dens *= smoothstep(0.0, 0.14, h01) * (1.0 - smoothstep(0.5, 1.0, h01));

        float elev = p.y / max(length(p.xz), 1.0);
        dens *= smoothstep(0.02, 0.13, elev);
        return dens * uCloudDensity;
      }

      float lightMarch(vec3 p, vec3 sunDir) {
        float t = 0.0;
        float shadow = 0.0;
        for (int i = 0; i < 5; i++) {
          shadow += cloudDensity(p + sunDir * t, uCloudCover);
          t += 450.0;
        }
        return exp(-shadow * 0.5);
      }

      vec4 marchClouds(vec3 origin, vec3 dir, vec3 sunDir, float cloudFade) {
        if (dir.y < 0.01) return vec4(0.0);

        float y0 = 1400.0;
        float y1 = 6500.0;
        float tEnter = (y0 - origin.y) / dir.y;
        float tExit  = (y1 - origin.y) / dir.y;
        if (tExit < 0.0) return vec4(0.0);
        tEnter = max(tEnter, 0.0);
        tExit  = min(tExit, 100000.0);
        if (tEnter >= tExit) return vec4(0.0);

        float dist = tExit - tEnter;
        const int STEPS = 20;
        float stepLen = dist / float(STEPS);
        float dither = hash(dir * 41.7 + vec3(dir.z, 1.3, dir.x));
        float t = tEnter + stepLen * dither;

        float transmittance = 1.0;
        vec3 scattered = vec3(0.0);

        float cosT = dot(dir, sunDir);
        float g = 0.5;
        float g2 = g * g;
        float phase = 0.0796 * (1.0 - g2) / max(1e-4, pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
        float silver = pow(max(cosT, 0.0), 7.0) * 1.6;

        float sunElev = clamp(sunDir.y, -0.1, 1.0);
        float sunset = smoothstep(0.1, -0.05, sunElev);
        vec3 sunCol = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.58, 0.3), sunset);
        vec3 ambient = mix(vec3(0.5, 0.62, 0.85), vec3(0.55, 0.35, 0.32), sunset) * 0.55;

        for (int i = 0; i < STEPS; i++) {
          if (transmittance < 0.02) break;
          vec3 p = origin + dir * t;
          float d = cloudDensity(p, uCloudCover) * cloudFade;
          if (d > 0.01) {
            float light = lightMarch(p, sunDir);
            float ms = 0.4 + 0.6 * light;
            vec3 lightCol = sunCol * (light * (0.65 + phase * 2.5 + silver) + 0.08) + ambient * ms;
            float optical = d * stepLen * 0.0012;
            float absorb = exp(-optical);
            scattered += transmittance * lightCol * (1.0 - absorb);
            transmittance *= absorb;
          }
          t += stepLen;
        }

        float alpha = (1.0 - transmittance) * cloudFade;
        scattered = clamp(scattered, vec3(0.0), vec3(1.15));
        return vec4(scattered, clamp(alpha, 0.0, 1.0));
      }

      void main() {
        vec3 dir = normalize(vLocalPos);
        vec3 sunDir = normalize(uSunDir);

        float alt = max(uAltitude, 0.0);
        float density = exp(-alt / 8500.0);
        float highAir = exp(-alt / 32000.0);

        vec3 skyCol = atmosphere(dir, sunDir, density, highAir);

        float cloudFade = smoothstep(16000.0, 4000.0, alt) * density;
        vec4 clouds = vec4(0.0);
        if (cloudFade > 0.03 && dir.y > 0.0) {
          clouds = marchClouds(vec3(0.0, 60.0, 0.0), dir, sunDir, cloudFade);
        }

        vec3 cloudCol = mix(vec3(0.78, 0.84, 0.92), clouds.rgb, 0.85);
        cloudCol = max(cloudCol, vec3(0.55, 0.6, 0.7));
        vec3 col = mix(skyCol, cloudCol, clamp(clouds.a, 0.0, 0.92));

        // Alpha — same structure as the pre-dynamic pad dome (known solid on pad)
        float h = max(dir.y, 0.0);
        float airMass = 1.0 / max(0.04, h * 0.88 + 0.05);
        float opticalDepth =
          1.0 - exp(-(density * 0.85 + highAir * 0.35) * airMass * 1.65);

        float zenithOpen = smoothstep(0.15, 0.95, h) * (1.0 - highAir);
        float baseA = clamp(opticalDepth * uOpacity, 0.0, 1.0);
        float padFloor = uOpacity * density * 0.62;
        float a = max(baseA, padFloor);
        a *= 1.0 - zenithOpen * 0.92 * uOpacity;
        a = max(a, clouds.a * uOpacity * cloudFade * 0.95);
        a = clamp(a, 0.0, 1.0);

        if (a < 0.008) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), material);
  mesh.name = 'PadDynamicSky';
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;

  const _camLocal = new THREE.Vector3();

  return {
    mesh,
    material,
    uniforms,
    /** @param {number} t seconds */
    update(t) {
      uniforms.uTime.value = t;
    },
    setSunDir(dir) {
      if (!dir) return;
      // Keep shared reference; only normalize in-place if unique copy needed
      if (uniforms.uSunDir.value !== dir) {
        uniforms.uSunDir.value.copy(dir).normalize();
      }
    },
    setOpacity(v) {
      uniforms.uOpacity.value = v;
    },
    setAltitude(m) {
      uniforms.uAltitude.value = Math.max(0, m);
    },
    /**
     * @param {{ cover?: number, density?: number, windX?: number, windZ?: number }} p
     */
    setWeather(p = {}) {
      if (p.cover != null) uniforms.uCloudCover.value = THREE.MathUtils.clamp(p.cover, 0, 1);
      if (p.density != null) uniforms.uCloudDensity.value = p.density;
      if (p.windX != null) uniforms.uWind.value.x = p.windX;
      if (p.windZ != null) uniforms.uWind.value.y = p.windZ;
    },
    /**
     * @param {THREE.Camera} camera
     * @param {THREE.Object3D} parent
     */
    syncToCamera(camera, parent) {
      if (!camera || !mesh.visible) return;
      _camLocal.copy(camera.position);
      if (parent) parent.worldToLocal(_camLocal);
      mesh.position.copy(_camLocal);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
