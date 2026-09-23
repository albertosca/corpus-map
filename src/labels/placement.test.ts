import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import { contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
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
  FIT,
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
    for (const ratio of ratios)
      expect(
        overlapping(
          labels.filter((l) => ratio >= l.activeFrom),
          ratio * FIT,
        ),
      ).toBe(0);
  });

  it("metric 7: zooming in never hides a name, and visibility depends only on the ratio", () => {
    let previous = new Set<string>();
    for (const ratio of ratios) {
      const now = new Set(labels.filter((l) => ratio >= l.activeFrom).map((l) => l.id));
      for (const id of previous) expect(now.has(id)).toBe(true);
      previous = now;
    }
    const again = placeLabels(
      [...spec.territories]
        .reverse()
        .map((t) => ({ id: t.id, name: t.name, anchor: anchorOf(t.id), members: t.members.length })),
      FONTS,
      CUT,
      estimateText,
      FIT,
    );
    const key = (ls: PlacedLabel[]) => ls.map((l) => `${l.id}:${l.activeFrom}`).sort();
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

  it("metric 9 (size): the smallest name is at least 12 px", () => {
    expect(Math.min(...labels.map((l) => l.height))).toBeGreaterThanOrEqual(12);
  });

  it("shows the top name even when every name sits at the same point", () => {
    const stacked = placeLabels(
      ["a", "b", "c"].map((id, i) => ({ id, name: id.repeat(5), anchor: [0, 0] as Point, members: 10 - i })),
      FONTS,
      CUT,
      estimateText,
      1,
    );
    expect(stacked.find((l) => l.id === "a")?.activeFrom).toBe(0);
    expect(stacked.filter((l) => l.activeFrom === Number.POSITIVE_INFINITY)).toHaveLength(2);
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
      FIT,
    );
    const ids = tied.map((l) => l.id);
    expect(ids).toEqual(["a", "m", "z"]);
  });

  it("estimateText handles fonts without px notation (coverage: regex fallback)", () => {
    const result = estimateText("test", "600 bold system-ui");
    expect(result.width).toBeCloseTo(28.8);
    expect(result.height).toBe(12);
  });
});
