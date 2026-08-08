import {
  REMINDER_TYPES,
  formatMinuteOfDay,
  minuteOfDay,
  type ReminderType,
  type Settings,
} from "@pandy/shared-types";
import type { AppState } from "../shared/ipc.js";
import { SOUNDS, SOUND_EVENTS, type SoundEvent } from "./sound.js";
import {
  actionButton,
  buttonRow,
  confirmAction,
  dayPicker,
  dropdown,
  el,
  group,
  humanMinutes,
  humanTime,
  note,
  numberField,
  slider,
  timeRange,
  toggle,
} from "./controls.js";

export type SectionId =
  | "reminders"
  | "pandy"
  | "sounds"
  | "focus"
  | "notifications"
  | "advanced";

export const SECTIONS: ReadonlyArray<{ readonly id: SectionId; readonly label: string; readonly lede: string }> = [
  { id: "reminders", label: "Reminders", lede: "What Pandy nudges you about, and when." },
  { id: "pandy", label: "Pandy", lede: "How the panda looks, moves and talks." },
  { id: "sounds", label: "Sounds", lede: "Pandy is silent unless you turn this on." },
  { id: "focus", label: "Focus & quiet time", lede: "When Pandy should leave you alone." },
  { id: "notifications", label: "Notifications", lede: "Where reminders show up." },
  { id: "advanced", label: "Advanced", lede: "Fine-tuning, and starting over." },
];

const CATEGORY: Record<ReminderType, { label: string; blurb: string }> = {
  water: { label: "Drink water", blurb: "A nudge to take a sip." },
  stand: { label: "Stand and stretch", blurb: "Get out of the chair for a moment." },
  lookAway: { label: "Look away from the screen", blurb: "Rest your eyes on something far away." },
  touchGrass: { label: "Take a break outside", blurb: "Fresh air, even for a minute." },
};

export interface SectionDeps {
  readonly state: AppState;
  readonly patch: (p: Record<string, unknown>) => void;
  readonly preview: (event: SoundEvent) => void;
  readonly triggerNow: () => void;
  readonly pause: (minutes: number) => void;
  readonly resume: () => void;
  readonly resetSchedule: () => void;
  readonly restoreDefaults: () => void;
  readonly quit: () => void;
}

export function renderSection(id: SectionId, deps: SectionDeps): DocumentFragment {
  const frag = document.createDocumentFragment();
  const meta = SECTIONS.find((s) => s.id === id)!;
  frag.append(el("h2", "", meta.label), el("p", "lede", meta.lede));

  switch (id) {
    case "reminders": frag.append(...reminders(deps)); break;
    case "pandy": frag.append(...pandy(deps)); break;
    case "sounds": frag.append(...sounds(deps)); break;
    case "focus": frag.append(...focus(deps)); break;
    case "notifications": frag.append(...notifications(deps)); break;
    case "advanced": frag.append(...advanced(deps)); break;
  }
  return frag;
}

// ── Reminders ───────────────────────────────────────────────────────────────

function reminders({ state, patch }: SectionDeps): HTMLElement[] {
  const s = state.settings;
  const out: HTMLElement[] = [];

  for (const type of REMINDER_TYPES) {
    const cat = s.categories[type];
    const set = group(CATEGORY[type].label);

    set.append(
      toggle({
        label: `Remind me to ${CATEGORY[type].label.toLowerCase()}`,
        valueText: cat.enabled ? `Every ${humanMinutes(cat.intervalMinutes)}` : "Turned off",
        hint: CATEGORY[type].blurb,
        checked: cat.enabled,
        onChange: (v) =>
          patch({ categories: { ...s.categories, [type]: { ...cat, enabled: v } } }),
      }),
      slider({
        label: "How often",
        min: 5,
        max: 480,
        step: 5,
        value: cat.intervalMinutes,
        format: (v) => `Every ${humanMinutes(v)}`,
        onChange: (v) =>
          patch({ categories: { ...s.categories, [type]: { ...cat, intervalMinutes: v } } }),
      }),
      customMessages(type, s, patch),
    );
    out.push(set);
  }

  const when = group("Days and hours");
  when.append(
    dayPicker({
      label: "Days you want reminders",
      hint: "On any other day Pandy stays quiet all day.",
      selected: s.workingDays,
      onChange: (days) => patch({ workingDays: days }),
    }),
    timeRange({
      label: "Active hours",
      hint: "Outside these hours Pandy waits until the next morning.",
      from: formatMinuteOfDay(s.activeHours.start),
      to: formatMinuteOfDay(s.activeHours.end),
      onChange: (from, to) =>
        patch({ activeHours: { start: minuteOfDay(from, 480), end: minuteOfDay(to, 1200) } }),
    }),
    note(
      `Right now: ${humanTime(s.activeHours.start)} to ${humanTime(s.activeHours.end)}.`,
    ),
  );
  out.push(when);
  return out;
}

/** Collapsible per-category message editor, folded away until opened. */
function customMessages(
  type: ReminderType,
  s: Settings,
  patch: (p: Record<string, unknown>) => void,
): HTMLElement {
  const existing = s.customMessages[type] ?? [];
  const details = el("details", "messages");
  const summary = el("summary");
  summary.textContent =
    existing.length === 0
      ? "Write your own messages"
      : `Your own messages (${existing.length})`;
  details.append(summary);

  const body = el("div", "body");
  const area = el("textarea");
  area.value = existing.join("\n");
  area.placeholder = "One message per line.\nLeave empty to use Pandy's own.";
  area.setAttribute("aria-label", `Custom messages for ${CATEGORY[type].label}`);
  area.addEventListener("change", () => {
    const lines = area.value
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    summary.textContent =
      lines.length === 0 ? "Write your own messages" : `Your own messages (${lines.length})`;
    patch({ customMessages: { ...s.customMessages, [type]: lines } });
  });

  body.append(
    area,
    note("Pandy mixes these in with its own, and never repeats one until it has used them all."),
  );
  details.append(body);
  return details;
}

// ── Pandy ───────────────────────────────────────────────────────────────────

function pandy({ state, patch }: SectionDeps): HTMLElement[] {
  const s = state.settings;

  const look = group("How Pandy looks");
  look.append(
    slider({
      label: "Size",
      min: 1,
      max: 6,
      step: 1,
      value: s.animation.mascotScale,
      format: (v) => `${v}× — ${64 * v} pixels across`,
      hint: "Whole steps only. In-between sizes would blur the pixel art.",
      onChange: (v) => patch({ animation: { ...s.animation, mascotScale: v } }),
    }),
    slider({
      label: "Fade",
      min: 0.2,
      max: 1,
      step: 0.05,
      value: s.widget.opacity,
      format: (v) => (v >= 0.99 ? "Fully solid" : `${Math.round(v * 100)}% visible`),
      hint: "Makes Pandy blend into your desktop. Only the panda fades — never a box around it.",
      onChange: (v) => patch({ widget: { ...s.widget, opacity: v } }),
    }),
    toggle({
      label: "Animate Pandy",
      valueText: s.animation.enabled ? "Moving" : "Still",
      checked: s.animation.enabled,
      onChange: (v) => patch({ animation: { ...s.animation, enabled: v } }),
    }),
    toggle({
      label: "Reduced motion",
      valueText: s.animation.reducedMotion ? "One still frame" : "Full animation",
      hint: "Shows a single frame instead of animating. Pandy also follows your system setting on its own.",
      checked: s.animation.reducedMotion,
      onChange: (v) => patch({ animation: { ...s.animation, reducedMotion: v } }),
    }),
  );

  const place = group("Where Pandy sits");
  place.append(
    toggle({
      label: "Show Pandy on the desktop",
      valueText: s.widget.visible ? "Visible" : "Hidden — reminders still arrive",
      checked: s.widget.visible,
      onChange: (v) => patch({ widget: { ...s.widget, visible: v } }),
    }),
    dropdown({
      label: "Corner",
      value: s.widget.corner,
      hint: "Where Pandy returns to. You can always drag it somewhere else.",
      options: [
        ["top-left", "Top left"],
        ["top-right", "Top right"],
        ["bottom-left", "Bottom left"],
        ["bottom-right", "Bottom right"],
      ],
      onChange: (v) => patch({ widget: { ...s.widget, corner: v } }),
    }),
    toggle({
      label: "Lock in place",
      valueText: s.widget.locked ? "Can't be dragged" : "Can be dragged",
      checked: s.widget.locked,
      onChange: (v) => patch({ widget: { ...s.widget, locked: v } }),
    }),
    toggle({
      label: "Stay on top of other windows",
      valueText: s.widget.alwaysOnTop ? "Always visible" : "Goes behind windows",
      checked: s.widget.alwaysOnTop,
      onChange: (v) => patch({ widget: { ...s.widget, alwaysOnTop: v } }),
    }),
    toggle({
      label: "Show on every desktop",
      valueText: s.widget.visibleOnAllWorkspaces ? "All desktops" : "Only this desktop",
      checked: s.widget.visibleOnAllWorkspaces,
      onChange: (v) => patch({ widget: { ...s.widget, visibleOnAllWorkspaces: v } }),
    }),
    dropdown({
      label: "Settings button",
      value: s.widget.settingsControl,
      hint: "The little button beside Pandy that opens this window. Right-clicking Pandy always works too.",
      options: [
        ["heart", "A heart ♥"],
        ["dot", "A small dot •"],
        ["hidden", "Hidden — use right-click or the menu bar"],
      ],
      onChange: (v) => patch({ widget: { ...s.widget, settingsControl: v } }),
    }),
  );

  const voice = group("How Pandy talks");
  voice.append(
    dropdown({
      label: "Personality",
      value: s.tone,
      options: [
        ["low-key", "Low-key — plain, no slang or emoji"],
        ["gen-z", "Gen Z — slang and emoji, warm"],
        ["chaotic", "Chaotic — unhinged, still kind"],
      ],
      onChange: (v) => patch({ tone: v }),
    }),
    note("Pandy never uses guilt, shame or streaks, whichever personality you pick."),
    dropdown({
      label: "Colours",
      value: s.theme,
      options: [
        ["system", "Match my system"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
      onChange: (v) => patch({ theme: v }),
    }),
  );

  return [look, place, voice];
}

// ── Sounds ──────────────────────────────────────────────────────────────────

function sounds({ state, patch, preview }: SectionDeps): HTMLElement[] {
  const s = state.settings;

  const master = group("Sound");
  master.append(
    toggle({
      label: "Play sounds",
      valueText: s.sound.enabled ? "On" : "Off — Pandy is completely silent",
      hint: "Off by default. Nothing ever loops, and nothing plays while you are on this page unless you press Test.",
      checked: s.sound.enabled,
      onChange: (v) => patch({ sound: { ...s.sound, enabled: v } }),
    }),
    slider({
      label: "Volume",
      min: 0,
      max: 1,
      step: 0.05,
      value: s.sound.volume,
      format: (v) => (v === 0 ? "Silent" : `${Math.round(v * 100)}%`),
      onChange: (v) => patch({ sound: { ...s.sound, volume: v } }),
    }),
    toggle({
      label: "Also play a sound for focus mode",
      valueText: s.sound.focusCues ? "When focus starts and ends" : "Off",
      checked: s.sound.focusCues,
      onChange: (v) => patch({ sound: { ...s.sound, focusCues: v } }),
    }),
  );

  const list = group("What each sound is for");
  for (const event of SOUND_EVENTS) {
    const spec = SOUNDS[event];
    const row = el("div", "sound-row");

    const label = el("div", "field-label");
    label.append(el("span", "", spec.label));
    const willPlay = !s.sound.enabled
      ? "Silent while sounds are off"
      : spec.optional && !s.sound.focusCues
        ? "Turned off"
        : "Will play";
    label.append(el("span", "field-value", willPlay));

    const test = actionButton(`▶ Test`, () => preview(event));
    test.setAttribute("aria-label", `Play a preview of the sound for: ${spec.label}`);

    row.append(label, test, note(`${spec.description} Plays once — never on a loop.`));
    list.append(row);
  }

  return [master, list];
}

// ── Focus & quiet time ──────────────────────────────────────────────────────

function focus({ state, patch, pause, resume }: SectionDeps): HTMLElement[] {
  const s = state.settings;

  const quiet = group("Quiet hours");
  quiet.append(
    toggle({
      label: "Keep quiet overnight",
      valueText: s.quietHours.enabled
        ? `${humanTime(s.quietHours.start)} to ${humanTime(s.quietHours.end)}`
        : "Off",
      hint: "Reminders that come due during quiet hours are moved to the next morning, not stacked up.",
      checked: s.quietHours.enabled,
      onChange: (v) => patch({ quietHours: { ...s.quietHours, enabled: v } }),
    }),
    timeRange({
      label: "Quiet from",
      from: formatMinuteOfDay(s.quietHours.start),
      to: formatMinuteOfDay(s.quietHours.end),
      onChange: (from, to) =>
        patch({ quietHours: { ...s.quietHours, start: minuteOfDay(from, 1200), end: minuteOfDay(to, 480) } }),
    }),
    note("This window can cross midnight — 8 PM to 8 AM works exactly as you would expect."),
  );

  const focusGroup = group("Focus mode");
  focusGroup.append(
    slider({
      label: "How long focus mode lasts",
      min: 5,
      max: 240,
      step: 5,
      value: s.focusModeMinutes,
      format: (v) => humanMinutes(v),
      hint: "Also the length used by the Pause button on a reminder.",
      onChange: (v) => patch({ focusModeMinutes: v }),
    }),
    slider({
      label: "Snooze length",
      min: 1,
      max: 60,
      step: 1,
      value: s.snoozeMinutes,
      format: (v) => humanMinutes(v),
      hint: "Snoozing moves the one pending reminder. It never stacks up a second one.",
      onChange: (v) => patch({ snoozeMinutes: v }),
    }),
  );

  const now = group("Right now");
  now.append(
    el(
      "p",
      "note",
      state.paused ? "Pandy is paused." : "Pandy is running normally.",
    ),
    buttonRow(
      actionButton("Pause for 30 minutes", () => pause(30)),
      actionButton("Pause for 1 hour", () => pause(60)),
      actionButton("Pause for 2 hours", () => pause(120)),
      actionButton("Resume now", resume, "primary"),
    ),
  );

  return [quiet, focusGroup, now];
}

// ── Notifications ───────────────────────────────────────────────────────────

function notifications({ state, patch }: SectionDeps): HTMLElement[] {
  const s = state.settings;

  const where = group("Where reminders appear");
  where.append(
    dropdown({
      label: "Show reminders",
      value: s.deliveryOwner,
      hint: "If you also use the Pandy VS Code extension, you will never get the same reminder twice.",
      options: [
        ["both", "Wherever I am"],
        ["desktop", "Only on the desktop"],
        ["vscode", "Only in VS Code"],
      ],
      onChange: (v) => patch({ deliveryOwner: v }),
    }),
    note(
      "“Wherever I am” lets this app take reminders while it is running, and hands them to VS Code if it is closed.",
    ),
  );

  const system = group("System");
  system.append(
    toggle({
      label: "Open Pandy when I log in",
      valueText: s.launchAtLogin ? "Starts automatically" : "Start it yourself",
      checked: s.launchAtLogin,
      onChange: (v) => patch({ launchAtLogin: v }),
    }),
    note("Pandy respects your system notification settings. Muting it there mutes it everywhere."),
  );

  return [where, system];
}

// ── Advanced ────────────────────────────────────────────────────────────────

function advanced({ state, patch, triggerNow, resetSchedule, restoreDefaults, quit }: SectionDeps): HTMLElement[] {
  const s = state.settings;

  const timing = group("Timing");
  timing.append(
    slider({
      label: "Timing variation",
      min: 0,
      max: 30,
      step: 1,
      value: s.randomizationMinutes,
      format: (v) => (v === 0 ? "Exactly on schedule" : `Up to ${humanMinutes(v)} either way`),
      hint: "A little randomness so reminders don't feel like a metronome.",
      onChange: (v) => patch({ randomizationMinutes: v }),
    }),
    slider({
      label: "Minimum gap between reminders",
      min: 0,
      max: 60,
      step: 1,
      value: s.cooldownMinutes,
      format: (v) => (v === 0 ? "No minimum" : `At least ${humanMinutes(v)}`),
      hint: "Stops two reminders arriving back to back when they come due together.",
      onChange: (v) => patch({ cooldownMinutes: v }),
    }),
    numberField({
      label: "Most reminders per day",
      value: s.dailyLimit,
      min: 1,
      max: 100,
      nullable: true,
      placeholder: "No limit",
      hint: "Leave empty for no limit. The count resets at midnight.",
      valueText: s.dailyLimit === null ? "No limit" : `${s.dailyLimit} per day`,
      onChange: (v) => patch({ dailyLimit: v }),
    }),
  );

  const danger = group("Starting over");
  danger.append(
    el("p", "note", "Try a reminder right now, without waiting for the schedule."),
    buttonRow(actionButton("Show me a reminder now", triggerNow)),
    el("p", "note", "Restart every timer from this moment. Your settings are kept."),
    buttonRow(
      actionButton(
        "Reset the schedule",
        () => {
          void confirmAction({
            title: "Reset the schedule?",
            body: "Every reminder timer starts again from now. Your settings and today's count are kept.",
            confirmLabel: "Reset schedule",
          }).then((ok) => ok && resetSchedule());
        },
        "danger",
      ),
    ),
    el("p", "note", "Put every setting back to Pandy's calm defaults."),
    buttonRow(
      actionButton(
        "Restore default settings",
        () => {
          void confirmAction({
            title: "Restore all settings to defaults?",
            body: "Every setting on every page goes back to how Pandy shipped, and the schedule starts over. This cannot be undone.",
            confirmLabel: "Restore defaults",
            danger: true,
          }).then((ok) => ok && restoreDefaults());
        },
        "danger",
      ),
      actionButton(
        "Quit Pandy",
        () => {
          void confirmAction({
            title: "Quit Pandy?",
            body: "Reminders stop until you open it again.",
            confirmLabel: "Quit",
            danger: true,
          }).then((ok) => ok && quit());
        },
        "danger",
      ),
    ),
  );

  const privacy = group("Privacy");
  privacy.append(
    el(
      "p",
      "note",
      "Pandy stores your settings, the next reminder time and a count of breaks taken. It never reads your files and never connects to the internet. There is no telemetry.",
    ),
  );

  return [timing, danger, privacy];
}
