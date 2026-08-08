import { REMINDER_TYPES, type DeliveryOwner, type ReminderType } from "./reminders.js";
import {
  DEFAULT_SETTINGS,
  type CategorySettings,
  type Corner,
  type MinuteOfDay,
  type SettingsControl,
  type Settings,
  type Theme,
  type Tone,
  type Weekday,
} from "./settings.js";

/*
 * Hand-rolled validators rather than a schema library. This code sits on two
 * trust boundaries — the VS Code webview and Electron IPC — and both apps ship
 * it, so the dependency budget matters more here than the ergonomics.
 *
 * Everything is tolerant on read (missing field falls back to the default) and
 * strict on type (wrong type never silently becomes a plausible-looking value).
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Finite number in range, else the fallback. NaN and Infinity never survive. */
export function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

export function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}

export function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Bounded string array — caps both element length and count so storage can't be used as a dumping ground. */
export function strArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.slice(0, maxLen))
    .slice(0, maxItems);
}

const TONES: readonly Tone[] = ["low-key", "gen-z", "chaotic"];
const THEMES: readonly Theme[] = ["light", "dark", "system"];
const OWNERS: readonly DeliveryOwner[] = ["vscode", "desktop", "both"];
const CORNERS: readonly Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const CONTROLS: readonly SettingsControl[] = ["heart", "dot", "hidden"];
const PRESETS = ["recommended", "custom"] as const;

const MINUTES_IN_DAY = 24 * 60;

export function minuteOfDay(v: unknown, fallback: MinuteOfDay): MinuteOfDay {
  // Accept "HH:MM" as well as a raw minute count, since config files and JSON
  // settings written by hand tend to use the former.
  if (typeof v === "string") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
    }
    return fallback;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Wrap rather than clamp: 1500 minutes is 1 AM, not 11:59 PM.
    return ((Math.round(v) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  }
  return fallback;
}

export function formatMinuteOfDay(m: MinuteOfDay): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function weekdays(v: unknown, fallback: readonly Weekday[]): Weekday[] {
  if (!Array.isArray(v)) return [...fallback];
  const seen = new Set<Weekday>();
  for (const d of v) {
    if (typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6) seen.add(d as Weekday);
  }
  // An empty working-day set would silently disable every reminder forever,
  // which reads as a bug to the user. Fall back instead.
  return seen.size > 0 ? [...seen].sort() : [...fallback];
}

function category(v: unknown, fallback: CategorySettings): CategorySettings {
  const r = isRecord(v) ? v : {};
  return {
    enabled: bool(r["enabled"], fallback.enabled),
    // 1 minute floor stops a zero interval from becoming a busy loop.
    intervalMinutes: int(r["intervalMinutes"], fallback.intervalMinutes, 1, 24 * 60),
  };
}

/**
 * Normalise arbitrary input into a complete, in-range Settings object.
 * Never throws — unparseable input degrades to defaults field by field.
 */
export function parseSettings(input: unknown): Settings {
  const r = isRecord(input) ? input : {};
  const d = DEFAULT_SETTINGS;

  const cats = isRecord(r["categories"]) ? r["categories"] : {};
  const categories = {} as Record<ReminderType, CategorySettings>;
  for (const t of REMINDER_TYPES) categories[t] = category(cats[t], d.categories[t]);

  const active = isRecord(r["activeHours"]) ? r["activeHours"] : {};
  const quiet = isRecord(r["quietHours"]) ? r["quietHours"] : {};
  const sound = isRecord(r["sound"]) ? r["sound"] : {};
  const anim = isRecord(r["animation"]) ? r["animation"] : {};
  const widget = isRecord(r["widget"]) ? r["widget"] : {};

  const customRaw = isRecord(r["customMessages"]) ? r["customMessages"] : {};
  const customMessages: Partial<Record<ReminderType, readonly string[]>> = {};
  for (const t of REMINDER_TYPES) {
    const list = strArray(customRaw[t], 50, 200).filter((s) => s.trim().length > 0);
    if (list.length > 0) customMessages[t] = list;
  }

  return {
    categories,
    schedulePreset: oneOf(r["schedulePreset"], PRESETS, d.schedulePreset),

    workingDays: weekdays(r["workingDays"], d.workingDays),
    activeHours: {
      start: minuteOfDay(active["start"], d.activeHours.start),
      end: minuteOfDay(active["end"], d.activeHours.end),
    },
    quietHours: {
      enabled: bool(quiet["enabled"], d.quietHours.enabled),
      start: minuteOfDay(quiet["start"], d.quietHours.start),
      end: minuteOfDay(quiet["end"], d.quietHours.end),
    },

    snoozeMinutes: int(r["snoozeMinutes"], d.snoozeMinutes, 1, 240),
    dailyLimit:
      r["dailyLimit"] === null || r["dailyLimit"] === undefined
        ? null
        : int(r["dailyLimit"], 20, 1, 200),
    randomizationMinutes: int(r["randomizationMinutes"], d.randomizationMinutes, 0, 60),
    focusModeMinutes: int(r["focusModeMinutes"], d.focusModeMinutes, 5, 480),
    cooldownMinutes: int(r["cooldownMinutes"], d.cooldownMinutes, 0, 120),

    tone: oneOf(r["tone"], TONES, d.tone),
    customMessages,

    sound: {
      enabled: bool(sound["enabled"], d.sound.enabled),
      volume: num(sound["volume"], d.sound.volume, 0, 1),
      focusCues: bool(sound["focusCues"], d.sound.focusCues),
    },
    animation: {
      enabled: bool(anim["enabled"], d.animation.enabled),
      reducedMotion: bool(anim["reducedMotion"], d.animation.reducedMotion),
      // Integer only — a fractional scale resamples the sprite and breaks the
      // shared 61-row baseline every frame is drawn against.
      mascotScale: int(anim["mascotScale"], d.animation.mascotScale, 1, 8),
    },
    widget: {
      visible: bool(widget["visible"], d.widget.visible),
      corner: oneOf(widget["corner"], CORNERS, d.widget.corner),
      opacity: num(widget["opacity"], d.widget.opacity, 0.2, 1),
      alwaysOnTop: bool(widget["alwaysOnTop"], d.widget.alwaysOnTop),
      visibleOnAllWorkspaces: bool(
        widget["visibleOnAllWorkspaces"],
        d.widget.visibleOnAllWorkspaces,
      ),
      locked: bool(widget["locked"], d.widget.locked),
      settingsControl: oneOf(widget["settingsControl"], CONTROLS, d.widget.settingsControl),
    },

    launchAtLogin: bool(r["launchAtLogin"], d.launchAtLogin),
    deliveryOwner: oneOf(r["deliveryOwner"], OWNERS, d.deliveryOwner),
    theme: oneOf(r["theme"], THEMES, d.theme),
  };
}

export function isReminderType(v: unknown): v is ReminderType {
  return typeof v === "string" && (REMINDER_TYPES as readonly string[]).includes(v);
}
