import { describe, expect, it } from "vitest";
import { fromPublic, sameView, sanitise, toPublic } from "./publicViewport";

const band = { minimum: 1 / 8, maximum: 64 };

describe("public viewport", () => {
  it("round-trips public -> pixels -> public within 1e-9", () => {
    const view = { centre: [12.5, -3.25] as [number, number], zoom: 6.4 };
    const back = toPublic(fromPublic(view, 0.37, 640, 480), 0.37, 640, 480);
    expect(Math.abs(back.zoom - view.zoom)).toBeLessThan(1e-9);
    expect(Math.abs(back.centre[0] - view.centre[0])).toBeLessThan(1e-9);
    expect(Math.abs(back.centre[1] - view.centre[1])).toBeLessThan(1e-9);
  });

  it("reads the world point at the box centre and the scale over the fit", () => {
    expect(toPublic({ scale: 4, tx: 100, ty: 50 }, 2, 400, 300)).toEqual({ centre: [25, 25], zoom: 2 });
  });

  it("is box-independent: the same public view on two boxes shows the same centre", () => {
    const view = { centre: [5, 5] as [number, number], zoom: 3 };
    const small = fromPublic(view, 1, 200, 100);
    const large = fromPublic(view, 2, 800, 600);
    expect(toPublic(small, 1, 200, 100).centre).toEqual([5, 5]);
    expect(toPublic(large, 2, 800, 600).centre).toEqual([5, 5]);
  });

  it.each([
    ["NaN centre", { centre: [Number.NaN, 0], zoom: 1 }],
    ["Infinity centre", { centre: [0, Number.POSITIVE_INFINITY], zoom: 1 }],
    ["short centre", { centre: [0], zoom: 1 }],
    ["string centre", { centre: ["0", 0], zoom: 1 }],
    ["missing centre", { zoom: 1 }],
    ["zero zoom", { centre: [0, 0], zoom: 0 }],
    ["negative zoom", { centre: [0, 0], zoom: -1 }],
    ["NaN zoom", { centre: [0, 0], zoom: Number.NaN }],
    ["Infinity zoom", { centre: [0, 0], zoom: Number.POSITIVE_INFINITY }],
    ["null", null],
    ["undefined", undefined],
  ])("sanitise rejects %s", (_name, input) => {
    expect(sanitise(input, band)).toBeNull();
  });

  it("sanitise clamps the zoom to the band", () => {
    expect(sanitise({ centre: [1, 2], zoom: 1000 }, band)).toEqual({ centre: [1, 2], zoom: 64 });
    expect(sanitise({ centre: [1, 2], zoom: 0.001 }, band)).toEqual({ centre: [1, 2], zoom: 1 / 8 });
    expect(sanitise({ centre: [1, 2], zoom: 3 }, band)).toEqual({ centre: [1, 2], zoom: 3 });
  });

  it("sameView tolerates float noise but not a real move", () => {
    const base = { centre: [1000, -2] as [number, number], zoom: 6 };
    expect(sameView(base, { centre: [1000 + 1e-10, -2], zoom: 6 + 1e-12 })).toBe(true);
    expect(sameView(base, { centre: [1000.001, -2], zoom: 6 })).toBe(false);
    expect(sameView(base, { centre: [1000, -2], zoom: 6.0001 })).toBe(false);
  });
});
