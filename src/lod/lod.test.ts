import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type LodThresholds, resolveThresholds } from "./lod";

describe("DEFAULT_THRESHOLDS", () => {
  it("is fit-relative and ordered, so every corpus opens in the far regime", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ midAt: 2, nearAt: 4.5 });
    expect(DEFAULT_THRESHOLDS.midAt).toBeLessThan(DEFAULT_THRESHOLDS.nearAt);
  });
});

describe("resolveThresholds", () => {
  it("defaults to DEFAULT_THRESHOLDS when undefined", () => {
    expect(resolveThresholds(undefined)).toEqual(DEFAULT_THRESHOLDS);
  });

  it("passes a valid, explicit thresholds object through unchanged", () => {
    const thresholds = { midAt: 1, nearAt: 3 };
    expect(resolveThresholds(thresholds)).toEqual(thresholds);
  });

  it("accepts { midAt: 0, nearAt: 0 } (relied on by tests that want everything visible immediately)", () => {
    expect(() => resolveThresholds({ midAt: 0, nearAt: 0 })).not.toThrow();
  });

  it("accepts the boundary { midAt: 64, nearAt: 64 }", () => {
    expect(() => resolveThresholds({ midAt: 64, nearAt: 64 })).not.toThrow();
  });

  it.each<[string, LodThresholds]>([
    ["midAt < 0", { midAt: -0.01, nearAt: 6 }],
    ["midAt: NaN", { midAt: Number.NaN, nearAt: 6 }],
    ["midAt: Infinity", { midAt: Number.POSITIVE_INFINITY, nearAt: 6 }],
    ["midAt > 64", { midAt: 65, nearAt: 65 }],
    ["nearAt < 0 (probed: opens near immediately)", { midAt: 6, nearAt: -1 }],
    ["nearAt: NaN (probed: sticks at far forever)", { midAt: Number.NaN, nearAt: Number.NaN }],
    ["nearAt: Infinity", { midAt: 2, nearAt: Number.POSITIVE_INFINITY }],
    ["nearAt > 64 (probed: near becomes unreachable)", { midAt: 0, nearAt: 65 }],
    ["midAt > nearAt", { midAt: 10, nearAt: 5 }],
  ])("rejects invalid thresholds: %s", (_, invalid) => {
    expect(() => resolveThresholds(invalid)).toThrow(RangeError);
    expect(() => resolveThresholds(invalid)).toThrow(/thresholds\./);
  });
});
