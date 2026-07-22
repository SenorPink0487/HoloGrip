import { create } from 'zustand';

const initialState = {
  helpOpen: false,
  toast: null,
  hud: null,
  ar: {
    active: false,
    phase: 'off',
    status: 'AR 妯″紡宸插叧闂?路 H',
    detail: '',
    activeHand: null,
    trackingFps: 0,
    inferenceMs: 0,
    pipelineMs: 0,
    degraded: false,
  },
  tutorialVisible: false,
  fullscreen: {
    open: false,
    stationId: null,
  },
};

const identity = (value) => value;

// Zustand owns the state and React subscriptions. The compatibility helpers
// below keep the existing non-React callers independent from Zustand's API.
export const useUiStore = create(() => initialState);

export function getUiState() {
  return useUiStore.getState();
}

export function setUiState(update) {
  const state = useUiStore.getState();
  const patch = typeof update === 'function' ? update(state) : update;
  if (!patch) return;

  const next = { ...state, ...patch };
  if (patch.ar) next.ar = { ...state.ar, ...patch.ar };
  if (patch.fullscreen) next.fullscreen = { ...state.fullscreen, ...patch.fullscreen };
  useUiStore.setState(next, true);
}

export function resetUiState() {
  useUiStore.setState(initialState, true);
}

export function subscribeUiState(listener) {
  return useUiStore.subscribe(() => listener());
}

export function useUiState(selector = identity) {
  return useUiStore(selector);
}
