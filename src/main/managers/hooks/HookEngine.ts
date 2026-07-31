/**
 * Provider-Neutral Hook Engine.
 *
 * The single governance/observability layer between every coding provider
 * (Claude SDK, Cursor CLI, a future ACP adapter) and every Limboo subsystem.
 * Providers emit NORMALIZED lifecycle events ({@link HookEvent}) onto this one
 * bus; the engine persists them to a redacted audit trail and fans them out to
 * any in-process subscribers.
 *
 * The trail has NO renderer surface: it is read by the Work Graph and the
 * session diagnostics, never pushed to a panel. That is why nothing here
 * touches `BrowserWindow` — if you find yourself adding an IPC broadcast, the
 * consumer you want is almost certainly a subscriber instead.
 *
 * SECURITY MODEL (CLAUDE.md §6/§8):
 * - The engine holds NO policy. Tool-permission decisions stay in
 *   AgentManager's provider-neutral core (`decideToolUse`); the engine only
 *   RECORDS the outcome. It can never allow a call the core denied.
 * - Every string on a {@link HookEvent} is already redacted by the producer;
 *   the engine additionally clamps lengths (defense in depth) before it touches
 *   the DB or the renderer.
 * - Emission is gated by `settings.agent.hookEngine.enabled`. That gate ONLY
 *   suppresses observability — it never affects enforcement.
 *
 * This is deliberately additive: subsystems keep their existing direct wiring
 * (auto-checkpoint, terminal mirror, search reindex, …). Subscribers here are
 * an extension point, not the load-bearing path.
 */
import crypto from 'node:crypto';
import { HOOK_LIMITS, providerForModel } from '@shared/constants';
import type { DiagnosticSeverity, HookEvent, HookPhase } from '@shared/types';
import { getDb } from '../../db/database';
import { logger } from '../../logger';
// The redactor is shared with the Work Graph so both observability sinks apply
// identical rules — two copies would drift, and a drifted redactor is a leak.
import { redactSecrets as redact } from '../graph/redact';
import type { SettingsManager } from '../SettingsManager';

/** Fields a producer supplies; the engine stamps id/provider/at + redacts. */
export interface HookEmit {
  tool?: string;
  summary?: string;
  detail?: string;
  severity?: DiagnosticSeverity;
  decision?: HookEvent['decision'];
  auto?: boolean;
}

/**
 * Phases surfaced at the `lifecycle` audit level. `verbose` additionally keeps
 * the noisy per-tool observe phases (post-tool-use / shell-exec / …). Governance
 * and gate phases are always kept when auditing is on at all.
 */
const LIFECYCLE_PHASES: ReadonlySet<HookPhase> = new Set<HookPhase>([
  'session-start',
  'session-end',
  'prompt-submit',
  'run-finished',
  'pre-tool-use',
  'permission-request',
  'checkpoint',
  'subagent-start',
  'subagent-stop',
]);

export class HookEngine {
  private readonly observers = new Set<(event: HookEvent) => void>();

  constructor(private readonly settings: SettingsManager) {}

  /**
   * Subscribe to the normalized lifecycle bus. Returns an unsubscribe function.
   * Observers always receive events (independent of audit verbosity) so future
   * subsystems can react to lifecycle regardless of panel noise — but only when
   * the engine is enabled at all.
   */
  subscribe(fn: (event: HookEvent) => void): () => void {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  /**
   * Build + emit one normalized lifecycle event. The engine stamps the id, the
   * current provider (resolved from the selected model), and the timestamp, and
   * redacts every string — so producers (AgentManager, GitManager, …) never
   * need to know the provider or repeat redaction. Never throws.
   */
  emit(sessionId: string, phase: HookPhase, opts: HookEmit = {}): void {
    let provider: 'anthropic' | 'cursor';
    try {
      provider = providerForModel(this.settings.getAll().agent.model);
    } catch {
      return;
    }
    this.record({
      id: crypto.randomUUID(),
      phase,
      sessionId,
      provider,
      at: Date.now(),
      tool: opts.tool,
      summary: opts.summary ? redact(opts.summary) : undefined,
      detail: opts.detail ? redact(opts.detail) : undefined,
      severity: opts.severity,
      decision: opts.decision,
      auto: opts.auto,
    });
  }

  /**
   * Record one already-constructed lifecycle event: fan-out to subscribers and
   * persist to the redacted `hook_audit` ring — subject to the emission gate
   * and the audit-verbosity preference. Never throws.
   */
  record(event: HookEvent): void {
    let cfg;
    try {
      cfg = this.settings.getAll().agent.hookEngine;
    } catch {
      return;
    }
    if (!cfg.enabled) return;

    const clamped = this.clamp(event);

    // Observers first — they are the (future) subsystem reaction path and must
    // never be starved by the audit-verbosity filter. Fail-closed per observer.
    for (const observer of this.observers) {
      try {
        observer(clamped);
      } catch (err) {
        logger.warn('hook observer failed', err);
      }
    }

    // Audit persistence honors the verbosity preference.
    if (cfg.audit === 'off') return;
    if (cfg.audit === 'lifecycle' && !LIFECYCLE_PHASES.has(clamped.phase)) return;

    this.persist(clamped);
  }

  /** The redacted audit trail for a session, oldest first. */
  getAudit(sessionId: string): HookEvent[] {
    try {
      const rows = getDb()
        .prepare('SELECT payload FROM hook_audit WHERE session_id = ? ORDER BY created_at ASC')
        .all(sessionId) as Array<{ payload: string }>;
      const out: HookEvent[] = [];
      for (const r of rows) {
        try {
          out.push(JSON.parse(r.payload) as HookEvent);
        } catch {
          /* skip corrupt row */
        }
      }
      return out;
    } catch (err) {
      logger.warn('hook audit read failed', err);
      return [];
    }
  }

  /** Clear the audit trail for one session, or all sessions when omitted. */
  clearAudit(sessionId?: string): void {
    try {
      if (sessionId) {
        getDb().prepare('DELETE FROM hook_audit WHERE session_id = ?').run(sessionId);
      } else {
        getDb().prepare('DELETE FROM hook_audit').run();
      }
    } catch (err) {
      logger.warn('hook audit clear failed', err);
    }
  }

  /* ---------------------------------------------------------------- */

  private clamp(event: HookEvent): HookEvent {
    return {
      ...event,
      summary: event.summary?.slice(0, HOOK_LIMITS.summaryMax),
      detail: event.detail?.slice(0, HOOK_LIMITS.detailMax),
    };
  }

  private persist(event: HookEvent): void {
    try {
      const db = getDb();
      db.prepare(
        'INSERT INTO hook_audit (id, session_id, phase, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(event.id, event.sessionId, event.phase, JSON.stringify(event), event.at);
      // Ring-cap: prune the oldest rows for this session beyond the retained window.
      db.prepare(
        `DELETE FROM hook_audit
           WHERE session_id = ?
             AND id NOT IN (
               SELECT id FROM hook_audit
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
             )`,
      ).run(event.sessionId, event.sessionId, HOOK_LIMITS.auditRingPerSession);
    } catch (err) {
      logger.warn('hook audit persist failed', err);
    }
  }
}
