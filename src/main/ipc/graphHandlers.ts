/**
 * IPC handlers for the Work Graph. Registered through `handle()`, so every call
 * inherits sender-origin validation.
 *
 * The graph is PRODUCED in the main process from the normalized event stream —
 * the renderer never submits a node. This surface is therefore read +
 * maintenance only, and (like `resumeHandlers`) takes string ids only, so there
 * is no renderer-supplied object to guard against prototype pollution. The one
 * object surface, `graph:query`, arrives in a later phase and gets the
 * `memoryHandlers` treatment (safe-key guard + whitelisted reconstruction).
 *
 * `graph:clear` is destructive, so it is narrowed to a single explicit session
 * id: the renderer may drop the graph it is looking at, never every session's.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { GRAPH_LIMITS, SESSION_LIMITS, clamp } from '@shared/constants';
import type {
  WorkGraphEdge,
  WorkGraphEdgeKind,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphNodeStatus,
  WorkGraphQuery,
  WorkGraphQueryResult,
  WorkGraphRef,
  WorkGraphSnapshot,
} from '@shared/types';
import { handle } from './registry';
import type { GraphDataFormat } from '../managers/graph/exporters';
import type { WorkGraphManager } from '../managers/graph/WorkGraphManager';

function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > SESSION_LIMITS.idMax) {
    throw new Error('graph: invalid session id');
  }
}

/** Node ids are `wg_<uuid>` (39 chars); 128 is a generous, fixed upper bound. */
const NODE_ID_MAX = 128;

function assertNodeId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > NODE_ID_MAX) {
    throw new Error('graph: invalid node id');
  }
}

const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/** Reject a renderer object carrying a prototype-pollution key (CLAUDE.md §6). */
function assertSafeObject(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`graph: invalid ${label}`);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      throw new Error(`graph: rejected unsafe key in ${label}: ${key}`);
    }
  }
}

/**
 * Rebuild the query field by field from a whitelist — the renderer object is
 * never passed through. `depth` and `limit` are clamped here as well as in the
 * query engine: they bound a graph traversal, so an out-of-range value is a
 * main-process hang (a denial of service), not a cosmetic bug.
 */
function toQuery(raw: unknown): WorkGraphQuery {
  assertSafeObject(raw, 'query');
  const q = (raw ?? {}) as Record<string, unknown>;
  return {
    text: typeof q.text === 'string' ? q.text.slice(0, GRAPH_LIMITS.textMax) : undefined,
    // Sliced BEFORE filtering: filtering first walked (and structured-cloned)
    // the whole array, so a million-element `kinds` was a free main-process
    // stall even though only 16 entries could ever survive.
    kinds: Array.isArray(q.kinds)
      ? (q.kinds.slice(0, 16).filter(isNodeKind) as WorkGraphQuery['kinds'])
      : undefined,
    edgeKinds: Array.isArray(q.edgeKinds)
      ? (q.edgeKinds.slice(0, 9).filter(isEdgeKind) as WorkGraphQuery['edgeKinds'])
      : undefined,
    statuses: Array.isArray(q.statuses)
      ? (q.statuses.slice(0, 8).filter(isNodeStatus) as WorkGraphQuery['statuses'])
      : undefined,
    since: typeof q.since === 'number' && Number.isFinite(q.since) ? q.since : undefined,
    until: typeof q.until === 'number' && Number.isFinite(q.until) ? q.until : undefined,
    direction: q.direction === 'up' ? 'up' : 'down',
    fromNodeId:
      typeof q.fromNodeId === 'string' && q.fromNodeId.length > 0 && q.fromNodeId.length <= NODE_ID_MAX
        ? q.fromNodeId
        : undefined,
    includeDerived: q.includeDerived !== false,
    depth: Math.round(
      clamp(numberOr(q.depth, GRAPH_LIMITS.maxDepth.default), GRAPH_LIMITS.maxDepth.min, GRAPH_LIMITS.maxDepth.max),
    ),
    limit: Math.round(
      clamp(
        numberOr(q.limit, GRAPH_LIMITS.queryLimit.default),
        GRAPH_LIMITS.queryLimit.min,
        GRAPH_LIMITS.queryLimit.max,
      ),
    ),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const NODE_KINDS: readonly string[] = [
  'objective', 'planning', 'task', 'subagent', 'investigation', 'search', 'memory',
  'mcp', 'terminal', 'git', 'file', 'approval', 'artifact', 'completion', 'service',
];

const EDGE_KINDS: readonly string[] = [
  'follows', 'contains', 'generated', 'depends-on', 'implemented-in',
  'verified-by', 'blocked-by', 'reviewed-by', 'produced-artifact',
];

function isNodeKind(v: unknown): v is WorkGraphNodeKind {
  return typeof v === 'string' && NODE_KINDS.includes(v);
}

function isEdgeKind(v: unknown): v is WorkGraphEdgeKind {
  return typeof v === 'string' && EDGE_KINDS.includes(v);
}

const NODE_STATUSES: readonly string[] = ['running', 'done', 'error', 'denied', 'skipped'];

function isNodeStatus(v: unknown): v is WorkGraphNodeStatus {
  return typeof v === 'string' && NODE_STATUSES.includes(v);
}

/** Formats main can render itself, plus the two the renderer hands back. */
const DATA_FORMATS: readonly string[] = ['json', 'md', 'mermaid', 'dot', 'csv', 'html'];
const IMAGE_FORMATS: readonly string[] = ['svg', 'png'];

function assertDataFormat(v: unknown): asserts v is GraphDataFormat {
  if (typeof v !== 'string' || !DATA_FORMATS.includes(v)) {
    throw new Error('graph: unsupported export format');
  }
}

/** Ref kinds accepted for reveal-in-graph lookups. */
const REF_KINDS: readonly string[] = [
  'message', 'tool', 'terminal', 'memory', 'checkpoint', 'file', 'commit', 'plan',
  'service', 'mcp', 'worktree', 'attachment',
];

/** Rebuild the ref field by field; the renderer object is never passed through. */
function toRef(raw: unknown): WorkGraphRef {
  assertSafeObject(raw, 'ref');
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !REF_KINDS.includes(r.kind)) {
    throw new Error('graph: invalid ref kind');
  }
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > NODE_ID_MAX) {
    throw new Error('graph: invalid ref id');
  }
  return { kind: r.kind as WorkGraphRef['kind'], id: r.id };
}

export function registerGraphHandlers(graph: WorkGraphManager): void {
  handle(IpcChannels.graphGet, (_e, sessionId: unknown): WorkGraphSnapshot => {
    assertSessionId(sessionId);
    return graph.getSnapshot(sessionId);
  });

  handle(
    IpcChannels.graphNodeDetail,
    (
      _e,
      sessionId: unknown,
      nodeId: unknown,
    ): { node: WorkGraphNode; edges: WorkGraphEdge[] } | null => {
      assertSessionId(sessionId);
      assertNodeId(nodeId);
      return graph.getNodeDetail(sessionId, nodeId);
    },
  );

  handle(
    IpcChannels.graphQuery,
    (_e, sessionId: unknown, raw: unknown): WorkGraphQueryResult => {
      assertSessionId(sessionId);
      return graph.query(sessionId, toQuery(raw));
    },
  );

  handle(IpcChannels.graphExport, (_e, sessionId: unknown, format: unknown): string => {
    assertSessionId(sessionId);
    // SVG/PNG are produced in the renderer from the SVG it already drew; only
    // the data formats cross this boundary. The result is size-capped in the
    // manager — an unbounded string here is a structured-clone of the graph.
    assertDataFormat(format);
    return graph.export(sessionId, format);
  });

  /**
   * Save an export to disk. The renderer supplies a session id, a format, and
   * (for the two image formats only) the bytes it rendered — never a path. Main
   * opens the save dialog and writes wherever the USER chose, so this handler
   * has no path to validate and no traversal surface to defend.
   */
  handle(
    IpcChannels.graphSave,
    async (
      _e,
      sessionId: unknown,
      format: unknown,
      content: unknown,
    ): Promise<{ saved: boolean; path?: string }> => {
      assertSessionId(sessionId);
      if (typeof format !== 'string' || ![...DATA_FORMATS, ...IMAGE_FORMATS].includes(format)) {
        throw new Error('graph: unsupported export format');
      }
      const isImage = IMAGE_FORMATS.includes(format);
      if (isImage && (typeof content !== 'string' || content.length === 0)) {
        throw new Error('graph: no image content to save');
      }
      return graph.save(
        sessionId,
        format as GraphDataFormat | 'svg' | 'png',
        isImage ? (content as string) : undefined,
      );
    },
  );

  handle(
    IpcChannels.graphFindByRef,
    (_e, sessionId: unknown, ref: unknown): string | null => {
      assertSessionId(sessionId);
      return graph.findByRef(sessionId, toRef(ref));
    },
  );

  handle(IpcChannels.graphPrune, (_e, sessionId: unknown): number => {
    assertSessionId(sessionId);
    return graph.prune(sessionId);
  });

  handle(IpcChannels.graphClear, (_e, sessionId: unknown): void => {
    // Deliberately NOT optional: clearing every session is a maintenance
    // operation, not something a renderer call should be able to trigger.
    assertSessionId(sessionId);
    graph.clear(sessionId);
  });
}
