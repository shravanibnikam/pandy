import { describe, expect, it } from "vitest";
import {
  formatLong,
  formatShort,
  msUntilLabelChanges,
} from "../apps/vscode-extension/src/format.js";

const MIN = 60_000;

describe("status bar countdown formatting", () => {
  it("reads naturally at every scale", () => {
    expect(formatShort(0)).toBe("<1m");
    expect(formatShort(20_000)).toBe("<1m");
    expect(formatShort(MIN)).toBe("1m");
    expect(formatShort(45 * MIN)).toBe("45m");
    expect(formatShort(60 * MIN)).toBe("1h");
    expect(formatShort(90 * MIN)).toBe("1h 30m");
    expect(formatShort(240 * MIN)).toBe("4h");
  });

  it("spells it out for the tooltip and screen readers", () => {
    expect(formatLong(0)).toBe("less than a minute");
    expect(formatLong(MIN)).toBe("1 minute");
    expect(formatLong(45 * MIN)).toBe("45 minutes");
    expect(formatLong(60 * MIN)).toBe("1 hour");
    expect(formatLong(150 * MIN)).toBe("2 hours 30 min");
  });
});

describe("countdown refresh scheduling", () => {
  /*
   * The status bar wakes only when its text would actually change, rather than
   * on a fixed tick. These bound how often that is: roughly once a minute while
   * under an hour, and never more than once a minute above it.
   */

  it("never schedules a wake further out than a minute", () => {
    for (let m = 1; m < 300; m++) {
      expect(msUntilLabelChanges(m * MIN)).toBeLessThanOrEqual(60_000 + 1);
    }
  });

  it("always makes progress", () => {
    for (const remaining of [0, 1, 999, MIN, 90 * MIN, 500 * MIN]) {
      expect(msUntilLabelChanges(remaining)).toBeGreaterThan(0);
    }
  });

  it("wakes at the point the rounded label flips", () => {
    // 45.5 minutes renders as "46m"; half a minute later it becomes "45m".
    const ms = msUntilLabelChanges(45.5 * MIN);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(60_000);
    expect(formatShort(45.5 * MIN)).toBe("46m");
    expect(formatShort(45.5 * MIN - ms - 1)).toBe("45m");
  });

  it("handles an expired countdown without spinning", () => {
    expect(msUntilLabelChanges(0)).toBeGreaterThanOrEqual(1_000);
    expect(msUntilLabelChanges(-5_000)).toBeGreaterThanOrEqual(1_000);
  });
});
