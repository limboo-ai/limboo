/**
 * One delegated subagent, maximized into the center column.
 *
 * The inline row in the conversation is the default surface and stays the
 * canonical record. This is the same worker with room to breathe: the live
 * stage readout, its own tool calls as a readable list, and its transcript and
 * summary as full-width prose instead of clamped cards. Opened from the row's
 * Maximize action, closed back to it with Minimize — and because both shells
 * read the same store, minimizing loses nothing.
 *
 * Two shells over one set of presenters (`subagentParts.tsx`), exactly as
 * `DiffView` / `DiffWorkspace` sit over `DiffEditor`. Density is the only
 * difference; what a fact MEANS is decided in one place.
 *
 * `CenterWorkspace` mounts this with `key={documentId}`, so switching tabs
 * remounts it — nothing durable may live in `useState`. Presentation state goes
 * to `subagentViewCache` (survives minimize -> maximize); the worker's own data
 * is subscribed live from `useAgentStore`, which main refreshes by re-emitting
 * `tool-start` for the spawning call on every roll-up.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Bot, Minimize2 } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { EmptyState } from '@/renderer/components/ui';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useDocumentStore, type DocumentId } from '@/renderer/stores/useDocumentStore';
import { InlineApproval } from './InlineApproval';
import { Markdown } from './Markdown';
import { ProseCard } from './ProseCard';
import { currentSubagentStage, subagentStages } from './subagentStages';
import {
  SubagentToolbar,
  useSubagentAwaitingPermission,
  useSubagentChildren,
} from './SubagentActivity';
import {
  ChangedFiles,
  RecordRows,
  StageList,
  StatusMark,
  ToolCallList,
  ValidationRows,
  subagentRecordRows,
  subagentStateLabel,
  subagentTitle,
} from './subagentParts';

export function SubagentWorkspace({
  documentId,
  sessionId,
  callId,
}: {
  documentId: DocumentId;
  sessionId: string;
  callId: string;
}) {
  // Subscribe by id, never by prop. Zustand v5: `find` returns a store-owned
  // reference, so this stays referentially stable between unrelated events —
  // returning a fresh literal here would loop useSyncExternalStore.
  const call = useAgentStore((s) => s.bySession[sessionId]?.toolCalls.find((c) => c.id === callId));
  const pending = useAgentStore((s) => s.pendingBySession[sessionId] ?? null);
  const awaitingPermission = useSubagentAwaitingPermission(sessionId, callId);
  const calls = useSubagentChildren(sessionId, callId);

  const view = useDocumentStore((s) => s.subagentViewFor(documentId));
  const patchView = useDocumentStore((s) => s.patchSubagentView);
  const minimize = useDocumentStore((s) => s.minimize);

  const scroller = useRef<HTMLDivElement>(null);
  const settled = call ? call.status !== 'running' : true;

  const stages = useMemo(() => subagentStages(calls, settled), [calls, settled]);
  const current = currentSubagentStage(stages);

  // Restore the reader's place after a remount (a tab switch). Deliberately
  // mount-only: `view.scrollTop` is written by this component's own onScroll, so
  // depending on it would fight every scroll the reader makes.
  const restored = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || restored.current) return;
    restored.current = true;
    if (view.scrollTop > 0) el.scrollTop = view.scrollTop;
  }, [view.scrollTop]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || settled || !view.autoScroll) return;
    el.scrollTop = el.scrollHeight;
  }, [calls.length, call?.subagent?.transcript, settled, view.autoScroll]);

  if (!call?.subagent) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          compact
          icon={Bot}
          title="This delegation is no longer in the session"
          description="Subagent records are kept per session and are not restored after a restart. The conversation still holds what it returned."
        />
      </div>
    );
  }

  const info = call.subagent;
  const failed = call.status === 'error' || call.status === 'denied';
  const title = subagentTitle(call);
  const state = subagentStateLabel(call, awaitingPermission);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
        <StatusMark settled={settled} failed={failed} awaitingPermission={awaitingPermission} size={13} />
        <span className="shrink-0 text-[12px] font-semibold text-fg">{title}</span>
        <span className={cn('shrink-0 text-[11px]', failed ? 'text-danger' : 'text-muted')}>
          {state}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-faint" title={info.description}>
          {info.description}
        </span>
        <SubagentToolbar call={call} calls={calls} always />
        <button
          type="button"
          aria-label="Restore to the conversation"
          title="Restore to the conversation"
          onClick={() => minimize(sessionId, documentId)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Minimize2 size={14} />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          patchView(documentId, { scrollTop: el.scrollTop });
          // Following stops the moment the reader scrolls up, and resumes when
          // they return to the bottom — the behaviour every log viewer has.
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (atBottom !== view.autoScroll) patchView(documentId, { autoScroll: atBottom });
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
          {/* A maximized tab has no composer — CenterWorkspace drops the whole
              conversation chrome. Without this, a worker that stops for approval
              would strand a reader who is watching it here. */}
          {pending && awaitingPermission && (
            <InlineApproval request={pending} />
          )}

          {!settled && (
            <StageList
              stages={stages}
              announce={current?.label}
              progress={info.progress}
              lastTool={info.lastTool}
            />
          )}

          <RecordRows rows={subagentRecordRows(call, calls.length)} />

          {info.error && (
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[10px] uppercase tracking-wider text-faint">error</span>
              <p className="px-1 text-[12px] leading-relaxed text-danger">{info.error}</p>
            </div>
          )}

          <ValidationRows validations={info.validations} />
          <ChangedFiles sessionId={sessionId} files={info.filesChanged} />
          <ToolCallList calls={calls} />

          {/* Unclamped here: the room is the point of maximizing. Bare for the
              same reason as inline — every other section of this record is a
              plain labelled list, so these two must be too. Open/closed state
              rides the view cache so it survives a round-trip. */}
          {info.transcript && (
            <ProseCard
              label="subagent transcript"
              variant="bare"
              defaultOpen={view.transcriptOpen}
              clampHeight={0}
            >
              <Markdown text={info.transcript} />
            </ProseCard>
          )}
          {info.summary && (
            <ProseCard
              label="returned summary"
              variant="bare"
              defaultOpen={view.summaryOpen}
              clampHeight={0}
            >
              <Markdown text={info.summary} />
            </ProseCard>
          )}
        </div>
      </div>
    </section>
  );
}
