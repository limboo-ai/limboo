/**
 * The Work Graph panel — a full-bleed drawer workspace, like Git and Terminal.
 *
 * It owns its own header and canvas rather than sitting in the drawer's padded
 * scrolling body, because a graph needs an unpadded viewport with its own
 * scroll container.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clipboard,
  Download,
  List,
  ListTree,
  Network,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { GRAPH_LIMITS, clamp } from '@shared/constants';
import type { WorkGraphNodeKind } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { IconButton } from '@/renderer/components/ui/IconButton';
import { Spinner } from '@/renderer/components/ui/Spinner';
import { useGraphStore } from '@/renderer/stores/useGraphStore';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { GraphCanvas } from './GraphCanvas';
import { GraphInspector } from './GraphInspector';
import { GraphLegend } from './GraphLegend';
import { GraphOutline } from './GraphOutline';
import { buildGraphView, buildOutline } from './viewModel';
import { GraphQueryBar } from './GraphQueryBar';
import { GraphReplayBar } from './GraphReplayBar';
import { useGraphLayout } from './useGraphLayout';
import { renderLayoutSvg, renderPng } from './exportImage';
import { ROW_H } from './layout/types';

type SubTab = 'graph' | 'outline' | 'legend';

/**
 * `system.clipboardWrite` hard-slices at 1 MB in the main process. Anything
 * larger used to be silently truncated into invalid JSON behind a success
 * toast; now the export is routed to a file instead.
 */
const CLIPBOARD_MAX = 1_000_000;

const SUB_TABS: { id: SubTab; label: string; icon: typeof Network }[] = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'outline', label: 'Outline', icon: List },
  { id: 'legend', label: 'Legend', icon: ListTree },
];

/** Kind chips offered as filters, in the order they typically appear in a run. */
const FILTER_KINDS: WorkGraphNodeKind[] = [
  'objective',
  'planning',
  'task',
  'terminal',
  'file',
  'git',
  'mcp',
  'memory',
  'approval',
];

export function WorkGraphPanel() {
  const [tab, setTab] = useState<SubTab>('graph');
  /** Replay cutoff — a pure view filter over the real timestamps, not a setting. */
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const loading = useGraphStore((s) => s.loading);
  const truncated = useGraphStore((s) => s.truncated);
  const health = useGraphStore((s) => s.health);
  const sessionId = useGraphStore((s) => s.sessionId) ?? '';
  const selectedId = useGraphStore((s) => s.selectedId);
  const revealId = useGraphStore((s) => s.revealId);
  const kindFilter = useGraphStore((s) => s.kindFilter);
  const zoom = useGraphStore((s) => s.zoom);
  const queryMatches = useGraphStore((s) => s.queryMatches);
  const activeQueryId = useGraphStore((s) => s.activeQueryId);
  const queryTruncated = useGraphStore((s) => s.queryTruncated);
  const querying = useGraphStore((s) => s.querying);
  const runQuery = useGraphStore((s) => s.runQuery);
  const clearQuery = useGraphStore((s) => s.clearQuery);
  const exportGraph = useGraphStore((s) => s.exportGraph);
  const pruneGraph = useGraphStore((s) => s.prune);
  const select = useGraphStore((s) => s.select);
  const reveal = useGraphStore((s) => s.reveal);
  const toggleKind = useGraphStore((s) => s.toggleKind);
  const setZoom = useGraphStore((s) => s.setZoom);

  const addToast = useUIStore((s) => s.addToast);
  const cfg = useSettingsStore((s) => s.settings.graph);
  const density = useSettingsStore((s) => s.settings.appearance.density);
  const reducedMotion = useSettingsStore((s) => s.settings.appearance.reducedMotion);
  /** Groups the user expanded by hand, overriding the two auto-collapse rules. */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const rowHeight = density === 'compact' ? ROW_H.compact : ROW_H.comfortable;

  // Filtering hides nodes from the canvas but never from the layout input:
  // dropping a node from the layout would re-flow every lane beneath it, so a
  // filter would silently rearrange the history the user is reading.
  /**
   * The shape settings (checkpoints, subagent grouping, completed-branch
   * collapsing, compact merging) — applied BEFORE the layout, because unlike a
   * filter they genuinely change which rows exist. Every rule only hides nodes
   * behind a node that is still drawn, so the graph never gains a hole, and
   * `groupCounts` is what turns a stand-in node into an expandable one.
   */
  const graphView = useMemo(
    () =>
      buildGraphView(nodes, edges, {
        checkpointIntegration: cfg.checkpointIntegration,
        groupSubagents: cfg.groupSubagents,
        autoCollapseCompleted: cfg.autoCollapseCompleted,
        layoutAlgorithm: cfg.layoutAlgorithm,
        expandedGroups,
      }),
    [
      nodes,
      edges,
      cfg.checkpointIntegration,
      cfg.groupSubagents,
      cfg.autoCollapseCompleted,
      cfg.layoutAlgorithm,
      expandedGroups,
    ],
  );
  const shapedNodes = graphView.nodes;

  // Filtering hides nodes from the canvas but never from the layout input:
  // dropping a node from the layout would re-flow every lane beneath it, so a
  // filter would silently rearrange the history the user is reading.
  const visibleNodes = useMemo(() => {
    let out =
      kindFilter.length === 0 ? shapedNodes : shapedNodes.filter((n) => kindFilter.includes(n.kind));
    // Replay is just a timestamp filter — every node already carries a real one,
    // so nothing extra had to be recorded to make this work.
    if (replayAt !== null) out = out.filter((n) => n.startedAt <= replayAt);
    return out;
  }, [shapedNodes, kindFilter, replayAt]);

  const outline = useMemo(
    () => buildOutline(shapedNodes, cfg.outlineGroupBy),
    [shapedNodes, cfg.outlineGroupBy],
  );

  // Node-appear transitions, forced off under the global reduced-motion pref —
  // an accessibility setting must win over a feature setting, not negotiate.
  const animate = cfg.animate && !reducedMotion;

  /** Ascending node timestamps — the positions the replay scrubber stops at. */
  const stamps = useMemo(
    () => nodes.map((n) => n.startedAt).sort((a, b) => a - b),
    [nodes],
  );

  const maxLanes = clamp(cfg.maxLanes, GRAPH_LIMITS.maxLanes.min, GRAPH_LIMITS.maxLanes.max);
  const maxDepth = clamp(cfg.maxDepth, GRAPH_LIMITS.maxDepth.min, GRAPH_LIMITS.maxDepth.max);

  const { layout, computing, tooLarge } = useGraphLayout({
    nodes: shapedNodes,
    edges,
    maxLanes,
    rowHeight,
  });

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? nodesById.get(selectedId) : undefined;
  const selectedEdges = useMemo(
    () => (selectedId ? edges.filter((e) => e.src === selectedId || e.dst === selectedId) : []),
    [edges, selectedId],
  );

  /**
   * Export, to the clipboard or to a file.
   *
   * The data formats (JSON, Markdown, Mermaid, DOT, CSV, HTML) are rendered in
   * main from the stored graph. SVG and PNG are rendered HERE, because they
   * need a layout and the layout only exists in the renderer — but offscreen
   * from the full layout, never by serializing the virtualized canvas.
   */
  const onExport = async (toFile: boolean): Promise<void> => {
    const format = cfg.exportFormat;
    try {
      // The two image formats can only be produced from a layout, so they are
      // rendered here — but from the WHOLE graph, offscreen, at identity
      // transform. Serializing the live canvas exported only the rows currently
      // scrolled into view, with the zoom baked into the transform.
      let image: string | undefined;
      if (format === 'svg' || format === 'png') {
        if (!layout || layout.rows.length === 0) throw new Error('the graph has no layout yet');
        const rendered = renderLayoutSvg(layout, visibleNodes, edges, {
          rowHeight,
          showEdgeLabels: cfg.showEdgeLabels,
          coloring: cfg.nodeColoring,
        });
        if (format === 'svg') {
          image = rendered.markup;
        } else {
          const png = await renderPng(rendered.markup, rendered.width, rendered.height);
          if (!png) throw new Error('could not rasterize the graph');
          image = png;
        }
      }

      if (toFile) {
        const res = await window.limboo?.graph.save(sessionId, format, image);
        if (!res?.saved) return; // cancelling the dialog is not a failure
        addToast({
          title: `Work Graph saved as ${format.toUpperCase()}`,
          description: res.path,
          tone: 'success',
        });
        return;
      }

      // Clipboard path. `system.clipboardWrite` hard-truncates at 1 MB, which
      // used to turn a large JSON export into invalid JSON behind a success
      // toast — so the size is checked here and the user is sent to the file
      // path instead of being handed something broken.
      const text = image ?? (await exportGraph(format));
      if (!text) throw new Error('export failed');
      if (text.length > CLIPBOARD_MAX) {
        throw new Error(
          `this export is ${Math.ceil(text.length / 1000)} kB — use "Save to file" instead`,
        );
      }
      await window.limboo?.system.clipboardWrite(text);
      addToast({
        title: `Work Graph copied as ${format.toUpperCase()}`,
        description: `${Math.ceil(text.length / 1000)} kB on your clipboard.`,
        tone: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  const onPrune = async (): Promise<void> => {
    await pruneGraph();
    addToast({ title: 'Pruned orphaned nodes', tone: 'success' });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pl-2 pr-1.5">
        <Workflow size={13} className="shrink-0 text-muted" />
        <span className="text-[12px] font-medium text-fg">Work Graph</span>
        {(loading || computing || querying) && <Spinner size={11} />}
        {nodes.length > 0 && (
          <span className="text-[10px] text-faint">
            {nodes.length} node{nodes.length === 1 ? '' : 's'}
            {truncated && ' (trimmed)'}
          </span>
        )}
        <div className="ml-auto flex items-center">
          <IconButton
            label="Zoom out"
            size="sm"
            onClick={() => setZoom(zoom / 1.25)}
            disabled={zoom <= GRAPH_LIMITS.zoom.min}
          >
            <span className="text-[13px] leading-none">&minus;</span>
          </IconButton>
          <IconButton
            label="Reset zoom"
            size="sm"
            onClick={() => setZoom(GRAPH_LIMITS.zoom.default)}
          >
            <span className="text-[9px] leading-none">{Math.round(zoom * 100)}%</span>
          </IconButton>
          <IconButton
            label="Zoom in"
            size="sm"
            onClick={() => setZoom(zoom * 1.25)}
            disabled={zoom >= GRAPH_LIMITS.zoom.max}
          >
            <span className="text-[13px] leading-none">+</span>
          </IconButton>
          <IconButton
            label={`Copy as ${cfg.exportFormat.toUpperCase()}`}
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => void onExport(false)}
          >
            <Clipboard size={14} />
          </IconButton>
          <IconButton
            label={`Save as ${cfg.exportFormat.toUpperCase()}`}
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => void onExport(true)}
          >
            <Download size={14} />
          </IconButton>
          <IconButton
            label="Prune orphaned nodes"
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => void onPrune()}
          >
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Close work graph" size="sm" onClick={() => setActiveTab(null)}>
            <X size={14} />
          </IconButton>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
              tab === t.id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
            )}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/*
        Recording health. Every failure inside the graph subsystem is swallowed
        so it can never break a run — which is right, but it left a graph that
        had stopped recording looking exactly like a quiet session. This is the
        honest signal, in the MissingWorktreeBanner idiom.
      */}
      {health && health.failures > 0 && (
        <div className="flex shrink-0 items-start gap-2 border-b border-line bg-surface-2 px-2.5 py-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-[11px] text-fg">
              The work graph is not recording ({health.failures} failed{' '}
              {health.failures === 1 ? 'write' : 'writes'}).
            </p>
            {health.lastError && (
              <p className="mt-0.5 truncate text-[10px] text-faint">{health.lastError}</p>
            )}
          </div>
        </div>
      )}

      {tab === 'legend' ? (
        <GraphLegend coloring={cfg.nodeColoring} droppedEdges={layout.droppedEdges} />
      ) : tab === 'outline' ? (
        shapedNodes.length === 0 ? (
          <EmptyState
            compact
            icon={Workflow}
            title="No work recorded yet"
            description="Send a prompt and this session's plans, tools, commands, files, and commits will appear here."
          />
        ) : (
          <GraphOutline
            groups={outline}
            selectedId={selectedId}
            groupCounts={graphView.groupCounts}
            onSelect={select}
          />
        )
      ) : (
        <>
          {nodes.length > 0 && (
            <GraphQueryBar
              active={activeQueryId}
              resultCount={queryMatches ? queryMatches.size : null}
              truncated={queryTruncated}
              onRun={(q, id) => void runQuery(q, id)}
              onClear={clearQuery}
            />
          )}

          {/* Kind filters */}
          {nodes.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-line px-2 py-1.5">
              {FILTER_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] transition-colors',
                    kindFilter.includes(kind)
                      ? 'bg-accent/15 text-accent'
                      : 'bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>
          )}

          {!cfg.enabled ? (
            <EmptyState
              compact
              icon={Workflow}
              title="Work Graph is off"
              description="Turn it on in Settings › Work Graph to record this session's execution structure."
            />
          ) : tooLarge ? (
            <EmptyState
              compact
              icon={Workflow}
              title="Graph too large to lay out"
              description={`This session has ${nodes.length} nodes and the layout worker is unavailable. Reduce the retention cap in Settings › Work Graph, or prune the graph.`}
            />
          ) : nodes.length === 0 ? (
            <EmptyState
              compact
              icon={Workflow}
              title="No work recorded yet"
              description="Send a prompt and this session's plans, tools, commands, files, and commits will appear here as a graph."
            />
          ) : visibleNodes.length === 0 ? (
            <EmptyState
              compact
              icon={Workflow}
              title="No nodes match the filter"
              description="Clear the kind filters above to see the whole graph."
            />
          ) : (
            <GraphCanvas
              nodes={visibleNodes}
              edges={edges}
              layout={layout}
              rowHeight={rowHeight}
              zoom={zoom}
              coloring={cfg.nodeColoring}
              selectedId={selectedId}
              revealId={revealId}
              showSemanticEdges={cfg.showSemanticEdges}
              showDerivedEdges={cfg.showDerivedEdges}
              showEdgeLabels={cfg.showEdgeLabels}
              maxDepth={maxDepth}
              virtualizeThreshold={clamp(
                cfg.virtualizeThreshold,
                GRAPH_LIMITS.virtualizeThreshold.min,
                GRAPH_LIMITS.virtualizeThreshold.max,
              )}
              queryMatches={queryMatches}
              groupCounts={graphView.groupCounts}
              animate={animate}
              onSelect={select}
              onRevealed={() => reveal(null)}
              onZoom={setZoom}
              onExpandGroup={(id) => setExpandedGroups((prev) => new Set(prev).add(id))}
            />
          )}

          {nodes.length > 1 && (
            <GraphReplayBar stamps={stamps} cutoff={replayAt} onChange={setReplayAt} />
          )}

          {selected && (
            <GraphInspector
              node={selected}
              edges={selectedEdges}
              nodesById={nodesById}
              coloring={cfg.nodeColoring}
              timelineSync={cfg.timelineSync}
              artifactPreviews={cfg.artifactPreviews}
              onSelect={select}
            />
          )}
        </>
      )}
    </section>
  );
}
