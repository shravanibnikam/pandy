import { describe, expect, it } from "vitest";
import { MASCOT_STATES, type MascotState } from "@pandy/shared-types";
import { ANIMATIONS, FRAME_SIZE, REQUIRED_STRIPS, animationDurationMs } from "./animations.js";
import { MascotAnimator } from "./animator.js";
import { verifySheets } from "./loader.js";
import { ManualFrameHost, fakeSheets, recordingContext } from "./testing.js";

function makeAnimator(opts: { reducedMotion?: boolean } = {}) {
  const ctx = recordingContext();
  const host = new ManualFrameHost();
  const settled: MascotState[] = [];
  const animator = new MascotAnimator({
    ctx,
    host,
    sheets: fakeSheets(),
    reducedMotion: opts.reducedMotion ?? false,
    onSettled: (s) => settled.push(s),
  });
  return { animator, ctx, host, settled };
}

/**
 * The first rAF callback only establishes the time origin — elapsed time cannot
 * be measured from a single sample — so tests that count advances prime it.
 */
function prime(host: ManualFrameHost) {
  host.step(0);
}

/** Advance one animation's worth of frames for the given state. */
function stepThrough(host: ManualFrameHost, state: MascotState, extraFrames = 1) {
  const frameMs = 1000 / ANIMATIONS[state].fps;
  prime(host);
  host.run(ANIMATIONS[state].frames + extraFrames, frameMs);
}

describe("animation config", () => {
  it("declares every mascot state", () => {
    for (const state of MASCOT_STATES) expect(ANIMATIONS[state]).toBeDefined();
  });

  it("matches the measured strip frame counts", () => {
    // These are the real strip widths / 64, verified against the PNGs on disk.
    expect(ANIMATIONS.idle.frames).toBe(4);
    expect(ANIMATIONS.wave.frames).toBe(6); // not the 8 the brief specified
    expect(ANIMATIONS.drink.frames).toBe(6);
    expect(ANIMATIONS.stretch.frames).toBe(4);
    expect(ANIMATIONS.lookAway.frames).toBe(4);
    expect(ANIMATIONS.sleep.frames).toBe(4);
    expect(ANIMATIONS.celebrate.frames).toBe(8);
  });

  it("loops only idle and sleep", () => {
    const looping = MASCOT_STATES.filter((s) => ANIMATIONS[s].loop);
    expect(looping.sort()).toEqual(["idle", "sleep"]);
  });

  it("routes touchGrass to the stretch strip", () => {
    // The touch strip changes character design mid-animation; see PLAN.md §1.5.
    expect(ANIMATIONS.touchGrass.strip).toBe("stretch_strip.png");
    expect(REQUIRED_STRIPS).not.toContain("touch_strip.png");
  });

  it("requires exactly the seven strips it uses", () => {
    expect(REQUIRED_STRIPS).toHaveLength(7);
  });

  it("accepts sheets that match the config", () => {
    expect(verifySheets(fakeSheets())).toEqual([]);
  });

  it("reports a truncated strip rather than drawing a blank frame", () => {
    const sheets = fakeSheets();
    sheets["celebrate_strip.png"] = {
      image: { width: 4 * FRAME_SIZE, height: FRAME_SIZE },
      frames: 4,
    };
    expect(verifySheets(sheets).join()).toMatch(/celebrate.*4 frames.*declares 8/);
  });

  it("reports a strip of the wrong height", () => {
    const sheets = fakeSheets();
    sheets["idle_strip.png"] = { image: { width: 4 * FRAME_SIZE, height: 32 }, frames: 4 };
    expect(verifySheets(sheets).join()).toMatch(/32px tall/);
  });
});

describe("rendering", () => {
  it("disables image smoothing", () => {
    const { ctx } = makeAnimator();
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it("blits at native size from the correct strip offset", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("celebrate");
    prime(host);
    host.run(3, 1000 / ANIMATIONS.celebrate.fps);

    expect(ctx.calls.length).toBeGreaterThan(1);
    // Source x is always a whole frame into the strip — never a fractional crop.
    for (const call of ctx.calls) expect(call.sx % FRAME_SIZE).toBe(0);
    expect(ctx.calls.map((c) => c.frame).slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("clears before each blit so transparency does not accumulate", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle");
    host.run(3, 1000 / ANIMATIONS.idle.fps);
    expect(ctx.clears).toBe(ctx.calls.length);
  });

  it("does not redraw when the frame has not changed", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle");
    const after = ctx.calls.length;

    // Ten display frames well inside one 6fps animation frame.
    for (let i = 1; i <= 10; i++) host.step(i * 2);
    expect(ctx.calls.length).toBe(after);
  });

  it("advances at the configured fps regardless of display rate", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle"); // 6fps → 166.67ms per frame

    // 120Hz display: 8.33ms per callback, one second of frames.
    for (let i = 1; i <= 120; i++) host.step(i * (1000 / 120));

    // One second at 6fps is 6 advances, not 120.
    const advances = ctx.calls.length - 1;
    expect(advances).toBeGreaterThanOrEqual(5);
    expect(advances).toBeLessThanOrEqual(7);
  });
});

describe("state transitions", () => {
  it("returns a non-looping animation to idle on its final frame", () => {
    const { animator, host, settled } = makeAnimator();
    animator.setState("celebrate");
    expect(animator.state).toBe("celebrate");

    stepThrough(host, "celebrate");

    expect(animator.state).toBe("idle");
    expect(settled).toEqual(["celebrate"]);
  });

  it("returns to idle from every one-shot animation", () => {
    for (const state of MASCOT_STATES) {
      if (ANIMATIONS[state].loop) continue;
      const { animator, host } = makeAnimator();
      animator.setState(state);
      stepThrough(host, state);
      expect(animator.state, `${state} should settle to idle`).toBe("idle");
    }
  });

  it("keeps looping animations looping", () => {
    const { animator, host } = makeAnimator();
    animator.setState("idle");
    host.run(20, 1000 / ANIMATIONS.idle.fps);
    expect(animator.state).toBe("idle");
    expect(animator.frame).toBeLessThan(ANIMATIONS.idle.frames);
  });

  it("wraps a looping animation rather than running off the end", () => {
    const { animator, host } = makeAnimator();
    animator.setState("sleep");
    host.run(9, 1000 / ANIMATIONS.sleep.fps);
    expect(animator.frame).toBeLessThan(ANIMATIONS.sleep.frames);
  });

  it("cancels the previous animation when the state changes", () => {
    const { animator, host } = makeAnimator();
    animator.setState("celebrate");
    expect(host.pendingCount).toBe(1);

    animator.setState("drink");
    // Still exactly one scheduled callback — the old one was cancelled, not
    // left running alongside the new one.
    expect(host.pendingCount).toBe(1);
    expect(animator.state).toBe("drink");
    expect(animator.frame).toBe(0);
  });

  it("survives rapid state switching without stacking callbacks", () => {
    const { animator, host } = makeAnimator();
    const order: MascotState[] = ["wave", "drink", "celebrate", "stretch", "lookAway", "sleep"];
    for (let i = 0; i < 60; i++) {
      animator.setState(order[i % order.length]!);
      expect(host.pendingCount).toBeLessThanOrEqual(1);
    }
  });

  it("restarts an animation when set to the same state again", () => {
    const { animator, host } = makeAnimator();
    animator.setState("celebrate");
    host.run(3, 1000 / ANIMATIONS.celebrate.fps);
    expect(animator.frame).toBeGreaterThan(0);

    animator.setState("celebrate");
    expect(animator.frame).toBe(0);
  });

  it("catches up rather than replaying in slow motion after a stall", () => {
    const { animator, host } = makeAnimator();
    animator.setState("idle");
    prime(host);
    // One callback arriving a full second late.
    host.step(1000);
    // 6fps for a second is six frames; modulo four leaves frame 2.
    expect(animator.frame).toBe(6 % ANIMATIONS.idle.frames);
  });
});

describe("visibility", () => {
  it("stops scheduling frames when hidden", () => {
    const { animator, host } = makeAnimator();
    animator.setState("idle");
    expect(host.pendingCount).toBe(1);

    animator.setVisible(false);
    expect(host.pendingCount).toBe(0);
    expect(animator.running).toBe(false);
  });

  it("draws nothing while hidden", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle");
    animator.setVisible(false);
    const before = ctx.calls.length;

    host.run(30, 1000 / ANIMATIONS.idle.fps);
    expect(ctx.calls.length).toBe(before);
  });

  it("resumes when shown again", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle");
    animator.setVisible(false);
    const before = ctx.calls.length;

    animator.setVisible(true);
    expect(host.pendingCount).toBe(1);
    host.run(4, 1000 / ANIMATIONS.idle.fps);
    expect(ctx.calls.length).toBeGreaterThan(before);
  });

  it("ignores a redundant visibility change", () => {
    const { animator, host } = makeAnimator();
    animator.setState("idle");
    animator.setVisible(true);
    expect(host.pendingCount).toBe(1);
  });
});

describe("reduced motion", () => {
  it("renders a single frame and schedules nothing", () => {
    const { animator, ctx, host } = makeAnimator({ reducedMotion: true });
    animator.setState("celebrate");

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]!.frame).toBe(0);
    expect(host.pendingCount).toBe(0);
    expect(animator.running).toBe(false);
  });

  it("shows the first frame of whatever state it is put in", () => {
    const { animator, ctx } = makeAnimator({ reducedMotion: true });
    for (const state of MASCOT_STATES) {
      animator.setState(state);
      expect(ctx.calls.at(-1)!.frame).toBe(0);
    }
  });

  it("never advances even when frames are delivered", () => {
    const { animator, host } = makeAnimator({ reducedMotion: true });
    animator.setState("wave");
    host.run(50, 16);
    expect(animator.frame).toBe(0);
    expect(animator.state).toBe("wave"); // no auto-return, nothing is animating
  });

  it("stops an animation in flight when switched on", () => {
    const { animator, host } = makeAnimator();
    animator.setState("idle");
    expect(host.pendingCount).toBe(1);

    animator.setReducedMotion(true);
    expect(host.pendingCount).toBe(0);
    expect(animator.frame).toBe(0);
  });

  it("resumes animating when switched back off", () => {
    const { animator, host } = makeAnimator({ reducedMotion: true });
    animator.setState("idle");
    animator.setReducedMotion(false);
    expect(host.pendingCount).toBe(1);
  });
});

describe("lifecycle", () => {
  it("draws nothing and schedules nothing after destroy", () => {
    const { animator, ctx, host } = makeAnimator();
    animator.setState("idle");
    animator.destroy();
    const before = ctx.calls.length;

    animator.setState("celebrate");
    host.run(10, 16);
    expect(ctx.calls.length).toBe(before);
    expect(host.pendingCount).toBe(0);
  });

  it("reports a sensible duration for each animation", () => {
    expect(animationDurationMs("idle")).toBeCloseTo(666.67, 0);
    expect(animationDurationMs("celebrate")).toBe(800);
    expect(animationDurationMs("wave")).toBe(750);
  });
});
