import { describe, expect, it } from "vitest";
import { generateCorpus, TERRITORY_COUNT } from "../fixtures/synthetic/generate";
import { estimateText } from "../src/labels/placement";
import { paint } from "../src/shared/paint";
import { buildScene } from "../src/shared/scene";
import { RecordingSurface } from "../src/shared/surface";
import { DEFAULT_THEME } from "../src/shared/theme";
import { DEFAULT_TUNING } from "../src/shared/tuning";

// One frame at 60fps. This is the stated target, not a measured figure — see
// the note in docs/superpowers/specs/2026-09-13-corpus-map-design.md. It is
// scheduled to be replaced with a number derived from a real CI measurement
// plus headroom, once the first CI run produces one.
const BUDGET_MS = 16;

const WARM_UPS = 2;
const SAMPLES = 7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid === undefined) throw new Error("median of an empty list");
  return mid;
}

describe("point field", () => {
  it(`paints the 10,000-item synthetic corpus with hulls within ${BUDGET_MS}ms (median of ${SAMPLES})`, () => {
    // The generator carries planted hard cases (U, L, dense cluster) and
    // 10k is the parent spec's declared limit.
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const vp = { scale: 0.05, tx: 200, ty: 150 };
    const frame = { regime: "mid" as const, pointAlpha: 1 };

    const sceneStart = performance.now();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    console.log(`buildScene: ${(performance.now() - sceneStart).toFixed(2)}ms for ${spec.nodes.length} items`);

    for (let i = 0; i < WARM_UPS; i += 1) paint(new RecordingSurface(), scene, spec, vp, frame, DEFAULT_THEME);
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, scene, spec, vp, frame, DEFAULT_THEME);
      samples.push(performance.now() - start);
      expect(surface.polygons.length).toBeGreaterThanOrEqual(TERRITORY_COUNT);
      expect(surface.circles).toHaveLength(10_000);
    }
    const med = median(samples);
    console.log(`paint median ${med.toFixed(2)}ms over ${SAMPLES} samples (min ${Math.min(...samples).toFixed(2)}ms)`);
    expect(med).toBeLessThan(BUDGET_MS);
  });
});
