import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

/**
 * A wheel that lands between the first measured commit and React's flush of
 * passive effects must still zoom (the slice E bench flake): the handler used
 * to read the fit scale from a ref synced in a passive effect, which still
 * held the pre-measure fit, so every step clamped to "no change".
 */
const reports: Array<(width: number, height: number) => void> = [];

class ReportingResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    reports.push((width, height) =>
      callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver),
    );
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let original: typeof ResizeObserver | undefined;

beforeEach(() => {
  original = globalThis.ResizeObserver;
  reports.length = 0;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ReportingResizeObserver;
});

afterEach(() => {
  if (original) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = original;
  else Reflect.deleteProperty(globalThis, "ResizeObserver");
});

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: -5, y: 0, territory: null },
    { id: "b", label: "B", x: 5, y: 0, territory: null },
  ],
};

describe("CorpusMap: wheel right after the first measured commit", () => {
  it("zooms instead of clamping against the pre-measure fit", async () => {
    const views: CorpusMapView[] = [];
    const { container } = render(
      <CorpusMap spec={spec} renderCard={() => null} onViewChange={(view) => views.push(view)} />,
    );
    const zoomed = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const surface = container.querySelector("[data-map-surface]");
        if (!surface) return;
        observer.disconnect();
        for (let step = 0; step < 12; step += 1) fireEvent.wheel(surface, { deltaY: -120, clientX: 400, clientY: 300 });
        resolve();
      });
      observer.observe(container, { childList: true, subtree: true });
    });
    // Outside `act`, as a real ResizeObserver delivers it: the commit and the
    // passive effects are then separate tasks, the window the wheel lands in.
    const report = reports[reports.length - 1];
    if (!report) throw new Error("expected a ResizeObserver");
    report(800, 600);
    await zoomed;
    await act(async () => {});
    expect(views[views.length - 1]?.ratio ?? 1).toBeGreaterThan(1);
  });
});
