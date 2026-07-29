/**
 * Runtime Telemetry — a provider-neutral platform service owned by the app.
 *
 * The fifth peer of Memory, Search, Resume and the Work Graph. Both adapters
 * already stream enough to describe their own runtime; nothing above this layer
 * needs to know which one is running. `AgentManager` is the single load-bearing
 * source (the Work Graph's design principle, applied again), reaching this
 * manager through one narrow setter-injected sink.
 *
 * WHY A SINK AND NOT AN `AgentEvent`. The sources here fire per API request,
 * per delta frame and per tool heartbeat. Putting that volume on the render bus
 * would oblige `useAgentStore`, the Work Graph builder and every future
 * consumer to filter it out forever, and `AgentEvent` is a frozen contract.
 *
 * WHAT THIS MANAGER GUARANTEES
 *  - Observability never breaks a run: every ingestion path swallows, counts
 *    the failure, and surfaces it as `snapshot.health` — a stream that stopped
 *    recording must never look like a quiet session.
 *  - Bounded everywhere: coalesced pushes, ringed tool rows, bucketed samples,
 *    ring-capped rollups, swept history.
 *  - No network. The rolling-quota numbers ride the SDK stream Limboo already
 *    consumes; nothing here fetches anything.
 */
import { BrowserWindow, dialog, type WebContents } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IpcEvents } from '@shared/ipc-channels';
import { TELEMETRY_LIMITS, clamp, providerForModel } from '@shared/constants';
import type { AgentProvider } from '@shared/constants';
import { CAPABILITY_NOTE, PROVIDER_CAPABILITIES, isLongTermWindow } from '@shared/runtime';
import type {
  AppSettings,
  RuntimeExportFormat,
  RuntimeSnapshot,
  RuntimeUsageHistory,
} from '@shared/types';
import { logger, redactSecrets } from '../../logger';
import type { SessionLifecycleSignal } from '../SessionManager';
import type { SettingsManager } from '../SettingsManager';
import { TelemetryAccumulator, type HostFacts } from './accumulator';
import { exportTelemetry } from './exporters';
import { TelemetryStore, type StoredModelLimits } from './store';
import type { ProviderTelemetrySignal, RuntimeSink } from './types';

/** The slice of SessionManager this manager needs. Structural, to avoid a cycle. */
interface TelemetrySessionSource {
  onLifecycle(cb: (ev: SessionLifecycleSignal) => void): () => void;
  onActiveChanged(cb: (session: { id: string } | null) => void): () => void;
  getActive(): { id: string } | null;
}

/** The `AgentManager` surface this manager consumes. */
export interface TelemetryAgentSource {
  setTelemetrySink(sink: RuntimeSink): void;
}

/**
 * Optional collaborators supplying the Limboo-owned half of the snapshot.
 *
 * Deliberately plain closures rather than manager interfaces: this manager
 * needs one fact from each of five subsystems, and importing five manager types
 * to describe five getters would couple it to shapes it does not use and invite
 * an import cycle. The composition root does the adapting, where the concrete
 * managers already are.
 */
export interface RuntimeHostSources {
  /** Attachments staged for a session (count only — never a name or a path). */
  attachmentCount?: (sessionId: string) => number;
  /** Connected / total MCP servers. */
  mcpCounts?: () => { connected: number; total: number };
  /** Search index status for the active workspace. */
  indexStatus?: () => { indexed: boolean; files: number };
  /** A session's worktree — `path` must already be RELATIVE to the workspace. */
  worktree?: (sessionId: string) => { branch: string; path: string } | null;
  /** The provider resume token for a session (`agent_provider_sessions`). */
  providerSessionId?: (sessionId: string, provider: AgentProvider) => string | undefined;
}

interface NotifySource {
  notify(payload: { title: string; body?: string; silent?: boolean }): void;
}

export class RuntimeTelemetryManager {
  private readonly accumulator = new TelemetryAccumulator();
  private readonly store = new TelemetryStore();
  /** Provider-reported model limits, loaded once and kept warm. */
  private modelLimits = new Map<string, StoredModelLimits>();

  /** Coalescing: one pending snapshot + one timer per session. */
  private readonly pending = new Set<string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly seq = new Map<string, number>();

  /** Character tallies Limboo measured itself, per session. */
  private readonly hostChars = new Map<
    string,
    { conversation: number; tools: number; mcp: number }
  >();

  /** Sessions that have already fired a low-context notification this run. */
  private readonly notified = new Set<string>();

  private readonly failures = new Map<string, { count: number; lastError?: string }>();

  /**
   * Which renderers currently show the inspector, keyed by `webContents.id`.
   * Gates the push volume.
   *
   * A SET, NOT A COUNTER. A counter is incremented by the renderer and can only
   * be decremented by it, so a window that closes, reloads or crashes mid-hover
   * strands its increment and main pushes at full rate forever. Keyed
   * membership makes a repeated `true` idempotent and lets main retire an entry
   * itself when the webContents goes away.
   */
  private readonly watching = new Set<number>();
  /** Teardown for the per-webContents listeners registered in `setWatching`. */
  private readonly watcherCleanup = new Map<number, () => void>();
  private idleTimer: NodeJS.Timeout | null = null;
  private unsubscribe: Array<() => void> = [];

  private host: RuntimeHostSources = {};
  private notifications?: NotifySource;

  constructor(
    private readonly settings: SettingsManager,
    private readonly sessions: TelemetrySessionSource,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  /** Inject the Limboo-owned fact getters (see {@link RuntimeHostSources}). */
  setHostSources(sources: RuntimeHostSources): void {
    this.host = { ...this.host, ...sources };
  }

  setNotifications(source: NotifySource): void {
    this.notifications = source;
  }

  start(agent: TelemetryAgentSource): void {
    this.modelLimits = this.store.loadModelLimits();
    agent.setTelemetrySink((signal) => this.ingest(signal));

    this.unsubscribe.push(
      this.sessions.onLifecycle((ev) => {
        if (ev.kind === 'trashed' || ev.kind === 'purged') this.forget(ev.sessionId);
      }),
    );
    // Flush the leaving session so a switch never strands a coalesced push.
    this.unsubscribe.push(
      this.sessions.onActiveChanged(() => {
        for (const sessionId of [...this.pending]) this.flush(sessionId);
      }),
    );
    // Turning telemetry off must actually stop it: without this the pending
    // timers survive and the next scheduled flush writes rows for a subsystem
    // the user disabled (the exact bug the Work Graph documents at its own
    // settings subscription).
    this.unsubscribe.push(
      this.settings.onChange((next) => {
        if (!next.runtime.enabled) {
          this.hardStop();
          return;
        }
        this.restartIdleTick();
      }),
    );

    this.restartIdleTick();
    logger.info('Runtime Telemetry started');
  }

  dispose(): void {
    this.hardStop();
    for (const cleanup of this.watcherCleanup.values()) {
      try {
        cleanup();
      } catch {
        /* a destroyed webContents throws on removeListener */
      }
    }
    this.watcherCleanup.clear();
    this.watching.clear();
    for (const off of this.unsubscribe) {
      try {
        off();
      } catch {
        /* a failed unsubscribe must not block quit */
      }
    }
    this.unsubscribe = [];
  }

  /** Clear every timer and buffer without dropping subscriptions. */
  private hardStop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.pending.clear();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.accumulator.clear();
    this.hostChars.clear();
    this.notified.clear();
    this.broadcast({ kind: 'reset', sessionId: null });
  }

  private config(): AppSettings['runtime'] {
    return this.settings.getAll().runtime;
  }

  /* ---------------------------------------------------------------- */
  /* Ingestion                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * The sink handed to `AgentManager`. Every failure is swallowed and counted:
   * telemetry must never be able to break a run, which is exactly why a
   * subsystem that has stopped recording has to be visible in the snapshot.
   */
  private ingest(signal: ProviderTelemetrySignal): void {
    const cfg = this.config();
    if (!cfg.enabled) return;
    try {
      const now = Date.now();

      if (signal.kind === 'quota') {
        this.accumulator.apply(signal, now);
        if (cfg.persist) {
          this.store.writeQuotaSample(
            signal.provider,
            signal.windowKind,
            {
              utilization: signal.utilization,
              status: signal.status,
              resetsAt: signal.resetsAt,
              isOverage: signal.isUsingOverage,
            },
            now,
          );
        }
        // A rolling quota belongs to the plan, not to one session: fan it out.
        for (const sessionId of this.accumulator.sessionIds()) this.schedule(sessionId);
        return;
      }

      if (signal.kind === 'run-start') {
        this.notified.delete(signal.sessionId);
        this.hostChars.set(signal.sessionId, { conversation: 0, tools: 0, mcp: 0 });
      }

      if (signal.kind === 'compaction') {
        // Everything Limboo attributed is stale after a compaction.
        this.hostChars.set(signal.sessionId, { conversation: 0, tools: 0, mcp: 0 });
        if (signal.trigger === 'auto') {
          const run = this.accumulator.runOf(signal.sessionId);
          if (run) {
            this.store.observeAutoCompact(run.model, signal.preTokens);
            const existing = this.modelLimits.get(run.model);
            if (existing) {
              existing.autoCompactTokens = Math.min(
                existing.autoCompactTokens ?? signal.preTokens,
                signal.preTokens,
              );
            }
          }
        }
      }

      if (signal.kind === 'run-end') {
        this.onRunEnd(signal, now);
      }

      const changed = this.accumulator.apply(signal, now);
      if (changed) this.schedule(changed);
    } catch (err) {
      this.recordFailure(
        'sessionId' in signal ? signal.sessionId : 'global',
        err,
      );
    }
  }

  /** Persist the provider-reported limits and the run rollup. */
  private onRunEnd(
    signal: Extract<ProviderTelemetrySignal, { kind: 'run-end' }>,
    now: number,
  ): void {
    const cfg = this.config();
    if (signal.modelLimits) {
      for (const [model, limits] of Object.entries(signal.modelLimits)) {
        const prev = this.modelLimits.get(model);
        this.modelLimits.set(model, { ...limits, autoCompactTokens: prev?.autoCompactTokens });
        if (cfg.persist) this.store.observeModelLimits(model, limits, now);
      }
    }
    if (!cfg.persist) return;

    const run = this.accumulator.runOf(signal.sessionId);
    if (!run) return;
    const totals = signal.totals;
    this.store.writeRunRollup({
      runId: run.runId,
      sessionId: signal.sessionId,
      provider: run.provider,
      model: run.model,
      mode: run.mode,
      startedAt: run.startedAt,
      durationMs: signal.durationMs,
      durationApiMs: signal.durationApiMs,
      ttftMs: signal.ttftMs ?? run.ttftMs,
      numTurns: signal.numTurns,
      inputTokens: totals?.inputTokens ?? 0,
      outputTokens: totals?.outputTokens ?? 0,
      cacheReadTokens: totals?.cacheReadTokens ?? 0,
      cacheWriteTokens: totals?.cacheCreationTokens ?? 0,
      costEstimateUsd: signal.costEstimateUsd,
      peakContextTokens: this.accumulator.peakContext(signal.sessionId),
    });
    this.store.capRollups(
      signal.sessionId,
      clamp(cfg.retainRuns, TELEMETRY_LIMITS.retainRuns.min, TELEMETRY_LIMITS.retainRuns.max),
    );
  }

  /**
   * Character tallies Limboo measured itself, folded in as they are observed.
   * These are the ONLY basis for the per-contributor context split — the API
   * reports one aggregate input-token count and no breakdown at all.
   */
  addObservedChars(
    sessionId: string,
    kind: 'conversation' | 'tools' | 'mcp',
    chars: number,
  ): void {
    if (!this.config().enabled || chars <= 0) return;
    const tally = this.hostChars.get(sessionId) ?? { conversation: 0, tools: 0, mcp: 0 };
    tally[kind] += chars;
    this.hostChars.set(sessionId, tally);
  }

  /**
   * Record an ingestion failure.
   *
   * `lastError` is the one free string in this whole subsystem, and it CROSSES
   * IPC onto `snapshot.health` — so it goes through the logger's own secret
   * patterns (one implementation, not a second weaker copy) and then has
   * absolute paths collapsed to their leaf name. These messages come from a
   * separately versioned CLI; what they contain is not ours to assume.
   */
  private recordFailure(key: string, err: unknown): void {
    const entry = this.failures.get(key) ?? { count: 0 };
    entry.count += 1;
    entry.lastError = scrubPaths(redactSecrets(String(err instanceof Error ? err.message : err)))
      .slice(0, TELEMETRY_LIMITS.errorMax);
    this.failures.set(key, entry);
    logger.warn('telemetry: ingestion failed', err);
  }

  private forget(sessionId: string): void {
    this.accumulator.forget(sessionId);
    this.hostChars.delete(sessionId);
    this.notified.delete(sessionId);
    this.failures.delete(sessionId);
    this.seq.delete(sessionId);
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    this.pending.delete(sessionId);
  }

  /* ---------------------------------------------------------------- */
  /* Coalesced broadcast                                               */
  /* ---------------------------------------------------------------- */

  private schedule(sessionId: string): void {
    const cfg = this.config();
    // Nothing is watching: keep ingesting so history stays complete, but only
    // push at run boundaries. This is what makes "animate while streaming"
    // cost nothing when the inspector is closed.
    if (this.watching.size === 0 && this.accumulator.isLive(sessionId)) return;

    this.pending.add(sessionId);
    if (this.timers.has(sessionId)) return;
    const delay = clamp(
      cfg.updateFrequency,
      TELEMETRY_LIMITS.updateFrequency.min,
      TELEMETRY_LIMITS.updateFrequency.max,
    );
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      this.flush(sessionId);
    }, delay);
    timer.unref?.();
    this.timers.set(sessionId, timer);
  }

  private flush(sessionId: string): void {
    this.pending.delete(sessionId);
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    const snapshot = this.buildSnapshot(sessionId);
    if (!snapshot) return;
    const seq = (this.seq.get(sessionId) ?? 0) + 1;
    this.seq.set(sessionId, seq);
    this.maybeNotifyLowContext(sessionId, snapshot);
    this.broadcast({ kind: 'snapshot', sessionId, seq, snapshot });
  }

  private restartIdleTick(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    const cfg = this.config();
    if (!cfg.enabled || cfg.idleRefreshMs <= 0) return;
    const every = clamp(
      cfg.idleRefreshMs,
      Math.max(TELEMETRY_LIMITS.idleRefreshMs.min, 1_000),
      TELEMETRY_LIMITS.idleRefreshMs.max,
    );
    // Refreshes reset countdowns and elapsed tool timers. It polls NO provider —
    // the numbers themselves only ever change when the stream delivers them.
    this.idleTimer = setInterval(() => {
      if (this.watching.size === 0) return;
      const active = this.sessions.getActive();
      if (active) this.flush(active.id);
    }, every);
    this.idleTimer.unref?.();
  }

  private maybeNotifyLowContext(sessionId: string, snapshot: RuntimeSnapshot): void {
    const cfg = this.config();
    if (cfg.notifyRemainingPct <= 0 || this.notified.has(sessionId)) return;
    const ctx = snapshot.context;
    if (!ctx?.windowTokens || ctx.remainingTokens === undefined) return;
    const remainingPct = (ctx.remainingTokens / ctx.windowTokens) * 100;
    if (remainingPct > cfg.notifyRemainingPct) return;
    this.notified.add(sessionId);
    if (!this.settings.getAll().behavior.notifications) return;
    // The body carries a percentage and nothing else — no prompt, no title.
    this.notifications?.notify({
      title: 'Context running low',
      body: `About ${Math.round(remainingPct)}% of the context window is left in this session.`,
    });
  }

  private broadcast(payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcEvents.runtimeChanged, payload);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Snapshot assembly                                                 */
  /* ---------------------------------------------------------------- */

  private hostFacts(sessionId: string, provider: AgentProvider): HostFacts {
    const chars = this.hostChars.get(sessionId) ?? { conversation: 0, tools: 0, mcp: 0 };
    const facts: HostFacts = {
      conversationChars: chars.conversation,
      toolResultChars: chars.tools,
      mcpResultChars: chars.mcp,
    };
    // Each getter is optional and INDEPENDENTLY guarded: one subsystem
    // throwing must not cost the whole snapshot. This is the same reason every
    // ingestion path swallows — observability that can break the thing it
    // observes is worse than no observability.
    try {
      facts.attachmentCount = this.host.attachmentCount?.(sessionId);
    } catch {
      /* best effort */
    }
    try {
      facts.mcp = this.host.mcpCounts?.();
    } catch {
      /* best effort */
    }
    try {
      facts.index = this.host.indexStatus?.();
    } catch {
      /* best effort */
    }
    try {
      facts.worktree = this.host.worktree?.(sessionId) ?? undefined;
    } catch {
      /* best effort */
    }
    try {
      facts.providerSessionId = this.host.providerSessionId?.(sessionId, provider);
    } catch {
      /* best effort */
    }
    return facts;
  }

  /**
   * The snapshot for a session the accumulator has never seen — no run has
   * started, so there is nothing measured yet.
   *
   * It exists so the ring is VISIBLE the moment telemetry is on rather than
   * appearing halfway through a session: an indeterminate ring plus a card that
   * says what has not been measured is a real answer, and an absent control is
   * not. Nothing here is invented — there is no `context` and no `run`, only the
   * capability table and the Limboo-owned environment facts.
   *
   * The provider is read from the SELECTED model, which is the one place in
   * this subsystem that does so. The Work Graph's "provider is captured per
   * run, never from current settings" rule is about attributing a run; there is
   * no run here, and the instant one starts its own provider takes over.
   */
  private idleSnapshot(sessionId: string): RuntimeSnapshot {
    const provider = providerForModel(this.settings.getAll().agent.model);
    const notes = CAPABILITY_NOTE[provider];
    const facts = this.hostFacts(sessionId, provider);
    return {
      sessionId,
      provider,
      capabilities: PROVIDER_CAPABILITIES[provider],
      notes: Object.keys(notes).length > 0 ? notes : undefined,
      live: false,
      at: Date.now(),
      // Environment only. No `context` and no `run`: those describe a request
      // that has not happened, and an absent field is the honest form of that.
      environment: {
        providerSessionId: facts.providerSessionId,
        worktree: facts.worktree,
        attachmentCount: facts.attachmentCount,
        mcp: facts.mcp,
        index: facts.index,
      },
    };
  }

  private buildSnapshot(sessionId: string): RuntimeSnapshot | null {
    try {
      const probe = this.accumulator.runOf(sessionId);
      const provider: AgentProvider = probe?.provider ?? 'anthropic';
      const snapshot =
        this.accumulator.snapshot(
          sessionId,
          Date.now(),
          (model) => this.modelLimits.get(model),
          this.hostFacts(sessionId, provider),
        ) ?? this.idleSnapshot(sessionId);
      const failure = this.failures.get(sessionId);
      if (failure && failure.count > 0) {
        snapshot.health = { failures: failure.count, lastError: failure.lastError };
      }
      return snapshot;
    } catch (err) {
      this.recordFailure(sessionId, err);
      return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Reads (the IPC surface)                                           */
  /* ---------------------------------------------------------------- */

  getSnapshot(sessionId: string): RuntimeSnapshot | null {
    if (!this.config().enabled) return null;
    return this.buildSnapshot(sessionId);
  }

  /**
   * Trend points for the long-term windows.
   *
   * `persist: false` is the enterprise policy switch and it is genuinely off:
   * it stops writes AND makes this return empty with `disabled: true`, so the
   * UI says "history is disabled by policy" rather than showing a blank chart
   * that looks like an absence of usage.
   */
  getHistory(sessionId: string): RuntimeUsageHistory[] {
    const cfg = this.config();
    const run = this.accumulator.runOf(sessionId);
    const provider: AgentProvider = run?.provider ?? 'anthropic';
    if (!cfg.enabled || !cfg.persist) {
      return [{ windowKind: 'seven_day', points: [], disabled: true }];
    }
    const windows = this.store.knownWindows(provider).filter(isLongTermWindow);
    return windows.map((windowKind) => ({
      windowKind,
      points: this.store.readHistory(provider, windowKind),
      disabled: false,
    }));
  }

  /**
   * Declare whether one renderer shows the inspector, gating how often live
   * runs push.
   *
   * Main takes responsibility for retiring the entry: `destroyed` covers a
   * closed or crashed window and `did-start-navigation` covers a reload, so a
   * renderer that never gets to send `false` cannot pin the app at full push
   * rate. Idempotent in both directions.
   */
  setWatching(sender: WebContents, watching: boolean): void {
    const id = sender.id;
    if (watching) {
      if (!this.watching.has(id)) {
        this.watching.add(id);
        const retire = (): void => this.setWatching(sender, false);
        sender.once('destroyed', retire);
        sender.on('did-start-navigation', retire);
        this.watcherCleanup.set(id, () => {
          sender.removeListener('destroyed', retire);
          sender.removeListener('did-start-navigation', retire);
        });
      }
      const active = this.sessions.getActive();
      if (active) this.flush(active.id);
      return;
    }
    this.watching.delete(id);
    const cleanup = this.watcherCleanup.get(id);
    this.watcherCleanup.delete(id);
    try {
      cleanup?.();
    } catch {
      /* a destroyed webContents throws on removeListener — nothing to undo */
    }
  }

  export(sessionId: string, format: RuntimeExportFormat): string {
    const cfg = this.config();
    const rollups = cfg.persist
      ? this.store.readRollups(sessionId, TELEMETRY_LIMITS.retainRuns.max)
      : [];
    const text = exportTelemetry(format, {
      sessionId,
      snapshot: this.buildSnapshot(sessionId),
      rollups,
      history: this.getHistory(sessionId)
        .filter((h) => !h.disabled)
        .map((h) => ({ windowKind: h.windowKind, points: h.points })),
      generatedAt: Date.now(),
    });
    if (text.length > TELEMETRY_LIMITS.exportBytesMax) {
      throw new Error('runtime: export exceeds the size limit');
    }
    return text;
  }

  /**
   * Write an export to a user-chosen file. The renderer supplies a session id
   * and a format and NEVER a path: main opens the dialog, main receives the
   * path from the OS, main writes. Same contract as `graph:save` — there is no
   * traversal surface here because there is no caller-supplied path at all.
   */
  async save(
    sessionId: string,
    format: RuntimeExportFormat,
  ): Promise<{ saved: boolean; path?: string }> {
    const text = this.export(sessionId, format);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const result = await dialog.showSaveDialog({
      title: 'Export runtime telemetry',
      defaultPath: `runtime-telemetry-${stamp}.${format}`,
      filters: [
        { name: format === 'csv' ? 'CSV' : 'JSON', extensions: [format] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, text, 'utf8');
    logger.info(`Runtime telemetry exported to ${path.basename(result.filePath)}`);
    return { saved: true, path: result.filePath };
  }

  clearHistory(): void {
    this.store.clearHistory();
  }

  /** Age-sweep, driven by the app's hourly maintenance tick. */
  sweep(): void {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.persist) return;
    this.store.sweep(
      clamp(cfg.retentionDays, TELEMETRY_LIMITS.retentionDays.min, TELEMETRY_LIMITS.retentionDays.max),
      Date.now(),
    );
  }

  /** Run rollups for a session, for the Work Graph's statistics view. */
  rollupsFor(sessionId: string) {
    if (!this.config().persist) return [];
    return this.store.readRollups(sessionId, TELEMETRY_LIMITS.retainRuns.max);
  }
}

/**
 * Collapse absolute filesystem paths to their leaf name.
 *
 * The schema behind this subsystem has no column that can hold a path, and the
 * snapshot has no field for one either — except `health.lastError`, which is a
 * provider error message verbatim. A stack frame or an ENOENT there would carry
 * a full `$HOME` path into the renderer, so the one place a raw string gets in
 * is also the one place this runs. Bounded quantifiers only.
 */
function scrubPaths(text: string): string {
  return text
    .replace(/(?:[A-Za-z]:)?[\\/](?:[\w .~@+-]{1,64}[\\/]){1,24}([\w .@+-]{1,64})/g, '…/$1')
    .replace(/\\{2}[\w.-]{1,64}\\(?:[\w .~@+-]{1,64}\\){0,24}([\w .@+-]{1,64})/g, '…/$1');
}
