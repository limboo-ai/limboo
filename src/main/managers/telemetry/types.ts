/**
 * Runtime Telemetry — the internal vocabulary between the provider adapters and
 * the accumulator.
 *
 * `ProviderTelemetrySignal` is the seam. Both adapters translate their own wire
 * format into this union and nothing downstream ever sees an SDK type or a
 * Cursor event again — the same shape that lets the Work Graph's `builder.ts`
 * stay a pure reducer over two very different providers.
 *
 * These types are MAIN-ONLY. What crosses IPC is `RuntimeSnapshot` in
 * `@shared/types`, which is a different, narrower thing on purpose: the signals
 * carry raw per-request measurements, the snapshot carries the normalized,
 * capability-gated view.
 */
import type { AgentProvider } from '@shared/constants';
import type { SessionPermissionMode } from '@shared/types';

/** Token counts for one API request, exactly as the provider reported them. */
export interface RequestUsage {
  /** Fresh input tokens. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

/** Character counts of the blocks Limboo itself composed for a prompt. */
export interface InjectedContextChars {
  memory: number;
  search: number;
  resume: number;
  attachments: number;
  /** The user's prompt text, as sent. */
  prompt: number;
  /** Hits behind the memory block (count only, for the environment panel). */
  memoryHits: number;
  searchHits: number;
  /** Budgets these were retrieved under, so the UI can show headroom. */
  memoryBudget: number;
  searchBudget: number;
}

/** Per-model limits the provider reported. */
export interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

/**
 * A normalized telemetry signal. Every variant carries `sessionId` so the
 * manager can route without a second lookup, and every numeric field is
 * something a provider actually measured — nothing here is inferred.
 */
export type ProviderTelemetrySignal =
  | {
      kind: 'run-start';
      sessionId: string;
      runId: string;
      provider: AgentProvider;
      model: string;
      mode: SessionPermissionMode;
      injected: InjectedContextChars;
    }
  | {
      /**
       * One API request began. `messageId` deduplicates: parallel tool calls
       * emit several assistant messages sharing one id with identical usage,
       * and counting them all multiplies the context gauge by the fan-out.
       *
       * `parentCallId` is the SDK's `parent_tool_use_id`. When set, the frame
       * belongs to a SUBAGENT running in its own context window and must never
       * touch the parent's gauge.
       */
      kind: 'request-start';
      sessionId: string;
      messageId: string;
      usage: RequestUsage;
      parentCallId?: string;
    }
  | {
      /** Cumulative output tokens for the in-flight request. */
      kind: 'output-progress';
      sessionId: string;
      outputTokens: number;
      parentCallId?: string;
    }
  | { kind: 'ttft'; sessionId: string; ms: number }
  | {
      kind: 'compaction';
      sessionId: string;
      trigger: 'manual' | 'auto';
      preTokens: number;
      postTokens?: number;
      durationMs?: number;
    }
  | { kind: 'status'; sessionId: string; status: 'compacting' | 'requesting' | null }
  | { kind: 'thinking-tokens'; sessionId: string; estimatedTokens: number }
  | {
      kind: 'api-retry';
      sessionId: string;
      attempt: number;
      maxRetries: number;
      status: number | null;
    }
  | {
      kind: 'tool-progress';
      sessionId: string;
      callId: string;
      name: string;
      elapsedSeconds: number;
      parentCallId?: string;
    }
  | {
      /**
       * Account-scoped, not session-scoped: a rolling quota belongs to the
       * user's plan, so it fans out to every live session's snapshot.
       */
      kind: 'quota';
      provider: AgentProvider;
      windowKind: string;
      status: 'allowed' | 'allowed_warning' | 'rejected';
      utilization?: number;
      resetsAt?: number;
      isUsingOverage?: boolean;
      surpassedThreshold?: number;
      errorCode?: string;
    }
  | {
      kind: 'run-end';
      sessionId: string;
      durationMs?: number;
      durationApiMs?: number;
      ttftMs?: number;
      numTurns?: number;
      /**
       * From `modelUsage`, which INCLUDES subagent requests. Anthropic
       * documents that the flat `usage` field undercounts as soon as nesting
       * occurs, so the two are never mixed into one field.
       */
      totals?: RequestUsage;
      costEstimateUsd?: number;
      permissionDenials?: number;
      apiErrorStatus?: number;
      /** Per-model limits observed on this result, keyed by model id. */
      modelLimits?: Record<string, ModelLimits>;
    };

/** The narrow sink `AgentManager` is handed. Nothing else is exposed to it. */
export interface RuntimeSink {
  (signal: ProviderTelemetrySignal): void;
}
