<div align="center">

<img src="assets/icon.png" width="120" alt="Limboo logo" />

# Limboo

**The operating system for AI software development.**

A local-first desktop workspace that gives a coding agent everything it needs to do
real engineering: projects, sessions, file watching, repository indexing, git,
worktrees, terminals, memory, search, permissions, and context. Limboo is not an AI
model, and it is not an agent. It is the environment around one — and it works with
more than one.

[![Release](https://img.shields.io/github/v/release/limboo-ai/limboo?label=release&color=6e9bff)](https://github.com/limboo-ai/limboo/releases/latest)
[![CI](https://github.com/limboo-ai/limboo/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/limboo-ai/limboo/actions/workflows/ci.yml)
[![Security](https://github.com/limboo-ai/limboo/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/limboo-ai/limboo/actions/workflows/security.yml)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-1c1c1c)](https://github.com/limboo-ai/limboo/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-3fb950)](LICENSE)

[Download](#download) ·
[Why it exists](#why-it-exists) ·
[Documentation](docs/README.md) ·
[Architecture](docs/architecture/overview.md) ·
[Contributing](CONTRIBUTING.md) ·
[Roadmap](ROADMAP.md) ·
[Security](SECURITY.md)

<br />

<img src="assets/screenshots/01-main-shell.png" alt="Limboo — sessions, the conversation-first workspace, and the composer on the pure-black shell" width="920" />

</div>

---

## What is Limboo?

Limboo is a desktop application (Electron + React + TypeScript) that acts as the
workspace *around* a coding agent. The agent already understands programming,
debugging, planning, and git. Limboo provides the environment where it can perform
at its highest level: it manages the repository, watches the filesystem, runs the
terminal, owns the database, holds durable project memory, and enforces a strict
security boundary, while the agent focuses exclusively on writing software.

It works with **more than one agent**. Claude (through the Claude Agent SDK) and
Cursor (through the `cursor-agent` CLI) both run as first-class providers behind a
narrow adapter seam — picking a model picks the provider, and everything above that
seam behaves identically either way.

Every unit of work is a **Session** — a bundle of a repository, branch, chat
history, agent, terminal history, checkpoints, permissions, context, memory, tasks,
and generated files. Instead of opening many windows, everything lives inside one
workspace.

## Download

Installers for **Windows, macOS, and Linux** are published on every release, on
both x64 and arm64. Every download below lives on the
[latest release](https://github.com/limboo-ai/limboo/releases/latest).

| Platform | Download | Notes |
| --- | --- | --- |
| **Windows** (x64) | `Limboo-Setup-<version>-x64.exe` | NSIS installer |
| **Windows** (arm64) | `Limboo-Setup-<version>-arm64.exe` | For Windows on ARM |
| **macOS** (Apple silicon) | `Limboo-<version>-arm64.dmg` | |
| **macOS** (Intel) | `Limboo-<version>-x64.dmg` | |
| **Linux** — universal | `limboo-<version>-<arch>.AppImage` | `chmod +x` first; needs `libfuse2` (see below) |
| **Linux** — Debian / Ubuntu | `limboo-<version>-<arch>.deb` | |
| **Linux** — Fedora / RHEL / openSUSE | `limboo-<version>-<arch>.rpm` | |
| **Linux** — Arch / Manjaro | `limboo-<version>-<arch>.pacman` | `sudo pacman -U <file>` |
| **Linux** — any distro | `limboo-<version>-<arch>.tar.gz` | Extract and run `./Limboo` |

The app updates itself from the release feed once installed — including the
`.deb`, `.rpm` and `.pacman` builds, which apply updates through your system
package manager and will ask for your password.

> **AppImage on Ubuntu 24.04+**: AppImages need FUSE 2, which Ubuntu no longer
> installs by default. `sudo apt install libfuse2t64` fixes
> `dlopen(): error loading libfuse.so.2`. It installs alongside FUSE 3 without
> replacing it.

### What your OS will say about these builds

Signing status differs per platform, and the differences are worth knowing before
you assume a download is broken.

- **macOS — signed and notarized.** Builds are signed with a Developer ID
  certificate and notarized by Apple, so Gatekeeper opens them normally. (If you
  are on a build from **v1.5.1 or earlier**, those were unsigned; see the note
  below.)
- **Windows — SmartScreen still warns.** The installer carries a signature, but
  from a self-signed certificate that is not in Windows' trust store, so
  SmartScreen still shows "Windows protected your PC." Choose **More info → Run
  anyway**. A chain-trusted certificate is the only thing that removes this
  prompt, and the Microsoft Store listing is the warning-free route once it is
  live.
- **Linux — no code signing exists** for these formats. Integrity comes from the
  checksum manifest and build provenance below.

Rather than ask you to take any of that on trust, every artifact ships with a
checksum manifest and a build-provenance attestation recorded in a public
transparency log:

```bash
sha256sum -c SHA256SUMS                                             # integrity
gh attestation verify <file> --repo limboo-ai/limboo                # provenance
```

> **Upgrading from v1.5.1 or earlier on macOS?** Download the new `.dmg` once,
> manually. Those builds shipped an update archive Squirrel.Mac could not read,
> so they cannot auto-update to this release — the in-app updater will keep
> reporting a failure until you replace the app. Windows and Linux upgrade
> normally.

Prefer to build it yourself? See [Quick start](#quick-start).

## Why it exists

There is no shortage of ways to put a face on a coding agent. Most of them are
genuinely good at what they set out to do: run several agents at once, show you the
diffs, give each task its own branch, keep the transcripts tidy. If that is what you
need, you are well served today.

Limboo starts from a different observation — one you have probably felt without
naming it.

### The agents reason brilliantly and remember the wrong things

Ask a coding agent to resume yesterday's task and it will pick up the conversation
perfectly. It remembers what it decided, what it tried, what you told it to avoid.
What it does *not* remember is the world that conversation was about.

Sessions persist the conversation, not the filesystem. In between, your teammate
merged a refactor. A dependency went up a major version. Someone rebased the branch
out from under the diff. The transcript is intact and now subtly fictional — and the
agent argues confidently from it, because nothing told it otherwise. You spend the
first few turns of every resumed session pushing it back to reality, and the worst
cases are the ones where you don't notice.

This is not a flaw in the model's reasoning. It is a missing system. Nothing in the
stack is responsible for the *world* the agent acts in.

### Watching an agent is not the same as grounding it

The tooling that grew up around these agents solved a real and different problem:
visibility. Boards, parallel sessions, isolated branches, inline review — they make
many agents *watchable*. Limboo has most of that too, and none of it is what makes
it worth building.

Because underneath the dashboards, the environment is still ambient. Whatever
changed between turns remains the agent's problem to rediscover. Each provider keeps
its own memory, its own permission model, its own configuration. Switch agents and
you start over: the knowledge your last agent accumulated stays locked in that
vendor's format, and the safety rules you carefully tuned apply to only one of them.

### So Limboo makes the environment a system

The bet is simple: **the environment deserves to be real infrastructure, owned by
the app, with its own state — not a side effect of whichever agent happens to be
running.** Four consequences follow, and they are the actual product:

**Sessions resume against verified repository reality.** Reopen a session and Limboo
revalidates the worktree against the exact state that session last saw, then computes
a structured *repository delta*: commits landed, files changed with dependency
manifests and migrations flagged, symbols added or removed, and which files import
what moved. That delta is handed to the agent once, before your next prompt, so it
reconciles up front instead of discovering the drift three tool calls in. Bounded,
argv-only git; never blocks you from switching sessions.

**The app owns the knowledge, so it outlives the agent.** Durable project memory and
the code-search index are platform services Limboo maintains — offline, in local
SQLite with FTS5/BM25 ranking, no embeddings API. Both agents query the *same*
memory and the *same* index through the same tools. Your project's accumulated
knowledge is not a vendor's asset, and it survives switching models mid-project.
Memory even links to repository symbols, so guidance whose code was deleted is
automatically demoted until that code returns.

**One authorization core, whichever agent is running.** Every tool call — Claude's
through the SDK callback, Cursor's through a per-run hooks bridge — enters the *same*
decision function, with the same risk classes, the same path guards, and the same
approval dialog. Beneath it sits a provider-neutral OS-level sandbox whose
non-negotiable floor keeps your secrets store, database, and settings unreadable no
matter what the agent is told to do. Two agents, one set of rules you actually wrote.

**The UI never knows which agent is running.** Providers sit behind a narrow adapter
seam: executable detection, run invocation, wire-format translation, permission
mapping, resume tokens. Everything above it — the timeline, approvals, plans, memory,
search, worktrees — is provider-neutral by construction. Adding an agent is writing
an adapter, not forking the app.

### Why this isn't another Claude Code or Codex clone

A clone reimplements the parts that are already excellent: the agent loop, the tool
protocol, the chat.

Limboo deliberately owns none of them. It has no model, no agent loop, and no
inference of its own. It doesn't hold your API keys — each agent authenticates
itself, exactly as it does in your terminal. Run the CLI directly tomorrow and it
still works; nothing here is a lock-in layer.

What Limboo owns is everything the agent *isn't* responsible for and every agent
needs: the repository's state across time, durable knowledge that isn't a vendor's,
a permission model with an OS-level floor, isolated execution roots, and the
translation that makes those work for more than one provider.

The distinction in one line: **wrapper-style tools make the agent easier to look at;
Limboo makes the world the agent acts in durable, verifiable, and yours.**

And it is **local-first** by construction. There is no backend, no telemetry, and no
cloud sync. The only network traffic is the agent talking to its own provider. The
project, its history, and its memory stay on your machine.

## Key features

- **Session-centric workspace** — repo + branch + chat + agent + terminal +
  checkpoints + memory, all in one place.
- **Two agents, one workspace** — Claude (via the Claude Agent SDK) and Cursor (via
  the `cursor-agent` CLI) are both first-class. The model picker *is* the provider
  selector; everything above the adapter seam is provider-neutral.
- **Resume Pipeline** — reopening a session revalidates the repository against the
  state it last saw and hands the agent a structured **repository delta** (commits,
  files, symbols, dependency manifests) so it continues against current reality, not
  a stale transcript. Fully local, bounded git, never blocks switching.
- **Git worktrees per session** — each session can own a real isolated checkout and
  branch, and that worktree is the single execution root every subsystem resolves
  against (agent, terminal, git, search, file writes).
- **Deep git engine** — status, diff, stage, commit, log, branches, tags, blame,
  fetch, push (`--force-with-lease`, never bare force), pull, plus lightweight
  per-session **checkpoints** for instant recovery. Argv-only, never through a shell.
- **Local Memory System** — durable, provider-independent project knowledge with
  fully offline FTS5 / BM25 retrieval, injected into whichever agent is running.
- **Search Engine** — a local index of files, symbols, and import edges that both
  ranks retrieval and answers the agent's own queries as read-only tools.
- **Three-layer permissions** — one shared authorization core for both providers,
  provider-native permission translation, and a provider-neutral **OS-level sandbox**
  with a non-negotiable floor around secrets, the database, and settings.
- **MCP platform layer** — MCP servers are configured once by the app and shared
  across both agents, rather than per-provider.
- **Scripts & Services** — repo-declared dev servers supervised as PTYs with
  auto-assigned loopback ports, behind an explicit trust gate for repo-authored
  commands.
- **Integrated terminal** — workspace-scoped PTY sessions; agent commands are
  mirrored into the terminal view.
- **File System Layer** — live watch + indexed tree + guarded reads and writes,
  pushing live git status into the session list.
- **Unified streaming timeline** — one continuous, turn-grouped event stream of the
  conversation, tool calls, and status, with file reads and edits expanding into
  syntax-highlighted code.
- **Pure-black, dark-only UI** — a minimal three-pane shell tuned for a true
  `#000000` background.

## Under the hood

Every capability above is a subsystem in the main process with its own documentation
— start anywhere:

| Subsystem | What it owns |
| --- | --- |
| [Resume Pipeline](docs/architecture/subsystems/resume-pipeline.md) | Repository snapshots, revalidation, and the structured delta injected on resume |
| [Agent Manager](docs/architecture/subsystems/agent-manager.md) | The provider adapter seam, the shared authorization core, streaming translation |
| [Worktree Manager](docs/architecture/subsystems/worktree-manager.md) | Per-session isolated checkouts; the single resolver of a session's execution root |
| [Memory System](docs/architecture/subsystems/memory-system.md) | Tiered durable knowledge, BM25 retrieval, proposals, symbol links |
| [Git Engine](docs/architecture/subsystems/git-engine.md) | Argv-only git, checkpoints, push/pull, diffs |
| [File System Layer](docs/architecture/subsystems/file-system-layer.md) | Watching, indexing, guarded reads and writes |
| [Terminal Manager](docs/architecture/subsystems/terminal-manager.md) | PTY sessions and agent command mirroring |
| [Service Manager](docs/architecture/subsystems/service-manager.md) | Repo-declared scripts and supervised dev servers |
| [Database](docs/architecture/subsystems/database.md) | Local SQLite, WAL, versioned schema, bound parameters only |

**The security posture, briefly.** The renderer performs nothing: all filesystem,
git, shell, and database access lives in the main process behind a single typed IPC
bridge with sender validation, deny-by-default web permissions, and parameterized SQL
throughout. Git and every spawned process take argv arrays, never a shell. Paths are
guarded against traversal and symlink escape. Secrets go through Electron
`safeStorage` and are redacted before logging. Details in [SECURITY.md](SECURITY.md).

## Screenshots

A tour of the shell: sessions on the left, the conversation in the center, and
the activity rail on the right — every panel below is one click on the rail.

| | |
| --- | --- |
| **Files** — the indexed workspace tree with per-language icons<br /><img src="assets/screenshots/02-files-panel.png" alt="Files panel — indexed workspace tree" /> | **Changes** — live git status with per-file diff stats<br /><img src="assets/screenshots/03-changes-panel.png" alt="Changes panel — live git status" /> |
| **Git** — stage, commit, history, branches, and checkpoints<br /><img src="assets/screenshots/04-git-panel.png" alt="Git panel — staging and commit" /> | **Memory** — durable project knowledge with tiered proposals<br /><img src="assets/screenshots/05-memory-panel.png" alt="Memory panel — project knowledge" /> |
| **Tasks** — the agent's live plan and progress<br /><img src="assets/screenshots/06-tasks-panel.png" alt="Tasks panel — agent plan" /> | **Terminal** — workspace-scoped PTY sessions<br /><img src="assets/screenshots/07-terminal-panel.png" alt="Terminal panel — integrated PTY" /> |
| **Command palette** — every command behind <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd><br /><img src="assets/screenshots/08-command-palette.png" alt="Command palette overlay" /> | **Global search** — files, symbols, docs, memory, commits, sessions<br /><img src="assets/screenshots/09-global-search.png" alt="Global search overlay" /> |

**Settings** — general, appearance, agent, git, memory, and advanced JSON editing
in one modal:

<img src="assets/screenshots/10-settings.png" alt="Settings modal" width="920" />

## Architecture at a glance

```
 Renderer (Chromium + React)   UI only — it asks, it never performs
        |  window.limboo.*
        v
 Preload (contextBridge)        the only bridge; contextIsolation on, sandbox on
        |  ipcRenderer <-> ipcMain
        v
 Main (Node.js + OS access)     workspaces, sessions, git, terminal, fs, agent,
                                memory, SQLite — every OS-touching capability
```

Limboo runs three Electron contexts with a hard boundary between them. The renderer
holds no business logic; all filesystem, git, shell, database, and agent work lives
in the main process and crosses a single typed IPC bridge. See
[docs/architecture/overview.md](docs/architecture/overview.md).

## Tech stack

| Layer            | Choice                                          |
| ---------------- | ----------------------------------------------- |
| Shell / desktop  | Electron 42 (via Electron Forge 7)              |
| Bundler          | Vite 5 (`@electron-forge/plugin-vite`)          |
| UI framework     | React 19                                        |
| Language         | TypeScript                                      |
| Styling          | Tailwind CSS v4 (CSS-first, no config)          |
| State            | Zustand 5 (slice-per-domain stores)             |
| Database         | better-sqlite3 (WAL, FTS5 + trigram)            |
| Terminal         | node-pty (Node-API) + xterm                     |
| File watching    | chokidar                                        |
| Coding agents    | `@anthropic-ai/claude-agent-sdk` (Claude) · `cursor-agent` CLI (Cursor) |
| Highlighting     | Shiki (JS RegExp engine — CSP-safe, no WASM)    |
| Packaging        | electron-builder (NSIS, dmg, AppImage, deb, rpm) |
| Icons            | lucide-react                                    |

## Quick start

**Prerequisites**

- Node.js 20+ and npm.
- A C/C++ build toolchain for `better-sqlite3` (build-essential / Xcode Command
  Line Tools / MSVC Build Tools depending on platform) — it may compile on
  install if no matching prebuilt is published. `node-pty` (pinned to the
  Node-API `1.2.0-beta` line) ships an ABI-stable prebuilt and never compiles.
- **Each agent owns its own authentication.** Limboo never asks for or stores your
  provider credentials; it uses the agent's existing sign-in (for example
  `ANTHROPIC_API_KEY` or the Claude Code credentials file for Claude, and your
  `cursor-agent` CLI login for Cursor). A Cursor API key, if you choose to set one,
  is encrypted with Electron `safeStorage` and decrypted only at spawn time. See
  [docs/guides/using-the-agent.md](docs/guides/using-the-agent.md).

**Run in development**

```bash
npm install     # installs deps and compiles native modules
npm start       # Electron + Vite dev server (renderer on :5173)
```

There is no `npm run dev` — `npm start` drives both Electron and Vite. Full setup
notes live in [docs/getting-started/installation.md](docs/getting-started/installation.md).

**Build installers**

```bash
npm run package   # package the app (no installers)
npm run dist      # branded installers for the current OS -> dist/
```

`npm run dist` builds for whichever OS you run it on: NSIS on Windows, dmg/zip on
macOS, AppImage/deb/rpm on Linux. Releases are **tag-driven** — CI stamps the version
from the `v*` tag at build time, so `package.json`'s version is only a dev
placeholder and should never be hand-bumped. See
[docs/operations/release-process.md](docs/operations/release-process.md).

## Documentation

The documentation is organized as a subsystem, not a single file. Start at the
[documentation home](docs/README.md):

- **Getting started** — [installation](docs/getting-started/installation.md),
  [quick start](docs/getting-started/quick-start.md),
  [configuration](docs/getting-started/configuration.md).
- **Concepts** — [sessions](docs/concepts/sessions.md),
  [workspaces](docs/concepts/workspaces.md),
  [local-first](docs/concepts/local-first.md),
  [conversation-first UI](docs/concepts/conversation-first-ui.md).
- **Guides** — [using the agent](docs/guides/using-the-agent.md),
  [git workflow](docs/guides/git-workflow.md),
  [memory system](docs/guides/memory-system.md),
  [terminal](docs/guides/terminal.md),
  [keyboard shortcuts](docs/guides/keyboard-shortcuts.md).
- **Deep dives** — [the Resume Pipeline](docs/architecture/subsystems/resume-pipeline.md)
  ("continue exactly where you left off") and the other
  [subsystem docs](docs/architecture/subsystems/agent-manager.md).
- **Reference** — [`window.limboo` API](docs/reference/window-limboo-api.md),
  [IPC channels](docs/reference/ipc-channels.md),
  [settings](docs/reference/settings.md),
  [design tokens](docs/reference/design-tokens.md),
  [commands](docs/reference/commands.md).
- **Architecture** — [overview](docs/architecture/overview.md) and per-subsystem
  documentation under [docs/architecture/](docs/architecture/overview.md).
- **Operations** — release, CI/CD, packaging, and maintenance under
  [docs/operations/](docs/operations/release-process.md).

Two internal references predate this site and remain the deepest source of truth
for contributors: [`CLAUDE.md`](CLAUDE.md) (the code-level working contract) and
[`project.md`](project.md) (the full product and architecture vision).

## Project status

**Current release: `v1.5.1`.** The desktop foundation and the platform services are
built and in daily use: workspaces, sessions with per-session git worktrees, the git
engine, the integrated terminal, the File System Layer, multi-agent orchestration
(Claude and Cursor), the Local Memory System, the Search Engine, the Resume Pipeline,
the MCP platform layer, the OS-level sandbox, and a hardened IPC layer over local
SQLite.

Being honest about the rough edges, because you will meet them:

- **Windows installers trip SmartScreen.** They are signed, but with a
  self-signed certificate that Windows does not trust, so the warning stays until
  a chain-trusted certificate (or the Microsoft Store listing) lands. macOS is
  signed and notarized; Linux formats have no signing mechanism to use. See
  [Download](#download).
- **Cursor's default mode is propose-only.** Until the interactive hooks bridge is
  verified for your exact CLI build, proposed edits surface as a reviewable plan you
  approve, rather than applying directly. This is a deliberate safety posture.
- **Cursor Cloud Agents and ACP are not supported yet** — local CLI runs only. Image
  attachments remain Claude-only.

Planned work — repository clone/track UI, a standalone permission system,
merge-conflict resolution, remote management, stash, and a tree-sitter /
vector-embeddings upgrade of the code-intelligence layer — is tracked in
[ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow, the process-boundary contract, theme discipline, and the
verification steps every change must pass. Please also review the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Limboo is local-first with a deliberately small attack surface and defense-in-depth
hardening. To report a vulnerability, follow [SECURITY.md](SECURITY.md) — please do
not open a public issue for security reports.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 BotCoder254.
