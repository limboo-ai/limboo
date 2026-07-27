/**
 * Plan panel — the Task tab's canonical view of Plan Mode, and the single source
 * of truth for execution once a plan is approved. It carries exactly two
 * sections:
 *
 *   • **Implementation plan** — the plan document itself (rendered Markdown, or
 *     raw behind the toolbar toggle).
 *   • **Live progress** — the agent's streamed TodoWrite checklist, ticking
 *     through pending → active → completed while the run executes.
 *
 * There used to be a third: a derived phase/task outline parsed out of the plan
 * Markdown and fuzzy-matched against the live todos. It restated the plan the
 * section above it already showed, and the match was lossy enough that "Live
 * progress" had to exist as its fallback — two lists of the same work, disagreeing.
 * The outline is gone; the checklist is no longer a fallback but the section, and
 * the toolbar's search/filter operate on it.
 *
 * Everything is driven by the active session's agent snapshot; no mock data.
 * Theme tokens only, and one loader — {@link HelixLoader}, the same indicator the
 * conversation stream uses while the agent works.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  Copy,
  FileDown,
  FileText,
  Filter,
  History,
  Pin,
  PinOff,
  Printer,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import type { PlanRevision, SessionPlan, TaskItem } from '@shared/types';
import { EmptyState, HelixLoader, IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { applyRuntime, parsePlanOutline, type TaskExecStatus } from '@/renderer/lib/planOutline';
import { RUNNING_PHASES } from '@/renderer/features/sessions/useSessionRunning';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { Markdown } from '@/renderer/features/workspace/Markdown';
import {
  ApprovalControls,
  PlanMetaRow,
  STATUS_BADGE,
  usePlanActions,
} from '@/renderer/features/plan/parts';

type TaskFilter = 'all' | 'pending' | 'done';

export function PlanPanel() {
  const sessionId = useSessionStore((s) => s.selectedId);
  const plan = useAgentStore((s) => (sessionId ? s.bySession[sessionId]?.plan : null)) ?? null;
  const tasks = useAgentStore((s) => (sessionId ? s.bySession[sessionId]?.tasks : undefined)) ?? [];

  // No plan and no checklist yet → the genuine empty state.
  if (!plan && tasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={ClipboardList}
        title="No plan yet"
        description="Switch the composer to Plan and describe what to build. The agent analyzes the repository and proposes a reviewable strategy here before changing anything."
      />
    );
  }

  // A checklist with no plan (a direct execution run using TodoWrite).
  if (!plan) {
    return (
      <div className="flex flex-col gap-3">
        <LiveProgress sessionId={sessionId} tasks={tasks} />
      </div>
    );
  }

  return <PlanView sessionId={sessionId} plan={plan} tasks={tasks} />;
}

function PlanView({
  sessionId,
  plan,
  tasks,
}: {
  sessionId: string | null;
  plan: SessionPlan;
  tasks: TaskItem[];
}) {
  const settings = useSettingsStore((s) => s.settings.agent.plan);
  const approvePlan = useAgentStore((s) => s.approvePlan);
  const rejectPlan = useAgentStore((s) => s.rejectPlan);
  const regeneratePlan = useAgentStore((s) => s.regeneratePlan);

  // Run signals used to derive live per-task execution states.
  const awaitingPermission = useAgentStore((s) => (sessionId ? !!s.pendingBySession[sessionId] : false));
  const request = useAgentStore((s) => (sessionId ? s.requestsBySession[sessionId] : undefined));
  const running = !!request && RUNNING_PHASES.has(request.phase);
  const failed = request?.outcome === 'failed' || request?.outcome === 'tool-rejected';

  const [raw, setRaw] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Collapse the plan body automatically once implementation starts so live
  // progress is what the eye lands on.
  useEffect(() => {
    if (plan.status === 'implementing') setBodyOpen(false);
  }, [plan.status]);

  const planning = plan.status === 'planning';
  const ready = plan.status === 'ready';
  const badge = STATUS_BADGE[plan.status];

  // The outline is no longer rendered, but it still backs the JSON export and
  // the pre-todo tally (the plan's own bullet count before any todo streams).
  const outline = useMemo(() => {
    const parsed = parsePlanOutline(plan.markdown);
    return applyRuntime(parsed, { tasks, awaitingPermission, failed, running });
  }, [plan.markdown, tasks, awaitingPermission, failed, running]);

  // Real-time headline tally, computed straight from the live TodoWrite list so it
  // advances even when no plan bullets were parsed. Falls back to the outline only
  // when no todos have streamed.
  const live = useMemo(() => {
    let completed = 0;
    let active = 0;
    for (const t of tasks) {
      if (t.done || t.status === 'completed') completed += 1;
      else if (t.status === 'in_progress') active += 1;
    }
    return { completed, active, total: tasks.length };
  }, [tasks]);
  const progress =
    live.total > 0
      ? { completed: live.completed, total: live.total, active: live.active }
      : { completed: outline.completed, total: outline.taskCount, active: 0 };
  const hasProgress = progress.total > 0;

  const { copy, exportMarkdown, exportJson, print, togglePin } = usePlanActions(
    sessionId,
    plan,
    outline,
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header + toolbar */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-fg" title={plan.title}>
            {plan.pinned && <Pin size={11} className="shrink-0 text-accent" />}
            {plan.title}
          </p>
          <span className={cn('flex items-center gap-1 text-[11px] font-medium', badge.cls)}>
            {(planning || progress.active > 0) && <HelixLoader size={12} label={badge.label} />}
            {badge.label}
            {hasProgress && ` · ${progress.completed}/${progress.total}`}
            {progress.active > 0 && (
              <span className="ml-1 text-accent">· {progress.active} running</span>
            )}
          </span>
        </div>
        {!planning && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
            <IconButton size="sm" label="Copy plan as Markdown" onClick={copy}>
              <Copy size={13} />
            </IconButton>
            <IconButton size="sm" label="Export as Markdown" onClick={exportMarkdown}>
              <FileText size={13} />
            </IconButton>
            <IconButton size="sm" label="Export outline as JSON" onClick={exportJson}>
              <FileDown size={13} />
            </IconButton>
            <IconButton size="sm" label="Print plan" onClick={print}>
              <Printer size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label="Search live progress"
              active={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label={`Filter: ${filter}`}
              active={filter !== 'all'}
              onClick={() => setFilter((f) => (f === 'all' ? 'pending' : f === 'pending' ? 'done' : 'all'))}
            >
              <Filter size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label={raw ? 'Show rendered plan' : 'Show raw Markdown'}
              active={raw}
              onClick={() => setRaw((v) => !v)}
            >
              <Code2 size={13} />
            </IconButton>
            <IconButton size="sm" label={plan.pinned ? 'Unpin plan' : 'Pin plan'} active={plan.pinned} onClick={togglePin}>
              {plan.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </IconButton>
            <IconButton size="sm" label="History" active={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
              <History size={13} />
            </IconButton>
            <IconButton size="sm" label="Regenerate plan" onClick={() => sessionId && regeneratePlan(sessionId)}>
              <RefreshCw size={13} />
            </IconButton>
          </div>
        )}
      </div>

      {searchOpen && (
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter live progress…"
          className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
      )}

      {/* Metadata */}
      {settings.showEstimates && !planning && (
        <PlanMetaRow meta={plan.meta} highlightRisk={settings.highlightRisk} />
      )}

      {/* Planning placeholder */}
      {planning && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-muted">
          <HelixLoader size={14} label="Analyzing the repository" />
          Analyzing the repository — reading files and dependencies (read-only)…
        </div>
      )}

      {/* Implementation plan */}
      {!planning && plan.markdown && settings.showReasoning && (
        <div className="rounded-md border border-line bg-surface-2/50">
          <button
            type="button"
            onClick={() => setBodyOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint transition-colors hover:text-muted"
          >
            {bodyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Implementation plan
          </button>
          {bodyOpen &&
            (raw ? (
              <pre className="max-h-[40vh] overflow-auto border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                {plan.markdown}
              </pre>
            ) : (
              <div className="border-t border-line px-3 py-2 text-[12.5px]">
                <Markdown text={plan.markdown} />
              </div>
            ))}
        </div>
      )}

      {/* Approval controls */}
      {ready && (
        <ApprovalControls
          settings={settings}
          busy={running}
          onApprove={(mode) => sessionId && approvePlan(sessionId, mode)}
          onRegenerate={() => sessionId && regeneratePlan(sessionId)}
          onReject={() => sessionId && rejectPlan(sessionId)}
        />
      )}

      {/* Live progress */}
      <LiveProgress sessionId={sessionId} tasks={tasks} search={search} filter={filter} />

      {/* Revision history */}
      {historyOpen && sessionId && <HistorySection sessionId={sessionId} plan={plan} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live progress                                                       */
/* ------------------------------------------------------------------ */

/**
 * The agent's streamed checklist — the live half of the panel. Renders whenever
 * todos exist, in every plan status, so execution is never invisible. Search and
 * filter come from the toolbar above; the checkpoint footer is opt-in via
 * `agent.plan.showCheckpointsOnTasks` and links to the point in the Git panel
 * where a run can actually be rolled back.
 */
function LiveProgress({
  sessionId,
  tasks,
  search = '',
  filter = 'all',
}: {
  sessionId: string | null;
  tasks: TaskItem[];
  search?: string;
  filter?: TaskFilter;
}) {
  const showCheckpoints = useSettingsStore((s) => s.settings.agent.plan.showCheckpointsOnTasks);
  const checkpoints = useGitStore((s) => s.checkpoints);
  const mine = useMemo(
    () => (sessionId ? checkpoints.filter((c) => c.sessionId === sessionId).length : 0),
    [checkpoints, sessionId],
  );

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        const status = t.status ?? (t.done ? 'completed' : 'pending');
        const done = status === 'completed' || t.done;
        if (filter === 'pending' && done) return false;
        if (filter === 'done' && !done) return false;
        if (q && !t.label.toLowerCase().includes(q)) return false;
        return true;
      }),
    [tasks, filter, q],
  );

  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.done || t.status === 'completed').length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-faint">
        <span>Live progress</span>
        <span>
          {done}/{tasks.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-faint">No tasks match the current filter.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {visible.map((task) => {
            const status = task.status ?? (task.done ? 'completed' : 'pending');
            return (
              <li key={task.id} className="flex items-start gap-2 rounded-md px-1 py-1">
                <ExecMark status={status === 'in_progress' ? 'active' : status} />
                <span
                  className={cn(
                    'text-[12px] leading-snug',
                    status === 'completed' && 'text-faint line-through',
                    status === 'in_progress' && 'text-fg',
                    status === 'pending' && 'text-muted',
                  )}
                >
                  {task.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {showCheckpoints && mine > 0 && (
        <button
          type="button"
          onClick={() => useLayoutStore.getState().setActiveTab('git')}
          className="self-start px-1 text-[10.5px] text-faint transition-colors hover:text-accent"
        >
          {mine} checkpoint{mine === 1 ? '' : 's'} captured — review or roll back
        </button>
      )}
    </div>
  );
}

function ExecMark({ status }: { status: TaskExecStatus }) {
  if (status === 'active' || status === 'waiting') {
    return (
      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <HelixLoader size={12} label="Running" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-danger">
        <TriangleAlert size={12} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
        status === 'completed'
          ? 'border-success bg-success/20 text-success'
          : 'border-line-strong text-transparent',
      )}
    >
      <CheckCircle2 size={10} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Revision history                                                    */
/* ------------------------------------------------------------------ */

function HistorySection({ sessionId, plan }: { sessionId: string; plan: SessionPlan }) {
  const listPlanRevisions = useAgentStore((s) => s.listPlanRevisions);
  const restorePlanRevision = useAgentStore((s) => s.restorePlanRevision);
  const [revisions, setRevisions] = useState<PlanRevision[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);

  // Reload whenever the current plan changes (a new revision may have landed).
  useEffect(() => {
    let alive = true;
    void listPlanRevisions(sessionId).then((r) => {
      if (alive) setRevisions(r);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, listPlanRevisions, plan.markdown]);

  if (revisions.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-[11.5px] text-faint">
        No earlier revisions yet. Regenerating the plan keeps the previous version here for
        comparison.
      </div>
    );
  }

  const compare = compareId ? revisions.find((r) => r.id === compareId) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">Plan history</div>
      <ul className="flex flex-col gap-1">
        {revisions.map((rev) => {
          const diff = diffLines(plan.markdown, rev.markdown);
          return (
            <li key={rev.id} className="rounded-md border border-line bg-surface-2/40 px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  r{rev.rev}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={rev.title}>
                  {rev.title}
                </span>
                <span className="shrink-0 text-[10px] text-faint">
                  <span className="text-success">+{diff.added}</span>{' '}
                  <span className="text-danger">-{diff.removed}</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setCompareId((c) => (c === rev.id ? null : rev.id))}
                  className="text-accent hover:underline"
                >
                  {compareId === rev.id ? 'Hide' : 'Compare'}
                </button>
                <button
                  type="button"
                  onClick={() => restorePlanRevision(sessionId, rev.id)}
                  className="text-muted hover:text-fg"
                >
                  Restore
                </button>
                <span className="ml-auto text-faint">{formatTime(rev.createdAt)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {compare && (
        <pre className="max-h-[40vh] overflow-auto rounded-md border border-line bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
          {compare.markdown}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Naive line set-diff for a compact +added / -removed history summary. */
function diffLines(current: string, revision: string): { added: number; removed: number } {
  const cur = new Set(current.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const rev = new Set(revision.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  let added = 0;
  let removed = 0;
  for (const l of cur) if (!rev.has(l)) added += 1;
  for (const l of rev) if (!cur.has(l)) removed += 1;
  return { added, removed };
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
