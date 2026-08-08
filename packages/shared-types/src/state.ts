import type { ReminderType } from "./reminders.js";

export interface ScheduleEntry {
  /** Epoch ms when this category next becomes due. */
  readonly nextDueAt: number;
  /** True when nextDueAt came from a snooze rather than a normal interval. */
  readonly fromSnooze: boolean;
}

export interface DailyCounts {
  /** Local calendar day, `YYYY-MM-DD`, so the limit resets at local midnight. */
  readonly dateKey: string;
  readonly total: number;
  readonly completed: number;
}

export interface WidgetPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Everything Pandy persists. Deliberately narrow: no file paths, no workspace
 * contents, no history of what you were doing — only what is needed to resume
 * a schedule and keep the mascot where you left it.
 */
export interface PersistedState {
  readonly version: 1;
  readonly schedule: Readonly<Partial<Record<ReminderType, ScheduleEntry>>>;
  readonly pauseUntil: number | null;
  readonly focusUntil: number | null;
  /** Drives the global cooldown between any two reminders. */
  readonly lastFiredAt: number | null;
  readonly daily: DailyCounts;
  /** Recently shown message ids per category, for non-repetition. */
  readonly recentMessages: Readonly<Partial<Record<ReminderType, readonly string[]>>>;
  readonly widgetPosition: WidgetPosition | null;
  /** Set once the user has been through onboarding. */
  readonly onboarded: boolean;
}

export const EMPTY_STATE: PersistedState = {
  version: 1,
  schedule: {},
  pauseUntil: null,
  focusUntil: null,
  lastFiredAt: null,
  daily: { dateKey: "", total: 0, completed: 0 },
  recentMessages: {},
  widgetPosition: null,
  onboarded: false,
};

export const STORAGE_KEY = "pandy.state.v1";
export const SETTINGS_KEY = "pandy.settings.v1";
