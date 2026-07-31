/**
 * Activity drawer panels. Each panel is driven by the active session's agent
 * snapshot (from `useAgentStore`) and falls back to a real empty state when there
 * is nothing to show yet. The structured event stream from the main process keeps
 * these live as Claude Code works.
 */
import { useEffect } from 'react';
import { FileDiff, FolderOpen, GitBranch, Plus, RefreshCw } from 'lucide-react';
import type { FileChange } from '@shared/types';
import { DiffStat, EmptyState, IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { runCommand } from '@/renderer/lib/commands';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useAgentStore, EMPTY_SNAPSHOT } from '@/renderer/stores/useAgentStore';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import { useFileSystemStore } from '@/renderer/stores/useFileSystemStore';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { FileTree } from './FileTree';
import { ChangesNavigator } from '@/renderer/features/git/ChangesNavigator';

export { PlanPanel as TasksPanel } from './PlanPanel';

function useSnapshot() {
  const sessionId = useSessionStore((s) => s.selectedId);
  return useAgentStore((s) => (sessionId ? s.bySession[sessionId] : undefined)) ?? EMPTY_SNAPSHOT;
}

export function FilesPanel() {
  const activeId = useWorkspaceStore((s) => s.activeId);
  const tree = useFileSystemStore((s) => (activeId ? s.treeByWs[activeId] : undefined));
  const progress = useFileSystemStore((s) => (activeId ? s.progressByWs[activeId] : undefined));
  const fetchTree = useFileSystemStore((s) => s.fetchTree);
  const indexing = !!progress && progress.phase !== 'done';

  // Self-heal: the tree normally arrives via the `fs:tree-changed` push, but the
  // boot-time index can broadcast before this renderer subscribed. Pull the
  // current tree (or trigger the first index) whenever the panel has none.
  useEffect(() => {
    if (activeId && !tree) void fetchTree(activeId);
  }, [activeId, tree, fetchTree]);

  if (!activeId) {
    return (
      <EmptyState
        compact
        icon={FolderOpen}
        title="No workspace open"
        description="Open or create a workspace to browse and track its files here."
      />
    );
  }

  const children = tree?.root.children ?? [];

  if (children.length === 0) {
    return (
      <EmptyState
        compact
        icon={FolderOpen}
        title={indexing ? 'Indexing workspace…' : 'No files indexed'}
        description={
          indexing
            ? 'Building the directory tree — this populates automatically.'
            : 'Reindex the workspace to browse and track its files here.'
        }
        action={
          indexing ? undefined : (
            <button
              type="button"
              onClick={() => runCommand('workspace.reindex')}
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <RefreshCw size={12} /> Reindex workspace
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <FileTree workspaceId={activeId} nodes={children} />
      {tree?.truncated && (
        <p className="px-2 py-2 text-[11px] italic text-faint">
          Large repository — only the first {tree.nodeCount.toLocaleString()} entries are shown.
        </p>
      )}
    </div>
  );
}

/**
 * Changes — the working tree as an expandable, reviewable list. Backed by the
 * authoritative git status (each file expands to its inline diff) when the
 * workspace is a repo; otherwise it falls back to the agent run's in-flight
 * change list. A toolbar offers expand/collapse-all, refresh, stage-all, and a
 * jump into the full Git workspace.
 */
export function ChangesPanel() {
  const snapshot = useSnapshot();
  const status = useGitStore((s) => s.status);
  const refresh = useGitStore((s) => s.refresh);
  const stageAll = useGitStore((s) => s.stageAll);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isRepo = !!status?.isRepo;
  const files = status?.files ?? [];

  // Outside a git repo, fall back to the agent snapshot's change list (no diffs).
  if (!isRepo) {
    if (snapshot.changes.length === 0) {
      return (
        <EmptyState
          compact
          icon={FileDiff}
          title="No changes yet"
          description="File additions, edits, and deletions made during a session appear here with diff counts."
        />
      );
    }
    const snapAdds = snapshot.changes.reduce((n, c) => n + c.adds, 0);
    const snapDels = snapshot.changes.reduce((n, c) => n + c.dels, 0);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-1 pb-1 text-[11px] text-faint">
          {snapshot.changes.length} change{snapshot.changes.length === 1 ? '' : 's'}
          {(snapAdds > 0 || snapDels > 0) && <DiffStat adds={snapAdds} dels={snapDels} />}
        </div>
        <ul className="flex flex-col gap-0.5">
          {snapshot.changes.map((change) => (
            <SnapshotChangeRow key={change.path} change={change} />
          ))}
        </ul>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        compact
        icon={FileDiff}
        title="Working tree clean"
        description="No uncommitted changes. Edits made by you or the agent will appear here to review and stage."
      />
    );
  }

  return (
    <ChangesNavigator
      files={files}
      actions={
        <>
          <IconButton label="Stage all" size="sm" onClick={() => void stageAll()}>
            <Plus size={13} />
          </IconButton>
          <IconButton label="Refresh" size="sm" onClick={() => void refresh()}>
            <RefreshCw size={13} />
          </IconButton>
          <IconButton label="Open Git workspace" size="sm" onClick={() => setActiveTab('git')}>
            <GitBranch size={13} />
          </IconButton>
        </>
      }
    />
  );
}

/** Read-only row for the non-repo fallback (agent snapshot changes, no diff). */
function SnapshotChangeRow({ change }: { change: FileChange }) {
  const segments = change.path.split(/[\\/]/).filter(Boolean);
  const name = segments[segments.length - 1] ?? change.path;
  const dir = segments.slice(0, -1).join('/');
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          change.status === 'added' && 'bg-success',
          change.status === 'modified' && 'bg-warning',
          change.status === 'deleted' && 'bg-danger',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={change.path}>
        {name}
        {dir && <span className="ml-1 text-faint">{dir}</span>}
      </span>
      <DiffStat adds={change.adds} dels={change.dels} />
    </li>
  );
}
