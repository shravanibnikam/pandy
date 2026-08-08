/** The four things Pandy nudges you about. */
export type ReminderType = "water" | "stand" | "lookAway" | "touchGrass";

export const REMINDER_TYPES: readonly ReminderType[] = [
  "water",
  "stand",
  "lookAway",
  "touchGrass",
] as const;

/** How the user responded to a reminder. */
export type ReminderResult = "completed" | "snoozed" | "dismissed" | "paused";

/** Why a due reminder did not fire. Every gate reschedules rather than queues. */
export type SuppressionReason =
  | "disabled"
  | "focus"
  | "paused"
  | "nonWorkingDay"
  | "outsideActiveHours"
  | "quietHours"
  | "dailyLimit"
  | "cooldown";

/** A reminder that passed every gate and should be shown. */
export interface DueReminder {
  readonly type: ReminderType;
  readonly message: string;
  readonly firedAt: number;
}

/** Where reminders are allowed to appear when both products are installed. */
export type DeliveryOwner = "vscode" | "desktop" | "both";
