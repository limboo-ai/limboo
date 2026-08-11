/**
 * Route the harness's coarse `toolApproval` surface into Limboo's permission
 * gate.
 *
 * THE RULE, and the reason this file is small: **the `toolApproval` map is a
 * ROUTER; `decideToolUse` is the AUTHORITY.** Nothing in the map may ever be
 * `'auto-approve'`. Every auto-approval Limboo grants — `autoApproveReads`,
 * `permissionMode: 'auto'`, trusted MCP servers, remembered per-risk choices,
 * the staged-attachment carve-out, `acceptEdits` writes — is a judgement
 * `decideToolUseCore` makes with the tool's inputs, the workspace root, the
 * crown-jewel floor and the session's remembered grants in hand. A static
 * name-keyed map cannot make any of those judgements and must not try; the
 * moment it does, the three layers can disagree about what was allowed.
 *
 * So every tool routes to `'user-approval'` and the callback delegates. The
 * gate then decides silently in the common case (an auto-approved read never
 * shows a dialog) and prompts only when it would have prompted for Claude or
 * Cursor, from the same code, with the same risk chips and the same audit
 * trail.
 */
import type { SessionPermissionMode } from '@shared/types';
import type { HarnessApprovalRequest, HarnessApprovalDecision, HarnessToolApproval } from './types';

/** The permission result shape `makeCanUseTool` returns. */
interface GateResult {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
  interrupt?: boolean;
}

export interface HarnessApprovalDeps {
  /**
   * `AgentManager.makeCanUseTool(sessionId, cwd, permMode)` — used UNCHANGED.
   *
   * Deliberately this and not `decideToolUse` directly: `makeCanUseTool` wraps
   * the gate with the ExitPlanMode plan capture and the AskUserQuestion
   * clarification round-trip, both of which must run AHEAD of risk
   * classification. Calling the core would silently drop plan mode.
   */
  canUseTool(
    toolName: string,
    input: Record<string, unknown>,
    ctx: { signal: AbortSignal },
  ): Promise<GateResult>;
  /**
   * Halt the turn. `canUseTool` signals plan capture with
   * `{ behavior: 'deny', interrupt: true }`; the harness has no such field, so
   * the caller supplies the equivalent (`session.suspendTurn()`, which
   * preserves the turn for `continueStream()` after the user approves, with
   * abort as the fallback).
   */
  interrupt(): void;
  /** Run-level abort, used when a request carries no signal of its own. */
  abort: AbortSignal;
  permMode: SessionPermissionMode;
}

/**
 * Every tool the harness can execute routes to the gate.
 *
 * `'user-approval'` here does NOT mean "always show a dialog" — it means "ask
 * Limboo", and Limboo answers without prompting whenever its own policy says
 * so. Naming any tool as pre-approved would move an authorization decision out
 * of the one place that can make it correctly.
 */
export function buildToolApprovalMap(
  toolNames: readonly string[],
): Record<string, 'user-approval'> {
  const out: Record<string, 'user-approval'> = {};
  for (const name of toolNames) out[name] = 'user-approval';
  return out;
}

/** The single delegation point from the harness into Layer 1. */
export function makeHarnessToolApproval(deps: HarnessApprovalDeps): HarnessToolApproval {
  return async (req: HarnessApprovalRequest): Promise<HarnessApprovalDecision> => {
    const input =
      req.input && typeof req.input === 'object' && !Array.isArray(req.input)
        ? (req.input as Record<string, unknown>)
        : {};
    const signal = req.abortSignal ?? deps.abort;
    try {
      const result = await deps.canUseTool(req.toolName, input, { signal });
      if (result.behavior === 'allow') {
        // Honour a rewritten input: the gate may narrow a tool's arguments
        // (the attachment carve-out does), and dropping that would run the
        // ORIGINAL request while the audit trail records the narrowed one.
        return { approved: true, input: result.updatedInput ?? input };
      }
      if (result.interrupt) deps.interrupt();
      return { approved: false, reason: result.message };
    } catch (err) {
      // FAIL CLOSED. A gate that threw did not authorize anything, and the
      // harness treats a rejected promise as an error rather than a denial —
      // which would surface as a crashed run instead of a refused tool.
      return {
        approved: false,
        reason: err instanceof Error ? err.message : 'Limboo could not evaluate this tool call.',
      };
    }
  };
}
