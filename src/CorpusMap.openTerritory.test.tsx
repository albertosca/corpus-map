import { fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";

const square = (left: number, top: number, size: number): Array<[number, number]> => [
  [left, top],
  [left + size, top],
  [left + size, top + size],
  [left, top + size],
];
const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "big", name: "Big", members: ["a", "b", "c"], centroid: [0, 0], boundary: square(-40, -40, 80) },
    { id: "small", name: "Small", members: ["d"], centroid: [0, 0], boundary: square(-5, -5, 10) },
  ],
  nodes: [
    { id: "a", label: "A", x: -30, y: -30, territory: "big" },
    { id: "b", label: "B", x: 30, y: 30, territory: "big" },
    { id: "c", label: "C", x: 30, y: -30, territory: "big" },
    { id: "d", label: "D", x: 0, y: 0, territory: "small" },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;
const surface = (container: HTMLElement) => container.querySelector("[data-map-surface]") as HTMLElement;

describe("onOpenTerritoryChange (spec slice C §3)", () => {
  it("a link straight into near over a territory fires once after mount, with the innermost id", () => {
    const onOpenTerritoryChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={{ centre: [0, 0], zoom: 8 }}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    expect(onOpenTerritoryChange).toHaveBeenCalledExactlyOnceWith("small");
  });

  it("fires once under StrictMode, whose second effect run sees the same value", () => {
    const onOpenTerritoryChange = vi.fn();
    render(
      <StrictMode>
        <CorpusMap
          renderCard={card}
          spec={spec}
          width={400}
          height={300}
          defaultViewport={{ centre: [0, 0], zoom: 8 }}
          onOpenTerritoryChange={onOpenTerritoryChange}
        />
      </StrictMode>,
    );
    expect(onOpenTerritoryChange).toHaveBeenCalledExactlyOnceWith("small");
  });

  it("zooming out of near emits null", () => {
    const onOpenTerritoryChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={{ centre: [0, 0], zoom: 8 }}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    fireEvent.keyDown(surface(container), { key: "Escape" });
    expect(onOpenTerritoryChange).toHaveBeenLastCalledWith(null);
    expect(onOpenTerritoryChange).toHaveBeenCalledTimes(2);
  });

  it("panning the box centre off every territory emits null", () => {
    const onOpenTerritoryChange = vi.fn();
    const properties = { renderCard: card, spec, width: 400, height: 300, onOpenTerritoryChange };
    const { rerender } = render(<CorpusMap {...properties} viewport={{ centre: [0, 0], zoom: 8 }} />);
    rerender(<CorpusMap {...properties} viewport={{ centre: [200, 200], zoom: 8 }} />);
    expect(onOpenTerritoryChange.mock.calls).toEqual([["small"], [null]]);
  });

  it("near over empty map never fires", () => {
    const onOpenTerritoryChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={{ centre: [200, 200], zoom: 8 }}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    expect(onOpenTerritoryChange).not.toHaveBeenCalled();
  });

  it("a dimmed territory never opens: the one around it does", () => {
    const onOpenTerritoryChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        hiddenTerritories={["small"]}
        defaultViewport={{ centre: [0, 0], zoom: 8 }}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    expect(onOpenTerritoryChange).toHaveBeenCalledExactlyOnceWith("big");
  });

  it("at far nothing is open", () => {
    const onOpenTerritoryChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    expect(onOpenTerritoryChange).not.toHaveBeenCalled();
  });
});
