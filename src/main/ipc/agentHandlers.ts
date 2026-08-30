/**
 * IPC handlers for the Coding Agent Manager. Reached from the renderer through
 * `window.limboo.agent.*`. Every handler validates and caps its input before it
 * touches the manager (CLAUDE.md §6): prompt length is bounded, ids must be
 * non-empty strings, and any renderer-supplied object is screened for
 * prototype-polluting keys.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { AGENT_LIMITS, ATTACHMENT_LIMITS } from '@shared/constants';
import type {
  AgentDiagnostic,
  AgentInstall,
  AgentSessionSnapshot,
  AgentState,
  ClarificationDecision,
  ConversationRevertPreview,
  ConversationRevertResult,
  HarnessBootstrapInfo,
  PermissionDecision,
  PlanRevision,
  SessionPermissionMode,
  SessionPlan,
} from '@shared/types';
import type { PlanDecisionKind } from '@shared/plan';
import { isPlanDecisionKind } from '@shared/plan';
import type { AgentManager } from '../managers/AgentManager';
import { harnessById } from '../managers/agent/harnessRegistry';
import { handle } from './registry';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertNoPollutingKeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Rejected polluting key: ${key}`);
  }
}

function assertSessionId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error('Expected a valid session id');
  }
  return value;
}

function assertMessageId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error('Expected a valid message id');
  }
  return value;
}

const PERMISSION_MODES: SessionPermissionMode[] = ['plan', 'ask', 'default', 'acceptEdits'];

/** Default to ask-before-edits when unspecified; reject values outside the union. */
function assertMode(value: unknown): SessionPermissionMode {
  if (value === undefined) return 'default';
  if (!PERMISSION_MODES.includes(value as SessionPermissionMode)) {
    throw new Error('Permission mode must be "plan", "ask", "default" or "acceptEdits"');
  }
  return value as SessionPermissionMode;
}

/** Approval never re-enters planning — restrict to the execution modes. */
function assertExecMode(value: unknown): SessionPermissionMode {
  if (value === undefined) return 'default';
  if (value !== 'default' && value !== 'acceptEdits') {
    throw new Error('Execution mode must be "default" or "acceptEdits"');
  }
  return value;
}

/**
 * The plan revision the renderer believes it is acting on.
 *
 * Every mutating plan channel carries one, and main refuses a mismatch, so a
 * stale window (or a second window that lost the race) can never approve a plan
 * that has since been replaced. A plain bounded integer — the concurrency token
 * is a number, not an opaque handle, so there is nothing here to forge.
 */
function assertPlanRev(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error('Expected a valid plan revision');
  }
  return value;
}

function assertPlanDecisionKind(value: unknown): PlanDecisionKind {
  if (!isPlanDecisionKind(value)) {
    throw new Error('Unknown plan decision');
  }
  return value;
}

/** Free text the user attaches to a decision. Relayed to the model, so capped. */
function assertPlanFeedback(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('Plan feedback must be a string');
  if (value.length > AGENT_LIMITS.planFeedbackMax) throw new Error('Plan feedback is too long');
  return value;
}

export function registerAgentHandlers(agent: AgentManager): void {
  handle<[], AgentInstall>(IpcChannels.agentGetInstall, () => agent.getInstall());

  /**
   * A harness's one-time setup plan, for the consent dialog.
   *
   * Read-only and secret-free: command strings, file names and prerequisite tool
   * names the adapter itself declares. Approving is an ordinary settings write
   * of the returned fingerprint, so no channel here can grant anything.
   *
   * `harnessId` is optional and validated against the registry before it reaches
   * the manager — a renderer must not be able to name an arbitrary module
   * specifier for `loadHarness` to dynamic-import.
   */
  handle<[string?], HarnessBootstrapInfo>(
    IpcChannels.agentHarnessBootstrapPlan,
    (_event, harnessId) => {
      if (harnessId !== undefined) {
        if (typeof harnessId !== 'string' || !harnessById(harnessId)) {
          throw new Error('agent:harnessBootstrapPlan: unknown harness id');
        }
      }
      return agent.harnessBootstrapPlan(harnessId);
    },
  );

  handle<[], AgentState>(IpcChannels.agentGetState, () => agent.getState());

  handle<[string], AgentSessionSnapshot>(IpcChannels.agentGetSnapshot, (_event, sessionId) =>
    agent.getSnapshot(assertSessionId(sessionId)),
  );

  handle<[string, string, SessionPermissionMode?, string?, string[]?], void>(
    IpcChannels.agentSend,
    async (_event, sessionId, prompt, mode, clientMessageId, attachmentIds) => {
      const id = assertSessionId(sessionId);
      // Attachment ids are optional; each must be a short, plain token. The
      // Attachment Manager re-validates session ownership before use.
      let attachIds: string[] | undefined;
      if (attachmentIds !== undefined) {
        if (!Array.isArray(attachmentIds) || attachmentIds.length > ATTACHMENT_LIMITS.maxFilesPerMessage.max) {
          throw new Error('Invalid attachment list');
        }
        attachIds = attachmentIds.filter(
          (a): a is string =>
            typeof a === 'string' &&
            a.length > 0 &&
            a.length <= ATTACHMENT_LIMITS.idMax &&
            /^[A-Za-z0-9_-]+$/.test(a),
        );
        if (attachIds.length !== attachmentIds.length) {
          throw new Error('Invalid attachment id');
        }
        if (attachIds.length === 0) attachIds = undefined;
      }
      if (typeof prompt !== 'string' || (prompt.trim().length === 0 && !attachIds)) {
        throw new Error('Prompt must be a non-empty string');
      }
      if (prompt.length > AGENT_LIMITS.promptMax) {
        throw new Error('Prompt is too long');
      }
      // An attachments-only send gets a minimal instruction as the visible turn.
      const effective = prompt.trim().length === 0 ? 'Review the attached files.' : prompt;
      // Optional renderer-supplied id so the optimistic bubble and the persisted
      // message share one id (dedup on echo). Validated: a short, plain string.
      const clientId =
        typeof clientMessageId === 'string' &&
        clientMessageId.length > 0 &&
        clientMessageId.length <= 64
          ? clientMessageId
          : undefined;
      await agent.send(id, effective, assertMode(mode), clientId, attachIds);
    },
  );

  handle<[string], void>(IpcChannels.agentStop, (_event, sessionId) => {
    agent.stop(assertSessionId(sessionId));
  });

  handle<[string], void>(IpcChannels.agentClearSession, (_event, sessionId) => {
    agent.clearSession(assertSessionId(sessionId));
  });

  handle<[string | null | undefined], AgentDiagnostic[]>(
    IpcChannels.agentGetDiagnostics,
    (_event, sessionId) => {
      const id = sessionId == null ? null : assertSessionId(sessionId);
      return agent.getDiagnostics(id);
    },
  );

  handle<[], void>(IpcChannels.agentClearRateLimit, () => {
    agent.clearRateLimitManual();
  });

  handle<[], AgentInstall>(IpcChannels.agentRetryAuth, () => agent.retryAuth());

  /* ---- Plan Mode ---- */

  handle<[string], SessionPlan | null>(IpcChannels.agentGetPlan, (_event, sessionId) =>
    agent.getPlan(assertSessionId(sessionId)),
  );

  /**
   * The single plan-decision channel. Ids, an enum and capped text — nothing
   * else crosses, so the renderer never chooses a path, a ref, or a blast
   * radius (the `agentRevertToMessage` precedent below).
   *
   * `rev` is the concurrency token: main refuses a mismatch rather than acting
   * on a plan the user is no longer looking at.
   */
  handle<[string, number, PlanDecisionKind, string?, SessionPermissionMode?], void>(
    IpcChannels.agentPlanDecision,
    async (_event, sessionId, rev, kind, feedback, execMode) => {
      const id = assertSessionId(sessionId);
      const planRev = assertPlanRev(rev);
      const decision = assertPlanDecisionKind(kind);
      const text = assertPlanFeedback(feedback);
      switch (decision) {
        case 'approve':
          await agent.approvePlan(id, planRev, assertExecMode(execMode));
          return;
        // An edit takes the same path as keep-planning: ExitPlanMode's input
        // has no `plan` field to overwrite, so the edited text is relayed as
        // feedback the model must adopt.
        case 'keep-planning':
        case 'edit': {
          await agent.regeneratePlan(id, planRev, text);
          return;
        }
        case 'reject':
          agent.rejectPlan(id, planRev);
          return;
        case 'archive':
          agent.archivePlan(id, planRev);
          return;
      }
    },
  );

  handle<[string, number, boolean], void>(
    IpcChannels.agentSetPlanPinned,
    (_event, sessionId, rev, pinned) => {
      agent.setPlanPinned(assertSessionId(sessionId), assertPlanRev(rev), pinned === true);
    },
  );

  handle<[string], PlanRevision[]>(IpcChannels.agentListPlanRevisions, (_event, sessionId) =>
    agent.listPlanRevisions(assertSessionId(sessionId)),
  );

  handle<[string, number, string], void>(
    IpcChannels.agentRestorePlanRevision,
    (_event, sessionId, rev, revisionId) => {
      const id = assertSessionId(sessionId);
      const planRev = assertPlanRev(rev);
      if (typeof revisionId !== 'string' || revisionId.length === 0 || revisionId.length > 200) {
        throw new Error('Expected a valid revision id');
      }
      agent.restorePlanRevision(id, planRev, revisionId);
    },
  );

  /* -------------------------------------------------------- conversation revert */

  // Both channels take ids and nothing else. The checkpoint, its commit, and the
  // repository root are resolved in main from the session's own rows — a renderer
  // that supplied a ref or a path would be supplying the blast radius of a
  // destructive operation, which is exactly what must not cross this boundary.
  handle<[string, string], ConversationRevertPreview>(
    IpcChannels.agentRevertPreview,
    (_event, sessionId, messageId) =>
      agent.revertPreview(assertSessionId(sessionId), assertMessageId(messageId)),
  );

  handle<[string, string], ConversationRevertResult>(
    IpcChannels.agentRevertToMessage,
    (_event, sessionId, messageId) =>
      agent.revertToMessage(assertSessionId(sessionId), assertMessageId(messageId)),
  );


  handle<[PermissionDecision], void>(IpcChannels.agentPermissionRespond, (_event, decision) => {
    if (!decision || typeof decision !== 'object') {
      throw new Error('Expected a permission decision object');
    }
    assertNoPollutingKeys(decision as unknown as Record<string, unknown>);
    if (typeof decision.id !== 'string' || decision.id.length === 0) {
      throw new Error('Permission decision requires an id');
    }
    if (decision.behavior !== 'allow' && decision.behavior !== 'deny') {
      throw new Error('Permission decision behavior must be allow or deny');
    }
    agent.respondPermission({
      id: decision.id,
      behavior: decision.behavior,
      remember: decision.remember === true,
      message: typeof decision.message === 'string' ? decision.message.slice(0, 500) : undefined,
    });
  });

  handle<[ClarificationDecision], void>(
    IpcChannels.agentClarificationRespond,
    (_event, decision) => {
      if (!decision || typeof decision !== 'object') {
        throw new Error('Expected a clarification decision object');
      }
      assertNoPollutingKeys(decision as unknown as Record<string, unknown>);
      if (typeof decision.id !== 'string' || decision.id.length === 0) {
        throw new Error('Clarification decision requires an id');
      }
      if (!decision.answers || typeof decision.answers !== 'object' || Array.isArray(decision.answers)) {
        throw new Error('Clarification answers must be an object');
      }
      // The answers object is used as a key map and forwarded to the SDK — screen
      // every key for prototype pollution and cap sizes (CLAUDE.md §6).
      assertNoPollutingKeys(decision.answers as Record<string, unknown>);
      const keys = Object.keys(decision.answers);
      if (keys.length > 4) {
        throw new Error('Too many clarification answers');
      }
      const answers: Record<string, string | string[]> = {};
      for (const key of keys) {
        if (key.length > 1000) throw new Error('Clarification question key is too long');
        const value = (decision.answers as Record<string, unknown>)[key];
        if (typeof value === 'string') {
          answers[key] = value.slice(0, 2000);
        } else if (Array.isArray(value)) {
          answers[key] = value
            .filter((v): v is string => typeof v === 'string')
            .slice(0, 8)
            .map((v) => v.slice(0, 2000));
        } else {
          throw new Error('Clarification answer must be a string or string array');
        }
      }
      const response =
        typeof decision.response === 'string' ? decision.response.slice(0, 2000) : undefined;
      agent.respondClarification({ id: decision.id, answers, response });
    },
  );
}
