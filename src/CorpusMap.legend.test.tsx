import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import { validateSpec } from "./shared/spec";

const cluster = (territory: string, left: number) =>
  [0, 1, 2].map((index) => ({
    id: `${territory}${index}`,
    label: `${territory}${index}`,
    x: left + index,
    y: left + index,
    territory,
  }));

const spec = validateSpec({
  version: "1",
  territories: [
    { id: "north", name: "North", members: ["north0", "north1", "north2"], centroid: [1, 1] },
    { id: "south", name: "South", members: ["south0", "south1", "south2"], centroid: [101, 101] },
    { id: "empty", name: "Empty", members: [], centroid: [50, 50] },
  ],
  nodes: [...cluster("north", 0), ...cluster("south", 100)],
});

/** The last view `onViewChange` reported. */
function latest(views: readonly CorpusMapView[]): CorpusMapView | undefined {
  return views[views.length - 1];
}

function mount(extra: { legend?: boolean | { corner: "top-left" }; minimap?: { corner: "top-left" } } = {}) {
  const views: CorpusMapView[] = [];
  render(
    <CorpusMap
      spec={spec}
      width={600}
      height={300}
      renderCard={() => null}
      onViewChange={(view) => views.push(view)}
      {...extra}
    />,
  );
  return views;
}

describe("legend prop", () => {
  it("renders nothing by default", () => {
    mount();
    expect(screen.queryByRole("region", { name: "Map legend" })).toBeNull();
  });

  it("zooms to a territory when its entry is pressed", () => {
    const views = mount({ legend: true });
    expect(latest(views)?.visibleCount).toBe(6);
    fireEvent.click(screen.getByRole("button", { name: "North" }));
    expect(latest(views)?.visibleCount).toBe(3);
  });

  it("does nothing for a territory with no shape", () => {
    const views = mount({ legend: true });
    const before = views.length;
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    expect(views.length).toBe(before);
  });

  it("moves to the next corner clockwise when the minimap holds the requested one", () => {
    mount({ legend: { corner: "top-left" }, minimap: { corner: "top-left" } });
    const legend = screen.getByRole("region", { name: "Map legend" });
    expect(legend.style.top).toBe("12px");
    expect(legend.style.right).toBe("12px");
  });
});

describe("legend review fixes (slice D final review)", () => {
  it("a wheel over the legend scrolls the legend, never zooms the map", () => {
    const views = mount({ legend: true });
    const before = latest(views)?.ratio;
    const region = screen.getByRole("region", { name: "Map legend" });
    const allowed = fireEvent.wheel(region, { deltaY: -300 });
    expect(allowed).toBe(true);
    expect(latest(views)?.ratio).toBe(before);
  });

  it("pressing a legend entry from the far view keeps the legend open and focus inside it", () => {
    const views = mount({ legend: true });
    const north = screen.getByRole("button", { name: "North" });
    north.focus();
    fireEvent.click(north);
    expect(latest(views)?.presentation).toBe("dense");
    const region = screen.getByRole("region", { name: "Map legend" });
    expect(region.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("button", { name: "South" })).toBeTruthy();
  });
});
