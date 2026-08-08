# Widget & Settings Redesign — Audit and Plan

**Status:** awaiting approval. No code changed yet.
**Scope:** `apps/electron-app` only. The scheduling engine (`packages/core`),
the mascot artwork and duplicate-reminder prevention are **not** touched.

---

## 1. Audit findings

### 1.1 The visible background — two technical causes

The window is *already* transparent at the page level. I captured the live
widget with `webContents.capturePage()` and measured the alpha channel:

```
top-left     rgba(0, 0, 0, 0)      fully transparent px : 9224/16384 (56%)
top-right    rgba(0, 0, 0, 0)      fully opaque px      : 7160/16384 (43%)
bottom-left  rgba(0, 0, 0, 0)
centre       rgba(254, 254, 253, 255)   ← the panda itself
```

So the CSS and the DOM are not at fault. **`capturePage()` captures the web
contents, not the composited native window** — which is precisely why it cannot
see either of the real causes:

| # | Cause | Where |
|---|---|---|
| **A** | **`setOpacity()` is called on a transparent window.** On macOS this pushes the window onto a non-transparent compositing path, and the transparent region renders as a solid or tinted rectangle. It runs *after* the page paints, so `capturePage` never sees it. | `widgetWindow.ts:76, 158, 166, 182` |
| **B** | **`backgroundColor` is never set.** Electron defaults it to opaque white. `transparent: true` normally overrides this, but on macOS the documented practice is to set `#00000000` explicitly; leaving it unset is a known source of an opaque backing layer. | `widgetWindow.ts` `new BrowserWindow({…})` |

**Fix:** stop using `setOpacity` for the widget entirely — apply opacity in CSS
to the mascot and controls, so the *window* stays fully transparent and only the
artwork fades. Set `backgroundColor: "#00000000"` explicitly. Keep `frame:false`,
`hasShadow:false`, `focusable:false`, `alwaysOnTop`.

> Honest caveat: I cannot visually confirm this on your screen — screen recording
> is blocked in this environment. The reasoning above is from the code and the
> alpha measurement. You will be the one to confirm it looks right.

### 1.2 The sound system does not exist

This is the most misleading thing in the app.

- **No audio files** anywhere in the repository.
- **No audio code** — no `Audio`, no `AudioContext`, nothing.
- Yet Settings shows a **"Sound" checkbox and a "Volume" slider** that persist
  happily and do absolutely nothing.

`settings.sound.enabled` is read once, to set `silent:` on the OS notification.
That is the entire implementation. A user who turns sound on and drags volume to
100% gets silence and no explanation.

### 1.3 Misleading or unclear labels

| Current | Problem |
|---|---|
| `Every (minutes)` ×4 | Repeated four times with no category on the same line. Doesn't show the current value in words. |
| `Minimum gap (minutes)` | Gap between *what*? |
| `Focus / pause length (minutes)` | One control, two concepts, a slash. |
| `Random variation (minutes)` | Technical framing of "so it doesn't feel robotic". |
| `Daily limit (blank for none)` | Instruction crammed into the label. |
| `Show reminders` → `Wherever I am` | Ambiguous without the hint. |
| `Opacity` / `Volume` sliders | No numeric readout at all. |
| `Reset schedule`, `Quit Pandy` | Destructive, no confirmation. |

### 1.4 Missing customization

- **Custom reminder messages** — supported by the engine and exposed in the VS
  Code panel, but **entirely absent** from the desktop settings.
- **Settings-control style** (heart / dot / hidden) — does not exist.
- **Per-sound choice, preview, per-event toggles** — do not exist.
- **Restore defaults** — does not exist.

### 1.5 Discoverability

Settings are reachable only by clicking the mascot (opens a context menu), by
right-clicking, or via the tray. There is **no visible affordance** on the widget.
A new user has no way to know the panda is clickable.

### 1.6 Accessibility issues

| Issue | Detail |
|---|---|
| Slider values never announced | `aria-valuetext` is set once at render and never updated on input. |
| Working-days group unlabelled | Its label is a bare `<span>`, not tied to the group. |
| No keyboard route to widget actions | The widget is `focusable:false`; Done/Snooze/Pause are mouse-only. |
| No Escape to close settings | And focus is not moved into the panel when it opens. |
| No high-contrast support | Fixed hex colours; ignores `prefers-contrast`. |
| Auto-save is silent | Changes persist with no confirmation, so keyboard users get no feedback. |
| One long scroll | ~35 controls with no landmarks or section navigation. |

### 1.7 What is already good (and stays)

Auto-save persistence, the theme variables, `[hidden]` handling, focus rings,
day chips carrying check marks as well as colour, the reminder-bubble window
resize, and every scheduling behaviour. **None of this is being rebuilt.**

---

## 2. Proposed user journey

```
FIRST RUN
  Onboarding (existing) ─→ widget appears bottom-right
                            Pandy + a small ♥ beside it
                                   │
EVERY DAY                          │
  reminder due ─→ bubble + Done / Snooze / Pause ─→ optional gentle chime
                                   │
NEEDS TO CHANGE SOMETHING          │
  click ♥  ───────────────────────┘   (one click, no right-click needed)
     │
     ▼
  Settings opens on "Reminders"
     │  left nav: Reminders · Pandy · Sounds · Focus & quiet · Notifications · Advanced
     │  live Pandy preview pinned top-right, reflects changes instantly
     │  "Changes save automatically" stated once, "Saved ✓" flashes on each change
     ▼
  Close (or Esc) ─→ back to the widget, exactly where it was
```

Right-click stays as a power-user shortcut. Dragging is unaffected: the ♥ is a
`no-drag` island inside the drag region, and a click only counts if the pointer
moved less than 4px between down and up.

---

## 3. Settings information architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Pandy                                     [ live preview 🐼 ] │
│  Next: water in 42 min · 2 breaks today          Saved ✓  [×]  │
├──────────────┬─────────────────────────────────────────────────┤
│ ▸ Reminders  │                                                 │
│   Pandy      │   (section content)                             │
│   Sounds     │                                                 │
│   Focus &    │                                                 │
│    quiet     │                                                 │
│   Notific-   │                                                 │
│    ations    │                                                 │
│   Advanced   │                                                 │
│              │                                                 │
│ ─────────    │                                                 │
│ Restore      │                                                 │
│  defaults    │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

| Section | Contains |
|---|---|
| **Reminders** | 4 categories (on/off + interval), working days, active hours, custom messages per category |
| **Pandy** | Animation on/off, reduced motion, size, opacity, corner, lock position, always-on-top, show on all workspaces, settings-control style (♥ / • / hidden), personality/tone |
| **Sounds** | Master sound on/off, volume + preview, per-event sound choice with preview buttons |
| **Focus & quiet time** | Quiet hours, focus duration, pause shortcuts |
| **Notifications** | Where reminders appear (desktop / VS Code / both), launch at login |
| **Advanced** | Timing variation, cooldown, daily limit, reset schedule, restore defaults |

---

## 4. Wireframes

### 4.1 Widget — idle

```
        ·  ·  ·  ·  ·  ·  ·  ·        ← fully transparent, no rectangle
     ·      🌱                 ·
     ·     ( ᴗ ᴗ )        ♥    ·      ← heart sits beside Pandy,
     ·      ▂▂▂▂▂              ·        ~60% opacity until hovered
        ·  ·  ·  ·  ·  ·  ·  ·

   whole area = drag region
   ♥ = no-drag island, focusable, "Open Pandy settings"
```

### 4.2 Widget — reminder (unchanged layout, already working)

```
   ┌──────────────────────────────┐
   │ Water break. You're not a    │
   │ houseplant but the rule      │
   │ still applies 🌱             │
   └──────────────────────────────┘
              ( ᴗ ᴗ )        ♥
      [ Done ] [ Snooze ] [ Pause ]
```

### 4.3 Settings — Reminders

```
  Reminders
  ─────────────────────────────────────────────────
  ◉ Drink water                          Every 2 hours
    ├─ interval  [────●──────]  120 min
    └─ messages  [ Edit 3 custom messages ▾ ]

  ◉ Stand and stretch                   Every 90 minutes
  ◉ Look away from the screen           Every 30 minutes
  ○ Take a break outside                Off

  Days you want reminders
  [Sun] [✓Mon] [✓Tue] [✓Wed] [✓Thu] [✓Fri] [Sat]

  Active hours          from [08:00] to [20:00]
  ⓘ Outside these hours Pandy stays quiet.
```

### 4.4 Settings — Sounds

```
  Sounds
  ─────────────────────────────────────────────────
  ( ) Play sounds                            Off
  ⓘ Pandy is silent by default. Nothing loops, ever.

  Volume        [──────●───]  60%        [ ▶ Test ]

  Which sound plays when                  (all disabled while off)
  ─────────────────────────────────────────────────
  A reminder arrives    [ Soft chime  ▾ ]   [ ▶ ]
  You mark it done      [ Little tada ▾ ]   [ ▶ ]
  You snooze it         [ Soft blip   ▾ ]   [ ▶ ]
  Focus mode starts     [ None        ▾ ]   [ ▶ ]
  Focus mode ends       [ None        ▾ ]   [ ▶ ]
```

### 4.5 Confirmation for destructive actions

```
  ┌──────────────────────────────────────────┐
  │  Restore all settings to defaults?       │
  │                                          │
  │  Your reminder schedule starts over.     │
  │  This cannot be undone.                  │
  │                                          │
  │            [ Cancel ]  [ Restore ]       │
  └──────────────────────────────────────────┘
```

---

## 5. Sound system specification

Five short, gentle sounds, generated locally as **16-bit 22.05 kHz mono WAV**
(soft sine tones with slow attack and long decay — no percussive transients).
Total ≈ 120 KB. WAV because it needs no encoder and every Chromium build plays
it; the files are short enough that size is irrelevant.

| File | Plays when | Length | Loops | Default volume | Default state |
|---|---|---|---|---|---|
| `chime.wav` | A reminder arrives | 1.1 s | **No** | 0.6 × master | assigned to *reminder arrives* |
| `tada.wav` | You mark a reminder Done | 1.4 s | **No** | 0.6 × master | assigned to *completed* |
| `blip.wav` | You snooze a reminder | 0.5 s | **No** | 0.5 × master | assigned to *snoozed* |
| `focus-in.wav` | Focus mode starts | 0.9 s | **No** | 0.5 × master | **None** (opt-in) |
| `focus-out.wav` | Focus mode ends | 0.9 s | **No** | 0.5 × master | **None** (opt-in) |

Rules, enforced in code and by test:

- **Sound is off by default.** `sound.enabled: false` stays the shipped default.
- **Nothing ever loops.** No sound has a loop flag; the player rejects one.
- **No autoplay in settings.** Sounds play only from an explicit ▶ Test press,
  or from a real reminder event. Opening the Sounds section plays nothing.
- **A preview stops any previous preview** rather than overlapping.
- Master volume scales every sound; each event has its own relative level.
- Playback lives in the **renderer** (the widget window, always alive). Requires
  adding `media-src 'self'` to the renderer CSP, which is currently
  `default-src 'none'` with no media directive — audio would be blocked outright.

---

## 6. Files that will change

**Modified**

| File | Why |
|---|---|
| `main/widgetWindow.ts` | Remove `setOpacity`, set `backgroundColor:#00000000`, size for the heart |
| `main/index.ts` | Sound + restore-defaults IPC, focus-mode sound hooks |
| `shared/ipc.ts` | New channels: `playSound`, `restoreDefaults`, `previewSound` |
| `preload/index.ts` | Expose the new methods |
| `renderer/index.html` | Heart button, preview canvas, `media-src` in CSP |
| `renderer/renderer.css` | Panel rewrite, CSS opacity, `prefers-contrast` support |
| `renderer/main.ts` | Heart click-vs-drag, sound playback, Esc handling |
| `renderer/panel.ts` | **Rewritten** into the six sections |
| `packages/shared-types/src/settings.ts` | `settingsControl`, `sound.events`, `sound.perEventVolume` |
| `packages/shared-types/src/validate.ts` | Validate + clamp the new fields |
| `apps/electron-app/esbuild.mjs` | Copy sound assets into `dist/renderer/sounds/` |

**New**

| File | Why |
|---|---|
| `renderer/sound.ts` | Preloading, playback, preview, no-loop enforcement |
| `renderer/sections/*.ts` | One module per settings section |
| `assets/sounds/*.wav` | The five generated sounds |
| `scripts/generate-sounds.py` | Reproducible generation, committed alongside the WAVs |
| `tests/settings-validation.test.ts` | New settings fields |
| `tests/sound-mapping.test.ts` | Event→sound mapping, no-loop, off-by-default |

**Untouched** — `packages/core` (engine, scheduling, presence), `packages/mascot`,
`packages/messages`, all sprite artwork, the VS Code extension's scheduling.

---

## 7. Required fixes vs optional improvements

### Required

1. Widget background genuinely transparent (remove `setOpacity`, set `backgroundColor`)
2. Persistent heart/dot control that opens settings in one click, keyboard-accessible
3. Drag vs click disambiguation so dragging never opens settings
4. Settings restructured into the six named sections
5. Clear labels with current values shown ("Every 90 minutes")
6. Explanations under anything confusing
7. Real toggles / sliders / time pickers / dropdowns with visible values
8. Restore defaults, with confirmation
9. Confirmation on destructive actions
10. Explicit statement that changes save automatically, plus a "Saved" indicator
11. **A working sound system**, off by default, with previews and no looping
12. Custom reminder messages exposed in desktop settings
13. Settings-control style option (heart / dot / hidden)
14. Keyboard accessibility: Esc to close, focus management, live slider values
15. Light / dark / high-contrast support

### Optional (will flag, only build if you want them)

- Live Pandy preview in the settings panel *(I recommend including it — it makes
  size and opacity legible instantly, and it's cheap since the animator exists)*
- Per-event sound choice beyond a single on/off *(recommended; the spec asks for
  event mapping, so I plan to include it)*
- Collapsible custom-message editor per category
- Widget hover affordance (heart fades in on hover, stays visible on keyboard focus)
- Remembering the last-opened settings section

---

## 8. Implementation and testing pathway

| Step | Work | Verification |
|---|---|---|
| 1 | Transparency fix | `--pandy-selftest` reports window flags; **you** confirm visually |
| 2 | Settings type/validator changes | Unit tests for clamping and defaults |
| 3 | Heart control + drag/click | Unit test on the movement threshold; `--pandy-capture` shot |
| 4 | Generate sounds | Inspect WAV headers: length, mono, sample rate, no loop metadata |
| 5 | Sound player | Tests: off by default, preview stops previous, loop refused |
| 6 | Panel rewrite, section by section | `--pandy-capture` shot per section |
| 7 | Accessibility pass | Assert labels/aria in the built DOM; manual keyboard walk-through |
| 8 | Regression | Full 164-test suite must stay green — engine and presence untouched |

**What I can verify:** window flags, DOM structure and ARIA, sound file
properties, all logic under test, and per-section screenshots via
`--pandy-capture` (the app photographing its own window).

**What I cannot verify:** how transparency composites on your actual screen, and
whether audio is audible. Screen recording and audio capture are both
unavailable here. I will not claim either works — you will confirm.

---

## 9. Open questions

1. **Live preview in settings** — include it? (I recommend yes.)
2. **Default settings-control** — heart, dot, or hidden? (I recommend heart.)
3. **Sound file format** — WAV as specified, or should I try to produce smaller
   OGG/MP3 using `afconvert`? (WAV is dependency-free and ~120 KB total.)
4. **Save model** — auto-save with a "Saved ✓" indicator, or explicit Save/Cancel
   buttons? (I recommend auto-save; it's what the app does today and Save/Cancel
   on a settings panel this size adds friction.)
