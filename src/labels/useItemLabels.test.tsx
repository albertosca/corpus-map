import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
import { type ItemLabelOptions, placeItemLabels } from "./itemLabels";
import { estimateText } from "./placement";
import { ITEM_LABEL_STEPS_PER_SLICE, useItemLabels } from "./useItemLabels";

const OPTIONS: ItemLabelOptions = { font: "10px sans-serif", width: 160, lines: 3 };

/** A corpus of `count` items on a line, each labelled with its id. */
function corpus(count: number, prefix = "item"): MapSpec {
  return {
    version: "1",
    territories: [],
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `${prefix}${index}`,
      label: `${prefix} ${index}`,
      x: index * 10,
      y: 0,
      territory: null,
    })),
  } as MapSpec;
}

// Two steps per item (wrap, then place): this many items cannot finish in one slice.
const LARGE = ITEM_LABEL_STEPS_PER_SLICE;

function mount(spec: MapSpec, options = OPTIONS) {
  return renderHook(
    ({ current, settings }: { current: MapSpec; settings: ItemLabelOptions }) =>
      useItemLabels(current, [], settings, estimateText),
    { initialProps: { current: spec, settings: options } },
  );
}

function runSlices() {
  act(() => {
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useItemLabels (spec mobile §7)", () => {
  it("places a small corpus during the render, as placeItemLabels does", () => {
    const spec = corpus(10);
    const { result } = mount(spec);
    expect(result.current).toEqual(placeItemLabels(spec, [], OPTIONS, estimateText));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("places a large corpus in slices after the render, to the same labels", () => {
    const spec = corpus(LARGE);
    const { result } = mount(spec);
    expect(result.current).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    runSlices();
    expect(result.current).toEqual(placeItemLabels(spec, [], OPTIONS, estimateText));
  });

  it("keeps the corpus's last labels while placing it again under new options", () => {
    const spec = corpus(LARGE);
    const { result, rerender } = mount(spec);
    runSlices();
    const before = result.current;
    rerender({ current: spec, settings: { ...OPTIONS, width: 80 } });
    expect(result.current).toBe(before);
    runSlices();
    expect(result.current).toEqual(placeItemLabels(spec, [], { ...OPTIONS, width: 80 }, estimateText));
  });

  it("shows no labels of the previous corpus while a new one is placed", () => {
    const { result, rerender } = mount(corpus(LARGE));
    runSlices();
    const next = corpus(LARGE, "other");
    rerender({ current: next, settings: OPTIONS });
    expect(result.current).toEqual([]);
    runSlices();
    expect(result.current).toEqual(placeItemLabels(next, [], OPTIONS, estimateText));
  });

  it("places nothing, with no timer, while the scene of its corpus is still building", () => {
    const { result } = renderHook(() => useItemLabels(null, [], OPTIONS, estimateText));
    expect(result.current).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops placing on unmount", () => {
    const { unmount } = mount(corpus(LARGE));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
