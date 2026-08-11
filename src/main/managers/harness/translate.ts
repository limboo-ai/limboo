/**
 * AI SDK `StreamPart` → {@link ProviderRunBridge}.
 *
 * The twin of `cursor/translate.ts`, and written to the same contract:
 * FORGIVING and STRUCTURAL. Unknown part types are ignored by design, because
 * the AI SDK's part vocabulary is large (40+ kinds), grows between releases,
 * and these packages are experimental. A translator that threw on an
 * unrecognised frame would turn every SDK addition into a broken run.
 *
 * Deliberately pure: no DB, no IPC, no clock — the `graph/builder.ts` and
 * `telemetry/accumulator.ts` contract. Everything it learns it reports through
 * the bridge, so persistence, the timeline, the Work Graph and Runtime
 * Telemetry all stay owned by AgentManager and provider-neutral.
 */
import type { ProviderRunBridge } from '../agent/providerBridge';
import type { HarnessStreamPart, HarnessUsage } from './types';

/** Per-run mutable state the translator threads across frames. */
export interface TranslateContext {
  /** Text accumulated this turn, used as the final result body. */
  text: string;
  /** Tool calls we have announced, so a result can be matched to a start. */
  readonly openCalls: Set<string>;
  /** Set once the provider names its session/thread, for resume storage. */
  sessionId?: string;
  /** Last measured usage, reported at finish. */
  usage?: HarnessUsage;
  /** True once a terminal frame decided the outcome. */
  finished: boolean;
  ok: boolean;
}

export function newTranslateContext(): TranslateContext {
  return { text: '', openCalls: new Set(), finished: false, ok: true };
}

/**
 * The subagent-nesting escape hatch.
 *
 * `parent_tool_use_id` is the ONLY signal that distinguishes a worker's work
 * from the main agent's, and the AI SDK part vocabulary has no first-class
 * field for it — the adapter may or may not forward it in `providerMetadata`.
 * Every guess about where it lives is confined to this one function, so if it
 * turns out to be carried under a different key that is a one-line fix, and if
 * it is absent the run renders FLAT (Cursor's existing posture) rather than
 * having nesting invented for it.
 */
export function parentIdFrom(part: HarnessStreamPart): string | undefined {
  const meta = part.providerMetadata;
  if (!meta) return undefined;
  for (const bag of Object.values(meta)) {
    if (!bag || typeof bag !== 'object') continue;
    for (const key of ['parentToolUseId', 'parent_tool_use_id', 'parentCallId']) {
      const v = (bag as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return undefined;
}

/** Coerce a tool output/error into displayable text. */
function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Fold one stream part into the bridge.
 *
 * Throws ONLY for an `error` part, so the failure travels the same path a
 * Claude/Cursor failure does — `runWithRecovery` catches it and
 * `classifyAgentError` decides recoverability. Nothing else here throws.
 */
export function translatePart(
  part: HarnessStreamPart,
  bridge: ProviderRunBridge,
  ctx: TranslateContext,
): void {
  switch (part.type) {
    case 'text-start':
      bridge.ensureStreaming();
      return;

    case 'text-delta': {
      const text = part.text ?? part.delta;
      if (typeof text === 'string' && text.length > 0) {
        ctx.text += text;
        bridge.queueDelta(text);
      }
      return;
    }

    case 'text-end':
      // `finish` finalises; closing here would split one reply into two
      // bubbles whenever the model emits several text blocks around a tool.
      return;

    case 'reasoning-delta': {
      const text = part.text ?? part.delta;
      if (typeof text === 'string' && text.length > 0) bridge.onThinking?.(text);
      return;
    }

    // A call is announced as soon as its input is complete. `tool-call` and
    // `tool-input-available` are two spellings of the same moment depending on
    // streaming mode, so dedupe on the id rather than picking one.
    case 'tool-call':
    case 'tool-input-available': {
      const id = part.toolCallId;
      const name = part.toolName;
      if (!id || !name || ctx.openCalls.has(id)) return;
      ctx.openCalls.add(id);
      bridge.onToolUse(id, name, asRecord(part.input), parentIdFrom(part));
      return;
    }

    case 'tool-result':
    case 'tool-output-available': {
      const id = part.toolCallId;
      if (!id) return;
      ctx.openCalls.delete(id);
      bridge.onToolResult(id, 'done', asText(part.output));
      return;
    }

    case 'tool-error':
    case 'tool-input-error':
    case 'tool-output-error': {
      const id = part.toolCallId;
      if (!id) return;
      ctx.openCalls.delete(id);
      bridge.onToolResult(id, 'error', asText(part.errorText ?? part.error ?? part.output));
      return;
    }

    case 'tool-output-denied': {
      // The gate refused it. The denial is already recorded by decideToolUse —
      // settle the chip so it does not spin for the session's lifetime.
      const id = part.toolCallId;
      if (!id) return;
      ctx.openCalls.delete(id);
      bridge.onToolResult(id, 'error', 'Denied.');
      return;
    }

    case 'start-step':
    case 'finish-step': {
      const usage = part.usage ?? part.totalUsage;
      if (usage) {
        ctx.usage = usage;
        bridge.onUsage?.({});
      }
      if (!ctx.sessionId && part.response?.id) {
        ctx.sessionId = part.response.id;
        bridge.onInit(part.response.id);
      }
      return;
    }

    case 'finish': {
      ctx.usage = part.totalUsage ?? part.usage ?? ctx.usage;
      ctx.finished = true;
      ctx.ok = part.finishReason !== 'error';
      bridge.finishStreaming();
      bridge.onResult(ctx.ok, ctx.text);
      return;
    }

    case 'abort':
      ctx.finished = true;
      ctx.ok = false;
      return;

    case 'error': {
      const message = asText(part.error ?? part.errorText) ?? 'The harness run failed.';
      throw new Error(message);
    }

    default:
      // Unknown part kinds are IGNORED on purpose — see the module header.
      return;
  }
}
