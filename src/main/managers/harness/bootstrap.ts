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
import { HarnessBootstrapBlockedError, HarnessConsentRequiredError } from './errors';
import { probeCommand } from './probe';

/** What the adapter says it will do before the first session. */
export interface BootstrapPlan {
  /** Shell commands, verbatim, in order. */
  commands: string[];
  /** Files written into the state dir (names only — contents can be large). */
  files: string[];
  /** Stable id of THIS command set; the unit of consent. */
  fingerprint: string;
}

/** The shape `getBootstrap()` resolves to, read structurally. */
interface RawBootstrap {
  commands?: readonly { command?: unknown }[];
  files?: readonly { path?: unknown }[];
}

/**
 * Read the adapter's bootstrap plan, or `null` when it has none.
 *
 * A host-process adapter (Pi) may not install anything, in which case there is
 * nothing to consent to and nothing to block on.
 */
export async function readBootstrapPlan(adapter: unknown): Promise<BootstrapPlan | null> {
  const get = (adapter as { getBootstrap?: () => Promise<RawBootstrap> } | null)?.getBootstrap;
  if (typeof get !== 'function') return null;
  let raw: RawBootstrap;
  try {
    raw = await get.call(adapter);
  } catch {
    // An adapter that cannot describe its own setup is not one we can ask the
    // user to approve. Treat as "no plan" and let the run proceed — the
    // sandbox's own containment is unaffected either way.
    return null;
  }
  const commands = (raw?.commands ?? [])
    .map((c) => (typeof c?.command === 'string' ? c.command : ''))
    .filter((c) => c.length > 0);
  if (commands.length === 0) return null;
  const files = (raw?.files ?? [])
    .map((f) => (typeof f?.path === 'string' ? f.path : ''))
    .filter((f) => f.length > 0);
  return {
    commands,
    files,
    // Only the COMMANDS are fingerprinted. File contents change on every
    // adapter patch release; what the user is consenting to is what executes.
    fingerprint: crypto.createHash('sha256').update(commands.join('\n')).digest('hex').slice(0, 16),
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
  // Only assert on a tool the plan actually invokes, so this stays true for a
  // future adapter with a different setup.
  for (const [tool, hint] of REQUIRED_TOOLS) {
    if (!plan.commands.some((c) => c.startsWith(`${tool} `) || c.includes(` ${tool} `))) continue;
    if (!probeCommand(tool)) {
      throw new HarnessBootstrapBlockedError(
        `it runs \`${tool}\`, which is not installed or not on PATH. ${hint}`,
      );
    }
  }
}

/** Command → how the user fixes its absence. */
const REQUIRED_TOOLS: readonly [string, string][] = [
  ['pnpm', 'Install pnpm (https://pnpm.io/installation) and restart Limboo.'],
  ['npm', 'Install Node.js, which provides npm, and restart Limboo.'],
];

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
