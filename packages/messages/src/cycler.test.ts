import { describe, expect, it } from "vitest";
import { pickMessage } from "./cycler.js";
import { builtInFor } from "./pool.js";

/** Deterministic rng that always takes the first candidate. */
const first = () => 0;
/** Deterministic rng that always takes the last candidate. */
const last = () => 0.999999;

describe("pickMessage non-repetition", () => {
  it("cycles the entire pool before repeating any message", () => {
    const poolSize = builtInFor("water", "gen-z").length;
    let recent: readonly string[] = [];
    const seen: string[] = [];

    for (let i = 0; i < poolSize; i++) {
      const r = pickMessage({ type: "water", tone: "gen-z", recent, rng: first });
      seen.push(r.message.id);
      recent = r.recent;
    }

    expect(new Set(seen).size).toBe(poolSize);
  });

  it("resets the recent list once the pool is exhausted", () => {
    const poolSize = builtInFor("stand", "low-key").length;
    let recent: readonly string[] = [];

    for (let i = 0; i < poolSize; i++) {
      recent = pickMessage({ type: "stand", tone: "low-key", recent, rng: first }).recent;
    }
    expect(recent).toHaveLength(poolSize);

    // The next pick starts a fresh cycle rather than growing without bound.
    const next = pickMessage({ type: "stand", tone: "low-key", recent, rng: first });
    expect(next.recent).toHaveLength(1);
  });

  it("never shows the same message twice in a row across the cycle seam", () => {
    const poolSize = builtInFor("lookAway", "chaotic").length;
    let recent: readonly string[] = [];
    let lastId = "";

    // Two full cycles, always taking the last candidate so the seam is exercised.
    for (let i = 0; i < poolSize * 2; i++) {
      const r = pickMessage({ type: "lookAway", tone: "chaotic", recent, rng: last });
      expect(r.message.id).not.toBe(lastId);
      lastId = r.message.id;
      recent = r.recent;
    }
  });

  it("does not repeat across the seam even when rng would pick the same one", () => {
    const pool = builtInFor("water", "low-key");
    // Drive the pool to exhaustion, ending on a known message.
    let recent: readonly string[] = pool.slice(0, pool.length - 1).map((m) => m.id);
    const penultimate = pickMessage({ type: "water", tone: "low-key", recent, rng: first });
    recent = penultimate.recent;
    expect(recent).toHaveLength(pool.length);

    const afterSeam = pickMessage({ type: "water", tone: "low-key", recent, rng: first });
    expect(afterSeam.message.id).not.toBe(penultimate.message.id);
  });
});

describe("pickMessage tone and custom messages", () => {
  it("only returns messages in the requested tone", () => {
    for (let i = 0; i < 20; i++) {
      const r = pickMessage({ type: "touchGrass", tone: "low-key", rng: () => i / 20 });
      expect(r.message.tone).toBe("low-key");
    }
  });

  it("returns no emoji or slang when low-key is selected", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    let recent: readonly string[] = [];
    for (let i = 0; i < builtInFor("water", "low-key").length; i++) {
      const r = pickMessage({ type: "water", tone: "low-key", recent, rng: first });
      expect(emoji.test(r.message.text)).toBe(false);
      recent = r.recent;
    }
  });

  it("folds custom messages into the pool", () => {
    const custom = ["My own reminder"];
    const poolSize = builtInFor("stand", "gen-z").length + custom.length;
    let recent: readonly string[] = [];
    const texts: string[] = [];

    for (let i = 0; i < poolSize; i++) {
      const r = pickMessage({ type: "stand", tone: "gen-z", custom, recent, rng: first });
      texts.push(r.message.text);
      recent = r.recent;
    }
    expect(texts).toContain("My own reminder");
  });

  it("drops stale recent ids when the tone changes", () => {
    // Ids from a gen-z cycle must not suppress anything in the low-key pool.
    const genZRecent = builtInFor("water", "gen-z").map((m) => m.id);
    const r = pickMessage({ type: "water", tone: "low-key", recent: genZRecent, rng: first });
    expect(r.message.tone).toBe("low-key");
    // A fresh pool means the carried list holds only the new pick.
    expect(r.recent).toEqual([r.message.id]);
  });

  it("drops stale recent ids when a custom message is removed", () => {
    const r = pickMessage({
      type: "stand",
      tone: "low-key",
      custom: [],
      recent: ["custom:stand:0", "custom:stand:1"],
      rng: first,
    });
    expect(r.recent).toEqual([r.message.id]);
  });

  it("always produces non-empty text", () => {
    for (const tone of ["low-key", "gen-z", "chaotic"] as const) {
      const r = pickMessage({ type: "touchGrass", tone, rng: first });
      expect(r.message.text.trim().length).toBeGreaterThan(0);
    }
  });
});
