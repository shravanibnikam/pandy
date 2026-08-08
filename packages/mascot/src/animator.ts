import type { MascotState } from "@pandy/shared-types";
import { ANIMATIONS, FRAME_SIZE } from "./animations.js";
import { browserFrameHost, type DrawTarget, type FrameHost, type SpriteSheet } from "./ports.js";

export interface AnimatorOptions {
  readonly ctx: DrawTarget;
  /** One entry per distinct strip file, keyed by filename. */
  readonly sheets: Readonly<Record<string, SpriteSheet>>;
  readonly host?: FrameHost;
  readonly reducedMotion?: boolean;
  /** Called when a non-looping animation finishes and hands back to idle. */
  readonly onSettled?: (state: MascotState) => void;
}

/**
 * Draws the 64x64 mascot.
 *
 * Every frame is blitted at native size and the canvas is scaled by CSS with
 * integer factors. Resizing frames at runtime would resample them, and since
 * every grounded frame's feet land on row 61 and the body centre is locked to
 * x ≈ 31.6, resampling makes the panda visibly bob between frames.
 */
export class MascotAnimator {
  readonly #ctx: DrawTarget;
  readonly #sheets: Readonly<Record<string, SpriteSheet>>;
  readonly #host: FrameHost;
  readonly #onSettled: ((state: MascotState) => void) | undefined;

  #state: MascotState = "idle";
  #frame = 0;
  #handle: number | null = null;
  /** null until the first callback establishes a time origin. Not 0 — a real
   *  rAF timestamp can legitimately be 0, which would re-prime forever. */
  #lastFrameAt: number | null = null;
  #visible = true;
  #reducedMotion: boolean;
  #destroyed = false;
  /** Counts actual blits, so tests can prove nothing is drawn while hidden. */
  #draws = 0;

  constructor(options: AnimatorOptions) {
    this.#ctx = options.ctx;
    this.#sheets = options.sheets;
    this.#host = options.host ?? browserFrameHost;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#onSettled = options.onSettled;

    // Hard edges are the entire point of pixel art.
    this.#ctx.imageSmoothingEnabled = false;
  }

  get state(): MascotState {
    return this.#state;
  }

  get frame(): number {
    return this.#frame;
  }

  get running(): boolean {
    return this.#handle !== null;
  }

  get drawCount(): number {
    return this.#draws;
  }

  /** Switch pose. Always cancels the in-flight animation before starting the new one. */
  setState(next: MascotState): void {
    if (this.#destroyed) return;
    this.#cancel();
    this.#state = next;
    this.#frame = 0;
    this.#lastFrameAt = null;
    this.#render();
    this.#maybeStart();
  }

  /**
   * Show or hide. Hiding stops the loop outright rather than continuing to
   * schedule frames nobody can see — this is the whole reason a widget parked
   * in a corner costs nothing while it is tucked away.
   */
  setVisible(visible: boolean): void {
    if (this.#visible === visible || this.#destroyed) return;
    this.#visible = visible;
    if (visible) {
      this.#render();
      this.#maybeStart();
    } else {
      this.#cancel();
    }
  }

  get visible(): boolean {
    return this.#visible;
  }

  /** Reduced motion renders the first frame and never schedules a loop. */
  setReducedMotion(reduced: boolean): void {
    if (this.#reducedMotion === reduced || this.#destroyed) return;
    this.#reducedMotion = reduced;
    this.#frame = 0;
    this.#cancel();
    this.#render();
    this.#maybeStart();
  }

  get reducedMotion(): boolean {
    return this.#reducedMotion;
  }

  destroy(): void {
    this.#cancel();
    this.#destroyed = true;
  }

  #cancel(): void {
    if (this.#handle !== null) {
      this.#host.cancelAnimationFrame(this.#handle);
      this.#handle = null;
    }
  }

  #maybeStart(): void {
    if (this.#destroyed || !this.#visible || this.#reducedMotion) return;
    // A single-frame animation has nothing to advance.
    if (ANIMATIONS[this.#state].frames <= 1) return;
    if (this.#handle !== null) return;
    this.#handle = this.#host.requestAnimationFrame(this.#tick);
  }

  readonly #tick = (timeMs: number): void => {
    this.#handle = null;
    if (this.#destroyed || !this.#visible || this.#reducedMotion) return;

    const config = ANIMATIONS[this.#state];
    const frameMs = 1000 / config.fps;

    if (this.#lastFrameAt === null) {
      // First callback of this animation: record the origin, advance nothing.
      this.#lastFrameAt = timeMs;
      this.#maybeStart();
      return;
    }

    const elapsed = timeMs - this.#lastFrameAt;
    if (elapsed >= frameMs) {
      // Advance by whole frames. A long stall (a background tab, a slow paint)
      // catches up rather than replaying the animation in slow motion.
      const steps = Math.floor(elapsed / frameMs);
      this.#lastFrameAt += steps * frameMs;
      const next = this.#frame + steps;

      if (next >= config.frames) {
        if (config.loop) {
          this.#frame = next % config.frames;
          this.#render();
        } else {
          // One-shot finished: hand back to idle. The engine relies on this
          // rather than emitting an idle state of its own, which would
          // truncate whatever was playing.
          const finished = this.#state;
          this.#state = "idle";
          this.#frame = 0;
          this.#lastFrameAt = null;
          this.#render();
          this.#onSettled?.(finished);
        }
      } else {
        this.#frame = next;
        this.#render();
      }
    }
    // No redraw when the frame has not changed — rAF runs at display rate,
    // but a 6fps animation should not repaint 120 times a second.

    this.#maybeStart();
  };

  #render(): void {
    if (!this.#visible || this.#destroyed) return;
    const sheet = this.#sheets[ANIMATIONS[this.#state].strip];
    if (!sheet) return;

    const frame = Math.min(this.#frame, sheet.frames - 1);
    this.#ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    this.#ctx.drawImage(
      sheet.image,
      frame * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
    this.#draws++;
  }
}
