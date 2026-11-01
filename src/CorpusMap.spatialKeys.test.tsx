import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import { DEFAULT_THRESHOLDS } from "./lod/lod";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_TUNING } from "./shared/tuning";
import type { MapViewport } from "./viewport/publicViewport";

// A 5 × 5 grid, 100 world units apart: columns a-c in West, d-e in East; c2 sits at the centre of the fit.
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

function renderMap(properties: Partial<Parameters<typeof CorpusMap>[0]> = {}) {
  const result = render(
    <CorpusMap
      spec={gridSpec}
      renderCard={(node) => <div>{node.label}</div>}
      width={400}
      height={300}
      {...properties}
    />,
  );
  const root = result.container.querySelector("[data-map-surface]") as HTMLElement;
  const rawAnnouncement = () => result.container.querySelector("[data-count-announcement]")?.textContent ?? "";
  const announcement = () => rawAnnouncement().trim();
  return { ...result, root, announcement, rawAnnouncement };
}

const last = <Item,>(items: readonly Item[]): Item | undefined => items[items.length - 1];

afterEach(() => {
  vi.useRealTimers();
});

describe("walking the map with the keyboard (spec spatial keys)", () => {
  it.each(["Enter", " "])("selects the item nearest the centre on %j", (key) => {
    const selections: Array<string | null> = [];
    const { root, announcement } = renderMap({ onSelectedChange: (id) => selections.push(id) });
    fireEvent.keyDown(root, { key });
    expect(selections).toEqual(["c2"]);
    expect(announcement()).toBe("Item c2, West");
  });

  it("moves to the neighbour on an arrow, fires onSelect and names it", () => {
    const selected: string[] = [];
    const { root, announcement } = renderMap({ defaultSelectedId: "c2", onSelect: (node) => selected.push(node.id) });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(selected).toEqual(["d2"]);
    expect(announcement()).toBe("Item d2, East");
  });

  it("names an item without a territory by its label alone", () => {
    const spec: MapSpec = {
      ...gridSpec,
      territories: [],
      nodes: gridSpec.nodes.map((node) => ({ ...node, territory: null })),
    };
    const { root, announcement } = renderMap({ spec, defaultSelectedId: "c2" });
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(announcement()).toBe("Item c1");
  });

  it("pans on Shift+arrow while an item is selected, keeping the selection", () => {
    const selections: Array<string | null> = [];
    const views: MapViewport[] = [];
    const { root } = renderMap({
      defaultSelectedId: "c2",
      onSelectedChange: (id) => selections.push(id),
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key: "ArrowRight", shiftKey: true });
    expect(selections).toEqual([]);
    expect(views).toHaveLength(1);
  });

  it("gives the arrows back to panning after Escape", () => {
    const selections: Array<string | null> = [];
    const views: MapViewport[] = [];
    const { root } = renderMap({
      defaultSelectedId: "c2",
      onSelectedChange: (id) => selections.push(id),
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key: "Escape" });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(selections).toEqual([null]);
    expect(views).toHaveLength(1);
  });

  it("pans when the selected item's territory is dimmed", () => {
    const selections: Array<string | null> = [];
    const views: MapViewport[] = [];
    const { root } = renderMap({
      defaultSelectedId: "e2",
      hiddenTerritories: ["east"],
      onSelectedChange: (id) => selections.push(id),
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(selections).toEqual([]);
    expect(views).toHaveLength(1);
  });

  it("never walks into a dimmed territory", () => {
    const selections: Array<string | null> = [];
    const { root, announcement } = renderMap({
      defaultSelectedId: "c2",
      hiddenTerritories: ["east"],
      onSelectedChange: (id) => selections.push(id),
    });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(selections).toEqual([]);
    expect(announcement()).toBe("No item to the right");
  });

  it("advances one item per press under a controlled selection that commits late", () => {
    const selections: Array<string | null> = [];
    const { root } = renderMap({ selectedId: "b2", onSelectedChange: (id) => selections.push(id) });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(selections).toEqual(["c2", "d2"]);
  });

  it("walks from the drawn selection once the consumer commits one of its own", () => {
    const selections: Array<string | null> = [];
    const properties = { onSelectedChange: (id: string | null) => selections.push(id) };
    const { root, rerender } = renderMap({ selectedId: "b2", ...properties });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    rerender(
      <CorpusMap
        spec={gridSpec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        selectedId="a0"
        {...properties}
      />,
    );
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(selections).toEqual(["c2", "a1"]);
  });

  it.each([
    ["ArrowRight", "e2", "No item to the right"],
    ["ArrowLeft", "a2", "No item to the left"],
    ["ArrowUp", "c0", "No item above"],
    ["ArrowDown", "c4", "No item below"],
  ])("announces %s with no neighbour from %s, a second press again, without moving", (key, from, text) => {
    const views: MapViewport[] = [];
    const { root, announcement, rawAnnouncement } = renderMap({
      defaultSelectedId: from,
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key });
    const first = rawAnnouncement();
    expect(announcement()).toBe(text);
    fireEvent.keyDown(root, { key });
    expect(announcement()).toBe(text);
    expect(rawAnnouncement()).not.toBe(first);
    expect(views).toHaveLength(0);
  });

  it("handles an arrow with no neighbour, so the page does not scroll", () => {
    const { root } = renderMap({ defaultSelectedId: "e2" });
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps the item's name over a count that a pan just scheduled", () => {
    vi.useFakeTimers();
    const { root, announcement } = renderMap({ defaultSelectedId: "c2" });
    fireEvent.keyDown(root, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(root, { key: "ArrowDown" });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(announcement()).toBe("Item c3, West");
  });

  it("does not move the view for a neighbour well inside it", () => {
    const views: MapViewport[] = [];
    const { root } = renderMap({ defaultSelectedId: "c2", onViewportChange: (view) => views.push(view) });
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(views).toHaveLength(0);
  });

  it("centres on a neighbour that an inset covers, at the same zoom", () => {
    const views: MapViewport[] = [];
    const { root } = renderMap({
      defaultSelectedId: "c2",
      insets: { right: 200 },
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(views).toHaveLength(1);
    const [view] = views;
    // d2 (world x = 300) now sits at the usable area's centre, half the box's width left of the box's centre.
    expect(view?.centre[0]).toBeGreaterThan(300);
    expect(view?.centre[1]).toBeCloseTo(200, 1);
    expect(view?.zoom).toBeCloseTo(1);
  });

  it("zooms to the near landing, centred on the item, when Enter selects at far", () => {
    const changes: CorpusMapView[] = [];
    const views: MapViewport[] = [];
    const { root } = renderMap({
      onViewChange: (view) => changes.push(view),
      onViewportChange: (view) => views.push(view),
    });
    expect(last(changes)?.regime).toBe("far");
    fireEvent.keyDown(root, { key: "Enter" });
    expect(last(changes)?.regime).toBe("near");
    expect(last(changes)?.ratio).toBeCloseTo(DEFAULT_THRESHOLDS.nearAt * (1 + DEFAULT_TUNING.fadeBand));
    expect(last(views)?.centre[0]).toBeCloseTo(200, 1);
    expect(last(views)?.centre[1]).toBeCloseTo(200, 1);
  });

  it("selects without zooming when Enter finds the points drawn", () => {
    const changes: CorpusMapView[] = [];
    const views: MapViewport[] = [];
    const selections: Array<string | null> = [];
    const { root } = renderMap({
      defaultViewport: { centre: [200, 200], zoom: 3 },
      onSelectedChange: (id) => selections.push(id),
      onViewChange: (view) => changes.push(view),
      onViewportChange: (view) => views.push(view),
    });
    fireEvent.keyDown(root, { key: "Enter" });
    expect(selections).toEqual(["c2"]);
    expect(views).toHaveLength(0);
    expect(last(changes)?.ratio).toBeCloseTo(3);
  });

  it("never zooms on an arrow, even at far", () => {
    const changes: CorpusMapView[] = [];
    const { root } = renderMap({ defaultSelectedId: "c2", onViewChange: (view) => changes.push(view) });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(last(changes)?.regime).toBe("far");
    expect(last(changes)?.ratio).toBeCloseTo(1);
  });

  it("takes no arrow while focus is inside the accessible tree", () => {
    const selections: Array<string | null> = [];
    const { container } = renderMap({ defaultSelectedId: "c2", onSelectedChange: (id) => selections.push(id) });
    const treeButton = container.querySelector("[data-map-surface] button");
    if (!(treeButton instanceof HTMLElement)) throw new Error("expected a tree button");
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    act(() => {
      treeButton.dispatchEvent(event);
    });
    expect(selections).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("handles no Enter on an empty corpus", () => {
    const { root } = renderMap({ spec: { version: "1", territories: [], nodes: [] } });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Enter alone while an item is selected", () => {
    const { root } = renderMap({ defaultSelectedId: "c2" });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });
});
