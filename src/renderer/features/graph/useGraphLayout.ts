/**
 * Runs the lane layout and hands the panel a `LayoutResult`.
 *
 * Layout runs in a Web Worker so a ten-thousand-node graph never blocks the UI
 * thread (see `layout/layout.worker.ts` for why a worker and not a
 * `utilityProcess`). If a worker cannot be created — an exotic environment, a
 * future CSP change, a plain browser preview — the hook falls back to computing
 * synchronously, but ONLY up to `GRAPH_LIMITS.syncLayoutMax`. Above that it
 * reports `tooLarge` and the panel explains itself.
 *
 * The rule that makes this safe: never block, never hang. A missing worker
 * degrades to a smaller capability with a visible explanation, never to a
 * frozen window.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { GRAPH_LIMITS } from '@shared/constants';
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';
import LayoutWorker from './layout/layout.worker?worker';
import { laneLayout } from './layout/laneLayout';
import type { LayoutInput, LayoutResponse, LayoutResult } from './layout/types';

const EMPTY_LAYOUT: LayoutResult = {
  rows: [],
  paths: [],
  buckets: {},
  laneCount: 1,
  rowCount: 0,
  droppedEdges: 0,
  gutter: [],
};

export interface UseGraphLayoutArgs {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  maxLanes: number;
  rowHeight: number;
}

export interface UseGraphLayoutResult {
  layout: LayoutResult;
  /** True while a worker layout is in flight. */
  computing: boolean;
  /** True when the graph exceeds what the available layout path can handle. */
  tooLarge: boolean;
}

/**
 * Project the full nodes/edges down to the minimal shapes the layouter needs.
 * Keeping this narrow matters: the value is structured-cloned across the worker
 * boundary on every change, and a node payload is far larger than its
 * (id, kind, order) triple.
 */
function toLayoutInput(args: UseGraphLayoutArgs): LayoutInput {
  return {
    nodes: args.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      startedAt: n.startedAt,
      seq: n.seq,
    })),
    edges: args.edges.map((e) => ({
      src: e.src,
      dst: e.dst,
      kind: e.kind,
      derived: e.derived,
    })),
    maxLanes: args.maxLanes,
    rowHeight: args.rowHeight,
  };
}

export function useGraphLayout(args: UseGraphLayoutArgs): UseGraphLayoutResult {
  const { nodes, edges, maxLanes, rowHeight } = args;

  const workerRef = useRef<Worker | null>(null);
  /** null until we have tried; then true/false. Drives the fallback decision. */
  const [workerReady, setWorkerReady] = useState<boolean | null>(null);
  const requestId = useRef(0);
  const [asyncLayout, setAsyncLayout] = useState<LayoutResult>(EMPTY_LAYOUT);
  const [computing, setComputing] = useState(false);

  /* --- worker lifecycle ---------------------------------------------- */

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new LayoutWorker();
      worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
        // Ignore stale replies: only the newest request may update the view,
        // or a slow earlier layout could overwrite a newer one.
        if (event.data.id !== requestId.current) return;
        setAsyncLayout(event.data.result);
        setComputing(false);
      };
      worker.onerror = () => {
        // Fall back permanently rather than retrying a worker that just failed.
        setWorkerReady(false);
        setComputing(false);
      };
      workerRef.current = worker;
      setWorkerReady(true);
    } catch {
      setWorkerReady(false);
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const input = useMemo(
    () => toLayoutInput({ nodes, edges, maxLanes, rowHeight }),
    [nodes, edges, maxLanes, rowHeight],
  );

  /* --- dispatch to the worker ----------------------------------------- */

  useEffect(() => {
    if (workerReady !== true) return;
    const worker = workerRef.current;
    if (!worker) return;
    if (input.nodes.length === 0) {
      setAsyncLayout(EMPTY_LAYOUT);
      setComputing(false);
      return;
    }
    requestId.current += 1;
    setComputing(true);
    worker.postMessage({ id: requestId.current, input });
  }, [input, workerReady]);

  /* --- synchronous fallback ------------------------------------------- */

  const canSync = input.nodes.length <= GRAPH_LIMITS.syncLayoutMax;

  const syncLayout = useMemo(() => {
    // Only compute synchronously when we actually need to: doing it eagerly
    // would defeat the entire point of having a worker.
    if (workerReady !== false || !canSync || input.nodes.length === 0) return EMPTY_LAYOUT;
    return laneLayout(input);
  }, [workerReady, canSync, input]);

  if (workerReady === false) {
    return {
      layout: canSync ? syncLayout : EMPTY_LAYOUT,
      computing: false,
      tooLarge: !canSync && input.nodes.length > 0,
    };
  }

  // While the worker is still starting up (workerReady === null) we render the
  // empty layout with `computing` true, so the header shows a spinner rather
  // than flashing an "empty graph" state.
  return {
    layout: asyncLayout,
    computing: computing || workerReady === null,
    tooLarge: false,
  };
}

export { EMPTY_LAYOUT, toLayoutInput };
