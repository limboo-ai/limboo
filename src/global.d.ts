// Ambient types so the renderer is aware of the API exposed by the preload
// script through `contextBridge` (see src/preload/index.ts).

import type { LimbooApi } from './preload';

declare global {
  interface Window {
    limboo: LimbooApi;
  }
}

// Vite's `?worker` suffix import (used by the Work Graph layout worker). Vite
// rewrites it to a constructor returning a real `Worker`; without this the
// import would be implicitly `any`.
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

export {};
