import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Steps } from "./steps";
import { SLICE_BUDGET_MILLISECONDS, type Sliced, startSlices, useSliced } from "./useSliced";

/** `count` steps, then `result`. */
function* counting(count: number, result: string): Steps<string> {
  for (let step = 0; step < count; step += 1) yield;
  return result;
}

function mount(initial: Sliced<string>) {
  return renderHook(({ sliced }: { sliced: Sliced<string> }) => useSliced(sliced), {
    initialProps: { sliced: initial },
  });
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

describe("useSliced (spec mobile §7)", () => {
  it("finishes work that fits one slice during the render, with no timer", () => {
    const sliced = startSlices(counting(3, "small"), 4);
    const { result } = mount(sliced);
    expect(result.current).toEqual({ sliced, value: "small" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes longer work one slice per task after the render", () => {
    const sliced = startSlices(counting(10, "large"), 4);
    const { result } = mount(sliced);
    expect(result.current).toBeNull();
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(result.current).toBeNull();
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(result.current).toEqual({ sliced, value: "large" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the last finished work while newer work runs", () => {
    const first = startSlices(counting(10, "first"), 4);
    const { result, rerender } = mount(first);
    runSlices();
    const second = startSlices(counting(10, "second"), 4);
    rerender({ sliced: second });
    expect(result.current).toEqual({ sliced: first, value: "first" });
    runSlices();
    expect(result.current).toEqual({ sliced: second, value: "second" });
  });

  it("drops work replaced before it finished", () => {
    const first = startSlices(counting(10, "first"), 4);
    const { result, rerender } = mount(first);
    const second = startSlices(counting(10, "second"), 4);
    rerender({ sliced: second });
    runSlices();
    expect(result.current).toEqual({ sliced: second, value: "second" });
  });

  it("ends a slice after a task's time budget, before its step count (spec mobile §7)", () => {
    let clock = 0;
    function* timed(): Steps<string> {
      for (let step = 0; step < 100; step += 1) {
        clock += 10;
        yield;
      }
      return "timed";
    }
    const sliced = startSlices(timed(), 50);
    expect(clock).toBe(500);
    const { result } = renderHook(() => useSliced(sliced, () => clock));
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(clock).toBe(500 + 10 * Math.ceil(SLICE_BUDGET_MILLISECONDS / 10));
    runSlices();
    expect(result.current).toEqual({ sliced, value: "timed" });
  });

  it("stops on unmount", () => {
    const { unmount } = mount(startSlices(counting(10, "large"), 4));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
