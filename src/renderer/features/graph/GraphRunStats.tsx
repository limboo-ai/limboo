/**
 * Per-run statistics — the surface where the Work Graph and Runtime Telemetry
 * actually meet.
 *
 * The graph already knows the SHAPE of a run (nodes, edges, tools, errors);
 * telemetry knows its COST (duration, tokens, peak context, an estimated
 * price). Joining them by `runId` in main gives the one view that answers "what
 * did that request cost me" — a question neither subsystem can answer alone.
 *
 * Every telemetry column is optional and rendered as an em dash when absent. A
 * run that predates telemetry, or that ran under a provider reporting nothing,
 * still appears with its graph-derived columns intact — the "omit what was not
 * measured" rule, applied per cell rather than per row.
 */
import type { GraphRunStat } from '@shared/types';
import { EmptyState } from '@/renderer/components/ui';
import { Workflow } from 'lucide-react';

const DASH = '—';

function tokens(value: number | undefined): string {
  if (value === undefined) return DASH;
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function duration(ms: number | undefined): string {
  if (ms === undefined) return DASH;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function GraphRunStats({
  stats,
  selectedRunId,
  onSelect,
}: {
  stats: GraphRunStat[];
  selectedRunId?: string | null;
  onSelect?: (runId: string) => void;
}) {
  if (stats.length === 0) {
    return (
      <EmptyState
        compact
        icon={Workflow}
        title="No runs recorded yet"
        description="Send a prompt and each run's shape and cost will be summarized here."
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-faint">
            <th className="px-3 py-1.5 font-medium">Run</th>
            <th className="px-2 py-1.5 text-right font-medium">Nodes</th>
            <th className="px-2 py-1.5 text-right font-medium">Tools</th>
            <th className="px-2 py-1.5 text-right font-medium">Errors</th>
            <th className="px-2 py-1.5 text-right font-medium">Duration</th>
            <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
            <th className="px-2 py-1.5 text-right font-medium">Peak ctx</th>
            <th className="px-3 py-1.5 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((run) => (
            <tr
              key={run.runId}
              onClick={() => onSelect?.(run.runId)}
              className={
                'cursor-default border-b border-line/60 transition-colors hover:bg-surface-2 ' +
                (run.runId === selectedRunId ? 'bg-surface-2' : '')
              }
            >
              <td className="max-w-0 truncate px-3 py-1.5 text-fg" title={run.title}>
                {run.title}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-muted">{run.nodes}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted">{run.tools}</td>
              <td
                className={
                  'px-2 py-1.5 text-right font-mono ' +
                  (run.errors > 0 ? 'text-danger' : 'text-muted')
                }
              >
                {run.errors}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-muted">
                {duration(run.durationMs)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-muted">{tokens(run.tokens)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted">
                {tokens(run.peakContextTokens)}
              </td>
              {/* The tilde is the disclaimer — a client-side estimate from the
                  provider SDK's bundled price table, never billing data. */}
              <td className="px-3 py-1.5 text-right font-mono text-muted">
                {run.costEstimateUsd === undefined ? DASH : `~$${run.costEstimateUsd.toFixed(3)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] leading-relaxed text-faint">
        Duration, tokens, peak context and cost come from Runtime Telemetry and are absent for
        runs it did not measure. Cost figures are client-side estimates, not billing data.
      </p>
    </div>
  );
}
