/**
 * OS-level containment for the local sandbox provider (defense-in-depth
 * Layer 3). Translates Limboo's ONE provider-neutral policy
 * ({@link EffectiveSandbox}, resolved in `sandbox/policy.ts`) into an argv
 * prefix that wraps every command the harness runs.
 *
 * DELIBERATELY A NO-OP FOR NOW. Under shipped defaults `mapClaudeSandbox`
 * already returns `undefined` (the default network policy is `all`, which
 * Claude's coupled jail cannot express), so the Claude path runs with no OS
 * jail today. Shipping the local provider un-jailed is therefore PARITY with
 * current behaviour, not a regression — which is what lets the provider land
 * before the jail is written.
 *
 * The seam exists now so filling it in later touches exactly this file:
 *  - Linux: bubblewrap — `--ro-bind / /`, `--bind <worktree> <worktree>`,
 *    `--tmpfs` over every `crownJewelPaths()` entry, `--unshare-net` when the
 *    policy is `off`, `--die-with-parent`.
 *  - macOS: `sandbox-exec -p` with a profile generated from the same policy.
 *  - Windows: no jail; `restricted()` stays false.
 *
 * Two rules to carry forward when it is implemented: never auto-approve a tool
 * because the jail is on (the permission gate stays authoritative — the SDK's
 * `autoAllowBashIfSandboxed:false` principle), and under `failIfUnavailable`
 * refuse the run rather than silently degrading to no containment.
 */
import type { EffectiveSandbox } from '../../sandbox/policy';

export interface ResolvedJail {
  /** Prefix prepended to every spawned command's argv. Empty = no jail. */
  argv: string[];
  /**
   * Whether a KERNEL-ENFORCED boundary is actually in effect right now.
   *
   * This is the value {@link LocalWorktreeSandbox.restricted} reports, and it
   * must never be optimistic. A consumer that relaxes its own checks on `true`
   * has to be told the truth, and the truth today is `false`.
   */
  restricted: boolean;
}

/** Resolve the jail for a run. Currently always "no OS jail" — see header. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveJail(eff: EffectiveSandbox): ResolvedJail {
  return { argv: [], restricted: false };
}
