#!/usr/bin/env python3
"""
Generate Pandy's notification sounds.

Five short cues, built from pure sine partials with a slow attack and a long
decay. No percussive transients, no dissonance, nothing that reads as an alarm —
a wellness reminder that makes you flinch has defeated itself.

Output is 16-bit 22.05 kHz mono WAV. WAV needs no encoder, plays in every
Chromium build, and at these lengths the file sizes do not matter. Written with
the stdlib `wave` module only, so this reproduces on any machine with Python.

Usage:  python3 scripts/generate-sounds.py [--check]
        --check verifies the committed files match a fresh render.
"""

from __future__ import annotations

import argparse
import math
import struct
import sys
import wave
from pathlib import Path

RATE = 22_050
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "sounds"

# A pentatonic set — no semitone clashes, so any two notes here sound pleasant
# together however they overlap during the decay.
NOTES = {
    "C5": 523.25,
    "D5": 587.33,
    "E5": 659.25,
    "G5": 783.99,
    "A5": 880.00,
    "C6": 1046.50,
    "G4": 392.00,
    "A4": 440.00,
}


def envelope(i: int, total: int, attack: float, release: float) -> float:
    """Slow attack, long exponential-ish release. Never clicks at either end."""
    t = i / RATE
    dur = total / RATE
    if t < attack:
        # Raised cosine in, so the onset is soft rather than a step.
        a = 0.5 - 0.5 * math.cos(math.pi * t / attack)
    else:
        a = 1.0
    remaining = max(0.0, dur - t)
    r = min(1.0, remaining / release) ** 2.2 if release > 0 else 1.0
    return a * r


def tone(freq: float, dur: float, gain: float, attack: float, release: float,
         start: float, buf: list[float]) -> None:
    """Mix one note into the buffer at `start` seconds."""
    n = int(dur * RATE)
    offset = int(start * RATE)
    for i in range(n):
        idx = offset + i
        if idx >= len(buf):
            break
        env = envelope(i, n, attack, release)
        phase = 2 * math.pi * freq * (i / RATE)
        # Fundamental plus a quiet octave and a whisper of the fifth: gives the
        # tone a little body without making it bright or bell-like.
        sample = (
            math.sin(phase)
            + 0.22 * math.sin(2 * phase)
            + 0.08 * math.sin(3 * phase)
        )
        buf[idx] += sample * env * gain


def render(seconds: float, notes: list[tuple[str, float, float, float]]) -> list[float]:
    """notes: (note name, start seconds, duration seconds, gain)"""
    buf = [0.0] * int(seconds * RATE)
    for name, start, dur, gain in notes:
        tone(NOTES[name], dur, gain, attack=0.012, release=dur * 0.85, start=start, buf=buf)
    return buf


def write_wav(path: Path, buf: list[float]) -> None:
    peak = max((abs(s) for s in buf), default=1.0) or 1.0
    # Normalise to -3 dBFS. Per-event levels are applied at playback, so the
    # files themselves are all mastered to the same headroom.
    scale = (10 ** (-3 / 20)) / peak
    frames = b"".join(
        struct.pack("<h", max(-32768, min(32767, int(s * scale * 32767)))) for s in buf
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)


# name -> (total seconds, notes). Kept declarative so the shape of each cue is
# readable without running it.
SOUNDS: dict[str, tuple[float, list[tuple[str, float, float, float]]]] = {
    # Reminder arrives: two rising notes, open and questioning rather than final.
    "chime": (1.1, [("G5", 0.00, 0.55, 0.55), ("C6", 0.16, 0.85, 0.45)]),
    # Completed: a small three-note lift. The only cue that resolves upward to
    # the octave, so "done" is the most satisfying sound in the set.
    "tada": (
        1.4,
        [
            ("C5", 0.00, 0.40, 0.50),
            ("E5", 0.11, 0.45, 0.45),
            ("G5", 0.22, 0.95, 0.45),
            ("C6", 0.34, 1.00, 0.30),
        ],
    ),
    # Snooze: one short, low, downward-feeling note. Deliberately the quietest
    # and least eventful cue — it acknowledges, it does not celebrate.
    "blip": (0.5, [("A4", 0.00, 0.42, 0.42)]),
    # Focus starts: settling downward, two notes.
    "focus-in": (0.9, [("A5", 0.00, 0.40, 0.38), ("D5", 0.14, 0.70, 0.36)]),
    # Focus ends: the same pair inverted, so it reads as the bookend.
    "focus-out": (0.9, [("D5", 0.00, 0.40, 0.38), ("A5", 0.14, 0.70, 0.36)]),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()

    mismatches = []
    for name, (seconds, notes) in SOUNDS.items():
        path = OUT / f"{name}.wav"
        buf = render(seconds, notes)

        if args.check:
            if not path.exists():
                mismatches.append(f"{name}.wav missing")
                continue
            tmp = path.with_suffix(".tmp")
            write_wav(tmp, buf)
            same = tmp.read_bytes() == path.read_bytes()
            tmp.unlink()
            if not same:
                mismatches.append(f"{name}.wav differs from a fresh render")
            else:
                print(f"  ok  {name}.wav")
        else:
            write_wav(path, buf)
            size = path.stat().st_size
            print(f"  wrote {name + '.wav':16} {seconds:.2f}s  {size / 1024:6.1f} KB")

    if mismatches:
        for m in mismatches:
            print(f"FAIL: {m}", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
