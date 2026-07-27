/**
 * Shared plan pieces, used by BOTH surfaces the plan renders on:
 *
 *   • {@link PlanCard} — inline in the conversation stream (the primary view)
 *   • `activity/PlanPanel` — the Tasks drawer (the maximized view)
 *
 * Extracted so the two can never drift on what "approve" means or how a plan's
 * status reads. Presentational + pure helpers only — no store subscriptions
 * beyond the toast used by the copy action, and no business logic.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PlanMeta, PlanStatus, SessionPermissionMode, SessionPlan } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { outlineToJson, type PlanOutline } from '@/renderer/lib/planOutline';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';

export const STATUS_BADGE: Record<PlanStatus, { label: string; cls: string }> = {
  planning: { label: 'Planning', cls: 'text-accent' },
  ready: { label: 'Ready for approval', cls: 'text-accent' },
  implementing: { label: 'Active execution', cls: 'text-warning' },
  completed: { label: 'Completed', cls: 'text-success' },
  rejected: { label: 'Rejected', cls: 'text-faint' },
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

export function ApprovalControls({
  settings,
  onApprove,
  onRegenerate,
  onReject,
}: {
  settings: { requireSecondaryConfirm: boolean };
  onApprove: (mode: SessionPermissionMode) => void;
  onRegenerate: () => void;
  onReject: () => void;
}) {
  const [confirming, setConfirming] = useState<SessionPermissionMode | null>(null);

  const approve = (mode: SessionPermissionMode) => {
    if (settings.requireSecondaryConfirm && confirming !== mode) {
      setConfirming(mode);
      return;
    }
    setConfirming(null);
    onApprove(mode);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5">
      <p className="text-[12px] text-muted">
        Review the plan above. Approving exits Plan Mode and begins implementation against this
        outline — choose how much to review as it works.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => approve('default')}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-base transition-opacity hover:opacity-90"
        >
          <CheckCircle2 size={13} />
          {confirming === 'default' ? 'Confirm — start now' : 'Approve & ask before edits'}
        </button>
        <button
          type="button"
          onClick={() => approve('acceptEdits')}
          className="rounded-md border border-accent/50 bg-accent/15 px-2.5 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/25"
        >
          {confirming === 'acceptEdits' ? 'Confirm — accept edits' : 'Approve & accept edits'}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          Keep planning
        </button>
        <button
          type="button"
          onClick={onReject}
          className="ml-auto rounded-md px-2.5 py-1.5 text-[12px] text-faint transition-colors hover:text-danger"
        >
          Reject
        </button>
      </div>
    </div>
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

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'plan'
  );
}

/** Trigger a client-side file download for the given text (no fs / IPC needed). */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
