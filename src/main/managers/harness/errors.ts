/**
 * Harness-path errors that must reach the user as a refusal, not a retry.
 */

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
