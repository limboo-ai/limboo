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
import { isSubagentTool } from '@shared/subagents';
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
function toolLine(call: AgentToolCall, depth = 0): string {
  const target = call.target ? ` — \`${call.target}\`` : '';
  const change = call.change ? ` (+${call.change.adds}/-${call.change.dels})` : '';
  return `${'  '.repeat(depth)}- \`${call.name}\` ${call.summary}${target}${change}`;
}

/**
 * Flatten a turn's calls into export order, indenting a subagent's own calls
 * under the spawn that produced them.
 *
 * The export mirrors what the stream shows: a delegating turn read as one flat
 * list here even though the worker's calls plainly belonged to the delegation,
 * which made an exported transcript harder to follow than the UI it came from.
 */
function toolLines(calls: AgentToolCall[]): string[] {
  const byParent = new Map<string, AgentToolCall[]>();
  const spawns = new Set(calls.filter((c) => isSubagentTool(c.name)).map((c) => c.id));
  for (const call of calls) {
    const parent = call.parentCallId;
    if (!parent || !spawns.has(parent)) continue;
    const list = byParent.get(parent);
    if (list) list.push(call);
    else byParent.set(parent, [call]);
  }
  const out: string[] = [];
  for (const call of calls) {
    if (call.parentCallId && spawns.has(call.parentCallId)) continue;
    out.push(toolLine(call));
    for (const child of byParent.get(call.id) ?? []) out.push(toolLine(child, 1));
  }
  return out;
}

/**
 * One delegation as a Markdown document — the execution record, the worker's
 * own calls, its transcript and its returned summary.
 *
 * Every section is omitted when the underlying field is absent, so a Cursor run
 * (which reports none of this) exports a short honest stub rather than a
 * document full of empty headings.
 */
export function subagentToMarkdown(
  call: AgentToolCall,
  children: readonly AgentToolCall[] = [],
): string {
  const info = call.subagent;
  const title = info?.type ? `${info.type} agent` : call.summary;
  const out: string[] = [`# ${title}`, ''];
  if (info?.description) out.push(info.description, '');

  const facts: string[] = [];
  if (info?.durationMs) facts.push(`- **Duration** — ${Math.round(info.durationMs / 1000)}s`);
  if (info?.model) facts.push(`- **Model** — ${info.model}`);
  if (info?.outcome) facts.push(`- **Outcome** — ${info.outcome}`);
  if (info?.toolUses ?? children.length) {
    facts.push(`- **Tool calls** — ${info?.toolUses ?? children.length}`);
  }
  if (info?.totalTokens) facts.push(`- **Tokens** — ${info.totalTokens.toLocaleString()}`);
  if (info?.tools?.length) facts.push(`- **Tools** — ${info.tools.join(', ')}`);
  if (info?.mcpServers?.length) facts.push(`- **MCP servers** — ${info.mcpServers.join(', ')}`);
  if (info?.filesRead) facts.push(`- **Files read** — ${info.filesRead}`);
  if (info?.memoryLookups) facts.push(`- **Memory lookups** — ${info.memoryLookups}`);
  if (info?.permissions?.prompted) {
    const { prompted, denied } = info.permissions;
    facts.push(`- **Permissions** — ${prompted} asked, ${denied} denied`);
  }
  if (facts.length) out.push('## Execution', '', ...facts, '');

  if (info?.validations?.length) {
    out.push('## Validation', '');
    for (const v of info.validations) {
      out.push(`- ${v.ok ? '✓' : '✗'} \`${v.command}\` (${v.kind})`);
    }
    out.push('');
  }
  if (info?.filesChanged?.length) {
    out.push('## Files changed', '');
    for (const f of info.filesChanged) {
      out.push(`- \`${f.path}\` (+${f.adds}/-${f.dels})`);
    }
    out.push('');
  }
  if (children.length) {
    out.push('## Tool calls', '', ...children.map((c) => toolLine(c)), '');
  }
  if (info?.transcript) out.push('## Transcript', '', info.transcript, '');
  if (info?.summary) out.push('## Returned summary', '', info.summary, '');
  return out.join('\n').trimEnd() + '\n';
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
    out.push('**Tools**', '', ...toolLines(toolCalls), '');
  }
  return out.join('\n').trimEnd() + '\n';
}
