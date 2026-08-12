/**
 * Answer the harness's permission requests using Limboo's own authority.
 *
 * THE RULE: **`toolApproval` is a ROUTER; `decideToolUse` is the AUTHORITY.**
 * That was already the intent; this file is what finally makes it true.
 *
 * What was wrong before: `toolApproval` is a `Record<string, ToolApprovalStatus>`
 * that the framework LOOKS UP by tool name (`toolApproval?.[toolName]`) — not a
 * callback it invokes. Passing a function meant every lookup returned
 * `undefined`, which normalises to `not-applicable`, which allows. So the gate
 * was never consulted for anything. And built-in tools were never `toolApproval`'s
 * business in the first place: they are governed by `permissionMode`, which was
 * unset and therefore `'allow-all'`.
 *
 * How it works now:
 *  - Built-in tools are gated because `permissionMode` is `'allow-reads'`
 *    (see `permissions.ts`), which makes the adapter emit a
 *    `tool-approval-request` and suspend the turn.
 *  - Custom host tools are gated by listing every one as `'user-approval'` in
 *    the map, which makes the framework emit the same request kind.
 *  - Both kinds land in {@link resolveApproval}, which asks Limboo and returns
 *    the continuation that resumes the turn.
 *
 * Nothing in the map is ever `'approved'` or `'auto-approve'`. Every
 * auto-approval Limboo grants — `autoApproveReads`, `permissionMode: 'auto'`,
 * trusted MCP servers, remembered per-risk choices, the staged-attachment
 * carve-out, `acceptEdits` writes — is a judgement `decideToolUseCore` makes
 * with the tool's inputs, the workspace root, the crown-jewel floor and the
 * session's remembered grants in hand. A static name-keyed map cannot make any
 * of those judgements, and the moment it pretends to, the layers disagree about
 * what was allowed.
 */
import type { SessionPermissionMode } from '@shared/types';
import type { HarnessApprovalRequest } from './translate';

/** The permission result shape `makeCanUseTool` returns. */
interface GateResult {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
  interrupt?: boolean;
}

/** A continuation that resumes a suspended turn with one decision. */
export interface HarnessApprovalContinuation {
  approvalResponse: {
    type: 'tool-approval-response';
    approvalId: string;
    approved: boolean;
    reason?: string;
  };
  toolCall: Record<string, unknown>;
}

export interface HarnessApprovalDeps {
  /**
   * `AgentManager.makeCanUseTool(sessionId, cwd, permMode)` — used UNCHANGED.
   *
   * Deliberately this and not `decideToolUse` directly: `makeCanUseTool` wraps
   * the gate with the `ExitPlanMode` plan capture and the `AskUserQuestion`
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
   * the caller supplies the equivalent.
   */
  interrupt(): void;
  abort: AbortSignal;
  permMode: SessionPermissionMode;
}

/**
 * Every custom/host tool routes to the gate.
 *
 * `'user-approval'` does NOT mean "always show a dialog" — it means "ask
 * Limboo", and Limboo answers without prompting whenever its own policy says
 * so. With no host tools this is `{}`, which is honest: there is nothing to
 * route. Built-ins are covered by `permissionMode`, not by this map.
 */
export function buildToolApprovalMap(
  toolNames: readonly string[],
): Record<string, 'user-approval'> {
  const out: Record<string, 'user-approval'> = {};
  for (const name of toolNames) out[name] = 'user-approval';
  return out;
}

/** The single delegation point from the harness into Layer 1. */
export async function resolveApproval(
  req: HarnessApprovalRequest,
  deps: HarnessApprovalDeps,
): Promise<HarnessApprovalContinuation> {
  const deny = (reason: string): HarnessApprovalContinuation => ({
    approvalResponse: {
      type: 'tool-approval-response',
      approvalId: req.approvalId,
      approved: false,
      reason,
    },
    toolCall: req.toolCall,
  });

  try {
    const result = await deps.canUseTool(req.toolName, req.input, { signal: deps.abort });
    if (result.behavior === 'allow') {
      // Honour a rewritten input: the gate may narrow a tool's arguments, and
      // dropping that would execute the ORIGINAL request while the audit trail
      // records the narrowed one.
      const input = result.updatedInput ?? req.input;
      return {
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: req.approvalId,
          approved: true,
        },
        // Rebuild from the framework's own object so every field it set (ids,
        // providerExecuted, dynamic flags) survives; only the input is ours.
        toolCall: { ...req.toolCall, input },
      };
    }
    if (result.interrupt) deps.interrupt();
    return deny(result.message || 'Denied.');
  } catch (err) {
    // FAIL CLOSED. A gate that threw authorized nothing, and letting the
    // rejection escape would surface as a crashed run rather than a refused
    // tool — which reads to the user as a bug instead of a decision.
    return deny(err instanceof Error ? err.message : 'Limboo could not evaluate this tool call.');
  }
}
