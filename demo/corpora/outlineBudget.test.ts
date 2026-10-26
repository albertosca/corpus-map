import { describe, expect, it } from "vitest";
import { estimateText } from "../../src/labels/placement";
import { paint } from "../../src/shared/paint";
import { buildScene } from "../../src/shared/scene";
import { RecordingSurface } from "../../src/shared/surface";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitSpec } from "../../src/viewport/fit";
import arxivJson from "./arxiv.json";
import { arxivSpec } from "./index";

const WIDTH = 1440;
const HEIGHT = 900;

// The budget behind the batched outlines (backlog, measured in slice D): a
// stroke costs a path and a rasterisation of its own, so the territory
// outlines are drawn as one path per colour, alpha and width instead of one
// per ring. Counted draw calls, not milliseconds: the count is the cause the
// trace pointed at, and it does not move with machine load.
describe("territory outline budget on the arXiv corpus", () => {
  const spec = arxivSpec(arxivJson);
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const viewport = fitSpec(spec, WIDTH, HEIGHT, 24);

  const outlineStrokes = (groupAlpha: number, dimmed: ReadonlySet<string> = new Set()) => {
    const surface = new RecordingSurface();
    paint(
      surface,
      scene,
      spec,
      viewport,
      { regime: "far", pointAlpha: 0, width: WIDTH, height: HEIGHT, groupAlpha, dimmed },
      DEFAULT_THEME,
    );
    return surface.calls.filter((call) => call === "outline").length;
  };

  const distinct = (colours: ReadonlyMap<string, string>) => new Set(colours.values()).size;
  const ringCount = [...scene.shapes.values()].flat().filter((ring) => ring.length >= 3).length;

  it("has more rings than colours, so the budget is a real constraint", () => {
    expect(ringCount).toBeGreaterThan(distinct(scene.colours) + distinct(scene.groupColours));
  });

  it.each([0, 0.5, 1])("strokes at most one outline per colour at groupAlpha %s", (groupAlpha) => {
    expect(outlineStrokes(groupAlpha)).toBeLessThanOrEqual(distinct(scene.colours) + distinct(scene.groupColours));
  });

  it("at most doubles the strokes when some territories are dimmed (one more per colour at the dimmed alpha)", () => {
    const half = new Set(scene.paintOrder.filter((_, index) => index % 2 === 0));
    expect(outlineStrokes(0, half)).toBeLessThanOrEqual(2 * (distinct(scene.colours) + distinct(scene.groupColours)));
  });
});
