import { describe, expect, it } from "vitest";
import { toMatchSet } from "./matchSet";

describe("toMatchSet", () => {
  it("reads undefined and null as no search", () => {
    expect(toMatchSet(undefined)).toBeUndefined();
    expect(toMatchSet(null)).toBeUndefined();
  });

  it("collapses the duplicates of an array", () => {
    const set = toMatchSet(["a", "b", "a"]);
    expect([...(set ?? [])]).toEqual(["a", "b"]);
  });

  it("keeps an empty array as an empty set, which is a search with no match", () => {
    expect(toMatchSet([])?.size).toBe(0);
  });

  it("hands a set back as it is", () => {
    const given = new Set(["a"]);
    expect(toMatchSet(given)).toBe(given);
  });
});
