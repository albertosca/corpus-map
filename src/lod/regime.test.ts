import { describe, expect, it } from "vitest";
import type { Regime } from "./lod";
import { fade, regimeAt } from "./regime";

const t = { midAt: 2, nearAt: 6 };

describe("regimeAt", () => {
  it("enters a finer regime at its threshold", () => {
    expect(regimeAt(1.99, t, "far", 0.05)).toBe("far");
    expect(regimeAt(2, t, "far", 0.05)).toBe("mid");
    expect(regimeAt(6, t, "mid", 0.05)).toBe("near");
    expect(regimeAt(60, t, "far", 0.05)).toBe("near");
  });

  it("leaves a regime only a hysteresis fraction below its threshold", () => {
    expect(regimeAt(1.91, t, "mid", 0.05)).toBe("mid");
    expect(regimeAt(1.89, t, "mid", 0.05)).toBe("far");
    expect(regimeAt(5.8, t, "near", 0.05)).toBe("near");
    expect(regimeAt(5.6, t, "near", 0.05)).toBe("mid");
    expect(regimeAt(1, t, "near", 0.05)).toBe("far");
  });

  it.each([2, 6])("metric 12: ±3%% oscillation around %s never flips the regime", (threshold) => {
    let regime: Regime = regimeAt(threshold * 1.03, t, "far", 0.05);
    let flips = 0;
    for (let i = 0; i < 100; i += 1) {
      const next = regimeAt(threshold * (i % 2 === 0 ? 0.97 : 1.03), t, regime, 0.05);
      if (next !== regime) flips += 1;
      regime = next;
    }
    expect(flips).toBe(0);
  });

  it("lands in near for fitScale * nearAt / fitScale over 20,000 fitted scales", () => {
    let misses = 0;
    for (let k = 0; k < 5000; k += 1) {
      const fit = 0.001 + ((k * 7.3) % 997.1);
      for (const nearAt of [6, 12.5, 100, 3.3]) {
        if (regimeAt((fit * nearAt) / fit, { midAt: nearAt / 3, nearAt }, "far", 0) !== "near") misses += 1;
      }
    }
    expect(misses).toBe(0);
  });

  it("treats a non-finite ratio as far", () => {
    expect(regimeAt(Number.NaN, t, "near", 0.05)).toBe("far");
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
