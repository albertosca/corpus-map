import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "./lod";

describe("DEFAULT_THRESHOLDS", () => {
  it("is fit-relative and ordered, so every corpus opens in the far regime", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ midAt: 2, nearAt: 6 });
    expect(DEFAULT_THRESHOLDS.midAt).toBeLessThan(DEFAULT_THRESHOLDS.nearAt);
  });
});
