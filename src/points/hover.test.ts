import { describe, expect, it } from "vitest";
import { nearestWithin } from "./hover";

const pts = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 10, y: 0 },
];

describe("metric 10: hover picks the nearest point within the radius", () => {
  it("picks the nearer of two points", () => {
    expect(nearestWithin(pts, 6, 0, 12)?.id).toBe("b");
    expect(nearestWithin(pts, 4, 0, 12)?.id).toBe("a");
  });

  it("picks nothing beyond the radius", () => {
    expect(nearestWithin(pts, 30, 0, 12)).toBeNull();
    expect(nearestWithin([{ id: "a", x: 0, y: 0 }], 12.01, 0, 12)).toBeNull();
  });

  it("gives ties to the earlier point", () => {
    expect(nearestWithin(pts, 5, 0, 12)?.id).toBe("a");
  });

  it("finds nothing in an empty list", () => {
    expect(nearestWithin([], 0, 0, 12)).toBeNull();
  });
});
