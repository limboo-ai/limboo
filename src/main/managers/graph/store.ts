/**
 * Work Graph persistence. Prepared, parameterized statements ONLY — no string
 * interpolation anywhere in this file (CLAUDE.md §6). The one place a value is
 * spliced into SQL text is the `IN (?,?,?)` placeholder run, and that builds
 * only `?` characters from an array length, never caller data.
 *
 * Every write is bounded: the ring cap runs after each flush, so a runaway run
 * cannot grow the table without limit even if the manager's own caps fail.
 */
import { GRAPH_LIMITS } from '@shared/constants';
import type {
  WorkGraphEdge,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphRef,
  WorkGraphSnapshot,
} from '@shared/types';
import { getDb } from '../../db/database';
import { logger } from '../../logger';
import { redactDeep } from './redact';

/** Shape of a persisted node row. */
interface NodeRow {
  payload: string;
  seq: number;
}

/**
 * What one flush actually did. The manager needs all three: `removed` feeds
 * `WorkGraphPush.removed` so the renderer drops ring-pruned nodes instead of
 * showing them forever, and `error` feeds the health banner — a graph that has
 * silently stopped recording used to be indistinguishable from a quiet session.
 */
export interface WorkGraphWriteResult {
  ok: boolean;
  /** Node ids the ring cap deleted during this flush. */
  removed: string[];
  /** Edges skipped because an endpoint does not exist (see `write`). */
  droppedEdges: number;
  error?: string;
}

/**
 * Node kinds that are legitimately standalone.
 *
 * A PTY opened outside a run, a commit made with no active run, or a service
 * started before the first prompt genuinely has no spine edge — they are not
 * the wreckage of an interrupted run, which is the only thing orphan pruning
 * is meant to collect. Deleting them was silent data loss.
 */
const STANDALONE_KINDS = ['terminal', 'git', 'service'];

/** Shape of a persisted edge row. */
interface EdgeRow {
  id: string;
  session_id: string;
  src: string;
  dst: string;
  kind: string;
  derived: number;
  created_at: number;
}

/** Build a `?,?,?` placeholder list. Only `?` characters — never caller data. */
function placeholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

export class WorkGraphStore {
  /**
   * Upsert nodes and insert edges in ONE transaction, then ring-prune. Edges go
   * last so an edge can never reference a node that is not yet committed, and
   * `INSERT OR IGNORE` on the unique (src,dst,kind) index makes re-sending an
   * edge idempotent — the builder is allowed to be liberal.
   *
   * Two invariants earn their comments here, because violating either used to
   * lose an entire flush behind a `logger.warn`:
   *
   *  1. **Every node in the batch is written.** An oversized payload is shrunk
   *     (meta first, then detail) rather than skipped. Skipping stranded the
   *     node's edges, and `INSERT OR IGNORE` does NOT suppress FOREIGN KEY
   *     violations — the failing edge aborted the transaction and took every
   *     other node and edge in the batch with it.
   *  2. **Every edge's endpoints are proven to exist** before it is inserted.
   *     The same abort fires whenever an endpoint was never persisted at all:
   *     `persist` flipping false→true mid-run, or the ring cap having already
   *     pruned the endpoint out from under a late-arriving derived edge.
   */
  write(
    sessionId: string,
    nodes: WorkGraphNode[],
    edges: WorkGraphEdge[],
    ringCap: number,
  ): WorkGraphWriteResult {
    if (nodes.length === 0 && edges.length === 0) {
      return { ok: true, removed: [], droppedEdges: 0 };
    }
    try {
      const db = getDb();
      const upsertNode = db.prepare(
        `INSERT INTO work_graph_nodes
           (id, session_id, workspace_id, run_id, kind, provider, status, title, detail,
            ref_kind, ref_id, seq, started_at, ended_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           title = excluded.title,
           detail = excluded.detail,
           ended_at = excluded.ended_at,
           payload = excluded.payload`,
      );
      const insertEdge = db.prepare(
        `INSERT OR IGNORE INTO work_graph_edges
           (id, session_id, src, dst, kind, derived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      const nodeExists = db.prepare('SELECT 1 AS hit FROM work_graph_nodes WHERE id = ?');

      // Endpoints proven present, either by this batch or by an earlier one.
      // Memoized because a fan-out edge set asks about the same node repeatedly.
      const known = new Set<string>();
      const missing = new Set<string>();
      const endpointReady = (id: string): boolean => {
        if (known.has(id)) return true;
        if (missing.has(id)) return false;
        const hit = (nodeExists.get(id) as { hit: number } | undefined) !== undefined;
        (hit ? known : missing).add(id);
        return hit;
      };

      let droppedEdges = 0;
      const run = db.transaction(() => {
        for (const n of nodes) {
          const { node, payload } = serializeNode(n);
          upsertNode.run(
            node.id,
            node.sessionId,
            node.workspaceId,
            node.runId,
            node.kind,
            node.provider,
            node.status,
            node.title,
            node.detail ?? '',
            node.ref?.kind ?? null,
            node.ref?.id ?? null,
            node.seq,
            node.startedAt,
            node.endedAt ?? null,
            payload,
          );
          known.add(node.id);
          missing.delete(node.id);
        }
        for (const e of edges) {
          if (!endpointReady(e.src) || !endpointReady(e.dst)) {
            droppedEdges += 1;
            continue;
          }
          insertEdge.run(e.id, e.sessionId, e.src, e.dst, e.kind, e.derived ? 1 : 0, e.createdAt);
        }
      });
      run();
      const removed = this.pruneRing(sessionId, ringCap);
      return { ok: true, removed, droppedEdges };
    } catch (err) {
      logger.warn('work graph persist failed', err);
      return {
        ok: false,
        removed: [],
        droppedEdges: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * A session's whole graph, oldest first. `truncated` tells the panel the ring
   * cap has trimmed history, so it can say so instead of implying completeness.
   */
  snapshot(sessionId: string, maxNodes: number): Omit<WorkGraphSnapshot, 'seq'> {
    try {
      const db = getDb();
      const total = (
        db
          .prepare('SELECT count(*) AS n FROM work_graph_nodes WHERE session_id = ?')
          .get(sessionId) as { n: number } | undefined
      )?.n ?? 0;

      // Take the NEWEST `maxNodes` (a truncated graph should show recent work),
      // then re-sort ascending so the layouter receives chronological order.
      const rows = db
        .prepare(
          `SELECT payload, seq FROM work_graph_nodes
            WHERE session_id = ? ORDER BY seq DESC LIMIT ?`,
        )
        .all(sessionId, maxNodes) as NodeRow[];

      const nodes: WorkGraphNode[] = [];
      for (const r of rows.reverse()) {
        try {
          nodes.push(JSON.parse(r.payload) as WorkGraphNode);
        } catch {
          /* skip corrupt row — never let one bad payload blank the panel */
        }
      }

      // History is incomplete in TWO independent ways, and the panel must say so
      // in both: the snapshot window cut rows off the table, OR the ring cap
      // already deleted the beginning of the session (so even a full read starts
      // mid-history). `seq` is monotonic from 0, so a non-zero minimum is an
      // exact, index-backed signal that the earliest work is gone.
      const minSeq = (
        db
          .prepare('SELECT min(seq) AS s FROM work_graph_nodes WHERE session_id = ?')
          .get(sessionId) as { s: number | null } | undefined
      )?.s;
      const pruned = typeof minSeq === 'number' && minSeq > 0;

      const ids = new Set(nodes.map((n) => n.id));
      // Bounded: an unbounded `SELECT *` pulled a long session's whole edge
      // table into the main process on every panel open. Newest first so the
      // cap trims ancient edges rather than recent ones, then re-sorted.
      const edgeRows = (
        db
          .prepare(
            `SELECT * FROM work_graph_edges WHERE session_id = ?
              ORDER BY created_at DESC LIMIT ?`,
          )
          .all(sessionId, GRAPH_LIMITS.edgeReadMax) as EdgeRow[]
      ).reverse();
      // Only edges whose BOTH endpoints survived the window; a dangling edge
      // would make the layouter drop it anyway, so filter here and stay honest.
      const edges = edgeRows
        .filter((e) => ids.has(e.src) && ids.has(e.dst))
        .map(toEdge);

      return { sessionId, nodes, edges, truncated: total > nodes.length || pruned };
    } catch (err) {
      logger.warn('work graph snapshot failed', err);
      return { sessionId, nodes: [], edges: [], truncated: false };
    }
  }

  /** One node's full payload, for the inspector. */
  node(sessionId: string, nodeId: string): WorkGraphNode | null {
    try {
      const row = getDb()
        .prepare('SELECT payload FROM work_graph_nodes WHERE session_id = ? AND id = ?')
        .get(sessionId, nodeId) as { payload: string } | undefined;
      return row ? (JSON.parse(row.payload) as WorkGraphNode) : null;
    } catch {
      return null;
    }
  }

  /** Every edge touching a node, for the inspector's relationship list. */
  edgesFor(sessionId: string, nodeId: string): WorkGraphEdge[] {
    try {
      const rows = getDb()
        .prepare(
          `SELECT * FROM work_graph_edges
            WHERE session_id = ? AND (src = ? OR dst = ?)
            ORDER BY created_at ASC
            LIMIT ?`,
        )
        .all(sessionId, nodeId, nodeId, GRAPH_LIMITS.edgeReadMax) as EdgeRow[];
      return rows.map(toEdge);
    } catch {
      return [];
    }
  }

  /** Resolve a {@link WorkGraphRef} to a node id — the reveal-in-graph lookup. */
  findByRef(sessionId: string, ref: WorkGraphRef): string | null {
    try {
      const row = getDb()
        .prepare(
          `SELECT id FROM work_graph_nodes
            WHERE session_id = ? AND ref_kind = ? AND ref_id = ?
            ORDER BY seq DESC LIMIT 1`,
        )
        .get(sessionId, ref.kind, ref.id) as { id: string } | undefined;
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  /** Count nodes of the given kinds — drives the rail badge. */
  countByKind(sessionId: string, kinds: WorkGraphNodeKind[]): number {
    if (kinds.length === 0) return 0;
    try {
      const row = getDb()
        .prepare(
          `SELECT count(*) AS n FROM work_graph_nodes
            WHERE session_id = ? AND kind IN (${placeholders(kinds.length)})`,
        )
        .get(sessionId, ...kinds) as { n: number } | undefined;
      return row?.n ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Ring-cap a session's nodes (the HookEngine.persist idiom). Edges cascade
   * via the FK, so pruning a node can never leave a dangling edge behind.
   *
   * Returns the deleted ids so the manager can tell the renderer to drop them:
   * a pruned node used to vanish from SQLite while staying on the canvas until
   * the next full refetch.
   */
  pruneRing(sessionId: string, cap: number): string[] {
    try {
      const db = getDb();
      const doomed = `SELECT id FROM work_graph_nodes
            WHERE session_id = ?
              AND id NOT IN (
                SELECT id FROM work_graph_nodes
                 WHERE session_id = ?
                 ORDER BY seq DESC
                 LIMIT ?
              )`;
      const ids = (db.prepare(doomed).all(sessionId, sessionId, cap) as { id: string }[]).map(
        (r) => r.id,
      );
      if (ids.length === 0) return [];
      db.prepare(`DELETE FROM work_graph_nodes WHERE id IN (${placeholders(ids.length)})`).run(
        ...ids,
      );
      return ids;
    } catch (err) {
      logger.warn('work graph ring prune failed', err);
      return [];
    }
  }

  /** Sweep nodes older than `days` across all sessions. 0 = keep forever. */
  pruneAge(days: number): number {
    if (days <= 0) return 0;
    try {
      const cutoff = Date.now() - days * 86_400_000;
      const info = getDb()
        .prepare('DELETE FROM work_graph_nodes WHERE started_at < ?')
        .run(cutoff);
      return info.changes;
    } catch (err) {
      logger.warn('work graph age sweep failed', err);
      return 0;
    }
  }

  /**
   * Drop nodes left unattached by an interrupted run: no spine edge in either
   * direction and not a run root. This is exactly the shape a run killed
   * between tool-start and tool-end leaves behind.
   *
   * {@link STANDALONE_KINDS} is exempt. Those kinds record work that happens
   * outside a run by design — a PTY the user opened, a commit made with no
   * agent active — so "has no edge" is their normal state, not damage.
   */
  pruneOrphans(sessionId: string): number {
    try {
      const info = getDb()
        .prepare(
          `DELETE FROM work_graph_nodes
            WHERE session_id = ?
              AND kind != 'objective'
              AND kind NOT IN (${placeholders(STANDALONE_KINDS.length)})
              AND id NOT IN (SELECT dst FROM work_graph_edges WHERE session_id = ?)
              AND id NOT IN (SELECT src FROM work_graph_edges WHERE session_id = ?)`,
        )
        .run(sessionId, ...STANDALONE_KINDS, sessionId, sessionId);
      return info.changes;
    } catch (err) {
      logger.warn('work graph orphan prune failed', err);
      return 0;
    }
  }

  /** Delete one session's graph, or every session's when omitted. */
  clear(sessionId?: string): void {
    try {
      const db = getDb();
      // Edges first, explicitly — correct even if `foreign_keys` is ever off.
      if (sessionId) {
        db.prepare('DELETE FROM work_graph_edges WHERE session_id = ?').run(sessionId);
        db.prepare('DELETE FROM work_graph_nodes WHERE session_id = ?').run(sessionId);
      } else {
        db.prepare('DELETE FROM work_graph_edges').run();
        db.prepare('DELETE FROM work_graph_nodes').run();
      }
    } catch (err) {
      logger.warn('work graph clear failed', err);
    }
  }

  /** The highest `seq` persisted for a session — the builder resumes from here. */
  maxSeq(sessionId: string): number {
    try {
      const row = getDb()
        .prepare('SELECT max(seq) AS s FROM work_graph_nodes WHERE session_id = ?')
        .get(sessionId) as { s: number | null } | undefined;
      return (row?.s ?? -1) + 1;
    } catch {
      return 0;
    }
  }
}

/**
 * Redact a node's `meta` and shrink it until the payload fits.
 *
 * `meta` is the only unbounded part of a node — title and detail are already
 * clamped by the builder — so it sheds first, and the node itself ALWAYS
 * survives. Redaction happens here, on the single path every node takes to
 * SQLite and (via the same object) to the renderer, so a future sink that puts
 * a raw string into a new `meta` field is covered without opting in.
 */
function serializeNode(n: WorkGraphNode): { node: WorkGraphNode; payload: string } {
  const safe = { ...n, meta: redactDeep(n.meta) } as WorkGraphNode;
  let payload = JSON.stringify(safe);
  if (payload.length <= GRAPH_LIMITS.payloadMax) return { node: safe, payload };

  // Step 1: collapse meta to its scalar fields. Arrays and long strings are
  // what blow the budget (a wide `files` list, a pasted command), and the
  // scalars are what the inspector and the queries actually read.
  const lean = { ...safe, meta: scalarsOnly(safe.meta) } as WorkGraphNode;
  payload = JSON.stringify(lean);
  if (payload.length <= GRAPH_LIMITS.payloadMax) return { node: lean, payload };

  // Step 2: drop the detail line. A node with title + kind + refs is still a
  // usable, queryable, connectable row; a missing node is a lost subgraph.
  const bare = { ...lean, detail: '' } as WorkGraphNode;
  return { node: bare, payload: JSON.stringify(bare) };
}

/** Keep only primitive `meta` fields — never re-serialize an unbounded value. */
function scalarsOnly(meta: unknown): unknown {
  if (meta === null || typeof meta !== 'object') return meta;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (value === null) continue;
    const t = typeof value;
    if (t === 'number' || t === 'boolean') out[key] = value;
    else if (t === 'string') out[key] = (value as string).slice(0, 200);
  }
  return out;
}

function toEdge(r: EdgeRow): WorkGraphEdge {
  return {
    id: r.id,
    sessionId: r.session_id,
    src: r.src,
    dst: r.dst,
    kind: r.kind as WorkGraphEdge['kind'],
    derived: r.derived === 1,
    createdAt: r.created_at,
  };
}
