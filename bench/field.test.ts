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
  const sorted = [...values].sort((first, second) => first - second);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid === undefined) throw new Error("median of an empty list");
  return mid;
}

describe("point field", () => {
  it(`paints the 10,000-item synthetic corpus with hulls within ${BUDGET_MS}ms (median of ${SAMPLES})`, () => {
    // The generator carries planted hard cases (U, L, dense cluster) and
    // 10k is the parent spec's declared limit.
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const viewport = { scale: 0.05, tx: 200, ty: 150 };
    const frame = { regime: "mid" as const, pointAlpha: 1, width: 1280, height: 800 };

    const sceneStart = performance.now();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    console.log(`buildScene: ${(performance.now() - sceneStart).toFixed(2)}ms for ${spec.nodes.length} items`);

    for (let index = 0; index < WARM_UPS; index += 1)
      paint(new RecordingSurface(), scene, spec, viewport, frame, DEFAULT_THEME);
    const samples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
      samples.push(performance.now() - start);
      expect(surface.polygons.length).toBeGreaterThanOrEqual(TERRITORY_COUNT);
      expect(surface.circles.length + surface.hollowCircles.length).toBe(10_000);
    }
    const medianMs = median(samples);
    console.log(
      `paint median ${medianMs.toFixed(2)}ms over ${SAMPLES} samples (min ${Math.min(...samples).toFixed(2)}ms)`,
    );
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });
});
