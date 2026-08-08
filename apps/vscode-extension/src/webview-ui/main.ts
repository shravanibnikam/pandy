import { MASCOT_STATES, type MascotState, type Settings } from "@pandy/shared-types";
import { MascotAnimator, loadSheets, prefersReducedMotion } from "@pandy/mascot";
import { FIELDS, type Field } from "./fields.js";
import { formatMinuteOfDay } from "@pandy/shared-types";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;
const stripsBase = document.body.dataset["strips"] ?? "";

let animator: MascotAnimator | null = null;
let current: Settings | null = null;

interface StateMessage {
  type: "state";
  settings: Settings;
  onboarded: boolean;
  daily: { total: number; completed: number };
  paused: boolean;
  next: { type: string; dueAt: number } | null;
}

window.addEventListener("message", (event: MessageEvent) => {
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return;
  const msg = data as Partial<StateMessage>;
  if (msg.type !== "state" || !msg.settings) return;
  current = msg.settings;
  render(msg as StateMessage);
});

vscode.postMessage({ type: "ready" });

function set(key: string, value: unknown): void {
  vscode.postMessage({ type: "setSetting", key, value });
}

function run(name: string): void {
  vscode.postMessage({ type: "command", name });
}

function render(state: StateMessage): void {
  animator?.destroy();
  animator = null;
  app.replaceChildren();
  app.setAttribute("aria-busy", "false");

  if (!state.onboarded) {
    app.append(onboarding(state));
  } else {
    app.append(header(state), preview(), settingsForm(state.settings), footer(state));
  }
  void mountMascot();
}

// ── onboarding ─────────────────────────────────────────────────────────────

function onboarding(state: StateMessage): HTMLElement {
  const wrap = el("section", { class: "card onboarding" });
  wrap.append(
    h(1, "Hi, I'm Pandy 🐼"),
    p("I'll nudge you to stand, drink water, look away from the screen and get outside now and then. Nothing leaves your machine — no account, no sync, no telemetry."),
    canvasHost(),
  );

  const fieldset = el("fieldset");
  fieldset.append(el("legend", {}, "Where should reminders appear?"));
  const options: Array<[string, string, string]> = [
    ["both", "Wherever I am", "Uses the desktop app when it's running, VS Code otherwise. Never both at once."],
    ["vscode", "Only in VS Code", "The editor shows every reminder."],
    ["desktop", "Only on the desktop", "Falls back to VS Code if the desktop app isn't running."],
  ];
  for (const [value, label, hint] of options) {
    const id = `owner-${value}`;
    const row = el("div", { class: "radio-row" });
    const input = el("input", { type: "radio", name: "deliveryOwner", id, value }) as HTMLInputElement;
    input.checked = state.settings.deliveryOwner === value;
    input.addEventListener("change", () => set("deliveryOwner", value));
    row.append(input, el("label", { for: id }, label), el("span", { class: "hint" }, hint));
    fieldset.append(row);
  }
  wrap.append(fieldset);

  const toneSet = el("fieldset");
  toneSet.append(el("legend", {}, "How should I talk?"));
  const tones: Array<[string, string, string]> = [
    ["low-key", "Low-key", "Plain language. No slang, no emoji."],
    ["gen-z", "Gen Z", "Slang and emoji, warm rather than ironic."],
    ["chaotic", "Chaotic", "Unhinged energy, still kind."],
  ];
  for (const [value, label, hint] of tones) {
    const id = `tone-${value}`;
    const row = el("div", { class: "radio-row" });
    const input = el("input", { type: "radio", name: "tone", id, value }) as HTMLInputElement;
    input.checked = state.settings.tone === value;
    input.addEventListener("change", () => set("tone", value));
    row.append(input, el("label", { for: id }, label), el("span", { class: "hint" }, hint));
    toneSet.append(row);
  }
  wrap.append(toneSet);

  const done = el("button", { class: "primary", type: "button" }, "Start") as HTMLButtonElement;
  done.addEventListener("click", () => vscode.postMessage({ type: "completeOnboarding" }));
  wrap.append(
    p("Defaults are calm: water every 2 hours, stand every 90 minutes, look away every 30 minutes, outside every 4 hours. Quiet from 8 PM to 8 AM, sound off. You can change all of it later."),
    done,
  );
  return wrap;
}

// ── main panel ─────────────────────────────────────────────────────────────

function header(state: StateMessage): HTMLElement {
  const wrap = el("header", { class: "card head" });
  const info = el("div");
  info.append(h(1, "Pandy"));

  if (state.paused) {
    info.append(p("Paused. Reminders are on hold."));
  } else if (state.next) {
    const when = new Date(state.next.dueAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    info.append(p(`Next reminder around ${when}.`));
  } else {
    info.append(p("No reminders are enabled."));
  }

  // Just the count, never "N of M" — a manual break increments completed but
  // not total, so the ratio can read "1 of 0", and a quota you are behind on is
  // exactly the guilt framing this project avoids.
  info.append(p(breaksToday(state.daily.completed), "muted"));
  wrap.append(info);
  return wrap;
}

export function breaksToday(completed: number): string {
  if (completed === 0) return "No breaks taken yet today.";
  return completed === 1 ? "1 break taken today." : `${completed} breaks taken today.`;
}

function canvasHost(): HTMLElement {
  const host = el("div", { class: "mascot" });
  const canvas = el("canvas", { id: "mascot", width: "64", height: "64" });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Pandy the panda");
  host.append(canvas);
  return host;
}

function preview(): HTMLElement {
  const wrap = el("section", { class: "card" });
  wrap.append(h(2, "Preview"), canvasHost());

  const row = el("div", { class: "chips", role: "group" });
  row.setAttribute("aria-label", "Preview an animation");
  for (const state of MASCOT_STATES) {
    const b = el("button", { type: "button", class: "chip" }, state) as HTMLButtonElement;
    b.addEventListener("click", () => animator?.setState(state as MascotState));
    row.append(b);
  }
  wrap.append(row);
  return wrap;
}

function settingsForm(settings: Settings): HTMLElement {
  const form = el("section", { class: "card" });
  form.append(h(2, "Settings"));

  let group: HTMLFieldSetElement | null = null;
  for (const field of FIELDS) {
    if (field.group) {
      group = el("fieldset") as HTMLFieldSetElement;
      group.append(el("legend", {}, field.group));
      form.append(group);
    }
    group?.append(fieldRow(field, settings));
  }
  return form;
}

function fieldRow(field: Field, settings: Settings): HTMLElement {
  const row = el("div", { class: field.kind === "days" ? "row row-wide" : "row" });
  const id = `f-${field.key.replace(/\./g, "-")}`;
  const value = field.read(settings);

  const label = el("label", { for: id }, field.label);
  let input: HTMLElement;

  if (field.kind === "boolean") {
    const cb = el("input", { type: "checkbox", id }) as HTMLInputElement;
    cb.checked = Boolean(value);
    cb.addEventListener("change", () => set(field.key, cb.checked));
    input = cb;
    row.classList.add("row-check");
  } else if (field.kind === "select") {
    const sel = el("select", { id }) as HTMLSelectElement;
    for (const opt of field.options ?? []) {
      const o = el("option", { value: opt.value }, opt.label) as HTMLOptionElement;
      o.selected = String(value) === opt.value;
      sel.append(o);
    }
    sel.addEventListener("change", () => set(field.key, sel.value));
    input = sel;
  } else if (field.kind === "time") {
    const t = el("input", { type: "time", id }) as HTMLInputElement;
    t.value = formatMinuteOfDay(Number(value));
    t.addEventListener("change", () => t.value && set(field.key, t.value));
    input = t;
  } else if (field.kind === "days") {
    input = daysPicker(id, (value as number[]) ?? []);
  } else {
    const n = el("input", { type: "number", id }) as HTMLInputElement;
    n.value = value === null || value === undefined ? "" : String(value);
    if (field.min !== undefined) n.min = String(field.min);
    if (field.max !== undefined) n.max = String(field.max);
    n.addEventListener("change", () => {
      const raw = n.value.trim();
      if (raw === "") set(field.key, field.nullable ? null : undefined);
      else set(field.key, Number(raw));
    });
    input = n;
  }

  if (field.hint) {
    const hintId = `${id}-hint`;
    input.setAttribute("aria-describedby", hintId);
    row.append(label, input, el("span", { class: "hint", id: hintId }, field.hint));
  } else {
    row.append(label, input);
  }
  return row;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysPicker(id: string, selected: readonly number[]): HTMLElement {
  const group = el("div", { class: "chips", role: "group", id });
  group.setAttribute("aria-label", "Working days");
  const chosen = new Set(selected);

  for (let d = 0; d < 7; d++) {
    const b = el("button", { type: "button", class: "chip" }, DAY_NAMES[d]!) as HTMLButtonElement;
    const on = chosen.has(d);
    b.setAttribute("aria-pressed", String(on));
    // State is carried by aria-pressed and a check mark, not by colour alone.
    b.textContent = on ? `✓ ${DAY_NAMES[d]}` : DAY_NAMES[d]!;
    b.classList.toggle("on", on);
    b.addEventListener("click", () => {
      if (chosen.has(d)) chosen.delete(d);
      else chosen.add(d);
      set("workingDays", [...chosen].sort((a, z) => a - z));
    });
    group.append(b);
  }
  return group;
}

function footer(state: StateMessage): HTMLElement {
  const wrap = el("section", { class: "card actions" });
  wrap.append(h(2, "Controls"));
  const row = el("div", { class: "chips" });

  const buttons: Array<[string, string]> = [
    ["Take a break now", "pandy.takeBreakNow"],
    [state.paused ? "Resume" : "Pause", state.paused ? "pandy.resume" : "pandy.pause"],
    ["Reset schedule", "pandy.resetSchedule"],
  ];
  for (const [label, command] of buttons) {
    const b = el("button", { type: "button" }, label) as HTMLButtonElement;
    b.addEventListener("click", () => run(command));
    row.append(b);
  }
  wrap.append(
    row,
    p("Pandy stores your settings, the next reminder time and a local count of breaks taken. Nothing else, and nothing leaves this machine.", "muted"),
  );
  return wrap;
}

// ── mascot ─────────────────────────────────────────────────────────────────

async function mountMascot(): Promise<void> {
  const canvas = document.getElementById("mascot") as HTMLCanvasElement | null;
  if (!canvas || !stripsBase) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  try {
    const sheets = await loadSheets(stripsBase);
    const reduced = current?.animation.reducedMotion || prefersReducedMotion();
    const scale = current?.animation.mascotScale ?? 2;
    canvas.style.width = `${64 * scale}px`;
    canvas.style.height = `${64 * scale}px`;

    animator = new MascotAnimator({ ctx, sheets, reducedMotion: reduced });
    animator.setState("idle");

    // Stop drawing entirely when the panel is not on screen.
    document.addEventListener("visibilitychange", () => {
      animator?.setVisible(document.visibilityState === "visible");
    });
  } catch {
    canvas.replaceWith(el("p", { class: "muted" }, "Mascot art could not be loaded."));
  }
}

// ── tiny DOM helpers ───────────────────────────────────────────────────────

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function h(level: number, text: string): HTMLElement {
  return el(`h${level}`, {}, text);
}

function p(text: string, cls?: string): HTMLElement {
  return el("p", cls ? { class: cls } : {}, text);
}
