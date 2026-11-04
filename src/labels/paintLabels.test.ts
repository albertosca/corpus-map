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

describe("paintLabels with a one-member family (backlog 2026-10-26)", () => {
  function familied(soloFamilyName: string): Scene {
    const leaf = (id: string, name: string, parent: string, horizontal: number) => ({
      id,
      name,
      parent,
      members: [`${id}-a`, `${id}-b`, `${id}-c`],
      centroid: [horizontal, 0] as [number, number],
    });
    const territories = [
      leaf("solo", "Solo", "family-solo", 0),
      leaf("left", "Left", "family-pair", 100),
      leaf("right", "Right", "family-pair", 200),
      { id: "family-solo", name: soloFamilyName, members: [], centroid: [0, 0] as [number, number] },
      { id: "family-pair", name: "Pair", members: [], centroid: [150, 0] as [number, number] },
    ];
    const nodes = territories
      .filter((territory) => territory.members.length > 0)
      .flatMap((territory) =>
        territory.members.map((id, index) => ({
          id,
          label: id,
          x: territory.centroid[0] + index,
          y: index,
          territory: territory.id,
        })),
      );
    return buildScene(validateSpec({ version: "1", territories, nodes }), DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  }

  const namesDrawn = (scene: Scene, groupAlpha: number, name: string) => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha });
    return surface.texts.filter((drawn) => drawn.text === name).length;
  };

  it("draws a family named like its only territory once, whatever the fade", () => {
    const scene = familied("Solo");
    for (const groupAlpha of [0, 0.25, 0.5, 0.75, 1]) expect(namesDrawn(scene, groupAlpha, "Solo")).toBe(1);
  });

  it("draws that one name at full alpha through the fade, so it neither dims nor pops", () => {
    const scene = familied("Solo");
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0.5 });
    // Brightest first, and no alpha call before the first draw means alpha 1.
    expect(surface.texts[0]?.text).toBe("Solo");
    expect(surface.alphas).toEqual([0.5, 1]);
  });

  it("keeps both names when the family's differs from its territory's", () => {
    const scene = familied("Loner");
    expect(namesDrawn(scene, 0.5, "Solo")).toBe(1);
    expect(namesDrawn(scene, 0.5, "Loner")).toBe(1);
  });

  it("keeps the family's name where its territory's name is not drawn yet", () => {
    const scene = familied("Solo");
    const inactive: Scene = {
      ...scene,
      labels: scene.labels.map((label) => (label.id === "solo" ? { ...label, activeFromScale: 1e9 } : label)),
    };
    const surface = new RecordingSurface();
    paintLabels(surface, inactive, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1 });
    expect(surface.texts.filter((drawn) => drawn.text === "Solo")).toHaveLength(1);
    expect(surface.alphas).toEqual([]);
  });
});

describe("paintLabels with a family focus (spec family focus §4)", () => {
  const { scene } = grouped();
  const groupNames = new Set(scene.groups.map((group) => group.name));
  const firstGroup = scene.groups[0] as TerritoryGroup;
  const weights = (weight: number, others = 1) =>
    new Map(scene.groups.map((group) => [group.id, group.id === firstGroup.id ? weight : others]));
  const leafNamesOf = (group: TerritoryGroup) =>
    new Set(scene.labels.filter((label) => group.members.includes(label.id)).map((label) => label.name));

  it.each([0, 0.5, 1])(
    "with focus absent or every weight 1 draws exactly what it drew at groupAlpha %s",
    (groupAlpha) => {
      const absent = new RecordingSurface();
      paintLabels(absent, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha });
      const full = new RecordingSurface();
      paintLabels(full, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha, focus: weights(1) });
      expect(full.calls).toEqual(absent.calls);
    },
  );

  it("at groupAlpha 0 draws no leaf name of a weight-0 family and draws its name at 1", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0, focus: weights(0) });
    const drawn = surface.texts.map((entry) => entry.text);
    for (const name of leafNamesOf(firstGroup)) expect(drawn).not.toContain(name);
    expect(drawn).toContain(firstGroup.name);
    expect(surface.alphas).toEqual([]);
    for (const other of scene.groups.slice(1)) expect(drawn).not.toContain(other.name);
  });

  it("at weight 0.5 draws both levels of that family at 0.5", () => {
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 0, focus: weights(0.5) });
    const drawn = surface.texts.map((entry) => entry.text);
    expect(drawn).toContain(firstGroup.name);
    expect(surface.alphas).toEqual([0.5, 1]);
  });

  it("composes a dimmed leaf name with its level", () => {
    const label = scene.labels.find((entry) => firstGroup.members.includes(entry.id)) as PlacedLabel;
    const surface = new RecordingSurface();
    paintLabels(surface, scene, VIEWPORT, DEFAULT_THEME, {
      ...BOX,
      groupAlpha: 0,
      focus: weights(0.5),
      dimmed: new Set([label.id]),
    });
    expect(surface.alphas).toContain(0.5 * DIMMED_ALPHA);
  });

  it("ignores the focus at groupAlpha 1", () => {
    const absent = new RecordingSurface();
    paintLabels(absent, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1 });
    const focused = new RecordingSurface();
    paintLabels(focused, scene, VIEWPORT, DEFAULT_THEME, { ...BOX, groupAlpha: 1, focus: weights(0) });
    expect(focused.calls).toEqual(absent.calls);
    expect(focused.texts.every((entry) => groupNames.has(entry.text))).toBe(true);
  });

  it("keeps a handed-over single-territory family drawn once, at 1, at weights 0 and 1", () => {
    const single = validateSpec({
      version: "1",
      territories: [
        { id: "solo", name: "Solo", members: ["a"], centroid: [0, 0] },
        { id: "pair-a", name: "Pair A", members: ["b"], centroid: [100, 0] },
        { id: "pair-b", name: "Pair B", members: ["c"], centroid: [100, 50] },
      ],
      nodes: [
        { id: "a", label: "a", x: 0, y: 0, territory: "solo" },
        { id: "b", label: "b", x: 100, y: 0, territory: "pair-a" },
        { id: "c", label: "c", x: 100, y: 50, territory: "pair-b" },
      ],
      groups: [
        { id: "solo-family", name: "Solo", members: ["solo"] },
        { id: "pair-family", name: "Pair", members: ["pair-a", "pair-b"] },
      ],
    } as unknown);
    const singleScene = buildScene(single, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    for (const weight of [0, 1]) {
      const surface = new RecordingSurface();
      paintLabels(surface, singleScene, VIEWPORT, DEFAULT_THEME, {
        ...BOX,
        groupAlpha: 0.5,
        focus: new Map([
          ["solo-family", weight],
          ["pair-family", 1],
        ]),
      });
      expect(surface.texts.filter((entry) => entry.text === "Solo")).toHaveLength(1);
    }
  });
});
