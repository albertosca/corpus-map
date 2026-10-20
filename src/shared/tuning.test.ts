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
