import { describe, expect, it } from "vitest";
import { familyFocus, levelsOf } from "./familyFocus";

const options = { focusFloor: 0.25, focusFull: 0.6 };
const counts = (entries: Array<[string, number]>) => new Map(entries);

describe("familyFocus (spec family focus §2)", () => {
  it("gives the largest family 1 and a tie 1 each", () => {
    expect(
      familyFocus(
        counts([
          ["a", 10],
          ["b", 2],
        ]),
        options,
      ).get("a"),
    ).toBe(1);
    const tied = familyFocus(
      counts([
        ["a", 7],
        ["b", 7],
      ]),
      options,
    );
    expect([tied.get("a"), tied.get("b")]).toEqual([1, 1]);
  });

  it("gives a lone family 1", () => {
    expect(familyFocus(counts([["a", 3]]), options).get("a")).toBe(1);
  });

  it("keeps every family at 1 when nothing is on screen", () => {
    const weights = familyFocus(
      counts([
        ["a", 0],
        ["b", 0],
      ]),
      options,
    );
    expect([weights.get("a"), weights.get("b")]).toEqual([1, 1]);
  });

  it("gives a family with no items 0 beside a positive maximum", () => {
    expect(
      familyFocus(
        counts([
          ["a", 5],
          ["b", 0],
        ]),
        options,
      ).get("b"),
    ).toBe(0);
  });

  it("is 0 at or below the floor and 1 at or above the full share", () => {
    const weights = familyFocus(
      counts([
        ["a", 100],
        ["floor", 25],
        ["full", 60],
        ["above", 90],
      ]),
      options,
    );
    expect([weights.get("floor"), weights.get("full"), weights.get("above")]).toEqual([0, 1, 1]);
  });

  it("is strictly between 0 and 1 between the floor and the full share, and monotonic", () => {
    const weights = familyFocus(
      counts([
        ["a", 100],
        ["low", 35],
        ["high", 50],
      ]),
      options,
    );
    const low = weights.get("low") as number;
    const high = weights.get("high") as number;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(1);
    expect(high).toBeGreaterThan(low);
  });

  it("never returns NaN", () => {
    for (const total of [0, 1, 1e9]) {
      for (const weight of familyFocus(
        counts([
          ["a", total],
          ["b", total / 3],
        ]),
        options,
      ).values()) {
        expect(Number.isNaN(weight)).toBe(false);
      }
    }
  });

  it("leaves an empty map empty", () => {
    expect(familyFocus(new Map(), options).size).toBe(0);
  });
});

describe("levelsOf", () => {
  it("puts everything on the family at group alpha 1, whatever the weight", () => {
    expect(levelsOf(1, 0)).toEqual({ leaf: 0, family: 1 });
    expect(levelsOf(1, 1)).toEqual({ leaf: 0, family: 1 });
  });

  it("puts everything on the leaves at group alpha 0 and weight 1", () => {
    expect(levelsOf(0, 1)).toEqual({ leaf: 1, family: 0 });
  });

  it("puts everything on the family at group alpha 0 and weight 0", () => {
    expect(levelsOf(0, 0)).toEqual({ leaf: 0, family: 1 });
  });

  it("composes the cross-fade with the weight", () => {
    expect(levelsOf(0.5, 0.5)).toEqual({ leaf: 0.25, family: 0.75 });
  });
});
