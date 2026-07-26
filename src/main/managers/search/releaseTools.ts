/**
 * Release notes as a queryable source — for Global Search, and for the agent.
 *
 * TWO CONSUMERS, ONE IMPLEMENTATION:
 *
 *  - `searchReleases()` is federated into `SearchManager.globalSearch`. Release
 *    notes are already in memory and immutable for the life of the process, so
 *    federating them costs nothing; indexing them into `search_files` would add
 *    a schema, a sync path and an index that can go stale, to search data that
 *    literally cannot change while the app runs.
 *  - `releasePlainTools` is the transport-neutral tool pair, consumed by BOTH
 *    the Claude in-process MCP server and the Cursor bridge dispatcher — the
 *    same pattern `searchTools.ts` and `memoryTools.ts` use, so both agents get
 *    the same answers from the same code.
 *
 * WHY A TOOL AND NOT A CONTEXT BLOCK. Memory, Search and Resume each append a
 * block to the agent's system prompt because their content is selected FOR the
 * current turn. Release notes are not: they are a fixed document that matters
 * only when someone asks about it. Injecting them would put the entire changelog
 * in front of every request forever — which is exactly the bug Claude Code
 * shipped a fix for, where its release-notes view leaked the whole changelog
 * into every subsequent request. So the agent pulls, and only when asked.
 *
 * Read-only by construction: no filesystem, no network, no database. The data
 * is a module constant compiled into this build.
 */
import type { SearchHit } from '@shared/types';
import { RELEASE_CATEGORY_LABEL, type ReleaseManifestEntry } from '@shared/release';
import { RELEASE_INDEX, RELEASE_MANIFESTS, releaseManifestFor } from '@shared/releaseManifest.generated';
import { strArg, type PlainTool } from '../cursor/bridge/plainTool';
import { observePlainTools } from '../graph/instrument';

/** Cap on tool output, so a long release cannot dominate a context window. */
const TOOL_TEXT_MAX = 24_000;

/**
 * Substring search across every bundled release.
 *
 * Deliberately not BM25: the corpus is a handful of documents that never
 * change, and a scoring model tuned for a repository's worth of source would be
 * more machinery than signal here. Hits are ranked by where the match landed —
 * a version number beats a lead-in, which beats body prose.
 */
export function searchReleases(query: string, limit: number): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const manifest of RELEASE_MANIFESTS) {
    // An exact-ish version match is the strongest possible signal: someone
    // typing "1.7.0" wants that release, not a bullet that mentions it.
    if (manifest.version.toLowerCase().includes(q) || manifest.gitTag.toLowerCase().includes(q)) {
      hits.push({
        id: `release:${manifest.version}`,
        kind: 'release',
        title: `Limboo ${manifest.version}`,
        subtitle: manifest.summary.replace(/\*\*/g, '').slice(0, 160) || manifest.gitTag,
        ref: manifest.version,
        score: 100,
      });
    }

    for (const section of manifest.sections) {
      for (const item of section.items) {
        const lead = item.lead ?? '';
        const inLead = lead.toLowerCase().includes(q);
        const inText = item.text.toLowerCase().includes(q);
        if (!inLead && !inText) continue;
        hits.push({
          id: `release:${manifest.version}:${section.category}:${hits.length}`,
          kind: 'release',
          title: lead || item.text.slice(0, 80),
          subtitle: `${manifest.version} · ${
            RELEASE_CATEGORY_LABEL[section.category] ?? section.title
          }`,
          ref: manifest.version,
          score: inLead ? 60 : 30,
        });
        if (hits.length >= limit * 4) break;
      }
    }
  }

  return hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}

/** Render a manifest as plain text for a tool result. */
function manifestToText(manifest: ReleaseManifestEntry): string {
  const out: string[] = [];
  out.push(`Limboo ${manifest.version}${manifest.codename ? ` (${manifest.codename})` : ''}`);
  out.push(
    [
      manifest.date && `released ${manifest.date}`,
      `channel ${manifest.channel}`,
      `tag ${manifest.gitTag}`,
      manifest.commit && `commit ${manifest.commit.slice(0, 12)}`,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  if (manifest.summary) {
    out.push('');
    out.push(manifest.summary);
  }
  for (const section of manifest.sections) {
    out.push('');
    out.push(`## ${RELEASE_CATEGORY_LABEL[section.category] ?? section.title}`);
    out.push(section.markdown);
  }
  if (manifest.contributors.length) {
    out.push('');
    out.push(`## Contributors`);
    out.push(manifest.contributors.map((c) => c.name).join(', '));
  }
  return out.join('\n').slice(0, TOOL_TEXT_MAX);
}

/**
 * The tool pair, in the transport-neutral shape both adapters consume. Wrapped
 * in `observePlainTools` like the search and memory tools, so a call the agent
 * makes shows up as a node in the work graph rather than as a silent read.
 */
export function releasePlainTools(): PlainTool[] {
  return observePlainTools(RELEASE_TOOLS, 'search');
}

const RELEASE_TOOLS: PlainTool[] = [
  {
    name: 'list_releases',
    description:
      'List every Limboo version this build knows about, newest first, with its date, ' +
      'channel and one-line summary. Use before release_notes when the user names a ' +
      'version loosely ("the last one", "the update that added the graph").',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () =>
      RELEASE_INDEX.map(
        (e) =>
          `${e.version}\t${e.date ?? 'undated'}\t${e.channel}\t${
            e.detailed ? 'full notes available' : 'summary only'
          }\t${e.summary.replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 200)}`,
      ).join('\n'),
  },
  {
    name: 'release_notes',
    description:
      'The full release notes for one Limboo version: summary, every changelog ' +
      'section, and contributors. Pass the semantic version, with or without a ' +
      'leading "v". Only the most recent few releases carry full notes; use ' +
      'list_releases to see which.',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'string', description: 'Semantic version, e.g. "1.7.0" or "v1.7.0".' },
      },
      required: ['version'],
      additionalProperties: false,
    },
    run: (args) => {
      const version = strArg(args.version, 64);
      if (!version) return 'release_notes: a version is required.';
      const manifest = releaseManifestFor(version);
      if (!manifest) {
        const known = RELEASE_INDEX.filter((e) => e.detailed).map((e) => e.version);
        return (
          `No bundled release notes for ${version}. ` +
          `This build carries full notes for: ${known.join(', ') || 'none'}.`
        );
      }
      return manifestToText(manifest);
    },
  },
];
