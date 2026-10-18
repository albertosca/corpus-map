import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateText } from "./placement";
import { useMeasure } from "./useMeasure";

/** A 2D context that measures every glyph 10 pixels wide, standing in for a browser's. */
function fakeContext(): CanvasRenderingContext2D {
  return {
    font: "",
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D;
}

describe("useMeasure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the deterministic estimate where there is no 2D context", () => {
    const { result } = renderHook(() => useMeasure());
    expect(result.current).toBe(estimateText);
  });

  it("takes the height from the font's pixel size when a 2D context exists", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext());
    const { result } = renderHook(() => useMeasure());
    expect(result.current("Logic", "700 20px system-ui, sans-serif")).toEqual({ width: 50, height: 20 });
    expect(result.current("Logic", "600 15.5px system-ui, sans-serif").height).toBe(15.5);
  });
});
