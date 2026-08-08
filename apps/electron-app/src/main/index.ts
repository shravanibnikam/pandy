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
import { SettingsWindow } from "./settingsWindow.js";
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
let settingsWin: SettingsWindow;
let tray: PandyTray;
let quitting = false;

async function main(): Promise<void> {
  settings = await loadSettings();

  widget = new WidgetWindow(settings);
  settingsWin = new SettingsWindow();
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
    pause: (minutes) =>
      void engine.pause(minutes * 60_000).then(() => {
        sendSound("focusStart");
        afterChange();
      }),
    resume: () =>
      void engine.resumeFromPause().then(() => {
        sendSound("focusEnd");
        afterChange();
      }),
    toggleWidget: () => toggleWidget(),
    openSettings: () => openSettings("settings"),
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

  if (!engine.getState().onboarded) openSettings("onboarding");

  if (process.argv.includes("--pandy-selftest")) runSelfTest();
  if (process.argv.includes("--pandy-capture")) void runCapture();
  if (process.argv.includes("--pandy-probe")) void runTransparencyProbe();
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Does the widget → settings → widget round trip and reports the window's real
 * state at each step.
 *
 * The widget is transparent until settings is opened once, then turns opaque
 * and stays that way. Something in the route switch is destroying transparency
 * permanently; this pins down whether it is the page or the native window.
 */
async function runTransparencyProbe(): Promise<void> {
  const out = process.env["PANDY_PROBE_OUT"] ?? join(dataDir(), "probe.json");
  const w = widget.window;
  if (!w) {
    app.exit(1);
    return;
  }
  const watchdog = setTimeout(() => app.exit(2), 60_000);
  watchdog.unref?.();

  const sample = async (label: string) => ({
    label,
    nativeBackgroundColor: w.getBackgroundColor(),
    size: w.getSize(),
    settingsWindowOpen: settingsWin.isOpen,
    page: await w.webContents.executeJavaScript(
      `({
         route: document.body.dataset.route,
         html: getComputedStyle(document.documentElement).backgroundColor,
         body: getComputedStyle(document.body).backgroundColor,
         widget: getComputedStyle(document.getElementById('widget')).backgroundColor,
       })`,
    ),
  });

  await wait(1500);
  widget.showInactive();
  await wait(700);
  const before = await sample("1. widget, before settings");

  openSettings("settings");
  await wait(1600);
  const during = await sample("2. settings window open");

  settingsWin.close();
  await wait(1200);
  const after = await sample("3. widget, after closing settings");

  writeFileSync(out, JSON.stringify({ before, during, after }, null, 2), "utf8");
  clearTimeout(watchdog);
  quitting = true;
  app.exit(0);
}

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
  const watchdog = setTimeout(() => app.exit(2), 120_000);
  watchdog.unref?.();

  // A real OS notification would sit there waiting for a human.
  settings = { ...settings, deliveryOwner: "vscode" };

  const shot = async (win: Electron.BrowserWindow, name: string): Promise<void> => {
    const image = await win.webContents.capturePage();
    writeFileSync(join(dir, name), image.toPNG());
  };

  await wait(1800);
  widget.showInactive();
  await wait(1200);
  await shot(w, "01-widget-idle.png");

  await engine.triggerNow("water");
  await wait(1400);
  await shot(w, "02-widget-reminder.png");

  clearReminder();
  await engine.resolve("water", "completed");
  await wait(600);
  await shot(w, "03-widget-celebrate.png");

  // Onboarding, in its own window.
  openSettings("onboarding");
  await wait(1800);
  const onboard = settingsWin.window;
  if (onboard) await shot(onboard, "04-onboarding.png");
  settingsWin.close();
  await wait(600);

  // Every settings section.
  openSettings("settings");
  await wait(1800);
  const panel = settingsWin.window;
  if (panel) {
    const sections = ["reminders", "pandy", "sounds", "focus", "notifications", "advanced"];
    for (let i = 0; i < sections.length; i++) {
      await panel.webContents.executeJavaScript(
        `(() => { const b = [...document.querySelectorAll('.nav button')][${i}]; if (b) b.click(); })()`,
      );
      await wait(700);
      await shot(panel, `0${5 + i}-settings-${sections[i]}.png`);
    }
  }

  // Prove the widget is still transparent after all that.
  settingsWin.close();
  await wait(1000);
  await shot(w, "11-widget-after-settings.png");

  clearTimeout(watchdog);
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
    void (async () => {
    // Prove the page itself paints nothing on the widget route. If these are
    // not rgba(0,0,0,0), the CSS is at fault; if they are, any remaining
    // opacity is native compositing and no page change can fix it.
    const paint = w
      ? await w.webContents.executeJavaScript(
          `({
             route: document.body.dataset.route,
             html: getComputedStyle(document.documentElement).backgroundColor,
             body: getComputedStyle(document.body).backgroundColor,
             widget: getComputedStyle(document.getElementById('widget')).backgroundColor,
             heartVisible: !!document.getElementById('heart')?.offsetParent,
           })`,
        )
      : null;
    const report = {
      paint,
      windowCount: BrowserWindow.getAllWindows().length,
      exists: Boolean(w),
      visible: w?.isVisible() ?? false,
      focusable: w?.isFocusable() ?? null,
      alwaysOnTop: w?.isAlwaysOnTop() ?? null,
      resizable: w?.isResizable() ?? null,
      size: w?.getSize() ?? null,
      position: w?.getPosition() ?? null,
      settingsWindowOpen: settingsWin.isOpen,
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
    })();
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
  const state = currentState();
  widget.window?.webContents.send(CHANNELS.onState, state);
  settingsWin?.window?.webContents.send(CHANNELS.onState, state);
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
function openSettings(route: "settings" | "onboarding"): void {
  settingsWin.open(route, () => {
    // Closing the window is the same as pressing Close.
    broadcastState();
  });
  // Push current state as soon as the renderer is listening.
  const w = settingsWin.window;
  w?.webContents.once("did-finish-load", () => {
    w.webContents.send(CHANNELS.onState, currentState());
  });
}

function sendSound(event: "reminder" | "completed" | "snoozed" | "focusStart" | "focusEnd"): void {
  widget.window?.webContents.send(CHANNELS.onSound, event);
}

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

  ipcMain.handle(CHANNELS.restoreDefaults, async () => {
    // Every setting back to how Pandy shipped, and the schedule started over.
    // The confirmation lives in the renderer; by here the user has agreed.
    await applySettings(parseSettings({}));
    await engine.resetSchedule();
    afterChange();
  });

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
    sendSound("focusStart");
    afterChange();
  });

  ipcMain.handle(CHANNELS.resume, async () => {
    await engine.resumeFromPause();
    sendSound("focusEnd");
    afterChange();
  });

  ipcMain.handle(CHANNELS.resetSchedule, async () => {
    await engine.resetSchedule();
    afterChange();
  });

  ipcMain.handle(CHANNELS.completeOnboarding, async () => {
    await engine.setOnboarded(true);
    settingsWin.close();
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

  ipcMain.handle(CHANNELS.openSettings, () => openSettings("settings"));

  ipcMain.handle(CHANNELS.closeSettings, () => settingsWin.close());

  ipcMain.handle(CHANNELS.contextMenu, () => {
    const host = widget.window;
    const menu = Menu.buildFromTemplate([
      { label: "Take a break now", click: () => void engine.triggerNow() },
      {
        label: "Pause for 1 hour",
        click: () =>
          void engine.pause(60 * 60_000).then(() => {
            sendSound("focusStart");
            afterChange();
          }),
      },
      { label: "Resume", enabled: engine.isPaused(), click: () => void engine.resumeFromPause().then(afterChange) },
      { type: "separator" },
      { label: "Settings…", click: () => openSettings("settings") },
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
    settingsWin?.destroy();
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
