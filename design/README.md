# Design source material

Reference material for the Pandy mascot. **Nothing in this folder is bundled
into a build** — it exists so the art can be inspected, re-cut or extended later.

```
design/mascot/
├── AUTHORING-NOTES.md   how the frames were lifted off the source sheet,
│                        plus the original author's list of known defects
├── manifest.json        per-animation fps, frame order, source frame per slot,
│                        and the shared 11-colour palette
├── preview.html         all eight loops playing on checker + dark backgrounds
├── frames/              individual frames per animation, in playback order
│   └── _source/         all 38 sprites lifted off the sheet, original labels
├── gif/                 transparent looping GIF per animation
├── apng/                transparent looping APNG per animation
└── strips-4x/           the strips at 4× for eyeballing — preview only
```

To view every animation at once, open `mascot/preview.html` in a browser.

The eight 1× strips that actually ship live in
[`assets/mascot/strips/`](../assets/mascot/strips/).

## Frames worth knowing about

`frames/_source/` contains poses that are not in any shipped loop:

- `sleep_f1` — standing, eyes closed. The one-shot transition *into* sleep;
  including it in the loop would make the panda pop upright every cycle.
- `wave_f4` — both paws out with motion lines. Reads as a cheer, not a wave.
  A good standalone "yay" pose.
- `waveA_f2` — alternate paw-across-face frame.

Three frames were never drawn (`look_f2`, `look_f3`, `touch_f3`); the strips
handle these by holding the adjacent pose for two frames rather than inventing
art.
