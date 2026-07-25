# Microsoft Store (MSIX) channel

The Store is the only way to ship Windows builds with **no SmartScreen warning**
without buying a certificate: Microsoft re-signs every submitted package with its
own trusted certificate. This document covers what that costs, what it changes
about the app's behaviour, and how to build the package.

## What it costs

Not zero, but close: a **Partner Center individual developer account is a $19
one-time fee** (companies pay $99). There is no per-app or recurring cost, and no
certificate to buy, renew, or store.

Compare with the alternatives:

| Route | Cost | SmartScreen |
| --- | --- | --- |
| Unsigned | $0 | Warns |
| Self-signed (current default) | $0 | Warns — the certificate is untrusted |
| Microsoft Store | $19 once | **No warning** (Microsoft signs it) |
| Azure Trusted Signing | ~$10/month | Warns until the certificate builds reputation |
| EV certificate | ~$300–600/year | No warning (instant reputation) |

## What changes for the app

**Store builds do not self-update.** The Store owns update delivery for packages
it distributes. `AutoUpdateManager` detects `process.windowsStore` at startup,
disables the updater, and tells the user why — rather than downloading an
installer that could not be applied to a packaged install anyway.

**Everything else works.** MSIX-packaged Win32 apps are Desktop Bridge packages
that declare the `runFullTrust` capability, which is *not* an AppContainer
sandbox. Spawning `cursor-agent`, `git` and `node-pty` terminals, writing into
worktrees, and reading the user's repositories all behave as they do outside the
package. Store reviewers routinely flag `runFullTrust` — the answer is that this
is an Electron desktop application packaged via Desktop Bridge, which requires it.

## Building the package

The `appx` target is only requested when Partner Center identity values are
present in the environment, so a maintainer without a Store account still gets a
normal Windows build:

```bash
APPX_IDENTITY_NAME=12345Publisher.Limboo \
APPX_PUBLISHER='CN=00000000-0000-0000-0000-000000000000' \
APPX_PUBLISHER_DISPLAY_NAME='Your Publisher Name' \
npm run dist
```

Find all three in Partner Center under **Product management → Product identity**:

| Variable | Partner Center field |
| --- | --- |
| `APPX_IDENTITY_NAME` | Package/Identity/Name |
| `APPX_PUBLISHER` | Package/Identity/Publisher |
| `APPX_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |

`scripts/dist.mjs` turns these into `--config.appx.*` overrides, so nothing
account-specific is committed to the repository.

### Requirements

- Must build **on Windows** — the target shells out to the Windows SDK's
  `makeappx.exe`. CI runs it on the Windows job, staged opportunistically so a
  runner without the SDK never fails a release.
- Store tile art comes from `assets/installer/appx/`, generated from
  `assets/icon.svg` by `npm run gen:appx`. Regenerate it after editing the SVG —
  electron-builder will otherwise silently fall back to its own placeholder
  images, and a Store listing branded with someone else's logo is not a good look.

### Testing locally before submitting

An MSIX must be signed to install outside the Store. Sign the local build with
the self-signed certificate (`scripts/gen-selfsigned-cert.ps1`), install that
certificate into **Trusted People**, then double-click the `.appx`. The Store's
own copy is re-signed by Microsoft, so this certificate is only ever a local
testing aid.

## Submitting

1. Reserve the app name in Partner Center and read the identity values above.
2. Build with those values set; the `.appx` lands in `dist/`.
3. Upload it to a new submission. Do not sign the uploaded package — Microsoft
   re-signs it, and a package signed with an unknown certificate is rejected.
4. Expect a `runFullTrust` question during review; answer as described above.

## Related

- [`docs/ci/code-signing.md`](../ci/code-signing.md) — the direct-download signing routes
- [`docs/operations/auto-update.md`](auto-update.md) — why Store builds do not self-update
