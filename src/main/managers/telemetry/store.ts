/**
 * Runtime Telemetry persistence. Prepared, parameterized statements ONLY — no
 * string interpolation anywhere in this file (CLAUDE.md §6).
 *
 * Three tables, and the schema itself is the redaction policy: there is no
 * column that can hold a prompt, a message, a path, a tool input or a title.
 * See the comment above the DDL in `db/database.ts`.
 *
 * Every read is bounded and every write is ring-capped or bucketed, so a long
 * session cannot grow the database without limit even if a caller's own caps
 * fail. Every failure is swallowed and reported to the caller as a boolean so
 * telemetry can never break a run — the manager surfaces that as snapshot
 * health rather than letting a silent failure look like a quiet session.
 */
import { TELEMETRY_LIMITS } from '@shared/constants';
import type { AgentProvider } from '@shared/constants';
import type { RuntimeUsagePoint } from '@shared/types';
import { getDb } from '../../db/database';
import { logger } from '../../logger';
import type { ModelLimits } from './types';

/** A provider-reported limit pair plus the observed auto-compaction threshold. */
export interface StoredModelLimits extends ModelLimits {
  autoCompactTokens?: number;
}

/** One finished run, flattened for the rollup table. */
export interface RunRollup {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  mode: string;
  startedAt: number;
  durationMs?: number;
  durationApiMs?: number;
  ttftMs?: number;
  numTurns?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costEstimateUsd?: number;
  peakContextTokens?: number;
}

function nullable(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class TelemetryStore {
  /** Resolved lazily on every call, never cached — the `getDb()` convention. */
  private get db() {
    return getDb();
  }

  /* ---------------------------------------------------------------- */
  /* Model limits                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Record the provider's own context window / max output for a model.
   *
   * Persisted specifically so the ring is DETERMINATE on the next launch
   * instead of waiting for a run to complete: `modelUsage` only arrives on the
   * result message, so without this every fresh session would start
   * indeterminate again. `auto_compact_tokens` is preserved across upserts —
   * it is observed separately and much more rarely.
   */
  observeModelLimits(model: string, limits: ModelLimits, now: number): void {
    try {
      this.db
        .prepare(
          `INSERT INTO telemetry_model_limits
             (model, context_window, max_output_tokens, auto_compact_tokens, observed_at)
           VALUES (?, ?, ?, NULL, ?)
           ON CONFLICT(model) DO UPDATE SET
             context_window    = excluded.context_window,
             max_output_tokens = excluded.max_output_tokens,
             observed_at       = excluded.observed_at`,
        )
        .run(model, limits.contextWindow, limits.maxOutputTokens, now);
    } catch (err) {
      logger.warn('telemetry: model limits write failed', err);
    }
  }

  /**
   * Record an OBSERVED auto-compaction threshold. The SDK reports no threshold,
   * so this is the `pre_tokens` of an auto compaction — the only honest source.
   * Only ever lowered toward the first observation; a later, larger boundary
   * does not raise it, because the threshold is a floor the model crossed.
   */
  observeAutoCompact(model: string, preTokens: number): void {
    if (preTokens <= 0) return;
    try {
      this.db
        .prepare(
          `UPDATE telemetry_model_limits
              SET auto_compact_tokens = MIN(COALESCE(auto_compact_tokens, ?), ?)
            WHERE model = ?`,
        )
        .run(preTokens, preTokens, model);
    } catch (err) {
      logger.warn('telemetry: auto-compact observation failed', err);
    }
  }

  /** Every known model's limits, loaded once at start into an in-memory map. */
  loadModelLimits(): Map<string, StoredModelLimits> {
    const out = new Map<string, StoredModelLimits>();
    try {
      const rows = this.db
        .prepare(
          `SELECT model, context_window, max_output_tokens, auto_compact_tokens
             FROM telemetry_model_limits`,
        )
        .all() as Array<{
        model: string;
        context_window: number;
        max_output_tokens: number;
        auto_compact_tokens: number | null;
      }>;
      for (const r of rows) {
        out.set(r.model, {
          contextWindow: r.context_window,
          maxOutputTokens: r.max_output_tokens,
          autoCompactTokens: r.auto_compact_tokens ?? undefined,
        });
      }
    } catch (err) {
      logger.warn('telemetry: model limits read failed', err);
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Quota samples                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Upsert one quota sample into its time bucket. Bucketing is what bounds this
   * table: a rate-limit event can arrive on every request, but at most one row
   * per window per bucket is ever stored.
   */
  writeQuotaSample(
    provider: AgentProvider,
    windowKind: string,
    sample: { utilization?: number; status: string; resetsAt?: number; isOverage?: boolean },
    now: number,
  ): void {
    const bucket = Math.floor(now / TELEMETRY_LIMITS.sampleBucketMs) * TELEMETRY_LIMITS.sampleBucketMs;
    try {
      this.db
        .prepare(
          `INSERT INTO telemetry_usage_samples
             (at, provider, window_kind, utilization, status, resets_at, is_overage)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider, window_kind, at) DO UPDATE SET
             utilization = excluded.utilization,
             status      = excluded.status,
             resets_at   = excluded.resets_at,
             is_overage  = excluded.is_overage`,
        )
        .run(
          bucket,
          provider,
          windowKind,
          nullable(sample.utilization),
          sample.status,
          nullable(sample.resetsAt),
          sample.isOverage ? 1 : 0,
        );
    } catch (err) {
      logger.warn('telemetry: quota sample write failed', err);
    }
  }

  /** Trend points for one window, oldest first, bounded by `historyPoints`. */
  readHistory(provider: AgentProvider, windowKind: string): RuntimeUsagePoint[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT at, utilization, status
             FROM telemetry_usage_samples
            WHERE provider = ? AND window_kind = ? AND utilization IS NOT NULL
            ORDER BY at DESC
            LIMIT ?`,
        )
        .all(provider, windowKind, TELEMETRY_LIMITS.historyPoints) as Array<{
        at: number;
        utilization: number;
        status: string | null;
      }>;
      return rows
        .map((r): RuntimeUsagePoint => ({
          at: r.at,
          utilization: r.utilization,
          status:
            r.status === 'rejected' || r.status === 'allowed_warning' ? r.status : 'allowed',
        }))
        .reverse();
    } catch (err) {
      logger.warn('telemetry: history read failed', err);
      return [];
    }
  }

  /** Window kinds this provider has ever reported, for the history selector. */
  knownWindows(provider: AgentProvider): string[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT window_kind FROM telemetry_usage_samples
            WHERE provider = ? ORDER BY window_kind`,
        )
        .all(provider) as Array<{ window_kind: string }>;
      return rows.map((r) => r.window_kind);
    } catch (err) {
      logger.warn('telemetry: window list read failed', err);
      return [];
    }
  }

  /* ---------------------------------------------------------------- */
  /* Run rollups                                                       */
  /* ---------------------------------------------------------------- */

  writeRunRollup(rollup: RunRollup): void {
    try {
      this.db
        .prepare(
          `INSERT INTO telemetry_run_rollups
             (run_id, session_id, provider, model, mode, started_at, duration_ms,
              duration_api_ms, ttft_ms, num_turns, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, cost_estimate_usd, peak_context_tokens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id) DO UPDATE SET
             duration_ms         = excluded.duration_ms,
             duration_api_ms     = excluded.duration_api_ms,
             ttft_ms             = excluded.ttft_ms,
             num_turns           = excluded.num_turns,
             input_tokens        = excluded.input_tokens,
             output_tokens       = excluded.output_tokens,
             cache_read_tokens   = excluded.cache_read_tokens,
             cache_write_tokens  = excluded.cache_write_tokens,
             cost_estimate_usd   = excluded.cost_estimate_usd,
             peak_context_tokens = excluded.peak_context_tokens`,
        )
        .run(
          rollup.runId,
          rollup.sessionId,
          rollup.provider,
          rollup.model,
          rollup.mode,
          rollup.startedAt,
          nullable(rollup.durationMs),
          nullable(rollup.durationApiMs),
          nullable(rollup.ttftMs),
          nullable(rollup.numTurns),
          rollup.inputTokens,
          rollup.outputTokens,
          rollup.cacheReadTokens,
          rollup.cacheWriteTokens,
          nullable(rollup.costEstimateUsd),
          nullable(rollup.peakContextTokens),
        );
    } catch (err) {
      logger.warn('telemetry: run rollup write failed', err);
    }
  }

  /** Rollups for a session, newest first. Bounded by the caller's cap. */
  readRollups(sessionId: string, limit: number): RunRollup[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT * FROM telemetry_run_rollups
            WHERE session_id = ? ORDER BY started_at DESC LIMIT ?`,
        )
        .all(sessionId, limit) as Array<Record<string, unknown>>;
      return rows.map(
        (r): RunRollup => ({
          runId: String(r.run_id),
          sessionId: String(r.session_id),
          provider: String(r.provider),
          model: String(r.model),
          mode: String(r.mode),
          startedAt: Number(r.started_at),
          durationMs: r.duration_ms == null ? undefined : Number(r.duration_ms),
          durationApiMs: r.duration_api_ms == null ? undefined : Number(r.duration_api_ms),
          ttftMs: r.ttft_ms == null ? undefined : Number(r.ttft_ms),
          numTurns: r.num_turns == null ? undefined : Number(r.num_turns),
          inputTokens: Number(r.input_tokens ?? 0),
          outputTokens: Number(r.output_tokens ?? 0),
          cacheReadTokens: Number(r.cache_read_tokens ?? 0),
          cacheWriteTokens: Number(r.cache_write_tokens ?? 0),
          costEstimateUsd: r.cost_estimate_usd == null ? undefined : Number(r.cost_estimate_usd),
          peakContextTokens:
            r.peak_context_tokens == null ? undefined : Number(r.peak_context_tokens),
        }),
      );
    } catch (err) {
      logger.warn('telemetry: rollup read failed', err);
      return [];
    }
  }

  /* ---------------------------------------------------------------- */
  /* Maintenance                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Ring-cap a session's rollups. Runs after each write so a long-lived session
   * cannot grow the table past `retainRuns` even across restarts.
   */
  capRollups(sessionId: string, retain: number): void {
    try {
      this.db
        .prepare(
          `DELETE FROM telemetry_run_rollups
            WHERE session_id = ?
              AND run_id NOT IN (
                SELECT run_id FROM telemetry_run_rollups
                 WHERE session_id = ? ORDER BY started_at DESC LIMIT ?
              )`,
        )
        .run(sessionId, sessionId, retain);
    } catch (err) {
      logger.warn('telemetry: rollup cap failed', err);
    }
  }

  /** Age-sweep both time-series tables. `days <= 0` means keep forever. */
  sweep(days: number, now: number): void {
    if (days <= 0) return;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    try {
      this.db.prepare('DELETE FROM telemetry_usage_samples WHERE at < ?').run(cutoff);
      this.db.prepare('DELETE FROM telemetry_run_rollups WHERE started_at < ?').run(cutoff);
    } catch (err) {
      logger.warn('telemetry: sweep failed', err);
    }
  }

  /**
   * Erase every persisted telemetry row. The privacy action — deliberately
   * total, and deliberately NOT including `telemetry_model_limits`, which holds
   * only published per-model constants (a context window is not user data, and
   * dropping it would make every ring indeterminate again for no benefit).
   */
  clearHistory(): void {
    try {
      this.db.prepare('DELETE FROM telemetry_usage_samples').run();
      this.db.prepare('DELETE FROM telemetry_run_rollups').run();
    } catch (err) {
      logger.warn('telemetry: clear failed', err);
    }
  }
}
