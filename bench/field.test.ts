import { describe, expect, it } from "vitest";
import { generateCorpus, TERRITORY_COUNT } from "../fixtures/synthetic/generate";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "../src/labels/itemLabels";
import { estimateText } from "../src/labels/placement";
import { paint } from "../src/shared/paint";
import { buildScene, groupLabelsFor } from "../src/shared/scene";
import { RecordingSurface } from "../src/shared/surface";
import { DEFAULT_THEME } from "../src/shared/theme";
import { DEFAULT_TUNING } from "../src/shared/tuning";
import { fitScene } from "../src/viewport/fitScene";

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

  it(`paints a far frame with a search active within ${BUDGET_MS}ms, or twice the same corpus's mid frame on a loaded runner (median of ${SAMPLES})`, () => {
    // Where a corpus opens and a search now shows: every point dimmed but the matches, ringed.
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const viewport = { scale: 0.05, tx: 200, ty: 150 };
    const box = { width: 1280, height: 800 };
    const searching = {
      regime: "far" as const,
      pointAlpha: 0,
      ...box,
      matches: new Set(spec.nodes.filter((_node, position) => position % 20 === 0).map((node) => node.id)),
    };
    const baseline = { regime: "mid" as const, pointAlpha: 1, ...box };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

    for (let index = 0; index < WARM_UPS; index += 1) {
      paint(new RecordingSurface(), scene, spec, viewport, searching, DEFAULT_THEME);
      paint(new RecordingSurface(), scene, spec, viewport, baseline, DEFAULT_THEME);
    }
    // Interleaved, so a runner that slows down slows both frames alike.
    const searchSamples: number[] = [];
    const baselineSamples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, scene, spec, viewport, searching, DEFAULT_THEME);
      searchSamples.push(performance.now() - start);
      expect(surface.circles.length + surface.hollowCircles.length).toBeGreaterThan(10_000);
      const baselineStart = performance.now();
      paint(new RecordingSurface(), scene, spec, viewport, baseline, DEFAULT_THEME);
      baselineSamples.push(performance.now() - baselineStart);
    }
    const searchMs = median(searchSamples);
    const baselineMs = median(baselineSamples);
    console.log(`far search paint median ${searchMs.toFixed(2)}ms, mid baseline ${baselineMs.toFixed(2)}ms`);
    expect(searchMs).toBeLessThan(Math.max(BUDGET_MS, baselineMs * 2));
  });

  it(`paints a near frame with item labels within ${BUDGET_MS}ms (median of ${SAMPLES})`, () => {
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    // Eight times the mid frame's scale, about the same corner: a near view.
    const viewport = { scale: 0.4, tx: 200, ty: 150 };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const itemLabels = placeItemLabels(
      spec,
      scene.labels,
      { font: DEFAULT_ITEM_LABEL_FONT, width: DEFAULT_TUNING.itemLabelWidth, lines: DEFAULT_TUNING.itemLabelLines },
      estimateText,
    );
    const frame = { regime: "near" as const, pointAlpha: 1, width: 1280, height: 800, itemLabels, itemLabelAlpha: 1 };

    for (let index = 0; index < WARM_UPS; index += 1)
      paint(new RecordingSurface(), scene, spec, viewport, frame, DEFAULT_THEME);
    const samples: number[] = [];
    let drawnTexts = 0;
    for (let index = 0; index < SAMPLES; index += 1) {
      const surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
      samples.push(performance.now() - start);
      drawnTexts = surface.texts.length;
    }
    // The same frame with the labels faded out draws only the names: the labels must add text on top of them.
    const namesOnly = new RecordingSurface();
    paint(namesOnly, scene, spec, viewport, { ...frame, itemLabelAlpha: 0 }, DEFAULT_THEME);
    expect(drawnTexts).toBeGreaterThan(namesOnly.texts.length);
    const medianMs = median(samples);
    console.log(
      `near paint median ${medianMs.toFixed(2)}ms over ${SAMPLES} samples (min ${Math.min(...samples).toFixed(2)}ms), ${drawnTexts} texts`,
    );
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });

  it(`paints the 10,000-item corpus at a phone's box within ${BUDGET_MS}ms (median of ${SAMPLES}, spec mobile §7)`, () => {
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const width = 375;
    const height = 812;
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    // Three times the fitted scale about the box centre, with the compact family names: a phone in the mid regime.
    const fit = fitScene(spec, { ...scene, groupLabels: groupLabelsFor(scene, width) }, width, height, 24);
    const zoom = 3;
    const viewport = {
      scale: fit.scale * zoom,
      tx: width / 2 - (width / 2 - fit.tx) * zoom,
      ty: height / 2 - (height / 2 - fit.ty) * zoom,
    };
    const frame = { regime: "mid" as const, pointAlpha: 1, width, height, groupAlpha: 1, compactGroupNames: true };

    for (let index = 0; index < WARM_UPS; index += 1)
      paint(new RecordingSurface(), scene, spec, viewport, frame, DEFAULT_THEME);
    const samples: number[] = [];
    let surface = new RecordingSurface();
    for (let index = 0; index < SAMPLES; index += 1) {
      surface = new RecordingSurface();
      const start = performance.now();
      paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
      samples.push(performance.now() - start);
    }
    // The frame is the one a phone draws: compact family names, when the corpus has families.
    if (scene.groups.length > 0)
      expect(surface.texts.some((drawn) => drawn.font === scene.compactGroupFont)).toBe(true);
    const medianMs = median(samples);
    console.log(
      `phone paint median ${medianMs.toFixed(2)}ms over ${SAMPLES} samples (min ${Math.min(...samples).toFixed(2)}ms), ${scene.groups.length} families`,
    );
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });
});
