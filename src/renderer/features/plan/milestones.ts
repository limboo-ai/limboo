/**
 * Live planning milestones — derived, never streamed.
 *
 * While a plan run is in flight the conversation should say what the agent is
 * actually doing ("reading the repository", "indexing symbols", …) rather than
 * showing a generic spinner. Neither provider emits milestone events, but both
 * emit tool calls, and the Cursor adapter already normalizes its tool union onto
 * Claude-shaped names (`cursor/translate.ts`) — so mapping tool names onto
 * stages gives the same milestones for both agents with **no main-process
 * change and no new event kind**.
 *
 * Pure function over the session snapshot: no store access, no clock, no IPC.
 */
import type { AgentToolCall, PlanStatus } from '@shared/types';
import { SUBAGENT_TOOL_NAMES } from '@shared/subagents';

export type MilestoneState = 'pending' | 'active' | 'done';

export interface PlanMilestone {
  id: string;
  label: string;
  state: MilestoneState;
}

/**
 * The planning stages, in the order they naturally occur. `reached` decides
 * whether a tool call counts as evidence the stage happened; a stage is `done`
 * once any later stage has been reached.
 */
const STAGES: ReadonlyArray<{ id: string; label: string; tools: ReadonlySet<string> }> = [
  {
    id: 'analyze',
    label: 'Analyzing the repository',
    tools: new Set(['Read', 'Glob', 'LS', 'NotebookRead']),
  },
  {
    id: 'search',
    label: 'Searching the codebase',
    tools: new Set(['Grep', 'search_project', 'find_files']),
  },
  {
    id: 'symbols',
    label: 'Indexing symbols and dependencies',
    tools: new Set(['find_symbols']),
  },
  {
    id: 'research',
    label: 'Researching external references',
    tools: new Set(['WebSearch', 'WebFetch']),
  },
  {
    id: 'memory',
    label: 'Recalling project memory',
    tools: new Set(['recall_memory', 'search_memory', 'list_memories']),
  },
  {
    id: 'decompose',
    label: 'Decomposing the requirements',
    // Both spellings of the subagent tool — see `@shared/subagents`. Listing
    // only `Task` meant a delegating plan run on a current SDK never lit this
    // milestone.
    tools: new Set(['TodoWrite', ...SUBAGENT_TOOL_NAMES]),
  },
];

/** The terminal stage, always present so the list ends on the plan itself. */
const STRATEGY = { id: 'strategy', label: 'Drafting the implementation strategy' };

/**
 * Fold a session's tool calls into an ordered milestone list.
 *
 * @param calls  Every tool call in the session; only those at or after
 *               `since` are considered, so a previous run's tools don't leak in.
 * @param status The plan's current status — anything past `planning` marks the
 *               whole list complete.
 * @param since  Epoch ms the plan run began (`SessionPlan.createdAt`).
 */
export function planMilestones(
  calls: readonly AgentToolCall[],
  status: PlanStatus,
  since: number,
): PlanMilestone[] {
  const settled = status !== 'planning';

  // Which stages have evidence, and which (if any) is still executing. A stage is
  // "active" only while one of its tools is genuinely running — deriving it from
  // the highest stage index instead would mislabel the common interleaved case
  // (Read → Grep → Read), where the newest call belongs to an earlier stage.
  const seen = new Set<string>();
  let activeStage: string | null = null;
  for (const call of calls) {
    if (call.startedAt < since) continue;
    for (const stage of STAGES) {
      if (!stage.tools.has(call.name)) continue;
      seen.add(stage.id);
      if (call.status === 'running') activeStage = stage.id;
      break;
    }
  }

  const out: PlanMilestone[] = [];
  for (const stage of STAGES) {
    if (!seen.has(stage.id)) continue;
    out.push({
      id: stage.id,
      label: stage.label,
      state: !settled && stage.id === activeStage ? 'active' : 'done',
    });
  }

  // The strategy stage has no tool of its own — it IS the tail of a planning run.
  // It leads while the agent is between tools (thinking / writing the plan), and
  // settles the moment a plan exists.
  out.push({
    id: STRATEGY.id,
    label: STRATEGY.label,
    state: settled ? 'done' : activeStage ? 'pending' : 'active',
  });
  return out;
}

/** The milestone a compact one-line indicator should name right now. */
export function currentMilestone(milestones: readonly PlanMilestone[]): PlanMilestone | null {
  for (let i = milestones.length - 1; i >= 0; i--) {
    if (milestones[i].state === 'active') return milestones[i];
  }
  return milestones[milestones.length - 1] ?? null;
}
