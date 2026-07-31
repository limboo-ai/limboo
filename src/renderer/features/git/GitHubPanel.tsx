/**
 * The GitHub sub-tab of the Git workspace.
 *
 * A sub-tab rather than a rail tab on purpose: the rail already carries five
 * icons plus two in the title bar, and this is a facet of the repository the
 * Git panel is already showing — not a separate place to be.
 *
 * Theme (CLAUDE.md §4): state reads as WORDS on the existing token ramp. No
 * pills, no badges, no leading glyphs for a label that already says the same
 * thing, no new colors.
 */
import { useEffect, useState } from 'react';
import { CircleDot, GitPullRequest, RefreshCw, X } from 'lucide-react';
import type { GhIssue, GhPullRequest } from '@shared/types';
import { Avatar, CopyButton, EmptyState, IconButton, Spinner } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { relativeTime } from '@/renderer/lib/format';
import { useGhStore } from '@/renderer/stores/useGhStore';

type View = 'pulls' | 'issues';

const INSTALL_URL = 'https://cli.github.com';

export function GitHubPanel() {
  const state = useGhStore((s) => s.state);
  const refresh = useGhStore((s) => s.refresh);
  const [view, setView] = useState<View>('pulls');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Not probed yet — render nothing rather than flashing "not installed".
  if (!state) return null;

  if (state.status === 'not-installed') return <GhMissing />;
  if (state.status === 'error') {
    return (
      <EmptyState
        compact
        icon={GitPullRequest}
        title="GitHub CLI could not be read"
        description={state.error ?? 'The gh command is installed but did not answer.'}
        action={<SecondaryButton onClick={() => void refresh(true)}>Try again</SecondaryButton>}
      />
    );
  }
  if (state.status === 'not-authenticated') return <GhSignedOut />;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1 text-[11px] text-faint">
        <span className="min-w-0 truncate">
          Signed in as <span className="text-muted">{state.account?.login}</span>
          {state.account && state.account.host !== 'github.com' && ` on ${state.account.host}`}
        </span>
        {state.repo && <span className="min-w-0 truncate text-faint">· {state.repo.nameWithOwner}</span>}
        <IconButton label="Refresh" size="sm" className="ml-auto" onClick={() => void refresh(true)}>
          <RefreshCw size={12} />
        </IconButton>
      </div>

      <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
        {(['pulls', 'issues'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] transition-colors',
              view === id ? 'bg-elevated font-semibold text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {id === 'pulls' ? 'Pull requests' : 'Issues'}
          </button>
        ))}
      </div>

      {view === 'pulls' ? <PullRequestList /> : <IssueList />}
    </div>
  );
}

/* -------------------------------------------------------------- lists */

function PullRequestList() {
  const items = useGhStore((s) => s.pullRequests);
  const loading = useGhStore((s) => s.loading);
  const load = useGhStore((s) => s.loadPullRequests);
  const loadAvatars = useGhStore((s) => s.loadAvatars);

  useEffect(() => {
    void load();
  }, [load]);

  // One batched request for the whole page, same as the commit history.
  useEffect(() => {
    if (items.length === 0) return;
    void loadAvatars({ logins: items.map((pr) => pr.author ?? '').filter(Boolean) });
  }, [items, loadAvatars]);

  if (loading && items.length === 0) return <Loading />;
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={GitPullRequest}
        title="No open pull requests"
        description="Open pull requests on this repository's GitHub remote appear here."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((pr) => (
        <PullRequestRow key={pr.number} pr={pr} />
      ))}
    </ul>
  );
}

function IssueList() {
  const items = useGhStore((s) => s.issues);
  const loading = useGhStore((s) => s.loading);
  const load = useGhStore((s) => s.loadIssues);
  const loadAvatars = useGhStore((s) => s.loadAvatars);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (items.length === 0) return;
    void loadAvatars({ logins: items.map((issue) => issue.author ?? '').filter(Boolean) });
  }, [items, loadAvatars]);

  if (loading && items.length === 0) return <Loading />;
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={CircleDot}
        title="No open issues"
        description="Open issues on this repository's GitHub remote appear here."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((issue) => (
        <IssueRow key={issue.number} issue={issue} />
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- rows */

/** State as a WORD, on the existing token ramp — never a coloured pill. */
function stateLabel(pr: GhPullRequest): { text: string; tone: string } {
  if (pr.isDraft) return { text: 'Draft', tone: 'text-faint' };
  if (pr.state === 'MERGED') return { text: 'Merged', tone: 'text-success' };
  if (pr.state === 'CLOSED') return { text: 'Closed', tone: 'text-muted' };
  if (pr.reviewDecision === 'APPROVED') return { text: 'Approved', tone: 'text-success' };
  if (pr.reviewDecision === 'CHANGES_REQUESTED')
    return { text: 'Changes requested', tone: 'text-warning' };
  return { text: 'Open', tone: 'text-success' };
}

function Row({
  number,
  title,
  url,
  author,
  meta,
}: {
  number: number;
  title: string;
  url: string;
  author?: string;
  meta: React.ReactNode;
}) {
  const avatar = useGhStore((s) => (author ? s.avatars[author] : undefined));
  return (
    <li>
      <button
        type="button"
        onClick={() => void window.limboo?.system.openExternal(url)}
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        {author && <Avatar src={avatar} name={author} size={20} shape="square" className="mt-px" />}
        <span className="mt-px shrink-0 text-[11px] tabular-nums text-faint">#{number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-fg">{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">{meta}</span>
        </span>
      </button>
    </li>
  );
}

function PullRequestRow({ pr }: { pr: GhPullRequest }) {
  const label = stateLabel(pr);
  return (
    <Row
      number={pr.number}
      title={pr.title}
      url={pr.url}
      author={pr.author}
      meta={
        <>
          <span className={label.tone}>{label.text}</span>
          {pr.author && <span>· {pr.author}</span>}
          {pr.headRefName && <span className="min-w-0 truncate">· {pr.headRefName}</span>}
          {pr.updatedAt && <span>· {relativeTime(Date.parse(pr.updatedAt))}</span>}
        </>
      }
    />
  );
}

function IssueRow({ issue }: { issue: GhIssue }) {
  return (
    <Row
      number={issue.number}
      title={issue.title}
      url={issue.url}
      author={issue.author}
      meta={
        <>
          <span className={issue.state === 'CLOSED' ? 'text-muted' : 'text-success'}>
            {issue.state === 'CLOSED' ? 'Closed' : 'Open'}
          </span>
          {issue.author && <span>· {issue.author}</span>}
          {issue.labels.length > 0 && (
            <span className="min-w-0 truncate">· {issue.labels.join(', ')}</span>
          )}
          {issue.updatedAt && <span>· {relativeTime(Date.parse(issue.updatedAt))}</span>}
        </>
      }
    />
  );
}

/* ------------------------------------------------------------- states */

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-faint">
      <Spinner size={12} /> Loading…
    </div>
  );
}

/**
 * gh is not installed. Deliberately NON-BLOCKING and scoped to this sub-tab:
 * every other part of the Git workspace works exactly as it did.
 */
function GhMissing() {
  const dismissed = useGhStore((s) => s.bannerDismissed);
  const dismiss = useGhStore((s) => s.dismissBanner);
  const refresh = useGhStore((s) => s.refresh);

  if (dismissed) {
    return (
      <EmptyState
        compact
        icon={GitPullRequest}
        title="GitHub CLI not detected"
        description="Install the GitHub CLI to see pull requests and issues here."
        action={<SecondaryButton onClick={() => void refresh(true)}>Check again</SecondaryButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2">
        <p className="min-w-0 flex-1 text-[11px] text-muted">
          Install the GitHub CLI to browse pull requests and issues without leaving Limboo. It is
          optional — everything else in the Git workspace works without it, and Limboo never stores
          your GitHub credentials.
        </p>
        <IconButton label="Dismiss" size="sm" onClick={dismiss}>
          <X size={12} />
        </IconButton>
      </div>
      <div className="flex items-center gap-2">
        <SecondaryButton onClick={() => void refresh(true)}>Check again</SecondaryButton>
        <SecondaryButton onClick={() => void window.limboo?.system.openExternal(INSTALL_URL)}>
          Installation guide
        </SecondaryButton>
      </div>
    </div>
  );
}

/**
 * gh is installed but logged out. Limboo does NOT run the login itself — it is
 * an interactive browser flow the CLI owns, and shelling into it would mean
 * Limboo standing between the user and their credentials.
 */
function GhSignedOut() {
  const refresh = useGhStore((s) => s.refresh);
  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-[11px] text-muted">
        The GitHub CLI is installed but not signed in. Run this in a terminal — Limboo never handles
        your credentials, so the CLI owns the sign-in flow.
      </p>
      <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">gh auth login</code>
        <CopyButton value="gh auth login" label="Copy sign-in command" />
      </div>
      <div>
        <SecondaryButton onClick={() => void refresh(true)}>Check again</SecondaryButton>
      </div>
    </div>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg transition-colors hover:border-line-strong"
    >
      {children}
    </button>
  );
}
