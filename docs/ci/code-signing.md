# Code signing

Signing is **optional and opt-in**. Limboo stores no signing credentials in the
repository; signing is driven entirely by provider secrets. When no signing secrets are
present, builds are unsigned and [`verify-signing.mjs`](../../ci/scripts/verify-signing.mjs)
prints "signing not configured" and exits 0, so dev/PR builds never fail.

All of it is resolved in one place —
[`scripts/signing.cjs`](../../scripts/signing.cjs) — which both
`forge.config.ts` and `scripts/dist.mjs` import.

## Why signing is split across two tools

electron-builder runs with `--prepackaged` (see
[`scripts/dist.mjs`](../../scripts/dist.mjs)), and `platformPackager.doPack()`
returns early in that mode. `signApp` only runs inside `doPack`, so
**electron-builder cannot sign the application bundle at all** here, whatever
`mac.hardenedRuntime` or `win.signtoolOptions` say. Target-level artifacts are a
different matter: `NsisTarget` calls `packager.signIf()` outside the pack
pipeline, so the installer *is* signed by electron-builder.

Hence:

| What | Signed by |
| --- | --- |
| `Limboo.app`, `Limboo.exe` + bundled DLLs | Electron Forge (`packagerConfig.osxSign` / `windowsSign`) |
| The NSIS installer | electron-builder (`win.signtoolOptions` / `win.azureSignOptions`) |

Forge's fuses plugin hooks `packageAfterCopy`, which runs *before* packager's
signing step — so fuse injection can never invalidate the signature.

## macOS

Required secrets (GitLab masked+protected CI/CD variable names; the GitHub Actions
equivalents are the same variable names):

| Secret | Description |
| ------ | ----------- |
| `CSC_LINK` | base64-encoded `.p12` Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

App Store Connect API key authentication is supported as an alternative to the
Apple ID pair: set `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`
(plus `APPLE_TEAM_ID`).

Signing enables the hardened runtime and applies
[`assets/entitlements.mac.plist`](../../assets/entitlements.mac.plist) plus
`entitlements.mac.inherit.plist`. Those entitlements are load-bearing, not
boilerplate: Electron needs JIT and unsigned executable memory, and Limboo loads
`better-sqlite3` / `node-pty` / `sherpa-onnx-node` out of `app.asar.unpacked`,
which fails under library validation. `scripts/signing.cjs` refuses to sign if
the files are missing, because a hardened-runtime build without them crashes at
launch.

After signing, `verify-signing.mjs` runs `codesign --verify --deep --strict` and
an `spctl` Gatekeeper assessment — the latter being the check that actually
predicts what a user sees on first launch.

> **macOS signing is not cosmetic.** Squirrel.Mac refuses to install an update
> into an app it cannot verify, so an unsigned macOS build **cannot self-update
> at all**. The app detects this at startup and reports updates as unavailable
> with a reason. See [auto-update](../operations/auto-update.md).

`.gitlab-ci.yml` sets `CSC_IDENTITY_AUTO_DISCOVERY=false` only when `CSC_LINK` is
absent. Adding the secret is all that is needed to switch signing on.

## Windows

Three routes, in the order `scripts/signing.cjs` prefers them.

### 1. Azure Trusted Signing (chain-trusted, ~$10/month)

| Variable | Description |
| --- | --- |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | service principal, read directly by the signing module |
| `AZURE_CODE_SIGNING_ENDPOINT` | e.g. `https://neu.codesigning.azure.net/` |
| `AZURE_CODE_SIGNING_ACCOUNT` | Trusted Signing account name |
| `AZURE_CODE_SIGNING_PROFILE` | certificate profile name |
| `WINDOWS_PUBLISHER_NAME` | must match the certificate's CN exactly |

Wired but dormant — setting these switches the route with no code change. Note
that Azure Trusted Signing follows the same reputation model as an OV
certificate: new files still trip SmartScreen until they accumulate download
history. It is not instant trust.

### 2. Self-signed certificate (free — the current default)

| Secret | Description |
| ------ | ----------- |
| `WINDOWS_SELF_SIGNED_PFX` | base64-encoded `.pfx` (or a path, for local builds) |
| `WINDOWS_SELF_SIGNED_PFX_PASSWORD` | password for the `.pfx` |

Generate it **once** with
[`scripts/gen-selfsigned-cert.ps1`](../../scripts/gen-selfsigned-cert.ps1) and
store the output as a secret. Regenerating per build would change the publisher
identity release to release, which is worse than not signing.

Be clear about what this buys: **a self-signed certificate does not remove the
SmartScreen warning.** It is not chained to a trusted root, so Windows treats the
signature as untrusted and still shows "Windows protected your PC." What it gives
you is a stable publisher identity and a tamper-evident binary. The warning-free
route is the [Microsoft Store channel](../operations/microsoft-store.md).

`verify-signing.mjs` reports an untrusted chain on this route as expected rather
than as a failure — a genuinely broken signature shows up as a malformed file,
not as an untrusted chain.

### ⚠ The `publisherName` invariant

`electron-updater` runs an Authenticode check on a downloaded installer only when
`app-update.yml` carries a `publisherName`, and that check requires
`Get-AuthenticodeSignature ... Status == Valid`. A self-signed certificate can
never be Valid on someone else's machine, so publishing a `publisherName`
alongside it makes **every Windows auto-update fail** with "New version is not
signed by the application owner" — recoverable only by a manual reinstall.

Omitting the key is not enough. At its default `true`,
`win.verifyUpdateCodeSignature` makes electron-builder *derive* `publisherName`
from the certificate's CN and write it into `app-update.yml` for you.
`electron-builder.yml` therefore pins `verifyUpdateCodeSignature: false`, and
`signing.cjs` re-enables it only on the Azure route.

`verify-signing.mjs` fails the build if either half of this is violated.

### 3. Microsoft Store (MSIX)

No certificate at all — Microsoft re-signs the package. See
[microsoft-store.md](../operations/microsoft-store.md).

## Linux

`.deb` / `.rpm` / `.pacman` / AppImage are not Authenticode/codesign-signed;
there is no equivalent mechanism. Integrity comes from `SHA256SUMS` plus
repository GPG signing if you publish to an apt/rpm repo. The build provenance
attestation covers all platforms regardless.

## Encoding a certificate as a secret

```bash
base64 -w0 certificate.p12   # Linux
base64 -i certificate.p12    # macOS
```

Paste the output as the secret value. Never commit the certificate or its password.

## Rotation

Rotate certificates before expiry. Because credentials live only in the provider secret
store, rotation is a secret update with no code change.

Rotating a **chain-trusted Windows** certificate additionally needs care with
`publisherName`: electron-updater compares the new installer against the value
baked into the *installed* version. `win.signtoolOptions.publisherName` accepts an
array, so ship one release listing both the old and new names before dropping the
old one.
