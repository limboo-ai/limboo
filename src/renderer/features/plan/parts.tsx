/**
 * Shared plan pieces, used by BOTH surfaces the plan renders on:
 *
 *   • `plan/PlanInline` — inline rows in the conversation stream (live planning
 *     milestones, the ready proposal + approval, one settled line after that)
 *   • `activity/PlanPanel` — the Tasks drawer: the plan document + live progress,
 *     and the canonical execution surface once a plan is approved
 *
 * Extracted so the two can never drift on what "approve" means or how a plan's
 * status reads. Presentational + pure helpers only — no store subscriptions
 * beyond the toast used by the copy action, and no business logic.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PlanMeta, PlanStatus, SessionPermissionMode, SessionPlan } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { downloadText, slugify as slugifyText } from '@/renderer/lib/download';
import { outlineToJson, type PlanOutline } from '@/renderer/lib/planOutline';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';

export const STATUS_BADGE: Record<PlanStatus, { label: string; cls: string }> = {
  planning: { label: 'Planning', cls: 'text-accent' },
  'waiting-approval': { label: 'Waiting for approval', cls: 'text-accent' },
  // The window between "the approval committed" and "the agent was released".
  // Brief, but it must not render as an unlabelled gap.
  approved: { label: 'Approved — starting', cls: 'text-accent' },
  implementing: { label: 'Active execution', cls: 'text-warning' },
  completed: { label: 'Completed', cls: 'text-success' },
  // 'rejected' is a human verdict; 'archived' is everything else that ended a
  // plan (a failed run, a shutdown, a supersede). Distinct labels, because
  // conflating them is what made "the user said no" unreadable in the timeline.
  rejected: { label: 'Rejected', cls: 'text-faint' },
  archived: { label: 'Archived', cls: 'text-faint' },
  // @deprecated legacy row; normalized on read, kept so the map stays total.
  ready: { label: 'Waiting for approval', cls: 'text-accent' },
};

export const RISK_CLS: Record<NonNullable<PlanMeta['risk']>, string> = {
  low: 'text-success',
  medium: 'text-warning',
  high: 'text-danger',
};

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export interface PlanActions {
  copy: () => void;
  exportMarkdown: () => void;
  exportJson: () => void;
  print: () => void;
  togglePin: () => void;
}

/**
 * The plan's document-level actions. Takes the derived outline because the JSON
 * export describes the outline, not the raw Markdown.
 */
export function usePlanActions(
  sessionId: string | null,
  plan: SessionPlan,
  outline: PlanOutline,
): PlanActions {
  const addToast = useUIStore((s) => s.addToast);
  const setPlanPinned = useAgentStore((s) => s.setPlanPinned);
  return {
    copy: () => {
      void window.limboo?.system?.clipboardWrite(plan.markdown);
      addToast({ title: 'Plan copied', tone: 'success' });
    },
    exportMarkdown: () => downloadText(`${slugify(plan.title)}.md`, plan.markdown),
    exportJson: () => downloadText(`${slugify(plan.title)}.json`, outlineToJson(outline, plan.title)),
    print: () => printPlan(plan.title, plan.markdown),
    togglePin: () => {
      if (sessionId) setPlanPinned(sessionId, !plan.pinned);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Approval                                                            */
/* ------------------------------------------------------------------ */

/**
 * `busy` = the run that produced this plan is still tearing down. The plan is
 * published to the renderer from inside that run, so the controls appear a beat
 * before the session is actually idle; acting in that window used to fail with
 * "the agent is already working on this session".
 *
 * `variant` is presentation only — both surfaces run the same approve path, the
 * same secondary-confirm rule and the same busy guard, which is the entire
 * reason this component lives here rather than in each surface:
 *
 *   • `panel`  — the Tasks drawer: full-weight buttons sitting directly on the
 *                panel column. It carries NO container of its own — the row and
 *                its lead-in line are returned as a Fragment so the drawer's own
 *                `flex flex-col gap-3` spaces them like every other block.
 *   • `inline` — the conversation stream: borderless text controls that read as
 *                a continuation of the transcript, not a card docked in it.
 */
export function ApprovalControls({
  settings,
  busy = false,
  variant = 'panel',
  onApprove,
  onRegenerate,
  onReject,
  onArchive,
}: {
  settings: { requireSecondaryConfirm: boolean };
  busy?: boolean;
  variant?: 'panel' | 'inline';
  onApprove: (mode: SessionPermissionMode) => void;
  onRegenerate: () => void;
  onReject: () => void;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState<SessionPermissionMode | null>(null);

  // Drop a half-finished secondary confirmation if the session goes busy again,
  // so the next click can't fire an approval the user staged a run ago.
  useEffect(() => {
    if (busy) setConfirming(null);
  }, [busy]);

  const approve = (mode: SessionPermissionMode) => {
    if (busy) return;
    if (settings.requireSecondaryConfirm && confirming !== mode) {
      setConfirming(mode);
      return;
    }
    setConfirming(null);
    onApprove(mode);
  };

  const regenerate = () => {
    if (busy) return;
    onRegenerate();
  };

  // Reject and Archive are gated on `busy` like every other control. They used
  // not to be, which let a verdict land while the producing run was still
  // unwinding — main would then refuse it on the revision guard.
  const reject = () => {
    if (busy) return;
    onReject();
  };

  const archive = () => {
    if (busy) return;
    onArchive();
  };

  const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <button
          type="button"
          disabled={busy}
          onClick={() => approve('default')}
          className={cn('font-semibold text-accent transition-opacity hover:opacity-80', DISABLED)}
        >
          {confirming === 'default' ? 'Confirm — start now' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => approve('acceptEdits')}
          className={cn('text-accent transition-opacity hover:opacity-80', DISABLED)}
        >
          {confirming === 'acceptEdits' ? 'Confirm — accept edits' : 'Approve & accept edits'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={regenerate}
          className={cn('text-muted transition-colors hover:text-fg', DISABLED)}
        >
          Keep planning
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={reject}
          className={cn('text-faint transition-colors hover:text-danger', DISABLED)}
        >
          Reject
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={archive}
          className={cn('text-faint transition-colors hover:text-fg', DISABLED)}
        >
          Archive
        </button>
        {busy && <span className="text-faint">finishing the planning run…</span>}
      </div>
    );
  }

  return (
    <>
      <p className="text-[12px] text-muted">
        {busy
          ? 'Finishing the planning run — the controls unlock in a moment.'
          : 'Review the plan above. Approving exits Plan Mode and begins implementation against this outline — choose how much to review as it works.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => approve('default')}
          className={cn(
            'flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-base transition-opacity hover:opacity-90',
            DISABLED,
          )}
        >
          <CheckCircle2 size={13} />
          {confirming === 'default' ? 'Confirm — start now' : 'Approve & ask before edits'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => approve('acceptEdits')}
          className={cn(
            'rounded-md border border-accent/50 bg-accent/15 px-2.5 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/25',
            DISABLED,
          )}
        >
          {confirming === 'acceptEdits' ? 'Confirm — accept edits' : 'Approve & accept edits'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={regenerate}
          className={cn(
            'rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-elevated hover:text-fg',
            DISABLED,
          )}
        >
          Keep planning
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={archive}
          className={cn(
            'ml-auto rounded-md px-2.5 py-1.5 text-[12px] text-faint transition-colors hover:text-fg',
            DISABLED,
          )}
        >
          Archive
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={reject}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-[12px] text-faint transition-colors hover:text-danger',
            DISABLED,
          )}
        >
          Reject
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export function PlanMetaRow({ meta, highlightRisk }: { meta: PlanMeta; highlightRisk: boolean }) {
  const chips: Array<{ label: string; cls?: string }> = [];
  if (meta.taskCount) chips.push({ label: `${meta.taskCount} task${meta.taskCount === 1 ? '' : 's'}` });
  if (meta.affectedFiles)
    chips.push({ label: `~${meta.affectedFiles} file${meta.affectedFiles === 1 ? '' : 's'}` });
  if (meta.risk) chips.push({ label: `${meta.risk} risk`, cls: highlightRisk ? RISK_CLS[meta.risk] : undefined });
  if (meta.frameworks && meta.frameworks.length > 0)
    chips.push({ label: meta.frameworks.slice(0, 3).join(', ') });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className={cn(
            'rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium',
            c.cls ?? 'text-muted',
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Plan-flavoured {@link slugifyText} — same rule, `plan` as the fallback stem. */
export function slugify(s: string): string {
  return slugifyText(s, 'plan');
}

export { downloadText };

/**
 * Print just the plan via an offscreen iframe. A new BrowserWindow is denied by
 * the app's window-open handler, so we print the iframe's own document instead of
 * the whole shell. The raw Markdown is shown in a readable monospace block.
 */
export function printPlan(title: string, markdown: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  doc.open();
  doc.write(
    `<html><head><title>${esc(title)}</title><style>` +
      'body{font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:24px}' +
      'h1{font-size:18px;margin:0 0 12px}pre{white-space:pre-wrap;word-wrap:break-word;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace}' +
      `</style></head><body><h1>${esc(title)}</h1><pre>${esc(markdown)}</pre></body></html>`,
  );
  doc.close();
  const win = iframe.contentWindow;
  if (win) {
    win.focus();
    win.print();
  }
  // Give the print dialog time to read the document before tearing it down.
  window.setTimeout(() => iframe.remove(), 1000);
}
