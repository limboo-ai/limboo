/**
 * The plan, inline in the conversation stream — as a ROW, not a card.
 *
 * This surface used to be a bordered card carrying the whole plan document: the
 * title, the metadata chips, the full rendered Markdown and the approval block,
 * pinned above the composer for the life of the session. It restated, at panel
 * weight, everything the Tasks drawer already owns, and while the agent was
 * still planning it pushed the analysis it was actually streaming off-screen.
 *
 * So the division of labour is now explicit:
 *
 *   • **The stream** says what is happening — live planning milestones while the
 *     agent reads, a one-line proposal summary with the approval controls when a
 *     plan is ready, and a single settled line once execution starts.
 *   • **The Tasks panel** is the document — the Implementation plan and Live
 *     progress. It is the canonical execution surface after approval.
 *
 * Everything here renders at the same typographic weight as `InlineMarkerRow` /
 * `LiveStatusRow` in the conversation, so a plan reads as part of the timeline.
 * Approval still goes through the shared {@link ApprovalControls} (inline
 * variant), so the two surfaces can never disagree about what "approve" means.
 */
import { useMemo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { AgentToolCall, SessionPlan, TaskItem } from '@shared/types';
import { HelixLoader } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { RUNNING_PHASES } from '@/renderer/features/sessions/useSessionRunning';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { ApprovalControls } from './parts';
import { currentMilestone, planMilestones } from './milestones';

export function PlanInline({ sessionId }: { sessionId: string }) {
  const plan = useAgentStore((s) => s.bySession[sessionId]?.plan) ?? null;
  if (!plan) return null;
  return <PlanRow sessionId={sessionId} plan={plan} />;
}

function PlanRow({ sessionId, plan }: { sessionId: string; plan: SessionPlan }) {
  const settings = useSettingsStore((s) => s.settings.agent.plan);
  const tasks = useAgentStore((s) => s.bySession[sessionId]?.tasks) ?? EMPTY_TASKS;
  const toolCalls = useAgentStore((s) => s.bySession[sessionId]?.toolCalls) ?? EMPTY_CALLS;
  const approvePlan = useAgentStore((s) => s.approvePlan);
  const rejectPlan = useAgentStore((s) => s.rejectPlan);
  const regeneratePlan = useAgentStore((s) => s.regeneratePlan);

  const request = useAgentStore((s) => s.requestsBySession[sessionId]);
  const running = !!request && RUNNING_PHASES.has(request.phase);

  const progress = useMemo(() => {
    let completed = 0;
    for (const t of tasks) if (t.done || t.status === 'completed') completed += 1;
    return { completed, total: tasks.length };
  }, [tasks]);

  const openPanel = () => useLayoutStore.getState().setActiveTab('tasks');

  /* ---- planning: live milestones ---- */
  if (plan.status === 'planning') {
    return <LivePlanningProgress plan={plan} calls={toolCalls} />;
  }

  /* ---- ready: the proposal + approval, on one line ---- */
  if (plan.status === 'ready') {
    return (
      <div className="flex flex-col gap-1.5 animate-fade-in">
        <div className="flex min-w-0 items-baseline gap-2 text-[12px]">
          <span className="shrink-0 font-medium text-accent">Plan ready</span>
          <button
            type="button"
            onClick={openPanel}
            className="min-w-0 flex-1 truncate text-left text-fg transition-colors hover:text-accent"
            title={plan.title}
          >
            {plan.title}
          </button>
          {settings.showEstimates && <PlanSummary plan={plan} />}
          <button
            type="button"
            onClick={openPanel}
            className="flex shrink-0 items-center gap-0.5 text-[11px] text-faint transition-colors hover:text-accent"
          >
            Open plan
            <ChevronRight size={11} />
          </button>
        </div>
        <ApprovalControls
          settings={settings}
          busy={running}
          variant="inline"
          onApprove={(mode) => approvePlan(sessionId, mode)}
          onRegenerate={() => regeneratePlan(sessionId)}
          onReject={() => rejectPlan(sessionId)}
        />
      </div>
    );
  }

  /* ---- implementing / completed / rejected: one settled line ---- */
  const label =
    plan.status === 'implementing'
      ? progress.total > 0
        ? `Plan approved · ${progress.completed}/${progress.total} tasks`
        : 'Plan approved — implementing'
      : plan.status === 'completed'
        ? progress.total > 0
          ? `Plan complete · ${progress.total} task${progress.total === 1 ? '' : 's'}`
          : 'Plan complete'
        : 'Plan rejected';

  return (
    <button
      type="button"
      onClick={openPanel}
      className="flex items-center gap-2 px-1 text-left text-[11.5px] text-faint transition-colors hover:text-muted animate-fade-in"
    >
      {plan.status === 'implementing' && running ? (
        <HelixLoader size={12} label={label} />
      ) : plan.status === 'completed' ? (
        <Check size={12} className="shrink-0 text-success" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Live Planning Progress — the streaming half of Plan Mode, in the stream.
 *
 * Milestones are derived from the run's own tool calls (see `./milestones`), so
 * this needs no new event kind and behaves identically under Claude and Cursor.
 * Settled steps collapse to faint checked lines; the leading step carries the
 * same {@link HelixLoader} the generating indicator uses.
 */
function LivePlanningProgress({ plan, calls }: { plan: SessionPlan; calls: AgentToolCall[] }) {
  const milestones = useMemo(
    () => planMilestones(calls, plan.status, plan.createdAt),
    [calls, plan.status, plan.createdAt],
  );
  const current = currentMilestone(milestones);

  return (
    <div className="flex flex-col gap-1 animate-fade-in" aria-live="polite">
      {milestones.map((m) => (
        <div
          key={m.id}
          className={cn(
            'flex items-center gap-2 px-1 text-[12px]',
            m.state === 'active' ? 'text-muted' : 'text-faint',
          )}
        >
          {m.state === 'active' ? (
            <HelixLoader size={14} label={m.label} />
          ) : m.state === 'done' ? (
            <Check size={12} className="shrink-0 text-success" />
          ) : (
            <span className="ml-[1px] h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
          )}
          <span className={cn('truncate', m.state === 'done' && 'opacity-80')}>{m.label}</span>
        </div>
      ))}
      <span className="sr-only">{current?.label}</span>
    </div>
  );
}

/** Compact metadata for the ready line — the chips the card used to show, as text. */
function PlanSummary({ plan }: { plan: SessionPlan }) {
  const bits: string[] = [];
  if (plan.meta.taskCount) bits.push(`${plan.meta.taskCount} task${plan.meta.taskCount === 1 ? '' : 's'}`);
  if (plan.meta.affectedFiles)
    bits.push(`~${plan.meta.affectedFiles} file${plan.meta.affectedFiles === 1 ? '' : 's'}`);
  if (plan.meta.risk) bits.push(`${plan.meta.risk} risk`);
  if (bits.length === 0) return null;
  return <span className="shrink-0 text-[11px] text-faint">{bits.join(' · ')}</span>;
}

const EMPTY_TASKS: TaskItem[] = [];
const EMPTY_CALLS: AgentToolCall[] = [];
