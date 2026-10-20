import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBorderBoxHeight } from "./useBorderBoxHeight";

class SilentResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

afterEach(() => vi.unstubAllGlobals());

describe("useBorderBoxHeight", () => {
  it("reports the element's height on the first commit, before any ResizeObserver callback (slice D browser check)", () => {
    vi.stubGlobal("ResizeObserver", SilentResizeObserver);
    const element = document.createElement("header");
    element.getBoundingClientRect = () => ({ height: 52 }) as DOMRect;
    const { result } = renderHook(() => useBorderBoxHeight({ current: element }));
    expect(result.current).toBe(52);
  });
});
