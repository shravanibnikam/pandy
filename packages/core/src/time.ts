import type { MinuteOfDay, Settings, Weekday } from "@pandy/shared-types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY_MINUTES = 24 * 60;

/*
 * Two kinds of time live in this file and they must not be confused.
 *
 *   Durations (an interval, a snooze, a cooldown) are plain millisecond
 *   arithmetic. Two hours is two hours whether or not the clocks changed.
 *
 *   Wall-clock boundaries (quiet hours start, active hours end) are computed by
 *   constructing a local Date from calendar components. Adding 24h in
 *   milliseconds to get "tomorrow at 8 AM" is wrong on a DST boundary — it
 *   lands at 7 AM or 9 AM. Constructing local 8 AM on the next calendar day is
 *   right, which is why every boundary here goes through atLocalMinute.
 */

/** Minutes elapsed since local midnight. */
export function minutesIntoDay(ts: number): MinuteOfDay {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/** Local calendar day key, so daily limits reset at local midnight rather than UTC. */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function localWeekday(ts: number): Weekday {
  return new Date(ts).getDay() as Weekday;
}

/** Epoch ms of a given local minute-of-day, `dayOffset` calendar days from `ts`. */
export function atLocalMinute(ts: number, minute: MinuteOfDay, dayOffset = 0): number {
  const d = new Date(ts);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + dayOffset,
    Math.floor(minute / 60),
    minute % 60,
    0,
    0,
  ).getTime();
}

/** The first moment at or after `ts` whose local time-of-day is `minute`. */
export function nextOccurrenceOf(ts: number, minute: MinuteOfDay): number {
  const today = atLocalMinute(ts, minute, 0);
  if (today >= ts) return today;
  return atLocalMinute(ts, minute, 1);
}

/** Local midnight starting the next calendar day. */
export function nextLocalMidnight(ts: number): number {
  return atLocalMinute(ts, 0, 1);
}

/**
 * Is `minute` inside [start, end)? A start after the end means the window wraps
 * midnight — 20:00–08:00 is the default quiet window and must include 23:00
 * and 03:00 alike. start === end means the window covers the whole day.
 */
export function inWindow(minute: MinuteOfDay, start: MinuteOfDay, end: MinuteOfDay): boolean {
  if (start === end) return true;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function quietActive(settings: Settings): boolean {
  // A quiet window of zero length would suppress every reminder forever.
  // Treat it as "not configured" rather than honouring it.
  return settings.quietHours.enabled && settings.quietHours.start !== settings.quietHours.end;
}

/** Is a reminder allowed to fire at this instant, considering day/active/quiet only? */
export function isWithinAllowedWindow(ts: number, settings: Settings): boolean {
  if (!settings.workingDays.includes(localWeekday(ts))) return false;

  const minute = minutesIntoDay(ts);
  if (!inWindow(minute, settings.activeHours.start, settings.activeHours.end)) return false;
  if (quietActive(settings) && inWindow(minute, settings.quietHours.start, settings.quietHours.end))
    return false;

  return true;
}

/**
 * The next instant strictly after `ts` at which the allowed-window predicate
 * could change: a day rollover, the active window opening, or quiet hours
 * ending. Stepping boundary to boundary rather than minute by minute is what
 * keeps nextAllowedTime bounded.
 */
function nextBoundaryAfter(ts: number, settings: Settings): number {
  const candidates = [nextLocalMidnight(ts), nextOccurrenceOf(ts + 1, settings.activeHours.start)];
  if (quietActive(settings)) candidates.push(nextOccurrenceOf(ts + 1, settings.quietHours.end));

  let best = Number.POSITIVE_INFINITY;
  for (const c of candidates) if (c > ts && c < best) best = c;

  // Always make progress, even if a pathological config produced no candidate.
  return Number.isFinite(best) ? best : ts + HOUR;
}

/**
 * The first instant at or after `ts` when a reminder is allowed to fire.
 *
 * This is the deferral primitive: a reminder that comes due inside quiet hours
 * is *moved* here rather than queued, which is what stops a backlog forming.
 */
export function nextAllowedTime(ts: number, settings: Settings): number {
  let t = ts;
  // A week of boundaries is a generous ceiling; three per day is the maximum a
  // sane config produces. The cap only exists so a malformed config can't spin.
  for (let i = 0; i < 40; i++) {
    if (isWithinAllowedWindow(t, settings)) return t;
    t = nextBoundaryAfter(t, settings);
  }
  // No allowed window found in the next week — every working day may be
  // disabled. Return the original time; the caller's other gates still apply.
  return ts;
}
