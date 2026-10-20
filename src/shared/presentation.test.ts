import { describe, expect, it } from "vitest";
import { resolvePresentation } from "./presentation";

describe("resolvePresentation", () => {
  it("is guided at far and dense at mid and near when automatic", () => {
    expect(resolvePresentation("auto", "far")).toBe("guided");
    expect(resolvePresentation("auto", "mid")).toBe("dense");
    expect(resolvePresentation("auto", "near")).toBe("dense");
  });

  it("locks a fixed presentation at every regime", () => {
    for (const regime of ["far", "mid", "near"] as const) {
      expect(resolvePresentation("guided", regime)).toBe("guided");
      expect(resolvePresentation("dense", regime)).toBe("dense");
    }
  });
});
