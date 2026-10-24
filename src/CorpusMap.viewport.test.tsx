import { act, fireEvent, render } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle, type CorpusMapView } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";
import type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t", name: "Territory", members: ["a", "b"], centroid: [0, 0] }],
  nodes: [
    { id: "a", label: "Alpha", x: -10, y: -10, territory: "t" },
    { id: "b", label: "Beta", x: 10, y: 10, territory: "t" },
  ],
};
const surface = (container: HTMLElement) => container.querySelector("[data-map-surface]") as HTMLElement;
type Change = [MapViewport, { reason: ViewportChangeReason }];
const card = (node: MapNode) => <div>{node.label}</div>;

function useStateView(initial: MapViewport = { centre: [0, 0], zoom: 1 }) {
  return useState<MapViewport>(initial);
}
function last<Item>(items: Item[]): Item | undefined {
  return items[items.length - 1];
}

// The hysteresis reproduction `CorpusMap.handle.test.tsx` uses: ratio 1 is
// mid, 1.2 is near, and a near carried over to ratio 1 would stay near
// (exit bound 1.02 * 0.7), so only a reset lands back on mid.
const HYSTERESIS = { thresholds: { midAt: 0.5, nearAt: 1.02 }, tuning: { hysteresis: 0.3 } };

describe("onViewportChange (spec slice C §3)", () => {
  it("emits interaction for a wheel notch and fit for fit()", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    expect(changes).toHaveLength(0);
    fireEvent.wheel(surface(container), { deltaY: -120, clientX: 200, clientY: 150 });
    expect(last(changes)?.[1].reason).toBe("interaction");
    expect(last(changes)?.[0].zoom).toBeGreaterThan(1);
    act(() => handle.current?.fit());
    expect(last(changes)?.[1].reason).toBe("fit");
    expect(last(changes)?.[0].zoom).toBeCloseTo(1, 9);
  });

  it("draws the controlled viewport: onViewChange reports its zoom as the ratio", () => {
    const views: CorpusMapView[] = [];
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        viewport={{ centre: [0, 0], zoom: 4 }}
        onViewChange={(view) => views.push(view)}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(4, 9);
  });

  it("an echoing consumer causes one emission per notch, not two", () => {
    const onViewportChange = vi.fn();
    function Echo() {
      const [view, setView] = useStateView();
      return (
        <CorpusMap
          renderCard={card}
          spec={spec}
          width={400}
          height={300}
          viewport={view}
          onViewportChange={(next, details) => {
            onViewportChange(next, details);
            setView(next);
          }}
        />
      );
    }
    const { container } = render(<Echo />);
    fireEvent.wheel(surface(container), { deltaY: -120, clientX: 200, clientY: 150 });
    expect(onViewportChange).toHaveBeenCalledTimes(1);
  });

  it("a request that changes nothing emits nothing: zoomIn at the top of the band", () => {
    const onViewportChange = vi.fn();
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        viewport={{ centre: [0, 0], zoom: 64 }}
        onViewportChange={onViewportChange}
      />,
    );
    act(() => handle.current?.zoomIn());
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it("two zoomIn calls before the consumer re-renders compose", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        viewport={{ centre: [0, 0], zoom: 1 }}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => {
      handle.current?.zoomIn();
      handle.current?.zoomIn();
    });
    expect(changes).toHaveLength(2);
    const step = changes[0]?.[0].zoom ?? 0;
    expect(changes[1]?.[0].zoom).toBeCloseTo(step * step, 9);
  });

  it("a consumer that ignores requests gets the next one based on the drawn view", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    const fixed = { centre: [0, 0] as [number, number], zoom: 1 };
    const { rerender } = render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        viewport={fixed}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => handle.current?.zoomIn());
    // An unrelated re-render with the same (ignored) view.
    rerender(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        viewport={{ ...fixed }}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => handle.current?.zoomIn());
    expect(changes).toHaveLength(2);
    expect(changes[1]?.[0].zoom).toBeCloseTo(changes[0]?.[0].zoom ?? 0, 9);
  });

  it.each([
    ["NaN", { centre: [Number.NaN, 0] as [number, number], zoom: 1 }],
    ["zero zoom", { centre: [0, 0] as [number, number], zoom: 0 }],
    ["negative zoom", { centre: [0, 0] as [number, number], zoom: -1 }],
    ["Infinity zoom", { centre: [0, 0] as [number, number], zoom: Number.POSITIVE_INFINITY }],
  ])("an invalid viewport (%s) draws the fit and emits nothing", (_name, viewport) => {
    const views: CorpusMapView[] = [];
    const onViewportChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        viewport={viewport}
        onViewChange={(view) => views.push(view)}
        onViewportChange={onViewportChange}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(1, 9);
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it.each([
    [1000, 64],
    [0.001, 1 / 8],
  ])("a zoom of %s is clamped to %s and emits nothing", (zoom, clamped) => {
    const views: CorpusMapView[] = [];
    const onViewportChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        viewport={{ centre: [0, 0], zoom }}
        onViewChange={(view) => views.push(view)}
        onViewportChange={onViewportChange}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(clamped, 9);
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it("a box change emits nothing and keeps the public zoom (controlled)", () => {
    const views: CorpusMapView[] = [];
    const onViewportChange = vi.fn();
    const view = { centre: [0, 0] as [number, number], zoom: 3 };
    const record = (next: CorpusMapView) => views.push(next);
    const { rerender } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        viewport={view}
        onViewChange={record}
        onViewportChange={onViewportChange}
      />,
    );
    rerender(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={800}
        height={500}
        viewport={view}
        onViewChange={record}
        onViewportChange={onViewportChange}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(3, 9);
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it("a box change emits nothing (uncontrolled)", () => {
    const onViewportChange = vi.fn();
    const { rerender } = render(
      <CorpusMap renderCard={card} spec={spec} width={400} height={300} onViewportChange={onViewportChange} />,
    );
    rerender(<CorpusMap renderCard={card} spec={spec} width={800} height={500} onViewportChange={onViewportChange} />);
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it("defaultViewport opens the first spec where it says, and a later spec refits", () => {
    const views: CorpusMapView[] = [];
    const record = (view: CorpusMapView) => views.push(view);
    const { rerender } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={{ centre: [0, 0], zoom: 5 }}
        onViewChange={record}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(5, 9);
    rerender(
      <CorpusMap
        renderCard={card}
        spec={{ ...spec }}
        width={400}
        height={300}
        defaultViewport={{ centre: [0, 0], zoom: 5 }}
        onViewChange={record}
      />,
    );
    expect(last(views)?.ratio).toBeCloseTo(1, 9);
  });

  it("a controlled fit resets the hysteresis: back at the fit reads mid, not a carried-over near", () => {
    const views: CorpusMapView[] = [];
    const handle = createRef<CorpusMapHandle>();
    function Accepting() {
      const [view, setView] = useStateView({ centre: [0, 0], zoom: 1.2 });
      return (
        <CorpusMap
          renderCard={card}
          ref={handle}
          spec={spec}
          width={400}
          height={300}
          {...HYSTERESIS}
          viewport={view}
          onViewChange={(next) => views.push(next)}
          onViewportChange={(next) => setView(next)}
        />
      );
    }
    render(<Accepting />);
    expect(last(views)?.regime).toBe("near");
    act(() => handle.current?.fit());
    expect(last(views)?.ratio).toBeCloseTo(1, 9);
    expect(last(views)?.regime).toBe("mid");
  });
});
