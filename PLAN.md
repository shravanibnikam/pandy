# Pandy — Implementation Plan

> A cute, Gen Z-style wellness companion. Ships as a VS Code extension and an
> Electron tray app with an optional always-on-top desktop widget.

**Status:** plan drafted, awaiting review. No code written yet.
**Plan path:** `/Users/shravaninikam/01-Projects/02-Code/pandy/PLAN.md`
**Task list:** tracked in the session task list (see `TODO.md` for the mirrored copy).

---

## 0. What already exists

```
pandy/
└── mascot/
    ├── manifest.json                    # identical duplicate of the one below
    ├── README.md                        # identical duplicate
    ├── preview.html
    ├── panda_sprite_animations.zip
    └── panda_sprite_animations/
        ├── manifest.json                # canvas, fps, frame order, palette
        ├── README.md                    # authoring notes + known asset defects
        ├── strips/   <name>_strip.png  + <name>_strip@4x.png
        ├── frames/   <name>/<name>_fNN.png, plus frames/_source/ (38 originals)
        ├── gif/      <name>.gif
        └── apng/     <name>.png
```

684 KB total. No MP4 present, so the "do not use the old MP4" constraint is
satisfied by default. The `strips/` PNGs are the only assets the app will ship.

### Verified sprite facts

Measured with `sips`, not taken on faith from the manifest:

| Animation | Strip px | Frames | Manifest FPS | Sprout? | Notes |
|---|---|---|---|---|---|
| `idle` | 256×64 | 4 | 6 | yes | breathe, blink on f2, sprout sway |
| `wave` | 384×64 | **6** | 8 | **no** | neutral → paw up → wave → neutral |
| `drink` | 384×64 | 6 | 8 | **no** | bottle appears → sip → lower |
| `stretch` | 256×64 | 4 | 8 | yes | anticipate → raise → full → relax |
| `look` | 256×64 | 4 | 8 | yes | glance aside, held 2 frames |
| `touch` | 256×64 | 4 | 8 | **f1 only** | **character design breaks, see below** |
| `sleep` | 256×64 | 4 | 6 | yes | curled, drooping sprout, rising Z |
| `celebrate` | 512×64 | 8 | 10 | yes | jump, sparkles at apex, land, flourish |

- Canvas is a strict **64×64** cell, transparent, 11 flat colours, zero antialiasing.
- Every grounded frame's feet land on **row 61**; body centre locked to **x ≈ 31.6**.
- `celebrate` frames 3–4 intentionally leave the baseline (8 px and 7 px of air).
- `@4x` strips are preview-only. Ship the 1× strips and scale with
  `image-rendering: pixelated`; never resample at runtime.

---

## 1. Conflicts between the spec and the actual assets

These are real and need decisions. Nothing below is a blocker — each has a
sensible default I will take unless told otherwise.

### 1.1 `wave` frame count — spec says 8, asset has 6

The spec's animation table declares `wave: { frames: 8 }` but `wave_strip.png`
is 384 px = **6 cells**. Drawing 8 frames from a 6-frame strip renders two blank
frames and a visible hitch every loop.

**Default:** trust the asset, use 6.

### 1.2 `lookAway` FPS — spec says 6, manifest says 8

Cosmetic only; changes glance speed, not correctness.

**Default:** follow the spec (6 fps) — the slower glance reads better as a
"rest your eyes" cue than a quick flick.

### 1.3 Loop flags — spec says non-looping, manifest says looping

The manifest marks every animation `loop: true` because it was authored as eight
standalone seamless loops. The product spec wants action animations to play once
and fall back to `idle`.

**Default:** the spec wins. `idle` and `sleep` loop; everything else is one-shot
→ `idle`. This is product behaviour, not an asset property.

### 1.4 The bamboo sprout disappears on three animations

Confirmed visually, not just from the README. `idle`, `stretch`, `look`, `sleep`
and `celebrate` all wear the sprout. `wave` and `drink` were drawn without it.
So every `idle → wave` transition pops the sprout off the panda's head and
`wave → idle` pops it back on.

**Options:**
- **(a) Ship as-is.** Zero work, visible glitch on the two most-shown animations.
- **(b) Graft the sprout** from `idle_f1` onto the 12 `wave`/`drink` frames.
  Uses only supplied pixels, no redrawing — but it is compositing, and the head
  position shifts between frames so each graft needs its own offset.

**Default:** (b), as a discrete polish task late in the build, gated behind a
visual diff I show you before it lands. (a) is the fallback if grafting looks worse.

### 1.5 `touch` switches to a different character mid-animation ⚠️

This is worse than the README implies and is the one I would most like a
decision on. Frame 1 is the round blob panda with a sprout. Frames 2–4 are a
**visibly different character** — taller, standing, different proportions, no
sprout, with grass tufts. Played back, "touch grass" morphs the mascot into
another panda and back.

**Options:**
- **(a) Ship as-is** — noticeable, and it is the animation with the most
  personality, so it will get seen.
- **(b) Use frames 2–4 only.** Consistent within itself (all the standing
  panda), drops the pop, but the touchGrass mascot then never matches idle.
- **(c) Reuse `stretch` for touchGrass** and keep the touch strip out of the
  build. Fully consistent, costs the grass-touching charm.
- **(d) Composite a new touch loop** from the round-blob body + the grass tufts.
  Real pixel art work, well beyond "wire up the supplied strips".

**Default if you do not pick:** (c) for the MVP, with the touch strip kept in
the repo and a `TODO` so it can be swapped in once the art is reconciled.

### 1.6 Naming

Assets use `look` / `touch`; the spec's `MascotState` uses `lookAway` /
`touchGrass`. The mascot package will own a single mapping table so the asset
filenames stay untouched and the rest of the codebase only sees spec names.

### 1.7 Directory name

The spec's tree is rooted at `sprout-panda/`, the actual folder is `pandy/`.

**Default:** build in place at `pandy/` (no nested extra folder), set the
workspace package name to `sprout-panda`, and keep the product name "Pandy" in
all user-facing strings.

---

## 2. Environment gaps to close first

| Gap | Action |
|---|---|
| **pnpm not installed** | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Not a git repo** | `git init` + `.gitignore` — recommended before generating hundreds of files, so the build is reviewable as a diff. Will ask before running. |
| Node v26.7.0 | Very new. Electron and `@vscode/vsce` will be pinned to versions known to work; if a native step breaks on Node 26 I will pin an engines field rather than silently downgrade. |

---

## 3. Target structure

```
pandy/
├── apps/
│   ├── vscode-extension/
│   │   ├── src/{extension,statusBar,notifier,webview,config,storage}.ts
│   │   ├── media/            # webview css/js + strips, copied at build
│   │   ├── esbuild.mjs       # → dist/extension.js, one file, external:vscode
│   │   └── package.json      # contributes.commands / configuration
│   └── electron-app/
│       ├── src/main/{index,tray,widgetWindow,settingsWindow,ipc,power,store,autolaunch}.ts
│       ├── src/preload/index.ts
│       ├── src/renderer/{widget,settings}/…   # vanilla HTML/CSS/TS
│       └── electron-builder.yml
├── packages/
│   ├── shared-types/     # zero-dep types + zod-free runtime validators
│   ├── core/             # the reminder engine — platform independent
│   ├── mascot/           # canvas sprite animator + asset copy pipeline
│   └── messages/         # message pool, tones, non-repeat cycler
├── assets/mascot/        # the 8 shipped 1× strips, single source of truth
├── tests/                # cross-package integration + scenario tests
├── PLAN.md   TODO.md   README.md
├── package.json   pnpm-workspace.yaml   tsconfig.base.json   vitest.config.ts
```

`assets/mascot/` is populated once from `mascot/panda_sprite_animations/strips/`
by a small script, so the original delivery folder stays pristine and both apps
copy from one place at build time.

---

## 4. `packages/core` — the reminder engine

The heart of the project. Everything else is a shell around it.

### Injected adapters

```ts
interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(h: TimerHandle): void;
}
interface StorageAdapter {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
}
```

Both are constructor-injected. Tests pass a fake clock; VS Code passes a
`globalState` adapter; Electron passes a JSON-file adapter. The engine imports
nothing platform-specific and has zero runtime dependencies.

### Persisted state

```ts
{
  schedule:  Record<ReminderType, { nextDueAt: number }>,
  pauseUntil:  number | null,
  focusUntil:  number | null,
  lastFiredAt: number | null,        // drives the cooldown
  daily: { dateKey: string, counts: Record<ReminderType, number> },
  recentMessages: Record<ReminderType, string[]>,   // message non-repeat
  widget: { x: number, y: number, corner: Corner },
}
```

### Single-timer scheduling

One active timer, always. `#rearm()` cancels any existing handle before creating
a new one — the cancel-then-create ordering is invariant, and there is a test
asserting no two handles are ever live at once.

Each tick: pick the minimum `nextDueAt` across *enabled* categories, arm one
timeout for `due - now`.

**Long-delay clamp.** A raw `setTimeout` of 4 hours does not survive laptop
sleep, and its firing time drifts with wall-clock changes. Each arm is therefore
clamped to `min(delay, 15min)`; a wake that finds nothing due simply re-arms.
This is still *one* timer and is not polling in the meaningful sense (no work is
done on a re-arm), but it is a deliberate deviation from a literal reading of
"chained setTimeout only" and is the mechanism that makes sleep/DST/clock-change
recovery work in VS Code, which has no resume event. Electron additionally hooks
`powerMonitor` `resume`/`suspend` for an immediate recompute.

### Gate chain, in order

A due reminder passes through: `enabled` → `focus mode` → `pause` → `working
day` → `active hours` → `quiet hours` → `daily limit` → `cooldown`. Any gate that
rejects **reschedules rather than fires** — this is what guarantees no backlog.

- **Quiet hours crossing midnight:** `start > end` means the window wraps; the
  comparison becomes `t >= start || t < end`. Deferred reminders are pushed to
  the next window *open*, not retried in a loop.
- **Daily limit:** counted per local calendar day, keyed by `YYYY-MM-DD` in
  local time so it resets at local midnight, not UTC.
- **Cooldown:** a global minimum gap between any two reminders of any type,
  so four categories coming due together do not stack.

### Restart and overdue handling

On `start()`, every category whose `nextDueAt` is already in the past is
**rescheduled from now**, and at most **one** — the most overdue — is allowed to
fire immediately (subject to the full gate chain). This is the explicit
"never display a backlog" rule.

### Result handling

```ts
type ReminderResult = "completed" | "snoozed" | "dismissed" | "paused";
```

`completed` → `celebrate`, increment local count, schedule next normal interval.
`snoozed` → schedule exactly one short reminder, **replacing** any pending snooze.
`dismissed` → schedule the next normal interval.
`paused` → set `pauseUntil`, cancel and re-arm.

### Settings changes

`updateSettings()` diffs the incoming settings, recomputes affected
`nextDueAt` values immediately, and re-arms — no waiting for the current timer
to expire. Interval changes rescale the remaining time proportionally rather
than restarting the clock, so nudging an interval does not reset progress.

### Randomization

`±N` minutes (default 5) applied at schedule time via an injected RNG, so tests
can make it deterministic.

---

## 5. `packages/mascot` — the animator

Fixed 64×64 canvas, `imageSmoothingEnabled = false`, CSS `image-rendering:
pixelated`, integer scale factors only.

- Preloads all eight strips once, decodes to `ImageBitmap` where available.
- `requestAnimationFrame` loop with an **accumulator** clamped to the configured
  frame duration, so it advances at the animation's FPS regardless of a 60/120 Hz
  display and never renders a frame that has not changed.
- `setState()` cancels the previous rAF handle before starting the new one.
- Non-looping animations resolve to `idle` on their final frame.
- `IntersectionObserver` + `document.visibilitychange` → **fully stops the rAF
  loop** when hidden. The Electron widget also stops it on window `hide`.
- Reduced motion → renders frame 0 only, no loop, no rAF.
- Draws each frame with a source rect off the strip at native size; the canvas
  is scaled by CSS. Individual frames are never resized at runtime.

---

## 6. `packages/messages`

Messages are plain TypeScript, typed, local, no I/O:

```ts
{ type: "water", tone: "gen-z", intensity: 2, text: "Hydration check, bestie 💧" }
```

Three tones — `low-key`, `gen-z`, `chaotic`. A cycler yields a shuffled pass over
the pool for a `(type, tone)` pair and does not repeat any message until the pool
is exhausted, then reshuffles with a guard against the last item repeating across
the seam. User-supplied custom messages join the pool for their category.

**Content rules, enforced by a test that scans the whole pool:** no guilt, no
shame, no medical claims, no streak threats, no "you've failed" framing.

---

## 7. VS Code extension

- `onStartupFinished` activation; engine restored from `globalState`.
- `window.showInformationMessage` with **Done / Snooze / Pause** buttons.
- Status bar: mascot glyph + countdown to next reminder, subtle, click → settings.
  Countdown text is refreshed by the same single engine timer, not a 1 s interval.
- Webview for onboarding, settings and animation preview — **lazily created**, only
  on first open.
- Commands: `Take Break Now`, `Pause`, `Resume`, `Open Settings`, `Reset Schedule`.
- No floating overlay, per the spec — VS Code has no such API.

**Webview security:** strict CSP with a per-load nonce, `localResourceRoots`
restricted to `media/`, no remote content, `enableScripts` with nonce-gated
scripts only, and every inbound message validated against a discriminated union
with unknown types dropped and logged.

**Build:** esbuild → a single `dist/extension.js`, `vscode` marked external,
minified for release, sourcemaps for dev.

**Ship:** `.vsix`, marketplace README, icon, screenshots, CHANGELOG, LICENSE,
`vsce` publish scripts.

---

## 8. Electron app

Single instance (`requestSingleInstanceLock`). Tray-resident; closing the window
hides it rather than quitting. Native notifications. Settings in a local JSON
file. Fully offline, no account.

**Windows:** exactly **one** `BrowserWindow` for the widget. Settings open in the
same window via a route swap, so the "one BrowserWindow" rule holds.

**Widget:** transparent, frameless, draggable, optional always-on-top, optional
visible-on-all-workspaces, adjustable size and opacity, corner snapping, lock
position, hide/show from tray, click → compact control menu, right-click →
Pause / Settings / Quit.

**Focus:** `setFocusable(false)` plus `showInactive()` so a reminder never steals
keyboard focus mid-typing.

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
A thin preload exposes a fixed, enumerated IPC surface via `contextBridge`; every
payload is validated in the main process against an explicit schema before it
touches state. No `remote`, no arbitrary channel names.

**Power:** `powerMonitor` `resume` and `suspend` → engine recompute.

**Package:** electron-builder → macOS `.dmg`, Windows NSIS, Linux AppImage.

---

## 9. Duplicate-reminder prevention

```ts
type DeliveryOwner = "vscode" | "desktop" | "both";
```

Onboarding asks where reminders should appear. The Electron app writes a
heartbeat file (pid + timestamp) to a shared per-user location; the VS Code
extension reads it at activation and on each due reminder. If the desktop app is
live and owns delivery, the extension suppresses its notification but **keeps the
status bar visible** — which is the spec's stated intent. Stale heartbeats
(process gone) release ownership back to VS Code, so uninstalling the desktop app
does not silence reminders.

This is a file-existence check on an already-scheduled tick — not a poll, and not
a network call.

---

## 10. Tests

Vitest with fake timers throughout. No test waits in real time.

**Engine:** quiet hours crossing midnight · DST spring-forward and fall-back ·
sleep/resume · restart with overdue reminders · no backlog · snooze replaces
rather than stacks · settings change while a timer is live · rapid state changes ·
timer cancellation (never two live handles) · daily limit · cooldown · focus mode ·
working days and active hours · randomization bounds.

**Messages:** no repeat until the pool cycles · seam guard · tone filtering ·
custom messages · the content-rule scan.

**Mascot:** reduced motion renders one frame · state change cancels the previous
rAF · non-looping returns to idle · no rAF while hidden.

**Platform:** notification ownership resolution incl. stale heartbeat · widget
position recovery and clamping to a valid display · IPC payload validation
rejects malformed input.

---

## 11. Efficiency

One scheduling timer · no polling · zero network requests · no animation while
hidden · lazily created settings UI · production bundles minified · assets local ·
dependency budget kept near zero (core has none; the apps have only `electron`,
`@vscode/vsce`, esbuild, TypeScript, Vitest) · one BrowserWindow · rAF stops
when nothing changes.

---

## 12. Build order

| Phase | Deliverable |
|---|---|
| 0 | pnpm + git bootstrap, workspace, tsconfig, vitest, lint, asset copy script |
| 1 | `shared-types` — types and runtime validators |
| 2 | `messages` — pool, tones, cycler, content-rule test |
| 3 | **`core`** — engine + the full scheduling test suite |
| 4 | `mascot` — animator + preview harness |
| 5 | VS Code extension — engine wired, status bar, notifications, webview |
| 6 | Electron — tray, widget, IPC, power, settings |
| 7 | Delivery ownership across both apps |
| 8 | Packaging: `.vsix` + electron-builder targets |
| 9 | Docs: setup, publishing, privacy, accessibility |
| 10 | **Verification pass** (below) |

Phases 1–4 are pure and testable with no platform involved; 5 and 6 are
independent of each other once 3 and 4 land.

---

## 13. Definition of done

Not "it compiles". Before I call this complete I will verify and report:

- [ ] `.vsix` installs into VS Code and activates on startup
- [ ] A reminder fires, and Done / Snooze / Pause each behave correctly
- [ ] Snooze produces exactly one deferred reminder, not a stack
- [ ] Quiet hours suppress, and the next reminder lands after the window opens
- [ ] Schedule survives a VS Code restart with no backlog burst
- [ ] Electron app launches to tray, single instance enforced
- [ ] Widget is transparent, draggable, always-on-top, and does not steal focus
- [ ] Widget position persists and is restored on a valid display
- [ ] Mascot returns to idle automatically after every one-shot animation
- [ ] Reduced motion renders a single static frame
- [ ] Both apps installed → exactly one notification, never two
- [ ] Full test suite green; typecheck and lint clean
- [ ] Electron packages built, or the exact commands documented if a target
      cannot be cross-built from macOS

**Cross-build honesty:** macOS can produce the `.dmg` and the AppImage. A
signed Windows installer generally cannot be produced from this machine without
a Windows runner or a code-signing certificate. I will build what genuinely
builds here, and document the rest as commands rather than claim a package
exists that I never produced.

---

## 14. Decisions (confirmed 2026-08-08)

1. **`touch` character break (§1.5) → option (c).** `touchGrass` renders the
   `stretch` strip so the mascot stays one character. `touch_strip.png` stays in
   the repo, unreferenced, with a TODO to swap in once the art is reconciled.
2. **Sprout grafting (§1.4) → yes.** Graft `idle_f1`'s sprout onto the 12
   sprout-less `wave`/`drink` frames, per-frame offset, supplied pixels only.
   A visual diff gets shown before it lands; fall back to shipping as-is if it
   looks worse.
3. **`git init` → yes.** Repo initialised before the monorepo is generated, so
   each phase lands as a reviewable commit.
