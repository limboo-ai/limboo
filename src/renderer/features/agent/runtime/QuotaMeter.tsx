/**
 * Rolling-quota meters.
 *
 * VISUALLY DISTINCT FROM THE CONTEXT BAR ON PURPOSE. The context meter is one
 * continuous stacked bar in the accent ramp; this is a row of DISCRETE CELLS in
 * the status tokens. At a glance the two can never be mistaken for each other,
 * which matters because they answer different questions — "how full is this
 * conversation" versus "how much of my plan have I used this week".
 */
import type { RuntimeQuotaWindow, RuntimeUsagePoint } from '@shared/types';
import { quotaWindowLabel } from '@shared/runtime';
import { cn } from '@/renderer/lib/cn';
import { formatPercent, formatResetIn, quotaTone } from './format';

const TONE_FILL: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-muted',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const CELLS = 20;

export function QuotaMeter({
  window: quota,
  warnQuotaPct,
}: {
  window: RuntimeQuotaWindow;
  warnQuotaPct: number;
}) {
  const tone = quotaTone(quota.utilization, warnQuotaPct);
  // `utilization` is optional even when a window is reported: the provider may
  // tell us a window exists and its status without a number. Show the status.
  const filled =
    quota.utilization === undefined ? 0 : Math.round(quota.utilization * CELLS);

  return (
    <div className="py-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] text-muted">{quotaWindowLabel(quota.kind)}</span>
        <span className="ml-auto font-mono text-[11px] text-fg">
          {quota.utilization === undefined ? (
            <span className="text-faint">status only</span>
          ) : (
            formatPercent(quota.utilization * 100)
          )}
        </span>
      </div>
      <div
        className="mt-1 flex gap-px"
        role="img"
        aria-label={`${quotaWindowLabel(quota.kind)}: ${
          quota.utilization === undefined ? 'status only' : formatPercent(quota.utilization * 100)
        } used`}
      >
        {Array.from({ length: CELLS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-[1px]',
              i < filled ? TONE_FILL[tone] : 'bg-line',
            )}
          />
        ))}
      </div>
      <div className="flex items-baseline gap-2 pt-1 text-[10px] text-faint">
        <span>
          {quota.status === 'rejected'
            ? 'Limit reached'
            : quota.status === 'allowed_warning'
              ? 'Approaching the limit'
              : 'Within limits'}
        </span>
        {quota.resetsAt !== undefined && (
          <span className="ml-auto">Resets {formatResetIn(quota.resetsAt)}</span>
        )}
      </div>
      {quota.isUsingOverage && (
        <p className="pt-1 text-[10px] text-warning">Currently drawing on overage.</p>
      )}
    </div>
  );
}

/**
 * A trend sparkline over persisted quota samples. Inline SVG, no dependency —
 * the same approach every other chart-shaped thing in this app takes.
 */
export function TrendSparkline({
  points,
  warnQuotaPct,
}: {
  points: RuntimeUsagePoint[];
  warnQuotaPct: number;
}) {
  if (points.length < 2) return null;
  const width = 280;
  const height = 32;
  const max = Math.max(1, ...points.map((p) => p.utilization));
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (p.utilization / max) * height).toFixed(1)}`)
    .join(' ');
  const latest = points[points.length - 1];
  const tone = quotaTone(latest.utilization, warnQuotaPct);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-1 h-8 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Usage trend over the last ${points.length} samples`}
    >
      <path
        d={path}
        fill="none"
        stroke={
          tone === 'danger'
            ? 'var(--color-danger)'
            : tone === 'warning'
              ? 'var(--color-warning)'
              : 'var(--color-muted)'
        }
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
