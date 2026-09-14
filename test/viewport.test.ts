import { describe, expect, it } from "vitest";
import { panBy, toScreen, toWorld, type Viewport, zoomAt } from "../src/viewport";

const v: Viewport = { scale: 2, tx: 10, ty: -5 };

describe("viewport", () => {
  it("round-trips world to screen and back", () => {
    const [sx, sy] = toScreen(v, 3, 4);
    const [wx, wy] = toWorld(v, sx, sy);
    expect(wx).toBeCloseTo(3, 9);
    expect(wy).toBeCloseTo(4, 9);
  });

  it("pans without changing scale", () => {
    const p = panBy(v, 15, 25);
    expect(p.scale).toBe(v.scale);
    expect(p.tx).toBe(25);
    expect(p.ty).toBe(20);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const before = toWorld(v, 400, 300);
    const z = zoomAt(v, 400, 300, 1.7);
    const after = toWorld(z, 400, 300);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("zooming in then out by the inverse factor restores the viewport", () => {
    const z = zoomAt(zoomAt(v, 200, 100, 3), 200, 100, 1 / 3);
    expect(z.scale).toBeCloseTo(v.scale, 9);
    expect(z.tx).toBeCloseTo(v.tx, 9);
    expect(z.ty).toBeCloseTo(v.ty, 9);
  });
});
