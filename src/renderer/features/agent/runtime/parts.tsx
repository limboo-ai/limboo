/**
 * Shared presentation pieces for the Runtime Inspector.
 *
 * `NotReported` is the load-bearing one. When a provider does not expose a
 * metric, this is what renders instead of a number — with the provider's own
 * "why not" copy, which main supplies on `snapshot.notes`. The renderer never
 * learns which provider is running; it only learns that a capability is false
 * and what to say about it.
 */
import { useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { NOT_REPORTED } from './format';

/** One label / value row. The inspector's only row primitive. */
export function MetricRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5" title={hint}>
      <span className="shrink-0 text-[11px] text-faint">{label}</span>
      <span className="ml-auto truncate text-right font-mono text-[11px] text-fg">
        <span
          className={cn(
            tone === 'warning' && 'text-warning',
            tone === 'danger' && 'text-danger',
            value === NOT_REPORTED && 'text-faint',
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * The informational state for a metric this provider does not report.
 *
 * This exists so the inspector never has to choose between a fabricated zero
 * and a silent gap. Both are lies of a different kind; a sentence naming the
 * limitation is the honest third option.
 */
export function NotReported({ note }: { note?: string }) {
  return (
    <div className="flex gap-2 rounded-md bg-surface-2 px-2.5 py-2">
      <Info size={12} className="mt-px shrink-0 text-faint" />
      <p className="text-[11px] leading-relaxed text-muted">
        {note ?? 'Not reported by the active provider.'}
      </p>
    </div>
  );
}

/**
 * The estimate disclaimer. Rendered wherever a value derives from Limboo's own
 * character counts rather than a provider measurement.
 */
export function EstimateNote({ children }: { children: React.ReactNode }) {
  return <p className="pt-1.5 text-[10px] leading-relaxed text-faint">{children}</p>;
}

/** A small inline disclosure for supporting detail inside a section. */
export function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[10px] text-faint transition-colors hover:text-muted"
      >
        <ChevronRight size={9} className={cn('transition-transform', open && 'rotate-90')} />
        {summary}
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  );
}
