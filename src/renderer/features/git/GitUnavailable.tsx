/**
 * Onboarding shown when the `git` binary itself is missing.
 *
 * This is deliberately a DIFFERENT state from "not a git repository". Both
 * previously rendered the same empty state offering **Initialize git** — an
 * action that cannot possibly succeed without git, and that failed with an
 * opaque toast. See `main/managers/git/environment.ts` for why the two states
 * were indistinguishable until now.
 *
 * Theme (CLAUDE.md §4): status reads as words, not badges. No pill, no leading
 * glyph beyond the shared `EmptyState` icon, no new colors, no gradient.
 */
import { FolderGit2 } from 'lucide-react';
import type { GitEnvironment } from '@shared/types';
import { CopyButton, EmptyState } from '@/renderer/components/ui';
import { useGitStore } from '@/renderer/stores/useGitStore';

interface InstallHint {
  /** What to run, shown verbatim and copyable. */
  command: string;
  /** Where the official installer lives. */
  url: string;
  /** One line of context above the command. */
  note: string;
}

/**
 * Per-platform install guidance. `platform` is reported by MAIN on the
 * environment payload — the renderer must never infer the OS from
 * `navigator.platform`, which is deprecated and lies under emulation.
 */
const HINTS: Record<string, InstallHint> = {
  darwin: {
    command: 'brew install git',
    url: 'https://git-scm.com/download/mac',
    note: 'With Homebrew:',
  },
  win32: {
    command: 'winget install --id Git.Git -e',
    url: 'https://git-scm.com/download/win',
    note: 'In PowerShell or Terminal:',
  },
};

const LINUX_HINT: InstallHint = {
  command: 'sudo apt install git',
  url: 'https://git-scm.com/download/linux',
  note: 'On Debian/Ubuntu (use your distribution’s package manager):',
};

export function GitUnavailable({ env }: { env: GitEnvironment }) {
  const loadEnvironment = useGitStore((s) => s.loadEnvironment);
  const hint = HINTS[env.platform] ?? LINUX_HINT;

  return (
    <EmptyState
      icon={FolderGit2}
      title="Git isn't installed"
      description="Limboo builds on Git for version history, branches, checkpoints, per-session worktrees, and reviewing the agent's work. Install Git to enable all of it — nothing else in the app is affected."
      actions={
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <div className="w-full text-left">
            <p className="mb-1.5 text-[11px] text-faint">{hint.note}</p>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                {hint.command}
              </code>
              <CopyButton value={hint.command} label="Copy install command" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadEnvironment(true)}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-base hover:opacity-90"
            >
              Check again
            </button>
            <button
              type="button"
              onClick={() => void window.limboo?.system.openExternal(hint.url)}
              className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-line-strong"
            >
              Installation guide
            </button>
          </div>

          {env.error && <p className="text-[11px] text-faint">{env.error}</p>}
        </div>
      }
    />
  );
}
