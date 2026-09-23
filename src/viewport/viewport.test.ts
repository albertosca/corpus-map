import { describe, expect, it } from "vitest";
import { panBy, toScreen, toWorld, type Viewport, zoomAt, zoomTo } from "./viewport";

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

  it("zoomTo lands on the target scale exactly and keeps the anchor fixed", () => {
    // 1.5546 * (100 / 1.5546) is 99.99999999999999 in IEEE doubles; zoomTo
    // must return 100, not that.
    const awkward: Viewport = { scale: 1.554629495393176, tx: 10, ty: -5 };
    const before = toWorld(awkward, 400, 300);
    const z = zoomTo(awkward, 400, 300, 100);
    expect(z.scale).toBe(100);
    const after = toWorld(z, 400, 300);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });
});

describe("metric 3: the point under the cursor stays put", () => {
  it("keeps the world point under the cursor within 0.5 px, and k in then k out returns", () => {
    const start = { scale: 3, tx: 17, ty: -40 };
    const [cx, cy] = [412.5, 233.25];
    const anchor = toWorld(start, cx, cy);
    let v = start;
    for (let k = 0; k < 12; k += 1) {
      v = zoomTo(v, cx, cy, v.scale * 1.27);
      const [wx, wy] = toWorld(v, cx, cy);
      expect(Math.hypot((wx - anchor[0]) * v.scale, (wy - anchor[1]) * v.scale)).toBeLessThan(0.5);
    }
    for (let k = 0; k < 12; k += 1) v = zoomTo(v, cx, cy, v.scale / 1.27);
    expect(Math.abs(v.scale - start.scale) / start.scale).toBeLessThan(0.001);
    expect(Math.hypot(v.tx - start.tx, v.ty - start.ty)).toBeLessThan(0.5);
  });
});
