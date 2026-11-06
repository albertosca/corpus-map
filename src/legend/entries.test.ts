import { describe, expect, it } from "vitest";
import type { Territory } from "../shared/spec";
import { legendCorner, legendEntries, legendMaximumHeight } from "./entries";

const territory = (id: string, members: number): Territory => ({
  id,
  name: `Name ${id}`,
  members: Array.from({ length: members }, (_, index) => `${id}-${index}`),
  centroid: [0, 0],
});

describe("legendEntries", () => {
  it("lists territories by member count, largest first, ties by id, with their colour or the fallback", () => {
    const entries = legendEntries(
      [territory("b", 2), territory("a", 2), territory("c", 5)],
      new Map([["c", "red"]]),
      "grey",
    );
    expect(entries.map((entry) => [entry.id, entry.colour, entry.members])).toEqual([
      ["c", "red", 5],
      ["a", "grey", 2],
      ["b", "grey", 2],
    ]);
  });

  it("lists every territory, most members first, ties by id", () => {
    const territories = Array.from({ length: 12 }, (_, index) => ({
      id: `t${String(index).padStart(2, "0")}`,
      name: `T${index}`,
      members: Array.from({ length: index % 3 }, (_, member) => `m${index}-${member}`),
      centroid: [0, 0] as [number, number],
    }));
    const entries = legendEntries(territories, new Map(), "#888");
    expect(entries).toHaveLength(12);
    expect(entries.map((entry) => entry.members)).toEqual([2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(entries[0]?.id).toBe("t02");
  });

  it("returns nothing for a spec without territories", () => {
    expect(legendEntries([], new Map(), "grey")).toEqual([]);
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

describe("legendMaximumHeight", () => {
  it.each([
    ["top-left", "bottom-left"],
    ["bottom-left", "top-left"],
    ["top-right", "bottom-right"],
    ["bottom-right", "top-right"],
  ] as const)(
    "leaves the minimap's height and a gap free when the legend at %s shares a side with it at %s",
    (legend, minimap) => {
      // 12 above, 12 below, the 110 px minimap and a 12 px gap between them.
      expect(legendMaximumHeight(legend, minimap, 110)).toBe("calc(100% - 146px)");
    },
  );

  it("takes the whole column, less the two margins, when the minimap is on the other side or absent", () => {
    expect(legendMaximumHeight("top-left", "bottom-right", 110)).toBe("calc(100% - 24px)");
    expect(legendMaximumHeight("top-left", "top-right", 110)).toBe("calc(100% - 24px)");
    expect(legendMaximumHeight("top-left", null, 110)).toBe("calc(100% - 24px)");
  });

  it("leaves free the overlay's inset on the legend's own vertical side, and on the other side too (a footer or a sheet at the far edge)", () => {
    const insets = { top: 50, right: 0, bottom: 30, left: 0 };
    // Own side 50 + both margins 24 + the far side's 30; and the mirror.
    expect(legendMaximumHeight("top-left", null, 110, insets)).toBe("calc(100% - 104px)");
    expect(legendMaximumHeight("bottom-right", null, 110, insets)).toBe("calc(100% - 104px)");
  });

  it("clears a far-edge overlay that reaches higher than the minimap, instead of adding the two", () => {
    // The minimap's 122 px (110 + a gap) is the far edge's reserve until an overlay there reaches higher.
    const higher = { top: 0, right: 0, bottom: 198, left: 0 };
    expect(legendMaximumHeight("top-left", "bottom-left", 110, higher)).toBe("calc(100% - 222px)");
    expect(legendMaximumHeight("bottom-left", "top-left", 110, { ...higher, top: 198, bottom: 0 })).toBe(
      "calc(100% - 222px)",
    );
  });

  it("keeps the minimap's own reserve when the far-edge overlay is shorter than it", () => {
    const lower = { top: 0, right: 0, bottom: 50, left: 0 };
    expect(legendMaximumHeight("top-left", "bottom-left", 110, lower)).toBe("calc(100% - 146px)");
  });
});
