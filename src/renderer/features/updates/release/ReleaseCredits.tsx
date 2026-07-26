/**
 * Who shipped this release, and what went into it: contributors, merged pull
 * requests, and merged branches.
 *
 * All three are git-derived, so they exist only in a packaged build — a
 * checkout has a changelog but no tag range to attribute. Rather than render
 * three empty cards on a development build, each section is simply absent when
 * it has nothing, and `ReleaseCredits` renders nothing at all when none of them
 * do. An empty "Contributors (0)" would state something false.
 */
import type { ReleaseCategory, ReleaseManifestEntry } from '@shared/release';
import { ReleaseSectionCard } from './ReleaseSectionCard';
import { Avatar, ExternalLink } from './parts';

/**
 * Pseudo-category keys for the fold state of the non-changelog sections. They
 * ride the same `collapsed` map as the real categories, which is why they are
 * cast: the map is keyed by `ReleaseCategory` and these are not changelog
 * categories, but they need the identical per-version fold behaviour and a
 * second parallel map would be a second thing to keep in sync.
 */
export const CREDITS_KEYS = {
  contributors: 'credits:contributors' as unknown as ReleaseCategory,
  pullRequests: 'credits:pull-requests' as unknown as ReleaseCategory,
  branches: 'credits:branches' as unknown as ReleaseCategory,
};

const ROLE_LABEL: Record<string, string> = {
  maintainer: 'Maintainer',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  'release-manager': 'Release manager',
};

export function ReleaseCredits({
  manifest,
  collapsed,
  onToggle,
}: {
  manifest: ReleaseManifestEntry;
  collapsed: Partial<Record<ReleaseCategory, boolean>>;
  onToggle: (key: ReleaseCategory) => void;
}) {
  const { contributors, pullRequests, mergedBranches } = manifest;
  if (contributors.length === 0 && pullRequests.length === 0 && mergedBranches.length === 0) {
    return null;
  }

  return (
    <>
      {contributors.length > 0 && (
        <ReleaseSectionCard
          title="Contributors"
          count={contributors.length}
          collapsed={!!collapsed[CREDITS_KEYS.contributors]}
          onToggle={() => onToggle(CREDITS_KEYS.contributors)}
          copyText={contributors.map((c) => c.name).join('\n')}
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {contributors.map((person) => (
              <li key={`${person.name}:${person.handle ?? ''}`} className="flex items-center gap-2">
                {/* The real profile picture when CI could resolve one, embedded
                    in the manifest as a `data:` URI at build time; initials
                    otherwise. Never a remote URL — `img-src` is `'self' data:`. */}
                <Avatar
                  src={person.avatar}
                  name={person.name}
                  emphasis={person.role === 'maintainer'}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12px] text-fg">
                    {person.handle ? (
                      <ExternalLink href={person.profileUrl}>{person.name}</ExternalLink>
                    ) : (
                      person.name
                    )}
                  </span>
                  <span className="truncate text-[10px] text-faint">
                    {ROLE_LABEL[person.role] ?? person.role}
                    {person.commits > 0 &&
                      ` · ${person.commits} commit${person.commits === 1 ? '' : 's'}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </ReleaseSectionCard>
      )}

      {pullRequests.length > 0 && (
        <ReleaseSectionCard
          title="Pull requests"
          count={pullRequests.length}
          collapsed={!!collapsed[CREDITS_KEYS.pullRequests]}
          onToggle={() => onToggle(CREDITS_KEYS.pullRequests)}
          copyText={pullRequests.map((pr) => `#${pr.number} ${pr.title}`).join('\n')}
        >
          <ul className="flex flex-col gap-1.5">
            {pullRequests.map((pr) => (
              <li key={pr.number} className="flex min-w-0 items-baseline gap-2">
                <ExternalLink href={pr.url} className="shrink-0 font-mono text-[11px]">
                  #{pr.number}
                </ExternalLink>
                <span className="truncate text-[12px] text-muted">{pr.title}</span>
              </li>
            ))}
          </ul>
        </ReleaseSectionCard>
      )}

      {mergedBranches.length > 0 && (
        <ReleaseSectionCard
          title="Merged branches"
          count={mergedBranches.length}
          collapsed={!!collapsed[CREDITS_KEYS.branches]}
          onToggle={() => onToggle(CREDITS_KEYS.branches)}
          copyText={mergedBranches.join('\n')}
        >
          {/* Branch names, not badges. A ref is already a monospace token — a
              capsule around it just makes the list harder to scan. */}
          <ul className="flex flex-col gap-1">
            {mergedBranches.map((branch) => (
              <li key={branch} className="truncate font-mono text-[11px] text-muted">
                {branch}
              </li>
            ))}
          </ul>
        </ReleaseSectionCard>
      )}
    </>
  );
}
