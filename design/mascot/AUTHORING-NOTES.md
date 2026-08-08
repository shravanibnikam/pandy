# Panda sprite animations

Eight seamless loops cut from the supplied sprite sheet. No frame was redrawn, morphed,
smoothed, rotated or reinterpreted — every output pixel comes from a source pixel.

- **Canvas:** 64 × 64, transparent
- **Colours:** 11 (flat, hard edges, zero antialiasing, zero motion blur)
- **Baseline:** every grounded frame's feet land on row 61, in every animation
- **Body centre:** locked to x ≈ 31.6; drift across a loop is under 0.7 px

## Contents

```
preview.html          all eight loops, playing, on checker + dark backgrounds
manifest.json         fps, frame order, source frame per slot, palette
gif/<name>.gif        transparent looping GIF
apng/<name>.png       transparent looping APNG (exact 167/125/100 ms timing)
strips/<name>_strip.png      horizontal strip, 64 px per cell, playback order
strips/<name>_strip@4x.png   same strip at 4× for eyeballing
frames/<name>/        the individual frames of that loop, in order
frames/_source/       all 38 sprites lifted off the sheet, original labels
```

## The loops

| Animation | Frames | FPS | Loop | Beats |
|---|---|---|---|---|
| `idle` | 4 | 6 | 667 ms | breathe, blink (f2), sprout sway |
| `wave` | 6 | 8 | 750 ms | neutral → paw crosses up → paw up → wave out → wave back → neutral |
| `drink` | 6 | 8 | 750 ms | bottle appears → lift → sip w/ happy blink → lower → neutral |
| `stretch` | 4 | 8 | 500 ms | anticipate → raise both paws → full stretch → relax |
| `look` | 4 | 8 | 500 ms | neutral → glance aside (held 2f) → return |
| `touch` | 4 | 8 | 500 ms | stand → lower paw to grass → touch + smile → lift |
| `sleep` | 4 | 6 | 667 ms | curled, slow breathing, drooping sprout, rising Z |
| `celebrate` | 8 | 10 | 800 ms | ready → squash → launch → apex + sparkles → land squash → settle → recover → flourish |

Every loop opens and closes on the same rest pose, so frame *n* → frame *1* is seamless.
`celebrate` is the only animation that leaves the baseline: frames 3 and 4 are 8 px and
7 px of air, taken straight from the sheet's own vertical offsets.

Where the sheet was short a drawing, the pose is **held** rather than invented:
`look` holds the glance for two frames, `sleep` holds the Z pose for two.

## How the frames were lifted

1. Located the six sprite bands and the label bands by projection, then split each band
   into cells; each sprite was sampled only inside its own cell so neighbours and labels
   could not bleed in.
2. Downsampled by mode-per-block at the sheet's native pixel size (5.283 sheet px per
   sprite pixel) — the majority colour wins, so edges stay hard.
3. Snapped to a single 11-colour palette shared by all 38 frames, so nothing shimmers
   between frames.
4. Keyed the grey background by colour distance, not by flood fill, so enclosed gaps
   (between paw and body) are transparent too.
5. Anchored each frame: feet to the row's median ground line, body centre to the centre
   of mass of the white body pixels — which ignores raised black paws, green grass and
   the blue bottle, so a raised arm doesn't drag the character sideways. Sub-pixel drift
   was snapped out; only offsets of 3 px or more (the jump) survive.

## Things in the source you should know about

These are properties of the supplied sheet, not of the conversion. I left all of them
alone rather than repair them by hand — say the word and I'll fix any of them.

- **The sprout is missing from two whole rows.** Every `wave_*` and `drink_*` frame, plus
  `touch_f2` and `touch_f4`, were drawn without the bamboo sprout. So `wave` and `drink`
  cannot start and end on the sprouted idle pose — they start and end on their own row's
  sprout-less rest pose instead, and `touch` pops the sprout off for its middle frames.
  Grafting the sprout across from `idle_f1` is the obvious fix and uses only supplied
  pixels, but it does mean compositing, so I left the call to you.
- **Three frames were never drawn:** `look_f2`, `look_f3`, `touch_f3`. Handled with holds.
- **`wave_f1` and `wave_f2` appear twice** on the sheet with the same labels but different
  art. I used the arms-down version as the neutral bookend (`waveA_f1`) and the
  paw-across-face version as the raise (`waveB_f1`); both variants are in `frames/_source/`.
- **`wave_f4`** (both paws out, motion lines on both sides) reads as a cheer rather than a
  wave, so it is not in the `wave` loop. It's a good standalone "yay" pose.
- **`sleep_f1`** is a standing, eyes-closed pose — including it in the loop would make the
  panda pop upright every cycle. It's kept aside as the one-shot transition *into* sleep:
  play `idle_f1 → sleep_f1 → sleep_f2`, then hand off to the `sleep` loop.
- The GIFs collapse the two identical held frames in `look` and `sleep` into one cell with
  a doubled delay. Same playback, smaller file. The strips and APNGs keep all four cells.
