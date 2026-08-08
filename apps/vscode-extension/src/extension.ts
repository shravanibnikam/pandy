import * as vscode from "vscode";
import { ReminderEngine, systemClock } from "@pandy/core";
import { CONFIG_SECTION, readSettings, statusBarEnabled } from "./config.js";
import { globalStateStorage } from "./storage.js";
import { StatusBar } from "./statusBar.js";
import { showReminder } from "./notifier.js";
import { SettingsPanel } from "./webview.js";

let engine: ReminderEngine | undefined;
let statusBar: StatusBar | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  engine = new ReminderEngine({
    clock: systemClock,
    storage: globalStateStorage(context),
    settings: readSettings(),
    onReminder: (reminder) => {
      void showReminder(engine!, reminder);
    },
    onScheduleChange: (next) => {
      statusBar?.render(next);
    },
  });

  statusBar = new StatusBar(engine);
  statusBar.setEnabled(statusBarEnabled());
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });
  context.subscriptions.push({ dispose: () => engine?.stop() });

  // Restores nextDueAt from globalState and reconciles anything overdue,
  // firing at most one reminder rather than a backlog.
  await engine.start();
  statusBar.render();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) return;
      await engine?.updateSettings(readSettings());
      statusBar?.setEnabled(statusBarEnabled());
      statusBar?.render();
      SettingsPanel.refresh();
    }),

    vscode.commands.registerCommand("pandy.takeBreakNow", async () => {
      await engine?.triggerNow();
    }),

    vscode.commands.registerCommand("pandy.pause", async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: "30 minutes", minutes: 30 },
          { label: "1 hour", minutes: 60 },
          { label: "2 hours", minutes: 120 },
          { label: "Rest of the day", minutes: minutesUntilEndOfDay() },
        ],
        { title: "Pause Pandy for how long?", placeHolder: "Pick a duration" },
      );
      if (!choice) return;
      await engine?.pause(choice.minutes * 60_000);
      statusBar?.render();
      vscode.window.setStatusBarMessage(`$(debug-pause) Pandy paused for ${choice.label}`, 4000);
    }),

    vscode.commands.registerCommand("pandy.resume", async () => {
      await engine?.resumeFromPause();
      statusBar?.render();
      vscode.window.setStatusBarMessage("$(play) Pandy resumed", 3000);
    }),

    vscode.commands.registerCommand("pandy.openSettings", () => {
      SettingsPanel.show(context, engine!);
    }),

    vscode.commands.registerCommand("pandy.resetSchedule", async () => {
      await engine?.resetSchedule();
      statusBar?.render();
      vscode.window.setStatusBarMessage("$(refresh) Pandy schedule reset", 3000);
    }),
  );

  // First run: offer onboarding rather than opening a panel unasked.
  if (!engine.getState().onboarded) {
    void offerOnboarding(context);
  }
}

export function deactivate(): void {
  engine?.stop();
  SettingsPanel.disposeCurrent();
  statusBar?.dispose();
  engine = undefined;
  statusBar = undefined;
}

async function offerOnboarding(context: vscode.ExtensionContext): Promise<void> {
  const OPEN = "Set up Pandy";
  const LATER = "Use defaults";
  const choice = await vscode.window.showInformationMessage(
    "Pandy is here to remind you to stand, hydrate and look away. Want to pick your schedule?",
    OPEN,
    LATER,
  );
  if (choice === OPEN) {
    SettingsPanel.show(context, engine!);
  } else if (choice === LATER) {
    await engine?.setOnboarded(true);
  }
}

function minutesUntilEndOfDay(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.round((end.getTime() - now.getTime()) / 60_000));
}
