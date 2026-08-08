import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@pandy/shared-types";
import {
  inWindow,
  isWithinAllowedWindow,
  localDateKey,
  minutesIntoDay,
  nextAllowedTime,
  nextOccurrenceOf,
} from "./time.js";
import { localTime } from "./testing.js";

const hm = (h: number, m = 0) => h * 60 + m;

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe("inWindow", () => {
  it("handles a normal daytime window", () => {
    expect(inWindow(hm(9), hm(8), hm(20))).toBe(true);
    expect(inWindow(hm(7, 59), hm(8), hm(20))).toBe(false);
    expect(inWindow(hm(20), hm(8), hm(20))).toBe(false); // end exclusive
  });

  it("handles a window that crosses midnight", () => {
    const start = hm(20);
    const end = hm(8);
    expect(inWindow(hm(23), start, end)).toBe(true);
    expect(inWindow(hm(3), start, end)).toBe(true);
    expect(inWindow(hm(0), start, end)).toBe(true);
    expect(inWindow(hm(8), start, end)).toBe(false);
    expect(inWindow(hm(12), start, end)).toBe(false);
    expect(inWindow(hm(19, 59), start, end)).toBe(false);
  });

  it("treats start === end as the whole day", () => {
    expect(inWindow(hm(4), hm(9), hm(9))).toBe(true);
  });
});

describe("quiet hours crossing midnight", () => {
  const s = settings({
    quietHours: { enabled: true, start: hm(20), end: hm(8) },
    activeHours: { start: 0, end: 0 }, // all day, so quiet hours are isolated
    workingDays: [0, 1, 2, 3, 4, 5, 6],
  });

  it("suppresses on both sides of midnight", () => {
    expect(isWithinAllowedWindow(localTime(2026, 3, 10, 21, 0), s)).toBe(false);
    expect(isWithinAllowedWindow(localTime(2026, 3, 11, 2, 30), s)).toBe(false);
    expect(isWithinAllowedWindow(localTime(2026, 3, 11, 7, 59), s)).toBe(false);
  });

  it("allows once the window closes", () => {
    expect(isWithinAllowedWindow(localTime(2026, 3, 11, 8, 0), s)).toBe(true);
    expect(isWithinAllowedWindow(localTime(2026, 3, 11, 19, 0), s)).toBe(true);
  });

  it("defers a late-evening time to the next morning, not to a loop", () => {
    const at = localTime(2026, 3, 10, 23, 30);
    const allowed = nextAllowedTime(at, s);
    expect(allowed).toBe(localTime(2026, 3, 11, 8, 0));
  });

  it("defers an early-morning time to later the same morning", () => {
    const at = localTime(2026, 3, 11, 3, 15);
    expect(nextAllowedTime(at, s)).toBe(localTime(2026, 3, 11, 8, 0));
  });
});

describe("working days and active hours", () => {
  const s = settings({
    workingDays: [1, 2, 3, 4, 5],
    activeHours: { start: hm(9), end: hm(17) },
    quietHours: { enabled: false, start: 0, end: 0 },
  });

  it("rejects a weekend", () => {
    // 2026-08-08 is a Saturday.
    expect(new Date(localTime(2026, 8, 8, 12, 0)).getDay()).toBe(6);
    expect(isWithinAllowedWindow(localTime(2026, 8, 8, 12, 0), s)).toBe(false);
  });

  it("moves a Saturday afternoon to Monday morning", () => {
    const allowed = nextAllowedTime(localTime(2026, 8, 8, 14, 0), s);
    expect(allowed).toBe(localTime(2026, 8, 10, 9, 0));
    expect(new Date(allowed).getDay()).toBe(1);
  });

  it("moves a pre-dawn weekday to the start of active hours", () => {
    expect(nextAllowedTime(localTime(2026, 8, 10, 6, 0), s)).toBe(localTime(2026, 8, 10, 9, 0));
  });

  it("moves a late weekday evening to the next morning", () => {
    expect(nextAllowedTime(localTime(2026, 8, 10, 22, 0), s)).toBe(localTime(2026, 8, 11, 9, 0));
  });
});

describe("daylight saving", () => {
  /*
   * These assert on local wall-clock structure rather than on fixed epoch
   * offsets, so they hold in any TZ the suite happens to run in — including UTC
   * on CI, where no transition occurs at all.
   */

  it("lands on the correct local hour the day after a US spring-forward", () => {
    // US DST 2026 begins Sunday 8 March.
    const before = localTime(2026, 3, 7, 23, 0);
    const next = nextOccurrenceOf(before, hm(8));
    const d = new Date(next);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(8);
  });

  it("lands on the correct local hour the day after a US fall-back", () => {
    // US DST 2026 ends Sunday 1 November.
    const before = localTime(2026, 11, 1, 23, 0);
    const next = nextOccurrenceOf(before, hm(8));
    const d = new Date(next);
    expect(d.getHours()).toBe(8);
    expect(d.getDate()).toBe(2);
  });

  it("keeps quiet-hour deferral on the wall clock across a transition", () => {
    const s = settings({
      quietHours: { enabled: true, start: hm(20), end: hm(8) },
      activeHours: { start: 0, end: 0 },
      workingDays: [0, 1, 2, 3, 4, 5, 6],
    });
    const allowed = nextAllowedTime(localTime(2026, 3, 7, 22, 0), s);
    const d = new Date(allowed);
    // 8 AM local means 8 AM local, whatever happened to the offset overnight.
    expect(d.getHours()).toBe(8);
    expect(d.getDate()).toBe(8);
  });

  it("keeps the day key on the local calendar day", () => {
    expect(localDateKey(localTime(2026, 3, 8, 0, 30))).toBe("2026-03-08");
    expect(localDateKey(localTime(2026, 3, 8, 23, 30))).toBe("2026-03-08");
    expect(localDateKey(localTime(2026, 3, 9, 0, 1))).toBe("2026-03-09");
  });
});

describe("minutesIntoDay", () => {
  it("reads local wall-clock minutes", () => {
    expect(minutesIntoDay(localTime(2026, 8, 8, 0, 0))).toBe(0);
    expect(minutesIntoDay(localTime(2026, 8, 8, 13, 45))).toBe(hm(13, 45));
    expect(minutesIntoDay(localTime(2026, 8, 8, 23, 59))).toBe(hm(23, 59));
  });
});
