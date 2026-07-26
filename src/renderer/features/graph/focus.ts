/**
 * Bidirectional navigation between the Work Graph and everything it references.
 *
 * A node is not a link back to a chat message — it stands for a REAL entity
 * (a tool call, a commit, a checkpoint, a terminal, a memory, a file), recorded
 * as `WorkGraphRef`. That makes navigation symmetric: selecting a node reveals
 * the thing it describes, and any surface showing that thing can reveal its
 * node.
 *
 * Every jump here reuses a mechanism that already exists — the conversation's
 * turn anchors, the Git panel's focus, the terminal store's active tab — rather
 * than inventing a second navigation system.
 */
import type { WorkGraphRef } from '@shared/types';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useGraphStore } from '@/renderer/stores/useGraphStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useMemoryStore } from '@/renderer/stores/useMemoryStore';
import { useTerminalStore } from '@/renderer/stores/useTerminalStore';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import { turnAnchorId } from '@/renderer/features/workspace/ConversationView';

/** Scroll a conversation turn into view — the ConversationRail idiom. */
function scrollToTurn(id: string): boolean {
  const el = document.getElementById(turnAnchorId(id));
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

/**
 * Reveal whatever a graph node stands for. Returns a short description of where
 * the user was taken, or null when the reference has no destination (a node
 * whose subject has since been deleted).
 */
export function revealRef(ref: WorkGraphRef | undefined): string | null {
  if (!ref) return null;
  const layout = useLayoutStore.getState();

  switch (ref.kind) {
    case 'message':
      return scrollToTurn(ref.id) ? 'conversation' : null;

    case 'tool':
      // Tool calls are rendered inside their turn, so the anchor is the turn's.
      // Highlighting the individual card is left to the conversation itself.
      return scrollToTurn(ref.id) ? 'conversation' : null;

    case 'commit':
      layout.setActiveTab('git');
      useGitStore.getState().setFocus({ view: 'history', hash: ref.id });
      return 'Git history';

    case 'checkpoint':
      layout.setActiveTab('git');
      useGitStore.getState().setFocus({ view: 'checkpoints' });
      return 'Git checkpoints';

    case 'file':
      layout.setActiveTab('git');
      useGitStore.getState().setFocus({ view: 'status', path: ref.id });
      return 'Git changes';

    case 'terminal': {
      const workspaceId = useWorkspaceStore.getState().activeId;
      if (!workspaceId) return null;
      layout.setActiveTab('terminal');
      useTerminalStore.getState().setActive(workspaceId, ref.id);
      return 'Terminal';
    }

    case 'memory':
      layout.setActiveTab('memory');
      useMemoryStore.getState().setFocus(ref.id);
      return 'Memory';

    case 'plan':
      // The plan lives in the conversation's own plan surface, which is always
      // visible for the active session — nothing to switch to.
      return null;

    case 'service':
    case 'mcp':
    default:
      return null;
  }
}

/** Whether {@link revealRef} can actually navigate somewhere for this ref. */
export function canRevealRef(ref: WorkGraphRef | undefined): boolean {
  if (!ref) return false;
  // The kinds `revealRef` has nowhere to send the user. Gating the affordance
  // on this instead of on `ref !== undefined` is what stops the inspector
  // offering a button whose only possible outcome is "Nothing to open".
  return ref.kind !== 'plan' && ref.kind !== 'service' && ref.kind !== 'mcp' &&
    ref.kind !== 'worktree' && ref.kind !== 'attachment';
}

/**
 * The other direction: reveal the graph node standing for an entity. Opens the
 * Work Graph tab and scrolls its node into view — resolved against the loaded
 * graph first, then against main's indexed ref columns.
 */
export function revealInGraph(ref: WorkGraphRef): void {
  useLayoutStore.getState().setActiveTab('graph');
  useGraphStore.getState().revealByRef(ref);
}
