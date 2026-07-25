/**
 * The shared secret redactor for observability payloads.
 *
 * Extracted from the Hook Engine so the Work Graph and the audit trail apply
 * the SAME rules — two copies would drift, and a drifted redactor is a leak.
 * Every string that reaches SQLite or the renderer from either subsystem passes
 * through here first, then gets length-clamped by the caller (defense in
 * depth: redaction removes secrets, clamping removes bulk).
 *
 * This is deliberately conservative and pattern-based. It is the LAST line of
 * defense, not the first — producers are still expected not to put raw tool
 * input (which may carry `.env` contents) into a summary.
 *
 * Two entry points, and both matter:
 *   - {@link redactSecrets} for a single string (titles, details, commands).
 *   - {@link redactDeep}    for a whole `meta` object. `meta` is serialized
 *     wholesale into the node payload and broadcast to the renderer, so a sink
 *     that puts a raw string into a new `meta` field would otherwise bypass the
 *     redactor entirely. Walking it makes coverage structural rather than a
 *     property of every future call site remembering to opt in.
 */

/** Max object depth walked by {@link redactDeep}; deeper values are dropped. */
const MAX_DEPTH = 8;

/** Keys never copied out of a renderer- or repo-influenced object (CLAUDE.md §6). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Names whose assigned value is treated as a secret. Only four provider env
 * vars used to be handled, so `MY_APP_SECRET=…` on a command line survived;
 * this matches the *shape* of a secret assignment instead of an allowlist.
 */
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*`;

/** Strip token-like secrets before anything reaches the DB / renderer. */
export function redactSecrets(text: string): string {
  return (
    text
      // Credential-bearing URLs (`https://user:ghp_x@github.com/…`). CLAUDE.md §8
      // calls this out for the Git engine specifically: a remote typed into a PTY
      // or passed to `git push` becomes a node title, and no token pattern below
      // would catch a password that is not provider-shaped.
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]{1,256}:[^/\s@]{1,256}@/gi, '$1***@')
      // Whole PEM blocks — collapse rather than leaving the body inline.
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        '-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----',
      )
      // Provider-shaped keys.
      .replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
      .replace(/crsr_[A-Za-z0-9_-]{8,}/g, 'crsr_***')
      .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_***')
      .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, 'gh*_***')
      .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***')
      .replace(/xox[baprse]-[A-Za-z0-9-]{10,}/g, 'xox*-***')
      // JWTs (three base64url segments) — bearer tokens often arrive bare.
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'eyJ***')
      // Named provider env vars, kept explicit: their values have no prefix to
      // match on, so only the name identifies them.
      .replace(
        /(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|CURSOR_API_KEY)=\S+/gi,
        '$1=***',
      )
      // Any secret-shaped assignment. Numeric values are left alone so honest
      // telemetry (`total_tokens: 128000`) does not read as a redacted secret.
      .replace(
        new RegExp(
          String.raw`(${SECRET_NAME})(\s*[:=]\s*)("[^"]{6,}"|'[^']{6,}'|[^\s"',;]{6,})`,
          'gi',
        ),
        (match, name: string, sep: string, value: string) =>
          /^["']?\d+["']?$/.test(value) ? match : `${name}${sep}***`,
      )
      .replace(/(authorization|bearer)\s*[:=]?\s*[A-Za-z0-9._-]{10,}/gi, '$1 ***')
  );
}

/**
 * Redact every string reachable inside a value, preserving its shape.
 *
 * Bounded by {@link MAX_DEPTH} so a cyclic or pathological object cannot spin,
 * and forbidden keys are dropped rather than copied — the same guard
 * `SettingsManager.deepMerge` applies, for the same reason.
 */
export function redactDeep<T>(value: T): T {
  return walk(value, 0) as T;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = walk(item, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Redact then clamp. Returns `undefined` for empty/absent input so optional
 * fields stay absent rather than becoming empty strings in the JSON payload.
 */
export function clean(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const out = redactSecrets(text).slice(0, max);
  return out.length > 0 ? out : undefined;
}

/** Redact then clamp, for fields that are required (never `undefined`). */
export function cleanRequired(text: string, max: number): string {
  return redactSecrets(text).slice(0, max);
}
