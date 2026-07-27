/**
 * The per-message action toolbar.
 *
 * Every block in the timeline — the user's prompt as much as the agent's reply —
 * is a thing you should be able to take away with you: copy it, quote it, reuse
 * it as the seed of another session, pin it as project memory, or roll the
 * repository back to just before it. Until now the conversation was read-only
 * presentation and the only copy affordance was on code blocks.
 *
 * Rules this file encodes:
 *
 *  - **Icon-only, revealed on hover OR keyboard focus.** `focus-within` matters
 *    as much as `group-hover`: a toolbar you can only reach with a mouse is not
 *    reachable. It never occupies layout when hidden (opacity, not display, so
 *    focus can still land on it).
 *  - **Active state is the accent ICON**, per §4b — no strips, no plates, no
 *    borders. `IconButton`'s `active` gives the seat; nothing here adds a bar.
 *  - **Copy is computed at click time**, so copying a reply that is still
 *    streaming captures everything received so far rather than waiting for the
 *    run to finish. See `lib/messageMarkdown`.
 *  - **Provider-neutral.** Nothing here knows whether Claude or Cursor produced
 *    the message; it reads the same `ChatMessage` both adapters normalize into.
 */
import { useState } from 'react';
import {
  Braces,
  Download,
  ExternalLink,
  Brain,
  Quote,
  RefreshCw,
  TextCursorInput,
  Undo2,
} from 'lucide-react';
import type { AgentToolCall, ChatMessage } from '@shared/types';
import { CopyButton, IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { downloadText, slugify } from '@/renderer/lib/download';
import { messageToMarkdown, messageToQuote, turnToMarkdown } from '@/renderer/lib/messageMarkdown';
import { useComposerStore } from '@/renderer/stores/useComposerStore';
import { useMemoryStore } from '@/renderer/stores/useMemoryStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useUIStore } from '@/renderer/stores/useUIStore';

export interface MessageActionsProps {
  sessionId: string;
  message: ChatMessage;
  /** Raw view is owned by the parent so the message body can swap with it. */
  raw: boolean;
  onToggleRaw: () => void;
  /** Select the message's text in place (parent owns the DOM node). */
  onSelectText: () => void;
  /** Re-run the prompt that produced this reply. Absent = not regenerable. */
  onRegenerate?: () => void;
  /** Roll the workspace back to just before this turn. Absent = no anchor. */
  onRevert?: () => void;
  /** Tool calls belonging to this turn, included in the export. */
  toolCalls?: AgentToolCall[];
  /** The prompt this reply answered, included in the export. */
  promptMessage?: ChatMessage | null;
  className?: string;
}

export function MessageActions({
  sessionId,
  message,
  raw,
  onToggleRaw,
  onSelectText,
  onRegenerate,
  onRevert,
  toolCalls,
  promptMessage,
  className,
}: MessageActionsProps) {
  const addToast = useUIStore((s) => s.addToast);
  const appendDraft = useComposerStore((s) => s.appendDraft);
  const setDraft = useComposerStore((s) => s.setDraft);
  const createSession = useSessionStore((s) => s.createSession);
  const selectSession = useSessionStore((s) => s.selectSession);
  const createMemory = useMemoryStore((s) => s.create);
  const [pinning, setPinning] = useState(false);

  const isUser = message.role === 'user';
  const streaming = !!message.streaming;

  const quote = () => {
    appendDraft(sessionId, messageToQuote(message));
  };

  const reference = () => {
    // A reference is the message verbatim, fenced so the agent sees exactly what
    // the user is pointing at — a paraphrase would defeat the purpose.
    appendDraft(sessionId, ['```markdown', messageToMarkdown(message), '```'].join('\n'));
  };

  const exportTurn = () => {
    const text = isUser
      ? turnToMarkdown(message, [], toolCalls ?? [])
      : turnToMarkdown(promptMessage ?? null, [message], toolCalls ?? []);
    const stem = (isUser ? message.text : (promptMessage?.text ?? message.text)).slice(0, 40);
    downloadText(`${slugify(stem, 'message')}.md`, text);
  };

  const openInNewSession = async () => {
    const id = await createSession();
    if (!id) {
      addToast({ title: 'Could not create a session', tone: 'danger' });
      return;
    }
    setDraft(id, messageToMarkdown(message));
    void selectSession(id);
  };

  const pinToMemory = async () => {
    const body = messageToMarkdown(message).trim();
    if (!body) return;
    setPinning(true);
    try {
      await createMemory({
        tier: 'note',
        title: body.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80) || 'Pinned from conversation',
        body,
      });
      addToast({ title: 'Pinned to memory', tone: 'success' });
    } catch {
      addToast({ title: 'Could not pin to memory', tone: 'danger' });
    } finally {
      setPinning(false);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 opacity-0 transition-opacity',
        'group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100',
        className,
      )}
    >
      <CopyButton
        value={() => message.text}
        label={streaming ? 'Copy what has streamed so far' : 'Copy'}
        size={13}
      />
      <CopyButton
        value={() => messageToMarkdown(message)}
        label="Copy as Markdown"
        size={13}
        className="[&_svg]:opacity-70"
      />
      <IconButton size="sm" label="Quote in composer" onClick={quote}>
        <Quote size={13} />
      </IconButton>
      <IconButton size="sm" label="Reference in prompt" onClick={reference}>
        <TextCursorInput size={13} />
      </IconButton>
      <IconButton size="sm" label="Select text" onClick={onSelectText}>
        <span className="text-[11px] font-semibold leading-none">Aa</span>
      </IconButton>
      <IconButton size="sm" label={raw ? 'Show rendered' : 'View raw'} active={raw} onClick={onToggleRaw}>
        <Braces size={13} />
      </IconButton>
      <IconButton size="sm" label="Export as Markdown" onClick={exportTurn}>
        <Download size={13} />
      </IconButton>
      <IconButton size="sm" label="Open in a new session" onClick={() => void openInNewSession()}>
        <ExternalLink size={13} />
      </IconButton>
      <IconButton
        size="sm"
        label="Pin to memory"
        disabled={pinning}
        onClick={() => void pinToMemory()}
      >
        <Brain size={13} />
      </IconButton>
      {onRegenerate && (
        <IconButton size="sm" label="Regenerate" disabled={streaming} onClick={onRegenerate}>
          <RefreshCw size={13} />
        </IconButton>
      )}
      {onRevert && (
        <IconButton
          size="sm"
          label="Revert the workspace to before this turn"
          disabled={streaming}
          onClick={onRevert}
        >
          <Undo2 size={13} />
        </IconButton>
      )}
    </div>
  );
}

/** Select a DOM node's text content in place (the Select Text action). */
export function selectNodeText(node: HTMLElement | null): void {
  if (!node) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

