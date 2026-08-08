import { MascotAnimator, loadSheets, prefersReducedMotion } from "@pandy/mascot";
import type { AppState, Route } from "../shared/ipc.js";
import { SECTIONS, renderSection, type SectionDeps, type SectionId } from "./sections.js";
import { actionButton, el, note } from "./controls.js";
import type { SoundEvent } from "./sound.js";

export interface PanelActions {
  patch(p: Record<string, unknown>): void;
  previewSound(event: SoundEvent): void;
  triggerNow(): void;
  pause(minutes: number): void;
  resume(): void;
  resetSchedule(): void;
  restoreDefaults(): void;
  completeOnboarding(): void;
  close(): void;
  quit(): void;
}

/** Remembered across re-renders so a settings change doesn't bounce you home. */
let currentSection: SectionId = "reminders";
let previewAnimator: MascotAnimator | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;

export function flashSaved(): void {
  const badge = document.getElementById("saved");
  if (!badge) return;
  badge.classList.add("show");
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => badge.classList.remove("show"), 1400);
}

export function destroyPanel(): void {
  previewAnimator?.destroy();
  previewAnimator = null;
}

export function renderPanel(
  root: HTMLElement,
  state: AppState,
  route: Route,
  actions: PanelActions,
): void {
  destroyPanel();
  root.replaceChildren();
  root.append(route === "onboarding" ? onboarding(state, actions) : settings(state, actions));
  // Only now is the shell in the document — mounting the preview any earlier
  // would look for a canvas that getElementById cannot yet see.
  if (route !== "onboarding") void mountPreview(state);
}

// ── settings shell ──────────────────────────────────────────────────────────

function settings(state: AppState, actions: PanelActions): HTMLElement {
  const shell = el("div", "shell");

  // ── top bar: identity, status, live preview, saved badge, close ──
  const top = el("header", "topbar");
  const title = el("div");
  title.append(el("h1", "", "Pandy"));
  title.append(el("p", "status", statusLine(state)));

  const saved = el("span", "saved", "Saved ✓");
  saved.id = "saved";
  saved.setAttribute("role", "status");
  saved.setAttribute("aria-live", "polite");

  const previewBox = el("div", "preview-box");
  const previewCanvas = el("canvas");
  previewCanvas.id = "preview";
  previewCanvas.width = 64;
  previewCanvas.height = 64;
  previewCanvas.setAttribute("role", "img");
  previewCanvas.setAttribute("aria-label", "Live preview of Pandy at your chosen size");
  previewBox.append(previewCanvas);

  const close = actionButton("Close", () => actions.close());
  close.setAttribute("aria-label", "Close settings and go back to Pandy");

  top.append(title, el("span", "spacer"), saved, previewBox, close);

  // ── sidebar ──
  const nav = el("nav", "nav");
  nav.setAttribute("aria-label", "Settings sections");
  const list = el("ul");
  const content = el("div", "content");
  content.id = "section-content";
  content.tabIndex = -1;

  const deps: SectionDeps = {
    state,
    patch: actions.patch,
    preview: actions.previewSound,
    triggerNow: actions.triggerNow,
    pause: actions.pause,
    resume: actions.resume,
    resetSchedule: actions.resetSchedule,
    restoreDefaults: actions.restoreDefaults,
    quit: actions.quit,
  };

  const buttons = new Map<SectionId, HTMLButtonElement>();
  const show = (id: SectionId, moveFocus: boolean) => {
    currentSection = id;
    for (const [key, b] of buttons) b.setAttribute("aria-current", String(key === id));
    content.replaceChildren(renderSection(id, deps));
    content.scrollTop = 0;
    // Send focus to the panel so the keyboard lands where the eye does.
    if (moveFocus) content.focus();
  };

  for (const section of SECTIONS) {
    const li = el("li");
    const b = actionButton(section.label, () => show(section.id, true));
    b.setAttribute("aria-current", String(section.id === currentSection));
    buttons.set(section.id, b);
    li.append(b);
    list.append(li);
  }
  nav.append(list);

  const foot = el("div", "nav-foot");
  foot.append(note("Changes save automatically."));
  nav.append(foot);

  shell.append(top, nav, content);
  show(currentSection, false);
  return shell;
}

function statusLine(state: AppState): string {
  const breaks =
    state.daily.completed === 0
      ? "No breaks taken yet today"
      : state.daily.completed === 1
        ? "1 break taken today"
        : `${state.daily.completed} breaks taken today`;

  if (state.paused) return `Paused · ${breaks}`;
  if (!state.next) return `No reminders turned on · ${breaks}`;

  const when = new Date(state.next.dueAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Next reminder around ${when} · ${breaks}`;
}

/** The live Pandy in the header, reflecting size, fade and motion settings. */
async function mountPreview(state: AppState): Promise<void> {
  const canvas = document.getElementById("preview") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Fills the 76px box at a whole-number scale, so the preview stays crisp.
  const px = state.settings.animation.mascotScale >= 3 ? 64 : 64;
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;
  canvas.style.opacity = String(state.settings.widget.opacity);

  try {
    const sheets = await loadSheets("strips");
    previewAnimator = new MascotAnimator({
      ctx,
      sheets,
      reducedMotion: state.settings.animation.reducedMotion || prefersReducedMotion(),
    });
    previewAnimator.setState(state.settings.animation.enabled ? "idle" : "idle");
    if (!state.settings.animation.enabled) previewAnimator.setReducedMotion(true);
  } catch {
    canvas.replaceWith(note("Preview unavailable."));
  }
}

// ── onboarding ──────────────────────────────────────────────────────────────

function onboarding(state: AppState, actions: PanelActions): HTMLElement {
  const wrap = el("div", "onboarding-wrap");
  wrap.append(
    el("h1", "", "Hi, I'm Pandy 🐼"),
    el(
      "p",
      "",
      "I'll nudge you to stand, drink water, look away from the screen and get outside now and then.",
    ),
    note("Everything stays on this machine. No account, no sync, no telemetry."),
  );

  wrap.append(
    radioGroup(
      "Where should reminders appear?",
      "deliveryOwner",
      state.settings.deliveryOwner,
      [
        ["both", "Wherever I am", "Uses this app while it's running, VS Code otherwise. Never both at once."],
        ["desktop", "Only here", "Desktop notifications only."],
        ["vscode", "Only in VS Code", "This app stays quiet; Pandy still sits on your desktop."],
      ],
      (v) => actions.patch({ deliveryOwner: v }),
    ),
    radioGroup(
      "How should I talk?",
      "tone",
      state.settings.tone,
      [
        ["low-key", "Low-key", "Plain language. No slang, no emoji."],
        ["gen-z", "Gen Z", "Slang and emoji, warm rather than ironic."],
        ["chaotic", "Chaotic", "Unhinged energy, still kind."],
      ],
      (v) => actions.patch({ tone: v }),
    ),
  );

  wrap.append(
    el(
      "p",
      "",
      "Defaults are calm: water every 2 hours, stand every 90 minutes, look away every 30 minutes, outside every 4 hours. Quiet from 8 PM to 8 AM, and no sound at all unless you ask for it.",
    ),
    note("Everything is changeable later — click the ♥ beside Pandy any time."),
    actionButton("Start", () => actions.completeOnboarding(), "primary"),
  );
  return wrap;
}

function radioGroup(
  legend: string,
  name: string,
  value: string,
  options: ReadonlyArray<readonly [string, string, string]>,
  onChange: (v: string) => void,
): HTMLElement {
  const set = el("fieldset", "group");
  set.append(el("legend", "", legend));
  for (const [optValue, label, hint] of options) {
    const id = `${name}-${optValue}`;
    const row = el("div", "radio-row");
    const input = el("input");
    input.type = "radio";
    input.name = name;
    input.id = id;
    input.checked = optValue === value;
    input.addEventListener("change", () => onChange(optValue));
    const l = el("label");
    l.htmlFor = id;
    l.textContent = label;
    row.append(input, l, note(hint));
    set.append(row);
  }
  return set;
}
