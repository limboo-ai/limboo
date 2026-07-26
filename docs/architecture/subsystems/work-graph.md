# Subsystem: Work Graph

## Purpose

A session's transcript is a faithful record of *what was said* and a poor record
of *what was built*. To find the failed build, the dependency decision, or the
commit that implemented a task, you scroll.

The Work Graph makes the canonical representation of engineering work a
**Directed Acyclic Work Graph (DAWG)**: typed nodes joined by semantic edges,
built from the same execution events that drive the conversation. The
conversation becomes *one view of* the graph rather than the thing itself, and
the graph is queryable by **structure** instead of by text.

Source: [`src/main/managers/graph/`](../../../src/main/managers/graph/) and
[`src/renderer/features/graph/`](../../../src/renderer/features/graph/).

## Why Limboo owns this

Neither coding agent exposes a work graph, and this is not an oversight — both
are deliberately conversation-driven. Cursor's CLI emits an NDJSON event stream
([output format](https://cursor.com/docs/cli/reference/output-format)) of
`system/init`, assistant deltas, `tool_call` start/completion correlated by
tool-call id, and a final `result`. Claude's Agent SDK emits an `SDKMessage`
union — assistant/user turns, `SDKResultMessage` with `duration_ms` and `usage`,
partial-assistant stream events, hook lifecycle messages, and
`parent_tool_use_id` for subagent attribution
([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)).
MCP likewise defines `tools/call` with correlatable identifiers but no workflow
model ([spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)).

What both platforms *do* expose is enough structure for a host to derive a graph.
So the Work Graph is a **platform service owned by the app** — a peer of the
[Memory System](memory-system.md), the Search Engine, and the
[Resume Pipeline](resume-pipeline.md) — and it is provider-neutral by
construction. Every adapter, present and future, contributes nodes through the
same normalized layer without the graph knowing which agent ran.

## Design principle: one load-bearing source

| Source | Role |
| --- | --- |
| `AgentManager.onEvent()` | **The only load-bearing source.** Public, ungated, provider-neutral. |
| `HookEngine.subscribe()` | Enrichment only — it is gated on `agent.hookEngine.enabled`. |
| Git / Terminal / Memory / FS / Service / Session | Additive sinks for work the agent did not perform. |

The Hook Engine is deliberately *not* a primary source: a graph that depended on
it would silently go blank whenever a user turned hook auditing off. **The graph
must be complete with `agent.hookEngine.enabled = false`** — that is an explicit
verification case, not an aspiration.

Cursor's `translate.ts` already maps Cursor's tool-union keys onto Claude-shaped
tool names before an event is pushed, so **one mapping table serves both
providers**.

## Node and edge model

Types live in [`src/shared/types.ts`](../../../src/shared/types.ts) beside
`AgentEvent` (the render stream) and `HookEvent` (the governance stream);
`WorkGraphNode` is the third peer — the **structural** stream.

Fifteen node kinds: `objective`, `planning`, `task`, `subagent`,
`investigation`, `search`, `memory`, `mcp`, `terminal`, `git`, `file`,
`approval`, `artifact`, `completion`, `service`.

Nine edge kinds, split into two layers:

- **Structural spine** — `follows`, `contains`. The *only* edges the layouter
  walks. This is what makes the graph read like a git history.
- **Semantic overlay** — `generated`, `depends-on`, `implemented-in`,
  `verified-by`, `blocked-by`, `reviewed-by`, `produced-artifact`. Drawn on
  demand around the selected node.

There is deliberately **no `dependency` node kind** — a dependency is the
`depends-on` *edge*. No provider exposes a dependency object, so a node for it
would be a vertex with no data of its own.

### `derived` is the honesty valve

Every edge carries `derived: boolean`. Edges read straight off a provider event
are exact; edges produced by a heuristic are marked derived, render **dashed**,
and are independently filterable and excludable from queries. **Dashed means
inferred** is the one visual rule a reader has to learn, and it is what stops a
heuristic from ever presenting itself with the authority of an observed fact.

### Event → node mapping

| Source event | Node | Edges |
| --- | --- | --- |
| `message-done` (user) | `objective` (run root) | `follows` ← previous objective |
| `plan` → `ready` | `planning` + `artifact` | `generated`, `produced-artifact` |
| `plan` approved/rejected | `approval` | `reviewed-by`, `blocked-by` on reject |
| `tasks` | one `task` per TodoWrite item | `generated`; `depends-on` (derived) between siblings |
| `tool-start` (read risk) | `investigation` | `follows` |
| `tool-start` `Bash` | `terminal` | `follows` |
| `tool-start` `Task` | `subagent` | `follows` |
| `tool-start` inside a subagent | its own kind | `contains` ← the parent `Task` node |
| `tool-start` `mcp__limboo_*` | `search` / `memory` | `follows` |
| `tool-start` other `mcp__*` | `mcp` | `follows` |
| `tool-start` (write, with change) | `file` | `generated`, `implemented-in` |
| `tool-end` | **patches** the node keyed by `callId` | — |
| permission gate resolved | `approval` | `reviewed-by`, `blocked-by` on deny |
| `result` / `error` | `completion` | `follows` |

`tool-end` carries only `callId`, so the builder joins through a per-run
`Map<callId, nodeId>`. **Never by array position** — parallel tool calls
interleave, and a positional join mis-attributes every one of them.

### Subagent nesting

The Claude Agent SDK sets `parent_tool_use_id` on every assistant and result
message originating inside a subagent's context. `AgentManager` threads it onto
`AgentToolCall.parentCallId`, and the builder uses it to emit `contains` from
the spawning `Task` node instead of `follows` from the spine tip — so a
subagent's work nests under it rather than being spliced into the main lane.

Cursor print mode has no subagents, so the branch simply never forks there.
Cursor's own `subagentStart`/`subagentStop` hooks are not used for this: their
four id fields are documented as all carrying the same value, so parent linkage
is not derivable from them.

### Git commit attribution

`GitManager.commit()` sees only a `workspaceId`, and it is not even the main
path — agent commits go through `Bash("git commit")` and never reach it. The one
seam that catches all three paths (the Git panel, the agent, an external
terminal) is **`GitManager.notifyChanged()`**, the chokepoint every mutating op
already calls. The Work Graph debounces it and reconciles against a bounded
`git log`, resolving attribution in the main process to the active session in
that workspace.

A commit that cannot be attributed is **not** marked as seen. Recording it in
the dedupe set would drop it permanently at the moment its session next becomes
active — which is exactly when it should have been recorded.

Operations that produce no new commit (`push`, `fetch`, `checkout`, `branch`,
`tag`, `init`) are invisible to a `git log` reconcile by definition, so they
emit directly through `GitManager`'s `onGitOp` seam. `pull` emits too, and the
builder only draws `implemented-in` edges from the run's files to commits made
**after the run started** — otherwise twenty pulled upstream commits would each
claim to implement the run's work.

## What the providers do not expose

Stated plainly, so nobody builds a fake:

- **External MCP result payloads.** `McpManager` has no `callTool` — Limboo
  registers servers with the providers but never proxies their traffic. The
  graph records server, tool, params, duration, and ok/error. Nothing more.
- **Exit codes for agent commands.** The Agent SDK does not stream tool stdout,
  so an agent `Bash` call resolves to done/error and **has no numeric exit
  code**. `terminal.meta.exitCode` is left `undefined` for agent commands and is
  populated only for real PTYs. It is never synthesized as `0`.
- **`depends-on`** has exactly two real sources: TodoWrite ordering (derived)
  and the Search Engine's `search_refs` import table (real extraction).
- **`verified-by`** has no provider signal at all. It is derived from three real
  facts — a command's actual text, its actual success, and its actual position
  after a file change — plus the repo's own `limboo.json` script names. That is
  inference, and it is marked as such.

## Storage (schema v15)

Two tables plus an FTS index, in
[`src/main/db/database.ts`](../../../src/main/db/database.ts):

- **`work_graph_nodes`** — indexed header columns plus a `payload` holding the
  JSON `WorkGraphNode` (the `hook_audit` pattern). `ref_kind`/`ref_id` is the
  bidirectional-navigation join.
- **`work_graph_edges`** — a **separate** table, not folded into the payload.
  Traversal is the point of the feature, and edges in JSON would force a full
  scan and parse per query. `ON DELETE CASCADE` keeps edges from outliving a
  pruned node; a `UNIQUE(src, dst, kind)` index makes re-emitting an edge
  idempotent.
- **`work_graph_nodes_fts`** — FTS5 over title+detail, mirroring `memories_fts`.

There is no runs table: **a run *is* its `objective` node** (`run_id` refers to
itself for a root).

`seq` is a monotonic per-session insertion counter and is **the structural
order**. It is seeded from `store.maxSeq()` so a new run after a restart appends
to history instead of interleaving into the middle of it, and the layouter sorts
by it rather than by `startedAt` — timestamps genuinely disagree with insertion
order, because a tool node carries the tool's own start time while a plan or
completion node is stamped when it is built.

Deletion happens at **two** sites: `AgentManager.clearSession()` and
`SessionManager.purge()` — the latter does not route through the former.

## Layout

A hand-rolled `git log --graph` column walk in
[`layout/laneLayout.ts`](../../../src/renderer/features/graph/layout/laneLayout.ts).
No layout library: the repo has a standing no-heavyweight-deps position, and a
force-directed layout would contradict the product requirement that the graph
read like a git history.

1. **Order + DAG enforcement** — sort by `seq`, then drop any spine edge
   pointing backwards and count it. Acyclicity is *enforced*, not assumed: a
   builder bug surfaces as a dropped-edge count in the legend rather than an
   infinite loop.
2. **Rows** — one node per row, fixed height. This is what makes
   `y = row * ROW_H` O(1) and invertible, and therefore makes virtualization
   trivial.
3. **Lanes** — inherit the primary spine parent's lane, else take the first
   free one; free a lane when its last child is placed. Subagents fork lanes to
   the right and merge back. Git nodes consume **no** lane — they sit in a
   right-hand gutter aligned to the work that produced them, which delivers
   "commits beneath their implementation" without perturbing lane assignment.
4. **Routing** — orthogonal segments with a single quarter-arc elbow. Never
   beziers; curved edges at this density read as spaghetti.

## Layout runs in a renderer Web Worker

`layout/layout.worker.ts`, imported via Vite's `?worker`. **Not** a
`utilityProcess`, and this is deliberate:

- The graph data is already in the renderer after the IPC delta. Routing layout
  through main would ship a third copy renderer → main → utility → main →
  renderer for a computation whose only consumer is the renderer.
- The output is pure geometry — flat arrays of numbers and path strings.
- Nothing about it needs Node. A Web Worker inherits `sandbox: true` and has no
  Node APIs, so this **cannot** weaken the process boundary. It is compute, not
  OS access, which is what the "renderer = UI only" rule is actually about.
- `worker-src 'self' blob:` is already present in the dev CSP, the production
  CSP, and the `index.html` meta fallback — zero security-config change.

If a worker cannot be created the hook falls back to computing synchronously,
but only up to `GRAPH_LIMITS.syncLayoutMax`. Above that the panel explains
itself. **Never block, never hang.**

## Query

Structural search is a two-stage hybrid, because neither half answers the
product's questions alone:

1. **Seed** — FTS5 BM25 over node title+detail (plus kind filters) finds nodes
   matching the text predicate.
2. **Closure** — a bounded breadth-first walk over `work_graph_edges` expands
   those seeds into the surrounding subgraph.

The closure is an explicit loop of individually LIMIT-ed statements rather than
one `WITH RECURSIVE`, so no shape of graph — including one with a cycle that
slipped past the builder — can make it run unbounded. `depth` and `limit` are
clamped in the IPC layer *and* re-clamped in the engine: an unbounded traversal
triggered from the renderer would be a denial of service, not a slow query.

Free text is reduced to bare alphanumeric terms before it reaches FTS5, so a raw
user string can neither throw a syntax error nor reach operators the app never
meant to expose.

## Security

- Every statement is parameterized. The only text spliced into SQL is a run of
  `?` placeholders built from an array's length.
- `graph:query` is the one object surface and is rebuilt field by field from a
  whitelist after a prototype-pollution guard; everything else takes string ids
  only.
- Every string is redacted (via the shared redactor, extracted from the Hook
  Engine so the two can never drift) and length-clamped before it reaches
  SQLite — so an export cannot leak a secret the graph does not contain.
- `graph:clear` requires an explicit session id; clearing every session is a
  maintenance operation, not something a renderer call can trigger.
- Redaction is applied to `meta` as a whole, recursively, on the single path
  every node takes into SQLite — not only to `title`/`detail`. A future sink
  that puts a raw string in a new `meta` field is therefore covered without
  opting in. The patterns cover credential-bearing URLs (`https://u:tok@host`,
  the case CLAUDE.md §8 calls out for the Git engine), provider keys, GitHub /
  AWS / Slack tokens, PEM blocks, JWTs, and generic `secret=`-shaped
  assignments.
- Array inputs are **capped before they are filtered**, so an oversized array is
  never fully walked; `graph:export` results are byte-capped; edge reads are
  `LIMIT`-ed rather than `SELECT *`.
- `graph:save` is the subsystem's only filesystem write, and the renderer never
  supplies a path: it sends a session id and a format, main opens
  `dialog.showSaveDialog`, and main writes wherever the **user** chose. There is
  consequently no path to validate and no traversal surface to defend.

## Export

Six data formats are rendered in main from the stored graph — JSON
(`limboo.workgraph.v1`), Markdown, Mermaid, Graphviz DOT, CSV, and a
self-contained HTML report — plus SVG and PNG, which are rendered in the
renderer because they need a layout and the layout only exists there.

The image formats are drawn **offscreen from the full layout**, never by
serializing the live canvas: the canvas is virtualized, so serializing it
exported the rows currently scrolled into view with the zoom baked into the
transform, and called that the graph.

Both sinks are offered. Copy-to-clipboard is size-checked against the main
process's 1 MB clipboard cap and refuses with an actionable message rather than
handing back a silently truncated (and, for JSON, invalid) export.

## Recording health

Every failure inside the subsystem is swallowed so it can never break a run.
That is correct, but it left a graph that had stopped recording looking exactly
like a quiet session. `WorkGraphHealth` rides the snapshot and the delta push,
and the panel shows a banner — consecutive failure count plus the redacted last
error — instead of an innocent empty canvas.

## Settings

`settings.graph`, with bounds in `GRAPH_LIMITS`. Every control changes real
behavior. Four knobs a graph feature conventionally offers were deliberately
**not** shipped, because nothing in this codebase backs them and a switch that
toggles nothing is worse than a missing one:

| Not shipped | Why | Shipped instead |
| --- | --- | --- |
| snapshot frequency | The graph is an append-only log, already durable per flush. | `updateFrequency` (the real coalescing window) |
| caching | There is no configurable cache. | — |
| background indexing priority | No prioritized scheduler exists; Node has no thread priorities. | — |
| semantic compression | Means a model call on the user's dime. | `collapseRunsOlderThan` (deterministic, offline) |

Historical replay ships as a **viewer control**, not a setting — the data is
already timestamped, so replay is a filter with nothing to persist.

## UI

A full-bleed drawer panel reached from the TitleBar tab strip, in the pure-black
palette (every SVG stroke is a `var(--color-*)` token). The shape vocabulary is
the product requirement: circles are milestones, diamonds decisions, squares
artifacts and commits, hexagons MCP services, a terminal glyph command
execution, a folder a workspace change.

Selection is bidirectional (`focus.ts`), gated on `settings.graph.timelineSync`:
a node reveals the message, commit, checkpoint, terminal, or memory it stands
for, and those surfaces can reveal the node. Every jump reuses an existing
mechanism — the conversation's turn anchors, the Git panel's focus, the terminal
store's active tab — rather than inventing a second navigation system.
