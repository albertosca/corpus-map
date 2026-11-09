import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import { drawnName } from "../../test/drawnName";
import { paint } from "../shared/paint";
import { buildScene } from "../shared/scene";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
import { fitSpec, worldBounds } from "../viewport/fit";
import { toScreen, type Viewport } from "../viewport/viewport";
import { estimateText, LABEL_PADDING, type PlacedLabel, placeLabels } from "./placement";
import { poleOfInaccessibility } from "./pole";

const FONTS = { large: "700 20px system-ui", medium: "600 15px system-ui", small: "500 12px system-ui" };
const CUT = { large: 0.8, medium: 0.4 };
const FIT = 1.2;

const spec = generateCorpus({ seed: 1, size: 5000 });
const byId = new Map(spec.nodes.map((node) => [node.id, node]));
const largest = new Map<string, Ring>();
for (const territory of spec.territories) {
  const memberPoints = territory.members.flatMap((member) => {
    const node = byId.get(member);
    return node ? [[node.x, node.y] as Point] : [];
  });
  const rings = disksOutline(memberPoints, 2.5 * spacing(memberPoints, 0.9));
  const ring = [...rings].sort((first, second) => ringArea(second) - ringArea(first))[0];
  if (ring) largest.set(territory.id, ring);
}
const anchorOf = (id: string): Point => {
  const ring = largest.get(id);
  if (!ring) throw new Error(`no ring for ${id}`);
  return poleOfInaccessibility(ring, extent(ring) * 0.01);
};
const labels = placeLabels(
  spec.territories.map((territory) => ({
    id: territory.id,
    name: territory.name,
    anchor: anchorOf(territory.id),
    members: territory.members.length,
  })),
  FONTS,
  CUT,
  estimateText,
);

function overlapping(shown: PlacedLabel[], scale: number): number {
  let pairs = 0;
  for (let index = 0; index < shown.length; index += 1) {
    for (let other = index + 1; other < shown.length; other += 1) {
      const first = shown[index];
      const second = shown[other];
      if (!first || !second) continue;
      const overlapsHorizontally =
        Math.abs((first.anchor[0] - second.anchor[0]) * scale) < (first.width + second.width) / 2 + LABEL_PADDING;
      const overlapsVertically =
        Math.abs((first.anchor[1] - second.anchor[1]) * scale) < (first.height + second.height) / 2 + LABEL_PADDING;
      if (overlapsHorizontally && overlapsVertically) pairs += 1;
    }
  }
  return pairs;
}

const ratios = Array.from({ length: 201 }, (_, step) => 0.125 * 2 ** (step / 20));

describe("placeLabels", () => {
  it("metric 6: no two visible names overlap at any sampled ratio", () => {
    for (const ratio of ratios) {
      const scale = ratio * FIT;
      expect(
        overlapping(
          labels.filter((label) => scale >= label.activeFromScale),
          scale,
        ),
      ).toBe(0);
    }
  });

  // Component level, through `paint`: a planted `if (... || vp.scale >
  // l.activeFromScale * 1.5 + 8) continue;` in `paintLabels` left every test
  // in the old, pure-`placeLabels`-only version of this test green (it never
  // called `paint`, so it could never see what `paintLabels` actually
  // draws). This version goes through `paint` into a `RecordingSurface` so
  // the same defect fails it.
  it("metric 7: zooming in never hides a name already drawn, and pan alone never changes which names are on screen", () => {
    const width = 960;
    const height = 640;
    const fit = fitSpec(spec, width, height, 24);
    const bounds = worldBounds(spec);
    const centreHorizontal = (bounds.minX + bounds.maxX) / 2;
    const centreVertical = (bounds.minY + bounds.maxY) / 2;
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const viewportAt = (ratio: number, panHorizontal = 0, panVertical = 0): Viewport => {
      const scale = fit.scale * ratio;
      return {
        scale,
        tx: width / 2 - centreHorizontal * scale + panHorizontal,
        ty: height / 2 - centreVertical * scale + panVertical,
      };
    };
    // Painted into the real `width` x `height` canvas, so any visibility
    // rule `paintLabels` applies at paint time is measured along with
    // placement's own selection: a rule that depends on where a name sits
    // on screen (such as skipping a name whose box crosses the edge) would
    // make a name vanish on zoom in and fail clause (i).
    const drawnNames = (ratio: number, panHorizontal = 0, panVertical = 0): Set<string> => {
      const surface = new RecordingSurface();
      paint(
        surface,
        scene,
        spec,
        viewportAt(ratio, panHorizontal, panVertical),
        { regime: "far", pointAlpha: 0, width, height },
        DEFAULT_THEME,
      );
      return new Set(surface.texts.map((drawn) => drawn.text));
    };
    const onScreenNames = (ratio: number, panHorizontal: number, panVertical: number): Set<string> => {
      const viewport = viewportAt(ratio, panHorizontal, panVertical);
      const onScreen = new Set<string>();
      for (const label of scene.labels) {
        if (viewport.scale < label.activeFromScale) continue;
        const [screenHorizontal, screenVertical] = toScreen(viewport, label.anchor[0], label.anchor[1]);
        if (screenHorizontal >= 0 && screenHorizontal <= width && screenVertical >= 0 && screenVertical <= height) {
          onScreen.add(drawnName(label.name));
        }
      }
      return onScreen;
    };

    // (i) sweeping the ratio upward, no name drawn at one step is missing
    // at any later step.
    let previous = new Set<string>();
    for (const ratio of ratios) {
      const now = drawnNames(ratio);
      for (const name of previous) expect(now.has(name)).toBe(true);
      previous = now;
    }

    // (ii) at a fixed ratio, panning the viewport never changes which
    // names are drawn — restricted to names whose anchor falls on screen
    // at both pan offsets (a name near the edge can slide off screen at
    // one offset and not the other; that is a screen-bounds fact, not a
    // labeling bug). A modest pan (30, -15) at ratios close to the fitted
    // scale (1, 1.5, 2) keeps a healthy double-digit overlap; a larger pan
    // or a much higher ratio empties it out (this two-territory-scattered
    // corpus is not re-centred on zoom the way `CorpusMap` would pan it),
    // which would make the "at least one name" check below vacuous.
    for (const ratio of [1, 1.5, 2]) {
      const unpanned = drawnNames(ratio, 0, 0);
      const panned = drawnNames(ratio, 30, -15);
      const onBoth = [...onScreenNames(ratio, 0, 0)].filter((name) => onScreenNames(ratio, 30, -15).has(name));
      expect(onBoth.length).toBeGreaterThan(0);
      for (const name of onBoth) {
        expect(unpanned.has(name)).toBe(true);
        expect(panned.has(name)).toBe(true);
      }
    }
  });

  // Adds order-independence, which the paint-based test above does not
  // cover (it builds one `Scene` from the territories in their given
  // order): `placeLabels` must assign the same `activeFromScale` to every id
  // whatever order its inputs arrive in, since priority is decided by
  // member count and id, not by array position.
  it("metric 7 (order independence): placeLabels gives every id the same activeFromScale whatever order the inputs arrive in", () => {
    const again = placeLabels(
      [...spec.territories].reverse().map((territory) => ({
        id: territory.id,
        name: territory.name,
        anchor: anchorOf(territory.id),
        members: territory.members.length,
      })),
      FONTS,
      CUT,
      estimateText,
    );
    const key = (placed: PlacedLabel[]) => placed.map((label) => `${label.id}:${label.activeFromScale}`).sort();
    expect(key(again)).toEqual(key(labels));
  });

  it("metric 8: every anchor lies inside its territory's drawn shape, the U included", () => {
    for (const territory of spec.territories) {
      const ring = largest.get(territory.id);
      if (!ring) throw new Error(`no ring for ${territory.id}`);
      expect(contains(ring, anchorOf(territory.id))).toBe(true);
    }
    const [anchorHorizontal, anchorVertical] = anchorOf("t0");
    const [centroidHorizontal, centroidVertical] = spec.territories.find((territory) => territory.id === "t0")
      ?.centroid ?? [0, 0];
    expect(Math.hypot(anchorHorizontal - centroidHorizontal, anchorVertical - centroidVertical)).toBeGreaterThan(1);
  });

  it("shows the top name even when every name sits at the same point", () => {
    const stacked = placeLabels(
      ["a", "b", "c"].map((id, index) => ({ id, name: id.repeat(5), anchor: [0, 0] as Point, members: 10 - index })),
      FONTS,
      CUT,
      estimateText,
    );
    expect(stacked.find((label) => label.id === "a")?.activeFromScale).toBe(0);
    expect(stacked.filter((label) => label.activeFromScale === Number.POSITIVE_INFINITY)).toHaveLength(2);
  });

  it("assigns three size classes by member-count percentile", () => {
    const classes = new Set(labels.map((label) => label.labelClass));
    expect(classes).toEqual(new Set(["large", "medium", "small"]));
  });

  it("handles IDs with same member count (coverage: id comparison branches)", () => {
    const tied = placeLabels(
      [
        { id: "z", name: "z", anchor: [0, 0] as Point, members: 100 },
        { id: "a", name: "a", anchor: [100, 100] as Point, members: 100 },
        { id: "m", name: "m", anchor: [50, 50] as Point, members: 100 },
      ],
      FONTS,
      CUT,
      estimateText,
    );
    const ids = tied.map((label) => label.id);
    expect(ids).toEqual(["a", "m", "z"]);
  });
});
