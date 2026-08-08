import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_STALE_MS,
  desktopShouldNotify,
  isHeartbeatLive,
  parseHeartbeat,
  vscodeShouldNotify,
} from "./presence.js";

const NOW = 1_800_000_000_000;
const live = { pid: 42, updatedAt: NOW - 10_000 };
const stale = { pid: 42, updatedAt: NOW - HEARTBEAT_STALE_MS - 1 };

describe("heartbeat liveness", () => {
  it("accepts a recent heartbeat", () => {
    expect(isHeartbeatLive(live, NOW)).toBe(true);
  });

  it("rejects an old one", () => {
    expect(isHeartbeatLive(stale, NOW)).toBe(false);
  });

  it("rejects a missing one", () => {
    expect(isHeartbeatLive(null, NOW)).toBe(false);
    expect(isHeartbeatLive(undefined, NOW)).toBe(false);
  });

  it("treats a future timestamp as live rather than as garbage", () => {
    // The clock moving backwards should not cause duplicate notifications.
    expect(isHeartbeatLive({ pid: 1, updatedAt: NOW + 60_000 }, NOW)).toBe(true);
  });
});

describe("heartbeat parsing", () => {
  it("round-trips a valid payload", () => {
    expect(parseHeartbeat(JSON.stringify(live))).toEqual(live);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "null", "not json", "[]", '{"pid":"x","updatedAt":1}', '{"pid":1}']) {
      expect(parseHeartbeat(bad)).toBeNull();
    }
  });
});

describe("notification ownership", () => {
  it("lets VS Code notify when it owns delivery, even with the desktop running", () => {
    expect(vscodeShouldNotify({ preference: "vscode", desktopHeartbeat: live, now: NOW })).toBe(
      true,
    );
  });

  it("steps aside for a running desktop app when set to both", () => {
    expect(vscodeShouldNotify({ preference: "both", desktopHeartbeat: live, now: NOW })).toBe(
      false,
    );
  });

  it("notifies when set to both and the desktop app is not running", () => {
    expect(vscodeShouldNotify({ preference: "both", desktopHeartbeat: null, now: NOW })).toBe(true);
  });

  it("steps aside when the desktop app owns delivery and is running", () => {
    expect(vscodeShouldNotify({ preference: "desktop", desktopHeartbeat: live, now: NOW })).toBe(
      false,
    );
  });

  it("falls back rather than going silent when the desktop app dies", () => {
    // Uninstalling or crashing the desktop app must not silence reminders.
    expect(vscodeShouldNotify({ preference: "desktop", desktopHeartbeat: stale, now: NOW })).toBe(
      true,
    );
  });

  it("never produces two notifications for any combination", () => {
    for (const preference of ["vscode", "desktop", "both"] as const) {
      for (const heartbeat of [live, stale, null]) {
        const desktopRunning = isHeartbeatLive(heartbeat, NOW);
        const vs = vscodeShouldNotify({ preference, desktopHeartbeat: heartbeat, now: NOW });
        const desk = desktopShouldNotify(preference) && desktopRunning;
        expect(
          [vs, desk].filter(Boolean).length,
          `${preference} / desktop ${desktopRunning ? "live" : "down"}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("always delivers somewhere when the desktop app is running", () => {
    for (const preference of ["vscode", "desktop", "both"] as const) {
      const vs = vscodeShouldNotify({ preference, desktopHeartbeat: live, now: NOW });
      const desk = desktopShouldNotify(preference);
      expect(vs || desk, preference).toBe(true);
    }
  });

  it("keeps the desktop app quiet when VS Code owns delivery", () => {
    expect(desktopShouldNotify("vscode")).toBe(false);
    expect(desktopShouldNotify("desktop")).toBe(true);
    expect(desktopShouldNotify("both")).toBe(true);
  });
});
