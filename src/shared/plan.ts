/**
 * The Plan Mode state machine — the single answer for main AND the renderer.
 *
 * Plan Mode is provider-neutral: Claude drives it through the `ExitPlanMode`
 * tool, Cursor through `--mode plan`'s terminal result text. Both express the
 * same lifecycle, so the lifecycle lives here rather than in either adapter.
 *
 * Two facts shape everything below.
 *
 * 1. **A plan is ONE row per session** (`agent_plans`, PK = `session_id`), not a
 *    list of chat messages. Refinements replace the visible plan and push the
 *    previous text into `plan_revisions`. `rev` makes that replacement safe
 *    against a stale renderer: every mutating IPC carries the rev it believes
 *    it is acting on, and main refuses a mismatch rather than clobbering.
 *
 * 2. **Approval blocks execution.** `waiting-approval` and `approved` are
 *    BLOCKING states — while a session sits in one, main refuses new runs and
 *    denies every tool. That refusal lives in main (see `AgentManager.send` and
 *    `decideToolUse`); the renderer only mirrors it. See {@link isPlanBlocking}.
 */

import type { PlanApprovalPath, PlanDecisionKind, PlanStatus } from './types';

export type { PlanApprovalPath, PlanDecisionKind };

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export const PLAN_DECISION_KINDS: readonly PlanDecisionKind[] = [
  'approve',
  'keep-planning',
  'reject',
  'archive',
  'edit',
];

export function isPlanDecisionKind(value: unknown): value is PlanDecisionKind {
  return typeof value === 'string' && (PLAN_DECISION_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Status predicates                                                   */
/* ------------------------------------------------------------------ */

/**
 * The plan is waiting on a human and execution must be refused.
 *
 * `approved` is included deliberately: it is the window between "the approval
 * transaction committed" and "the agent was released". A crash in that window
 * must not leave a session that quietly accepts prompts.
 */
export function isPlanBlocking(status: PlanStatus | undefined | null): boolean {
  return status === 'waiting-approval' || status === 'approved';
}

/** The plan is being executed (or about to be) — used to derive Cursor's `--force`. */
export function isPlanImplementing(status: PlanStatus | undefined | null): boolean {
  return status === 'approved' || status === 'implementing';
}

/** The plan is live in some form: still forming, awaiting a decision, or running. */
export function isPlanActive(status: PlanStatus | undefined | null): boolean {
  return status === 'planning' || isPlanBlocking(status) || status === 'implementing';
}

/** Nothing further will happen to this plan on its own. */
export function isPlanSettled(status: PlanStatus | undefined | null): boolean {
  return status === 'completed' || status === 'rejected' || status === 'archived';
}

/**
 * Coerce a persisted status into the current vocabulary.
 *
 * `'ready'` is the pre-state-machine name for `'waiting-approval'`. It stays in
 * the {@link PlanStatus} union so existing rows keep type-checking, but running
 * every read through here means it is never WRITTEN again — the migration
 * rewrites rows in place, and this covers anything the migration missed.
 */
export function normalizePlanStatus(raw: unknown): PlanStatus {
  if (raw === 'ready') return 'waiting-approval';
  if (typeof raw === 'string' && (PLAN_STATUSES as readonly string[]).includes(raw)) {
    return raw as PlanStatus;
  }
  // An unrecognized status is a corrupt or downgraded row. Archive is the safe
  // reading: it is terminal, so it can never gate the composer forever, and it
  // is honest — we genuinely do not know what this plan was doing.
  return 'archived';
}

export const PLAN_STATUSES: readonly PlanStatus[] = [
  'planning',
  'waiting-approval',
  'approved',
  'implementing',
  'completed',
  'rejected',
  'archived',
  'ready',
];

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Legal transitions. Enforced in `AgentManager.transitionPlan`, which is the
 * only writer of `agent_plans`.
 *
 * Note `waiting-approval -> waiting-approval`: after `keep-planning` the agent
 * revises and calls `ExitPlanMode` again, which re-captures at `rev + 1`. That
 * is a real transition, not a no-op, because the markdown changes.
 */
export const PLAN_TRANSITIONS: Readonly<Record<PlanStatus, readonly PlanStatus[]>> = {
  planning: ['waiting-approval', 'rejected', 'archived'],
  'waiting-approval': ['approved', 'planning', 'waiting-approval', 'rejected', 'archived'],
  approved: ['implementing', 'waiting-approval', 'archived'],
  implementing: ['completed', 'waiting-approval', 'archived'],
  completed: ['archived'],
  rejected: ['archived'],
  archived: [],
  // Legacy rows are normalized on read, so this entry exists only so the record
  // is total; nothing should ever transition FROM 'ready'.
  ready: ['approved', 'planning', 'waiting-approval', 'rejected', 'archived'],
};

export function canTransitionPlan(from: PlanStatus, to: PlanStatus): boolean {
  // A self-transition is a metadata update — pinning, or replacing the markdown
  // with the provider's authoritative copy — not a lifecycle change. Always
  // legal, so callers that only want to patch a field do not have to pretend to
  // move the plan somewhere.
  if (from === to) return true;
  return (PLAN_TRANSITIONS[from] ?? []).includes(to);
}

/** Throws when a transition is not legal. Called inside the write transaction. */
export function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if (!canTransitionPlan(from, to)) {
    throw new Error(`Illegal plan transition: ${from} -> ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** Short label for a status. Used by the stream row, the panel and the graph. */
export const PLAN_STATUS_LABEL: Readonly<Record<PlanStatus, string>> = {
  planning: 'Planning',
  'waiting-approval': 'Waiting for approval',
  approved: 'Approved',
  implementing: 'Implementing',
  completed: 'Completed',
  rejected: 'Rejected',
  archived: 'Archived',
  ready: 'Waiting for approval',
};
