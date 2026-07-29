/**
 * The Runtime Inspector — the context window, live, in a floating card.
 *
 * IT NEVER BRANCHES ON PROVIDER. The body is gated on the `contextWindow`
 * capability flag that main stamped onto the snapshot, and a false one renders
 * the provider's own "why not" sentence from `snapshot.notes`. That is what
 * makes the UI identical across adapters while still adapting to what each one
 * measures — and what lets a third adapter light this up with no change here.
 *
 * THE CARD SHOWS ONE THING, AND THAT IS THE DESIGN. It used to carry four
 * collapsible sections (request usage, long-term usage, execution detail) in a
 * persisted order. Three of them were chrome: two render "not reported" on any
 * adapter that does not publish quotas, and the third was a nineteen-row dump
 * behind a header collapsed by default anyway — while all three pushed the card
 * against the structural height cap below. The context window is the one
 * resource that matters continuously during a session, so it is now the whole
 * card: no headers, no chevrons, no ordering to remember. Main still collects
 * everything else; the Work Graph's stats tab and the telemetry export are
 * where those numbers live.
 */
import { AlertTriangle } from 'lucide-react';
import type { AppSettings, RuntimeSnapshot } from '@shared/types';
import { ContextMeter } from './ContextMeter';
import { Disclosure, EstimateNote, MetricRow, NotReported } from './parts';
import { formatPercent, formatTokens } from './format';

export function RuntimeInspector({
  snapshot,
  cfg,
}: {
  snapshot: RuntimeSnapshot;
  cfg: AppSettings['runtime'];
}) {
  // HARD HEIGHT CAP, and it is load-bearing rather than cosmetic. This card is
  // an absolutely-positioned child of the composer footer, which lives INSIDE
  // the floating workspace card — and that card is `overflow-hidden`
  // (AppShell.tsx). A tall panel opening upward is therefore clipped at the
  // card's top edge rather than escaping it. Staying under ~420px keeps the
  // whole inspector on screen at every window height the app supports.
  return (
    <div className="max-h-[min(52vh,420px)] overflow-y-auto">
      {snapshot.health && snapshot.health.failures > 0 && (
        <div className="flex gap-2 border-b border-line bg-warning/10 px-3 py-2">
          <AlertTriangle size={12} className="mt-px shrink-0 text-warning" />
          <p className="text-[10px] leading-relaxed text-warning">
            Telemetry stopped recording after {snapshot.health.failures} error
            {snapshot.health.failures === 1 ? '' : 's'}. Figures below may be stale.
          </p>
        </div>
      )}
      {/* There is deliberately NO standing footer disclaimer. It was two lines
          on every hover — the single largest fixed cost in a card whose whole
          job is to be glanceable — and it was redundant: every estimate is
          already marked `~`. The disclaimer travels with the number instead. */}
      <div className="px-3 py-3">
        <ContextSection snapshot={snapshot} cfg={cfg} />
      </div>
    </div>
  );
}

function ContextSection({
  snapshot,
  cfg,
}: {
  snapshot: RuntimeSnapshot;
  cfg: AppSettings['runtime'];
}) {
  if (!snapshot.capabilities.contextWindow) {
    return <NotReported note={snapshot.notes?.contextWindow} />;
  }
  const ctx = snapshot.context;
  if (!ctx) return <NotReported note="No request has been observed in this session yet." />;

  // No denominator yet. The provider only reports `contextWindow` on the result
  // message, so a model that has never completed a run here has none. Show the
  // absolute measurement and say so — a 0% bar would claim the opposite.
  if (!ctx.windowTokens) {
    return (
      <div>
        <MetricRow label="Context used" value={formatTokens(ctx.usedTokens)} />
        <EstimateNote>
          The provider reports a model’s context window when a run completes. Until then there is
          no total to measure against, so no percentage is shown.
        </EstimateNote>
      </div>
    );
  }

  const remainingPct = ((ctx.remainingTokens ?? 0) / ctx.windowTokens) * 100;
  const display = cfg.tokenDisplay;
  // Compact drops the supporting disclosures entirely. They are one more row
  // each even while closed, and "compact" has to mean something.
  const compact = cfg.layout === 'compact';

  return (
    <div>
      <ContextMeter
        segments={ctx.segments}
        total={ctx.windowTokens}
        highContrast={cfg.highContrast}
        showEstimates={cfg.showEstimates}
      />

      {ctx.attributionDegraded && (
        <EstimateNote>
          The breakdown is unavailable for this turn — Limboo’s estimates exceeded the total the
          provider measured, which happens after a compaction or on a resumed conversation. The
          total above is still measured.
        </EstimateNote>
      )}

      <div className="pt-2">
        <MetricRow
          label="Used"
          value={
            display === 'percent'
              ? formatPercent(ctx.pctUsed)
              : `${formatTokens(ctx.usedTokens)} / ${formatTokens(ctx.windowTokens)}`
          }
        />
        <MetricRow
          label="Remaining"
          value={
            display === 'percent'
              ? formatPercent(remainingPct)
              : formatTokens(ctx.remainingTokens)
          }
          tone={
            remainingPct <= cfg.criticalRemainingPct
              ? 'danger'
              : remainingPct <= cfg.warnRemainingPct
                ? 'warning'
                : 'default'
          }
        />
        <MetricRow
          label="Reserved for reply"
          value={formatTokens(ctx.reservedTokens)}
          hint="The provider’s own maxOutputTokens for this model."
        />
        <MetricRow
          label="Auto-compaction at"
          value={ctx.autoCompactTokens ? formatTokens(ctx.autoCompactTokens) : 'not yet observed'}
          hint="Observed from the first automatic compaction seen for this model. The provider does not publish a threshold."
        />
        {ctx.predictedTurnsRemaining !== undefined && (
          <MetricRow
            label="Turns left (est.)"
            value={`~${ctx.predictedTurnsRemaining}`}
            hint={`Projected from a median growth of ${formatTokens(ctx.tokensPerTurn)} tokens per request.`}
          />
        )}
      </div>

      {ctx.retrieval && !compact && (
        <Disclosure summary="Retrieval budgets">
          <MetricRow
            label="Memory"
            value={`${formatTokens(ctx.retrieval.memoryChars)} / ${formatTokens(ctx.retrieval.memoryBudgetChars)} chars`}
          />
          <MetricRow
            label="Project context"
            value={`${formatTokens(ctx.retrieval.searchChars)} / ${formatTokens(ctx.retrieval.searchBudgetChars)} chars`}
          />
        </Disclosure>
      )}

      {ctx.compactions && !compact && (
        <Disclosure summary={`Compactions (${ctx.compactions.count})`}>
          <MetricRow label="Last trigger" value={ctx.compactions.lastTrigger} />
          <MetricRow label="Before" value={formatTokens(ctx.compactions.lastPreTokens)} />
          <MetricRow label="After" value={formatTokens(ctx.compactions.lastPostTokens)} />
        </Disclosure>
      )}

      {cfg.showEstimates && !ctx.attributionDegraded && (
        <EstimateNote>
          Segments marked <span className="font-mono">~</span> are estimated: Limboo counted the
          characters of the blocks it composed and divided by an approximate characters-per-token
          ratio. The total, the window and the reservation are measured by the provider.
        </EstimateNote>
      )}
    </div>
  );
}
