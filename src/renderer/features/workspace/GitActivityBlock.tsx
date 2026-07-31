/**
 * A git operation as it appears in the conversation stream.
 *
 * A ROW, never a card (CLAUDE.md "Rows are never cards"): it matches
 * `InlineMarkerRow`'s typographic language exactly — same size, same muted
 * tone — because a git operation is part of the same continuous narrative as
 * every other marker, not a framed artifact sitting inside it.
 *
 * What makes it worth its own component is the ACTION row: the structured
 * `GitActivityPayload` carries the file paths, commit hash, and checkpoint id
 * needed to jump somewhere real, which a plain status marker could never do.
 *
 * Provider-neutral: nothing here reads which coding provider was running. The
 * only distinction drawn is agent-vs-user (`payload.origin`).
 */
import {
  Check,
  CircleAlert,
  Copy,
  FileDiff,
  FolderOpen,
  History,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react';
import type { AgentActivityItem, GitActivityPayload } from '@shared/types';
import { DiffStat } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useTerminalStore } from '@/renderer/stores/useTerminalStore';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';

export function GitActivityBlock({ item }: { item: AgentActivityItem }) {
  const git = item.git;
  if (!git) return null;

  return (
    // `focus-within` alongside `group-hover`: a toolbar reachable only by mouse
    // is not reachable (the MessageActions rule).
    <div className="group/git flex items-center gap-2 px-1 text-[11.5px]">
      {git.ok ? (
        <Check size={12} className="shrink-0 text-success" />
      ) : (
        <CircleAlert size={12} className="shrink-0 text-danger" />
      )}
      <span
        className={cn('shrink-0 truncate', git.ok ? 'text-faint' : 'text-danger')}
        title={item.detail}
      >
        {item.label}
      </span>
      {(git.adds ?? 0) + (git.dels ?? 0) > 0 && (
        <DiffStat adds={git.adds ?? 0} dels={git.dels ?? 0} />
      )}
      {item.detail && <span className="min-w-0 truncate text-faint/70">{item.detail}</span>}
      <GitActions git={git} />
    </div>
  );
}

/** Contextual actions. Each is shown only when its payload field exists. */
function GitActions({ git }: { git: GitActivityPayload }) {
  const actions: Array<{ key: string; label: string; icon: typeof FileDiff; run: () => void }> = [];

  if (git.paths?.length === 1) {
    const path = git.paths[0];
    actions.push({
      key: 'diff',
      label: 'Open diff',
      icon: FileDiff,
      run: () => {
        useGitStore.getState().setFocus({ view: 'status', path });
        const sessionId = useSessionStore.getState().selectedId;
        if (sessionId) {
          useDocumentStore.getState().promote(sessionId, { kind: 'diff', path, staged: false });
        }
      },
    });
  } else if ((git.paths?.length ?? 0) > 1) {
    actions.push({
      key: 'reveal',
      label: 'Reveal files',
      icon: FolderOpen,
      run: () => {
        useGitStore.getState().setFocus({ view: 'status' });
        useLayoutStore.getState().setActiveTab('git');
      },
    });
  }

  if (git.commit) {
    const hash = git.commit;
    actions.push({
      key: 'commit',
      label: 'View commit',
      icon: History,
      run: () => {
        // `GitFocus.hash` already exists (the Work Graph sets it) — no new type.
        useGitStore.getState().setFocus({ view: 'history', hash });
        useLayoutStore.getState().setActiveTab('git');
      },
    });
  }

  if (git.checkpointId && git.kind === 'checkpoint-create') {
    const id = git.checkpointId;
    actions.push({
      key: 'restore',
      label: 'Restore checkpoint',
      icon: RotateCcw,
      run: () => {
        // Same confirmation the Checkpoints view uses — one restore path, one
        // prompt, so this cannot become a second, weaker gate.
        const ok = window.confirm(
          'Restore this checkpoint? Files the agent created since then are removed, ' +
            'and a safety checkpoint is taken first.',
        );
        if (ok) void useGitStore.getState().restoreCheckpoint(id);
      },
    });
  }

  if (git.terminalId) {
    const terminalId = git.terminalId;
    actions.push({
      key: 'terminal',
      label: 'Focus terminal',
      icon: TerminalSquare,
      run: () => {
        useLayoutStore.getState().setTerminalOpen(true);
        const ws = useWorkspaceStore.getState().activeId;
        if (ws) useTerminalStore.getState().setActive(ws, terminalId);
      },
    });
  }

  if (git.command) {
    const command = git.command;
    actions.push({
      key: 'copy',
      label: 'Copy command',
      icon: Copy,
      // Through the preload bridge, never `navigator.clipboard` — main owns the
      // native integration and caps the payload.
      run: () => void window.limboo?.system.clipboardWrite(command),
    });
  }

  if (actions.length === 0) return null;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/git:opacity-100 group-focus-within/git:opacity-100">
      {actions.map(({ key, label, icon: Icon, run }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          onClick={run}
          className="rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100"
        >
          <Icon size={11} />
        </button>
      ))}
    </div>
  );
}
