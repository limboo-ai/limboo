/**
 * Work Graph structural search.
 *
 * The questions this subsystem exists to answer — "every task blocked by
 * authentication", "all MCP calls that touched GitHub", "commits created after
 * a failed command" — are TRAVERSALS with a text predicate, and neither half
 * answers them alone. So a query runs in two stages:
 *
 *   1. SEED — FTS5 BM25 over node title+detail (plus optional kind filters)
 *      picks the nodes that match the text predicate directly.
 *   2. CLOSURE — a bounded `WITH RECURSIVE` walk over `work_graph_edges`
 *      expands those seeds into the surrounding subgraph.
 *
 * SAFETY. `depth` and `limit` are clamped by the IPC layer AND re-clamped here:
 * an unbounded recursive CTE over a large graph is a renderer-triggerable
 * main-process hang, which is a denial of service, not a performance bug. Every
 * statement is parameterized; the only text ever spliced into SQL is a run of
 * `?` placeholders built from an array's length.
 */
import { GRAPH_LIMITS, clamp } from '@shared/constants';
import type {
  WorkGraphEdge,
  WorkGraphNode,
  WorkGraphQuery,
  WorkGraphQueryResult,
} from '@shared/types';
import { getDb } from '../../db/database';
import { logger } from '../../logger';

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

/**
 * Turn free text into an FTS5 MATCH expression.
 *
 * FTS5 has its own query syntax (`AND`, `NEAR`, `"`, `*`, `^`, `:`), and a raw
 * user string can both throw a syntax error and reach operators we never
 * intended to expose. So the input is reduced to bare alphanumeric terms and
 * re-joined with an explicit AND, then prefix-matched on the last term for
 * as-you-type behavior.
 */
function toMatchExpression(text: string): string | null {
  const terms = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return null;
  const quoted = terms.map((t) => `"${t}"`);
  // Prefix-match the final term so partial words match while typing.
  quoted[quoted.length - 1] = `"${terms[terms.length - 1]}"*`;
  return quoted.join(' AND ');
}

export class WorkGraphQueryEngine {
  /**
   * Run a structural query. Never throws — a malformed FTS expression or a
   * missing table yields an empty result rather than breaking the panel.
   */
  run(sessionId: string, q: WorkGraphQuery): WorkGraphQueryResult {
    const depth = clamp(q.depth, GRAPH_LIMITS.maxDepth.min, GRAPH_LIMITS.maxDepth.max);
    const limit = clamp(q.limit, GRAPH_LIMITS.queryLimit.min, GRAPH_LIMITS.queryLimit.max);

    try {
      const seeds = this.seedIds(sessionId, q, limit);
      if (seeds.length === 0) {
        return { nodes: [], edges: [], seeds: [], truncated: false };
      }

      const reached = this.closure(sessionId, seeds, q, depth, limit);
      const nodes = this.loadNodes(sessionId, reached.ids);
      const edges = this.loadEdges(sessionId, reached.ids, q);

      return {
        nodes,
        edges,
        seeds,
        // Either the traversal was cut, or the seed query itself filled its
        // budget and there are matches this result does not contain.
        truncated: reached.truncated || seeds.length >= limit,
      };
    } catch (err) {
      logger.warn('work graph query failed', err);
      return { nodes: [], edges: [], seeds: [], truncated: false };
    }
  }

  /* ------------------------------------------------------------------ */

  /** Stage 1: the nodes matching the predicate directly. */
  private seedIds(sessionId: string, q: WorkGraphQuery, limit: number): string[] {
    const db = getDb();

    // An explicit start node bypasses the text predicate entirely — this is the
    // "show me everything around THIS node" path the inspector uses.
    if (q.fromNodeId) {
      const row = db
        .prepare('SELECT id FROM work_graph_nodes WHERE session_id = ? AND id = ?')
        .get(sessionId, q.fromNodeId) as { id: string } | undefined;
      return row ? [row.id] : [];
    }

    const kinds = q.kinds ?? [];
    const statuses = q.statuses ?? [];
    const match = q.text ? toMatchExpression(q.text) : null;

    // Structural predicates shared by both seed paths. Every fragment below is
    // built from array LENGTHS and literal column names; all values are bound.
    const filters: string[] = [];
    const params: unknown[] = [];
    if (kinds.length > 0) {
      filters.push(`n.kind IN (${placeholders(kinds.length)})`);
      params.push(...kinds);
    }
    if (statuses.length > 0) {
      filters.push(`n.status IN (${placeholders(statuses.length)})`);
      params.push(...statuses);
    }
    if (typeof q.since === 'number') {
      filters.push('n.started_at >= ?');
      params.push(q.since);
    }
    if (typeof q.until === 'number') {
      filters.push('n.started_at <= ?');
      params.push(q.until);
    }
    const where = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

    if (match) {
      const rows = db
        .prepare(
          `SELECT n.id AS id
             FROM work_graph_nodes_fts f
             JOIN work_graph_nodes n ON n.rowid = f.rowid
            WHERE work_graph_nodes_fts MATCH ?
              AND n.session_id = ?${where}
            ORDER BY bm25(work_graph_nodes_fts) ASC
            LIMIT ?`,
        )
        .all(match, sessionId, ...params, limit) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }

    // No text predicate: the structural filters alone are the seed set. An
    // entirely empty query now returns the newest slice of the graph rather
    // than nothing — "show me recent work" is a legitimate question.
    const rows = db
      .prepare(
        `SELECT n.id AS id FROM work_graph_nodes n
          WHERE n.session_id = ?${where}
          ORDER BY n.seq DESC LIMIT ?`,
      )
      .all(sessionId, ...params, limit) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * Stage 2: the bounded transitive closure from the seeds.
   *
   * Written as an explicit breadth-first loop of bounded statements rather than
   * one `WITH RECURSIVE`, deliberately: each hop is individually LIMIT-ed and
   * the total is capped, so there is no shape of graph — including one with a
   * cycle that slipped past the builder — that can make this run unbounded.
   */
  private closure(
    sessionId: string,
    seeds: string[],
    q: WorkGraphQuery,
    depth: number,
    limit: number,
  ): { ids: string[]; truncated: boolean } {
    const db = getDb();
    const edgeKinds = q.edgeKinds ?? [];
    const derivedClause = q.includeDerived ? '' : ' AND derived = 0';
    const kindClause =
      edgeKinds.length > 0 ? ` AND kind IN (${placeholders(edgeKinds.length)})` : '';

    // `down` walks src -> dst (what this work led to); `up` walks dst -> src
    // (what led to this work).
    const from = q.direction === 'up' ? 'dst' : 'src';
    const to = q.direction === 'up' ? 'src' : 'dst';

    const seen = new Set<string>(seeds);
    let frontier = seeds;
    let truncated = false;

    for (let d = 0; d < depth && frontier.length > 0 && seen.size < limit; d += 1) {
      const stmt = db.prepare(
        `SELECT DISTINCT ${to} AS next FROM work_graph_edges
          WHERE session_id = ?
            AND ${from} IN (${placeholders(frontier.length)})${kindClause}${derivedClause}
          LIMIT ?`,
      );
      const rows = stmt.all(sessionId, ...frontier, ...edgeKinds, limit) as Array<{
        next: string;
      }>;
      const next: string[] = [];
      for (const r of rows) {
        if (seen.has(r.next)) continue;
        // Record the cut explicitly rather than inferring it afterwards from
        // `reached.length >= limit`, which reported truncation whenever the
        // seed set alone happened to fill the budget.
        if (seen.size >= limit) {
          truncated = true;
          break;
        }
        seen.add(r.next);
        next.push(r.next);
      }
      // Still expanding when the depth budget ran out: there was more to reach.
      if (next.length > 0 && d === depth - 1) truncated = true;
      frontier = next;
    }

    return { ids: [...seen], truncated };
  }

  private loadNodes(sessionId: string, ids: string[]): WorkGraphNode[] {
    if (ids.length === 0) return [];
    const rows = getDb()
      .prepare(
        `SELECT payload FROM work_graph_nodes
          WHERE session_id = ? AND id IN (${placeholders(ids.length)})
          ORDER BY seq ASC`,
      )
      .all(sessionId, ...ids) as Array<{ payload: string }>;
    const out: WorkGraphNode[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload) as WorkGraphNode);
      } catch {
        /* skip corrupt row */
      }
    }
    return out;
  }

  /** Every edge whose BOTH endpoints are in the result subgraph. */
  private loadEdges(sessionId: string, ids: string[], q: WorkGraphQuery): WorkGraphEdge[] {
    if (ids.length === 0) return [];
    const ph = placeholders(ids.length);
    const derivedClause = q.includeDerived ? '' : ' AND derived = 0';
    const rows = getDb()
      .prepare(
        `SELECT * FROM work_graph_edges
          WHERE session_id = ?
            AND src IN (${ph}) AND dst IN (${ph})${derivedClause}
          ORDER BY created_at ASC`,
      )
      .all(sessionId, ...ids, ...ids) as EdgeRow[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      src: r.src,
      dst: r.dst,
      kind: r.kind as WorkGraphEdge['kind'],
      derived: r.derived === 1,
      createdAt: r.created_at,
    }));
  }
}
