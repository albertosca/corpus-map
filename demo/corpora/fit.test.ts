import { describe, expect, it } from "vitest";
import { estimateText } from "../../src/labels/placement";
import { buildScene } from "../../src/shared/scene";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitScene } from "../../src/viewport/fitScene";
import { toScreen } from "../../src/viewport/viewport";
import arxiv from "./arxiv.json";
import { withExpandedArxiv } from "./compact";
import { constellationsSpec } from "./constellations";
import { elementsSpec } from "./elements";

const BOXES: Array<[number, number]> = [
  [800, 600],
  [375, 640],
  [1280, 800],
  [320, 480],
];

/**
 * Names drawn at the fitted view (active, not wider or taller than the box) that cross the box edge.
 * The fit is far (ratio 1, below the default `midAt`), where a scene with groups paints its group
 * names and fades the territory names out, so those are the names checked, as `fitScene` keeps them.
 */
function cutNames(spec: MapSpec, width: number, height: number): string[] {
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const viewport = fitScene(spec, scene, width, height, 24);
  const drawn = scene.groupLabels.length > 0 ? scene.groupLabels : scene.labels;
  return drawn
    .filter((label) => viewport.scale >= label.activeFromScale && label.width <= width && label.height <= height)
    .filter((label) => {
      const [horizontal, vertical] = toScreen(viewport, label.anchor[0], label.anchor[1]);
      return (
        horizontal - label.width / 2 < 0 ||
        horizontal + label.width / 2 > width ||
        vertical - label.height / 2 < 0 ||
        vertical + label.height / 2 > height
      );
    })
    .map((label) => label.name);
}

describe("the fitted first view cuts no name", () => {
  const corpora: Array<[string, unknown]> = [
    ["arXiv", withExpandedArxiv(arxiv)],
    ["elements", elementsSpec],
    ["constellations", constellationsSpec],
  ];
  for (const [name, body] of corpora) {
    it.each(BOXES)(`${name} at %d x %d`, (width, height) => {
      expect(cutNames(validateSpec(body), width, height)).toEqual([]);
    });
  }
});
