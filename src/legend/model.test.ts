import { describe, expect, it } from "vitest";
import type { TerritoryGroup } from "../territories/groups";
import type { LegendEntry } from "./entries";
import { FLAT_GROUP_ID, groupOpen, type LegendGroupView, legendModel } from "./model";

const entry = (id: string, name: string, members: number): LegendEntry => ({ id, name, colour: "#000", members });
const entries = [
  entry("cs.LG", "Machine Learning", 50),
  entry("cs.CV", "Computer Vision", 40),
  entry("cs.RO", "Robotics", 10),
  entry("cs.IT", "Information Theory", 30),
];
const groups: TerritoryGroup[] = [
  { id: "group:cs.LG", name: "Machine Learning +1", members: ["cs.LG", "cs.IT"] },
  { id: "group:cs.CV", name: "Vision", members: ["cs.CV", "cs.RO"] },
];
const none = new Set<string>();

describe("legendModel", () => {
  it("is one flat group when there are no groups", () => {
    const model = legendModel(entries, [], new Set(["cs.LG"]), none, "");
    expect(model.flat).toBe(true);
    expect(model.groups.map((group) => group.id)).toEqual([FLAT_GROUP_ID]);
    expect(model.groups[0]?.rows.map((row) => row.id)).toEqual(["cs.LG", "cs.CV", "cs.RO", "cs.IT"]);
  });

  it("puts on-screen rows first, each part by members", () => {
    const model = legendModel(entries, groups, new Set(["cs.RO", "cs.IT"]), none, "");
    expect(model.groups[0]?.rows.map((row) => [row.id, row.onScreen])).toEqual([
      ["cs.IT", true],
      ["cs.LG", false],
    ]);
    expect(model.groups[1]?.onScreenCount).toBe(1);
  });

  it("filters on name, id and group name, case-insensitively, trimming the filter", () => {
    const byName = legendModel(entries, groups, none, none, "  robot ");
    expect(byName.groups.map((group) => group.rows.map((row) => row.id))).toEqual([["cs.RO"]]);
    const byId = legendModel(entries, groups, none, none, "CS.IT");
    expect(byId.groups.map((group) => group.rows.map((row) => row.id))).toEqual([["cs.IT"]]);
    const byGroup = legendModel(entries, groups, none, none, "vision");
    expect(byGroup.groups.map((group) => group.rows.map((row) => row.id))).toEqual([["cs.CV", "cs.RO"]]);
  });

  it("treats regex characters in the filter literally", () => {
    expect(legendModel(entries, groups, none, none, ".*").groups).toEqual([]);
    expect(legendModel(entries, groups, none, none, "cs.").groups).toHaveLength(2);
  });

  it("reports the shown state of a whole group, whatever the filter hides", () => {
    const mixed = legendModel(entries, groups, none, new Set(["cs.RO"]), "computer");
    expect(mixed.groups[0]?.shown).toBe("mixed");
    expect(mixed.groups[0]?.memberIds).toEqual(["cs.CV", "cs.RO"]);
    const hidden = legendModel(entries, groups, none, new Set(["cs.CV", "cs.RO"]), "");
    expect(hidden.groups[1]?.shown).toBe("none");
    expect(hidden.groups[1]?.rows.every((row) => row.hidden)).toBe(true);
  });
});

describe("groupOpen", () => {
  const [onScreenGroup, offScreenGroup] = legendModel(entries, groups, new Set(["cs.IT"]), none, "").groups;

  it("opens a group with something on screen and collapses one with nothing", () => {
    expect(groupOpen(onScreenGroup as LegendGroupView, "", undefined)).toBe(true);
    expect(groupOpen(offScreenGroup as LegendGroupView, "", undefined)).toBe(false);
  });

  it("keeps the reader's choice", () => {
    expect(groupOpen(onScreenGroup as LegendGroupView, "", false)).toBe(false);
    expect(groupOpen(offScreenGroup as LegendGroupView, "", true)).toBe(true);
  });

  it("opens every matching group while the filter is not blank", () => {
    expect(groupOpen(offScreenGroup as LegendGroupView, "vis", false)).toBe(true);
    expect(groupOpen(offScreenGroup as LegendGroupView, "   ", undefined)).toBe(false);
  });
});
