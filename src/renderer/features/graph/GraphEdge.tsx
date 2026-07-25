/**
 * Work Graph edge rendering — color encodes the RELATIONSHIP, not the order.
 *
 * The one rule a user has to learn: **dashed means derived**. Solid edges were
 * read straight off a provider event; dashed edges were inferred by a
 * heuristic. That single visual invariant is what stops an inference from
 * masquerading as a fact, and it is why `derived` exists on the edge at all.
 */
import { memo } from 'react';
import type { WorkGraphEdgeKind } from '@shared/types';

/** Palette token per edge kind. Spine edges stay deliberately quiet. */
const EDGE_COLOR: Record<WorkGraphEdgeKind, string> = {
  follows: 'var(--color-line-strong)',
  contains: 'var(--color-line-strong)',
  generated: 'var(--color-accent)',
  'depends-on': 'var(--color-muted)',
  'implemented-in': 'var(--color-fg)',
  'verified-by': 'var(--color-success)',
  'blocked-by': 'var(--color-danger)',
  'reviewed-by': 'var(--color-warning)',
  'produced-artifact': 'var(--color-success)',
};

/** Human labels for the legend and the optional on-edge labels. */
export const EDGE_LABEL: Record<WorkGraphEdgeKind, string> = {
  follows: 'follows',
  contains: 'contains',
  generated: 'generated',
  'depends-on': 'depends on',
  'implemented-in': 'implemented in',
  'verified-by': 'verified by',
  'blocked-by': 'blocked by',
  'reviewed-by': 'reviewed by',
  'produced-artifact': 'produced',
};

export function edgeColor(kind: WorkGraphEdgeKind): string {
  return EDGE_COLOR[kind] ?? 'var(--color-line)';
}

interface GraphEdgeProps {
  d: string;
  kind: WorkGraphEdgeKind;
  derived: boolean;
  /** Semantic overlay edges are drawn lighter than the structural spine. */
  overlay?: boolean;
}

function GraphEdgePath({ d, kind, derived, overlay }: GraphEdgeProps) {
  return (
    <path
      d={d}
      fill="none"
      stroke={edgeColor(kind)}
      strokeWidth={overlay ? 1 : 1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Dashed <=> derived. Never vary this by kind — it is the invariant.
      strokeDasharray={derived ? '3 2.5' : undefined}
      opacity={overlay ? 0.7 : 1}
    />
  );
}

export const GraphEdge = memo(GraphEdgePath);
