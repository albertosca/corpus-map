import { describe, expect, it } from "vitest";
import { resolveHeadingLevel } from "./headingLevel";

describe("resolveHeadingLevel", () => {
  it("defaults to h3", () => {
    expect(resolveHeadingLevel(undefined)).toBe("h3");
  });

  it.each([2, 3, 4, 5, 6])("accepts %i", (level) => {
    expect(resolveHeadingLevel(level)).toBe(`h${level}`);
  });

  it.each([1, 7, 2.5, 0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s with a RangeError naming it",
    (level) => {
      expect(() => resolveHeadingLevel(level)).toThrow(RangeError);
      expect(() => resolveHeadingLevel(level)).toThrow(String(level));
    },
  );

  it("rejects a string from untyped JavaScript", () => {
    expect(() => resolveHeadingLevel("3" as unknown as number)).toThrow(RangeError);
  });
});
