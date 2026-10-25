import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { MARKER_FONT, MARKER_MAXIMUM_WIDTH } from "./edges/markers";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import type { MapNode, MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

// `s` sits at the centre; `right` and `top` are far off screen at zoom 20,
// `near` is on screen. Thresholds keep zoom 20 in mid (no cards) unless a
// test asks for near.
const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "s", label: "Source", x: 0, y: 0, territory: null },
    { id: "right", label: "Right", x: 1000, y: 0, territory: null },
    { id: "top", label: "Top", x: 0, y: -1000, territory: null },
    { id: "near", label: "Near", x: 10, y: 10, territory: null },
  ],
  edges: [
    { source: "s", target: "right", weight: 3 },
    { source: "s", target: "top", weight: 2 },
    { source: "s", target: "near", weight: 1 },
  ],
};
const MID = { midAt: 0.5, nearAt: 64 };
const card = (node: MapNode) => <div>{node.label}</div>;
type Change = [MapViewport, { reason: ViewportChangeReason }];
const surface = (container: HTMLElement) => container.querySelector("[data-map-surface]") as HTMLElement;

/** The centre of the marker drawn for `id`, read off its inline transform and size. */
function markerCentre(container: HTMLElement, id: string): [number, number] {
  const marker = container.querySelector(`[data-edge-marker="${id}"]`) as HTMLElement | null;
  if (!marker) throw new Error(`no marker for ${id}`);
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(marker.style.transform);
  const left = Number.parseFloat(match?.[1] ?? "NaN");
  const top = Number.parseFloat(match?.[2] ?? "NaN");
  return [left + Number.parseFloat(marker.style.width) / 2, top + Number.parseFloat(marker.style.height) / 2];
}

function press(container: HTMLElement, [horizontal, vertical]: [number, number]) {
  const target = surface(container);
  const event = { clientX: horizontal, clientY: vertical, pointerId: 1, button: 0, isPrimary: true };
  fireEvent.pointerDown(target, event);
  fireEvent.pointerUp(target, event);
}

describe("off-screen neighbour markers (spec slice E §6)", () => {
  it("uncontrolled: pressing a marker selects the neighbour and centres on it at the same zoom", () => {
    const changes: Change[] = [];
    const onSelectedChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
        onSelectedChange={onSelectedChange}
        onSelect={onSelect}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    expect(container.querySelectorAll("[data-edge-marker]")).toHaveLength(2);
    press(container, markerCentre(container, "right"));
    expect(onSelectedChange).toHaveBeenLastCalledWith("right");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "right" }));
    const [view, meta] = changes[changes.length - 1] as Change;
    expect(meta.reason).toBe("interaction");
    expect(view.zoom).toBeCloseTo(20, 9);
    expect(view.centre[0]).toBeCloseTo(1000, 6);
    expect(view.centre[1]).toBeCloseTo(0, 6);
  });

  it("controlled: a marker press proposes the selection and the view, and the drawn view does not move", () => {
    const changes: Change[] = [];
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        viewport={{ centre: [0, 0], zoom: 20 }}
        selectedId="s"
        onSelectedChange={onSelectedChange}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    const before = markerCentre(container, "right");
    press(container, before);
    expect(onSelectedChange).toHaveBeenLastCalledWith("right");
    expect(changes[changes.length - 1]?.[1].reason).toBe("interaction");
    expect(markerCentre(container, "right")).toEqual(before);
  });

  it("a press on a marker over a card goes to the marker; on the card outside it, to the card", () => {
    // jsdom lays nothing out: the card for `near` gets a box under the right marker, every other card none.
    // View and selection are controlled, so both presses meet the same markers and cards.
    const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.getAttribute("data-card");
      const [left, top, width, height] =
        id === null ? [0, 0, 400, 300] : id === "near" ? [250, 120, 150, 60] : [0, 0, 0, 0];
      return {
        x: left,
        y: top,
        width,
        height,
        left,
        top,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      } as DOMRect;
    });
    try {
      const onSelectedChange = vi.fn();
      const { container } = render(
        <CorpusMap
          renderCard={card}
          spec={spec}
          width={400}
          height={300}
          thresholds={{ midAt: 0.5, nearAt: 1 }}
          viewport={{ centre: [0, 0], zoom: 20 }}
          selectedId="s"
          onSelectedChange={onSelectedChange}
        />,
      );
      expect(container.querySelector('[data-card="near"]')).not.toBeNull();
      press(container, markerCentre(container, "right"));
      expect(onSelectedChange).toHaveBeenLastCalledWith("right");
      press(container, [260, 175]);
      expect(onSelectedChange).toHaveBeenLastCalledWith("near");
    } finally {
      rects.mockRestore();
    }
  });

  it("over a marker, shows a pointer and names nothing beneath it, since a press there goes to the marker", () => {
    const queued: FrameRequestCallback[] = [];
    const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      queued.push(callback);
      return queued.length;
    });
    // `under` sits exactly beneath the centre of the `right` marker (right
    // edge, vertical middle); zoom 20 is relative to the fit, which `under`
    // does not move since it lies inside the other nodes' box.
    const markerWidth = Math.min(MARKER_MAXIMUM_WIDTH, estimateText("Right", MARKER_FONT).width + 16);
    const scale =
      20 * fitScene(spec, buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText), 400, 300, 24).scale;
    const underHorizontal = (400 - markerWidth / 2 - 200) / scale;
    const withUnder: MapSpec = {
      ...spec,
      nodes: [...spec.nodes, { id: "under", label: "Under", x: underHorizontal, y: 0, territory: null }],
    };
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={withUnder}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
      />,
    );
    const hoverAt = ([horizontal, vertical]: [number, number]) => {
      fireEvent.pointerMove(surface(container), {
        clientX: horizontal,
        clientY: vertical,
        pointerId: 1,
        pointerType: "mouse",
      });
      act(() => {
        for (const callback of queued.splice(0)) callback(0);
      });
    };
    const centre = markerCentre(container, "right");
    expect(centre[0]).toBeCloseTo(200 + underHorizontal * scale, 6);
    hoverAt(centre);
    expect(container.querySelector("[data-hover]")).toBeNull();
    expect(surface(container).style.cursor).toBe("pointer");
    // Just above the marker (half its 22 px height), still inside the 12 px hover radius of `under`.
    hoverAt([centre[0], centre[1] - 11.5]);
    expect(container.querySelector('[data-hover="under"]')).not.toBeNull();
    expect(surface(container).style.cursor).toBe("");
    frames.mockRestore();
  });

  it("stacks the legend and the minimap above the markers, since their presses never reach the markers", () => {
    const withTerritory: MapSpec = {
      ...spec,
      territories: [{ id: "t", name: "T", members: ["near"], centroid: [10, 10] }],
      nodes: spec.nodes.map((node) => (node.id === "near" ? { ...node, territory: "t" } : node)),
    };
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={withTerritory}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
        legend
        minimap
      />,
    );
    const layer = container.querySelector("[data-edge-markers]") as HTMLElement;
    for (const selector of ["[data-legend]", "[data-minimap]"]) {
      const overlay = container.querySelector(selector) as HTMLElement;
      expect(Number(overlay.style.zIndex)).toBeGreaterThanOrEqual(Number(layer.style.zIndex));
      expect(layer.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("hides the markers from assistive technology, and draws none at far or without a selection", () => {
    const { container, rerender } = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
      />,
    );
    const layer = container.querySelector("[data-edge-markers]");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    rerender(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={{ midAt: 50, nearAt: 64 }}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
      />,
    );
    expect(container.querySelectorAll("[data-edge-marker]")).toHaveLength(0);
    const unselected = render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
      />,
    );
    expect(unselected.container.querySelectorAll("[data-edge-marker]")).toHaveLength(0);
  });

  it("reveal centres on an item at the current zoom without selecting it, and ignores an unknown id", () => {
    const changes: Change[] = [];
    const onSelectedChange = vi.fn();
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        onSelectedChange={onSelectedChange}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => handle.current?.reveal("right"));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0].centre[0]).toBeCloseTo(1000, 6);
    expect(changes[0]?.[0].zoom).toBeCloseTo(20, 9);
    expect(onSelectedChange).not.toHaveBeenCalled();
    act(() => handle.current?.reveal("ghost"));
    expect(changes).toHaveLength(1);
  });

  it("pressing a related item's button selects it and centres on it at the same zoom", () => {
    const changes: Change[] = [];
    const onSelectedChange = vi.fn();
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
        onSelectedChange={onSelectedChange}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    const list = screen.getByRole("list", { name: "Related to Source" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Right", "Top", "Near"]);
    act(() => within(list).getByRole("button", { name: "Right" }).click());
    expect(onSelectedChange).toHaveBeenLastCalledWith("right");
    const [view, meta] = changes[changes.length - 1] as Change;
    expect(meta.reason).toBe("interaction");
    expect(view.zoom).toBeCloseTo(20, 9);
    expect(view.centre[0]).toBeCloseTo(1000, 6);
  });

  it("an item whose only neighbours are in a hidden territory gets no markers, no list and no announcement", () => {
    const hiddenNeighbours: MapSpec = {
      version: "1",
      territories: [
        { id: "home", name: "Home", members: ["s"], centroid: [0, 0] },
        { id: "away", name: "Away", members: ["far", "close"], centroid: [500, 0] },
      ],
      nodes: [
        { id: "s", label: "Source", x: 0, y: 0, territory: "home" },
        { id: "far", label: "Far", x: 1000, y: 0, territory: "away" },
        { id: "close", label: "Close", x: 5, y: 5, territory: "away" },
      ],
      edges: [
        { source: "s", target: "far" },
        { source: "s", target: "close" },
      ],
    };
    const { container } = render(
      <CorpusMap
        renderCard={card}
        spec={hiddenNeighbours}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
        defaultHiddenTerritories={["away"]}
      />,
    );
    expect(container.querySelectorAll("[data-edge-marker]")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: /^Related to/ })).toBeNull();
    expect(screen.getAllByRole("status").map((status) => status.textContent)).not.toContainEqual(
      expect.stringMatching(/related$/),
    );
  });
});
