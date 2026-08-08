import { describe, expect, it } from "vitest";
import { REMINDER_TYPES } from "@pandy/shared-types";
import type { Tone } from "@pandy/shared-types";
import { MESSAGES, builtInFor } from "./pool.js";

const TONES: readonly Tone[] = ["low-key", "gen-z", "chaotic"];

describe("message pool shape", () => {
  it("covers every category in every tone", () => {
    for (const type of REMINDER_TYPES) {
      for (const tone of TONES) {
        expect(builtInFor(type, tone).length, `${type}/${tone}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("has unique ids", () => {
    const ids = MESSAGES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate text within a category and tone", () => {
    for (const type of REMINDER_TYPES) {
      for (const tone of TONES) {
        const texts = builtInFor(type, tone).map((m) => m.text);
        expect(new Set(texts).size, `${type}/${tone}`).toBe(texts.length);
      }
    }
  });

  it("tags every message with the category and tone it is filed under", () => {
    for (const type of REMINDER_TYPES) {
      for (const tone of TONES) {
        for (const msg of builtInFor(type, tone)) {
          expect(msg.type).toBe(type);
          expect(msg.tone).toBe(tone);
        }
      }
    }
  });

  it("uses only intensity 1-3", () => {
    for (const msg of MESSAGES) expect([1, 2, 3]).toContain(msg.intensity);
  });
});

describe("content rules", () => {
  /*
   * These are product constraints, not style preferences. A wellness reminder
   * that shames the user is worse than no reminder, and a health claim in a
   * notification is a claim the project cannot stand behind.
   */

  const banned: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
    { label: "guilt / blame", pattern: /\b(you (should have|shouldn't have|failed|forgot to)|why haven't you|you never|you always forget)\b/i },
    { label: "shame", pattern: /\b(lazy|pathetic|disappointing|ashamed|shame on you|no excuse)\b/i },
    { label: "medical claim", pattern: /\b(prevents?|cures?|treats?|reduces? your risk of|diagnos\w*|clinically|doctors? recommend|medically)\b/i },
    { label: "streak threat", pattern: /\b(streak|you'?ll lose|don'?t break|you'?re about to lose|keep your record)\b/i },
    { label: "harm framing", pattern: /\b(damage|damaging|harm(ful|ing)?|deteriorat\w*|permanent(ly)? (harm|damage))\b/i },
  ];

  it("contains no guilt, shame, medical claims or streak threats", () => {
    const violations: string[] = [];
    for (const msg of MESSAGES) {
      for (const { label, pattern } of banned) {
        if (pattern.test(msg.text)) violations.push(`[${label}] ${msg.id}: "${msg.text}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps messages short enough for a notification", () => {
    const tooLong = MESSAGES.filter((m) => m.text.length > 120).map((m) => m.id);
    expect(tooLong).toEqual([]);
  });

  it("keeps the low-key tone free of emoji", () => {
    // Someone picking low-key is opting out of the whole register, not just the slang.
    const emoji = /\p{Extended_Pictographic}/u;
    const offenders = MESSAGES.filter((m) => m.tone === "low-key" && emoji.test(m.text)).map(
      (m) => `${m.id}: "${m.text}"`,
    );
    expect(offenders).toEqual([]);
  });
});
