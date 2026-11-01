import { describe, expect, it } from "vitest";
import { DIMMED_ALPHA } from "../shared/dimmed";
import { DENSE_NAME_ALPHA } from "../shared/presentation";
import { buildScene, GROUP_LETTER_SPACING, type Scene } from "../shared/scene";
import { type MapSpec, validateSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import type { TerritoryGroup } from "../territories/groups";
import { paintLabels } from "./paintLabels";
import { estimateText, type PlacedLabel } from "./placement";

const BOX = { width: 4000, height: 4000 };
const VIEWPORT = { scale: 1000, tx: 0, ty: 0 };

function grouped(): { spec: MapSpec; scene: Scene } {
  const territories = Array.from({ length: 12 }, (_, index) => ({
    id: `t${index}`,
    name: `T${index}`,
    // Distinct member counts, so the names fall into every label class.
    members: Array.from({ length: index + 1 }, (_, member) => `n${index}-${member}`),
    centroid: [(index % 3) * 100, index] as [number, number],
  }));
  const nodes = territories.flatMap((territory) =>
    territory.members.map((id) => ({
      id,
      label: id,
      x: territory.centroid[0],
      y: territory.centroid[1],
      territory: territory.id,
    })),
  );
  const spec = validateSpec({ version: "1", territories, nodes });
  return { spec, scene: buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText) };
}

describe("paintLabels with groups", () => {
  const { scene } = grouped();
  const groupNames = new Set(scene.groups.map((group) => group.name));

  it("at groupAlpha 1 draws only group names, large and letter-spaced, with no alpha calls", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1 });
    expect(surface.texts.length).toBeGreaterThan(0);
    for (const drawn of surface.texts) {
      expect(groupNames.has(drawn.text)).toBe(true);
      expect(drawn.font).toBe(DEFAULT_THEME.territoryFonts.large);
      expect(drawn.letterSpacing).toBe(`${GROUP_LETTER_SPACING}px`);
    }
    expect(surface.alphas).toEqual([]);
  });

  it("with compactGroupNames draws the group names in the compact font at the compact positions", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1, compactGroupNames: true });
    const expected = scene.compactGroupLabels.map((label) => ({
      text: label.name,
      x: label.anchor[0] * VIEWPORT.scale,
      y: label.anchor[1] * VIEWPORT.scale,
      font: scene.compactGroupFont,
    }));
    expect(surface.texts.map((drawn) => ({ text: drawn.text, x: drawn.x, y: drawn.y, font: drawn.font }))).toEqual(
      expected,
    );
    for (const drawn of surface.texts) expect(drawn.letterSpacing).toBe(`${GROUP_LETTER_SPACING}px`);
  });

  it("with compactGroupNames false draws exactly what an absent flag draws", () => {
    const absent = new RecordingSurface();
    paintLabels(absent, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0.75 });
    const off = new RecordingSurface();
    paintLabels(off, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0.75, compactGroupNames: false });
    expect(off.calls).toEqual(absent.calls);
  });

  it("with groupAlpha absent draws only territory names (groupAlpha means 0)", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, BOX);
    expect(surface.texts.some((drawn) => groupNames.has(drawn.text))).toBe(false);
    expect(surface.texts.length).toBeGreaterThan(0);
  });

  it("mid-fade draws both, the brighter layer first, and resets the alpha to 1", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0.75 });
    expect(surface.alphas).toEqual([0.75, 0.25, 1]);
    const firstTerritory = surface.texts.findIndex((drawn) => !groupNames.has(drawn.text));
    const lastGroup = surface.texts.map((drawn) => groupNames.has(drawn.text)).lastIndexOf(true);
    expect(lastGroup).toBeLessThan(firstTerritory);
  });

  it("ignores groupAlpha when the scene has no groups", () => {
    const small = validateSpec({
      version: "1",
      territories: [{ id: "only", name: "Only", members: ["a"], centroid: [0, 0] }],
      nodes: [{ id: "a", label: "a", x: 0, y: 0, territory: "only" }],
    });
    const smallScene = buildScene(small, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const surface = new RecordingSurface();
    paintLabels(surface, smallScene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1 });
    expect(surface.texts.map((drawn) => drawn.text)).toEqual(["Only"]);
    expect(surface.alphas).toEqual([]);
  });

  it("dense keeps its sequence: large names, then DENSE_NAME_ALPHA, the rest, then 1", () => {
    expect(new Set(scene.labels.map((label) => label.labelClass)).size).toBeGreaterThan(1);
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, presentation: "dense" });
    expect(surface.alphas).toEqual([DENSE_NAME_ALPHA, 1]);
  });
});

describe("paintLabels with dimmed territories", () => {
  const { scene } = grouped();

  it("draws a dimmed territory's name at DIMMED_ALPHA, after the others", () => {
    const label = scene.labels[0] as PlacedLabel;
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, dimmed: new Set([label.id]) });
    expect(surface.alphas).toEqual([DIMMED_ALPHA, 1]);
    expect(surface.texts[surface.texts.length - 1]?.text).toBe(label.name);
  });

  it("dims a group name only when every member is dimmed", () => {
    const group = scene.groups[0] as TerritoryGroup;
    expect(group.members.length).toBeGreaterThan(1);
    const partly = new RecordingSurface();
    paintLabels(partly, scene, VIEWPORT, DEFAULT_THEME, {
      ...BOX,
      groupAlpha: 1,
      dimmed: new Set(group.members.slice(1)),
    });
    expect(partly.alphas).toEqual([]);
    const wholly = new RecordingSurface();
    paintLabels(wholly, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1, dimmed: new Set(group.members) });
    expect(wholly.alphas).toEqual([DIMMED_ALPHA, 1]);
    expect(wholly.texts[wholly.texts.length - 1]?.text).toBe(group.name);
  });
});
