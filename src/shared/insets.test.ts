import { describe, expect, it } from "vitest";
import { NO_INSETS, normaliseInsets, usableArea } from "./insets";

describe("normaliseInsets", () => {
  it("reads a missing side, a negative one and a non-finite one as 0", () => {
    expect(normaliseInsets(undefined)).toEqual(NO_INSETS);
    expect(normaliseInsets({ right: 320 })).toEqual({ top: 0, right: 320, bottom: 0, left: 0 });
    expect(normaliseInsets({ top: -5, right: Number.NaN, bottom: Number.POSITIVE_INFINITY, left: 12 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 12,
    });
  });

  it("returns the same object for equal sides, so a fresh literal every render is not a change", () => {
    expect(normaliseInsets({})).toBe(NO_INSETS);
  });
});

describe("usableArea", () => {
  it("is the box less its insets", () => {
    expect(usableArea(400, 300, { top: 50, right: 100, bottom: 0, left: 20 })).toEqual({
      left: 20,
      top: 50,
      width: 280,
      height: 250,
    });
  });

  it("never has a negative size when the insets cover the whole box", () => {
    expect(usableArea(400, 300, { top: 200, right: 300, bottom: 200, left: 300 })).toEqual({
      left: 300,
      top: 200,
      width: 0,
      height: 0,
    });
  });
});
