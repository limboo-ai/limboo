/**
 * Per-adapter factory arguments.
 *
 * `loadHarness` derives the factory NAME from the harness id by camel-casing
 * (`claude-code` → `createClaudeCode`, `codex` → `createCodex`, `pi` →
 * `createPi`), which works for all three. What diverges is the ARGUMENTS: each
 * adapter accepts a different set, and passing a key an adapter does not declare
 * is at best ignored and at worst a validation error. So the mapping lives here,
 * in one exhaustive switch, keyed by the registry's `settingsShape` tag.
 *
 * Every shape below was read from the installed package's own `index.d.ts`, not
 * from documentation — the docs and the published types disagreed about
 * `maxTurns` (only claude-code has it) and omitted Pi's `agentDir` entirely.
 *
 * Rule for adding an adapter: read its `.d.ts` first, give it a tag, and pass
 * only keys it declares. Never spread a common object across all three.
 */
import { isAdapterDefaultModel } from '@shared/constants';
import type { SessionPermissionMode } from '@shared/types';

/** Which adapter's argument shape to build. */
export type HarnessSettingsShape = 'claude-code' | 'codex' | 'pi';

/** What the runtime knows that an adapter might want. */
export interface AdapterSettingsInput {
  model: string;
  maxTurns: number;
  /** Native-format MCP server definitions, when Limboo has any to offer. */
  mcpServers?: Record<string, unknown>;
  /** Composer mode, for adapters that expose a reasoning/thinking dial. */
  mode: SessionPermissionMode;
  /** `settings.agent.thinking`. */
  thinking: 'off' | 'on' | 'adaptive';
  /** `settings.agent.webSearch`. */
  webSearch: boolean;
}

/**
 * Build the factory argument object for one adapter.
 *
 * Deliberately returns a plain record rather than a union of typed shapes: the
 * value is handed straight to a dynamically-imported factory, so a nominal type
 * would be a claim this module cannot verify. The switch is what guarantees only
 * declared keys are set.
 */
export function buildAdapterSettings(
  shape: HarnessSettingsShape,
  input: AdapterSettingsInput,
): Record<string, unknown> {
  const mcp = input.mcpServers ? { mcpServers: input.mcpServers } : {};
  // A `:default` id is Limboo's way of saying "the adapter picks" — omitting
  // the key is how the adapters document that, and sending the sentinel itself
  // would put a fake model id on a real API call.
  const model = isAdapterDefaultModel(input.model) ? {} : { model: input.model };
  switch (shape) {
    case 'claude-code':
      // The only adapter with `maxTurns`; `thinking` is its own config object.
      return {
        ...model,
        maxTurns: input.maxTurns,
        ...mcp,
      };
    case 'codex':
      // No `maxTurns` — the agent loop is bounded by `stopWhen` instead. `port`
      // is deliberately NOT set: the adapter takes the first port the sandbox
      // declares, and Limboo's provider only ever hands out loopback ones, so
      // naming a port here could only ever be wrong.
      return {
        ...model,
        reasoningEffort: reasoningEffortFor(input.thinking),
        webSearch: input.webSearch,
        ...mcp,
      };
    case 'pi':
      // Host-process: no bridge, no port, no bootstrap. `extensionFactories` is
      // never passed — it loads arbitrary code into Limboo's own process, which
      // is not something a settings toggle should be able to do. `agentDir` is
      // left at its default so Pi keeps its state outside the worktree.
      return {
        ...model,
        thinkingLevel: piThinkingLevel(input.thinking),
        ...mcp,
      };
    default: {
      const never: never = shape;
      throw new Error(`Unhandled harness settings shape: ${String(never)}`);
    }
  }
}

/** `settings.agent.thinking` → Codex's reasoning dial. */
function reasoningEffortFor(thinking: AdapterSettingsInput['thinking']): 'low' | 'medium' | 'high' {
  switch (thinking) {
    case 'off':
      return 'low';
    case 'on':
      return 'high';
    case 'adaptive':
    default:
      return 'medium';
  }
}

/**
 * `settings.agent.thinking` → Pi's thinking level.
 *
 * Pi's own union is not re-exported in a form this module can import without
 * pulling in `@ai-sdk/*` (which lint forbids), so the values are the documented
 * strings and a wrong one degrades to the adapter's default rather than throwing.
 */
function piThinkingLevel(thinking: AdapterSettingsInput['thinking']): string {
  switch (thinking) {
    case 'off':
      return 'low';
    case 'on':
      return 'high';
    case 'adaptive':
    default:
      return 'medium';
  }
}
