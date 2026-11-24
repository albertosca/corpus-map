import { describe, expect, it } from "vitest";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "../../src/labels/itemLabels";
import { drawnItemLabels, itemLabelRect } from "../../src/labels/paintItemLabels";
import { estimateText } from "../../src/labels/placement";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import { groupNameAlpha, regimeAt } from "../../src/lod/regime";
import { visibleNodes } from "../../src/lod/visible";
import { paint } from "../../src/shared/paint";
import { buildScene, groupLabelsFor, NARROW_BOX_WIDTH, type Scene } from "../../src/shared/scene";
import type { MapSpec } from "../../src/shared/spec";
import { RecordingSurface } from "../../src/shared/surface";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { familyCounts, familyFocus, focusKeyOf } from "../../src/territories/familyFocus";
import { fitScene } from "../../src/viewport/fitScene";
import type { Viewport } from "../../src/viewport/viewport";
import { drawnName } from "../../test/drawnName";
import rawSpecJson from "./arxiv.json";
import { arxivSpec } from "./index";

const spec: MapSpec = arxivSpec(rawSpecJson);
const scene: Scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
const options = {
  midAt: DEFAULT_THRESHOLDS.midAt,
  groupNamesUntil: DEFAULT_TUNING.groupNamesUntil,
  fadeBand: DEFAULT_TUNING.fadeBand,
  hysteresis: DEFAULT_TUNING.hysteresis,
};
const familyOfLeaf = new Map(scene.groups.flatMap((group) => group.members.map((member) => [member, group.id])));
const BOXES = [
  [1440, 900],
  [375, 812],
] as const;
/** The zooms (ratio of the fit) the sweeps visit: the demo's mid for arXiv starts at 2 and its near at 2.5. */
const RATIOS = [2, 2.5, 3, 4];

/** How far (px) two name boxes may overlap and still be a graze: the painter fades a family name in proportion up to `OVERLAP_BAND` (8) pixels of overlap, so the sweeps count only deeper overlaps. */
const OVERLAP_MARGIN = 8;

/** The fitted view `CorpusMap` opens on. */
function fitAt(width: number, height: number): Viewport {
  return fitScene(spec, { ...scene, groupLabels: groupLabelsFor(scene, width) }, width, height, 24);
}

/** The view at `ratio` of the fit with world point `centre` in the middle of the box. */
function viewAt(fit: Viewport, width: number, height: number, ratio: number, centre: [number, number]): Viewport {
  const scale = fit.scale * ratio;
  return { scale, tx: width / 2 - centre[0] * scale, ty: height / 2 - centre[1] * scale };
}

/** The regime `CorpusMap` settles on at `ratio`, reached zooming in from the fit. */
function regimeFor(ratio: number) {
  let regime = regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis);
  for (let step = 0; step <= 40; step += 1)
    regime = regimeAt(1 + ((ratio - 1) * step) / 40, DEFAULT_THRESHOLDS, regime, DEFAULT_TUNING.hysteresis);
  return regime;
}

/** The weights `CorpusMap` derives for `viewport`: `familyCounts` through `familyFocus` and `focusKeyOf`, the same calls. */
function weightsAt(viewport: Viewport, width: number, height: number) {
  // The visible list, as CorpusMap passes it, so the guards measure what ships.
  const counts = familyCounts(
    visibleNodes(spec, viewport, width, height, Number.POSITIVE_INFINITY),
    viewport,
    width,
    height,
    familyOfLeaf,
    scene.groups.map((group) => group.id),
  );
  // Through the focus key, rounded to 1/256 as CorpusMap paints them (review minor 12).
  const weights = new Map<string, number>(
    JSON.parse(focusKeyOf(familyFocus(counts, DEFAULT_TUNING, spec.nodes.length))) as Array<[string, number]>,
  );
  return { counts, weights };
}

/** Every name `paint` draws for `viewport`, with or without the focus. */
function drawnNames(viewport: Viewport, width: number, height: number, ratio: number, focus?: Map<string, number>) {
  const regime = regimeFor(ratio);
  const groupAlpha = groupNameAlpha(ratio, regime, options);
  const surface = new RecordingSurface();
  const frame = {
    regime,
    pointAlpha: 0,
    width,
    height,
    groupAlpha,
    focus,
    compactGroupNames: width < NARROW_BOX_WIDTH,
  };
  paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
  return new Set(surface.texts.map((drawn) => drawn.text));
}

/** A grid of world points over the corpus, so the sweep visits every region and the gaps between them. */
function gridOfCentres(columns: number, rows: number): Array<[number, number]> {
  const points = [...scene.shapes.values()].flat().flat();
  const horizontals = points.map((point) => point[0]);
  const verticals = points.map((point) => point[1]);
  const [left, right] = [Math.min(...horizontals), Math.max(...horizontals)];
  const [top, bottom] = [Math.min(...verticals), Math.max(...verticals)];
  const centres: Array<[number, number]> = [];
  for (let column = 0; column < columns; column += 1)
    for (let row = 0; row < rows; row += 1)
      centres.push([left + ((right - left) * column) / (columns - 1), top + ((bottom - top) * row) / (rows - 1)]);
  return centres;
}

const centreOf = (members: readonly string[]): [number, number] => {
  const centroids = spec.territories
    .filter((territory) => members.includes(territory.id))
    .map((territory) => territory.centroid);
  return [
    centroids.reduce((sum, centroid) => sum + centroid[0], 0) / centroids.length,
    centroids.reduce((sum, centroid) => sum + centroid[1], 0) / centroids.length,
  ];
};

describe("metric 19: only the dominant family is drawn as leaves (arXiv, painted)", () => {
  for (const [width, height] of BOXES) {
    it(`metric 19: at most two families are at weight 1 at any pan position, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      const crowded: string[] = [];
      let visited = 0;
      for (const ratio of RATIOS)
        for (const centre of gridOfCentres(12, 8)) {
          const { counts, weights } = weightsAt(viewAt(fit, width, height, ratio, centre), width, height);
          // Below 2.5 items' weight the blend toward 1 (FOCUS_CONFIDENT_ITEMS) keeps every family within half a focus
          // key step of 1, so all of them paint at 1: a sparse screen draws every family, as spec family focus §2 says.
          // Measured on the painted, rounded weights: 6 such views here and 2 on the UMAP map (1f3cdc7), none above 2.2.
          if (Math.max(...counts.values()) < 2.5) continue;
          visited += 1;
          const full = [...weights.values()].filter((weight) => weight === 1).length;
          if (full > 2) crowded.push(`ratio ${ratio} at ${centre.map(Math.round).join(",")}: ${full} families`);
        }
      expect(crowded).toEqual([]);
      // Non-vacuous: the sweep did visit views that hold items.
      expect(visited).toBeGreaterThan(100);
    });

    it(`metric 19: the dominant family keeps every leaf name and a weight-0 family draws none, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      let dropped = 0;
      for (const ratio of [3, 4])
        for (const group of scene.groups) {
          const viewport = viewAt(fit, width, height, ratio, centreOf(group.members));
          const { counts, weights } = weightsAt(viewport, width, height);
          const unfocused = drawnNames(viewport, width, height, ratio);
          const focused = drawnNames(viewport, width, height, ratio, new Map(weights));
          const leafNamesOf = (family: string) =>
            scene.labels
              .filter((label) => familyOfLeaf.get(label.id) === family && unfocused.has(drawnName(label.name)))
              .map((label) => drawnName(label.name));
          const largest = Math.max(...counts.values());
          for (const family of scene.groups.map((entry) => entry.id)) {
            if (counts.get(family) === largest && largest > 0)
              for (const name of leafNamesOf(family)) expect(focused.has(name)).toBe(true);
            if ((weights.get(family) ?? 0) === 0)
              for (const name of leafNamesOf(family)) {
                dropped += 1;
                expect(focused.has(name)).toBe(false);
              }
          }
        }
      // Non-vacuous: some family was out of focus with leaf names to lose.
      expect(dropped).toBeGreaterThan(0);
    });
  }
});

describe("metric 19 (outlines): a family out of focus draws no leaf outlines (arXiv, painted)", () => {
  it("metric 19: the focus removes leaf outlines at mid and never adds any", () => {
    const [width, height] = BOXES[0];
    const fit = fitAt(width, height);
    const outlinesOf = (viewport: Viewport, ratio: number, focus?: Map<string, number>) => {
      const regime = regimeFor(ratio);
      const surface = new RecordingSurface();
      paint(
        surface,
        scene,
        spec,
        viewport,
        { regime, pointAlpha: 0, width, height, groupAlpha: groupNameAlpha(ratio, regime, options), focus },
        DEFAULT_THEME,
      );
      return surface.outlines.reduce((sum, outline) => sum + outline.rings.length, 0);
    };
    let removed = 0;
    for (const group of scene.groups) {
      const viewport = viewAt(fit, width, height, 3, centreOf(group.members));
      const { weights } = weightsAt(viewport, width, height);
      const without = outlinesOf(viewport, 3);
      const withFocus = outlinesOf(viewport, 3, new Map(weights));
      expect(withFocus).toBeLessThanOrEqual(without);
      removed += without - withFocus;
    }
    // Non-vacuous: somewhere a family was out of focus with leaf outlines to lose.
    expect(removed).toBeGreaterThan(0);
  });
});

/** Every drawn name with the alpha it was drawn at, in order. */
function drawnWithAlpha(surface: RecordingSurface) {
  let current = 1;
  let alphaIndex = 0;
  let textIndex = 0;
  const drawn: Array<{ text: string; x: number; y: number; font: string; alpha: number }> = [];
  for (const call of surface.calls) {
    if (call === "alpha") current = surface.alphas[alphaIndex++] as number;
    else if (call === "text") {
      const entry = surface.texts[textIndex++];
      if (entry) drawn.push({ text: entry.text, x: entry.x, y: entry.y, font: entry.font, alpha: current });
    }
  }
  return drawn;
}

describe("risk 2: a family name beside leaf names at mid (arXiv, painted)", () => {
  for (const [width, height] of BOXES) {
    it(`a family name and a leaf name that box each other are never both above half alpha, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      const familyNames = new Set(scene.groups.map((group) => drawnName(group.name)));
      let positions = 0;
      let boxed = 0;
      let strongest = 0;
      for (const ratio of RATIOS)
        for (const centre of gridOfCentres(12, 8)) {
          const viewport = viewAt(fit, width, height, ratio, centre);
          const { weights, counts } = weightsAt(viewport, width, height);
          // Below 2.5 items' weight the blend toward 1 (FOCUS_CONFIDENT_ITEMS) keeps every family within half a focus
          // key step of 1, so all of them paint at 1: a sparse screen draws every family, as spec family focus §2 says.
          // Measured on the painted, rounded weights: 6 such views here and 2 on the UMAP map (1f3cdc7), none above 2.2.
          if (Math.max(...counts.values()) < 2.5) continue;
          const regime = regimeFor(ratio);
          const groupAlpha = groupNameAlpha(ratio, regime, options);
          const surface = new RecordingSurface();
          const frame = {
            regime,
            pointAlpha: 0,
            width,
            height,
            groupAlpha,
            focus: new Map(weights),
            compactGroupNames: width < NARROW_BOX_WIDTH,
          };
          paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
          const names = drawnWithAlpha(surface).map((entry) => ({ ...entry, ...estimateText(entry.text, entry.font) }));
          positions += 1;
          for (const family of names.filter((entry) => familyNames.has(entry.text)))
            for (const leaf of names.filter((entry) => !familyNames.has(entry.text)))
              if (
                Math.abs(family.x - leaf.x) < (family.width + leaf.width) / 2 - OVERLAP_MARGIN &&
                Math.abs(family.y - leaf.y) < (family.height + leaf.height) / 2 - OVERLAP_MARGIN
              ) {
                boxed += 1;
                strongest = Math.max(strongest, Math.min(family.alpha, leaf.alpha));
              }
        }
      // Non-vacuous: the sweep visited many views and some pair did box each other.
      expect(positions).toBeGreaterThan(100);
      expect(boxed).toBeGreaterThan(0);
      expect(strongest).toBeLessThanOrEqual(0.5 + 1e-9);
    });
  }
});

/** The family centres, each paired with its nearest other family: the pans that cross a boundary. */
function neighbouringFamilies(): Array<[[number, number], [number, number]]> {
  const centres = scene.groups.map((group) => centreOf(group.members));
  return centres.map((centre, index) => {
    let nearest = centre;
    let nearestDistance = Number.POSITIVE_INFINITY;
    centres.forEach((other, otherIndex) => {
      const distance = Math.hypot(other[0] - centre[0], other[1] - centre[1]);
      if (otherIndex !== index && distance < nearestDistance) {
        nearest = other;
        nearestDistance = distance;
      }
    });
    return [centre, nearest];
  });
}

describe("continuity: a pan across a family boundary at mid changes no name's alpha by more than a stated step", () => {
  const STEPS = 100;
  // Measured per 1/100 of a family-to-family pan at ratio 2.5, on the painted weights rounded by the focus key: 0.119 (1440x900) and 0.098 (375x812) on corpus-cartographer's map, the one shipped; 0.059 and 0.044 on the UMAP map it replaced (1f3cdc7). The bound leaves headroom, not slack.
  const MAXIMUM_JUMP = 0.15;
  for (const [width, height] of BOXES) {
    it(`no name's alpha jumps by more than ${MAXIMUM_JUMP} between frames, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      let frames = 0;
      let largest = 0;
      let where = "";
      for (const ratio of [2.5])
        for (const [origin, destination] of neighbouringFamilies()) {
          const regime = regimeFor(ratio);
          const groupAlpha = groupNameAlpha(ratio, regime, options);
          let previous = new Map<string, number>();
          for (let step = 0; step <= STEPS; step += 1) {
            const centre: [number, number] = [
              origin[0] + ((destination[0] - origin[0]) * step) / STEPS,
              origin[1] + ((destination[1] - origin[1]) * step) / STEPS,
            ];
            const viewport = viewAt(fit, width, height, ratio, centre);
            const { weights } = weightsAt(viewport, width, height);
            const surface = new RecordingSurface();
            const frame = {
              regime,
              pointAlpha: 0,
              width,
              height,
              groupAlpha,
              focus: new Map(weights),
              compactGroupNames: width < NARROW_BOX_WIDTH,
            };
            paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
            const current = new Map(drawnWithAlpha(surface).map((entry) => [entry.text, entry.alpha]));
            if (step > 0)
              for (const name of new Set([...previous.keys(), ...current.keys()])) {
                const jump = Math.abs((current.get(name) ?? 0) - (previous.get(name) ?? 0));
                if (jump > largest) {
                  largest = jump;
                  where = `${name} at ratio ${ratio}, step ${step}`;
                }
              }
            previous = current;
            frames += 1;
          }
        }
      // Non-vacuous: hundreds of frames were compared.
      expect(frames).toBeGreaterThan(500);
      expect(largest, where).toBeLessThanOrEqual(MAXIMUM_JUMP);
      // Non-vacuous: names did move.
      expect(largest).toBeGreaterThan(0);
    });
  }
});

describe("continuity at near: a small pan moves no family's weight by more than a stated step (review I-1)", () => {
  // A frame is one 2% of the box width of pan; at near that is a few items entering or leaving.
  const PAN_FRACTION = 0.02;
  const FRAMES = 60;
  // Measured at ratios 4, 8 and 16, on the painted weights rounded by the focus key: 0.523 (1440x900) and 0.375 (375x812) on corpus-cartographer's map, the one shipped; 0.277 and 0.191 on the UMAP map it replaced (1f3cdc7). A pan that crosses a dense cluster moves a share by whole steps; the engine packs each family into evenly filled disks, so a 2% pan sweeps a dense strip of one disk, and the soft edge (FOCUS_FEATHER), focusFloor 0.25 and FOCUS_CONFIDENT_ITEMS 96 are what bring it under the bound, with little headroom at 1440x900.
  const MAXIMUM_WEIGHT_JUMP = 0.55;
  for (const [width, height] of BOXES) {
    it(`no weight jumps by more than ${MAXIMUM_WEIGHT_JUMP} between frames, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      let frames = 0;
      let largest = 0;
      let where = "";
      for (const ratio of [4, 8, 16])
        for (const [origin, destination] of neighbouringFamilies()) {
          const direction = Math.atan2(destination[1] - origin[1], destination[0] - origin[0]);
          const worldStep = (width * PAN_FRACTION) / (fit.scale * ratio);
          let previous = new Map<string, number>();
          for (let step = 0; step <= FRAMES; step += 1) {
            const centre: [number, number] = [
              origin[0] + Math.cos(direction) * worldStep * step,
              origin[1] + Math.sin(direction) * worldStep * step,
            ];
            const { counts, weights } = weightsAt(viewAt(fit, width, height, ratio, centre), width, height);
            if (step > 0)
              for (const [family, weight] of weights) {
                const jump = Math.abs(weight - (previous.get(family) ?? weight));
                if (jump > largest) {
                  largest = jump;
                  where = `${family} at ratio ${ratio}, step ${step}, ${counts.get(family)} of ${Math.max(...counts.values())} items`;
                }
              }
            previous = new Map(weights);
            frames += 1;
          }
        }
      expect(frames).toBeGreaterThan(500);
      expect(largest, where).toBeLessThanOrEqual(MAXIMUM_WEIGHT_JUMP);
      expect(largest).toBeGreaterThan(0);
    });
  }
});

describe("review I-2: a family name beside item label plates at near (arXiv, painted)", () => {
  const labels = placeItemLabels(
    spec,
    scene.labels,
    { font: DEFAULT_ITEM_LABEL_FONT, width: DEFAULT_TUNING.itemLabelWidth, lines: DEFAULT_TUNING.itemLabelLines },
    estimateText,
  );
  const familyNames = new Set(scene.groups.map((group) => drawnName(group.name)));
  for (const [width, height] of BOXES)
    it(`no family name above 0.5 alpha overlaps a drawn item label plate, at ${width}x${height}`, () => {
      const fit = fitAt(width, height);
      let names = 0;
      const overlaps: string[] = [];
      for (const ratio of [4, 8])
        for (const centre of [...gridOfCentres(7, 7), ...scene.groups.map((group) => centreOf(group.members))]) {
          const viewport = viewAt(fit, width, height, ratio, centre);
          const { weights } = weightsAt(viewport, width, height);
          const surface = new RecordingSurface();
          const frame = {
            regime: regimeFor(ratio),
            pointAlpha: 1,
            width,
            height,
            groupAlpha: groupNameAlpha(ratio, regimeFor(ratio), options),
            focus: new Map(weights),
            itemLabels: labels,
            itemLabelAlpha: 1,
            compactGroupNames: width < NARROW_BOX_WIDTH,
          };
          paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
          // Plates are drawn at near only; below it the paint draws none and none is to be avoided.
          const plates =
            regimeFor(ratio) === "near"
              ? drawnItemLabels(labels, viewport, { width, height, dimmed: new Set() }).map((label) =>
                  itemLabelRect(label, viewport),
                )
              : [];
          for (const drawn of drawnWithAlpha(surface)) {
            if (!familyNames.has(drawn.text) || drawn.alpha <= 0.5) continue;
            names += 1;
            const box = estimateText(drawn.text, drawn.font);
            for (const plate of plates)
              if (
                Math.abs(plate.left + plate.width / 2 - drawn.x) < (plate.width + box.width) / 2 - OVERLAP_MARGIN &&
                Math.abs(plate.top + plate.height / 2 - drawn.y) < (plate.height + box.height) / 2 - OVERLAP_MARGIN
              )
                overlaps.push(`${drawn.text} at ratio ${ratio}, centre ${centre.map(Math.round)}`);
          }
        }
      expect(names).toBeGreaterThan(0);
      expect([...new Set(overlaps)]).toEqual([]);
    });
});
