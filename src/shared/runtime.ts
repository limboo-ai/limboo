/**
 * Runtime Telemetry — the provider capability table and the display vocabulary.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the renderer must never learn which
 * provider is running in order to decide what to draw. Main stamps
 * {@link PROVIDER_CAPABILITIES} and {@link CAPABILITY_NOTE} onto every
 * `RuntimeSnapshot`; the renderer reads `snapshot.capabilities` and
 * `snapshot.notes` and nothing else. That makes "no per-provider branches in
 * the UI" structural rather than aspirational, and it means a third adapter
 * contributes its sections — and hides the rest — without a renderer edit.
 *
 * So: `SEGMENT_LABEL` and `SEGMENT_SUBSYSTEM` are renderer-facing.
 * `PROVIDER_CAPABILITIES` and `CAPABILITY_NOTE` are MAIN-ONLY. Importing either
 * of the latter into `src/renderer/**` is the mistake this comment is here to
 * catch in review.
 */
import type { AgentProvider } from './constants';
import type { ContextSegmentId, RuntimeCapabilities, RuntimeCapabilityKey } from './types';

/**
 * What each adapter actually reports. Stamped onto the snapshot by main.
 *
 * Claude: the Agent SDK delivers measured token usage per API request
 * (`message_start.usage`), a per-model `contextWindow` and `maxOutputTokens`
 * (`modelUsage`), rolling quota windows (`rate_limit_event`), compaction
 * boundaries, retries, tool heartbeats and thinking-token estimates.
 *
 * Cursor: `cursor-agent --print --output-format stream-json` emits `system/init`,
 * `assistant`, `tool_call` and `result`. The ONLY quantitative field on the
 * entire stream is `result.duration_ms`. Token counts in that output are an
 * open Cursor feature request, not a shipped capability, and request quotas
 * exist only in the team-scoped Enterprise Admin API — a network call this
 * app deliberately does not make. Everything else is therefore `false`, and
 * the UI says so in words instead of showing a zero.
 */
export const PROVIDER_CAPABILITIES: Record<AgentProvider, RuntimeCapabilities> = {
  anthropic: {
    contextWindow: true,
    tokenUsage: true,
    costEstimate: true,
    requestQuota: true,
    quotaWindows: true,
    latency: true,
    compaction: true,
    toolProgress: true,
    thinkingTokens: true,
    retries: true,
  },
  cursor: {
    contextWindow: false,
    tokenUsage: false,
    costEstimate: false,
    requestQuota: false,
    quotaWindows: false,
    latency: true,
    compaction: false,
    toolProgress: false,
    thinkingTokens: false,
    retries: false,
  },
};

/**
 * The "why not" copy for a false capability. Main stamps the relevant entries
 * onto `snapshot.notes`, so the inspector can explain a missing metric without
 * knowing the provider's name. Absent metrics get an explanation, never a
 * fabricated number and never a silent gap.
 */
export const CAPABILITY_NOTE: Record<
  AgentProvider,
  Partial<Record<RuntimeCapabilityKey, string>>
> = {
  anthropic: {},
  cursor: {
    contextWindow:
      'The Cursor CLI does not report token counts or a context window in its stream-json output.',
    tokenUsage: 'Token counts are not present in the Cursor CLI event stream.',
    requestQuota:
      'Cursor does not report request quotas to the CLI. Team quotas exist only in the Cursor Enterprise Admin API, which needs a team admin key and an outbound network call — Limboo is local-first and makes none.',
    quotaWindows: 'Rolling usage windows are not reported by this provider.',
    costEstimate: 'Cost is not reported by this provider.',
    compaction: 'Compaction events are not reported by this provider.',
    toolProgress: 'Per-tool progress is not reported by this provider.',
    thinkingTokens: 'Thinking-token estimates are not reported by this provider.',
    retries: 'Retry attempts are not reported by this provider.',
  },
};

/** Short label for a context-window contributor. */
export const SEGMENT_LABEL: Record<ContextSegmentId, string> = {
  system: 'System & tools',
  conversation: 'Conversation',
  tools: 'Tool results',
  mcp: 'MCP responses',
  memory: 'Memory',
  search: 'Project context',
  resume: 'Repository delta',
  attachments: 'Attachments',
  reserved: 'Reserved for reply',
};

/** Hover copy naming the subsystem that consumed a segment. */
export const SEGMENT_SUBSYSTEM: Record<ContextSegmentId, string> = {
  system:
    'The provider preset, its tool schemas, and everything Limboo could not attribute. Measured as the remainder of the total the provider reported.',
  conversation: 'User and assistant turns in this session since the last compaction.',
  tools: 'Results returned by the built-in file, search and shell tools.',
  mcp: 'Results returned by MCP servers, including Limboo’s own memory and search tools.',
  memory: 'The <project-memory> block the Local Memory System injected for this prompt.',
  search: 'The <project-context> block the Search Engine injected for this prompt.',
  resume: 'The <repository-delta> block the Resume Pipeline injected for this prompt.',
  attachments: 'The per-turn attachment manifest listing files staged for this session.',
  reserved:
    'Held back for the model’s reply — the provider’s own maxOutputTokens for this model.',
};

/**
 * True for windows that measure a long rolling period rather than a short one.
 *
 * MAIN-SIDE ONLY now. The inspector renders the context window and nothing
 * else, so no renderer surface partitions quota windows any more — but
 * `RuntimeTelemetryManager` still uses this to group `knownWindows` for the
 * export, which keeps every window it ever collected.
 */
export function isLongTermWindow(kind: string): boolean {
  return kind.startsWith('seven_day') || kind === 'overage';
}
