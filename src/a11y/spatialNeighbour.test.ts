import { describe, expect, it } from "vitest";
import type { MapNode } from "../shared/spec";
import { nearestTo, neighbourInDirection } from "./spatialNeighbour";

const item = (id: string, horizontal: number, vertical: number): MapNode => ({
  id,
  label: id,
  x: horizontal,
  y: vertical,
  territory: null,
});

describe("neighbourInDirection", () => {
  const centre = item("centre", 0, 0);
  const right = item("right", 10, 0);
  const cross = [centre, right, item("left", -10, 0), item("up", 0, -10), item("down", 0, 10)];

  it.each([
    ["right", "right"],
    ["left", "left"],
    ["up", "up"],
    ["down", "down"],
  ] as const)("goes %s on a cross", (direction, expected) => {
    expect(neighbourInDirection(centre, cross, direction)?.id).toBe(expected);
  });

  it("prefers a candidate inside the 45° cone over a nearer one outside it", () => {
    const nodes = [centre, item("ahead", 10, 0), item("aside", 3, 5)];
    expect(neighbourInDirection(centre, nodes, "right")?.id).toBe("ahead");
  });

  it("charges lateral drift double inside the cone", () => {
    const nodes = [centre, item("straight", 10, 0), item("drift", 6, 4)];
    expect(neighbourInDirection(centre, nodes, "right")?.id).toBe("straight");
  });

  it("falls back to the half-plane when the cone is empty", () => {
    const nodes = [centre, item("aside", 3, 5)];
    expect(neighbourInDirection(centre, nodes, "right")?.id).toBe("aside");
  });

  it("returns null at the edge of the corpus", () => {
    expect(neighbourInDirection(right, cross, "right")).toBeNull();
  });

  it("breaks a tie by id", () => {
    const nodes = [centre, item("zulu", 10, 3), item("mike", 10, -3)];
    expect(neighbourInDirection(centre, nodes, "right")?.id).toBe("mike");
  });

  it("walks a stack of coincident items by id before leaving it", () => {
    const first = item("stack-a", 0, 0);
    const second = item("stack-b", 0, 0);
    const third = item("stack-c", 0, 0);
    const nodes = [third, first, second, item("beyond", 10, 0)];
    expect(neighbourInDirection(first, nodes, "right")?.id).toBe("stack-b");
    expect(neighbourInDirection(second, nodes, "down")?.id).toBe("stack-c");
    expect(neighbourInDirection(third, nodes, "right")?.id).toBe("beyond");
    expect(neighbourInDirection(second, nodes, "left")?.id).toBe("stack-a");
    expect(neighbourInDirection(second, nodes, "up")?.id).toBe("stack-a");
    expect(neighbourInDirection(first, nodes, "left")).toBeNull();
  });

  it("never returns the origin itself", () => {
    expect(neighbourInDirection(centre, [centre], "right")).toBeNull();
  });
});

describe("nearestTo", () => {
  it("returns the item nearest the point, ties by id", () => {
    const nodes = [item("far", 50, 50), item("zulu", 3, 4), item("mike", -3, -4)];
    expect(nearestTo(nodes, 0, 0)?.id).toBe("mike");
  });

  it("returns null for no items", () => {
    expect(nearestTo([], 0, 0)).toBeNull();
  });
});
