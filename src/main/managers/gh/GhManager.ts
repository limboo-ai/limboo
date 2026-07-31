/**
 * GitHub CLI integration — optional, detected, never a dependency.
 *
 * `gh` is treated exactly like `git`: a local tool Limboo drives argv-only and
 * reads the state of. When it is absent or logged out, everything else keeps
 * working and the GitHub surface simply hides itself — this manager must never
 * become something the Git panel waits on.
 *
 * SECURITY (CLAUDE.md §6):
 * - **Limboo stores no GitHub credential.** Authentication lives entirely in
 *   the CLI's own config; this manager never passes `--show-token`, never reads
 *   a token, and there is no field on {@link GhState} that could carry one.
 * - The renderer supplies only enums and integers. Every subcommand and every
 *   `--json` field list is a fixed literal chosen here in main.
 * - `gh api` is reachable ONLY from {@link GhManager.commitAuthors}, with one
 *   fixed read-only endpoint built from a remote this module parsed itself.
 *   There is no IPC channel for it and no agent tool, because it can POST —
 *   which is also why it stays out of the agent's read-only allowlist.
 * - Output is redacted inside {@link runGh}, before it can reach a log line.
 *
 * The `cwd` is always the session's effective root, resolved through the same
 * `setActiveRootResolver` seam `GitManager` uses — `gh` infers the repository
 * from the working directory, so a worktree-backed session must not be read
 * against the main checkout.
 */
import { BrowserWindow } from 'electron';
import { IpcEvents } from '@shared/ipc-channels';
import { AVATAR_LIMITS, GH_LIMITS } from '@shared/constants';
import type { GhIssue, GhPullRequest, GhState } from '@shared/types';
import { runGh, resolveGh, supportsAuthJson } from './exec';
import {
  avatarFor,
  identityFromAvatarUrl,
  identityFromEmail,
  identityFromLogin,
  type AvatarIdentity,
} from './avatars';
import {
  parseAuthJson,
  parseAuthText,
  parseCommitAuthors,
  parseIssueList,
  parsePrList,
  parseRemote,
} from './parse';
import { gitText } from '../git/exec';
import { logger } from '../../logger';
import type { WorkspaceManager } from '../WorkspaceManager';
import type { SettingsManager } from '../SettingsManager';

/** PR fields requested from `gh`. A FIXED literal — never renderer-supplied. */
const PR_FIELDS =
  'number,title,state,author,headRefName,baseRefName,url,isDraft,updatedAt,reviewDecision';
const ISSUE_FIELDS = 'number,title,state,author,url,labels,updatedAt';

export type GhListState = 'open' | 'closed' | 'merged' | 'all';

interface Cached<T> {
  value: T;
  at: number;
}

export class GhManager {
  private state: Cached<GhState> | null = null;
  private inFlightState: Promise<GhState> | null = null;
  private prs = new Map<string, Cached<GhPullRequest[]>>();
  private issues = new Map<string, Cached<GhIssue[]>>();
  /** workspaceId -> (lowercased commit email -> "id:N" | "login:x"). */
  private authors = new Map<string, Cached<Map<string, string>>>();
  private activeRootResolver: ((workspaceId: string) => string | null) | null = null;

  constructor(
    private readonly workspace: WorkspaceManager,
    private readonly settings: SettingsManager,
  ) {}

  /**
   * Resolve a workspace's effective execution root (its session worktree when
   * it has one). Injected in the composition root, exactly like GitManager's.
   */
  setActiveRootResolver(fn: (workspaceId: string) => string | null): void {
    this.activeRootResolver = fn;
  }

  /** Invalidate every cache — call when the active workspace changes. */
  invalidate(): void {
    this.state = null;
    this.prs.clear();
    this.issues.clear();
    this.authors.clear();
  }

  /**
   * Classify the local CLI. Single-flight and TTL-cached: the GitHub sub-tab
   * re-reads this on every render, and each miss would otherwise spawn a
   * process.
   */
  async getState(workspaceId: string | null, force = false): Promise<GhState> {
    if (!force && this.state && Date.now() - this.state.at < GH_LIMITS.authTtlMs) {
      return this.state.value;
    }
    if (!force && this.inFlightState) return this.inFlightState;

    this.inFlightState = this.classify(workspaceId, force)
      .then((value) => {
        const previous = this.state?.value.status;
        this.state = { value, at: Date.now() };
        if (previous && previous !== value.status) this.broadcast();
        return value;
      })
      .finally(() => {
        this.inFlightState = null;
      });
    return this.inFlightState;
  }

  private async classify(workspaceId: string | null, force: boolean): Promise<GhState> {
    const checkedAt = Date.now();
    const resolved = await resolveGh(force);
    if (!resolved.found) return { status: 'not-installed', checkedAt };

    const base = { version: resolved.version, checkedAt };
    const repo = await this.resolveRepo(workspaceId);

    try {
      const useJson = await supportsAuthJson();
      const res = useJson
        ? await runGh(['auth', 'status', '--json', 'hosts'])
        : await runGh(['auth', 'status']);

      // With `--json`, gh exits 0 even when unauthenticated — so the PAYLOAD is
      // the authority, never the exit code. Without it, `auth status` writes to
      // stderr, so both streams must be read.
      const hosts = useJson
        ? parseAuthJson(res.stdout) ?? parseAuthText(`${res.stdout}\n${res.stderr}`)
        : parseAuthText(`${res.stdout}\n${res.stderr}`);

      if (hosts.length === 0) {
        return { ...base, status: 'not-authenticated', repo, legacyAuthParse: !useJson };
      }
      const active = hosts.find((h) => h.active) ?? hosts[0];
      return {
        ...base,
        status: 'authenticated',
        account: { login: active.login, host: active.host },
        hosts,
        repo,
        legacyAuthParse: !useJson || undefined,
      };
    } catch (err) {
      logger.warn('gh auth probe failed', err);
      return { ...base, status: 'error', repo, error: describe(err) };
    }
  }

  /**
   * The workspace's GitHub remote.
   *
   * Reuses `gitText(root, ['remote','get-url','origin'])` rather than
   * `gh repo view` — the function already exists, and it is one fewer process
   * than asking the CLI something git already knows.
   */
  private async resolveRepo(
    workspaceId: string | null,
  ): Promise<{ nameWithOwner: string; host: string } | undefined> {
    const root = this.rootFor(workspaceId);
    if (!root) return undefined;
    try {
      const url = await gitText(root, ['remote', 'get-url', 'origin']);
      return (url && parseRemote(url)) || undefined;
    } catch {
      return undefined;
    }
  }

  private rootFor(workspaceId: string | null): string | null {
    if (!workspaceId) return null;
    const ws = this.workspace.getById(workspaceId);
    if (!ws) return null;
    return this.activeRootResolver?.(workspaceId) ?? ws.path;
  }

  /* ------------------------------------------------------------- listings */

  async listPullRequests(
    workspaceId: string,
    opts: { state?: GhListState; limit?: number } = {},
  ): Promise<GhPullRequest[]> {
    const state = opts.state ?? 'open';
    const limit = clampLimit(opts.limit);
    const key = `${workspaceId}:${state}:${limit}`;
    const hit = this.prs.get(key);
    if (hit && Date.now() - hit.at < GH_LIMITS.listTtlMs) return hit.value;

    const root = this.rootFor(workspaceId);
    if (!root) return [];
    const res = await runGh(
      ['pr', 'list', '--json', PR_FIELDS, '--state', state, '--limit', String(limit)],
      { cwd: root },
    );
    if (!res.ok) {
      logger.info(`gh pr list failed: ${res.stderr.slice(0, GH_LIMITS.errorMax)}`);
      return [];
    }
    const value = parsePrList(res.stdout);
    this.prs.set(key, { value, at: Date.now() });
    return value;
  }

  async listIssues(
    workspaceId: string,
    opts: { state?: GhListState; limit?: number } = {},
  ): Promise<GhIssue[]> {
    // `merged` is meaningless for issues; gh rejects it.
    const state = opts.state === 'closed' || opts.state === 'all' ? opts.state : 'open';
    const limit = clampLimit(opts.limit);
    const key = `${workspaceId}:${state}:${limit}`;
    const hit = this.issues.get(key);
    if (hit && Date.now() - hit.at < GH_LIMITS.listTtlMs) return hit.value;

    const root = this.rootFor(workspaceId);
    if (!root) return [];
    const res = await runGh(
      ['issue', 'list', '--json', ISSUE_FIELDS, '--state', state, '--limit', String(limit)],
      { cwd: root },
    );
    if (!res.ok) {
      logger.info(`gh issue list failed: ${res.stderr.slice(0, GH_LIMITS.errorMax)}`);
      return [];
    }
    const value = parseIssueList(res.stdout);
    this.issues.set(key, { value, at: Date.now() });
    return value;
  }

  /** One pull request's detail. `number` is range-validated by the handler. */
  async viewPullRequest(workspaceId: string, number: number): Promise<GhPullRequest | null> {
    const root = this.rootFor(workspaceId);
    if (!root) return null;
    const res = await runGh(['pr', 'view', String(number), '--json', PR_FIELDS], { cwd: root });
    if (!res.ok) return null;
    // `pr view` returns an object; the list parser wants an array.
    return parsePrList(`[${res.stdout}]`)[0] ?? null;
  }

  /** One issue's detail. */
  async viewIssue(workspaceId: string, number: number): Promise<GhIssue | null> {
    const root = this.rootFor(workspaceId);
    if (!root) return null;
    const res = await runGh(['issue', 'view', String(number), '--json', ISSUE_FIELDS], {
      cwd: root,
    });
    if (!res.ok) return null;
    return parseIssueList(`[${res.stdout}]`)[0] ?? null;
  }

  /* ------------------------------------------------------------- comments */

  /**
   * Post a comment on a pull request or issue.
   *
   * The ONLY write this manager performs, and the only one it may ever grow
   * without a fresh decision: no merge, no close, no review, no approve. The
   * agent reaches it through a tool that is deliberately excluded from the
   * `limboo_search` auto-allow set, so every call shows the user the exact body
   * first (see `AgentManager.decideToolUseCore`).
   *
   * The body travels on STDIN via `--body-file -`, never on argv.
   */
  async comment(
    workspaceId: string,
    kind: 'pr' | 'issue',
    number: number,
    body: string,
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    const root = this.rootFor(workspaceId);
    if (!root) return { ok: false, error: 'No repository for this workspace.' };

    const text = body.slice(0, GH_LIMITS.commentBodyMax).trim();
    if (!text) return { ok: false, error: 'The comment body is empty.' };

    const res = await runGh([kind, 'comment', String(number), '--body-file', '-'], {
      cwd: root,
      stdin: text,
    });
    if (!res.ok) {
      return { ok: false, error: res.stderr.slice(0, GH_LIMITS.errorMax) || 'gh comment failed' };
    }
    // The lists now show a stale comment count; drop them rather than lie.
    this.prs.clear();
    this.issues.clear();
    // `gh` prints the new comment's URL on success.
    const url = res.stdout.trim().split(/\s+/).pop();
    return { ok: true, url: url && /^https:\/\//.test(url) ? url : undefined };
  }

  /* -------------------------------------------------------------- avatars */

  /**
   * Resolve this repository's commit emails to GitHub accounts.
   *
   * The ONE place Limboo reaches `api.github.com`, and it exists because no
   * local data can answer the question: a commit carries a name and an email,
   * and only GitHub knows which account owns that email. `GET /repos/{owner}/
   * {repo}/commits` returns the mapping for a whole page at once.
   *
   * SCOPE, deliberately narrow:
   * - Read-only, one fixed endpoint, built from the remote WE parsed — the
   *   renderer and the agent still have no route to `gh api`, and never will.
   * - The request goes through the `gh` CLI, so authentication stays the CLI's
   *   and Limboo still never reads or stores a token.
   * - Gated by `settings.git.avatars.enabled` alongside the image fetch, so one
   *   switch turns off every outbound request this feature makes.
   *
   * PRIVACY COST, stated plainly: this tells GitHub which repository is being
   * browsed. That is why it is opt-out and why the setting says so.
   */
  private async commitAuthors(workspaceId: string): Promise<Map<string, string>> {
    const hit = this.authors.get(workspaceId);
    if (hit && Date.now() - hit.at < GH_LIMITS.authorsTtlMs) return hit.value;

    const empty = new Map<string, string>();
    const root = this.rootFor(workspaceId);
    if (!root) return empty;

    const state = await this.getState(workspaceId);
    // Unauthenticated works for public repos, but a private one would just 404;
    // either way there is no point asking when there is no GitHub remote.
    const repo = state.repo?.nameWithOwner;
    if (!repo) return empty;

    // `nameWithOwner` came from `parseRemote`'s strict regex, so it is already
    // within `GH_ARG_RE` — no interpolation of anything unvalidated.
    const res = await runGh(
      ['api', '--method', 'GET', '-F', `per_page=${AVATAR_LIMITS.batchMax}`, `repos/${repo}/commits`],
      { cwd: root },
    );
    if (!res.ok) {
      logger.info(`gh api commits failed: ${res.stderr.slice(0, GH_LIMITS.errorMax)}`);
      // Cache the miss too: a private repo or an offline machine must not be
      // re-asked on every history render.
      this.authors.set(workspaceId, { value: empty, at: Date.now() });
      return empty;
    }

    // Reduce each author to the numeric id in their avatar URL — an id cannot
    // carry a host or a path, so nothing from the response shapes a request.
    const value = new Map<string, string>();
    for (const [email, who] of parseCommitAuthors(res.stdout)) {
      const identity = identityFromAvatarUrl(who.avatarUrl) ?? identityFromLogin(who.login);
      if (identity) value.set(email, identity.kind === 'id' ? `id:${identity.id}` : `login:${identity.login}`);
    }
    this.authors.set(workspaceId, { value, at: Date.now() });
    return value;
  }

  /**
   * Resolve contributor avatars for a batch of commit emails and/or gh logins.
   *
   * Returns only what resolved — an absent key means "render initials", which
   * is also what the caller gets when the feature is switched off, when the
   * address is not a GitHub noreply one, or when the network is unavailable.
   * The renderer never learns which of those it was, because in every case the
   * answer it needs is the same.
   */
  async avatars(
    input: { emails?: string[]; logins?: string[] },
    workspaceId?: string | null,
  ): Promise<Record<string, string>> {
    if (!this.settings.getAll().git.avatars.enabled) return {};

    const wanted: Array<{ key: string; identity: AvatarIdentity }> = [];
    const seen = new Set<string>();

    const push = (key: string, identity: AvatarIdentity | null): void => {
      if (!identity || seen.has(key) || wanted.length >= AVATAR_LIMITS.batchMax) return;
      seen.add(key);
      wanted.push({ key, identity });
    };

    // Free first: GitHub's noreply addresses carry the account id, so they need
    // no lookup at all. Only what is left over is worth an API call.
    const unresolved: string[] = [];
    for (const email of input.emails ?? []) {
      const local = identityFromEmail(email);
      if (local) push(email, local);
      else if (email) unresolved.push(email);
    }

    // Everything else — personal and corporate addresses, which is most real
    // history — can only be resolved by asking GitHub who owns the email.
    if (unresolved.length > 0 && workspaceId) {
      const resolved = await this.commitAuthors(workspaceId);
      for (const email of unresolved) {
        const ref = resolved.get(email.toLowerCase());
        if (!ref) continue;
        const [kind, value] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
        push(email, kind === 'id' ? { kind: 'id', id: value } : { kind: 'login', login: value });
      }
    }

    for (const login of input.logins ?? []) push(login, identityFromLogin(login));

    const out: Record<string, string> = {};
    // `avatarFor` is individually cached, single-flighted, and concurrency-capped,
    // so settling them together here is safe — and it never rejects.
    await Promise.all(
      wanted.map(async ({ key, identity }) => {
        const value = await avatarFor(identity);
        if (value) out[key] = value;
      }),
    );
    return out;
  }

  /* ---------------------------------------------------------------- push */

  private broadcast(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcEvents.ghChanged);
    }
  }
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return GH_LIMITS.listDefault;
  return Math.max(1, Math.min(GH_LIMITS.listMax, Math.floor(limit)));
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, GH_LIMITS.errorMax);
}
