/**
 * Formatting for the Runtime Inspector.
 *
 * One rule runs through all of it: a value the provider did not report is
 * rendered as an em dash and never as zero. "Not measured" and "measured as
 * nothing" are different claims, and the whole point of this subsystem is that
 * the UI never quietly turns one into the other.
 */

/** The placeholder for an absent measurement. */
export const NOT_REPORTED = '—';

/** Compact token count: 1234 → "1.2k", 240000 → "240k". */
export function formatTokens(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  return `${value.toFixed(digits)}%`;
}

/**
 * Threshold tone from the percentage of context REMAINING. Shared by the ring
 * and the meter so the two can never disagree about what "low" means — the same
 * reason `lifecycleMeta` lives beside them rather than inside a component.
 */
export function runtimeTone(
  remainingPct: number | undefined,
  warnPct: number,
  criticalPct: number,
): 'accent' | 'warning' | 'danger' {
  if (remainingPct === undefined) return 'accent';
  if (remainingPct <= criticalPct) return 'danger';
  if (remainingPct <= warnPct) return 'warning';
  return 'accent';
}
