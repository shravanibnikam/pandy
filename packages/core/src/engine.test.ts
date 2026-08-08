import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATE,
  STORAGE_KEY,
  type DueReminder,
  type MascotState,
  type PersistedState,
  type ReminderType,
  type Settings,
  type SuppressionReason,
} from "@pandy/shared-types";
import { MAX_ARM_MS, ReminderEngine, STARTUP_GRACE_MS } from "./engine.js";
import { FakeClock, localTime, recordingStorage, seededRng } from "./testing.js";
import { MINUTE } from "./time.js";

/** Monday 2026-08-10, 09:00 local — inside the default active window. */
const MONDAY_9AM = localTime(2026, 8, 10, 9, 0);

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

interface Harness {
  engine: ReminderEngine;
  clock: FakeClock;
  storage: ReturnType<typeof recordingStorage>;
  reminders: DueReminder[];
  mascot: MascotState[];
  suppressed: { type: ReminderType; reason: SuppressionReason; deferTo: number }[];
}

function harness(
  patch: Partial<Settings> = {},
  opts: { start?: number; seed?: Partial<PersistedState> } = {},
): Harness {
  const clock = new FakeClock(opts.start ?? MONDAY_9AM);
  const storage = recordingStorage();
  if (opts.seed) storage.seed(STORAGE_KEY, { ...EMPTY_STATE, ...opts.seed });

  const reminders: DueReminder[] = [];
  const mascot: MascotState[] = [];
  const suppressed: Harness["suppressed"] = [];

  const engine = new ReminderEngine({
    clock,
    storage,
    // 0.5 → zero jitter, so every due time in these tests is exact.
    rng: seededRng([0.5]),
    settings: settings(patch),
    onReminder: (r) => reminders.push(r),
    onMascot: (s) => mascot.push(s),
    onSuppressed: (type, reason, deferTo) => suppressed.push({ type, reason, deferTo }),
  });

  return { engine, clock, storage, reminders, mascot, suppressed };
}

/** Only lookAway enabled, at a 30-minute interval — the simplest schedule to reason about. */
const onlyLookAway = (intervalMinutes = 30): Partial<Settings> => ({
  categories: {
    water: { enabled: false, intervalMinutes: 120 },
    stand: { enabled: false, intervalMinutes: 90 },
    lookAway: { enabled: true, intervalMinutes },
    touchGrass: { enabled: false, intervalMinutes: 240 },
  },
});

describe("timer discipline", () => {
  it("arms exactly one timer on start", async () => {
    const h = harness();
    expect(h.clock.liveTimerCount).toBe(0);
    await h.engine.start();
    expect(h.clock.liveTimerCount).toBe(1);
  });

  it("never holds more than one live timer through a full cycle", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();

    for (let i = 0; i < 12; i++) {
      await h.clock.advance(10 * MINUTE);
      expect(h.clock.liveTimerCount).toBeLessThanOrEqual(1);
    }
  });

  it("holds one timer through rapid state changes", async () => {
    const h = harness();
    await h.engine.start();

    for (let i = 0; i < 25; i++) {
      await h.engine.pause(5 * MINUTE);
      expect(h.clock.liveTimerCount).toBeLessThanOrEqual(1);
      await h.engine.resumeFromPause();
      expect(h.clock.liveTimerCount).toBeLessThanOrEqual(1);
      await h.engine.updateSettings(settings({ snoozeMinutes: 5 + (i % 7) }));
      expect(h.clock.liveTimerCount).toBeLessThanOrEqual(1);
      await h.engine.resetSchedule();
      expect(h.clock.liveTimerCount).toBeLessThanOrEqual(1);
    }
  });

  it("cancels its timer on stop and fires nothing afterwards", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    expect(h.clock.liveTimerCount).toBe(1);

    h.engine.stop();
    expect(h.clock.liveTimerCount).toBe(0);

    await h.clock.advance(4 * 60 * MINUTE);
    expect(h.reminders).toHaveLength(0);
  });

  it("caps a single arm so a long wait cannot outlive a sleep", async () => {
    // touchGrass alone, four hours out — far beyond the clamp.
    const h = harness({
      categories: {
        water: { enabled: false, intervalMinutes: 120 },
        stand: { enabled: false, intervalMinutes: 90 },
        lookAway: { enabled: false, intervalMinutes: 30 },
        touchGrass: { enabled: true, intervalMinutes: 240 },
      },
    });
    await h.engine.start();
    expect(h.clock.nextTimerIn).toBeLessThanOrEqual(MAX_ARM_MS);
  });

  it("does not fire when a clamped arm expires early", async () => {
    const h = harness(onlyLookAway(120));
    await h.engine.start();
    // Three clamp windows pass, still well short of the 120-minute interval.
    await h.clock.advance(45 * MINUTE);
    expect(h.reminders).toHaveLength(0);
    expect(h.clock.liveTimerCount).toBe(1);
  });
});

describe("firing and the mascot flow", () => {
  it("fires a reminder when the interval elapses", async () => {
    const h = harness(onlyLookAway(30));
    await h.engine.start();

    await h.clock.advance(29 * MINUTE);
    expect(h.reminders).toHaveLength(0);

    await h.clock.advance(2 * MINUTE);
    expect(h.reminders).toHaveLength(1);
    expect(h.reminders[0]!.type).toBe("lookAway");
    expect(h.reminders[0]!.message.length).toBeGreaterThan(0);
  });

  it("waves before showing the reminder action", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);

    expect(h.mascot.slice(0, 2)).toEqual(["wave", "lookAway"]);
  });

  it("maps each category to its own mascot animation", async () => {
    const cases: ReadonlyArray<[ReminderType, MascotState]> = [
      ["water", "drink"],
      ["stand", "stretch"],
      ["lookAway", "lookAway"],
      ["touchGrass", "touchGrass"],
    ];
    for (const [type, expected] of cases) {
      const h = harness();
      await h.engine.start();
      await h.engine.triggerNow(type);
      expect(h.mascot).toEqual(["wave", expected]);
    }
  });

  it("celebrates on completion and never cuts it short with an idle", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);
    h.mascot.length = 0;

    await h.engine.resolve("lookAway", "completed");
    // The animator returns itself to idle on the final frame; the engine
    // emitting idle here would truncate the celebrate animation.
    expect(h.mascot).toEqual(["celebrate"]);
  });

  it("counts completions separately from deliveries", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);
    await h.engine.resolve("lookAway", "completed");

    expect(h.engine.getState().daily.total).toBe(1);
    expect(h.engine.getState().daily.completed).toBe(1);
  });
});

describe("no backlog", () => {
  it("fires at most one reminder when every category is overdue at startup", async () => {
    const longAgo = MONDAY_9AM - 6 * 60 * MINUTE;
    const h = harness(
      {},
      {
        seed: {
          schedule: {
            water: { nextDueAt: longAgo, fromSnooze: false },
            stand: { nextDueAt: longAgo + MINUTE, fromSnooze: false },
            lookAway: { nextDueAt: longAgo + 2 * MINUTE, fromSnooze: false },
            touchGrass: { nextDueAt: longAgo + 3 * MINUTE, fromSnooze: false },
          },
        },
      },
    );

    await h.engine.start();
    await h.clock.advance(STARTUP_GRACE_MS + MINUTE);

    expect(h.reminders).toHaveLength(1);
    // The most overdue one is the one that gets through.
    expect(h.reminders[0]!.type).toBe("water");
  });

  it("does not fire during the startup grace period", async () => {
    const h = harness(
      {},
      { seed: { schedule: { water: { nextDueAt: MONDAY_9AM - MINUTE, fromSnooze: false } } } },
    );
    await h.engine.start();
    await h.clock.advance(STARTUP_GRACE_MS - 1000);
    expect(h.reminders).toHaveLength(0);
  });

  it("reschedules the categories it did not fire instead of queueing them", async () => {
    const longAgo = MONDAY_9AM - 6 * 60 * MINUTE;
    const h = harness(
      {},
      {
        seed: {
          schedule: {
            water: { nextDueAt: longAgo, fromSnooze: false },
            stand: { nextDueAt: longAgo, fromSnooze: false },
          },
        },
      },
    );
    await h.engine.start();

    const state = h.engine.getState();
    expect(state.schedule.stand!.nextDueAt).toBeGreaterThan(MONDAY_9AM);
  });

  it("produces one reminder, not four, after a long sleep", async () => {
    const h = harness();
    await h.engine.start();

    // Laptop closed for six hours: the clock jumps without any timer running.
    await h.clock.jumpTo(MONDAY_9AM + 6 * 60 * MINUTE);
    await h.clock.runDue();
    await h.engine.handleResume();
    await h.clock.advance(STARTUP_GRACE_MS + MINUTE);

    expect(h.reminders.length).toBeLessThanOrEqual(1);
  });

  it("does not burst after resume even when several intervals elapsed", async () => {
    const h = harness();
    await h.engine.start();

    await h.clock.jumpTo(MONDAY_9AM + 3 * 60 * MINUTE);
    await h.engine.handleResume();
    await h.clock.advance(30 * MINUTE);

    // Some reminders are expected over the following half hour, but never a
    // pile of missed ones delivered at once.
    const withinGrace = h.reminders.filter(
      (r) => r.firedAt <= MONDAY_9AM + 3 * 60 * MINUTE + STARTUP_GRACE_MS + 1000,
    );
    expect(withinGrace.length).toBeLessThanOrEqual(1);
  });
});

describe("snooze", () => {
  it("schedules exactly one deferred reminder", async () => {
    const h = harness({ ...onlyLookAway(), snoozeMinutes: 10 });
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);
    expect(h.reminders).toHaveLength(1);

    await h.engine.resolve("lookAway", "snoozed");
    const due = h.engine.peekNext()!;
    expect(due.dueAt - h.clock.now()).toBe(10 * MINUTE);

    await h.clock.advance(11 * MINUTE);
    expect(h.reminders).toHaveLength(2);
  });

  it("replaces a pending snooze rather than stacking a second one", async () => {
    const h = harness({ ...onlyLookAway(), snoozeMinutes: 10 });
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);

    await h.engine.resolve("lookAway", "snoozed");
    await h.clock.advance(2 * MINUTE);
    await h.engine.resolve("lookAway", "snoozed");

    // Second snooze moved the single pending reminder; it did not add one.
    await h.clock.advance(9 * MINUTE);
    expect(h.reminders).toHaveLength(1);

    await h.clock.advance(2 * MINUTE);
    expect(h.reminders).toHaveLength(2);
  });

  it("marks a snoozed entry so it is distinguishable from a normal one", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);
    await h.engine.resolve("lookAway", "snoozed");

    expect(h.engine.getState().schedule.lookAway!.fromSnooze).toBe(true);
  });

  it("schedules a normal interval on dismiss", async () => {
    const h = harness(onlyLookAway(30));
    await h.engine.start();
    await h.clock.advance(31 * MINUTE);

    await h.engine.resolve("lookAway", "dismissed");
    const due = h.engine.peekNext()!;
    expect(due.dueAt - h.clock.now()).toBe(30 * MINUTE);
  });
});

describe("settings changes while a timer is live", () => {
  it("shortening an interval takes effect immediately", async () => {
    const h = harness(onlyLookAway(120));
    await h.engine.start();
    await h.clock.advance(10 * MINUTE);

    await h.engine.updateSettings(settings(onlyLookAway(15)));

    const due = h.engine.peekNext()!;
    // Never longer than the interval the user just chose.
    expect(due.dueAt - h.clock.now()).toBeLessThanOrEqual(15 * MINUTE);
  });

  it("lengthening an interval preserves the countdown already under way", async () => {
    const h = harness(onlyLookAway(30));
    await h.engine.start();
    await h.clock.advance(20 * MINUTE);
    const before = h.engine.peekNext()!.dueAt;

    await h.engine.updateSettings(settings(onlyLookAway(120)));

    // 10 minutes remained and 10 < 120, so the pending reminder is untouched.
    expect(h.engine.peekNext()!.dueAt).toBe(before);
  });

  it("schedules a category that was just enabled", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    expect(h.engine.getState().schedule.water).toBeUndefined();

    await h.engine.updateSettings(DEFAULT_SETTINGS);
    expect(h.engine.getState().schedule.water).toBeDefined();
  });

  it("drops a category that was just disabled", async () => {
    const h = harness();
    await h.engine.start();
    expect(h.engine.getState().schedule.water).toBeDefined();

    await h.engine.updateSettings(settings(onlyLookAway()));
    expect(h.engine.getState().schedule.water).toBeUndefined();
  });

  it("never fires a disabled category", async () => {
    const h = harness(onlyLookAway());
    await h.engine.start();
    await h.clock.advance(5 * 60 * MINUTE);

    expect(h.reminders.every((r) => r.type === "lookAway")).toBe(true);
  });

  it("re-arms rather than waiting out the old timer", async () => {
    const h = harness(onlyLookAway(120));
    await h.engine.start();
    const before = h.clock.nextTimerIn;

    await h.engine.updateSettings(settings(onlyLookAway(1)));
    expect(h.clock.nextTimerIn).toBeLessThan(before!);
  });
});

describe("gates", () => {
  it("never schedules into quiet hours in the first place", async () => {
    // 19:50 with a 30-minute interval would land at 20:20, inside quiet hours.
    // Deferring at schedule time rather than at fire time is what keeps the
    // countdown the user sees honest, and means the gate rarely has to fire.
    const h = harness(onlyLookAway(30), { start: localTime(2026, 8, 10, 19, 50) });
    await h.engine.start();
    await h.clock.advance(35 * MINUTE);

    expect(h.reminders).toHaveLength(0);
    const due = h.engine.peekNext()!;
    expect(new Date(due.dueAt).getHours()).toBe(8);
    expect(new Date(due.dueAt).getDate()).toBe(11);
  });

  it("gates a reminder that was already scheduled inside quiet hours", async () => {
    // The safety net: an entry restored from storage, or left over from a
    // settings change, that comes due inside a window it should not.
    const h = harness(onlyLookAway(30), {
      start: localTime(2026, 8, 10, 19, 50),
      seed: {
        schedule: {
          lookAway: { nextDueAt: localTime(2026, 8, 10, 20, 10), fromSnooze: false },
        },
      },
    });
    await h.engine.start();
    await h.clock.advance(30 * MINUTE);

    expect(h.reminders).toHaveLength(0);
    expect(h.suppressed.map((s) => s.reason)).toContain("quietHours");
    expect(new Date(h.engine.peekNext()!.dueAt).getHours()).toBe(8);
  });

  it("delivers after quiet hours end without replaying the missed ones", async () => {
    const h = harness(onlyLookAway(30), { start: localTime(2026, 8, 10, 19, 50) });
    await h.engine.start();
    // Through the night and into the next morning.
    await h.clock.advance(13 * 60 * MINUTE);
    const overnight = h.reminders.filter((r) => {
      const hour = new Date(r.firedAt).getHours();
      return hour >= 20 || hour < 8;
    });
    expect(overnight).toHaveLength(0);
    expect(h.reminders.length).toBeGreaterThan(0);
  });

  it("honours a daily limit and resets at local midnight", async () => {
    const h = harness({ ...onlyLookAway(10), dailyLimit: 3, cooldownMinutes: 0 });
    await h.engine.start();

    await h.clock.advance(6 * 60 * MINUTE);
    expect(h.reminders).toHaveLength(3);
    expect(h.suppressed.some((s) => s.reason === "dailyLimit")).toBe(true);

    // Next day, inside active hours again.
    await h.clock.advance(20 * 60 * MINUTE);
    expect(h.reminders.length).toBeGreaterThan(3);
  });

  it("enforces a cooldown between two different categories", async () => {
    const h = harness({
      categories: {
        water: { enabled: true, intervalMinutes: 10 },
        stand: { enabled: true, intervalMinutes: 10 },
        lookAway: { enabled: false, intervalMinutes: 30 },
        touchGrass: { enabled: false, intervalMinutes: 240 },
      },
      cooldownMinutes: 30,
      randomizationMinutes: 0,
    });
    await h.engine.start();
    await h.clock.advance(3 * 60 * MINUTE);

    const times = h.reminders.map((r) => r.firedAt).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(30 * MINUTE);
    }
    expect(times.length).toBeGreaterThan(1);
  });

  it("suppresses while paused and resumes afterwards", async () => {
    const h = harness(onlyLookAway(20));
    await h.engine.start();
    await h.engine.pause(60 * MINUTE);

    await h.clock.advance(55 * MINUTE);
    expect(h.reminders).toHaveLength(0);

    await h.clock.advance(40 * MINUTE);
    expect(h.reminders.length).toBeGreaterThan(0);
  });

  it("sleeps the mascot while paused", async () => {
    const h = harness();
    await h.engine.start();
    await h.engine.pause(30 * MINUTE);
    expect(h.mascot).toContain("sleep");
  });

  it("suppresses during focus mode", async () => {
    const h = harness(onlyLookAway(20));
    await h.engine.start();
    await h.engine.startFocus(50 * MINUTE);

    await h.clock.advance(45 * MINUTE);
    expect(h.reminders).toHaveLength(0);
    expect(h.engine.isFocused()).toBe(true);

    await h.clock.advance(30 * MINUTE);
    expect(h.reminders.length).toBeGreaterThan(0);
  });

  it("ends focus early on request", async () => {
    const h = harness(onlyLookAway(20));
    await h.engine.start();
    await h.engine.startFocus(60 * MINUTE);
    await h.engine.endFocus();
    expect(h.engine.isFocused()).toBe(false);

    await h.clock.advance(25 * MINUTE);
    expect(h.reminders.length).toBeGreaterThan(0);
  });

  it("does not fire on a non-working day, and waits for the next one", async () => {
    // Saturday 10:00 with weekdays-only working days.
    const h = harness(onlyLookAway(20), { start: localTime(2026, 8, 8, 10, 0) });
    await h.engine.start();
    await h.clock.advance(8 * 60 * MINUTE);

    expect(h.reminders).toHaveLength(0);
    const due = new Date(h.engine.peekNext()!.dueAt);
    expect(due.getDay()).toBe(1); // Monday
    expect(due.getHours()).toBe(8); // start of active hours
  });

  it("gates a reminder that was already scheduled on a non-working day", async () => {
    const h = harness(onlyLookAway(20), {
      start: localTime(2026, 8, 8, 10, 0),
      seed: {
        schedule: { lookAway: { nextDueAt: localTime(2026, 8, 8, 10, 20), fromSnooze: false } },
      },
    });
    await h.engine.start();
    await h.clock.advance(30 * MINUTE);

    expect(h.reminders).toHaveLength(0);
    expect(h.suppressed.some((s) => s.reason === "nonWorkingDay")).toBe(true);
  });

  it("pausing via a reminder response suppresses subsequent reminders", async () => {
    const h = harness(onlyLookAway(20));
    await h.engine.start();
    await h.clock.advance(21 * MINUTE);
    expect(h.reminders).toHaveLength(1);

    await h.engine.resolve("lookAway", "paused", { pauseMs: 90 * MINUTE });
    await h.clock.advance(80 * MINUTE);
    expect(h.reminders).toHaveLength(1);
    expect(h.engine.isPaused()).toBe(true);
  });
});

describe("persistence and restart", () => {
  it("restores the schedule from storage", async () => {
    const h = harness(onlyLookAway(30));
    await h.engine.start();
    await h.clock.advance(10 * MINUTE);
    const dueBefore = h.engine.peekNext()!.dueAt;
    h.engine.stop();

    const restarted = new ReminderEngine({
      clock: h.clock,
      storage: h.storage,
      rng: seededRng([0.5]),
      settings: settings(onlyLookAway(30)),
    });
    await restarted.start();

    expect(restarted.peekNext()!.dueAt).toBe(dueBefore);
  });

  it("persists only the documented fields", async () => {
    const h = harness();
    await h.engine.start();
    const stored = h.storage.snapshot()[STORAGE_KEY] as PersistedState;

    expect(Object.keys(stored).sort()).toEqual(
      [
        "daily",
        "focusUntil",
        "lastFiredAt",
        "onboarded",
        "pauseUntil",
        "recentMessages",
        "schedule",
        "version",
        "widgetPosition",
      ].sort(),
    );
  });

  it("survives a corrupt or foreign stored value", async () => {
    const clock = new FakeClock(MONDAY_9AM);
    const storage = recordingStorage();
    storage.seed(STORAGE_KEY, { version: 99, nonsense: true });

    const engine = new ReminderEngine({ clock, storage, settings: DEFAULT_SETTINGS });
    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.peekNext()).not.toBeNull();
  });

  it("clears a pause that expired while the process was gone", async () => {
    const h = harness(
      {},
      { seed: { pauseUntil: MONDAY_9AM - 60 * MINUTE }, start: MONDAY_9AM },
    );
    await h.engine.start();
    expect(h.engine.isPaused()).toBe(false);
    expect(h.engine.getState().pauseUntil).toBeNull();
  });

  it("keeps a pause that is still running", async () => {
    const h = harness({}, { seed: { pauseUntil: MONDAY_9AM + 60 * MINUTE } });
    await h.engine.start();
    expect(h.engine.isPaused()).toBe(true);
  });

  it("stores the widget position", async () => {
    const h = harness();
    await h.engine.start();
    await h.engine.setWidgetPosition(120, 640);
    expect(h.engine.getState().widgetPosition).toEqual({ x: 120, y: 640 });
  });
});

describe("randomisation", () => {
  it("stays within the configured spread", async () => {
    const extremes = [0, 1, 0.5, 0.25, 0.75];
    for (const value of extremes) {
      const clock = new FakeClock(MONDAY_9AM);
      const engine = new ReminderEngine({
        clock,
        storage: recordingStorage(),
        rng: () => value,
        settings: settings({ ...onlyLookAway(60), randomizationMinutes: 5 }),
      });
      await engine.start();

      const delta = engine.peekNext()!.dueAt - MONDAY_9AM;
      expect(delta).toBeGreaterThanOrEqual(55 * MINUTE);
      expect(delta).toBeLessThanOrEqual(65 * MINUTE);
    }
  });

  it("produces an exact interval when randomisation is off", async () => {
    const h = harness({ ...onlyLookAway(45), randomizationMinutes: 0 });
    await h.engine.start();
    expect(h.engine.peekNext()!.dueAt - MONDAY_9AM).toBe(45 * MINUTE);
  });
});

describe("manual control", () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness();
    await h.engine.start();
  });

  it("fires immediately on triggerNow", async () => {
    await h.engine.triggerNow("water");
    expect(h.reminders).toHaveLength(1);
    expect(h.reminders[0]!.type).toBe("water");
  });

  it("does not count a manual break against the daily limit", async () => {
    await h.engine.triggerNow("water");
    expect(h.engine.getState().daily.total).toBe(0);
  });

  it("restarts every category on resetSchedule", async () => {
    await h.clock.advance(20 * MINUTE);
    await h.engine.resetSchedule();

    const now = h.clock.now();
    for (const type of ["water", "stand", "lookAway", "touchGrass"] as const) {
      const entry = h.engine.getState().schedule[type]!;
      const expected = DEFAULT_SETTINGS.categories[type].intervalMinutes * MINUTE;
      expect(entry.nextDueAt - now).toBeGreaterThan(expected - 6 * MINUTE);
    }
  });

  it("clears pause and focus on resetSchedule", async () => {
    await h.engine.pause(60 * MINUTE);
    await h.engine.startFocus(60 * MINUTE);
    await h.engine.resetSchedule();

    expect(h.engine.isPaused()).toBe(false);
    expect(h.engine.isFocused()).toBe(false);
  });

  it("reports the next reminder for a countdown display", async () => {
    const next = h.engine.peekNext()!;
    expect(next.type).toBe("lookAway"); // shortest default interval
    expect(next.dueAt).toBeGreaterThan(h.clock.now());
  });
});
