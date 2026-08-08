/** Every pose the mascot can be in. */
export type MascotState =
  | "idle"
  | "wave"
  | "drink"
  | "stretch"
  | "lookAway"
  | "touchGrass"
  | "sleep"
  | "celebrate";

export const MASCOT_STATES: readonly MascotState[] = [
  "idle",
  "wave",
  "drink",
  "stretch",
  "lookAway",
  "touchGrass",
  "sleep",
  "celebrate",
] as const;

/** The sprite cell is a fixed square; frames are never resized at runtime. */
export const MASCOT_FRAME_SIZE = 64;

export interface AnimationConfig {
  /** Number of cells in the strip. Must equal stripWidth / MASCOT_FRAME_SIZE. */
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  /** Strip filename in assets/mascot/strips/. */
  readonly strip: string;
}
