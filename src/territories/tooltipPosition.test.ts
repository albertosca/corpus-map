import { describe, expect, it } from "vitest";
import { TOOLTIP_OFFSET, tooltipPosition } from "./tooltipPosition";

describe("tooltipPosition", () => {
  it("sits below-right of the cursor by the offset", () => {
    expect(tooltipPosition(100, 100, 50, 20, 400, 300)).toEqual({
      left: 100 + TOOLTIP_OFFSET,
      top: 100 + TOOLTIP_OFFSET,
    });
  });

  it("flips at the edges to stay inside the map", () => {
    expect(tooltipPosition(390, 290, 50, 20, 400, 300)).toEqual({
      left: 390 - TOOLTIP_OFFSET - 50,
      top: 290 - TOOLTIP_OFFSET - 20,
    });
  });

  it("never goes past the top-left corner, even for a box larger than the map", () => {
    expect(tooltipPosition(10, 10, 500, 400, 400, 300)).toEqual({ left: 0, top: 0 });
  });
});
