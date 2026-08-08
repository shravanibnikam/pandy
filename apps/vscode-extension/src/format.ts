/**
 * Pure countdown formatting, deliberately free of any vscode import so it can
 * be tested outside the extension host.
 */

/** "45m", "2h", "1h 30m", "<1m" — compact enough for a status bar. */
export function formatShort(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Spelled out, for the tooltip and for screen readers. */
export function formatLong(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "1 hour" : `${hours} hours`;
  return rest === 0 ? h : `${h} ${rest} min`;
}

/**
 * Milliseconds until `formatShort` would render something different.
 *
 * This is what lets the status bar refresh on a self-scheduling timeout rather
 * than a periodic tick: it wakes at the moment the text changes and not before.
 * Since formatShort rounds, the label flips on the half-minute.
 */
export function msUntilLabelChanges(remaining: number): number {
  if (remaining <= 0) return 1_000;
  const minutes = remaining / 60_000;
  const flipsAt = Math.floor(minutes - 0.5) + 0.5;
  const ms = (minutes - Math.max(flipsAt, 0)) * 60_000;
  // A tiny positive result would busy-wake; a non-positive one means we are
  // already at the boundary. Either way, half a minute is the sane floor.
  return ms > 1 ? ms : 30_000;
}
