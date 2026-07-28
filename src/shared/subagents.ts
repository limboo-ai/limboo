/**
 * Subagent identity — the one rule table, shared by every process.
 *
 * Lives in `shared/` for the same reason `refName.ts` does: main (AgentManager,
 * the Work Graph reducer) and the renderer (the conversation stream, plan
 * milestones) all have to answer "is this call a subagent spawn?", and a second
 * copy of the answer is how the two drift.
 *
 * ## Why two names
 *
 * Claude Code renamed the subagent-spawning tool from `Task` to `Agent` in
 * v2.1.63. Current SDK releases emit `Agent` in `tool_use` blocks but still
 * report `Task` in the `system:init` tool list and in
 * `result.permission_denials[].tool_name`; older releases emit `Task`
 * everywhere. Anything that tests one spelling silently loses every subagent on
 * half the releases it will run against.
 *
 * ## Provider neutrality
 *
 * Tool names reaching Limboo are already Claude-shaped for both providers
 * (`cursor/translate.ts` maps Cursor's tool union onto them), so this table is
 * provider-neutral by construction. Cursor print mode carries no derivable
 * parent linkage, so nothing there currently resolves to a subagent — the
 * predicate simply returns false and every subagent surface degrades to the
 * flat rendering that shipped before.
 */

/** Every name the subagent-spawning tool is known by. */
export const SUBAGENT_TOOL_NAMES: readonly string[] = ['Task', 'Agent'];

const SUBAGENT_TOOL_SET = new Set(SUBAGENT_TOOL_NAMES);

/** True when `name` is the subagent-spawning tool, under either spelling. */
export function isSubagentTool(name: string): boolean {
  return SUBAGENT_TOOL_SET.has(name);
}
