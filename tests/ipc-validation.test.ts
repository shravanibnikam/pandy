import { describe, expect, it } from "vitest";
import {
  boundedInt,
  booleanFieldOf,
  pauseMinutesOf,
  pointOf,
  reminderResultOf,
  reminderTypeOf,
  resolvePayloadOf,
  settingsPatchOf,
} from "../apps/electron-app/src/main/validate.js";

/*
 * The renderer is sandboxed, but it is still the untrusted side of the IPC
 * boundary. These pin the property that matters: malformed input is rejected
 * rather than coerced into something plausible that main will then act on.
 */

const GARBAGE: readonly unknown[] = [
  null,
  undefined,
  0,
  "",
  "nonsense",
  [],
  {},
  { type: "water" },
  { type: 1, result: 2 },
  { __proto__: { type: "water" } },
  NaN,
  Infinity,
];

describe("reminder type and result", () => {
  it("accepts the four real categories", () => {
    for (const t of ["water", "stand", "lookAway", "touchGrass"]) {
      expect(reminderTypeOf(t)).toBe(t);
    }
  });

  it("rejects anything else", () => {
    for (const bad of [...GARBAGE, "Water", "coffee", "constructor", "__proto__"]) {
      expect(reminderTypeOf(bad)).toBeNull();
    }
  });

  it("accepts the four real results", () => {
    for (const r of ["completed", "snoozed", "dismissed", "paused"]) {
      expect(reminderResultOf(r)).toBe(r);
    }
  });

  it("rejects any other result", () => {
    for (const bad of [...GARBAGE, "COMPLETED", "done"]) {
      expect(reminderResultOf(bad)).toBeNull();
    }
  });
});

describe("resolve payload", () => {
  it("accepts a well-formed payload", () => {
    expect(resolvePayloadOf({ type: "water", result: "completed" })).toEqual({
      type: "water",
      result: "completed",
    });
  });

  it("rejects a payload missing either half", () => {
    expect(resolvePayloadOf({ type: "water" })).toBeNull();
    expect(resolvePayloadOf({ result: "completed" })).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    for (const bad of GARBAGE) expect(resolvePayloadOf(bad)).toBeNull();
  });
});

describe("bounded numbers", () => {
  it("rejects NaN and Infinity", () => {
    expect(boundedInt(NaN, 0, 10)).toBeNull();
    expect(boundedInt(Infinity, 0, 10)).toBeNull();
    expect(boundedInt(-Infinity, 0, 10)).toBeNull();
  });

  it("rejects values outside the range rather than clamping them", () => {
    // Clamping would silently accept a hostile value as a valid one.
    expect(boundedInt(11, 0, 10)).toBeNull();
    expect(boundedInt(-1, 0, 10)).toBeNull();
  });

  it("rejects non-numbers, including numeric strings", () => {
    for (const bad of ["5", null, undefined, {}, []]) expect(boundedInt(bad, 0, 10)).toBeNull();
  });

  it("accepts and rounds an in-range number", () => {
    expect(boundedInt(5.4, 0, 10)).toBe(5);
    expect(boundedInt(0, 0, 10)).toBe(0);
    expect(boundedInt(10, 0, 10)).toBe(10);
  });
});

describe("pause minutes", () => {
  it("accepts a sane duration", () => {
    expect(pauseMinutesOf({ minutes: 60 })).toBe(60);
  });

  it("rejects zero, negatives and more than a day", () => {
    for (const m of [0, -5, 1441, 99999]) expect(pauseMinutesOf({ minutes: m })).toBeNull();
  });

  it("rejects garbage", () => {
    for (const bad of GARBAGE) expect(pauseMinutesOf(bad)).toBeNull();
  });
});

describe("widget point", () => {
  it("accepts plausible screen coordinates, including negative ones", () => {
    // A second monitor placed left of or above the primary is a real layout.
    expect(pointOf({ x: -1920, y: 0 })).toEqual({ x: -1920, y: 0 });
    expect(pointOf({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 });
  });

  it("rejects values no display could produce", () => {
    expect(pointOf({ x: 1e9, y: 0 })).toBeNull();
    expect(pointOf({ x: 0, y: NaN })).toBeNull();
  });

  it("rejects a partial point", () => {
    expect(pointOf({ x: 10 })).toBeNull();
    expect(pointOf({ y: 10 })).toBeNull();
  });
});

describe("boolean field", () => {
  it("accepts only real booleans", () => {
    expect(booleanFieldOf({ visible: true }, "visible")).toBe(true);
    expect(booleanFieldOf({ visible: false }, "visible")).toBe(false);
  });

  it("rejects truthy values that are not booleans", () => {
    for (const bad of ["true", 1, 0, null, {}]) {
      expect(booleanFieldOf({ visible: bad }, "visible")).toBeNull();
    }
  });
});

describe("settings patch", () => {
  it("accepts plain nested JSON", () => {
    const patch = { tone: "low-key", categories: { water: { enabled: true, intervalMinutes: 60 } } };
    expect(settingsPatchOf(patch)).toEqual(patch);
  });

  it("rejects non-finite numbers anywhere in the tree", () => {
    expect(settingsPatchOf({ a: { b: { c: NaN } } })).toBeNull();
    expect(settingsPatchOf({ list: [1, Infinity] })).toBeNull();
  });

  it("rejects values that are not plain JSON", () => {
    expect(settingsPatchOf({ fn: () => 1 })).toBeNull();
    expect(settingsPatchOf({ sym: Symbol("x") })).toBeNull();
  });

  it("rejects a tree deep enough to be an attack rather than a setting", () => {
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(settingsPatchOf(deep)).toBeNull();
  });

  it("rejects a non-object", () => {
    for (const bad of [null, 1, "x", []]) expect(settingsPatchOf(bad)).toBeNull();
  });
});
