/**
 * A subagent, rendered as ONE inline activity in the conversation stream.
 *
 * ## Why there is no subagent PANEL
 *
 * Claude Code's documented model is that a subagent works in its own context
 * window and returns only a distilled result to the parent — its intermediate
 * tool calls and reasoning stay inside it by design. A permanent side panel
 * would duplicate what the timeline and the Tasks drawer already show, and would
 * invite users to manage several conversations at once when the whole point of
 * delegation is that they manage one. So orchestration is observed here.
 *
 * A **maximized document tab** is a different claim from a permanent panel: it
 * is transient, explicitly opened, and shows the same worker this row shows.
 * `SubagentWorkspace` is that tab, and both are thin shells over the shared
 * presenters in `subagentParts.tsx` — the `DiffView` / `DiffWorkspace` split.
 *
 * ## Conventions
 *
 * Rows sit at the stream's own typographic weight, never a card.
 *
 * The transcript and the returned summary are `ProseCard variant="bare"`: they
 * keep the disclosure and the clamp — which is what actually made them readable
 * — but no surround. Inside this record they sit among `validation`, `files
 * changed` and `tool calls`, all plain labelled sections, so boxing only these
 * two made them look like a different KIND of thing in one list. A border earns
 * its place when it separates a document from unrelated content (the approved
 * plan in a user turn, which keeps one); not when everything around it is the
 * same document.
 *
 * State is the icon (HelixLoader running, accent while live, `text-success`
 * check complete, `text-warning` on a permission pause, `CircleAlert` on
 * failure) AND the word — colour alone is not an accessible status. Never a
 * coloured strip.
 *
 * The reasoning tokens are absent and nothing implies otherwise: neither
 * provider exposes a subagent's chain of thought. The transcript is narration.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Download, Maximize2, Network } from 'lucide-react';
import type { AgentToolCall } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { CopyButton, IconButton } from '@/renderer/components/ui';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { revealInGraph } from '@/renderer/features/graph/focus';
import { downloadText, slugify } from '@/renderer/lib/download';
import { subagentToMarkdown } from '@/renderer/lib/messageMarkdown';
import { Markdown } from './Markdown';
import { ProseCard } from './ProseCard';
import { currentSubagentStage, formatDuration, subagentStages } from './subagentStages';
import {
  ChangedFiles,
  RecordRows,
  StageList,
  StatusMark,
  ValidationRows,
  subagentRecordRows,
  subagentStateLabel,
  subagentTitle,
} from './subagentParts';

/** Subscribe to a worker's own tool calls. Shared by both shells. */
export function useSubagentChildren(sessionId: string, callId: string): AgentToolCall[] {
  const all = useAgentStore((s) => s.bySession[sessionId]?.toolCalls);
  return useMemo(() => (all ?? []).filter((c) => c.parentCallId === callId), [all, callId]);
}

/** True while a permission prompt raised by THIS worker awaits an answer. */
export function useSubagentAwaitingPermission(sessionId: string, callId: string): boolean {
  return useAgentStore((s) => s.pendingBySession[sessionId]?.parentCallId === callId);
}

export function SubagentActivity({ call }: { call: AgentToolCall }) {
  const [open, setOpen] = useState(false);
  // Subscribed rather than passed down, for the reason LiveStatusRow subscribes:
  // the owning turn is memoized on coarse props, so a prop would go stale
  // exactly when the row needs to change. Passing the worker's calls down would
  // also put an array in TurnView's identity-comparing memo, re-rendering every
  // settled turn on every streaming delta.
  const awaitingPermission = useSubagentAwaitingPermission(call.sessionId, call.id);
  const calls = useSubagentChildren(call.sessionId, call.id);

  const settled = call.status !== 'running';
  const failed = call.status === 'error' || call.status === 'denied';
  const info = call.subagent;

  const stages = useMemo(() => subagentStages(calls, settled), [calls, settled]);
  const current = currentSubagentStage(stages);

  const title = subagentTitle(call);
  const task = info?.description ?? call.target;
  const state = subagentStateLabel(call, awaitingPermission);

  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${title} ${state}. ${task ?? ''}`}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-2',
            settled ? 'text-[11.5px]' : 'text-[12px]',
          )}
        >
          <StatusMark settled={settled} failed={failed} awaitingPermission={awaitingPermission} />
          <span
            className={cn(
              'shrink-0 font-medium',
              failed ? 'text-danger' : settled ? 'text-muted' : 'text-accent',
            )}
          >
            {title}
          </span>
          <span className="min-w-0 flex-1 truncate text-faint" title={task}>
            {failed && settled ? 'did not complete' : task}
          </span>
          {settled && !open && <SettledMeta call={call} childCount={calls.length} />}
          <ChevronRight
            size={13}
            className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')}
          />
        </button>
        <SubagentToolbar call={call} calls={calls} />
      </div>

      {/* Live stages always show; the record is behind the disclosure so a
          settled turn stays one line until the reader asks for more. */}
      {(!settled || open) && (
        <div className="ml-1.5 flex flex-col gap-1.5 border-l border-line pl-2">
          {!settled && (
            <StageList
              stages={stages}
              announce={current?.label}
              progress={info?.progress}
              lastTool={info?.lastTool}
            />
          )}
          {open && <ExecutionRecord call={call} calls={calls} />}
        </div>
      )}
    </div>
  );
}

/**
 * Row actions, revealed on hover OR keyboard focus — a toolbar reachable only
 * with a mouse is not reachable. Opacity, not display, so focus can still land
 * on it. The `MessageActions` idiom, and the `GitFileRow` reveal.
 */
export function SubagentToolbar({
  call,
  calls,
  always = false,
}: {
  call: AgentToolCall;
  calls: readonly AgentToolCall[];
  /** The maximized tab's header always shows its actions. */
  always?: boolean;
}) {
  const info = call.subagent;
  const title = subagentTitle(call);
  const promote = useDocumentStore((s) => s.promote);

  const exportRecord = () => {
    downloadText(`${slugify(title, 'subagent')}.md`, subagentToMarkdown(call, calls));
  };

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5 transition-opacity',
        !always &&
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100',
      )}
    >
      {info?.summary && (
        // The function form reads at CLICK time, so copying a worker that is
        // still streaming captures everything that has arrived.
        <CopyButton value={() => info.summary ?? ''} label="Copy the returned summary" size={13} />
      )}
      {info?.transcript && (
        <CopyButton
          value={() => info.transcript ?? ''}
          label="Copy the transcript"
          size={13}
          className="[&_svg]:opacity-70"
        />
      )}
      <IconButton size="sm" label="Export this delegation as Markdown" onClick={exportRecord}>
        <Download size={13} />
      </IconButton>
      <IconButton
        size="sm"
        label="Show this delegation in the work graph"
        onClick={() => revealInGraph({ kind: 'tool', id: call.id })}
      >
        <Network size={13} />
      </IconButton>
      {!always && (
        <IconButton
          size="sm"
          label="Open in the workspace"
          onClick={() => promote(call.sessionId, { kind: 'subagent', callId: call.id, title })}
        >
          <Maximize2 size={13} />
        </IconButton>
      )}
    </div>
  );
}

/** The expanded execution record, inline density. */
function ExecutionRecord({
  call,
  calls,
}: {
  call: AgentToolCall;
  calls: readonly AgentToolCall[];
}) {
  const info = call.subagent;
  const rows = subagentRecordRows(call, calls.length);

  return (
    <div className="flex flex-col gap-2 py-0.5 animate-fade-in">
      <RecordRows rows={rows} />

      {info?.error && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1 text-[10px] uppercase tracking-wider text-faint">error</span>
          <p className="px-1 text-[11.5px] leading-relaxed text-danger">{info.error}</p>
        </div>
      )}

      <ValidationRows validations={info?.validations} />
      <ChangedFiles sessionId={call.sessionId} files={info?.filesChanged} />

      {/* BARE, not boxed. These sit among `validation`, `files changed` and the
          rest — all plain labelled sections — so a border around only these two
          made them look like a different kind of thing inside one record. They
          keep the disclosure and the clamp, which is what actually fixed the
          readability; the surround was never the part doing the work. */}
      {info?.transcript && (
        <ProseCard
          label="subagent transcript"
          variant="bare"
          defaultOpen={false}
          clampHeight={280}
          actions={<CopyButton value={() => info.transcript ?? ''} label="Copy the transcript" />}
        >
          <Markdown text={info.transcript} />
        </ProseCard>
      )}
      {info?.summary && (
        <ProseCard
          label="returned summary"
          variant="bare"
          clampHeight={320}
          actions={<CopyButton value={() => info.summary ?? ''} label="Copy the summary" />}
        >
          <Markdown text={info.summary} />
        </ProseCard>
      )}
    </div>
  );
}

/** Compact ` · `-joined figures on the collapsed row — the stream's meta idiom. */
function SettledMeta({ call, childCount }: { call: AgentToolCall; childCount: number }) {
  const info = call.subagent;
  const bits: string[] = [];
  const durationMs = info?.durationMs ?? (call.endedAt ? call.endedAt - call.startedAt : 0);
  if (durationMs) bits.push(formatDuration(durationMs));
  const tools = info?.toolUses ?? childCount;
  if (tools) bits.push(`${tools} ${tools === 1 ? 'tool' : 'tools'}`);
  const changed = info?.filesChanged?.length ?? 0;
  if (changed) bits.push(`${changed} ${changed === 1 ? 'file' : 'files'}`);
  if (!bits.length) return null;
  return <span className="shrink-0 text-[10.5px] text-faint">{bits.join(' · ')}</span>;
}
