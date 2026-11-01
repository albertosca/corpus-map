import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import type { Viewport } from "./viewport/viewport";

const painted = vi.hoisted(() => [] as Viewport[]);
vi.mock("./shared/paint", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/paint")>();
  return {
    ...original,
    paint: (...parameters: Parameters<typeof original.paint>) => {
      painted.push(parameters[3]);
    },
  };
});

// Large enough that its scene takes several slices (spec mobile §7).
const large = generateCorpus({ seed: 1, size: 1000 });
const other = generateCorpus({ seed: 2, size: 1000 });

function runSlices() {
  act(() => {
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: () => {},
    // `useMeasure`'s offscreen canvas gets this fake context too: the estimate's widths in the font set.
    font: "",
    measureText(this: { font: string }, text: string) {
      return { width: estimateText(text, this.font).width };
    },
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  painted.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CorpusMap with a scene built in slices (spec mobile §7)", () => {
  it("draws nothing until a large corpus's scene is built, then opens on its fit", () => {
    const onViewChange = vi.fn();
    const { container } = render(
      <CorpusMap spec={large} width={800} height={600} renderCard={() => null} onViewChange={onViewChange} />,
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(onViewChange).not.toHaveBeenCalled();
    runSlices();
    expect(container.querySelector("canvas")).not.toBeNull();
    const scene = buildScene(large, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const fitted = fitScene(large, scene, 800, 600, 24, { groupNames: true });
    expect(painted[painted.length - 1]?.scale).toBeCloseTo(fitted.scale, 9);
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange.mock.calls[0]?.[0].ratio).toBeCloseTo(1, 9);
  });

  it("keeps drawing the corpus while its scene is built again for a new tuning", () => {
    const { container, rerender } = render(<CorpusMap spec={large} width={800} height={600} renderCard={() => null} />);
    runSlices();
    rerender(
      <CorpusMap
        spec={large}
        width={400}
        height={300}
        renderCard={() => null}
        tuning={{ hullPadding: DEFAULT_TUNING.hullPadding * 2 }}
      />,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
    runSlices();
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("draws nothing of the old corpus while a new one's scene is built, then fits the new one", () => {
    const { container, rerender } = render(<CorpusMap spec={large} width={800} height={600} renderCard={() => null} />);
    runSlices();
    rerender(<CorpusMap spec={other} width={800} height={600} renderCard={() => null} />);
    expect(container.querySelector("canvas")).toBeNull();
    runSlices();
    expect(container.querySelector("canvas")).not.toBeNull();
    const scene = buildScene(other, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const fitted = fitScene(other, scene, 800, 600, 24, { groupNames: true });
    expect(painted[painted.length - 1]?.scale).toBeCloseTo(fitted.scale, 9);
  });

  it("refits a corpus switched away from and straight back before the other one was built (whole-branch review #4)", () => {
    const onViewChange = vi.fn();
    const handle = createRef<CorpusMapHandle>();
    const mapFor = (spec: typeof large) => (
      <CorpusMap
        ref={handle}
        spec={spec}
        width={800}
        height={600}
        renderCard={() => null}
        onViewChange={onViewChange}
      />
    );
    const { rerender } = render(mapFor(large));
    runSlices();
    act(() => {
      handle.current?.zoomIn();
      handle.current?.zoomIn();
    });
    runSlices();
    expect(onViewChange.mock.calls[onViewChange.mock.calls.length - 1]?.[0].ratio).toBeGreaterThan(1.1);
    const callsBefore = onViewChange.mock.calls.length;

    rerender(mapFor(other));
    rerender(mapFor(large));
    runSlices();

    expect(onViewChange.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(onViewChange.mock.calls[onViewChange.mock.calls.length - 1]?.[0].ratio).toBeCloseTo(1, 9);
  });
});
