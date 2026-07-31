/**
 * The runtime ring — the always-visible half of the Runtime Inspector.
 *
 * Mounts as one `shrink-0` sibling inside the composer footer's existing
 * `ml-auto` cluster, immediately before the "{agent} ready" hint. It adds no
 * wrapper, no new flex context and — critically — NO `overflow-x`: that row
 * documents that any horizontal overflow forces `overflow-y: auto` and clips
 * the selects' upward-opening popovers. This card opens upward for the same
 * reason.
 *
 * IT RENDERS NOTHING when telemetry is off, when the indicator is disabled, or
 * when there is no snapshot at all. A Cursor session therefore leaves the
 * footer exactly as it was rather than showing a ring stuck at zero.
 */
import { useEffect } from 'react';
import { CircularProgress, HoverCard } from '@/renderer/components/ui';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useRuntimeStore } from '@/renderer/stores/useRuntimeStore';
import { RuntimeInspector } from './RuntimeInspector';
import { formatPercent, runtimeTone } from './format';

export function RuntimeIndicator({ anchor }: { anchor: 'composer' | 'header' }) {
  const cfg = useSettingsStore((s) => s.settings.runtime);
  const snapshot = useRuntimeStore((s) => s.snapshot);
  const setWatching = useRuntimeStore((s) => s.setWatching);
  const reload = useRuntimeStore((s) => s.reload);
  const update = useSettingsStore((s) => s.update);

  // Turning telemetry off makes main broadcast a reset, which clears the store.
  // Turning it back on broadcasts nothing — main only pushes when a signal
  // arrives — so without this the ring stays gone until the next session
  // switch, which reads as the setting not having worked.
  useEffect(() => {
    if (cfg.enabled) void reload();
  }, [cfg.enabled, reload]);

  // Pinning is a persisted preference, so it is also the standing "someone is
  // watching" signal — main pushes at full rate for as long as it is set.
  useEffect(() => {
    if (!cfg.enabled || !cfg.indicator) return;
    if (cfg.pinned) setWatching(true);
    return () => {
      if (cfg.pinned) setWatching(false);
    };
  }, [cfg.enabled, cfg.indicator, cfg.pinned, setWatching]);

  // No snapshot means main has nothing for this session yet (telemetry off, or
  // no session selected). It does NOT mean "no run has happened" — main answers
  // that with an idle snapshot — so the ring appears as soon as telemetry is on
  // rather than materializing partway through a session.
  if (!cfg.enabled || !cfg.indicator || cfg.anchor !== anchor || !snapshot) return null;

  const ctx = snapshot.context;
  // No denominator yet (or a provider that reports none): the ring goes
  // INDETERMINATE rather than to zero. Those are opposite claims.
  const indeterminate = !ctx?.windowTokens;
  const remainingPct =
    ctx?.windowTokens && ctx.remainingTokens !== undefined
      ? (ctx.remainingTokens / ctx.windowTokens) * 100
      : undefined;

  const value = ringValue(cfg.ringMetric, ctx?.pctUsed, remainingPct);
  const tone = runtimeTone(remainingPct, cfg.warnRemainingPct, cfg.criticalRemainingPct);
  const animate = cfg.animation !== 'none';

  const summary = indeterminate
    ? 'Runtime — context window not yet reported'
    : `Runtime — ${formatPercent(ctx?.pctUsed)} of the context window used`;

  return (
    <HoverCard
      label={summary}
      placement={anchor === 'composer' ? 'top' : 'bottom'}
      align="end"
      pinned={cfg.pinned}
      onPinnedChange={(pinned) => void update({ runtime: { pinned } })}
      animate={animate}
      className="shrink-0"
      panelClassName={cfg.layout === 'compact' ? 'w-[280px]' : 'w-[340px]'}
      // Hovering IS the request for live data: tell main to push at full rate
      // only while the card is actually being read.
      trigger={
        <span
          onMouseEnter={() => setWatching(true)}
          onMouseLeave={() => !cfg.pinned && setWatching(false)}
          className="inline-flex"
          title={summary}
        >
          <CircularProgress
            value={value}
            size={cfg.ringSize}
            stroke={cfg.ringStroke}
            tone={tone}
            indeterminate={indeterminate}
            pulse={animate && cfg.animation === 'full' && snapshot.live}
            showLabel={cfg.ringLabel}
          />
        </span>
      }
    >
      <RuntimeInspector snapshot={snapshot} cfg={cfg} />
    </HoverCard>
  );
}

/** What the arc measures, per `settings.runtime.ringMetric`. */
function ringValue(
  metric: 'context-used' | 'context-remaining',
  pctUsed: number | undefined,
  remainingPct: number | undefined,
): number {
  return metric === 'context-remaining' ? (remainingPct ?? 0) : (pctUsed ?? 0);
}
