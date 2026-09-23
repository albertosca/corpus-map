import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, paint } from "../src/shared/painter";
import type { MapSpec, Territory } from "../src/shared/spec";
import { RecordingSurface } from "../src/shared/surface";

// One frame at 60fps. This is the stated target, not a measured figure — see
// the note in docs/superpowers/specs/2026-09-13-corpus-map-design.md. It is
// scheduled to be replaced with a number derived from a real CI measurement
// plus headroom, once the first CI run produces one.
const BUDGET_MS = 16;

const WARM_UPS = 2;
const SAMPLES = 7;

/**
 * Ten territories of a thousand members each, laid out on ten circles, with
 * no producer boundary — so a "mid" paint computes ten hulls of a thousand
 * points on top of drawing ten thousand marks. A loose field of the same
 * size would never exercise the hull path at all.
 */
function territorialSpec(territories: number, perTerritory: number): MapSpec {
  const nodes: MapSpec["nodes"] = [];
  const terr: Territory[] = [];
  for (let t = 0; t < territories; t += 1) {
    const cx = Math.cos((2 * Math.PI * t) / territories) * 3000;
    const cy = Math.sin((2 * Math.PI * t) / territories) * 3000;
    const members: string[] = [];
    for (let i = 0; i < perTerritory; i += 1) {
      const id = `t${t}n${i}`;
      const a = (2 * Math.PI * i) / perTerritory;
      nodes.push({ id, label: id, x: cx + Math.cos(a) * 500, y: cy + Math.sin(a) * 500, territory: `t${t}` });
      members.push(id);
    }
    terr.push({ id: `t${t}`, name: `Territory ${t}`, members, centroid: [cx, cy] });
  }
  return { version: "1", territories: terr, nodes };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid === undefined) throw new Error("median of an empty list");
  return mid;
}

describe("point field", () => {
  it(`paints 10 territories x 1000 nodes with hulls within ${BUDGET_MS}ms (median of ${SAMPLES})`, () => {
    const spec = territorialSpec(10, 1000);
    const vp = { scale: 0.05, tx: 200, ty: 150 };
    for (let i = 0; i < WARM_UPS; i += 1) paint(new RecordingSurface(), spec, vp, "mid", DEFAULT_THEME);
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, spec, vp, "mid", DEFAULT_THEME);
      samples.push(performance.now() - start);
      expect(surface.polygons).toHaveLength(10);
      expect(surface.circles).toHaveLength(10_000);
    }
    const med = median(samples);
    console.log(`paint median ${med.toFixed(2)}ms over ${SAMPLES} samples (min ${Math.min(...samples).toFixed(2)}ms)`);
    expect(med).toBeLessThan(BUDGET_MS);
  });
});
