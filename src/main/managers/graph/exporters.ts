/**
 * Work Graph exporters — the data formats, rendered in the main process.
 *
 * These are pure transforms of what the store already holds: given the same
 * nodes and edges they always produce the same bytes, and none of them touches
 * the filesystem (see `save()` on the manager for that). SVG and PNG stay in
 * the RENDERER, because they are serializations of the SVG the panel already
 * drew — reproducing the lane layout, the shape vocabulary, and the token
 * palette here would be a second implementation guaranteed to drift.
 *
 * Everything exported has already passed through the redactor on its way into
 * the database, so an export cannot leak a secret the graph does not contain.
 */
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';
import { EDGE_VERB } from './vocabulary';

/** Formats produced here. The renderer adds `svg` and `png` on top. */
export type GraphDataFormat =
  | 'json'
  | 'md'
  | 'mermaid'
  | 'dot'
  | 'csv'
  | 'html'
  | 'ndjson'
  | 'graphml'
  | 'puml';

/** File extension for a format — used to name the save dialog's default file. */
export const FORMAT_EXTENSION: Record<GraphDataFormat | 'svg' | 'png', string> = {
  json: 'json',
  md: 'md',
  mermaid: 'mmd',
  dot: 'dot',
  csv: 'csv',
  html: 'html',
  ndjson: 'ndjson',
  graphml: 'graphml',
  puml: 'puml',
  svg: 'svg',
  png: 'png',
};

/** Human label for the save dialog's filter list. */
export const FORMAT_LABEL: Record<GraphDataFormat | 'svg' | 'png', string> = {
  json: 'JSON',
  md: 'Markdown',
  mermaid: 'Mermaid diagram',
  dot: 'Graphviz DOT',
  csv: 'CSV',
  html: 'HTML document',
  ndjson: 'NDJSON (line-delimited)',
  graphml: 'GraphML (Gephi / yEd / Cytoscape)',
  puml: 'PlantUML',
  svg: 'SVG image',
  png: 'PNG image',
};

/**
 * Per-run telemetry, optionally joined into an export.
 *
 * Deliberately a narrow record rather than the telemetry types: the graph
 * exporters must not depend on the telemetry subsystem, and the join is by
 * `runId` alone — no telemetry text of any kind enters the graph.
 */
export interface RunTelemetry {
  runId: string;
  durationMs?: number;
  totalTokens?: number;
  costEstimateUsd?: number;
  peakContextTokens?: number;
}

/**
 * Formats that can carry telemetry columns.
 *
 * Mermaid, DOT and PlantUML are excluded on purpose: a diagram has nowhere to
 * put a number without turning node labels into data dumps, which is exactly
 * what makes a rendered graph unreadable.
 */
export const TELEMETRY_CAPABLE_FORMATS: readonly GraphDataFormat[] = [
  'json',
  'md',
  'csv',
  'html',
  'ndjson',
];

/** Render one of the data formats. */
export function exportGraph(
  format: GraphDataFormat,
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  truncated: boolean,
  telemetry?: RunTelemetry[],
): string {
  const runs = telemetry && telemetry.length > 0 ? indexTelemetry(telemetry) : undefined;
  switch (format) {
    case 'md':
      return exportMarkdown(sessionId, nodes, edges, truncated, runs);
    case 'mermaid':
      return exportMermaid(nodes, edges);
    case 'dot':
      return exportDot(sessionId, nodes, edges);
    case 'csv':
      return exportCsv(nodes, edges, runs);
    case 'html':
      return exportHtml(sessionId, nodes, edges, truncated, runs);
    case 'ndjson':
      return exportNdjson(sessionId, nodes, edges, truncated, runs);
    case 'graphml':
      return exportGraphml(nodes, edges);
    case 'puml':
      return exportPuml(sessionId, nodes, edges);
    default:
      return exportJson(sessionId, nodes, edges, truncated, runs);
  }
}

function indexTelemetry(telemetry: RunTelemetry[]): Map<string, RunTelemetry> {
  return new Map(telemetry.map((t) => [t.runId, t]));
}

/** Serialize the graph as JSON — the lossless, machine-readable form. */
export function exportJson(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  truncated = false,
  runs?: Map<string, RunTelemetry>,
): string {
  return JSON.stringify(
    {
      format: 'limboo.workgraph.v1',
      sessionId,
      exportedAt: Date.now(),
      /** True when retention or the read window cut history from this export. */
      truncated,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges,
      ...(runs ? { telemetry: [...runs.values()] } : {}),
    },
    null,
    2,
  );
}

/**
 * One JSON object per line — the form you stream, `grep`, and feed to `jq`
 * without loading the whole graph into memory. It exists because `json` is
 * capped by `exportBytesMax`, so a long session's lossless export has to be
 * something a tool can read incrementally.
 */
export function exportNdjson(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  truncated = false,
  runs?: Map<string, RunTelemetry>,
): string {
  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      type: 'meta',
      format: 'limboo.workgraph.ndjson.v1',
      sessionId,
      exportedAt: Date.now(),
      truncated,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    }),
  );
  for (const n of nodes) lines.push(JSON.stringify({ type: 'node', ...n }));
  for (const e of edges) lines.push(JSON.stringify({ type: 'edge', ...e }));
  if (runs) {
    for (const t of runs.values()) lines.push(JSON.stringify({ type: 'telemetry', ...t }));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * GraphML — the interchange format Gephi, yEd and Cytoscape all read. Node and
 * edge attributes are declared as typed `<key>` elements so those tools can
 * filter and lay out on them rather than treating everything as a label.
 */
export function exportGraphml(nodes: WorkGraphNode[], edges: WorkGraphEdge[]): string {
  const keys = [
    '<key id="d_kind" for="node" attr.name="kind" attr.type="string"/>',
    '<key id="d_status" for="node" attr.name="status" attr.type="string"/>',
    '<key id="d_provider" for="node" attr.name="provider" attr.type="string"/>',
    '<key id="d_title" for="node" attr.name="title" attr.type="string"/>',
    '<key id="d_detail" for="node" attr.name="detail" attr.type="string"/>',
    '<key id="d_run" for="node" attr.name="runId" attr.type="string"/>',
    '<key id="d_started" for="node" attr.name="startedAt" attr.type="long"/>',
    '<key id="e_kind" for="edge" attr.name="kind" attr.type="string"/>',
    '<key id="e_derived" for="edge" attr.name="derived" attr.type="boolean"/>',
  ];
  const body: string[] = [];
  for (const n of nodes) {
    body.push(
      `    <node id="${xmlAttr(n.id)}">`,
      `      <data key="d_kind">${xmlText(n.kind)}</data>`,
      `      <data key="d_status">${xmlText(n.status)}</data>`,
      `      <data key="d_provider">${xmlText(n.provider)}</data>`,
      `      <data key="d_title">${xmlText(n.title)}</data>`,
      `      <data key="d_detail">${xmlText(n.detail ?? '')}</data>`,
      `      <data key="d_run">${xmlText(n.runId)}</data>`,
      `      <data key="d_started">${n.startedAt}</data>`,
      '    </node>',
    );
  }
  for (const e of edges) {
    body.push(
      `    <edge source="${xmlAttr(e.src)}" target="${xmlAttr(e.dst)}">`,
      `      <data key="e_kind">${xmlText(e.kind)}</data>`,
      `      <data key="e_derived">${e.derived ? 'true' : 'false'}</data>`,
      '    </edge>',
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    ...keys.map((k) => `  ${k}`),
    '  <graph id="limboo" edgedefault="directed">',
    ...body,
    '  </graph>',
    '</graphml>',
  ].join('\n');
}

/**
 * PlantUML — for toolchains that render `.puml` in CI or a wiki but have no
 * Mermaid pipeline. Uses the same shape vocabulary as the Mermaid export so the
 * two diagrams read identically.
 */
export function exportPuml(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
): string {
  const lines: string[] = ['@startuml', `title Work graph — session ${pumlText(sessionId)}`, ''];
  const alias = new Map<string, string>();
  nodes.forEach((n, i) => alias.set(n.id, `n${i}`));
  for (const n of nodes) {
    lines.push(`${pumlShape(n)} "${pumlText(n.title)}" as ${alias.get(n.id)}`);
  }
  lines.push('');
  for (const e of edges) {
    const src = alias.get(e.src);
    const dst = alias.get(e.dst);
    if (!src || !dst) continue;
    // Derived edges render dashed, exactly as they do on the canvas — an
    // inferred edge must never be able to masquerade as an observed one.
    lines.push(`${src} ${e.derived ? '..>' : '-->'} ${dst} : ${pumlText(EDGE_VERB[e.kind])}`);
  }
  lines.push('', '@enduml');
  return lines.join('\n');
}

/**
 * Render the graph as Markdown — the form a human pastes into a PR description
 * or a design doc. Organized by RUN rather than as a flat node dump, because
 * "what did this request actually do" is the question an export is for.
 */
export function exportMarkdown(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  truncated = false,
  runs?: Map<string, RunTelemetry>,
): string {
  const lines: string[] = [];
  lines.push('# Work Graph');
  lines.push('');
  lines.push(`Session \`${sessionId}\` · ${nodes.length} nodes · ${edges.length} relationships`);
  if (truncated) {
    lines.push('');
    lines.push('> History is incomplete: retention trimmed the start of this session.');
  }
  lines.push('');

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [runId, members] of groupByRun(nodes)) {
    const objective = byId.get(runId);
    // An absent objective means the run's root fell outside the retained
    // window — say that, rather than implying the work had no request.
    lines.push(`## ${objective ? objective.title : 'Earlier work (objective not retained)'}`);
    const telemetry = runTelemetryLine(runs?.get(runId));
    if (telemetry) lines.push(`_${telemetry}_`);
    lines.push('');

    for (const n of members) {
      if (n.id === runId) continue;
      const status = n.status === 'done' ? 'x' : ' ';
      const detail = summarize(n);
      lines.push(`- [${status}] **${n.kind}** — ${n.title}${detail ? ` _(${detail})_` : ''}`);
    }
    lines.push('');
  }

  const semantic = edges.filter((e) => e.kind !== 'follows' && e.kind !== 'contains');
  if (semantic.length > 0) {
    lines.push('## Relationships');
    lines.push('');
    for (const e of semantic) {
      const src = byId.get(e.src);
      const dst = byId.get(e.dst);
      if (!src || !dst) continue;
      // Inferred relationships are labeled as such — an export must not present
      // a heuristic with the same authority as an observed fact.
      const mark = e.derived ? ' _(inferred)_' : '';
      lines.push(`- ${src.title} ${EDGE_VERB[e.kind]} ${dst.title}${mark}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Mermaid `flowchart` — the format that renders inline in GitHub, GitLab and
 * most Markdown viewers, so a graph can travel inside a PR without an image.
 * Runs become subgraphs, mirroring the Markdown export's structure.
 */
export function exportMermaid(nodes: WorkGraphNode[], edges: WorkGraphEdge[]): string {
  const lines: string[] = ['flowchart TD'];
  const alias = new Map<string, string>();
  nodes.forEach((n, i) => alias.set(n.id, `n${i}`));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let group = 0;
  for (const [runId, members] of groupByRun(nodes)) {
    const objective = byId.get(runId);
    lines.push(`  subgraph run${group} ["${mermaidText(objective?.title ?? 'Earlier work')}"]`);
    for (const n of members) {
      lines.push(`    ${alias.get(n.id)}${mermaidShape(n)}`);
    }
    lines.push('  end');
    group += 1;
  }

  for (const e of edges) {
    const src = alias.get(e.src);
    const dst = alias.get(e.dst);
    if (!src || !dst) continue;
    // Structural order is a plain arrow; semantic relationships are labelled,
    // because the label is the entire reason the edge is worth exporting.
    if (e.kind === 'follows') lines.push(`  ${src} --> ${dst}`);
    else if (e.derived) lines.push(`  ${src} -. "${mermaidText(EDGE_VERB[e.kind])}" .-> ${dst}`);
    else lines.push(`  ${src} -- "${mermaidText(EDGE_VERB[e.kind])}" --> ${dst}`);
  }
  return lines.join('\n');
}

/**
 * Graphviz DOT — for `dot -Tsvg`, and for the graph-analysis tooling that
 * speaks DOT natively. Node shapes follow the panel's own vocabulary so a
 * rendered DOT file reads like the canvas.
 */
export function exportDot(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
): string {
  const lines: string[] = [];
  lines.push(`digraph "limboo_work_graph_${dotText(sessionId)}" {`);
  lines.push('  rankdir=TB;');
  lines.push('  bgcolor="#000000";');
  lines.push('  node [style=filled fillcolor="#0a0a0a" fontcolor="#ededed" color="#2a2a2a"];');
  lines.push('  edge [color="#6b6b6b" fontcolor="#9a9a9a"];');
  for (const n of nodes) {
    lines.push(
      `  "${dotText(n.id)}" [label="${dotText(n.title)}" shape=${dotShape(n)} tooltip="${dotText(n.kind)}"];`,
    );
  }
  for (const e of edges) {
    const style = e.derived ? ' style=dashed' : '';
    const label = e.kind === 'follows' ? '' : ` label="${dotText(EDGE_VERB[e.kind])}"`;
    lines.push(`  "${dotText(e.src)}" -> "${dotText(e.dst)}" [${label.trim()}${style}];`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * CSV — the form that opens in a spreadsheet. Nodes and edges are two tables in
 * one file (a blank line between them), because a graph is not one table and
 * pretending otherwise would lose the edges.
 */
export function exportCsv(
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  runs?: Map<string, RunTelemetry>,
): string {
  const lines: string[] = [];
  lines.push('# nodes');
  lines.push('id,kind,provider,status,title,detail,run_id,seq,started_at,ended_at,ref_kind,ref_id');
  for (const n of nodes) {
    lines.push(
      [
        n.id,
        n.kind,
        n.provider,
        n.status,
        n.title,
        n.detail ?? '',
        n.runId,
        String(n.seq),
        new Date(n.startedAt).toISOString(),
        n.endedAt ? new Date(n.endedAt).toISOString() : '',
        n.ref?.kind ?? '',
        n.ref?.id ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  lines.push('');
  lines.push('# edges');
  lines.push('src,dst,kind,verb,derived,created_at');
  for (const e of edges) {
    lines.push(
      [
        e.src,
        e.dst,
        e.kind,
        EDGE_VERB[e.kind],
        e.derived ? 'true' : 'false',
        new Date(e.createdAt).toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  if (runs && runs.size > 0) {
    lines.push('');
    lines.push('# run telemetry');
    lines.push('run_id,duration_ms,total_tokens,peak_context_tokens,cost_estimate_usd');
    for (const t of runs.values()) {
      lines.push(
        [
          t.runId,
          t.durationMs === undefined ? '' : String(t.durationMs),
          t.totalTokens === undefined ? '' : String(t.totalTokens),
          t.peakContextTokens === undefined ? '' : String(t.peakContextTokens),
          t.costEstimateUsd === undefined ? '' : String(t.costEstimateUsd),
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return lines.join('\n');
}

/**
 * A self-contained HTML report: no scripts, no external assets, no network.
 * It is the "send this to someone who does not have Limboo" format, so it must
 * open correctly from a file:// URL with a strict browser, forever.
 */
export function exportHtml(
  sessionId: string,
  nodes: WorkGraphNode[],
  edges: WorkGraphEdge[],
  truncated = false,
  runs?: Map<string, RunTelemetry>,
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sections: string[] = [];
  for (const [runId, members] of groupByRun(nodes)) {
    const objective = byId.get(runId);
    const rows = members
      .filter((n) => n.id !== runId)
      .map(
        (n) =>
          `<tr><td class="k">${htmlText(n.kind)}</td><td>${htmlText(n.title)}</td>` +
          `<td class="s ${htmlText(n.status)}">${htmlText(n.status)}</td>` +
          `<td class="d">${htmlText(summarize(n))}</td></tr>`,
      )
      .join('\n');
    const telemetry = runTelemetryLine(runs?.get(runId));
    sections.push(
      `<section><h2>${htmlText(objective?.title ?? 'Earlier work (objective not retained)')}</h2>` +
        (telemetry ? `<p class="d">${htmlText(telemetry)}</p>` : '') +
        `<table>${rows}</table></section>`,
    );
  }

  const relations = edges
    .filter((e) => e.kind !== 'follows' && e.kind !== 'contains')
    .map((e) => {
      const src = byId.get(e.src);
      const dst = byId.get(e.dst);
      if (!src || !dst) return '';
      return `<li>${htmlText(src.title)} <em>${htmlText(EDGE_VERB[e.kind])}</em> ${htmlText(dst.title)}${
        e.derived ? ' <span class="inf">(inferred)</span>' : ''
      }</li>`;
    })
    .filter(Boolean)
    .join('\n');

  // The palette is Limboo's own tokens, resolved to literals: a detached
  // document has no stylesheet to resolve `var(--color-*)` against.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Work Graph — ${htmlText(sessionId)}</title>
<meta name="color-scheme" content="dark">
<style>
:root { color-scheme: dark; }
body { margin: 0; padding: 32px; background: #000; color: #ededed;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 28px 0 8px; color: #ededed; }
.meta { color: #9a9a9a; font-size: 12px; }
.warn { color: #d29922; font-size: 12px; margin-top: 8px; }
section { border: 1px solid #1c1c1c; border-radius: 6px; padding: 12px 16px;
  background: #0a0a0a; margin-top: 16px; }
table { width: 100%; border-collapse: collapse; }
td { padding: 4px 8px 4px 0; vertical-align: top; border-top: 1px solid #1c1c1c; }
tr:first-child td { border-top: 0; }
.k { color: #6e9bff; width: 96px; font-size: 12px; }
.s { width: 72px; font-size: 12px; color: #9a9a9a; }
.s.done { color: #3fb950; } .s.error, .s.denied { color: #f85149; }
.s.running { color: #d29922; }
.d { color: #6b6b6b; font-size: 12px; }
ul { padding-left: 18px; } li { margin: 2px 0; }
em { color: #9a9a9a; font-style: normal; }
.inf { color: #6b6b6b; }
</style></head>
<body>
<h1>Work Graph</h1>
<p class="meta">Session ${htmlText(sessionId)} · ${nodes.length} nodes · ${edges.length} relationships · exported ${new Date().toISOString()}</p>
${truncated ? '<p class="warn">History is incomplete: retention trimmed the start of this session.</p>' : ''}
${sections.join('\n')}
${relations ? `<section><h2>Relationships</h2><ul>${relations}</ul></section>` : ''}
</body></html>`;
}

/* ---- helpers --------------------------------------------------------- */

/** Group nodes by run, preserving first-seen order. */
function groupByRun(nodes: WorkGraphNode[]): Map<string, WorkGraphNode[]> {
  const runs = new Map<string, WorkGraphNode[]>();
  for (const n of nodes) {
    const list = runs.get(n.runId);
    if (list) list.push(n);
    else runs.set(n.runId, [n]);
  }
  return runs;
}

/** A short, kind-aware detail suffix for a row. */
function summarize(node: WorkGraphNode): string {
  switch (node.kind) {
    case 'terminal':
      return node.meta.exitCode !== undefined
        ? `exit ${node.meta.exitCode}`
        : node.status === 'error'
          ? 'failed'
          : '';
    case 'git':
      return node.meta.hash ? `${node.meta.op} ${node.meta.hash.slice(0, 8)}` : node.meta.op;
    case 'file':
      return `+${node.meta.change.adds}/-${node.meta.change.dels}`;
    case 'mcp':
      return `${node.meta.server}/${node.meta.tool}`;
    case 'search':
      return node.meta.hitCount !== undefined ? `${node.meta.hitCount} hits` : '';
    case 'subagent':
      return node.meta.childCount > 0 ? `${node.meta.childCount} steps` : '';
    case 'approval':
      return node.meta.decision;
    case 'completion':
      return node.meta.ok ? 'ok' : 'failed';
    default:
      return '';
  }
}

/** The panel's shape vocabulary, expressed in Mermaid's bracket syntax. */
function mermaidShape(n: WorkGraphNode): string {
  const label = `"${mermaidText(n.title)}"`;
  switch (n.kind) {
    case 'objective':
    case 'completion':
      return `((${label}))`;
    case 'approval':
      return `{${label}}`;
    case 'git':
    case 'file':
    case 'artifact':
      return `[${label}]`;
    case 'mcp':
      return `{{${label}}}`;
    case 'terminal':
    case 'service':
      return `[/${label}/]`;
    default:
      return `(${label})`;
  }
}

/** DOT shape for a node, matching the same vocabulary. */
function dotShape(n: WorkGraphNode): string {
  switch (n.kind) {
    case 'objective':
    case 'completion':
      return 'circle';
    case 'approval':
      return 'diamond';
    case 'git':
    case 'file':
    case 'artifact':
      return 'box';
    case 'mcp':
      return 'hexagon';
    case 'terminal':
    case 'service':
      return 'parallelogram';
    default:
      return 'ellipse';
  }
}

/** Mermaid treats quotes and angle brackets as syntax; strip rather than escape. */
function mermaidText(text: string): string {
  return text.replace(/["<>{}[\]|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** DOT string escaping — quotes and backslashes only. */
function dotText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
}

/** RFC 4180 cell: quote whenever the value could otherwise break the row. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Escape for HTML text content and attribute values alike. */
function htmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML text content. Also strips the control characters XML 1.0 forbids. */
function xmlText(text: string): string {
  return text
    // XML 1.0 forbids most C0 controls outright; strip rather than escape.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 400);
}

/** XML attribute value — quotes matter here in a way they do not in text. */
function xmlAttr(text: string): string {
  return xmlText(text).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** PlantUML treats quotes and newlines as syntax; strip rather than escape. */
function pumlText(text: string): string {
  return text.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** PlantUML element keyword, matching the Mermaid/DOT shape vocabulary. */
function pumlShape(n: WorkGraphNode): string {
  switch (n.kind) {
    case 'objective':
    case 'completion':
      return 'usecase';
    case 'approval':
      return 'control';
    case 'git':
    case 'file':
    case 'artifact':
      return 'artifact';
    case 'mcp':
      return 'interface';
    case 'terminal':
    case 'service':
      return 'node';
    default:
      return 'rectangle';
  }
}

/** A one-line telemetry suffix for a run heading. Omits what was not measured. */
function runTelemetryLine(t: RunTelemetry | undefined): string {
  if (!t) return '';
  const parts: string[] = [];
  if (t.durationMs !== undefined) parts.push(`${(t.durationMs / 1000).toFixed(1)}s`);
  if (t.totalTokens !== undefined) parts.push(`${t.totalTokens} tokens`);
  if (t.peakContextTokens !== undefined) parts.push(`peak ${t.peakContextTokens} ctx`);
  // The tilde is the disclaimer: this is a client-side estimate, not billing.
  if (t.costEstimateUsd !== undefined) parts.push(`~$${t.costEstimateUsd.toFixed(4)}`);
  return parts.join(' · ');
}
