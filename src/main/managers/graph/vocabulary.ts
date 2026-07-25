/**
 * Human-readable names for the graph vocabulary, shared by the main-process
 * exporter and (via the shared types) the renderer's legend.
 *
 * Kept in one place so an exported document and the on-screen legend can never
 * describe the same relationship differently.
 */
import type { WorkGraphEdgeKind } from '@shared/types';

/** Verb phrase for an edge, reading `<src> <verb> <dst>`. */
export const EDGE_VERB: Record<WorkGraphEdgeKind, string> = {
  follows: 'is followed by',
  contains: 'contains',
  generated: 'generated',
  'depends-on': 'depends on',
  'implemented-in': 'is implemented in',
  'verified-by': 'is verified by',
  'blocked-by': 'is blocked by',
  'reviewed-by': 'was reviewed by',
  'produced-artifact': 'produced',
};
