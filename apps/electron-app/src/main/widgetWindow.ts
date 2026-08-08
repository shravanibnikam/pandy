import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import type { Settings, WidgetPosition } from "@pandy/shared-types";
import type { Route } from "../shared/ipc.js";
import { CHANNELS } from "../shared/ipc.js";

const WIDGET_BASE = 64;
const MARGIN = 24;
/** Settings and onboarding need room; the widget itself does not. */
const PANEL_SIZE = { width: 760, height: 720 };

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

    const size = this.#widgetSize();
    const at = this.#resolvePosition(position, size);

    this.#window = new BrowserWindow({
      width: size,
      height: size,
      x: at.x,
      y: at.y,
      transparent: true,
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

    this.#window.setOpacity(this.#settings.widget.opacity);
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
    this.#route = route;

    if (route === "widget") {
      const size = this.#widgetSize();
      w.setFocusable(false);
      w.setAlwaysOnTop(this.#settings.widget.alwaysOnTop, "floating");
      w.setOpacity(this.#settings.widget.opacity);
      w.setResizable(false);
      w.setSize(size, size);
      w.setSkipTaskbar(true);
    } else {
      // The panel needs the keyboard, so it must be focusable while open.
      w.setFocusable(true);
      w.setAlwaysOnTop(false);
      w.setOpacity(1);
      w.setResizable(true);
      w.setSize(PANEL_SIZE.width, PANEL_SIZE.height);
      w.setSkipTaskbar(false);
      w.center();
      w.show();
      w.focus();
    }
    w.webContents.send(CHANNELS.onRoute, route);
  }

  updateSettings(settings: Settings): void {
    this.#settings = settings;
    const w = this.window;
    if (!w || this.#route !== "widget") return;

    w.setOpacity(settings.widget.opacity);
    this.applyAlwaysOnTop(settings.widget.alwaysOnTop);
    this.applyAllWorkspaces(settings.widget.visibleOnAllWorkspaces);

    const size = this.#widgetSize();
    const [cw] = w.getSize();
    if (cw !== size) w.setSize(size, size);
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
    const size = this.#widgetSize();
    const clamped = clampToDisplay(x, y, size);
    w.setPosition(clamped.x, clamped.y);
  }

  destroy(): void {
    this.#window?.destroy();
    this.#window = null;
  }

  #widgetSize(): number {
    return WIDGET_BASE * this.#settings.animation.mascotScale;
  }

  /**
   * A saved position from a monitor that is no longer attached would put the
   * widget somewhere invisible, so it is validated against the current displays
   * and otherwise falls back to the configured corner.
   */
  #resolvePosition(saved: WidgetPosition | null, size: number): { x: number; y: number } {
    if (saved && isOnSomeDisplay(saved.x, saved.y, size)) return clampToDisplay(saved.x, saved.y, size);
    return cornerPosition(this.#settings, size);
  }
}

export function isOnSomeDisplay(x: number, y: number, size: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    // Require most of the widget to be on-screen, not just one pixel of it.
    return x + size > a.x + 8 && y + size > a.y + 8 && x < a.x + a.width - 8 && y < a.y + a.height - 8;
  });
}

export function clampToDisplay(x: number, y: number, size: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const a = display.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, a.x), a.x + a.width - size)),
    y: Math.round(Math.min(Math.max(y, a.y), a.y + a.height - size)),
  };
}

export function cornerPosition(settings: Settings, size: number): { x: number; y: number } {
  const a = screen.getPrimaryDisplay().workArea;
  const left = a.x + MARGIN;
  const right = a.x + a.width - size - MARGIN;
  const top = a.y + MARGIN;
  const bottom = a.y + a.height - size - MARGIN;

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
