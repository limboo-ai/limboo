/**
 * Terminal-result classification — the ONE place a provider's end-of-run signal
 * becomes a decision (retry? escalate? what do we tell the user?).
 *
 * Why this module exists, in one paragraph:
 *
 * `SDKResultError` (see `@anthropic-ai/claude-agent-sdk`'s `sdk.d.ts`) has **no
 * `result` field** — its payload lives in `errors: string[]`, next to structured
 * `stop_reason` and `terminal_reason`. Reading only `result` collapses every
 * failure into the bare subtype string, which no classifier can act on. Worse,
 * when the CLI transport then dies the SDK *replaces* the exit error with
 * ``Claude Code returned an error result: ${errors.join('; ')}`` — so the SAME
 * failure reaches us as structured data on one path and as English prose on the
 * other, and only the prose path ever matched the old string tests. That race is
 * exactly why `[ede_diagnostic] … stop_reason=tool_use` looked intermittent.
 * {@link parseEdeDiagnostic} is the bridge: both paths are normalized into one
 * {@link TerminalResult} before anything decides anything.
 *
 * Both providers consume this module so their behavior and their user-facing
 * wording cannot drift — the same rationale `crownJewelPaths()` is shared across
 * all three security layers (CLAUDE.md §8).
 *
 * Nothing here logs, touches the DB, or reads settings: it is a pure mapper, so
 * it can be reasoned about (and unit-tested) without a live run.
 */
import type { AgentLifecycleStatus, RateLimitInfo, RequestOutcome } from '@shared/types';

/**
 * The Agent SDK's `TerminalReason` values, mirrored as documentation rather than
 * imported: the SDK is loaded through a runtime dynamic import (main is a CJS
 * bundle), and pinning a type to its exact version buys nothing when the field
 * arrives as untyped JSON anyway.
 *
 * The field below is deliberately typed `string`, not this union — a provider is
 * free to add reasons, and an unknown value must fall through the classifier
 * rather than fail to type-check.
 *
 * `blocking_limit` · `rapid_refill_breaker` · `prompt_too_long` · `image_error` ·
 * `model_error` · `api_error` · `malformed_tool_use_exhausted` ·
 * `aborted_streaming` · `aborted_tools` · `stop_hook_prevented` · `hook_stopped` ·
 * `tool_deferred` · `max_turns` · `background_requested` · `completed` ·
 * `budget_exhausted` · `structured_output_retry_exhausted` ·
 * `tool_deferred_unavailable` · `turn_setup_failed`
 */
export type TerminalReasonLike = string;

/** A provider-neutral normalization of an end-of-run signal. */
export interface TerminalResult {
  /** True only for a clean, non-error terminal result. */
  ok: boolean;
  /** SDK result subtype (`success` | `error_during_execution` | …). */
  subtype?: string;
  /** Structured stop reason, when the provider gave one. */
  stopReason?: string | null;
  /** Structured terminal reason — the most specific signal available. */
  terminalReason?: TerminalReasonLike;
  /** Raw diagnostic lines. Never shown to the user; kept for the console + log. */
  errors: string[];
  /** How many tool calls the provider itself refused (observability only). */
  denials?: number;
  /**
   * The joined raw text, built the same way the SDK builds it. This is what goes
   * to `diag()` / `logger`, and what the legacy string classifiers fall back to.
   */
  text: string;
}

/**
 * The decision. `message` is the ONLY string that may reach the conversation —
 * `TerminalResult.text` stays in the diagnostics console (CLAUDE.md: users must
 * never be shown `[ede_diagnostic]` prose).
 */
export interface TerminalClassification {
  outcome: RequestOutcome;
  /** If set, escalate lifecycle; otherwise lifecycle stays ready/current. */
  lifecycle?: AgentLifecycleStatus;
  rateLimit?: RateLimitInfo;
  /** True when a transparent recovery retry is warranted. */
  recoverable: boolean;
  /**
   * True when the retry must start a FRESH provider conversation — the stored
   * resume/chat id (if any) points at a transcript that fails identically on
   * every replay, so retrying with it is guaranteed to reproduce the failure.
   */
  retryFresh: boolean;
  /** Plain-English copy for the timeline. Never contains raw provider prose. */
  message: string;
}

/**
 * Error thrown when a run ends on a non-success terminal result, carrying the
 * structured record so the recovery loop classifies on DATA and never on the
 * message text. (`Error.message` still holds the raw text so an unhandled throw
 * remains legible in a stack trace.)
 */
export class AgentRunError extends Error {
  readonly terminal: TerminalResult;

  constructor(terminal: TerminalResult) {
    super(terminal.text || terminal.subtype || 'The run ended with errors.');
    this.name = 'AgentRunError';
    this.terminal = terminal;
  }
}

export function isAgentRunError(err: unknown): err is AgentRunError {
  return err instanceof AgentRunError;
}

/* ------------------------------------------------------------------ */
/* The CLI's `[ede_diagnostic]` line                                   */
/* ------------------------------------------------------------------ */

export interface EdeDiagnostic {
  /** Role of the last transcript record (`user` when a turn was interrupted). */
  resultType?: string;
  lastContentType?: string;
  /** `tool_use` here means a tool call was left without its tool_result. */
  stopReason?: string;
}

/**
 * Parse the Claude Code CLI's `[ede_diagnostic] k=v k=v` line out of arbitrary
 * error text. Case-insensitive and position-independent: the SDK is free to
 * prefix, join (`'; '`), or reword around it, and the CLI is free to add keys.
 *
 * Returns null when the marker is absent — callers then fall through to the
 * generic classifiers rather than inventing a shape.
 */
export function parseEdeDiagnostic(raw: string): EdeDiagnostic | null {
  if (!/ede_diagnostic/i.test(raw)) return null;
  const pick = (key: string): string | undefined => {
    // Bounded value charset: the CLI emits bare tokens (`user`, `tool_use`,
    // `n/a`, `null`). Stopping at whitespace keeps a joined multi-error string
    // from bleeding the next segment into this value.
    const m = new RegExp(`\\b${key}\\s*=\\s*([^\\s,;]+)`, 'i').exec(raw);
    return m ? m[1] : undefined;
  };
  return {
    resultType: pick('result_type'),
    lastContentType: pick('last_content_type'),
    stopReason: pick('stop_reason'),
  };
}

/**
 * True when the text carries the SDK's "replaced the exit error with the last
 * error result" wrapper. Case-insensitive on purpose — this is provider prose,
 * not a contract.
 */
export function isSwappedResultError(raw: string): boolean {
  return /returned an error result/i.test(raw);
}

/**
 * Recognize an interrupted turn from an ede diagnostic.
 *
 * `result_type=user` means the last transcript record is user-role: the CLI
 * injects a `[Request interrupted by user]` marker when a turn is cut short, so
 * consecutive user-role records are the fingerprint of an interrupt rather than
 * of a corrupt store. `stop_reason=tool_use` narrows it further — the interrupt
 * landed while a tool call had no matching tool_result.
 *
 * Upstream reference: anthropics/claude-agent-sdk-typescript#366, which also
 * establishes that the conversation is NOT permanently wedged — the next
 * well-formed prompt is answered normally. That is why the fix is "retry fresh",
 * not "surface a hard failure".
 */
export function isInterruptedTurn(ede: EdeDiagnostic | null): boolean {
  if (!ede) return false;
  return (
    ede.stopReason?.toLowerCase() === 'tool_use' || ede.resultType?.toLowerCase() === 'user'
  );
}

/* ------------------------------------------------------------------ */
/* Plain-English copy — shared by every provider                       */
/* ------------------------------------------------------------------ */

/**
 * The user-facing wording, keyed by the situation rather than by the provider,
 * so Claude and Cursor say the same thing about the same event. Exported so the
 * Cursor classifier reuses these exact strings instead of paraphrasing them.
 */
export const TERMINAL_COPY = {
  interrupted: 'The previous turn was interrupted before it finished — retrying.',
  malformedTool: "The agent's tool call was malformed — retrying.",
  maxTurns:
    'The agent reached its turn limit for this request. Raise it in Settings › Agent.',
  contextOverflow: 'Context window exceeded.',
  imageError: 'An attached image could not be processed.',
  providerError: 'The provider returned an error — retrying.',
  budget: 'This request hit its cost budget.',
  hookStopped: 'A configured hook stopped the run.',
  generic: 'The run ended with errors.',
} as const;

/* ------------------------------------------------------------------ */
/* The classifier                                                      */
/* ------------------------------------------------------------------ */

/**
 * Map a normalized terminal result onto a decision, or return null to mean "I
 * have no structured opinion — fall through to the caller's string classifier".
 *
 * Returning null rather than a generic verdict is deliberate: the existing
 * `classifyAgentError` / `classifyCursorError` regexes still own rate-limit,
 * auth and transport shapes, and this module must not shadow them.
 */
export function classifyTerminalResult(r: TerminalResult): TerminalClassification | null {
  const reason = r.terminalReason;
  const ede = parseEdeDiagnostic(r.text);

  // --- Interrupted turn: the transcript ends in an unanswered tool call. ---
  // Retrying with the same resume id replays the same broken transcript, so the
  // retry MUST be fresh. This is the `[ede_diagnostic] … stop_reason=tool_use`
  // case, and the `aborted_*` terminal reasons are the structured twin of it.
  if (
    reason === 'aborted_tools' ||
    reason === 'aborted_streaming' ||
    isInterruptedTurn(ede) ||
    r.stopReason === 'tool_use'
  ) {
    return {
      outcome: 'failed',
      recoverable: true,
      retryFresh: true,
      message: TERMINAL_COPY.interrupted,
    };
  }

  // A tool-call shape the model could not get right after its own retries.
  // Fresh: the exhausted attempts are in the transcript and bias the replay.
  if (reason === 'malformed_tool_use_exhausted') {
    return {
      outcome: 'failed',
      recoverable: true,
      retryFresh: true,
      message: TERMINAL_COPY.malformedTool,
    };
  }

  // Turn limit — a configuration outcome, not a fault. Not recoverable: an
  // automatic retry would burn the same budget and fail identically.
  if (reason === 'max_turns' || r.subtype === 'error_max_turns') {
    return {
      outcome: 'failed',
      recoverable: false,
      retryFresh: false,
      message: TERMINAL_COPY.maxTurns,
    };
  }

  if (reason === 'prompt_too_long') {
    return {
      outcome: 'context-overflow',
      recoverable: false,
      retryFresh: false,
      message: TERMINAL_COPY.contextOverflow,
    };
  }

  if (reason === 'image_error') {
    return {
      outcome: 'failed',
      recoverable: false,
      retryFresh: false,
      message: TERMINAL_COPY.imageError,
    };
  }

  // Provider-side transient. Lifecycle escalates so the UI shows reconnecting.
  if (reason === 'api_error' || reason === 'model_error' || reason === 'turn_setup_failed') {
    return {
      outcome: 'failed',
      lifecycle: 'reconnecting',
      recoverable: true,
      retryFresh: false,
      message: TERMINAL_COPY.providerError,
    };
  }

  if (reason === 'budget_exhausted' || r.subtype === 'error_max_budget_usd') {
    return {
      outcome: 'failed',
      recoverable: false,
      retryFresh: false,
      message: TERMINAL_COPY.budget,
    };
  }

  // A hook the USER configured refused the run. Retrying would just re-refuse.
  if (reason === 'hook_stopped' || reason === 'stop_hook_prevented') {
    return {
      outcome: 'failed',
      recoverable: false,
      retryFresh: false,
      message: TERMINAL_COPY.hookStopped,
    };
  }

  return null;
}

/**
 * Build a {@link TerminalResult} from a thrown error's text alone — the path
 * taken when the SDK swapped the transport error for the last error result and
 * all we have left is prose. Returns null when the text carries no marker we
 * recognize, so the caller keeps its existing regex classification.
 */
export function terminalResultFromText(raw: string): TerminalResult | null {
  const ede = parseEdeDiagnostic(raw);
  if (!ede && !isSwappedResultError(raw)) return null;
  return {
    ok: false,
    subtype: 'error_during_execution',
    // `stop_reason=null` is a literal in the CLI's output; keep it as null so
    // downstream `=== 'tool_use'` tests read correctly rather than matching the
    // four-character string "null".
    stopReason: ede?.stopReason && ede.stopReason !== 'null' ? ede.stopReason : null,
    errors: [raw],
    text: raw,
  };
}

/** Join error lines exactly the way the SDK's own reducer does. */
export function joinErrors(errors: readonly string[]): string {
  return errors
    .map((e) => String(e ?? '').trim())
    .filter(Boolean)
    .join('; ');
}
