// @vitest-environment jsdom
// The suite's setup (cleanup, the jsdom `getContext` stub) is imported here,
// not in the bench config, because `field.test.ts` runs in node.
import "../test/setup";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../demo/App";
import arxiv from "../demo/corpora/arxiv.json";
import { withExpandedEdges } from "../demo/corpora/edges";
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

/** Sums each animation frame's commit durations, so a frame that commits twice counts once, whole. */
function frameRecorder() {
  const totals: number[] = [];
  let frame = -1;
  let commitCount = 0;
  const record: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
    if (phase === "mount" || frame < 0) return;
    totals[frame] = (totals[frame] ?? 0) + actualDuration;
    commitCount += 1;
  };
  return {
    record,
    startFrame(index: number) {
      frame = index;
    },
    frameTotals: () => totals.filter((total) => total !== undefined),
    commits: () => commitCount,
  };
}

/** Zooms in about the centre, then drags right for 20 animation frames, recording only the drag. */
function dragZoomedIn(container: HTMLElement, zoomSteps: number, recorder: ReturnType<typeof frameRecorder>) {
  const surface = container.querySelector("[data-map-surface]") as HTMLElement;
  for (let step = 0; step < zoomSteps; step += 1) fireEvent.wheel(surface, { deltaY: -40, clientX: 640, clientY: 400 });
  act(() => vi.advanceTimersToNextFrame());
  fireEvent.pointerDown(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 600, clientY: 400 });
  for (let frame = 0; frame < 20; frame += 1) {
    recorder.startFrame(frame);
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 600 + (frame + 1) * 5, clientY: 400 });
    act(() => vi.advanceTimersToNextFrame());
  }
  recorder.startFrame(-1);
  fireEvent.pointerUp(surface, { pointerId: 1 });
}

describe("commit cost", () => {
  it("prints the map's median commit for a wheel step on arXiv", () => {
    const durations: number[] = [];
    const record: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase !== "mount") durations.push(actualDuration);
    };
    const spec = validateSpec(withExpandedEdges(arxiv));
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

  it("prints the demo App's share of a drag frame on arXiv, zoomed in so the indicator changes", async () => {
    vi.stubGlobal("ResizeObserver", FixedResizeObserver);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const spec = validateSpec(withExpandedEdges(arxiv));
    // At the fitted far view every node stays on screen while panning, so the
    // indicator's count never changes and `App` never re-renders: zooming in
    // first makes points enter and leave, which is the case the rule is about.
    // Twelve steps since slice D fits the first view to territory shapes and
    // names (a wider frame than the points alone): at six, every point stayed
    // on screen and the App never re-rendered.
    const zoomSteps = 12;

    const app = frameRecorder();
    const appRender = render(
      <Profiler id="app" onRender={app.record}>
        <App loadArxiv={async () => spec} />
      </Profiler>,
    );
    await screen.findByText(/Showing territories/);
    dragZoomedIn(appRender.container, zoomSteps, app);
    appRender.unmount();

    const map = frameRecorder();
    const mapRender = render(
      <Profiler id="map" onRender={map.record}>
        <CorpusMap spec={spec} renderCard={() => null} width={1280} height={800} />
      </Profiler>,
    );
    dragZoomedIn(mapRender.container, zoomSteps, map);

    const appFrame = medianOf(app.frameTotals());
    const mapFrame = medianOf(map.frameTotals());
    console.log(
      `drag frame: App ${appFrame.toFixed(2)} ms (${app.commits()} commits), map alone ${mapFrame.toFixed(2)} ms (${map.commits()} commits), App's share ${(appFrame - mapFrame).toFixed(2)} ms`,
    );
    // The indicator must re-render during the drag, or this bench measures the
    // cold case; since the view moved into the indicator's own store
    // (`ViewStore`), `App` itself no longer commits here.
    expect(app.commits()).toBeGreaterThan(map.commits());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
