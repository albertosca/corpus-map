import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapProps, type CorpusMapView } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import { validateSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import { toScreen } from "./viewport/viewport";

// The North/South/Empty spec of CorpusMap.legend.test.tsx, copied (test files do not share fixtures here).
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

/** A canvas context that ignores every call but counts `clearRect`, which `paint` issues once per frame. */
function countingContext(paints: { count: number }): CanvasRenderingContext2D {
  const fake: Record<string, unknown> = {
    canvas: { width: 0, height: 0 },
    clearRect: () => {
      paints.count += 1;
    },
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return new Proxy(fake, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function base(views: CorpusMapView[]): CorpusMapProps {
  return { spec, width: 600, height: 300, renderCard: () => null, onViewChange: (view) => views.push(view) };
}

function mountWith(extra: Partial<CorpusMapProps>): CorpusMapView[] {
  const views: CorpusMapView[] = [];
  render(<CorpusMap {...base(views)} {...extra} />);
  return views;
}

describe("legend in a narrow map", () => {
  it("starts collapsed below 480 px wide and expanded at 480", () => {
    const { unmount } = render(<CorpusMap {...base([])} width={479} legend />);
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("false");
    unmount();
    render(<CorpusMap {...base([])} width={480} legend />);
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("dimming territories", () => {
  it("uncontrolled: defaultHiddenTerritories dims at mount, the legend changes it, and the callback hears it", () => {
    const changes: string[][] = [];
    const views = mountWith({
      legend: true,
      defaultHiddenTerritories: ["south"],
      onHiddenTerritoriesChange: (ids) => changes.push(ids),
    });
    expect(latest(views)?.visibleCount).toBe(3);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show South" }));
    expect(changes).toEqual([[]]);
    expect(latest(views)?.visibleCount).toBe(6);
  });

  it("controlled: the prop wins and a checkbox press only reports", () => {
    const changes: string[][] = [];
    const views = mountWith({
      legend: true,
      hiddenTerritories: ["south"],
      onHiddenTerritoriesChange: (ids) => changes.push(ids),
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show South" }));
    expect(changes).toEqual([[]]);
    expect(latest(views)?.visibleCount).toBe(3);
  });

  it("ignores unknown ids and ids containing separators", () => {
    const views = mountWith({ legend: true, hiddenTerritories: ["nope", "a,b", "\n", '"'] });
    expect(latest(views)?.visibleCount).toBe(6);
    // Unfiltered, the legend would count the four unknown ids as hidden.
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("a fresh array literal with the same ids does not repaint or report", () => {
    const paints = { count: 0 };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => countingContext(paints)) as unknown as typeof original;
    try {
      const views: CorpusMapView[] = [];
      const { rerender } = render(<CorpusMap {...base(views)} hiddenTerritories={["south"]} />);
      const before = { views: views.length, paints: paints.count };
      expect(before.paints).toBeGreaterThan(0);
      rerender(<CorpusMap {...base(views)} hiddenTerritories={["south"]} />);
      expect({ views: views.length, paints: paints.count }).toEqual(before);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("a dimmed territory's points get no card and no accessible button", () => {
    mountWith({
      hiddenTerritories: ["south"],
      thresholds: { midAt: 0, nearAt: 0 },
      renderCard: (node) => <div>{node.label}</div>,
    });
    expect(document.querySelector('[data-card="south0"]')).toBeNull();
    expect(document.querySelector('[data-card="north0"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /south0/ })).toBeNull();
    expect(screen.getByRole("button", { name: "north0" })).toBeTruthy();
  });

  it("every territory dimmed: visibleCount 0, no card, Show all restores everything", () => {
    const views = mountWith({ legend: true, defaultHiddenTerritories: ["north", "south", "empty"] });
    expect(latest(views)?.visibleCount).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Show all (3 hidden)" }));
    expect(latest(views)?.visibleCount).toBe(6);
  });

  it("every territory dimmed: no card shows and nothing hovers, at near and at far", () => {
    const callbacks: FrameRequestCallback[] = [];
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    try {
      const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
      const [left, top] = toScreen(fitScene(spec, scene, 600, 300, 24), 1, 1);
      const hoverNorth = (surface: Element) => {
        fireEvent.pointerMove(surface, { clientX: left, clientY: top, pointerId: 1, pointerType: "mouse" });
        act(() => {
          for (const callback of callbacks.splice(0)) callback(0);
        });
      };
      const hovered = () =>
        document.querySelector("[data-hover]") !== null || document.querySelector("[data-hover-territories]") !== null;
      const allHidden = ["empty", "north", "south"];
      for (const thresholds of [
        { midAt: 0, nearAt: 0 },
        { midAt: 2, nearAt: 6 },
      ]) {
        const properties: CorpusMapProps = {
          ...base([]),
          thresholds,
          renderCard: (node) => <div>{node.label}</div>,
        };
        const { container, rerender, unmount } = render(<CorpusMap {...properties} hiddenTerritories={allHidden} />);
        const surface = container.querySelector("[data-map-surface]") as Element;
        expect(container.querySelector("[data-card]")).toBeNull();
        hoverNorth(surface);
        expect(hovered()).toBe(false);
        // The same pointer over the same map, nothing dimmed, does hover: the probe can see one.
        rerender(<CorpusMap {...properties} hiddenTerritories={[]} />);
        hoverNorth(surface);
        expect(hovered()).toBe(true);
        unmount();
      }
    } finally {
      frame.mockRestore();
    }
  });
});
