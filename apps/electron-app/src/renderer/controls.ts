/**
 * Accessible control builders shared by every settings section.
 *
 * Two rules everything here follows:
 *   - the current value is always visible in plain words ("Every 90 minutes"),
 *     never left implicit in a slider position
 *   - state is never carried by colour alone, and every value change is
 *     announced, so a slider is usable without seeing the thumb
 */

let uid = 0;
export const nextId = (): string => `p${++uid}`;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function note(text: string): HTMLElement {
  return el("p", "note", text);
}

export function group(legendText: string): HTMLFieldSetElement {
  const set = el("fieldset", "group");
  set.append(el("legend", "", legendText));
  return set;
}

/** Label cell carrying the control's name and its current value in words. */
function labelCell(id: string, label: string, value?: string): HTMLElement {
  const wrap = el("div", "field-label");
  const l = el("label");
  l.htmlFor = id;
  l.textContent = label;
  wrap.append(l);
  if (value !== undefined) wrap.append(el("span", "field-value", value));
  return wrap;
}

export interface FieldOptions {
  readonly label: string;
  /** Plain-language echo, e.g. "Every 90 minutes". */
  readonly valueText?: string;
  readonly hint?: string;
  readonly wide?: boolean;
}

function field(opts: FieldOptions, id: string, control: HTMLElement): HTMLElement {
  const row = el("div", opts.wide ? "field field-wide" : "field");
  row.append(labelCell(id, opts.label, opts.valueText), control);
  if (opts.hint) {
    const hint = note(opts.hint);
    hint.id = `${id}-hint`;
    control.setAttribute("aria-describedby", hint.id);
    row.append(hint);
  }
  return row;
}

/** A real switch with a visible on/off word beside it. */
export function toggle(
  opts: FieldOptions & { readonly checked: boolean; readonly onChange: (v: boolean) => void },
): HTMLElement {
  const id = nextId();
  const wrap = el("div", "inline");
  wrap.style.justifyContent = "flex-end";

  const state = el("span", "switch-state", opts.checked ? "On" : "Off");
  const sw = el("span", "switch");
  const input = el("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = opts.checked;
  input.addEventListener("change", () => {
    // The word changes too, so the state is never colour-only.
    state.textContent = input.checked ? "On" : "Off";
    opts.onChange(input.checked);
  });
  sw.append(input, el("span", "track"), el("span", "thumb"));
  wrap.append(state, sw);

  return field(opts, id, wrap);
}

export function slider(
  opts: FieldOptions & {
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly format: (v: number) => string;
    readonly onChange: (v: number) => void;
  },
): HTMLElement {
  const id = nextId();
  const input = el("input");
  input.type = "range";
  input.id = id;
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  input.setAttribute("aria-valuetext", opts.format(opts.value));

  const row = field({ ...opts, valueText: opts.format(opts.value) }, id, input);
  const readout = row.querySelector(".field-value");

  const sync = (commit: boolean) => {
    const v = Number(input.value);
    const text = opts.format(v);
    // Announce on every move, not just on commit — otherwise a screen-reader
    // user hears nothing while dragging.
    input.setAttribute("aria-valuetext", text);
    if (readout) readout.textContent = text;
    if (commit) opts.onChange(v);
  };
  input.addEventListener("input", () => sync(false));
  input.addEventListener("change", () => sync(true));
  return row;
}

export function numberField(
  opts: FieldOptions & {
    readonly value: number | null;
    readonly min: number;
    readonly max: number;
    readonly nullable?: boolean;
    readonly placeholder?: string;
    readonly onChange: (v: number | null) => void;
  },
): HTMLElement {
  const id = nextId();
  const input = el("input");
  input.type = "number";
  input.id = id;
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.value = opts.value === null ? "" : String(opts.value);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.addEventListener("change", () => {
    const raw = input.value.trim();
    if (raw === "") {
      if (opts.nullable) opts.onChange(null);
      return;
    }
    opts.onChange(Number(raw));
  });
  return field(opts, id, input);
}

export function dropdown(
  opts: FieldOptions & {
    readonly value: string;
    readonly options: ReadonlyArray<readonly [string, string]>;
    readonly onChange: (v: string) => void;
  },
): HTMLElement {
  const id = nextId();
  const select = el("select");
  select.id = id;
  for (const [value, label] of opts.options) {
    const option = el("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === opts.value;
    select.append(option);
  }
  select.addEventListener("change", () => opts.onChange(select.value));
  return field(opts, id, select);
}

export function timeField(
  opts: FieldOptions & { readonly value: string; readonly onChange: (v: string) => void },
): HTMLElement {
  const id = nextId();
  const input = el("input");
  input.type = "time";
  input.id = id;
  input.value = opts.value;
  input.addEventListener("change", () => input.value && opts.onChange(input.value));
  return field(opts, id, input);
}

/** Two time pickers on one row, for a from/to window. */
export function timeRange(opts: {
  readonly label: string;
  readonly hint?: string;
  readonly from: string;
  readonly to: string;
  readonly onChange: (from: string, to: string) => void;
}): HTMLElement {
  const id = nextId();
  const wrap = el("div", "inline");

  const from = el("input");
  from.type = "time";
  from.id = id;
  from.value = opts.from;

  const to = el("input");
  to.type = "time";
  to.id = `${id}-to`;
  to.value = opts.to;
  to.setAttribute("aria-label", `${opts.label} — end`);

  const commit = () => from.value && to.value && opts.onChange(from.value, to.value);
  from.addEventListener("change", commit);
  to.addEventListener("change", commit);

  wrap.append(from, el("span", "switch-state", "to"), to);
  return field({ label: opts.label, ...(opts.hint ? { hint: opts.hint } : {}) }, id, wrap);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayPicker(opts: {
  readonly label: string;
  readonly hint?: string;
  readonly selected: readonly number[];
  readonly onChange: (days: number[]) => void;
}): HTMLElement {
  const row = el("div", "field field-wide");
  const chosen = new Set(opts.selected);

  const heading = el("div", "field-label");
  heading.append(el("span", "", opts.label), el("span", "field-value", summarise(chosen)));

  const chips = el("div", "chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", opts.label);

  const readout = heading.querySelector(".field-value");

  for (let d = 0; d < 7; d++) {
    const name = DAY_NAMES[d]!;
    const b = el("button", "chip");
    b.type = "button";
    const paint = () => {
      const on = chosen.has(d);
      // Check mark as well as fill, so selection is never colour-only.
      b.textContent = on ? `✓ ${name}` : name;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    };
    paint();
    b.addEventListener("click", () => {
      if (chosen.has(d)) chosen.delete(d);
      else chosen.add(d);
      paint();
      if (readout) readout.textContent = summarise(chosen);
      opts.onChange([...chosen].sort((a, z) => a - z));
    });
    chips.append(b);
  }

  row.append(heading, chips);
  if (opts.hint) row.append(note(opts.hint));
  return row;
}

function summarise(days: Set<number>): string {
  if (days.size === 0) return "No days selected";
  if (days.size === 7) return "Every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (days.size === 5 && weekdays.every((d) => days.has(d))) return "Weekdays";
  if (days.size === 2 && days.has(0) && days.has(6)) return "Weekends";
  return [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
}

export function buttonRow(...buttons: HTMLElement[]): HTMLElement {
  const row = el("div", "chips");
  row.append(...buttons);
  return row;
}

export function actionButton(
  label: string,
  onClick: () => void,
  variant: "" | "primary" | "danger" = "",
): HTMLButtonElement {
  const b = el("button", variant);
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** Plain-language duration: 90 → "1 hour 30 minutes". */
export function humanMinutes(mins: number): string {
  if (mins < 60) return mins === 1 ? "1 minute" : `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  if (m === 0) return hours;
  return `${hours} ${m} ${m === 1 ? "minute" : "minutes"}`;
}

/** 480 → "8:00 AM", for echoing a time window in words. */
export function humanTime(minuteOfDay: number): string {
  const h24 = Math.floor(minuteOfDay / 60) % 24;
  const m = minuteOfDay % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** A modal confirmation. Resolves false on Escape or Cancel. */
export function confirmAction(opts: {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog");
    dialog.append(el("h3", "", opts.title), el("p", "", opts.body));

    const row = el("div", "row");
    const cancel = actionButton("Cancel", () => {
      dialog.close("cancel");
    });
    const confirm = actionButton(
      opts.confirmLabel,
      () => {
        dialog.close("confirm");
      },
      opts.danger ? "danger" : "primary",
    );
    row.append(cancel, confirm);
    dialog.append(row);

    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "confirm";
      dialog.remove();
      resolve(ok);
    });

    document.body.append(dialog);
    dialog.showModal();
    // Focus the safe choice, so a stray Enter cannot destroy anything.
    cancel.focus();
  });
}
