import type { ReminderType, Tone } from "@pandy/shared-types";
import { builtInFor } from "./pool.js";
import { CUSTOM_ID_PREFIX, type Message } from "./types.js";

export interface PickOptions {
  readonly type: ReminderType;
  readonly tone: Tone;
  /** User-authored messages for this category. Used in every tone — they're the user's words. */
  readonly custom?: readonly string[] | undefined;
  /** Ids shown since the pool last cycled. */
  readonly recent?: readonly string[] | undefined;
  /** Injected for deterministic tests. */
  readonly rng?: (() => number) | undefined;
}

export interface PickResult {
  readonly message: Message;
  /** Replaces the stored recent list for this category. */
  readonly recent: readonly string[];
}

/** Absolute last resort, so a reminder is never blank even with an empty pool. */
const FALLBACK: Record<ReminderType, string> = {
  water: "Time for some water.",
  stand: "Time to stand and stretch.",
  lookAway: "Time to look away from the screen.",
  touchGrass: "Time for a short break outside.",
};

function customMessages(type: ReminderType, tone: Tone, custom: readonly string[]): Message[] {
  return custom.map((text, i) => ({
    id: `${CUSTOM_ID_PREFIX}${type}:${i}`,
    type,
    tone,
    intensity: 2 as const,
    text,
  }));
}

function buildPool(type: ReminderType, tone: Tone, custom: readonly string[]): Message[] {
  const pool: Message[] = [...builtInFor(type, tone), ...customMessages(type, tone, custom)];
  if (pool.length > 0) return pool;

  // A tone with no built-ins should still say something sensible.
  const lowKey = builtInFor(type, "low-key");
  if (lowKey.length > 0) return [...lowKey];

  return [{ id: `${type}.fallback`, type, tone, intensity: 2, text: FALLBACK[type] }];
}

/**
 * Pick the next message for a category, never repeating until the pool has
 * cycled. When the pool does cycle, the message that was shown immediately
 * before is excluded from the first pick of the new cycle — otherwise the one
 * case a user is guaranteed to notice, the same line twice in a row, is exactly
 * the one the non-repetition rule fails to cover.
 */
export function pickMessage(opts: PickOptions): PickResult {
  const { type, tone } = opts;
  const rng = opts.rng ?? Math.random;
  const pool = buildPool(type, tone, opts.custom ?? []);
  const poolIds = new Set(pool.map((p) => p.id));

  // Drop ids that are no longer in the pool — a tone switch or an edited custom
  // list would otherwise leave stale entries suppressing valid messages.
  const recent = (opts.recent ?? []).filter((id) => poolIds.has(id));
  const lastShown = recent.length > 0 ? recent[recent.length - 1] : undefined;

  const unseen = pool.filter((msg) => !recent.includes(msg.id));

  let candidates: Message[];
  let carried: readonly string[];

  if (unseen.length > 0) {
    candidates = unseen;
    carried = recent;
  } else {
    // Pool exhausted — start a new cycle.
    carried = [];
    candidates = pool.length > 1 ? pool.filter((msg) => msg.id !== lastShown) : pool;
  }

  const chosen = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  // candidates is non-empty by construction; this satisfies noUncheckedIndexedAccess.
  const message = chosen ?? pool[0]!;

  return { message, recent: [...carried, message.id] };
}
