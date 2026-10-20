import { describe, expect, it } from "vitest";
import type { Territory } from "../shared/spec";
import { legendCorner, legendEntries } from "./entries";

const territory = (id: string, members: number): Territory => ({
  id,
  name: `Name ${id}`,
  members: Array.from({ length: members }, (_, index) => `${id}-${index}`),
  centroid: [0, 0],
});

describe("legendEntries", () => {
  it("lists territories by member count, largest first, ties by id, with their colour or the fallback", () => {
    const { entries, more } = legendEntries(
      [territory("b", 2), territory("a", 2), territory("c", 5)],
      new Map([["c", "red"]]),
      "grey",
    );
    expect(entries.map((entry) => [entry.id, entry.colour, entry.members])).toEqual([
      ["c", "red", 5],
      ["a", "grey", 2],
      ["b", "grey", 2],
    ]);
    expect(more).toBe(0);
  });

  it("stops at the limit and counts the rest", () => {
    const territories = Array.from({ length: 10 }, (_, index) => territory(`t${index}`, index));
    const { entries, more } = legendEntries(territories, new Map(), "grey");
    expect(entries).toHaveLength(8);
    expect(more).toBe(2);
  });

  it("returns nothing for a spec without territories", () => {
    expect(legendEntries([], new Map(), "grey")).toEqual({ entries: [], more: 0 });
  });
});

describe("legendCorner", () => {
  it.each([
    ["top-left", "top-right"],
    ["top-right", "bottom-right"],
    ["bottom-right", "bottom-left"],
    ["bottom-left", "top-left"],
  ] as const)("moves clockwise from %s when the minimap is there", (corner, next) => {
    expect(legendCorner(corner, corner)).toBe(next);
  });

  it("stays where asked when the minimap is elsewhere or absent", () => {
    expect(legendCorner("top-left", "bottom-left")).toBe("top-left");
    expect(legendCorner("top-left", null)).toBe("top-left");
  });
});
