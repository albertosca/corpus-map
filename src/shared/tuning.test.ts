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

describe("item label tuning", () => {
  it("defaults the item label to 160 px and 3 lines, and rejects bad values", () => {
    expect(resolveTuning(undefined)).toMatchObject({ itemLabelWidth: 160, itemLabelLines: 3 });
    expect(() => resolveTuning({ itemLabelWidth: 0 })).toThrow(/itemLabelWidth/);
    expect(() => resolveTuning({ itemLabelWidth: Number.POSITIVE_INFINITY })).toThrow(/itemLabelWidth/);
    expect(() => resolveTuning({ itemLabelLines: 0 })).toThrow(/itemLabelLines/);
    expect(() => resolveTuning({ itemLabelLines: 1.5 })).toThrow(/itemLabelLines/);
  });
});

describe("family focus keys (spec family focus §2)", () => {
  it("defaults to a floor of 0.5 and a full share of 1 (measured on the arXiv corpus, plan Task 5)", () => {
    expect([DEFAULT_TUNING.focusFloor, DEFAULT_TUNING.focusFull]).toEqual([0.5, 1]);
  });

  it("rejects a floor not below the full share, a share above 1, a negative floor and NaN", () => {
    expect(() => resolveTuning({ focusFloor: 1 })).toThrow(RangeError);
    expect(() => resolveTuning({ focusFull: 1.1 })).toThrow(RangeError);
    expect(() => resolveTuning({ focusFloor: -0.1 })).toThrow(RangeError);
    expect(() => resolveTuning({ focusFloor: Number.NaN })).toThrow(RangeError);
    expect(() => resolveTuning({ focusFull: Number.NaN })).toThrow(RangeError);
  });

  it("accepts a valid pair", () => {
    expect(resolveTuning({ focusFloor: 0.1, focusFull: 0.9 })).toMatchObject({ focusFloor: 0.1, focusFull: 0.9 });
  });
});
