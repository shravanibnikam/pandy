# Shipped mascot assets

**This folder is the single source of truth for art that ends up in a build.**
Both `apps/vscode-extension` and `apps/electron-app` copy from here at build
time. Nothing else in the repo may be bundled.

## Contents

Eight horizontal sprite strips, 64 px per cell, transparent, in playback order:

| File | Cells | Strip width |
|---|---|---|
| `strips/idle_strip.png` | 4 | 256 |
| `strips/wave_strip.png` | 6 | 384 |
| `strips/drink_strip.png` | 6 | 384 |
| `strips/stretch_strip.png` | 4 | 256 |
| `strips/look_strip.png` | 4 | 256 |
| `strips/touch_strip.png` | 4 | 256 |
| `strips/sleep_strip.png` | 4 | 256 |
| `strips/celebrate_strip.png` | 8 | 512 |

Frame counts are derived from strip width ÷ 64 and are authoritative. The
runtime animation config (FPS, loop behaviour, state→strip mapping) lives in
`packages/mascot`, not here — it encodes product decisions, not art facts.

## Rules for using these

- **Never resize a frame at runtime.** Every grounded frame's feet land on row
  61 and the body centre is locked to x ≈ 31.6. Blit at native size and scale
  the canvas with CSS `image-rendering: pixelated` and integer factors only.
  Resampling breaks the shared baseline and the panda visibly bobs.
- **Disable image smoothing** on the canvas context.
- `celebrate` frames 3–4 deliberately leave the baseline (8 px and 7 px of air).
  That is intentional, not drift.

## Known art caveats

- `touch_strip.png` is **currently unreferenced.** Its frame 1 is the round blob
  panda; frames 2–4 are a different, taller character. `touchGrass` renders the
  `stretch` strip instead until the art is reconciled. See `PLAN.md` §1.5.
- `wave` and `drink` were drawn without the bamboo sprout that every other
  animation wears. See `PLAN.md` §1.4.

Art source material — individual frames, GIFs, APNGs, `@4x` previews and the
original authoring notes — lives in [`design/mascot/`](../../design/mascot/).
