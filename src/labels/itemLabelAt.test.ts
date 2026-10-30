import { describe, expect, it } from "vitest";
import { itemLabelAt } from "./itemLabelAt";
import type { PlacedItemLabel } from "./itemLabels";

const label = (id: string, activeFromScale: number): PlacedItemLabel => ({
  id,
  territory: null,
  anchor: [0, 0],
  lines: [id],
  width: 60,
  height: 20,
  offset: [0, -16],
  activeFromScale,
});
const VIEW = { scale: 2, tx: 100, ty: 100 };
const BOX = { width: 400, height: 300, dimmed: new Set<string>() };

describe("itemLabelAt", () => {
  it("finds a drawn plate under the pointer, the last painted on top", () => {
    expect(itemLabelAt([label("under", 0), label("over", 0)], VIEW, BOX, 100, 84)).toBe("over");
  });
  it("ignores a plate not drawn at this scale, and misses outside every plate", () => {
    expect(itemLabelAt([label("later", 5)], VIEW, BOX, 100, 84)).toBeNull();
    expect(itemLabelAt([label("a", 0)], VIEW, BOX, 100, 100)).toBeNull();
  });
});
