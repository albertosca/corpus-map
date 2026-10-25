import { describe, expect, it } from "vitest";
import { leafTerritories, SpecError, validateSpec } from "./spec";

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

  describe("territory group", () => {
    const withGroup = (group: unknown) => ({
      version: "1",
      territories: [{ id: "t1", name: "One", members: ["a"], centroid: [0, 0], group }],
      nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1" }],
    });

    it("accepts a non-empty string", () => {
      expect(validateSpec(withGroup("Vision")).territories[0]?.group).toBe("Vision");
    });

    it("rejects an empty or blank string, and a non-string, naming the field", () => {
      for (const group of ["", "   ", 3]) {
        expect(() => validateSpec(withGroup(group))).toThrow(SpecError);
        expect(() => validateSpec(withGroup(group))).toThrow(/\.group/);
      }
    });
  });
});

const nested = {
  version: "1",
  territories: [
    { id: "p", name: "Parent", members: [] as string[], centroid: [0, 0] },
    { id: "a", name: "A", members: ["n1"], centroid: [0, 0], parent: "p" },
    { id: "b", name: "B", members: ["n2"], centroid: [1, 1], parent: "p" },
  ],
  nodes: [
    { id: "n1", label: "One", x: 0, y: 0, territory: "a" },
    { id: "n2", label: "Two", x: 1, y: 1, territory: "b" },
  ],
};

type Mutable = { territories: Array<Record<string, unknown>>; nodes: Array<Record<string, unknown>> };
const copy = () => structuredClone(nested) as unknown as Mutable;

describe("validateSpec: parents", () => {
  it("accepts a parent with children and no members", () => {
    expect(validateSpec(nested).territories).toHaveLength(3);
  });
  it("rejects an unknown parent", () => {
    const spec = copy();
    first(spec.territories.slice(1)).parent = "ghost";
    expect(() => validateSpec(spec)).toThrow(/territories\[1\]\.parent: unknown territory ghost/);
  });
  it("rejects a territory that is its own parent", () => {
    const spec = copy();
    first(spec.territories.slice(1)).parent = "a";
    expect(() => validateSpec(spec)).toThrow(/territories\[1\]\.parent: a territory cannot be its own parent/);
  });
  it("rejects a parent that is not a string", () => {
    const spec = copy();
    first(spec.territories.slice(1)).parent = 7;
    expect(() => validateSpec(spec)).toThrow(/territories\[1\]\.parent: expected a string/);
  });
  it("rejects a third level", () => {
    const spec = copy();
    first(spec.territories).parent = "a";
    expect(() => validateSpec(spec)).toThrow(/parent p itself has a parent; two levels only/);
  });
  it("rejects a parent that lists members", () => {
    const spec = copy();
    first(spec.territories).members = ["n1"];
    expect(() => validateSpec(spec)).toThrow(
      /territories\[0\]\.members: a parent lists no members of its own; its members are its children's/,
    );
  });
  it("rejects a node that points at a parent", () => {
    const spec = copy();
    first(spec.nodes).territory = "p";
    expect(() => validateSpec(spec)).toThrow(/nodes\[0\]\.territory: p is a parent; a node belongs to a leaf/);
  });
  it("rejects parent and group in one spec", () => {
    const spec = copy();
    first(spec.territories.slice(2)).group = "G";
    expect(() => validateSpec(spec)).toThrow(/parent and group cannot be mixed in one spec/);
  });
  it("lists the leaves in spec order", () => {
    expect(leafTerritories(validateSpec(nested)).map((territory) => territory.id)).toEqual(["a", "b"]);
  });
});

describe("validateSpec: edges", () => {
  const withEdges = (edges: unknown) => ({ ...structuredClone(nested), edges });
  it("accepts edges and ignores extra fields", () => {
    const spec = validateSpec(
      withEdges([{ source: "n1", target: "n2", weight: 0.5, reason: "x", crosses_territory: true }]),
    );
    expect(spec.edges).toHaveLength(1);
  });
  it.each([
    [[{ source: "ghost", target: "n1" }], /edges\[0\]\.source: unknown node ghost/],
    [[{ source: "n1", target: "ghost" }], /edges\[0\]\.target: unknown node ghost/],
    [[{ source: "n1", target: "n1" }], /edges\[0\]: an edge joins two different nodes/],
    [
      [
        { source: "n1", target: "n2" },
        { source: "n2", target: "n1" },
      ],
      /edges\[1\]: duplicate edge n1–n2/,
    ],
    [[{ source: "n1", target: "n2", weight: -1 }], /edges\[0\]\.weight: expected a finite number >= 0/],
    [[{ source: "n1", target: "n2", weight: Number.NaN }], /edges\[0\]\.weight: expected a finite number >= 0/],
    [[{ source: "n1", target: "n2", weight: "1" }], /edges\[0\]\.weight: expected a finite number >= 0/],
    [[{ source: "n1", target: "n2", reason: "  " }], /edges\[0\]\.reason: expected a non-empty string/],
    [[{ source: "n1", target: "n2", reason: 3 }], /edges\[0\]\.reason: expected a non-empty string/],
    [[{ source: 1, target: "n2" }], /edges\[0\]\.source: expected a string/],
    [["nope"], /edges\[0\]: expected an object/],
    ["nope", /edges: expected an array/],
  ])("rejects %j", (edges, message) => {
    expect(() => validateSpec(withEdges(edges))).toThrow(message);
  });
});
