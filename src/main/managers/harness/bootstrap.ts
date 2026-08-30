/**
 * The adapter's one-time setup step, and the consent it requires.
 *
 * WHY THIS FILE EXISTS
 * Before its first session, a bridge-backed harness installs the agent CLI into
 * its sandbox state directory. For `@ai-sdk/harness-claude-code` that means
 * running `pnpm install --frozen-lockfile` and then the CLI's own installer —
 * i.e. **reaching the npm registry from the user's machine**.
 *
 * Limboo makes exactly three kinds of outbound request, and CLAUDE.md §1 is the
 * paragraph that enumerates them. This is the third, and it is the only one the
 * user can be surprised by, so it is gated the same way repo-authored
 * `limboo.json` commands are: the verbatim commands are shown, the user
 * approves them once, and the approval is keyed to a FINGERPRINT of those exact
 * commands. An adapter upgrade that changes what runs re-prompts, because the
 * thing the user approved is no longer what would execute.
 *
 * The commands are read from the adapter itself (`getBootstrap()`), never
 * hardcoded — a consent dialog that shows something other than what will run is
 * worse than no dialog.
 */
import crypto from 'node:crypto';
import type { EffectiveSandbox } from '../sandbox/policy';
import { logger } from '../../logger';
import { HarnessBootstrapBlockedError, HarnessConsentRequiredError } from './errors';
import { resolveTools } from './toolchain';

/** What the adapter says it will do before the first session. */
export interface BootstrapPlan {
  /** Shell commands, verbatim, in order. */
  commands: string[];
  /** Files written into the state dir (names only — contents can be large). */
  files: string[];
  /**
   * The directory, relative to the sandbox root, that the files are written
   * into and the commands are RUN IN.
   *
   * Not decoration. `applyBootstrapRecipe` passes it as `workingDirectory` for
   * every command, so `pnpm install --frozen-lockfile` only makes sense there —
   * that is where the adapter just wrote `pnpm-lock.yaml`. A consent surface
   * that shows the commands without the directory invites the user to paste
   * them into their shell, where they fail with `ERR_PNPM_NO_LOCKFILE` and look
   * like a Limboo bug.
   *
   * Deliberately NOT part of the fingerprint. Consent is over what EXECUTES;
   * folding the directory in would void every existing approval for a string
   * that changes nothing about the commands.
   */
  dir?: string;
  /** Stable id of THIS command set; the unit of consent. */
  fingerprint: string;
}

/** The shape `getBootstrap()` resolves to, read structurally. */
interface RawBootstrap {
  commands?: readonly { command?: unknown }[];
  files?: readonly { path?: unknown }[];
  bootstrapDir?: unknown;
}

/**
 * The outcome of asking an adapter to describe its setup step.
 *
 * Three distinct states, deliberately NOT collapsed into `BootstrapPlan | null`.
 * They used to be: a `getBootstrap()` that threw was caught and reported as
 * "no plan", which is a different claim entirely, and the `if (plan)` guard in
 * HarnessRuntime then skipped consent, the network check and the toolchain probe
 * — a broken adapter ran with every guard disabled while Settings said "this
 * harness needs no setup step". "Not measured" and "empty" are opposite claims
 * and must not look alike.
 */
export type BootstrapRead =
  /** The adapter has no setup step at all (Pi exposes no `getBootstrap`). */
  | { kind: 'none' }
  /** The adapter described a setup step. */
  | { kind: 'plan'; plan: BootstrapPlan }
  /** The adapter HAS a setup step but could not describe it. Fail closed. */
  | { kind: 'unreadable'; error: string };

/**
 * Read the adapter's bootstrap plan.
 *
 * A host-process adapter (Pi) may not install anything, in which case there is
 * nothing to consent to and nothing to block on — that is `none`. An adapter
 * that HAS a `getBootstrap` but throws from it is `unreadable`, and the caller
 * must refuse the run: approving commands nobody can read is not something
 * Limboo can ask a user to do.
 */
export async function readBootstrapPlan(adapter: unknown): Promise<BootstrapRead> {
  const get = (adapter as { getBootstrap?: () => Promise<RawBootstrap> } | null)?.getBootstrap;
  if (typeof get !== 'function') return { kind: 'none' };
  let raw: RawBootstrap;
  try {
    raw = await get.call(adapter);
  } catch (err) {
    // The real-world trigger for this was a packaging bug: the adapter reads its
    // bridge assets off disk here, and they were being stripped from the asar.
    // Surfacing the adapter's own message is what makes that diagnosable.
    return { kind: 'unreadable', error: err instanceof Error ? err.message : String(err) };
  }
  const commands = (raw?.commands ?? [])
    .map((c) => (typeof c?.command === 'string' ? c.command : ''))
    .filter((c) => c.length > 0);
  if (commands.length === 0) {
    // An adapter may legitimately declare files and no commands, so this is not
    // an error — but it is also how silent shape drift after an upgrade would
    // present, and that must not pass unnoticed.
    if ((raw?.commands ?? []).length > 0) {
      logger.warn(
        'Harness adapter declared bootstrap commands in an unrecognised shape; treating as no setup step.',
      );
    }
    return { kind: 'none' };
  }
  const files = (raw?.files ?? [])
    .map((f) => (typeof f?.path === 'string' ? f.path : ''))
    .filter((f) => f.length > 0);
  // Relative by contract (`applyBootstrapRecipe` resolves it against the
  // sandbox root), and it must STAY relative on the way to the renderer: an
  // absolute one would carry the user's home directory into the UI, which is
  // the same reason `prerequisites` reports tool names and never resolved paths.
  const rawDir = typeof raw?.bootstrapDir === 'string' ? raw.bootstrapDir.trim() : '';
  const dir = rawDir && !rawDir.startsWith('/') && !/^[A-Za-z]:/.test(rawDir) ? rawDir : undefined;
  return {
    kind: 'plan',
    plan: {
      commands,
      files,
      ...(dir ? { dir } : {}),
      // Only the COMMANDS are fingerprinted. File contents change on every
      // adapter patch release; what the user is consenting to is what executes.
      fingerprint: crypto
        .createHash('sha256')
        .update(commands.join('\n'))
        .digest('hex')
        .slice(0, 16),
    },
  };
}

/**
 * Refuse the run unless this exact command set has been approved.
 *
 * Deliberately not a boolean "allow network" setting: the user approves *these
 * commands*, not a standing permission. That is the same distinction the
 * limboo.json ack-hash gate makes.
 */
export function assertBootstrapConsent(
  plan: BootstrapPlan,
  ackedFingerprint: string,
  label: string,
): void {
  if (ackedFingerprint !== plan.fingerprint) throw new HarnessConsentRequiredError(label);
}

/**
 * Refuse the run when the environment makes the bootstrap impossible.
 *
 * Both failures are otherwise invisible: a blocked network shows up as a
 * bootstrap that times out inside the sandbox, and a missing `pnpm` as a
 * non-zero exit from a command the user never saw. Naming them up front is the
 * difference between a fixable message and a mystery.
 */
export function assertBootstrapPossible(plan: BootstrapPlan, eff: EffectiveSandbox): void {
  if (eff.enabled) {
    if (eff.network.policy === 'off') {
      throw new HarnessBootstrapBlockedError(
        'it downloads the agent CLI, but the sandbox network policy is set to ' +
          'Off. Set Settings › Agent › Sandbox › Network to All for the first ' +
          'run, or use a harness that needs no setup.',
      );
    }
    if (eff.network.policy === 'allowlist' && !allowlistPermitsRegistry(eff.network.allowedDomains)) {
      throw new HarnessBootstrapBlockedError(
        'it downloads the agent CLI from the npm registry, which is not in the ' +
          'sandbox network allowlist. Add registry.npmjs.org, or set the ' +
          'network policy to All for the first run.',
      );
    }
  }
  // Only ever assert on tools the plan ITSELF invokes, derived from the command
  // strings rather than a hardcoded package-manager list — so an adapter that
  // bootstraps with yarn, bun or corepack is checked just as precisely. Limboo
  // never substitutes one tool for another: the approved string is the executed
  // string, so a missing tool is reported, not worked around.
  for (const { tool, found, hint } of resolveTools(plan)) {
    if (found) continue;
    throw new HarnessBootstrapBlockedError(
      `it runs \`${tool}\`, which is not installed or not on PATH. ${hint}`,
    );
  }
}

/** Hosts the npm client needs. Matched permissively — wildcards are allowed. */
const REGISTRY_HOSTS = ['registry.npmjs.org', 'npmjs.org', 'npmjs.com'];

function allowlistPermitsRegistry(domains: readonly string[]): boolean {
  return domains.some((raw) => {
    const d = raw.trim().toLowerCase();
    if (d === '*' || d === '**') return true;
    const bare = d.startsWith('*.') ? d.slice(2) : d;
    return REGISTRY_HOSTS.some((h) => h === bare || h.endsWith(`.${bare}`));
  });
}
