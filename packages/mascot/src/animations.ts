import { MASCOT_FRAME_SIZE, type AnimationConfig, type MascotState } from "@pandy/shared-types";

/**
 * Runtime animation config. This is product behaviour, not art metadata — the
 * art was authored as eight standalone seamless loops, so every entry in the
 * delivered manifest.json is marked `loop: true`. Here, only idle and sleep
 * loop; every action plays once and hands back to idle.
 *
 * Frame counts are the measured strip width / 64 and are authoritative:
 *
 *   wave is 6 frames, not the 8 the original brief specified. wave_strip.png is
 *   384px wide. Rendering 8 would draw two empty cells and hitch every loop.
 *
 *   touchGrass points at the *stretch* strip. touch_strip.png changes character
 *   design partway through — frame 1 is the round sprouted panda, frames 2-4
 *   are a taller standing panda without a sprout — so playing it morphs the
 *   mascot into someone else and back. The strip is kept in assets/ and this
 *   line is the single place to change once the art is reconciled.
 *   See PLAN.md §1.5.
 */
export const ANIMATIONS: Readonly<Record<MascotState, AnimationConfig>> = {
  idle: { frames: 4, fps: 6, loop: true, strip: "idle_strip.png" },
  wave: { frames: 6, fps: 8, loop: false, strip: "wave_strip.png" },
  drink: { frames: 6, fps: 8, loop: false, strip: "drink_strip.png" },
  stretch: { frames: 4, fps: 8, loop: false, strip: "stretch_strip.png" },
  lookAway: { frames: 4, fps: 6, loop: false, strip: "look_strip.png" },
  touchGrass: { frames: 4, fps: 8, loop: false, strip: "stretch_strip.png" },
  sleep: { frames: 4, fps: 6, loop: true, strip: "sleep_strip.png" },
  celebrate: { frames: 8, fps: 10, loop: false, strip: "celebrate_strip.png" },
};

/** Distinct strip files actually needed at runtime — touch_strip.png is not among them. */
export const REQUIRED_STRIPS: readonly string[] = [
  ...new Set(Object.values(ANIMATIONS).map((a) => a.strip)),
];

export const FRAME_SIZE = MASCOT_FRAME_SIZE;

export function frameDurationMs(state: MascotState): number {
  return 1000 / ANIMATIONS[state].fps;
}

/** Total run time of one pass. Useful for scheduling a follow-up state. */
export function animationDurationMs(state: MascotState): number {
  const a = ANIMATIONS[state];
  return (a.frames * 1000) / a.fps;
}
