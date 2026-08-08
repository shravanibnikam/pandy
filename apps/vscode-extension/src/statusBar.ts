import * as vscode from "vscode";
import type { NextUp, ReminderEngine } from "@pandy/core";
import { formatLong, formatShort, msUntilLabelChanges } from "./format.js";

/**
 * A deliberately quiet status bar entry: the panda, and how long until the next
 * nudge. Clicking opens settings.
 *
 * The countdown text is refreshed by a self-scheduling timeout that fires at
 * the exact moment the label would change, not by a periodic tick. Showing
 * "42m" only needs one update per minute, and when the next reminder is hours
 * away it needs one update per hour. Nothing scans for due reminders here —
 * that remains the engine's single timer.
 */
export class StatusBar {
  readonly #item: vscode.StatusBarItem;
  readonly #engine: ReminderEngine;
  #refresh: ReturnType<typeof setTimeout> | null = null;
  #enabled = true;

  constructor(engine: ReminderEngine) {
    this.#engine = engine;
    this.#item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.#item.command = "pandy.openSettings";
    this.#item.name = "Pandy";
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (enabled) this.render();
    else {
      this.#clearRefresh();
      this.#item.hide();
    }
  }

  render(next: NextUp | null = this.#engine.peekNext()): void {
    this.#clearRefresh();
    if (!this.#enabled) return;

    const now = Date.now();

    if (this.#engine.isPaused(now)) {
      this.#set("$(debug-pause) Pandy", "Pandy is paused. Click to open settings.");
      this.#scheduleAt(this.#engine.getState().pauseUntil);
      return;
    }

    if (this.#engine.isFocused(now)) {
      this.#set("$(zap) Pandy", "Focus mode — reminders are on hold.");
      this.#scheduleAt(this.#engine.getState().focusUntil);
      return;
    }

    if (!next) {
      this.#set("Pandy", "No reminders are enabled. Click to open settings.");
      return;
    }

    const remaining = Math.max(0, next.dueAt - now);
    this.#set(
      `Pandy ${formatShort(remaining)}`,
      new vscode.MarkdownString(
        `**Pandy**\n\nNext: ${LABELS[next.type]} in ${formatLong(remaining)}` +
          `\n\n_${new Date(next.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}_` +
          `\n\nClick to open settings.`,
      ),
    );
    // Wake exactly when the rendered text would change, and no sooner.
    this.#scheduleIn(msUntilLabelChanges(remaining));
  }

  #set(text: string, tooltip: string | vscode.MarkdownString): void {
    // The panda is decoration; the text carries the meaning on its own so a
    // screen reader is not left announcing an emoji.
    this.#item.text = `$(heart) ${text}`;
    this.#item.tooltip = tooltip;
    this.#item.accessibilityInformation = {
      label: typeof tooltip === "string" ? tooltip : `Pandy. ${text}`,
    };
    this.#item.show();
  }

  #scheduleAt(timestamp: number | null): void {
    if (timestamp === null) return;
    this.#scheduleIn(timestamp - Date.now());
  }

  #scheduleIn(ms: number): void {
    this.#clearRefresh();
    if (!this.#enabled) return;
    // Cap so a clock change cannot strand the label indefinitely.
    const delay = Math.min(Math.max(1_000, ms), 15 * 60_000);
    this.#refresh = setTimeout(() => {
      this.#refresh = null;
      this.render();
    }, delay);
  }

  #clearRefresh(): void {
    if (this.#refresh !== null) {
      clearTimeout(this.#refresh);
      this.#refresh = null;
    }
  }

  dispose(): void {
    this.#clearRefresh();
    this.#item.dispose();
  }
}

const LABELS: Record<string, string> = {
  water: "water",
  stand: "stand and stretch",
  lookAway: "look away",
  touchGrass: "outside break",
};
