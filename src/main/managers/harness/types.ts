/**
 * Hand-written STRUCTURAL declarations for the slice of Vercel AI SDK 7 this
 * app touches.
 *
 * WHY NOT `import type { HarnessAgent } from '@ai-sdk/harness/agent'`:
 * `import/no-unresolved` is an ESLint ERROR in this repo and there is no TS
 * resolver plugin (CLAUDE.md §2), while TypeScript is pinned at ~4.5 with
 * `moduleResolution: node`, which cannot read an `exports` map. The harness
 * packages are exports-map-only ESM, so a direct type import fails
 * `npm run lint` — the exact command CLAUDE.md names as the verifier. Declaring
 * the surface here keeps the lint rule tight (rather than widening its ignore
 * list, which is what makes the rule useless over time) and costs nothing at
 * runtime, since the modules are reached through `loadHarness()`.
 *
 * The second reason is containment. These packages are documented as
 * experimental with breaking changes expected between releases, and they are
 * exact-pinned for that reason. When a bump changes a shape, it changes HERE
 * and in `translate.ts`, and nowhere else in the app.
 *
 * Only what is actually used is modelled. Unknown members are deliberately
 * absent rather than typed `any`, so reaching for something unverified is a
 * compile error and not a runtime surprise.
 */

/** A single frame of `agent.stream()`. Structural and deliberately loose. */
export interface HarnessStreamPart {
  type: string;
  /** text-delta / reasoning-delta payload. */
  text?: string;
  delta?: string;
  /** Tool-call identity and payload. */
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  error?: unknown;
  /** Step/finish accounting. */
  finishReason?: string;
  usage?: HarnessUsage;
  totalUsage?: HarnessUsage;
  response?: { id?: string; modelId?: string };
  /** Where a parent-call id would ride, if the adapter forwards one. */
  providerMetadata?: Record<string, Record<string, unknown>>;
  /** Approval-request fields (`tool-approval-request`). */
  approvalId?: string;
  toolCall?: unknown;
  /** The adapter's own tool name, when it differs from the common one. */
  nativeName?: string;
  [key: string]: unknown;
}

export interface HarnessUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  [key: string]: unknown;
}

/** Resolution of `toolApproval` — the coarse map/callback surface. */
export type HarnessApprovalDecision =
  | { approved: true; input?: unknown }
  | { approved: false; reason?: string };

export interface HarnessApprovalRequest {
  toolName: string;
  input?: unknown;
  toolCallId?: string;
  abortSignal?: AbortSignal;
}

export type HarnessToolApproval = (
  req: HarnessApprovalRequest,
) => Promise<HarnessApprovalDecision>;

/** A live session; the framework owns its lifecycle across turns. */
export interface HarnessSession {
  readonly sessionId?: string;
  stop?(): PromiseLike<void>;
  destroy?(): PromiseLike<void>;
  detach?(): PromiseLike<unknown>;
  suspendTurn?(): PromiseLike<unknown>;
  hasUnfinishedTurn?(): boolean;
}

export interface HarnessStreamResult {
  stream: AsyncIterable<HarnessStreamPart>;
}

export interface HarnessGenerateResult {
  text?: string;
  finishReason?: string;
  usage?: HarnessUsage;
}

/** The subset of `new HarnessAgent({...})` options this app sets. */
export interface HarnessAgentOptions {
  harness: unknown;
  sandbox: unknown;
  id?: string;
  instructions?: string;
  stopWhen?: unknown;
  /**
   * Host-executed AI SDK tools. Declared because the option is real and
   * supported — the framework runs them in Limboo's process and submits the
   * result back — but deliberately NOT used.
   *
   * Limboo's own memory/search tools reach every agent through the existing
   * stdio MCP bridge, which Cursor and the direct SDK path share. Re-exposing
   * them as host tools would fork one tool surface into two definitions, and
   * would change their identity: host tools arrive under a different `mcp__*`
   * prefix that the `AUTO_ALLOWED_INTERNAL_TOOLS` allow-list does not match, so
   * the two GitHub WRITE tools riding that server would silently inherit a
   * blanket approval. If host tools are ever adopted they must also be listed in
   * `toolApproval` so they route through the gate.
   */
  tools?: Record<string, unknown>;
  activeTools?: string[];
  inactiveTools?: string[];
  permissionMode?: string;
  toolApproval?: HarnessToolApproval;
  sandboxConfig?: {
    workDir?: string;
    bootstrapHash?: string;
    onBootstrap?: (ctx: unknown) => Promise<void>;
    onSession?: (ctx: unknown) => Promise<void>;
  };
  debug?: boolean;
  onLog?: (line: unknown) => void;
}

export interface HarnessAgentLike {
  createSession(config?: {
    sessionId?: string;
    resumeFrom?: unknown;
    continueFrom?: unknown;
  }): PromiseLike<HarnessSession>;
  stream(opts: {
    session: HarnessSession;
    prompt?: unknown;
    messages?: unknown;
  }): PromiseLike<HarnessStreamResult>;
  /**
   * Resume a turn suspended on a permission request. The stream from
   * `stream()` CLOSES when the adapter suspends, so this is what actually
   * completes any run that touches a file.
   */
  continueStream(opts: {
    session: HarnessSession;
    toolApprovalContinuations?: readonly unknown[];
  }): PromiseLike<HarnessStreamResult>;
  generate(opts: {
    session: HarnessSession;
    prompt?: unknown;
    messages?: unknown;
  }): PromiseLike<HarnessGenerateResult>;
}

export type HarnessAgentCtor = new (options: HarnessAgentOptions) => HarnessAgentLike;

/**
 * Adapter-level settings — the options that belong to the RUNTIME rather than
 * the agent loop, so they must go through the adapter factory and not the
 * `HarnessAgent` constructor. `model` and `maxTurns` are the load-bearing ones:
 * without them the CLI silently uses its own defaults, which is how a run ends
 * up on a model the user did not select.
 */
export interface HarnessAdapterSettings {
  model?: string;
  maxTurns?: number;
  env?: Record<string, string>;
  /** Native (Claude Code stdio) MCP server definitions, keyed by name. */
  mcpServers?: Record<string, unknown>;
}

/**
 * Capability flags an adapter instance carries as plain own properties.
 *
 * Read structurally off the object the factory returns — never imported — so
 * the no-`@ai-sdk`-imports rule holds. `supportsBuiltinToolApprovals` is the
 * load-bearing one: when it is not `true`, the adapter cannot ask Limboo for
 * permission before a built-in tool edits a file or runs a command, and the run
 * must be refused rather than run ungated.
 */
export interface HarnessAdapterFlags {
  harnessId?: string;
  supportsBuiltinToolApprovals?: boolean;
  supportsBuiltinToolFiltering?: boolean;
  /** The adapter's built-in tool set, keyed by the identity it emits. */
  builtinTools?: Record<string, unknown>;
}

/** What `loadHarness()` resolves to. */
export interface LoadedHarness {
  HarnessAgent: HarnessAgentCtor;
  /** The ready-made adapter instance (no adapter-level settings applied). */
  adapter: unknown;
  /**
   * The adapter FACTORY. Preferred over {@link adapter} whenever any
   * adapter-level setting is needed — notably the model.
   */
  createAdapter?: (settings: HarnessAdapterSettings) => unknown;
  /** `stepCountIs(n)` from `ai`, used for `stopWhen`. */
  stepCountIs: (n: number) => unknown;
}
