/**
 * Runtime Telemetry — the accumulator.
 *
 * A PURE REDUCER, following `graph/builder.ts`: no database, no IPC, no
 * `Date.now()` (the clock is passed in), no settings reads. Signals go in, a
 * `RuntimeSnapshot` comes out. That is what makes the honesty rules below
 * testable in isolation and impossible to bypass from a UI edit.
 *
 * THE THREE RULES THIS FILE ENFORCES
 *
 * 1. Deduplicate `message_start` by `message.id`. Parallel tool calls emit
 *    several assistant messages sharing one id with identical usage — Anthropic
 *    documents this — so counting each one multiplies the context gauge by the
 *    fan-out width. This is the single most likely way for the number to be
 *    quietly, plausibly wrong.
 *
 * 2. Never let a subagent's frames touch the parent's gauge. A worker runs in
 *    its own context window; `parent_tool_use_id` is the only signal that
 *    distinguishes it, and it arrives on complete messages only.
 *
 * 3. The measured total is the authority; estimates fill in beneath it. The
 *    provider reports ONE aggregate input-token count and no breakdown, so the
 *    per-contributor split can only come from Limboo measuring the characters
 *    of the blocks it composed itself. Those are estimates and are labelled as
 *    such. When they sum ABOVE the measured total, the split is DROPPED rather
 *    than scaled to fit: a bar that always adds up is worth nothing if it
 *    reaches that state by inventing the numbers.
 */
import { TELEMETRY_LIMITS } from '@shared/constants';
import type { AgentProvider } from '@shared/constants';
import type {
  ContextSegment,
  ContextSegmentId,
  RuntimeContext,
  RuntimeQuotaWindow,
  RuntimeRun,
  RuntimeSnapshot,
  RuntimeToolActivity,
  SessionPermissionMode,
} from '@shared/types';
import { CAPABILITY_NOTE, PROVIDER_CAPABILITIES } from '@shared/runtime';
import type { InjectedContextChars, ModelLimits, ProviderTelemetrySignal } from './types';

/** Limits the accumulator reads from persistent storage, injected per call. */
export interface LimitLookup {
  (model: string): (ModelLimits & { autoCompactTokens?: number }) | undefined;
}

/** Limboo-owned facts the manager supplies; the accumulator never fetches. */
export interface HostFacts {
  providerSessionId?: string;
  worktree?: { branch: string; path: string };
  attachmentCount?: number;
  mcp?: { connected: number; total: number };
  index?: { indexed: boolean; files: number };
  /** Chars of tool results observed this session, split by MCP vs built-in. */
  toolResultChars: number;
  mcpResultChars: number;
  /** Chars of persisted conversation turns since the last compaction. */
  conversationChars: number;
}

const EMPTY_INJECTED: InjectedContextChars = {
  memory: 0,
  search: 0,
  resume: 0,
  attachments: 0,
  prompt: 0,
  memoryHits: 0,
  searchHits: 0,
  memoryBudget: 0,
  searchBudget: 0,
};

/** Per-session mutable state. Session-scoped facts outlive a single run. */
interface SessionState {
  provider: AgentProvider;
  model: string;
  mode: SessionPermissionMode;
  live: boolean;
  run?: RuntimeRun;
  injected: InjectedContextChars;

  /** Dedupe ring for `message_start`. Insertion-ordered; oldest evicted. */
  seenMessageIds: string[];
  /** Measured prompt tokens of the most recent MAIN-STREAM request. */
  usedTokens: number;
  /** Previous prompt size, for the growth series. */
  lastPrompt?: number;
  /** Prompt growth per request, for the remaining-turns projection. */
  growth: number[];

  /** Live output-token tracking, for tokens/sec. */
  lastOutput: number;
  lastOutputAt: number;

  compactions?: RuntimeContext['compactions'];
  tools: Map<string, RuntimeToolActivity>;
  thinkingTokens?: number;
  providerStatus?: 'compacting' | 'requesting';

  contextAt: number;
}

function newSession(
  provider: AgentProvider,
  model: string,
  mode: SessionPermissionMode,
): SessionState {
  return {
    provider,
    model,
    mode,
    live: false,
    injected: { ...EMPTY_INJECTED },
    seenMessageIds: [],
    usedTokens: 0,
    growth: [],
    lastOutput: 0,
    lastOutputAt: 0,
    tools: new Map(),
    contextAt: 0,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Chars → estimated tokens. Always ceil: never under-report consumption. */
function estTokens(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / TELEMETRY_LIMITS.charsPerToken);
}

/**
 * The accumulator. One instance owns every session's state; the manager drives
 * it and does the persisting, broadcasting and clock-reading around it.
 */
export class TelemetryAccumulator {
  private readonly sessions = new Map<string, SessionState>();
  /** Account-scoped: a rolling quota belongs to the plan, not to a session. */
  private readonly quota = new Map<string, RuntimeQuotaWindow>();

  /** Drop a session's state entirely (trashed / purged / cleared). */
  forget(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
    this.quota.clear();
  }

  /** Sessions currently holding state — the fan-out set for a quota update. */
  sessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  isLive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.live === true;
  }

  /**
   * Apply one signal. Returns the session id whose snapshot changed, or null
   * when the signal changed nothing worth pushing (a subagent frame, an unknown
   * session). Quota signals return null and are fanned out by the caller.
   */
  apply(signal: ProviderTelemetrySignal, now: number): string | null {
    if (signal.kind === 'quota') {
      this.quota.set(signal.windowKind, {
        kind: signal.windowKind,
        status: signal.status,
        utilization: signal.utilization,
        resetsAt: signal.resetsAt,
        isUsingOverage: signal.isUsingOverage,
        surpassedThreshold: signal.surpassedThreshold,
        errorCode: signal.errorCode,
        at: now,
      });
      return null;
    }

    if (signal.kind === 'run-start') {
      const state = newSession(signal.provider, signal.model, signal.mode);
      // Session-scoped facts survive a new run within the same session: a
      // compaction that happened two runs ago still describes this window.
      const prev = this.sessions.get(signal.sessionId);
      if (prev) {
        state.compactions = prev.compactions;
        state.usedTokens = prev.usedTokens;
        state.lastPrompt = prev.lastPrompt;
        state.growth = prev.growth;
        state.contextAt = prev.contextAt;
      }
      state.live = true;
      state.injected = signal.injected;
      state.run = {
        runId: signal.runId,
        model: signal.model,
        provider: signal.provider,
        mode: signal.mode,
        startedAt: now,
      };
      this.sessions.set(signal.sessionId, state);
      return signal.sessionId;
    }

    const state = this.sessions.get(signal.sessionId);
    if (!state) return null;

    switch (signal.kind) {
      case 'request-start': {
        // RULE 2: a subagent runs in its own context window. Its frames must
        // never move the parent's gauge.
        if (signal.parentCallId) return null;

        // RULE 1: parallel tool calls repeat one message id with identical
        // usage. Count it once.
        if (state.seenMessageIds.includes(signal.messageId)) return null;
        state.seenMessageIds.push(signal.messageId);
        if (state.seenMessageIds.length > TELEMETRY_LIMITS.seenMessageIds) {
          state.seenMessageIds.shift();
        }

        const u = signal.usage;
        const prompt = u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
        if (prompt <= 0) return null;

        if (state.lastPrompt !== undefined && prompt > state.lastPrompt) {
          state.growth.push(prompt - state.lastPrompt);
          if (state.growth.length > TELEMETRY_LIMITS.growthSamples) state.growth.shift();
        }
        state.lastPrompt = prompt;
        state.usedTokens = prompt;
        state.contextAt = now;
        // A new request means a new reply: restart the generation-speed clock.
        state.lastOutput = 0;
        state.lastOutputAt = now;
        return signal.sessionId;
      }

      case 'output-progress': {
        if (signal.parentCallId) return null;
        const out = signal.outputTokens;
        const dtMs = now - state.lastOutputAt;
        if (state.run && dtMs > 250 && out > state.lastOutput) {
          state.run.tokensPerSecond = (out - state.lastOutput) / (dtMs / 1000);
        }
        state.lastOutput = out;
        state.lastOutputAt = now;
        // Deliberately does NOT request a push: this is the highest-frequency
        // signal in the system. The idle tick picks the new rate up.
        return null;
      }

      case 'ttft':
        if (state.run && state.run.ttftMs === undefined) state.run.ttftMs = signal.ms;
        return null;

      case 'compaction': {
        state.compactions = {
          count: (state.compactions?.count ?? 0) + 1,
          lastTrigger: signal.trigger,
          lastPreTokens: signal.preTokens,
          lastPostTokens: signal.postTokens,
          at: now,
        };
        // The blocks Limboo composed are no longer in the window, and neither
        // is most of the conversation. Every estimate is stale; clear them
        // rather than keep attributing tokens that were summarized away.
        state.injected = { ...EMPTY_INJECTED };
        if (signal.postTokens !== undefined) {
          state.usedTokens = signal.postTokens;
          state.lastPrompt = signal.postTokens;
        }
        state.growth = [];
        state.contextAt = now;
        return signal.sessionId;
      }

      case 'status':
        if (state.run) state.run.providerStatus = signal.status ?? undefined;
        return signal.sessionId;

      case 'thinking-tokens':
        state.thinkingTokens = signal.estimatedTokens;
        if (state.run) state.run.thinkingTokensEstimate = signal.estimatedTokens;
        // High frequency — folded in, but never a reason to push on its own.
        return null;

      case 'api-retry':
        if (state.run) {
          state.run.retries = {
            attempt: signal.attempt,
            maxRetries: signal.maxRetries,
            lastStatus: signal.status,
            at: now,
          };
        }
        return signal.sessionId;

      case 'tool-progress': {
        state.tools.set(signal.callId, {
          callId: signal.callId,
          name: signal.name,
          elapsedSeconds: signal.elapsedSeconds,
          parentCallId: signal.parentCallId,
        });
        // Ring the map so a long run cannot grow it without bound.
        while (state.tools.size > TELEMETRY_LIMITS.maxToolRows) {
          const oldest = state.tools.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          state.tools.delete(oldest);
        }
        return null;
      }

      case 'run-end': {
        state.live = false;
        state.tools.clear();
        state.providerStatus = undefined;
        if (state.run) {
          state.run.durationMs = signal.durationMs;
          state.run.durationApiMs = signal.durationApiMs;
          if (signal.ttftMs !== undefined) state.run.ttftMs = signal.ttftMs;
          state.run.numTurns = signal.numTurns;
          state.run.costEstimateUsd = signal.costEstimateUsd;
          state.run.permissionDenials = signal.permissionDenials;
          state.run.apiErrorStatus = signal.apiErrorStatus;
          state.run.providerStatus = undefined;
          if (signal.totals) {
            state.run.tokens = {
              input: signal.totals.inputTokens,
              output: signal.totals.outputTokens,
              cacheRead: signal.totals.cacheReadTokens,
              cacheWrite: signal.totals.cacheCreationTokens,
              // From `modelUsage`, which includes subagent requests.
              includesSubagents: true,
            };
          }
        }
        return signal.sessionId;
      }

      default:
        return null;
    }
  }

  /** The run record for a finished run, for persistence. */
  runOf(sessionId: string): RuntimeRun | undefined {
    return this.sessions.get(sessionId)?.run;
  }

  /** Peak measured context for a session, for the run rollup. */
  peakContext(sessionId: string): number | undefined {
    const used = this.sessions.get(sessionId)?.usedTokens;
    return used && used > 0 ? used : undefined;
  }

  /**
   * Build the snapshot. `limits` resolves the provider-reported context window
   * for a model (persisted, so it survives a restart); `host` supplies the
   * Limboo-owned facts. Both are injected so this stays pure.
   */
  snapshot(
    sessionId: string,
    now: number,
    limits: LimitLookup,
    host: HostFacts,
  ): RuntimeSnapshot | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    const capabilities = PROVIDER_CAPABILITIES[state.provider];
    const notes = CAPABILITY_NOTE[state.provider];

    const snapshot: RuntimeSnapshot = {
      sessionId,
      provider: state.provider,
      capabilities,
      notes: Object.keys(notes).length > 0 ? notes : undefined,
      live: state.live,
      at: now,
    };

    if (capabilities.contextWindow) {
      snapshot.context = this.buildContext(state, limits, host, now);
    }

    if (capabilities.requestQuota || capabilities.quotaWindows) {
      const windows = [...this.quota.values()];
      if (windows.length > 0) snapshot.quota = windows;
    }

    if (state.run) snapshot.run = { ...state.run };

    if (capabilities.toolProgress && state.tools.size > 0) {
      snapshot.tools = [...state.tools.values()];
    }

    snapshot.environment = {
      providerSessionId: host.providerSessionId,
      worktree: host.worktree,
      attachmentCount: host.attachmentCount,
      mcp: host.mcp,
      index: host.index,
      memoryInjected: state.injected.memoryHits || undefined,
      searchInjected: state.injected.searchHits || undefined,
    };

    return snapshot;
  }

  private buildContext(
    state: SessionState,
    limits: LimitLookup,
    host: HostFacts,
    now: number,
  ): RuntimeContext {
    const model = limits(state.model);
    const context: RuntimeContext = {
      usedTokens: state.usedTokens,
      windowTokens: model?.contextWindow,
      reservedTokens: model?.maxOutputTokens,
      autoCompactTokens: model?.autoCompactTokens,
      segments: [],
      compactions: state.compactions,
      at: state.contextAt || now,
    };

    if (state.injected.memoryBudget > 0 || state.injected.searchBudget > 0) {
      context.retrieval = {
        memoryChars: state.injected.memory,
        memoryBudgetChars: state.injected.memoryBudget,
        searchChars: state.injected.search,
        searchBudgetChars: state.injected.searchBudget,
      };
    }

    // No denominator yet: the provider reports `contextWindow` on the result
    // message, so a session that has never completed a run for this model has
    // no window to divide by. Leave the ratio and the split ABSENT — the ring
    // renders indeterminate. Reporting 0% here would read as "empty context"
    // when the truth is "not measured yet", which is the opposite of empty.
    if (!context.windowTokens || context.usedTokens <= 0) return context;

    const reserved = context.reservedTokens ?? 0;
    context.remainingTokens = Math.max(0, context.windowTokens - context.usedTokens - reserved);
    context.pctUsed = Math.min(100, (context.usedTokens / context.windowTokens) * 100);

    // The estimated contributors: every one of these is a character count
    // Limboo measured of a block it composed itself, divided by a constant.
    const estimated: Array<{ id: ContextSegmentId; chars: number }> = [
      { id: 'conversation', chars: host.conversationChars },
      { id: 'tools', chars: host.toolResultChars },
      { id: 'mcp', chars: host.mcpResultChars },
      { id: 'memory', chars: state.injected.memory },
      { id: 'search', chars: state.injected.search },
      { id: 'resume', chars: state.injected.resume },
      { id: 'attachments', chars: state.injected.attachments },
    ];

    const parts = estimated
      .map((e) => ({ id: e.id, chars: e.chars, tokens: estTokens(e.chars) }))
      .filter((e) => e.tokens > 0);
    const estSum = parts.reduce((sum, e) => sum + e.tokens, 0);

    if (estSum > context.usedTokens) {
      // RULE 3. The estimates exceed what the provider measured — a compaction,
      // a cache read, or a resumed transcript Limboo never observed. Drop the
      // split rather than scale it to fit, and say so.
      context.attributionDegraded = true;
      context.segments = reserved > 0
        ? [{ id: 'reserved', tokens: reserved, origin: 'measured' }]
        : [];
    } else {
      const segments: ContextSegment[] = [
        // The residual is what keeps this honest: the measured total is the
        // authority, and everything Limboo could not attribute lands here
        // rather than being guessed at.
        { id: 'system', tokens: context.usedTokens - estSum, origin: 'measured' },
        ...parts.map(
          (e): ContextSegment => ({
            id: e.id,
            tokens: e.tokens,
            origin: 'estimated',
            chars: e.chars,
          }),
        ),
      ];
      if (reserved > 0) segments.push({ id: 'reserved', tokens: reserved, origin: 'measured' });
      context.segments = segments.slice(0, 16);
    }

    if (state.growth.length >= TELEMETRY_LIMITS.growthMinSamples) {
      const perTurn = median(state.growth);
      if (perTurn > 0) {
        context.tokensPerTurn = Math.round(perTurn);
        context.predictedTurnsRemaining = Math.floor(context.remainingTokens / perTurn);
      }
    }

    return context;
  }
}
