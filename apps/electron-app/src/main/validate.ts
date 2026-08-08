import { REMINDER_TYPES, isRecord, type ReminderResult, type ReminderType } from "@pandy/shared-types";

/**
 * Every IPC payload is validated here, in the main process, regardless of what
 * the preload script's types claim. The renderer is sandboxed but it is still
 * the untrusted side of the boundary — a compromised or simply buggy renderer
 * must not be able to hand main a value it will act on unchecked.
 *
 * Each validator returns null on bad input; the caller drops the message.
 */

const RESULTS: readonly ReminderResult[] = ["completed", "snoozed", "dismissed", "paused"];

export function reminderTypeOf(value: unknown): ReminderType | null {
  return typeof value === "string" && (REMINDER_TYPES as readonly string[]).includes(value)
    ? (value as ReminderType)
    : null;
}

export function reminderResultOf(value: unknown): ReminderResult | null {
  return typeof value === "string" && (RESULTS as readonly string[]).includes(value)
    ? (value as ReminderResult)
    : null;
}

export interface ResolvePayload {
  readonly type: ReminderType;
  readonly result: ReminderResult;
}

export function resolvePayloadOf(raw: unknown): ResolvePayload | null {
  if (!isRecord(raw)) return null;
  const type = reminderTypeOf(raw["type"]);
  const result = reminderResultOf(raw["result"]);
  return type && result ? { type, result } : null;
}

/** Finite integer in range. Rejects NaN, Infinity and non-numbers outright. */
export function boundedInt(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  return n >= min && n <= max ? n : null;
}

export function pauseMinutesOf(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  return boundedInt(raw["minutes"], 1, 24 * 60);
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Widget coordinates. Bounded generously rather than to the current display —
 * clamping to a real monitor happens in widgetWindow, which knows the layout.
 * This only rejects values that could not be a screen coordinate at all.
 */
export function pointOf(raw: unknown): Point | null {
  if (!isRecord(raw)) return null;
  const x = boundedInt(raw["x"], -32_000, 32_000);
  const y = boundedInt(raw["y"], -32_000, 32_000);
  return x === null || y === null ? null : { x, y };
}

export function booleanFieldOf(raw: unknown, field: string): boolean | null {
  if (!isRecord(raw)) return null;
  const value = raw[field];
  return typeof value === "boolean" ? value : null;
}

/**
 * A settings patch from the settings panel. Only plain JSON values are allowed
 * through; the result still goes through parseSettings, which clamps every
 * field, so an out-of-range number here cannot become an out-of-range setting.
 */
export function settingsPatchOf(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (!isPlainJson(raw, 0)) return null;
  return raw;
}

function isPlainJson(value: unknown, depth: number): boolean {
  // Bounded depth stops a deeply nested payload from becoming a stack overflow.
  if (depth > 6) return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "boolean") return true;
  if (t === "number") return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every((v) => isPlainJson(v, depth + 1));
  if (isRecord(value)) return Object.values(value).every((v) => isPlainJson(v, depth + 1));
  return false;
}
