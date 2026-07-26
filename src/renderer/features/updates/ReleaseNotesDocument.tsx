/**
 * The "What's New" document — the release notes for one app version, rendered
 * as a workspace tab.
 *
 * The notes are COMPILED INTO THE BUNDLE from `CHANGELOG.md` (see
 * `scripts/gen-release-notes.mjs`), not fetched: the updater's own
 * `releaseNotes` describes the version being *offered*, is HTML-stripped and
 * capped on the way through, and is gone by the time the new version boots — so
 * it can never answer "what did I just get?". Bundled notes always match the
 * running build, need no network, and work in development.
 *
 * This document is DISPLAY-ONLY and is never added to any agent context
 * provider. Claude Code shipped a fix for exactly this bug — its "Show all"
 * release-notes view was injecting the whole changelog into every subsequent
 * request — and the same mistake is available here for free if anyone ever
 * wires this text into a context block.
 *
 * Shell shape follows `DiffWorkspace`: a `h-9` identity row over a single
 * scrolling body, so every document in the center column reads the same.
 */
import { Sparkles } from 'lucide-react';
import { Markdown } from '@/renderer/features/workspace/Markdown';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { releaseNotesFor } from '@shared/releaseNotes.generated';

interface ReleaseNotesDocumentProps {
  /** The version whose notes to show, without a leading `v`. */
  version: string;
}

export function ReleaseNotesDocument({ version }: ReleaseNotesDocumentProps) {
  const entry = releaseNotesFor(version);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Identity row */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles size={14} className="shrink-0 text-accent" />
        <span className="shrink-0 text-[12px] font-medium text-fg">What&apos;s New</span>
        <span className="shrink-0 text-[11px] text-muted">Limboo {version}</span>
        {entry?.date && <span className="text-[11px] text-faint">{entry.date}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {entry ? (
          // The house Markdown renderer: react-markdown + remark-gfm +
          // rehype-sanitize, with links routed through `system.openExternal`
          // rather than navigating the renderer.
          <div className="mx-auto max-w-3xl">
            <Markdown text={entry.markdown} />
          </div>
        ) : (
          // A development build carries the placeholder version from
          // package.json, which has no changelog section. Say so plainly rather
          // than rendering an empty page that looks like a failure.
          <EmptyState
            compact
            title="No release notes for this build"
            description={`This build reports version ${version}, which has no entry in the changelog. Release builds always carry their own notes.`}
          />
        )}
      </div>
    </section>
  );
}
