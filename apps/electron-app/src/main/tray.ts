import { Menu, Tray, nativeImage } from "electron";
import { join } from "node:path";
import type { NextUp } from "@pandy/core";

export interface TrayActions {
  readonly takeBreakNow: () => void;
  readonly pause: (minutes: number) => void;
  readonly resume: () => void;
  readonly toggleWidget: () => void;
  readonly openSettings: () => void;
  readonly resetSchedule: () => void;
  readonly quit: () => void;
}

export interface TrayStatus {
  readonly paused: boolean;
  readonly widgetVisible: boolean;
  readonly next: NextUp | null;
}

export class PandyTray {
  #tray: Tray | null = null;
  readonly #actions: TrayActions;

  constructor(actions: TrayActions) {
    this.#actions = actions;
  }

  create(): void {
    if (this.#tray) return;

    const image = nativeImage.createFromPath(join(__dirname, "../renderer/tray.png"));
    // A template image follows the menu-bar theme on macOS instead of being a
    // fixed-colour blob that looks wrong in one of the two appearances.
    image.setTemplateImage(true);
    this.#tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    this.#tray.setToolTip("Pandy");

    // Clicking the tray icon opens the menu on every platform, rather than
    // doing nothing on Windows the way a bare click handler would.
    this.#tray.on("click", () => this.#tray?.popUpContextMenu());
  }

  update(status: TrayStatus): void {
    if (!this.#tray) return;

    const nextLabel = status.paused
      ? "Paused"
      : status.next
        ? `Next: ${describe(status.next)}`
        : "No reminders scheduled";

    const menu = Menu.buildFromTemplate([
      { label: `Pandy — ${nextLabel}`, enabled: false },
      { type: "separator" },
      { label: "Take a break now", click: () => this.#actions.takeBreakNow() },
      {
        label: "Pause",
        submenu: [
          { label: "30 minutes", click: () => this.#actions.pause(30) },
          { label: "1 hour", click: () => this.#actions.pause(60) },
          { label: "2 hours", click: () => this.#actions.pause(120) },
          { label: "Rest of the day", click: () => this.#actions.pause(minutesUntilMidnight()) },
        ],
      },
      { label: "Resume", enabled: status.paused, click: () => this.#actions.resume() },
      { type: "separator" },
      {
        label: status.widgetVisible ? "Hide widget" : "Show widget",
        click: () => this.#actions.toggleWidget(),
      },
      { label: "Settings…", click: () => this.#actions.openSettings() },
      { label: "Reset schedule", click: () => this.#actions.resetSchedule() },
      { type: "separator" },
      { label: "Quit Pandy", click: () => this.#actions.quit() },
    ]);

    this.#tray.setContextMenu(menu);
    this.#tray.setToolTip(`Pandy — ${nextLabel}`);
  }

  destroy(): void {
    this.#tray?.destroy();
    this.#tray = null;
  }
}

const LABELS: Record<string, string> = {
  water: "water",
  stand: "stand and stretch",
  lookAway: "look away",
  touchGrass: "outside break",
};

function describe(next: NextUp): string {
  const minutes = Math.max(0, Math.round((next.dueAt - Date.now()) / 60_000));
  const when = minutes < 1 ? "any moment" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${LABELS[next.type] ?? next.type} in ${when}`;
}

function minutesUntilMidnight(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.round((end.getTime() - now.getTime()) / 60_000));
}
