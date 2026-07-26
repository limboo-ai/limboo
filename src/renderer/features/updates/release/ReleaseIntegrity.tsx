/**
 * Assets and integrity — how to verify that what you installed is what was
 * published.
 *
 * The careful part of this file is what it does NOT print. Per-asset digests
 * and signing status only exist after the artifacts are built, so they live in
 * the published `release-manifest.json` and are empty in the copy compiled into
 * the app: a build cannot contain the hash of an installer produced from it.
 * Rather than show a blank or a plausible-looking placeholder, an absent digest
 * says where the real one is and gives the command that checks it. A release
 * document that displayed an unverifiable hash would be worse than one that
 * displayed none, because it would look like verification.
 */
import { FileArchive, ShieldCheck, TerminalSquare } from 'lucide-react';
import type {
  ReleaseAsset,
  ReleaseCategory,
  ReleaseManifestEntry,
  ReleasePlatform,
  ReleaseSigning,
} from '@shared/release';
import { ReleaseSectionCard } from './ReleaseSectionCard';
import { CopyButton, ExternalLink, Pill, formatBytes, type PillTone } from './parts';

/** Fold keys for these two sections. See the note in `ReleaseCredits`. */
export const INTEGRITY_KEYS = {
  assets: 'integrity:assets' as unknown as ReleaseCategory,
  verification: 'integrity:verification' as unknown as ReleaseCategory,
};

const PLATFORM_LABEL: Record<ReleasePlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  any: 'All platforms',
};

const SIGNING_TONE: Record<ReleaseSigning['status'], PillTone> = {
  signed: 'success',
  'self-signed': 'warning',
  unsigned: 'danger',
  unknown: 'neutral',
};

export function ReleaseIntegrity({
  manifest,
  collapsed,
  onToggle,
}: {
  manifest: ReleaseManifestEntry;
  collapsed: Partial<Record<ReleaseCategory, boolean>>;
  onToggle: (key: ReleaseCategory) => void;
}) {
  const byPlatform = groupByPlatform(manifest.assets);
  const verifyChecksums = `sha256sum -c ${manifest.checksumManifest ?? 'SHA256SUMS'}`;
  const verifyProvenance = manifest.provenanceRepo
    ? `gh attestation verify <file> --repo ${manifest.provenanceRepo}`
    : null;

  return (
    <>
      {manifest.assets.length > 0 && (
        <ReleaseSectionCard
          title="Release assets"
          icon={FileArchive}
          count={manifest.assets.length}
          collapsed={!!collapsed[INTEGRITY_KEYS.assets]}
          onToggle={() => onToggle(INTEGRITY_KEYS.assets)}
        >
          <div className="flex flex-col gap-3">
            {byPlatform.map(([platform, assets]) => (
              <div key={platform} className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-faint">
                  {PLATFORM_LABEL[platform]}
                </span>
                <ul className="flex flex-col">
                  {assets.map((asset) => (
                    <li
                      key={asset.name}
                      className="flex min-w-0 items-center gap-2 border-b border-line py-1 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">
                        {asset.name}
                      </span>
                      {asset.arch && (
                        <span className="shrink-0 text-[10px] text-faint">{asset.arch}</span>
                      )}
                      <span className="w-16 shrink-0 text-right text-[11px] text-muted">
                        {formatBytes(asset.bytes)}
                      </span>
                      {asset.sha256 ? (
                        <>
                          <span
                            title={asset.sha256}
                            className="w-24 shrink-0 truncate font-mono text-[10px] text-faint"
                          >
                            {asset.sha256.slice(0, 16)}
                          </span>
                          <CopyButton value={asset.sha256} label={`Copy SHA-256 of ${asset.name}`} />
                        </>
                      ) : (
                        <span className="w-24 shrink-0 text-right text-[10px] text-faint">
                          in {manifest.checksumManifest ?? 'SHA256SUMS'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ReleaseSectionCard>
      )}

      <ReleaseSectionCard
        title="Verification"
        icon={ShieldCheck}
        collapsed={!!collapsed[INTEGRITY_KEYS.verification]}
        onToggle={() => onToggle(INTEGRITY_KEYS.verification)}
      >
        <div className="flex flex-col gap-3">
          {manifest.signing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manifest.signing.map((entry) => (
                <Pill
                  key={entry.platform}
                  tone={SIGNING_TONE[entry.status]}
                  icon={ShieldCheck}
                  className="max-w-full"
                >
                  <span className="truncate">
                    {PLATFORM_LABEL[entry.platform]}: {entry.detail || entry.status}
                  </span>
                </Pill>
              ))}
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-muted">
            Every published file is listed in{' '}
            <span className="font-mono text-[11px] text-fg">
              {manifest.checksumManifest ?? 'SHA256SUMS'}
            </span>{' '}
            on the{' '}
            <ExternalLink href={manifest.links.release} showIcon>
              release page
            </ExternalLink>
            . Download it alongside the installer and run:
          </p>

          <CommandRow command={verifyChecksums} />
          {verifyProvenance && (
            <>
              <p className="text-[12px] leading-relaxed text-muted">
                Build provenance is attested for this release. Verify that an artifact came from
                this repository&apos;s pipeline with:
              </p>
              <CommandRow command={verifyProvenance} />
            </>
          )}
        </div>
      </ReleaseSectionCard>
    </>
  );
}

/** A copyable shell command. Rendered as text — nothing here is executed. */
function CommandRow({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5">
      <TerminalSquare size={12} className="shrink-0 text-faint" />
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{command}</code>
      <CopyButton value={command} label="Copy command" />
    </div>
  );
}

/** Group assets by platform, in a stable, readable order. */
function groupByPlatform(assets: ReleaseAsset[]): [ReleasePlatform, ReleaseAsset[]][] {
  const order: ReleasePlatform[] = ['windows', 'macos', 'linux', 'any'];
  return order
    .map((platform) => [platform, assets.filter((a) => a.platform === platform)] as const)
    .filter(([, list]) => list.length > 0)
    .map(([platform, list]) => [platform, [...list].sort((a, b) => a.name.localeCompare(b.name))]);
}
