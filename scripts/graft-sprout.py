#!/usr/bin/env python3
"""
Graft the bamboo sprout onto the wave and drink sprite strips.

The supplied art draws the sprout on idle, stretch, look, sleep and celebrate,
but not on wave or drink. Without this, every idle -> wave transition visibly
pops the sprout off the panda's head and pops it back on the way out.

No pixels are invented. The sprout is lifted verbatim from idle frame 1 and
translated vertically to follow each target frame's head. Nothing already drawn
is overwritten -- a stamped pixel only lands where the target is transparent --
so the wave and drink art itself is untouched.

Anchoring uses the topmost white (body) pixel rather than the topmost opaque
pixel. Black is used for both the ears and the raised paws, so an opaque-pixel
anchor would jump around whenever a paw goes up; the white head crown does not.

Usage:  python3 scripts/graft-sprout.py [--check]
        --check verifies the shipped strips already match, and exits non-zero
        if they do not. Safe to run in CI.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

FRAME = 64
ROOT = Path(__file__).resolve().parent.parent
SHIPPED = ROOT / "assets" / "mascot" / "strips"
ORIGINALS = ROOT / "design" / "mascot" / "original-strips"

# The sprout lives in these rows of idle frame 1. Rows 11-19 are sprout alone;
# rows 20-21 hold the stem, flanked by ears that must not be copied, so those
# two rows are restricted to the columns between the ears.
SPROUT_ROWS = range(11, 20)
STEM_ROWS = range(20, 22)
STEM_X = range(26, 39)

TARGETS = ("wave", "drink")


def load_frames(path: Path) -> list[Image.Image]:
    img = Image.open(path).convert("RGBA")
    return [img.crop((i * FRAME, 0, (i + 1) * FRAME, FRAME)) for i in range(img.width // FRAME)]


def save_frames(frames: list[Image.Image], path: Path) -> None:
    out = Image.new("RGBA", (FRAME * len(frames), FRAME), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * FRAME, 0))
    out.save(path)


def is_green(p: tuple[int, int, int, int]) -> bool:
    r, g, b, a = p
    return a > 0 and g > r + 15 and g > b + 15


def white_top(frame: Image.Image) -> int:
    """Row of the topmost body (white) pixel -- the stable head anchor."""
    px = frame.load()
    for y in range(FRAME):
        for x in range(FRAME):
            r, g, b, a = px[x, y]
            if a > 0 and r > 200 and g > 200 and b > 200:
                return y
    raise ValueError("no white pixels found; is this the right sprite?")


def build_stamp(idle_f1: Image.Image) -> list[tuple[int, int, tuple[int, int, int, int]]]:
    """The sprout as (x, y, rgba) offsets, lifted verbatim from idle frame 1."""
    px = idle_f1.load()
    stamp = []
    for y in SPROUT_ROWS:
        for x in range(FRAME):
            if px[x, y][3] > 0:
                stamp.append((x, y, px[x, y]))
    for y in STEM_ROWS:
        for x in STEM_X:
            if px[x, y][3] > 0:
                stamp.append((x, y, px[x, y]))
    return stamp


def graft(frame: Image.Image, stamp, dy: int) -> tuple[Image.Image, int, int]:
    """Stamp the sprout onto a copy of `frame`. Returns (image, drawn, skipped)."""
    out = frame.copy()
    px = out.load()
    drawn = skipped = 0
    for x, y, rgba in stamp:
        ty = y + dy
        if not (0 <= ty < FRAME):
            skipped += 1
            continue
        # Never paint over existing art -- the sprout goes behind, not through.
        if px[x, ty][3] != 0:
            skipped += 1
            continue
        px[x, ty] = rgba
        drawn += 1
    return out, drawn, skipped


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()

    idle_f1 = load_frames(SHIPPED / "idle_strip.png")[0]
    stamp = build_stamp(idle_f1)
    anchor = white_top(idle_f1)
    print(f"sprout stamp: {len(stamp)} pixels, idle anchor row {anchor}")

    ORIGINALS.mkdir(parents=True, exist_ok=True)
    failures = []

    for name in TARGETS:
        shipped_path = SHIPPED / f"{name}_strip.png"
        original_path = ORIGINALS / f"{name}_strip.png"

        # The pristine strip is the source of truth; keep one the first time so
        # this script stays idempotent and re-runnable.
        if not original_path.exists():
            if args.check:
                failures.append(f"{name}: no original kept at {original_path}")
                continue
            Image.open(shipped_path).save(original_path)

        frames = load_frames(original_path)
        if any(is_green(f.load()[x, y]) for f in frames for y in range(FRAME) for x in range(FRAME)):
            failures.append(f"{name}: original already contains green; refusing to graft twice")
            continue

        grafted = []
        for i, frame in enumerate(frames):
            dy = white_top(frame) - anchor
            out, drawn, skipped = graft(frame, stamp, dy)
            grafted.append(out)
            print(f"  {name} f{i + 1}: dy={dy:+d}  drawn={drawn}  skipped={skipped}")

        if args.check:
            current = load_frames(shipped_path)
            if len(current) != len(grafted) or any(
                a.tobytes() != b.tobytes() for a, b in zip(current, grafted)
            ):
                failures.append(f"{name}: shipped strip does not match a fresh graft")
        else:
            save_frames(grafted, shipped_path)
            print(f"  wrote {shipped_path.relative_to(ROOT)}")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
