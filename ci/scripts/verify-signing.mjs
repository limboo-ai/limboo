#!/usr/bin/env node
/**
 * verify-signing.mjs — verify code signatures on built artifacts where signing is
 * configured, and exit cleanly (skip) where it is not.
 *
 * Provider-neutral. Limboo stores NO signing credentials in the repo; signing is
 * opt-in and driven entirely by provider secrets (see docs/ci/code-signing.md).
 * This script therefore:
 *   - Always: asserts the `publisherName` invariant (see below) — the one check
 *     that must run even on unsigned builds, because getting it wrong breaks
 *     auto-update for every Windows user rather than failing the build.
 *   - On macOS: runs `codesign --verify` plus an `spctl` Gatekeeper assessment
 *     when a signing identity is expected (CSC_LINK / APPLE signing env present).
 *   - On Windows: runs `signtool verify` on .exe when signing env is present.
 *   - On Linux / when no signing env is set: prints "signing not configured" and
 *     exits 0 so unsigned dev/PR builds never fail the pipeline.
 *
 * Usage: node ci/scripts/verify-signing.mjs [artifactDir=dist]
 */
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifactDir = process.argv[2] ?? 'dist';
const platform = process.platform;

const macSigning = !!(process.env.CSC_LINK || process.env.APPLE_CERTIFICATE || process.env.APPLE_ID);
const azureSigning = !!(
  process.env.AZURE_TENANT_ID &&
  process.env.AZURE_CLIENT_ID &&
  process.env.AZURE_CLIENT_SECRET
);
const selfSigned = !!(process.env.WINDOWS_SELF_SIGNED_PFX || process.env.WINDOWS_CERTIFICATE);
const winSigning =
  azureSigning || selfSigned || !!process.env.WIN_CSC_LINK || !!process.env.SM_CODE_SIGNING_CERT_SHA1_HASH;

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), missing: r.error?.code === 'ENOENT' };
}

async function collect(extensions) {
  const matches = [];
  for await (const file of walk(artifactDir)) {
    if (extensions.some((e) => file.toLowerCase().endsWith(e))) matches.push(file);
  }
  return matches;
}

/**
 * The `publisherName` invariant.
 *
 * electron-updater only runs its Authenticode check on a downloaded installer
 * when `app-update.yml` carries a publisherName, and that check demands
 * `Get-AuthenticodeSignature ... Status == Valid`. A self-signed certificate is
 * in no user's trust store, so it can NEVER be Valid — publishing a
 * publisherName alongside a self-signed build makes every Windows auto-update
 * die with "New version is not signed by the application owner", and the only
 * fix for users already on that version is a manual reinstall.
 *
 * So: publisherName is allowed only when a chain-trusted certificate (Azure
 * Trusted Signing today) is in play. This runs on every platform because the
 * config file is platform-independent and the cost of catching it late is high.
 */
async function assertPublisherNameInvariant() {
  let config;
  try {
    config = await readFile('electron-builder.yml', 'utf8');
  } catch {
    return; // not running from the repo root; nothing to assert
  }
  // Deliberately line-level rather than a YAML parse: this must work with no
  // dependencies and only cares whether the keys are present at all.
  const lines = config.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
  const publisherDeclared = lines.some((line) => /^\s*publisherName\s*:/.test(line));
  // Omitting publisherName is NOT sufficient on its own: with
  // verifyUpdateCodeSignature at its default `true`, electron-builder derives
  // publisherName from the signing certificate's CN and writes it into
  // app-update.yml itself.
  const verifyDisabled = lines.some(
    (line) => /^\s*verifyUpdateCodeSignature\s*:\s*false\s*$/.test(line),
  );

  if (azureSigning) {
    console.log(
      'verify-signing: a chain-trusted certificate is in use — update-signature verification is allowed.',
    );
    return;
  }

  if (publisherDeclared) {
    console.error(
      'verify-signing: electron-builder.yml sets `publisherName`, but no chain-trusted\n' +
        'certificate is configured. electron-updater would then require a Valid\n' +
        'Authenticode chain on every downloaded installer, which a self-signed (or\n' +
        'absent) certificate can never satisfy — breaking Windows auto-update for all\n' +
        'users. Remove publisherName, or configure Azure Trusted Signing.',
    );
    process.exit(1);
  }

  if (!verifyDisabled) {
    console.error(
      'verify-signing: electron-builder.yml does not set `win.verifyUpdateCodeSignature: false`,\n' +
        'and no chain-trusted certificate is configured. At its default (true),\n' +
        'electron-builder derives publisherName from the signing certificate and writes\n' +
        'it into app-update.yml — which breaks Windows auto-update for every user on a\n' +
        'self-signed build. Set it to false, or configure Azure Trusted Signing.',
    );
    process.exit(1);
  }

  console.log('verify-signing: Windows update-signature invariant holds (no publisherName, verification off).');
}

async function main() {
  await assertPublisherNameInvariant();

  if (platform === 'darwin' && macSigning) {
    const bundles = await collect(['.app']);
    const archives = await collect(['.dmg', '.zip']);
    let failed = false;

    for (const t of [...bundles, ...archives]) {
      const v = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', t]);
      console.log(`codesign ${t}: ${v.ok ? 'OK' : 'FAIL'}`);
      if (!v.ok && !v.missing) {
        console.error(v.out);
        failed = true;
      }
    }

    // The Gatekeeper assessment is the check that actually predicts what a user
    // sees on first launch — codesign only proves the signature is well-formed.
    // Only meaningful for .app bundles and .dmg images.
    for (const t of [...bundles, ...archives.filter((f) => f.endsWith('.dmg'))]) {
      const type = t.endsWith('.dmg') ? 'open' : 'execute';
      const v = run('spctl', ['--assess', '--type', type, '--verbose=4', t]);
      console.log(`spctl ${t}: ${v.ok ? 'ACCEPTED' : 'REJECTED'}`);
      if (!v.ok && !v.missing) {
        // Notarization can lag behind signing; report loudly but let the caller
        // decide, since a rejected assessment does not mean a corrupt artifact.
        console.error(v.out);
        failed = true;
      }
    }

    process.exit(failed ? 1 : 0);
  }

  if (platform === 'win32' && winSigning) {
    const targets = await collect(['.exe', '.msi', '.appx', '.msix', '.nupkg']);
    let failed = false;
    for (const t of targets) {
      // /pa = use the Authenticode policy. A self-signed certificate FAILS this
      // by design (it is not chain-trusted); report it without failing the build,
      // because that outcome is the documented, accepted trade-off of the free
      // signing route — an actually-broken signature shows up as a malformed
      // file, not an untrusted chain.
      const v = run('signtool', ['verify', '/pa', '/v', t]);
      const untrustedChain = /A certificate chain processed|not trusted|UntrustedRoot/i.test(v.out);
      if (v.ok) {
        console.log(`signtool ${t}: OK`);
      } else if (selfSigned && untrustedChain) {
        console.log(`signtool ${t}: signed, chain untrusted (expected for the self-signed route)`);
      } else if (!v.missing) {
        console.log(`signtool ${t}: FAIL`);
        console.error(v.out);
        failed = true;
      }
    }
    process.exit(failed ? 1 : 0);
  }

  console.log(`verify-signing: signing not configured for ${platform} — skipping (this is expected for dev/PR builds).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('verify-signing failed:', err);
  process.exit(1);
});
