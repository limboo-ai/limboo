# Subsystem: Subagent orchestration

## Purpose

When the coding agent delegates work — research, review, testing, repository
exploration — the user needs to know it happened, what the worker did, and what
it concluded. What they must *not* get is a second conversation to manage.

This subsystem makes the **conversation stream the only orchestration surface**.
A delegation renders as one inline activity that expands into an execution
record. There is no subagent panel, no subagent window, and no subagent tab.

Sources:
[`src/shared/subagents.ts`](../../../src/shared/subagents.ts),
[`src/renderer/features/workspace/SubagentActivity.tsx`](../../../src/renderer/features/workspace/SubagentActivity.tsx),
[`src/renderer/features/workspace/subagentStages.ts`](../../../src/renderer/features/workspace/subagentStages.ts),
and the capture path in
[`AgentManager.ts`](../../../src/main/managers/AgentManager.ts).

## Two surfaces, one implementation

| Surface | File | Role |
| --- | --- | --- |
| Inline row | `SubagentActivity.tsx` | The default. One row in the stream, expandable. |
| Maximized tab | `SubagentWorkspace.tsx` | Opened by Maximize; full-width live view. |
| Shared presenters | `subagentParts.tsx` | Stages, record rows, validation, changed files, tool list. |

The split is exactly `DiffView` / `DiffWorkspace` over `DiffEditor`: **density is
the only thing the shells vary**, and what a fact *means* is decided once. A
maximized tab is a `DocumentRef` (`{ kind: 'subagent', callId, title }`),
pathless like `release-notes` — which means `documentId` and `titleFor` both need
a case *before* their path-shaped tails or the tab throws while opening.

Presentation state lives in a **parallel `subagentViewCache`**, keyed by
`DocumentId` alongside `viewCache`. Not a widened union: `viewCache` is typed
`Record<DocumentId, DiffViewState>` and every consumer does
`?? DEFAULT_VIEW_STATE`, so widening would break `viewFor` and each call site.
Same key space, same invariant — **minimize never clears it**, which is why a
maximize → minimize → maximize round-trip keeps scroll position and open state.

A subagent tab is **not persisted** (`persist()` skips it, like release notes): it
watches a live run that can never resume, and the record it shows already lives
in the conversation.

## Why there is no subagent panel

Claude Code's documented model is that a subagent runs in **its own context
window** with its own system prompt, tools, and permissions, and returns **only
its final message** to the parent — intermediate tool calls and results stay
inside it by design ([subagents][1], [SDK subagents][2]). Cursor's model is the
same shape: delegation happens inside the agent runtime rather than by the user
opening more chats.

A permanent side panel would therefore:

- duplicate what the timeline and the Tasks drawer already show;
- invite the user to supervise several conversations when the entire value of
  delegation is that they supervise one;
- imply access to a worker's reasoning that neither provider exposes.

So orchestration is observed **in the stream**, and completion links out to the
surfaces that already exist (Git for a changed file, the Tasks drawer for
progress, the Work Graph for structure).

## The one identity rule

The spawning tool has **two names**. Claude Code renamed `Task` to `Agent` in
v2.1.63; current SDK releases emit `Agent` in `tool_use` blocks but still report
`Task` in the `system:init` tool list and in
`result.permission_denials[].tool_name`, and older releases emit `Task`
everywhere ([SDK subagents][2]).

`src/shared/subagents.ts` is the single answer — `isSubagentTool(name)` — used by
main and the renderer alike. **Never test `name === 'Task'`.** Doing so is what
left the Work Graph's `subagent` node kind unreachable on every current release.

## Capture (main)

Two sources, and the distinction is load-bearing for honesty.

### Reported — the SDK's `task_*` messages

`AgentManager.handleMessage` `case 'system'` used to handle only `subtype:
'init'` and drop the rest, so the entire task family went on the floor and
everything below had to be guessed. `onTaskMessage` now consumes it:

| Message | Carries | Lands on |
| --- | --- | --- |
| `task_started` | `subagent_type`, `description`, `skip_transcript` | identity |
| `task_progress` | `summary` (AI one-liner), `last_tool_name`, `usage` | `progress`, `lastTool` |
| `task_updated` | `patch.status`, `error`, `is_backgrounded` | `error`, `background` |
| `task_notification` | `status`, `summary`, `usage` | `outcome`, `summary` |

`usage` gives measured `duration_ms`, `tool_uses` and `total_tokens` — real
figures, not `endedAt - startedAt` and a list length. Every one is joined by
**`tool_use_id`**, never by array position: concurrent workers interleave, and a
positional join mis-attributes all of them (the same rule `graph/builder.ts`
follows for `tool-end`).

`skip_transcript: true` marks ambient/housekeeping tasks the SDK explicitly asks
consumers to hide. Those never render a row.

Both opt-ins default to **off** in the SDK and are wired to settings:
`forwardSubagentText` → `agent.subagents.forwardText`, `agentProgressSummaries`
→ `agent.subagents.progressSummaries`.

### Rolled up — the worker's own tool calls

| Signal | Source | Lands on |
| --- | --- | --- |
| What was authorized | Agent tool input `prompt` | `AgentToolCall.detail` |
| Worker's own calls | `parent_tool_use_id` → `parentCallId` | `tools`, `mcpServers`, `filesRead`, `filesChanged` |
| Verification | `Bash` commands matched by `validationKindOf` | `validations` |
| Permission prompts | `decideToolUse` → `subagentOwningPrompt` | `permissions` |

`parent_tool_use_id` is the **only** signal distinguishing a worker's tool call
from the parent's. It arrives on complete assistant messages, never on stream
events — the SDK documents it as always `null` on `SDKPartialAssistantMessage`,
because token deltas from subagents are not forwarded ([streaming output][3]).

Rules the roll-up enforces:
- `limboo_memory` / `limboo_search` are **not** MCP servers — they are Limboo's
  own retrieval bridges, excluded here exactly as everywhere else.
- `filesRead` counts every read-shaped tool (`Read`/`Glob`/`LS`/`NotebookRead`),
  matching the stage that produces it.
- `validations` is evidence, never inference: an unrecognized command
  contributes nothing, so a worker that ran no tests reports none rather than
  zero.

### The text that must not leak

`handleMessage` reads `parent_tool_use_id` **before** finalizing assistant text.
It did not, which meant that with `forwardSubagentText` on, a worker's narration
was spliced into the parent transcript as a top-level assistant message *and
persisted* — the context flooding delegation exists to prevent. Worker text now
goes to `SubagentInfo.transcript` and nowhere else.

### Roll-up re-emits the parent

`SubagentInfo` lives on the spawning `AgentToolCall`, and `tool-start` is the
only event carrying a whole call. So each update re-emits the parent; the
renderer's reducer de-dupes on id, and `buildTurns` re-sorts by `startedAt`, so
the row updates in place without moving. Every roll-up failure is swallowed —
observability must never break a run.

## Persistence

Ordinary tool calls are runtime state, rebuilt per run and never stored. A
subagent is the exception: its row is the only record of a delegation in the
conversation, and without a table the Work Graph remembered that a worker ran
while the transcript showed nothing.

`agent_subagent_runs` (schema v17) holds one row per delegation, `payload` being
the JSON `SubagentInfo` — the `work_graph_nodes` shape-in-a-blob approach, so
extending the record needs no migration. Ring-capped per session by
`agent.subagents.retainRuns`. `getSnapshot` merges stored rows under the live
ones; a run that was in flight when the process died rehydrates as **errored**,
never as a row that spins forever.

## Rendering (renderer)

`SubagentActivity` is one row. While the worker runs it shows **derived stages**;
once it settles it collapses to a single line that expands into the execution
record and the returned summary.

Stages come from `subagentStages.ts`, using the same technique as
`plan/milestones.ts`: map the worker's own tool names onto stages, and mark a
stage active **only while one of its tools is genuinely running**. Deriving from
the furthest-reached stage instead mislabels the common interleaved case
(Read → Grep → Read). No new event kind, so both providers get it free.

Progress has two tiers. The provider's own line leads when it exists — it is the
model describing its own work — with the derived stages beneath it as the
structural readout, and they are the whole story when nothing is reported
(summaries off, or a Cursor run).

### Prose bodies: disclosure and clamp, not necessarily a border

Rows sit at the stream's own typographic weight and are never cards — that is
what makes a turn read as a timeline rather than a stack of boxes.

A body is not a row. A returned summary, a forwarded transcript, and an approved
plan are documents: paragraphs, headings, task lists. Rendered flush under a 10px
uppercase label they had no boundary at all, at a size that fought the wrapper's
(`Markdown`'s root sets `13.5px` on a child and beats a `12px` parent), inside a
`max-h-72` nested scroller that trapped the wheel with no sign anything was below.

`ProseCard` fixes all three: a disclosure, a clamp with a fade and an explicit
**Show more**, one consistent size, and an actions slot for a `CopyButton`.

**The border is a separate question, and `variant` answers it.**

| Where | Variant | Why |
| --- | --- | --- |
| Approved plan in a user turn | `card` | Separates a document from unrelated stream content around it. |
| Subagent transcript / summary | `bare` | Sits among `validation`, `files changed`, `tool calls` — all plain labelled sections of the SAME record. A border on only these two made them read as a different kind of thing. |

The rule: a container earns its border when it separates a document from
unrelated content, not when everything around it is the same document.

### Long tool lists collapse

`ToolCallList` (the maximized tab only — the inline row reports a count) folds
above `TOOL_LIST_AUTO_COLLAPSE`. Evaluated at mount, deliberately: opening a
settled worker with forty calls starts folded, while a worker being watched live
starts at zero and stays open as it fills, because collapsing the list out from
under someone watching it would be worse than a long list. The count, plus any
running/failed tallies, stays on the collapsed row — folding hides detail, never
the fact that the work happened.

Conventions, all inherited rather than invented:

- Rows sit at the stream's own typographic weight, never a card (`PlanInline`).
- Children indent with `ml-1.5 … border-l border-line pl-2` — the repo's one
  "these rows belong to that row" idiom, from `ToolGroup`.
- State is the **icon**: `HelixLoader` running, `text-success` check complete,
  `text-warning` on a permission pause, `CircleAlert`/`text-danger` on failure —
  the *same* glyph the Tasks drawer uses for the same state. **No coloured
  strip**, the rule the rails, tab strips, and message actions follow.
- State is also in **words** (`aria-label`), not only colour: the collapsed row
  was a bare check glyph with no accessible text.
- A field the provider did not report is **omitted**, never defaulted. There is
  deliberately no `worktree` field — `isolation: worktree` creates a worktree
  Claude Code manages internally and never reports, and showing the session root
  instead would be a confident wrong answer.

The worker's reasoning is absent and nothing implies otherwise: neither provider
exposes a subagent's chain of thought, so no affordance may look like it is
hiding one. The forwarded transcript is narration, not reasoning.

### Completion links

`filesChanged` carries `FileChange[]`, not paths, so each row shows its diffstat
and opens its own review via
`useDocumentStore.promote(sessionId, { kind: 'diff', path, staged: false })` —
the same call `ChangesNavigator` and `GitFileRow` make. The Git tab is
deliberately **not** the target: `GitFocus.path` is written by three call sites
and read by none, so "open Git focused on this path" does not exist. A footer
link reveals the delegation in the Work Graph via `revealInGraph({ kind: 'tool',
id })`.

There is **no task link**. `TaskItem` has index-derived ids and no timestamps, so
a settled worker's task is genuinely not recoverable. The Tasks drawer nests
*live* workers under the *live* task — an association that is sound because both
are current — and archives finished ones under "Delegated work" rather than
attributing them by guesswork.

## Permissions

A worker's tool calls re-enter **the same gate** — `AgentManager.decideToolUse`,
one closure per run with the same `permMode` and the same cwd. That invariant is
what makes delegation safe, and it is why approving a spawn grants no capability
the gate would not have granted anyway.

Three consequences this subsystem made concrete:

- **A prompt raised inside a worker is attributed to it** (`PermissionRequest.
  parentCallId` / `subagentType`). The SDK does not pass `parent_tool_use_id` to
  `canUseTool`, so `subagentOwningPrompt` resolves it from two sources: a sole
  worker in flight, or — under concurrency — the worker whose `last_tool_name`
  (from `task_progress`) matches the tool being gated. When neither is
  unambiguous the answer is **undefined** and the dialog renders exactly as it
  does without subagents. Attributing a prompt to the wrong worker is worse than
  not attributing it.
- **Remembered "always allow" choices are scoped.** They were keyed
  `sessionId:remember` for every prompt, so one approval on a read silently
  granted every later write and shell command *and* satisfied the sensitive-file
  guard. They are now keyed by risk class, with `sensitive` as its own scope that
  no ordinary approval can satisfy. Subagents sharpened this rather than causing
  it: a blanket grant follows every worker.
- **A worker's transcript is untrusted content.** Claude Code scans a subagent's
  final message for instruction-shaped patterns (control-tag imitation,
  `Human:`/`Assistant:` turn markers) before the parent reads it. Limboo now
  renders that text itself, so it is bounded by `transcriptMax`, stored as data,
  and **never** merged into a system prompt or a context provider —
  `buildOptions` still has exactly three context producers.

## Cursor

Cursor print mode carries **no `parent_tool_use_id` analogue**, so a Cursor run
renders its tool calls flat exactly as before — every subagent surface degrades
to nothing rather than breaking.

`subagentStart` / `subagentStop` are registered on the existing hook bridge and
mapped `observeOnly: true`. Because the `observeOnly` branch acknowledges and
returns, they must record something explicitly or they are dead code — so the
branch emits `subagent-start` / `subagent-stop` onto the governance bus, making
a Cursor delegation auditable in the Hooks tab even though it has no row.

They are deliberately **not** a permission gate: Cursor documents
`permission: "ask"` as unsupported on `subagentStart` and treated as a deny, so
routing them through the permission core could silently kill a delegation the
user never saw a prompt for. They are also **not** a nesting source — their four
id fields are reported to all carry the same session id, and `subagentStop` is
reported not to fire for background workers.

## Verification

1. `npm start`, then prompt something that delegates ("use the Explore agent to
   find every call site of `resolveSessionRoot`").
2. The stream shows one accent row naming the worker and its task, with stages
   advancing beneath an indented rule — **not** a flat run of the worker's tools.
3. On completion the row folds to one line with `duration · N tools`. Expanding
   shows the execution record and the returned summary.
4. Tasks drawer: the live worker nests under the in-progress task; finished ones
   appear under **Delegated work**.
5. Work Graph: a `subagent` node with `contains` edges to the worker's calls, and
   `agent` / `children` / duration in the inspector.
6. Export the turn (message actions → Export): the worker's calls are indented
   under the spawn.

[1]: https://code.claude.com/docs/en/sub-agents
[2]: https://code.claude.com/docs/en/agent-sdk/subagents
[3]: https://code.claude.com/docs/en/agent-sdk/streaming-output
