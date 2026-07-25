/**
 * Renderer-side Work Graph export for the VISUAL formats.
 *
 * SVG and PNG are produced here rather than in main because they need a LAYOUT,
 * and the layout only exists in the renderer. But they are rendered from the
 * layout OFFSCREEN, not by serializing the live canvas: the canvas is
 * virtualized, so it contains only the rows currently scrolled into view, with
 * the scroll offset and zoom baked into its transform. Serializing it exported
 * the viewport and called it the graph.
 *
 * The glyph vocabulary here is deliberately simpler than `GraphNode.tsx`'s —
 * shape and colour, no per-kind iconography — because an export is a document,
 * not a control surface, and a second copy of fifteen icon paths would be a
 * second thing to keep in sync.
 */
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';
import { edgeColor, EDGE_LABEL } from './GraphEdge';
import { nodeColor, type NodeColoring } from './GraphNode';
import { LANE_W, LANE_X0, type LayoutResult } from './layout/types';

/** Palette tokens the exported SVG must carry inline (CSS vars do not travel). */
const TOKENS = [
  'base',
  'surface',
  'surface-2',
  'elevated',
  'line',
  'line-strong',
  'fg',
  'muted',
  'faint',
  'accent',
  'success',
  'warning',
  'danger',
] as const;

/** Horizontal space reserved for node labels, matching the canvas. */
const LABEL_W = 320;

/** Options mirroring the settings the canvas itself honours. */
export interface ExportRenderOptions {
  rowHeight: number;
  showEdgeLabels: boolean;
  coloring: NodeColoring;
}

/** Resolve `--color-*` tokens to literal values for a detached document. */
function paletteBlock(): string {
  const computed = getComputedStyle(document.documentElement);
  const vars = TOKENS.map(
    (t) => `--color-${t}: ${computed.getPropertyValue(`--color-${t}`).trim()};`,
  ).join(' ');
  return `:root { ${vars} } svg { background: var(--color-surface); }`;
}

/**
 * Render the WHOLE graph to a standalone SVG document.
 *
 * Unlike a serialization of the live canvas this has no scroll offset, no zoom
 * transform, and no row windowing — it is the complete graph at 1:1, which is
 * what someone opening an exported file expects to find in it.
 */
export function renderLayoutSvg(
  layout: LayoutResult,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  opts: ExportRenderOptions,
): { markup: string; width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rowY = (row: number): number => row * opts.rowHeight + opts.rowHeight / 2;
  const laneX = (lane: number): number =>
    lane < 0 ? LANE_X0 + layout.laneCount * LANE_W + LABEL_W + 24 : LANE_X0 + lane * LANE_W;

  const width = LANE_X0 + layout.laneCount * LANE_W + LABEL_W + 160;
  const height = Math.max(layout.rowCount * opts.rowHeight + opts.rowHeight, opts.rowHeight);

  const parts: string[] = [];

  // Spine edges first, so glyphs paint over their endpoints.
  for (const path of layout.paths) {
    parts.push(
      `<path d="${esc(path.d)}" fill="none" stroke="${edgeColor(path.kind)}" stroke-width="1.5"` +
        `${path.derived ? ' stroke-dasharray="3 3"' : ''} />`,
    );
  }

  // Semantic (non-spine) edges as straight connectors between placed rows —
  // the layouter routes only the spine, so these are drawn directly.
  const placed = new Map(layout.rows.map((r) => [r.id, r]));
  for (const e of edges) {
    if (e.kind === 'follows' || e.kind === 'contains') continue;
    const a = placed.get(e.src);
    const b = placed.get(e.dst);
    if (!a || !b) continue;
    const x1 = laneX(a.lane);
    const y1 = rowY(a.row);
    const x2 = laneX(b.lane);
    const y2 = rowY(b.row);
    parts.push(
      `<path d="M ${x1} ${y1} C ${x1 - 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}" fill="none" ` +
        `stroke="${edgeColor(e.kind)}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7" />`,
    );
    if (opts.showEdgeLabels) {
      parts.push(
        `<text x="${(x1 + x2) / 2 - 20}" y="${(y1 + y2) / 2 - 3}" font-size="8" ` +
          `fill="var(--color-faint)">${esc(EDGE_LABEL[e.kind])}</text>`,
      );
    }
  }

  for (const row of layout.rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    const x = laneX(row.lane);
    const y = rowY(row.row);
    const color = nodeColor(node.kind, node.status, node.provider, opts.coloring);
    parts.push(glyph(node, x, y, color));
    parts.push(
      `<text x="${LANE_X0 + layout.laneCount * LANE_W + 12}" y="${y + 3}" font-size="10" ` +
        `fill="var(--color-fg)">${esc(truncate(node.title, 64))}</text>`,
    );
  }

  const markup =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<style>${paletteBlock()}</style>` +
    `<rect width="${width}" height="${height}" fill="var(--color-surface)" />` +
    parts.join('') +
    `</svg>`;
  return { markup, width, height };
}

/** The panel's shape vocabulary: circle = milestone, diamond = decision, … */
function glyph(node: WorkGraphNode, x: number, y: number, color: string): string {
  const fill = 'var(--color-surface)';
  switch (node.kind) {
    case 'objective':
    case 'completion':
      return `<circle cx="${x}" cy="${y}" r="5" fill="${fill}" stroke="${color}" stroke-width="2" />`;
    case 'approval':
      return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${x} ${y})" fill="${fill}" stroke="${color}" stroke-width="1.5" />`;
    case 'git':
    case 'file':
    case 'artifact':
      return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1" fill="${fill}" stroke="${color}" stroke-width="1.5" />`;
    case 'mcp':
      return `<polygon points="${hexPoints(x, y, 5)}" fill="${fill}" stroke="${color}" stroke-width="1.5" />`;
    case 'terminal':
    case 'service':
      return `<polygon points="${x - 5},${y + 4} ${x - 2},${y - 4} ${x + 5},${y - 4} ${x + 2},${y + 4}" fill="${fill}" stroke="${color}" stroke-width="1.5" />`;
    default:
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}" />`;
  }
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** XML-escape text and attribute content alike. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rasterize the serialized SVG to a PNG data URL at 2x for legibility.
 * Resolves to `null` if the image fails to decode, so the caller can report an
 * honest failure rather than saving an empty file.
 */
export async function renderPng(
  svgMarkup: string,
  width: number,
  height: number,
): Promise<string | null> {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    if (!image) return null;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Fill first: a PNG with a transparent background is unreadable when
    // dropped into a light-background document. No literal fallback — the token
    // is always defined, and a hardcoded hex here would silently drift from it.
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface')
      .trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
