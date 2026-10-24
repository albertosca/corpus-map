import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";

const square = (left: number, top: number, size: number): Array<[number, number]> => [
  [left, top],
  [left + size, top],
  [left + size, top + size],
  [left, top + size],
];
// `a` sits at the world origin, which `defaultViewport` puts at the box centre (200, 150).
const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "t", name: "Territory", members: ["a", "b"], centroid: [0, 0], boundary: square(-20, -20, 40) },
    { id: "u", name: "Other", members: ["c"], centroid: [60, 0], boundary: square(50, -10, 20) },
  ],
  nodes: [
    { id: "a", label: "Alpha", x: 0, y: 0, territory: "t" },
    { id: "b", label: "Beta", x: 10, y: 10, territory: "t" },
    { id: "c", label: "Gamma", x: 60, y: 0, territory: "u" },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;
function last<Item>(items: Item[]): Item | undefined {
  return items[items.length - 1];
}
const near = { centre: [0, 0] as [number, number], zoom: 8 };
const surface = (container: HTMLElement) => container.querySelector("[data-map-surface]") as HTMLElement;
const press = (element: HTMLElement, horizontal: number, vertical: number, end = [horizontal, vertical]) => {
  const common = { pointerId: 1, button: 0, isPrimary: true };
  fireEvent.pointerDown(element, { ...common, clientX: horizontal, clientY: vertical });
  if (end[0] !== horizontal || end[1] !== vertical)
    fireEvent.pointerMove(element, { ...common, clientX: end[0], clientY: end[1] });
  fireEvent.pointerUp(element, { ...common, clientX: end[0], clientY: end[1] });
};

describe("selection (spec slice C §3, §5)", () => {
  it("a press on a point selects it and fires onSelect", () => {
    const onSelectedChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        onSelectedChange={onSelectedChange}
        onSelect={onSelect}
      />,
    );
    press(surface(container), 200, 150);
    expect(onSelectedChange).toHaveBeenLastCalledWith("a");
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("a press on empty map clears it", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
      />,
    );
    press(surface(container), 5, 5);
    expect(onSelectedChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("a drag never changes the selection", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
      />,
    );
    press(surface(container), 5, 5, [80, 80]);
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("at far any press clears the selection, even over a point", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={{ centre: [0, 0], zoom: 1 }}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
      />,
    );
    press(surface(container), 200, 150);
    expect(onSelectedChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("re-pressing the selected item fires onSelect again but not onSelectedChange", () => {
    const onSelectedChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
        onSelect={onSelect}
      />,
    );
    press(surface(container), 200, 150);
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("controlled: the prop wins; a press only proposes", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        selectedId={null}
        onSelectedChange={onSelectedChange}
      />,
    );
    press(surface(container), 200, 150);
    expect(onSelectedChange).toHaveBeenLastCalledWith("a");
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-current")).toBeNull();
  });

  it("the first Escape clears the selection, the second zooms out a regime", () => {
    const onSelectedChange = vi.fn();
    const views: CorpusMapView[] = [];
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
        onViewChange={(view) => views.push(view)}
      />,
    );
    fireEvent.keyDown(surface(container), { key: "Escape" });
    expect(onSelectedChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(last(views)?.ratio).toBeCloseTo(8, 9);
    fireEvent.keyDown(surface(container), { key: "Escape" });
    expect(last(views)?.ratio).toBeLessThan(8);
  });

  it("a dimmed selection reads null in the tree, emits nothing, and returns when shown", () => {
    const onSelectedChange = vi.fn();
    const properties = {
      renderCard: card,
      spec,
      width: 400,
      height: 300,
      defaultViewport: near,
      defaultSelectedId: "a",
      onSelectedChange,
    };
    const { rerender } = render(<CorpusMap {...properties} hiddenTerritories={[]} />);
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-current")).toBe("true");
    rerender(<CorpusMap {...properties} hiddenTerritories={["t"]} />);
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    rerender(<CorpusMap {...properties} hiddenTerritories={[]} />);
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-current")).toBe("true");
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("Escape over a dimmed selection zooms out and keeps the selection for when it is shown", () => {
    const onSelectedChange = vi.fn();
    const views: CorpusMapView[] = [];
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        hiddenTerritories={["t"]}
        onSelectedChange={onSelectedChange}
        onViewChange={(view) => views.push(view)}
      />,
    );
    fireEvent.keyDown(surface(container), { key: "Escape" });
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(last(views)?.ratio).toBeLessThan(8);
  });

  it("Escape inside the tree leaves the selection alone", () => {
    const onSelectedChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        defaultSelectedId="a"
        onSelectedChange={onSelectedChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Alpha" }), { key: "Escape" });
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("a tree item selects, fires onSelect and carries aria-current", () => {
    const onSelectedChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        defaultViewport={near}
        onSelectedChange={onSelectedChange}
        onSelect={onSelect}
      />,
    );
    act(() => screen.getByRole("button", { name: "Alpha" }).click());
    expect(onSelectedChange).toHaveBeenLastCalledWith("a");
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" }));
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-current")).toBe("true");
  });
});
