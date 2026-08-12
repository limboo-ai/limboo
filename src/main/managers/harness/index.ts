/**
 * Runtime loader for the AI SDK harness packages.
 *
 * They are exports-map-only ESM and main is a CJS bundle, so they are loaded
 * through the runtime's native dynamic import — the same `importEsm` trick
 * `AgentManager` uses for `@anthropic-ai/claude-agent-sdk`, for the same
 * reason: a bare `import()` in TypeScript is rewritten to `require()` by the
 * bundler and fails at runtime. The `new Function` wrapper is what keeps the
 * bundler's hands off it.
 *
 * Loading is lazy and memoised per harness id, so an uninstalled or broken
 * adapter surfaces as a failed run with a named error rather than taking the
 * main process down at boot — the reason `harnessRegistry.ts` holds only
 * module SPECIFIERS and imports nothing.
 */
import { harnessById } from '../agent/harnessRegistry';
import type { HarnessAdapterSettings, HarnessAgentCtor, LoadedHarness } from './types';

const importEsm = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;

const cache = new Map<string, Promise<LoadedHarness>>();

/** Pick a named export off a loaded ESM namespace, or throw with context. */
function pick<T>(mod: unknown, name: string, specifier: string): T {
  const value = (mod as Record<string, unknown>)?.[name];
  if (value == null) {
    throw new Error(`${specifier} does not export "${name}" — the adapter API changed.`);
  }
  return value as T;
}

/**
 * Resolve `HarnessAgent`, the adapter instance, and `stepCountIs` for a
 * harness id. Rejects for a native runtime (Cursor), which Limboo drives
 * itself and which has no AI SDK adapter.
 */
export function loadHarness(harnessId: string): Promise<LoadedHarness> {
  const cached = cache.get(harnessId);
  if (cached) return cached;

  const promise = (async (): Promise<LoadedHarness> => {
    const descriptor = harnessById(harnessId);
    if (!descriptor) throw new Error(`Unknown harness "${harnessId}".`);
    if (!descriptor.module) {
      throw new Error(
        `"${descriptor.label}" is a native runtime and is not loaded through the AI SDK.`,
      );
    }
    const [agentMod, adapterMod, aiMod] = await Promise.all([
      importEsm('@ai-sdk/harness/agent'),
      importEsm(descriptor.module),
      importEsm('ai'),
    ]);
    // Every adapter exports a ready-made default instance under a camelCase
    // name derived from its id (`claude-code` → `claudeCode`), alongside a
    // `createX` factory for configured instances. The factory is optional here
    // only so an adapter that ships without one still loads.
    const base = camelCase(descriptor.id);
    const factory = (adapterMod as Record<string, unknown>)[
      `create${base.charAt(0).toUpperCase()}${base.slice(1)}`
    ];
    return {
      HarnessAgent: pick<HarnessAgentCtor>(agentMod, 'HarnessAgent', '@ai-sdk/harness/agent'),
      adapter: pick<unknown>(adapterMod, base, descriptor.module),
      createAdapter:
        typeof factory === 'function'
          ? (factory as (s: HarnessAdapterSettings) => unknown)
          : undefined,
      stepCountIs: pick<(n: number) => unknown>(aiMod, 'stepCountIs', 'ai'),
    };
  })();

  // Do not cache a rejection: a transient failure (a partially-installed
  // package mid-upgrade) would otherwise poison every later run in the process.
  promise.catch(() => cache.delete(harnessId));
  cache.set(harnessId, promise);
  return promise;
}

function camelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** True when a harness's adapter can actually be loaded in this install. */
export async function harnessAvailable(harnessId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await loadHarness(harnessId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
