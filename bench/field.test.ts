import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, paint } from "../src/canvas/painter";
import { RecordingSurface } from "../src/canvas/surface";
import type { MapSpec } from "../src/spec";

// One frame at 60fps. This is the stated target, not a measured figure — see
// the note in docs/superpowers/specs/2026-09-13-corpus-map-design.md. It is
// scheduled to be replaced with a number derived from a real CI measurement
// plus headroom, once the first CI run produces one.
const BUDGET_MS = 16;

function bigSpec(n: number): MapSpec {
  return {
    version: "1",
    territories: [],
    nodes: Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      x: Math.cos(i) * 500,
      y: Math.sin(i) * 500,
      territory: null,
    })),
  };
}

describe("point field", () => {
  it(`paints 10000 nodes within ${BUDGET_MS}ms`, () => {
    const spec = bigSpec(10_000);
    const surface = new RecordingSurface();
    const vp = { scale: 1, tx: 0, ty: 0 };
    paint(surface, spec, vp, "mid", DEFAULT_THEME); // warm up
    const start = performance.now();
    paint(new RecordingSurface(), spec, vp, "mid", DEFAULT_THEME);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
