/**
 * The changed-files navigator, shared by the Git workspace's Changes view and
 * the Changes activity panel so both surfaces gain grouping, filtering,
 * multi-select, and keyboard navigation from one implementation.
 *
 * Grouping dimensions are limited to what the data can actually answer.
 * `GitFileChange` carries a path, a status, and two staging flags; `GitStatus`
 * describes ONE resolved repository root at a time. So directory / change type /
 * stage state / agent-origin are real groupings, while "group by repository,
 * worktree, or branch" is not — every file would land in the same bucket. They
 * are deliberately absent rather than present and meaningless.
 *
 * There is likewise no "changed by me" filter: nothing records user authorship,
 * and "the agent has no record of it" is not the same fact.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Download,
  FolderTree,
  Layers,
  ListFilter,
  Plus,
  X,
} from 'lucide-react';
import type { GitFileChange } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { DiffStat, IconButton } from '@/renderer/components/ui';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { GitFileRow } from './GitFileRow';

type GroupBy = 'none' | 'directory' | 'status' | 'stage';

/** Filters are a set of independently-toggled tags, not a single-choice mode. */
type FilterTag =
  | GitFileChange['status']
  | 'staged'
  | 'unstaged'
  | 'agent';

const STATUS_TAGS: { id: GitFileChange['status']; label: string }[] = [
  { id: 'added', label: 'Added' },
  { id: 'modified', label: 'Modified' },
  { id: 'deleted', label: 'Deleted' },
  { id: 'renamed', label: 'Renamed' },
  { id: 'untracked', label: 'Untracked' },
  { id: 'conflicted', label: 'Conflicted' },
];

const GROUPS: { id: GroupBy; label: string; icon: typeof Layers }[] = [
  { id: 'none', label: 'Flat list', icon: ListFilter },
  { id: 'directory', label: 'By folder', icon: FolderTree },
  { id: 'status', label: 'By change type', icon: Layers },
  { id: 'stage', label: 'By stage state', icon: Layers },
];

/** Which diff side a row displays (matches the existing expand-key convention). */
function sideFor(f: GitFileChange): boolean {
  return !f.unstaged && f.staged;
}

function rowKey(f: GitFileChange): string {
  return `${sideFor(f) ? 's' : 'w'}:${f.path}`;
}

export function ChangesNavigator({
  files,
  /** Extra controls rendered into the toolbar row (panel-specific actions). */
  actions,
}: {
  files: GitFileChange[];
  actions?: React.ReactNode;
}) {
  const stage = useGitStore((s) => s.stage);
  const savePatch = useGitStore((s) => s.savePatch);
  const sessionId = useSessionStore((s) => s.selectedId);
  const promote = useDocumentStore((s) => s.promote);
  // Select the STORED array reference and derive the lookup set separately.
  // Building the Set inside the selector returns a new object on every snapshot
  // read, which `useSyncExternalStore` can never find `Object.is`-equal — that
  // is an infinite render loop, not a perf nit. Selectors must return stored
  // references or primitives; derivation belongs in `useMemo`.
  const agentChanges = useAgentStore((s) =>
    sessionId ? s.bySession[sessionId]?.changes : undefined,
  );
  const agentPaths = useMemo(
    () => new Set((agentChanges ?? []).map((c) => c.path)),
    [agentChanges],
  );

  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [filters, setFilters] = useState<Set<FilterTag>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleFilter = (tag: FilterTag) =>
    setFilters((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });

  // Status tags OR together; stage and origin tags AND with that result — the
  // reading a user expects from "Modified + Staged".
  const visible = useMemo(() => {
    const statusTags = STATUS_TAGS.map((t) => t.id).filter((id) => filters.has(id));
    return files.filter((f) => {
      if (statusTags.length && !statusTags.includes(f.status)) return false;
      if (filters.has('staged') && !f.staged) return false;
      if (filters.has('unstaged') && !f.unstaged) return false;
      if (filters.has('agent') && !agentPaths.has(f.path)) return false;
      return true;
    });
  }, [files, filters, agentPaths]);

  const groups = useMemo(() => groupFiles(visible, groupBy), [visible, groupBy]);
  // Flattened row order — what the keyboard cursor and shift-range walk.
  const flat = useMemo(() => groups.flatMap((g) => g.files), [groups]);

  useEffect(() => {
    if (cursor >= flat.length) setCursor(Math.max(0, flat.length - 1));
  }, [flat.length, cursor]);

  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectRange = (to: number, additive: boolean, range: boolean) => {
    const target = flat[to];
    if (!target) return;
    setSelected((prev) => {
      if (range && flat[cursor]) {
        const [from, until] = cursor <= to ? [cursor, to] : [to, cursor];
        const next = new Set(additive ? prev : []);
        for (let i = from; i <= until; i++) next.add(flat[i].path);
        return next;
      }
      if (additive) {
        const next = new Set(prev);
        next.has(target.path) ? next.delete(target.path) : next.add(target.path);
        return next;
      }
      return new Set([target.path]);
    });
    setCursor(to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = flat[cursor];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(flat.length - 1, Math.max(0, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
      if (e.shiftKey) selectRange(next, true, true);
      else setCursor(next);
    } else if (e.key === 'ArrowRight' && current) {
      e.preventDefault();
      setExpanded((prev) => new Set(prev).add(rowKey(current)));
    } else if (e.key === 'ArrowLeft' && current) {
      e.preventDefault();
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(rowKey(current));
        return next;
      });
    } else if (e.key === 'Enter' && current && sessionId) {
      e.preventDefault();
      promote(sessionId, { kind: 'diff', path: current.path, staged: sideFor(current) });
    } else if (e.key === ' ' && current) {
      e.preventDefault();
      void stage(current.path);
    }
  };

  const selectedPaths = [...selected].filter((p) => visible.some((f) => f.path === p));
  const totalAdds = visible.reduce((n, f) => n + f.adds, 0);
  const totalDels = visible.reduce((n, f) => n + f.dels, 0);
  const activeFilters = filters.size > 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-1">
        <span className="mr-auto flex items-center gap-2 text-[11px] text-faint">
          {visible.length}
          {activeFilters && ` of ${files.length}`} change{visible.length === 1 ? '' : 's'}
          {(totalAdds > 0 || totalDels > 0) && <DiffStat adds={totalAdds} dels={totalDels} />}
        </span>
        {GROUPS.map((g) => (
          <IconButton
            key={g.id}
            label={g.label}
            size="sm"
            onClick={() => setGroupBy(g.id)}
            className={cn(groupBy === g.id && 'text-accent')}
          >
            <g.icon size={13} />
          </IconButton>
        ))}
        <IconButton
          label="Collapse all"
          size="sm"
          onClick={() => setExpanded(new Set())}
          disabled={expanded.size === 0}
        >
          <ChevronsDownUp size={13} />
        </IconButton>
        {actions}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1 px-1">
        {STATUS_TAGS.map((t) => {
          const count = files.filter((f) => f.status === t.id).length;
          if (count === 0) return null;
          return (
            <Chip key={t.id} on={filters.has(t.id)} onClick={() => toggleFilter(t.id)}>
              {t.label} {count}
            </Chip>
          );
        })}
        <Chip on={filters.has('staged')} onClick={() => toggleFilter('staged')}>
          Staged
        </Chip>
        <Chip on={filters.has('unstaged')} onClick={() => toggleFilter('unstaged')}>
          Unstaged
        </Chip>
        {agentPaths.size > 0 && (
          <Chip on={filters.has('agent')} onClick={() => toggleFilter('agent')}>
            <Bot size={10} /> Agent
          </Chip>
        )}
        {activeFilters && (
          <button
            type="button"
            onClick={() => setFilters(new Set())}
            className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] text-faint hover:text-fg"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Bulk actions — only while a multi-selection exists. */}
      {selectedPaths.length > 1 && (
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1">
          <span className="mr-auto text-[11px] text-muted">{selectedPaths.length} selected</span>
          <button
            type="button"
            onClick={() => selectedPaths.forEach((p) => void stage(p))}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
          >
            <Plus size={11} /> Stage
          </button>
          <button
            type="button"
            onClick={() => void savePatch(selectedPaths)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
          >
            <Download size={11} /> Export patch
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded px-1.5 py-0.5 text-[11px] text-faint hover:text-fg"
          >
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-2 py-3 text-[12px] text-faint">No changes match these filters.</p>
      ) : (
        <div
          ref={listRef}
          role="tree"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="flex flex-col gap-1 outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-0.5">
              {group.label && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      next.has(group.id) ? next.delete(group.id) : next.add(group.id);
                      return next;
                    })
                  }
                  className="flex items-center gap-1 px-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-faint hover:text-fg"
                >
                  {collapsedGroups.has(group.id) ? (
                    <ChevronRight size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )}
                  <span className="truncate">{group.label}</span>
                  <span className="ml-1 font-normal normal-case tracking-normal">
                    {group.files.length}
                  </span>
                </button>
              )}
              {!collapsedGroups.has(group.id) && (
                <ul className="flex flex-col gap-0.5">
                  {group.files.map((f) => {
                    const key = rowKey(f);
                    const index = flat.indexOf(f);
                    return (
                      <div
                        key={key}
                        onMouseDown={(e) => {
                          if (e.metaKey || e.ctrlKey) {
                            e.preventDefault();
                            selectRange(index, true, false);
                          } else if (e.shiftKey) {
                            e.preventDefault();
                            selectRange(index, false, true);
                          } else {
                            setCursor(index);
                          }
                        }}
                        className={cn(
                          'rounded-md',
                          selected.has(f.path) && 'bg-accent/10',
                          index === cursor && 'ring-1 ring-inset ring-line-strong',
                        )}
                      >
                        <GitFileRow
                          change={f}
                          staged={sideFor(f)}
                          expanded={expanded.has(key)}
                          onToggle={() => toggleRow(key)}
                        />
                      </div>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        on
          ? 'border-accent/50 text-accent'
          : 'border-line text-faint hover:border-line-strong hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}

interface FileGroup {
  id: string;
  /** null renders the files without a header (the flat list). */
  label: string | null;
  files: GitFileChange[];
}

function groupFiles(files: GitFileChange[], groupBy: GroupBy): FileGroup[] {
  if (groupBy === 'none') return [{ id: 'all', label: null, files }];

  const buckets = new Map<string, GitFileChange[]>();
  const keyFor = (f: GitFileChange): string => {
    if (groupBy === 'directory') {
      return f.path.split('/').slice(0, -1).join('/') || '/';
    }
    if (groupBy === 'status') return f.status;
    return f.staged && f.unstaged ? 'Partially staged' : f.staged ? 'Staged' : 'Unstaged';
  };

  for (const f of files) {
    const key = keyFor(f);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(f);
    else buckets.set(key, [f]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, groupFilesList]) => ({ id, label: id, files: groupFilesList }));
}
