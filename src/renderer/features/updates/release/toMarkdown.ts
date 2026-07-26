/**
 * Render a manifest back to Markdown for copy and export.
 *
 * Built from the STRUCTURED manifest rather than echoing `manifest.markdown`,
 * so an export carries what the document actually showed — including the
 * contributor, pull-request and asset facts that exist in the manifest but not
 * in the changelog section it was parsed from. `manifest.markdown` is still the
 * fallback when a release predates structured parsing.
 */
import { RELEASE_CATEGORY_LABEL, type ReleaseManifestEntry } from '@shared/release';

export function releaseToMarkdown(manifest: ReleaseManifestEntry): string {
  const out: string[] = [];

  out.push(`# Limboo ${manifest.version}${manifest.codename ? ` — ${manifest.codename}` : ''}`);
  out.push('');

  const facts = [
    manifest.date && `Released: ${manifest.date}`,
    `Channel: ${manifest.channel}`,
    `Tag: ${manifest.gitTag}`,
    manifest.commit && `Commit: ${manifest.commit}`,
    manifest.buildNumber && `Build: ${manifest.buildNumber}`,
  ].filter(Boolean);
  if (facts.length) {
    out.push(facts.map((f) => `- ${f}`).join('\n'));
    out.push('');
  }

  if (manifest.summary) {
    out.push(manifest.summary);
    out.push('');
  }

  // Sections are emitted in their authored order here, not the document's
  // consequence order: an exported file is read as a changelog entry, and it
  // should match the changelog it came from.
  for (const section of manifest.sections) {
    out.push(`## ${RELEASE_CATEGORY_LABEL[section.category] ?? section.title}`);
    out.push('');
    out.push(section.markdown);
    out.push('');
  }

  if (manifest.contributors.length) {
    out.push('## Contributors');
    out.push('');
    for (const person of manifest.contributors) {
      const handle = person.handle ? ` (@${person.handle})` : '';
      const commits = person.commits > 0 ? ` — ${person.commits} commits` : '';
      out.push(`- ${person.name}${handle}${commits}`);
    }
    out.push('');
  }

  if (manifest.pullRequests.length) {
    out.push('## Pull requests');
    out.push('');
    for (const pr of manifest.pullRequests) out.push(`- #${pr.number} ${pr.title}`);
    out.push('');
  }

  if (manifest.assets.length) {
    out.push('## Assets');
    out.push('');
    for (const asset of manifest.assets) {
      const size = asset.bytes === null ? '' : ` — ${asset.bytes} bytes`;
      const digest = asset.sha256 ? ` — sha256:${asset.sha256}` : '';
      out.push(`- ${asset.name} (${asset.platform}${asset.arch ? `/${asset.arch}` : ''})${size}${digest}`);
    }
    out.push('');
  }

  const links = [
    manifest.links.release && `Release: ${manifest.links.release}`,
    manifest.links.compare && `Compare: ${manifest.links.compare}`,
  ].filter(Boolean);
  if (links.length) {
    out.push('## Links');
    out.push('');
    out.push(links.map((l) => `- ${l}`).join('\n'));
    out.push('');
  }

  return out.join('\n').trimEnd() + '\n';
}
