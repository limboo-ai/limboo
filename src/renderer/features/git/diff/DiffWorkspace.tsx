/**
 * The maximized diff review environment — a workspace document, not a panel.
 *
 * Two chrome rows sit above the editor: an always-present identity row (file
 * icon, path, status, counts, stage state, toolbar) and a collapsible metadata
 * row (repo, branches, comparison, last commit, checkpoints, origin).
 *
 * A deliberate omission: there is no "changed by the user" badge. Nothing in the
 * app records user authorship, and the absence of an agent record is not
 * evidence of it — the edit could have come from an external editor, a pull, or
 * a rebase. The origin badge therefore appears only when agent authorship is
 * positively known, and is simply absent otherwise.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileX, Info } from 'lucide-react';
import type { GitFileChange } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { DiffStat, Spinner } from '@/renderer/components/ui';
import { getFileIcon } from '@/renderer/lib/fileIcons';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import {
  DEFAULT_VIEW_STATE,
  diffKey,
  useDocumentStore,
  type DocumentId,
} from '@/renderer/stores/useDocumentStore';
import { DiffEditor } from './DiffEditor';
import { DiffToolbar } from './DiffToolbar';

/** Status letter + tone, mirroring the navigator row so the two read alike. */
export const STATUS_META: Record<GitFileChange['status'], { label: string; cls: string }> = {
  added: { label: 'Added', cls: 'text-success' },
  modified: { label: 'Modified', cls: 'text-warning' },
  deleted: { label: 'Deleted', cls: 'text-danger' },
  renamed: { label: 'Renamed', cls: 'text-accent' },
  untracked: { label: 'Untracked', cls: 'text-success' },
  conflicted: { label: 'Conflicted', cls: 'text-danger' },
};

export function DiffWorkspace({
  documentId,
  sessionId,
  path,
  staged,
  baseRef,
}: {
  documentId: DocumentId;
  sessionId: string;
  path: string;
  staged: boolean;
  baseRef?: string;
}) {
  const view = useDocumentStore((s) => s.viewCache[documentId] ?? DEFAULT_VIEW_STATE);
  const patchView = useDocumentStore((s) => s.patchView);
  const minimize = useDocumentStore((s) => s.minimize);

  const key = diffKey(path, staged, baseRef);
  const diff = useGitStore((s) => s.diffs[key]);
  const loadDiff = useGitStore((s) => s.loadDiff);
  const status = useGitStore((s) => s.status);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (diff) return;
    setLoading(true);
    void loadDiff(path, staged, baseRef).finally(() => setLoading(false));
  }, [diff, path, staged, baseRef, loadDiff]);

  const change = useMemo(
    () => status?.files.find((f) => f.path === path),
    [status?.files, path],
  );

  const spec = getFileIcon(path.split('/').pop() ?? path);
  const Icon = spec.icon;
  const [showMeta, setShowMeta] = useState(false);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Identity row */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon size={14} className={cn('shrink-0', spec.className)} />
        <span className="shrink-0 text-[12px] font-medium text-fg">
          {path.split('/').pop()}
        </span>
        <span className="min-w-0 truncate text-[11px] text-faint" title={path}>
          {path.split('/').slice(0, -1).join('/')}
        </span>
        {change && (
          <span className={cn('shrink-0 text-[11px]', STATUS_META[change.status].cls)}>
            {STATUS_META[change.status].label}
          </span>
        )}
        {change && <DiffStat adds={change.adds} dels={change.dels} className="shrink-0" />}
        <StagePill change={change} staged={staged} />
        {loading && <Spinner size={11} />}
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label={showMeta ? 'Hide details' : 'Show details'}
            title={showMeta ? 'Hide details' : 'Show details'}
            aria-pressed={showMeta}
            onClick={() => setShowMeta((v) => !v)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
              showMeta ? 'text-accent' : 'text-muted hover:text-fg',
            )}
          >
            <Info size={14} />
          </button>
          <DiffToolbar
            documentId={documentId}
            sessionId={sessionId}
            path={path}
            staged={staged}
            baseRef={baseRef}
            diff={diff}
            change={change}
            view={view}
            onPatch={(patch) => patchView(documentId, patch)}
            onMinimize={() => minimize(sessionId, documentId)}
          />
        </div>
      </div>

      {showMeta && <MetadataRow path={path} sessionId={sessionId} baseRef={baseRef} />}

      {diff?.truncated && (
        // At the TOP: in a long, scrolled document a footer warning is invisible,
        // and this one changes how the content should be read.
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-warning/10 px-3 text-[11px] text-warning">
          <AlertTriangle size={12} className="shrink-0" />
          This diff was truncated because the file is very large — it is not the complete change.
        </div>
      )}

      {diff?.binary ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
          <FileX size={22} className="text-faint" />
          <p className="text-[12px] text-muted">Binary file — no text diff to review.</p>
          <p className="max-w-sm text-[11px] text-faint">
            Staging, discarding, and patch export still work from the toolbar.
          </p>
        </div>
      ) : diff && diff.hunks.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-[12px] text-faint">No changes to display.</p>
        </div>
      ) : diff ? (
        <DiffEditor
          diff={diff}
          layout={view.layout}
          foldContext={view.foldContext}
          collapsedHunks={view.collapsedHunks}
          wordLevel={view.wordDiff}
          showWhitespace={view.whitespace}
          highlight
          scrollTop={view.scrollTop}
          onScrollTopChange={(top) => patchView(documentId, { scrollTop: top })}
          onToggleHunk={(hunkIndex) =>
            patchView(documentId, {
              collapsedHunks: view.collapsedHunks.includes(hunkIndex)
                ? view.collapsedHunks.filter((h) => h !== hunkIndex)
                : [...view.collapsedHunks, hunkIndex],
            })
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[12px] text-muted">
          {loading ? (
            <>
              <Spinner size={12} /> Loading diff…
            </>
          ) : (
            'Diff unavailable.'
          )}
        </div>
      )}
    </section>
  );
}

function StagePill({ change, staged }: { change?: GitFileChange; staged: boolean }) {
  if (!change) return null;
  const both = change.staged && change.unstaged;
  const label = both ? 'Partially staged' : staged || change.staged ? 'Staged' : 'Unstaged';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]',
        both
          ? 'border-warning/40 text-warning'
          : change.staged
            ? 'border-success/40 text-success'
            : 'border-line text-faint',
      )}
    >
      {label}
    </span>
  );
}

/**
 * Repository context. Every field here is derived from data the app already
 * holds — nothing is fabricated to fill the row out.
 */
function MetadataRow({
  path,
  sessionId,
  baseRef,
}: {
  path: string;
  sessionId: string;
  baseRef?: string;
}) {
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeId));
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const branch = useGitStore((s) => s.status?.branch);
  const checkpoints = useGitStore((s) => s.checkpoints);
  // The agent's own record of what it edited this session — the only positive
  // evidence of authorship that exists.
  const agentTouched = useAgentStore((s) =>
    (s.bySession[sessionId]?.changes ?? []).some((c) => c.path === path),
  );

  const inCheckpoints = useMemo(
    () => checkpoints.filter((c) => c.files.includes(path)),
    [checkpoints, path],
  );

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 overflow-x-auto border-b border-line px-3 text-[11px] text-faint">
      {workspace && <Meta label="Repo" value={workspace.name} />}
      {session?.worktreeBranch && <Meta label="Worktree" value={session.worktreeBranch} />}
      {branch && <Meta label="Branch" value={branch} />}
      <Meta label="Comparing" value={baseRef ? `vs ${baseRef}` : 'vs HEAD'} />
      {inCheckpoints.length > 0 && (
        <Meta
          label="Checkpoints"
          value={`${inCheckpoints.length}`}
          title={inCheckpoints.map((c) => c.label).join('\n')}
        />
      )}
      {agentTouched && (
        <span className="shrink-0 rounded-full border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent">
          Edited by agent
        </span>
      )}
    </div>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1" title={title}>
      <span className="text-faint/70">{label}</span>
      <span className="text-muted">{value}</span>
    </span>
  );
}
