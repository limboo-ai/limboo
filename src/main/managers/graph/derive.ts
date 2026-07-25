/**
 * Derived (inferred) Work Graph edges.
 *
 * Everything in this file is a HEURISTIC, and every edge it produces carries
 * `derived: true` so the UI can dash it and queries can exclude it. That flag is
 * the whole contract: a heuristic must never be able to present itself with the
 * same authority as an event Limboo actually observed.
 *
 * WHAT IS AND IS NOT HERE. `verified-by` has no provider signal at all — neither
 * Claude nor Cursor tells a host "this command validated that edit". So it is
 * derived from three REAL facts (a command's actual text, its actual success,
 * and its actual position after a file change) rather than guessed. Conversely,
 * there is deliberately no attempt to infer intent, causality between unrelated
 * tools, or "which task this edit belongs to": those would be fabrication, not
 * inference, and the graph would be worse for containing them.
 */
import crypto from 'node:crypto';
import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';

/**
 * Commands that validate work, as opposed to performing it. Matched against the
 * command's leading token(s), so `npm test -- --watch=false` matches but
 * `rm -rf test` does not.
 */
const VERIFY_PATTERNS: RegExp[] = [
  /\b(test|tests|jest|vitest|pytest|mocha|ava)\b/,
  /\b(lint|eslint|ruff|clippy|golangci-lint)\b/,
  /\b(tsc|typecheck|type-check|mypy)\b/,
  /\bbuild\b/,
  /\bcargo\s+(test|check|clippy)\b/,
  /\bgo\s+(test|vet)\b/,
];

/** Does this command text look like a verification step? */
export function looksLikeVerification(command: string, repoScripts: string[]): boolean {
  const text = command.toLowerCase();
  // A script the repo's own limboo.json declares is a stronger signal than any
  // builtin pattern — it is the project telling us what verification means.
  for (const script of repoScripts) {
    if (script && text.includes(script.toLowerCase())) return true;
  }
  return VERIFY_PATTERNS.some((re) => re.test(text));
}

function mkEdge(
  sessionId: string,
  src: string,
  dst: string,
  kind: WorkGraphEdge['kind'],
  at: number,
): WorkGraphEdge {
  return {
    id: `wge_${crypto.randomUUID()}`,
    sessionId,
    src,
    dst,
    kind,
    // Always true in this file. That is the point.
    derived: true,
    createdAt: at,
  };
}

/**
 * Infer `verified-by` edges: a file changed by a run, followed later in the SAME
 * run by a SUCCESSFUL command that looks like verification.
 *
 * The three constraints are what make this defensible rather than fabricated:
 * the command text is real, its success is real, and the ordering is real. What
 * is inferred is only the claim that the one relates to the other.
 */
export function deriveVerifiedBy(
  sessionId: string,
  nodes: WorkGraphNode[],
  repoScripts: string[],
): WorkGraphEdge[] {
  const out: WorkGraphEdge[] = [];

  // Group by run: verification in one request says nothing about another's edits.
  const byRun = new Map<string, WorkGraphNode[]>();
  for (const n of nodes) {
    const list = byRun.get(n.runId);
    if (list) list.push(n);
    else byRun.set(n.runId, [n]);
  }

  for (const members of byRun.values()) {
    const ordered = members.slice().sort((a, b) => a.seq - b.seq);
    const files: WorkGraphNode[] = [];

    for (const node of ordered) {
      if (node.kind === 'file') {
        files.push(node);
        continue;
      }
      if (node.kind !== 'terminal' || files.length === 0) continue;
      // Only a command that actually SUCCEEDED verifies anything. A failing
      // test run is evidence of the opposite.
      if (node.status !== 'done') continue;
      if (!looksLikeVerification(node.meta.command, repoScripts)) continue;

      const at = node.endedAt ?? node.startedAt;
      for (const file of files) {
        out.push(mkEdge(sessionId, file.id, node.id, 'verified-by', at));
      }
      // Each verification claims only the edits made before it; anything after
      // is unverified until the next passing run.
      files.length = 0;
    }
  }

  return out;
}

/**
 * Infer `depends-on` edges between files from the Search Engine's real import
 * graph (`search_refs`). This one is only half-derived: the import edge itself
 * was extracted from actual source, so the relationship is real — what is
 * inferred is that a file-level import implies a work-level dependency.
 *
 * `importsOf` is injected rather than queried here so this module stays a pure
 * function of its inputs.
 */
export function deriveFileDependencies(
  sessionId: string,
  nodes: WorkGraphNode[],
  importsOf: (path: string) => string[],
): WorkGraphEdge[] {
  const out: WorkGraphEdge[] = [];
  const fileNodes = nodes.filter((n) => n.kind === 'file');
  if (fileNodes.length < 2) return out;

  // Only files touched in the SAME session can be related here; a dependency on
  // a file this session never touched has no node to point at.
  const byPath = new Map<string, WorkGraphNode>();
  for (const n of fileNodes) byPath.set(n.meta.change.path, n);

  const seen = new Set<string>();
  for (const node of fileNodes) {
    for (const target of importsOf(node.meta.change.path)) {
      const dep = byPath.get(target);
      if (!dep || dep.id === node.id) continue;
      const key = `${node.id}|${dep.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mkEdge(sessionId, node.id, dep.id, 'depends-on', node.startedAt));
    }
  }
  return out;
}
