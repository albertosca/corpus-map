import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
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
const byId = new Map(spec.nodes.map((n) => [n.id, n]));
const largest = new Map<string, Ring>();
for (const t of spec.territories) {
  const pts = t.members.flatMap((m) => {
    const n = byId.get(m);
    return n ? [[n.x, n.y] as Point] : [];
  });
  const rings = disksOutline(pts, 2.5 * spacing(pts, 0.9));
  const ring = [...rings].sort((a, b) => ringArea(b) - ringArea(a))[0];
  if (ring) largest.set(t.id, ring);
}
const anchorOf = (id: string): Point => {
  const ring = largest.get(id);
  if (!ring) throw new Error(`no ring for ${id}`);
  return poleOfInaccessibility(ring, extent(ring) * 0.01);
};
const labels = placeLabels(
  spec.territories.map((t) => ({ id: t.id, name: t.name, anchor: anchorOf(t.id), members: t.members.length })),
  FONTS,
  CUT,
  estimateText,
);

function overlapping(shown: PlacedLabel[], scale: number): number {
  let pairs = 0;
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      const a = shown[i];
      const b = shown[j];
      if (!a || !b) continue;
      const ox = Math.abs((a.anchor[0] - b.anchor[0]) * scale) < (a.width + b.width) / 2 + LABEL_PADDING;
      const oy = Math.abs((a.anchor[1] - b.anchor[1]) * scale) < (a.height + b.height) / 2 + LABEL_PADDING;
      if (ox && oy) pairs += 1;
    }
  }
  return pairs;
}

const ratios = Array.from({ length: 201 }, (_, k) => 0.125 * 2 ** (k / 20));

describe("placeLabels", () => {
  it("metric 6: no two visible names overlap at any sampled ratio", () => {
    for (const ratio of ratios) {
      const scale = ratio * FIT;
      expect(
        overlapping(
          labels.filter((l) => scale >= l.activeFromScale),
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
    const b = worldBounds(spec);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const vpAt = (ratio: number, panX = 0, panY = 0): Viewport => {
      const scale = fit.scale * ratio;
      return { scale, tx: width / 2 - cx * scale + panX, ty: height / 2 - cy * scale + panY };
    };
    const drawnNames = (ratio: number, panX = 0, panY = 0): Set<string> => {
      const s = new RecordingSurface();
      paint(s, scene, spec, vpAt(ratio, panX, panY), { regime: "far", pointAlpha: 0 }, DEFAULT_THEME);
      return new Set(s.texts.map((t) => t.text));
    };
    const onScreenNames = (ratio: number, panX: number, panY: number): Set<string> => {
      const vp = vpAt(ratio, panX, panY);
      const out = new Set<string>();
      for (const l of scene.labels) {
        if (vp.scale < l.activeFromScale) continue;
        const [x, y] = toScreen(vp, l.anchor[0], l.anchor[1]);
        if (x >= 0 && x <= width && y >= 0 && y <= height) out.add(l.name);
      }
      return out;
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
      const panA = drawnNames(ratio, 0, 0);
      const panB = drawnNames(ratio, 30, -15);
      const onBoth = [...onScreenNames(ratio, 0, 0)].filter((name) => onScreenNames(ratio, 30, -15).has(name));
      expect(onBoth.length).toBeGreaterThan(0);
      for (const name of onBoth) {
        expect(panA.has(name)).toBe(true);
        expect(panB.has(name)).toBe(true);
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
      [...spec.territories]
        .reverse()
        .map((t) => ({ id: t.id, name: t.name, anchor: anchorOf(t.id), members: t.members.length })),
      FONTS,
      CUT,
      estimateText,
    );
    const key = (ls: PlacedLabel[]) => ls.map((l) => `${l.id}:${l.activeFromScale}`).sort();
    expect(key(again)).toEqual(key(labels));
  });

  it("metric 8: every anchor lies inside its territory's drawn shape, the U included", () => {
    for (const t of spec.territories) {
      const ring = largest.get(t.id);
      if (!ring) throw new Error(`no ring for ${t.id}`);
      expect(contains(ring, anchorOf(t.id))).toBe(true);
    }
    const [ux, uy] = anchorOf("t0");
    const [cx, cy] = spec.territories.find((t) => t.id === "t0")?.centroid ?? [0, 0];
    expect(Math.hypot(ux - cx, uy - cy)).toBeGreaterThan(1);
  });

  it("shows the top name even when every name sits at the same point", () => {
    const stacked = placeLabels(
      ["a", "b", "c"].map((id, i) => ({ id, name: id.repeat(5), anchor: [0, 0] as Point, members: 10 - i })),
      FONTS,
      CUT,
      estimateText,
    );
    expect(stacked.find((l) => l.id === "a")?.activeFromScale).toBe(0);
    expect(stacked.filter((l) => l.activeFromScale === Number.POSITIVE_INFINITY)).toHaveLength(2);
  });

  it("assigns three size classes by member-count percentile", () => {
    const classes = new Set(labels.map((l) => l.labelClass));
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
    const ids = tied.map((l) => l.id);
    expect(ids).toEqual(["a", "m", "z"]);
  });
});
