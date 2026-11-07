import { describe, expect, it } from "vitest";
import { resolveNameStyle, styledName } from "./nameStyle";

describe("resolveNameStyle", () => {
  it("gives today's behaviour for an absent or empty style", () => {
    expect(resolveNameStyle(undefined)).toEqual({ uppercase: false, spacing: undefined });
    expect(resolveNameStyle({})).toEqual({ uppercase: false, spacing: undefined });
  });

  it("keeps a valid style, including a spacing of 0", () => {
    expect(resolveNameStyle({ uppercase: true, spacing: 0.6 })).toEqual({ uppercase: true, spacing: 0.6 });
    expect(resolveNameStyle({ spacing: 0 })).toEqual({ uppercase: false, spacing: 0 });
  });

  it("throws a RangeError for a spacing that is negative or not finite", () => {
    for (const spacing of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => resolveNameStyle({ spacing })).toThrow(RangeError);
  });
});

describe("styledName", () => {
  it("upper-cases when asked and leaves the name alone otherwise", () => {
    expect(styledName("Vision", true)).toBe("VISION");
    expect(styledName("Vision", false)).toBe("Vision");
  });

  it("uses the transformed length where upper case changes it, and leaves empty, caseless and upper-case names as they are", () => {
    expect(styledName("straße", true)).toBe("STRASSE");
    expect(styledName("", true)).toBe("");
    expect(styledName("日本語", true)).toBe("日本語");
    expect(styledName("ALREADY", true)).toBe("ALREADY");
  });
});
