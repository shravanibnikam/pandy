# Sound system

Pandy ships five short cues. **All sound is off by default** — a fresh install
is completely silent until you turn it on in Settings → Sounds.

## The sounds

| File | Plays when | Length | Loops | Level | On by default |
|---|---|---|---|---|---|
| `chime.wav` | A reminder arrives | 1.10 s | **No** | 0.6 × master | Yes, once sound is on |
| `tada.wav` | You mark a reminder Done | 1.40 s | **No** | 0.6 × master | Yes, once sound is on |
| `blip.wav` | You snooze a reminder | 0.50 s | **No** | 0.5 × master | Yes, once sound is on |
| `focus-in.wav` | Focus mode / pause starts | 0.90 s | **No** | 0.5 × master | **No** — opt in separately |
| `focus-out.wav` | Focus mode / pause ends | 0.90 s | **No** | 0.5 × master | **No** — opt in separately |

Master volume defaults to **60%**. Each cue's level multiplies it, so the
snooze blip is quieter than the reminder chime at any master setting.

### Why each one sounds the way it does

- **chime** — two rising notes (G5 → C6). Open and questioning rather than
  final, because it is asking for your attention, not announcing a result.
- **tada** — a four-note lift resolving up to the octave (C5-E5-G5-C6). The only
  cue that resolves upward, so "done" is the most satisfying sound in the set.
- **blip** — one short low note (A4). Deliberately the quietest and least
  eventful: snoozing is an acknowledgement, not an achievement.
- **focus-in / focus-out** — the same two notes in opposite order (A5→D5 and
  D5→A5), so starting and ending focus read as a matched pair.

All five are built from pure sine partials on a pentatonic set, with a 12 ms
raised-cosine attack and a long decay. No percussive transient, no dissonance,
nothing that could make you flinch — a wellness reminder that startles you has
defeated its own purpose.

## Rules, enforced in code and by test

- **Nothing ever loops.** `loop` is never set, is forced to `false` before every
  play, and `tests/sound-system.test.ts` asserts none of the WAVs carry a `smpl`
  chunk (the RIFF way of declaring loop points).
- **Nothing autoplays in settings.** Opening the Sounds section plays nothing.
  Sound happens only from a real event, or an explicit **▶ Test** press.
- **A preview replaces, never layers.** Starting any cue stops the previous one.
- **Test works even while sound is off**, so you can audition the set before
  committing to it. That is an explicit gesture, which is exactly what the
  no-autoplay rule is protecting against.
- **Turning sound off stops anything playing** immediately.
- OS-level muting of Pandy is respected: notifications are raised through the
  platform API with `silent` set whenever sound is disabled.

## Format

16-bit, 22.05 kHz, mono WAV. About 207 KB for all five.

WAV needs no encoder, plays in every Chromium build, and at these lengths the
file size is irrelevant. The alternative — OGG at roughly a tenth the size —
would make the generator depend on an encoder being installed, which is a worse
trade for 190 KB.

## Regenerating

```bash
python3 scripts/generate-sounds.py           # rewrite the five WAVs
python3 scripts/generate-sounds.py --check   # verify, non-zero exit on drift
```

The script uses only Python's standard library, so it reproduces anywhere.
Every note, duration and gain is declared in one table at the bottom of it if
you want to reshape a cue.

## Content Security Policy

The renderer runs under `default-src 'none'`. Audio therefore requires
`media-src 'self'` in `apps/electron-app/src/renderer/index.html` — without it
every cue is blocked silently, with no error a user would ever see.
