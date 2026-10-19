import { describe, expect, it } from "vitest";
import { SpecError, validateSpec } from "./spec";

const minimal = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["n1"], centroid: [0, 0] }],
  nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "t1" }],
};

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("expected at least one item");
  return item;
}

describe("validateSpec", () => {
  it("accepts a minimal spec", () => {
    expect(validateSpec(minimal).nodes).toHaveLength(1);
  });

  it("accepts a node with no territory", () => {
    const spec = { version: "1", territories: [], nodes: [{ id: "n1", label: "One", x: 1, y: 2, territory: null }] };
    expect(first(validateSpec(spec).nodes).territory).toBeNull();
  });

  it("accepts a spec where every node is un-territoried", () => {
    const spec = {
      version: "1",
      territories: [],
      nodes: [
        { id: "n1", label: "One", x: 0, y: 0, territory: null },
        { id: "n2", label: "Two", x: 1, y: 1, territory: null },
      ],
    };
    expect(validateSpec(spec).territories).toHaveLength(0);
  });

  it("rejects a territory member that does not exist", () => {
    const spec = { ...minimal, territories: [{ id: "t1", name: "North", members: ["ghost"], centroid: [0, 0] }] };
    expect(() => validateSpec(spec)).toThrow(/territories\[0\].members\[0\].*ghost/);
  });

  it("rejects a node pointing at a territory that does not exist", () => {
    const spec = { version: "1", territories: [], nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "gone" }] };
    expect(() => validateSpec(spec)).toThrow(/nodes\[0\].territory.*gone/);
  });

  it("rejects a node listed twice in one territory's members, naming the second occurrence", () => {
    const spec = {
      version: "1",
      territories: [{ id: "t1", name: "North", members: ["n1", "n1"], centroid: [0, 0] }],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "t1" }],
    };
    expect(() => validateSpec(spec)).toThrow(new SpecError("territories[0].members[1]: node n1 is listed twice"));
  });

  it("rejects duplicate node ids", () => {
    const spec = {
      version: "1",
      territories: [],
      nodes: [
        { id: "dup", label: "A", x: 0, y: 0, territory: null },
        { id: "dup", label: "B", x: 1, y: 1, territory: null },
      ],
    };
    expect(() => validateSpec(spec)).toThrow(/duplicate.*dup/i);
  });

  it("rejects a non-finite coordinate", () => {
    const spec = {
      version: "1",
      territories: [],
      nodes: [{ id: "n1", label: "One", x: Number.NaN, y: 0, territory: null }],
    };
    expect(() => validateSpec(spec)).toThrow(/nodes\[0\].x/);
  });

  it("preserves meta untouched", () => {
    const meta = { anything: { nested: [1, 2, 3] } };
    const spec = {
      version: "1",
      territories: [],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: null, meta }],
    };
    expect(first(validateSpec(spec).nodes).meta).toEqual(meta);
  });

  it("rejects a NaN centroid component, naming the path", () => {
    const spec = { ...minimal, territories: [{ ...minimal.territories[0], centroid: [Number.NaN, 0] }] };
    expect(() => validateSpec(spec)).toThrow(SpecError);
    expect(() => validateSpec(spec)).toThrow(/territories\[0\]\.centroid\[0\]/);
  });

  it("rejects a string centroid", () => {
    const asString = { ...minimal, territories: [{ ...minimal.territories[0], centroid: "0,0" }] };
    expect(() => validateSpec(asString)).toThrow(/territories\[0\]\.centroid/);
    const stringComponent = { ...minimal, territories: [{ ...minimal.territories[0], centroid: [0, "0"] }] };
    expect(() => validateSpec(stringComponent)).toThrow(/territories\[0\]\.centroid\[1\]/);
  });

  it("rejects a boundary containing a NaN", () => {
    const boundary = [
      [0, 0],
      [1, Number.NaN],
      [1, 1],
    ];
    const spec = { ...minimal, territories: [{ ...minimal.territories[0], boundary }] };
    expect(() => validateSpec(spec)).toThrow(/territories\[0\]\.boundary\[1\]\[1\]/);
  });

  it("rejects non-array territories with a SpecError, not a TypeError", () => {
    const spec = { version: "1", territories: {}, nodes: [] };
    expect(() => validateSpec(spec)).toThrow(SpecError);
    expect(() => validateSpec(spec)).toThrow(/^territories: expected an array/);
  });

  it("rejects non-array nodes and a non-object spec with a SpecError", () => {
    expect(() => validateSpec({ version: "1", territories: [], nodes: "n1" })).toThrow(/^nodes: expected an array/);
    expect(() => validateSpec(null)).toThrow(SpecError);
    expect(() => validateSpec("spec")).toThrow(/^spec: expected an object/);
  });

  it("rejects a node claiming a territory whose members omit it", () => {
    const spec = {
      version: "1",
      territories: [{ id: "t1", name: "North", members: [], centroid: [0, 0] }],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "t1" }],
    };
    expect(() => validateSpec(spec)).toThrow(/nodes\[0\]\.territory.*t1.*n1/);
  });

  it("rejects a member whose node points at a different territory", () => {
    const spec = {
      version: "1",
      territories: [
        { id: "t1", name: "North", members: ["n1"], centroid: [0, 0] },
        { id: "t2", name: "South", members: ["n1"], centroid: [5, 5] },
      ],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "t1" }],
    };
    expect(() => validateSpec(spec)).toThrow(/territories\[1\]\.members\[0\].*n1.*t1/);
  });

  it("rejects a member whose node claims no territory", () => {
    const spec = {
      version: "1",
      territories: [{ id: "t1", name: "North", members: ["n1"], centroid: [0, 0] }],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: null }],
    };
    expect(() => validateSpec(spec)).toThrow(/territories\[0\]\.members\[0\].*null/);
  });

  it("rejects numeric ids and non-string labels and names", () => {
    const numericNode = {
      version: "1",
      territories: [],
      nodes: [{ id: 1, label: "One", x: 0, y: 0, territory: null }],
    };
    expect(() => validateSpec(numericNode)).toThrow(/nodes\[0\]\.id: expected a string, got number/);
    const numericTerritory = { ...minimal, territories: [{ ...minimal.territories[0], id: 7 }] };
    expect(() => validateSpec(numericTerritory)).toThrow(/territories\[0\]\.id/);
    const badLabel = { version: "1", territories: [], nodes: [{ id: "n1", label: 1, x: 0, y: 0, territory: null }] };
    expect(() => validateSpec(badLabel)).toThrow(/nodes\[0\]\.label/);
    const badName = { ...minimal, territories: [{ ...minimal.territories[0], name: undefined }] };
    expect(() => validateSpec(badName)).toThrow(/territories\[0\]\.name/);
  });

  it("rejects a non-string territory reference and a non-string member id", () => {
    const badReference = {
      version: "1",
      territories: [],
      nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: 3 }],
    };
    expect(() => validateSpec(badReference)).toThrow(/nodes\[0\]\.territory: expected a string/);
    const badMember = { ...minimal, territories: [{ ...minimal.territories[0], members: [1] }] };
    expect(() => validateSpec(badMember)).toThrow(/territories\[0\]\.members\[0\]: expected a string/);
  });

  it("rejects a duplicate territory id, a non-array members list and a non-object entry", () => {
    const dup = {
      ...minimal,
      territories: [minimal.territories[0], { id: "t1", name: "Again", members: [], centroid: [1, 1] }],
    };
    expect(() => validateSpec(dup)).toThrow(/territories\[1\]\.id: duplicate/);
    const members = { ...minimal, territories: [{ ...minimal.territories[0], members: "n1" }] };
    expect(() => validateSpec(members)).toThrow(/territories\[0\]\.members: expected an array/);
    expect(() => validateSpec({ ...minimal, nodes: [null] })).toThrow(/nodes\[0\]: expected an object/);
    expect(() => validateSpec({ ...minimal, territories: [[]] })).toThrow(/territories\[0\]: expected an object/);
  });

  it("accepts a well-formed boundary", () => {
    const boundary = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const spec = { ...minimal, territories: [{ ...minimal.territories[0], boundary }] };
    expect(first(validateSpec(spec).territories).boundary).toHaveLength(3);
  });

  describe("territory colour", () => {
    const withColour = (colour: unknown) => ({
      version: "1",
      territories: [{ id: "t1", name: "One", members: ["a"], centroid: [0, 0], colour }],
      nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1" }],
    });

    it("accepts the three supported notations", () => {
      for (const colour of ["#003c96", "rgb(1,2,3)", "rgba(1,2,3,0.5)"]) {
        expect(validateSpec(withColour(colour)).territories[0]?.colour).toBe(colour);
      }
    });

    it("accepts a territory with no colour", () => {
      const { colour: _unused, ...territory } = withColour("#000000").territories[0] as Record<string, unknown>;
      expect(() => validateSpec({ ...withColour("#000000"), territories: [territory] })).not.toThrow();
    });

    it("rejects an unsupported notation, naming the path", () => {
      expect(() => validateSpec(withColour("tomato"))).toThrow(SpecError);
      expect(() => validateSpec(withColour("tomato"))).toThrow(/^territories\[0\]\.colour: /);
    });

    it("rejects a colour that is not a string", () => {
      expect(() => validateSpec(withColour(42))).toThrow(/^territories\[0\]\.colour: expected a string/);
    });
  });
});
