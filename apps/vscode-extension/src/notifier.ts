import * as vscode from "vscode";
import type { DueReminder } from "@pandy/shared-types";
import type { ReminderEngine } from "@pandy/core";
import { vscodeShouldNotify } from "@pandy/core";
import { readDesktopHeartbeat } from "./presence.js";
import { readSettings } from "./config.js";

const DONE = "Done";
const SNOOZE = "Snooze";
const PAUSE = "Pause";

/**
 * Shows a reminder as a plain information message with three actions.
 *
 * Before showing anything it checks whether the desktop app is alive and owns
 * delivery. That check is a single file stat on an already-scheduled tick, not
 * a poll — the extension does no work between reminders.
 */
export async function showReminder(engine: ReminderEngine, reminder: DueReminder): Promise<void> {
  const settings = readSettings();
  const heartbeat = await readDesktopHeartbeat();

  const mine = vscodeShouldNotify({
    preference: settings.deliveryOwner,
    desktopHeartbeat: heartbeat,
    now: Date.now(),
  });

  if (!mine) {
    // The desktop app is showing this one. The schedule already advanced, so
    // nothing is lost and nothing is duplicated.
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    reminder.message,
    { modal: false },
    DONE,
    SNOOZE,
    PAUSE,
  );

  switch (choice) {
    case DONE:
      await engine.resolve(reminder.type, "completed");
      break;
    case SNOOZE:
      await engine.resolve(reminder.type, "snoozed");
      break;
    case PAUSE:
      await engine.resolve(reminder.type, "paused");
      break;
    default:
      // Dismissed with the X, or timed out. Either way the next reminder is
      // already scheduled — an ignored nudge must not stop the clock.
      await engine.resolve(reminder.type, "dismissed");
      break;
  }
}
