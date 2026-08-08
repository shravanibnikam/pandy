import { MascotAnimator, loadSheets, prefersReducedMotion } from "@pandy/mascot";
import type { MascotState, ReminderType, Settings } from "@pandy/shared-types";
import type { AppState, PandyBridge, ReminderPayload, Route } from "../shared/ipc.js";
import { renderPanel } from "./panel.js";

declare global {
  interface Window {
    readonly pandy: PandyBridge;
  }
}

const api = window.pandy;
const body = document.body;
const widgetEl = document.getElementById("widget")!;
const canvas = document.getElementById("mascot") as HTMLCanvasElement;
const bubble = document.getElementById("bubble")!;
const actions = document.getElementById("actions")!;
const panel = document.getElementById("panel")!;

let animator: MascotAnimator | null = null;
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

  // Nothing should animate while the window is hidden — that is the whole
  // reason a widget parked in a corner costs nothing.
  document.addEventListener("visibilitychange", () => {
    animator?.setVisible(document.visibilityState === "visible");
  });
}

function applyAnimationSettings(settings: Settings): void {
  // Explicit pixel size, never a percentage: the window grows when a reminder
  // appears, and a percentage-sized canvas would stretch the sprite with it.
  const px = 64 * settings.animation.mascotScale;
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;

  if (!animator) return;
  const reduced = settings.animation.reducedMotion || prefersReducedMotion();
  animator.setReducedMotion(reduced);
  animator.setVisible(settings.animation.enabled && document.visibilityState === "visible");
}

// ── widget behaviour ───────────────────────────────────────────────────────

function showReminder(reminder: ReminderPayload): void {
  pending = reminder.type;
  bubble.textContent = reminder.message;
  bubble.hidden = false;
  actions.hidden = false;
  if (bubbleTimer) clearTimeout(bubbleTimer);
  // Fade the prompt out on its own if it is ignored — the schedule has already
  // advanced, so a stale bubble would just be clutter.
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
  // Main grew the window to fit the bubble; tell it to shrink back.
  if (wasShowing && notifyMain) void api.reminderDismissed();
}

actions.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const result = target.dataset["result"];
  if (!result || !pending) return;
  // resolveReminder already shrinks the window in main, so don't ask twice.
  void api.resolveReminder(pending, result as never);
  dismissBubble(false);
});

// Click the mascot for the compact menu, right-click for the full one.
canvas.addEventListener("click", () => {
  if (pending) return;
  void api.contextMenu();
});

widgetEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  void api.contextMenu();
});

/*
 * Dragging is handled by -webkit-app-region on the widget, which the compositor
 * moves without a round trip. This listener only persists the final position,
 * and only when the widget is not locked.
 */
window.addEventListener("mouseup", () => {
  if (!state || state.settings.widget.locked) return;
  void api.moveWidget(window.screenX, window.screenY);
});

// ── routing ────────────────────────────────────────────────────────────────

function setRoute(route: Route): void {
  body.dataset["route"] = route;
  const isPanel = route !== "widget";
  panel.hidden = !isPanel;
  widgetEl.hidden = isPanel;

  if (isPanel && state) {
    renderPanel(panel, state, route, {
      setSettings: (patch) => void api.setSettings(patch),
      triggerNow: () => void api.triggerNow(),
      pause: (minutes) => void api.pause(minutes),
      resume: () => void api.resume(),
      resetSchedule: () => void api.resetSchedule(),
      completeOnboarding: () => void api.completeOnboarding(),
      close: () => void api.closeSettings(),
      quit: () => void api.quit(),
    });
  }
}

// ── wiring ─────────────────────────────────────────────────────────────────

function applyState(next: AppState): void {
  state = next;
  body.dataset["theme"] = next.settings.theme;
  body.classList.toggle("locked", next.settings.widget.locked);
  applyAnimationSettings(next.settings);
  if (body.dataset["route"] !== "widget") setRoute(body.dataset["route"] as Route);
}

api.onState(applyState);
api.onMascot((mascot: MascotState) => animator?.setState(mascot));
api.onReminder(showReminder);
// Answered from the tray or the OS notification — main already shrank the
// window, so clear the bubble without asking it to shrink again.
api.onReminderCleared(() => dismissBubble(false));
api.onRoute(setRoute);

void (async () => {
  const initial = await api.getState();
  applyState(initial);
  await mountMascot(initial.settings);
  applyAnimationSettings(initial.settings);
})();
