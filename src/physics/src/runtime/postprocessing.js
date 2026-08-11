import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Fixed high-quality post-processing chain for HoloPhysics.
 *
 * The chain is deliberately owned by the physics page instead of the rocket
 * page so RenderTargets and pass state cannot leak between standalone apps.
 */
export function createPhysicsPostProcessing({ renderer, scene, camera, quality = {} } = {}) {
  if (!renderer || !scene || !camera) {
    throw new TypeError('createPhysicsPostProcessing requires renderer, scene and camera');
  }

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  // Bloom is an accent layer, not a second lighting system. Keep the
  // threshold above ordinary white materials so the room does not turn into
  // a clipped white fog when several emissive props are visible.
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.12, 0.48, 1.05);
  const ssaoPass = new SSAOPass(scene, camera, 1, 1);
  const outputPass = new OutputPass();

  bloomPass.enabled = quality.bloomEnabled !== false;
  bloomPass.resolution.set(1, 1);
  bloomPass.threshold = 1.05;
  bloomPass.strength = 0.12;
  bloomPass.radius = 0.48;

  ssaoPass.enabled = true;
  ssaoPass.kernelRadius = 9;
  ssaoPass.minDistance = 0.0015;
  ssaoPass.maxDistance = 0.12;

  composer.addPass(renderPass);
  composer.addPass(ssaoPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  let width = 1;
  let height = 1;
  let pixelRatio = 1;

  function resize(nextWidth, nextHeight, nextPixelRatio = pixelRatio) {
    width = Math.max(1, Number(nextWidth) || 1);
    height = Math.max(1, Number(nextHeight) || 1);
    pixelRatio = Math.max(0.5, Number(nextPixelRatio) || 1);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const bloomScale = Math.max(0.5, Math.min(1, Number(quality.bloomScale) || 0.75));
    bloomPass.resolution.set(
      Math.max(1, Math.floor(width * pixelRatio * bloomScale)),
      Math.max(1, Math.floor(height * pixelRatio * bloomScale)),
    );
  }

  return {
    composer,
    bloomPass,
    ssaoPass,
    render() {
      composer.render();
    },
    resize,
    dispose() {
      composer.dispose?.();
      renderPass.dispose?.();
      bloomPass.dispose?.();
      ssaoPass.dispose?.();
      outputPass.dispose?.();
    },
    getSize() {
      return { width, height, pixelRatio };
    },
  };
}
