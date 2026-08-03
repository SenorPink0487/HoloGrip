/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly HOLO_TARGET?: string;
}

interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    ready: Promise<void>;
    finished: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
}

