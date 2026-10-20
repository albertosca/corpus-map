import { describe, expect, it } from "vitest";
import type { MapSpec, Territory } from "../shared/spec";
import {
  derivedGroupCount,
  deriveTerritoryGroups,
  MAXIMUM_DERIVED_TERRITORIES,
  MINIMUM_DERIVED_TERRITORIES,
} from "./groups";

function territory(id: string, centroid: [number, number], members = 1, group?: string): Territory {
  return {
    id,
    name: `Name ${id}`,
    members: Array.from({ length: members }, (_, index) => `${id}-${index}`),
    centroid,
    ...(group === undefined ? {} : { group }),
  };
}

function specOf(territories: Territory[]): MapSpec {
  return { version: "1", territories, nodes: [] };
}

const clustered = [
  ...["a1", "a2", "a3", "a4"].map((id, index) => territory(id, [index, 0], 10 - index)),
  ...["b1", "b2", "b3", "b4"].map((id, index) => territory(id, [1000 + index, 0], 5)),
  ...["c1", "c2", "c3", "c4"].map((id, index) => territory(id, [0, 1000 + index], 1)),
];

describe("derivedGroupCount", () => {
  it("is round(sqrt(n)) clamped to [3, 8]", () => {
    expect([2, 10, 16, 38, 100].map(derivedGroupCount)).toEqual([3, 3, 4, 6, 8]);
  });
});

describe("deriveTerritoryGroups, derived", () => {
  it("derives nothing below MINIMUM_DERIVED_TERRITORIES", () => {
    const few = clustered.slice(0, MINIMUM_DERIVED_TERRITORIES - 1);
    expect(deriveTerritoryGroups(specOf(few))).toEqual([]);
  });

  it("clusters contiguous centroids, names after the largest member, orders by size", () => {
    expect(deriveTerritoryGroups(specOf(clustered))).toEqual([
      { id: "group:a1", name: "Name a1 +3", members: ["a1", "a2", "a3", "a4"] },
      { id: "group:b1", name: "Name b1 +3", members: ["b1", "b2", "b3", "b4"] },
      { id: "group:c1", name: "Name c1 +3", members: ["c1", "c2", "c3", "c4"] },
    ]);
  });

  it("does not depend on the order of the territories", () => {
    const shuffled = [...clustered.slice(7), ...clustered.slice(0, 7)].reverse();
    expect(deriveTerritoryGroups(specOf(shuffled))).toEqual(deriveTerritoryGroups(specOf(clustered)));
  });

  it("names a single-member group after its member alone", () => {
    const near = Array.from({ length: 9 }, (_, index) => territory(`near${index}`, [index, 0]));
    const groups = deriveTerritoryGroups(specOf([...near, territory("far", [10_000, 0])]));
    expect(groups.find((group) => group.members.includes("far"))).toEqual({
      id: "group:far",
      name: "Name far",
      members: ["far"],
    });
  });

  it("identical centroids: deterministic, every territory in exactly one group", () => {
    const stacked = Array.from({ length: 10 }, (_, index) => territory(`t${index}`, [5, 5]));
    const groups = deriveTerritoryGroups(specOf(stacked));
    expect(groups).toHaveLength(3);
    expect(groups.flatMap((group) => group.members).sort()).toEqual(stacked.map((item) => item.id).sort());
    expect(deriveTerritoryGroups(specOf([...stacked].reverse()))).toEqual(groups);
  });

  it("still derives at MAXIMUM_DERIVED_TERRITORIES and derives nothing above it", () => {
    const grid = (count: number) =>
      Array.from({ length: count }, (_, index) => territory(`t${index}`, [index % 20, Math.floor(index / 20)]));
    expect(deriveTerritoryGroups(specOf(grid(MAXIMUM_DERIVED_TERRITORIES)))).toHaveLength(8);
    expect(deriveTerritoryGroups(specOf(grid(MAXIMUM_DERIVED_TERRITORIES + 1)))).toEqual([]);
  });
});

describe("deriveTerritoryGroups, supplied", () => {
  it("groups by the supplied name, the rest under Other, with no derivation even below 10", () => {
    const groups = deriveTerritoryGroups(
      specOf([
        territory("cv", [0, 0], 5, "Vision"),
        territory("ro", [500, 500], 3, "Vision"),
        territory("lone", [9, 9], 1),
      ]),
    );
    expect(groups).toEqual([
      { id: "group:Vision", name: "Vision", members: ["cv", "ro"] },
      { id: "group:Other", name: "Other", members: ["lone"] },
    ]);
  });
});
