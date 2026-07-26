/**
 * IPC handlers for the Git Manager. Registered through `handle()`, so every call
 * inherits sender-origin validation. All renderer input is validated here in the
 * main process (CLAUDE.md §6): ids are length-checked, messages/labels are capped,
 * and file paths are validated against the repo root inside the manager. Git is
 * always spawned argv-style (never a shell) by the manager.
 */
import fs from 'node:fs/promises';
import { dialog } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { GIT_LIMITS } from '@shared/constants';
import type {
  GenerateCommitMessageResult,
  GitBlameLine,
  GitBranch,
  GitCheckoutResult,
  GitCheckpoint,
  GitCommit,
  GitCommitDetail,
  GitFileChange,
  GitFileDiff,
  GitPullResult,
  GitPushResult,
  GitStatus,
  GitTag,
} from '@shared/types';
import { handle } from './registry';
import type { GitManager } from '../managers/GitManager';
import type { AgentManager } from '../managers/AgentManager';

function assertId(id: unknown, label = 'id'): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new Error(`git: invalid ${label}`);
  }
}

/**
 * Validate a renderer-supplied options object: every value must be a boolean and
 * every key must be in the allow-list. Rejecting unknown keys / non-primitive
 * values is defense in depth against prototype pollution and argument smuggling.
 */
function assertBoolOpts(opts: unknown, allowed: string[], label: string): void {
  if (opts === undefined) return;
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new Error(`git: invalid ${label}`);
  }
  for (const key of Object.keys(opts)) {
    if (!allowed.includes(key)) throw new Error(`git: unexpected ${label} key: ${key}`);
    const v = (opts as Record<string, unknown>)[key];
    if (v !== undefined && typeof v !== 'boolean') {
      throw new Error(`git: ${label}.${key} must be a boolean`);
    }
  }
}

function assertText(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`git: invalid ${label}`);
  }
}

/**
 * Validate the diff/patch options object. `assertBoolOpts` cannot be used here
 * because `baseRef` is a string — and a string that becomes a git argv element,
 * which is exactly the kind of value that must not arrive unchecked. The ref's
 * SHAPE is then re-validated by `sanitizeRef` inside the manager; this is the
 * boundary length/type/key check.
 */
function assertDiffOpts(
  opts: unknown,
  label = 'diff options',
): asserts opts is { staged?: boolean; baseRef?: string } | undefined {
  if (opts === undefined) return;
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new Error(`git: invalid ${label}`);
  }
  for (const key of Object.keys(opts)) {
    if (key !== 'staged' && key !== 'baseRef') {
      throw new Error(`git: unexpected ${label} key: ${key}`);
    }
  }
  const { staged, baseRef } = opts as { staged?: unknown; baseRef?: unknown };
  if (staged !== undefined && typeof staged !== 'boolean') {
    throw new Error(`git: ${label}.staged must be a boolean`);
  }
  if (
    baseRef !== undefined &&
    (typeof baseRef !== 'string' || baseRef.length === 0 || baseRef.length > GIT_LIMITS.refNameMax)
  ) {
    throw new Error(`git: invalid ${label}.baseRef`);
  }
}

/** Validate the history options. `path` becomes a git pathspec, so it is checked. */
function assertLogOpts(
  opts: unknown,
): asserts opts is { limit?: number; offset?: number; path?: string } | undefined {
  if (opts === undefined) return;
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new Error('git: invalid log options');
  }
  for (const key of Object.keys(opts)) {
    if (key !== 'limit' && key !== 'offset' && key !== 'path') {
      throw new Error(`git: unexpected log options key: ${key}`);
    }
  }
  const { limit, offset, path } = opts as {
    limit?: unknown;
    offset?: unknown;
    path?: unknown;
  };
  for (const [name, value] of [
    ['limit', limit],
    ['offset', offset],
  ] as const) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`git: log options.${name} must be a number`);
    }
  }
  if (
    path !== undefined &&
    (typeof path !== 'string' ||
      path.length === 0 ||
      path.length > GIT_LIMITS.patchPathMax ||
      path.includes('\0'))
  ) {
    throw new Error('git: invalid log options.path');
  }
}

/** Validate a renderer-supplied list of repo paths for a patch request. */
function assertPaths(paths: unknown): asserts paths is string[] {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > GIT_LIMITS.patchPathsMax) {
    throw new Error('git: invalid paths');
  }
  for (const p of paths) {
    if (
      typeof p !== 'string' ||
      p.length === 0 ||
      p.length > GIT_LIMITS.patchPathMax ||
      p.includes('\0')
    ) {
      throw new Error('git: invalid path');
    }
  }
}

export function registerGitHandlers(git: GitManager, agent: AgentManager): void {
  handle<[string], GitStatus>(IpcChannels.gitStatus, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.status(wsId);
  });

  handle<[string, string, { staged?: boolean; baseRef?: string }?], GitFileDiff>(
    IpcChannels.gitDiff,
    (_e, wsId, path, opts) => {
      assertId(wsId, 'workspaceId');
      assertDiffOpts(opts);
      return git.diff(wsId, path, opts ?? {});
    },
  );

  handle<
    [string, string[], { staged?: boolean; baseRef?: string }?],
    { text: string; truncated: boolean }
  >(IpcChannels.gitPatchText, (_e, wsId, paths, opts) => {
    assertId(wsId, 'workspaceId');
    assertPaths(paths);
    assertDiffOpts(opts);
    return git.patchText(wsId, paths, opts ?? {});
  });

  handle<
    [string, string[], { staged?: boolean; baseRef?: string }?],
    { saved: boolean; path?: string }
  >(IpcChannels.gitPatchSave, async (_e, wsId, paths, opts) => {
    assertId(wsId, 'workspaceId');
    assertPaths(paths);
    assertDiffOpts(opts);
    const { text } = await git.patchText(wsId, paths, opts ?? {});
    if (!text) return { saved: false };
    // The renderer NEVER supplies a destination: main owns the dialog and the
    // write, exactly like `graph:save`. This is the only filesystem write in the
    // diff review path.
    const suggested =
      paths.length === 1
        ? `${(paths[0].split('/').pop() ?? 'changes').replace(/[^\w.-]/g, '_')}.patch`
        : 'changes.patch';
    const result = await dialog.showSaveDialog({
      title: 'Export patch',
      defaultPath: suggested,
      filters: [
        { name: 'Patch', extensions: ['patch', 'diff'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, text, 'utf8');
    return { saved: true, path: result.filePath };
  });

  handle<[string, string], void>(IpcChannels.gitStage, (_e, wsId, path) => {
    assertId(wsId, 'workspaceId');
    return git.stage(wsId, path);
  });

  handle<[string, string], void>(IpcChannels.gitUnstage, (_e, wsId, path) => {
    assertId(wsId, 'workspaceId');
    return git.unstage(wsId, path);
  });

  handle<[string], void>(IpcChannels.gitStageAll, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.stageAll(wsId);
  });

  handle<[string], void>(IpcChannels.gitUnstageAll, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.unstageAll(wsId);
  });

  handle<[string, string], void>(IpcChannels.gitDiscard, (_e, wsId, path) => {
    assertId(wsId, 'workspaceId');
    return git.discard(wsId, path);
  });

  handle<[string, string], GitCommit | null>(IpcChannels.gitCommit, (_e, wsId, message) => {
    assertId(wsId, 'workspaceId');
    assertText(message, GIT_LIMITS.commitMessageMax, 'commit message');
    return git.commit(wsId, message);
  });

  // AI commit-message generation: the ONLY renderer input is the workspace id —
  // all git context (status / staged diff / recent subjects) is assembled in the
  // main process by GitManager and size-capped by GIT_LIMITS.commitGen. The
  // sub-agent run is tool-less and only proposes text; it never commits.
  handle<[string], GenerateCommitMessageResult>(
    IpcChannels.gitCommitMessageGenerate,
    async (_e, wsId) => {
      assertId(wsId, 'workspaceId');
      const ctx = await git.buildCommitContext(wsId);
      if (!ctx) return { ok: false, reason: 'error', error: 'Not a git repository' };
      if (ctx.files.length === 0) return { ok: false, reason: 'no-staged' };
      return agent.generateCommitMessage(wsId, ctx);
    },
  );

  handle<[string], void>(IpcChannels.gitCommitMessageCancel, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    agent.cancelCommitMessage(wsId);
  });

  handle<[string, { limit?: number; offset?: number; path?: string }?], GitCommit[]>(
    IpcChannels.gitLog,
    (_e, wsId, opts) => {
      assertId(wsId, 'workspaceId');
      assertLogOpts(opts);
      return git.log(wsId, opts ?? {});
    },
  );

  handle<[string, string], GitCommitDetail | null>(
    IpcChannels.gitCommitDetail,
    (_e, wsId, hash) => {
      assertId(wsId, 'workspaceId');
      assertText(hash, GIT_LIMITS.refNameMax, 'commit hash');
      return git.commitDetail(wsId, hash);
    },
  );

  handle<[string], GitBranch[]>(IpcChannels.gitBranches, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.branches(wsId);
  });

  handle<[string, string, { force?: boolean }?], GitCheckoutResult>(
    IpcChannels.gitCheckout,
    (_e, wsId, branch, opts) => {
      assertId(wsId, 'workspaceId');
      assertText(branch, GIT_LIMITS.refNameMax, 'branch');
      return git.checkout(wsId, branch, opts ?? {});
    },
  );

  handle<[string, string, boolean?], GitCheckoutResult>(
    IpcChannels.gitCreateBranch,
    (_e, wsId, name, checkout) => {
      assertId(wsId, 'workspaceId');
      assertText(name, GIT_LIMITS.refNameMax, 'branch name');
      return git.createBranch(wsId, name, checkout !== false);
    },
  );

  handle<[string], GitTag[]>(IpcChannels.gitTags, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.tags(wsId);
  });

  handle<[string, string, string?], void>(IpcChannels.gitCreateTag, (_e, wsId, name, message) => {
    assertId(wsId, 'workspaceId');
    assertText(name, GIT_LIMITS.refNameMax, 'tag name');
    if (message !== undefined && (typeof message !== 'string' || message.length > GIT_LIMITS.commitMessageMax)) {
      throw new Error('git: invalid tag message');
    }
    return git.createTag(wsId, name, message);
  });

  handle<[string, string], GitBlameLine[]>(IpcChannels.gitBlame, (_e, wsId, path) => {
    assertId(wsId, 'workspaceId');
    return git.blame(wsId, path);
  });

  handle<[string], boolean>(IpcChannels.gitFetch, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.fetch(wsId);
  });

  handle<[string, { setUpstream?: boolean; force?: boolean }?], GitPushResult>(
    IpcChannels.gitPush,
    (_e, wsId, opts) => {
      assertId(wsId, 'workspaceId');
      assertBoolOpts(opts, ['setUpstream', 'force'], 'push options');
      return git.push(wsId, opts ?? {});
    },
  );

  handle<[string, { rebase?: boolean }?], GitPullResult>(
    IpcChannels.gitPull,
    (_e, wsId, opts) => {
      assertId(wsId, 'workspaceId');
      assertBoolOpts(opts, ['rebase'], 'pull options');
      return git.pull(wsId, opts ?? {});
    },
  );

  handle<[string], boolean>(IpcChannels.gitInit, (_e, wsId) => {
    assertId(wsId, 'workspaceId');
    return git.init(wsId);
  });

  handle<[string, string, string, { messageId?: string }?], GitCheckpoint | null>(
    IpcChannels.gitCheckpointCreate,
    (_e, wsId, sessionId, label, opts) => {
      assertId(wsId, 'workspaceId');
      assertId(sessionId, 'sessionId');
      assertText(label, GIT_LIMITS.refNameMax, 'checkpoint label');
      // Rebuild renderer opts from an explicit allow-list — never spread them.
      return git.createCheckpoint(wsId, sessionId, label, {
        messageId: typeof opts?.messageId === 'string' ? opts.messageId : undefined,
      });
    },
  );

  handle<[string], GitCheckpoint[]>(IpcChannels.gitCheckpointList, (_e, sessionId) => {
    assertId(sessionId, 'sessionId');
    return git.listCheckpoints(sessionId);
  });

  handle<[string, string], GitFileChange[]>(
    IpcChannels.gitCheckpointDiff,
    (_e, wsId, checkpointId) => {
      assertId(wsId, 'workspaceId');
      assertId(checkpointId, 'checkpointId');
      return git.diffCheckpoint(wsId, checkpointId);
    },
  );

  handle<[string, string], boolean>(
    IpcChannels.gitCheckpointRestore,
    (_e, wsId, checkpointId) => {
      assertId(wsId, 'workspaceId');
      assertId(checkpointId, 'checkpointId');
      return git.restoreCheckpoint(wsId, checkpointId);
    },
  );

  handle<[string, string], void>(IpcChannels.gitCheckpointDelete, (_e, wsId, checkpointId) => {
    assertId(wsId, 'workspaceId');
    assertId(checkpointId, 'checkpointId');
    return git.deleteCheckpoint(wsId, checkpointId);
  });
}
