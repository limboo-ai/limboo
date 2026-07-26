/**
 * View-model transforms applied to the raw work-graph node set before layout.
 *
 * These implement the graph settings that shape WHAT is drawn, as opposed to how
 * it looks: checkpoint inclusion, subagent grouping, completed-branch collapsing,
 * and the compact layout's run-merging. Keeping them here (pure, testable, no
 * React) rather than inline in the panel means the outline view and the canvas
 * necessarily agree on which nodes exist.
 *
 * The ordering rule that matters: filters run BEFORE the layout input is built,
 * collapse groups run after — a collapsed group still occupies exactly one row,
 * so lanes beneath it never re-flow when a group is expanded.
 */
import type { WorkGraphEdge, WorkGraphNode, WorkGraphNodeKind } from '@shared/types';

/** Node kinds that are read-only observations — safe to merge in compact mode. */
const READ_ONLY_KINDS: ReadonlySet<WorkGraphNodeKind> = new Set([
  'investigation',
  'search',
  'memory',
]);

export interface GraphViewOptions {
  /** Render git checkpoints alongside commits (`graph.checkpointIntegration`). */
  checkpointIntegration: boolean;
  /** Fold a subagent's children into the subagent node (`graph.groupSubagents`). */
  groupSubagents: boolean;
  /** Collapse branches whose every node completed (`graph.autoCollapseCompleted`). */
  autoCollapseCompleted: boolean;
  /** `compact` merges consecutive read-only siblings (`graph.layoutAlgorithm`). */
  layoutAlgorithm: 'lanes' | 'compact';
  /** Groups the user has manually expanded, overriding the two collapse rules. */
  expandedGroups: ReadonlySet<string>;
}

export interface GraphView {
  /** Nodes to lay out and draw. */
  nodes: WorkGraphNode[];
  /**
   * For a node that stands in for others: how many it represents. Drives the
   * "+N" affordance, and its presence is what makes a node expandable.
   */
  groupCounts: Map<string, number>;
  /** How many nodes the transforms removed, for the panel's honesty line. */
  hiddenCount: number;
}

/**
 * Apply the shape settings to a node set.
 *
 * Every rule here only ever HIDES nodes behind a node that is still drawn, so
 * the result is never a graph with a hole in it: a collapsed subagent still
 * shows the subagent, a merged read-only run still shows its first node.
 */
export function buildGraphView(
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  opts: GraphViewOptions,
): GraphView {
  const before = nodes.length;
  let out = nodes;

  // 1. Checkpoints are git nodes carrying a checkpoint ref. When the setting is
  //    off they are dropped entirely — commits remain.
  if (!opts.checkpointIntegration) {
    out = out.filter((n) => !(n.kind === 'git' && n.ref?.kind === 'checkpoint'));
  }

  const groupCounts = new Map<string, number>();
  const hidden = new Set<string>();

  // 2. Subagent grouping — ride the `contains` spine the ingestion layer already
  //    records from the SDK's `parent_tool_use_id`. No new inference.
  if (opts.groupSubagents) {
    const childrenOf = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.kind !== 'contains') continue;
      const list = childrenOf.get(edge.src);
      if (list) list.push(edge.dst);
      else childrenOf.set(edge.src, [edge.dst]);
    }
    for (const node of out) {
      if (node.kind !== 'subagent' || opts.expandedGroups.has(node.id)) continue;
      const descendants = collectDescendants(node.id, childrenOf);
      if (descendants.size === 0) continue;
      for (const id of descendants) hidden.add(id);
      groupCounts.set(node.id, descendants.size);
    }
  }

  // 3. Collapse fully-completed branches, same mechanism, different predicate.
  if (opts.autoCollapseCompleted) {
    const childrenOf = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.kind !== 'contains') continue;
      const list = childrenOf.get(edge.src);
      if (list) list.push(edge.dst);
      else childrenOf.set(edge.src, [edge.dst]);
    }
    const byId = new Map(out.map((n) => [n.id, n]));
    for (const node of out) {
      if (hidden.has(node.id) || opts.expandedGroups.has(node.id)) continue;
      const descendants = collectDescendants(node.id, childrenOf);
      if (descendants.size === 0) continue;
      const allDone = [...descendants].every((id) => {
        const child = byId.get(id);
        return !child || child.status === 'done' || child.status === 'skipped';
      });
      if (!allDone || node.status === 'running') continue;
      for (const id of descendants) hidden.add(id);
      groupCounts.set(node.id, (groupCounts.get(node.id) ?? 0) + descendants.size);
    }
  }

  if (hidden.size) out = out.filter((n) => !hidden.has(n.id));

  // 4. Compact layout — merge each run of consecutive read-only nodes of the
  //    same kind into its first node. This is a presentation merge only: the
  //    underlying nodes are untouched and one expand restores them.
  if (opts.layoutAlgorithm === 'compact') {
    const merged: WorkGraphNode[] = [];
    let anchor: WorkGraphNode | null = null;
    for (const node of out) {
      const mergeable =
        anchor !== null &&
        READ_ONLY_KINDS.has(node.kind) &&
        node.kind === anchor.kind &&
        node.runId === anchor.runId &&
        !opts.expandedGroups.has(anchor.id);
      if (mergeable && anchor) {
        groupCounts.set(anchor.id, (groupCounts.get(anchor.id) ?? 0) + 1);
        continue;
      }
      merged.push(node);
      anchor = READ_ONLY_KINDS.has(node.kind) ? node : null;
    }
    out = merged;
  }

  return { nodes: out, groupCounts, hiddenCount: Math.max(0, before - out.length) };
}

/** All transitive `contains` descendants of `id` (cycle-safe). */
function collectDescendants(id: string, childrenOf: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop();
    if (next === undefined || next === id || seen.has(next)) continue;
    seen.add(next);
    for (const child of childrenOf.get(next) ?? []) stack.push(child);
  }
  return seen;
}

export interface OutlineGroup {
  id: string;
  label: string;
  nodes: WorkGraphNode[];
}

/**
 * Group nodes for the Outline view (`graph.outlineGroupBy`). `none` returns a
 * single unlabeled group so the caller renders a flat list.
 */
export function buildOutline(
  nodes: WorkGraphNode[],
  groupBy: 'none' | 'kind' | 'tool' | 'file',
): OutlineGroup[] {
  if (groupBy === 'none') return [{ id: 'all', label: '', nodes }];

  const buckets = new Map<string, WorkGraphNode[]>();
  for (const node of nodes) {
    const key = outlineKey(node, groupBy);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(node);
    else buckets.set(key, [node]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, groupNodes]) => ({ id, label: id, nodes: groupNodes }));
}

function outlineKey(node: WorkGraphNode, groupBy: 'kind' | 'tool' | 'file'): string {
  if (groupBy === 'kind') return node.kind;
  if (groupBy === 'file') {
    // Only file-ish nodes have a path; everything else groups together rather
    // than inventing a bucket per node.
    const meta = node.meta as { path?: string } | undefined;
    return meta?.path ?? '(no file)';
  }
  const meta = node.meta as { tool?: string; command?: string } | undefined;
  return meta?.tool ?? meta?.command?.split(/\s+/)[0] ?? node.kind;
}
