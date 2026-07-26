/**
 * Outline view — the same work graph as a grouped list.
 *
 * The lane canvas answers "what happened in what order"; the outline answers
 * "what kinds of work happened, and to which files". Grouping is driven by
 * `settings.graph.outlineGroupBy`, and selecting a row drives the SAME `select()`
 * the canvas does, so the inspector and the graph stay in sync across views.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { WorkGraphNode } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { relativeTime } from '@/renderer/lib/format';
import type { OutlineGroup } from './viewModel';

const STATUS_TONE: Record<WorkGraphNode['status'], string> = {
  running: 'text-accent',
  done: 'text-success',
  error: 'text-danger',
  denied: 'text-warning',
  skipped: 'text-faint',
};

export function GraphOutline({
  groups,
  selectedId,
  groupCounts,
  onSelect,
}: {
  groups: OutlineGroup[];
  selectedId: string | null;
  groupCounts: Map<string, number>;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
      {groups.map((group) => (
        <div key={group.id} className="mb-1">
          {group.label && (
            <button
              type="button"
              onClick={() => toggle(group.id)}
              className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-fg"
            >
              {collapsed.has(group.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              <span className="truncate">{group.label}</span>
              <span className="ml-1 font-normal normal-case tracking-normal">
                {group.nodes.length}
              </span>
            </button>
          )}
          {!collapsed.has(group.id) && (
            <ul className="flex flex-col">
              {group.nodes.map((node) => {
                const merged = groupCounts.get(node.id);
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(node.id)}
                      aria-current={node.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                        node.id === selectedId
                          ? 'bg-surface-2 text-fg'
                          : 'text-muted hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      <span
                        className={cn('shrink-0 text-[9px]', STATUS_TONE[node.status])}
                        title={node.status}
                      >
                        ●
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={node.detail ?? node.title}>
                        {node.title}
                      </span>
                      {merged ? (
                        <span
                          className="shrink-0 rounded-full border border-line px-1 text-[9px] text-faint"
                          title={`${merged} more node${merged === 1 ? '' : 's'} folded into this one`}
                        >
                          +{merged}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[9px] text-faint">
                        {relativeTime(node.startedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
