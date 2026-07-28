/**
 * Live subagent execution stages — derived, never streamed.
 *
 * Same technique as `features/plan/milestones.ts`, and for the same reason:
 * neither provider emits stage events, but both emit tool calls, and Cursor's
 * adapter already normalizes its tool union onto Claude-shaped names
 * (`cursor/translate.ts`). Mapping a worker's OWN tool calls onto stages
 * therefore gives the same progress readout for every provider with **no
 * main-process change and no new event kind**.
 *
 * A worker's children are exactly the calls whose `parentCallId` is the spawning
 * call's id — the Agent SDK's `parent_tool_use_id`, threaded through by
 * AgentManager. This is the only signal that distinguishes a worker's tool call
 * from the parent's.
 *
 * Pure function over the session snapshot: no store access, no clock, no IPC.
 */
import type { AgentToolCall } from '@shared/types';

export type SubagentStageState = 'pending' | 'active' | 'done';

export interface SubagentStage {
  id: string;
  label: string;
  state: SubagentStageState;
}

/**
 * Ordered stages and the tools that evidence them.
 *
 * Order is narrative, not chronological — a worker interleaves reads and
 * searches freely. What the order fixes is the READING order of the list, so a
 * glance down it tells the same story every time.
 */
const STAGES: ReadonlyArray<{ id: string; label: string; match: (name: string) => boolean }> = [
  {
    id: 'context',
    label: 'Loading context',
    match: (n) => n.startsWith('mcp__limboo_memory__') || n.startsWith('mcp__limboo_search__'),
  },
  {
    id: 'read',
    label: 'Reading the repository',
    match: (n) => n === 'Read' || n === 'Glob' || n === 'LS' || n === 'NotebookRead',
  },
  {
    id: 'search',
    label: 'Searching symbols and references',
    match: (n) => n === 'Grep' || n === 'find_symbols' || n === 'search_project' || n === 'find_files',
  },
  {
    id: 'research',
    label: 'Researching external references',
    match: (n) => n === 'WebSearch' || n === 'WebFetch',
  },
  {
    id: 'mcp',
    label: 'Calling connected tools',
    // Limboo's own retrieval servers are the `context` stage, not a tool call.
    match: (n) =>
      n.startsWith('mcp__') &&
      !n.startsWith('mcp__limboo_memory__') &&
      !n.startsWith('mcp__limboo_search__'),
  },
  {
    id: 'run',
    label: 'Running commands',
    match: (n) => n === 'Bash' || n === 'BashOutput' || n === 'KillShell',
  },
  {
    id: 'edit',
    label: 'Applying changes',
    match: (n) => n === 'Write' || n === 'Edit' || n === 'MultiEdit' || n === 'NotebookEdit',
  },
];

/**
 * Bookend stages, always present.
 *
 * `START` matters most in the window before any child call has arrived — a
 * worker that has just been spawned has no evidence yet, and without this the
 * list would open on "Returning summary" and read as though it were already
 * finishing.
 */
const START_STAGE = { id: 'start', label: 'Starting subagent' };
const RETURN_STAGE = { id: 'return', label: 'Returning summary' };

/**
 * Fold a worker's child tool calls into an ordered stage list.
 *
 * @param children Tool calls whose `parentCallId` is this worker's call id.
 * @param settled  True once the spawning call itself has finished.
 */
export function subagentStages(
  children: readonly AgentToolCall[],
  settled: boolean,
): SubagentStage[] {
  const seen = new Set<string>();
  const running = new Set<string>();
  for (const call of children) {
    for (const stage of STAGES) {
      if (!stage.match(call.name)) continue;
      seen.add(stage.id);
      // A stage is active only while one of ITS tools is genuinely running.
      // Deriving it from the furthest-reached stage instead would mislabel the
      // common interleaved case (Read -> Grep -> Read), which is precisely the
      // bug the plan milestones already document.
      if (call.status === 'running') running.add(stage.id);
      break;
    }
  }

  const out: SubagentStage[] = [
    {
      id: START_STAGE.id,
      label: START_STAGE.label,
      // Done the moment the worker has done anything at all.
      state: settled || children.length > 0 ? 'done' : 'active',
    },
  ];
  for (const stage of STAGES) {
    if (!seen.has(stage.id)) continue;
    out.push({
      id: stage.id,
      label: stage.label,
      state: settled ? 'done' : running.has(stage.id) ? 'active' : 'done',
    });
  }
  out.push({
    id: RETURN_STAGE.id,
    label: RETURN_STAGE.label,
    // Only "returning" once the worker has actually done something and has
    // nothing left running — otherwise it is still pending.
    state: settled ? 'done' : running.size === 0 && children.length > 0 ? 'active' : 'pending',
  });
  return out;
}

/** The stage a screen reader should announce, or undefined when there is none. */
export function currentSubagentStage(stages: readonly SubagentStage[]): SubagentStage | undefined {
  return stages.find((s) => s.state === 'active') ?? stages[stages.length - 1];
}

/** Compact `1.2s` / `45s` / `3m 20s` duration, for the settled row's metadata. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1_000) return `${ms}ms`;
  const secs = ms / 1_000;
  if (secs < 60) return `${secs < 10 ? secs.toFixed(1) : Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}
