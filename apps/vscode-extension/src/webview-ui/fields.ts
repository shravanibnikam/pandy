import type { ReminderType, Settings } from "@pandy/shared-types";

export interface Field {
  /** Config key, matching the extension's contributed settings. */
  readonly key: string;
  readonly label: string;
  readonly kind: "boolean" | "number" | "select" | "time" | "days";
  readonly read: (s: Settings) => unknown;
  /** Starts a new fieldset with this legend. */
  readonly group?: string;
  readonly hint?: string;
  readonly min?: number;
  readonly max?: number;
  readonly nullable?: boolean;
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

const CATEGORY_LABELS: Record<ReminderType, string> = {
  water: "Drink water",
  stand: "Stand and stretch",
  lookAway: "Look away from the screen",
  touchGrass: "Take a break outside",
};

function categoryFields(): Field[] {
  const out: Field[] = [];
  let first = true;
  for (const type of ["water", "stand", "lookAway", "touchGrass"] as const) {
    out.push({
      key: `${type}.enabled`,
      label: CATEGORY_LABELS[type],
      kind: "boolean",
      read: (s) => s.categories[type].enabled,
      ...(first ? { group: "Reminders" } : {}),
    });
    out.push({
      key: `${type}.intervalMinutes`,
      label: "Every (minutes)",
      kind: "number",
      min: 1,
      max: 1440,
      read: (s) => s.categories[type].intervalMinutes,
    });
    first = false;
  }
  return out;
}

/**
 * Drives the settings form. Kept declarative so the panel and the contributed
 * VS Code configuration cannot drift apart — the keys here are exactly the
 * keys in the allow-list the extension validates against.
 */
export const FIELDS: readonly Field[] = [
  ...categoryFields(),

  {
    key: "workingDays",
    label: "Working days",
    kind: "days",
    group: "When",
    read: (s) => s.workingDays,
    hint: "Reminders only arrive on these days.",
  },
  {
    key: "activeHours.start",
    label: "Active from",
    kind: "time",
    read: (s) => s.activeHours.start,
  },
  { key: "activeHours.end", label: "Active until", kind: "time", read: (s) => s.activeHours.end },
  {
    key: "quietHours.enabled",
    label: "Quiet hours",
    kind: "boolean",
    read: (s) => s.quietHours.enabled,
    hint: "May cross midnight.",
  },
  { key: "quietHours.start", label: "Quiet from", kind: "time", read: (s) => s.quietHours.start },
  { key: "quietHours.end", label: "Quiet until", kind: "time", read: (s) => s.quietHours.end },

  {
    key: "snoozeMinutes",
    label: "Snooze for (minutes)",
    kind: "number",
    min: 1,
    max: 240,
    group: "Behaviour",
    read: (s) => s.snoozeMinutes,
  },
  {
    key: "dailyLimit",
    label: "Daily limit",
    kind: "number",
    min: 1,
    max: 200,
    nullable: true,
    read: (s) => s.dailyLimit,
    hint: "Leave empty for no limit.",
  },
  {
    key: "randomizationMinutes",
    label: "Random variation (minutes)",
    kind: "number",
    min: 0,
    max: 60,
    read: (s) => s.randomizationMinutes,
    hint: "So reminders never feel mechanical.",
  },
  {
    key: "focusModeMinutes",
    label: "Focus / pause length (minutes)",
    kind: "number",
    min: 5,
    max: 480,
    read: (s) => s.focusModeMinutes,
  },
  {
    key: "cooldownMinutes",
    label: "Minimum gap (minutes)",
    kind: "number",
    min: 0,
    max: 120,
    read: (s) => s.cooldownMinutes,
    hint: "Stops several reminders stacking up together.",
  },

  {
    key: "tone",
    label: "Tone",
    kind: "select",
    group: "Voice and appearance",
    read: (s) => s.tone,
    options: [
      { value: "low-key", label: "Low-key — no slang or emoji" },
      { value: "gen-z", label: "Gen Z" },
      { value: "chaotic", label: "Chaotic" },
    ],
  },
  {
    key: "animation.enabled",
    label: "Animate the mascot",
    kind: "boolean",
    read: (s) => s.animation.enabled,
  },
  {
    key: "animation.reducedMotion",
    label: "Reduced motion",
    kind: "boolean",
    read: (s) => s.animation.reducedMotion,
    hint: "Shows a single still frame.",
  },
  {
    key: "animation.mascotScale",
    label: "Mascot size",
    kind: "number",
    min: 1,
    max: 8,
    read: (s) => s.animation.mascotScale,
    hint: "Whole numbers only — fractional scales blur pixel art.",
  },
  {
    key: "theme",
    label: "Panel theme",
    kind: "select",
    read: (s) => s.theme,
    options: [
      { value: "system", label: "Match VS Code" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },

  {
    key: "statusBar.enabled",
    label: "Show in the status bar",
    kind: "boolean",
    group: "Delivery",
    read: () => true,
    hint: "Stays visible even when the desktop app owns notifications.",
  },
  {
    key: "deliveryOwner",
    label: "Show reminders",
    kind: "select",
    read: (s) => s.deliveryOwner,
    hint: "Pandy never shows the same reminder twice.",
    options: [
      { value: "both", label: "Wherever I am" },
      { value: "vscode", label: "Only in VS Code" },
      { value: "desktop", label: "Only on the desktop" },
    ],
  },
];
