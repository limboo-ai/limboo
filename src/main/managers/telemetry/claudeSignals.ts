/**
 * Claude Agent SDK wire format → {@link ProviderTelemetrySignal}.
 *
 * Pure functions over already-received messages: no I/O, no clock, no state.
 * This is the `cursor/translate.ts` idiom applied to the other provider — the
 * one place that knows the SDK's field names, so the accumulator downstream
 * never sees an SDK type.
 *
 * Everything read here is documented SDK surface:
 *   - `stream_event` → `message_start` / `message_delta` carry `usage`
 *     (`BetaUsage` / `BetaMessageDeltaUsage`).
 *   - `result` carries `usage`, `modelUsage`, `total_cost_usd`, `num_turns`,
 *     `duration_ms`, `duration_api_ms`, `ttft_ms`, `permission_denials`.
 *   - `modelUsage[model]` carries `contextWindow` and `maxOutputTokens` — the
 *     denominator, provider-supplied, which is why Limboo needs no model table.
 *   - `rate_limit_event` carries `rate_limit_info` (the rolling quota windows).
 *   - `system/compact_boundary`, `system/status`, `system/thinking_tokens`,
 *     `system/api_retry` and `tool_progress` carry the rest.
 *
 * Reads are defensive on purpose. These messages come from a separately
 * versioned CLI: a field that changes shape must yield `null` here, not throw
 * into a run.
 */
import { TELEMETRY_LIMITS } from '@shared/constants';
import type { ModelLimits, ProviderTelemetrySignal, RequestUsage } from './types';

/** Finite non-negative number, or 0. Everything numeric goes through this. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Finite non-negative number, or undefined — for genuinely optional fields. */
function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function readUsage(raw: unknown): RequestUsage {
  const u = rec(raw) ?? {};
  return {
    inputTokens: num(u.input_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheCreationTokens: num(u.cache_creation_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

/**
 * Translate a `stream_event` message. Returns null for the content deltas that
 * drive the transcript — those are the render stream's business, not this one.
 */
export function signalsFromStreamEvent(
  sessionId: string,
  msg: Record<string, unknown>,
): ProviderTelemetrySignal[] {
  const out: ProviderTelemetrySignal[] = [];
  const ev = rec(msg.event);
  if (!ev) return out;

  const parentRaw = msg.parent_tool_use_id;
  const parentCallId = typeof parentRaw === 'string' && parentRaw ? parentRaw : undefined;

  if (ev.type === 'message_start') {
    const message = rec(ev.message);
    // `message.id` is the dedupe key. Without an id we cannot tell a genuine
    // second request from a repeat of the same one, so we drop the sample
    // rather than risk double-counting the context gauge.
    const messageId = str(message?.id);
    if (message && messageId) {
      out.push({
        kind: 'request-start',
        sessionId,
        messageId,
        usage: readUsage(message.usage),
        parentCallId,
      });
    }
  } else if (ev.type === 'message_delta') {
    const usage = rec(ev.usage);
    if (usage) {
      out.push({
        kind: 'output-progress',
        sessionId,
        outputTokens: num(usage.output_tokens),
        parentCallId,
      });
    }
  }

  // Time to first token rides the partial-message wrapper, not the inner event.
  const ttft = optNum(msg.ttft_ms);
  if (ttft !== undefined) out.push({ kind: 'ttft', sessionId, ms: ttft });

  return out;
}

/**
 * Translate a `system` message. Returns an empty array for `init` and the
 * `task_*` subtypes, which `AgentManager` already routes elsewhere.
 */
export function signalsFromSystem(
  sessionId: string,
  msg: Record<string, unknown>,
): ProviderTelemetrySignal[] {
  switch (msg.subtype) {
    case 'compact_boundary': {
      const meta = rec(msg.compact_metadata);
      if (!meta) return [];
      return [
        {
          kind: 'compaction',
          sessionId,
          trigger: meta.trigger === 'manual' ? 'manual' : 'auto',
          preTokens: num(meta.pre_tokens),
          postTokens: optNum(meta.post_tokens),
          durationMs: optNum(meta.duration_ms),
        },
      ];
    }
    case 'status': {
      const s = msg.status;
      const status = s === 'compacting' || s === 'requesting' ? s : null;
      return [{ kind: 'status', sessionId, status }];
    }
    case 'thinking_tokens':
      return [
        { kind: 'thinking-tokens', sessionId, estimatedTokens: num(msg.estimated_tokens) },
      ];
    case 'api_retry':
      return [
        {
          kind: 'api-retry',
          sessionId,
          attempt: num(msg.attempt),
          maxRetries: num(msg.max_retries),
          status: typeof msg.error_status === 'number' ? msg.error_status : null,
        },
      ];
    default:
      return [];
  }
}

/** Translate a `tool_progress` message (per-tool elapsed-time heartbeat). */
export function signalFromToolProgress(
  sessionId: string,
  msg: Record<string, unknown>,
): ProviderTelemetrySignal | null {
  const callId = str(msg.tool_use_id);
  const name = str(msg.tool_name);
  if (!callId || !name) return null;
  const parentRaw = msg.parent_tool_use_id;
  return {
    kind: 'tool-progress',
    sessionId,
    callId,
    name: name.slice(0, TELEMETRY_LIMITS.toolNameMax),
    elapsedSeconds: num(msg.elapsed_time_seconds),
    parentCallId: typeof parentRaw === 'string' && parentRaw ? parentRaw : undefined,
  };
}

/**
 * Translate a `rate_limit_event`. This is the ONLY legitimate source of a
 * rolling quota figure — the previous signal was a regex over an error string,
 * which by definition only fired after the user had already been cut off.
 *
 * Account-scoped, so it carries no session id: the manager fans it out.
 */
export function signalFromRateLimit(
  msg: Record<string, unknown>,
): ProviderTelemetrySignal | null {
  const info = rec(msg.rate_limit_info);
  if (!info) return null;
  const status =
    info.status === 'rejected' || info.status === 'allowed_warning' ? info.status : 'allowed';
  return {
    kind: 'quota',
    provider: 'anthropic',
    // Verbatim provider vocabulary: an unrecognised window is still real usage.
    windowKind: str(info.rateLimitType) ?? 'unknown',
    status,
    utilization: optNum(info.utilization),
    resetsAt: optNum(info.resetsAt),
    isUsingOverage: info.isUsingOverage === true,
    surpassedThreshold: optNum(info.surpassedThreshold),
    errorCode: str(info.errorCode),
  };
}

/**
 * Translate a `result` message into the run-end signal.
 *
 * Totals come from `modelUsage`, summed across models, because Anthropic
 * documents that `usage` counts only the top-level loop and undercounts as
 * soon as a subagent runs. The flag on the signal records which one was used
 * so the UI can say so rather than quietly conflating them.
 */
export function signalFromResult(
  sessionId: string,
  msg: Record<string, unknown>,
): ProviderTelemetrySignal {
  const modelUsage = rec(msg.modelUsage);
  const totals: RequestUsage = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
  };
  const modelLimits: Record<string, ModelLimits> = {};
  let sawModelUsage = false;

  if (modelUsage) {
    for (const [model, raw] of Object.entries(modelUsage)) {
      const mu = rec(raw);
      if (!mu) continue;
      sawModelUsage = true;
      totals.inputTokens += num(mu.inputTokens);
      totals.outputTokens += num(mu.outputTokens);
      totals.cacheReadTokens += num(mu.cacheReadInputTokens);
      totals.cacheCreationTokens += num(mu.cacheCreationInputTokens);
      const contextWindow = num(mu.contextWindow);
      const maxOutputTokens = num(mu.maxOutputTokens);
      // Only record a limit pair the provider actually filled in — a zero
      // window would make every later ratio nonsense.
      if (contextWindow > 0 && maxOutputTokens > 0) {
        modelLimits[model] = { contextWindow, maxOutputTokens };
      }
    }
  }

  const denials = Array.isArray(msg.permission_denials) ? msg.permission_denials.length : undefined;

  return {
    kind: 'run-end',
    sessionId,
    durationMs: optNum(msg.duration_ms),
    durationApiMs: optNum(msg.duration_api_ms),
    ttftMs: optNum(msg.ttft_ms),
    numTurns: optNum(msg.num_turns),
    totals: sawModelUsage ? totals : undefined,
    costEstimateUsd: optNum(msg.total_cost_usd),
    permissionDenials: denials,
    apiErrorStatus: typeof msg.api_error_status === 'number' ? msg.api_error_status : undefined,
    modelLimits: Object.keys(modelLimits).length > 0 ? modelLimits : undefined,
  };
}
