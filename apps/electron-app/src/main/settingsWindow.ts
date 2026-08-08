import { BrowserWindow } from "electron";
import { join } from "node:path";
import type { Route } from "../shared/ipc.js";

/**
 * Settings and onboarding, in their own ordinary window.
 *
 * This used to be a route inside the widget window, to honour "one
 * BrowserWindow". That turned out to be unshippable: switching routes meant
 * calling setResizable() and setFocusable() on the widget, and on macOS both
 * rewrite the NSWindow style mask. Rewriting the mask on a transparent
 * frameless window permanently destroys its transparency — the widget was
 * clear until settings was opened once, then opaque forever, with the page
 * still computing rgba(0,0,0,0) the whole time.
 *
 * So the widget window is now created once and never mutated, and this window
 * is created on demand and destroyed on close. Two windows exist only while
 * settings is actually open, which also turns out to be better: the widget
 * stays on screen, so size and fade changes are visible on the real Pandy as
 * you drag the sliders.
 */
export class SettingsWindow {
  #window: BrowserWindow | null = null;

  get window(): BrowserWindow | null {
    return this.#window && !this.#window.isDestroyed() ? this.#window : null;
  }

  get isOpen(): boolean {
    return this.window !== null;
  }

  /** Open, or focus it if it is already up. */
  open(route: Extract<Route, "settings" | "onboarding">, onClosed: () => void): BrowserWindow {
    const existing = this.window;
    if (existing) {
      existing.focus();
      return existing;
    }

    const win = new BrowserWindow({
      width: 900,
      height: 780,
      minWidth: 460,
      minHeight: 420,
      title: route === "onboarding" ? "Welcome to Pandy" : "Pandy Settings",
      // An ordinary window: opaque, framed, focusable, resizable. Nothing here
      // is ever toggled at runtime.
      show: false,
      resizable: true,
      fullscreenable: false,
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    this.#window = win;

    // The renderer bundle is shared; the query tells it which face to show.
    void win.loadFile(join(__dirname, "../renderer/index.html"), { query: { route } });

    // Avoid the white flash before first paint.
    win.once("ready-to-show", () => win.show());

    win.on("closed", () => {
      this.#window = null;
      onClosed();
    });

    return win;
  }

  close(): void {
    this.window?.close();
  }

  destroy(): void {
    this.#window?.destroy();
    this.#window = null;
  }
}
