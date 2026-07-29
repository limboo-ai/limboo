# CLAUDE.md

Operational guide and deep context for any AI coding agent (Claude, etc.) working
in this repository. Read this first. It explains **what Limboo is**, **how the
code is organized**, **the rules you must follow**, and **what is and is not built
yet**.

> Companion document: [`project.md`](project.md) holds the full product/architecture
> vision. `CLAUDE.md` (this file) is the practical, code-level contract for working
> in the repo. When the two disagree about *current reality*, trust `CLAUDE.md`.

---

## 1. What is Limboo?

Limboo is a **local-first desktop application** that acts as the *operating system
for AI software development*. It is **not an AI model**. Instead, it provides the
environment around a connected coding agent: project management, sessions, file
watching, repository indexing, git operations, terminal execution, memory,
permissions, context, search, and UI.

Core idea: **every development task happens inside a Session**. A session bundles a
repository, branch, chat history, agent, terminal history, checkpoints,
permissions, context, memory, tasks, and generated files into one workspace.

Guiding principles (from `project.md` §4): Fast, Local, Private, Modular, Secure,
Responsive, Observable, Predictable, Recoverable. There is **no backend** — the
only network traffic is the connected coding agent talking to its AI provider.

---

## 2. Tech stack (current)

| Layer            | Choice                                      |
| ---------------- | ------------------------------------------- |
| Shell / desktop  | **Electron 42** (via **Electron Forge 7**)  |
| Bundler          | **Vite 5** (`@electron-forge/plugin-vite`)  |
| UI framework     | **React 19**                                |
| Language         | **TypeScript** (`~4.5`)                      |
| Styling          | **Tailwind CSS v4** (CSS-first, no config)  |
| State            | **Zustand 5** (slice-per-domain stores)     |
| Icons            | **lucide-react**                            |
| Packaging/makers | Squirrel (win), ZIP (mac), deb, rpm (linux) |

Notes / gotchas:

- `@vitejs/plugin-react` is pinned to the **v4** line on purpose. v6 requires
  Vite 8, but Electron Forge's Vite plugin pins **Vite 5** — installing v6 breaks
  peer resolution. If you bump Vite, re-check this.
- Tailwind v4 is **CSS-first**: there is **no `tailwind.config.js`** and **no
  `postcss.config.js`**. All design tokens live in an `@theme` block inside
  [`src/renderer/styles/index.css`](src/renderer/styles/index.css). The Vite
  plugin (`@tailwindcss/vite`) handles PostCSS/autoprefixer internally.
- TypeScript is old (`~4.5`). The renderer is transpiled by **esbuild via Vite**,
  not `tsc`, so type errors do **not** block the dev/build run. **Do not** rely on
  `tsc --noEmit` to verify — TS 4.5 cannot even parse the modern bundled
  `@types/node`. Verify instead with `npx vite build --config
  vite.renderer.config.mts` + `npm run lint` (and esbuild bundles for main/preload).
- **Path aliases**: `@` → `src` and `@shared` → `src/shared`. Configured in all
  three Vite configs (`resolve.alias`) and `tsconfig.json` (`paths`). ESLint's
  `import/no-unresolved` is set to ignore `^@/` and `^@shared/` (the pinned
  ESLint 8 toolchain can't take the TS resolver plugin).
- **Zustand 5** drives renderer state. It's transpiled by esbuild so the old TS
  version is a non-issue.

---

## 3. Project structure

```
limboo/
├── CLAUDE.md                  # you are here
├── project.md                 # full product/architecture vision
├── index.html                 # renderer HTML entry (script → src/renderer/main.tsx)
├── forge.config.ts            # Electron Forge config (entries: src/main/index.ts, src/preload/index.ts; icon)
├── vite.main.config.ts        # Vite config: main process build (+ @ / @shared alias)
├── vite.preload.config.ts     # Vite config: preload build (+ @ / @shared alias)
├── vite.renderer.config.mts   # Vite config: renderer (React + Tailwind + alias) — see note
├── tsconfig.json              # TS config (jsx: react-jsx, DOM libs, path aliases)
├── .eslintrc.json             # ESLint (typescript + import; ignores @ aliases)
├── assets/                    # static assets bundled with the app
│   ├── icon.svg               # source Orbit mark (lucide geometry, transparent, solid accent)
│   ├── icon.png               # 512px window/app icon (rsvg-convert from icon.svg)
│   └── tray.png               # 32px tray icon
├── package.json
└── src/
    ├── global.d.ts            # ambient types for window.limboo (from preload)
    ├── shared/                # code shared across ALL processes
    │   ├── ipc-channels.ts    #   IpcChannels (invoke) + IpcEvents (push) name constants
    │   ├── types.ts           #   AppSettings, WindowStateData, Session, FileChange, CommandId, …
    │   └── constants.ts       #   DEFAULT_SETTINGS, limits, clamp()
    ├── main/                  # MAIN process (Node / OS owner)
    │   ├── index.ts           #   entry: lifecycle, single-instance, CSP, wires managers + IPC
    │   ├── logger.ts          #   file+console logger + global uncaught handlers
    │   ├── storage.ts         #   atomic JSON read/write under userData
    │   ├── paths.ts           #   assetPath() resolver
    │   ├── sendCommand.ts     #   native menu/tray → renderer command bridge
    │   ├── window/            #   createWindow.ts (frameless, sandbox, icon) + windowState.ts
    │   ├── managers/          #   Settings, Notification, AppMenu, Tray managers (+ cursor/ auth)
    │   ├── secrets/           #   SecretStore.ts — safeStorage-encrypted secrets under userData/secrets/
    │   └── ipc/               #   registry.ts (handle wrapper) + *Handlers + registerAllIpc()
    ├── preload/
    │   └── index.ts           # the ONLY bridge — exposes window.limboo.{window,settings,system,app,events}
    └── renderer/              # React UI (presentation only)
        ├── main.tsx           #   entry: ErrorBoundary + LoadingScreen hydration gate
        ├── App.tsx            #   composes AppShell + palette + settings modal + toaster + shortcut hooks
        ├── styles/index.css   #   Tailwind import + pure-black tokens + drag/anim utilities
        ├── app/AppShell.tsx   #   the resizable 3-region layout
        ├── components/        #   ui/ (primitives), layout/ (TitleBar, WindowControls), brand/ (Logo), feedback/
        ├── features/          #   sessions/, workspace/, activity/, command-palette/, settings/
        ├── stores/            #   Zustand slice stores (settings/layout/session/UI/agent/git/terminal/service/…)
        ├── hooks/             #   useResizable, useKeyboardShortcuts, useCommandBridge
        └── lib/               #   cn, debounce, format, commands (registry)
```

> The renderer Vite config is `vite.renderer.config.**mts**` (ESM), not `.ts`.
> Reason: `@tailwindcss/vite` is ESM-only and this project is CommonJS, so a `.ts`
> config gets loaded via `require()` and fails. The `.mts` extension forces ESM
> loading. `forge.config.ts` points at the `.mts` file. The main/preload configs
> stay `.ts` (they import no ESM-only packages).

### The three Electron contexts (critical mental model)

```
 Renderer (Chromium + React)   <-- src/renderer/** (entry: main.tsx)
        │  window.limboo.*
        ▼
 Preload (contextBridge)        <-- src/preload/index.ts  (the ONLY bridge)
        │  ipcRenderer <-> ipcMain
        ▼
 Main (Node.js + OS access)     <-- src/main/** (entry: index.ts)
```

Hard rules:

- **Renderer = UI only.** No `fs`, no `child_process`, no git, no terminal logic,
  no direct Node APIs. It asks; it never performs.
- **Main = OS owner.** All filesystem, git, shell, SQLite, indexing, and
  background work lives here (or in worker/utility processes spawned from here).
- **Everything crosses via IPC**, exposed through `contextBridge` in
  `src/preload/index.ts`. `contextIsolation` is ON, `nodeIntegration` OFF, and the
  window runs with `sandbox: true`. Never weaken these.
- **Channel names** live only in [`src/shared/ipc-channels.ts`](src/shared/ipc-channels.ts)
  so handlers (main) and invokers (preload) can never drift.

---

## 4. Theming: pure-black, dark mode ONLY

This is a **strict product requirement**: the app is **dark mode only, on a true
`#000000` background**. There is **no light mode and no theme toggle**. Do not add
`dark:` variants, a theme switcher, or a light palette.

How it is enforced (defense in depth):

1. **Main process** — [`src/main/index.ts`](src/main/index.ts) sets
   `nativeTheme.themeSource = 'dark'` and [`createWindow.ts`](src/main/window/createWindow.ts)
   uses `backgroundColor: '#000000'` with `show: false` + `ready-to-show` to
   prevent a white launch flash.
2. **HTML** — [`index.html`](index.html) sets `<html class="dark">` and
   `<meta name="color-scheme" content="dark">`.
3. **CSS** — [`src/renderer/styles/index.css`](src/renderer/styles/index.css) sets
   `color-scheme: dark`, a black `body` background, dark scrollbars, and the token
   palette.

### Design tokens (Tailwind v4 `@theme` in `src/renderer/styles/index.css`)

These become utilities automatically (e.g. `bg-base`, `text-fg`, `border-line`).

| Token                  | Value     | Use                                  |
| ---------------------- | --------- | ------------------------------------ |
| `--color-base`         | `#000000` | App background (`bg-base`)           |
| `--color-surface`      | `#0a0a0a` | Panels / sidebars (`bg-surface`)     |
| `--color-surface-2`    | `#111111` | Cards, inputs, hover wells           |
| `--color-elevated`     | `#161616` | Popovers / active rows               |
| `--color-line`         | `#1c1c1c` | Hairline borders (`border-line`)     |
| `--color-line-strong`  | `#2a2a2a` | Emphasized borders / scrollbar thumb |
| `--color-fg`           | `#ededed` | Primary text (`text-fg`)             |
| `--color-muted`        | `#9a9a9a` | Secondary text (`text-muted`)        |
| `--color-faint`        | `#6b6b6b` | Tertiary / disabled (`text-faint`)   |
| `--color-accent`       | `#6e9bff` | Accent / primary action              |
| `--color-success`      | `#3fb950` | Success / additions / active status  |
| `--color-warning`      | `#d29922` | Warning / idle status                |
| `--color-danger`       | `#f85149` | Errors / deletions                   |

**Contrast / visibility rule:** everything must remain clearly legible on pure
black. Use `text-fg` for primary content, `text-muted` for secondary, and keep
borders at `border-line` (visible but subtle). Never put dark-gray text directly on
black for primary content. When adding a new surface, step up the gray ramp
(`base → surface → surface-2 → elevated`) rather than inventing new hex values.

---

## 4b. App shell layout (floating app shell)

The shell lives in [`src/renderer/app/AppShell.tsx`](src/renderer/app/AppShell.tsx),
composed by [`src/renderer/App.tsx`](src/renderer/App.tsx). It is a **two-layer
floating app shell**: persistent chrome sits on the pure-black root background,
and the workspace floats above it as one detached card:

```
┌──────────────────────────────────────────────────────────────┐
│  TitleBar (root bg, frameless, draggable)  [search][_][□][x]  │
│        ╷ ┌────────────────────────────────────────┐          │
│Sessions│ │ header / conversation / Composer │drawer│  ▐ rail  │
│(root bg)│ │      floating card (bg-surface)        │ (root bg)│
│        ╵ └────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

- **Root background layer** (`bg-base`, borderless): the TitleBar, the Sessions
  sidebar (+ its collapsed rail), and the right `ActivityRail` icon strip. They
  visually merge with the black canvas — architectural, not content.
- **Floating workspace card**: the center column **and the right `ActivityDrawer`
  together** — `bg-surface`, `border-line`, **`rounded-md` (strictly 6px)**,
  `overflow-hidden`, framed by an 8px side gutter and a 16px bottom gutter
  (`px-2 pb-4`, `pt-1` under the title bar) so it never touches the window
  edges. Separation comes from the gutter +
  border + surface step, not shadows (invisible on `#000` anyway).
- The sidebar↔card gutter doubles as the resize grab area (`ResizeHandle ghost`);
  the card↔drawer divider stays a 1px `bg-line` handle **inside** the card, so
  the drawer (and the full-bleed Terminal/Git/Memory panels) carry no `border-l`
  of their own.
- **Left + right columns are full height**; the **Composer lives only inside the
  center column** (it does not span the whole window). Center-column surfaces sit
  on `bg-surface` (the card), not `bg-base` — e.g. the composer fade is
  `from-surface`.
- **Right side = a fixed ~48px icon rail (`ActivityRail`) + a collapsible drawer
  (`ActivityDrawer`)**. Tabs: Files / Changes / Tasks / Activity. Clicking the
  active tab toggles the drawer closed (`activeTab` in the layout store, nullable);
  the center expands when it is closed.
- **Sessions** render as flat **message-style rows** (status dot + title + meta),
  not cards. **Active state is the SEAT plus the TYPOGRAPHY** — `bg-surface-2` and
  a `font-semibold` title — the same convention `DocumentTabs` / `WorktreeTabs`
  use. There is **no accent bar, underline, or coloured strip anywhere in the
  navigation layer**: `SettingsNav`, `ActivityRail`, the Git/Terminal sub-tabs and
  the session list all say "selected" with seat, weight, and accent *icons*. Do
  not reintroduce a strip — a third visual language for one idea is the thing this
  rule exists to prevent.
- **No mock data.** Every region starts EMPTY and renders an `EmptyState` (Phase 1
  has no git/agent yet). Sessions come from `useSessionStore` (empty by default);
  Files/Changes/Tasks/Activity are placeholder empty states until later phases.
- **Diff counts** use the shared `DiffStat` (`+adds` in `text-success`, `-dels` in
  `text-danger`). Change data is modeled as `{ path, status, adds, dels }`.

### Brand / logo

The logo is an organic **pink "blob"** mark (`--color-brand` = `#ff0066`), rendered
as an inline SVG (solid fill, no background, no gradient) via
[`components/brand/Logo.tsx`](src/renderer/components/brand/Logo.tsx). This pink is
the **one intentional exception** to the "no off-palette colors" rule in §4 — it's a
dedicated `--color-brand` token (→ `text-brand`/`fill-brand`) used only for the
brand mark, not for UI chrome (which still uses the blue `--color-accent`). `Logo`
defaults to `tone="brand"` but keeps `accent`/`fg`/`muted` tones for contexts that
need the mark to blend into text.

The OS-level window/tray/app icon is [`assets/icon.png`](assets/icon.png) (512),
`icon@256.png`, and `tray.png` (32), rasterized from the same-shape
[`assets/icon.svg`](assets/icon.svg). Regenerate the runtime PNGs with
`npm run gen:icons` (a cross-platform `sharp` script,
[`scripts/gen-icons.mjs`](scripts/gen-icons.mjs)) after editing the SVG — this
replaces the old `rsvg-convert` one-liner, which isn't available on Windows. The
Windows *installer* art (`.ico`, NSIS sidebar/header BMPs) derives from the same
`icon.svg` via `npm run gen:installer`
([`scripts/gen-installer-assets.mjs`](scripts/gen-installer-assets.mjs)) — also
cross-platform: sharp + resvg rasterize, `opentype.js` outlines the wordmarks from
the vendored Inter TTFs in `assets/installer/fonts/`, and a built-in 24-bit writer
emits the BMP3 files NSIS needs (no rsvg-convert / ImageMagick anywhere).

### Frameless window + the `window.limboo` bridge

The window is **frameless** (`frame: false` in
[`createWindow.ts`](src/main/window/createWindow.ts)); we draw our own title bar.
Dragging uses Tailwind utilities in `styles/index.css`: `drag-region`
(`-webkit-app-region: drag`) on the bar, `no-drag` on every interactive child.

The preload exposes a typed, namespaced API on `window.limboo`:

```ts
window.limboo.window.{minimize,maximize,close,isMaximized,onMaximizedChange}
window.limboo.settings.{getAll,set,reset,onChange}      // persisted prefs
window.limboo.system.{notify,openExternal,clipboardWrite,clipboardRead}
window.limboo.app.getInfo()                             // version/electron/…
window.limboo.events.onCommand(cb)                      // native menu/tray → command
// …plus one namespace per platform service: workspace, session, agent, fs,
// terminal, git, worktree, services, memory, search, resume, updates, voice
// (full surface: docs/reference/window-limboo-api.md)
```

Types flow from `src/preload/index.ts` (`LimbooApi`) into the renderer via
[`src/global.d.ts`](src/global.d.ts). Renderer calls guard with optional chaining
(`window.limboo?.…`) so the UI still renders in a plain browser preview where the
preload is absent.

### State (Zustand) + persistence

Renderer state is split into slice stores under `src/renderer/stores/`:

- `useSettingsStore` — mirrors the main `SettingsManager`; `hydrate()` loads on
  boot, applies appearance (font-scale CSS var, density/reduced-motion attrs),
  seeds the layout store, and subscribes to `settings:changed`. Writes go through
  `window.limboo.settings.set` (write-through).
- `useLayoutStore` — live sidebar widths + open drawer tab; persisted (debounced)
  into `settings.layout`.
- `useSessionStore` — in-memory session list (empty in Phase 1) + selection.
- `useUIStore` — command palette open, active modal, toast queue.

Persistence lives in the **main** process: `SettingsManager`
(`userData/settings.json`, deep-merged with `DEFAULT_SETTINGS`, clamped, migrated)
and `WindowStateManager` (`userData/window-state.json`, restores size/position/
maximized, validated against connected displays).

### Command palette + shortcuts

[`lib/commands.ts`](src/renderer/lib/commands.ts) is the command registry (run on
Zustand `getState()` so they work anywhere). `useKeyboardShortcuts` binds combos
(`Mod` = Cmd/Ctrl), `CommandPalette` (Cmd/Ctrl+K) lists them, and
`useCommandBridge` runs commands dispatched from the native menu/tray via the
`command:invoke` event. To add a command: add it to `COMMANDS`, then (optionally)
add a native menu/tray item that calls `sendCommand(id)` in main.

### Resizing

Both side columns resize via the hand-rolled `useResizable({ edge, getWidth,
setWidth })` hook (no dependency). On handle `mousedown` it attaches
`mousemove`/`mouseup` to `window`, inverts the delta for the right
(`edge: 'right'`) drawer, and pushes the clamped width into `useLayoutStore` (which
persists it). `ResizeHandle` is the 1px divider with a wider hover hit area.

---

## 5. Commands

```bash
npm start              # run the app in dev (Electron + Vite HMR). Renderer on :5173
npm run lint           # eslint over .ts/.tsx
npm run package        # package the app (no installers)
npm run dist           # package + electron-builder → branded installers in dist/
npm run gen:notes      # regenerate the bundled release notes + manifest from CHANGELOG.md
npm run gen:notes -- --check   # CI gate: fail if either generated module has drifted
npm run gen:icons      # regenerate runtime PNG icons from assets/icon.svg
npm run gen:installer  # regenerate Windows installer art (.ico + NSIS BMPs)
npm run gen:appx       # regenerate Microsoft Store (MSIX) tile art
npm run make           # alias for `npm run dist` (Forge has no makers; builds the current-OS installer)
npm run publish        # alias for `npm run dist:publish` (build + upload to the GitHub release feed)
```

There is **no `npm run dev`** — use `npm start` (Electron Forge drives Vite).
Releases: **GitLab is the single source of truth and primary publisher.** Pushing a
`v*` tag triggers the GitLab `release` stage (`.gitlab-ci.yml`), which packages all-OS
installers and publishes the same build to **both** a GitLab Release and a GitHub
Release. The GitHub repo is kept in sync by GitLab push mirroring, and `git push
origin` is configured to fan out to `github.com`, `gitlab.com/BotCoder254/limboo`,
and `bitbucket.org/limboo_/limboo`. GitHub Actions' `release.yml` is a manual fallback
only. **Bitbucket Pipelines** (`bitbucket-pipelines.yml`) mirrors the GitLab pipeline
on the Bitbucket repo via the same `ci/scripts/*.mjs`: CI on every push/PR, and on
`v*` tags a Linux packaging pass that co-publishes the GitHub Release (see
`docs/ci/bitbucket-pipelines.md`). See `docs/ci/release-process.md` and
`docs/ci/gitlab-ci.md`.

One exception to "GitLab builds everything": its SaaS runner fleet has no Intel
macOS, arm64 Linux or arm64 Windows machine, and native modules rule out
cross-compiling. `.github/workflows/release-supplement.yml` fires on the same `v*`
tag, waits for GitLab's release to exist, builds exactly those three, **merges** the
update feeds (`ci/scripts/merge-update-metadata.mjs`) and uploads with `--clobber`.
Merging is not optional — each runner's `latest*.yml` lists only its own artifacts,
so a plain upload would delete an architecture from the feed rather than add one.

**Packaging invariants** (all asserted by `ci/scripts/verify-artifacts.mjs`, all
learned from shipped bugs — see `docs/operations/auto-update.md`):
`--prepackaged` is the **`.app` bundle** on darwin and the **directory** elsewhere;
no target may declare an explicit `arch:` (it overrides the CLI flag and re-wraps
one build under several arch names); the macOS update zip must be rooted at
`Limboo.app/`; and `win.publisherName` must stay unset with
`win.verifyUpdateCodeSignature: false` while Windows signing is self-signed, or
every Windows auto-update fails. Signing lives in Forge, not electron-builder —
`--prepackaged` skips the pack step where electron-builder would sign
(`scripts/signing.cjs`, `docs/ci/code-signing.md`).

Every release also publishes **`release-manifest.json`** — the structured
description of the release the in-app release document renders. Its ordering in
the `secure` stage is load-bearing: `verify-artifacts` → `generate-release-manifest`
→ `make-checksums` → `check-release-manifest`. Generated after the structural gate
(a manifest describing a broken build is a correct description of something that
cannot be installed), before the checksums (so `SHA256SUMS` covers it), and gated
after (so the two are proved to agree). `verify-artifacts.mjs` deliberately does
NOT require it — it runs first. See `docs/ci/release-process.md` §4b.

**Versioning is TAG-DRIVEN — never hand-bump `package.json` before tagging.** Every CI
job that reads the version first runs `ci/scripts/apply-tag-version.mjs`, which stamps the
`v*` tag's version into `package.json` (+ lockfile) at build time, so all artifacts
(`app.getVersion()`, installers, `latest*.yml`) match the tag. The repo's `package.json`
version is just a dev/baseline placeholder. To release: `git tag vX.Y.Z && git push origin vX.Y.Z`.

---

## 6. Conventions for agents working here

- **Respect the process boundary.** New OS-touching capability = add a channel in
  `src/shared/ipc-channels.ts`, a handler in `src/main/ipc/*Handlers.ts` (via the
  `handle()` wrapper), a typed method in `src/preload/index.ts`, then call it from
  the renderer. Do not reach for Node APIs in the renderer.
- **Keep the renderer presentational.** Components hold no business logic; state
  lives in Zustand stores and data crosses via the preload bridge. New domains get
  their own slice store + `features/<domain>/` folder.
- **Theme discipline.** Use tokens (`bg-surface`, `text-muted`, ...). No light mode,
  no hardcoded off-palette colors, no `dark:` variants, no gradients.
- **Tailwind v4.** Add design tokens in the `@theme` block of
  `src/renderer/styles/index.css`, not a config file. Use `@utility` /
  `@custom-variant` in that CSS file if you need custom utilities/variants.
- **Security.** Keep `contextIsolation` on, `nodeIntegration` off, and `sandbox`
  on. Validate all IPC inputs in the main process (handlers already reject bad
  input). A CSP is applied in `src/main/index.ts` (header) with a meta fallback in
  `index.html`. Secrets/API keys should use Electron `safeStorage` (see
  `project.md` §17) — never plain files. **Hardening already in place** (keep it):
  - **Deny-by-default permissions** — `hardenSession()` in
    [`src/main/index.ts`](src/main/index.ts) sets
    `setPermissionRequestHandler`/`setPermissionCheckHandler` to refuse all
    web-platform permissions (camera/mic/geo/USB/…). This is a local app.
  - **IPC sender validation** — the `handle()` wrapper in
    [`src/main/ipc/registry.ts`](src/main/ipc/registry.ts) rejects any message
    whose `senderFrame.origin` is not our own renderer (dev-server origin in dev,
    `file://` in prod). New handlers go through `handle()` and inherit this.
  - **Navigation / webview lockdown** —
    [`src/main/window/createWindow.ts`](src/main/window/createWindow.ts) guards
    `will-navigate` **and** `will-redirect`, denies `setWindowOpenHandler`, and
    blocks `<webview>` via `will-attach-webview`. `webPreferences` pins
    `webSecurity`, `allowRunningInsecureContent: false`, `spellcheck: false`.
  - **Prototype-pollution guard** — `deepMerge` in
    [`SettingsManager.ts`](src/main/managers/SettingsManager.ts) skips
    `__proto__`/`constructor`/`prototype`, and
    [`settingsHandlers.ts`](src/main/ipc/settingsHandlers.ts) rejects any patch
    containing them. **Apply the same guard to every future renderer-supplied
    object that gets merged or used as a key.**
  - **System-handler input caps** —
    [`systemHandlers.ts`](src/main/ipc/systemHandlers.ts) caps URL/clipboard/
    notify lengths and rejects `openExternal` URLs with embedded credentials.
  - **Scoped "always allow"** — a remembered permission choice is keyed
    `sessionId:<risk>` via `rememberKey` in
    [`AgentManager.ts`](src/main/managers/AgentManager.ts), with `sensitive` as
    its own scope. It was keyed `sessionId:remember` for every prompt, so one
    approval on a read granted every later write and shell command **and**
    satisfied the secret-file guard. A remembered grant must only ever widen the
    class the user was actually shown; secret access always needs its own
    consent. This matters more with subagents, whose calls re-enter the same
    gate and would inherit any blanket grant.

  **Contracts for the not-yet-built managers** (§8) — every future agent must follow:
  - **Local DB** (`better-sqlite3`): use **parameterized/bound statements only**;
    never string-concatenate or interpolate values into SQL.
  - **Agent Manager / any outbound `fetch`**: enforce an **SSRF allowlist** — block
    private, loopback, and link-local IP ranges, and do not follow redirects to
    internal hosts. Resolve+check the target before connecting.
  - **Secrets / API keys**: encrypt with Electron `safeStorage`, never plaintext
    files; **redact secrets/tokens** before they reach
    [`logger.ts`](src/main/logger.ts). This is now implemented:
    [`src/main/secrets/SecretStore.ts`](src/main/secrets/SecretStore.ts) is the
    safeStorage-backed store (opaque files under `userData/secrets/`, decrypt
    only at spawn time, names-only logging) — new secrets go through it, and
    `logger.ts` + `AgentManager.redact` already strip `crsr_` / `CURSOR_API_KEY`
    material.
  - **Terminal / Git engines**: spawn with **no `shell: true`** — pass argv arrays
    (`spawn(cmd, [args])`); validate every `cwd`/path stays inside the session
    repo (path-traversal guard) before touching the filesystem.
- **Dependencies.** Pin to versions compatible with **Vite 5 / Electron 42**. After
  installs, sanity-check peer warnings (esp. anything touching Vite).
- **Build-output naming gotcha.** Forge's Vite plugin names each build
  `[name].js` from the entry basename. Both process entries are `index.ts`, so
  they would collide on `index.js`; the output names are pinned in the Vite
  configs — `main.js` via `build.lib.fileName` in
  [`vite.main.config.ts`](vite.main.config.ts), `preload.js` via
  `rollupOptions.output.entryFileNames` in
  [`vite.preload.config.ts`](vite.preload.config.ts). These must match
  `package.json` `main` and the `preload.js` path in `createWindow.ts`. **Don't
  let any new entry collide on basename.**
- **Don't edit** generated output in `.vite/` or `node_modules/`.

---

## 7. Electron + Node APIs available to the main process

Electron (planned usage from `project.md` §17): `BrowserWindow`, `ipcMain`/
`ipcRenderer`, `contextBridge`, `dialog`, `shell`, `Menu`, `globalShortcut`,
`clipboard`, `Notification`, `Tray`, `nativeTheme` (already used to force dark),
`nativeImage`, `safeStorage`, `powerMonitor`, `powerSaveBlocker`, `session`,
`webContents`, `utilityProcess`.

Node core (§18): `fs`/`fs.promises`, `path`, `os`, `child_process` (agent, git,
terminals), `worker_threads`, `events`, `stream`, `crypto`.

---

## 8. Roadmap — current reality

**Phase 1 — Desktop Foundation (DONE).** Multi-process architecture with a typed
IPC layer (`shared/ipc-channels`, `main/ipc/*`, `preload`), frameless window with
custom controls, **window-state persistence** (`WindowStateManager`), **persistent
settings** (`SettingsManager`), **native menu + context menu** (`AppMenuManager`),
**system tray** (`TrayManager`), **desktop notifications** (`NotificationManager`),
single-instance lock, CSP + sandbox, main-process logging + global error handlers,
a React **ErrorBoundary** + **LoadingScreen** hydration gate, **Zustand** stores, a
**command palette** + keyboard shortcuts, the **Orbit** logo/icon, and the
Codex-style shell.

**Phases 2–4 — Platform services (BUILT).** Most managers from `project.md` are now
operational in the **main process**, reached from the renderer via IPC and backing
the real (no-mock) UI. Each owns one responsibility:

- **Local Database** (`db/database.ts`) — `better-sqlite3` at `{userData}/limboo.db`,
  WAL, versioned schema (`WORKSPACE_SCHEMA_VERSION`), idempotent migrations. Bound
  parameters only.
- **Session Manager** (`managers/SessionManager.ts`) — create/list/switch/trash
  sessions; persists transcript + activity per session. Tool calls are runtime
  state and are NOT persisted — `agent_subagent_runs` (schema v17) is the one
  exception, because a subagent row is the only record of a delegation.
- **Workspace Manager** (`managers/WorkspaceManager.ts`) — repos, lifecycle, active
  workspace.
- **Git Engine** (`managers/GitManager.ts` + `managers/git/*`) — status/diff/stage/
  commit/log/branches/tags/blame/fetch/init, lightweight **checkpoints**, and now
  **push / pull** (`git:push` / `git:pull`). Git runs argv-only via `runGit`
  (no shell). Push uses `--force-with-lease` (never bare `--force`) and the user's
  own credential helper / SSH agent — Limboo stores **no** remote credentials, and
  embedded-credential remote URLs are redacted from results/logs. The UI shows an
  ahead/behind pill, an unpushed badge on the Git rail tab, and "publish branch"
  for an untracked branch. Push/pull preferences live under `settings.git.push` /
  `settings.git.pull`.
- **Worktree Manager** (`managers/worktree/WorktreeManager.ts` + `paths.ts` /
  `config.ts`) — first-class **git worktrees per session**: an isolated checkout
  (`{root}/{sha1(repo)[:12]}/{slug}`, default root `{userData}/worktrees`) +
  branch (`{prefix}/{slug}`), provisioned argv-only via `git worktree add`. It
  is the **single resolver of a session's effective execution root**
  (`resolveSessionRoot`/`resolveActiveRoot`, injected into Agent/Terminal/Git/
  Search/FS managers, retargeted on active-session change). Windows-safe
  removal order (services → acked teardown hooks → PTYs → watcher release →
  `git worktree remove` → guarded `fs.rm` fallback), boot-time recovery
  (`repair`+`prune`, `missing` status → Recreate/Detach banner), archive
  teardown/restore, and the **limboo.json ack-hash trust gate** (repo-authored
  commands never run before the workspace acknowledges the exact config hash;
  `worktree:ackConfig` acks without hooks — works for scripts/services-only
  repos and plain sessions). UI: `WorktreeTabs` (editor-style tab strip,
  Ctrl+Tab cycling), `SessionDeleteDialog` (dependency summary),
  `HooksConfirmDialog` (verbatim command approval). Settings under
  `settings.git.worktrees`; bounds in `WORKTREE_LIMITS`.
- **Service Manager** (`managers/services/ServiceManager.ts` + `ProxyServer.ts`)
  — **Scripts & Services** from the repo's `limboo.json`
  (see `docs/reference/limboo-json.md`): on-demand scripts + supervised
  services (auto-assigned 127.0.0.1 port, `PORT`/`LIMBOO_*` + peer-discovery
  env, on-failure restart with backoff capped at `maxRestarts`, stale-exit
  guarded restarts) running as PTYs via the Terminal Engine — the scrollback IS
  the log. Optional loopback reverse proxy maps
  `<service>--<slug>.localhost:<proxyPort>` → the service port (registry
  lookup only; 404 on unknown hosts). Pushes `services:updated`; UI:
  `ServicesStrip` under the session header (status dot, URL, start/stop/
  restart, script run buttons, "Review commands…" when unacked). Settings
  under `settings.git.services`.
- **Terminal Engine** (`managers/TerminalManager.ts`) — `node-pty` sessions,
  pinned to the `1.2.0-beta` line (Microsoft's Node-API rewrite): the bundled
  per-platform prebuilt is ABI-stable across Node.js/Electron, so it never
  needs a `node-gyp` rebuild; `forge.config.ts` excludes it from
  `@electron/rebuild` accordingly. `createForCommand` runs one command in a
  PTY (`origin: 'hook' | 'service'`) with an exit callback; terminal `cwd` is
  the session's effective root.
- **File System Layer** (`managers/FileSystemManager.ts`) — the single gateway
  for workspace file operations: `chokidar` watch + tree index + guarded reads
  (`fs/reader.ts`) **+ guarded writes** (`fs/writer.ts`: atomic write / create
  file / create dir / delete / rename+move / copy — workspace-boundary,
  symlink-escape, and `.git`-segment protected, bounded by `FS_LIMITS`);
  records mutations in the File History ring and pushes live git status into
  sessions. Watcher bursts are batched (`WatchBatch`) so small file changes
  reindex search **incrementally** (`SearchManager.indexFiles`) while
  structural/large batches fall back to a coalesced full pass. The Files tree
  has per-language icons (`renderer/lib/fileIcons.tsx`) and a right-click File
  Writer context menu (`FileTreeMenu.tsx`).
- **Agent Manager** (`managers/AgentManager.ts`) — drives `@anthropic-ai/claude-
  agent-sdk` (plan/implement modes), risk-gated `canUseTool`, path-guarded to the
  workspace, persists transcript/activity/diagnostics, resumes SDK sessions.
- **Attachment Manager** (`managers/attachments/AttachmentManager.ts` +
  `validate.ts`) — ChatGPT-style composer attachments as **session-owned
  workspace resources**: picker/drag-drop/paste files are validated (realpath +
  symlink guard, size/count caps, name sanitize, image magic-byte + NUL sniff,
  elevated-risk extension policy — attaching never executes, archives never
  extracted), streamed-SHA-256-hashed with live progress (`attachment:progress`
  → the composer chip's `CircularProgress` ring), deduped per session by hash,
  staged under `userData/attachments/<sessionId>/`, and recorded in the
  `attachments` table (schema v9; `message_id` NULL = composer draft). The agent
  consumes them tool-first: a per-turn `<attachments>` manifest + SDK
  `additionalDirectories` (this session's staging dir only, read tools only via
  a scoped `canUseTool` carve-out — writes/Bash stay blocked) so Read/Grep pull
  content on demand; raster images additionally ride as base64 vision blocks
  via one-shot streaming input (nativeImage downscale above the threshold). A
  Read of a staged file flips the chip to `read`. Trash keeps staged files
  (restore-safe); purge + a boot orphan sweep delete them. UI: `AttachmentStrip`
  / `AttachmentChip` in the Composer (drop zone + paste + paperclip), read-only
  chips on sent turns, `useAttachmentStore`, Settings › Attachments
  (`settings.attachments`, bounds in `ATTACHMENT_LIMITS`).
- **Memory System** (`managers/memory/MemoryManager.ts`) — the **Local Memory
  System** (see below).
- **Search Engine** (`managers/search/SearchManager.ts`) — the **Search Engine**
  platform service (see below).

### Local Memory System

A provider-independent **platform service owned by the app**, not the agent. It
preserves durable project knowledge across sessions/providers and injects the most
relevant entries into the agent prompt *before* it reaches the harness.

- **Storage** — three tables in `limboo.db`: `memories` (tiered knowledge with
  confidence/usage/status/expiry), `memories_fts` (FTS5 over title+body, kept in
  sync by triggers, for **BM25** keyword retrieval — fully offline, no embeddings
  API), and `memory_links` (back-links to source). `workspace_id` is NULL for
  global/user-scope (e.g. preferences). All access is parameterized.
- **Tiers** — `session < workspace < project < preference < convention < decision
  < solution`, plus manual `note`. Higher tiers outrank lower ones in retrieval.
- **Retrieval + ranking** (`retrieve`) — builds an FTS query from the prompt (+
  active files + branch), then composite-scores candidates by BM25 relevance ×
  recency × confidence × usage × tier weight × pinned/workspace boosts, returns
  top-K within a char budget, and `buildContextBlock` renders a `<project-memory>`
  block appended to the Claude Code system preset in `AgentManager.buildOptions`.
- **Auto-capture** — commits and conversations become **proposals** (`status =
  'proposed'`) that the user accepts/dismisses; policy is `settings.memory`
  (`propose` | `auto` | `off`, with a confidence auto-accept threshold). Never
  injected until `active`.
- **Defaults + maintenance** — `seedDefaults` creates starter memories per
  workspace and for global scope on first run (idempotent, meta-flagged) so the
  Memory panel is populated on install; an hourly `sweep` flags stale, unpinned
  entries (never deletes).
- **UI** — a **Memory** activity tab (`features/memory/MemoryPanel.tsx` + the
  `Brain` rail icon with a proposals badge), backed by `useMemoryStore`, with
  search / tier filters / proposals / inline note composer; settings under the
  **Memory** category.

### Search Engine

A provider-independent **platform service owned by the app** — the single retrieval
interface every subsystem (and the agent) queries instead of rolling its own
lookup. Fully local: no network, no embeddings. It **indexes** the large/expensive
sources itself (files, content, symbols) and **federates** the already-queryable
ones at query time (memory, git, sessions, commands).

- **Storage** — in `limboo.db`: `search_files`(+`search_files_fts`, FTS5 BM25 over
  path+content) and `search_symbols`(+`search_symbols_fts`, FTS5 **trigram** for
  substring/fuzzy on names), plus `search_history` and `saved_searches`. All access
  is parameterized; kept in sync by triggers (mirrors the memory FTS pattern).
- **Indexing** — a bounded, cooperative walk (reuses the guarded `readWorkspaceFile`
  reader + the workspace ignore matcher, never follows symlinks, capped by
  `FS_LIMITS`). Runs on active-workspace activation and re-runs (coalesced) on the
  `FileSystemManager` watcher's change signal. Symbols come from a lightweight,
  regex-based per-language extractor (`search/symbols.ts`) — no parser deps.
- **Retrieval + ranking** — `globalSearch` merges own-index + federated hits into
  ranked, per-source **groups**; ranking fuses BM25 relevance with filename/path
  affinity, symbol exact/prefix matches, and structure weight (source over
  generated). Git federation is cached with a short TTL to avoid spawning `git` per
  keystroke.
- **Agent context provider** — `retrieveContext` + `buildContextBlock` render a
  `<project-context>` block of ranked files/symbols that `AgentManager` appends to
  the Claude Code preset **alongside** the memory block (single `systemPrompt.append`).
  A read-only `limboo_search` MCP server (`search/searchTools.ts`:
  `search_project` / `find_files` / `find_symbols`) lets the agent query the index
  on demand; auto-allowed in `canUseTool`. Search **retrieves/ranks**; the SDK's
  Read/Grep/Glob remain authoritative.
- **UI** — **Global Search** (`features/search/GlobalSearch.tsx`, Cmd/Ctrl+P) is the
  universal command-palette-style entry point; a **Search** activity tab
  (`features/search/SearchPanel.tsx` + the `Search` rail icon) mirrors it with
  filters, recent + saved searches. Backed by `useSearchStore`. Settings live in the
  **Memory & Search** category (`settings.search`).

### Resume Pipeline

A provider-independent **platform service owned by the app** — "continue exactly
where you left off." SDK sessions persist the *conversation* (`options.resume`),
not repository state; this service reconciles the two. Owned entirely by the main
process (`managers/resume/ResumeManager.ts` + `resume/delta.ts`), wired in the
composition root like Memory/Search (setter injection + a *separate additive*
`sessions.onActiveChanged` listener, so the existing retarget path is untouched;
boot revalidation chains after `worktrees.recover().finally(retarget)`).

- **Snapshots** (`session_snapshots`, schema v10) — one repository anchor per
  session (HEAD + branch + a `dirty_hash` = sha256 over sorted
  `status\0path\0size\0mtimeMs`, computed via `fs.lstat`, never reading file
  contents), upserted at run-end (`AgentManager.send` finally →
  `onRunFinished`), checkpoint creation (`GitManager.createCheckpoint` →
  `onCheckpointCreated`), and session deactivation.
- **Revalidation** — on every activation + boot, async/best-effort, `Promise.race`
  against `RESUME_LIMITS.revalidateTimeoutMs`; failures degrade to "no delta" and
  **never block session switching**. Cheap short-circuit when HEAD + branch +
  dirty-hash all match the snapshot (the common case).
- **Repository delta** (`resume/delta.ts`, argv-only via `runGit`; snap HEAD
  regex-validated) — `cat-file -e`/`merge-base --is-ancestor` (rebase/gc →
  `historyRewritten`), `rev-list --count` both ways, capped `git log`, `git diff
  --name-status -z` (reuses `parseNameStatus`) merged with the dirty set,
  categorized (manifest/lockfiles/**limboo.json**/migrations flagged). Persisted
  in `resume_deltas` so the one-shot injection survives a restart.
- **Code-intelligence enrichment** — reuses the Search index: `search_files.content_hash`
  (schema v11) skips unchanged files in incremental indexing; per-file symbol
  adds/removes are diffed across a reindex; the new `search_refs` regex import-edge
  table (`search/refs.ts`, parser-agnostic for a future tree-sitter upgrade) powers
  "N files import X". No tree-sitter, no embeddings.
- **Memory revalidation** — `create`/`acceptProposal` now write `memory_links`
  (`kind='file'`/`'symbol'`); on revalidation, memories whose linked files vanished
  have confidence downgraded (×0.6, floor 0.1; `preDowngradeConfidence` stashed in
  `meta`) and restored when the file returns. Retrieval already weights confidence.
- **Injection** — `AgentManager.resumeContextFor` is the third context producer
  beside memory/search: renders a `<repository-delta>` block (budgeted like the
  others), one-shot per delta (marks the row `injected`), cached on the run record
  so recovery retries re-inject the same block.
- **UI** — `ResumeBanner` (MissingWorktreeBanner idiom) + a "Revalidating…" header
  chip + `ResumeDeltaDialog` (HooksConfirmDialog idiom), backed by `useResumeStore`;
  results also land in the timeline via `AgentManager.recordStatus`. IPC:
  `resume:getState/getDelta/dismiss/revalidate` (string session ids only; revalidate
  gated to the active session) + `resume:state-changed`. Settings under the **Memory
  & Search** category (`settings.resume`, bounds in `RESUME_LIMITS`).

### Work Graph (DAWG)

A provider-independent **platform service owned by the app** — the fourth peer
of Memory, Search, and Resume. Neither Claude nor Cursor exposes a work graph
(both are conversation-driven), but both emit enough structure — tool calls,
plans, file edits, shell runs, MCP calls, results — for the host to derive one.
This subsystem normalizes BOTH adapters' event streams into a single typed,
queryable **Directed Acyclic Work Graph**, so every future adapter contributes
nodes for free. Full doc: `docs/architecture/subsystems/work-graph.md`.

- **Storage** — `work_graph_nodes` / `work_graph_edges` (+ `work_graph_nodes_fts`,
  FTS5 BM25 over title+detail) in `limboo.db`, schema v15. Unique `(src,dst,kind)`
  makes re-emitting an edge idempotent; `ON DELETE CASCADE` + a ring cap per
  session bound growth. Bound parameters only.
- **Vocabulary** — 15 node kinds (objective, planning, task, subagent,
  investigation, search, memory, mcp, terminal, git, file, approval, artifact,
  completion, service) and 9 edge kinds: the spine (`follows`, `contains`) plus
  the semantic set (`generated`, `depends-on`, `implemented-in`, `verified-by`,
  `blocked-by`, `reviewed-by`, `produced-artifact`). `derived: true` is the
  honesty valve — inferred edges render dashed and filter separately.
- **Ingestion** — `builder.ts` is a **pure reducer** (no DB, no IPC, no clock).
  `AgentManager.onEvent()` is the only load-bearing source; the platform
  services (`git`/`memory`/`fs`/`services`/`terminal`/`worktree`/`resume`/
  `attachments`) attach via narrow setter-injected sinks in the composition
  root. **Permission decisions come from `AgentManager.decideToolUse`** — the
  one gate both providers call — so approvals are provider-neutral by
  construction; only denials and prompted approvals become nodes.
  **Subagent nesting** rides the Agent SDK's `parent_tool_use_id`
  (`AgentToolCall.parentCallId`) → `contains`. Provider and mode are captured
  **per run**, never read from current settings.
- **Every failure is swallowed** so the graph can never break a run — and is
  therefore surfaced as `WorkGraphHealth` on the snapshot/push, so a graph that
  stopped recording never looks like a quiet session.
- **Export** — six data formats in main (JSON, Markdown, Mermaid, DOT, CSV,
  self-contained HTML) plus SVG/PNG rendered **offscreen from the full layout**
  in the renderer. `graph:save` is the subsystem's only filesystem write and the
  renderer never supplies a path: main opens `dialog.showSaveDialog` and writes
  where the user chose.
- **UI** — a full-bleed drawer panel (`features/graph/`) reached from the
  TitleBar tab strip, deliberately shaped like a **git history** (vertical lanes,
  one node per row, commits in a right-hand gutter) rather than a node editor.
  Layout runs in a Web Worker; rows virtualize above
  `settings.graph.virtualizeThreshold`. Settings under the **Work Graph**
  category (`settings.graph`, bounds in `GRAPH_LIMITS`).

### Runtime Telemetry

A provider-neutral **platform service owned by the app** — the fifth peer of
Memory, Search, Resume and the Work Graph. Full doc:
`docs/architecture/subsystems/runtime-telemetry.md`.

- **Capabilities, not provider branches.** `PROVIDER_CAPABILITIES` /
  `CAPABILITY_NOTE` (`src/shared/runtime.ts`) are stamped onto every
  `RuntimeSnapshot` by MAIN. The renderer reads `snapshot.capabilities` and
  `snapshot.notes` and **never the provider id**, so a section hides itself
  (with the provider's own reason) when the adapter cannot measure it. Both
  tables are **main-only** — importing either into `src/renderer/**` is the
  mistake to catch in review.
- **Cursor reports nothing quantitative but `result.duration_ms`.** Token counts
  in `--output-format stream-json` are an open Cursor feature request, not
  shipped, and request quotas exist only in the team-scoped Enterprise Admin API
  (`api.cursor.com`) — a network call this app deliberately does not make. Those
  sections render **"not reported by this provider"**, never a zero.
- **`AgentManager` only OBSERVES AND FORWARDS.** Capture rides a narrow
  setter-injected `RuntimeSink`, not a new `AgentEvent`: the sources fire per API
  request, per delta frame and per tool heartbeat, and `AgentEvent` is frozen.
  `telemetry/claudeSignals.ts` translates the wire format (the
  `cursor/translate.ts` idiom); `telemetry/accumulator.ts` is a **pure reducer**
  (no DB, no IPC, no clock — the `graph/builder.ts` contract).
- **Three correctness rules, all in the accumulator.** (1) Deduplicate
  `message_start` by `message.id` — parallel tool calls repeat one id with
  identical usage, which Anthropic documents, and counting each multiplies the
  gauge by the fan-out. (2) A subagent's frames (`parent_tool_use_id`) never
  touch the parent's gauge; run totals come from `modelUsage` (includes
  subagents), never the flat `usage` (excludes them). (3) The measured total is
  the authority and estimates fill in beneath it.
- **Measured vs estimated is visible.** The total, the window
  (`modelUsage[model].contextWindow` — so there is **no hardcoded model table**,
  and none may be added) and the reservation are measured; the per-contributor
  split is Limboo counting characters of blocks IT composed, divided by a
  constant, and is labelled `~` everywhere. When the estimates exceed the
  measured total the split is **dropped, not scaled** (`attributionDegraded`).
- **No denominator → INDETERMINATE, never 0%.** `contextWindow` arrives only on
  the result message. "Not measured yet" and "empty" are opposite claims and
  must not look alike. `telemetry_model_limits` persists it so the state is brief.
- **`total_cost_usd` is a client-side estimate** from the SDK's bundled price
  table (Anthropic's docs say so, and say not to bill from it). The field is
  named `costEstimateUsd`; the UI always says "estimated".
- **Storage is the redaction policy** (schema v18): `telemetry_usage_samples`,
  `telemetry_model_limits`, `telemetry_run_rollups` have **no column** that can
  hold a prompt, path, tool input or title — so an export cannot leak
  conversation data. Exports are built field-by-field from a whitelist.
- **The ring** mounts in the composer footer's `ml-auto` cluster and introduces
  **no `overflow-x`** (that row's popovers open upward and any overflow clips
  them); the card opens upward too. It renders **nothing** when telemetry is
  off, and otherwise is always present: a session with no run yet gets an **idle
  snapshot** (capabilities + environment, no `context`, no `run`) so the ring is
  discoverable from the start instead of appearing mid-session. That snapshot's
  provider is read from the SELECTED model — the one settings read in this
  subsystem, valid only because there is no run to attribute yet.
  `components/ui/HoverCard.tsx` is the app's first shared popover primitive —
  hand-rolled on the `ComposerControls` idiom, no new dependency.
- **The inspector's height cap is structural, not taste.** It is absolutely
  positioned inside the composer footer, inside the `overflow-hidden` floating
  workspace card — a tall panel is CLIPPED, not overflowed. Hence
  `max-h-[min(52vh,420px)]` and no standing footer disclaimer (the `~` on every
  estimate travels with the number instead). **Do not add a footer paragraph.**
- **The card shows the context window and NOTHING else.** It used to carry four
  collapsible sections in a persisted order; three were chrome — *Request usage*
  and *Long-term usage* render "not reported" on any adapter that does not
  publish quotas, and *Execution* was a nineteen-row dump behind a header
  collapsed by default — and all three pushed the card against the cap above.
  So there is no section header, no chevron, no `sectionOrder` and no
  `collapsedSections` (`SETTINGS_VERSION` 26 removed them, with
  `showCostEstimate` / `showHistory` / `warnQuotaPct` and `ringMetric: 'quota'`).
  **Do not reintroduce a section.** Collection is untouched: main still ingests
  and stores quota windows, run rollups and history, and the Work Graph's Stats
  tab plus the telemetry export are where those numbers are read.
- **Throttled + watch-gated**: coalesced per session with a monotonic `seq`; with
  nothing watching, main keeps ingesting but pushes only at run boundaries. The
  idle tick re-renders countdowns and **polls no provider**. The watch signal is
  a **`Set` keyed by `webContents.id`, never a counter** — main retires an entry
  on `destroyed`/`did-start-navigation`, because a counter only the renderer can
  decrement is pinned at full push rate by any window that reloads or crashes
  mid-hover.
- **Nothing leaves main un-narrowed.** `worktree.path` falls back to its
  BASENAME whenever relativizing escapes the workspace (the default worktree
  root is `{userData}/worktrees`, so it usually does); `health.lastError` — the
  subsystem's one free string — runs through the logger's own `redactSecrets`
  and then has paths collapsed; `providerSessionId` renders truncated with no
  full-value tooltip. Injected memory/search counts are the **measured**
  `hits.length` from the producers, never `maxInjected`, which is a ceiling.
- Settings live at **`settings.runtime`** (top-level peer of `settings.graph` —
  it is a platform service, not provider config) with the UI under Settings ›
  Agent › Runtime Indicators. `TELEMETRY_LIMITS`, `SETTINGS_VERSION` 25.
  `persist: false` is the enterprise switch and is genuinely off: it stops writes
  AND empties history reads.
- **The Work Graph joins it by `runId` only** — `graph:runStats` and
  `settings.graph.exportTelemetry`. One-directional (the graph reads telemetry,
  never the reverse), and only numbers cross, never telemetry text. The graph
  also gained `ndjson`/`graphml`/`puml` exports, `exportScope: 'selection'`, and
  `graph:saveBatch` (main owns the directory, as it owns the path in `save`).

### The conversation timeline: message actions + conversation revert

Every turn in the stream is actionable, and Plan Mode has exactly two surfaces.
All of it is provider-neutral — nothing below reads which adapter produced the
message.

- **Message actions** (`features/workspace/MessageActions.tsx`) — an icon-only
  toolbar on the **user turn only**, revealed by `group-hover` **and**
  `focus-within` (a toolbar reachable only by mouse is not reachable). Copy,
  Copy as Markdown, Quote, Reference in Prompt, Select Text, View Raw, Export,
  Open in New Session, Pin to Memory, Regenerate, Revert. Active state is the
  **accent icon**, never a strip (§4b).
  - **There is no toolbar in the assistant stream, and none may be added.** A
    reply is not one document: it arrives as several text blocks split by tool
    calls, so a per-block toolbar meant several per answer — each reserving a
    row of layout (they hide with `opacity`, not `display`) and cutting a
    continuous stream into separately-framed cards. The prompt is the turn's one
    stable anchor and carries its actions. Export is therefore **turn-scoped**:
    `TurnView` hands `UserBubble` the turn's `replies` alongside `toolCalls`, and
    `turnToMarkdown` writes prompt + replies + tools as one document. Copy and
    Copy as Markdown stay **message-scoped** — their labels say "Copy", and
    widening them to a whole turn would make them a different button. Copying a
    reply is served by `CodeBlock`'s own `CopyButton`.
  - **`AssistantBlock`'s content column is `gap-1.5`** — the single class
    governing the distance between every consecutive assistant sub-item (text,
    tool group, marker, subagent row, trailing status). Deliberately tight: the
    larger spacing lives on turn boundaries (`gap-4` within a turn, `gap-6`
    between turns), so the reply itself reads as one continuous stream.
  - **`ChatMessage.text` is already Markdown** — both providers stream Markdown
    source and the renderer only ever parses it for display. So
    `lib/messageMarkdown.ts` returns the SOURCE; it never serializes rendered
    DOM back into Markdown, which is where this feature usually loses fence
    languages and table alignment. Every copy reads `message.text` **at click
    time**, so copying mid-stream captures what has arrived. Clipboard goes
    through `system.clipboardWrite` (capped in `systemHandlers.ts`), never
    `navigator.clipboard`.
  - `CopyButton` lives in `components/ui` — one implementation, re-exported by
    the release document's `parts.tsx`. `downloadText`/`slugify` likewise moved
    to `lib/download.ts`.
  - The composer draft lives in **`stores/useComposerStore.ts`**, not local
    state, because Quote / Reference / Open-in-New-Session all write into it
    from outside the composer's subtree. Drafts are per-session and deliberately
    **not persisted**.
  - `TurnView`'s memo comparator identity-checks `onRevertTurn`, so the owner
    MUST pass a `useCallback`. An inline arrow re-renders every settled turn on
    every streaming delta.
- **Conversation revert** — a SESSION-level rollback, not a git revert.
  `AgentManager.revertToMessage` restores the checkpoint guarding the turn,
  truncates `agent_messages` / `agent_activity` after it, and deletes the
  `agent_provider_sessions` row so the next prompt opens a conversation that
  matches the repository again (one delete covers Claude and Cursor — the table
  is provider-keyed). **Nothing is erased from the audit trail**: checkpoints
  survive, and the revert is recorded as a new immutable timeline entry.
  - The unlock was already in the schema: `git_checkpoints.message_id` was
    plumbed end-to-end and never populated. `ActiveRun.userMessageId` now rides
    onto the automatic pre-write checkpoint, and
    `GitManager.checkpointForMessage` resolves it (falling back to the newest
    checkpoint at-or-before the turn).
  - **`GitManager.restoreCheckpoint` is a TRUE tree reset.** `git restore
    --source` rewinds paths that exist in the checkpoint and says nothing about
    paths that do not, so files the agent CREATED survived every restore. Those
    are computed with `diff --diff-filter=A` and removed — each re-validated
    through `assertInsideRepo` before it is unlinked. **Never `git clean -fdx`**:
    clean would also destroy untracked files predating the checkpoint and every
    ignored build dir. It returns `CheckpointRestoreResult`, not a boolean.
  - IPC (`agent:revertPreview` / `agent:revertToMessage`) takes **ids only** —
    no path, ref, or commit crosses the boundary, so there is nothing to spread
    and no blast radius the renderer can choose. Preview measures against the
    same diff the restore acts on; it never estimates. Refused while a run is
    live, and refused outright when no checkpoint guards the turn.
- **Plan Mode has two surfaces, and they divide by job**:
  - `features/plan/PlanInline.tsx` — the STREAM. Rows at the stream's own
    typographic weight, never a card: **Live Planning Progress** while the agent
    reads (milestones DERIVED from the run's tool calls in
    `features/plan/milestones.ts` — no new event kind, so both providers get it
    free), a one-line proposal + inline approval when a plan is `ready`, and a
    single settled line after that.
  - `features/activity/PlanPanel.tsx` — the Tasks drawer, and the canonical
    execution surface after approval. Exactly two sections: **Implementation
    plan** and **Live progress**. The derived phase/task outline is gone — it
    restated the plan above it, and its fuzzy match against live todos was lossy
    enough that "Live progress" existed as its fallback. The checklist is now the
    section, and the toolbar's search/filter operate on it.
  - `ApprovalControls` in `features/plan/parts.tsx` is shared, with a
    presentation-only `variant` — both surfaces run one approve path.
  - **One loader.** `HelixLoader` is the in-flight indicator everywhere: the
    generating row, the planning placeholder, the plan header, the per-task
    marks. Do not reintroduce `Spinner`/`Loader2` in a plan surface, and there is
    no large "Execution complete" checkmark banner.
  - **A prompt Limboo composes is not a prompt the user typed.** `send()`
    persists and broadcasts EVERY prompt as a visible user turn, and `UserBubble`
    renders text verbatim — so approving a plan echoed the whole document plus
    its `<approved-plan>` tags into the transcript as raw Markdown. Orchestration
    prompts now carry **`ChatMessage.display`** (`{ text, body? }`): the line to
    show and an optional rendered body. It is a **renderer hint only** — it never
    changes what reaches the provider, the raw toggle still reveals the true sent
    text, and `autoTitle` skips these turns so a session is never named after
    Limboo's own action. Persisted in `agent_messages.display`
    (`addColumnIfMissing`; NULL for every ordinary prompt).

### Subagents: the stream is the only orchestration surface

Full doc: `docs/architecture/subsystems/subagents.md`.

A delegation renders as **one inline row** in the conversation
(`features/workspace/SubagentActivity.tsx`) — stages while it runs, a single
line with `duration · N tools` once it settles, expanding into an execution
record and the worker's returned summary. **There is no permanent subagent
panel, and none may be added**: both providers run a subagent in its own context
window and return only a distilled result, so a standing surface would duplicate
the timeline and the Tasks drawer and would imply access to reasoning neither
provider exposes. Completion links out to surfaces that already exist (a diff via
`promote`, the Work Graph via `revealInGraph`).

A **transient maximized tab** is a different claim and is supported:
`{ kind: 'subagent', callId, title }` is a `DocumentRef`, rendered by
`SubagentWorkspace.tsx`. Both shells sit over the shared presenters in
`subagentParts.tsx` (the `DiffView`/`DiffWorkspace` split) — **density is the
only thing they vary**. Presentation state rides a parallel
`subagentViewCache` (never widen `viewCache`'s union), and the tab is not
persisted, like release notes.

**Rows are never cards.** Multi-paragraph prose — a returned summary, a
transcript, an approved plan — renders in a `ProseCard`, which supplies the
disclosure, the clamp (fade + "Show more", never a nested scroller) and one
consistent size. Its `variant` decides the border, and the rule is: a container
earns a border when it separates a document from **unrelated** content (the
approved plan in a user turn → `card`); it does not when everything around it is
the same document (a subagent's transcript and summary sit among `validation` /
`files changed` / `tool calls` → `bare`). Long tool lists collapse
(`TOOL_LIST_AUTO_COLLAPSE`, evaluated at mount so a live run stays open).

- **The spawning tool has TWO names.** Claude Code renamed `Task` to `Agent` in
  v2.1.63; current SDKs emit `Agent` in `tool_use` blocks but still say `Task` in
  `system:init` and `permission_denials[].tool_name`. `src/shared/subagents.ts`
  (`isSubagentTool`) is the single answer for main **and** the renderer. **Never
  test `name === 'Task'`** — that is exactly what made the Work Graph's
  `subagent` node kind unreachable on every current release.
- **`parentCallId` is the only nesting signal** (the SDK's `parent_tool_use_id`,
  on complete messages only — it is always `null` on partial stream events).
  `streamToolCalls` in `ConversationView` removes a worker's calls from the
  stream across the WHOLE snapshot, never per turn: a worker still running when
  the user sends the next prompt has its later calls land in the next turn, and a
  per-turn spawn set would leak them as top-level rows.
- **`handleMessage` MUST read `parent_tool_use_id` before finalizing assistant
  text.** With `forwardSubagentText` on, the SDK forwards a worker's narration as
  assistant messages carrying that id; finalizing first spliced it into the
  parent transcript *and persisted it*. Worker text goes to
  `SubagentInfo.transcript` and nowhere else.
- **Prefer the SDK's own telemetry to derivation.** `onTaskMessage` consumes
  `task_started`/`task_progress`/`task_updated`/`task_notification`, joined by
  **`tool_use_id`** (never array position), for measured `duration_ms` /
  `tool_uses` / `total_tokens` and the provider's own progress line. Honour
  `skip_transcript: true` — those tasks render no row. Both opt-ins default OFF
  in the SDK and map to `agent.subagents.{forwardText,progressSummaries}`.
- **Stages are DERIVED** as the fallback tier (`subagentStages.ts`) — the
  `plan/milestones.ts` technique, so a provider that reports nothing (Cursor,
  summaries off) still shows progress. A stage is active only while one of its
  tools is genuinely `running`.
- **Counters live on the spawning call** (`SubagentInfo`), rolled up in main and
  carried by re-emitting `tool-start` — the only event holding a whole call.
  Every roll-up failure is swallowed: observability must never break a run.
- **Subagent rows are PERSISTED** (`agent_subagent_runs`, schema v17) even though
  ordinary tool calls are not — the row is the only record of a delegation, and
  without it the Work Graph remembered a worker the transcript had forgotten. A
  run still `running` at load rehydrates as errored, never as a spinning row.
- **Omit what was not measured.** A field the provider did not report is left
  out, not defaulted — the same rule the release document follows. There is
  deliberately no `worktree` field: `isolation: worktree` is managed internally
  by Claude Code and never reported, and the session root is not the worker's.
- **Attribution refuses to guess.** `subagentOwningPrompt` resolves a permission
  prompt's owner from a sole live worker, or from `task_progress.last_tool_name`
  under concurrency. Ambiguous → undefined, and the dialog renders as it would
  without subagents.
- **Cursor degrades to nothing.** Its stream carries no parent linkage, so a
  Cursor run renders flat. `subagentStart`/`subagentStop` are registered
  `observeOnly` — never a gate (Cursor treats `ask` there as a deny) and never a
  nesting source (all four id fields carry the same session id). The
  `observeOnly` branch returns immediately, so anything mapped there must record
  explicitly or it is dead code; these emit onto the governance bus.
- **The transcript is untrusted content** — bounded by `transcriptMax`, rendered
  as data, never merged into a system prompt. `buildOptions` still has exactly
  three context producers (memory, search, resume).
- Settings live under `agent.subagents` (`SUBAGENT_LIMITS`, `SETTINGS_VERSION`
  24). Completion links reuse `useDocumentStore.promote` and `revealInGraph`;
  there is **no task link** (`TaskItem` has index-derived ids and no timestamps,
  so a settled worker's task is not recoverable — do not fabricate it).

### Workspace Documents + the Diff Review environment

The center column is no longer a single view. It hosts **workspace documents**:
the conversation plus any number of promoted diff reviews, each an editor-style
tab carrying the **file's own icon** (`renderer/lib/fileIcons.tsx`).

- **Store** — `renderer/stores/useDocumentStore.ts`, scoped `bySession` (switching
  a worktree tab swaps the whole document strip). `viewCache` lives **outside**
  `bySession`, keyed by `DocumentId`: `minimize()` drops the tab but never the
  cached `DiffViewState`, and the compact preview in the navigator reads/writes
  that **same record**. Folds, layout, scroll offset, and comparison mode survive
  a maximize→minimize round-trip because both renderers share one object — not
  because anything copies state between them. Don't "optimize" that apart.
- **Tabs** — `features/workspace/DocumentTabs.tsx`, a SEPARATE strip stacked under
  `WorktreeTabs` (a worktree tab means "which environment"; a document tab means
  "what am I looking at inside it" — closing them means different things). Both
  strips self-hide, so a workspace that never opens a diff renders exactly as
  before. Pin / drag-reorder (native DnD) / middle-click-close / reopen stack.
- **Persistence** — only the tab SET, in `settings.layout.documents`
  (`DOCUMENT_LIMITS`, `SETTINGS_VERSION` 21), rebuilt field-by-field in
  `SettingsManager.normalize` so a renderer-authored entry can't smuggle extra
  keys. `DiffViewState` is deliberately NOT persisted: restoring a scroll offset
  into a diff whose shape changed while the app was closed is worse than not.
- **Renderer** — `features/git/diff/`: `rows.ts` (row model; split view is paired
  from the SAME unified hunks — no second `git diff`), `DiffEditor.tsx` (CSS grid,
  not `<table>`, because sticky hunk headers need it; O(1) windowing above
  `DIFF_LIMITS.virtualizeThreshold`, which is why rows must stay uniform-height —
  **do not add word wrap**), `useDiffTokens.ts` + `highlightLines()` in
  `lib/highlight.ts` (Shiki `codeToTokensBase` on the SAME JS-engine singleton, so
  the packaged-CSP constraint is inherited). Highlighting tokenizes **two
  pseudo-documents** (old = context+del, new = context+add) rather than each line,
  or multi-line strings and JSX mis-color. `lib/wordDiff.ts` bails to a whole-line
  tint above `wordDiffMaxTokens` (the LCS is O(n·m); a minified line would freeze
  the window). The compact `DiffView` passes `highlight={false}` — the navigator
  keeps its synchronous cost profile.
- **Navigator** — `features/git/ChangesNavigator.tsx`, shared by the Git workspace
  and the Changes drawer panel. Grouping is limited to what the data supports
  (directory / change type / stage / agent-origin); **group-by repo, worktree, or
  branch is absent on purpose** — `GitStatus` is one resolved root at a time.
  There is no "changed by me" filter, and no "origin: user" badge: nothing records
  user authorship, and the agent having no record of a file is not evidence of it.
- **Patches come from git, never from `GitFileDiff`** — `parseUnifiedDiff` drops
  the `diff --git`/`index`/`---`/rename/mode preamble, so a reconstructed patch
  would not apply. `git:patchText` / `git:patchSave` re-read it (main owns the
  save dialog; the renderer never supplies a path — the `graph:save` contract).

### The Release document

The third document kind (beside the conversation and diff reviews) is a
**release** — `{ kind: 'release-notes', version }`, rendered by
`features/updates/ReleaseNotesDocument.tsx` over `features/updates/release/`.
It opens once when the running version differs from
`settings.updates.lastSeenVersion`, and closing the tab is the acknowledgement
(detected as an open→closed transition, so every route to closing it counts).
Full lifecycle: `docs/operations/auto-update.md`.

- **`CHANGELOG.md` is the single source.** `npm run gen:notes`
  (`scripts/gen-release-notes.mjs`) writes two COMMITTED modules from it —
  `releaseNotes.generated.ts` (Markdown, the fallback and the export source) and
  `releaseManifest.generated.ts` (structured, typed by hand-written
  `src/shared/release.ts`). CI's `embed-release-manifest.mjs` stamps the
  git-derived half in at package time, the way `apply-tag-version.mjs` stamps the
  version; `generate-release-manifest.mjs` publishes the superset as
  `dist/release-manifest.json`, before `make-checksums.mjs` so `SHA256SUMS`
  covers it. `check-release-manifest.mjs` then proves the two agree, and
  `gen:notes --check` gates drift.
- **Compiled in, never fetched.** Production CSP is `connect-src 'self';
  img-src 'self' data:` — there is no runtime network path. Manifest URLs are
  screened by `isForgeUrl` before becoming links, then opened via
  `system.openExternal`.
- **Contributor identity is resolved at BUILD time, never at runtime.**
  `ci/scripts/lib/forgeProfiles.mjs` (called from `embed-release-manifest.mjs`)
  asks the GitHub compare API who each commit email belongs to — git alone can
  only recover a handle from a `noreply` address — then downloads the 48px
  avatar and embeds it as a `data:` URI. `data:` is already inside `img-src`, so
  **real avatars cost no CSP change**; do not widen `img-src` to load one live.
  The module is https-only, host-allowlisted (`api.github.com`,
  `avatars.githubusercontent.com`), follows redirects MANUALLY so every hop is
  re-screened, caps the body, and sniffs magic bytes rather than trusting
  `content-type`. **Every failure is swallowed** — no token, rate limit, offline
  runner — and the entry keeps its git-derived name with `avatar: null`, which
  the renderer draws as a `Monogram`. Commit emails stay lookup keys and never
  reach the manifest. `isEmbeddedAvatar` in `src/shared/release.ts` re-screens
  the value before it reaches an `<img src>`: manifest data is data, even when
  the file it arrived in is ours.
- **The release document has no badges and no decorative icons.** Status reads
  as words ("Stable", "Running now", "Windows: self-signed"); category sections
  are identified by their `RELEASE_CATEGORY_LABEL` name alone, with consequence
  carried by `RELEASE_CATEGORY_ORDER` rather than by colour or glyph — order
  survives a screenshot, colour-blindness, and the Markdown export. There is no
  `Pill` primitive and `ReleaseSectionCard` has no icon slot. The only glyphs
  left are the fold chevron and controls whose entire content is the icon
  (`CopyButton`, the toolbar buttons, compare/clear). **Do not reintroduce a
  pill or a leading glyph** for a label that already says the same thing.
- **A build cannot contain its own installer hash**, so `assets`/`signing` are
  empty in the bundled manifest and present only in the published one. The
  document shows the verification commands instead of a digest it cannot stand
  behind, and keeps release-side claims visually apart from `update:getBuildInfo`
  measurements of the running process. **Do not "fill in" those fields.**
- **Display-only, but agent-reachable.** The document never feeds a context
  provider (`AgentManager.buildOptions` still has exactly three producers). The
  agent answers version questions through `list_releases` / `release_notes`,
  read-only plain tools on the existing `limboo_search` server — so both
  providers get them, and nothing is pushed into a system prompt. Release notes
  also federate into `SearchManager.globalSearch` as the `release` kind (no
  index: the corpus cannot change while the process runs).
- **Tab convention.** A release tab renders its LABEL ONLY — no icon. Active
  state across `DocumentTabs` and `WorktreeTabs` is the `bg-surface-2` seat plus
  a `font-semibold` label; the accent underline is gone from both. `font-medium`
  still means *pinned* in `DocumentTabs`, and `text-accent` on `WorktreeTabs`'
  `GitBranch` still means *has a worktree* — neither may be reused for selection.

**Ref naming** lives in `src/shared/refName.ts` — one rule table, enforced in main
(`managers/git/refs.ts`: `sanitizeRef` for any ref, `sanitizeBranchName` for ones
being CREATED) and re-used by the renderer to validate before IPC. It matches
`git check-ref-format` exactly (verified by fuzzing against the real binary): use
an explicit ASCII class, **never JS `\s`** — `\s` matches NBSP/BOM/U+3000, which
git accepts, and misses C0 controls and DEL, which it does not.

### Agent Adapter Architecture (multi-agent: Claude + Cursor) — IN PROGRESS

**Build-order items (1) Authentication, (2) Runtime, (3) Permissions,
(4) Context injection, (5) MCP reuse, and (6) Worktrees are ALL BUILT; Cloud
Agents / ACP remain planned.** Limboo is evolving from "a Claude integration" into a
multi-agent orchestration platform via an **Agent Adapter Architecture**: a thin
translation layer per agent runtime, with **nothing above the adapters changing**.
The UI never knows which agent is running — it only knows "the current session has
an active coding agent". Full research/design doc:
[`docs/agents/cursor-integration.txt`](docs/agents/cursor-integration.txt).

- **The seam is narrow and now dual-use.** Claude coupling is concentrated in
  `AgentManager.ts`; the `AgentEvent`/`AgentState`/`PermissionRequest` types, all
  agent IPC channels, the preload namespace, `useAgentStore`, and the
  Composer/permission/plan/timeline UI are provider-neutral and stay frozen. The
  adapter seam covers exactly: executable/auth detection
  (`probeHealth`), run invocation (`run(spec) → AsyncIterable<AdapterEvent>`),
  per-provider options mapping (`buildOptions`), wire-format → `AgentEvent`
  translation (`handleMessage`), tool-identity/permission gating (`makeCanUseTool`
  tool-name sets, plan-capture style), resume-token get/set
  (`agent_provider_sessions`), error classification (`classifyAgentError`), and
  utility one-shots (`buildUtilityOptions`).
- **BUILT — build-order item (2), Runtime (CLI print mode, safe posture).**
  Cursor is a selectable running agent: picking a Composer model in the model
  picker routes runs through the print-mode runtime (the provider follows the
  model — `providerForModel()`).
  - `src/main/managers/cursor/CursorRuntime.ts` — spawns `cursor-agent --print
    --output-format stream-json --stream-partial-output --workspace <sessionRoot>`
    (argv-only; prompt rides **stdin**, never argv; env composed at spawn time
    from `getSpawnEnv()`); `--trust` only via the injected repo-trust resolver
    (limboo.json absent or ack-hash acked); never Cursor's `-w`. Stop =
    process-tree kill (win32 `taskkill /T /F`, posix TERM→KILL) off the same
    AbortController; `dispose()` on quit. Runtime refuses `.cmd` shims
    (`CursorShimError` in `exec.ts` — the ComSpec whitelist stays literal-only).
  - `stream.ts` (bounded NDJSON reader, oversized lines dropped), `translate.ts`
    (delta/buffered/final-flush disambiguation via `timestamp_ms`/`model_call_id`;
    Cursor tool-union keys → Claude-shaped tool names/inputs so chips, risk,
    auto-checkpoints, terminal mirroring, and `phaseLabel` work unmodified),
    `errors.ts` (`classifyCursorError` + `isCursorResumeCorruption` self-heal),
    `permissions.ts` (deny-first session `.cursor/cli.json`, snapshot+restore
    in `finally`), `types.ts` (`ProviderRunBridge` — the third-provider seam).
  - **Posture per composer mode** (`SessionPermissionMode = plan | ask |
    default | acceptEdits`): plan → `--mode plan` (plan captured from the
    terminal result text — Cursor has no ExitPlanMode — into the existing plan
    pipeline); **ask** → `--mode ask` (provider-enforced read-only Q&A; Claude
    gets the same gate via `decideToolUse`); `default` ("ask before edits") is
    **propose-only** (no `--force`) until the hooks bridge is verified for the
    exact CLI version (`cursor/capabilities.ts`) — proposed mutations surface
    as a plan artifact and **Approve** re-runs `--force --resume <chatId>`;
    **`acceptEdits` always forces** behind the deny-first cli.json floor (the
    user's explicit per-session opt-in; print mode cannot prompt), and those
    forced runs double as the hooks probe. Propose-only runs can still inspect:
    read-only `Shell(...)` allow rules are derived from the SAME
    `agent/readOnlyCommands.ts` allowlists `decideToolUse` trusts (exact +
    space-suffixed pairs, never prefix globs; companion deny rules close
    write/exec flags like `git --output` / `rg --pre`). Every run's generated
    context rule carries an **execution-posture note** so the model never
    misattributes propose-only to "plan mode".
  - Resume tokens are provider-keyed in `agent_provider_sessions` (schema v12,
    backfilled from `agent_session_meta`); the chat id is **pre-bound** on a
    session's first Cursor run via `cursor-agent create-chat`
    (`CursorRuntime.createChat()`, best-effort — the id is minted and stored
    BEFORE the prompt is sent, then passed as `--resume`; on failure the
    `system/init` harvest keeps working unchanged), and replayed as `--resume`
    on later runs. Memory/search/resume context +
    the attachment manifest ride the prompt in a `<context>` block (rules-file
    injection is build item 4); image vision blocks are Claude-only.
  - Lifecycle: when the active model is a Cursor model, send-gating and
    `probeHealth` reconcile from `CursorAuthManager.getCachedState()`/`onChange`
    (not-installed / auth-required), while `AgentState.install` stays Claude's
    truth for the Providers card. Composer copy is provider-aware via
    `agentDisplayName()` (`features/agent/status.ts`).
- **BUILT — build-order item (1), Authentication.** The Cursor auth layer is
  live (auth only — Cursor still cannot *run*; `AGENT_MODELS` deliberately has
  no Cursor entries, so it is structurally unselectable as the running agent):
  - `src/main/managers/cursor/CursorAuthManager.ts` — lazy, fully local
    classification (`not-installed` / `not-authenticated` / `authenticated-cli`
    / `authenticated-api-key`) honoring `settings.agent.cursor.preferredAuth`
    (`auto` = key wins; `api-key` = a stored CLI login never classifies;
    `cli-login` = a stored key is kept but ignored), single-flight
    `cursor-agent login` child (timeout-killed, `dispose()` on quit),
    manual-browser mode (`NO_OPEN_BROWSER=1`; the captured login URL must be
    https, credential-free, AND on a Cursor-owned host — `cursor.com` /
    `cursor.sh` or subdomain, dot-boundary match), `logout` (also clears stale
    login state), API-key set/remove, and `getSpawnEnv()` (the only sanctioned
    decrypt site; Phase 2's runtime hook — returns `{}` under `cli-login`).
    Broadcasts secret-free `CursorAuthState` on `agent:cursor-auth-changed`.
  - `src/main/managers/cursor/exec.ts` — argv-only runner (runGit idiom):
    PATH probe + Windows `where.exe` fallback + `~/.local/bin/{cursor-agent,agent}`
    install-dir probe (plain `agent` is never PATH-searched — collision risk);
    `.cmd` shims run via `%ComSpec%` only with static-whitelisted literal args;
    bounded output; `redactCursor()`. **Native-Windows layout** (the official
    installer ships NO exe — only `.cmd`/`.ps1` shims over
    `versions\<YYYY.MM.DD[-HH-MM-SS]-<hash>>\{node.exe,index.js}` under
    `%LOCALAPPDATA%\cursor-agent`, and edits only the REGISTRY user PATH, which
    an already-running GUI process never sees): the resolver upgrades shim hits
    and probes `%LOCALAPPDATA%\cursor-agent` directly, yielding executable
    kind `node` — spawn `node.exe [index.js, ...args]`, argv-only, no ComSpec,
    runtime-safe (`CursorShimError` fires only for genuine cmd-only
    resolutions). Version dirs are regex-gated + realpath-contained under the
    base. The `executablePath` override also accepts the install directory or
    a shim (resolved to the node layout; still fail-closed). Resolution
    diagnostics ride `CursorAuthState.exec` into the Settings › Agent
    **Troubleshooting** section (`AgentTroubleshooting.tsx`: live detection
    detail, refresh/copy-diagnostics actions, common fixes).
  - `src/main/secrets/SecretStore.ts` — the safeStorage secret store (§6).
  - IPC: 7 `agent:cursor*` channels (`src/main/ipc/cursorHandlers.ts`, all via
    `handle()`; key validated + never echoed), preload `agent.cursor.*`
    namespace, `useAgentStore.cursorAuth` + actions.
  - UI: `CursorProviderCard` under Settings › Agent › **Providers**, sharing
    the provider layout with the Claude row via `ProviderStatusRow`
    (`panels/ProviderCard.tsx`) — status renders as a lucide **icon + label**
    pill (`cursorStatusMeta`/`lifecycleMeta.icon` in `features/agent/status.ts`;
    e.g. Download + "Install CLI", never bare "Not installed" text). Shared
    `ActionButton` lives in `settings/controls.tsx`; a `SegmentedControl`
    exposes `preferredAuth`. `CursorMark` in `ProviderIcon.tsx`, catalog search
    fields. Settings: `agent.cursor` (`preferredAuth`, `manualBrowserLogin`),
    `SETTINGS_VERSION` 13, bounds in `CURSOR_LIMITS`. The
    **Connection & reliability** section (`agent.connection`) is provider-neutral
    and shared by every provider.
- **BUILT — build-order items (3) Permissions, (4) Context injection, (5) MCP
  reuse.** All three ride a shared **per-run bridge**: `bridge/pipeServer.ts`
  opens one token-authenticated local pipe per run (`\\.\pipe\limboo-bridge-*`
  win32 / 0700-dir unix socket; pipe+token ride the child ENV only, never
  argv; bounded lines/connections/timeouts; closed in the run's `finally`),
  and every generated session file (`cli.json`, `hooks.json`, `mcp.json`, the
  context rule) goes through `sessionFile.ts` `withSessionFile` —
  containment-checked, atomic, restored byte-for-byte (or removed, plus any
  dirs we created) in `finally`, so `git status` is clean after every run.
  - **(3) Permissions** — two layers. *Declarative (the enforced baseline)*:
    the deny-first `.cursor/cli.json` now wraps **every** run (not just
    `--force`), with `sessionAllowRules()` translating the standing posture
    (`Read(**)` under autoApproveReads, `Mcp(limboo_*:*)`) and extra
    self-denies for `hooks.json`/`mcp.json`. *Interactive (capability-gated)*:
    a session `hooks.json` (`cursor/hooks.ts` — **replaces**, never merges, a
    repo-authored one: repo hooks are arbitrary commands outside the
    limboo.json ack gate) registers the bundled `bridge/hookRunner.cjs`
    (self-contained CJS, fail-closed: deny + exit 2 on any bridge failure,
    plus `failClosed: true`) for `preToolUse`/`beforeShellExecution`/
    `beforeReadFile`/`afterFileEdit`; payloads map via
    `translate.ts mapHookEvent` into `AgentManager.decideToolUse` — the
    decision core **extracted from `makeCanUseTool`**, so Claude's callback
    and Cursor's hooks share one implementation (risk sets, crown-jewel +
    workspace path guards, plan read-only, auto-approvals, remembered
    choices, the same PermissionRequest dialog). Duplicate concurrent hook
    events share one decision. **Hooks only ever tighten** — official docs
    document hooks for IDE/cloud, not the CLI, so `--force` gating is
    unchanged and whether hooks actually connected is recorded per run
    (`AgentState.cursorBridge` → Settings › Agent › Troubleshooting).
    Toggle: `agent.cursor.hooks` (`auto`/`off`).
  - **(4) Context injection** — the memory/search/resume blocks move off the
    prompt into a per-run generated rule
    `.cursor/rules/limboo-context.mdc` (`cursor/rules.ts`, MDC frontmatter
    `alwaysApply: true`; the CLI auto-loads `.cursor/rules` + `CLAUDE.md`),
    deleted/restored after the run; prompt prepending stays as the automatic
    fallback when the rule write fails pre-spawn. The attachment manifest
    stays on the prompt (per-turn, not standing context).
  - **(5) MCP reuse** — a session `.cursor/mcp.json` (`cursor/mcpConfig.ts`,
    merged defensively — repo-authored servers preserved, never overwritten)
    points `limboo_memory`/`limboo_search` at the bundled
    `bridge/mcpBridge.cjs` (hand-rolled MCP stdio JSON-RPC; Electron-as-node
    via `ELECTRON_RUN_AS_NODE`), which forwards `tools/list`/`tools/call`
    over the pipe to `bridge/toolDispatch.ts`. The tool handlers were
    factored into transport-neutral **plain tools**
    (`searchPlainTools`/`memoryPlainTools` in `searchTools.ts`/
    `memoryTools.ts`) consumed by BOTH the SDK in-process servers (Claude)
    and the dispatcher (Cursor) — both agents query the same memory and the
    same index; better-sqlite3 stays in one process. `--approve-mcps` is
    passed only after a memoized `cursor-agent --help` probe confirms the
    flag (`supportsApproveMcps()` in `exec.ts`).
  - The two `.cjs` scripts are copied beside `main.js` by
    `vite.main.config.ts` (`copy-cursor-bridge-scripts`) and asar-unpacked
    (`forge.config.ts`), resolved at runtime by `bridge/bridgeAssets.ts`.
    `SETTINGS_VERSION` 15; new bounds in `CURSOR_LIMITS` (`bridge*`,
    `hookTimeoutSecs`).
- **(6) ~~Worktrees~~** (BUILT — runs always pass
  `--workspace <resolveSessionRoot(...)>`, never Cursor's `-w`; Limboo's
  WorktreeManager stays the single root resolver).
- **Config surface (BUILT):** `AGENT_MODELS` carries `composer-2`/`composer-2.5`
  (`provider: 'cursor'`) — the model picker IS the provider selector; the
  Composer/Plan/banner copy is provider-aware or neutral. On top of the static
  catalog: **dynamic model discovery** (`cursor-agent models` on authenticated
  probes — defensively parsed against `CURSOR_MODEL_ID_RE`, TTL-cached,
  broadcast on `CursorAuthState.models`, persisted in
  `agent.cursor.discoveredModels`, and registered into the shared
  `registerCursorModels()` routing registry in both processes so
  `providerForModel()` and both pickers — `useAgentModels()` in
  `features/agent/models.ts` — survive a restart pre-probe; static ids always
  win); an **`agent.cursor.executablePath` override** (fail-closed: when set
  it is the ONLY candidate — absolute + exists + is-file validated in
  `exec.ts`, `.cmd` shims still refused for runs, probe problems surfaced via
  the auth state's error line; `configureCursorExec()` wired at boot + on
  settings change in `index.ts`); the OS-level sandbox now lives in the
  **provider-neutral `agent.sandbox`** config (see "Unified OS-level Sandbox"
  below), not a per-Cursor toggle; and **CLI self-update**
  (`agent:cursorUpdateCli` → single-flight
  `cursor-agent update`, refused while any run/login is live via
  `AgentManager.hasActiveRuns()`, re-resolve + re-probe after). Argv
  hardening: the model id (charset + membership in static ∪ discovered) and
  the stored `--resume` chat id (`CURSOR_RESUME_ID_RE`; invalid rows dropped +
  forgotten) are validated in `runCursorOnce` with backstop asserts in
  `buildArgv`. Cursor URLs live in shared `CURSOR_URLS`; `SecretInput` in
  `settings/controls.tsx` replaces the card's hand-rolled password inputs.
  `SETTINGS_VERSION` 14; bounds in `CURSOR_LIMITS`.
- **Later:** Cursor Cloud Agents (SSE-streamed remote runs; SSRF-allowlisted
  fetch per §6) and an **ACP adapter** (`agent acp`, JSON-RPC over stdio) as the
  universal route to any ACP-speaking agent.

**Unified OS-level Sandbox (defense-in-depth Layer 3) — BUILT.** Limboo's three
security layers are: (1) the orchestration authority (`decideToolUse` — the one
gate both providers share), (2) provider permission translation (Cursor
`.cursor/cli.json`, Claude `canUseTool` + `settingSources`), and now (3) an
**OS-level sandbox** driven by a single provider-neutral policy. The sandbox is
*containment, not authorization* — the permission gate always runs on top; the
jail is the kernel-enforced net beneath it.
- **One policy, resolved once.** `agent.sandbox` (`SETTINGS_VERSION` 17;
  migrated from the old `agent.cursor.sandbox`; bounds in `SANDBOX_LIMITS`) →
  `resolveSandboxConfig()` in
  [`src/main/managers/sandbox/policy.ts`](src/main/managers/sandbox/policy.ts)
  produces one `EffectiveSandbox` both adapters translate, so they never drift.
  Non-configurable floor: the writable root is always the session worktree, and
  the **crown jewels** — `secrets/`, `limboo.db`, `settings.json`,
  `window-state.json` (`crownJewelPaths()`) — are always denied read+write. The
  floor is those SPECIFIC paths, NOT the whole `userData` root, because the
  worktree (`{userData}/worktrees`) and attachments (`{userData}/attachments`)
  live under it and must stay usable. **All three layers deny exactly this set**
  — Layer 1's `touchesCrownJewel` (AgentManager) and Cursor's declarative
  `sessionDenyRules` both consume `crownJewelPaths()` directly, so they cannot
  drift. (Layer 1 used to deny the whole `userData` root, which hard-blocked
  every edit the agent made inside a default-rooted worktree.) User knobs only widen writes
  (`allowWritePaths`, each screened against the floor via `screenExtraWritePath`
  — a path into a crown jewel / `/` / `$HOME` is dropped) or tighten the network;
  `excludedCommands` (Claude-only) lists commands that run outside the jail.
- **Claude** (`mapClaudeSandbox` → SDK `Options.sandbox`, Seatbelt/bubblewrap):
  `autoAllowBashIfSandboxed:false` keeps `decideToolUse` authoritative;
  `failIfUnavailable` off by default (graceful degrade if bwrap missing) and,
  when on (Strict), also sets `allowUnsandboxedCommands:false` to close the
  `dangerouslyDisableSandbox` escape hatch. Claude's jail couples
  filesystem+network (no allow-all network sentinel), so network `all` (the
  default) skips Claude's OS jail rather than sever its network — `allowlist`/
  `off` engage the full jail. A `dangerouslyDisableSandbox` retry is recorded in
  the timeline as a sandbox-escape audit row; subagents inherit the parent's
  jail (same process, same `canUseTool`/cwd).
- **Cursor** (`cursor/sandbox.ts`): the same policy → a snapshot/restored
  `.cursor/sandbox.json` (`additionalReadwritePaths` / `networkPolicy`,
  `withSessionSandboxJson` — git-clean like every generated session file) plus
  the `--sandbox` flag. Cursor's `networkPolicy:'all'` keeps network open under
  filesystem isolation, so Cursor jails under any policy.
- **UI:** one provider-neutral **Sandbox** section in `AgentPanel.tsx` (the
  Cursor card's per-provider knob is gone); sandbox lifecycle streams into the
  timeline as ordinary `status` markers ("Preparing isolated execution
  environment…", "Workspace boundary established.", "Network policy loaded.").

**Still open / future** — the Agent Adapter Architecture above (Cursor as the
second first-class agent), repository clone/track UI, a dedicated Permission System
beyond the agent's `canUseTool`, merge-conflict resolution UI, remote management, and
stash. Local vector embeddings on top of BM25 (both Memory and Search rankings are
already fusion-ready) and recording File Writer mutations into the session activity
timeline (today they land in the in-memory File History ring) are natural follow-ups.
A **tree-sitter upgrade** of the `search_symbols` / `search_refs` extractors (both
tables are parser-agnostic) would sharpen the resume symbol delta.

---

## 9. Quick orientation checklist for a new agent

1. Read this file and skim [`project.md`](project.md).
2. Run `npm start`; confirm the pure-black 3-pane shell renders (empty states).
3. Find the relevant context: UI → `src/renderer/**` (entry `main.tsx`, shell
   `app/AppShell.tsx`, styles `styles/index.css`); state → `src/renderer/stores/`;
   OS/logic → `src/main/**` (+ future managers); the bridge → `src/preload/index.ts`;
   shared contracts → `src/shared/**`.
4. Keep the process boundary, dark-only theme, and no-gradient rule intact.
5. Verify with `npx vite build --config vite.renderer.config.mts` + `npm run lint`
   (not `tsc`). Prefer small, single-responsibility additions wired through IPC.
