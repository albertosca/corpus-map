import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import type { Regime } from "./lod/lod";
import { usableArea } from "./shared/insets";
import { buildScene, groupLabelsFor } from "./shared/scene";
import type { MapNode, MapSpec } from "./shared/spec";
import { validateSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

// Fit into the free area (spec 2026-11-06-fit-insets-design.md): every fit scales and centres into the box less
// `insets`, read when the fit happens; an `insets` change alone moves nothing; ratio 1 stays the whole-box fit.

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "west", label: "West", x: 0, y: 0, territory: null },
    { id: "east", label: "East", x: 1000, y: 200, territory: null },
  ],
};
const otherSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "north", label: "North", x: 0, y: 0, territory: null },
    { id: "south", label: "South", x: 200, y: 1000, territory: null },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;

interface View {
  regime: Regime;
  ratio: number;
}
type Change = [MapViewport, { reason: ViewportChangeReason }];
type Insets = { right?: number; left?: number };

function mount(insets?: Insets, mapSpec: MapSpec = spec) {
  const views: View[] = [];
  const handle = createRef<CorpusMapHandle>();
  const element = (next: Insets | undefined, nextSpec: MapSpec = mapSpec) => (
    <CorpusMap
      renderCard={card}
      ref={handle}
      spec={nextSpec}
      width={1000}
      height={800}
      insets={next}
      onViewChange={(view) => views.push(view)}
    />
  );
  const rendered = render(element(insets));
  return { views, handle, rerender: (next: Insets | undefined) => rendered.rerender(element(next)) };
}

const lastView = (views: View[]): View => views[views.length - 1] as View;
const viewOf = (handle: { current: CorpusMapHandle | null }): MapViewport => handle.current?.getView() as MapViewport;

describe("CorpusMap fits into the free area", () => {
  it("a fit() beside a drawer lands at a ratio below 1 and stays far; with no drawer it is ratio 1", () => {
    const { views, handle, rerender } = mount();
    expect(lastView(views).ratio).toBe(1);
    rerender({ right: 400 });
    act(() => handle.current?.fit());
    expect(lastView(views).ratio).toBeLessThan(1);
    expect(lastView(views).regime).toBe("far");
    rerender(undefined);
    act(() => handle.current?.fit());
    expect(lastView(views).ratio).toBe(1);
  });

  it("opens on the free-area fit when the insets are there from the start", () => {
    const withDrawer = mount({ right: 400 });
    expect(withDrawer.views[0]?.ratio).toBeLessThan(1);
    const plain = mount();
    expect((viewOf(withDrawer.handle).zoom as number) < (viewOf(plain.handle).zoom as number)).toBe(true);
  });

  it("reads a defaultViewport's zoom against the whole-box fit, insets or not", () => {
    const views: View[] = [];
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={1000}
        height={800}
        insets={{ right: 400 }}
        defaultViewport={{ centre: [500, 100], zoom: 4 }}
        onViewChange={(view) => views.push(view)}
      />,
    );
    expect(views[0]?.ratio).toBeCloseTo(4, 9);
    expect(viewOf(handle).zoom).toBeCloseTo(4, 9);
  });

  it("an insets change alone moves nothing and emits nothing; the next fit() moves the view", () => {
    const { views, handle, rerender } = mount();
    const before = viewOf(handle);
    const emitted = views.length;
    rerender({ right: 400 });
    rerender({ right: 400 });
    expect(views.length).toBe(emitted);
    expect(viewOf(handle)).toEqual(before);
    act(() => handle.current?.fit());
    expect(viewOf(handle)).not.toEqual(before);
  });

  it("a free area under the minimum keeps the whole-box fit", () => {
    const { views, handle, rerender } = mount();
    const whole = viewOf(handle);
    rerender({ right: 950 });
    act(() => handle.current?.fit());
    expect(lastView(views).ratio).toBe(1);
    expect(viewOf(handle)).toEqual(whole);
  });

  it("insets on two opposite sides fit into the strip between them, centred in it", () => {
    const strip = mount({ left: 300, right: 300 });
    const one = mount({ right: 600 });
    expect(strip.views[0]?.ratio).toBeLessThan(1);
    expect(strip.views[0]?.ratio).toBeCloseTo(one.views[0]?.ratio as number, 9);
    // Same strip width, different place: the strip sits on the box centre (the map's own centre, x 500), the
    // single right inset pushes the map left of it, so the world point at the box centre lies right of the map's.
    expect(viewOf(strip.handle).centre[0]).toBeCloseTo(500, 6);
    expect(viewOf(one.handle).centre[0]).toBeGreaterThan(500 + 1);
  });

  it("a bottom inset fits a tall map into the height it leaves, and a free height under the minimum is ignored", () => {
    const tall = (insets: { bottom: number }) => {
      const views: View[] = [];
      const handle = createRef<CorpusMapHandle>();
      render(
        <CorpusMap
          renderCard={card}
          ref={handle}
          spec={otherSpec}
          width={1000}
          height={800}
          insets={insets}
          onViewChange={(view) => views.push(view)}
        />,
      );
      return { views, handle };
    };
    const beside = tall({ bottom: 300 });
    expect(beside.views[0]?.ratio).toBeCloseTo((800 - 300 - 48) / (800 - 48), 9);
    expect(viewOf(beside.handle).centre[1]).toBeGreaterThan(500 + 1);
    expect(tall({ bottom: 700 }).views[0]?.ratio).toBe(1);
  });

  it("a new uncontrolled spec fits into the free area too (the spec swap path)", () => {
    const handle = createRef<CorpusMapHandle>();
    const element = (nextSpec: MapSpec) => (
      <CorpusMap renderCard={card} ref={handle} spec={nextSpec} width={1000} height={800} insets={{ right: 400 }} />
    );
    const { rerender } = render(element(spec));
    rerender(element(otherSpec));
    const expected = viewOf(mount({ right: 400 }, otherSpec).handle);
    expect(viewOf(handle).zoom).toBeCloseTo(expected.zoom as number, 9);
    expect(viewOf(handle).centre[0]).toBeCloseTo(expected.centre[0], 6);
    // This spec is tall, so the height binds the scale either way; the free area moves the centre.
    const wholeBox = viewOf(mount(undefined, otherSpec).handle);
    expect(Math.abs(viewOf(handle).centre[0] - wholeBox.centre[0])).toBeGreaterThan(1);
  });

  it("never fits below the zoom band: a free fit under 1/8 of the whole-box fit keeps the whole box, and the view round-trips", () => {
    const views: View[] = [];
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={1600}
        height={800}
        insets={{ right: 1460 }}
        onViewChange={(view) => views.push(view)}
      />,
    );
    expect(views[0]?.ratio).toBe(1);
    const drawn = viewOf(handle);
    act(() => handle.current?.setView(drawn));
    expect(viewOf(handle).zoom).toBeCloseTo(drawn.zoom as number, 9);
    // Just inside the band the free fit still applies.
    const inside = mount({ right: 800 });
    expect(inside.views[0]?.ratio).toBeLessThan(1);
    expect(inside.views[0]?.ratio).toBeGreaterThanOrEqual(1 / 8);
  });

  it("a controlled map proposes the free-area fit for a new spec (reason spec) and for fit() (reason fit)", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    const element = (nextSpec: MapSpec) => (
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={nextSpec}
        width={1000}
        height={800}
        insets={{ right: 400 }}
        viewport={{ centre: [0, 0], zoom: 1 }}
        onViewportChange={(...call) => changes.push(call)}
      />
    );
    const { rerender } = render(element(spec));
    rerender(element(otherSpec));
    const expected = viewOf(mount({ right: 400 }, otherSpec).handle);
    // This spec is tall, so the height binds the scale either way; the free area moves the centre.
    expect(Math.abs(expected.centre[0] - viewOf(mount(undefined, otherSpec).handle).centre[0])).toBeGreaterThan(1);
    const proposed = changes.find(([, details]) => details.reason === "spec");
    expect(proposed?.[0].zoom).toBeCloseTo(expected.zoom as number, 9);
    expect(proposed?.[0].centre[0]).toBeCloseTo(expected.centre[0], 6);
    act(() => handle.current?.fit());
    expect(changes.some(([, details]) => details.reason === "fit")).toBe(true);
  });

  it("counts family names for the regime the free fit lands in, not the whole box's (midAt under 1)", () => {
    const square = (left: number, top: number, size: number): Array<[number, number]> => [
      [left, top],
      [left + size, top],
      [left + size, top + size],
      [left, top + size],
    ];
    const family = validateSpec({
      version: "1",
      territories: [
        {
          id: "p",
          name: "A deliberately long family name",
          members: [],
          centroid: [11, 5],
          boundary: square(-2, -2, 26),
        },
        { id: "a", name: "Alpha", members: ["a0"], centroid: [5, 5], boundary: square(0, 0, 10), parent: "p" },
        { id: "b", name: "Beta", members: ["b0"], centroid: [17, 5], boundary: square(12, 0, 10), parent: "p" },
      ],
      nodes: [
        { id: "a0", label: "a0", x: 5, y: 5, territory: "a" },
        { id: "b0", label: "b0", x: 17, y: 5, territory: "b" },
      ],
    });
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={family}
        width={500}
        height={500}
        insets={{ right: 200 }}
        thresholds={{ midAt: 0.7, nearAt: 5 }}
      />,
    );
    const scene = buildScene(family, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const labelled = { ...scene, groupLabels: groupLabelsFor(scene, 500) };
    const area = usableArea(500, 500, { top: 0, right: 200, bottom: 0, left: 0 });
    const withNames = fitScene(family, labelled, 500, 500, 24, { groupNames: true }, area);
    const withoutNames = fitScene(family, labelled, 500, 500, 24, { groupNames: false }, area);
    expect(withNames.scale).toBeLessThan(withoutNames.scale);
    const whole = fitScene(family, labelled, 500, 500, 24, { groupNames: false });
    expect(viewOf(handle).zoom).toBeCloseTo(withNames.scale / whole.scale, 6);
  });
});
