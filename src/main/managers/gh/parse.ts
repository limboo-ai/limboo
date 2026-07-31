/**
 * Pure parsers for `gh` output — no I/O, no clock, no DB (the `git/parse.ts`
 * and `graph/builder.ts` contract, so these stay trivially testable).
 *
 * Every returned object is rebuilt FIELD BY FIELD from the parsed JSON, never
 * spread. `gh`'s output is data from a process we do not control; spreading it
 * would let unexpected keys ride into renderer state and, from there, into
 * persisted settings — the same rule `SettingsManager.normalize` follows for
 * renderer-authored documents.
 */
import { GH_LIMITS } from '@shared/constants';
import type { GhHost, GhIssue, GhPullRequest } from '@shared/types';

function str(v: unknown, max = GH_LIMITS.titleMax): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined;
}

function int(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined;
}

/** `{ login }` (gh's author/user shape) or a bare string. */
function login(v: unknown): string | undefined {
  if (typeof v === 'string') return str(v, 100);
  if (v && typeof v === 'object') return str((v as { login?: unknown }).login, 100);
  return undefined;
}

/* --------------------------------------------------------------- auth */

/**
 * Parse `gh auth status --json hosts`.
 *
 * TWO documented behaviours matter here. `--json` makes the command **exit 0
 * regardless of authentication problems**, so classification must come from the
 * payload and never from the exit code. And the flag is recent, so a failure to
 * parse is a signal to fall back to {@link parseAuthText}, not to report a
 * logged-out user.
 */
export function parseAuthJson(stdout: string): GhHost[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return null;
  }
  const hostsField = (payload as { hosts?: unknown })?.hosts;
  if (!hostsField || typeof hostsField !== 'object') return null;

  const out: GhHost[] = [];
  // `hosts` is an object keyed by hostname, each value an array of accounts.
  for (const [host, value] of Object.entries(hostsField as Record<string, unknown>)) {
    const hostName = str(host, 253);
    if (!hostName) continue;
    const accounts = Array.isArray(value) ? value : [value];
    for (const account of accounts) {
      if (!account || typeof account !== 'object') continue;
      const a = account as Record<string, unknown>;
      const user = login(a.user ?? a.login ?? a.username);
      if (!user) continue;
      out.push({ host: hostName, login: user, active: a.active === true });
    }
  }
  // Exactly one account and no `active` marker still means that account IS the
  // active one — gh only marks it when there is a choice to disambiguate.
  if (out.length === 1) out[0].active = true;
  return out;
}

/**
 * Fallback parser for a `gh` that predates `auth status --json`.
 *
 * Old `gh` writes `auth status` to **stderr**, not stdout, so callers must hand
 * both streams in. Matches the two shapes the CLI has used:
 *   `✓ Logged in to github.com as octocat (...)`
 *   `✓ Logged in to github.com account octocat (...)`
 */
export function parseAuthText(combined: string): GhHost[] {
  const out: GhHost[] = [];
  const re = /Logged in to (\S+)\s+(?:as|account)\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    const host = str(m[1], 253);
    const user = str(m[2].replace(/[(),]/g, ''), 100);
    if (host && user) out.push({ host, login: user, active: false });
  }
  if (out.length > 0) out[0].active = true;
  return out;
}

/* ------------------------------------------------------------ pr / issue */

function parseArray(stdout: string): unknown[] {
  try {
    const v = JSON.parse(stdout);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Parse `gh pr list --json number,title,state,author,…`. */
export function parsePrList(stdout: string): GhPullRequest[] {
  const out: GhPullRequest[] = [];
  for (const row of parseArray(stdout)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const number = int(r.number);
    const url = str(r.url, 500);
    if (number === undefined || !url) continue;
    out.push({
      number,
      title: str(r.title) ?? '(untitled)',
      state: str(r.state, 32) ?? 'UNKNOWN',
      author: login(r.author),
      headRefName: str(r.headRefName, 255),
      baseRefName: str(r.baseRefName, 255),
      url,
      isDraft: r.isDraft === true,
      updatedAt: str(r.updatedAt, 40) ?? '',
      reviewDecision: str(r.reviewDecision, 40),
    });
  }
  return out;
}

/** Parse `gh issue list --json number,title,state,author,…`. */
export function parseIssueList(stdout: string): GhIssue[] {
  const out: GhIssue[] = [];
  for (const row of parseArray(stdout)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const number = int(r.number);
    const url = str(r.url, 500);
    if (number === undefined || !url) continue;
    const labels = Array.isArray(r.labels)
      ? r.labels
          .map((l) => (l && typeof l === 'object' ? str((l as { name?: unknown }).name, 60) : undefined))
          .filter((l): l is string => !!l)
          .slice(0, 10)
      : [];
    out.push({
      number,
      title: str(r.title) ?? '(untitled)',
      state: str(r.state, 32) ?? 'UNKNOWN',
      author: login(r.author),
      url,
      labels,
      updatedAt: str(r.updatedAt, 40) ?? '',
    });
  }
  return out;
}

/* ------------------------------------------------------------- authors */

/**
 * Map commit emails to GitHub identities from `GET /repos/{owner}/{repo}/commits`.
 *
 * This endpoint is the answer to a problem no local data can solve: a commit
 * carries only a name and an email, and the mapping from an arbitrary email to
 * an account lives on GitHub's side. The response conveniently carries BOTH —
 * `commit.author.email` and the resolved `author.{login,avatar_url}` — so one
 * request resolves a whole page of history rather than one lookup per author.
 *
 * Keys are lowercased: git preserves the case an author typed, GitHub does not
 * treat it as significant, and a case mismatch would silently miss.
 */
export function parseCommitAuthors(stdout: string): Map<string, { login: string; avatarUrl: string }> {
  const out = new Map<string, { login: string; avatarUrl: string }>();
  for (const row of parseArray(stdout)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;

    const commit = r.commit as Record<string, unknown> | undefined;
    const commitAuthor = commit?.author as Record<string, unknown> | undefined;
    const email = str(commitAuthor?.email, 320)?.toLowerCase();

    // `author` is null for a commit GitHub could not attribute — which is the
    // honest answer for an email nobody has added to an account, and must stay
    // a miss rather than becoming a guess.
    const author = r.author as Record<string, unknown> | undefined;
    const login = author ? login_(author.login) : undefined;
    const avatarUrl = str(author?.avatar_url, 512);

    if (!email || !login || !avatarUrl) continue;
    if (!out.has(email)) out.set(email, { login, avatarUrl });
  }
  return out;
}

/** A bare GitHub login, validated. */
function login_(v: unknown): string | undefined {
  const s = str(v, 39);
  return s && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(s) ? s : undefined;
}

/* ----------------------------------------------------------------- remote */

/**
 * Recognise a GitHub remote URL. Handles the https, ssh, and `git@` forms.
 * Embedded credentials are stripped by the caller's redactor before this runs;
 * the pattern additionally refuses a userinfo segment so one cannot survive.
 */
const REMOTE_RE =
  /^(?:https:\/\/|git@|ssh:\/\/git@)([A-Za-z0-9.-]+)[/:]([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

export function parseRemote(url: string): { nameWithOwner: string; host: string } | null {
  const m = REMOTE_RE.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  // Only GitHub (or a GitHub Enterprise host) is meaningful to `gh`.
  if (host !== 'github.com' && !host.endsWith('.github.com') && !host.includes('github')) {
    return null;
  }
  return { nameWithOwner: m[2], host };
}
