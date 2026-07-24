/**
 * The Hooks panel — the Provider-Neutral Hook Engine's governance audit trail
 * for the active session. Every normalized lifecycle event (session/prompt/tool
 * gate/checkpoint/subagent) arrives redacted from the main process with a phase,
 * a provider, an optional allow/deny decision, and a timestamp. Because BOTH
 * providers emit onto the one bus, this trail reads identically whether Claude
 * or Cursor produced the run. Display-only — enforcement lives in the main
 * process, never here. Mirrors the AgentConsolePanel idiom (segmented filter +
 * reversed list + expandable rows).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  CircleDot,
  FileEdit,
  FlagTriangleRight,
  GitBranch,
  MessageSquare,
  Play,
  ShieldQuestion,
  Square,
  TerminalSquare,
  Trash2,
  Webhook,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { HookEvent, HookPhase } from '@shared/types';
import { EmptyState, IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { relativeTime } from '@/renderer/lib/format';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useHookStore, EMPTY_HOOKS } from '@/renderer/stores/useHookStore';

type IconType = ComponentType<{ size?: number; className?: string }>;

const PHASE_ICON: Record<HookPhase, IconType> = {
  'session-start': Play,
  'session-end': Square,
  'prompt-submit': MessageSquare,
  'pre-tool-use': Wrench,
  'permission-request': ShieldQuestion,
  'post-tool-use': Wrench,
  'file-edit': FileEdit,
  'shell-exec': TerminalSquare,
  'mcp-exec': CircleDot,
  checkpoint: GitBranch,
  'run-finished': FlagTriangleRight,
  'subagent-start': Webhook,
  'subagent-stop': Webhook,
};

const PHASE_LABEL: Record<HookPhase, string> = {
  'session-start': 'Session start',
  'session-end': 'Session end',
  'prompt-submit': 'Prompt',
  'pre-tool-use': 'Tool gate',
  'permission-request': 'Approval',
  'post-tool-use': 'Tool done',
  'file-edit': 'File edit',
  'shell-exec': 'Shell',
  'mcp-exec': 'MCP',
  checkpoint: 'Checkpoint',
  'run-finished': 'Run finished',
  'subagent-start': 'Subagent start',
  'subagent-stop': 'Subagent stop',
};

const GATE_PHASES: ReadonlySet<HookPhase> = new Set<HookPhase>([
  'pre-tool-use',
  'permission-request',
]);

type Filter = 'all' | 'gate' | 'observe' | 'denied';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gate', label: 'Gate' },
  { id: 'observe', label: 'Observe' },
  { id: 'denied', label: 'Denied' },
];

export function HookAuditPanel() {
  const sessionId = useSessionStore((s) => s.selectedId);
  const events = useHookStore((s) => (sessionId ? s.bySession[sessionId] : undefined) ?? EMPTY_HOOKS);
  const loadSession = useHookStore((s) => s.loadSession);
  const clear = useHookStore((s) => s.clear);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (sessionId) void loadSession(sessionId);
  }, [sessionId, loadSession]);

  const items = useMemo(() => {
    const filtered = events.filter((e) => {
      if (filter === 'gate') return GATE_PHASES.has(e.phase);
      if (filter === 'denied') return e.decision === 'deny';
      if (filter === 'observe') return !GATE_PHASES.has(e.phase);
      return true;
    });
    return [...filtered].reverse();
  }, [events, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="flex flex-1 items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex-1 rounded px-2 py-1 text-[11px] transition-colors',
                filter === f.id ? 'bg-elevated text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <IconButton
          label="Clear hook audit"
          size="sm"
          disabled={!sessionId || events.length === 0}
          onClick={() => sessionId && void clear(sessionId)}
          className="disabled:pointer-events-none disabled:opacity-50"
        >
          <Trash2 size={13} />
        </IconButton>
      </div>

      {items.length === 0 ? (
        <EmptyState
          compact
          icon={Webhook}
          title="No hook events yet"
          description="Every governed action — session start, prompt, tool gate, file edit, shell command, checkpoint — streams into this audit trail as the agent works, for whichever provider is running."
        />
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((e) => (
            <HookRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HookRow({ event }: { event: HookEvent }) {
  const [open, setOpen] = useState(false);
  const Icon = PHASE_ICON[event.phase] ?? Webhook;
  const expandable = !!event.detail;
  const tone =
    event.decision === 'deny'
      ? 'text-danger'
      : event.severity === 'error'
        ? 'text-danger'
        : event.severity === 'warning'
          ? 'text-warning'
          : 'text-muted';

  return (
    <li className="rounded-md hover:bg-surface-2">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left"
      >
        <Icon size={13} className={cn('mt-0.5 shrink-0', tone)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg">
              {event.summary || PHASE_LABEL[event.phase]}
            </span>
            <span className="shrink-0 text-[10px] text-faint">{relativeTime(event.at)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint">
            <span>{PHASE_LABEL[event.phase]}</span>
            <span aria-hidden>·</span>
            <span>{event.provider === 'cursor' ? 'Cursor' : 'Claude'}</span>
            {event.decision && <DecisionBadge decision={event.decision} auto={event.auto} />}
          </div>
        </div>
      </button>
      {open && event.detail && (
        <pre className="mx-2 mb-1.5 max-h-40 overflow-auto rounded-md border border-line bg-[#0a0a0a] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted">
          {event.detail}
        </pre>
      )}
    </li>
  );
}

function DecisionBadge({ decision, auto }: { decision: 'allow' | 'deny' | 'ask'; auto?: boolean }) {
  if (decision === 'deny') {
    return (
      <span className="inline-flex items-center gap-0.5 text-danger">
        <Ban size={10} /> denied
      </span>
    );
  }
  if (decision === 'ask') {
    return (
      <span className="inline-flex items-center gap-0.5 text-warning">
        <ShieldQuestion size={10} /> ask
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-success">
      <Check size={10} /> {auto ? 'auto' : 'allowed'}
    </span>
  );
}
