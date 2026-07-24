/**
 * Cursor OS-level sandbox translation (defense-in-depth Layer 3, Cursor side).
 *
 * Limboo's ONE provider-neutral sandbox policy ({@link EffectiveSandbox},
 * resolved in `sandbox/policy.ts`) is translated here into the two mechanisms
 * the cursor-agent CLI understands:
 *
 *  1. a session-scoped `.cursor/sandbox.json` — the declarative jail
 *     (`additionalReadwritePaths` = extra writable dirs beyond the workspace,
 *     `additionalReadonlyPaths`, `networkPolicy`), written for the duration of a
 *     run and restored byte-for-byte afterwards (like every other generated
 *     session file, so `git status` stays clean); and
 *  2. the `--sandbox enabled|disabled` argv flag ({@link sandboxArgv}).
 *
 * The workspace itself is already the writable root (the CLI is spawned with
 * `--workspace <worktree>`), and Limboo's own `userData`/secrets are denied by
 * the deny-first `.cursor/cli.json` rules — so this file only carries the
 * *widenings* (extra writable paths) and the network policy. The declarative
 * config is best-effort augmentation; the enforced floor remains the cli.json
 * permission rules plus the `--workspace` confinement.
 */
import { withSessionFile, safeParseObject, copySafeKeys } from './sessionFile';
import type { EffectiveSandbox } from '../sandbox/policy';

/** The `.cursor/sandbox.json` shape Limboo emits (repo keys preserved on merge). */
interface CursorSandboxConfig {
  additionalReadwritePaths?: string[];
  additionalReadonlyPaths?: string[];
  disableTmpWrite?: boolean;
  networkPolicy?: 'all' | 'off' | { allowedDomains: string[] };
}

/**
 * Translate the neutral policy into the `--sandbox` argv pair. 'auto' omits the
 * flag (the CLI default) but the declarative `sandbox.json` is still written.
 */
export function sandboxArgv(eff: EffectiveSandbox): string[] {
  if (!eff.enabled) return eff.mode === 'disabled' ? ['--sandbox', 'disabled'] : [];
  if (eff.mode === 'enabled') return ['--sandbox', 'enabled'];
  return []; // 'auto' → omit, let the CLI decide
}

/** Build the `.cursor/sandbox.json` body from the neutral policy. */
function buildSandboxConfig(eff: EffectiveSandbox): CursorSandboxConfig {
  const networkPolicy: CursorSandboxConfig['networkPolicy'] =
    eff.network.policy === 'all'
      ? 'all'
      : eff.network.policy === 'off'
        ? 'off'
        : { allowedDomains: eff.network.allowedDomains };
  return {
    // writeRoots[0] is the workspace (already the CLI's writable root); only the
    // *extra* grants belong here.
    additionalReadwritePaths: eff.writeRoots.slice(1),
    additionalReadonlyPaths: eff.readOnly,
    networkPolicy,
  };
}

/**
 * Materialize `.cursor/sandbox.json` for the duration of `fn`, restoring the
 * pre-run bytes (or removing the file) afterwards. When the OS jail is disabled
 * the write is skipped entirely (fn still runs). A repo-authored sandbox.json
 * keeps its own keys — Limboo's fields are layered on top defensively.
 */
export async function withSessionSandboxJson<T>(
  root: string,
  eff: EffectiveSandbox,
  fn: () => Promise<T>,
): Promise<T> {
  if (!eff.enabled) return fn();
  const ours = buildSandboxConfig(eff);
  return withSessionFile(
    root,
    '.cursor/sandbox.json',
    (originalBytes) => {
      const original = safeParseObject(originalBytes);
      const out = copySafeKeys(original, new Set());
      // Union extra read/write paths with any the repo already declared; deny
      // is expressed via the cli.json floor, so union-widening here is safe.
      const mergeList = (key: keyof CursorSandboxConfig, add: string[]): void => {
        const prev = Array.isArray(original[key])
          ? (original[key] as unknown[]).filter((v): v is string => typeof v === 'string')
          : [];
        out[key] = [...new Set([...prev, ...add])];
      };
      mergeList('additionalReadwritePaths', ours.additionalReadwritePaths ?? []);
      mergeList('additionalReadonlyPaths', ours.additionalReadonlyPaths ?? []);
      // Limboo's network policy wins (it is the orchestration authority).
      out.networkPolicy = ours.networkPolicy;
      return JSON.stringify(out, null, 2);
    },
    fn,
  );
}
