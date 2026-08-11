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
  /** Needs a sandbox provider exposing a port for its bridge. */
  needsSandbox: boolean;
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
    needsSandbox: true,
    capabilities: {
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
    id: 'cursor-cli',
    label: 'Cursor',
    provider: 'cursor',
    kind: 'native',
    module: null,
    needsSandbox: false,
    capabilities: {
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
