/**
 * The Work Graph lane layout — a hand-rolled `git log --graph` column walk.
 *
 * No layout library: the repo has a standing no-heavyweight-deps position (see
 * `lib/cn.ts`, `search/refs.ts`), and a force-directed or hierarchical layout
 * would actively contradict the product requirement, which is that the graph
 * READ LIKE A GIT HISTORY. Vertical lanes are the point, not a compromise.
 *
 * The algorithm is pure and total: same input, same output, no clock, no DOM,
 * no throwing. It runs in a Web Worker (and synchronously as a fallback), so it
 * must stay free of browser globals.
 *
 * Four steps:
 *   1. Deterministic order + DAG enforcement (drop backward edges, count them).
 *   2. Row assignment  — one node per row. Makes windowing O(1) and invertible.
 *   3. Lane assignment — inherit the parent's lane, else take the first free.
 *   4. Edge routing    — orthogonal segments with a single quarter-arc elbow.
 *
 * Only SPINE edges (`follows` / `contains`) influence geometry. Semantic edges
 * are an overlay the panel draws for the selected node's neighborhood: a git
 * graph is legible precisely because it draws ONE relation, and drawing all
 * seven at ten thousand nodes is both unreadable and O(E) per frame.
 */
import {
  BUCKET_ROWS,
  ELBOW_R,
  LANE_W,
  LANE_X0,
  type LayoutEdge,
  type LayoutInput,
  type LayoutResult,
  type PlacedNode,
  type RoutedEdge,
} from './types';

/** The two edge kinds that form the structural spine. */
function isSpine(edge: LayoutEdge): boolean {
  return edge.kind === 'follows' || edge.kind === 'contains';
}

/** Lane center x, in abstract layout px (zoom is applied as a transform). */
export function laneX(lane: number): number {
  return LANE_X0 + lane * LANE_W;
}

/** Row center y, in abstract layout px. */
export function rowY(row: number, rowHeight: number): number {
  return row * rowHeight + rowHeight / 2;
}

export function laneLayout(input: LayoutInput): LayoutResult {
  const { nodes, edges, maxLanes, rowHeight } = input;

  if (nodes.length === 0) {
    return {
      rows: [],
      paths: [],
      buckets: {},
      laneCount: 1,
      rowCount: 0,
      droppedEdges: 0,
      gutter: [],
    };
  }

  /* --- Step 1: deterministic order + DAG enforcement ------------------ */

  // Sort by `seq` — the builder's monotonic INSERTION counter — not by
  // `startedAt`. This matters: the spine is appended in insertion order, so
  // ordering by anything else can place a child above its parent and produce a
  // backwards edge. Timestamps genuinely disagree with insertion order (a tool
  // node carries the tool's own `startedAt`, while a plan or completion node is
  // stamped when it is built), so `startedAt` is display metadata, not order.
  // `seq` is unique per session, which makes this a TOTAL order and makes the
  // "A" in DAWG hold by construction rather than by luck.
  const ordered = nodes.slice().sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));

  const indexOf = new Map<string, number>();
  ordered.forEach((n, i) => indexOf.set(n.id, i));

  const spine: LayoutEdge[] = [];
  let droppedEdges = 0;
  for (const e of edges) {
    if (!isSpine(e)) continue;
    const si = indexOf.get(e.src);
    const di = indexOf.get(e.dst);
    // A dangling endpoint just means the other node is outside the loaded
    // window — not a cycle, and not worth reporting as a violation.
    if (si === undefined || di === undefined) continue;
    if (si >= di) {
      // Points backwards in time: a genuine cycle risk. Drop and count it.
      droppedEdges += 1;
      continue;
    }
    spine.push(e);
  }

  /* --- Step 2: rows --------------------------------------------------- */

  // One node per row, exactly like `git log --graph`. Fixed row height makes
  // `y = row * ROW_H` O(1) and invertible, which is what makes virtualization
  // and `scrollTop -> first visible row` trivial.
  const rowOf = indexOf;

  /* --- Step 3: lanes -------------------------------------------------- */

  // Git nodes never consume a lane: they live in a reserved right-hand gutter
  // aligned to the row of the work that produced them. That keeps "commits sit
  // beneath their implementation" from perturbing lane assignment at all.
  const gutter: string[] = [];

  const parentsOf = new Map<string, string[]>();
  const childCount = new Map<string, number>();
  for (const e of spine) {
    const list = parentsOf.get(e.dst);
    if (list) list.push(e.src);
    else parentsOf.set(e.dst, [e.src]);
    childCount.set(e.src, (childCount.get(e.src) ?? 0) + 1);
  }

  const remainingChildren = new Map(childCount);
  const laneOf = new Map<string, number>();
  /** activeLanes[i] = the node id currently occupying lane i, or null. */
  const activeLanes: Array<string | null> = [];
  const placed: PlacedNode[] = [];
  let laneCount = 1;
  let overflowCarry = 0;
  /** How much of `overflowCarry` a badge has already accounted for. */
  let lastBadgedCarry = 0;

  for (const node of ordered) {
    if (node.kind === 'git') {
      gutter.push(node.id);
      placed.push({ id: node.id, row: rowOf.get(node.id) ?? 0, lane: -1, overflow: 0 });
      continue;
    }

    const parents = parentsOf.get(node.id) ?? [];
    // The primary parent is the first spine parent still holding its lane —
    // continuing it is what draws an unbroken vertical line down the history.
    let lane = -1;
    for (const p of parents) {
      const pl = laneOf.get(p);
      if (pl !== undefined && pl >= 0 && activeLanes[pl] === p) {
        lane = pl;
        break;
      }
    }

    if (lane < 0) {
      const free = activeLanes.indexOf(null);
      if (free >= 0) {
        lane = free;
      } else if (activeLanes.length < maxLanes) {
        lane = activeLanes.length;
        activeLanes.push(null);
      } else {
        // Lane cap reached: fold onto the last lane and badge the count, so a
        // runaway parallel run degrades legibly instead of exploding sideways.
        lane = maxLanes - 1;
        overflowCarry += 1;
      }
    }

    activeLanes[lane] = node.id;
    laneOf.set(node.id, lane);
    laneCount = Math.max(laneCount, lane + 1);

    placed.push({
      id: node.id,
      row: rowOf.get(node.id) ?? 0,
      lane,
      // The badge belongs to the node that ABSORBED the overflow, not to every
      // node that lands in the last lane afterwards. Reading the running total
      // rendered "+1, +2, +3…" down the column as if each row had folded that
      // many nodes; only the delta since the previous badge is this node's.
      overflow:
        overflowCarry > lastBadgedCarry && lane === maxLanes - 1
          ? overflowCarry - lastBadgedCarry
          : 0,
    });
    if (overflowCarry > lastBadgedCarry && lane === maxLanes - 1) {
      lastBadgedCarry = overflowCarry;
    }

    // Free a parent's lane once its last spine child has been placed — this is
    // the "merge" half of the fork/merge shape.
    for (const p of parents) {
      const left = (remainingChildren.get(p) ?? 1) - 1;
      remainingChildren.set(p, left);
      const pl = laneOf.get(p);
      if (left <= 0 && pl !== undefined && pl >= 0 && pl !== lane && activeLanes[pl] === p) {
        activeLanes[pl] = null;
      }
    }
  }

  /* --- Step 4: edge routing ------------------------------------------ */

  const paths: RoutedEdge[] = [];
  for (const e of spine) {
    const srcRow = rowOf.get(e.src);
    const dstRow = rowOf.get(e.dst);
    const srcLane = laneOf.get(e.src);
    const dstLane = laneOf.get(e.dst);
    // A git-gutter endpoint (lane -1) is drawn by the gutter renderer, not here.
    if (
      srcRow === undefined ||
      dstRow === undefined ||
      srcLane === undefined ||
      dstLane === undefined ||
      srcLane < 0 ||
      dstLane < 0
    ) {
      continue;
    }

    paths.push({
      d: routePath(laneX(srcLane), rowY(srcRow, rowHeight), laneX(dstLane), rowY(dstRow, rowHeight)),
      kind: e.kind,
      derived: e.derived,
      rowMin: Math.min(srcRow, dstRow),
      rowMax: Math.max(srcRow, dstRow),
    });
  }

  // Bucket by row so a frame only tests the 2-3 buckets its window overlaps.
  const buckets: Record<number, number[]> = {};
  paths.forEach((p, i) => {
    const from = Math.floor(p.rowMin / BUCKET_ROWS);
    const to = Math.floor(p.rowMax / BUCKET_ROWS);
    for (let b = from; b <= to; b += 1) {
      (buckets[b] ??= []).push(i);
    }
  });

  return {
    rows: placed,
    paths,
    buckets,
    laneCount,
    rowCount: ordered.length,
    droppedEdges,
    gutter,
  };
}

/**
 * Orthogonal routing with a single quarter-arc elbow — the git-graph idiom.
 * Straight down when the lane is unchanged; otherwise drop to just above the
 * destination row, turn once, and run horizontally into it. Never a bezier:
 * curved edges at this density read as spaghetti.
 */
function routePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M${x1},${y1} V${y2}`;

  const dir = x2 > x1 ? 1 : -1;
  const turnY = y2 - ELBOW_R;
  // Too little vertical room for a clean elbow (adjacent rows): one diagonal.
  if (turnY <= y1) return `M${x1},${y1} L${x2},${y2}`;

  // sweep-flag follows the turn direction so both left and right elbows curve
  // the correct way; getting this wrong produces a visible kink.
  const sweep = dir > 0 ? 0 : 1;
  return (
    `M${x1},${y1} V${turnY} ` +
    `A${ELBOW_R},${ELBOW_R} 0 0 ${sweep} ${x1 + dir * ELBOW_R},${y2} ` +
    `H${x2}`
  );
}
