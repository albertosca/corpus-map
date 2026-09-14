import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, regimeFor } from "../src/lod";

const t = { midAt: 2, nearAt: 8 };

describe("regimeFor", () => {
  it("is far below the mid threshold", () => {
    expect(regimeFor(1.99, t)).toBe("far");
  });

  it("is mid exactly at the mid threshold", () => {
    expect(regimeFor(2, t)).toBe("mid");
  });

  it("is near exactly at the near threshold", () => {
    expect(regimeFor(8, t)).toBe("near");
  });

  it("stays near above the near threshold", () => {
    expect(regimeFor(1000, t)).toBe("near");
  });

  it("has ordered defaults", () => {
    expect(DEFAULT_THRESHOLDS.midAt).toBeLessThan(DEFAULT_THRESHOLDS.nearAt);
  });

  it("treats a non-finite scale as far rather than throwing", () => {
    expect(regimeFor(Number.NaN, t)).toBe("far");
  });
});
