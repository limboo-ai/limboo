/**
 * The identity block at the top of a release document: what this version is,
 * where it came from, and how far you can trust that answer.
 *
 * Facts are split into two groups on purpose, because they have different
 * warrants. RELEASE facts (version, date, channel, tag, commit, build number)
 * come from the manifest compiled into this build at package time. BUILD facts
 * (platform, architecture, Electron/Chromium versions, packaged state) are read
 * from the running process by the main process. Mixing them into one undated
 * table would make a claim about the artifact you downloaded and a claim about
 * the process you are running look like the same kind of statement.
 */
import type { ReleaseManifestEntry } from '@shared/release';
import type { BuildInfo } from '@shared/types';
import { CHANNEL_LABEL, Field, formatReleaseDate } from './parts';

export function ReleaseHeader({
  manifest,
  build,
  running,
}: {
  manifest: ReleaseManifestEntry;
  build: BuildInfo | null;
  /** Whether this is the version currently running. */
  running: boolean;
}) {
  const shortCommit = manifest.commit ? manifest.commit.slice(0, 12) : null;

  return (
    <header className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">
          Limboo {manifest.version}
        </h1>
        {manifest.codename && (
          <span className="text-[13px] text-muted">&ldquo;{manifest.codename}&rdquo;</span>
        )}
        {/* Status reads as words. A capsule around "Stable" adds emphasis, not
            information, and on pure black a filled one reads as a button. */}
        <span className="text-[12px] text-muted">{CHANNEL_LABEL[manifest.channel]}</span>
        {running && <span className="text-[12px] text-muted">Running now</span>}
        <span className="ml-auto text-[12px] text-muted">
          {formatReleaseDate(manifest.date)}
        </span>
      </div>

      {/* A prerelease says so before anything else on the page.
          This is the one place a bordered block is warranted despite the
          no-chrome rule: it separates a WARNING from the release's own prose,
          which is exactly the "unrelated content earns a border" test. Still
          words, not a coloured pill — the text carries the meaning, so it
          survives a screenshot, a colour-blind reader and the Markdown export. */}
      {manifest.channel !== 'stable' && (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
          <p className="text-[12px] font-medium text-warning">
            {CHANNEL_LABEL[manifest.channel]} build — not yet released
          </p>
          <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-muted">
            This version is published for testing ahead of a stable release. It may contain
            bugs, unfinished features, and changes that are reverted before release. Settings
            and session data are migrated forward but not back, so a build made after this one
            may not read data this one wrote. Keep a stable install if you rely on Limboo for
            work you cannot repeat.
          </p>
        </div>
      )}

      {manifest.summary && (
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          {/* The summary is rendered as TEXT, not Markdown: it is one paragraph
              of prose and the emphasis markers in it are not worth a second
              Markdown surface in the header. The full formatted body is below. */}
          {manifest.summary.replace(/\*\*/g, '')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Git tag" mono copy={manifest.gitTag}>
          {manifest.gitTag}
        </Field>
        <Field label="Commit" mono copy={manifest.commit}>
          {shortCommit ?? (
            // Honest rather than blank: a development build was never tagged,
            // so there is no commit to name.
            <span className="text-faint">not a tagged build</span>
          )}
        </Field>
        <Field label="Build" mono>
          {manifest.buildNumber ?? <span className="text-faint">local</span>}
        </Field>
        <Field label="Channel">{CHANNEL_LABEL[manifest.channel]}</Field>

        <Field label="Platform">
          {build ? `${platformLabel(build.platform)} ${build.arch}` : '—'}
        </Field>
        <Field label="Electron" mono>
          {build?.electron ?? '—'}
        </Field>
        <Field label="Chromium" mono>
          {build?.chrome ?? '—'}
        </Field>
        <Field label="Distribution">
          {build ? (
            build.packaged ? (
              'Packaged'
            ) : (
              <span className="text-faint">Development</span>
            )
          ) : (
            '—'
          )}
        </Field>
      </div>

      {build?.macSignature && (
        <div className="border-t border-line pt-3">
          <span className="truncate text-[11px] text-muted">{build.macSignature}</span>
        </div>
      )}
    </header>
  );
}

function platformLabel(platform: string): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}
