/**
 * IPC handlers for the Provider-Neutral Hook Engine's audit trail. Registered
 * through `handle()`, so every call inherits sender-origin validation. The
 * surface is read-only + clear (string session ids only, length-capped here per
 * CLAUDE.md §6) — the renderer can READ the governance audit and clear it, but
 * it can never make a policy decision: enforcement lives entirely in
 * AgentManager's permission gate, never in the renderer.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { SESSION_LIMITS } from '@shared/constants';
import type { HookEvent } from '@shared/types';
import { handle } from './registry';
import type { HookEngine } from '../managers/hooks/HookEngine';

function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > SESSION_LIMITS.idMax) {
    throw new Error('hooks: invalid session id');
  }
}

export function registerHookHandlers(hooks: HookEngine): void {
  handle(IpcChannels.hooksGetAudit, (_e, sessionId: unknown): HookEvent[] => {
    assertSessionId(sessionId);
    return hooks.getAudit(sessionId);
  });

  handle(IpcChannels.hooksClearAudit, (_e, sessionId: unknown): void => {
    // A blank / omitted id clears every session's trail (the panel's global
    // clear); a supplied id must still validate.
    if (sessionId === undefined || sessionId === null || sessionId === '') {
      hooks.clearAudit();
      return;
    }
    assertSessionId(sessionId);
    hooks.clearAudit(sessionId);
  });
}
