/**
 * The Work Graph node shape vocabulary.
 *
 * The shape carries the meaning, exactly as the product requires: circles are
 * milestones, diamonds are decisions, squares are artifacts and commits,
 * hexagons are MCP services, a terminal glyph is command execution, a folder is
 * a workspace change. A developer learns the alphabet once and can then read
 * any session's topology at a glance.
 *
 * COLOR RULE: every stroke and fill is a `var(--color-*)` token — no hex, no
 * gradients, no `dark:` variants (CLAUDE.md §4). The palette is pure-black
 * dark-only, so contrast comes from the gray ramp, never from a light mode.
 */
import { memo } from 'react';
import type { WorkGraphNodeKind, WorkGraphNodeStatus } from '@shared/types';

/** Which palette token a node kind draws with. */
const KIND_COLOR: Record<WorkGraphNodeKind, string> = {
  objective: 'var(--color-accent)',
  planning: 'var(--color-warning)',
  task: 'var(--color-muted)',
  subagent: 'var(--color-accent)',
  investigation: 'var(--color-faint)',
  search: 'var(--color-faint)',
  memory: 'var(--color-accent)',
  mcp: 'var(--color-accent)',
  terminal: 'var(--color-fg)',
  git: 'var(--color-success)',
  file: 'var(--color-muted)',
  approval: 'var(--color-warning)',
  artifact: 'var(--color-accent)',
  completion: 'var(--color-success)',
  service: 'var(--color-muted)',
};

const STATUS_COLOR: Record<WorkGraphNodeStatus, string> = {
  running: 'var(--color-accent)',
  done: 'var(--color-success)',
  error: 'var(--color-danger)',
  denied: 'var(--color-danger)',
  skipped: 'var(--color-faint)',
};

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: 'var(--color-accent)',
  cursor: 'var(--color-warning)',
  limboo: 'var(--color-muted)',
};

export type NodeColoring = 'kind' | 'status' | 'provider';

/**
 * Resolve a node's stroke color under the active coloring strategy. Status
 * always wins for failures: a denied or errored node must read as a problem
 * regardless of which strategy the user picked.
 */
export function nodeColor(
  kind: WorkGraphNodeKind,
  status: WorkGraphNodeStatus,
  provider: string,
  coloring: NodeColoring,
): string {
  if (status === 'error' || status === 'denied') return 'var(--color-danger)';
  if (coloring === 'status') return STATUS_COLOR[status];
  if (coloring === 'provider') return PROVIDER_COLOR[provider] ?? 'var(--color-muted)';
  return KIND_COLOR[kind];
}

interface GraphNodeProps {
  kind: WorkGraphNodeKind;
  status: WorkGraphNodeStatus;
  provider: string;
  coloring: NodeColoring;
  selected: boolean;
}

/**
 * One node glyph, drawn centered on (0,0) — the caller positions it with a
 * `translate`. Memoized on the props that actually change appearance, so a
 * `tool-end` status patch re-renders exactly one glyph, not the window.
 */
function GraphNodeGlyph({ kind, status, provider, coloring, selected }: GraphNodeProps) {
  const color = nodeColor(kind, status, provider, coloring);
  const filled = status === 'done' || kind === 'objective' || kind === 'completion';

  return (
    <g>
      {/* A halo in the page background separates a node from an edge passing
          behind it — the trick that keeps a dense git graph readable. */}
      <circle r={7.5} fill="var(--color-surface)" />
      {selected && <circle r={9} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />}
      <Shape kind={kind} color={color} filled={filled} running={status === 'running'} />
    </g>
  );
}

function Shape({
  kind,
  color,
  filled,
  running,
}: {
  kind: WorkGraphNodeKind;
  color: string;
  filled: boolean;
  running: boolean;
}) {
  const stroke = color;
  const fill = filled ? color : 'var(--color-surface)';

  switch (kind) {
    // --- Milestones: circles -------------------------------------------
    case 'objective':
    case 'completion':
      return <circle r={5} fill={color} stroke={color} strokeWidth={1} />;

    case 'subagent':
      // Double ring = a lane fork. Visually "more than one thing happening".
      return (
        <g>
          <circle r={5.5} fill="var(--color-surface)" stroke={stroke} strokeWidth={1} />
          <circle r={2.5} fill={stroke} />
        </g>
      );

    case 'task':
      return <circle r={4} fill={fill} stroke={stroke} strokeWidth={1.2} />;

    case 'memory':
      return (
        <g>
          <circle r={4} fill="var(--color-surface)" stroke={stroke} strokeWidth={1} opacity={0.75} />
          <circle r={1.4} fill={stroke} opacity={0.75} />
        </g>
      );

    case 'investigation':
      return (
        <circle
          r={3.5}
          fill="var(--color-surface)"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="2 1.5"
        />
      );

    case 'search':
      return (
        <g>
          <circle r={3.5} fill="var(--color-surface)" stroke={stroke} strokeWidth={1} />
          <path d="M1.4,1.4 L3.4,3.4" stroke={stroke} strokeWidth={1} strokeLinecap="round" />
        </g>
      );

    // --- Decisions: diamonds -------------------------------------------
    case 'planning':
    case 'approval':
      return (
        <rect
          x={-4}
          y={-4}
          width={8}
          height={8}
          rx={1}
          transform="rotate(45)"
          fill={running ? 'var(--color-surface)' : fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
      );

    // --- Services: hexagon ---------------------------------------------
    case 'mcp':
      return (
        <polygon
          points="5.5,0 2.75,4.76 -2.75,4.76 -5.5,0 -2.75,-4.76 2.75,-4.76"
          fill="var(--color-surface)"
          stroke={stroke}
          strokeWidth={1}
        />
      );

    // --- Execution: terminal glyph -------------------------------------
    case 'terminal':
      return (
        <g>
          <rect
            x={-5.5}
            y={-4.5}
            width={11}
            height={9}
            rx={1.5}
            fill="var(--color-surface)"
            stroke={stroke}
            strokeWidth={1}
          />
          <path
            d="M-3,-1.8 L-1,0 L-3,1.8"
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M0.4,2 H3.2" stroke={stroke} strokeWidth={1} strokeLinecap="round" />
        </g>
      );

    // --- Artifacts: squares --------------------------------------------
    case 'git':
      return (
        <g>
          <rect
            x={-5}
            y={-5}
            width={10}
            height={10}
            rx={1.5}
            fill="var(--color-surface-2)"
            stroke={stroke}
            strokeWidth={1}
          />
          <circle r={2} fill={stroke} />
        </g>
      );

    case 'artifact':
      return (
        <rect
          x={-4.5}
          y={-4.5}
          width={9}
          height={9}
          rx={1}
          fill="var(--color-surface-2)"
          stroke={stroke}
          strokeWidth={1}
        />
      );

    case 'service':
      return (
        <g>
          <rect
            x={-5}
            y={-3.5}
            width={10}
            height={7}
            rx={1.5}
            fill="var(--color-surface)"
            stroke={stroke}
            strokeWidth={1}
          />
          <circle cx={0} cy={0} r={1.4} fill={stroke} />
        </g>
      );

    // --- Workspace change: folder --------------------------------------
    case 'file':
    default:
      return (
        <path
          d="M-5,-3.5 H-1.4 L-0.4,-2.2 H5 V3.8 H-5 Z"
          fill="var(--color-surface)"
          stroke={stroke}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      );
  }
}

export const GraphNode = memo(GraphNodeGlyph);
