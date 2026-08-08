/**
 * The engine talks to the outside world only through these. Nothing in
 * packages/core imports a platform API, which is what makes the whole thing
 * testable against a fake clock rather than against real elapsed time.
 */

export type TimerHandle = { readonly __brand: "TimerHandle" };

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface StorageAdapter {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
}

/** Injected so scheduling randomisation is deterministic under test. */
export type Rng = () => number;

/** Wraps the host's real timers. */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (h) => globalThis.clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
};

/** Storage that forgets everything. Useful for tests and for a first run. */
export function memoryStorage(): StorageAdapter {
  const map = new Map<string, unknown>();
  return {
    read: async <T>(key: string) => map.get(key) as T | undefined,
    write: async <T>(key: string, value: T) => {
      map.set(key, value);
    },
  };
}
