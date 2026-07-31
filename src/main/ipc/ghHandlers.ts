/**
 * IPC handlers for the optional GitHub CLI integration. Registered through
 * `handle()`, so every call inherits sender-origin validation.
 *
 * The validation posture here is stricter than for git, because every value
 * that survives becomes an element of a `gh` argv:
 * - the workspace id is length-capped (`assertId`),
 * - `state` must be one of a fixed literal set (`assertEnum`),
 * - `limit` and a PR/issue `number` are integers inside a range WE chose
 *   (`assertInt`) — never a renderer-authored string,
 * - the subcommand and every `--json` field list are fixed literals in
 *   `GhManager`, unreachable from here.
 *
 * There is no handler for `gh api` and none may be added: it can POST, which is
 * exactly why it is also excluded from the agent's read-only allowlist.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { AVATAR_LIMITS, GH_LIMITS } from '@shared/constants';
import type { GhIssue, GhPullRequest, GhState } from '@shared/types';
import { handle } from './registry';
import { assertBoolOpts, assertEnum, assertId, assertInt } from './validate';
import type { GhListState, GhManager } from '../managers/gh/GhManager';

const LIST_STATES = ['open', 'closed', 'merged', 'all'] as const;

/** Highest issue/PR number we will pass through. Well past any real repo. */
const NUMBER_MAX = 10_000_000;

interface ListOpts {
  state?: GhListState;
  limit?: number;
}

/**
 * Validate the list options object. `assertBoolOpts` cannot be used: `state` is
 * a string and `limit` a number, and both become argv elements — so each is
 * checked against an explicit allow-list / range instead.
 */
function assertListOpts(opts: unknown, allowedStates: readonly string[]): ListOpts {
  if (opts === undefined) return {};
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new Error('gh: invalid list options');
  }
  const out: ListOpts = {};
  for (const key of Object.keys(opts)) {
    if (key !== 'state' && key !== 'limit') {
      throw new Error(`gh: unexpected list options key: ${key}`);
    }
  }
  const raw = opts as Record<string, unknown>;
  if (raw.state !== undefined) {
    out.state = assertEnum(raw.state, allowedStates, 'state', 'gh') as GhListState;
  }
  if (raw.limit !== undefined) {
    out.limit = assertInt(raw.limit, 1, GH_LIMITS.listMax, 'limit', 'gh');
  }
  return out;
}

export function registerGhHandlers(gh: GhManager): void {
  handle<[string | null, { force?: boolean }?], GhState>(
    IpcChannels.ghState,
    (_e, workspaceId, opts) => {
      if (workspaceId !== null) assertId(workspaceId, 'workspaceId', 'gh');
      assertBoolOpts(opts, ['force'], 'state options', 'gh');
      return gh.getState(workspaceId, opts?.force === true);
    },
  );

  handle<[string, ListOpts?], GhPullRequest[]>(
    IpcChannels.ghPullRequests,
    (_e, workspaceId, opts) => {
      assertId(workspaceId, 'workspaceId', 'gh');
      return gh.listPullRequests(workspaceId, assertListOpts(opts, LIST_STATES));
    },
  );

  handle<[string, number], GhPullRequest | null>(
    IpcChannels.ghPullRequest,
    (_e, workspaceId, number) => {
      assertId(workspaceId, 'workspaceId', 'gh');
      return gh.viewPullRequest(workspaceId, assertInt(number, 1, NUMBER_MAX, 'number', 'gh'));
    },
  );

  handle<[string, ListOpts?], GhIssue[]>(IpcChannels.ghIssues, (_e, workspaceId, opts) => {
    assertId(workspaceId, 'workspaceId', 'gh');
    // `merged` is meaningless for issues and gh rejects it.
    return gh.listIssues(workspaceId, assertListOpts(opts, ['open', 'closed', 'all']));
  });

  handle<[string, number], GhIssue | null>(IpcChannels.ghIssue, (_e, workspaceId, number) => {
    assertId(workspaceId, 'workspaceId', 'gh');
    return gh.viewIssue(workspaceId, assertInt(number, 1, NUMBER_MAX, 'number', 'gh'));
  });

  handle<[{ emails?: string[]; logins?: string[] }, (string | null)?], Record<string, string>>(
    IpcChannels.ghAvatars,
    (_e, input, workspaceId) => {
      if (workspaceId !== undefined && workspaceId !== null) {
        assertId(workspaceId, 'workspaceId', 'gh');
      }
      return gh.avatars(assertAvatarInput(input), workspaceId ?? null);
    },
  );
}

/**
 * Validate the avatar batch. These strings never become argv — they are matched
 * against the strict noreply/login regexes in `avatars.ts`, which reject
 * everything they do not recognise — but they still have to be bounded here so
 * a hostile renderer cannot hand main an unbounded array to iterate.
 */
function assertAvatarInput(input: unknown): { emails: string[]; logins: string[] } {
  if (input === undefined || input === null) return { emails: [], logins: [] };
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('gh: invalid avatar request');
  }
  for (const key of Object.keys(input)) {
    if (key !== 'emails' && key !== 'logins') {
      throw new Error(`gh: unexpected avatar request key: ${key}`);
    }
  }
  const raw = input as { emails?: unknown; logins?: unknown };
  return { emails: assertStrings(raw.emails), logins: assertStrings(raw.logins) };
}

function assertStrings(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('gh: invalid avatar list');
  return value
    .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 320)
    .slice(0, AVATAR_LIMITS.batchMax);
}
