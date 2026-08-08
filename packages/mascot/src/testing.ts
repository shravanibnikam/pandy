import { ANIMATIONS, FRAME_SIZE } from "./animations.js";
import type { DrawTarget, FrameHost, SpriteImage, SpriteSheet } from "./ports.js";

export interface DrawCall {
  readonly sx: number;
  readonly frame: number;
}

export interface RecordingContext extends DrawTarget {
  readonly calls: readonly DrawCall[];
  readonly clears: number;
}

export function recordingContext(): RecordingContext {
  const calls: DrawCall[] = [];
  let clears = 0;
  return {
    imageSmoothingEnabled: true,
    clearRect: () => {
      clears++;
    },
    drawImage: (_image: SpriteImage, sx: number) => {
      calls.push({ sx, frame: Math.round(sx / FRAME_SIZE) });
    },
    get calls() {
      return calls;
    },
    get clears() {
      return clears;
    },
  };
}

/** A frame host the test steps by hand — nothing runs on a real display clock. */
export class ManualFrameHost implements FrameHost {
  #seq = 0;
  #pending = new Map<number, (t: number) => void>();

  requestAnimationFrame(cb: (timeMs: number) => void): number {
    const id = ++this.#seq;
    this.#pending.set(id, cb);
    return id;
  }

  cancelAnimationFrame(handle: number): void {
    this.#pending.delete(handle);
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Deliver one animation frame at the given timestamp. */
  step(timeMs: number): void {
    const due = [...this.#pending.entries()];
    this.#pending.clear();
    for (const [, cb] of due) cb(timeMs);
  }

  /** Advance across `count` frames, `stepMs` apart. */
  run(count: number, stepMs: number, startAt = 0): void {
    for (let i = 1; i <= count; i++) this.step(startAt + i * stepMs);
  }
}

/** Sheets sized from the real animation config, without touching a real PNG. */
export function fakeSheets(): Record<string, SpriteSheet> {
  const sheets: Record<string, SpriteSheet> = {};
  for (const config of Object.values(ANIMATIONS)) {
    sheets[config.strip] = {
      image: { width: config.frames * FRAME_SIZE, height: FRAME_SIZE },
      frames: config.frames,
    };
  }
  return sheets;
}
