/**
 * The shared presenters behind BOTH subagent surfaces.
 *
 * `SubagentActivity` (the inline row) and `SubagentWorkspace` (the maximized
 * tab) are two thin shells over these, exactly as `DiffView` and `DiffWorkspace`
 * are two shells over `DiffEditor`. Sharing one implementation is what makes
 * maximize -> minimize lossless: the same stages, the same record, the same
 * prose, rendered at two densities rather than written twice and drifting.
 *
 * Density is the ONLY thing the shells vary. Everything about what a fact means
 * — which figures are shown, which are omitted for want of evidence, which glyph
 * a state gets — lives here so the two can never disagree.
 */
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, TriangleAlert } from 'lucide-react';
import type { AgentToolCall, SubagentInfo } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { HelixLoader } from '@/renderer/components/ui';
import { DiffStat } from '@/renderer/components/ui/DiffStat';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { formatDuration, type subagentStages } from './subagentStages';

/**
 * Tool-call count above which the list arrives collapsed.
 *
 * Evaluated once, at mount, and that is deliberate. Opening a settled worker's
 * tab shows the final count immediately, so a forty-call run starts folded. A
 * worker being watched live starts at zero and therefore starts open — and stays
 * open as it grows, because collapsing the list out from under someone who is
 * watching it fill would be worse than a long list.
 */
const TOOL_LIST_AUTO_COLLAPSE = 8;

/** Words for the worker's state. Colour alone is not an accessible status. */
export function subagentStateLabel(
  call: AgentToolCall,
  awaitingPermission?: boolean,
): string {
  const failed = call.status === 'error' || call.status === 'denied';
  if (failed) return call.subagent?.outcome === 'stopped' ? 'Stopped' : 'Failed';
  if (call.status !== 'running') return 'Completed';
  return awaitingPermission ? 'Waiting for permission' : 'Running';
}

/** The worker's display name. */
export function subagentTitle(call: AgentToolCall): string {
  return call.subagent?.type ? `${call.subagent.type} agent` : call.summary;
}

/** The one state glyph: live loader, success, permission pause, failure. */
export function StatusMark({
  settled,
  failed,
  awaitingPermission,
  size = 12,
}: {
  settled: boolean;
  failed: boolean;
  awaitingPermission?: boolean;
  size?: number;
}) {
  if (failed) return <CircleAlert size={size} className="shrink-0 text-danger" />;
  if (settled) return <Check size={size} className="shrink-0 text-success" />;
  if (awaitingPermission) return <TriangleAlert size={size} className="shrink-0 text-warning" />;
  return <HelixLoader size={size} label="Subagent running" />;
}

/**
 * The live stage readout.
 *
 * Two tiers, and the order matters. When the provider is producing its own
 * progress line (`agentProgressSummaries`), that line leads — it is the model
 * describing its own work ("Analyzing authentication module") and beats anything
 * derived from tool names. The derived stages stay beneath it as the structural
 * readout, and are the whole story when the provider reports nothing (summaries
 * disabled, or a Cursor run).
 */
export function StageList({
  stages,
  announce,
  progress,
  lastTool,
}: {
  stages: ReturnType<typeof subagentStages>;
  announce?: string;
  progress?: string;
  lastTool?: string;
}) {
  return (
    <div className="flex flex-col gap-1 animate-fade-in" aria-live="polite">
      {progress && (
        <div className="flex items-center gap-2 px-1 text-[11.5px] text-fg">
          <HelixLoader size={12} label={progress} />
          <span className="min-w-0 flex-1 truncate">{progress}</span>
          {lastTool && (
            <span className="shrink-0 font-mono text-[10.5px] text-faint">{lastTool}</span>
          )}
        </div>
      )}
      {stages.map((s) => (
        <div
          key={s.id}
          className={cn(
            'flex items-center gap-2 px-1 text-[11.5px]',
            s.state === 'active' ? 'text-muted' : 'text-faint',
          )}
        >
          {s.state === 'active' ? (
            <HelixLoader size={12} label={s.label} />
          ) : s.state === 'done' ? (
            <Check size={12} className="shrink-0 text-success" />
          ) : (
            <span className="ml-[1px] h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
          )}
          <span className={cn('truncate', s.state === 'done' && 'opacity-80')}>{s.label}</span>
        </div>
      ))}
      <span className="sr-only">{announce}</span>
    </div>
  );
}

/**
 * The measured facts, as label/value rows.
 *
 * Facts only, and only facts something actually measured. A field the provider
 * did not report is omitted rather than filled with a plausible default — the
 * same rule the release document follows for the signing fields it cannot stand
 * behind.
 */
export function subagentRecordRows(
  call: AgentToolCall,
  childCount: number,
): Array<[string, string]> {
  const info = call.subagent;
  const rows: Array<[string, string]> = [];
  // The provider's measured duration beats the wall-clock difference: it
  // excludes time the worker spent queued.
  const durationMs = info?.durationMs ?? (call.endedAt ? call.endedAt - call.startedAt : 0);
  const duration = durationMs ? formatDuration(durationMs) : '';
  if (duration) rows.push(['duration', duration]);
  if (info?.model) rows.push(['model', info.model]);
  if (info?.background) rows.push(['execution', 'background']);
  if (info?.outcome && info.outcome !== 'completed') rows.push(['outcome', info.outcome]);
  // `toolUses` counts what the worker actually invoked, including calls whose
  // events never reached Limboo; the child list is the fallback.
  const toolCount = info?.toolUses ?? childCount;
  if (toolCount) rows.push(['tool calls', String(toolCount)]);
  if (info?.totalTokens) rows.push(['tokens', info.totalTokens.toLocaleString()]);
  if (info?.tools?.length) rows.push(['tools', info.tools.join(', ')]);
  if (info?.mcpServers?.length) rows.push(['mcp servers', info.mcpServers.join(', ')]);
  if (info?.filesRead) rows.push(['files read', String(info.filesRead)]);
  if (info?.memoryLookups) rows.push(['memory lookups', String(info.memoryLookups)]);
  if (info?.permissions?.prompted) {
    const { prompted, denied } = info.permissions;
    rows.push(['permissions', denied ? `${prompted} asked · ${denied} denied` : `${prompted} asked`]);
  }
  return rows;
}

export function RecordRows({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return null;
  return (
    <dl className="flex flex-col gap-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2 px-1">
          <dt className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-faint">{label}</dt>
          <dd className="min-w-0 flex-1 truncate text-[11.5px] text-muted" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Verification the worker ran. Rendered only when it ran some — a "0 validation
 * steps" line would read as a finding rather than an absence of evidence.
 */
export function ValidationRows({ validations }: { validations: SubagentInfo['validations'] }) {
  if (!validations?.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-1 text-[10px] uppercase tracking-wider text-faint">validation</span>
      {validations.map((v, i) => (
        <div key={`${v.command}-${i}`} className="flex items-center gap-2 px-1 text-[11px]">
          {v.ok ? (
            <Check size={11} className="shrink-0 text-success" />
          ) : (
            <CircleAlert size={11} className="shrink-0 text-danger" />
          )}
          <span className="shrink-0 uppercase tracking-wider text-faint">{v.kind}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-faint" title={v.command}>
            {v.command}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Files the worker changed. Each opens its own diff review through the same
 * `promote` call the Changes navigator makes — the Git tab is deliberately not
 * the target, because `GitFocus.path` is written by three call sites and read by
 * none, so "open Git focused on this path" does not actually exist.
 */
export function ChangedFiles({
  sessionId,
  files,
}: {
  sessionId: string;
  files: SubagentInfo['filesChanged'];
}) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-1 text-[10px] uppercase tracking-wider text-faint">files changed</span>
      {files.map((f) => (
        <button
          key={f.path}
          type="button"
          title={`Open the diff for ${f.path}`}
          onClick={() =>
            useDocumentStore
              .getState()
              .promote(sessionId, { kind: 'diff', path: f.path, staged: false })
          }
          className="group flex items-center gap-2 px-1 text-left text-[11px] transition-colors"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-faint group-hover:text-accent">
            {f.path}
          </span>
          {(f.adds > 0 || f.dels > 0) && <DiffStat adds={f.adds} dels={f.dels} />}
        </button>
      ))}
    </div>
  );
}

/**
 * The worker's own tool calls, as a readable list. Only the maximized tab has
 * the room for this; the inline row reports the count instead.
 *
 * **Collapsible, and collapsed by default past a handful of calls.** A worker
 * that reads thirty files produces thirty rows, which pushed the transcript and
 * the summary — the things a reader actually came for — off the bottom of the
 * tab. The count stays visible in the label either way, so collapsing hides
 * detail, never the fact that the work happened.
 */
export function ToolCallList({ calls }: { calls: readonly AgentToolCall[] }) {
  const [open, setOpen] = useState(calls.length <= TOOL_LIST_AUTO_COLLAPSE);
  if (calls.length === 0) return null;
  const running = calls.filter((c) => c.status === 'running').length;
  const failed = calls.filter((c) => c.status === 'error').length;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-1 text-left text-[10px] font-medium uppercase tracking-wider text-faint transition-colors hover:text-muted"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>tool calls ({calls.length})</span>
        {/* Anything the reader would want to know BEFORE deciding to expand
            belongs on the collapsed row. */}
        {running > 0 && <span className="text-accent">· {running} running</span>}
        {failed > 0 && <span className="text-danger">· {failed} failed</span>}
      </button>
      {open && (
      <ul className="flex flex-col gap-0.5">
        {calls.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-1 text-[11.5px]">
            {c.status === 'running' ? (
              <HelixLoader size={11} label={c.summary} />
            ) : (
              <span
                className={cn(
                  'ml-[1px] h-1.5 w-1.5 shrink-0 rounded-full',
                  c.status === 'done' && 'bg-success',
                  c.status === 'error' && 'bg-danger',
                  c.status === 'denied' && 'bg-faint',
                )}
              />
            )}
            <span
              className={cn(
                'shrink-0 font-mono text-[11px] font-medium',
                c.risk === 'command' ? 'text-warning' : 'text-faint',
              )}
            >
              {c.name}
            </span>
            <span className="shrink-0 text-muted">{c.summary}</span>
            {c.target && (
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-faint" title={c.target}>
                {c.target}
              </span>
            )}
            {c.change && (c.change.adds > 0 || c.change.dels > 0) && (
              <DiffStat adds={c.change.adds} dels={c.change.dels} />
            )}
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
