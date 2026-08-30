/**
 * Harness-path errors that must reach the user as a refusal, not a retry.
 */

/**
 * A bootstrap command the user approved ran, and exited non-zero.
 *
 * The framework throws a plain `Error` for this, so it arrived as anonymous
 * prose and was classified by regex like any other run failure — which is how a
 * setup step that cannot succeed got retried, and how a setup step that failed
 * for a nameable reason got reported as "the run failed".
 *
 * The adapter's own stderr is the most useful thing in the box and is carried
 * verbatim (bounded): the claude-code plan's second command is
 * `./node_modules/.bin/claude --version`, and when the CLI's large
 * platform-native optional dependency did not download — a slow link plus
 * pnpm's per-request fetch timeout is enough — it exits 1 and prints exactly
 * what to do. Swallowing that in favour of a generic message would throw away
 * the answer.
 *
 * Non-retryable on purpose. pnpm records the install as complete even when an
 * OPTIONAL dependency failed, so a re-run reports "Already up to date" and the
 * second command fails identically, forever. Retrying that is a loop, not a
 * recovery; the marker file is never written either way, so the user re-running
 * it deliberately after fixing the cause still gets a full, correct install.
 */
export class HarnessBootstrapFailedError extends Error {
  readonly name = 'HarnessBootstrapFailedError';

  constructor(label: string, detail: string) {
    super(
      `${label}'s one-time setup did not complete. Limboo ran the commands you ` +
        'approved and one of them failed, so no agent was started. The setup ' +
        `step reported:\n\n${detail}`,
    );
  }
}

/** The framework's own prefix when a recipe command exits non-zero. */
const FRAMEWORK_BOOTSTRAP_FAILURE = /^Bootstrap command failed for harness/;

/**
 * Recognise a framework bootstrap failure so it can be renamed and reported.
 *
 * A string match against a third-party message, so it FAILS OPEN: an
 * unrecognised error is left exactly as it was and travels the ordinary path.
 * The cost of a miss is a less specific message, never a swallowed failure —
 * the opposite trade-off from `patchBridge.ts`, where a miss means a security
 * claim can no longer be proved and the run must stop.
 */
export function asBootstrapFailure(err: unknown, label: string): Error | null {
  const message = err instanceof Error ? err.message : '';
  if (!FRAMEWORK_BOOTSTRAP_FAILURE.test(message)) return null;
  return new HarnessBootstrapFailedError(label, message.slice(0, 1_200));
}

/**
 * Every error name below is a DECISION, not a failure.
 *
 * `HarnessCapabilityUnsupportedError` is the framework's own and is included
 * for the same reason: an adapter that cannot do a thing will not start doing
 * it on the second attempt.
 */
const REFUSAL_NAMES = new Set([
  'HarnessUngatedError',
  'HarnessConsentRequiredError',
  'HarnessBootstrapBlockedError',
  'HarnessBootstrapUnreadableError',
  'HarnessBootstrapFailedError',
  'HarnessCapabilityUnsupportedError',
]);

/**
 * Classify a harness refusal, or return `null` to let the ordinary classifiers
 * run.
 *
 * WHY THIS EXISTS, and why it matches on the error NAME rather than its text:
 * `classifyAgentError` decides recoverability with a regex over the message,
 * and `HarnessBootstrapBlockedError`'s message necessarily says *"it downloads
 * the agent CLI from the npm registry, which is not in the sandbox **network**
 * allowlist"*. That `network` matched the transient-transport branch, so a
 * standing policy decision — one the same settings will produce again the next
 * millisecond — was retried as though it were a dropped socket. A refusal whose
 * own wording makes it look retryable is exactly the failure mode a text
 * classifier cannot be trusted with, so this one reads the class instead.
 *
 * Deliberately non-recoverable and lifecycle-neutral: nothing about the agent's
 * health changed, the request was declined, and the message already tells the
 * user what to do about it.
 */
export function classifyHarnessRefusal(
  err: unknown,
): { outcome: 'failed'; recoverable: false } | null {
  const name = (err as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || !REFUSAL_NAMES.has(name)) return null;
  return { outcome: 'failed', recoverable: false };
}

/**
 * The adapter cannot ask Limboo for permission before a built-in tool edits a
 * file or runs a command.
 *
 * Thrown as a PREFLIGHT, before the first turn. An adapter that does not
 * declare `supportsBuiltinToolApprovals` emits no approval requests at any
 * permission mode, so its built-in `write`/`edit`/`bash` would execute with
 * Layer 1 bypassed. That is not a degraded mode worth offering — it is the one
 * property the whole permission architecture rests on — so such an adapter is
 * refused outright.
 *
 * The framework raises its own error for this condition, but its message
 * suggests setting `allow-all` as the remedy, which is precisely the unsafe
 * thing. Hence a Limboo-owned error with a Limboo-owned message.
 */
export class HarnessUngatedError extends Error {
  readonly name = 'HarnessUngatedError';

  constructor(label: string) {
    super(
      `${label} cannot ask Limboo for permission before it edits files or runs ` +
        'commands, so Limboo will not run it. This is a limitation of the ' +
        'harness adapter, not a setting you can change.',
    );
  }
}

/**
 * The run's own sandbox network policy makes the adapter's one-time bootstrap
 * impossible.
 *
 * The bootstrap installs the agent CLI from the npm registry, and Limboo's
 * sandbox policy is authoritative — it refuses to be widened by a provider. So
 * `network: 'off'` (or an allowlist without the registry) cannot be reconciled
 * with a first-run bootstrap. Detected up front and named, because the
 * alternative is an opaque bootstrap timeout the user has no way to reason
 * about.
 */
export class HarnessBootstrapBlockedError extends Error {
  readonly name = 'HarnessBootstrapBlockedError';

  constructor(reason: string) {
    super(`The agent harness cannot complete its one-time setup: ${reason}`);
  }
}

/**
 * The user has not acknowledged the adapter's bootstrap commands.
 *
 * The bootstrap runs third-party commands and reaches the npm registry from the
 * user's machine — the only place Limboo does that outside its two documented
 * outbound requests — so it requires the same explicit, verbatim-command
 * consent that repo-authored `limboo.json` hooks do. No ack, no bootstrap.
 */
export class HarnessConsentRequiredError extends Error {
  readonly name = 'HarnessConsentRequiredError';

  constructor(label: string) {
    super(
      `${label} needs a one-time setup step that runs commands and downloads ` +
        'the agent CLI. Review and approve it in Settings › Agent › Harnesses ' +
        'before running it.',
    );
  }
}

/**
 * The adapter has a bootstrap step but could not describe it.
 *
 * FAIL CLOSED. This used to be indistinguishable from "this harness installs
 * nothing": `readBootstrapPlan` swallowed the throw and returned `null`, and the
 * `if (plan)` in HarnessRuntime then skipped the consent gate, the sandbox
 * network check AND the toolchain probe — so a broken adapter ran with every
 * guard the consent surface promises silently disabled, while Settings reported
 * "no setup step".
 *
 * The real-world trigger was a packaging bug: the adapter reads its bridge
 * assets (including `pnpm-lock.yaml`) off disk in `getBootstrap()`, and those
 * files were being stripped from the packaged asar. An adapter that cannot say
 * what it will do is not one we can ask the user to approve, so the run stops.
 */
export class HarnessBootstrapUnreadableError extends Error {
  readonly name = 'HarnessBootstrapUnreadableError';

  constructor(label: string, detail: string) {
    super(
      `${label} has a one-time setup step but could not describe it, so Limboo ` +
        'will not run it — approving commands it cannot read is not something ' +
        `Limboo can ask you to do. The adapter reported: ${detail}`,
    );
  }
}
