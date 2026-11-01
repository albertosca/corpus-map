import { describe, expect, it } from "vitest";
import { followInto } from "./follow";

const area = { left: 0, top: 0, width: 400, height: 300 };
const view = { scale: 2, tx: 0, ty: 0 };

describe("followInto (spec spatial keys §4)", () => {
  it("returns the same viewport when the point is inside the shrunk area", () => {
    expect(followInto(view, 100, 75, area)).toBe(view);
  });

  it("keeps a point lying exactly on the margin", () => {
    expect(followInto(view, 20, 15, area)).toBe(view);
  });

  it("centres on a point inside the box but within the 10% margin", () => {
    expect(followInto(view, 195, 75, area)).toEqual({ scale: 2, tx: 200 - 390, ty: 150 - 150 });
  });

  it("centres on a point above the view", () => {
    expect(followInto(view, 100, -10, area)).toEqual({ scale: 2, tx: 200 - 200, ty: 150 + 20 });
  });

  it("centres in the usable area, not the box, when insets cover a side", () => {
    const covered = { left: 0, top: 0, width: 200, height: 300 };
    expect(followInto(view, 150, 75, covered)).toEqual({ scale: 2, tx: 100 - 300, ty: 150 - 150 });
  });

  it("honours an inset on the left and top", () => {
    const covered = { left: 100, top: 50, width: 300, height: 250 };
    expect(followInto(view, 40, 75, covered)).toEqual({ scale: 2, tx: 250 - 80, ty: 175 - 150 });
  });
});
