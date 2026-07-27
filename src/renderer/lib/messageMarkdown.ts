/**
 * Faithful Markdown reconstruction for a conversation message or a whole turn.
 *
 * The rule that makes this simple: **`ChatMessage.text` is already Markdown**.
 * Both providers stream Markdown source, and the renderer only ever parses it
 * for display (`features/workspace/Markdown.tsx`) — it never rewrites the stored
 * text. So "copy as Markdown" is a matter of returning the source, not of
 * serializing the rendered DOM back into Markdown, which is where this kind of
 * feature usually goes wrong (rendered HTML loses fence languages, table
 * alignment, and the difference between `*` and `-` bullets).
 *
 * Two consequences worth keeping:
 *
 *  - Every function here reads `message.text` at CALL time, so copying a reply
 *    that is still streaming captures everything received so far. There is no
 *    "wait for `message-done`" path, by design.
 *  - Attachments and tool calls are metadata the text does not carry, so they
 *    are appended as Markdown the user can actually read (and paste back into a
 *    prompt) rather than as JSON.
 */
import type { AgentToolCall, AttachmentMeta, ChatMessage } from '@shared/types';

/** Human byte size for an attachment line. */
function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function attachmentLines(attachments: AttachmentMeta[] | undefined): string[] {
  if (!attachments || attachments.length === 0) return [];
  return [
    '',
    '**Attachments**',
    ...attachments.map((a) => {
      const size = bytes(a.size);
      return `- \`${a.name}\`${size ? ` (${size})` : ''}`;
    }),
  ];
}

/**
 * The message as Markdown source.
 *
 * `withRole` prefixes a bold speaker label — wanted when the text lands in an
 * export or a multi-message copy, unwanted when the user copies one reply to
 * paste somewhere that already has context.
 */
export function messageToMarkdown(message: ChatMessage, withRole = false): string {
  const parts: string[] = [];
  if (withRole) parts.push(message.role === 'user' ? '**You**' : '**Assistant**', '');
  parts.push(message.text);
  parts.push(...attachmentLines(message.attachments));
  return parts.join('\n').trimEnd();
}

/**
 * A message as a Markdown blockquote, for the Quote action.
 *
 * Every line is prefixed — including blank ones — so a quoted block that
 * contains a list or a fenced snippet stays one quote instead of splitting into
 * several when the composer's text is re-parsed.
 */
export function messageToQuote(message: ChatMessage): string {
  const body = messageToMarkdown(message);
  return body
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

/** One tool call as a Markdown list item, for turn exports. */
function toolLine(call: AgentToolCall): string {
  const target = call.target ? ` — \`${call.target}\`` : '';
  const change = call.change ? ` (+${call.change.adds}/-${call.change.dels})` : '';
  return `- \`${call.name}\` ${call.summary}${target}${change}`;
}

/**
 * A whole turn — the prompt, the replies, and what the agent ran — as one
 * Markdown document. Used by Export; the tool section is omitted entirely when
 * a turn ran no tools rather than left as an empty heading.
 */
export function turnToMarkdown(
  user: ChatMessage | null,
  assistant: ChatMessage[],
  toolCalls: AgentToolCall[] = [],
): string {
  const out: string[] = [];
  if (user) {
    out.push(messageToMarkdown(user, true), '');
  }
  for (const message of assistant) {
    out.push(messageToMarkdown(message, true), '');
  }
  if (toolCalls.length > 0) {
    out.push('**Tools**', '', ...toolCalls.map(toolLine), '');
  }
  return out.join('\n').trimEnd() + '\n';
}
