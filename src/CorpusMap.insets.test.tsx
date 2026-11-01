import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import type { Insets } from "./shared/insets";
import { buildScene } from "./shared/scene";
import type { MapNode, MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

// `s` at the centre, `right` far off to the right at zoom 20.
const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "s", label: "Source", x: 0, y: 0, territory: null },
    { id: "right", label: "Right", x: 1000, y: 0, territory: null },
    { id: "near", label: "Near", x: 10, y: 10, territory: null },
  ],
  edges: [
    { source: "s", target: "right", weight: 2 },
    { source: "s", target: "near", weight: 1 },
  ],
};
const MID = { midAt: 0.5, nearAt: 64 };
const card = (node: MapNode) => <div>{node.label}</div>;
type Change = [MapViewport, { reason: ViewportChangeReason }];
const fitScale = fitScene(spec, buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText), 400, 300, 24).scale;

/** The right edge of the marker drawn for `id`, read off its inline transform and width. */
function markerRight(container: HTMLElement, id: string): number {
  const marker = container.querySelector(`[data-edge-marker="${id}"]`) as HTMLElement | null;
  if (!marker) throw new Error(`no marker for ${id}`);
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(marker.style.transform);
  return Number.parseFloat(match?.[1] ?? "NaN") + Number.parseFloat(marker.style.width);
}

describe("CorpusMap insets (an overlay covering part of the box)", () => {
  it("keeps edge markers out of a right inset", () => {
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
    expect(markerRight(container, "right")).toBeCloseTo(400, 6);
    rerender(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={MID}
        defaultViewport={{ centre: [0, 0], zoom: 20 }}
        defaultSelectedId="s"
        insets={{ right: 100 }}
      />,
    );
    expect(markerRight(container, "right")).toBeCloseTo(300, 6);
  });

  it("reveal centres an item in the uncovered area, at the same zoom", () => {
    const changes: Change[] = [];
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
        insets={{ top: 40, right: 100 }}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => handle.current?.reveal("right"));
    const scale = fitScale * 20;
    // The uncovered area's centre is (150, 170); the box centre (200, 150)
    // then shows the world point that far from the item.
    expect(changes[0]?.[0].centre[0]).toBeCloseTo(1000 + (200 - 150) / scale, 6);
    expect(changes[0]?.[0].centre[1]).toBeCloseTo((150 - 170) / scale, 6);
    expect(changes[0]?.[0].zoom).toBeCloseTo(20, 9);
  });

  it("leaves the fit alone, so an overlay opening never moves the zoom ratio", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    render(
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={400}
        height={300}
        insets={{ right: 100 }}
        defaultViewport={{ centre: [3, 3], zoom: 4 }}
        onViewportChange={(...call) => changes.push(call)}
      />,
    );
    act(() => handle.current?.fit());
    expect(changes[changes.length - 1]?.[0].zoom).toBeCloseTo(1, 9);
  });
  describe("an overlay growing over the selected item (spec mobile §5)", () => {
    const scale = fitScale * 20;
    /** The centre that puts `right` (world x 1000) at screen x `screen` in the 400-wide box. */
    const centreAt = (screen: number): [number, number] => [1000 - (screen - 200) / scale, 0];
    /** Renders with `before`, rerenders with `after`, and returns the view changes the rerender caused. */
    function grow(options: {
      screen: number;
      before: Partial<Insets>;
      after: Partial<Insets>;
      selected?: string;
    }): Change[] {
      const changes: Change[] = [];
      const element = (insets: Partial<Insets>) => (
        <CorpusMap
          renderCard={card}
          spec={spec}
          width={400}
          height={300}
          thresholds={MID}
          defaultViewport={{ centre: centreAt(options.screen), zoom: 20 }}
          {...(options.selected === undefined ? {} : { defaultSelectedId: options.selected })}
          insets={insets}
          onViewportChange={(...call) => changes.push(call)}
        />
      );
      const { rerender } = render(element(options.before));
      changes.length = 0;
      rerender(element(options.after));
      return changes;
    }
    const screenOf = (change: Change | undefined, worldHorizontal: number) =>
      200 + (worldHorizontal - (change?.[0].centre[0] ?? Number.NaN)) * scale;

    it("moves the view to bring the item back into the uncovered area", () => {
      const changes = grow({ screen: 350, before: {}, after: { right: 100 }, selected: "right" });
      expect(changes).toHaveLength(1);
      expect(changes[0]?.[1].reason).toBe("interaction");
      expect(changes[0]?.[0].zoom).toBeCloseTo(20, 9);
      const screen = screenOf(changes[0], 1000);
      expect(screen).toBeGreaterThanOrEqual(0);
      expect(screen).toBeLessThanOrEqual(300);
    });

    it("moves nothing when the overlay grows on another side", () => {
      expect(grow({ screen: 350, before: {}, after: { left: 100 }, selected: "right" })).toEqual([]);
    });

    it("moves nothing when the overlay shrinks", () => {
      expect(grow({ screen: 250, before: { right: 100 }, after: {}, selected: "right" })).toEqual([]);
    });

    it("moves nothing without a selection", () => {
      expect(grow({ screen: 350, before: {}, after: { right: 100 } })).toEqual([]);
    });

    it("moves nothing when the item was already covered before the growth", () => {
      expect(grow({ screen: 350, before: { right: 100 }, after: { right: 150 }, selected: "right" })).toEqual([]);
    });
  });
});
