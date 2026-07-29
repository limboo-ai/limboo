/**
 * Settings › Agent › Runtime Indicators.
 *
 * Lives under Agent because it describes the running agent, but the DATA is
 * `settings.runtime` — a top-level peer of `settings.graph`, because Runtime
 * Telemetry is a provider-neutral platform service rather than provider config.
 *
 * Every knob here changes how Limboo DISPLAYS what a provider already reported.
 * None of them makes Limboo fetch anything, and no provider is ever polled —
 * the numbers ride the same event stream that drives the conversation. The
 * hints say so, because "refresh interval" otherwise reads like polling.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TELEMETRY_LIMITS } from '@shared/constants';
import { RUNTIME_SECTION_LABEL } from '@shared/runtime';
import type { RuntimeExportFormat, RuntimeSectionId } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useRuntimeStore } from '@/renderer/stores/useRuntimeStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import {
  ActionButton,
  Field,
  Section,
  SegmentedControl,
  Select,
  Slider,
  StackedField,
  Toggle,
} from '../controls';

export function RuntimeIndicatorsSection() {
  const rt = useSettingsStore((s) => s.settings.runtime);
  const update = useSettingsStore((s) => s.update);
  const save = useRuntimeStore((s) => s.save);
  const clearHistory = useRuntimeStore((s) => s.clearHistory);
  const toast = useUIStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  /** One export path for both formats — the dialog lives in main. */
  const runExport = (format: RuntimeExportFormat): void => {
    setBusy(true);
    void save(format)
      .then((ok) => ok && toast({ tone: 'success', title: 'Telemetry exported.' }))
      .finally(() => setBusy(false));
  };

  const set = <K extends keyof typeof rt>(key: K, value: (typeof rt)[K]) =>
    void update({ runtime: { [key]: value } });

  const T = TELEMETRY_LIMITS;
  /**
   * Everything below the master switch describes a subsystem that is not
   * running when telemetry is off. Leaving those controls live let a user spend
   * time tuning a ring that would not appear — the switch has to visibly own
   * the section, not just the collection.
   */
  const off = !rt.enabled;

  const move = (id: RuntimeSectionId, delta: -1 | 1) => {
    const order = [...rt.sectionOrder];
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    set('sectionOrder', order);
  };

  return (
    <Section
      title="Runtime Indicators"
      hint="A live view of the running agent’s context window and provider limits, shown as a ring beside the composer status. Everything here is measured from the events Limboo already receives — no provider is ever polled and no network request is added. The inspector is anchored to the ring rather than draggable, so there is no panel position to remember, and reduced motion in Appearance overrides the animation setting below."
    >
      <Field
        id="runtimeEnabled"
        label="Runtime telemetry"
        hint="Off stops all collection: no ring, no history, no stored rows."
      >
        <Toggle checked={rt.enabled} onChange={(v) => set('enabled', v)} aria-label="Runtime telemetry" />
      </Field>

      <Field id="runtimeIndicator" label="Show the ring" hint="The always-visible indicator that opens the inspector on hover.">
        <Toggle
          checked={rt.indicator}
          onChange={(v) => set('indicator', v)}
          disabled={off}
          aria-label="Show the ring"
        />
      </Field>

      <Field id="runtimeAnchor" label="Position" hint="Beside the composer status hint, or in the session header.">
        <SegmentedControl
          value={rt.anchor}
          onChange={(v) => set('anchor', v)}
          options={[
            { value: 'composer', label: 'Composer' },
            { value: 'header', label: 'Header' },
          ]}
          disabled={off}
        />
      </Field>

      <Field
        id="runtimePinned"
        label="Keep the inspector open"
        hint="Pinned, it stays visible without hovering."
      >
        <Toggle checked={rt.pinned} onChange={(v) => set('pinned', v)} aria-label="Keep the inspector open"
          disabled={off}
        />
      </Field>

      <Field id="runtimeRingMetric" label="Ring measures" hint="Which number the arc represents.">
        <Select
          value={rt.ringMetric}
          onChange={(v) => set('ringMetric', v)}
          options={[
            { value: 'context-used', label: 'Context used' },
            { value: 'context-remaining', label: 'Context remaining' },
            { value: 'quota', label: 'Highest quota window' },
          ]}
          disabled={off}
        />
      </Field>

      <StackedField id="runtimeRingSize" label={`Ring size — ${rt.ringSize}px`}
        hint="The diameter of the indicator beside the composer status."
      >
        <Slider
          value={rt.ringSize}
          min={T.ringSize.min}
          max={T.ringSize.max}
          step={1}
          onChange={(v) => set('ringSize', v)}
          aria-label="Ring size"
          disabled={off}
        />
      </StackedField>

      <StackedField id="runtimeRingStroke" label={`Ring thickness — ${rt.ringStroke}px`}
        hint="A heavier arc reads more clearly at small ring sizes."
      >
        <Slider
          value={rt.ringStroke}
          min={T.ringStroke.min}
          max={T.ringStroke.max}
          step={1}
          onChange={(v) => set('ringStroke', v)}
          aria-label="Ring thickness"
          disabled={off}
        />
      </StackedField>

      <Field
        id="runtimeRingLabel"
        label="Percentage inside the ring"
        hint="Readable at larger ring sizes; cramped below about 24px."
      >
        <Toggle checked={rt.ringLabel} onChange={(v) => set('ringLabel', v)} aria-label="Percentage inside the ring"
          disabled={off}
        />
      </Field>

      <Field id="runtimeAnimation" label="Animation" hint="Reduced motion in Appearance overrides this entirely.">
        <SegmentedControl
          value={rt.animation}
          onChange={(v) => set('animation', v)}
          options={[
            { value: 'none', label: 'None' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'full', label: 'Full' },
          ]}
          disabled={off}
        />
      </Field>

      <Field id="runtimeLayout" label="Inspector layout" hint="Compact hides the execution detail by default.">
        <SegmentedControl
          value={rt.layout}
          onChange={(v) => set('layout', v)}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'expanded', label: 'Expanded' },
          ]}
          disabled={off}
        />
      </Field>

      <Field id="runtimeTokenDisplay" label="Show context as" hint="Percentages, or absolute token counts.">
        <SegmentedControl
          value={rt.tokenDisplay}
          onChange={(v) => set('tokenDisplay', v)}
          options={[
            { value: 'percent', label: 'Percent' },
            { value: 'absolute', label: 'Tokens' },
          ]}
          disabled={off}
        />
      </Field>

      <Field
        id="runtimeShowEstimates"
        label="Show estimated breakdown"
        hint="The per-contributor split is estimated from character counts Limboo measured; the total is measured by the provider. Off shows only the measured total."
      >
        <Toggle
          checked={rt.showEstimates}
          onChange={(v) => set('showEstimates', v)}
          aria-label="Show estimated breakdown"
          disabled={off}
        />
      </Field>

      <Field
        id="runtimeShowCost"
        label="Show estimated cost"
        hint="A client-side estimate from the provider SDK’s bundled price table — not billing data."
      >
        <Toggle
          checked={rt.showCostEstimate}
          onChange={(v) => set('showCostEstimate', v)}
          aria-label="Show estimated cost"
          disabled={off}
        />
      </Field>

      <Field
        id="runtimeHighContrast"
        label="High-contrast segments"
        hint="Distinguishes the context segments by border and weight rather than by hue alone."
      >
        <Toggle
          checked={rt.highContrast}
          onChange={(v) => set('highContrast', v)}
          aria-label="High-contrast segments"
          disabled={off}
        />
      </Field>

      <StackedField id="runtimeWarn" label={`Warn below — ${rt.warnRemainingPct}% context left`}
        hint="The ring and the “Remaining” row turn amber below this much context left."
      >
        <Slider
          value={rt.warnRemainingPct}
          min={T.warnRemainingPct.min}
          max={T.warnRemainingPct.max}
          step={1}
          onChange={(v) => set('warnRemainingPct', v)}
          aria-label="Warning threshold"
          disabled={off}
        />
      </StackedField>

      <StackedField id="runtimeCritical" label={`Critical below — ${rt.criticalRemainingPct}% context left`}
        hint="They turn red below this. Always kept beneath the warning threshold."
      >
        <Slider
          value={rt.criticalRemainingPct}
          min={T.criticalRemainingPct.min}
          max={T.criticalRemainingPct.max}
          step={1}
          onChange={(v) => set('criticalRemainingPct', v)}
          aria-label="Critical threshold"
          disabled={off}
        />
      </StackedField>

      <StackedField
        id="runtimeNotify"
        label={
          rt.notifyRemainingPct === 0
            ? 'Notify on low context — off'
            : `Notify below — ${rt.notifyRemainingPct}% context left`
        }
        hint="A desktop notification, once per session. Also requires notifications to be on in Behavior."
      >
        <Slider
          value={rt.notifyRemainingPct}
          min={T.notifyRemainingPct.min}
          max={T.notifyRemainingPct.max}
          step={1}
          onChange={(v) => set('notifyRemainingPct', v)}
          aria-label="Low-context notification threshold"
          disabled={off}
        />
      </StackedField>

      <StackedField id="runtimeWarnQuota" label={`Quota warning above — ${rt.warnQuotaPct}% used`}
        hint="The rolling-quota meters turn amber above this much of the window consumed."
      >
        <Slider
          value={rt.warnQuotaPct}
          min={T.warnQuotaPct.min}
          max={T.warnQuotaPct.max}
          step={1}
          onChange={(v) => set('warnQuotaPct', v)}
          aria-label="Quota warning threshold"
          disabled={off}
        />
      </StackedField>

      <Field
        id="runtimeRefresh"
        label="Idle refresh"
        hint="How often open countdowns and elapsed timers re-render. Metrics themselves update the moment the provider reports them — this polls nothing."
      >
        <Select
          value={rt.idleRefreshMs}
          onChange={(v) => set('idleRefreshMs', Number(v))}
          options={[
            { value: 0, label: 'Off' },
            { value: 2_000, label: 'Every 2s' },
            { value: 5_000, label: 'Every 5s' },
            { value: 15_000, label: 'Every 15s' },
            { value: 60_000, label: 'Every minute' },
          ]}
          disabled={off}
        />
      </Field>

      <Field
        id="runtimeUpdateFrequency"
        label="Update coalescing"
        hint="A burst of provider events becomes one UI update within this window."
      >
        <Select
          value={rt.updateFrequency}
          onChange={(v) => set('updateFrequency', Number(v))}
          options={[
            { value: 100, label: '100ms — most responsive' },
            { value: 250, label: '250ms — balanced' },
            { value: 1_000, label: '1s' },
            { value: 5_000, label: '5s — least work' },
          ]}
          disabled={off}
        />
      </Field>

      <Field
        id="runtimeShowHistory"
        label="Show usage history"
        hint="The long-term usage trend in the inspector."
      >
        <Toggle checked={rt.showHistory} onChange={(v) => set('showHistory', v)} aria-label="Show usage history"
          disabled={off}
        />
      </Field>

      <Field
        id="runtimePersist"
        label="Store usage history"
        hint="Off stops writing rows AND empties history reads — the switch for deployments that forbid local telemetry retention. Only aggregate counts are ever stored: no prompts, no paths, no conversation data."
      >
        <Toggle checked={rt.persist} onChange={(v) => set('persist', v)} aria-label="Store usage history"
          disabled={off}
        />
      </Field>

      <Field id="runtimeRetention" label="Keep history for" hint="Older samples and run rollups are swept hourly.">
        <Select
          value={rt.retentionDays}
          onChange={(v) => set('retentionDays', Number(v))}
          options={[
            { value: 0, label: 'Forever' },
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' },
            { value: 90, label: '90 days' },
            { value: 365, label: '1 year' },
          ]}
          disabled={off}
        />
      </Field>

      <StackedField id="runtimeRetainRuns" label={`Keep ${rt.retainRuns} runs per session`}
        hint="Per-run cost rollups kept for the Work Graph’s Stats tab. Aggregate numbers only."
      >
        <Slider
          value={rt.retainRuns}
          min={T.retainRuns.min}
          max={T.retainRuns.max}
          step={10}
          onChange={(v) => set('retainRuns', v)}
          aria-label="Runs retained per session"
          disabled={off}
        />
      </StackedField>

      <Field
        id="runtimeSectionOrder"
        label="Section order"
        hint="The order sections appear in the inspector."
      >
        <div className="flex w-44 flex-col gap-1">
          {rt.sectionOrder.map((id, i) => (
            <div
              key={id}
              className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-fg"
            >
              <span className="truncate">{RUNTIME_SECTION_LABEL[id]}</span>
              <button
                type="button"
                aria-label={`Move ${RUNTIME_SECTION_LABEL[id]} up`}
                disabled={off || i === 0}
                onClick={() => move(id, -1)}
                className="ml-auto rounded p-0.5 text-faint transition-colors hover:text-fg disabled:opacity-30"
              >
                <ChevronUp size={11} />
              </button>
              <button
                type="button"
                aria-label={`Move ${RUNTIME_SECTION_LABEL[id]} down`}
                disabled={off || i === rt.sectionOrder.length - 1}
                onClick={() => move(id, 1)}
                className="rounded p-0.5 text-faint transition-colors hover:text-fg disabled:opacity-30"
              >
                <ChevronDown size={11} />
              </button>
            </div>
          ))}
        </div>
      </Field>

      <Field
        id="runtimeExport"
        label="Export telemetry"
        hint="Aggregate counts and timings only — the export cannot contain conversation data because nothing stores it."
      >
        {/* `busy` belongs to the buttons that SET it. It used to be read only
            by the Clear button below, so an export in flight showed its
            progress on an unrelated control while staying re-clickable itself. */}
        <div className="flex gap-2">
          <ActionButton
            label="Export JSON"
            busy={busy}
            onClick={() => runExport('json')}
            disabled={off}
          />
          <ActionButton
            label="Export CSV"
            busy={busy}
            onClick={() => runExport('csv')}
            disabled={off}
          />
        </div>
      </Field>

      <Field id="runtimeClear" label="Clear stored telemetry" hint="Erases every stored sample and run rollup.">
        <ActionButton
          label={clearing ? 'Clearing…' : 'Clear history'}
          danger
          busy={clearing}
          onClick={() => {
            setClearing(true);
            void clearHistory()
              .then(() => toast({ tone: 'success', title: 'Stored telemetry cleared.' }))
              .finally(() => setClearing(false));
          }}
          disabled={off}
        />
      </Field>
    </Section>
  );
}
