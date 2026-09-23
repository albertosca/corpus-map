import { describe, expect, it } from "vitest";
import type { Ring } from "../territories/shape";
import { poleOfInaccessibility, signedDistance } from "./pole";

describe("poleOfInaccessibility", () => {
  it("handles a degenerate ring (all points the same) by returning the centroid", () => {
    const ring: Ring = [
      [50, 50],
      [50, 50],
      [50, 50],
    ];
    const result = poleOfInaccessibility(ring, 0.1);
    expect(result).toEqual([50, 50]);
  });

  it("handles a zero-area ring (line segment) by returning the centroid", () => {
    const ring: Ring = [
      [0, 0],
      [10, 10],
    ];
    const result = poleOfInaccessibility(ring, 0.1);
    expect(result[0]).toBeCloseTo(5, 1);
    expect(result[1]).toBeCloseTo(5, 1);
  });
});

describe("signedDistance", () => {
  it("handles a segment with identical endpoints (coverage: dx/dy both 0)", () => {
    const ring: Ring = [[5, 5]];
    const distance = signedDistance([10, 10], ring);
    expect(distance).toBeLessThan(0);
  });

  it("returns negative distance for points outside the ring", () => {
    const ring: Ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const distance = signedDistance([20, 20], ring);
    expect(distance).toBeLessThan(0);
  });

  it("returns positive distance for points inside the ring", () => {
    const ring: Ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const distance = signedDistance([5, 5], ring);
    expect(distance).toBeGreaterThan(0);
  });
});
