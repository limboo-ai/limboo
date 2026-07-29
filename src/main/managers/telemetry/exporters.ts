/**
 * Runtime Telemetry exporters — JSON and CSV, rendered in the main process.
 *
 * Pure transforms with no filesystem access (see `save()` on the manager).
 *
 * EVERY OUTPUT OBJECT IS BUILT FIELD BY FIELD FROM A WHITELIST. It would be
 * shorter to `JSON.stringify` the snapshot, and that is exactly what this file
 * refuses to do: the schema behind these numbers has no column for conversation
 * data today, but a future field added to `RuntimeSnapshot` would silently ride
 * along into every export the moment someone reached for a spread. Enumerating
 * the fields means a new one has to be added here deliberately.
 */
import type { RuntimeSnapshot, RuntimeUsagePoint } from '@shared/types';
import type { RunRollup } from './store';

/** The disclaimer that travels with every export. */
const EXPORT_NOTE =
  'Client-side measurements from the running provider. Cost figures are estimates from the provider SDK’s bundled price table and are NOT billing data.';

export interface TelemetryExportInput {
  sessionId: string;
  snapshot: RuntimeSnapshot | null;
  rollups: RunRollup[];
  history: Array<{ windowKind: string; points: RuntimeUsagePoint[] }>;
  generatedAt: number;
}

/** Serialize as JSON — the lossless machine-readable form. */
export function exportJson(input: TelemetryExportInput): string {
  const s = input.snapshot;
  return JSON.stringify(
    {
      _note: EXPORT_NOTE,
      generatedAt: new Date(input.generatedAt).toISOString(),
      sessionId: input.sessionId,
      provider: s?.provider,
      capabilities: s?.capabilities,
      live: s?.live ?? false,
      context: s?.context
        ? {
            usedTokens: s.context.usedTokens,
            windowTokens: s.context.windowTokens,
            reservedTokens: s.context.reservedTokens,
            remainingTokens: s.context.remainingTokens,
            pctUsed: s.context.pctUsed,
            autoCompactTokens: s.context.autoCompactTokens,
            tokensPerTurn: s.context.tokensPerTurn,
            predictedTurnsRemaining: s.context.predictedTurnsRemaining,
            attributionDegraded: s.context.attributionDegraded ?? false,
            segments: s.context.segments.map((seg) => ({
              id: seg.id,
              tokens: seg.tokens,
              origin: seg.origin,
              chars: seg.chars,
            })),
            compactions: s.context.compactions,
          }
        : undefined,
      quota: s?.quota?.map((q) => ({
        kind: q.kind,
        status: q.status,
        utilization: q.utilization,
        resetsAt: q.resetsAt,
        isUsingOverage: q.isUsingOverage,
      })),
      run: s?.run
        ? {
            runId: s.run.runId,
            model: s.run.model,
            provider: s.run.provider,
            mode: s.run.mode,
            startedAt: s.run.startedAt,
            durationMs: s.run.durationMs,
            durationApiMs: s.run.durationApiMs,
            ttftMs: s.run.ttftMs,
            numTurns: s.run.numTurns,
            tokens: s.run.tokens,
            costEstimateUsd: s.run.costEstimateUsd,
            tokensPerSecond: s.run.tokensPerSecond,
            permissionDenials: s.run.permissionDenials,
          }
        : undefined,
      runs: input.rollups.map(rollupFields),
      history: input.history.map((h) => ({
        windowKind: h.windowKind,
        points: h.points.map((p) => ({ at: p.at, utilization: p.utilization, status: p.status })),
      })),
    },
    null,
    2,
  );
}

/** Field-by-field rollup projection, shared by both formats. */
function rollupFields(r: RunRollup) {
  return {
    runId: r.runId,
    provider: r.provider,
    model: r.model,
    mode: r.mode,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
    durationApiMs: r.durationApiMs,
    ttftMs: r.ttftMs,
    numTurns: r.numTurns,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens,
    costEstimateUsd: r.costEstimateUsd,
    peakContextTokens: r.peakContextTokens,
  };
}

const CSV_COLUMNS = [
  'runId',
  'provider',
  'model',
  'mode',
  'startedAt',
  'durationMs',
  'durationApiMs',
  'ttftMs',
  'numTurns',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'costEstimateUsd',
  'peakContextTokens',
] as const;

/**
 * Escape a CSV cell. Also neutralizes the leading characters spreadsheet apps
 * treat as a formula — every value here is a number or an id, so a cell that
 * starts with `=` can only be an attempt at one.
 *
 * A leading `-` is guarded only when it is NOT a negative number. Blanket-
 * quoting it turned every negative value into the literal `'-5`, which is a
 * corrupted measurement in a file whose entire purpose is measurements.
 */
const CSV_FORMULA_LEAD = /^(?:[=+@\t\r]|-(?!\d))/;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  const safe = CSV_FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialize the run rollups as CSV — one row per run. */
export function exportCsv(input: TelemetryExportInput): string {
  const lines: string[] = [];
  lines.push(`# ${EXPORT_NOTE}`);
  lines.push(CSV_COLUMNS.join(','));
  for (const rollup of input.rollups) {
    const fields = rollupFields(rollup) as Record<string, unknown>;
    lines.push(CSV_COLUMNS.map((c) => csvCell(fields[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function exportTelemetry(format: 'json' | 'csv', input: TelemetryExportInput): string {
  return format === 'csv' ? exportCsv(input) : exportJson(input);
}
