import type { SoundSettings } from "@pandy/shared-types";

/**
 * Pandy's sound cues.
 *
 * Rules this file exists to guarantee:
 *   - sound is off by default and stays off until the user turns it on
 *   - nothing ever loops; `loop` is never set and is asserted false before play
 *   - nothing autoplays when the settings panel opens — playback happens only
 *     from a real reminder event or an explicit Test press
 *   - a preview stops whatever was playing rather than layering on top of it
 */

export type SoundEvent = "reminder" | "completed" | "snoozed" | "focusStart" | "focusEnd";

export interface SoundSpec {
  readonly file: string;
  /** Relative level for this cue, multiplied by the user's master volume. */
  readonly level: number;
  /** Shown in settings next to the Test button. */
  readonly label: string;
  readonly description: string;
  /** Focus cues are opt-in separately, even once sound is enabled. */
  readonly optional: boolean;
}

/**
 * The event → sound mapping. Fixed rather than user-reassignable: each cue is
 * shaped for its moment (the completion sound is the only one that resolves
 * upward; snooze is the quietest and least eventful), so swapping them would
 * make the set read worse, not better.
 */
export const SOUNDS: Readonly<Record<SoundEvent, SoundSpec>> = {
  reminder: {
    file: "chime.wav",
    level: 0.6,
    label: "A reminder arrives",
    description: "Two soft rising notes.",
    optional: false,
  },
  completed: {
    file: "tada.wav",
    level: 0.6,
    label: "You mark one done",
    description: "A small four-note lift.",
    optional: false,
  },
  snoozed: {
    file: "blip.wav",
    level: 0.5,
    label: "You snooze one",
    description: "One short low note.",
    optional: false,
  },
  focusStart: {
    file: "focus-in.wav",
    level: 0.5,
    label: "Focus mode starts",
    description: "A settling pair of notes.",
    optional: true,
  },
  focusEnd: {
    file: "focus-out.wav",
    level: 0.5,
    label: "Focus mode ends",
    description: "The same pair, inverted.",
    optional: true,
  },
};

export const SOUND_EVENTS = Object.keys(SOUNDS) as SoundEvent[];

/**
 * Guards the value arriving over IPC — main is trusted, the shape is not.
 *
 * `hasOwn`, not `in`: `in` walks the prototype chain, so `"toString"` and
 * `"constructor"` would both pass and then resolve to a function rather than a
 * sound spec.
 */
export function isSoundEvent(value: unknown): value is SoundEvent {
  return typeof value === "string" && Object.hasOwn(SOUNDS, value);
}

export class SoundPlayer {
  readonly #base: string;
  readonly #cache = new Map<SoundEvent, HTMLAudioElement>();
  #settings: SoundSettings;
  #playing: HTMLAudioElement | null = null;

  constructor(baseUrl: string, settings: SoundSettings) {
    this.#base = baseUrl.replace(/\/$/, "");
    this.#settings = settings;
  }

  setSettings(settings: SoundSettings): void {
    this.#settings = settings;
    if (!settings.enabled) this.stop();
  }

  /** Whether a real event of this kind would currently make a sound. */
  wouldPlay(event: SoundEvent): boolean {
    if (!this.#settings.enabled) return false;
    if (SOUNDS[event].optional && !this.#settings.focusCues) return false;
    return this.#settings.volume > 0;
  }

  /** Play a cue for a real event. Silent unless the user has enabled sound. */
  play(event: SoundEvent): void {
    if (!this.wouldPlay(event)) return;
    this.#start(event);
  }

  /**
   * Play a cue because the user pressed Test.
   *
   * Deliberately works even when sound is switched off, so the set can be
   * auditioned before committing to it. This is an explicit gesture, which is
   * exactly what the no-autoplay rule is there to protect.
   */
  preview(event: SoundEvent): void {
    this.#start(event, Math.max(this.#settings.volume, 0.2));
  }

  stop(): void {
    if (!this.#playing) return;
    this.#playing.pause();
    this.#playing.currentTime = 0;
    this.#playing = null;
  }

  #start(event: SoundEvent, masterOverride?: number): void {
    const spec = SOUNDS[event];
    // One cue at a time: a preview must replace, never layer.
    this.stop();

    const audio = this.#element(event);
    const master = masterOverride ?? this.#settings.volume;
    audio.volume = clamp01(master * spec.level);
    audio.currentTime = 0;
    // Belt and braces — a looping reminder would be genuinely unpleasant.
    audio.loop = false;

    this.#playing = audio;
    void audio.play().catch(() => {
      // Autoplay policy or a missing file. Silence is an acceptable outcome for
      // a wellness cue; it is never worth surfacing an error over.
      this.#playing = null;
    });
    audio.onended = () => {
      if (this.#playing === audio) this.#playing = null;
    };
  }

  #element(event: SoundEvent): HTMLAudioElement {
    const cached = this.#cache.get(event);
    if (cached) return cached;
    const audio = new Audio(`${this.#base}/${SOUNDS[event].file}`);
    audio.preload = "auto";
    audio.loop = false;
    this.#cache.set(event, audio);
    return audio;
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
