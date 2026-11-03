import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// Counts how often `App` hands `CorpusMap` new props: the wrapper re-renders
// only when its parent does, while the map's own state changes (a zoom)
// re-render the real map underneath without touching the wrapper.
const mapRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("corpus-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("corpus-map")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    CorpusMap: (properties: Parameters<typeof actual.CorpusMap>[0]) => {
      mapRenders.count += 1;
      return createElement(actual.CorpusMap, properties);
    },
  };
});

const SPEC: MapSpec = {
  version: "1",
  territories: [{ id: "west", name: "West", members: ["a", "b", "c"], centroid: [1, 0] }],
  nodes: [
    { id: "a", label: "Alpha", x: 0, y: 0, territory: "west" },
    { id: "b", label: "Beta", x: 1, y: 0, territory: "west" },
    { id: "c", label: "Gamma", x: 2, y: 0, territory: "west" },
  ],
};

/** jsdom has no `ResizeObserver`; this one reports a fixed 1280 x 800 on `observe()`, as a real one does. */
class FixedResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    const size = { width: 1280, height: 800 };
    const entry = {
      target,
      contentRect: size,
      borderBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }

  unobserve(): void {}

  disconnect(): void {}
}

describe("demo indicator commits", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FixedResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a zoom updates the indicator without re-rendering App", async () => {
    render(<App loadArxiv={async () => SPEC} />);
    // The indicator itself, not any text ending in "items": the accessible tree's buttons end that way too.
    await waitFor(() => expect(document.querySelector("[data-indicator]")?.textContent).toMatch(/items$/));
    const before = document.querySelector("[data-indicator]")?.textContent;
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const rendersBefore = mapRenders.count;

    const surface = document.querySelector("[data-map-surface]") as HTMLElement;
    for (let step = 0; step < 4; step += 1) fireEvent.wheel(surface, { deltaY: -40, clientX: 640, clientY: 400 });
    act(() => vi.advanceTimersToNextFrame());

    expect(document.querySelector("[data-indicator]")?.textContent).not.toBe(before);
    expect(mapRenders.count).toBe(rendersBefore);
  });
});
