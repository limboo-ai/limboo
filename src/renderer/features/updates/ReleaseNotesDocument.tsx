/**
 * The release document — everything in one version of Limboo, rendered as a
 * workspace tab.
 *
 * The manifest is COMPILED INTO THE BUNDLE from `CHANGELOG.md` (see
 * `scripts/gen-release-notes.mjs`), not fetched: the updater's own
 * `releaseNotes` describes the version being *offered*, is HTML-stripped and
 * capped on the way through, and is gone by the time the new version boots — so
 * it can never answer "what did I just get?". Bundled data always matches the
 * running build, needs no network, and works in development. The production CSP
 * (`connect-src 'self'`) means there is no other option that would work anyway,
 * and that is the right constraint for a local-first app.
 *
 * This document is DISPLAY-ONLY and is never added to any agent context
 * provider. Claude Code shipped a fix for exactly this bug — its "Show all"
 * release-notes view was injecting the whole changelog into every subsequent
 * request. The agent CAN read release notes here, but only by calling the
 * `limboo_release` tool when it is actually asked (see
 * `src/main/managers/search/releaseTools.ts`); nothing is ever pushed into a
 * system prompt.
 *
 * Shell shape follows `DiffWorkspace`: a `h-9` identity row over a single
 * scrolling body, so every document in the center column reads the same.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, ListFilter, Rows3, Search, X } from 'lucide-react';
import type { BuildInfo } from '@shared/types';
import { RELEASE_CATEGORY_ORDER, type ReleaseCategory } from '@shared/release';
import { releaseManifestFor } from '@shared/releaseManifest.generated';
import { releaseNotesFor } from '@shared/releaseNotes.generated';
import { EmptyState } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { Markdown } from '@/renderer/features/workspace/Markdown';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { useReleaseStore } from '@/renderer/stores/useReleaseStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';
import { ReleaseCredits, CREDITS_KEYS } from './release/ReleaseCredits';
import { ReleaseHeader } from './release/ReleaseHeader';
import { ReleaseHighlights } from './release/ReleaseHighlights';
import { ReleaseHistory, HISTORY_KEY } from './release/ReleaseHistory';
import { ReleaseIntegrity, INTEGRITY_KEYS } from './release/ReleaseIntegrity';
import { CopyButton } from './release/parts';
import { releaseToMarkdown } from './release/toMarkdown';
import { releaseNotesRef } from './useReleaseNotes';

/** Every fold key the document can collapse, for the expand/collapse-all action. */
const ALL_KEYS: ReleaseCategory[] = [
  ...RELEASE_CATEGORY_ORDER,
  CREDITS_KEYS.contributors,
  CREDITS_KEYS.pullRequests,
  CREDITS_KEYS.branches,
  INTEGRITY_KEYS.assets,
  INTEGRITY_KEYS.verification,
  HISTORY_KEY,
];

interface ReleaseNotesDocumentProps {
  /** The version whose release to show, without a leading `v`. */
  version: string;
}

export function ReleaseNotesDocument({ version }: ReleaseNotesDocumentProps) {
  const manifest = releaseManifestFor(version);
  const notes = releaseNotesFor(version);
  const runningVersion = useUpdateStore((s) => s.status.currentVersion) ?? '';

  const view = useReleaseStore((s) => s.byVersion[version]);
  const toggleCategory = useReleaseStore((s) => s.toggleCategory);
  const setAllCollapsed = useReleaseStore((s) => s.setAllCollapsed);
  const setFilter = useReleaseStore((s) => s.setFilter);
  const setCompareWith = useReleaseStore((s) => s.setCompareWith);

  const collapsed = view?.collapsed ?? {};
  const filter = view?.filter ?? '';
  const compareWith = view?.compareWith ?? null;
  const allCollapsed = ALL_KEYS.every((k) => collapsed[k]);

  const promote = useDocumentStore((s) => s.promote);
  const sessionId = useSessionStore((s) => s.selectedId);
  const toast = useUIStore((s) => s.addToast);

  const build = useBuildInfo();

  const markdown = useMemo(
    () => (manifest ? releaseToMarkdown(manifest) : (notes?.markdown ?? '')),
    [manifest, notes],
  );

  // A development build carries the placeholder version from package.json, which
  // has no changelog section. Say so plainly rather than rendering an empty page
  // that looks like a failure.
  if (!manifest && !notes) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <IdentityRow version={version} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <EmptyState
            compact
            title="No release notes for this build"
            description={`This build reports version ${version}, which has no entry in the changelog. Release builds always carry their own notes.`}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <IdentityRow version={version} date={manifest?.date ?? notes?.date ?? null}>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Search
              size={11}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(version, e.target.value)}
              placeholder="Filter this release"
              aria-label="Filter this release"
              className={cn(
                'h-6 w-44 rounded border border-line bg-surface-2 pl-6 pr-6 text-[11px] text-fg',
                'placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent',
              )}
            />
            {filter && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setFilter(version, '')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <ToolbarButton
            label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            icon={allCollapsed ? Rows3 : ListFilter}
            onClick={() => setAllCollapsed(version, ALL_KEYS, !allCollapsed)}
          />
          <CopyButton value={markdown} label="Copy this release as Markdown" />
          <ToolbarButton
            label="Export as Markdown"
            icon={Download}
            onClick={() => {
              void window.limboo?.release
                ?.export(version, markdown)
                .then((r) => {
                  if (r?.saved) {
                    toast({ tone: 'success', title: 'Release notes exported', description: r.path });
                  }
                })
                .catch((err: unknown) =>
                  toast({
                    tone: 'danger',
                    title: 'Export failed',
                    description: err instanceof Error ? err.message : String(err),
                  }),
                );
            }}
          />
        </div>
      </IdentityRow>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {manifest ? (
            <>
              <ReleaseHeader
                manifest={manifest}
                build={build}
                running={!!runningVersion && runningVersion.replace(/^v/, '') === manifest.version}
              />
              <ReleaseHighlights
                sections={manifest.sections}
                filter={filter}
                collapsed={collapsed}
                onToggle={(c) => toggleCategory(version, c)}
              />
              {/* Filtering is a search over the changelog body, so the metadata
                  sections step aside while a query is active rather than
                  claiming to have matched it. */}
              {!filter && (
                <>
                  <ReleaseCredits
                    manifest={manifest}
                    collapsed={collapsed}
                    onToggle={(k) => toggleCategory(version, k)}
                  />
                  <ReleaseIntegrity
                    manifest={manifest}
                    collapsed={collapsed}
                    onToggle={(k) => toggleCategory(version, k)}
                  />
                  <ReleaseHistory
                    current={version}
                    compareWith={compareWith}
                    collapsed={collapsed}
                    onToggle={(k) => toggleCategory(version, k)}
                    onOpenVersion={(v) => {
                      if (sessionId) promote(sessionId, releaseNotesRef(v));
                    }}
                    onCompare={(v) => setCompareWith(version, v)}
                  />
                </>
              )}
            </>
          ) : (
            // A release parsed before the manifest existed still has its notes.
            // The Markdown blob is kept precisely so a structural regression
            // degrades the page instead of losing the release.
            <div className="rounded-md border border-line bg-surface p-4">
              <Markdown text={notes?.markdown ?? ''} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function IdentityRow({
  version,
  date,
  children,
}: {
  version: string;
  date?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
      <span className="shrink-0 text-[12px] font-medium text-fg">Release</span>
      <span className="shrink-0 font-mono text-[11px] text-muted">{version}</span>
      {date && <span className="shrink-0 text-[11px] text-faint">{date}</span>}
      {children}
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <Icon size={12} />
    </button>
  );
}

/**
 * Facts about the running process, fetched once per mount.
 *
 * Not a store: there is exactly one consumer, the values cannot change while
 * the app runs, and a store would add a hydration path for data that is cheaper
 * to ask for than to cache.
 */
function useBuildInfo(): BuildInfo | null {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void window.limboo?.updates?.getBuildInfo?.().then((value) => {
      if (alive) setInfo(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
