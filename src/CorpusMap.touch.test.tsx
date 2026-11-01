import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import { type MapViewport, toPublic, type ViewportChangeReason } from "./viewport/publicViewport";
import { wheelZoomFactor } from "./viewport/wheel";

// A 5 × 5 grid, 100 world units apart (the grid of `CorpusMap.spatialKeys.test.tsx`).
const COLUMNS = ["a", "b", "c", "d", "e"];
const gridSpec: MapSpec = {
  version: "1",
  territories: [
    {
      id: "west",
      name: "West",
      members: COLUMNS.slice(0, 3).flatMap((column) => [0, 1, 2, 3, 4].map((row) => `${column}${row}`)),
      centroid: [100, 200],
    },
    {
      id: "east",
      name: "East",
      members: COLUMNS.slice(3).flatMap((column) => [0, 1, 2, 3, 4].map((row) => `${column}${row}`)),
      centroid: [350, 200],
    },
  ],
  nodes: COLUMNS.flatMap((column, columnIndex) =>
    [0, 1, 2, 3, 4].map((row) => ({
      id: `${column}${row}`,
      label: `Item ${column}${row}`,
      x: columnIndex * 100,
      y: row * 100,
      territory: columnIndex < 3 ? "west" : "east",
    })),
  ),
};
const WIDTH = 400;
const HEIGHT = 300;
const fitted = fitScene(gridSpec, buildScene(gridSpec, DEFAULT_TUNING, DEFAULT_THEME, estimateText), WIDTH, HEIGHT, 24);
const fitScale = fitted.scale;
// An uncontrolled map does not report the fit it opens on, so the tests start from it.
const FIT_VIEW = toPublic(fitted, fitScale, WIDTH, HEIGHT);
const ZOOM_IN_STEP = wheelZoomFactor({ deltaY: -120, deltaMode: 0, ctrlKey: false }, DEFAULT_TUNING);
const ZOOM_OUT_STEP = wheelZoomFactor({ deltaY: 120, deltaMode: 0, ctrlKey: false }, DEFAULT_TUNING);

type Change = [MapViewport, { reason: ViewportChangeReason }];

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function flush() {
  act(() => {
    for (const callback of frames.splice(0)) callback(0);
  });
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function renderMap(properties: Partial<Parameters<typeof CorpusMap>[0]> = {}) {
  const changes: Change[] = [];
  const selections: Array<string | null> = [];
  const result = render(
    <CorpusMap
      spec={gridSpec}
      renderCard={(node) => <div>{node.label}</div>}
      width={WIDTH}
      height={HEIGHT}
      onViewportChange={(view, details) => changes.push([view, details])}
      onSelectedChange={(id) => selections.push(id)}
      {...properties}
    />,
  );
  const root = result.container.querySelector("[data-map-surface]") as HTMLElement;
  const finger = (kind: "down" | "move" | "up" | "cancel", pointerId: number, horizontal: number, vertical: number) => {
    const init = {
      pointerId,
      pointerType: "touch",
      isPrimary: pointerId === 1,
      button: kind === "move" ? -1 : 0,
      clientX: horizontal,
      clientY: vertical,
    };
    if (kind === "down") fireEvent.pointerDown(root, init);
    else if (kind === "move") fireEvent.pointerMove(root, init);
    else if (kind === "up") fireEvent.pointerUp(root, init);
    else fireEvent.pointerCancel(root, init);
  };
  const tap = (horizontal: number, vertical: number, pointerId = 1) => {
    finger("down", pointerId, horizontal, vertical);
    finger("up", pointerId, horizontal, vertical);
  };
  const interactions = () => changes.filter(([, details]) => details.reason === "interaction");
  return { ...result, root, finger, tap, changes, interactions, selections };
}

/** The view the map reports last, or the fit when it reported none yet. */
function latest(changes: readonly Change[]): MapViewport {
  return changes[changes.length - 1]?.[0] ?? FIT_VIEW;
}

/** The world point under a box point, read from the public view. */
function worldAt(view: MapViewport, horizontal: number, vertical: number): [number, number] {
  const scale = view.zoom * fitScale;
  return [view.centre[0] + (horizontal - WIDTH / 2) / scale, view.centre[1] + (vertical - HEIGHT / 2) / scale];
}

/** The box point over a world point. */
function boxAt(view: MapViewport, horizontal: number, vertical: number): [number, number] {
  const scale = view.zoom * fitScale;
  return [(horizontal - view.centre[0]) * scale + WIDTH / 2, (vertical - view.centre[1]) * scale + HEIGHT / 2];
}

describe("CorpusMap on a touch screen (spec mobile §2)", () => {
  it("scales a pinch about the fingers' midpoint and carries the midpoint's drag", () => {
    const { finger, changes, interactions } = renderMap();
    const before = latest(changes);
    const grabbed = worldAt(before, 200, 150);
    finger("down", 1, 150, 150);
    finger("down", 2, 250, 150);
    finger("move", 2, 350, 150);
    flush();
    const after = latest(interactions());
    expect(after.zoom).toBeCloseTo(before.zoom * 2, 9);
    const [horizontal, vertical] = worldAt(after, 250, 150);
    expect(horizontal).toBeCloseTo(grabbed[0], 6);
    expect(vertical).toBeCloseTo(grabbed[1], 6);
  });

  it("clamps a pinch to the zoom band", () => {
    const { finger, interactions } = renderMap();
    finger("down", 1, 150, 150);
    finger("down", 2, 250, 150);
    for (let spread = 1; spread <= 20; spread += 1) {
      finger("move", 2, 150 + 100 * 1.5 ** spread, 150);
      flush();
    }
    expect(latest(interactions()).zoom).toBeCloseTo(64, 9);
  });

  it("commits once for many pinch moves within one frame", () => {
    const { finger, interactions } = renderMap();
    finger("down", 1, 150, 150);
    finger("down", 2, 250, 150);
    for (let move = 1; move <= 10; move += 1) finger("move", 2, 250 + 10 * move, 150);
    expect(interactions()).toHaveLength(0);
    flush();
    expect(interactions()).toHaveLength(1);
    expect(latest(interactions()).zoom).toBeCloseTo(2, 9);
  });

  it("keeps the scale finite for a pinch from coincident fingers", () => {
    const { finger, interactions } = renderMap();
    finger("down", 1, 200, 150);
    finger("down", 2, 200, 150);
    finger("move", 2, 300, 150);
    flush();
    const view = latest(interactions());
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(view.zoom).toBeCloseTo(1, 9);
  });

  it("zooms one step in on a double tap on empty map and keeps the selection", () => {
    const { tap, changes, interactions, selections } = renderMap({ defaultSelectedId: "c2" });
    const before = latest(changes);
    const [horizontal, vertical] = boxAt(before, 250, 250);
    tap(horizontal, vertical);
    advance(100);
    tap(horizontal, vertical);
    const after = latest(interactions());
    expect(after.zoom).toBeCloseTo(before.zoom * ZOOM_IN_STEP, 9);
    const [worldHorizontal, worldVertical] = worldAt(after, horizontal, vertical);
    expect(worldHorizontal).toBeCloseTo(250, 6);
    expect(worldVertical).toBeCloseTo(250, 6);
    advance(1000);
    expect(selections).toEqual([]);
  });

  it("clears the selection on a single tap on empty map only once a double tap is ruled out", () => {
    const { tap, changes, selections } = renderMap({ defaultSelectedId: "c2" });
    const [horizontal, vertical] = boxAt(latest(changes), 250, 250);
    tap(horizontal, vertical);
    advance(299);
    expect(selections).toEqual([]);
    advance(1);
    expect(selections).toEqual([null]);
  });

  it("leaves a selection made another way while a tap on empty map was held (whole-branch review #7)", () => {
    const properties = { selectedId: "c2" };
    const { tap, changes, selections, rerender } = renderMap(properties);
    const [horizontal, vertical] = boxAt(latest(changes), 250, 250);
    tap(horizontal, vertical);
    advance(100);
    // The consumer selects from its own list (the demo's Related) inside the double-tap window.
    rerender(
      <CorpusMap
        spec={gridSpec}
        renderCard={(node) => <div>{node.label}</div>}
        width={WIDTH}
        height={HEIGHT}
        onSelectedChange={(id) => selections.push(id)}
        selectedId="d3"
      />,
    );
    advance(300);
    expect(selections).toEqual([]);
  });

  it("selects an item on a tap at once", () => {
    // Zoomed in: at the fit the points are faded out and take no tap.
    const { tap, selections } = renderMap({ defaultViewport: { centre: [300, 200], zoom: 4 } });
    tap(WIDTH / 2, HEIGHT / 2);
    expect(selections).toEqual(["d2"]);
  });

  it("opens no hover balloon for an item a tap selects, its card already names it, and closes a balloon left open", () => {
    const { tap, container } = renderMap({ defaultViewport: { centre: [300, 200], zoom: 4 } });
    // A tap between points names the territory under it first.
    tap(WIDTH / 2 - 50 * 4 * fitScale, HEIGHT / 2);
    flush();
    expect(container.querySelector("[data-hover-territories]")).not.toBeNull();
    tap(WIDTH / 2, HEIGHT / 2);
    flush();
    expect(container.querySelector("[data-hover]")).toBeNull();
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("zooms one step out on a two-finger tap, about the fingers' midpoint", () => {
    const { finger, changes, interactions } = renderMap();
    const before = latest(changes);
    const grabbed = worldAt(before, 180, 120);
    finger("down", 1, 160, 120);
    finger("down", 2, 200, 120);
    advance(50);
    finger("up", 2, 200, 120);
    finger("up", 1, 160, 120);
    const after = latest(interactions());
    expect(after.zoom).toBeCloseTo(before.zoom * ZOOM_OUT_STEP, 9);
    const [horizontal, vertical] = worldAt(after, 180, 120);
    expect(horizontal).toBeCloseTo(grabbed[0], 6);
    expect(vertical).toBeCloseTo(grabbed[1], 6);
  });

  it("leaves the view alone on a double tap at the zoom ceiling", () => {
    const { tap, interactions } = renderMap({ defaultViewport: { centre: [250, 250], zoom: 64 } });
    tap(200, 150);
    advance(100);
    tap(200, 150);
    expect(interactions()).toHaveLength(0);
  });

  it("starts a fresh pan after a cancelled pinch", () => {
    const { finger, interactions } = renderMap();
    finger("down", 1, 150, 150);
    finger("down", 2, 250, 150);
    finger("move", 2, 300, 150);
    flush();
    finger("cancel", 1, 150, 150);
    finger("cancel", 2, 300, 150);
    const before = latest(interactions());
    finger("down", 3, 100, 100);
    finger("move", 3, 120, 100);
    flush();
    const after = latest(interactions());
    expect(after.zoom).toBeCloseTo(before.zoom, 9);
    expect((before.centre[0] - after.centre[0]) * before.zoom * fitScale).toBeCloseTo(20, 6);
    expect(after.centre[1]).toBeCloseTo(before.centre[1], 6);
  });

  it("forgets a held tap on unmount", () => {
    const { tap, changes, unmount } = renderMap({ defaultSelectedId: "c2" });
    const [horizontal, vertical] = boxAt(latest(changes), 250, 250);
    tap(horizontal, vertical);
    advance(1);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forgets a held tap on a new spec", () => {
    const { tap, changes, selections, rerender } = renderMap({ defaultSelectedId: "c2" });
    const [horizontal, vertical] = boxAt(latest(changes), 250, 250);
    tap(horizontal, vertical);
    rerender(
      <CorpusMap
        spec={{ ...gridSpec }}
        renderCard={(node) => <div>{node.label}</div>}
        width={WIDTH}
        height={HEIGHT}
        defaultSelectedId="c2"
        onSelectedChange={(id) => selections.push(id)}
      />,
    );
    advance(300);
    expect(selections).toEqual([]);
  });

  it("still pans on a mouse drag and clears on a mouse click on empty map at once", () => {
    const { root, changes, interactions, selections } = renderMap({ defaultSelectedId: "c2" });
    const mouse = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
    const before = latest(changes);
    fireEvent.pointerDown(root, { ...mouse, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(root, { ...mouse, button: -1, clientX: 130, clientY: 100 });
    fireEvent.pointerUp(root, { ...mouse, clientX: 130, clientY: 100 });
    flush();
    expect((before.centre[0] - latest(interactions()).centre[0]) * before.zoom * fitScale).toBeCloseTo(30, 6);
    const [horizontal, vertical] = boxAt(latest(changes), 250, 250);
    fireEvent.pointerDown(root, { ...mouse, clientX: horizontal, clientY: vertical });
    fireEvent.pointerUp(root, { ...mouse, clientX: horizontal, clientY: vertical });
    expect(selections).toEqual([null]);
  });
});
