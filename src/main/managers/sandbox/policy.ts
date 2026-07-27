/**
 * Provider-neutral OS-level Sandbox policy (defense-in-depth Layer 3).
 *
 * Limboo owns ONE sandbox policy and translates it into whichever coding agent
 * runs — Claude's Agent-SDK `Options.sandbox` (Seatbelt on macOS, bubblewrap on
 * Linux/WSL2) and Cursor's `.cursor/sandbox.json` + `--sandbox` flag. This
 * module is the single source of the *effective* policy for a run, so the two
 * provider mappings can never drift.
 *
 * The sandbox is **containment, not authorization**: the permission gate
 * (`AgentManager.decideToolUse`) is always the ultimate authority (Layer 1) and
 * runs on top. The sandbox is the OS-enforced net beneath it — even if a prompt
 * injection or provider defect slipped past the logical permission layer, the
 * kernel still fences the process to the worktree and the configured network.
 *
 * Two things are ALWAYS enforced regardless of user settings (the floor):
 *  - the effective writable root is the session's execution root (the worktree);
 *  - Limboo's own crown jewels — the safeStorage `secrets/` store, `limboo.db`,
 *    and the `settings.json` / `window-state.json` config files — are denied for
 *    read and write.
 * We deny those SPECIFIC paths rather than the whole `userData` root because the
 * session worktree (default `{userData}/worktrees/…`) and the attachment staging
 * dir (`{userData}/attachments/…`) legitimately live under `userData` and MUST
 * stay usable; a blanket `userData` deny would fight the agent's own working dir.
 * Layer 1's `touchesCrownJewel` guard (AgentManager) and Cursor's declarative
 * `sessionDenyRules` both deny this SAME set at the authorization layer — they
 * consume `crownJewelPaths()` directly — so the three layers cannot drift.
 * The user-configurable knobs only ever *widen* writes (extra paths, screened
 * against the floor) or tighten the network — they can never re-expose a crown
 * jewel or escape the worktree.
 */
import { app } from 'electron';
import path from 'node:path';
import os from 'node:os';
import type { AgentProvider } from '@shared/constants';
import type { AppSettings } from '@shared/types';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

/** The Agent-SDK sandbox option shape (non-optional). */
export type ClaudeSandbox = NonNullable<Options['sandbox']>;

/** A run's resolved sandbox policy — the neutral form both adapters translate. */
export interface EffectiveSandbox {
  /** Whether an OS-level jail should be attempted for this run. */
  enabled: boolean;
  /** Block the run if the sandbox can't start (strict); else degrade gracefully. */
  failIfUnavailable: boolean;
  /** The configured mode, verbatim, for diagnostics + timeline metadata. */
  mode: 'auto' | 'enabled' | 'disabled';
  /** Directories writable inside the jail — the worktree first, then extras. */
  writeRoots: string[];
  /** Absolute crown-jewel paths denied for reads (secrets / db / config files). */
  denyRead: string[];
  /** Absolute crown-jewel paths denied for writes (same set). */
  denyWrite: string[];
  /** Paths mounted read-only inside the jail (e.g. the attachment staging dir). */
  readOnly: string[];
  /** Network egress policy. */
  network: { policy: 'all' | 'allowlist' | 'off'; allowedDomains: string[] };
  /** Commands that run OUTSIDE the jail (Claude `sandbox.excludedCommands`). */
  excludedCommands: string[];
}

export interface SandboxResolveContext {
  /** The session's effective execution root (worktree) — the writable root. */
  cwd: string;
  /** The provider that will actually run — gates `providerOverride`. */
  provider: AgentProvider;
  /** This session's attachment staging dir, if any (mounted read-only). */
  attachmentsDir?: string;
}

/**
 * The specific crown-jewel paths always denied inside any sandbox — NOT the
 * whole `userData` root (the worktree + attachments live under it). See the
 * module header for why this is narrowed.
 */
export function crownJewelPaths(): string[] {
  const root = app.getPath('userData');
  return [
    path.join(root, 'secrets'),
    path.join(root, 'limboo.db'),
    path.join(root, 'settings.json'),
    path.join(root, 'window-state.json'),
  ];
}

/** True when `target` is one of, or lives inside, the crown-jewel floor. */
function violatesFloor(target: string, floor: string[]): boolean {
  const t = path.resolve(target);
  return floor.some((f) => {
    const fr = path.resolve(f);
    return t === fr || t.startsWith(fr + path.sep);
  });
}

/**
 * Screen a user-supplied extra writable path: it must be absolute, must not be
 * the filesystem root or the home directory, and must not resolve into the
 * crown-jewel floor. This is defense-in-depth beyond SettingsManager — a bad
 * value can never reach the SDK/CLI even if persistence validation is bypassed.
 */
function isSafeExtraWritePath(p: string, floor: string[]): boolean {
  if (!path.isAbsolute(p)) return false;
  const resolved = path.resolve(p);
  if (resolved === path.parse(resolved).root) return false; // filesystem root
  try {
    if (resolved === path.resolve(os.homedir())) return false; // bare home dir
  } catch {
    /* homedir() can throw in odd environments — treat as no home to compare */
  }
  return !violatesFloor(resolved, floor);
}

/**
 * Public screen for a user-supplied extra writable path against the current
 * crown-jewel floor — reused by SettingsManager so persistence and runtime
 * apply the identical rule (defense in depth). Returns true when the path is
 * safe to grant.
 */
export function screenExtraWritePath(p: string): boolean {
  return isSafeExtraWritePath(p, crownJewelPaths());
}

/**
 * Resolve the effective sandbox policy for a run. Pure aside from reading the
 * userData/home paths — no filesystem probing (availability is the SDK/CLI's
 * concern via `failIfUnavailable`).
 */
export function resolveSandboxConfig(
  cfg: AppSettings['agent']['sandbox'],
  ctx: SandboxResolveContext,
): EffectiveSandbox {
  const floor = crownJewelPaths();
  // The OS jail is skipped when the user disabled it, or pinned it to the OTHER
  // provider's native sandbox (`providerOverride`). `auto` follows the runner.
  const providerMatches =
    cfg.providerOverride === 'auto' ||
    cfg.providerOverride === `${ctx.provider === 'anthropic' ? 'claude' : ctx.provider}-native`;
  const enabled = cfg.mode !== 'disabled' && providerMatches;

  // Extra writable paths are screened against the floor (G2) — a hand-edited
  // settings.json can never re-open secrets/db/config or hand out `/` or $HOME.
  const extraWrites = cfg.allowWritePaths.filter((p) => isSafeExtraWritePath(p, floor));
  const writeRoots = [ctx.cwd, ...extraWrites];
  const readOnly =
    cfg.readOnlyAttachments && ctx.attachmentsDir ? [ctx.attachmentsDir] : [];

  return {
    enabled,
    failIfUnavailable: cfg.failIfUnavailable,
    mode: cfg.mode,
    writeRoots,
    denyRead: floor,
    denyWrite: floor,
    readOnly,
    network: {
      policy: cfg.network,
      allowedDomains: cfg.network === 'allowlist' ? [...cfg.allowedDomains] : [],
    },
    excludedCommands: [...cfg.excludedCommands],
  };
}

/**
 * Translate the neutral policy into the Claude Agent SDK's `Options.sandbox`.
 * Returns `undefined` when the jail is off (caller omits the option entirely).
 *
 * `autoAllowBashIfSandboxed` is pinned OFF so Limboo's `canUseTool` bridge
 * stays the decision authority (Layer 1) — the sandbox only *contains*, it never
 * auto-approves on our behalf.
 */
export function mapClaudeSandbox(eff: EffectiveSandbox): ClaudeSandbox | undefined {
  if (!eff.enabled) return undefined;
  // Claude's OS sandbox jails filesystem AND network together: `allowedDomains`
  // is deny-by-default with NO allow-all sentinel, and there is a
  // `filesystem.disabled` switch but no `network.disabled`. So an open-network
  // policy ('all', the default) cannot be honored under the jail without
  // silently severing the run's network. Rather than regress the default, we
  // skip Claude's OS jail for 'all' and let the canUseTool path guards remain
  // the boundary; choosing 'allowlist' or 'off' — policies the sandbox CAN
  // enforce — opts into the full OS jail. (Cursor's sandbox supports open
  // network with filesystem isolation, so Cursor still jails under 'all'.)
  if (eff.network.policy === 'all') return undefined;
  return {
    enabled: true,
    failIfUnavailable: eff.failIfUnavailable,
    autoAllowBashIfSandboxed: false,
    // Strict mode (failIfUnavailable) also closes the escape hatch: the SDK's
    // `dangerouslyDisableSandbox` retry is ignored, so a command must run
    // sandboxed or be in `excludedCommands` — it can never silently pop out to
    // the unsandboxed permission flow.
    ...(eff.failIfUnavailable ? { allowUnsandboxedCommands: false } : {}),
    filesystem: {
      allowWrite: eff.writeRoots,
      denyWrite: eff.denyWrite,
      denyRead: eff.denyRead,
      // Keep the worktree + read-only mounts readable even under a broad deny.
      allowRead: [...eff.writeRoots, ...eff.readOnly],
    },
    // 'allowlist' → exactly the listed domains; 'off' → empty list (deny-all,
    // since headless has no interactive prompt so unlisted = blocked).
    network: { allowedDomains: eff.network.allowedDomains },
    // Commands that can't run under the jail (e.g. docker) run outside it,
    // still gated by canUseTool. Empty by default.
    ...(eff.excludedCommands.length ? { excludedCommands: eff.excludedCommands } : {}),
    // Deny the safeStorage secret store + db to sandboxed commands at the
    // credentials layer too (filesystem denyRead already covers them; this is
    // the belt-and-braces the docs recommend for secret directories).
    credentials: {
      files: eff.denyRead
        .filter((p) => p.endsWith('secrets') || p.endsWith('limboo.db'))
        .map((p) => ({ path: p, mode: 'deny' as const })),
    },
  };
}
