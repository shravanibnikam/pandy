import { MascotAnimator, loadSheets, prefersReducedMotion } from "@pandy/mascot";
import type { MascotState, ReminderType, Settings } from "@pandy/shared-types";
import type { AppState, PandyBridge, ReminderPayload, Route } from "../shared/ipc.js";
import { destroyPanel, flashSaved, renderPanel } from "./panel.js";
import { SoundPlayer, isSoundEvent, type SoundEvent } from "./sound.js";

declare global {
  interface Window {
    readonly pandy: PandyBridge;
  }
}

const api = window.pandy;
const body = document.body;
const widgetEl = document.getElementById("widget")!;
const canvas = document.getElementById("mascot") as HTMLCanvasElement;
const heart = document.getElementById("heart") as HTMLButtonElement;
const bubble = document.getElementById("bubble")!;
const actions = document.getElementById("actions")!;
const panel = document.getElementById("panel")!;

let animator: MascotAnimator | null = null;
let sound: SoundPlayer | null = null;
let state: AppState | null = null;
let pending: ReminderType | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;

// ── mascot ─────────────────────────────────────────────────────────────────

async function mountMascot(settings: Settings): Promise<void> {
  if (animator) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const sheets = await loadSheets("strips");
  animator = new MascotAnimator({
    ctx,
    sheets,
    reducedMotion: settings.animation.reducedMotion || prefersReducedMotion(),
  });
  animator.setState("idle");

  // Nothing animates while the window is hidden — that is why a widget parked
  // in a corner costs nothing.
  document.addEventListener("visibilitychange", () => {
    animator?.setVisible(document.visibilityState === "visible");
  });
}

function applyAppearance(settings: Settings): void {
  // Explicit pixel size: the window grows for a reminder, and a percentage-
  // sized canvas would stretch the sprite with it.
  const px = 64 * settings.animation.mascotScale;
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;

  /*
   * Opacity is applied here rather than through BrowserWindow.setOpacity: on
   * macOS that pushes a transparent window onto an opaque compositing path and
   * the clear area renders as a grey rectangle. Fading the artwork keeps the
   * window itself completely clear.
   */
  const o = String(settings.widget.opacity);
  body.style.setProperty("--mascot-opacity", o);
  // Bubble and buttons stay a little more solid than the panda, so a faded
  // Pandy never makes its own reminder text hard to read.
  body.style.setProperty("--chrome-opacity", String(Math.max(0.85, settings.widget.opacity)));

  body.dataset["control"] = settings.widget.settingsControl;
  heart.textContent = "";
  const glyph = document.createElement("span");
  glyph.className = "heart-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = settings.widget.settingsControl === "dot" ? "●" : "♥";
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = "Open Pandy settings";
  heart.append(glyph, sr);

  if (!animator) return;
  const reduced = settings.animation.reducedMotion || prefersReducedMotion();
  animator.setReducedMotion(reduced);
  animator.setVisible(settings.animation.enabled && document.visibilityState === "visible");
}

// ── reminder bubble ────────────────────────────────────────────────────────

function showReminder(reminder: ReminderPayload): void {
  pending = reminder.type;
  bubble.textContent = reminder.message;
  bubble.hidden = false;
  actions.hidden = false;
  sound?.play("reminder");

  if (bubbleTimer) clearTimeout(bubbleTimer);
  // Fade the prompt out on its own if ignored — the schedule has already moved
  // on, so a stale bubble is just clutter.
  bubbleTimer = setTimeout(() => dismissBubble(), 90_000);
}

function dismissBubble(notifyMain = true): void {
  const wasShowing = !bubble.hidden;
  bubble.hidden = true;
  actions.hidden = true;
  pending = null;
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  if (wasShowing && notifyMain) void api.reminderDismissed();
}

actions.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const result = target.dataset["result"];
  if (!result || !pending) return;
  if (result === "completed") sound?.play("completed");
  if (result === "snoozed") sound?.play("snoozed");
  // resolveReminder already shrinks the window in main; don't ask twice.
  void api.resolveReminder(pending, result as never);
  dismissBubble(false);
});

// ── heart: open settings without fighting the drag region ──────────────────

/*
 * The widget is one big drag region, so a click and the end of a drag look
 * identical to the DOM. The heart only counts as a click if the pointer barely
 * moved between press and release — dragging Pandy by the heart moves the
 * widget and opens nothing.
 */
const CLICK_SLOP_PX = 4;
let pressAt: { x: number; y: number } | null = null;

heart.addEventListener("pointerdown", (e) => {
  pressAt = { x: e.screenX, y: e.screenY };
});

heart.addEventListener("pointerup", (e) => {
  if (!pressAt) return;
  const moved = Math.hypot(e.screenX - pressAt.x, e.screenY - pressAt.y);
  pressAt = null;
  if (moved <= CLICK_SLOP_PX) void api.openSettings();
});

// Keyboard activation has no pointer to move, so it always opens.
heart.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    void api.openSettings();
  }
});

// Clicking Pandy itself still offers the compact menu; right-click always does.
canvas.addEventListener("click", () => {
  if (pending) return;
  void api.contextMenu();
});

widgetEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  void api.contextMenu();
});

/*
 * Dragging is handled by -webkit-app-region, which the compositor moves without
 * a round trip. This only persists the final position.
 */
window.addEventListener("mouseup", () => {
  if (!state || state.settings.widget.locked) return;
  if (body.dataset["route"] !== "widget") return;
  void api.moveWidget(window.screenX, window.screenY);
});

// ── routing ────────────────────────────────────────────────────────────────

function setRoute(route: Route): void {
  body.dataset["route"] = route;
  const isPanel = route !== "widget";
  panel.hidden = !isPanel;
  widgetEl.hidden = isPanel;

  if (!isPanel) {
    destroyPanel();
    return;
  }
  if (state) renderPanel(panel, state, route, panelActions);
}

const panelActions = {
  patch: (p: Record<string, unknown>) => {
    void api.setSettings(p);
    flashSaved();
  },
  previewSound: (event: SoundEvent) => sound?.preview(event),
  triggerNow: () => void api.triggerNow(),
  pause: (minutes: number) => void api.pause(minutes),
  resume: () => void api.resume(),
  resetSchedule: () => void api.resetSchedule(),
  restoreDefaults: () => void api.restoreDefaults(),
  completeOnboarding: () => void api.completeOnboarding(),
  close: () => void api.closeSettings(),
  quit: () => void api.quit(),
};

// Escape closes settings, the way every other panel on the machine does.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (body.dataset["route"] !== "settings") return;
  if (document.querySelector("dialog[open]")) return; // let the dialog take it
  void api.closeSettings();
});

// ── wiring ─────────────────────────────────────────────────────────────────

function applyState(next: AppState): void {
  const first = state === null;
  state = next;
  body.dataset["theme"] = next.settings.theme;
  body.classList.toggle("locked", next.settings.widget.locked);
  applyAppearance(next.settings);
  sound?.setSettings(next.settings.sound);

  // Re-render the open panel so values and their plain-language echoes stay
  // truthful after a change made anywhere.
  if (!first && body.dataset["route"] !== "widget") {
    renderPanel(panel, next, body.dataset["route"] as Route, panelActions);
  }
}

api.onState(applyState);
api.onMascot((mascot: MascotState) => animator?.setState(mascot));
api.onReminder(showReminder);
api.onReminderCleared(() => dismissBubble(false));
api.onSound((event: string) => {
  if (isSoundEvent(event)) sound?.play(event);
});
api.onRoute(setRoute);

void (async () => {
  const initial = await api.getState();
  sound = new SoundPlayer("sounds", initial.settings.sound);
  applyState(initial);
  await mountMascot(initial.settings);
  applyAppearance(initial.settings);
})();
