import type { DeliveryOwner } from "@pandy/shared-types";

/**
 * Duplicate-reminder prevention.
 *
 * Both products can be installed at once, and two notifications for the same
 * nudge is the fastest way to make someone uninstall a wellness app. The
 * desktop app writes a heartbeat; the VS Code extension reads it and steps
 * aside when the desktop app is live and owns delivery.
 *
 * The path derivation lives in each host (it needs Node's os/path); everything
 * that decides anything lives here, where it can be tested.
 */

export interface Heartbeat {
  readonly pid: number;
  /** Epoch ms the desktop app last refreshed this. */
  readonly updatedAt: number;
}

/**
 * A heartbeat older than this is treated as dead. Comfortably longer than the
 * desktop app's refresh interval, so a busy machine does not look like a crash,
 * and short enough that uninstalling the desktop app hands delivery back to VS
 * Code within a couple of minutes rather than silencing reminders forever.
 */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/** How often the desktop app should refresh its heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

export function isHeartbeatLive(
  heartbeat: Heartbeat | null | undefined,
  now: number,
  staleMs = HEARTBEAT_STALE_MS,
): boolean {
  if (!heartbeat || typeof heartbeat.updatedAt !== "number") return false;
  const age = now - heartbeat.updatedAt;
  // A heartbeat from the future means the clock moved; treat it as live rather
  // than as garbage, since the alternative is duplicate notifications.
  return age < staleMs;
}

export function parseHeartbeat(raw: string | null | undefined): Heartbeat | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { pid, updatedAt } = parsed as Record<string, unknown>;
    if (typeof pid !== "number" || typeof updatedAt !== "number") return null;
    return { pid, updatedAt };
  } catch {
    return null;
  }
}

export interface OwnershipQuery {
  readonly preference: DeliveryOwner;
  readonly desktopHeartbeat: Heartbeat | null;
  readonly now: number;
}

/** Should the VS Code extension show a notification for this reminder? */
export function vscodeShouldNotify(q: OwnershipQuery): boolean {
  const desktopLive = isHeartbeatLive(q.desktopHeartbeat, q.now);
  switch (q.preference) {
    case "vscode":
      return true;
    case "both":
      // "Both" means both surfaces are welcome, not that one nudge becomes two.
      // The desktop app has the richer presentation, so it wins while running.
      return !desktopLive;
    case "desktop":
      // Deliberately falls back rather than going silent: if the desktop app is
      // gone, uninstalled or crashed, reminders should still arrive somewhere.
      return !desktopLive;
  }
}

/** Should the desktop app show a notification for this reminder? */
export function desktopShouldNotify(preference: DeliveryOwner): boolean {
  return preference !== "vscode";
}

/**
 * The status bar stays visible even when the desktop app owns notifications —
 * it is ambient information, not an interruption, and hiding it would make the
 * extension look broken.
 */
export function vscodeShouldShowStatusBar(): boolean {
  return true;
}
