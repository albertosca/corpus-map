import { describe, expect, it } from "vitest";
import type { Regime } from "./lod";
import { fade, groupNameAlpha, regimeAt } from "./regime";

const thresholds = { midAt: 2, nearAt: 6 };

describe("regimeAt", () => {
  it("enters a finer regime at its threshold", () => {
    expect(regimeAt(1.99, thresholds, "far", 0.05)).toBe("far");
    expect(regimeAt(2, thresholds, "far", 0.05)).toBe("mid");
    expect(regimeAt(6, thresholds, "mid", 0.05)).toBe("near");
    expect(regimeAt(60, thresholds, "far", 0.05)).toBe("near");
  });

  it("leaves a regime only a hysteresis fraction below its threshold", () => {
    expect(regimeAt(1.91, thresholds, "mid", 0.05)).toBe("mid");
    expect(regimeAt(1.89, thresholds, "mid", 0.05)).toBe("far");
    expect(regimeAt(5.8, thresholds, "near", 0.05)).toBe("near");
    expect(regimeAt(5.6, thresholds, "near", 0.05)).toBe("mid");
    expect(regimeAt(1, thresholds, "near", 0.05)).toBe("far");
  });

  it.each([2, 6])("metric 12: ±3%% oscillation around %s never flips the regime", (threshold) => {
    let regime: Regime = regimeAt(threshold * 1.03, thresholds, "far", 0.05);
    let flips = 0;
    for (let index = 0; index < 100; index += 1) {
      const next = regimeAt(threshold * (index % 2 === 0 ? 0.97 : 1.03), thresholds, regime, 0.05);
      if (next !== regime) flips += 1;
      regime = next;
    }
    expect(flips).toBe(0);
  });

  it("lands in near for fitScale * nearAt / fitScale over 20,000 fitted scales", () => {
    let misses = 0;
    for (let step = 0; step < 5000; step += 1) {
      const fit = 0.001 + ((step * 7.3) % 997.1);
      for (const nearAt of [6, 12.5, 100, 3.3]) {
        if (regimeAt((fit * nearAt) / fit, { midAt: nearAt / 3, nearAt }, "far", 0) !== "near") misses += 1;
      }
    }
    expect(misses).toBe(0);
  });

  it("treats a non-finite ratio as far", () => {
    expect(regimeAt(Number.NaN, thresholds, "near", 0.05)).toBe("far");
  });
});

describe("fade", () => {
  it("ramps from 0 at the threshold to 1 at threshold * (1 + band)", () => {
    expect(fade(6, 6, 0.25)).toBe(0);
    expect(fade(6.75, 6, 0.25)).toBeCloseTo(0.5, 10);
    expect(fade(7.5, 6, 0.25)).toBe(1);
    expect(fade(5, 6, 0.25)).toBe(0);
    expect(fade(100, 6, 0.25)).toBe(1);
  });

  it("is fully present when the threshold is 0 or less", () => {
    expect(fade(0, 0, 0.25)).toBe(1);
    expect(fade(3, 0, 0.25)).toBe(1);
  });
});

describe("groupNameAlpha", () => {
  const roomy = { midAt: 2, groupNamesUntil: 1.4, fadeBand: 0.25, hysteresis: 0.05 };

  it("holds, cross-fades over the band, and is gone when the band fits below mid", () => {
    expect(groupNameAlpha(1.4, "far", roomy)).toBe(1);
    expect(groupNameAlpha(1.575, "far", roomy)).toBeCloseTo(0.5);
    expect(groupNameAlpha(1.75, "far", roomy)).toBe(0);
  });

  it("is 0 outside far", () => {
    expect(groupNameAlpha(1, "mid", roomy)).toBe(0);
    expect(groupNameAlpha(1, "near", roomy)).toBe(0);
  });

  it("squeezes the cross-fade to end where far can end, so the names never pop at the far/mid change", () => {
    const tight = { ...roomy, midAt: 1.5 };
    // Far is left at 1.5 on the way in and re-entered at 1.425 on the way out.
    expect(groupNameAlpha(1.4, "far", tight)).toBe(1);
    expect(groupNameAlpha(1.4125, "far", tight)).toBeCloseTo(0.5);
    expect(groupNameAlpha(1.425, "far", tight)).toBe(0);
    expect(groupNameAlpha(1.49, "far", tight)).toBe(0);
  });

  it("holds the group names through all of far when there is no room to fade before mid", () => {
    const none = { ...roomy, midAt: 1.4 };
    expect(groupNameAlpha(1.39, "far", none)).toBe(1);
  });
});
