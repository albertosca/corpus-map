import { describe, expect, it } from "vitest";
import { estimateText } from "../../src/labels/placement";
import { visibleNodes } from "../../src/lod/visible";
import { buildScene, groupLabelsFor } from "../../src/shared/scene";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { familyCounts, familyFocus } from "../../src/territories/familyFocus";
import { fitScene } from "../../src/viewport/fitScene";
import { elementsSpec as spec } from "./elements";

// The family focus on a small corpus (review I-1 of the arXiv engine map): the
// Chemical elements corpus has 54 items in 3 families, so a screen never holds
// the 96 items the arXiv maps need before the shares are trusted. A view
// centred on one family still dims the others, as it did before that change.
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
const familyOfLeaf = new Map(scene.groups.flatMap((group) => group.members.map((member) => [member, group.id])));
const families = scene.groups.map((group) => group.id);
const BOXES = [
  [1440, 900],
  [375, 812],
] as const;

describe("family focus on the Chemical elements corpus (review I-1)", () => {
  it("dims another family in a view centred on one, at every zoom from 1.5 to 3", () => {
    for (const [width, height] of BOXES) {
      const fit = fitScene(spec, { ...scene, groupLabels: groupLabelsFor(scene, width) }, width, height, 24);
      for (const ratio of [1.5, 2, 3]) {
        let dimmed = 0;
        for (const family of families) {
          const members = spec.nodes.filter(
            (node) => node.territory !== null && familyOfLeaf.get(node.territory) === family,
          );
          const centre: [number, number] = [
            members.reduce((sum, node) => sum + node.x, 0) / members.length,
            members.reduce((sum, node) => sum + node.y, 0) / members.length,
          ];
          const scale = fit.scale * ratio;
          const viewport = { scale, tx: width / 2 - centre[0] * scale, ty: height / 2 - centre[1] * scale };
          const counts = familyCounts(
            visibleNodes(spec, viewport, width, height, Number.POSITIVE_INFINITY),
            viewport,
            width,
            height,
            familyOfLeaf,
            families,
          );
          for (const weight of familyFocus(counts, DEFAULT_TUNING, spec.nodes.length).values())
            if (weight < 0.5) dimmed += 1;
        }
        // Measured: 4 to 6 of the 9 family weights below 0.5 before the arXiv engine map (1f3cdc7), 0 with FOCUS_CONFIDENT_ITEMS fixed at 96.
        expect(dimmed, `${width}x${height} at ratio ${ratio}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
