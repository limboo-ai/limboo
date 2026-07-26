/**
 * The Work Graph layout worker.
 *
 * A plain Web Worker (imported via Vite's `?worker`), NOT a `utilityProcess`.
 * The reasoning, recorded here so a future reader does not "fix" it into the
 * main process on the strength of the "renderer = UI only" rule:
 *
 *  - The graph data already lives in the renderer after the IPC delta. Routing
 *    layout through main would ship a third copy renderer -> main -> utility ->
 *    main -> renderer for a computation whose only consumer is the renderer.
 *  - The output is pure geometry: flat arrays of numbers and SVG path strings.
 *  - Nothing here needs Node. A Web Worker inherits `sandbox: true` and has no
 *    Node APIs, so this CANNOT weaken the process boundary — it is compute, not
 *    OS access, which is exactly what the boundary rule is about.
 *  - `worker-src 'self' blob:` is already present in the dev CSP, the production
 *    CSP, and the index.html meta fallback, so this needs no security change.
 *
 * The worker imports the same `laneLayout` the synchronous fallback calls, so
 * the two paths can never diverge.
 */
import { laneLayout } from './laneLayout';
import type { LayoutRequest, LayoutResponse } from './types';

/** Reply shape when layout fails — an empty graph, never a dropped message. */
const EMPTY: LayoutResponse['result'] = {
  rows: [],
  paths: [],
  buckets: {},
  laneCount: 1,
  rowCount: 0,
  droppedEdges: 0,
  gutter: [],
};

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { id, input } = event.data;
  // Never let a malformed input kill the worker, and ALWAYS reply: a dropped
  // message would leave the panel showing a spinner forever with no recovery.
  let response: LayoutResponse;
  try {
    response = { id, result: laneLayout(input) };
  } catch {
    response = { id, result: EMPTY };
  }
  (self as unknown as Worker).postMessage(response);
};
