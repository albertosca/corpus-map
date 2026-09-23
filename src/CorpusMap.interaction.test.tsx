import { fireEvent, render } from "@testing-library/react";
import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitSpec } from "./viewport/fit";
import { toScreen } from "./viewport/viewport";

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

// A zero-size card frame collapses `layoutCards`'s first candidate to
// exactly `(anchorX + 6, anchorY)` — no candidate can ever overlap another
// placed card (a zero-area rectangle overlaps nothing) or run out of room,
// so every anchor always keeps this same, predictable offset regardless of
// where it sits in the box. Every test in this file that renders through
// `renderMap` is about wheel/drag/click/regime math, not about card
// layout, so this keeps their pixel arithmetic exactly what it was before
// cards were laid out around their anchor instead of pinned to it — modulo
// the constant +6 on `left` (`top` is unaffected, since `y - height / 2`
// with `height = 0` is just `y`). Real card sizing and the group fallback
// are covered by CardOverlay.test.tsx's dedicated tests and by the
// group-click test below, which uses a real size on purpose.
const NO_GROUPING = { width: 0, height: 0 };

function renderMap(thresholds: { midAt: number; nearAt: number }, onRegimeChange?: (r: string) => void) {
  return render(
    <CorpusMap
      spec={spec}
      renderCard={(n) => <div>{n.label}</div>}
      width={400}
      height={300}
      thresholds={thresholds}
      onRegimeChange={onRegimeChange}
      cardSize={NO_GROUPING}
    />,
  );
}

describe("CorpusMap interaction", () => {
  // Dragging is frame-coalesced (metric 13: CorpusMap.frame.test.tsx proves
  // the coalescing itself), so every test here that expects a pan to have
  // landed synchronously needs its one scheduled animation frame to run
  // immediately rather than on a real, unadvanced timer.
  let raf: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // A non-zero, incrementing id — not the sentinel-shaped `0`, which
    // reads the same as an unset ref and can mask a mock that was never
    // actually wired in.
    let rafSeq = 0;
    raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      rafSeq += 1;
      return rafSeq;
    });
  });
  afterEach(() => {
    raf.mockRestore();
  });

  it("shows cards after zooming in far enough", () => {
    // Thresholds are ratios of the fitted scale (25.2): 100 / 25.2 keeps the
    // absolute target this test was written against (scale 100).
    const { container } = renderMap({ midAt: 50 / FIT_SCALE, nearAt: 100 / FIT_SCALE });
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
    // screen at the clamp, so it is the only card left. +6 for the
    // zero-size card's layout gap (see `NO_GROUPING`).
    expect(container.querySelectorAll("[data-card]")).toHaveLength(1);
    expect(cardLeft(container, "c")).toBeCloseTo(200 + 6, 6);
  });

  it("clamps wheel zoom-out at 1/8 of the fitted scale (I3)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    // 100 notches is far more than needed to hit the clamp. Unclamped,
    // exp(-0.24 * 100) ≈ 3.78e-11, i.e. the scale would underflow to roughly
    // fit * 3.78e-11 ≈ 9.5e-10 — close enough to 0 that every node still
    // collapses onto the anchor at x = 200, so the assertion below still
    // fails hard on revert; clamped at 25.2 / 8 = 3.15, node a stays 5 * 3.15
    // px left of it. +6 for the zero-size card's layout gap (see
    // `NO_GROUPING`).
    for (let i = 0; i < 100; i += 1) fireEvent.wheel(surface(container), { deltaY: 120, ...CENTRE });
    expect(cardLeft(container, "a")).toBeCloseTo(200 - 5 * (FIT_SCALE / 8) + 6, 6);
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

  it("a ctrl-wheel (trackpad pinch) zooms more than a plain wheel of the same deltaY", () => {
    const anchor = { clientX: 100, clientY: 100 };
    const plain = renderMap({ midAt: 0, nearAt: 0 });
    const before = cardLeft(plain.container, "a");
    fireEvent.wheel(surface(plain.container), { deltaY: -10, ...anchor });
    const plainShift = before - cardLeft(plain.container, "a");
    plain.unmount();

    const pinch = renderMap({ midAt: 0, nearAt: 0 });
    fireEvent.wheel(surface(pinch.container), { deltaY: -10, ctrlKey: true, ...anchor });
    const pinchShift = before - cardLeft(pinch.container, "a");

    expect(plainShift).toBeGreaterThan(0);
    expect(pinchShift).toBeGreaterThan(plainShift);
  });

  it("a 3-line wheel event (deltaMode 1) zooms like a 120 px wheel event", () => {
    const anchor = { clientX: 100, clientY: 100 };
    const lines = renderMap({ midAt: 0, nearAt: 0 });
    fireEvent.wheel(surface(lines.container), { deltaY: 3, deltaMode: 1, ...anchor });
    const linesLeft = cardLeft(lines.container, "a");
    lines.unmount();

    const pixels = renderMap({ midAt: 0, nearAt: 0 });
    fireEvent.wheel(surface(pixels.container), { deltaY: 120, deltaMode: 0, ...anchor });
    const pixelsLeft = cardLeft(pixels.container, "a");

    expect(linesLeft).toBeCloseTo(pixelsLeft, 6);
  });

  it("prevents the page from scrolling under the map (I4)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const event = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, ...CENTRE });
    surface(container).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports the initial regime on mount and each crossing after that", () => {
    const onRegimeChange = vi.fn();
    const { container } = renderMap({ midAt: 50 / FIT_SCALE, nearAt: 100 / FIT_SCALE }, onRegimeChange);
    expect(onRegimeChange.mock.calls).toEqual([["far"]]);
    for (let i = 0; i < 6; i += 1) fireEvent.wheel(surface(container), { deltaY: -120, ...CENTRE });
    expect(onRegimeChange.mock.calls).toEqual([["far"], ["mid"], ["near"]]);
  });

  it("keeps the hysteresis regime stable under a ±3% oscillation around nearAt (metric 12, component level)", () => {
    const onRegimeChange = vi.fn();
    const { container } = renderMap({ midAt: 2, nearAt: 6 }, onRegimeChange);
    const el = surface(container);
    // Mounting starts at ratio 1 (vp = the fitted viewport). Each call moves
    // the ratio to an absolute target — not by compounding the previous
    // factor, which would only ever climb — by computing, from the ratio
    // this reference tracks, the single wheel factor that lands exactly on
    // it, mirroring `wheelZoomFactor`'s own exp/log formula.
    let ratio = 1;
    const wheelToRatio = (target: number) => {
      const factor = target / ratio;
      const deltaY = -Math.log(factor) / DEFAULT_TUNING.wheelSensitivity;
      fireEvent.wheel(el, { deltaY, ...CENTRE });
      ratio = target;
    };
    // Three notches of the cube root of nearAt (each under the default 2x
    // per-event clamp) land the ratio on nearAt, crossing far -> mid -> near.
    wheelToRatio(6 ** (1 / 3));
    wheelToRatio(6 ** (2 / 3));
    wheelToRatio(6);
    // Then oscillate the ratio between nearAt * 0.97 and nearAt * 1.03 — a
    // real dip below the raw threshold on every downswing, but still above
    // the default 5% hysteresis exit band (nearAt * 0.95), so the regime
    // must not flip back to "mid".
    for (let i = 0; i < 10; i += 1) wheelToRatio(i % 2 === 0 ? 6 * 0.97 : 6 * 1.03);
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
          cardSize={NO_GROUPING}
        />,
      );
      const el = surface(container);
      // With NO_GROUPING, node a's card box is its anchor (74, 24) offset by
      // the 6 px layout gap: (80, 24)-(180, 64) (mocked to 100x40 above).
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 81, clientY: 31, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a", label: "A" }));

      // A drag that releases over a card is a pan, not a selection — and
      // must still land over a card to be a real test of the guard. Node a's
      // box starts at (80,24)-(180,64); pressing at (80,30) and moving 10 px
      // right to (90,30) exceeds CLICK_SLOP (4) and pans the box to
      // (90,24)-(190,64), so the release point (90,30) is still inside it.
      // Without the guard this would wrongly select node a.
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerMove(el, { clientX: 90, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 90, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);

      // Empty ground selects nothing. After the 10 px pan above, the three
      // boxes are a (90,24)-(190,64), b (342,276)-(442,316) and c
      // (216,150)-(316,190); (390,90) is outside all three.
      fireEvent.pointerDown(el, { clientX: 390, clientY: 90, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 390, clientY: 90, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      rects.mockRestore();
    }
  });

  it("ignores a release from a non-primary button or a non-primary pointer, even squarely over a card (I11)", () => {
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
          cardSize={NO_GROUPING}
        />,
      );
      const el = surface(container);
      // With NO_GROUPING, node a's card box is (80, 24)-(180, 64) (see the
      // test above); a right-click press and release squarely inside it
      // must not select.
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 1, button: 2, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 80, clientY: 30, pointerId: 1, button: 2, isPrimary: true });
      expect(onSelect).not.toHaveBeenCalled();

      // A non-primary pointer (e.g. a second simultaneous touch) is ignored
      // even when it reports the primary button.
      fireEvent.pointerDown(el, { clientX: 80, clientY: 30, pointerId: 2, button: 0, isPrimary: false });
      fireEvent.pointerUp(el, { clientX: 80, clientY: 30, pointerId: 2, button: 0, isPrimary: false });
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      rects.mockRestore();
    }
  });

  it("drag moves the rendered cards", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    const el = surface(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(el, { clientX: 160, clientY: 100, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerUp(el, { pointerId: 1, button: 0, isPrimary: true });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).not.toBe(before);
  });

  it("ignores pointer movement that did not start with a press", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 0 });
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    fireEvent.pointerMove(surface(container), { clientX: 300, clientY: 100, pointerId: 1 });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).toBe(before);
  });

  it("shows the nearest node's name within the hover radius at the mid regime (metric 10)", () => {
    // midAt 0 puts the mount ratio (1) at or past the mid threshold; a
    // nearAt far out of reach keeps it from also crossing into "near".
    const { container } = renderMap({ midAt: 0, nearAt: 64 });
    const el = surface(container);
    // Node a sits at screen (74, 24) (see the FIT_SCALE comment at the top
    // of this file); 6 px away, not exactly on it — `nearestWithin` ties an
    // exact d = 0 match to the radius even at radius 0 (its own documented
    // "ties go to the earlier point" rule), which would make this pass
    // vacuously at radius 0 and defeat the point of the test.
    fireEvent.pointerMove(el, { clientX: 74 + 6, clientY: 24, pointerId: 1 });
    const hover = container.querySelector('[data-hover="a"]');
    expect(hover).not.toBeNull();
    expect(hover?.textContent).toBe("A");
  });

  it("shows nothing 13 px away from the nearest node, just outside the default 12 px hover radius (metric 10)", () => {
    // A fresh render, not a second move on the mount above: this file's
    // `requestAnimationFrame` mock runs its callback synchronously inside
    // the call itself, so the outer `rafId.current = requestAnimationFrame(...)`
    // assignment lands *after* the callback's own `rafId.current = null` —
    // a second move in the same mount would find `rafId.current` still
    // non-null and never re-schedule a flush. Real, asynchronous
    // `requestAnimationFrame` does not have this ordering issue.
    const { container } = renderMap({ midAt: 0, nearAt: 64 });
    const el = surface(container);
    // Node a is still the nearest node overall at this point, just outside
    // the radius.
    fireEvent.pointerMove(el, { clientX: 74 + 13, clientY: 24, pointerId: 1 });
    expect(container.querySelector("[data-hover]")).toBeNull();
  });

  it("costs zero additional commits while the pointer holds within radius of the same node across separate frames, then exactly one on a switch (metric 10/13)", () => {
    const callbacks: FrameRequestCallback[] = [];
    const localRaf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    try {
      let commits = 0;
      const onRender: ProfilerOnRenderCallback = () => {
        commits += 1;
      };
      const { container } = render(
        <Profiler id="hover-commits" onRender={onRender}>
          <CorpusMap
            spec={spec}
            renderCard={(n) => <div>{n.label}</div>}
            width={400}
            height={300}
            thresholds={{ midAt: 0, nearAt: 64 }}
            cardSize={NO_GROUPING}
          />
        </Profiler>,
      );
      const el = surface(container);

      // Establish the hover on node a (screen (74, 24)) — this first
      // commit is not part of what this test measures.
      fireEvent.pointerMove(el, { clientX: 74 + 6, clientY: 24, pointerId: 1 });
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(container.querySelector('[data-hover="a"]')).not.toBeNull();

      commits = 0;
      // Five more moves, each resolved on its own frame, all still within
      // 12 px of node a: `nearestWithin` resolves the same node's own
      // screen position every time, so the resolved hover never actually
      // changes.
      const nearA = [
        { clientX: 74 + 5, clientY: 24 },
        { clientX: 74 + 4, clientY: 24 },
        { clientX: 74 + 6, clientY: 25 },
        { clientX: 74 + 5, clientY: 25 },
        { clientX: 74 + 6, clientY: 24 },
      ];
      for (const p of nearA) {
        fireEvent.pointerMove(el, { ...p, pointerId: 1 });
        act(() => {
          for (const cb of callbacks.splice(0)) cb(0);
        });
      }
      expect(commits).toBe(0);
      expect(container.querySelector('[data-hover="a"]')).not.toBeNull();

      // A move within 12 px of node b (screen (326, 276)) resolves to a
      // genuinely different hover: exactly one more commit, and the
      // tooltip switches.
      fireEvent.pointerMove(el, { clientX: 326 - 6, clientY: 276, pointerId: 1 });
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(commits).toBe(1);
      expect(container.querySelector('[data-hover="b"]')).not.toBeNull();
    } finally {
      localRaf.mockRestore();
    }
  });

  it("clears a previously shown hover name once the pointer moves out of range, in a later frame", () => {
    // This file's default `requestAnimationFrame` mock resolves its
    // callback synchronously inside the call itself, which — as the test
    // above notes — cannot represent two flushes in one mount. This test
    // needs exactly that (show, then clear), so it queues callbacks and
    // runs them explicitly instead, the way CorpusMap.frame.test.tsx does.
    const callbacks: FrameRequestCallback[] = [];
    const localRaf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    try {
      const { container } = renderMap({ midAt: 0, nearAt: 64 });
      const el = surface(container);
      fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(container.querySelector('[data-hover="a"]')).not.toBeNull();

      fireEvent.pointerMove(el, { clientX: 74 + 13, clientY: 24, pointerId: 1 });
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(container.querySelector("[data-hover]")).toBeNull();
    } finally {
      localRaf.mockRestore();
    }
  });

  it("clears a shown hover name on leaving the mid/near regimes, even without a further pointer move", () => {
    // midAt 0.5 lets a wheel zoom-out cross back below it (unlike the 0 used
    // elsewhere in this file, where the ratio — never negative — cannot
    // leave "mid").
    const { container } = renderMap({ midAt: 0.5, nearAt: 64 });
    const el = surface(container);
    fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
    expect(container.querySelector('[data-hover="a"]')).not.toBeNull();

    // Same 100-notch zoom-out as the 1/8 clamp test above, well past the
    // hysteresis exit bound (midAt * 0.95 = 0.475): no further pointer move,
    // just the regime leaving "mid".
    for (let i = 0; i < 100; i += 1) fireEvent.wheel(el, { deltaY: 120, ...CENTRE });
    expect(container.querySelector("[data-hover]")).toBeNull();
  });

  it("no-ops a hover flush that was interrupted by a press just before it ran (I11)", () => {
    // A hover move schedules a frame; if a press interrupts before that
    // frame runs, `onPointerDown` has already cleared the hover
    // synchronously (state and its effect both) by the time the stale
    // flush finally runs — the flush's own not-dragging/right-regime
    // condition is false by then (`drag.current` is no longer null), so it
    // does nothing at all. This test exists to exercise that path, not to
    // prove it clears anything — the assertion right after the press
    // already shows the hover gone before the flush ever runs.
    const callbacks: FrameRequestCallback[] = [];
    const localRaf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    try {
      const { container } = renderMap({ midAt: 0, nearAt: 64 });
      const el = surface(container);
      fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(container.querySelector('[data-hover="a"]')).not.toBeNull();

      fireEvent.pointerMove(el, { clientX: 74, clientY: 25, pointerId: 1 });
      expect(callbacks).toHaveLength(1);
      fireEvent.pointerDown(el, { clientX: 74, clientY: 25, pointerId: 1, button: 0, isPrimary: true });
      expect(container.querySelector("[data-hover]")).toBeNull();

      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
      expect(container.querySelector("[data-hover]")).toBeNull();
    } finally {
      localRaf.mockRestore();
    }
  });

  it("shows nothing at the far regime, however close the pointer is to a node", () => {
    const { container } = renderMap({ midAt: 60, nearAt: 64 });
    const el = surface(container);
    fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
    expect(container.querySelector("[data-hover]")).toBeNull();
  });

  it("clears the hover name on pointerleave", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 64 });
    const el = surface(container);
    fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
    expect(container.querySelector('[data-hover="a"]')).not.toBeNull();
    fireEvent.pointerLeave(el);
    expect(container.querySelector("[data-hover]")).toBeNull();
  });

  it("selects a group card's first node on press/release, the same as any other card (I11)", () => {
    // Three nodes at the same point, in a box too small for even one 50x50
    // card frame to clear the layout gap: the first anchor is placed
    // clamped to the box corner and the other two join it as group members
    // (see CardOverlay.test.tsx's own group-badge test for the arithmetic).
    const group: MapSpec = {
      version: "1",
      territories: [],
      nodes: [
        { id: "p0", label: "P0", x: 0, y: 0, territory: null },
        { id: "p1", label: "P1", x: 0, y: 0, territory: null },
        { id: "p2", label: "P2", x: 0, y: 0, territory: null },
      ],
    };
    // Reads each card's real, laid-out box — unlike the fixed-size mock
    // above, this test cares about the actual group-card geometry.
    const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.getAttribute("data-card");
      const [x, y, w, h] =
        id === null
          ? [0, 0, 60, 60]
          : [
              Number.parseFloat(this.style.left),
              Number.parseFloat(this.style.top),
              Number.parseFloat(this.style.width),
              Number.parseFloat(this.style.height),
            ];
      return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const onSelect = vi.fn();
      const { container } = render(
        <CorpusMap
          spec={group}
          renderCard={(n) => <div>{n.label}</div>}
          width={60}
          height={60}
          thresholds={{ midAt: 0, nearAt: 0 }}
          onSelect={onSelect}
          cardSize={{ width: 50, height: 50 }}
        />,
      );
      expect(container.querySelectorAll("[data-card]")).toHaveLength(1);
      expect(container.querySelector("[data-card]")?.getAttribute("data-card-count")).toBe("3");
      const el = surface(container);
      // All three nodes sit at the box centre (30, 30), comfortably inside
      // the single group card's box.
      fireEvent.pointerDown(el, { clientX: 30, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 30, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p0", label: "P0" }));
    } finally {
      rects.mockRestore();
    }
  });

  it("selects a node using the shipped default cardSize (no cardSize prop) (I11)", () => {
    // Reads each card's real, laid-out box, same as the group-card test
    // above — this test's whole point is exercising the real 160x56
    // default, not `NO_GROUPING`.
    const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.getAttribute("data-card");
      const [x, y, w, h] =
        id === null
          ? [0, 0, 400, 300]
          : [
              Number.parseFloat(this.style.left),
              Number.parseFloat(this.style.top),
              Number.parseFloat(this.style.width),
              Number.parseFloat(this.style.height),
            ];
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
      // No cardSize prop: the shipped default is 160x56. Node a's anchor
      // (74, 24) is close enough to the top-left corner that the first six
      // of `layoutCards`'s eight candidates (right, left, above, below, and
      // the two upper diagonals) all run off the top or left edge of the
      // 400x300 box; the surviving below-right candidate lands its card at
      // (80, 30)-(240, 86).
      fireEvent.pointerDown(el, { clientX: 100, clientY: 50, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 100, clientY: 50, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a", label: "A" }));
    } finally {
      rects.mockRestore();
    }
  });

  it("presses, then a pointercancel interrupts before release: no selection and no pan after the cancel (I11)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 0, nearAt: 0 }}
        onSelect={onSelect}
        cardSize={NO_GROUPING}
      />,
    );
    const el = surface(container);
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerCancel(el, { pointerId: 1 });
    // A move after the cancel is not a continuation of the abandoned drag:
    // `drag.current` is already null (cleared by the cancel), so this move
    // is read as a hover point, not a pan.
    fireEvent.pointerMove(el, { clientX: 160, clientY: 100, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerUp(el, { clientX: 160, clientY: 100, pointerId: 1, button: 0, isPrimary: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).toBe(before);
  });

  it("resolves hover for an on-screen node past the card cap, not just the first cardCap in spec order (C1)", () => {
    const width = 960;
    const height = 640;
    const cols = 20;
    const rows = 20;
    // 400 nodes, all on screen at the fitted viewport: the default cardCap
    // (200) would silently drop every node from index 200 on if hover were
    // resolved through the same capped `visibleNodes` call the cards use.
    const grid: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: cols * rows }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        x: (i % cols) * 10,
        y: Math.floor(i / cols) * 10,
        territory: null,
      })),
    };
    const { container } = render(
      <CorpusMap
        spec={grid}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 64 }}
        cardSize={NO_GROUPING}
      />,
    );
    const el = surface(container);
    // Node n350 (row 17, col 10) is past the cap in spec order. Same fit
    // CorpusMap computes internally (FIT_PADDING 24, see the "spec swap"
    // test in CorpusMap.test.tsx for the same literal).
    const vp = fitSpec(grid, width, height, 24);
    const [x, y] = toScreen(vp, 10 * 10, 17 * 10);
    fireEvent.pointerMove(el, { clientX: x + 2, clientY: y, pointerId: 1 });
    const hover = container.querySelector('[data-hover="n350"]');
    expect(hover).not.toBeNull();
    expect(hover?.textContent).toBe("N350");
  });

  it("does not select through a card faded below opacity 0.1, and does once faded in past it (C2)", () => {
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
      // Mount ratio is always 1: nearAt 1 puts the mount exactly at the
      // near threshold, where `fade` is defined to be exactly 0 — the
      // hysteresis band's own invisible-but-mounted state (C2's ruling).
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={400}
          height={300}
          thresholds={{ midAt: 0.5, nearAt: 1 }}
          onSelect={onSelect}
          cardSize={NO_GROUPING}
        />,
      );
      const el = surface(container);
      const cardAt = (id: string) => container.querySelector(`[data-card="${id}"]`) as HTMLElement;
      // The opacity style lives on the overlay wrapper (CardOverlay.tsx),
      // one level up from the card itself.
      const overlayOpacity = () => (cardAt("a").parentElement as HTMLElement).style.opacity;
      expect(overlayOpacity()).toBe("0");

      // Node a's card box at mount is (80,24)-(180,64) (NO_GROUPING's +6
      // gap on the anchor at (74,24), same arithmetic as the other
      // press/release tests in this file). A card is still mounted there
      // (aria-hidden, opacity 0) — without the C2 guard this would select.
      fireEvent.pointerDown(el, { clientX: 90, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 90, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).not.toHaveBeenCalled();

      // One wheel notch (factor ~1.2712), anchored on node a's own screen
      // position (74, 24) so it stays on screen and does not pan away
      // (see the "zooms in proportion to the wheel delta" test above for
      // why anchoring at the viewport centre would push it off-screen
      // instead). Crosses nearAt * (1 + fadeBand) = 1.25, landing
      // cardOpacity at 1.
      fireEvent.wheel(el, { deltaY: -120, clientX: 74, clientY: 24 });
      expect(overlayOpacity()).toBe("1");
      const box = { left: Number.parseFloat(cardAt("a").style.left), top: Number.parseFloat(cardAt("a").style.top) };
      fireEvent.pointerDown(el, {
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      fireEvent.pointerUp(el, {
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    } finally {
      rects.mockRestore();
    }
  });

  it("shows nothing while the point layer is faded below opacity 0.1, even squarely over a node (C2)", () => {
    // midAt 1 puts the mount ratio (1) exactly at the mid threshold, where
    // `fade` is defined to be exactly 0 — inside the "mid" regime (ratio >=
    // midAt) but with the point layer not yet faded in.
    const { container } = renderMap({ midAt: 1, nearAt: 64 });
    const el = surface(container);
    fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
    expect(container.querySelector("[data-hover]")).toBeNull();
  });

  it("clears the hover name on any wheel zoom inside mid/near, so it never lingers at a stale screen position (I2)", () => {
    const { container } = renderMap({ midAt: 0, nearAt: 64 });
    const el = surface(container);
    fireEvent.pointerMove(el, { clientX: 74, clientY: 24, pointerId: 1 });
    expect(container.querySelector('[data-hover="a"]')).not.toBeNull();
    fireEvent.wheel(el, { deltaY: -10, clientX: 200, clientY: 150 });
    expect(container.querySelector("[data-hover]")).toBeNull();
  });
});
