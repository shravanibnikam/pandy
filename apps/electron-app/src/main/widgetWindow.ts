import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import type { Settings, WidgetPosition } from "@pandy/shared-types";
import type { Route } from "../shared/ipc.js";
import { CHANNELS } from "../shared/ipc.js";

const WIDGET_BASE = 64;
const MARGIN = 24;
/** Narrow lane to the right of the mascot for the heart / dot control. */
const CONTROL_LANE = 30;
/** Settings and onboarding need room; the widget itself does not. */
const PANEL_SIZE = { width: 860, height: 760 };
/**
 * Extra room for the message bubble above the mascot and the Done/Snooze/Pause
 * row below it. A frameless window clips anything outside its bounds, so
 * without this the buttons would be invisible and unclickable.
 */
const REMINDER_PADDING = { width: 300, height: 150 };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Exactly one BrowserWindow for the whole app.
 *
 * The widget and the settings panel are routes inside it rather than separate
 * windows: a second window would double the renderer cost for a mascot that is
 * 64 pixels square, and the spec asks for one window and no extra processes.
 */
export class WidgetWindow {
  #window: BrowserWindow | null = null;
  #route: Route = "widget";
  #settings: Settings;
  #reminderMode = false;

  constructor(settings: Settings) {
    this.#settings = settings;
  }

  get window(): BrowserWindow | null {
    return this.#window && !this.#window.isDestroyed() ? this.#window : null;
  }

  get route(): Route {
    return this.#route;
  }

  create(position: WidgetPosition | null, onMoved: (x: number, y: number) => void): BrowserWindow {
    const existing = this.window;
    if (existing) return existing;

    const size = this.idleSize();
    const at = this.#resolvePosition(position, size);

    this.#window = new BrowserWindow({
      width: size.width,
      height: size.height,
      x: at.x,
      y: at.y,
      transparent: true,
      // Electron defaults backgroundColor to opaque white. `transparent: true`
      // usually overrides it, but on macOS leaving it unset is a documented
      // source of an opaque backing layer — so say it explicitly.
      backgroundColor: "#00000000",
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      hasShadow: false,
      // A reminder must never grab the caret mid-sentence.
      focusable: false,
      alwaysOnTop: this.#settings.widget.alwaysOnTop,
      show: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    /*
     * Deliberately no setOpacity anywhere in this file.
     *
     * On macOS, calling setOpacity on a transparent window moves it onto a
     * non-transparent compositing path and the clear region renders as a solid
     * grey rectangle. It happens after the page paints, which is why
     * webContents.capturePage() showed perfect transparency while the screen
     * did not. Widget opacity is applied in CSS to the mascot and controls
     * instead, so the window itself stays completely clear.
     */
    this.applyAlwaysOnTop(this.#settings.widget.alwaysOnTop);
    this.applyAllWorkspaces(this.#settings.widget.visibleOnAllWorkspaces);
    this.#window.setIgnoreMouseEvents(false);

    // Persist wherever the user drags it to.
    this.#window.on("moved", () => {
      const w = this.window;
      if (!w || this.#route !== "widget") return;
      const [x = 0, y = 0] = w.getPosition();
      onMoved(x, y);
    });

    void this.#window.loadFile(join(__dirname, "../renderer/index.html"));
    return this.#window;
  }

  /** Mascot square, in physical pixels. */
  mascotPx(): number {
    return WIDGET_BASE * this.#settings.animation.mascotScale;
  }

  /** Window size at rest: the mascot plus the control lane, when shown. */
  idleSize(): Size {
    const mascot = this.mascotPx();
    const lane = this.#settings.widget.settingsControl === "hidden" ? 0 : CONTROL_LANE;
    return { width: mascot + lane, height: mascot };
  }

  #reminderSize(): Size {
    const mascot = this.mascotPx();
    return {
      width: Math.max(this.idleSize().width, REMINDER_PADDING.width),
      height: mascot + REMINDER_PADDING.height,
    };
  }

  /**
   * Grow the window to fit the bubble and action buttons while a reminder is
   * showing, then shrink back. The mascot's own position on screen is kept
   * stable through the change, so the panda does not appear to jump.
   */
  setReminderMode(on: boolean): void {
    const w = this.window;
    if (!w || this.#route !== "widget" || this.#reminderMode === on) return;
    this.#reminderMode = on;
    this.#resizeTo(on ? this.#reminderSize() : this.idleSize());
  }

  get reminderMode(): boolean {
    return this.#reminderMode;
  }

  /** Resize about the window's centre, so the mascot appears to stay put. */
  #resizeTo(size: Size): void {
    const w = this.window;
    if (!w) return;
    const [oldW = size.width, oldH = size.height] = w.getSize();
    const [x = 0, y = 0] = w.getPosition();

    const next = clampRectToDisplay(
      Math.round(x + (oldW - size.width) / 2),
      Math.round(y + (oldH - size.height) / 2),
      size.width,
      size.height,
    );

    w.setSize(size.width, size.height);
    w.setPosition(next.x, next.y);
  }

  /** Show without stealing focus from whatever the user is typing in. */
  showInactive(): void {
    const w = this.window;
    if (!w) return;
    if (!w.isVisible()) w.showInactive();
  }

  hide(): void {
    this.window?.hide();
  }

  get visible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  /**
   * Swap between the widget and the full panel in the same window: resize,
   * make it focusable and framed enough to be usable, then swap back.
   */
  setRoute(route: Route): void {
    const w = this.window;
    if (!w) return;
    const previous = this.#route;
    this.#route = route;

    if (route === "widget") {
      const size = this.#reminderMode ? this.#reminderSize() : this.idleSize();
      w.setFocusable(false);
      w.setAlwaysOnTop(this.#settings.widget.alwaysOnTop, "floating");
      w.setResizable(false);
      // The panel sets a minimum size; it persists, and would stop the widget
      // ever shrinking back down once settings had been opened even once.
      w.setMinimumSize(1, 1);
      w.setSize(size.width, size.height);
      w.setSkipTaskbar(true);
      // Coming back from the panel, re-seat it in its corner rather than
      // leaving the widget stranded in the middle of the screen.
      if (previous !== "widget") {
        const at = cornerPosition(this.#settings, size);
        w.setPosition(at.x, at.y);
      }
    } else {
      // The panel needs the keyboard, so it must be focusable while open.
      w.setFocusable(true);
      w.setAlwaysOnTop(false);
      w.setResizable(true);
      w.setMinimumSize(520, 480);
      w.setSize(PANEL_SIZE.width, PANEL_SIZE.height);
      w.setSkipTaskbar(false);
      w.center();
      w.show();
      w.focus();
    }
    w.webContents.send(CHANNELS.onRoute, route);
  }

  updateSettings(settings: Settings): void {
    const previous = this.#settings;
    this.#settings = settings;
    const w = this.window;
    if (!w || this.#route !== "widget") return;

    this.applyAlwaysOnTop(settings.widget.alwaysOnTop);
    this.applyAllWorkspaces(settings.widget.visibleOnAllWorkspaces);

    // Mascot size or the control lane changed — refit the window.
    const sizeChanged =
      previous.animation.mascotScale !== settings.animation.mascotScale ||
      previous.widget.settingsControl !== settings.widget.settingsControl;

    if (sizeChanged && !this.#reminderMode) this.#resizeTo(this.idleSize());
  }

  applyAlwaysOnTop(on: boolean): void {
    // "floating" keeps it above normal windows without fighting full-screen apps.
    this.window?.setAlwaysOnTop(on, "floating");
  }

  applyAllWorkspaces(on: boolean): void {
    this.window?.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on });
  }

  /** Move the widget, clamped to a display that actually exists. */
  moveTo(x: number, y: number): void {
    const w = this.window;
    if (!w || this.#settings.widget.locked) return;
    const [width = 0, height = 0] = w.getSize();
    const clamped = clampRectToDisplay(x, y, width, height);
    w.setPosition(clamped.x, clamped.y);
  }

  /** Put the widget back in its configured corner. */
  snapToCorner(): void {
    const w = this.window;
    if (!w || this.#route !== "widget") return;
    const size = this.#reminderMode ? this.#reminderSize() : this.idleSize();
    const at = cornerPosition(this.#settings, size);
    w.setPosition(at.x, at.y);
  }

  destroy(): void {
    this.#window?.destroy();
    this.#window = null;
  }

  /**
   * A saved position from a monitor that is no longer attached would put the
   * widget somewhere invisible, so it is validated against the current displays
   * and otherwise falls back to the configured corner.
   */
  #resolvePosition(saved: WidgetPosition | null, size: Size): { x: number; y: number } {
    if (saved && isOnSomeDisplay(saved.x, saved.y, size)) {
      return clampRectToDisplay(saved.x, saved.y, size.width, size.height);
    }
    return cornerPosition(this.#settings, size);
  }
}

export function isOnSomeDisplay(x: number, y: number, size: Size): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    // Require most of the widget to be on-screen, not just one pixel of it.
    return (
      x + size.width > a.x + 8 &&
      y + size.height > a.y + 8 &&
      x < a.x + a.width - 8 &&
      y < a.y + a.height - 8
    );
  });
}

/** Clamp a rectangle into the nearest display's work area. */
export function clampRectToDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const a = display.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, a.x), a.x + a.width - width)),
    y: Math.round(Math.min(Math.max(y, a.y), a.y + a.height - height)),
  };
}

export function cornerPosition(settings: Settings, size: Size): { x: number; y: number } {
  const a = screen.getPrimaryDisplay().workArea;
  const left = a.x + MARGIN;
  const right = a.x + a.width - size.width - MARGIN;
  const top = a.y + MARGIN;
  const bottom = a.y + a.height - size.height - MARGIN;

  switch (settings.widget.corner) {
    case "top-left":
      return { x: left, y: top };
    case "top-right":
      return { x: right, y: top };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom-right":
    default:
      return { x: right, y: bottom };
  }
}
