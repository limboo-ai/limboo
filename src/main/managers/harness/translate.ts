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
import { absolutizeToolInput, harnessToolName } from './identity';
import type { HarnessStreamPart, HarnessUsage } from './types';

/**
 * A built-in or custom tool call the adapter is waiting on a decision for.
 *
 * Returned by {@link translatePart} rather than resolved inside it: answering
 * requires `await`ing Limboo's permission gate, and this module is pure by
 * contract (no DB, no IPC, no clock — the `graph/builder.ts` rule). The runtime
 * collects these, drains them after the stream closes, and resumes.
 */
export interface HarnessApprovalRequest {
  approvalId: string;
  /** Limboo-shaped identity (native-cased), for the gate and the chip. */
  toolName: string;
  /** Re-absolutised input, for the guards and the dialog. */
  input: Record<string, unknown>;
  /** The framework's own tool-call object, passed back verbatim on resume. */
  toolCall: Record<string, unknown>;
}

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
 * Returns a {@link HarnessApprovalRequest} when the adapter is waiting on a
 * permission decision, and `undefined` otherwise. The caller must answer every
 * returned request — an unanswered one leaves the turn suspended forever.
 *
 * Throws ONLY for an `error` part, so the failure travels the same path a
 * Claude/Cursor failure does — `runWithRecovery` catches it and
 * `classifyAgentError` decides recoverability. Nothing else here throws.
 */
export function translatePart(
  part: HarnessStreamPart,
  bridge: ProviderRunBridge,
  ctx: TranslateContext,
  cwd: string,
): HarnessApprovalRequest | undefined {
  switch (part.type) {
    case 'text-start':
      bridge.ensureStreaming();
      return;

    // The adapter is asking permission for a tool it is about to run. This is
    // the ONLY gate on the harness path for built-in tools, and it only fires
    // because `permissionMode` is not 'allow-all' (see permissions.ts).
    case 'tool-approval-request': {
      const call = asRecord(part.toolCall);
      const approvalId = typeof part.approvalId === 'string' ? part.approvalId : '';
      const rawName = typeof call.toolName === 'string' ? call.toolName : '';
      if (!approvalId || !rawName) {
        // Unanswerable: without an id there is nothing to resume with. Report
        // it rather than silently hanging the turn.
        bridge.diag(
          'tool',
          'error',
          'Harness approval request was unusable',
          `approvalId=${approvalId ? 'present' : 'missing'} toolName=${rawName || 'missing'}`,
        );
        return;
      }
      const native = typeof call.nativeName === 'string' ? call.nativeName : undefined;
      return {
        approvalId,
        toolName: harnessToolName(rawName, native),
        // `input` on the STREAM part is already parsed by the framework; the
        // JSON-string form only appears on the session's pending-approval
        // accessor, which is the runtime's fallback.
        input: absolutizeToolInput(asRecord(call.input), cwd),
        toolCall: call,
      };
    }

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
      // Same identity + path treatment as the approval path, so the chip in the
      // stream and the dialog the user answers describe the same call.
      const native = typeof part.nativeName === 'string' ? part.nativeName : undefined;
      bridge.onToolUse(
        id,
        harnessToolName(name, native),
        absolutizeToolInput(asRecord(part.input), cwd),
        parentIdFrom(part),
      );
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
      // `response.id` is the per-REQUEST id, not a session token — persisting
      // it as a resume handle stored garbage under the legacy provider key and
      // corrupted the direct-SDK path's own resume row. The harness's real
      // resume state is a structured object returned by
      // `session.detach()`/`stop()`, which the runtime owns; nothing in the
      // stream carries it. So this branch reports usage and nothing else.
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
