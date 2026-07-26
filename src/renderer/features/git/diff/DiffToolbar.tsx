/**
 * Review actions for the maximized diff.
 *
 * Six primary controls plus an overflow menu — twenty-odd icons in a row would
 * be unreadable, and the header also has to hold the file identity. Active state
 * is carried by the ICON's color alone: no colored backgrounds, per the review
 * design. That is also why `IconButton`'s `active` prop is not used here — it
 * styles `bg-surface-2`, which is exactly the treatment being avoided.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronsDownUp,
  Columns2,
  Copy,
  Download,
  Flag,
  GitCommitHorizontal,
  History,
  Minimize2,
  Minus,
  MoreHorizontal,
  Pilcrow,
  Plus,
  RotateCcw,
  Rows3,
  Sparkles,
  UnfoldVertical,
  WholeWord,
} from 'lucide-react';
import type { GitFileChange, GitFileDiff } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import {
  useDocumentStore,
  type CompareMode,
  type DiffViewState,
  type DocumentId,
} from '@/renderer/stores/useDocumentStore';

/** A header action. Accent = on; neutral = off. Never a colored background. */
function ToolButton({
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        on ? 'text-accent hover:text-accent' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function MenuItem({
  label,
  icon: Icon,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Copy;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function DiffToolbar({
  documentId,
  sessionId,
  path,
  staged,
  baseRef,
  diff,
  change,
  view,
  onPatch,
  onMinimize,
}: {
  documentId: DocumentId;
  sessionId: string;
  path: string;
  staged: boolean;
  baseRef?: string;
  diff?: GitFileDiff;
  change?: GitFileChange;
  view: DiffViewState;
  onPatch: (patch: Partial<DiffViewState>) => void;
  onMinimize: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const promote = useDocumentStore((s) => s.promote);
  const close = useDocumentStore((s) => s.close);

  const stage = useGitStore((s) => s.stage);
  const unstage = useGitStore((s) => s.unstage);
  const discard = useGitStore((s) => s.discard);
  const copyPatch = useGitStore((s) => s.copyPatch);
  const savePatch = useGitStore((s) => s.savePatch);
  const setFocus = useGitStore((s) => s.setFocus);
  const branches = useGitStore((s) => s.branches);
  const loadBranches = useGitStore((s) => s.loadBranches);
  const checkpoints = useGitStore((s) => s.checkpoints);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const addToast = useUIStore((s) => s.addToast);

  // Close the menu on an outside click, like every other popover in the app.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) {
        setMenu(false);
        setCompareOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const hunkCount = diff?.hunks.length ?? 0;
  const allCollapsed = hunkCount > 0 && view.collapsedHunks.length >= hunkCount;
  const patchOpts = { staged, ...(baseRef ? { baseRef } : {}) };

  /** Re-open this file as a document compared against something else. */
  const compareWith = (compare: CompareMode) => {
    const ref =
      compare.kind === 'branch'
        ? compare.ref
        : compare.kind === 'checkpoint'
          ? compare.commit
          : undefined;
    // A different comparison base is a different document (different id), so the
    // current one is closed rather than mutated — its cached view state stays
    // put in case the user comes back.
    promote(sessionId, { kind: 'diff', path, staged, ...(ref ? { baseRef: ref } : {}) });
    if (ref !== baseRef) close(sessionId, documentId);
    setMenu(false);
    setCompareOpen(false);
  };

  const jumpToGit = (view: 'history' | 'commit') => {
    setFocus({ view, path });
    setActiveTab('git');
    setMenu(false);
  };

  const cycleReview = () => {
    const next: DiffViewState['review'] =
      view.review === 'unreviewed' ? 'reviewed' : view.review === 'reviewed' ? 'flagged' : 'unreviewed';
    onPatch({ review: next });
  };

  return (
    <div ref={wrapper} className="relative flex items-center">
      <ToolButton
        label={view.layout === 'split' ? 'Switch to unified view' : 'Switch to split view'}
        on={view.layout === 'split'}
        onClick={() => onPatch({ layout: view.layout === 'split' ? 'unified' : 'split' })}
      >
        {view.layout === 'split' ? <Columns2 size={14} /> : <Rows3 size={14} />}
      </ToolButton>

      <ToolButton
        label="Word-level diff"
        on={view.wordDiff}
        onClick={() => onPatch({ wordDiff: !view.wordDiff })}
      >
        <WholeWord size={14} />
      </ToolButton>

      <ToolButton
        label="Show whitespace"
        on={view.whitespace}
        onClick={() => onPatch({ whitespace: !view.whitespace })}
      >
        <Pilcrow size={14} />
      </ToolButton>

      <ToolButton
        label="Collapse unchanged lines"
        on={view.foldContext}
        onClick={() => onPatch({ foldContext: !view.foldContext })}
      >
        <UnfoldVertical size={14} />
      </ToolButton>

      <ToolButton
        label={allCollapsed ? 'Expand all hunks' : 'Collapse all hunks'}
        disabled={hunkCount === 0}
        onClick={() =>
          onPatch({
            collapsedHunks: allCollapsed ? [] : Array.from({ length: hunkCount }, (_, i) => i),
          })
        }
      >
        <ChevronsDownUp size={14} />
      </ToolButton>

      <ToolButton
        label={
          view.review === 'reviewed'
            ? 'Reviewed — click to flag'
            : view.review === 'flagged'
              ? 'Flagged — click to clear'
              : 'Mark as reviewed'
        }
        on={view.review !== 'unreviewed'}
        onClick={cycleReview}
      >
        {view.review === 'flagged' ? <Flag size={14} /> : <Check size={14} />}
      </ToolButton>

      <ToolButton label="More actions" on={menu} onClick={() => setMenu((v) => !v)}>
        <MoreHorizontal size={14} />
      </ToolButton>

      <ToolButton label="Restore to the changes list" onClick={onMinimize}>
        <Minimize2 size={14} />
      </ToolButton>

      {menu && (
        <div className="absolute right-0 top-7 z-20 flex w-60 flex-col gap-0.5 rounded-md border border-line bg-elevated p-1 shadow-lg">
          {change?.staged && (
            <MenuItem label="Unstage file" icon={Minus} onClick={() => void unstage(path)} />
          )}
          {change?.unstaged && (
            <MenuItem label="Stage file" icon={Plus} onClick={() => void stage(path)} />
          )}
          {change && change.status !== 'untracked' && (
            <MenuItem
              label="Discard changes…"
              icon={RotateCcw}
              danger
              onClick={() => {
                if (window.confirm(`Discard all changes to ${path}? This cannot be undone.`)) {
                  void discard(path);
                }
                setMenu(false);
              }}
            />
          )}

          <Divider />

          <MenuItem
            label="Copy patch"
            icon={Copy}
            onClick={() => {
              void copyPatch([path], patchOpts);
              setMenu(false);
            }}
          />
          <MenuItem
            label="Copy file path"
            icon={Copy}
            onClick={() => {
              void window.limboo?.system.clipboardWrite(path);
              addToast({ title: 'Path copied', tone: 'success' });
              setMenu(false);
            }}
          />
          <MenuItem
            label="Export patch…"
            icon={Download}
            onClick={() => {
              void savePatch([path], patchOpts);
              setMenu(false);
            }}
          />

          <Divider />

          <MenuItem
            label="Compare with…"
            icon={History}
            onClick={() => {
              if (!compareOpen) void loadBranches();
              setCompareOpen((v) => !v);
            }}
          />
          {compareOpen && (
            <div className="max-h-56 overflow-y-auto rounded-md bg-surface-2/60 p-0.5">
              <CompareOption
                label="Working tree (HEAD)"
                active={!baseRef}
                onClick={() => compareWith({ kind: 'head' })}
              />
              {branches.map((b) => (
                <CompareOption
                  key={`b:${b.name}`}
                  label={`Branch — ${b.name}`}
                  active={baseRef === b.name}
                  onClick={() => compareWith({ kind: 'branch', ref: b.name })}
                />
              ))}
              {checkpoints.map((c) => (
                <CompareOption
                  key={`c:${c.id}`}
                  label={`Checkpoint — ${c.label}`}
                  active={baseRef === c.commit}
                  onClick={() =>
                    compareWith({ kind: 'checkpoint', id: c.id, commit: c.commit, label: c.label })
                  }
                />
              ))}
            </div>
          )}

          <Divider />

          <MenuItem
            label="Reveal in Git history"
            icon={History}
            onClick={() => jumpToGit('history')}
          />
          <MenuItem
            label="Commit changes…"
            icon={GitCommitHorizontal}
            onClick={() => jumpToGit('commit')}
          />
          <MenuItem
            label="Generate commit message"
            icon={Sparkles}
            onClick={() => {
              jumpToGit('commit');
              void useGitStore.getState().generateCommitMessage();
            }}
          />
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-0.5 h-px shrink-0 bg-line" />;
}

function CompareOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-surface-2',
        active ? 'text-accent' : 'text-muted hover:text-fg',
      )}
    >
      <span className="truncate">{label}</span>
      {active && <Check size={11} className="ml-auto shrink-0" />}
    </button>
  );
}
