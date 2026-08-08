import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "@pandy/shared-types";

describe("settings control style", () => {
  it("defaults to the heart", () => {
    expect(DEFAULT_SETTINGS.widget.settingsControl).toBe("heart");
  });

  it("accepts every offered style", () => {
    for (const style of ["heart", "dot", "hidden"] as const) {
      expect(parseSettings({ widget: { settingsControl: style } }).widget.settingsControl).toBe(
        style,
      );
    }
  });

  it("falls back to the heart on anything else", () => {
    for (const bad of ["star", "", 3, null, {}, ["heart"]]) {
      expect(parseSettings({ widget: { settingsControl: bad } }).widget.settingsControl).toBe(
        "heart",
      );
    }
  });
});

describe("widget opacity", () => {
  it("defaults to fully solid", () => {
    // Opacity is a CSS effect on the artwork now, not a window-level one, so
    // there is no reason to ship anything faded.
    expect(DEFAULT_SETTINGS.widget.opacity).toBe(1);
  });

  it("clamps out-of-range values instead of accepting them", () => {
    expect(parseSettings({ widget: { opacity: 5 } }).widget.opacity).toBe(1);
    expect(parseSettings({ widget: { opacity: -2 } }).widget.opacity).toBe(0.2);
  });

  it("never lets the mascot become fully invisible", () => {
    expect(parseSettings({ widget: { opacity: 0 } }).widget.opacity).toBeGreaterThanOrEqual(0.2);
  });
});

describe("sound settings", () => {
  it("round-trips volume and focus cues", () => {
    const s = parseSettings({ sound: { enabled: true, volume: 0.3, focusCues: true } });
    expect(s.sound).toEqual({ enabled: true, volume: 0.3, focusCues: true });
  });

  it("clamps volume to 0..1", () => {
    expect(parseSettings({ sound: { volume: 9 } }).sound.volume).toBe(1);
    expect(parseSettings({ sound: { volume: -1 } }).sound.volume).toBe(0);
  });

  it("rejects a non-boolean enabled rather than coercing it", () => {
    // "false" is a string, and a truthy one — coercing it would silently turn
    // sound on for anyone with a hand-edited settings file.
    expect(parseSettings({ sound: { enabled: "false" } }).sound.enabled).toBe(false);
    expect(parseSettings({ sound: { enabled: 1 } }).sound.enabled).toBe(false);
  });

  it("survives a settings file written before sounds existed", () => {
    const legacy = { sound: { enabled: true, volume: 0.5 } };
    expect(parseSettings(legacy).sound.focusCues).toBe(false);
  });
});

describe("existing settings are unchanged", () => {
  it("keeps the calm scheduling defaults", () => {
    const d = DEFAULT_SETTINGS;
    expect(d.categories.water.intervalMinutes).toBe(120);
    expect(d.categories.stand.intervalMinutes).toBe(90);
    expect(d.categories.lookAway.intervalMinutes).toBe(30);
    expect(d.categories.touchGrass.intervalMinutes).toBe(240);
    expect(d.quietHours).toEqual({ enabled: true, start: 20 * 60, end: 8 * 60 });
    expect(d.randomizationMinutes).toBe(5);
    expect(d.workingDays).toEqual([1, 2, 3, 4, 5]);
  });

  it("still defaults delivery to both, so duplicate prevention is exercised", () => {
    expect(DEFAULT_SETTINGS.deliveryOwner).toBe("both");
  });
});
