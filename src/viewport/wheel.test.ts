import { describe, expect, it } from "vitest";
import { DEFAULT_TUNING, resolveTuning } from "../shared/tuning";
import { wheelZoomFactor } from "./wheel";

const px = (deltaY: number, ctrlKey = false) => ({ deltaY, deltaMode: 0, ctrlKey });

describe("wheelZoomFactor", () => {
  it("metric 1: one scroll of 300 equals thirty of 10 (< 1%)", () => {
    const one = wheelZoomFactor(px(300), DEFAULT_TUNING);
    let many = 1;
    for (let i = 0; i < 30; i += 1) many *= wheelZoomFactor(px(10), DEFAULT_TUNING);
    expect(Math.abs(one - many) / one).toBeLessThan(0.01);
  });

  it("metric 2: a line is 40 px and a page 300 px", () => {
    expect(wheelZoomFactor({ deltaY: 3, deltaMode: 1, ctrlKey: false }, DEFAULT_TUNING)).toBeCloseTo(
      wheelZoomFactor(px(120), DEFAULT_TUNING),
      10,
    );
    expect(wheelZoomFactor({ deltaY: 1, deltaMode: 2, ctrlKey: false }, DEFAULT_TUNING)).toBeCloseTo(
      wheelZoomFactor(px(300), DEFAULT_TUNING),
      10,
    );
  });

  it("metric 4: no single event zooms by more than maxZoomPerEvent either way", () => {
    expect(wheelZoomFactor(px(-1e6), DEFAULT_TUNING)).toBe(2);
    expect(wheelZoomFactor(px(1e6), DEFAULT_TUNING)).toBe(0.5);
  });

  it("metric 5: doubling the scale takes 250 to 400 px of scroll", () => {
    const perDoubling = Math.log(2) / DEFAULT_TUNING.wheelSensitivity;
    expect(perDoubling).toBeGreaterThanOrEqual(250);
    expect(perDoubling).toBeLessThanOrEqual(400);
    expect(wheelZoomFactor(px(-perDoubling), DEFAULT_TUNING)).toBeCloseTo(2, 6);
  });

  it("applies the pinch gain to ctrl-wheel events", () => {
    const pinch = Math.log(wheelZoomFactor(px(-10, true), DEFAULT_TUNING));
    const plain = Math.log(wheelZoomFactor(px(-10), DEFAULT_TUNING));
    expect(pinch / plain).toBeCloseTo(DEFAULT_TUNING.pinchGain, 6);
  });

  it("merges a partial tuning over the defaults, including nested label classes", () => {
    const t = resolveTuning({ pinchGain: 3, labelClasses: { large: 0.9, medium: 0.4 } });
    expect(t.pinchGain).toBe(3);
    expect(t.wheelSensitivity).toBe(DEFAULT_TUNING.wheelSensitivity);
    expect(t.labelClasses).toEqual({ large: 0.9, medium: 0.4 });
    expect(resolveTuning(undefined)).toEqual(DEFAULT_TUNING);
  });

  it.each<[string, Record<string, number | Record<string, number>>]>([
    ["wheelSensitivity: 0", { wheelSensitivity: 0 }],
    ["wheelSensitivity: -0.5", { wheelSensitivity: -0.5 }],
    ["wheelSensitivity: NaN", { wheelSensitivity: Number.NaN }],
    ["wheelSensitivity: Infinity", { wheelSensitivity: Number.POSITIVE_INFINITY }],
    ["pinchGain: 0", { pinchGain: 0 }],
    ["pinchGain: -1", { pinchGain: -1 }],
    ["pinchGain: NaN", { pinchGain: Number.NaN }],
    ["maxZoomPerEvent: 1", { maxZoomPerEvent: 1 }],
    ["maxZoomPerEvent: 0", { maxZoomPerEvent: 0 }],
    ["maxZoomPerEvent: -1", { maxZoomPerEvent: -1 }],
    ["maxZoomPerEvent: NaN", { maxZoomPerEvent: Number.NaN }],
    ["hysteresis: 0.5", { hysteresis: 0.5 }],
    ["hysteresis: 0.6", { hysteresis: 0.6 }],
    ["hysteresis: -0.1", { hysteresis: -0.1 }],
    ["hysteresis: NaN", { hysteresis: Number.NaN }],
    ["fadeBand: -0.1", { fadeBand: -0.1 }],
    ["fadeBand: NaN", { fadeBand: Number.NaN }],
    ["hullPadding: 0", { hullPadding: 0 }],
    ["hullPadding: -1", { hullPadding: -1 }],
    ["hullPadding: NaN", { hullPadding: Number.NaN }],
    ["hullPadding: Infinity", { hullPadding: Number.POSITIVE_INFINITY }],
    ["hoverRadius: -1", { hoverRadius: -1 }],
    ["hoverRadius: NaN", { hoverRadius: Number.NaN }],
    ["labelClasses.large > 1", { labelClasses: { large: 1.1, medium: 0.5 } }],
    ["labelClasses.large < 0", { labelClasses: { large: -0.1, medium: 0.5 } }],
    ["labelClasses.large: NaN", { labelClasses: { large: Number.NaN, medium: 0.5 } }],
    ["labelClasses.medium > large", { labelClasses: { large: 0.3, medium: 0.6 } }],
    ["labelClasses.medium: NaN", { labelClasses: { large: 0.8, medium: Number.NaN } }],
  ])("rejects invalid tuning: %s", (_, invalid) => {
    expect(() => resolveTuning(invalid as Partial<Record<string, unknown>>)).toThrow(RangeError);
    expect(() => resolveTuning(invalid as Partial<Record<string, unknown>>)).toThrow(/tuning\./);
  });

  it("accepts valid partial tunings", () => {
    expect(() => resolveTuning({ pinchGain: 5, wheelSensitivity: 0.001 })).not.toThrow();
    expect(() => resolveTuning({ hysteresis: 0, fadeBand: 0.5, hoverRadius: 0 })).not.toThrow();
    expect(() => resolveTuning({ labelClasses: { large: 1, medium: 0 } })).not.toThrow();
    expect(() => resolveTuning(undefined)).not.toThrow();
  });
});
