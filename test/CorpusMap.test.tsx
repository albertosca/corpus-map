import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "../src/react/CorpusMap";
import type { MapSpec } from "../src/spec";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a"], centroid: [0, 0] }],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1", meta: { secret: 42 } }],
};

describe("CorpusMap", () => {
  it("renders a canvas that is hidden from assistive technology", () => {
    const { container } = render(<CorpusMap spec={spec} renderCard={() => null} width={400} height={300} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
  });

  it("passes meta to renderCard without reading it", () => {
    const renderCard = vi.fn(() => <div>card</div>);
    render(
      <CorpusMap spec={spec} renderCard={renderCard} width={400} height={300} thresholds={{ midAt: 0, nearAt: 0 }} />,
    );
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ meta: { secret: 42 } }));
  });

  it("throws a SpecError for a malformed spec rather than rendering nonsense", () => {
    const bad = { version: "1", territories: [], nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "ghost" }] };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<CorpusMap spec={bad as MapSpec} renderCard={() => null} width={10} height={10} />)).toThrow(
      /ghost/,
    );
    spy.mockRestore();
  });

  it("renders an empty spec without crashing", () => {
    const empty: MapSpec = { version: "1", territories: [], nodes: [] };
    const { container } = render(<CorpusMap spec={empty} renderCard={() => null} width={400} height={300} />);
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("pans and zooms the canvas to a territory when it is focused in the tree (Ruling B)", async () => {
    const user = userEvent.setup();
    const width = 400;
    const height = 300;
    const farApart: MapSpec = {
      version: "1",
      territories: [
        { id: "t1", name: "North", members: ["a"], centroid: [0, 0] },
        { id: "t2", name: "South", members: ["b"], centroid: [1000, 1000] },
      ],
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, territory: "t1" },
        { id: "b", label: "Beta", x: 1000, y: 1000, territory: "t2" },
      ],
    };
    // fitSpec puts the initial scale around 0.25 for this bounding box at
    // this viewport size, so these thresholds start the map in "mid" (tree
    // shows territories, not items) and land exactly in "near" once the
    // focus handler sets the scale to `nearAt`.
    const thresholds = { midAt: 0.1, nearAt: 1 };

    render(
      <CorpusMap
        spec={farApart}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={thresholds}
      />,
    );

    await user.click(screen.getByRole("button", { name: /South/ }));

    const card = document.querySelector('[data-card="b"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    const left = Number.parseFloat(card?.style.left ?? "");
    const top = Number.parseFloat(card?.style.top ?? "");
    expect(Math.abs(left - width / 2)).toBeLessThanOrEqual(5);
    expect(Math.abs(top - height / 2)).toBeLessThanOrEqual(5);
  });
});
