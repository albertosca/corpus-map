import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/spec";

const minimal = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["n1"], centroid: [0, 0] }],
  nodes: [{ id: "n1", label: "One", x: 0, y: 0, territory: "t1" }],
};

describe("validateSpec", () => {
  it("accepts a minimal spec", () => {
    expect(validateSpec(minimal).nodes).toHaveLength(1);
  });

  it("accepts a node with no territory", () => {
    const spec = { version: "1", territories: [], nodes: [{ id: "n1", label: "One", x: 1, y: 2, territory: null }] };
    expect(validateSpec(spec).nodes[0].territory).toBeNull();
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
    expect(validateSpec(spec).nodes[0].meta).toEqual(meta);
  });
});
