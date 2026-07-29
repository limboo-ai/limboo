# Subsystem: Runtime Telemetry

## Purpose

A live view of what the running coding agent is actually consuming: how full the
context window is, which subsystem filled it, how much of the account's rolling
quota is gone, and what the last run cost in time and tokens.

Before this subsystem, the only "how am I doing" signal in Limboo was
`RateLimitInfo` — *scraped out of an error message with a regex*
(`AgentManager.ts`, `parseRateLimit`). By construction that fires only after the
user has already been cut off. Meanwhile the Claude Agent SDK was handing Limboo
a full telemetry stream that `handleMessage` dropped on the floor.

## Why Limboo owns this

Neither provider offers a runtime dashboard, and the two disagree profoundly
about what they even measure. A UI written against either one directly would
have to be rewritten for the other — and rewritten again for a third.

So this is the fifth **provider-neutral platform service** owned by the app,
peer to Memory, Search, Resume and the Work Graph. Both adapters translate their
own wire format into one normalized `RuntimeSnapshot`; the renderer reads the
snapshot's **capability flags** and never the provider id.

## Design principle: capabilities, not provider branches

`PROVIDER_CAPABILITIES` in `src/shared/runtime.ts` declares what each adapter
reports. Main stamps it — and the matching "why not" copy from
`CAPABILITY_NOTE` — onto every snapshot.

**`PROVIDER_CAPABILITIES` and `CAPABILITY_NOTE` are main-only.** Importing either
into `src/renderer/**` is the mistake to catch in review: it is what would turn
"the renderer never branches on provider" from a structural property into an
aspiration. A section hides itself because a flag is false, not because a
component checked which agent is running — which is also why a third adapter
lights up its sections without a renderer edit.

## What each provider actually reports

| Signal | Claude Agent SDK | Cursor CLI |
|---|---|---|
| Live prompt tokens | `stream_event` → `message_start.message.usage` | **absent** |
| Cumulative output tokens | `stream_event` → `message_delta.usage` | **absent** |
| Context window size | `result.modelUsage[model].contextWindow` | **absent** |
| Cost | `result.total_cost_usd`, `modelUsage[].costUSD` | **absent** |
| Rolling quota | `rate_limit_event.rate_limit_info` | **absent** |
| Compaction | `system/compact_boundary` | **absent** |
| Latency | `result.ttft_ms`, `duration_api_ms` | `result.duration_ms` |
| Turns | `result.num_turns` | **absent** |

Two consequences, both load-bearing:

1. **Cursor exposes no token or quota data at all.** Token counts in
   `--output-format stream-json` are an open Cursor feature request, not a
   shipped capability. Request quotas exist only in the team-scoped **Enterprise
   Admin API** (`api.cursor.com`, admin key) — a network call this app
   deliberately does not make. Cursor's sections therefore render an explicit
   *"not reported by this provider"* state with the reason. **Never a zero.**
2. **`total_cost_usd` / `costUSD` are client-side estimates** computed from a
   price table bundled in the SDK — Anthropic's own docs say so and say not to
   bill from them. The field is named `costEstimateUsd`, the UI prefixes it with
   `~`, and every label says "estimated".

`contextWindow` is the quietly important one: the provider tells us the model's
budget, so the ratio needs **no hardcoded model table**, and none may be added.

## The three correctness rules

Encoded in `telemetry/accumulator.ts`, which is a **pure reducer** (no DB, no
IPC, no clock — the `graph/builder.ts` contract) precisely so they are testable
in isolation and cannot be bypassed from a UI edit.

1. **Deduplicate `message_start` by `message.id`.** Parallel tool calls emit
   several assistant messages sharing one id with identical usage — Anthropic
   documents this. Counting each one multiplies the context gauge by the fan-out
   width. This is the most likely way for the number to be quietly, plausibly
   wrong.
2. **A subagent's frames never touch the parent's gauge.** A worker runs in its
   own context window; `parent_tool_use_id` is the only signal that
   distinguishes it. Run *totals* come from `modelUsage` (which includes
   subagents) and are flagged `includesSubagents`; the flat `usage` field, which
   excludes them, is never mixed into the same field.
3. **The measured total is the authority; estimates fill in beneath it.**

## Measured vs estimated

The API reports ONE aggregate input-token count and no breakdown. The
per-contributor split can therefore only come from Limboo measuring the
characters of blocks **it composed itself** — which it can do exactly, because
`runOnce` is the single place the memory, search and resume blocks exist as
strings.

| Segment | Origin | Source |
|---|---|---|
| total used | **measured** | `message_start.usage` |
| `windowTokens`, `reservedTokens` | **measured** | `modelUsage[model]` |
| `autoCompactTokens` | **measured, observed** | first auto `compact_boundary`'s `pre_tokens` |
| `system` | **measured residual** | total − Σ(estimated) |
| memory / search / resume / attachments | estimated | Limboo's own block lengths ÷ `charsPerToken` |
| conversation / tools / mcp | estimated | observed character counts ÷ `charsPerToken` |

The **residual** is what keeps this honest: the measured total is the authority
and everything Limboo could not attribute lands in `system` rather than being
guessed at.

### `attributionDegraded` — the fail-honest path

When the estimates sum ABOVE the measured total (a compaction, a large cache
read, a resumed transcript Limboo never observed), the split is **dropped**, not
scaled to fit, and the UI says why. A bar that always adds up is worth nothing if
it reaches that state by inventing numbers.

### The indeterminate ring

`contextWindow` arrives only on the result message, so a model that has never
completed a run in this install has no denominator. The ring then renders
**indeterminate** (a slowly rotating arc) and the inspector shows the absolute
token count. It must never render 0%: *"not measured yet"* and *"empty"* are
opposite claims and must not look alike. `telemetry_model_limits` persists the
figure so this state is brief and does not recur every launch.

## Storage (schema v18)

Three tables in `limboo.db`. **The schema is the redaction policy** — there is no
column that can hold a prompt, a message, a path, a tool input or a title, so an
export cannot leak conversation data: not because a filter strips it, but because
there is nowhere for it to have been stored.

- `telemetry_usage_samples` — one row per `(provider, window, 5-minute bucket)`,
  upserted. Bucketing is what bounds the table.
- `telemetry_model_limits` — provider-reported `contextWindow` / `maxOutputTokens`
  plus the observed auto-compaction threshold.
- `telemetry_run_rollups` — one row per completed run. `run_id` is the key the
  Work Graph's statistics view joins on.

Bound parameters only. Ring-capped per session by `retainRuns`, age-swept by
`retentionDays` on the hourly maintenance tick.

## Throttling

`message_delta` fires many times a second and `tool_progress` once per second per
tool, so pushes are coalesced per session over `updateFrequency` with a monotonic
`seq` (the `WorkGraphManager` model). Two additions on top of it:

- **Watch gating.** `runtime:setWatching` tells main whether any window shows the
  inspector. With nothing watching, main keeps ingesting — history stays complete
  — but broadcasts only at run boundaries. That is what makes the live ring free
  when the card is closed.
- **Idle tick.** One interval that re-renders countdowns and elapsed timers while
  the card is open. **It polls no provider.** The settings hint says so, because
  "refresh interval" otherwise reads like polling.

`output-progress` and `thinking-tokens` fold into state without scheduling a
flush; the idle tick picks them up.

## Security

- **The IPC surface takes ids, enum literals and one boolean.** No
  renderer-supplied object crosses it, so there is no prototype-pollution surface
  here at all (CLAUDE.md §6) — the `resumeHandlers` shape.
- **One filesystem write**, and the renderer supplies no path: `runtime:save`
  opens `dialog.showSaveDialog` in main and writes where the user chose. Same
  contract as `graph:save`.
- **Bounded everywhere**: coalesced pushes, ringed `seenMessageIds` and tool
  rows, bucketed samples, ring-capped rollups, swept history, capped exports.
- **No network is added.** The quota numbers ride the SDK stream Limboo already
  consumes. Production CSP stays `connect-src 'self'` and no SSRF allowlist is
  needed because there is no fetch.
- **Exports are built field by field from a whitelist** (`telemetry/exporters.ts`),
  never `JSON.stringify` of a loose record — so a future field cannot silently
  ride along into every export.
- `worktree.path` never carries an absolute path. The composition root
  relativizes it against the workspace root and falls back to the BASENAME when
  the result escapes — which is the normal case, not the edge case: the default
  worktree root is `{userData}/worktrees`, so `path.relative` yields a `../../…`
  walk straight back out to `$HOME`.
- **`health.lastError` is the one free string in the subsystem**, and it crosses
  IPC. It runs through the logger's own `redactSecrets` (one implementation, not
  a second weaker copy) and then has absolute paths collapsed to their leaf
  name. These messages come from a separately versioned CLI; what they contain
  is not ours to assume.
- **The watch signal is a SET keyed by `webContents.id`, never a counter.** A
  counter can only be decremented by the renderer that incremented it, so a
  window closing, reloading or crashing mid-hover strands its increment and
  pins main at full push rate forever. Main registers `destroyed` and
  `did-start-navigation` on the sender and retires the entry itself; a repeated
  `true` is idempotent, so there is nothing to inflate.
- `providerSessionId` renders truncated and carries **no full-value tooltip** —
  it is the key to a provider-side conversation, and the prefix is all the UI
  needs to tell two sessions apart.
- **Every failure is swallowed and therefore surfaced.** Observability must never
  break a run, which is exactly why a stream that stopped recording has to be
  visible: `snapshot.health` is that valve, the same as `WorkGraphHealth`.

## Settings

`settings.runtime` — a top-level peer of `settings.graph`, because this is a
platform service rather than provider config. The **UI** lives under Settings ›
Agent › Runtime Indicators, because that is what it describes.

Bounds in `TELEMETRY_LIMITS`; `SETTINGS_VERSION` 26. `normalize()` clamps every
numeric, coerces every boolean and whitelists every enum. It also enforces
`critical < warn`, so the tone ladder can never be non-monotonic.

**26 removed the inspector's section fields.** The card renders the context
window and nothing else (see UI below), so `sectionOrder`, `collapsedSections`,
`showCostEstimate`, `showHistory` and `warnQuotaPct` are gone, along with
`ringMetric: 'quota'`. No data migration was needed: the deep-merge supplies
every default, a stale key left in `settings.json` is never read, and a
persisted `'quota'` self-heals to the default through the enum whitelist.
**Collection is unchanged** — quota windows, usage samples and run rollups are
still ingested, stored and exported.

**`persist: false` is the enterprise policy switch** and it is genuinely off: it
stops writes AND makes history reads return `disabled: true`, so the UI says
"disabled by policy" rather than showing a blank chart that reads as an absence
of usage.

## UI

- **The ring** (`features/agent/runtime/RuntimeIndicator.tsx`) mounts as one
  `shrink-0` sibling in the composer footer's existing `ml-auto` cluster, right
  before the "{agent} ready" hint — or in the session header, per `anchor`. It
  adds **no `overflow-x`**: that row documents that horizontal overflow forces
  `overflow-y: auto` and clips the selects' upward-opening popovers. The card
  opens upward for the same reason. It renders **nothing at all** when telemetry
  is off, and otherwise it is always there: main answers a session with no run
  yet with an **idle snapshot** (capabilities and environment, no `context` and
  no `run`), so the ring appears the moment telemetry is on rather than
  materializing partway through a session. Its provider is read from the
  SELECTED model — the one place in this subsystem that reads settings, because
  there is no run to attribute, and the instant one starts its own provider
  takes over. No measurement is invented: the ring is **indeterminate**, which
  is a different claim from 0%.
- **The inspector** is a `HoverCard` — the app's first shared popover primitive,
  hand-rolled on the `ComposerControls` idiom, no new dependency. Hover *and*
  focus open it; `pinned` keeps it open.
- **Its height is capped at `min(52vh, 420px)`, and that is structural rather
  than taste.** The card is absolutely positioned inside the composer footer,
  which sits inside the floating workspace card — and that card is
  `overflow-hidden`, so a tall panel opening upward is CLIPPED at its top edge
  rather than escaping it.
- **The card shows the context window and nothing else, and that is the
  design.** It carried four collapsible sections in a persisted order — request
  usage, long-term usage, execution detail — and three of them were chrome: two
  render "not reported" on any adapter that does not publish quotas, and the
  third was a nineteen-row dump behind a header collapsed by default anyway,
  while all three pushed the card against the cap above. Context is the one
  resource that matters continuously during a session, so it is now the whole
  card: no section headers, no chevrons, no ordering to remember. The numbers
  that left the card did not leave the app — the Work Graph's Stats tab and the
  telemetry export still carry every one. **Do not reintroduce a section.**
- There is also **no standing footer disclaimer**: every estimate is marked `~`
  and carries its sentence as its own hint, so the disclaimer travels with the
  number instead of costing two lines on every hover.
- **The context meter** is a stacked-segment bar. Seven contributors need seven
  distinguishable fills on pure black, and every one is an existing token (some
  at reduced opacity) — no new hex values. Estimated segments carry a dashed top
  border; high-contrast mode swaps the opacity steps for solid tokens so the
  split never depends on hue alone.
- **`layout: 'compact'`** narrows the card to 280px and folds away the two
  supporting disclosures (*Retrieval budgets*, *Compactions*) — each is a row
  even while closed, and "compact" has to mean something.

## Relationship to the Work Graph

The two meet at exactly one place: `runId`. The graph knows a run's **shape**
(nodes, edges, tools, errors); telemetry knows its **cost**. `graph:runStats`
joins them in main for the panel's Stats tab, and `settings.graph.exportTelemetry`
adds the same columns to the tabular exports.

The dependency is one-directional — the graph reads telemetry through a
structural `GraphTelemetrySource`, telemetry never reads the graph — and no
telemetry *text* enters the graph, only numbers keyed by run.
