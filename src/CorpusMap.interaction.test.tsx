import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
    { id: "c", label: "C", x: 5, y: 5, territory: null },
  ],
};

// fitSpec for this 10x10 box in 400x300 with 24px padding: usable 352x252,
// scale = min(352 / 10, 252 / 10) = 25.2, centred so node c (5, 5) sits at
// (200, 150) and node a (0, 0) at (200 - 5 * 25.2, 150 - 5 * 25.2) = (74, 24).
const FIT_SCALE = 25.2;
const CENTRE = { clientX: 200, clientY: 150 };

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

function cardLeft(container: HTMLElement, id: string): number {
  return Number.parseFloat((container.querySelector(`[data-card="${id}"]`) as HTMLElement).style.left);
}

function renderMap(thresholds: { midAt: number; nearAt: number }, onRegimeChange?: (r: string) => void) {
  return render(
    <CorpusMap
      spec={spec}
      renderCard={(n) => <div>{n.label}</div>}
      width={400}
      height={300}
      thresholds={thresholds}
      onRegimeChange={onRegimeChange}
    />,
  );
}

describe("CorpusMap interaction", () => {
  it("shows cards after zooming in far enough", () => {
    const { container } = renderMap({ midAt: 50, nearAt: 100 });
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
    // One 120-unit notch multiplies the scale by exp(120 * 0.002) = exp(0.24)
    // ≈ 1.2712. From 25.2, six notches give 25.2 * exp(1.44) ≈ 106.4 ≥ 100
    // (five give ≈ 83.7, short of nearAt), well inside the 64x clamp.
    for (let i = 0; i < 6; i += 1) fireEvent.wheel(surface(container), { deltaY: -120, ...CENTRE });
    expect(container.querySelectorAll("[data-card]").length).toBeGreaterThan(0);
  });

  it("clamps wheel zoom-in at 64x the fitted scale (I3)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    // 100 notches is ~6x more than the ~17 needed to hit the clamp (see the
    // "shows cards" test above), so the scale is pinned at fit * 64 well
    // before the loop ends and every further notch is a no-op. Unclamped,
    // exp(0.24 * 100) ≈ 2.65e10, i.e. the scale would overflow to roughly
    // fit * 2.65e10 ≈ 6.7e11 — ten orders of magnitude past the 64x clamp,
    // so the assertions below still fail hard on revert.
    for (let i = 0; i < 100; i += 1) fireEvent.wheel(surface(container), { deltaY: -120, ...CENTRE });
    expect(container.querySelectorAll('[data-card="c"]')).toHaveLength(1);
    // Node c is the anchor and stays put; node a is 5 * 25.2 * 64 px off
    // screen at the clamp, so it is the only card left.
    expect(container.querySelectorAll("[data-card]")).toHaveLength(1);
    expect(cardLeft(container, "c")).toBeCloseTo(200, 6);
  });

  it("clamps wheel zoom-out at 1/8 of the fitted scale (I3)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    // 100 notches is far more than needed to hit the clamp. Unclamped,
    // exp(-0.24 * 100) ≈ 3.78e-11, i.e. the scale would underflow to roughly
    // fit * 3.78e-11 ≈ 9.5e-10 — close enough to 0 that every node still
    // collapses onto the anchor at x = 200, so the assertion below still
    // fails hard on revert; clamped at 25.2 / 8 = 3.15, node a stays 5 * 3.15
    // px left of it.
    for (let i = 0; i < 100; i += 1) fireEvent.wheel(surface(container), { deltaY: 120, ...CENTRE });
    expect(cardLeft(container, "a")).toBeCloseTo(200 - 5 * (FIT_SCALE / 8), 6);
  });

  it("zooms in proportion to the wheel delta (I3)", () => {
    // Anchored at (100, 100), node a (74, 24) stays on screen after a full
    // notch: left 100 - 26 * 1.2712 ≈ 67, top 100 - 76 * 1.2712 ≈ 3.4.
    // Anchored at the centre its top would go negative and the card unmount.
    const anchor = { clientX: 100, clientY: 100 };
    const small = renderMap({ midAt: 0, nearAt: 0 });
    const before = cardLeft(small.container, "a");
    fireEvent.wheel(surface(small.container), { deltaY: -10, ...anchor });
    const smallShift = before - cardLeft(small.container, "a");
    small.unmount();

    const large = renderMap({ midAt: 0, nearAt: 0 });
    fireEvent.wheel(surface(large.container), { deltaY: -120, ...anchor });
    const largeShift = before - cardLeft(large.container, "a");

    // exp(0.02) - 1 ≈ 0.0202 versus exp(0.24) - 1 ≈ 0.2712: a 13x ratio. A
    // fixed per-event factor gives 1x and fails here.
    expect(smallShift).toBeGreaterThan(0);
    expect(largeShift).toBeGreaterThan(smallShift * 5);
  });

  it("prevents the page from scrolling under the map (I4)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const event = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, ...CENTRE });
    surface(container).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports the initial regime on mount and each crossing after that", () => {
    const onRegimeChange = vi.fn();
    const { container } = renderMap({ midAt: 50, nearAt: 100 }, onRegimeChange);
    expect(onRegimeChange.mock.calls).toEqual([["far"]]);
    for (let i = 0; i < 6; i += 1) fireEvent.wheel(surface(container), { deltaY: -120, ...CENTRE });
    expect(onRegimeChange.mock.calls).toEqual([["far"], ["mid"], ["near"]]);
  });

  it("a press released over a card selects that node; a drag does not (I11)", () => {
    // jsdom lays nothing out, so give each card a 100x40 box at its
    // positioned corner and the surface its full box.
    const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.getAttribute("data-card");
      const [x, y, w, h] =
        id === null
          ? [0, 0, 400, 300]
          : [Number.parseFloat(this.style.left), Number.parseFloat(this.style.top), 100, 40];
      return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const onSelect = vi.fn();
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={400}
          height={300}
          thresholds={{ midAt: 0, nearAt: 0 }}
          onSelect={onSelect}
        />,
      );
      const el = surface(container);
      // Node a's card box is (74, 24)-(174, 64).
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(el, { clientX: 81, clientY: 31, pointerId: 1 });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a", label: "A" }));

      // A drag that releases over a card is a pan, not a selection — and
      // must still land over a card to be a real test of the guard. Node a's
      // box starts at (74,24)-(174,64); pressing at (80,30) and moving 10 px
      // right to (90,30) exceeds CLICK_SLOP (4) and pans the box to
      // (84,24)-(184,64), so the release point (90,30) is still inside it.
      // Without the guard this would wrongly select node a.
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 1 });
      fireEvent.pointerMove(el, { clientX: 90, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(el, { clientX: 90, clientY: 30, pointerId: 1 });
      expect(onSelect).toHaveBeenCalledTimes(1);

      // Empty ground selects nothing. After the 10 px pan above, the three
      // boxes are a (84,24)-(184,64), b (336,276)-(436,316) and c
      // (210,150)-(310,190); (390,90) is outside all three.
      fireEvent.pointerDown(el, { clientX: 390, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(el, { clientX: 390, clientY: 90, pointerId: 1 });
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      rects.mockRestore();
    }
  });

  it("drag moves the rendered cards", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    const el = surface(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 160, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).not.toBe(before);
  });

  it("ignores pointer movement that did not start with a press", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    fireEvent.pointerMove(surface(container), { clientX: 300, clientY: 100, pointerId: 1 });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).toBe(before);
  });
});
