/**
 * The activation ribbon — a thin, transient line saying that main is still
 * rebinding the root-bound services after a session or workspace switch.
 *
 * Deliberately NOT a gate. The session list switches immediately and the cached
 * conversation renders underneath, because blocking the UI on a cold search
 * index would turn a slow switch into a frozen window. What the ribbon buys is
 * honesty: while it is up, the git status and search results on screen may still
 * describe the previous root, and the composer is disabled so a prompt cannot be
 * sent against a workspace the agent has not been rebound to yet.
 *
 * Follows the `MissingWorktreeBanner` idiom — same height, same border, same
 * typographic weight — so a session's chrome does not shift as banners appear.
 */
import { Loader2 } from 'lucide-react';
import type { SessionActivationState } from '@shared/types';
import { useSessionStore } from '@/renderer/stores/useSessionStore';

/** What each step is actually doing, in the user's terms rather than ours. */
const STEP_LABEL: Record<NonNullable<SessionActivationState['step']>, string> = {
  workspace: 'Releasing the previous workspace…',
  worktree: 'Resolving the working tree…',
  files: 'Rebinding the file watcher…',
  git: 'Refreshing repository status…',
  search: 'Updating the search index…',
  memory: 'Scoping project memory…',
  mcp: 'Rebinding MCP servers…',
};

/**
 * True while THIS session's activation is still running. Exported so the
 * composer can disable send from the same signal the ribbon renders from —
 * one source, so the two can never disagree.
 */
export function useIsActivating(sessionId: string | null): boolean {
  return useSessionStore((s) => {
    const a = s.activation;
    if (!a || a.phase !== 'activating') return false;
    // An activation for a different session must not disable this one. During a
    // fast switch main may still be reporting the session being left.
    return a.sessionId === null || a.sessionId === sessionId;
  });
}

export function ActivationRibbon({ sessionId }: { sessionId: string }) {
  const activation = useSessionStore((s) => s.activation);
  const activating = useIsActivating(sessionId);

  // The error line persists (it is terminal and the user should see it); the
  // progress line disappears the moment activation settles.
  if (!activating && activation?.phase !== 'error') return null;

  const label =
    activation?.phase === 'error'
      ? `Could not finish switching sessions — ${activation.error ?? 'unknown error'}`
      : (activation?.step && STEP_LABEL[activation.step]) || 'Switching session…';

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
      {activating ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-accent" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{label}</span>
    </div>
  );
}
