/**
 * The Work Graph layout contract — the boundary between the panel and the
 * layout algorithm.
 *
 * Everything here is STRUCTURED-CLONE-FRIENDLY (plain arrays, numbers, strings;
 * no Maps, no class instances, no cycles) because the same shapes cross a Web
 * Worker boundary. Keep it that way: a `Map` here would silently break the
 * worker path while still working in the synchronous fallback.
 */
import type { WorkGraphEdgeKind, WorkGraphNodeKind } from '@shared/types';

/** Row height in px, by UI density. Fixed rows are what make windowing O(1). */
export const ROW_H = { comfortable: 28, compact: 24 } as const;

/** Horizontal distance between lane centers, in px. */
export const LANE_W = 16;

/** Left inset of lane 0's center, in px. */
export const LANE_X0 = 18;

/** Corner radius of a fork/merge elbow, in px. */
export const ELBOW_R = 6;

/** Rows per edge bucket. Bucketing makes per-frame edge culling O(visible). */
export const BUCKET_ROWS = 64;

/** The minimal node shape the layouter needs — deliberately not the full node. */
export interface LayoutNode {
  id: string;
  kind: WorkGraphNodeKind;
  startedAt: number;
  seq: number;
}

/** The minimal edge shape the layouter needs. */
export interface LayoutEdge {
  src: string;
  dst: string;
  kind: WorkGraphEdgeKind;
  derived: boolean;
}

export interface LayoutInput {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Lanes beyond this share the last lane and carry a +N badge. */
  maxLanes: number;
  rowHeight: number;
}

/** One placed node: abstract (row, lane), never pixels — zoom is a transform. */
export interface PlacedNode {
  id: string;
  row: number;
  lane: number;
  /** Nodes folded into this one because the lane cap was hit (0 normally). */
  overflow: number;
}

/** One routed spine edge, as an SVG path plus its row extent for culling. */
export interface RoutedEdge {
  d: string;
  kind: WorkGraphEdgeKind;
  derived: boolean;
  rowMin: number;
  rowMax: number;
}

export interface LayoutResult {
  rows: PlacedNode[];
  paths: RoutedEdge[];
  /** Row-bucket index -> indices into `paths`, for O(visible) edge culling. */
  buckets: Record<number, number[]>;
  laneCount: number;
  rowCount: number;
  /**
   * Edges dropped because they pointed backwards in time. This is how the "A"
   * in DAWG is ENFORCED rather than assumed: a builder bug shows up as a
   * non-zero count in the legend instead of an infinite loop in the layouter.
   */
  droppedEdges: number;
  /** Ids of nodes placed in the right-hand git gutter (they consume no lane). */
  gutter: string[];
}

/** A request/response pair over the worker channel. */
export interface LayoutRequest {
  id: number;
  input: LayoutInput;
}

export interface LayoutResponse {
  id: number;
  result: LayoutResult;
}
