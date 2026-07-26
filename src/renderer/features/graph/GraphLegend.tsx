/**
 * The shape/color key.
 *
 * A visual language only works if it is written down somewhere. This panel is
 * that somewhere, and it also surfaces the two facts a reader most needs to
 * trust the diagram: that dashed edges are INFERRED rather than observed, and
 * how many edges the layouter had to drop for pointing backwards in time.
 */
import type { WorkGraphEdgeKind, WorkGraphNodeKind } from '@shared/types';
import { EDGE_LABEL, edgeColor } from './GraphEdge';
import { GraphNode, type NodeColoring } from './GraphNode';

const NODE_LEGEND: Array<{ kind: WorkGraphNodeKind; label: string; note: string }> = [
  { kind: 'objective', label: 'Objective', note: 'a request that opened a run' },
  { kind: 'planning', label: 'Planning', note: 'a captured plan' },
  { kind: 'task', label: 'Task', note: 'one checklist item' },
  { kind: 'subagent', label: 'Subagent', note: 'forks a side lane' },
  { kind: 'investigation', label: 'Investigation', note: 'a read-only lookup' },
  { kind: 'search', label: 'Search', note: 'a project search' },
  { kind: 'memory', label: 'Memory', note: 'retrieved or written knowledge' },
  { kind: 'mcp', label: 'MCP', note: 'an external tool server' },
  { kind: 'terminal', label: 'Terminal', note: 'a command execution' },
  { kind: 'file', label: 'File', note: 'a workspace change' },
  { kind: 'git', label: 'Git', note: 'commit / checkpoint (right gutter)' },
  { kind: 'approval', label: 'Approval', note: 'a permission decision' },
  { kind: 'artifact', label: 'Artifact', note: 'a produced document or diff' },
  { kind: 'service', label: 'Service', note: 'a supervised process' },
  { kind: 'completion', label: 'Completion', note: 'the run result' },
];

const EDGE_LEGEND: WorkGraphEdgeKind[] = [
  'follows',
  'contains',
  'generated',
  'implemented-in',
  'produced-artifact',
  'reviewed-by',
  'blocked-by',
  'depends-on',
  'verified-by',
];

export function GraphLegend({
  coloring,
  droppedEdges,
}: {
  coloring: NodeColoring;
  droppedEdges: number;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Nodes
      </h3>
      <ul className="mb-4 flex flex-col gap-1">
        {NODE_LEGEND.map((item) => (
          <li key={item.kind} className="flex items-center gap-2">
            <svg width={20} height={20} className="shrink-0">
              <g transform="translate(10,10)">
                <GraphNode
                  kind={item.kind}
                  status="done"
                  provider="anthropic"
                  coloring={coloring}
                  selected={false}
                />
              </g>
            </svg>
            <span className="text-[11px] text-fg">{item.label}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-faint">{item.note}</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Relationships
      </h3>
      <ul className="mb-3 flex flex-col gap-1">
        {EDGE_LEGEND.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <svg width={20} height={10} className="shrink-0">
              <path
                d="M1,5 H19"
                stroke={edgeColor(kind)}
                strokeWidth={1.25}
                strokeDasharray={kind === 'depends-on' || kind === 'verified-by' ? '3 2.5' : undefined}
              />
            </svg>
            <span className="text-[11px] text-muted">{EDGE_LABEL[kind]}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-md border border-line bg-surface-2/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
        <span className="text-fg">Dashed means inferred.</span> Solid relationships were read
        directly from the agent&apos;s own execution events. Dashed ones were derived by Limboo
        from ordering and command names, so treat them as a strong hint rather than a fact.
      </p>

      {droppedEdges > 0 && (
        <p className="mt-2 rounded-md border border-line px-2 py-1.5 text-[10px] leading-relaxed text-warning">
          {droppedEdges} relationship{droppedEdges === 1 ? '' : 's'} pointed backwards in time and
          {droppedEdges === 1 ? ' was' : ' were'} dropped to keep the graph acyclic.
        </p>
      )}
    </div>
  );
}
