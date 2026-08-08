import {
  DEFAULT_SETTINGS,
  EMPTY_STATE,
  REMINDER_TYPES,
  STORAGE_KEY,
  type DueReminder,
  type MascotState,
  type PersistedState,
  type ReminderResult,
  type ReminderType,
  type ScheduleEntry,
  type Settings,
  type SuppressionReason,
} from "@pandy/shared-types";
import { pickMessage } from "@pandy/messages";
import type { Clock, Rng, StorageAdapter, TimerHandle } from "./ports.js";
import { systemClock } from "./ports.js";
import {
  MINUTE,
  inWindow,
  isWithinAllowedWindow,
  localDateKey,
  localWeekday,
  minutesIntoDay,
  nextAllowedTime,
  nextLocalMidnight,
  nextAllowedTime as toAllowed,
} from "./time.js";

/**
 * A single arm is capped at this. A raw setTimeout for four hours does not
 * survive a laptop sleep and drifts with wall-clock changes, and VS Code gives
 * no resume event to recover from. Re-arming in bounded steps means a wake-up
 * always recomputes against the real clock. A quiet re-arm does no work — this
 * is a ceiling on one timer, not a polling loop.
 */
export const MAX_ARM_MS = 15 * MINUTE;

/** Overdue-at-startup reminders wait this long, so nothing fires into launch churn. */
export const STARTUP_GRACE_MS = 5_000;

export interface NextUp {
  readonly type: ReminderType;
  readonly dueAt: number;
}

export interface EngineEvents {
  /** A reminder passed every gate and should be shown to the user. */
  onReminder?: (reminder: DueReminder) => void;
  /** A reminder came due but a gate deferred it. Useful for diagnostics. */
  onSuppressed?: (type: ReminderType, reason: SuppressionReason, deferredTo: number) => void;
  onMascot?: (state: MascotState) => void;
  onScheduleChange?: (next: NextUp | null) => void;
}

export interface EngineOptions extends EngineEvents {
  readonly storage: StorageAdapter;
  readonly clock?: Clock;
  readonly rng?: Rng;
  readonly settings?: Settings;
}

const MASCOT_FOR: Record<ReminderType, MascotState> = {
  water: "drink",
  stand: "stretch",
  lookAway: "lookAway",
  touchGrass: "touchGrass",
};

export function mascotStateFor(type: ReminderType): MascotState {
  return MASCOT_FOR[type];
}

export class ReminderEngine {
  readonly #clock: Clock;
  readonly #storage: StorageAdapter;
  readonly #rng: Rng;
  readonly #events: EngineEvents;

  #settings: Settings;
  #state: PersistedState = EMPTY_STATE;
  #timer: TimerHandle | null = null;
  #started = false;

  constructor(options: EngineOptions) {
    this.#clock = options.clock ?? systemClock;
    this.#storage = options.storage;
    this.#rng = options.rng ?? Math.random;
    this.#settings = options.settings ?? DEFAULT_SETTINGS;
    this.#events = options;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    const stored = await this.#storage.read<PersistedState>(STORAGE_KEY);
    this.#state = this.#migrate(stored);

    this.#reconcile();
    await this.#persist();
    this.#rearm();
  }

  /** Cancels the timer. Safe to call repeatedly. */
  stop(): void {
    this.#cancelTimer();
    this.#started = false;
  }

  get started(): boolean {
    return this.#started;
  }

  // ── introspection ────────────────────────────────────────────────────────

  getSettings(): Settings {
    return this.#settings;
  }

  getState(): PersistedState {
    return this.#state;
  }

  /** The soonest upcoming reminder, or null when nothing is scheduled. */
  peekNext(): NextUp | null {
    let best: NextUp | null = null;
    for (const type of REMINDER_TYPES) {
      if (!this.#settings.categories[type].enabled) continue;
      const entry = this.#state.schedule[type];
      if (!entry) continue;
      if (!best || entry.nextDueAt < best.dueAt) best = { type, dueAt: entry.nextDueAt };
    }
    return best;
  }

  isPaused(now = this.#clock.now()): boolean {
    return this.#state.pauseUntil !== null && this.#state.pauseUntil > now;
  }

  isFocused(now = this.#clock.now()): boolean {
    return this.#state.focusUntil !== null && this.#state.focusUntil > now;
  }

  // ── commands ─────────────────────────────────────────────────────────────

  /**
   * Apply new settings and reschedule immediately — the user should not have to
   * wait out the old timer to see a change take effect.
   */
  async updateSettings(next: Settings): Promise<void> {
    const prev = this.#settings;
    this.#settings = next;
    if (!this.#started) return;

    const now = this.#clock.now();
    const schedule = { ...this.#state.schedule };

    for (const type of REMINDER_TYPES) {
      const wasEnabled = prev.categories[type].enabled;
      const isEnabled = next.categories[type].enabled;
      const newInterval = next.categories[type].intervalMinutes * MINUTE;

      if (!isEnabled) {
        delete schedule[type];
        continue;
      }

      const entry = schedule[type];
      if (!wasEnabled || !entry) {
        schedule[type] = this.#freshEntry(now, type, next);
        continue;
      }

      const remaining = entry.nextDueAt - now;
      // Preserve progress, but never leave the user waiting longer than the
      // interval they just chose. Shortening an interval takes effect now;
      // lengthening one does not reset the countdown already under way.
      if (remaining > newInterval) {
        schedule[type] = { nextDueAt: toAllowed(now + newInterval, next), fromSnooze: false };
      }
    }

    this.#state = { ...this.#state, schedule };
    await this.#persist();
    this.#rearm();
  }

  /** Fire a reminder right now, bypassing the schedule but not the mascot flow. */
  async triggerNow(type?: ReminderType): Promise<void> {
    const now = this.#clock.now();
    const target = type ?? this.peekNext()?.type ?? "water";
    await this.#fire(target, now, { manual: true });
  }

  /**
   * The user answered a reminder.
   *
   * Note this never emits an `idle` mascot state. Every action animation is
   * non-looping and the animator returns itself to idle on its final frame —
   * emitting idle here would cut the celebrate animation off partway through.
   */
  async resolve(
    type: ReminderType,
    result: ReminderResult,
    options: { readonly pauseMs?: number } = {},
  ): Promise<void> {
    const now = this.#clock.now();

    switch (result) {
      case "completed": {
        this.#events.onMascot?.("celebrate");
        const daily = this.#rollDaily(now);
        this.#state = { ...this.#state, daily: { ...daily, completed: daily.completed + 1 } };
        this.#schedule(type, this.#freshEntry(now, type, this.#settings));
        break;
      }
      case "snoozed": {
        // Exactly one deferred reminder — this replaces whatever was pending
        // rather than stacking a second one behind it.
        const at = toAllowed(now + this.#settings.snoozeMinutes * MINUTE, this.#settings);
        this.#schedule(type, { nextDueAt: at, fromSnooze: true });
        break;
      }
      case "dismissed": {
        this.#schedule(type, this.#freshEntry(now, type, this.#settings));
        break;
      }
      case "paused": {
        // Defaults to the user's configured focus duration — it is the setting
        // that already means "leave me alone for a while".
        await this.pause(options.pauseMs ?? this.#settings.focusModeMinutes * MINUTE);
        return;
      }
    }

    await this.#persist();
    this.#rearm();
  }

  async pause(durationMs: number): Promise<void> {
    const until = this.#clock.now() + Math.max(0, durationMs);
    this.#state = { ...this.#state, pauseUntil: until };
    this.#events.onMascot?.("sleep");
    await this.#persist();
    this.#rearm();
  }

  async resumeFromPause(): Promise<void> {
    this.#state = { ...this.#state, pauseUntil: null };
    this.#events.onMascot?.("idle");
    await this.#persist();
    this.#rearm();
  }

  async startFocus(durationMs = this.#settings.focusModeMinutes * MINUTE): Promise<void> {
    this.#state = { ...this.#state, focusUntil: this.#clock.now() + Math.max(0, durationMs) };
    await this.#persist();
    this.#rearm();
  }

  async endFocus(): Promise<void> {
    this.#state = { ...this.#state, focusUntil: null };
    await this.#persist();
    this.#rearm();
  }

  /** Wipe the schedule and start every category over from now. */
  async resetSchedule(): Promise<void> {
    const now = this.#clock.now();
    const schedule: Partial<Record<ReminderType, ScheduleEntry>> = {};
    for (const type of REMINDER_TYPES) {
      if (this.#settings.categories[type].enabled) {
        schedule[type] = this.#freshEntry(now, type, this.#settings);
      }
    }
    this.#state = { ...this.#state, schedule, pauseUntil: null, focusUntil: null };
    await this.#persist();
    this.#rearm();
  }

  async setOnboarded(value: boolean): Promise<void> {
    this.#state = { ...this.#state, onboarded: value };
    await this.#persist();
  }

  async setWidgetPosition(x: number, y: number): Promise<void> {
    this.#state = { ...this.#state, widgetPosition: { x, y } };
    await this.#persist();
  }

  /**
   * The host observed a system resume, or suspects the wall clock moved.
   * Recompute against the real clock rather than trusting the pending timer.
   */
  async handleResume(): Promise<void> {
    if (!this.#started) return;
    this.#reconcile();
    await this.#persist();
    this.#rearm();
  }

  // ── scheduling internals ─────────────────────────────────────────────────

  #migrate(stored: PersistedState | undefined): PersistedState {
    if (!stored || typeof stored !== "object" || stored.version !== 1) return { ...EMPTY_STATE };
    return { ...EMPTY_STATE, ...stored };
  }

  #jitter(): number {
    const spread = this.#settings.randomizationMinutes * MINUTE;
    if (spread <= 0) return 0;
    return Math.round((this.#rng() * 2 - 1) * spread);
  }

  #freshEntry(now: number, type: ReminderType, settings: Settings): ScheduleEntry {
    const interval = settings.categories[type].intervalMinutes * MINUTE;
    const raw = now + interval + this.#jitter();
    // Deferring at schedule time, not just at fire time, keeps the countdown the
    // user sees honest — "next at 08:05" rather than a time that is already past.
    return { nextDueAt: Math.max(now + 1, toAllowed(raw, settings)), fromSnooze: false };
  }

  #schedule(type: ReminderType, entry: ScheduleEntry): void {
    this.#state = { ...this.#state, schedule: { ...this.#state.schedule, [type]: entry } };
  }

  #rollDaily(now: number) {
    const key = localDateKey(now);
    if (this.#state.daily.dateKey === key) return this.#state.daily;
    return { dateKey: key, total: 0, completed: 0 };
  }

  /**
   * Bring the schedule into line with the current clock. Any category already
   * overdue is moved forward; at most one is allowed to fire, and only after a
   * short grace. This is the rule that stops a laptop wake from producing four
   * notifications at once.
   */
  #reconcile(): void {
    const now = this.#clock.now();
    const schedule: Partial<Record<ReminderType, ScheduleEntry>> = { ...this.#state.schedule };

    let mostOverdue: ReminderType | null = null;
    let earliest = Number.POSITIVE_INFINITY;

    for (const type of REMINDER_TYPES) {
      if (!this.#settings.categories[type].enabled) {
        delete schedule[type];
        continue;
      }
      const entry = schedule[type];
      if (!entry) {
        schedule[type] = this.#freshEntry(now, type, this.#settings);
        continue;
      }
      if (entry.nextDueAt <= now && entry.nextDueAt < earliest) {
        earliest = entry.nextDueAt;
        mostOverdue = type;
      }
    }

    for (const type of REMINDER_TYPES) {
      const entry = schedule[type];
      if (!entry || entry.nextDueAt > now) continue;
      schedule[type] =
        type === mostOverdue
          ? { nextDueAt: now + STARTUP_GRACE_MS, fromSnooze: entry.fromSnooze }
          : this.#freshEntry(now, type, this.#settings);
    }

    // A pause or focus that expired while the process was gone is simply over.
    const pauseUntil = this.#state.pauseUntil !== null && this.#state.pauseUntil <= now ? null : this.#state.pauseUntil;
    const focusUntil = this.#state.focusUntil !== null && this.#state.focusUntil <= now ? null : this.#state.focusUntil;

    this.#state = { ...this.#state, schedule, pauseUntil, focusUntil, daily: this.#rollDaily(now) };
  }

  #cancelTimer(): void {
    // Cancel before create, always. Two live handles would double-fire and is
    // the single easiest way to break the "one active timer" guarantee.
    if (this.#timer !== null) {
      this.#clock.clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #rearm(): void {
    this.#cancelTimer();
    if (!this.#started) return;

    const next = this.peekNext();
    this.#events.onScheduleChange?.(next);
    if (!next) return;

    const now = this.#clock.now();
    const delay = Math.min(Math.max(0, next.dueAt - now), MAX_ARM_MS);
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      void this.#tick();
    }, delay);
  }

  async #tick(): Promise<void> {
    if (!this.#started) return;
    const now = this.#clock.now();

    // Collect everything that has come due, then let at most one through.
    const overdue: ReminderType[] = [];
    for (const type of REMINDER_TYPES) {
      if (!this.#settings.categories[type].enabled) continue;
      const entry = this.#state.schedule[type];
      if (entry && entry.nextDueAt <= now) overdue.push(type);
    }

    if (overdue.length === 0) {
      // Woke early, or the clamp expired before anything was due.
      this.#rearm();
      return;
    }

    overdue.sort((a, b) => {
      const ea = this.#state.schedule[a]?.nextDueAt ?? 0;
      const eb = this.#state.schedule[b]?.nextDueAt ?? 0;
      return ea - eb;
    });

    const chosen = overdue[0]!;
    // Everything else that piled up is rescheduled, never queued.
    for (const type of overdue.slice(1)) {
      this.#schedule(type, this.#freshEntry(now, type, this.#settings));
    }

    const blocked = this.#gate(chosen, now);
    if (blocked) {
      this.#schedule(chosen, { nextDueAt: blocked.deferTo, fromSnooze: false });
      this.#events.onSuppressed?.(chosen, blocked.reason, blocked.deferTo);
      await this.#persist();
      this.#rearm();
      return;
    }

    await this.#fire(chosen, now, { manual: false });
  }

  /** The gate chain. Every rejection carries the time to defer to. */
  #gate(
    type: ReminderType,
    now: number,
  ): { readonly reason: SuppressionReason; readonly deferTo: number } | null {
    const s = this.#settings;

    if (!s.categories[type].enabled) {
      return { reason: "disabled", deferTo: now + 24 * 60 * MINUTE };
    }

    if (this.#state.focusUntil !== null && this.#state.focusUntil > now) {
      return { reason: "focus", deferTo: nextAllowedTime(this.#state.focusUntil, s) };
    }

    if (this.#state.pauseUntil !== null && this.#state.pauseUntil > now) {
      return { reason: "paused", deferTo: nextAllowedTime(this.#state.pauseUntil, s) };
    }

    if (!isWithinAllowedWindow(now, s)) {
      // Distinguish the three window gates so diagnostics are actionable.
      const minute = minutesIntoDay(now);
      const reason: SuppressionReason = !s.workingDays.includes(localWeekday(now))
        ? "nonWorkingDay"
        : s.quietHours.enabled &&
            s.quietHours.start !== s.quietHours.end &&
            inWindow(minute, s.quietHours.start, s.quietHours.end)
          ? "quietHours"
          : "outsideActiveHours";
      return { reason, deferTo: Math.max(nextAllowedTime(now, s), now + 1) };
    }

    const daily = this.#rollDaily(now);
    if (s.dailyLimit !== null && daily.total >= s.dailyLimit) {
      return { reason: "dailyLimit", deferTo: nextAllowedTime(nextLocalMidnight(now), s) };
    }

    const cooldown = s.cooldownMinutes * MINUTE;
    if (this.#state.lastFiredAt !== null && now - this.#state.lastFiredAt < cooldown) {
      const deferTo = this.#state.lastFiredAt + cooldown;
      return { reason: "cooldown", deferTo: nextAllowedTime(deferTo, s) };
    }

    return null;
  }

  async #fire(type: ReminderType, now: number, opts: { readonly manual: boolean }): Promise<void> {
    const s = this.#settings;
    const picked = pickMessage({
      type,
      tone: s.tone,
      custom: s.customMessages[type],
      recent: this.#state.recentMessages[type],
      rng: this.#rng,
    });

    const daily = this.#rollDaily(now);

    this.#state = {
      ...this.#state,
      lastFiredAt: now,
      daily: { ...daily, total: daily.total + (opts.manual ? 0 : 1) },
      recentMessages: { ...this.#state.recentMessages, [type]: picked.recent },
    };

    // Schedule the follow-up now, so an ignored notification still advances the
    // clock. resolve() overrides this if the user actually answers.
    this.#schedule(type, this.#freshEntry(now, type, s));

    await this.#persist();

    // Wave first, then the action — the flow the spec describes.
    this.#events.onMascot?.("wave");
    this.#events.onMascot?.(mascotStateFor(type));
    this.#events.onReminder?.({ type, message: picked.message.text, firedAt: now });

    this.#rearm();
  }

  async #persist(): Promise<void> {
    await this.#storage.write(STORAGE_KEY, this.#state);
  }
}
