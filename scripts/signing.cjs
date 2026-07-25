/**
 * Code-signing configuration, resolved from the environment. Single source of
 * truth for BOTH halves of the hybrid build:
 *
 *  - `forge.config.ts` signs the **app** (`Limboo.app`, `Limboo.exe` + its DLLs).
 *  - `scripts/dist.mjs` signs the **installers** electron-builder produces.
 *
 * Why it has to be split that way: electron-builder is invoked with
 * `--prepackaged`, and `platformPackager.doPack()` returns early in that mode —
 * so `signApp` never runs and electron-builder CANNOT sign the app bundle no
 * matter what `mac.hardenedRuntime` / `win.signtoolOptions` say. Target-level
 * artifacts (the NSIS installer) are still signed by electron-builder, because
 * `NsisTarget` calls `packager.signIf()` outside the pack pipeline.
 *
 * Everything here is OPT-IN. With no signing environment set, every resolver
 * returns `undefined` and the build behaves exactly as an unsigned dev/PR build
 * always has — CI must never fail because a maintainer has no certificate.
 *
 * Nothing in this file logs a secret. Paths and identity names are safe to
 * print; passwords, base64 blobs and Apple credentials never are.
 */
const { existsSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

/** Read an env var, treating empty/whitespace as absent. */
function env(name) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Materialise a base64-encoded certificate into a temp file and return its path.
 * electron-builder accepts base64 directly in `CSC_LINK`, but
 * `@electron/windows-sign` and signtool both want a real path.
 */
function writeTempCert(base64, filename) {
  const dir = mkdtempSync(join(tmpdir(), 'limboo-sign-'));
  const file = join(dir, filename);
  writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
}

/* ------------------------------------------------------------------ */
/* macOS                                                               */
/* ------------------------------------------------------------------ */

/**
 * Is a macOS Developer ID identity available?
 *
 * `CSC_LINK` (base64 .p12 or a file path) + `CSC_KEY_PASSWORD` is the standard
 * electron-builder pair; we reuse the same names so one secret set drives both
 * halves of the build.
 */
function hasMacSigning() {
  return process.platform === 'darwin' && !!env('CSC_LINK');
}

/** Are notarization credentials available? Requires signing to be set up too. */
function hasMacNotarization() {
  return (
    hasMacSigning() &&
    !!env('APPLE_TEAM_ID') &&
    ((!!env('APPLE_ID') && !!env('APPLE_APP_SPECIFIC_PASSWORD')) ||
      (!!env('APPLE_API_KEY') && !!env('APPLE_API_KEY_ID') && !!env('APPLE_API_ISSUER')))
  );
}

/**
 * `packagerConfig.osxSign` for Forge, or `undefined` when no identity is set.
 *
 * Hardened runtime is mandatory for notarization, and the entitlements are not
 * optional extras: Electron needs JIT and unsigned executable memory, and Limboo
 * loads `better-sqlite3` / `node-pty` / `sherpa-onnx-node` out of
 * `app.asar.unpacked`, which fails under library validation. The inherit file
 * covers the helper processes and the CLIs the agent spawns.
 */
function macSignOptions() {
  if (!hasMacSigning()) return undefined;
  const root = resolve(process.cwd(), 'assets');
  const entitlements = join(root, 'entitlements.mac.plist');
  const entitlementsInherit = join(root, 'entitlements.mac.inherit.plist');
  if (!existsSync(entitlements) || !existsSync(entitlementsInherit)) {
    throw new Error(
      '[signing] macOS entitlements are missing from assets/ — refusing to sign without them ' +
        '(a hardened-runtime build with no entitlements crashes at launch).',
    );
  }
  return {
    identity: env('CSC_NAME'), // undefined => auto-discover from the keychain
    optionsForFile: () => ({
      hardenedRuntime: true,
      entitlements,
      entitlementsInherit,
      'gatekeeper-assess': false,
    }),
  };
}

/** `packagerConfig.osxNotarize` for Forge, or `undefined` when unavailable. */
function macNotarizeOptions() {
  if (!hasMacNotarization()) return undefined;
  const apiKey = env('APPLE_API_KEY');
  if (apiKey) {
    return {
      appleApiKey: apiKey,
      appleApiKeyId: env('APPLE_API_KEY_ID'),
      appleApiIssuer: env('APPLE_API_ISSUER'),
    };
  }
  return {
    appleId: env('APPLE_ID'),
    appleIdPassword: env('APPLE_APP_SPECIFIC_PASSWORD'),
    teamId: env('APPLE_TEAM_ID'),
  };
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the Windows signing strategy.
 *
 * Two supported routes, in priority order:
 *
 *  1. **Azure Trusted Signing** (`AZURE_TENANT_ID` + `AZURE_CLIENT_ID` +
 *     `AZURE_CLIENT_SECRET` + `AZURE_CODE_SIGNING_*`) — a real, chain-trusted
 *     certificate. Dormant today; wired so adopting it needs no code change.
 *  2. **A self-signed certificate** (`WINDOWS_SELF_SIGNED_PFX` base64 +
 *     `WINDOWS_SELF_SIGNED_PFX_PASSWORD`) — free, and deliberately limited: it
 *     is NOT chain-trusted, so SmartScreen still warns. See the publisherName
 *     warning below.
 *
 * @returns {{kind: 'azure'|'selfsigned', certificateFile?: string, certificatePassword?: string, azure?: object}|undefined}
 */
function windowsSigning() {
  if (env('AZURE_TENANT_ID') && env('AZURE_CLIENT_ID') && env('AZURE_CLIENT_SECRET')) {
    return {
      kind: 'azure',
      azure: {
        endpoint: env('AZURE_CODE_SIGNING_ENDPOINT'),
        codeSigningAccountName: env('AZURE_CODE_SIGNING_ACCOUNT'),
        certificateProfileName: env('AZURE_CODE_SIGNING_PROFILE'),
      },
    };
  }

  const pfx = env('WINDOWS_SELF_SIGNED_PFX') ?? env('WINDOWS_CERTIFICATE');
  if (!pfx) return undefined;
  const password =
    env('WINDOWS_SELF_SIGNED_PFX_PASSWORD') ?? env('WINDOWS_CERTIFICATE_PASSWORD') ?? '';
  // Accept either a path (local dev) or base64 (CI secret).
  const certificateFile = existsSync(pfx) ? resolve(pfx) : writeTempCert(pfx, 'windows-sign.pfx');
  return { kind: 'selfsigned', certificateFile, certificatePassword: password };
}

/**
 * `packagerConfig.windowsSign` for Forge, or `undefined`.
 *
 * Only the certificate-file route is expressible here; Azure Trusted Signing is
 * handled by electron-builder alone, so under Azure the app binaries are signed
 * by the installer-side pass and this returns `undefined`.
 */
function windowsSignOptions() {
  const signing = windowsSigning();
  if (!signing || signing.kind !== 'selfsigned') return undefined;
  return {
    certificateFile: signing.certificateFile,
    certificatePassword: signing.certificatePassword,
  };
}

/**
 * Extra `--config.*` arguments for electron-builder, covering the parts of
 * signing that only apply to the installers it produces.
 *
 * ⚠️  `win.publisherName` IS DELIBERATELY NEVER SET HERE while the self-signed
 * route is active. electron-updater's `NsisUpdater.verifySignature` only runs
 * when `publisherName` is present in `app-update.yml`, and it demands
 * `Get-AuthenticodeSignature ... Status == Valid`. A self-signed certificate is
 * not in any user's trust store, so it can never be Valid — setting the field
 * would make EVERY Windows auto-update fail with "New version is not signed by
 * the application owner". Setting it is only safe once a chain-trusted (Azure /
 * OV / EV) certificate is in use. `ci/scripts/verify-signing.mjs` enforces this.
 *
 * @returns {string[]} args to append to the electron-builder invocation
 */
function electronBuilderSigningArgs() {
  const args = [];

  if (process.platform === 'darwin') {
    if (hasMacSigning()) {
      // electron-builder re-signs nothing under --prepackaged, but it does read
      // this to decide whether to probe the keychain. Leave discovery on.
      args.push('--config.mac.identity=' + (env('CSC_NAME') ?? 'auto'));
    }
    return args;
  }

  if (process.platform !== 'win32') return args;

  const signing = windowsSigning();
  if (!signing) return args;

  if (signing.kind === 'azure') {
    // A chain-trusted certificate: update-signature verification becomes safe
    // AND desirable — it is what lets electron-updater reject a tampered
    // installer. electron-builder.yml pins `verifyUpdateCodeSignature: false`
    // for the self-signed default, so turn it back on here.
    args.push('--config.win.verifyUpdateCodeSignature=true');
    const { endpoint, codeSigningAccountName, certificateProfileName } = signing.azure;
    if (endpoint) args.push(`--config.win.azureSignOptions.endpoint=${endpoint}`);
    if (codeSigningAccountName)
      args.push(`--config.win.azureSignOptions.codeSigningAccountName=${codeSigningAccountName}`);
    if (certificateProfileName)
      args.push(`--config.win.azureSignOptions.certificateProfileName=${certificateProfileName}`);
    const publisher = env('WINDOWS_PUBLISHER_NAME');
    if (publisher) args.push(`--config.win.azureSignOptions.publisherName=${publisher}`);
    return args;
  }

  // Self-signed: sign the installer, but never advertise a publisher name.
  args.push(`--config.win.signtoolOptions.certificateFile=${signing.certificateFile}`);
  args.push(
    `--config.win.signtoolOptions.certificatePassword=${signing.certificatePassword ?? ''}`,
  );
  return args;
}

/** One-line, secret-free summary for build logs. */
function describeSigning() {
  if (process.platform === 'darwin') {
    if (!hasMacSigning()) return 'macOS: unsigned (no CSC_LINK)';
    return hasMacNotarization()
      ? 'macOS: Developer ID signing + notarization'
      : 'macOS: Developer ID signing (notarization credentials absent)';
  }
  if (process.platform === 'win32') {
    const signing = windowsSigning();
    if (!signing) return 'Windows: unsigned (no certificate configured)';
    return signing.kind === 'azure'
      ? 'Windows: Azure Trusted Signing'
      : 'Windows: self-signed (SmartScreen will still warn; publisherName stays unset)';
  }
  return 'Linux: no code signing (integrity via SHA256SUMS + provenance attestation)';
}

module.exports = {
  hasMacSigning,
  hasMacNotarization,
  macSignOptions,
  macNotarizeOptions,
  windowsSigning,
  windowsSignOptions,
  electronBuilderSigningArgs,
  describeSigning,
};
