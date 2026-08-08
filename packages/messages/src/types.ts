import type { ReminderType, Tone } from "@pandy/shared-types";

/** 1 = barely a nudge, 2 = normal, 3 = the most insistent Pandy ever gets. */
export type Intensity = 1 | 2 | 3;

export interface Message {
  /** Stable id, used for non-repetition tracking. Never shown to the user. */
  readonly id: string;
  readonly type: ReminderType;
  readonly tone: Tone;
  readonly intensity: Intensity;
  readonly text: string;
}

/** A user-authored message, folded into the pool for its category. */
export const CUSTOM_ID_PREFIX = "custom:";
