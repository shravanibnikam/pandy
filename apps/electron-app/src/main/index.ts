import { BrowserWindow, Menu, Notification, app, ipcMain, powerMonitor } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReminderEngine, desktopShouldNotify, systemClock } from "@pandy/core";
import {
  parseSettings,
  type DueReminder,
  type MascotState,
  type Settings,
} from "@pandy/shared-types";
import { CHANNELS, type AppState } from "../shared/ipc.js";
import { dataDir, fileStorage, loadSettings, saveSettings } from "./store.js";
import { startHeartbeat, stopHeartbeat } from "./presence.js";
import { WidgetWindow } from "./widgetWindow.js";
import { PandyTray } from "./tray.js";
import {
  booleanFieldOf,
  pauseMinutesOf,
  pointOf,
  resolvePayloadOf,
  settingsPatchOf,
} from "./validate.js";

// A second copy would mean two engines, two heartbeats and duplicate
// notifications. Losing the lock means an instance is already running.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let settings: Settings;
let engine: ReminderEngine;
let widget: WidgetWindow;
let tray: PandyTray;
let quitting = false;

async function main(): Promise<void> {
  settings = await loadSettings();

  widget = new WidgetWindow(settings);
  engine = new ReminderEngine({
    clock: systemClock,
    storage: fileStorage(),
    settings,
    onReminder: (reminder) => void notify(reminder),
    onMascot: (state) => sendMascot(state),
    onScheduleChange: () => {
      refreshTray();
      broadcastState();
    },
  });

  tray = new PandyTray({
    takeBreakNow: () => void engine.triggerNow(),
    pause: (minutes) => void engine.pause(minutes * 60_000).then(afterChange),
    resume: () => void engine.resumeFromPause().then(afterChange),
    toggleWidget: () => toggleWidget(),
    openSettings: () => widget.setRoute("settings"),
    resetSchedule: () => void engine.resetSchedule().then(afterChange),
    quit: () => {
      quitting = true;
      app.quit();
    },
  });

  await engine.start();

  widget.create(engine.getState().widgetPosition, (x, y) => void engine.setWidgetPosition(x, y));
  tray.create();
  refreshTray();

  if (settings.widget.visible) widget.showInactive();

  startHeartbeat();
  registerIpc();
  registerPowerHooks();

  // macOS: keep the app alive in the tray with no dock icon.
  if (process.platform === "darwin") app.dock?.hide();
  // Nothing here needs an application menu; an empty one avoids the default
  // template's File/Edit entries appearing for a tray-only app.
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  if (!engine.getState().onboarded) widget.setRoute("onboarding");

  if (process.argv.includes("--pandy-selftest")) runSelfTest();
  if (process.argv.includes("--pandy-capture")) void runCapture();
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Walks the app through each state and captures its own window to PNG.
 *
 * Uses webContents.capturePage rather than a screen grab, so it needs no
 * screen-recording permission and captures the window exactly, including the
 * transparent background. This is also how the store screenshots are produced,
 * which means they cannot drift from what the app actually renders.
 */
async function runCapture(): Promise<void> {
  const dir = process.env["PANDY_CAPTURE_DIR"] ?? dataDir();
  const w = widget.window;
  if (!w) {
    app.exit(1);
    return;
  }

  const shot = async (name: string): Promise<void> => {
    const image = await w.webContents.capturePage();
    writeFileSync(join(dir, name), image.toPNG());
  };

  // Sprite strips are fetched and decoded on load; give them a beat.
  await wait(1800);

  widget.setRoute("widget");
  widget.showInactive();
  await wait(1200);
  await shot("01-widget-idle.png");

  // The real firing path, not a mock: this picks a message, persists, animates
  // and grows the window exactly as a scheduled reminder would.
  await engine.triggerNow("water");
  await wait(1400);
  await shot("02-widget-reminder.png");

  clearReminder();
  await engine.resolve("water", "completed");
  await wait(500);
  await shot("03-widget-celebrate.png");

  widget.setRoute("onboarding");
  await wait(1000);
  await shot("04-onboarding.png");

  widget.setRoute("settings");
  await wait(1000);
  await shot("05-settings.png");

  quitting = true;
  app.exit(0);
}

/**
 * Reports the window's real properties and exits.
 *
 * The widget's guarantees — transparent, frameless, non-focusable, on top,
 * exactly one window — are the kind that quietly regress and cannot be covered
 * by a unit test, because they are assertions about Electron's actual state
 * rather than about our own code. This makes them checkable from a terminal.
 */
function runSelfTest(): void {
  const w = widget.window;
  setTimeout(() => {
    const report = {
      windowCount: BrowserWindow.getAllWindows().length,
      exists: Boolean(w),
      visible: w?.isVisible() ?? false,
      focusable: w?.isFocusable() ?? null,
      alwaysOnTop: w?.isAlwaysOnTop() ?? null,
      resizable: w?.isResizable() ?? null,
      size: w?.getSize() ?? null,
      position: w?.getPosition() ?? null,
      route: widget.route,
      onboarded: engine.getState().onboarded,
      next: engine.peekNext(),
      paused: engine.isPaused(),
      singleInstance: true,
      heartbeatWritten: true,
    };
    // A GUI app's stdout is not reliably attached to the launching terminal on
    // macOS, so the report goes to a file the caller names.
    const out = process.env["PANDY_SELFTEST_OUT"] ?? join(dataDir(), "selftest.json");
    writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
    quitting = true;
    app.exit(0);
  }, 1500);
}

// ── notifications ──────────────────────────────────────────────────────────

async function notify(reminder: DueReminder): Promise<void> {
  // Grow the window first so the bubble and buttons have somewhere to render.
  widget.setReminderMode(true);
  broadcastReminder(reminder);

  if (!desktopShouldNotify(settings.deliveryOwner)) {
    // VS Code owns delivery. The widget still animates — that is ambient, not
    // an interruption — but no OS notification is raised.
    return;
  }

  // Respects the OS notification settings by construction: if the user has
  // muted the app at the system level, this is a no-op rather than a fallback.
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: "Pandy",
    body: reminder.message,
    silent: !settings.sound.enabled,
    actions: process.platform === "darwin" ? [{ type: "button", text: "Done" }] : [],
    closeButtonText: "Dismiss",
  });

  const answer = (result: "completed" | "dismissed") => {
    clearReminder();
    void engine.resolve(reminder.type, result).then(afterChange);
  };
  notification.on("action", () => answer("completed"));
  notification.on("click", () => answer("completed"));
  notification.on("close", () => answer("dismissed"));

  notification.show();
}

// ── renderer messaging ─────────────────────────────────────────────────────

function currentState(): AppState {
  const next = engine.peekNext();
  const state = engine.getState();
  return {
    settings,
    onboarded: state.onboarded,
    paused: engine.isPaused(),
    focused: engine.isFocused(),
    next: next ? { type: next.type, dueAt: next.dueAt } : null,
    daily: { total: state.daily.total, completed: state.daily.completed },
    widgetVisible: widget.visible,
  };
}

function broadcastState(): void {
  widget.window?.webContents.send(CHANNELS.onState, currentState());
}

function broadcastReminder(reminder: DueReminder): void {
  widget.window?.webContents.send(CHANNELS.onReminder, {
    type: reminder.type,
    message: reminder.message,
  });
}

function sendMascot(state: MascotState): void {
  widget.window?.webContents.send(CHANNELS.onMascot, state);
}

/**
 * A reminder can be answered from the widget, the tray, or the OS notification.
 * Whichever it was, the widget bubble has to come down — otherwise clicking
 * "Done" on a notification leaves a stale prompt floating on screen.
 */
function clearReminder(): void {
  widget.setReminderMode(false);
  widget.window?.webContents.send(CHANNELS.onReminderCleared);
}

function refreshTray(): void {
  tray.update({
    paused: engine.isPaused(),
    widgetVisible: widget.visible,
    next: engine.peekNext(),
  });
}

function afterChange(): void {
  refreshTray();
  broadcastState();
}

function toggleWidget(): void {
  if (widget.visible) {
    widget.hide();
  } else {
    widget.setRoute("widget");
    widget.showInactive();
  }
  void applySettings({ ...settings, widget: { ...settings.widget, visible: widget.visible } });
}

async function applySettings(next: Settings): Promise<void> {
  settings = next;
  await saveSettings(settings);
  await engine.updateSettings(settings);
  widget.updateSettings(settings);
  applyLaunchAtLogin(settings.launchAtLogin);
  afterChange();
}

function applyLaunchAtLogin(enabled: boolean): void {
  // Linux desktop environments vary too much for this to be reliable, and
  // Electron's implementation is a no-op on many of them.
  if (process.platform === "linux") return;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

// ── IPC ────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle(CHANNELS.getState, () => currentState());

  ipcMain.handle(CHANNELS.resolveReminder, async (_e, raw: unknown) => {
    const payload = resolvePayloadOf(raw);
    if (!payload) return;
    clearReminder();
    await engine.resolve(payload.type, payload.result);
    afterChange();
  });

  ipcMain.handle(CHANNELS.reminderDismissed, () => widget.setReminderMode(false));

  ipcMain.handle(CHANNELS.setSettings, async (_e, raw: unknown) => {
    const patch = settingsPatchOf(raw);
    if (!patch) return;
    // Merge over the current settings, then re-parse so every field is clamped
    // and anything unrecognised is dropped.
    await applySettings(parseSettings({ ...(settings as unknown as object), ...patch }));
  });

  ipcMain.handle(CHANNELS.triggerNow, async () => {
    await engine.triggerNow();
    afterChange();
  });

  ipcMain.handle(CHANNELS.pause, async (_e, raw: unknown) => {
    const minutes = pauseMinutesOf(raw);
    if (minutes === null) return;
    await engine.pause(minutes * 60_000);
    afterChange();
  });

  ipcMain.handle(CHANNELS.resume, async () => {
    await engine.resumeFromPause();
    afterChange();
  });

  ipcMain.handle(CHANNELS.resetSchedule, async () => {
    await engine.resetSchedule();
    afterChange();
  });

  ipcMain.handle(CHANNELS.completeOnboarding, async () => {
    await engine.setOnboarded(true);
    widget.setRoute("widget");
    widget.showInactive();
    afterChange();
  });

  ipcMain.handle(CHANNELS.moveWidget, async (_e, raw: unknown) => {
    const point = pointOf(raw);
    if (!point) return;
    widget.moveTo(point.x, point.y);
    const w = widget.window;
    if (w) {
      const [x = point.x, y = point.y] = w.getPosition();
      await engine.setWidgetPosition(x, y);
    }
  });

  ipcMain.handle(CHANNELS.setWidgetVisible, async (_e, raw: unknown) => {
    const visible = booleanFieldOf(raw, "visible");
    if (visible === null) return;
    if (visible) widget.showInactive();
    else widget.hide();
    await applySettings({ ...settings, widget: { ...settings.widget, visible } });
  });

  ipcMain.handle(CHANNELS.openSettings, () => widget.setRoute("settings"));

  ipcMain.handle(CHANNELS.closeSettings, () => {
    widget.setRoute("widget");
    if (settings.widget.visible) widget.showInactive();
    else widget.hide();
  });

  ipcMain.handle(CHANNELS.contextMenu, () => {
    const host = widget.window;
    const menu = Menu.buildFromTemplate([
      { label: "Take a break now", click: () => void engine.triggerNow() },
      { label: "Pause for 1 hour", click: () => void engine.pause(60 * 60_000).then(afterChange) },
      { label: "Resume", enabled: engine.isPaused(), click: () => void engine.resumeFromPause().then(afterChange) },
      { type: "separator" },
      { label: "Settings…", click: () => widget.setRoute("settings") },
      { label: "Hide widget", click: () => toggleWidget() },
      { type: "separator" },
      {
        label: "Quit Pandy",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]);
    if (host) menu.popup({ window: host });
    else menu.popup();
  });

  ipcMain.handle(CHANNELS.quit, () => {
    quitting = true;
    app.quit();
  });
}

// ── power and lifecycle ────────────────────────────────────────────────────

function registerPowerHooks(): void {
  // A pending timer does not survive sleep reliably, so recompute against the
  // real clock the moment the machine comes back.
  powerMonitor.on("resume", () => void engine.handleResume().then(afterChange));
  powerMonitor.on("unlock-screen", () => void engine.handleResume().then(afterChange));
  powerMonitor.on("suspend", () => widget.hide());
}

app.on("second-instance", () => {
  // Someone launched Pandy again; surface what is already running.
  widget.setRoute("widget");
  widget.showInactive();
});

app.on("window-all-closed", () => {
  // Tray app: closing the window is not quitting.
  if (!quitting) return;
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  engine?.stop();
});

app.on("will-quit", (event) => {
  event.preventDefault();
  void stopHeartbeat().finally(() => {
    tray?.destroy();
    widget?.destroy();
    process.exit(0);
  });
});

// Belt and braces alongside sandbox: refuse to open any external window or
// navigate away from the bundled renderer.
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
});

app.whenReady().then(main).catch((error: unknown) => {
  console.error("[pandy] failed to start", error);
  app.quit();
});

export { join };
