import { describe, expect, it } from "vitest";
import { VISITED_MAXIMUM_BOOST, VISITED_STEPS, visitedFactor } from "./visitedFactor";

// Spec 2026-11-06-far-visited-design.md §2: the visited share rounds to the nearest quarter and the fill alpha is
// multiplied by 1 + 0.5 * step, so 0 is today's alpha and 1 is 1.5 times it.

describe("visitedFactor", () => {
  it("states its steps and its boost", () => {
    expect(VISITED_STEPS).toBe(4);
    expect(VISITED_MAXIMUM_BOOST).toBe(0.5);
  });

  it("leaves a territory with no visited node at today's alpha", () => {
    expect(visitedFactor(0)).toBe(1);
  });

  it("rounds the share to the nearest quarter, so a share under an eighth is still 0", () => {
    expect(visitedFactor(0.124)).toBe(1);
    expect(visitedFactor(0.125)).toBeCloseTo(1 + 0.5 * 0.25, 12);
    expect(visitedFactor(0.5)).toBeCloseTo(1.25, 12);
    expect(visitedFactor(0.75)).toBeCloseTo(1.375, 12);
  });

  it("reaches the ceiling when every node is visited", () => {
    expect(visitedFactor(1)).toBeCloseTo(1.5, 12);
  });
});
