// @vitest-environment jsdom
// The suite's setup (cleanup, the jsdom `getContext` stub) is imported here,
// not in the bench config, because `field.test.ts` runs in node.
import "../test/setup";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../demo/App";
import arxiv from "../demo/corpora/arxiv.json";
import { CorpusMap } from "../src/CorpusMap";
import { validateSpec } from "../src/shared/spec";

function medianOf(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error("median of an empty list");
  return middle;
}

/**
 * jsdom has no `ResizeObserver`, and the demo `App` fills the window rather
 * than passing a size, so without one the map never measures a box and never
 * mounts (`demo/App.test.tsx` documents the same). This one reports a fixed
 * 1280 x 800 as soon as `observe()` starts, as a real observer does.
 */
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

describe("commit cost", () => {
  it("prints the map's median commit for a wheel step on arXiv", () => {
    const durations: number[] = [];
    const record: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase !== "mount") durations.push(actualDuration);
    };
    const spec = validateSpec(arxiv);
    const { container } = render(
      <Profiler id="map" onRender={record}>
        <CorpusMap spec={spec} renderCard={() => null} width={1280} height={800} />
      </Profiler>,
    );
    const surface = container.querySelector("[data-map-surface]") as HTMLElement;
    for (let step = 0; step < 20; step += 1) fireEvent.wheel(surface, { deltaY: -40, clientX: 640, clientY: 400 });
    const median = medianOf(durations);
    console.log(`wheel commit (map): median ${median.toFixed(2)} ms over ${durations.length}`);
    expect(durations.length).toBeGreaterThanOrEqual(20);
  });

  it("prints the demo App's median commit per drag frame on arXiv", async () => {
    vi.stubGlobal("ResizeObserver", FixedResizeObserver);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const durations: number[] = [];
    const record: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase !== "mount") durations.push(actualDuration);
    };
    const spec = validateSpec(arxiv);
    const { container } = render(
      <Profiler id="app" onRender={record}>
        <App loadArxiv={async () => spec} />
      </Profiler>,
    );
    await screen.findByText(/Showing territories/);
    durations.length = 0;
    const surface = container.querySelector("[data-map-surface]") as HTMLElement;
    fireEvent.pointerDown(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 600, clientY: 400 });
    for (let frame = 1; frame <= 20; frame += 1) {
      fireEvent.pointerMove(surface, { pointerId: 1, clientX: 600 + frame * 5, clientY: 400 });
      act(() => vi.advanceTimersToNextFrame());
    }
    fireEvent.pointerUp(surface, { pointerId: 1 });
    const median = medianOf(durations);
    console.log(`drag commit (App): median ${median.toFixed(2)} ms over ${durations.length}`);
    expect(durations.length).toBeGreaterThanOrEqual(20);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
