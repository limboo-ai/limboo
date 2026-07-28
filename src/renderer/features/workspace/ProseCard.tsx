/**
 * A labelled, collapsible container for a multi-paragraph BODY in the
 * conversation stream.
 *
 * ## The rule this refines
 *
 * The stream's contract is that rows sit at its own typographic weight and are
 * never cards — that is what makes a turn read as a timeline instead of a stack
 * of boxes, and `PlanInline` / `SubagentActivity` both state it. That rule is
 * about ROWS, and it stands.
 *
 * A body is not a row. A subagent's returned summary, its forwarded transcript,
 * and an approved plan are documents: several paragraphs of Markdown, headings,
 * task lists. Rendered flush against the stream with a `10px` uppercase label
 * above them and metadata rows below, they had no boundary at all — prose ran
 * into structure, and the reader had to work out where one ended. So: **rows are
 * never cards; bodies are.**
 *
 * ## Why not just a max-height
 *
 * The previous shape was `max-h-72 overflow-y-auto` — a nested scroller inside
 * the conversation's own scroller. It traps the wheel, gives no indication that
 * anything is below the fold, and offers no way to see the rest. This clamps
 * with a fade and an explicit control instead, so the reader always knows there
 * is more and can always get to it.
 *
 * Uses the house card idiom (the Tasks drawer's "Implementation plan" section):
 * `rounded-md border border-line bg-surface-2/50`, an uppercase header strip
 * that toggles, and a `border-t` body. Theme tokens only, no shadows.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';

interface ProseCardProps {
  /** Uppercase section label, e.g. `returned summary`. */
  label: string;
  /** Open on first render. Summaries default open; transcripts closed. */
  defaultOpen?: boolean;
  /**
   * Clamp the body to roughly this many pixels until the reader expands it.
   * `0` disables clamping (the maximized workspace, which has the room).
   */
  clampHeight?: number;
  /**
   * `card` draws the bordered container; `bare` keeps the same disclosure and
   * clamping with no surround at all.
   *
   * Bare exists because inside a subagent's execution record the surround was
   * doing damage rather than work: `validation`, `files changed` and `tool
   * calls` are already plain labelled sections there, so boxing only the
   * transcript and the summary made two of the record's sections look like a
   * different KIND of thing. A container earns its border when it separates a
   * document from unrelated content around it — not when everything around it
   * is the same document.
   */
  variant?: 'card' | 'bare';
  /** Right-aligned actions in the header — a CopyButton, usually. */
  actions?: ReactNode;
  /** Optional right-aligned hint before the actions (e.g. a character count). */
  meta?: string;
  children: ReactNode;
  className?: string;
}

export function ProseCard({
  label,
  defaultOpen = true,
  clampHeight = 320,
  variant = 'card',
  actions,
  meta,
  children,
  className,
}: ProseCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const clamped = clampHeight > 0 && !expanded;
  const bare = variant === 'bare';

  return (
    <div
      className={cn(
        bare
          ? 'flex flex-col gap-0.5'
          : 'overflow-hidden rounded-md border border-line bg-surface-2/50',
        className,
      )}
    >
      <div className={cn('flex items-center gap-1.5', !bare && 'pr-1')}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium uppercase tracking-wider text-faint transition-colors hover:text-muted',
            // Bare matches the sibling section labels exactly — same size, same
            // 1px inset — so the record reads as one list of sections.
            bare ? 'px-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]',
          )}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="truncate">{label}</span>
        </button>
        {meta && <span className="shrink-0 text-[10px] text-faint">{meta}</span>}
        {actions}
      </div>
      {open && (
        <div className={cn(!bare && 'border-t border-line')}>
          <div
            className={cn('relative', bare ? 'px-1' : 'px-3 py-2', clamped && 'overflow-hidden')}
            style={clamped ? { maxHeight: clampHeight } : undefined}
          >
            {children}
            {clamped && (
              // Fades the clipped edge so the cut never looks like the end of
              // the document. The gradient has to land on whatever is actually
              // behind the text, or the fade reads as a band.
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent',
                  bare ? 'to-surface' : 'to-surface-2',
                )}
              />
            )}
          </div>
          {clampHeight > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'w-full text-left text-[10.5px] text-faint transition-colors hover:text-accent',
                bare ? 'px-1 pt-0.5' : 'border-t border-line px-3 py-1',
              )}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
