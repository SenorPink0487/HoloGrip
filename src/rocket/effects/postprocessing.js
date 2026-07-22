import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Layer bit used for selective sun bloom (default layer 0 stays on everything). */
export const SUN_BLOOM_LAYER = 1;

/**
 * Subtle optical heat haze — like warm air over asphalt / exhaust.
 */
const HeatDistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
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
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      float amp = uIntensity;
      vec2 uv = vUv;
      if (amp > 0.00003) {
        // Heat haze only in the lower frame (pad / exhaust air).
        // Suppress the horizontal center band — chase-cam puts the rocket
        // there, and horizontal UV wobble on a tall cylinder reads as ugly
        // vertical stripes on the hull.
        float bottom = 1.0 - smoothstep(0.08, 0.58, vUv.y);
        float offCenter = smoothstep(0.0, 0.2, abs(vUv.x - 0.5));
        float mask = bottom * mix(0.08, 1.0, offCenter);
        mask *= smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        mask = clamp(mask, 0.0, 1.0);

        float t = uTime * 0.55;
        vec2 p1 = vec2(vUv.x * 6.5 + t * 0.35, vUv.y * 4.0 - t * 1.15);
        vec2 p2 = vec2(vUv.x * 11.0 - t * 0.55, vUv.y * 7.5 - t * 0.7);
        float n = fbm(p1) * 0.65 + fbm(p2) * 0.35;
        n = n * 2.0 - 1.0;

        vec2 offset;
        // Prefer mild vertical shimmer; large horizontal offset stripes the hull
        offset.x = n * amp * mask * 0.45;
        offset.y = n * amp * mask * 0.55;
        uv = clamp(vUv + offset, 0.001, 0.999);
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

/** Composite full scene + selective sun bloom. */
const BloomMixShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      gl_FragColor = vec4(base.rgb + bloom.rgb, base.a);
    }
  `,
};

/**
 * Selective UnrealBloom: only meshes on SUN_BLOOM_LAYER are bloomed.
 * Earth clouds / stars / hull never enter the bloom extract — no full-frame strobe.
 */
export function createPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  const bloomLayer = new THREE.Layers();
  bloomLayer.set(SUN_BLOOM_LAYER);

  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const savedMaterials = {};

  function darkenNonBloomed(obj) {
    if (!obj.isMesh) return;
    // Keep sun (bloom layer) lit; everything else pure black for the bloom pass
    if (bloomLayer.test(obj.layers) === false) {
      savedMaterials[obj.uuid] = obj.material;
      obj.material = Array.isArray(obj.material)
        ? obj.material.map(() => darkMaterial)
        : darkMaterial;
    }
  }

  function restoreMaterial(obj) {
    if (!obj.isMesh) return;
    const m = savedMaterials[obj.uuid];
    if (m) {
      obj.material = m;
      delete savedMaterials[obj.uuid];
    }
  }

  const renderScene = new RenderPass(scene, camera);

  // Selective sun bloom — subtle optical spill only
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.18, // strength
    0.2, // radius
    0.55 // threshold — only hottest core pixels
  );

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  // Disable auto clear issues — we'll manage background during selective pass
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.readBuffer.texture },
      },
      vertexShader: BloomMixShader.vertexShader,
      fragmentShader: BloomMixShader.fragmentShader,
      defines: {},
    }),
    'baseTexture'
  );
  mixPass.needsSwap = true;

  const heatPass = new ShaderPass(HeatDistortionShader);
  heatPass.enabled = false;

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(renderScene);
  finalComposer.addPass(mixPass);
  finalComposer.addPass(heatPass);
  finalComposer.addPass(new OutputPass());

  let heatIntensity = 0;
  let sunBloomEnabled = true;

  return {
    composer: finalComposer,
    bloomPass,
    heatPass,
    setSize(w, h) {
      bloomComposer.setSize(w, h);
      finalComposer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    },
    /** Toggle selective sun bloom (default on). */
    setSunBloom(enabled) {
      sunBloomEnabled = !!enabled;
      bloomPass.enabled = sunBloomEnabled;
    },
    setHeatDistortion(amount = 0, time = 0) {
      heatIntensity = THREE.MathUtils.clamp(amount, 0, 1);
      const strength = heatIntensity * 0.0032;
      heatPass.uniforms.uIntensity.value = strength;
      heatPass.uniforms.uTime.value = time;
      heatPass.enabled = strength > 0.00004;
    },
    hasDistortion() {
      return heatPass.enabled && heatIntensity > 0.01;
    },
    render() {
      const prevBackground = scene.background;
      const prevBgIntensity = scene.backgroundIntensity;

      if (sunBloomEnabled) {
        // Bloom pass: only sun layer keeps its materials; rest black; no sky cubemap
        scene.background = null;
        scene.traverse(darkenNonBloomed);
        bloomComposer.render();
        scene.traverse(restoreMaterial);
        scene.background = prevBackground;
        if (prevBgIntensity != null) scene.backgroundIntensity = prevBgIntensity;

        mixPass.material.uniforms.bloomTexture.value =
          bloomComposer.readBuffer.texture;
        mixPass.enabled = true;
      } else {
        mixPass.enabled = false;
      }

      finalComposer.render();
    },
  };
}
