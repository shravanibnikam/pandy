import { REMINDER_TYPES, formatMinuteOfDay, type ReminderType } from "@pandy/shared-types";
import type { AppState, Route } from "../shared/ipc.js";

export interface PanelActions {
  setSettings(patch: Record<string, unknown>): void;
  triggerNow(): void;
  pause(minutes: number): void;
  resume(): void;
  resetSchedule(): void;
  completeOnboarding(): void;
  close(): void;
  quit(): void;
}

const CATEGORY_LABELS: Record<ReminderType, string> = {
  water: "Drink water",
  stand: "Stand and stretch",
  lookAway: "Look away from the screen",
  touchGrass: "Take a break outside",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function renderPanel(
  root: HTMLElement,
  state: AppState,
  route: Route,
  actions: PanelActions,
): void {
  root.replaceChildren();
  root.append(route === "onboarding" ? onboarding(state, actions) : settings(state, actions));
}

// ── onboarding ─────────────────────────────────────────────────────────────

function onboarding(state: AppState, actions: PanelActions): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.append(
    h(1, "Hi, I'm Pandy 🐼"),
    p("I'll nudge you to stand, drink water, look away from the screen and get outside now and then."),
    p("Everything stays on this machine. No account, no sync, no telemetry.", "muted"),
  );

  frag.append(
    radioGroup(
      "Where should reminders appear?",
      "deliveryOwner",
      state.settings.deliveryOwner,
      [
        ["both", "Wherever I am", "Uses this app when it's running, VS Code otherwise. Never both at once."],
        ["desktop", "Only here", "Desktop notifications only."],
        ["vscode", "Only in VS Code", "This app stays quiet; the widget still shows Pandy."],
      ],
      (value) => actions.setSettings({ deliveryOwner: value }),
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
      (value) => actions.setSettings({ tone: value }),
    ),
  );

  const start = button("Start", "primary");
  start.addEventListener("click", () => actions.completeOnboarding());
  frag.append(
    p("Defaults are calm: water every 2 hours, stand every 90 minutes, look away every 30 minutes, outside every 4 hours. Quiet from 8 PM to 8 AM, sound off. Change any of it whenever you like."),
    start,
  );
  return frag;
}

// ── settings ───────────────────────────────────────────────────────────────

function settings(state: AppState, actions: PanelActions): DocumentFragment {
  const s = state.settings;
  const frag = document.createDocumentFragment();

  const head = div("head");
  const info = div();
  info.append(h(1, "Pandy"));
  info.append(
    p(
      state.paused
        ? "Paused. Reminders are on hold."
        : state.next
          ? `Next reminder around ${new Date(state.next.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
          : "No reminders are enabled.",
    ),
  );
  info.append(p(`${state.daily.completed} of ${state.daily.total} taken today.`, "muted"));
  const closeBtn = button("Close");
  closeBtn.addEventListener("click", () => actions.close());
  head.append(info, closeBtn);
  frag.append(head);

  // Reminders
  const reminders = fieldset("Reminders");
  for (const type of REMINDER_TYPES) {
    reminders.append(
      checkRow(CATEGORY_LABELS[type], s.categories[type].enabled, (v) =>
        actions.setSettings({ categories: { ...s.categories, [type]: { ...s.categories[type], enabled: v } } }),
      ),
      numberRow("Every (minutes)", s.categories[type].intervalMinutes, 1, 1440, (v) =>
        actions.setSettings({
          categories: { ...s.categories, [type]: { ...s.categories[type], intervalMinutes: v } },
        }),
      ),
    );
  }
  frag.append(reminders);

  // When
  const when = fieldset("When");
  when.append(daysRow(s.workingDays, (days) => actions.setSettings({ workingDays: days })));
  when.append(
    timeRow("Active from", s.activeHours.start, (v) =>
      actions.setSettings({ activeHours: { ...s.activeHours, start: v } }),
    ),
    timeRow("Active until", s.activeHours.end, (v) =>
      actions.setSettings({ activeHours: { ...s.activeHours, end: v } }),
    ),
    checkRow("Quiet hours", s.quietHours.enabled, (v) =>
      actions.setSettings({ quietHours: { ...s.quietHours, enabled: v } }),
    ),
    timeRow("Quiet from", s.quietHours.start, (v) =>
      actions.setSettings({ quietHours: { ...s.quietHours, start: v } }),
    ),
    timeRow("Quiet until", s.quietHours.end, (v) =>
      actions.setSettings({ quietHours: { ...s.quietHours, end: v } }),
    ),
  );
  frag.append(when);

  // Behaviour
  const behaviour = fieldset("Behaviour");
  behaviour.append(
    numberRow("Snooze for (minutes)", s.snoozeMinutes, 1, 240, (v) => actions.setSettings({ snoozeMinutes: v })),
    numberRow("Daily limit (blank for none)", s.dailyLimit, 1, 200, (v) => actions.setSettings({ dailyLimit: v }), true),
    numberRow("Random variation (minutes)", s.randomizationMinutes, 0, 60, (v) =>
      actions.setSettings({ randomizationMinutes: v }),
    ),
    numberRow("Focus / pause length (minutes)", s.focusModeMinutes, 5, 480, (v) =>
      actions.setSettings({ focusModeMinutes: v }),
    ),
    numberRow("Minimum gap (minutes)", s.cooldownMinutes, 0, 120, (v) =>
      actions.setSettings({ cooldownMinutes: v }),
    ),
  );
  frag.append(behaviour);

  // Voice
  const voice = fieldset("Voice");
  voice.append(
    selectRow(
      "Tone",
      s.tone,
      [
        ["low-key", "Low-key — no slang or emoji"],
        ["gen-z", "Gen Z"],
        ["chaotic", "Chaotic"],
      ],
      (v) => actions.setSettings({ tone: v }),
    ),
    checkRow("Sound", s.sound.enabled, (v) => actions.setSettings({ sound: { ...s.sound, enabled: v } })),
    rangeRow("Volume", s.sound.volume, (v) => actions.setSettings({ sound: { ...s.sound, volume: v } })),
  );
  frag.append(voice);

  // Widget
  const widget = fieldset("Widget");
  widget.append(
    checkRow("Show the widget", s.widget.visible, (v) =>
      actions.setSettings({ widget: { ...s.widget, visible: v } }),
    ),
    checkRow("Always on top", s.widget.alwaysOnTop, (v) =>
      actions.setSettings({ widget: { ...s.widget, alwaysOnTop: v } }),
    ),
    checkRow("Show on all workspaces", s.widget.visibleOnAllWorkspaces, (v) =>
      actions.setSettings({ widget: { ...s.widget, visibleOnAllWorkspaces: v } }),
    ),
    checkRow("Lock position", s.widget.locked, (v) =>
      actions.setSettings({ widget: { ...s.widget, locked: v } }),
    ),
    selectRow(
      "Corner",
      s.widget.corner,
      [
        ["top-left", "Top left"],
        ["top-right", "Top right"],
        ["bottom-left", "Bottom left"],
        ["bottom-right", "Bottom right"],
      ],
      (v) => actions.setSettings({ widget: { ...s.widget, corner: v } }),
    ),
    rangeRow("Opacity", s.widget.opacity, (v) => actions.setSettings({ widget: { ...s.widget, opacity: v } }), 0.2),
    numberRow("Mascot size (whole numbers)", s.animation.mascotScale, 1, 8, (v) =>
      actions.setSettings({ animation: { ...s.animation, mascotScale: v } }),
    ),
    checkRow("Animate the mascot", s.animation.enabled, (v) =>
      actions.setSettings({ animation: { ...s.animation, enabled: v } }),
    ),
    checkRow("Reduced motion", s.animation.reducedMotion, (v) =>
      actions.setSettings({ animation: { ...s.animation, reducedMotion: v } }),
    ),
  );
  frag.append(widget);

  // System
  const system = fieldset("System");
  system.append(
    checkRow("Launch at login", s.launchAtLogin, (v) => actions.setSettings({ launchAtLogin: v })),
    selectRow(
      "Show reminders",
      s.deliveryOwner,
      [
        ["both", "Wherever I am"],
        ["desktop", "Only here"],
        ["vscode", "Only in VS Code"],
      ],
      (v) => actions.setSettings({ deliveryOwner: v }),
      "Pandy never shows the same reminder twice.",
    ),
    selectRow(
      "Theme",
      s.theme,
      [
        ["system", "Match the system"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
      (v) => actions.setSettings({ theme: v }),
    ),
  );
  frag.append(system);

  // Controls
  const controls = fieldset("Controls");
  const row = div("chips");
  const items: Array<[string, () => void]> = [
    ["Take a break now", () => actions.triggerNow()],
    [state.paused ? "Resume" : "Pause for 1 hour", () => (state.paused ? actions.resume() : actions.pause(60))],
    ["Reset schedule", () => actions.resetSchedule()],
    ["Quit Pandy", () => actions.quit()],
  ];
  for (const [label, onClick] of items) {
    const b = button(label);
    b.addEventListener("click", onClick);
    row.append(b);
  }
  controls.append(row);
  controls.append(
    p("Pandy stores your settings, the next reminder time and a local count of breaks taken. Nothing else, and nothing leaves this machine.", "muted"),
  );
  frag.append(controls);

  return frag;
}

// ── controls ───────────────────────────────────────────────────────────────

let uid = 0;
const nextId = () => `p${++uid}`;

function checkRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = div("row row-check");
  const id = nextId();
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, labelFor(id, label));
  return row;
}

function numberRow(
  label: string,
  value: number | null,
  min: number,
  max: number,
  onChange: (v: number | null) => void,
  nullable = false,
): HTMLElement {
  const row = div("row");
  const id = nextId();
  const input = document.createElement("input");
  input.type = "number";
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.value = value === null ? "" : String(value);
  input.addEventListener("change", () => {
    const raw = input.value.trim();
    if (raw === "") {
      if (nullable) onChange(null);
      return;
    }
    onChange(Number(raw));
  });
  row.append(labelFor(id, label), input);
  return row;
}

function timeRow(label: string, minuteOfDay: number, onChange: (v: string) => void): HTMLElement {
  const row = div("row");
  const id = nextId();
  const input = document.createElement("input");
  input.type = "time";
  input.id = id;
  input.value = formatMinuteOfDay(minuteOfDay);
  input.addEventListener("change", () => input.value && onChange(input.value));
  row.append(labelFor(id, label), input);
  return row;
}

function selectRow(
  label: string,
  value: string,
  options: ReadonlyArray<readonly [string, string]>,
  onChange: (v: string) => void,
  hint?: string,
): HTMLElement {
  const row = div("row");
  const id = nextId();
  const select = document.createElement("select");
  select.id = id;
  for (const [optValue, optLabel] of options) {
    const option = document.createElement("option");
    option.value = optValue;
    option.textContent = optLabel;
    option.selected = optValue === value;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  row.append(labelFor(id, label), select);
  if (hint) {
    const hintId = `${id}-hint`;
    select.setAttribute("aria-describedby", hintId);
    const el = document.createElement("span");
    el.className = "hint";
    el.id = hintId;
    el.textContent = hint;
    row.append(el);
  }
  return row;
}

function rangeRow(
  label: string,
  value: number,
  onChange: (v: number) => void,
  min = 0,
): HTMLElement {
  const row = div("row");
  const id = nextId();
  const input = document.createElement("input");
  input.type = "range";
  input.id = id;
  input.min = String(min);
  input.max = "1";
  input.step = "0.05";
  input.value = String(value);
  // A range with no readout is unusable for anyone who cannot see the thumb.
  input.setAttribute("aria-valuetext", `${Math.round(value * 100)} percent`);
  input.addEventListener("change", () => onChange(Number(input.value)));
  row.append(labelFor(id, label), input);
  return row;
}

function daysRow(selected: readonly number[], onChange: (days: number[]) => void): HTMLElement {
  const row = div("row");
  const group = div("chips");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Working days");
  const chosen = new Set(selected);

  for (let d = 0; d < 7; d++) {
    const b = button(chosen.has(d) ? `✓ ${DAY_NAMES[d]}` : DAY_NAMES[d]!);
    b.className = chosen.has(d) ? "chip on" : "chip";
    b.setAttribute("aria-pressed", String(chosen.has(d)));
    b.addEventListener("click", () => {
      if (chosen.has(d)) chosen.delete(d);
      else chosen.add(d);
      onChange([...chosen].sort((a, z) => a - z));
    });
    group.append(b);
  }

  const label = document.createElement("span");
  label.textContent = "Working days";
  row.append(label, group);
  return row;
}

function radioGroup(
  legend: string,
  name: string,
  value: string,
  options: ReadonlyArray<readonly [string, string, string]>,
  onChange: (v: string) => void,
): HTMLElement {
  const set = fieldset(legend);
  for (const [optValue, label, hint] of options) {
    const id = nextId();
    const row = div("radio-row");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = id;
    input.checked = optValue === value;
    input.addEventListener("change", () => onChange(optValue));
    const hintEl = document.createElement("span");
    hintEl.className = "hint";
    hintEl.textContent = hint;
    row.append(input, labelFor(id, label), hintEl);
    set.append(row);
  }
  return set;
}

// ── tiny DOM helpers ───────────────────────────────────────────────────────

function div(className = ""): HTMLElement {
  const el = document.createElement("div");
  if (className) el.className = className;
  return el;
}

function h(level: number, text: string): HTMLElement {
  const el = document.createElement(`h${level}`);
  el.textContent = text;
  return el;
}

function p(text: string, className = ""): HTMLElement {
  const el = document.createElement("p");
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function labelFor(id: string, text: string): HTMLLabelElement {
  const el = document.createElement("label");
  el.htmlFor = id;
  el.textContent = text;
  return el;
}

function fieldset(legendText: string): HTMLFieldSetElement {
  const el = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  el.append(legend);
  return el;
}

function button(text: string, className = ""): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
