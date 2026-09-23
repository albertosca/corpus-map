import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import type { Regime } from "./lod/lod";
import type { MapSpec } from "./shared/spec";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null }],
};

interface View {
  regime: Regime;
  ratio: number;
  visibleCount: number;
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

function lastCall(calls: View[]): View {
  const v = calls[calls.length - 1];
  if (!v) throw new Error("expected at least one onViewChange call");
  return v;
}

describe("CorpusMap imperative handle (showcase Task 3)", () => {
  it("returns to the fitted scale after zoomIn then zoomOut (within 1e-9)", () => {
    const ref = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={ref}
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        onViewChange={(v) => calls.push(v)}
      />,
    );
    expect(calls[0]).toEqual({ regime: "far", ratio: 1, visibleCount: 1 });

    act(() => ref.current?.zoomIn());
    expect(lastCall(calls).ratio).toBeGreaterThan(1);

    act(() => ref.current?.zoomOut());
    expect(lastCall(calls).ratio).toBeCloseTo(1, 9);
  });

  it("stops 200 zoomIn calls at fit x 64", () => {
    const ref = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={ref}
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        onViewChange={(v) => calls.push(v)}
      />,
    );

    act(() => {
      for (let i = 0; i < 200; i += 1) ref.current?.zoomIn();
    });

    expect(lastCall(calls).ratio).toBeCloseTo(64, 9);
  });

  it("stops 200 zoomOut calls at fit / 8", () => {
    const ref = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={ref}
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        onViewChange={(v) => calls.push(v)}
      />,
    );

    act(() => {
      for (let i = 0; i < 200; i += 1) ref.current?.zoomOut();
    });

    expect(lastCall(calls).ratio).toBeCloseTo(1 / 8, 9);
  });

  it("restores the fitted viewport with fit() after zooming", () => {
    const ref = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={ref}
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        onViewChange={(v) => calls.push(v)}
      />,
    );

    act(() => {
      for (let i = 0; i < 10; i += 1) ref.current?.zoomIn();
    });
    expect(lastCall(calls).ratio).toBeGreaterThan(1);

    act(() => ref.current?.fit());
    expect(lastCall(calls).ratio).toBe(1);
  });

  it("fit() resets the regime hysteresis the same way a spec swap does, instead of carrying it over", () => {
    const ref = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    const { container } = render(
      <CorpusMap
        ref={ref}
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 0.5, nearAt: 1.02 }}
        tuning={{ hysteresis: 0.3 }}
        onViewChange={(v) => calls.push(v)}
      />,
    );

    // Mount ratio is always 1 -> starts "mid" (midAt 0.5 <= 1 < nearAt 1.02).
    // One wheel notch (factor ~1.27) crosses nearAt into "near".
    fireEvent.wheel(surface(container), { deltaY: -120, clientX: 200, clientY: 150 });
    expect(lastCall(calls).regime).toBe("near");

    // A regime that merely carried over would stay "near": with a 30%
    // hysteresis band on nearAt 1.02, the exit bound is 1.02 * 0.7 = 0.714,
    // and fit()'s ratio of 1 is still above that bound. If fit() reset the
    // regime the way a spec swap does, this lands back on "mid" instead.
    act(() => ref.current?.fit());
    expect(lastCall(calls)).toEqual({ regime: "mid", ratio: 1, visibleCount: 1 });
  });

  it("fires onViewChange once on mount with ratio 1", () => {
    const onViewChange = vi.fn();
    render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        onViewChange={onViewChange}
      />,
    );
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ regime: "far", ratio: 1, visibleCount: 1 });
  });

  it("produces at most one onViewChange call for 100 pointer moves coalesced into one animation frame", () => {
    // A box small enough that a 100px drag pushes the single node (rendered
    // at the box centre by `fitSpec`) off-screen, so the frame's one commit
    // actually changes `visibleCount` — a spy that only counted calls
    // could pass with a naive "never coalesce" implementation vacuously if
    // the view value happened not to change; this shape makes the assertion
    // meaningful in both directions (see this file's report for the
    // revert-check).
    const width = 150;
    const height = 300;
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    try {
      const calls: View[] = [];
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={width}
          height={height}
          onViewChange={(v) => calls.push(v)}
        />,
      );
      expect(calls).toHaveLength(1);
      expect(lastCall(calls)).toEqual({ regime: "far", ratio: 1, visibleCount: 1 });

      const el = surface(container);
      fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      for (let i = 1; i <= 100; i += 1) {
        fireEvent.pointerMove(el, { clientX: i, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      }
      // Nothing has flushed yet: no extra calls from the 100 raw events.
      expect(calls).toHaveLength(1);
      expect(callbacks).toHaveLength(1);

      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });

      // Exactly one more call for the whole coalesced frame, reporting the
      // node now off-screen (centre 75 + 100px drag = 175 > width 150).
      expect(calls).toHaveLength(2);
      expect(lastCall(calls)).toEqual({ regime: "far", ratio: 1, visibleCount: 0 });
    } finally {
      raf.mockRestore();
    }
  });

  it("does not refire onViewChange when only the callback's identity changes across renders", () => {
    const calls: View[] = [];
    let renderCount = 0;
    function Wrapper() {
      renderCount += 1;
      // A fresh arrow function every render, on purpose: identity changes,
      // nothing about the view does.
      return (
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={400}
          height={300}
          onViewChange={(v) => calls.push(v)}
        />
      );
    }
    const { rerender } = render(<Wrapper />);
    expect(calls).toHaveLength(1);
    rerender(<Wrapper />);
    rerender(<Wrapper />);
    rerender(<Wrapper />);
    expect(renderCount).toBe(4);
    expect(calls).toHaveLength(1);
  });
});
