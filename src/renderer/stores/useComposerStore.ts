/**
 * The composer's text draft, per session.
 *
 * This used to be `useState('')` inside `Composer.tsx`, which was fine while the
 * composer was the only thing that could write to it. The message action toolbar
 * changed that: Quote and Reference in Prompt both need to push text into the
 * composer from a message row several levels away in the tree, and "Open in New
 * Session" needs to seed a draft for a session that is not even mounted yet.
 *
 * Keyed by session so switching sessions (or worktree tabs) keeps each draft
 * where the user left it, matching how every other per-session surface behaves.
 * Drafts are intentionally NOT persisted — an unsent prompt is scratch, and
 * restoring one into a session whose repository moved on is worse than an empty
 * box.
 *
 * `focusTick` is a monotonic signal rather than a boolean: two Quote clicks in a
 * row must both focus the composer, and a boolean would need resetting.
 */
import { create } from 'zustand';

interface ComposerState {
  draftBySession: Record<string, string>;
  /** Bumped whenever something outside the composer asks for focus. */
  focusTick: number;
  /** The session the last focus request targeted. */
  focusSessionId: string | null;

  getDraft: (sessionId: string) => string;
  setDraft: (sessionId: string, text: string) => void;
  /** Drop a session's draft (send, or session teardown). */
  clearDraft: (sessionId: string) => void;
  /**
   * Append `text` to a draft, separated by a blank line, and ask the composer to
   * focus. Used by Quote / Reference in Prompt.
   */
  appendDraft: (sessionId: string, text: string) => void;
  /** Ask the composer for this session to take focus without changing the text. */
  requestFocus: (sessionId: string) => void;
}

export const useComposerStore = create<ComposerState>((set, get) => ({
  draftBySession: {},
  focusTick: 0,
  focusSessionId: null,

  getDraft: (sessionId) => get().draftBySession[sessionId] ?? '',

  setDraft: (sessionId, text) =>
    set((s) => ({ draftBySession: { ...s.draftBySession, [sessionId]: text } })),

  clearDraft: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.draftBySession)) return s;
      const next = { ...s.draftBySession };
      delete next[sessionId];
      return { draftBySession: next };
    }),

  appendDraft: (sessionId, text) =>
    set((s) => {
      const current = s.draftBySession[sessionId] ?? '';
      const joined = current.trim().length > 0 ? `${current.replace(/\s+$/, '')}\n\n${text}\n\n` : `${text}\n\n`;
      return {
        draftBySession: { ...s.draftBySession, [sessionId]: joined },
        focusTick: s.focusTick + 1,
        focusSessionId: sessionId,
      };
    }),

  requestFocus: (sessionId) =>
    set((s) => ({ focusTick: s.focusTick + 1, focusSessionId: sessionId })),
}));
