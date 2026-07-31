/**
 * Label/detail composition and bounds for `git` conversation-stream entries.
 *
 * Pure — no DB, no IPC, no clock (the `graph/builder.ts` contract). Audit prose
 * is composed in MAIN, never in the renderer, so every surface reading the
 * activity feed sees the same words.
 */
import { ACTIVITY_LIMITS } from '@shared/constants';
import type { GitActivityKind, GitActivityPayload } from '@shared/types';

const PATHS_MAX = 20;
const PATH_MAX = 512;
const COMMAND_MAX = 300;

/** Past-tense verb per operation. `ok: false` flips it to an attempt. */
const VERB: Record<GitActivityKind, { done: string; failed: string }> = {
  commit: { done: 'Committed', failed: 'Commit failed' },
  stage: { done: 'Staged', failed: 'Stage failed' },
  unstage: { done: 'Unstaged', failed: 'Unstage failed' },
  discard: { done: 'Discarded changes', failed: 'Discard failed' },
  checkout: { done: 'Switched branch', failed: 'Branch switch failed' },
  branch: { done: 'Created branch', failed: 'Branch creation failed' },
  tag: { done: 'Created tag', failed: 'Tag creation failed' },
  fetch: { done: 'Fetched from remote', failed: 'Fetch failed' },
  push: { done: 'Pushed', failed: 'Push failed' },
  pull: { done: 'Pulled', failed: 'Pull failed' },
  init: { done: 'Initialized repository', failed: 'Repository init failed' },
  'checkpoint-create': { done: 'Created checkpoint', failed: 'Checkpoint failed' },
  'checkpoint-restore': { done: 'Restored checkpoint', failed: 'Checkpoint restore failed' },
  'checkpoint-delete': { done: 'Deleted checkpoint', failed: 'Checkpoint delete failed' },
};

/**
 * Cap every string and array before the payload is persisted or broadcast. A
 * path list from a stage-all can be arbitrarily long, and this row lives in the
 * conversation forever.
 */
export function clampGitPayload(p: GitActivityPayload): GitActivityPayload {
  const out: GitActivityPayload = {
    kind: p.kind,
    origin: p.origin === 'agent' ? 'agent' : 'user',
    ok: p.ok === true,
  };
  if (p.paths?.length) {
    out.paths = p.paths.slice(0, PATHS_MAX).map((s) => String(s).slice(0, PATH_MAX));
  }
  if (p.branch) out.branch = String(p.branch).slice(0, 255);
  if (p.ref) out.ref = String(p.ref).slice(0, 255);
  if (p.commit) out.commit = String(p.commit).slice(0, 64);
  if (p.checkpointId) out.checkpointId = String(p.checkpointId).slice(0, 128);
  if (p.terminalId) out.terminalId = String(p.terminalId).slice(0, 128);
  if (p.command) out.command = String(p.command).slice(0, COMMAND_MAX);
  if (typeof p.adds === 'number' && Number.isFinite(p.adds)) out.adds = Math.max(0, p.adds);
  if (typeof p.dels === 'number' && Number.isFinite(p.dels)) out.dels = Math.max(0, p.dels);
  return out;
}

/** The one-line title shown in the stream. */
export function gitActivityLabel(p: GitActivityPayload): string {
  const verb = VERB[p.kind] ?? { done: 'Git operation', failed: 'Git operation failed' };
  const base = p.ok ? verb.done : verb.failed;

  if (!p.ok) return base.slice(0, ACTIVITY_LIMITS.labelMax);

  switch (p.kind) {
    case 'stage':
    case 'unstage':
    case 'discard':
      return `${base} ${fileCount(p.paths)}`.slice(0, ACTIVITY_LIMITS.labelMax);
    case 'checkout':
    case 'branch':
    case 'tag':
      return `${base}${p.ref ? ` ${p.ref}` : ''}`.slice(0, ACTIVITY_LIMITS.labelMax);
    case 'push':
    case 'pull':
      return `${base}${p.branch ? ` ${p.branch}` : ''}`.slice(0, ACTIVITY_LIMITS.labelMax);
    default:
      return base.slice(0, ACTIVITY_LIMITS.labelMax);
  }
}

/** Secondary line — omitted entirely when there is nothing worth adding. */
export function gitActivityDetail(p: GitActivityPayload): string | undefined {
  const parts: string[] = [];
  if (p.kind === 'commit' && p.commit) parts.push(p.commit);
  if (p.paths?.length && p.kind === 'commit') parts.push(fileCount(p.paths));
  if (p.branch && p.kind !== 'push' && p.kind !== 'pull') parts.push(`on ${p.branch}`);
  if (p.paths?.length === 1 && p.kind !== 'commit') parts.push(p.paths[0]);
  const detail = parts.join(' · ');
  return detail ? detail.slice(0, ACTIVITY_LIMITS.detailMax) : undefined;
}

function fileCount(paths: string[] | undefined): string {
  const n = paths?.length ?? 0;
  return `${n} file${n === 1 ? '' : 's'}`;
}
