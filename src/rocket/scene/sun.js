import * as THREE from 'three';
import { SUN_BLOOM_LAYER } from '../effects/postprocessing.js';

/**
 * Textured photosphere with multi-layer camera-facing corona.
 *
 * Photosphere map: Solar System Scope (CC BY 4.0), NASA-based imagery
 *   public/textures/sun_4k.jpg / sun_2k.jpg
 *
 * UnrealBloom is applied selectively (SUN_BLOOM_LAYER only) so Earth/stars
 * never enter the bloom extract — no full-frame strobe.
 */
export function createSunVisual({
  position,
  radius,
  sunMap = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'SunVisual';
  group.position.copy(position);

  const R = radius;

  const photoUniforms = {
    uMap: { value: sunMap },
    uTime: { value: 0 },
    uHasMap: { value: sunMap ? 1 : 0 },
  };

  const photoMat = new THREE.ShaderMaterial({
    uniforms: photoUniforms,
    toneMapped: false,
    depthWrite: true,
    depthTest: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uHasMap;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorldPos;

      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float facing = max(dot(N, V), 0.0);
        float limb = 1.0 - facing;

        vec2 uv = vec2(fract(vUv.x + uTime * 0.0008), vUv.y);
        vec3 tex = vec3(1.0, 0.78, 0.35);
        if (uHasMap > 0.5) {
          tex = texture2D(uMap, uv).rgb;
        }

        tex *= vec3(1.1, 1.02, 0.8);
        float lum = max(dot(tex, vec3(0.299, 0.587, 0.114)), 0.001);
        float compressed = lum / (lum + 0.5);
        compressed = mix(compressed, lum * 0.88, 0.32);
        vec3 col = tex * (compressed / lum);

        float surfaceContrast = mix(0.82, 1.28, smoothstep(0.16, 0.72, lum));
        col *= surfaceContrast;

        // Hot white core + warm limb
        float whiteHeat = smoothstep(0.2, 0.7, lum);
        col = mix(col, vec3(1.0, 0.96, 0.82), 0.08 + whiteHeat * 0.18);
        col *= mix(1.0, 0.84, pow(limb, 1.4));

        // Soft limb emissive so the disc edge bleeds into the corona
        col += vec3(1.0, 0.72, 0.28) * pow(limb, 2.2) * 0.28;

        const float intensity = 1.65;
        gl_FragColor = vec4(col * intensity, 1.0);
      }
    `,
  });

  if (sunMap) {
    sunMap.colorSpace = THREE.SRGBColorSpace;
    sunMap.wrapS = THREE.RepeatWrapping;
    sunMap.wrapT = THREE.ClampToEdgeWrapping;
    sunMap.anisotropy = 8;
  }

  const core = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), photoMat);
  core.name = 'SunCore';
  core.userData.radius = R;
  core.frustumCulled = false;
  // Layer 0 (default) + bloom layer — main view + selective UnrealBloom
  core.layers.enable(SUN_BLOOM_LAYER);
  group.add(core);

  /**
   * One additive corona plane (camera-facing).
   * Layers stack from tight edge veil → broad optical bloom spill.
   */
  function makeCoronaLayer({
    name,
    sizeMul,
    color,
    strength,
    discRadius,
    falloff,
    renderOrder,
  }) {
    const uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uDiscRadius: { value: discRadius },
      uFalloff: { value: falloff },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      toneMapped: false,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uStrength;
        uniform float uDiscRadius;
        uniform float uFalloff;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r >= 1.0) discard;

          float d = max(r - uDiscRadius, 0.0);
          float tight = exp(-d * uFalloff);
          float tail = exp(-d * uFalloff * 0.38);
          float angle = atan(p.y, p.x);
          float irregularity = 1.0 +
            sin(angle * 11.0 + uTime * 0.05) * 0.014 +
            sin(angle * 27.0 - uTime * 0.032) * 0.008;
          float alpha = mix(tail, tight, 0.58) * uStrength * irregularity;
          alpha *= smoothstep(1.0, 0.72, r);

          vec3 hot = vec3(1.0, 0.97, 0.88);
          vec3 col = mix(uColor, hot, tight * 0.62);
          gl_FragColor = vec4(col * (0.95 + tight * 0.25), alpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(R * sizeMul, R * sizeMul),
      mat
    );
    mesh.name = name;
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.layers.enable(SUN_BLOOM_LAYER);
    group.add(mesh);
    return { mesh, uniforms, mat };
  }

  // Tight bright veil at the photosphere edge
  const inner = makeCoronaLayer({
    name: 'SunInnerCorona',
    sizeMul: 2.2,
    color: 0xffe0a8,
    strength: 0.16,
    discRadius: 1 / 1.16,
    falloff: 12.0,
    renderOrder: 3,
  });

  // Mid amber halo (classic corona)
  const mid = makeCoronaLayer({
    name: 'SunMidCorona',
    sizeMul: 2.9,
    color: 0xffb35a,
    strength: 0.065,
    discRadius: 1 / 1.45,
    falloff: 4.8,
    renderOrder: 2,
  });

  // Soft outer spill
  const bloom = makeCoronaLayer({
    name: 'SunBloomSpill',
    sizeMul: 4.4,
    color: 0xff9a40,
    strength: 0.035,
    discRadius: 1 / 2.3,
    falloff: 2.4,
    renderOrder: 1,
  });

  // Faintest outer glow for distant system overview
  const outer = makeCoronaLayer({
    name: 'SunOuterGlow',
    sizeMul: 6.2,
    color: 0xff7a28,
    strength: 0.018,
    discRadius: 1 / 3.0,
    falloff: 1.5,
    renderOrder: 0,
  });

  const layers = [inner, mid, bloom, outer];
  let t = 0;

  return {
    group,
    mesh: core,
    position,
    radius: R,
    update(dt, camera) {
      t += dt;
      photoUniforms.uTime.value = t;
      core.rotation.y += dt * 0.008;
      for (const layer of layers) {
        layer.uniforms.uTime.value = t;
        if (camera) layer.mesh.quaternion.copy(camera.quaternion);
      }
    },
  };
}
