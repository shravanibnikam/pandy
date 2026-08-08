import type { Clock, StorageAdapter, TimerHandle } from "./ports.js";

/**
 * A clock the tests drive by hand. Nothing in the suite ever waits in real
 * time; `advance` moves the clock and runs whatever that would have triggered.
 *
 * `liveTimerCount` is exposed deliberately — "exactly one active timer" is a
 * product requirement, so it needs to be observable rather than inferred.
 */
export class FakeClock implements Clock {
  #now: number;
  #seq = 0;
  readonly #timers = new Map<number, { at: number; fn: () => void }>();

  constructor(start: number | Date = 0) {
    this.#now = start instanceof Date ? start.getTime() : start;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = ++this.#seq;
    this.#timers.set(id, { at: this.#now + Math.max(0, ms), fn });
    return id as unknown as TimerHandle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.#timers.delete(handle as unknown as number);
  }

  get liveTimerCount(): number {
    return this.#timers.size;
  }

  /** Milliseconds until the next scheduled callback, or null if idle. */
  get nextTimerIn(): number | null {
    let best = Number.POSITIVE_INFINITY;
    for (const t of this.#timers.values()) best = Math.min(best, t.at);
    return Number.isFinite(best) ? best - this.#now : null;
  }

  /** Move the clock forward, firing timers in order as their time arrives. */
  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    // Bounded so a scheduling bug surfaces as a failed assertion rather than a
    // test run that never terminates.
    for (let guard = 0; guard < 10_000; guard++) {
      let nextId: number | null = null;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, t] of this.#timers) {
        if (t.at <= target && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId === null) break;

      const timer = this.#timers.get(nextId)!;
      this.#timers.delete(nextId);
      this.#now = Math.max(this.#now, timer.at);
      timer.fn();
      await drainMicrotasks();
    }
    this.#now = target;
    await drainMicrotasks();
  }

  /**
   * Jump the clock without running anything in between — a laptop sleeping, or
   * the wall clock being corrected. Pending timers keep their original due
   * times, so the next advance fires them late, exactly as a real host would.
   */
  async jumpTo(ts: number): Promise<void> {
    this.#now = ts;
    await drainMicrotasks();
  }

  /** Run every timer that is now due without moving the clock further. */
  async runDue(): Promise<void> {
    await this.advance(0);
  }
}

/**
 * Yielding to a macrotask drains the whole microtask queue, so an async chain
 * of any depth inside the engine has completed by the time this resolves.
 */
export function drainMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

export interface RecordingStorage extends StorageAdapter {
  readonly writes: number;
  snapshot(): Record<string, unknown>;
  seed(key: string, value: unknown): void;
}

/** In-memory storage that also counts writes, for persistence assertions. */
export function recordingStorage(initial: Record<string, unknown> = {}): RecordingStorage {
  const map = new Map<string, unknown>(Object.entries(initial));
  let writes = 0;
  return {
    read: async <T>(key: string) => map.get(key) as T | undefined,
    write: async <T>(key: string, value: T) => {
      writes++;
      // Round-trip through JSON so tests catch anything not actually persistable.
      map.set(key, JSON.parse(JSON.stringify(value)));
    },
    get writes() {
      return writes;
    },
    snapshot: () => Object.fromEntries(map),
    seed: (key, value) => {
      map.set(key, value);
    },
  };
}

/** Deterministic rng cycling a fixed sequence, so jitter is reproducible. */
export function seededRng(values: readonly number[] = [0.5]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** Local-time helper for building readable test timestamps. */
export function localTime(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): number {
  return new Date(y, mo - 1, d, h, mi, s, 0).getTime();
}
