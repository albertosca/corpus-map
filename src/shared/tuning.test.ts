import { describe, expect, it } from "vitest";
import { DEFAULT_TUNING, resolveTuning } from "./tuning";

describe("groupNamesUntil", () => {
  it("defaults to 1.4", () => {
    expect(DEFAULT_TUNING.groupNamesUntil).toBe(1.4);
    expect(resolveTuning(undefined).groupNamesUntil).toBe(1.4);
  });

  it("accepts any finite value >= 1", () => {
    expect(resolveTuning({ groupNamesUntil: 1 }).groupNamesUntil).toBe(1);
    expect(resolveTuning({ groupNamesUntil: 9 }).groupNamesUntil).toBe(9);
  });

  it("rejects a value below 1 or not finite", () => {
    for (const groupNamesUntil of [0.99, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveTuning({ groupNamesUntil })).toThrow(
        new RangeError(`tuning.groupNamesUntil must be a finite number >= 1, got ${groupNamesUntil}`),
      );
    }
  });
});

describe("edgesPerNode (spec slice E §6)", () => {
  it("defaults to 3 and accepts 0", () => {
    expect(DEFAULT_TUNING.edgesPerNode).toBe(3);
    expect(resolveTuning({ edgesPerNode: 0 }).edgesPerNode).toBe(0);
  });

  it("rejects a negative, fractional or non-finite value", () => {
    for (const edgesPerNode of [-1, 1.5, Number.NaN]) {
      expect(() => resolveTuning({ edgesPerNode })).toThrow(
        new RangeError(`tuning.edgesPerNode must be an integer >= 0, got ${edgesPerNode}`),
      );
    }
  });
});
