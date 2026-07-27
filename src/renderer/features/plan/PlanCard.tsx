/**
 * The plan, inline in the conversation stream.
 *
 * Plan Mode's output used to live only in the ~320px Tasks drawer, so the stream
 * — where the work is actually happening — showed nothing but a one-line marker
 * and a banner pointing elsewhere. This is the primary surface now: the plan
 * renders as prose at the transcript's full measure, with its document actions
 * on the card itself.
 *
 * The body goes through the shared {@link Markdown} renderer (the same one
 * assistant messages use), so a plan reads as text rather than as Markdown
 * source; the raw view is the opt-in behind the toolbar toggle, not the default.
 *
 * "Maximize" hands off to the drawer's `PlanPanel`, which owns the things that
 * need vertical room and a persistent home — the live task outline, revision
 * history, search/filter. The two share `./parts` so approval and status can
 * never drift between them.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
} from 'lucide-react';
import type { SessionPlan, TaskItem } from '@shared/types';
import { IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { applyRuntime, parsePlanOutline } from '@/renderer/lib/planOutline';
import { RUNNING_PHASES } from '@/renderer/features/sessions/useSessionRunning';
import { Markdown } from '@/renderer/features/workspace/Markdown';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { ApprovalControls, PlanMetaRow, STATUS_BADGE, usePlanActions } from './parts';

/**
 * Statuses at which the inline card renders nothing.
 *
 * `planning` — there is no plan yet. The card used to appear the moment a plan
 * run started, showing a title, a "Planning" badge and an "Analyzing the
 * repository…" row: a fixed block above the composer restating what the live
 * status row and the activity timeline already say, while pushing the analysis
 * the agent is actually streaming further up the transcript. The card exists to
 * present a proposal for approval, so it now arrives WITH that proposal — at
 * `ready` — and not before.
 *
 * `completed`/`rejected` — the plan is over. A plan row is never deleted
 * (`rejectPlan` and the implement-run completion only rewrite `status`, and
 * `getSnapshot` rehydrates it on every boot), so gating on `plan != null` alone
 * left a dead card pinned above the composer for the life of the session. The
 * card belongs to work in progress; the finished plan stays reachable in the
 * Tasks drawer.
 *
 * That leaves `ready` (the approval surface) and `implementing` (self-folding,
 * so the run has the room) as the only states with a card.
 */
const HIDDEN = new Set<SessionPlan['status']>(['planning', 'completed', 'rejected']);

export function PlanCard({ sessionId }: { sessionId: string }) {
  const plan = useAgentStore((s) => s.bySession[sessionId]?.plan) ?? null;
  if (!plan || HIDDEN.has(plan.status)) return null;
  return <PlanCardBody sessionId={sessionId} plan={plan} />;
}

function PlanCardBody({ sessionId, plan }: { sessionId: string; plan: SessionPlan }) {
  const settings = useSettingsStore((s) => s.settings.agent.plan);
  const tasks = useAgentStore((s) => s.bySession[sessionId]?.tasks) ?? EMPTY_TASKS;
  const approvePlan = useAgentStore((s) => s.approvePlan);
  const rejectPlan = useAgentStore((s) => s.rejectPlan);
  const regeneratePlan = useAgentStore((s) => s.regeneratePlan);

  // Run signals, matching PlanPanel — the outline overlay needs the same inputs.
  const awaitingPermission = useAgentStore((s) => !!s.pendingBySession[sessionId]);
  const request = useAgentStore((s) => s.requestsBySession[sessionId]);
  const running = !!request && RUNNING_PHASES.has(request.phase);
  const failed = request?.outcome === 'failed' || request?.outcome === 'tool-rejected';

  const [raw, setRaw] = useState(false);
  const [open, setOpen] = useState(true);

  // Once implementation starts the live outline in the drawer is what matters,
  // so the proposal folds itself away rather than pushing the run off-screen.
  useEffect(() => {
    if (plan.status === 'implementing') setOpen(false);
  }, [plan.status]);

  const outline = useMemo(() => {
    const parsed = parsePlanOutline(plan.markdown);
    return applyRuntime(parsed, { tasks, awaitingPermission, failed, running });
  }, [plan.markdown, tasks, awaitingPermission, failed, running]);

  const actions = usePlanActions(sessionId, plan, outline);

  const ready = plan.status === 'ready';
  const badge = STATUS_BADGE[plan.status];

  // Live tally straight off the streamed todos, falling back to the outline
  // before any have arrived (PlanPanel's rule — the fuzzy match can miss).
  const progress = useMemo(() => {
    let completed = 0;
    let active = 0;
    for (const t of tasks) {
      if (t.done || t.status === 'completed') completed += 1;
      else if (t.status === 'in_progress') active += 1;
    }
    return tasks.length > 0
      ? { completed, active, total: tasks.length }
      : { completed: outline.completed, active: 0, total: outline.taskCount };
  }, [tasks, outline]);

  const showBody = open && !!plan.markdown && settings.showReasoning;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-2/50 animate-fade-in">
      {/* Header — title + status on the left, document actions on the right. */}
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-1.5 rounded text-left transition-colors hover:opacity-80"
        >
          {open ? (
            <ChevronDown size={13} className="mt-0.5 shrink-0 text-faint" />
          ) : (
            <ChevronRight size={13} className="mt-0.5 shrink-0 text-faint" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-fg" title={plan.title}>
              {plan.pinned && <Pin size={11} className="shrink-0 text-accent" />}
              {plan.title}
            </span>
            <span className={cn('text-[11px] font-medium', badge.cls)}>
              {progress.active > 0 && <Loader2 size={10} className="mr-1 inline animate-spin" />}
              {badge.label}
              {progress.total > 0 && ` · ${progress.completed}/${progress.total}`}
              {progress.active > 0 && <span className="ml-1 text-accent">· {progress.active} running</span>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton size="sm" label="Copy plan as Markdown" onClick={actions.copy}>
            <Copy size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label={raw ? 'Show rendered plan' : 'View as Markdown'}
            active={raw}
            onClick={() => setRaw((v) => !v)}
          >
            <Code2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label={plan.pinned ? 'Unpin plan' : 'Pin plan'}
            active={plan.pinned}
            onClick={actions.togglePin}
          >
            {plan.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </IconButton>
          <IconButton size="sm" label="Collapse plan" onClick={() => setOpen(false)}>
            <Minimize2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Open the full plan panel"
            onClick={() => useLayoutStore.getState().setActiveTab('tasks')}
          >
            <Maximize2 size={13} />
          </IconButton>
        </div>
      </div>

      {settings.showEstimates && open && (
        <div className="px-3">
          <PlanMetaRow meta={plan.meta} highlightRisk={settings.highlightRisk} />
        </div>
      )}

      {showBody &&
        (raw ? (
          <pre className="mx-3 max-h-[60vh] overflow-auto rounded-md border border-line bg-base px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            {plan.markdown}
          </pre>
        ) : (
          <div className="border-t border-line px-3 py-2">
            <Markdown text={plan.markdown} streaming={running} />
          </div>
        ))}

      {ready && (
        <div className="px-3 pb-3">
          <ApprovalControls
            settings={settings}
            busy={running}
            onApprove={(mode) => approvePlan(sessionId, mode)}
            onRegenerate={() => regeneratePlan(sessionId)}
            onReject={() => rejectPlan(sessionId)}
          />
        </div>
      )}

      {/* Keep a bottom edge when nothing below the header rendered. */}
      {!ready && !showBody && <div className="pb-1" />}
    </div>
  );
}

const EMPTY_TASKS: TaskItem[] = [];
