import * as vscode from "vscode";
import {
  REMINDER_TYPES,
  parseSettings,
  type ReminderType,
  type Settings,
} from "@pandy/shared-types";

export const CONFIG_SECTION = "pandy";

/**
 * VS Code settings are flat dotted keys, which is what users expect in
 * settings.json. This assembles them into the nested Settings the engine takes
 * and hands the result to parseSettings, so a hand-edited settings.json with a
 * nonsense value degrades to the default for that field rather than throwing.
 */
export function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const categories: Record<string, unknown> = {};
  const customMessages: Record<string, unknown> = {};
  for (const type of REMINDER_TYPES) {
    categories[type] = {
      enabled: cfg.get(`${type}.enabled`),
      intervalMinutes: cfg.get(`${type}.intervalMinutes`),
    };
    customMessages[type] = cfg.get(`customMessages.${type}`);
  }

  return parseSettings({
    categories,
    customMessages,
    workingDays: cfg.get("workingDays"),
    activeHours: { start: cfg.get("activeHours.start"), end: cfg.get("activeHours.end") },
    quietHours: {
      enabled: cfg.get("quietHours.enabled"),
      start: cfg.get("quietHours.start"),
      end: cfg.get("quietHours.end"),
    },
    snoozeMinutes: cfg.get("snoozeMinutes"),
    dailyLimit: cfg.get("dailyLimit"),
    randomizationMinutes: cfg.get("randomizationMinutes"),
    focusModeMinutes: cfg.get("focusModeMinutes"),
    cooldownMinutes: cfg.get("cooldownMinutes"),
    tone: cfg.get("tone"),
    animation: {
      enabled: cfg.get("animation.enabled"),
      reducedMotion: cfg.get("animation.reducedMotion"),
      mascotScale: cfg.get("animation.mascotScale"),
    },
    deliveryOwner: cfg.get("deliveryOwner"),
    theme: cfg.get("theme"),
  });
}

export function statusBarEnabled(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("statusBar.enabled", true);
}

/** Writes a single setting globally. Used by the settings webview. */
export async function writeSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/** The full set of keys the settings webview is allowed to write. */
export const WRITABLE_KEYS: readonly string[] = [
  ...REMINDER_TYPES.flatMap((t: ReminderType) => [`${t}.enabled`, `${t}.intervalMinutes`]),
  ...REMINDER_TYPES.map((t: ReminderType) => `customMessages.${t}`),
  "workingDays",
  "activeHours.start",
  "activeHours.end",
  "quietHours.enabled",
  "quietHours.start",
  "quietHours.end",
  "snoozeMinutes",
  "dailyLimit",
  "randomizationMinutes",
  "focusModeMinutes",
  "cooldownMinutes",
  "tone",
  "animation.enabled",
  "animation.reducedMotion",
  "animation.mascotScale",
  "statusBar.enabled",
  "deliveryOwner",
  "theme",
];
