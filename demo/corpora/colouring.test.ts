import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import { estimateText } from "../../src/labels/placement";
import { buildScene } from "../../src/shared/scene";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { DARK_THEME, DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { visibleBorders } from "../../src/territories/colour";
import arxiv from "./arxiv.json";

/** Share of the visible border, in raster cells, where both sides got the same colour. */
function conflictShare(spec: MapSpec, palette: string[]): number {
  const scene = buildScene(spec, DEFAULT_TUNING, { ...DEFAULT_THEME, palette }, estimateText);
  const { neighbours } = visibleBorders(scene.shapes, scene.paintOrder);
  let total = 0;
  let conflicting = 0;
  for (const [id, around] of neighbours) {
    for (const [neighbour, length] of around) {
      total += length;
      if (scene.colours.get(id) === scene.colours.get(neighbour)) conflicting += length;
    }
  }
  return total === 0 ? 0 : conflicting / total;
}

describe("territory colouring on real corpora", () => {
  const corpora: Array<[string, MapSpec, number]> = [
    ["arXiv", validateSpec(arxiv), 0.001],
    ["synthetic 10,000", generateCorpus({ seed: 1, size: 10_000 }), 0],
  ];

  it.each(corpora)("%s: same-colour visible border stays within its bound, in both themes", (_name, spec, bound) => {
    expect(conflictShare(spec, DEFAULT_THEME.palette)).toBeLessThanOrEqual(bound);
    expect(conflictShare(spec, DARK_THEME.palette)).toBeLessThanOrEqual(bound);
  });
});
