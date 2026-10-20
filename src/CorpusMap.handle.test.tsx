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
  presentation: string;
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

function lastCall(calls: View[]): View {
  const last = calls[calls.length - 1];
  if (!last) throw new Error("expected at least one onViewChange call");
  return last;
}

describe("CorpusMap imperative handle (showcase Task 3)", () => {
  it("returns to the fitted scale after zoomIn then zoomOut (within 1e-9)", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onViewChange={(view) => calls.push(view)}
      />,
    );
    expect(calls[0]).toEqual({ regime: "far", ratio: 1, visibleCount: 1, presentation: "guided" });

    act(() => handle.current?.zoomIn());
    expect(lastCall(calls).ratio).toBeGreaterThan(1);

    act(() => handle.current?.zoomOut());
    expect(lastCall(calls).ratio).toBeCloseTo(1, 9);
  });

  it("stops 200 zoomIn calls at fit x 64", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onViewChange={(view) => calls.push(view)}
      />,
    );

    act(() => {
      for (let index = 0; index < 200; index += 1) handle.current?.zoomIn();
    });

    expect(lastCall(calls).ratio).toBeCloseTo(64, 9);
  });

  it("above the band after a shrinking resize, zoomIn and a wheel zoom-in never zoom out; zoomOut still zooms out", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    const properties = {
      ref: handle,
      spec,
      renderCard: () => null,
      onViewChange: (view: View) => calls.push(view),
    };
    const { container, rerender } = render(<CorpusMap {...properties} width={400} height={300} />);
    act(() => {
      for (let index = 0; index < 200; index += 1) handle.current?.zoomIn();
    });
    expect(lastCall(calls).ratio).toBeCloseTo(64, 9);

    // Keep-view resize: the scale is kept while the fitted scale shrinks.
    rerender(<CorpusMap {...properties} width={200} height={150} />);
    const above = lastCall(calls).ratio;
    expect(above).toBeGreaterThan(64);

    act(() => handle.current?.zoomIn());
    expect(lastCall(calls).ratio).toBeCloseTo(above, 9);
    fireEvent.wheel(surface(container), { deltaY: -120, clientX: 100, clientY: 75 });
    expect(lastCall(calls).ratio).toBeCloseTo(above, 9);

    act(() => handle.current?.zoomOut());
    expect(lastCall(calls).ratio).toBeLessThan(above);
  });

  it("below the band after a growing resize, zoomOut never zooms in", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    const properties = {
      ref: handle,
      spec,
      renderCard: () => null,
      onViewChange: (view: View) => calls.push(view),
    };
    const { rerender } = render(<CorpusMap {...properties} width={400} height={300} />);
    act(() => {
      for (let index = 0; index < 200; index += 1) handle.current?.zoomOut();
    });
    expect(lastCall(calls).ratio).toBeCloseTo(1 / 8, 9);

    rerender(<CorpusMap {...properties} width={800} height={600} />);
    const below = lastCall(calls).ratio;
    expect(below).toBeLessThan(1 / 8);

    act(() => handle.current?.zoomOut());
    expect(lastCall(calls).ratio).toBeCloseTo(below, 9);
  });

  it("stops 200 zoomOut calls at fit / 8", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onViewChange={(view) => calls.push(view)}
      />,
    );

    act(() => {
      for (let index = 0; index < 200; index += 1) handle.current?.zoomOut();
    });

    expect(lastCall(calls).ratio).toBeCloseTo(1 / 8, 9);
  });

  it("restores the fitted viewport with fit() after zooming", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onViewChange={(view) => calls.push(view)}
      />,
    );

    act(() => {
      for (let index = 0; index < 10; index += 1) handle.current?.zoomIn();
    });
    expect(lastCall(calls).ratio).toBeGreaterThan(1);

    act(() => handle.current?.fit());
    expect(lastCall(calls).ratio).toBe(1);
  });

  it("fit() resets the regime hysteresis the same way a spec swap does, instead of carrying it over", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    const { container } = render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 0.5, nearAt: 1.02 }}
        tuning={{ hysteresis: 0.3 }}
        onViewChange={(view) => calls.push(view)}
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
    act(() => handle.current?.fit());
    expect(lastCall(calls)).toEqual({ regime: "mid", ratio: 1, visibleCount: 1, presentation: "dense" });
  });

  it("fires onViewChange once on mount with ratio 1", () => {
    const onViewChange = vi.fn();
    render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onViewChange={onViewChange}
      />,
    );
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ regime: "far", ratio: 1, visibleCount: 1, presentation: "guided" });
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
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    try {
      const calls: View[] = [];
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(node) => <div>{node.label}</div>}
          width={width}
          height={height}
          onViewChange={(view) => calls.push(view)}
        />,
      );
      expect(calls).toHaveLength(1);
      expect(lastCall(calls)).toEqual({ regime: "far", ratio: 1, visibleCount: 1, presentation: "guided" });

      const element = surface(container);
      fireEvent.pointerDown(element, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      for (let offset = 1; offset <= 100; offset += 1) {
        fireEvent.pointerMove(element, { clientX: offset, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      }
      // Nothing has flushed yet: no extra calls from the 100 raw events.
      expect(calls).toHaveLength(1);
      expect(callbacks).toHaveLength(1);

      act(() => {
        for (const callback of callbacks.splice(0)) callback(0);
      });

      // Exactly one more call for the whole coalesced frame, reporting the
      // node now off-screen (centre 75 + 100px drag = 175 > width 150).
      expect(calls).toHaveLength(2);
      expect(lastCall(calls)).toEqual({ regime: "far", ratio: 1, visibleCount: 0, presentation: "guided" });
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
          renderCard={(node) => <div>{node.label}</div>}
          width={400}
          height={300}
          onViewChange={(view) => calls.push(view)}
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

  it("fires onViewChange after a spec swap even when the refitted view has the same regime, ratio and count", () => {
    const calls: View[] = [];
    // Same geometry under new ids: the fitted view reads exactly the same.
    const twin: MapSpec = { ...spec, nodes: [{ id: "b", label: "B", x: 0, y: 0, territory: null }] };
    const properties = {
      renderCard: () => null,
      width: 400,
      height: 300,
      onViewChange: (view: View) => calls.push(view),
    };
    const { rerender } = render(<CorpusMap {...properties} spec={spec} />);
    expect(calls).toHaveLength(1);
    rerender(<CorpusMap {...properties} spec={twin} />);
    expect(calls).toHaveLength(2);
    expect(lastCall(calls)).toEqual(calls[0]);
  });

  it("fires onViewChange after fit() even when the view is already the fitted one", () => {
    const handle = createRef<CorpusMapHandle>();
    const calls: View[] = [];
    render(
      <CorpusMap
        ref={handle}
        spec={spec}
        renderCard={() => null}
        width={400}
        height={300}
        onViewChange={(view) => calls.push(view)}
      />,
    );
    expect(calls).toHaveLength(1);
    act(() => handle.current?.fit());
    expect(calls).toHaveLength(2);
    expect(lastCall(calls)).toEqual({ regime: "far", ratio: 1, visibleCount: 1, presentation: "guided" });
  });
});
