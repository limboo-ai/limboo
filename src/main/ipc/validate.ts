/**
 * Shared IPC input validators.
 *
 * Every renderer-supplied value is untrusted (CLAUDE.md §6). These three guards
 * are the boundary checks that the git — and now the `gh` — handlers both need,
 * and they live here rather than being copy-pasted so the two can never drift.
 * That matters most for {@link assertBoolOpts}: it is the prototype-pollution
 * guard, and a divergent second copy is exactly how such a guard springs a leak.
 *
 * These validate SHAPE at the boundary. Domain shape (a ref name, a repo-relative
 * path) is re-validated deeper in by `sanitizeRef` / `assertInsideRepo`.
 */

/** Length-capped opaque identifier (workspace id, session id, …). */
export function assertId(id: unknown, label = 'id', prefix = 'ipc'): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new Error(`${prefix}: invalid ${label}`);
  }
}

/**
 * Validate a renderer-supplied options object: every value must be a boolean and
 * every key must be in the allow-list. Rejecting unknown keys / non-primitive
 * values is defense in depth against prototype pollution and argument smuggling.
 */
export function assertBoolOpts(
  opts: unknown,
  allowed: string[],
  label: string,
  prefix = 'ipc',
): void {
  if (opts === undefined) return;
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new Error(`${prefix}: invalid ${label}`);
  }
  for (const key of Object.keys(opts)) {
    if (!allowed.includes(key)) throw new Error(`${prefix}: unexpected ${label} key: ${key}`);
    const v = (opts as Record<string, unknown>)[key];
    if (v !== undefined && typeof v !== 'boolean') {
      throw new Error(`${prefix}: ${label}.${key} must be a boolean`);
    }
  }
}

/** Non-empty, length-capped free text (commit message, label, …). */
export function assertText(
  value: unknown,
  max: number,
  label: string,
  prefix = 'ipc',
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`${prefix}: invalid ${label}`);
  }
}

/**
 * Validate a renderer-supplied integer within an inclusive range, returning the
 * floored value. Used for list limits and issue/PR numbers — anything that
 * becomes a CLI argument must be a number we chose the bounds of, never a
 * string the renderer authored.
 */
export function assertInt(
  value: unknown,
  min: number,
  max: number,
  label: string,
  prefix = 'ipc',
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${prefix}: invalid ${label}`);
  }
  const n = Math.floor(value);
  if (n < min || n > max) throw new Error(`${prefix}: ${label} out of range`);
  return n;
}

/** Validate that a value is one of a fixed set of literals. */
export function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  prefix = 'ipc',
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${prefix}: invalid ${label}`);
  }
  return value as T;
}
