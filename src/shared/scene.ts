import { type Measure, type PlacedLabel, placeLabels } from "../labels/placement";
import { poleOfInaccessibility } from "../labels/pole";
import { disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
import type { MapNode, MapSpec } from "./spec";
import type { Theme } from "./theme";
import type { Tuning } from "./tuning";

/** Everything about a corpus that does not change with the viewport: computed once per spec. */
export interface Scene {
  byId: ReadonlyMap<string, MapNode>;
  shapes: ReadonlyMap<string, Ring[]>;
  labels: readonly PlacedLabel[];
}

function largestRing(rings: readonly Ring[]): Ring | undefined {
  let best: Ring | undefined;
  for (const r of rings) if (!best || ringArea(r) > ringArea(best)) best = r;
  return best;
}

/**
 * Only the fields this function actually reads, not the full `Tuning`/`Theme`
 * — so a caller can memoize its own call on just those primitive values
 * (e.g. `CorpusMap`, where `tuning`/`theme` objects are minted fresh on
 * every render for an inline literal prop) without depending on unstable
 * whole-object identity for fields it never uses.
 */
export function buildScene(
  spec: MapSpec,
  tuning: Pick<Tuning, "hullPadding" | "labelClasses">,
  theme: Pick<Theme, "territoryFonts">,
  measure: Measure,
  fitScale: number,
): Scene {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  // Territories too small to measure their own spacing get disks 1% of the corpus wide.
  const fallback = 0.01 * Math.max(extent(spec.nodes.map((n) => [n.x, n.y] as Point)), 1e-9);
  const shapes = new Map<string, Ring[]>();
  const inputs = spec.territories.map((t) => {
    const pts = t.members.flatMap((id) => {
      const n = byId.get(id);
      return n ? [[n.x, n.y] as Point] : [];
    });
    let rings: Ring[];
    if (t.boundary) {
      rings = [t.boundary.map(([x, y]) => [x, y] as Point)];
    } else {
      const s = pts.length >= 3 ? spacing(pts, 0.9) : 0;
      // Too few members to measure spacing: overlap the disks so one or two
      // members still read as one region, never as separate dots.
      const r = s > 0 ? tuning.hullPadding * s : Math.max(fallback, 0.6 * extent(pts));
      rings = disksOutline(pts, r);
    }
    shapes.set(t.id, rings);
    const ring = largestRing(rings);
    const anchor: Point =
      ring && ring.length >= 3 ? poleOfInaccessibility(ring, extent(ring) * 0.01) : [t.centroid[0], t.centroid[1]];
    return { id: t.id, name: t.name, anchor, members: t.members.length };
  });
  return { byId, shapes, labels: placeLabels(inputs, theme.territoryFonts, tuning.labelClasses, measure, fitScale) };
}
