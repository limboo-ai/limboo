/**
 * Composer mode → the harness's built-in permission mode.
 *
 * This is the single most important line of configuration on the harness path,
 * because `permissionMode` is what decides whether the adapter asks Limboo for
 * permission at all. It governs **built-in** tools (read/write/edit/bash/…);
 * `toolApproval` governs only custom host tools. Leaving it unset means
 * `'allow-all'`, under which the adapter emits NO approval requests and every
 * built-in file write and shell command runs with Limboo's permission gate
 * bypassed entirely.
 *
 * Every mode maps to `'allow-reads'`, and that is deliberate, not lazy. The
 * adapter's own decision function is:
 *
 *   allow-all    → nothing is ever gated
 *   allow-edits  → gates only `kind: 'bash'`
 *   allow-reads  → gates `kind: 'edit'` AND `kind: 'bash'`
 *
 * and its tool-kind table puts `ExitPlanMode`, `Write`, `Edit`, `NotebookEdit`
 * and `TodoWrite` in `edit`, `Bash` in `bash`, and `Read`/`Glob`/`Grep`/
 * `WebSearch`/`WebFetch`/`AskUserQuestion` in `readonly`.
 *
 * So:
 *  - `plan` needs `allow-reads` because **`ExitPlanMode` is an `edit`**. Under
 *    anything looser it is never routed to `makeCanUseTool`, which is where
 *    plan capture and the turn interrupt live — plan mode would be silently
 *    dead, appearing to work while producing no plan.
 *  - `acceptEdits` needs `allow-reads` too, NOT the apparently-matching
 *    `allow-edits`. Skipping the gate for writes would lose the crown-jewel
 *    guard, the sensitive-file consent, the workspace containment check, the
 *    Work Graph approval node and the timeline audit row. Limboo's own gate
 *    already auto-approves edits in this mode, so the only cost of gating is
 *    one suspend/continue round-trip per edit — and that round-trip is cheap
 *    (the CLI child stays alive; the continuation just resolves the promise the
 *    adapter is awaiting).
 *  - `ask` and `default` have nothing tighter available.
 *
 * Written as an exhaustive switch rather than a constant so that adding a fifth
 * composer mode is a COMPILE ERROR here instead of silently inheriting a
 * permissive default. The switch is the documentation.
 */
import type { SessionPermissionMode } from '@shared/types';

/** The adapter-facing permission modes. `allow-all` is never returned. */
export type HarnessPermissionMode = 'allow-reads' | 'allow-edits' | 'allow-all';

export function harnessPermissionMode(mode: SessionPermissionMode): HarnessPermissionMode {
  switch (mode) {
    case 'plan':
    case 'ask':
    case 'default':
    case 'acceptEdits':
      // See the header: this is the only value that routes both edits and shell
      // commands (and therefore ExitPlanMode) through Limboo's gate.
      return 'allow-reads';
    default: {
      const never: never = mode;
      throw new Error(`Unhandled composer permission mode: ${String(never)}`);
    }
  }
}
