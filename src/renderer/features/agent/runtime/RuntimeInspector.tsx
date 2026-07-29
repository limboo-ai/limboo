/**
 * The Runtime Inspector — a live runtime dashboard in a floating card.
 *
 * IT NEVER BRANCHES ON PROVIDER. Each section is gated on a capability flag
 * that main stamped onto the snapshot, and a false one renders the provider's
 * own "why not" sentence from `snapshot.notes`. That is what makes the UI
 * identical across adapters while still adapting to what each one measures —
 * and what lets a third adapter light up its sections with no change here.
 */
import { AlertTriangle } from 'lucide-react';
import type { AppSettings, RuntimeSnapshot, RuntimeUsageHistory } from '@shared/types';
import { RUNTIME_SECTION_LABEL, isLongTermWindow } from '@shared/runtime';
import { ContextMeter } from './ContextMeter';
import { QuotaMeter, TrendSparkline } from './QuotaMeter';
import { Disclosure, EstimateNote, MetricRow, NotReported, RuntimeSection } from './parts';
import {
  NOT_REPORTED,
  formatCost,
  formatDuration,
  formatPercent,
  formatRate,
  formatTokens,
} from './format';

export function RuntimeInspector({
  snapshot,
  history,
  cfg,
  onToggleSection,
}: {
  snapshot: RuntimeSnapshot;
  history: RuntimeUsageHistory[];
  cfg: AppSettings['runtime'];
  onToggleSection: (id: AppSettings['runtime']['sectionOrder'][number]) => void;
}) {
  const collapsed = new Set(cfg.collapsedSections);
  const compact = cfg.layout === 'compact';

  const sections = cfg.sectionOrder.map((id) => {
    switch (id) {
      case 'context':
        return (
          <RuntimeSection
            key={id}
            title={RUNTIME_SECTION_LABEL.context}
            collapsed={collapsed.has(id)}
            onToggle={() => onToggleSection(id)}
            aside={contextAside(snapshot)}
          >
            <ContextSection snapshot={snapshot} cfg={cfg} />
          </RuntimeSection>
        );
      case 'requests':
        return (
          <RuntimeSection
            key={id}
            title={RUNTIME_SECTION_LABEL.requests}
            collapsed={collapsed.has(id)}
            onToggle={() => onToggleSection(id)}
          >
            <RequestSection snapshot={snapshot} cfg={cfg} />
          </RuntimeSection>
        );
      case 'longterm':
        if (!cfg.showHistory) return null;
        return (
          <RuntimeSection
            key={id}
            title={RUNTIME_SECTION_LABEL.longterm}
            collapsed={collapsed.has(id)}
            onToggle={() => onToggleSection(id)}
          >
            <LongTermSection snapshot={snapshot} history={history} cfg={cfg} />
          </RuntimeSection>
        );
      case 'provider':
        return (
          <RuntimeSection
            key={id}
            title={RUNTIME_SECTION_LABEL.provider}
            collapsed={collapsed.has(id) || compact}
            onToggle={() => onToggleSection(id)}
          >
            <ExecutionSection snapshot={snapshot} cfg={cfg} />
          </RuntimeSection>
        );
      default:
        return null;
    }
  });

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
          job is to be glanceable — and it was redundant: `formatCost` prefixes
          every estimate with `~`, and the cost row carries the full sentence as
          its own hint. The disclaimer travels with the number instead. */}
      {sections}
    </div>
  );
}

/** The collapsed-state summary for the context section. */
function contextAside(snapshot: RuntimeSnapshot): React.ReactNode {
  const ctx = snapshot.context;
  if (!ctx?.windowTokens) return null;
  return formatPercent(ctx.pctUsed);
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

function RequestSection({
  snapshot,
  cfg,
}: {
  snapshot: RuntimeSnapshot;
  cfg: AppSettings['runtime'];
}) {
  if (!snapshot.capabilities.requestQuota) {
    return <NotReported note={snapshot.notes?.requestQuota} />;
  }
  // Short rolling windows only; the long ones belong to the section below.
  const windows = (snapshot.quota ?? []).filter((q) => !isLongTermWindow(q.kind));
  if (windows.length === 0) {
    return (
      <NotReported note="The provider has not reported a request window for this account yet. It arrives with the first rate-limit update." />
    );
  }
  return (
    <div>
      {windows.map((q) => (
        <QuotaMeter key={q.kind} window={q} warnQuotaPct={cfg.warnQuotaPct} />
      ))}
    </div>
  );
}

function LongTermSection({
  snapshot,
  history,
  cfg,
}: {
  snapshot: RuntimeSnapshot;
  history: RuntimeUsageHistory[];
  cfg: AppSettings['runtime'];
}) {
  if (!snapshot.capabilities.quotaWindows) {
    return <NotReported note={snapshot.notes?.quotaWindows} />;
  }
  const windows = (snapshot.quota ?? []).filter((q) => isLongTermWindow(q.kind));
  const disabled = history.some((h) => h.disabled);

  if (windows.length === 0 && !disabled) {
    return <NotReported note="No rolling usage window has been reported for this account yet." />;
  }

  return (
    <div>
      {windows.map((q) => {
        const trend = history.find((h) => h.windowKind === q.kind);
        return (
          <div key={q.kind}>
            <QuotaMeter window={q} warnQuotaPct={cfg.warnQuotaPct} />
            {trend && trend.points.length > 1 && (
              <TrendSparkline points={trend.points} warnQuotaPct={cfg.warnQuotaPct} />
            )}
          </div>
        );
      })}
      {disabled && (
        <EstimateNote>
          Usage history is disabled by policy, so no trend is stored or shown. Live figures above
          are unaffected.
        </EstimateNote>
      )}
    </div>
  );
}

function ExecutionSection({
  snapshot,
  cfg,
}: {
  snapshot: RuntimeSnapshot;
  cfg: AppSettings['runtime'];
}) {
  const run = snapshot.run;
  const env = snapshot.environment;
  return (
    <div>
      <MetricRow label="Model" value={run?.model ?? NOT_REPORTED} />
      <MetricRow label="Mode" value={run?.mode ?? NOT_REPORTED} />
      <MetricRow label="State" value={snapshot.live ? 'running' : 'idle'} />
      {snapshot.capabilities.latency && (
        <>
          <MetricRow label="Time to first token" value={formatDuration(run?.ttftMs)} />
          <MetricRow label="Last run" value={formatDuration(run?.durationMs)} />
          <MetricRow label="API time" value={formatDuration(run?.durationApiMs)} />
        </>
      )}
      {snapshot.capabilities.tokenUsage && (
        <>
          <MetricRow label="Generation" value={formatRate(run?.tokensPerSecond)} />
          <MetricRow label="Turns" value={run?.numTurns ?? NOT_REPORTED} />
          <MetricRow
            label="Run tokens"
            value={
              run?.tokens
                ? `${formatTokens(run.tokens.input)} in / ${formatTokens(run.tokens.output)} out`
                : NOT_REPORTED
            }
            hint={
              run?.tokens?.includesSubagents
                ? 'From the provider’s per-model usage, which includes subagent requests.'
                : undefined
            }
          />
          <MetricRow label="Cache reads" value={formatTokens(run?.tokens?.cacheRead)} />
        </>
      )}
      {cfg.showCostEstimate && snapshot.capabilities.costEstimate && (
        <MetricRow
          label="Estimated cost"
          value={formatCost(run?.costEstimateUsd)}
          hint="Client-side estimate from the provider SDK’s bundled price table. Not billing data."
        />
      )}
      {run?.retries && (
        <MetricRow
          label="Retries"
          value={`${run.retries.attempt} of ${run.retries.maxRetries}`}
          tone="warning"
        />
      )}

      <Disclosure summary="Environment">
        <MetricRow
          label="Worktree"
          value={env?.worktree ? `${env.worktree.branch}` : NOT_REPORTED}
          hint={env?.worktree?.path}
        />
        <MetricRow
          label="MCP servers"
          value={env?.mcp ? `${env.mcp.connected} / ${env.mcp.total}` : NOT_REPORTED}
        />
        <MetricRow
          label="Index"
          value={env?.index ? `${env.index.files} files` : NOT_REPORTED}
        />
        <MetricRow label="Attachments" value={env?.attachmentCount ?? NOT_REPORTED} />
        <MetricRow label="Memories injected" value={env?.memoryInjected ?? NOT_REPORTED} />
        <MetricRow label="Locations retrieved" value={env?.searchInjected ?? NOT_REPORTED} />
        {/* Truncated, and deliberately with NO full-value hint. This id is the
            key to a provider-side conversation; the prefix is enough to tell
            two sessions apart, which is the only thing it is here to do. */}
        <MetricRow
          label="Provider session"
          value={env?.providerSessionId ? `${env.providerSessionId.slice(0, 8)}…` : NOT_REPORTED}
          hint="The provider's own conversation id, truncated."
        />
      </Disclosure>

      {snapshot.tools && snapshot.tools.length > 0 && (
        <Disclosure summary={`Tools running (${snapshot.tools.length})`}>
          {snapshot.tools.map((tool) => (
            <MetricRow
              key={tool.callId}
              label={tool.name}
              value={`${Math.round(tool.elapsedSeconds)}s`}
            />
          ))}
        </Disclosure>
      )}
    </div>
  );
}
