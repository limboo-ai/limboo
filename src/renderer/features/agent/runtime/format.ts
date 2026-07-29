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

/** Milliseconds as a short human duration. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return NOT_REPORTED;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * A cost estimate. Always rendered with a leading `~` because the provider's
 * own documentation says these come from a bundled price table and are not
 * billing data — the tilde is the disclaimer travelling with the number.
 */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined || !Number.isFinite(usd)) return NOT_REPORTED;
  return usd < 0.01 ? '~<$0.01' : `~$${usd.toFixed(2)}`;
}

/** A future timestamp as "in 2h 14m"; a past one as "now". */
export function formatResetIn(at: number | undefined, now = Date.now()): string {
  if (at === undefined || !Number.isFinite(at)) return NOT_REPORTED;
  const ms = at - now;
  if (ms <= 0) return 'now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Context usage as either a percentage or an absolute token count, per
 * `settings.runtime.tokenDisplay`.
 */
export function formatContextValue(
  tokens: number | undefined,
  total: number | undefined,
  display: 'absolute' | 'percent',
): string {
  if (tokens === undefined) return NOT_REPORTED;
  if (display === 'absolute' || !total) return formatTokens(tokens);
  return formatPercent((tokens / total) * 100);
}

/** Output tokens per second, when the stream let us measure it. */
export function formatRate(tokensPerSecond: number | undefined): string {
  if (tokensPerSecond === undefined || !Number.isFinite(tokensPerSecond)) return NOT_REPORTED;
  return `${Math.round(tokensPerSecond)} tok/s`;
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

/** Quota tone from utilization (0–1) against the configured warning percent. */
export function quotaTone(
  utilization: number | undefined,
  warnPct: number,
): 'success' | 'warning' | 'danger' {
  if (utilization === undefined) return 'success';
  const pct = utilization * 100;
  if (pct >= 95) return 'danger';
  if (pct >= warnPct) return 'warning';
  return 'success';
}
