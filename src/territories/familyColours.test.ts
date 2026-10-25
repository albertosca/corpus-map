import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { buildScene } from "../shared/scene";
import { type MapSpec, validateSpec } from "../shared/spec";
import { DARK_THEME, DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { familyColours, tintDirection } from "./familyColours";
import { TINT_STEPS, tint } from "./tint";

function block(territory: string, left: number): MapSpec["nodes"] {
  const nodes: MapSpec["nodes"] = [];
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 3; column += 1)
      nodes.push({ id: `${territory}${row}${column}`, label: territory, x: left + column, y: row, territory });
  return nodes;
}

function familySpec(colours: Partial<Record<string, string>> = {}): MapSpec {
  const nodes = [...block("a", 0), ...block("b", 3), ...block("c", 6), ...block("d", 40)];
  const leaf = (id: string, parent: string) => ({
    id,
    name: id.toUpperCase(),
    members: nodes.filter((node) => node.territory === id).map((node) => node.id),
    centroid: [0, 0],
    parent,
    ...(colours[id] === undefined ? {} : { colour: colours[id] }),
  });
  return validateSpec({
    version: "1",
    territories: [
      { id: "p", name: "P", members: [], centroid: [4, 1] },
      { id: "q", name: "Q", members: [], centroid: [41, 1] },
      leaf("a", "p"),
      leaf("b", "p"),
      leaf("c", "p"),
      leaf("d", "q"),
    ],
    nodes,
  });
}

function coloursOf(spec: MapSpec, direction: 1 | -1 = -1) {
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  return familyColours(
    scene.shapes,
    scene.groupShapes,
    scene.groups,
    spec.territories,
    DEFAULT_THEME.palette,
    direction,
  );
}

describe("familyColours", () => {
  it("gives touching siblings different tints of their family colour", () => {
    const { colours, groupColours } = coloursOf(familySpec());
    const base = groupColours.get("p") as string;
    expect(DEFAULT_THEME.palette).toContain(base);
    const tints = TINT_STEPS.map((step) => tint(base, step, -1));
    const siblings = ["a", "b", "c"].map((id) => colours.get(id) as string);
    for (const colour of siblings) expect(tints).toContain(colour);
    // a–b and b–c touch; a and c do not, so they may share a tint.
    expect(colours.get("a")).not.toBe(colours.get("b"));
    expect(colours.get("b")).not.toBe(colours.get("c"));
  });

  it("colours a family of one child in the family colour itself", () => {
    const { colours, groupColours } = coloursOf(familySpec());
    expect(colours.get("d")).toBe(groupColours.get("q"));
  });

  it("keeps a child's declared colour", () => {
    const { colours } = coloursOf(familySpec({ b: "#123456" }));
    expect(colours.get("b")).toBe("#123456");
  });

  it("tints towards the label: darker on a light theme, lighter on a dark one", () => {
    expect(tintDirection(DEFAULT_THEME)).toBe(-1);
    expect(tintDirection(DARK_THEME)).toBe(1);
  });

  it("leaves leaves uncoloured with an empty palette", () => {
    const spec = familySpec();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const { colours } = familyColours(scene.shapes, scene.groupShapes, scene.groups, spec.territories, [], -1);
    expect(colours.size).toBe(0);
  });
});
