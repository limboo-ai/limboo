#!/usr/bin/env node
/**
 * Hybrid packaging step: wrap the Forge-packaged app into branded installers.
 *
 * Electron Forge owns dev (`npm start`) and app packaging (`electron-forge
 * package` — applies the Vite build, the security fuses, and the asar/asar-unpack
 * layout). This script then runs electron-builder over that already-packaged
 * directory via `--prepackaged`, so electron-builder NEVER re-packs the app (the
 * fuses + asar-integrity Forge applied are preserved) and only produces the
 * branded NSIS / dmg / AppImage targets plus the `latest*.yml` auto-update
 * metadata that electron-updater consumes.
 *
 * Cross-platform on purpose: invoked as `node scripts/dist.mjs [extra args]` so it
 * works identically under bash/zsh and Windows cmd.exe in CI. Any extra args
 * (e.g. `--publish always`) are forwarded straight to electron-builder.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { writeAppUpdateYml } from './write-app-update-yml.mjs';

// signing.cjs is CommonJS so forge.config.ts (transpiled to CJS) can require it
// synchronously; pull it in the same way from this ESM script.
const { electronBuilderSigningArgs, describeSigning } = createRequire(import.meta.url)(
  './signing.cjs',
);

/**
 * Load `.env` (gitignored) from the repo root into `process.env` so a local
 * `npm run publish` picks up secrets like `GH_TOKEN` regardless of which shell
 * it runs in (setx / export only affect newly-spawned shells). Only fills keys
 * that are NOT already set, so CI/CD env variables always take precedence and a
 * stale local `.env` can never override them. Never logs values.
 */
function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || (process.env[key] ?? '') !== '') continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

// Which architecture's Forge output are we wrapping? Defaults to this machine's,
// but a runner that cross-packaged (e.g. `electron-forge package --arch=x64`)
// can point at that output explicitly.
const archArg = process.argv.find((a) => a.startsWith('--arch='));
const targetArch = archArg ? archArg.slice('--arch='.length) : process.arch;
const forwardedArgs = process.argv.slice(2).filter((a) => !a.startsWith('--arch='));

// Forge names the packaged dir from packagerConfig.name ('Limboo') + platform/arch.
const forgeOutDir = resolve(process.cwd(), 'out', `Limboo-${process.platform}-${targetArch}`);

if (!existsSync(forgeOutDir)) {
  console.error(
    `[dist] Expected Forge package output at "${forgeOutDir}" but it does not exist.\n` +
      `       Run "electron-forge package" first (npm run dist does this for you).`,
  );
  process.exit(1);
}

// `--prepackaged` means different things per platform, and getting this wrong is
// silent: `macPackager.packMacTargets` treats the value AS the `.app` bundle
// path, so handing it the containing directory produced a dmg/zip whose root
// entry was `Limboo-darwin-arm64/` instead of `Limboo.app/`. Squirrel.Mac only
// accepts a zip rooted at the .app, so every macOS auto-update failed — and the
// dmg wrapped a folder. Windows and Linux DO want the directory.
const prepackaged =
  process.platform === 'darwin' ? join(forgeOutDir, 'Limboo.app') : forgeOutDir;

if (process.platform === 'darwin' && !existsSync(prepackaged)) {
  console.error(
    `[dist] Expected the app bundle at "${prepackaged}" but it does not exist.\n` +
      `       Forge should have produced Limboo.app inside ${forgeOutDir}.`,
  );
  process.exit(1);
}

// electron-updater reads `resources/app-update.yml` on every checkForUpdates() to
// learn its feed + cache dir, and neither Forge nor `--prepackaged` electron-builder
// emits it. Forge's `postPackage` hook (forge.config.ts) already wrote it into this
// dir, but re-write it here as a safety net so a stale/hand-assembled prepackaged
// dir still gets a valid feed file before electron-builder wraps it. Shared content
// lives in write-app-update-yml.mjs.
try {
  // Takes the Forge OUTPUT DIR (not the .app) — resourcesDirFor() steps into the
  // bundle itself on darwin.
  const appUpdatePath = writeAppUpdateYml(forgeOutDir, process.platform);
  console.log(`[dist] wrote ${appUpdatePath}`);
} catch (err) {
  console.error(`[dist] failed to write app-update.yml: ${err?.message ?? err}`);
  process.exit(1);
}

// Map the current platform to electron-builder's target flag so each CI runner
// builds only its own OS's installers (the release matrix covers all three).
const PLATFORM_FLAGS = { win32: '--win', darwin: '--mac', linux: '--linux' };
const platformFlag = PLATFORM_FLAGS[process.platform];
if (!platformFlag) {
  console.error(
    `[dist] Unsupported platform "${process.platform}". Expected one of: ` +
      `${Object.keys(PLATFORM_FLAGS).join(', ')}.`,
  );
  process.exit(1);
}

/**
 * Windows only: request the Microsoft Store (appx) target alongside NSIS when
 * Partner Center identity values are present. The identity is account-specific,
 * so it arrives as environment rather than living in electron-builder.yml, and
 * without it the target is not requested at all — a maintainer with no Store
 * account still gets a normal Windows build. The appx target also needs the
 * Windows SDK's makeappx.exe, which is why CI runs it as a separate,
 * non-blocking job.
 */
function appxArgs() {
  if (process.platform !== 'win32') return { targets: [], config: [] };
  const identityName = process.env.APPX_IDENTITY_NAME?.trim();
  const publisher = process.env.APPX_PUBLISHER?.trim();
  const publisherDisplayName = process.env.APPX_PUBLISHER_DISPLAY_NAME?.trim();
  if (!identityName || !publisher || !publisherDisplayName) {
    return { targets: [], config: [] };
  }
  console.log('[dist] Microsoft Store (appx) target enabled');
  return {
    targets: ['appx'],
    config: [
      `--config.appx.identityName=${identityName}`,
      `--config.appx.publisher=${publisher}`,
      `--config.appx.publisherDisplayName=${publisherDisplayName}`,
    ],
  };
}

const appx = appxArgs();

// Pin the arch to the one Forge just packaged. A `--prepackaged` input holds
// exactly ONE architecture, so the config must not name any others: an explicit
// `arch:` list in electron-builder.yml OVERRIDES this CLI flag, and
// `packageInDistributableFormat` then wraps the same directory once per listed
// arch. That is how v1.5.1 shipped an "Intel" dmg/zip that was byte-for-byte the
// arm64 build. The target lists in electron-builder.yml are deliberately
// arch-free so this flag is the only thing that decides.
const ARCH_FLAGS = { arm64: '--arm64', x64: '--x64', ia32: '--ia32', armv7l: '--armv7l' };
const archFlag = ARCH_FLAGS[targetArch];
if (!archFlag) {
  console.error(
    `[dist] Unsupported architecture "${targetArch}". Expected one of: ` +
      `${Object.keys(ARCH_FLAGS).join(', ')}.`,
  );
  process.exit(1);
}

console.log(`[dist] ${describeSigning()}`);

// `--win nsis appx` style: targets listed after the platform flag ADD to the
// config's list rather than replacing it, so NSIS is always built.
const args = [
  'electron-builder',
  platformFlag,
  ...appx.targets,
  archFlag,
  '--prepackaged',
  prepackaged,
  ...appx.config,
  ...electronBuilderSigningArgs(),
  ...forwardedArgs,
];

console.log(`[dist] electron-builder ${args.slice(1).join(' ')}`);

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32', // npx resolution on Windows needs the shell
});

process.exit(result.status ?? 1);
