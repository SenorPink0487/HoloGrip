import { Vector2, WebGLRenderTarget } from 'three';

/**
 * Transactional experiment lifecycle adapter. Runtime implementations may be
 * legacy handlers as long as they satisfy this boundary.
 */
export const RUNTIME_STATES = Object.freeze([
  'cold', 'loading', 'prepared', 'active', 'warm', 'disposing', 'error',
]);

/**
 * Adapt an existing host equipment group to the transactional runtime
 * contract. The station remains the owner of shared lighting/material pools;
 * an adapter owns only the selected mode's mount and lifecycle callbacks.
 */
export function createEquipmentRuntime({
  id,
  root,
  getRoot = () => root,
  prepare = async () => {},
  prepareRoot = () => root,
  activate = () => {},
  mount: mountEquipment = () => {},
  suspend = () => {},
  unmount = () => {},
  getPickSet,
  estimateBytes,
  dispose = () => {},
} = {}) {
  const resolveRoot = () => getRoot?.() || root;
  return createExperimentRuntime({
    id,
    prepare,
    prepareGpu: async (renderer, camera, prepareScene, signal) => {
      const target = prepareRoot?.() || resolveRoot();
      const scene = typeof prepareScene === 'function' ? prepareScene() : prepareScene;
      const previousParent = target?.parent || null;
      const previousVisible = target?.visible;
      if (scene?.add && target && target.parent !== scene) scene.add(target);
      if (target) target.visible = true;
      target?.updateWorldMatrix?.(true, true);
      try {
        if (typeof renderer?.compileAsync === 'function') {
          try { await renderer.compileAsync(scene || target, camera); }
          catch { renderer?.compile?.(scene || target, camera); }
        } else {
          renderer?.compile?.(scene || target, camera);
        }
        if (scene && typeof renderer?.render === 'function') {
          const previousTarget = renderer.getRenderTarget?.() || null;
          const previousSize = new Vector2();
          renderer.getSize?.(previousSize);
          const previousPr = renderer.getPixelRatio?.() || 1;
          try {
            renderer.setRenderTarget?.(prepareTarget(renderer));
            renderer.setViewport?.(0, 0, 1, 1);
            renderer.setScissorTest?.(false);
            renderer.clear?.();
            renderer.render(scene, camera);
          } finally {
            // Always restore the default framebuffer + full canvas viewport.
            // Leaving a 1×1 viewport after intent prewarm blanks the lab canvas
            // in Vite dev (only holos / UI chrome remain visible).
            // setViewport takes logical CSS px (Three multiplies by pixelRatio);
            // never pass drawing-buffer / physical pixels here or the scene is
            // letterboxed and mouse/crosshair picks stay offset until the next
            // clean setSize (e.g. F11).
            renderer.setRenderTarget?.(previousTarget);
            const w = Math.max(1, previousSize.x || 0);
            const h = Math.max(1, previousSize.y || 0);
            if (previousSize.x > 0 && previousSize.y > 0) {
              if (typeof renderer.setPixelRatio === 'function' && previousPr > 0) {
                renderer.setPixelRatio(previousPr);
              }
              renderer.setSize?.(w, h, false);
            }
            renderer.setViewport?.(0, 0, w, h);
            renderer.setScissorTest?.(false);
            if (typeof renderer.setScissor === 'function') {
              renderer.setScissor(0, 0, w, h);
            }
          }
        }
      } finally {
        if (previousParent && target?.parent !== previousParent) previousParent.add(target);
        else if (!previousParent && target?.parent === scene) scene?.remove?.(target);
        if (target && previousVisible !== undefined) target.visible = previousVisible;
      }
      if (signal?.aborted) throw abortError();
    },
    mount: (parent) => {
      const target = resolveRoot();
      if (target) target.visible = true;
      mountEquipment(parent, target);
    },
    activate,
    getPickSet: getPickSet || (() => getLeafPickSet(resolveRoot())),
    suspend,
    unmount,
    estimateBytes: estimateBytes || (() => estimateObjectBytes(resolveRoot())),
    dispose,
  });
}

function prepareTarget(renderer) {
  const target = renderer?.__runtimePrepareTarget;
  if (target) return target;
  // Renderer owns the target lifetime for the duration of the page. Keeping a
  // single 1x1 target avoids allocating one during every intent prediction.
  const next = new WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  try { Object.defineProperty(renderer, '__runtimePrepareTarget', { value: next, configurable: true }); }
  catch { renderer.__runtimePrepareTarget = next; }
  return next;
}

/** Release the renderer-owned 1x1 target during context loss or shutdown. */
export function disposeRendererPrepareTarget(renderer) {
  const target = renderer?.__runtimePrepareTarget;
  if (!target) return false;
  try { target.dispose?.(); } finally {
    try { delete renderer.__runtimePrepareTarget; } catch { /* readonly host */ }
  }
  return true;
}

export function getLeafPickSet(root) {
  if (!root?.traverse) return [];
  const leaves = [];
  root.traverse((object) => {
    if (object === root || !object.isObject3D || !object.raycast || !object.visible) return;
    if (object.userData?.nonInteractive || object.userData?.isHelper) return;
    if (object.isMesh || object.isLine || object.isPoints) leaves.push(object);
  });
  return leaves;
}

export function estimateObjectBytes(root) {
  if (!root?.traverse) return { cpu: 0, gpu: 0 };
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let geometryBytes = 0;
  let textureBytes = 0;
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      for (const attribute of Object.values(object.geometry.attributes || {})) {
        geometryBytes += attribute.array?.byteLength || 0;
      }
      geometryBytes += object.geometry.index?.array?.byteLength || 0;
    }
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture || textures.has(value)) continue;
        textures.add(value);
        const image = value.image;
        textureBytes += Math.max(1, image?.width || 1) * Math.max(1, image?.height || 1) * 4;
      }
    });
  });
  const cpu = geometryBytes + materials.size * 512;
  const gpu = geometryBytes + textureBytes + materials.size * 256;
  return { cpu, gpu };
}

export function createExperimentRuntime({
  id,
  prepare = async () => {},
  prepareGpu = async () => {},
  mount = () => {},
  activate = () => {},
  fixedUpdate = () => {},
  visualUpdate = () => {},
  getPickSet = () => [],
  suspend = () => {},
  unmount = () => {},
  estimateBytes = () => ({ cpu: 0, gpu: 0 }),
  dispose = () => {},
} = {}) {
  let state = 'cold';
  let disposed = false;

  function transition(next) {
    if (!RUNTIME_STATES.includes(next)) throw new Error(`Invalid runtime state: ${next}`);
    state = next;
  }

  return {
    id,
    get state() { return state; },
    async prepare(ctx, signal) {
      if (disposed) throw new Error(`Runtime ${id} is disposed`);
      if (state !== 'cold' && state !== 'error') return;
      transition('loading');
      try {
        await prepare(ctx, signal);
        if (signal?.aborted) throw abortError();
        transition('prepared');
      } catch (error) {
        transition('error');
        throw error;
      }
    },
    async prepareGpu(renderer, camera, prepareScene, signal) {
      if (state !== 'prepared') throw new Error(`Runtime ${id} is not prepared`);
      await prepareGpu(renderer, camera, prepareScene, signal);
      if (signal?.aborted) throw abortError();
    },
    mount(parent) {
      if (state !== 'prepared' && state !== 'warm') throw new Error(`Runtime ${id} cannot mount from ${state}`);
      mount(parent);
    },
    activate(initialState) {
      if (state !== 'prepared' && state !== 'warm') throw new Error(`Runtime ${id} cannot activate from ${state}`);
      activate(initialState);
      transition('active');
    },
    fixedUpdate,
    visualUpdate,
    getPickSet,
    suspend() {
      if (state === 'active') {
        suspend();
        transition('warm');
      }
    },
    unmount() {
      if (state === 'active') suspend();
      if (state === 'active' || state === 'warm' || state === 'prepared') {
        unmount();
        transition('warm');
      }
    },
    estimateBytes,
    dispose() {
      if (disposed) return false;
      disposed = true;
      if (state !== 'cold' && state !== 'error') {
        transition('disposing');
        try { dispose(); } finally { transition('cold'); }
      } else {
        dispose();
      }
      return true;
    },
  };
}

export function createTransitionController({ cache, createRuntime, prepareContext = {}, prepareScene } = {}) {
  let sessionId = 0;
  let current = null;
  let controller = null;

  async function open(key, initialState) {
    const id = ++sessionId;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const previous = current;
    let runtime = cache?.get(key) || null;
    try {
      if (runtime && runtime === current) {
        return { committed: true, sessionId: id, runtime, unchanged: true };
      }
      // A warm runtime can be reused, but an active runtime from an older
      // session must first move through suspend so mount/activate remain
      // transactional and idempotent.
      if (runtime?.state === 'active' && runtime !== current) runtime.suspend?.();
      if (!runtime) {
        runtime = await createRuntime(key, prepareContext, signal);
        await runtime.prepare(prepareContext, signal);
        await runtime.prepareGpu?.(prepareContext.renderer, prepareContext.camera, prepareScene, signal);
      } else if (runtime.state === 'cold' || runtime.state === 'error') {
        await runtime.prepare(prepareContext, signal);
        await runtime.prepareGpu?.(prepareContext.renderer, prepareContext.camera, prepareScene, signal);
      }
      if (signal.aborted || id !== sessionId) throw abortError();
      runtime.mount(prepareContext.detachedRoot || prepareContext.parent);
      // The incoming runtime is ready at this point. Suspend the old runtime
      // before activation because several stations share one mode parent.
      // This keeps a shared station from hiding the newly activated mode.
      const previousKey = current?.id;
      current?.suspend?.();
      current?.unmount?.();
      if (current && previousKey && previousKey !== key) cache?.warm?.(previousKey, current);
      runtime.activate(initialState);
      if (signal.aborted || id !== sessionId) throw abortError();
      current = runtime;
      cache?.activate?.(key, runtime);
      return { committed: true, sessionId: id, runtime };
    } catch (error) {
      if (runtime && runtime !== current) {
        try { runtime.unmount?.(); } catch { /* best effort */ }
        try { runtime.dispose?.(); } catch { /* best effort */ }
      }
      if (error?.name === 'AbortError') return { committed: false, cancelled: true, sessionId: id };
      return { committed: false, error, sessionId: id, previous };
    }
  }

  function dispose() {
    controller?.abort();
    const previous = current;
    current = null;
    cache?.clear?.();
    // A failed or not-yet-cached runtime can still be the current one.
    if (previous && !cache?.has?.(previous.id)) previous.dispose?.();
  }

  return { open, dispose, get current() { return current; }, get sessionId() { return sessionId; } };
}

function abortError() {
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}
