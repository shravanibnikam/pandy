import type { DeliveryOwner, ReminderType } from "./reminders.js";

/** Message voice. `low-key` is the slang-free option. */
export type Tone = "low-key" | "gen-z" | "chaotic";

export type Theme = "light" | "dark" | "system";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Minutes since local midnight. Stored as a number so midnight-crossing maths stays trivial. */
export type MinuteOfDay = number;

/** 0 = Sunday … 6 = Saturday, matching Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CategorySettings {
  readonly enabled: boolean;
  readonly intervalMinutes: number;
}

export interface TimeWindow {
  readonly start: MinuteOfDay;
  readonly end: MinuteOfDay;
}

export interface QuietHours extends TimeWindow {
  readonly enabled: boolean;
}

export interface SoundSettings {
  readonly enabled: boolean;
  /** 0..1 */
  readonly volume: number;
}

export interface AnimationSettings {
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  /** Integer CSS scale factor for the 64px canvas. Never a fractional resize. */
  readonly mascotScale: number;
}

export interface WidgetSettings {
  readonly visible: boolean;
  readonly corner: Corner;
  /** 0.2..1 */
  readonly opacity: number;
  readonly alwaysOnTop: boolean;
  readonly visibleOnAllWorkspaces: boolean;
  readonly locked: boolean;
}

export interface Settings {
  readonly categories: Readonly<Record<ReminderType, CategorySettings>>;
  readonly schedulePreset: "recommended" | "custom";

  readonly workingDays: readonly Weekday[];
  readonly activeHours: TimeWindow;
  readonly quietHours: QuietHours;

  readonly snoozeMinutes: number;
  /** null = no limit. */
  readonly dailyLimit: number | null;
  readonly randomizationMinutes: number;
  readonly focusModeMinutes: number;
  /** Global minimum gap between any two reminders, of any type. */
  readonly cooldownMinutes: number;

  readonly tone: Tone;
  readonly customMessages: Readonly<Partial<Record<ReminderType, readonly string[]>>>;

  readonly sound: SoundSettings;
  readonly animation: AnimationSettings;
  readonly widget: WidgetSettings;

  readonly launchAtLogin: boolean;
  readonly deliveryOwner: DeliveryOwner;
  readonly theme: Theme;
}

const hm = (h: number, m = 0): MinuteOfDay => h * 60 + m;

/**
 * Defaults are deliberately calm. Every one of these is chosen to be ignorable:
 * sound off, quiet hours overnight, and intervals long enough that Pandy is a
 * background presence rather than an interruption.
 */
export const DEFAULT_SETTINGS: Settings = {
  categories: {
    water: { enabled: true, intervalMinutes: 120 },
    stand: { enabled: true, intervalMinutes: 90 },
    lookAway: { enabled: true, intervalMinutes: 30 },
    touchGrass: { enabled: true, intervalMinutes: 240 },
  },
  schedulePreset: "recommended",

  workingDays: [1, 2, 3, 4, 5],
  activeHours: { start: hm(8), end: hm(20) },
  quietHours: { enabled: true, start: hm(20), end: hm(8) },

  snoozeMinutes: 10,
  dailyLimit: null,
  randomizationMinutes: 5,
  focusModeMinutes: 50,
  cooldownMinutes: 5,

  tone: "gen-z",
  customMessages: {},

  sound: { enabled: false, volume: 0.5 },
  animation: { enabled: true, reducedMotion: false, mascotScale: 2 },
  widget: {
    visible: true,
    corner: "bottom-right",
    opacity: 0.95,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: false,
    locked: false,
  },

  launchAtLogin: false,
  deliveryOwner: "both",
  theme: "system",
};
