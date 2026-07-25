/**
 * The Work Graph viewport: a virtualized SVG canvas that renders the lane
 * layout as a git-history-style diagram.
 *
 * VIRTUALIZATION. Rows have a fixed height, so `first = scrollTop / ROW_H` is
 * O(1) and only the visible window's node groups ever mount — roughly forty
 * groups at any viewport size, whether the graph holds fifty nodes or fifty
 * thousand. Edges are culled through the layout's precomputed row buckets, so a
 * frame touches the two or three buckets its window overlaps rather than every
 * edge. Scrolling is a plain `overflow-y` div over a spacer, which keeps the
 * native scrollbar, native keyboard paging, native momentum, and native
 * `scrollIntoView` — all of which a custom scroll emulation would lose.
 *
 * ZOOM NEVER RE-RUNS LAYOUT. The layout lives in abstract (row, lane) space, so
 * zoom is a single `<g transform>` on the SVG. That property is the entire
 * reason for the row/lane abstraction, and it is what makes zooming free.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRAPH_LIMITS } from '@shared/constants';
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { GraphEdge } from './GraphEdge';
import { GraphNode, type NodeColoring } from './GraphNode';
import { laneX, rowY } from './layout/laneLayout';
import { BUCKET_ROWS, LANE_W, LANE_X0, type LayoutResult } from './layout/types';

/** Extra rows rendered above and below the window, to hide scroll latency. */
const OVERSCAN = 8;

/** Width reserved on the right for the git-commit gutter, in px. */
const GUTTER_W = 26;

/** Left offset of the node label column, measured from the last lane. */
const LABEL_GAP = 14;

/** Rough px per node label, used to size the horizontal scroll extent. */
const LABEL_W = 320;

interface GraphCanvasProps {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  layout: LayoutResult;
  rowHeight: number;
  zoom: number;
  coloring: NodeColoring;
  selectedId: string | null;
  revealId: string | null;
  showSemanticEdges: boolean;
  showDerivedEdges: boolean;
  showEdgeLabels: boolean;
  maxDepth: number;
  /** Row count above which the canvas windows its rows instead of drawing all. */
  virtualizeThreshold: number;
  /**
   * Ids matched by the active structural query, or null when none is running.
   * Non-matching nodes are DIMMED, never removed: removing them would re-flow
   * every lane beneath and silently rearrange the history being read.
   */
  queryMatches: Set<string> | null;
  onSelect: (id: string) => void;
  onRevealed: () => void;
  onZoom: (zoom: number) => void;
}

export function GraphCanvas({
  nodes,
  edges,
  layout,
  rowHeight,
  zoom,
  coloring,
  selectedId,
  revealId,
  showSemanticEdges,
  showDerivedEdges,
  showEdgeLabels,
  maxDepth,
  virtualizeThreshold,
  queryMatches,
  onSelect,
  onRevealed,
  onZoom,
}: GraphCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const placedById = useMemo(
    () => new Map(layout.rows.map((r) => [r.id, r])),
    [layout.rows],
  );

  /* --- viewport measurement ------------------------------------------ */

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    setViewportH(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  /* --- zoom ----------------------------------------------------------- */

  // Ctrl/Cmd + wheel (and trackpad pinch, which browsers report as ctrlKey)
  // zooms; a plain wheel keeps its native scroll. Registered non-passively so
  // preventDefault actually stops the browser's own page zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Anchor the zoom on the pointer: keep the row under the cursor put.
      const before = (el.scrollTop + e.offsetY) / zoom;
      const next = Math.min(
        GRAPH_LIMITS.zoom.max,
        Math.max(GRAPH_LIMITS.zoom.min, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)),
      );
      onZoom(next);
      el.scrollTop = Math.max(0, before * next - e.offsetY);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, onZoom]);

  /* --- reveal: scroll one node into view, once ------------------------ */

  useEffect(() => {
    if (!revealId) return;
    const placed = placedById.get(revealId);
    const el = scrollRef.current;
    if (placed && el) {
      const y = placed.row * rowHeight * zoom;
      el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2), behavior: 'smooth' });
      // Only consume the request once it was actually honoured. Clearing it
      // unconditionally meant a "view in work graph" click on a cold panel —
      // before the worker layout had landed — silently lost the scroll.
      onRevealed();
    }
  }, [revealId, placedById, rowHeight, zoom, onRevealed]);

  /* --- the visible window -------------------------------------------- */

  const scaledRowH = rowHeight * zoom;
  // Windowing is gated on the threshold the settings panel exposes. It used to
  // run unconditionally, which made `virtualizeThreshold` a shipped control
  // that changed nothing — and windowing a 20-node graph only costs work.
  const virtualize = layout.rowCount > virtualizeThreshold;
  const firstRow = virtualize
    ? Math.max(0, Math.floor(scrollTop / scaledRowH) - OVERSCAN)
    : 0;
  const lastRow = virtualize
    ? Math.min(layout.rowCount, Math.ceil((scrollTop + viewportH) / scaledRowH) + OVERSCAN)
    : layout.rowCount;

  const visibleRows = useMemo(
    () => layout.rows.filter((r) => r.row >= firstRow && r.row <= lastRow),
    [layout.rows, firstRow, lastRow],
  );

  // Edge culling through the precomputed buckets: O(visible), never O(E).
  const visiblePaths = useMemo(() => {
    const from = Math.floor(firstRow / BUCKET_ROWS);
    const to = Math.floor(lastRow / BUCKET_ROWS);
    const seen = new Set<number>();
    const out: LayoutResult['paths'] = [];
    for (let b = from; b <= to; b += 1) {
      for (const i of layout.buckets[b] ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const p = layout.paths[i];
        if (p && (showDerivedEdges || !p.derived)) out.push(p);
      }
    }
    return out;
  }, [layout, firstRow, lastRow, showDerivedEdges]);

  /* --- semantic overlay for the selected node's neighborhood ---------- */

  // Drawn only around the selection, and only to `maxDepth`. A git graph is
  // legible because it draws ONE relation; all seven at once is unreadable.
  const overlay = useMemo(() => {
    if (!showSemanticEdges || !selectedId) return [];
    const neighborhood = collectNeighborhood(edges, selectedId, maxDepth);
    const out: Array<{ d: string; edge: WorkGraphEdge }> = [];
    for (const e of neighborhood) {
      if (!showDerivedEdges && e.derived) continue;
      const a = placedById.get(e.src);
      const b = placedById.get(e.dst);
      if (!a || !b || a.lane < 0 || b.lane < 0) continue;
      const x1 = laneX(a.lane);
      const y1 = rowY(a.row, rowHeight);
      const x2 = laneX(b.lane);
      const y2 = rowY(b.row, rowHeight);
      // Bow the arc outward so an overlay edge is never confused with a spine
      // edge running down the same lane.
      const bow = Math.min(48, 12 + Math.abs(b.row - a.row) * 0.6);
      out.push({ d: `M${x1},${y1} C${x1 - bow},${y1} ${x2 - bow},${y2} ${x2},${y2}`, edge: e });
    }
    return out;
  }, [showSemanticEdges, showDerivedEdges, selectedId, edges, placedById, rowHeight, maxDepth]);

  const laneAreaW = LANE_X0 + Math.max(1, layout.laneCount) * LANE_W;
  const contentH = layout.rowCount * scaledRowH;
  // Horizontal extent so wide graphs get a real native horizontal scrollbar
  // rather than clipping their labels.
  const contentW = (laneAreaW + GUTTER_W + LABEL_GAP + LABEL_W) * zoom;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-auto"
      role="tree"
      aria-label="Work graph"
      title="Ctrl/Cmd + scroll to zoom"
    >
      {/* The spacer gives the native scrollbars their full range; the SVG is
          sticky-positioned over it so only the window's rows ever mount. */}
      <div style={{ height: contentH, width: contentW, position: 'relative' }}>
        <svg
          ref={svgRef}
          data-work-graph-canvas=""
          width={contentW}
          height={viewportH}
          style={{ position: 'sticky', top: 0, display: 'block' }}
        >
          <g transform={`translate(0, ${-scrollTop}) scale(${zoom})`}>
            {/* Structural spine */}
            <g>
              {visiblePaths.map((p, i) => (
                <GraphEdge key={`s${i}`} d={p.d} kind={p.kind} derived={p.derived} />
              ))}
            </g>

            {/* Semantic overlay (selection neighborhood only) */}
            {overlay.length > 0 && (
              <g>
                {overlay.map(({ d, edge }, i) => (
                  <GraphEdge
                    key={`o${i}`}
                    d={d}
                    kind={edge.kind}
                    derived={edge.derived}
                    overlay
                  />
                ))}
              </g>
            )}

            {/*
              Gutter connectors. The layouter places git nodes at `lane: -1` and
              deliberately skips routing any spine edge that touches one, on the
              understanding that a gutter renderer draws them — but none existed,
              so commits floated on the right with no line back to the work that
              produced them. This is that renderer: a short elbow from the last
              lane to the gutter column, at the commit's own row.
            */}
            {visibleRows
              .filter((placed) => placed.lane < 0)
              .map((placed) => {
                const y = rowY(placed.row, rowHeight);
                const x0 = laneX(0);
                const x1 = laneAreaW + GUTTER_W;
                return (
                  <path
                    key={`gutter-${placed.id}`}
                    d={`M ${x0} ${y} H ${x1 - 8} Q ${x1} ${y} ${x1} ${y}`}
                    fill="none"
                    stroke="var(--color-line-strong)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}

            {/* Nodes + labels */}
            {visibleRows.map((placed) => {
              const node = byId.get(placed.id);
              if (!node) return null;
              const inGutter = placed.lane < 0;
              const x = inGutter ? laneAreaW + GUTTER_W : laneX(placed.lane);
              const y = rowY(placed.row, rowHeight);
              const labelX = laneAreaW + (inGutter ? GUTTER_W + LABEL_GAP : LABEL_GAP);

              // Dimmed, not hidden — see the note on `queryMatches`.
              const dimmed = queryMatches !== null && !queryMatches.has(placed.id);

              return (
                <g key={placed.id} opacity={dimmed ? 0.25 : 1}>
                  <g
                    transform={`translate(${x}, ${y})`}
                    onClick={() => onSelect(placed.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <GraphNode
                      kind={node.kind}
                      status={node.status}
                      provider={node.provider}
                      coloring={coloring}
                      selected={selectedId === placed.id}
                    />
                    {placed.overflow > 0 && (
                      <text
                        x={10}
                        y={-5}
                        fontSize={8}
                        fill="var(--color-faint)"
                        style={{ pointerEvents: 'none' }}
                      >
                        {`+${placed.overflow}`}
                      </text>
                    )}
                  </g>
                  <text
                    x={labelX}
                    y={y + 3.5}
                    fontSize={11}
                    fill={selectedId === placed.id ? 'var(--color-fg)' : 'var(--color-muted)'}
                    onClick={() => onSelect(placed.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {node.title}
                  </text>
                </g>
              );
            })}

            {/* Optional edge labels, drawn only for the selection overlay so
                they can never carpet the whole canvas. */}
            {showEdgeLabels &&
              overlay.map(({ edge }, i) => {
                const a = placedById.get(edge.src);
                const b = placedById.get(edge.dst);
                if (!a || !b || a.lane < 0 || b.lane < 0) return null;
                return (
                  <text
                    key={`l${i}`}
                    x={Math.min(laneX(a.lane), laneX(b.lane)) - 6}
                    y={(rowY(a.row, rowHeight) + rowY(b.row, rowHeight)) / 2}
                    fontSize={8}
                    textAnchor="end"
                    fill="var(--color-faint)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {edge.kind}
                  </text>
                );
              })}
          </g>
        </svg>
      </div>
    </div>
  );
}

/**
 * Semantic (non-spine) edges reachable from `start` within `depth` hops, in
 * either direction. Bounded by depth AND by a hard visit cap so a pathological
 * graph can never turn a render into a traversal that never ends.
 */
function collectNeighborhood(
  edges: WorkGraphEdge[],
  start: string,
  depth: number,
): WorkGraphEdge[] {
  const semantic = edges.filter((e) => e.kind !== 'follows' && e.kind !== 'contains');
  const out: WorkGraphEdge[] = [];
  const seenEdge = new Set<string>();
  let frontier = new Set<string>([start]);
  const seenNode = new Set<string>([start]);

  for (let d = 0; d < depth && frontier.size > 0; d += 1) {
    const next = new Set<string>();
    for (const e of semantic) {
      const touchesSrc = frontier.has(e.src);
      const touchesDst = frontier.has(e.dst);
      if (!touchesSrc && !touchesDst) continue;
      if (!seenEdge.has(e.id)) {
        seenEdge.add(e.id);
        out.push(e);
      }
      const other = touchesSrc ? e.dst : e.src;
      if (!seenNode.has(other)) {
        seenNode.add(other);
        next.add(other);
      }
    }
    if (out.length > GRAPH_LIMITS.queryLimit.default) break;
    frontier = next;
  }
  return out;
}

/** Shared class for the canvas' surrounding chrome. */
export const canvasShell = cn('flex h-full min-h-0 flex-col bg-surface');
