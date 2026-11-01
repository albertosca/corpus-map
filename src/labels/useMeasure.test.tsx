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

  it("sets the context's font only when it changes, since a browser parses every assignment (spec mobile §7)", () => {
    const assigned: string[] = [];
    let current = "";
    const context = {
      get font() {
        return current;
      },
      set font(value: string) {
        assigned.push(value);
        current = value;
      },
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const { result } = renderHook(() => useMeasure());
    result.current("graph", "500 11px system-ui, sans-serif");
    result.current("neural", "500 11px system-ui, sans-serif");
    expect(result.current("nets", "700 20px system-ui, sans-serif")).toEqual({ width: 40, height: 20 });
    result.current("graph", "500 11px system-ui, sans-serif");
    expect(assigned).toEqual([
      "500 11px system-ui, sans-serif",
      "700 20px system-ui, sans-serif",
      "500 11px system-ui, sans-serif",
    ]);
  });
});
