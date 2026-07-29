/**
 * The stacked-segment context bar.
 *
 * WHAT THE COLOURS MEAN — and why there are no new ones. Seven contributors
 * need seven distinguishable fills on pure black. Rather than invent hex values
 * (forbidden by CLAUDE.md §4), every fill is an existing token, some at reduced
 * opacity. The ramp runs accent → accent/70 → accent/45 for the retrieval
 * subsystems, with `success` / `warning` / `muted` for the rest and
 * `line-strong` for the reserved tail.
 *
 * MEASURED vs ESTIMATED IS VISIBLE, NOT JUST DOCUMENTED. Estimated segments
 * carry a dashed top border; measured ones are solid. High-contrast mode swaps
 * the opacity steps for solid tokens and thickens that border, so the split
 * stays readable without depending on hue at all.
 */
import type { ContextSegment, ContextSegmentId } from '@shared/types';
import { SEGMENT_LABEL, SEGMENT_SUBSYSTEM } from '@shared/runtime';
import { cn } from '@/renderer/lib/cn';
import { formatTokens } from './format';

/** Token-derived fill per segment. Never a raw hex value. */
const SEGMENT_FILL: Record<ContextSegmentId, string> = {
  system: 'bg-muted',
  conversation: 'bg-accent',
  tools: 'bg-accent/70',
  mcp: 'bg-accent/45',
  memory: 'bg-success',
  search: 'bg-success/60',
  resume: 'bg-warning',
  attachments: 'bg-warning/55',
  reserved: 'bg-line-strong',
};

/** High-contrast fills: solid tokens only, no opacity steps to tell apart. */
const SEGMENT_FILL_HC: Record<ContextSegmentId, string> = {
  system: 'bg-muted',
  conversation: 'bg-accent',
  tools: 'bg-fg',
  mcp: 'bg-accent',
  memory: 'bg-success',
  search: 'bg-success',
  resume: 'bg-warning',
  attachments: 'bg-warning',
  reserved: 'bg-line-strong',
};

export function ContextMeter({
  segments,
  total,
  highContrast,
  showEstimates,
}: {
  segments: ContextSegment[];
  /** The denominator: the provider's context window. */
  total: number;
  highContrast: boolean;
  /** Off hides the estimated segments and shows the measured total only. */
  showEstimates: boolean;
}) {
  const visible = showEstimates ? segments : segments.filter((s) => s.origin === 'measured');
  const fills = highContrast ? SEGMENT_FILL_HC : SEGMENT_FILL;

  // When estimates are hidden the measured segments alone will not fill the
  // bar; the remainder renders as unattributed rather than as free space, so
  // the bar never overstates how much room is left.
  const shown = visible.reduce((sum, s) => sum + s.tokens, 0);
  const measuredTotal = segments.reduce((sum, s) => sum + s.tokens, 0);
  const unattributed = Math.max(0, measuredTotal - shown);

  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`Context window: ${formatTokens(measuredTotal)} of ${formatTokens(total)} tokens used`}
      >
        {visible.map((segment) => (
          <Segment
            key={segment.id}
            segment={segment}
            total={total}
            fill={fills[segment.id]}
            highContrast={highContrast}
          />
        ))}
        {unattributed > 0 && (
          <span
            className="h-full bg-muted/50"
            style={{ width: `${(unattributed / total) * 100}%` }}
            title={`Unattributed: ${formatTokens(unattributed)} tokens (estimates hidden)`}
          />
        )}
      </div>
      <Legend segments={visible} highContrast={highContrast} fills={fills} />
    </div>
  );
}

function Segment({
  segment,
  total,
  fill,
  highContrast,
}: {
  segment: ContextSegment;
  total: number;
  fill: string;
  highContrast: boolean;
}) {
  const pct = (segment.tokens / total) * 100;
  if (pct <= 0) return null;
  const estimated = segment.origin === 'estimated';
  // The tooltip names the SUBSYSTEM that consumed the tokens, and states the
  // origin in words — a dashed border alone does not survive a screenshot.
  const originLine = estimated
    ? `Estimated from ${segment.chars?.toLocaleString() ?? '?'} characters Limboo measured.`
    : 'Measured by the provider.';
  return (
    <span
      className={cn(
        'h-full transition-[width] duration-150 ease-out',
        fill,
        estimated && (highContrast ? 'border-t-2 border-dashed border-base' : 'border-t border-dashed border-base/60'),
      )}
      style={{ width: `${pct}%` }}
      title={`${SEGMENT_LABEL[segment.id]} — ${formatTokens(segment.tokens)} tokens\n${SEGMENT_SUBSYSTEM[segment.id]}\n${originLine}`}
    />
  );
}

function Legend({
  segments,
  highContrast,
  fills,
}: {
  segments: ContextSegment[];
  highContrast: boolean;
  fills: Record<ContextSegmentId, string>;
}) {
  if (segments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
      {segments.map((segment) => (
        <li key={segment.id} className="flex items-center gap-1.5 text-[10px] text-faint">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-[2px]',
              fills[segment.id],
              segment.origin === 'estimated' &&
                (highContrast ? 'border border-dashed border-fg' : 'border border-dashed border-line-strong'),
            )}
          />
          {/* The tilde IS the disclaimer — it travels with the number wherever
              the number goes, including into a screenshot. */}
          <span>
            {SEGMENT_LABEL[segment.id]}{' '}
            <span className="font-mono text-muted">
              {segment.origin === 'estimated' ? '~' : ''}
              {formatTokens(segment.tokens)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
