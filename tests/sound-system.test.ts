import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, parseSettings } from "@pandy/shared-types";
import { SOUNDS, SOUND_EVENTS, isSoundEvent } from "../apps/electron-app/src/renderer/sound.js";

const ASSETS = join(import.meta.dirname, "..", "assets", "sounds");

describe("sound is off by default", () => {
  it("ships with sound disabled", () => {
    expect(DEFAULT_SETTINGS.sound.enabled).toBe(false);
  });

  it("ships with focus cues disabled even once sound is on", () => {
    expect(DEFAULT_SETTINGS.sound.focusCues).toBe(false);
  });

  it("stays off when settings are parsed from nothing", () => {
    expect(parseSettings({}).sound.enabled).toBe(false);
  });

  it("stays off when a stored file omits the sound block entirely", () => {
    expect(parseSettings({ tone: "chaotic" }).sound.enabled).toBe(false);
  });
});

describe("event to sound mapping", () => {
  it("covers every event the app can raise", () => {
    expect(SOUND_EVENTS.sort()).toEqual(
      ["completed", "focusEnd", "focusStart", "reminder", "snoozed"].sort(),
    );
  });

  it("points every event at a file that exists on disk", () => {
    for (const event of SOUND_EVENTS) {
      const path = join(ASSETS, SOUNDS[event].file);
      expect(existsSync(path), `${event} → ${SOUNDS[event].file}`).toBe(true);
    }
  });

  it("gives every event a label and a description for the settings panel", () => {
    for (const event of SOUND_EVENTS) {
      expect(SOUNDS[event].label.length).toBeGreaterThan(0);
      expect(SOUNDS[event].description.length).toBeGreaterThan(0);
    }
  });

  it("marks only the focus cues optional", () => {
    const optional = SOUND_EVENTS.filter((e) => SOUNDS[e].optional).sort();
    expect(optional).toEqual(["focusEnd", "focusStart"]);
  });

  it("keeps every level within a sane range", () => {
    for (const event of SOUND_EVENTS) {
      expect(SOUNDS[event].level).toBeGreaterThan(0);
      expect(SOUNDS[event].level).toBeLessThanOrEqual(1);
    }
  });

  it("uses a distinct sound per event", () => {
    const files = SOUND_EVENTS.map((e) => SOUNDS[e].file);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("sound event guard", () => {
  it("accepts the real events", () => {
    for (const e of SOUND_EVENTS) expect(isSoundEvent(e)).toBe(true);
  });

  it("rejects anything else arriving over IPC", () => {
    for (const bad of ["", "Reminder", "toString", "constructor", null, 1, {}, []]) {
      expect(isSoundEvent(bad)).toBe(false);
    }
  });
});

describe("the audio files themselves", () => {
  /** Minimal RIFF/WAVE header reader — no dependency needed for five files. */
  function readWav(file: string) {
    const buf = readFileSync(join(ASSETS, file));
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    const channels = buf.readUInt16LE(22);
    const rate = buf.readUInt32LE(24);
    const bits = buf.readUInt16LE(34);
    const dataSize = buf.readUInt32LE(40);
    return { channels, rate, bits, seconds: dataSize / (rate * channels * (bits / 8)), buf };
  }

  it("are mono 16-bit 22.05 kHz, as documented", () => {
    for (const event of SOUND_EVENTS) {
      const w = readWav(SOUNDS[event].file);
      expect(w.channels, SOUNDS[event].file).toBe(1);
      expect(w.bits, SOUNDS[event].file).toBe(16);
      expect(w.rate, SOUNDS[event].file).toBe(22_050);
    }
  });

  it("are short — a cue, not a track", () => {
    for (const event of SOUND_EVENTS) {
      const w = readWav(SOUNDS[event].file);
      expect(w.seconds, SOUNDS[event].file).toBeGreaterThan(0.2);
      expect(w.seconds, SOUNDS[event].file).toBeLessThanOrEqual(2);
    }
  });

  it("carry no loop metadata", () => {
    // A `smpl` chunk is how a WAV declares loop points. None of these may have
    // one — a looping reminder chime would be genuinely unpleasant.
    for (const event of SOUND_EVENTS) {
      const { buf } = readWav(SOUNDS[event].file);
      expect(buf.includes(Buffer.from("smpl", "ascii")), SOUNDS[event].file).toBe(false);
    }
  });

  it("start and end near silence, so nothing clicks", () => {
    for (const event of SOUND_EVENTS) {
      const { buf } = readWav(SOUNDS[event].file);
      const first = Math.abs(buf.readInt16LE(44));
      const last = Math.abs(buf.readInt16LE(buf.length - 2));
      expect(first, `${SOUNDS[event].file} onset`).toBeLessThan(1200);
      expect(last, `${SOUNDS[event].file} tail`).toBeLessThan(1200);
    }
  });
});
