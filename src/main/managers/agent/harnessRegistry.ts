/**
 * The catalog of agent harnesses Limboo can drive.
 *
 * MAIN-PROCESS ONLY. It holds module specifiers, which the renderer must never
 * see — the renderer gets id + label from `HARNESS_LABELS` in
 * `@shared/constants` instead. Nothing here is imported at module load: the
 * adapter packages are reached through the runtime dynamic import in
 * `harness/index.ts`, so an uninstalled or broken adapter degrades to "not
 * available" rather than taking the main process down at boot.
 *
 * A harness is HOW a model is run, and it is distinct from the provider (WHO
 * serves the model). Two harnesses can share a provider — `claude-code` (via
 * the AI SDK adapter) and the direct Claude Agent SDK path are both
 * `anthropic`. And a provider can have no harness at all: **Cursor has no AI
 * SDK adapter and none is announced**, so it stays a first-class `native`
 * runtime behind the same {@link ProviderRunBridge} seam rather than being
 * migrated or dropped.
 */
import type { AgentProvider } from '@shared/constants';
import type { HarnessSettingsShape } from '../harness/adapterSettings';

/** How a harness executes, which decides what infrastructure it needs. */
export type HarnessKind =
  /** Limboo owns the process (CursorRuntime, the direct Claude SDK path). */
  | 'native'
  /** AI SDK adapter that runs a bridge inside a sandbox over a local port. */
  | 'sandbox-bridge'
  /** AI SDK adapter that runs in the host process and needs no exposed port. */
  | 'host-process';

/** What a harness can be observed to do — drives honest UI degradation. */
export interface HarnessCapabilities {
  /**
   * Whether built-in READ tools can be routed through Limboo's permission gate.
   *
   * `false` for every AI SDK harness: the adapter's permission modes gate edits
   * and shell commands but never reads, and the only way to affect a built-in
   * read is `inactiveTools`, which DENIES it outright rather than asking. So
   * `settings.agent.autoApproveReads: false` cannot be honoured on those paths,
   * and the UI must say so in words rather than appear to work.
   */
  gatesReads: boolean;
  /**
   * Whether the adapter can be gated AT ALL — i.e. whether it declares
   * `supportsBuiltinToolApprovals`.
   *
   * `false` means its built-in write/shell tools would execute with Limboo's
   * permission gate bypassed entirely, and no setting recovers that. Such a
   * harness is REFUSED at preflight (`HarnessUngatedError`) rather than run,
   * so it also gets no selectable model — a picker entry that can only ever
   * fail is worse than an absent one. Recorded here so the Harnesses surface
   * can say why instead of the harness merely being missing.
   */
  gatesBuiltins: boolean;
  /** Reports `parent_tool_use_id`-style nesting for delegations. */
  subagents: boolean | 'unknown';
  /** How a plan document arrives: a tool call, scraped result text, or never. */
  plan: 'tool' | 'result-text' | 'none';
  /** Accepts image content blocks. */
  vision: boolean;
  /** Publishes token counts / context window measurements. */
  tokenUsage: boolean | 'unknown';
}

export interface HarnessDescriptor {
  id: string;
  label: string;
  provider: AgentProvider;
  kind: HarnessKind;
  /** npm specifier of the AI SDK adapter; null for Limboo-owned runtimes. */
  module: string | null;
  /**
   * Which argument shape its factory takes (see `harness/adapterSettings.ts`).
   *
   * A TAG, not a function: this module must stay import-free so a broken adapter
   * degrades to "not available" instead of taking the main process down at boot.
   */
  settingsShape?: HarnessSettingsShape;
  /** Needs a sandbox provider exposing a port for its bridge. */
  needsSandbox: boolean;
  /**
   * Credential env var NAMES this harness's runtime reads.
   *
   * Forwarded to the child only when already present in the host environment.
   * Limboo stores no provider credential, so this is the entire auth story for
   * a harness: whatever the user's own shell already has. Names only — a value
   * never reaches settings, IPC, argv or a log line.
   */
  envKeys: readonly string[];
  capabilities: HarnessCapabilities;
}

/**
 * Registered harnesses. Only entries Limboo can actually drive belong here —
 * the Settings surface reports availability, and listing an adapter we cannot
 * run would make "Not available" indistinguishable from "not installed yet".
 */
export const HARNESSES: readonly HarnessDescriptor[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    provider: 'anthropic',
    kind: 'sandbox-bridge',
    module: '@ai-sdk/harness-claude-code',
    settingsShape: 'claude-code',
    needsSandbox: true,
    // HOME is already in the sandbox's platform allowlist, so a `~/.claude`
    // subscription login works without any of these. They exist so an API-key
    // user can authenticate too — previously impossible, since none of them
    // reached the child.
    envKeys: [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ],
    capabilities: {
      // Verified `supportsBuiltinToolApprovals: true` in the package.
      gatesBuiltins: true,
      // Its permission modes gate `edit` and `bash` kinds only — a built-in
      // Read/Grep/Glob is never routed to Limboo's gate at any mode.
      gatesReads: false,
      // The AI SDK StreamPart vocabulary has no first-class parent-call field;
      // whether the adapter forwards one in providerMetadata is unverified, so
      // this stays 'unknown' rather than claiming nesting we may not get.
      subagents: 'unknown',
      plan: 'tool',
      vision: true,
      tokenUsage: 'unknown',
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    provider: 'openai',
    kind: 'sandbox-bridge',
    module: '@ai-sdk/harness-codex',
    settingsShape: 'codex',
    needsSandbox: true,
    envKeys: [
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
      'OPENAI_BASE_URL',
      'OPENAI_ORGANIZATION',
      'OPENAI_PROJECT',
      'AI_GATEWAY_API_KEY',
      'AI_GATEWAY_BASE_URL',
    ],
    capabilities: {
      // VERIFIED FALSE in @ai-sdk/harness-codex@1.0.67: the adapter declares
      // `supportsBuiltinToolApprovals: false`, so its `bash` tool would run with
      // Limboo's permission gate bypassed. It is therefore refused at preflight
      // and given no selectable model. Flip this — and add a model — only after
      // re-verifying the published flag, never on the strength of the docs.
      gatesBuiltins: false,
      gatesReads: false,
      subagents: 'unknown',
      // No ExitPlanMode equivalent in its two built-ins (bash, webSearch).
      plan: 'none',
      vision: false,
      tokenUsage: 'unknown',
    },
  },
  {
    id: 'pi',
    label: 'Pi',
    provider: 'pi',
    kind: 'host-process',
    module: '@ai-sdk/harness-pi',
    settingsShape: 'pi',
    // Verified: it uses neither getPortUrl nor getBootstrap, so it needs no
    // exposed port and has no setup step to consent to. It still receives a
    // sandbox provider — the framework always creates a session — it simply
    // never asks for a URL.
    needsSandbox: false,
    envKeys: ['AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL'],
    capabilities: {
      // Verified `supportsBuiltinToolApprovals: true` in the package.
      gatesBuiltins: true,
      gatesReads: false,
      subagents: 'unknown',
      plan: 'none',
      vision: false,
      tokenUsage: 'unknown',
    },
  },
  {
    id: 'cursor-cli',
    label: 'Cursor',
    provider: 'cursor',
    kind: 'native',
    module: null,
    needsSandbox: false,
    // Cursor's own auth layer owns this: a CLI login, or a key decrypted from
    // SecretStore at spawn time. Nothing is forwarded from the host here.
    envKeys: [],
    capabilities: {
      // Limboo owns the process and every tool call reaches decideToolUse, so
      // both are honoured here.
      gatesBuiltins: true,
      gatesReads: true,
      // Cursor's stream carries no parent linkage — a Cursor run renders flat,
      // deliberately, rather than having nesting inferred for it.
      subagents: false,
      // No ExitPlanMode; the plan is captured from the terminal result text.
      plan: 'result-text',
      vision: false,
      // Token counts in --output-format stream-json are an open Cursor feature
      // request, not shipped. `duration_ms` is the only quantitative field.
      tokenUsage: false,
    },
  },
] as const;

/** Look a harness up by id. */
export function harnessById(id: string): HarnessDescriptor | undefined {
  return HARNESSES.find((h) => h.id === id);
}

/** The harnesses that serve a given provider. */
export function harnessesForProvider(provider: AgentProvider): HarnessDescriptor[] {
  return HARNESSES.filter((h) => h.provider === provider);
}

/**
 * The harness that will run a model, resolved from its provider.
 *
 * Returns `undefined` for an unroutable model — the same refusal-to-guess
 * `resolveModelRouting` makes, and for the same reason: defaulting here would
 * reintroduce "a model nobody claims quietly runs as Claude".
 */
export function harnessForProvider(provider: AgentProvider | null): HarnessDescriptor | undefined {
  if (!provider) return undefined;
  return HARNESSES.find((h) => h.provider === provider);
}
