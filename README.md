<div align="center">

# 🐼 Pandy

**A cute wellness companion that reminds you to stand, hydrate, look away and touch grass.**

Ships as a **VS Code extension** and an **Electron tray app** with an optional
always-on-top desktop widget — driven by one shared reminder engine.

</div>

---

## What it does

Pandy nudges you gently, on your schedule, with a pixel-art panda:

| Reminder | Default interval |
|---|---|
| 💧 Drink water | every 2 hours |
| 🧍 Stand and stretch | every 90 minutes |
| 👀 Look away from the screen | every 30 minutes |
| 🌱 Touch grass | every 4 hours |

Quiet hours default to 8 PM – 8 AM, sound is **off** by default, and timing is
randomised by ±5 minutes so it never feels mechanical.

**Pandy never guilts you.** No shame, no streak threats, no medical claims —
just a panda who thinks you should drink some water.

## Principles

- **Offline, always.** No accounts, no backend, no cloud sync, no AI APIs, no
  database, no telemetry. Nothing leaves your machine.
- **No backlog.** Close your laptop for three hours and you will not be greeted
  by a stack of missed reminders — at most one fires, the rest reschedule.
- **One timer, no polling.** A single active scheduling timer, cancelled and
  re-armed on change. No animation runs while the mascot is hidden.
- **Calm by default.** Every default is chosen to be ignorable.

## Repository layout

```
pandy/
├── apps/
│   ├── vscode-extension/     # VS Code extension (esbuild → one file)
│   └── electron-app/         # Tray app + desktop widget
├── packages/
│   ├── core/                 # Platform-independent reminder engine
│   ├── mascot/               # 64×64 canvas sprite animator
│   ├── messages/             # Local message pool + non-repeat cycler
│   └── shared-types/         # Shared types + runtime validators
├── assets/
│   └── mascot/strips/        # The 8 sprite strips that actually ship
├── design/
│   └── mascot/               # Art source: frames, GIF, APNG, @4x, notes
├── tests/                    # Cross-package integration tests
├── docs/                     # Setup, publishing, privacy, accessibility
└── PLAN.md                   # Implementation plan and decisions
```

`assets/mascot/strips/` is the single source of truth for shipped art. Everything
in `design/` is reference material and is never bundled into a build.

## Getting started

```bash
# Requires Node ≥ 20 and pnpm
npm install -g pnpm      # if you don't have it
pnpm install

pnpm build               # build all packages and apps
pnpm test                # run the full test suite (fake timers, no real waiting)
pnpm typecheck           # project-wide type check
pnpm lint                # lint
```

### Development

```bash
pnpm dev:vscode          # watch-build the extension, then F5 in VS Code
pnpm dev:electron        # run the tray app in development
```

### Packaging

```bash
pnpm package:vscode      # → .vsix
pnpm package:electron    # → .dmg / NSIS installer / AppImage
```

See [`docs/`](./docs) for full setup, publishing and privacy documentation.

## Privacy

Pandy stores only: your settings, next-reminder timestamps, pause expiry, local
completion counts, recently-used messages, and widget position. It never reads or
stores your files, code, workspace contents or browsing history. There is no
telemetry — not disabled by default, **absent**.

## Status

🚧 In active development. See [`PLAN.md`](./PLAN.md) for the build plan, the
verified sprite-asset facts, and the decisions taken along the way.

## License

[MIT](./LICENSE) © 2026 Shravani Nikam

Panda sprite art included under `assets/` and `design/`.
