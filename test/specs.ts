import { type MapSpec, validateSpec } from "../src/shared/spec";

function grid(prefix: string, territory: string, left: number): MapSpec["nodes"] {
  const nodes: MapSpec["nodes"] = [];
  for (let row = 0; row < 2; row += 1)
    for (let column = 0; column < 3; column += 1)
      nodes.push({
        id: `${prefix}${row * 3 + column}`,
        label: `${prefix.toUpperCase()} ${row * 3 + column}`,
        x: left + column,
        y: row,
        territory,
      });
  return nodes;
}

/** Parent `p` ("Parent") over two six-item leaves: `a` at x 0–2 and `b` at x 4–6, both at y 0–1. */
export function nestedSpec(): MapSpec {
  const nodes = [...grid("a", "a", 0), ...grid("b", "b", 4)];
  const membersOf = (territory: string) => nodes.filter((node) => node.territory === territory).map((node) => node.id);
  return validateSpec({
    version: "1",
    territories: [
      { id: "p", name: "Parent", members: [], centroid: [3, 0.5] },
      { id: "a", name: "A", members: membersOf("a"), centroid: [1, 0.5], parent: "p" },
      { id: "b", name: "B", members: membersOf("b"), centroid: [5, 0.5], parent: "p" },
    ],
    nodes,
  });
}

/** Parent `p` over one six-item leaf `a`, plus a top-level leaf `solo` far away. */
export function singleChildSpec(): MapSpec {
  const nodes = [...grid("a", "a", 0), ...grid("s", "solo", 20)];
  const membersOf = (territory: string) => nodes.filter((node) => node.territory === territory).map((node) => node.id);
  return validateSpec({
    version: "1",
    territories: [
      { id: "p", name: "Parent", members: [], centroid: [1, 0.5] },
      { id: "a", name: "A", members: membersOf("a"), centroid: [1, 0.5], parent: "p" },
      { id: "solo", name: "Solo", members: membersOf("solo"), centroid: [21, 0.5] },
    ],
    nodes,
  });
}
