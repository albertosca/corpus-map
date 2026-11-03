import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import type { Corner } from "./shared/corner";
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

function mount(extra: { legend?: boolean | { corner: Corner }; minimap?: { corner: Corner } } = {}) {
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

  it("stops above the minimap when the two share the left side", () => {
    mount({ legend: true, minimap: { corner: "bottom-left" } });
    const legend = screen.getByRole("region", { name: "Map legend" });
    expect(legend.style.maxHeight).toBe("calc(100% - 146px)");
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

describe("legend touch targets on a narrow box (spec mobile §5)", () => {
  it("are 44 px below a 600 px box and 24 px at 600", () => {
    const { rerender } = render(<CorpusMap spec={spec} width={599} height={300} renderCard={() => null} legend />);
    expect(screen.getByRole("button", { name: "Legend" }).style.minHeight).toBe("44px");
    rerender(<CorpusMap spec={spec} width={600} height={300} renderCard={() => null} legend />);
    expect(screen.getByRole("button", { name: "Legend" }).style.minHeight).toBe("24px");
  });
});

describe("legend and the insets prop (a consumer overlay)", () => {
  it("sits clear of the overlay on its own two sides and gives up the matching height", () => {
    const { rerender } = render(<CorpusMap spec={spec} width={600} height={300} renderCard={() => null} legend />);
    const region = () => screen.getByRole("region", { name: "Map legend" });
    expect([region().style.left, region().style.top, region().style.maxHeight]).toEqual([
      "12px",
      "12px",
      "calc(100% - 24px)",
    ]);
    rerender(
      <CorpusMap
        spec={spec}
        width={600}
        height={300}
        renderCard={() => null}
        legend
        insets={{ left: 340, top: 50, right: 200 }}
      />,
    );
    expect([region().style.left, region().style.top, region().style.maxHeight]).toEqual([
      "352px",
      "62px",
      "calc(100% - 74px)",
    ]);
  });
});
