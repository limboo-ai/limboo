/**
 * Work Graph settings — the Directed Acyclic Work Graph.
 *
 * Every control here changes real behavior. Several knobs that a graph feature
 * conventionally offers were deliberately NOT shipped because nothing in this
 * codebase backs them, and a switch that toggles nothing is worse than a
 * missing one:
 *
 *  - "snapshot frequency" — the graph is an append-only log, already durable on
 *    every flush; there is nothing to snapshot. The real knob is the
 *    delta-coalescing window, shipped below as "Update frequency".
 *  - "caching" — there is no configurable cache. The renderer holds the graph;
 *    the worker holds the last layout.
 *  - "background indexing priority" — Limboo has no prioritized scheduler and
 *    Node has no thread priorities.
 *  - "semantic compression" — that means a model call to summarize old
 *    branches, on the user's dime. Replaced by "Collapse completed runs", which
 *    is deterministic, free, and offline.
 */
import { GRAPH_LIMITS, clamp } from '@shared/constants';
import type { GraphExportTarget } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useGraphStore } from '@/renderer/stores/useGraphStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { ActionButton, Field, Section, SegmentedControl, Select, Toggle } from '../controls';

/** The event sources that contribute nodes (label + the overlay key it flips). */
const OVERLAYS: { id: keyof AppOverlays; label: string; hint: string }[] = [
  { id: 'git', label: 'Git', hint: 'Commits and checkpoints.' },
  { id: 'terminal', label: 'Terminal', hint: 'Agent commands and real PTYs.' },
  { id: 'file', label: 'Files', hint: 'Workspace file changes.' },
  { id: 'mcp', label: 'MCP', hint: 'External tool-server calls.' },
  { id: 'memory', label: 'Memory', hint: 'Knowledge recalled and written.' },
  { id: 'search', label: 'Search', hint: 'Project search lookups.' },
  { id: 'service', label: 'Services', hint: 'Supervised process transitions.' },
];

type AppOverlays = {
  git: boolean;
  terminal: boolean;
  mcp: boolean;
  memory: boolean;
  file: boolean;
  search: boolean;
  service: boolean;
};

export function GraphPanel() {
  const graph = useSettingsStore((s) => s.settings.graph);
  const update = useSettingsStore((s) => s.update);
  const addToast = useUIStore((s) => s.addToast);
  const pruneGraph = useGraphStore((s) => s.prune);
  const clearGraph = useGraphStore((s) => s.clear);
  const saveBatch = useGraphStore((s) => s.saveBatch);
  const sessions = useSessionStore((s) => s.sessions);

  const set = <K extends keyof typeof graph>(key: K, value: (typeof graph)[K]): void =>
    void update({ graph: { [key]: value } });

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Capture"
        hint="Limboo records every session's execution as a typed graph — objectives, plans, tasks, tools, commands, files, commits — normalized across both coding agents. Neither Claude nor Cursor exposes a work graph; this is Limboo's own layer built from the structured events they do emit, so it works identically whichever agent is running."
      >
        <Field
          id="graphEnabled"
          label="Record the work graph"
          hint="When off, nothing is captured at all — no rows written, no cost."
        >
          <Toggle checked={graph.enabled} onChange={(v) => set('enabled', v)} />
        </Field>
        {graph.enabled && (
          <>
            <Field
              id="graphPersist"
              label="Save between restarts"
              hint="Off keeps the graph live in memory only; it disappears when the app closes."
            >
              <Toggle checked={graph.persist} onChange={(v) => set('persist', v)} />
            </Field>
            <Field
              id="graphUpdateFrequency"
              label="Update frequency"
              hint="How long changes are batched before the panel updates. Longer batches mean fewer redraws during a busy run."
            >
              <Select<number>
                value={clamp(
                  graph.updateFrequency,
                  GRAPH_LIMITS.updateFrequency.min,
                  GRAPH_LIMITS.updateFrequency.max,
                )}
                options={[
                  { value: 0, label: 'Immediate' },
                  { value: 120, label: '120 ms' },
                  { value: 250, label: '250 ms' },
                  { value: 500, label: '500 ms' },
                  { value: 1000, label: '1 s' },
                ]}
                onChange={(v) => set('updateFrequency', v)}
              />
            </Field>
          </>
        )}
      </Section>

      {graph.enabled && (
        <>
          <Section
            title="Display"
            hint="How the graph is drawn. It deliberately reads like a Git history — vertical execution lanes, one node per row — rather than a free-floating node diagram."
          >
            <Field
              id="graphLayout"
              label="Layout"
              hint="Lanes gives every step its own row; Compact merges consecutive read-only lookups into one."
            >
              <SegmentedControl<'lanes' | 'compact'>
                value={graph.layoutAlgorithm}
                options={[
                  { value: 'lanes', label: 'Lanes' },
                  { value: 'compact', label: 'Compact' },
                ]}
                onChange={(v) => set('layoutAlgorithm', v)}
              />
            </Field>
            <Field id="graphColoring" label="Color nodes by" hint="What the node color encodes.">
              <SegmentedControl<'kind' | 'status' | 'provider'>
                value={graph.nodeColoring}
                options={[
                  { value: 'kind', label: 'Kind' },
                  { value: 'status', label: 'Status' },
                  { value: 'provider', label: 'Agent' },
                ]}
                onChange={(v) => set('nodeColoring', v)}
              />
            </Field>
            <Field
              id="graphSemanticEdges"
              label="Show relationships"
              hint="Draw the semantic links (generated, blocked by, verified by…) around whichever node you select."
            >
              <Toggle
                checked={graph.showSemanticEdges}
                onChange={(v) => set('showSemanticEdges', v)}
              />
            </Field>
            <Field
              id="graphDerivedEdges"
              label="Show inferred relationships"
              hint="Links Limboo deduced rather than observed — always drawn dashed so they are never mistaken for fact."
            >
              <Toggle
                checked={graph.showDerivedEdges}
                onChange={(v) => set('showDerivedEdges', v)}
              />
            </Field>
            <Field
              id="graphEdgeLabels"
              label="Label relationships"
              hint="Write the relationship name beside each link in the selected node's neighborhood."
            >
              <Toggle checked={graph.showEdgeLabels} onChange={(v) => set('showEdgeLabels', v)} />
            </Field>
            <Field
              id="graphArtifactPreviews"
              label="Preview artifacts"
              hint="Show file and diff previews in the node inspector."
            >
              <Toggle
                checked={graph.artifactPreviews}
                onChange={(v) => set('artifactPreviews', v)}
              />
            </Field>
            <Field
              id="graphAnimate"
              label="Animate"
              hint="Fade nodes in as they appear. Always off when Reduced motion is enabled in Appearance."
            >
              <Toggle checked={graph.animate} onChange={(v) => set('animate', v)} />
            </Field>
            <Field
              id="graphAnimationSpeed"
              label="Replay speed"
              hint="How fast historical replay steps through the graph. Higher is faster."
            >
              <Select
                value={String(graph.animationSpeed)}
                options={[
                  { value: '0.5', label: '0.5×' },
                  { value: '1', label: '1×' },
                  { value: '2', label: '2×' },
                  { value: '4', label: '4×' },
                ]}
                onChange={(v) =>
                  set(
                    'animationSpeed',
                    clamp(
                      Number(v),
                      GRAPH_LIMITS.animationSpeed.min,
                      GRAPH_LIMITS.animationSpeed.max,
                    ),
                  )
                }
              />
            </Field>
          </Section>

          <Section
            title="Sources"
            hint="Which subsystems contribute nodes. The structural spine — objectives, plans, tasks, approvals, and results — is always recorded; turning it off would leave a graph with no shape."
          >
            {OVERLAYS.map((o) => (
              <Field key={o.id} id={`graphOverlay-${o.id}`} label={o.label} hint={o.hint}>
                <Toggle
                  checked={graph.overlays[o.id]}
                  onChange={(v) => void update({ graph: { overlays: { [o.id]: v } } })}
                />
              </Field>
            ))}
            <Field
              id="graphCheckpointIntegration"
              label="Include checkpoints"
              hint="Record git checkpoints alongside commits."
            >
              <Toggle
                checked={graph.checkpointIntegration}
                onChange={(v) => set('checkpointIntegration', v)}
              />
            </Field>
            <Field
              id="graphTimelineSync"
              label="Link to the conversation"
              hint="Selecting a node jumps to the matching message, commit, terminal, or memory — and back again."
            >
              <Toggle checked={graph.timelineSync} onChange={(v) => set('timelineSync', v)} />
            </Field>
          </Section>

          <Section
            title="Structure"
            hint="How much of the graph is expanded, and how deep relationship traversals reach."
          >
            <Field
              id="graphGroupBy"
              label="Group by"
              hint="Optional grouping for the node list."
            >
              <Select<'none' | 'kind' | 'tool' | 'file'>
                value={graph.outlineGroupBy}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'kind', label: 'Kind' },
                  { value: 'tool', label: 'Tool' },
                  { value: 'file', label: 'File' },
                ]}
                onChange={(v) => set('outlineGroupBy', v)}
              />
            </Field>
            <Field
              id="graphGroupSubagents"
              label="Collapse subagents"
              hint="Fold a subagent's work into a single node instead of a side branch."
            >
              <Toggle checked={graph.groupSubagents} onChange={(v) => set('groupSubagents', v)} />
            </Field>
            <Field
              id="graphAutoCollapse"
              label="Collapse finished branches"
              hint="Automatically fold branches whose every step has completed."
            >
              <Toggle
                checked={graph.autoCollapseCompleted}
                onChange={(v) => set('autoCollapseCompleted', v)}
              />
            </Field>
            <Field
              id="graphMaxDepth"
              label="Relationship depth"
              hint="How many hops a traversal follows when searching or highlighting."
            >
              <Select<number>
                value={clamp(graph.maxDepth, GRAPH_LIMITS.maxDepth.min, GRAPH_LIMITS.maxDepth.max)}
                options={[2, 4, 8, 16, 32].map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => set('maxDepth', v)}
              />
            </Field>
          </Section>

          <Section
            title="Performance & retention"
            hint="Bounds that keep a very long-running session fast. Trimming is by age and count, oldest first; the panel says so explicitly when history has been trimmed."
          >
            <Field
              id="graphMaxNodes"
              label="Max nodes shown"
              hint="How much of a large session's graph the panel loads at once."
            >
              <Select<number>
                value={clamp(graph.maxNodes, GRAPH_LIMITS.maxNodes.min, GRAPH_LIMITS.maxNodes.max)}
                options={[1000, 5000, 10000, 25000, 50000].map((n) => ({
                  value: n,
                  label: n.toLocaleString(),
                }))}
                onChange={(v) => set('maxNodes', v)}
              />
            </Field>
            <Field
              id="graphMaxLanes"
              label="Max parallel lanes"
              hint="Beyond this, extra branches share the last lane and show a count badge."
            >
              <Select<number>
                value={clamp(graph.maxLanes, GRAPH_LIMITS.maxLanes.min, GRAPH_LIMITS.maxLanes.max)}
                options={[4, 8, 16, 32, 64].map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => set('maxLanes', v)}
              />
            </Field>
            <Field
              id="graphVirtualize"
              label="Virtualize above"
              hint="Node count at which only the visible rows are drawn. Lower is faster; higher is easier to debug."
            >
              <Select<number>
                value={clamp(
                  graph.virtualizeThreshold,
                  GRAPH_LIMITS.virtualizeThreshold.min,
                  GRAPH_LIMITS.virtualizeThreshold.max,
                )}
                options={[100, 300, 1000, 5000].map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => set('virtualizeThreshold', v)}
              />
            </Field>
            <Field
              id="graphRetentionPerSession"
              label="Keep per session"
              hint="Oldest nodes are dropped beyond this count."
            >
              <Select<number>
                value={clamp(
                  graph.retentionPerSession,
                  GRAPH_LIMITS.retentionPerSession.min,
                  GRAPH_LIMITS.retentionPerSession.max,
                )}
                options={[1000, 5000, 20000, 50000].map((n) => ({
                  value: n,
                  label: n.toLocaleString(),
                }))}
                onChange={(v) => set('retentionPerSession', v)}
              />
            </Field>
            <Field
              id="graphRetentionDays"
              label="Keep for"
              hint="Nodes older than this are swept hourly. Forever keeps everything."
            >
              <Select<number>
                value={clamp(
                  graph.retentionDays,
                  GRAPH_LIMITS.retentionDays.min,
                  GRAPH_LIMITS.retentionDays.max,
                )}
                options={[
                  { value: 0, label: 'Forever' },
                  { value: 7, label: '7 days' },
                  { value: 30, label: '30 days' },
                  { value: 90, label: '90 days' },
                  { value: 365, label: '1 year' },
                ]}
                onChange={(v) => set('retentionDays', v)}
              />
            </Field>
            <Field
              id="graphCollapseOld"
              label="Collapse completed runs"
              hint="Fold runs older than this into a single summary row. Deterministic and offline — no model call, no cost."
            >
              <Select<number>
                value={clamp(
                  graph.collapseRunsOlderThan,
                  GRAPH_LIMITS.collapseRunsOlderThan.min,
                  GRAPH_LIMITS.collapseRunsOlderThan.max,
                )}
                options={[
                  { value: 0, label: 'Never' },
                  { value: 1, label: 'After 1 day' },
                  { value: 7, label: 'After 7 days' },
                  { value: 30, label: 'After 30 days' },
                ]}
                onChange={(v) => set('collapseRunsOlderThan', v)}
              />
            </Field>
            <Field
              id="graphPruneOnEnd"
              label="Clean up after interrupted runs"
              hint="Drop nodes left unattached when a run is stopped part-way."
            >
              <Toggle
                checked={graph.pruneOnSessionEnd}
                onChange={(v) => set('pruneOnSessionEnd', v)}
              />
            </Field>
            <Field
              id="graphExportFormat"
              label="Export as"
              hint="Format used by the panel's copy and save buttons. JSON, NDJSON, CSV and Markdown are data; Mermaid, DOT and PlantUML render as diagrams elsewhere; GraphML opens in Gephi, yEd and Cytoscape; HTML is a self-contained report; SVG and PNG capture the picture."
            >
              <Select<GraphExportTarget>
                value={graph.exportFormat}
                options={[
                  { value: 'json', label: 'JSON' },
                  { value: 'ndjson', label: 'NDJSON (line-delimited)' },
                  { value: 'md', label: 'Markdown' },
                  { value: 'mermaid', label: 'Mermaid' },
                  { value: 'dot', label: 'Graphviz DOT' },
                  { value: 'puml', label: 'PlantUML' },
                  { value: 'graphml', label: 'GraphML' },
                  { value: 'csv', label: 'CSV' },
                  { value: 'html', label: 'HTML report' },
                  { value: 'svg', label: 'SVG' },
                  { value: 'png', label: 'PNG' },
                ]}
                onChange={(v) => set('exportFormat', v)}
              />
            </Field>
            <Field
              id="graphExportScope"
              label="Export scope"
              hint="Whole session, or just the selected node's subgraph — the same bounded traversal the panel uses to focus a node."
            >
              <SegmentedControl
                value={graph.exportScope}
                options={[
                  { value: 'session', label: 'Session' },
                  { value: 'selection', label: 'Selection' },
                ]}
                onChange={(v) => set('exportScope', v)}
              />
            </Field>
            <Field
              id="graphExportTelemetry"
              label="Include run telemetry"
              hint="Adds each run's duration, tokens, peak context and estimated cost to the export. Applies to JSON, NDJSON, Markdown, CSV and HTML — a Mermaid, DOT or PlantUML diagram has no column to put a number in."
            >
              <Toggle
                checked={graph.exportTelemetry}
                onChange={(v) => set('exportTelemetry', v)}
              />
            </Field>
            <Field
              id="graphBatchExport"
              label="Export every session"
              hint="Writes one file per session into a folder you pick, in the format above. Sessions with no recorded graph are skipped."
            >
              <ActionButton
                label="Export all…"
                onClick={() => {
                  // Image formats are a picture of a layout, and there is no
                  // layout for a session that is not on screen — so a batch
                  // export offers only the data formats.
                  const format = graph.exportFormat;
                  if (format === 'svg' || format === 'png') {
                    addToast({
                      title: 'Pick a data format',
                      description:
                        'SVG and PNG capture the on-screen canvas, so they cannot be exported in bulk.',
                      tone: 'warning',
                    });
                    return;
                  }
                  const ids = sessions.map((s) => s.id);
                  void saveBatch(ids, format).then((saved) => {
                    if (saved > 0) {
                      addToast({
                        title: `Exported ${saved} session${saved === 1 ? '' : 's'}`,
                        tone: 'success',
                      });
                    }
                  });
                }}
              />
            </Field>
            <Field
              id="graphMaintenance"
              label="Maintenance"
              hint="Prune drops nodes left unattached by interrupted runs. Clear erases the current session's graph — this cannot be undone."
            >
              <div className="flex items-center gap-1.5">
                <ActionButton
                  label="Prune orphans"
                  onClick={() => {
                    void pruneGraph();
                    addToast({ title: 'Pruned orphaned nodes', tone: 'success' });
                  }}
                />
                <ActionButton
                  label="Clear graph"
                  danger
                  onClick={() => {
                    void clearGraph();
                    addToast({ title: "Cleared this session's graph", tone: 'success' });
                  }}
                />
              </div>
            </Field>
          </Section>
        </>
      )}
    </div>
  );
}
