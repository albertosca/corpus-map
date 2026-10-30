import { describe, expect, it } from "vitest";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import type { PlacedItemLabel } from "./itemLabels";
import { drawnItemLabels, itemLabelRect, paintItemLabels } from "./paintItemLabels";

const label = (
  id: string,
  horizontal: number,
  activeFromScale: number,
  territory: string | null = null,
): PlacedItemLabel => ({
  id,
  territory,
  anchor: [horizontal, 0],
  lines: [`label ${id}`, "second"],
  width: 60,
  height: 31,
  offset: [0, -(31 / 2 + 6)],
  activeFromScale,
});
const BOX = { width: 400, height: 300, dimmed: new Set<string>() };
const VIEW = { scale: 2, tx: 100, ty: 150 };

describe("paintItemLabels", () => {
  it("draws exactly the labels whose scale is reached, plates crossing the edge included", () => {
    const labels = [label("a", 0, 1), label("b", 10, 3), label("edge", 148, 0)];
    expect(drawnItemLabels(labels, VIEW, BOX).map((each) => each.id)).toEqual(["a", "edge"]);
    const surface = new RecordingSurface();
    paintItemLabels(surface, labels, VIEW, DEFAULT_THEME, BOX);
    expect(surface.plates).toHaveLength(2);
  });

  it("puts the plate centred above the point, bottom 6 px above it, in the tooltip colours", () => {
    const surface = new RecordingSurface();
    paintItemLabels(surface, [label("a", 0, 0)], VIEW, DEFAULT_THEME, BOX);
    expect(surface.plates[0]).toMatchObject({
      left: 70,
      top: 150 - 6 - 31,
      width: 60,
      height: 31,
      fill: DEFAULT_THEME.hoverBackground,
    });
    expect(surface.texts.map((text) => text.text)).toEqual(["label a", "second"]);
    expect(surface.texts.every((text) => text.color === DEFAULT_THEME.hoverText)).toBe(true);
    expect(itemLabelRect(label("a", 0, 0), VIEW)).toEqual({ left: 70, top: 113, width: 60, height: 31 });
  });

  it("skips dimmed territories, plates larger than the canvas, and plates wholly off the canvas", () => {
    const dimmedBox = { ...BOX, dimmed: new Set(["t"]) };
    expect(drawnItemLabels([label("a", 0, 0, "t")], VIEW, dimmedBox)).toEqual([]);
    expect(drawnItemLabels([{ ...label("big", 0, 0), width: 500 }], VIEW, BOX)).toEqual([]);
    const surface = new RecordingSurface();
    paintItemLabels(surface, [label("far", 1000, 0)], VIEW, DEFAULT_THEME, BOX);
    expect(surface.plates).toHaveLength(0);
  });
});
