import { describe, expect, it } from "vitest";
import type { PlacedLabel } from "./placement";
import { sameLabels } from "./sameLabels";

const LABEL: PlacedLabel = {
  id: "t",
  name: "Territory",
  anchor: [1, 2],
  labelClass: "large",
  width: 80,
  height: 20,
  activeFromScale: 1.5,
};
const OTHER: PlacedLabel = { ...LABEL, id: "u", anchor: [5, 6] };

describe("sameLabels", () => {
  it("compares two placements built from the same values as equal", () => {
    expect(sameLabels([{ ...LABEL }, { ...OTHER }], [{ ...LABEL }, { ...OTHER }])).toBe(true);
  });

  it("tells apart a changed scale, width, anchor or order", () => {
    expect(sameLabels([LABEL], [{ ...LABEL, activeFromScale: 2 }])).toBe(false);
    expect(sameLabels([LABEL], [{ ...LABEL, width: 81 }])).toBe(false);
    expect(sameLabels([LABEL], [{ ...LABEL, anchor: [1, 3] }])).toBe(false);
    expect(sameLabels([LABEL, OTHER], [OTHER, LABEL])).toBe(false);
  });

  it("tells apart different lengths", () => {
    expect(sameLabels([LABEL], [LABEL, OTHER])).toBe(false);
    expect(sameLabels([], [])).toBe(true);
  });
});
