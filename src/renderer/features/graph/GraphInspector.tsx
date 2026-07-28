/**
 * The selected node's typed metadata.
 *
 * This is where the graph pays off: because every node kind carries its own
 * structured payload, the inspector shows the real facts of an execution step —
 * the command and its duration, the commit and its files, the memories that
 * were retrieved and their scores — without anyone re-reading a transcript.
 *
 * HONESTY: fields the providers do not expose are simply absent. An agent
 * command has no numeric exit code (the Agent SDK does not stream tool stdout),
 * so it renders as ok/failed and never as a fabricated `0`.
 */
import { ExternalLink } from 'lucide-react';
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';
import { relativeTime } from '@/renderer/lib/format';
import { cn } from '@/renderer/lib/cn';
import { IconButton } from '@/renderer/components/ui/IconButton';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { EDGE_LABEL, edgeColor } from './GraphEdge';
import { nodeColor, type NodeColoring } from './GraphNode';
import { canRevealRef, revealRef } from './focus';

interface GraphInspectorProps {
  node: WorkGraphNode;
  edges: WorkGraphEdge[];
  nodesById: Map<string, WorkGraphNode>;
  coloring: NodeColoring;
  /** When false, selecting a node does not navigate other panels. */
  timelineSync: boolean;
  /** Show size/mime/path detail for artifact nodes. */
  artifactPreviews: boolean;
  onSelect: (id: string) => void;
}

export function GraphInspector({
  node,
  edges,
  nodesById,
  coloring,
  timelineSync,
  artifactPreviews,
  onSelect,
}: GraphInspectorProps) {
  const color = nodeColor(node.kind, node.status, node.provider, coloring);
  const duration = node.endedAt ? node.endedAt - node.startedAt : null;
  const addToast = useUIStore((s) => s.addToast);

  // A node stands for a REAL entity, so "go to it" is always meaningful when
  // the reference still resolves.
  const canReveal = timelineSync && canRevealRef(node.ref);
  const onReveal = (): void => {
    const where = revealRef(node.ref);
    if (!where) {
      addToast({
        title: 'Nothing to open',
        description: 'What this node refers to is no longer available.',
        tone: 'warning',
      });
    }
  };

  return (
    <div className="shrink-0 border-t border-line bg-surface-2/40 px-2.5 py-2">
      <div className="flex items-baseline gap-1.5">
        <span
          className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
          style={{ color, backgroundColor: 'var(--color-surface)' }}
        >
          {node.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{node.title}</span>
        <span className="shrink-0 text-[10px] text-faint">{relativeTime(node.startedAt)}</span>
        {canReveal && (
          <IconButton label="Open what this refers to" size="sm" onClick={onReveal}>
            <ExternalLink size={13} />
          </IconButton>
        )}
      </div>

      {node.detail && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[11px] text-muted">
          {node.detail}
        </p>
      )}

      <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-faint">
        <Meta label="status" value={node.status} />
        <Meta label="provider" value={node.provider} />
        {duration !== null && <Meta label="took" value={formatMs(duration)} />}
        {metaEntries(node, artifactPreviews).map(([k, v]) => (
          <Meta key={k} label={k} value={v} />
        ))}
      </dl>

      {edges.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {edges.slice(0, 8).map((e) => {
            const otherId = e.src === node.id ? e.dst : e.src;
            const other = nodesById.get(otherId);
            const outgoing = e.src === node.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(otherId)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn('shrink-0', e.derived && 'italic')}
                    style={{ color: edgeColor(e.kind) }}
                  >
                    {outgoing ? '→' : '←'} {EDGE_LABEL[e.kind]}
                    {/* Dashed/italic = inferred, matching the canvas rule. */}
                    {e.derived && ' (inferred)'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {other?.title ?? otherId}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Human byte size for an artifact preview row. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-1">
      <dt>{label}</dt>
      <dd className="font-mono text-muted">{value}</dd>
    </span>
  );
}

/** Flatten a node's typed `meta` into displayable rows, per kind. */
function metaEntries(node: WorkGraphNode, previews = true): Array<[string, string]> {
  switch (node.kind) {
    case 'objective':
      return [
        ['mode', node.meta.mode],
        ['model', node.meta.model],
      ];
    case 'planning':
      return [
        ['tasks', String(node.meta.taskCount)],
        ...(node.meta.risk ? ([['risk', node.meta.risk]] as Array<[string, string]>) : []),
        ['plan', node.meta.planStatus],
      ];
    case 'task':
      return [['state', node.meta.taskStatus]];
    case 'subagent':
      return [
        ...(node.meta.subagentType
          ? ([['agent', node.meta.subagentType]] as Array<[string, string]>)
          : []),
        ['tool', node.meta.toolName],
        ['children', String(node.meta.childCount)],
      ];
    case 'investigation':
      return [
        ['tool', node.meta.tool],
        ...(node.meta.target ? ([['target', node.meta.target]] as Array<[string, string]>) : []),
      ];
    case 'search':
      return [
        ['tool', node.meta.tool],
        ...(node.meta.query ? ([['query', node.meta.query]] as Array<[string, string]>) : []),
      ];
    case 'memory':
      return [
        ['op', node.meta.op],
        ['memories', String(node.meta.memoryIds.length)],
      ];
    case 'mcp':
      return [
        ['server', node.meta.server],
        ['tool', node.meta.tool],
        ['internal', node.meta.internal ? 'yes' : 'no'],
      ];
    case 'terminal':
      return [
        ['origin', node.meta.origin],
        // Only present for real PTYs. Agent commands have no exit code at all.
        ...(node.meta.exitCode !== undefined
          ? ([['exit', String(node.meta.exitCode)]] as Array<[string, string]>)
          : []),
      ];
    case 'git':
      return [
        ['op', node.meta.op],
        ...(node.meta.hash ? ([['hash', node.meta.hash.slice(0, 8)]] as Array<[string, string]>) : []),
        ...(node.meta.branch ? ([['branch', node.meta.branch]] as Array<[string, string]>) : []),
        ['files', String(node.meta.files.length)],
        ['+/-', `${node.meta.adds}/${node.meta.dels}`],
      ];
    case 'file':
      return [
        ['change', node.meta.change.status],
        ['+/-', `${node.meta.change.adds}/${node.meta.change.dels}`],
      ];
    case 'approval':
      return [
        ['subject', node.meta.subject],
        ['decision', node.meta.decision],
        ['auto', node.meta.auto ? 'yes' : 'no'],
      ];
    case 'artifact':
      return [
        ['type', node.meta.artifactKind],
        // The preview detail is what `graph.artifactPreviews` gates: the kind
        // itself is always shown, the payload facts are opt-in.
        ...(previews
          ? (
              [
                node.meta.path ? ['path', node.meta.path] : null,
                node.meta.mime ? ['mime', node.meta.mime] : null,
                node.meta.bytes !== undefined ? ['size', formatBytes(node.meta.bytes)] : null,
                node.meta.fileCount !== undefined
                  ? ['files', String(node.meta.fileCount)]
                  : null,
              ].filter(Boolean) as Array<[string, string]>
            )
          : []),
      ];
    case 'completion':
      return [
        ['ok', node.meta.ok ? 'yes' : 'no'],
        ['tools', String(node.meta.toolCount)],
        ['files', String(node.meta.fileCount)],
      ];
    case 'service':
      return [
        ['name', node.meta.name],
        ['state', node.meta.state],
        ...(node.meta.port !== undefined
          ? ([['port', String(node.meta.port)]] as Array<[string, string]>)
          : []),
      ];
    default:
      return [];
  }
}

function formatMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
