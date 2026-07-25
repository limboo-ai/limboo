/**
 * Structural search over the Work Graph.
 *
 * The point of a typed graph is that you can ask it questions by SHAPE rather
 * than by text — "which tasks were blocked", "which commits followed a failed
 * command". The canned traversals below are those questions, pre-composed;
 * the free-text box is the escape hatch that seeds an arbitrary traversal.
 */
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import type { WorkGraphQuery } from '@shared/types';
import { GRAPH_LIMITS } from '@shared/constants';
import { cn } from '@/renderer/lib/cn';

/** A pre-composed structural question. */
interface CannedQuery {
  id: string;
  label: string;
  build: (text: string) => WorkGraphQuery;
}

const base = (text: string): WorkGraphQuery => ({
  text: text.trim() || undefined,
  direction: 'down',
  includeDerived: true,
  depth: GRAPH_LIMITS.maxDepth.default,
  limit: GRAPH_LIMITS.queryLimit.default,
});

export const CANNED_QUERIES: CannedQuery[] = [
  {
    id: 'blocked',
    label: 'Blocked work',
    // Walk UP from approvals: an approval's ancestors are the work it blocked.
    build: (text) => ({ ...base(text), kinds: ['approval'], edgeKinds: ['blocked-by'], direction: 'up' }),
  },
  {
    id: 'failed-commands',
    label: 'Commands run',
    build: (text) => ({ ...base(text), kinds: ['terminal'] }),
  },
  {
    id: 'commits',
    label: 'Commits',
    build: (text) => ({ ...base(text), kinds: ['git'] }),
  },
  {
    id: 'mcp',
    label: 'External tools',
    build: (text) => ({ ...base(text), kinds: ['mcp'] }),
  },
  {
    id: 'files',
    label: 'Files changed',
    build: (text) => ({ ...base(text), kinds: ['file'], edgeKinds: ['implemented-in'], direction: 'up' }),
  },
  {
    id: 'recalled',
    label: 'Memory recalled',
    build: (text) => ({ ...base(text), kinds: ['memory'] }),
  },
];

interface GraphQueryBarProps {
  active: string | null;
  resultCount: number | null;
  truncated: boolean;
  onRun: (query: WorkGraphQuery, id: string | null) => void;
  onClear: () => void;
}

export function GraphQueryBar({
  active,
  resultCount,
  truncated,
  onRun,
  onClear,
}: GraphQueryBarProps) {
  const [text, setText] = useState('');

  const run = (canned: CannedQuery | null): void => {
    if (!canned) {
      if (!text.trim()) {
        onClear();
        return;
      }
      onRun(base(text), null);
      return;
    }
    onRun(canned.build(text), canned.id);
  };

  return (
    <div className="shrink-0 border-b border-line px-2 py-1.5">
      <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2">
        <Search size={12} className="shrink-0 text-faint" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(null);
            if (e.key === 'Escape') {
              setText('');
              onClear();
            }
          }}
          placeholder="Search this session's work…"
          maxLength={GRAPH_LIMITS.textMax}
          className="h-7 w-full bg-transparent text-[12px] text-fg placeholder:text-faint focus:outline-none"
        />
        {(text || active) && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText('');
              onClear();
            }}
            className="text-faint hover:text-fg"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {CANNED_QUERIES.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => (active === q.id ? onClear() : run(q))}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] transition-colors',
              active === q.id
                ? 'bg-accent/15 text-accent'
                : 'bg-surface-2 text-muted hover:text-fg',
            )}
          >
            {q.label}
          </button>
        ))}
        {resultCount !== null && (
          <span className="ml-auto text-[10px] text-faint">
            {resultCount} match{resultCount === 1 ? '' : 'es'}
            {truncated && ' (capped)'}
          </span>
        )}
      </div>
    </div>
  );
}
