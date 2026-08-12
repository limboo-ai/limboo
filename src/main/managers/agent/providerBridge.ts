/**
 * The provider seam: run-scoped callbacks a provider runtime uses to report
 * what happened, without knowing anything about how Limboo records it.
 *
 * All streaming / tool / persistence / telemetry behaviour stays owned by
 * `AgentManager`; a runtime only translates its own wire format into these
 * calls. That is what lets Cursor's print-mode NDJSON, the Claude Agent SDK's
 * message stream, and any future adapter share one implementation of the
 * conversation timeline, the permission gate, the Work Graph and the Runtime
 * panel.
 *
 * This interface lived in `cursor/types.ts` while Cursor was the only adapter
 * behind the seam. It is provider-neutral, so it lives here now;
 * `cursor/types.ts` re-exports it and no Cursor import changed.
 *
 * EXTENSION RULE: every member added for a new adapter must be OPTIONAL. An
 * existing runtime's bridge object has to keep satisfying the type untouched —
 * a required addition would silently make the older adapter a compile error and
 * tempt a stub implementation that lies about what it observed.
 */

/** Which stage of the OS-level jail a runtime is reporting. */
export type SandboxPhase = 'preparing' | 'ready' | 'network' | 'unavailable';

/** A delegation lifecycle signal, when a provider reports one. */
export interface SubagentSignal {
  /** The spawning tool call this worker belongs to, when the provider says. */
  callId?: string;
  description?: string;
  model?: string;
  /** Provider-measured counters; omit anything that was not measured. */
  durationMs?: number;
  toolUses?: number;
  totalTokens?: number;
}

/**
 * Run-scoped callbacks into AgentManager. All streaming/tool/persistence
 * behavior stays owned by AgentManager — the runtime only translates wire
 * events into these calls.
 */
export interface ProviderRunBridge {
  ensureStreaming(): void;
  queueDelta(text: string): void;
  finishStreaming(finalText?: string): void;
  /**
   * `parentCallId` is the ONLY subagent-nesting signal (the Agent SDK's
   * `parent_tool_use_id`). Optional because a provider that does not report it
   * must render flat rather than have nesting invented for it — Cursor's stream
   * carries no analogue and passes nothing here.
   */
  onToolUse(
    id: string,
    name: string,
    input: Record<string, unknown>,
    parentCallId?: string,
  ): void;
  onToolResult(id: string, status: 'done' | 'error', output?: string): void;
  /** First `system/init` event → persist the provider resume token. */
  onInit(chatId: string): void;
  /** Terminal result event (present only on clean completions). */
  onResult(ok: boolean, text: string): void;
  /**
   * Runtime Telemetry. Optional because a provider bridge is not obliged to
   * measure anything — and Cursor very nearly does not: `duration_ms` on the
   * result event is the only quantitative field its stream carries. Token
   * counts in `--output-format stream-json` are an open Cursor feature
   * request, not shipped, and request quotas live only in the team-scoped
   * Enterprise Admin API, which this app deliberately never calls.
   */
  onUsage?(usage: { durationMs?: number }): void;
  /** Reasoning/thinking deltas, for providers that stream them separately. */
  onThinking?(text: string): void;
  /**
   * A plan document delivered as a first-class stream event. Claude captures
   * plans through `ExitPlanMode` in the permission gate and Cursor scrapes the
   * terminal result text; an adapter that simply hands over the document uses
   * this instead of either workaround.
   */
  onPlan?(markdown: string): void;
  /** Delegation lifecycle, when the provider reports it. */
  onSubagent?(kind: 'start' | 'stop' | 'progress', info: SubagentSignal): void;
  /** OS-jail lifecycle → the session timeline's status markers. */
  onSandboxStatus?(phase: SandboxPhase, detail?: string): void;
  /** Structured diagnostics (already-redacted detail only). */
  diag(
    category: string,
    severity: 'debug' | 'info' | 'warning' | 'error',
    label: string,
    detail?: string,
  ): void;
}
