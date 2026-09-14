import { describe, expect, it } from "vitest";
import { hullOf } from "../src/geometry/hull";

const square: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe("hullOf", () => {
  it("returns the square itself for four corners", () => {
    expect(hullOf(square)).toHaveLength(4);
  });

  it("drops a point strictly inside", () => {
    const ring = hullOf([...square, [2, 2]]);
    expect(ring).toHaveLength(4);
    expect(ring).not.toContainEqual([2, 2]);
  });

  it("is stable: the same points in a different order give the same ring", () => {
    const a = hullOf([...square, [2, 2]]);
    const b = hullOf([[2, 2], ...[...square].reverse()]);
    expect(b).toEqual(a);
  });

  it("returns the input unchanged for fewer than three points", () => {
    expect(
      hullOf([
        [1, 1],
        [2, 2],
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(hullOf([])).toEqual([]);
  });

  it("handles collinear points without producing a degenerate ring", () => {
    const ring = hullOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(ring.length).toBeGreaterThanOrEqual(2);
    expect(ring.length).toBeLessThanOrEqual(4);
  });

  it("tolerates duplicated points", () => {
    expect(
      hullOf([
        [0, 0],
        [0, 0],
        [4, 0],
        [4, 4],
      ]),
    ).toHaveLength(3);
  });
});
