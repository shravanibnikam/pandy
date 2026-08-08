import type { MascotState, ReminderResult, ReminderType, Settings } from "@pandy/shared-types";

/**
 * The complete IPC surface. Both sides import this, so the preload bridge and
 * the main-process handlers cannot drift apart, and the channel names exist in
 * exactly one place — there is no path by which the renderer can name a channel
 * that was not designed for it.
 */
export const CHANNELS = {
  // renderer → main, expecting a reply
  getState: "pandy:getState",
  resolveReminder: "pandy:resolveReminder",
  setSettings: "pandy:setSettings",
  triggerNow: "pandy:triggerNow",
  pause: "pandy:pause",
  resume: "pandy:resume",
  resetSchedule: "pandy:resetSchedule",
  completeOnboarding: "pandy:completeOnboarding",
  moveWidget: "pandy:moveWidget",
  setWidgetVisible: "pandy:setWidgetVisible",
  openSettings: "pandy:openSettings",
  closeSettings: "pandy:closeSettings",
  quit: "pandy:quit",
  contextMenu: "pandy:contextMenu",
  /** The bubble went away without an answer (timed out). Shrinks the window. */
  reminderDismissed: "pandy:reminderDismissed",
  // main → renderer, broadcast
  onState: "pandy:onState",
  onMascot: "pandy:onMascot",
  onReminder: "pandy:onReminder",
  /** Answered somewhere else — the tray, or the OS notification. Clear the bubble. */
  onReminderCleared: "pandy:onReminderCleared",
  onRoute: "pandy:onRoute",
} as const;

export type Route = "widget" | "settings" | "onboarding";

export interface AppState {
  readonly settings: Settings;
  readonly onboarded: boolean;
  readonly paused: boolean;
  readonly focused: boolean;
  readonly next: { readonly type: ReminderType; readonly dueAt: number } | null;
  readonly daily: { readonly total: number; readonly completed: number };
  readonly widgetVisible: boolean;
}

export interface ReminderPayload {
  readonly type: ReminderType;
  readonly message: string;
}

/** The API the preload script exposes on window.pandy. Nothing else crosses. */
export interface PandyBridge {
  getState(): Promise<AppState>;
  resolveReminder(type: ReminderType, result: ReminderResult): Promise<void>;
  setSettings(patch: Record<string, unknown>): Promise<void>;
  triggerNow(): Promise<void>;
  pause(minutes: number): Promise<void>;
  resume(): Promise<void>;
  resetSchedule(): Promise<void>;
  completeOnboarding(): Promise<void>;
  moveWidget(x: number, y: number): Promise<void>;
  setWidgetVisible(visible: boolean): Promise<void>;
  openSettings(): Promise<void>;
  closeSettings(): Promise<void>;
  contextMenu(): Promise<void>;
  reminderDismissed(): Promise<void>;
  quit(): Promise<void>;
  onState(handler: (state: AppState) => void): () => void;
  onMascot(handler: (state: MascotState) => void): () => void;
  onReminder(handler: (reminder: ReminderPayload) => void): () => void;
  onReminderCleared(handler: () => void): () => void;
  onRoute(handler: (route: Route) => void): () => void;
}
