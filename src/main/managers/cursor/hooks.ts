/**
 * Session-scoped Cursor hooks config (`<root>/.cursor/hooks.json`).
 *
 * Hooks give the adapter a synchronous per-tool-call decision point that
 * feeds Limboo's EXISTING permission machinery (risk chips, path guard,
 * auto-approval, the interactive PermissionRequest dialog) — the same
 * semantics Claude gets from canUseTool. Every registered hook runs the
 * bundled hookRunner.cjs, which forwards the payload over the per-run bridge
 * pipe and fails closed.
 *
 * CAPABILITY-GATED: the official docs describe hooks for the IDE and cloud
 * agents; CLI support is undocumented. The bridge therefore only ever
 * TIGHTENS enforcement — whether or not hooks fire, the deny-first cli.json
 * and the propose-only/--force posture remain the enforced baseline. Whether
 * a hook actually connected is recorded per run (see RunBridgeServer).
 *
 * SECURITY: the session hooks.json REPLACES a repo-authored one for the
 * duration of the run (restored byte-for-byte after). Repo-authored hooks are
 * arbitrary commands that would execute outside the limboo.json ack-hash
 * trust gate — merging them in would let any cloned repo run code the user
 * never approved.
 */
import { CURSOR_LIMITS } from '@shared/constants';
import { withSessionFile } from './sessionFile';

/**
 * The gate + observability events the bridge registers.
 *
 * `subagentStart`/`subagentStop` are OBSERVABILITY ONLY and strictly
 * best-effort. Cursor documents them as carrying `task`, `tool_call_id`,
 * `subagent_model` and a set of id fields — but the id fields are reported to
 * all carry the same session id, so parent linkage is not derivable from them,
 * and `subagentStop` is reported not to fire at all for background workers.
 * Limboo therefore treats these as a bonus signal that can enrich a row when it
 * arrives and changes nothing when it does not: no permission decision, no
 * lifecycle state, and no UI that breaks by their absence. Cursor's stream
 * carries no `parent_tool_use_id` analogue, so a Cursor run still renders its
 * tool calls flat, exactly as it did before subagent rows existed.
 */
const HOOK_EVENTS = [
  'preToolUse',
  'beforeShellExecution',
  'beforeReadFile',
  'afterFileEdit',
  'subagentStart',
  'subagentStop',
] as const;

/** Quote a path for the hook command string (shell-parsed by Cursor). */
function quoted(p: string): string {
  return `"${p.replace(/"/g, '')}"`;
}

/**
 * Build the hooks.json body registering the bundled runner for every gate
 * event. `nodeCommand` is Electron-as-node (ELECTRON_RUN_AS_NODE rides the
 * run child's environment, which hook processes inherit along with the
 * bridge pipe/token vars).
 *
 * Each event gets its OWN command carrying `--event <name>`. Registering one
 * undiscriminated command for all six left the payload's `hook_event_name` key
 * as the only way the runner could tell which event fired — and if the CLI
 * spells that key differently (hook support in print mode is undocumented, see
 * the header), the runner saw no event, `mapHookEvent` returned null, and the
 * gate denied EVERY read, shell, grep and edit. The argv is authoritative
 * because we write it; the payload key is now only a fallback.
 */
export function buildHooksConfig(nodeCommand: string, runnerPath: string): string {
  const hooks: Record<string, unknown> = {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        // HOOK_EVENTS is a literal `const` tuple — no interpolation surface.
        command: `${quoted(nodeCommand)} ${quoted(runnerPath)} --event ${event}`,
        timeout: CURSOR_LIMITS.hookTimeoutSecs,
        // A runner that crashes or can't reach the bridge must block, not pass.
        failClosed: true,
      },
    ];
  }
  return JSON.stringify({ version: 1, hooks }, null, 2);
}

/**
 * Materialize the session hooks.json for the duration of `fn`, then restore
 * the pre-run bytes. Passing `runnerPath: null` (bundled runner unresolved or
 * hooks disabled) skips the write entirely.
 */
export async function withSessionHooksJson<T>(
  root: string,
  runner: { nodeCommand: string; runnerPath: string } | null,
  fn: () => Promise<T>,
): Promise<T> {
  return withSessionFile(
    root,
    '.cursor/hooks.json',
    () => (runner ? buildHooksConfig(runner.nodeCommand, runner.runnerPath) : null),
    fn,
  );
}
