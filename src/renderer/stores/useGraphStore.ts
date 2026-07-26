/**
 * Work Graph store — the renderer-side mirror of the main-process
 * WorkGraphManager. Holds the selected session's typed nodes and edges, applies
 * incremental deltas, and owns the panel's view state (selection, zoom, filters).
 *
 * The graph is PRODUCED in main; this store never authors a node. Deltas are
 * UPSERTS keyed by id, and `seq` is monotonic per session — on observing a gap
 * the store refetches a coherent snapshot rather than rendering a torn graph.
 *
 * Degrades to empty, read-only state in a plain browser preview (no preload).
 */
import { create } from 'zustand';
import { GRAPH_LIMITS } from '@shared/constants';
import type {
  GraphExportFormat,
  WorkGraphEdge,
  WorkGraphHealth,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphPush,
  WorkGraphQuery,
  WorkGraphRef,
} from '@shared/types';
import { useSessionStore } from './useSessionStore';

interface GraphState {
  /** The session the loaded graph belongs to (guards against a stale apply). */
  sessionId: string | null;
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  /** Last applied delta sequence; a gap triggers a refetch. */
  seq: number;
  /** True when the ring cap trimmed history — the panel says so explicitly. */
  truncated: boolean;
  /** Recording health; present only when persistence has been failing. */
  health: WorkGraphHealth | null;
  loading: boolean;
  hydrated: boolean;

  /** Currently selected node id (drives the inspector + semantic-edge overlay). */
  selectedId: string | null;
  /** Node id to scroll into view once, then clear. */
  revealId: string | null;
  /** Node-kind filter; empty = show everything. */
  kindFilter: WorkGraphNodeKind[];
  zoom: number;

  /**
   * Ids matched by the active structural query, or null when none is running.
   * The canvas DIMS non-matching nodes rather than removing them: dropping
   * nodes would re-flow every lane beneath them and silently rearrange the
   * history the user is reading.
   */
  queryMatches: Set<string> | null;
  /** The active canned query's id, for the chip's selected state. */
  activeQueryId: string | null;
  queryTruncated: boolean;
  querying: boolean;

  hydrate: () => void;
  load: (sessionId: string | null) => Promise<void>;
  select: (nodeId: string | null) => void;
  reveal: (nodeId: string | null) => void;
  revealByRef: (ref: WorkGraphRef) => void;
  toggleKind: (kind: WorkGraphNodeKind) => void;
  clearFilter: () => void;
  runQuery: (query: WorkGraphQuery, id: string | null) => Promise<void>;
  clearQuery: () => void;
  exportGraph: (format: GraphExportFormat) => Promise<string | null>;
  setZoom: (zoom: number) => void;
  prune: () => Promise<void>;
  clear: () => Promise<void>;
}

function api() {
  return window.limboo?.graph;
}

function clampZoom(z: number): number {
  return Math.min(GRAPH_LIMITS.zoom.max, Math.max(GRAPH_LIMITS.zoom.min, z));
}

/**
 * Apply a delta's upserts onto the current arrays. Nodes are matched by id and
 * replaced in place so ordering (which the layouter depends on) is preserved;
 * genuinely new nodes append and are re-sorted by `(startedAt, seq)`.
 */
function applyNodes(current: WorkGraphNode[], incoming: WorkGraphNode[]): WorkGraphNode[] {
  if (incoming.length === 0) return current;
  const index = new Map(current.map((n, i) => [n.id, i]));
  const next = current.slice();
  let appended = false;
  for (const n of incoming) {
    const at = index.get(n.id);
    if (at === undefined) {
      next.push(n);
      appended = true;
    } else {
      next[at] = n;
    }
  }
  // Sort by `seq` only — the builder's insertion counter. It is the structural
  // order the spine was built in; `startedAt` can disagree with it (see the
  // note in laneLayout) and sorting by time would place children above parents.
  if (appended) next.sort((a, b) => a.seq - b.seq);
  return next;
}

function applyEdges(current: WorkGraphEdge[], incoming: WorkGraphEdge[]): WorkGraphEdge[] {
  if (incoming.length === 0) return current;
  // Dedupe on the semantic triple, not the row id: the builder is allowed to
  // re-emit an edge, and main's unique index already treats those as one.
  const seen = new Set(current.map((e) => `${e.src}|${e.dst}|${e.kind}`));
  const next = current.slice();
  for (const e of incoming) {
    const key = `${e.src}|${e.dst}|${e.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(e);
  }
  return next;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  sessionId: null,
  nodes: [],
  edges: [],
  seq: 0,
  truncated: false,
  loading: false,
  hydrated: false,

  selectedId: null,
  revealId: null,
  kindFilter: [],
  zoom: GRAPH_LIMITS.zoom.default,

  health: null,
  queryMatches: null,
  activeQueryId: null,
  queryTruncated: false,
  querying: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const g = api();
    if (!g) return;

    g.onChanged((push: WorkGraphPush) => {
      const state = get();
      // Ignore pushes for a session we are not showing.
      if (push.sessionId && push.sessionId !== state.sessionId) return;

      if (push.kind === 'reset') {
        set({ health: push.health ?? null });
        void get().load(state.sessionId);
        return;
      }
      // A sequence gap means we missed a delta — refetch rather than render a
      // graph with holes in it.
      if (push.seq !== state.seq + 1) {
        void get().load(state.sessionId);
        return;
      }
      // `removed` carries ids the retention ring deleted in main. Dropping them
      // here is what keeps the canvas from showing rows that no longer exist
      // until the next full refetch.
      const gone = push.removed && push.removed.length > 0 ? new Set(push.removed) : null;
      const baseNodes = gone ? state.nodes.filter((n) => !gone.has(n.id)) : state.nodes;
      const baseEdges = gone
        ? state.edges.filter((e) => !gone.has(e.src) && !gone.has(e.dst))
        : state.edges;
      set({
        seq: push.seq,
        nodes: applyNodes(baseNodes, push.nodes),
        edges: applyEdges(baseEdges, push.edges),
        health: push.health ?? null,
      });
    });

    // Follow the selected session, and load whatever is already selected.
    useSessionStore.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) void get().load(s.selectedId);
    });
    void get().load(useSessionStore.getState().selectedId);
  },

  load: async (sessionId) => {
    if (!sessionId) {
      set({
        sessionId: null,
        nodes: [],
        edges: [],
        seq: 0,
        truncated: false,
        selectedId: null,
        queryMatches: null,
        activeQueryId: null,
      });
      return;
    }
    const g = api();
    if (!g) {
      set({ sessionId });
      return;
    }
    set({ loading: true, sessionId });
    try {
      const snap = await g.get(sessionId);
      // Guard against an out-of-order resolve after another session was picked.
      if (get().sessionId !== sessionId) return;
      set({
        nodes: snap.nodes,
        edges: snap.edges,
        seq: snap.seq,
        truncated: snap.truncated,
        selectedId: null,
        queryMatches: null,
        activeQueryId: null,
        queryTruncated: false,
        health: snap.health ?? null,
      });
    } catch {
      set({ nodes: [], edges: [], seq: 0, truncated: false });
    } finally {
      set({ loading: false });
    }
  },

  select: (nodeId) => set({ selectedId: nodeId }),

  reveal: (nodeId) => set({ revealId: nodeId, selectedId: nodeId ?? get().selectedId }),

  /**
   * Reveal the node standing for an existing entity (a commit, a tool call, a
   * file). Resolved locally against the loaded graph — no IPC round trip — so
   * "view in graph" from another panel is instant.
   */
  revealByRef: (ref) => {
    const match = get().nodes.find((n) => n.ref?.kind === ref.kind && n.ref.id === ref.id);
    if (match) {
      set({ revealId: match.id, selectedId: match.id });
      return;
    }
    // Not in the loaded window — ask main, which resolves against the indexed
    // `(ref_kind, ref_id)` columns rather than only what this panel has loaded.
    const { sessionId } = get();
    const g = api();
    if (!sessionId || !g) return;
    void g
      .findByRef(sessionId, ref)
      .then((id) => {
        if (id && get().sessionId === sessionId) set({ revealId: id, selectedId: id });
      })
      .catch(() => {
        /* reveal is best-effort — never surface a failure for a navigation */
      });
  },

  toggleKind: (kind) => {
    const current = get().kindFilter;
    set({
      kindFilter: current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind],
    });
  },

  clearFilter: () => set({ kindFilter: [] }),

  runQuery: async (query, id) => {
    const { sessionId } = get();
    const g = api();
    if (!sessionId || !g) return;
    set({ querying: true, activeQueryId: id });
    try {
      const result = await g.query(sessionId, query);
      // Guard against an out-of-order resolve after the session changed.
      if (get().sessionId !== sessionId) return;
      set({
        queryMatches: new Set(result.nodes.map((n) => n.id)),
        queryTruncated: result.truncated,
      });
    } catch {
      set({ queryMatches: new Set(), queryTruncated: false });
    } finally {
      set({ querying: false });
    }
  },

  clearQuery: () =>
    set({ queryMatches: null, activeQueryId: null, queryTruncated: false }),

  exportGraph: async (format) => {
    const { sessionId } = get();
    const g = api();
    if (!sessionId || !g) return null;
    // Errors propagate: the caller reports the real reason (an over-cap export
    // has an actionable message), instead of a bare "export failed".
    return g.export(sessionId, format);
  },

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  // Both mutations reload rather than trusting the reset push to arrive. The
  // push is the fast path; this is the guarantee that the panel is never left
  // showing rows the main process has already deleted.
  prune: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    await api()?.prune(sessionId);
    await get().load(sessionId);
  },

  clear: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    await api()?.clear(sessionId);
    await get().load(sessionId);
  },
}));
