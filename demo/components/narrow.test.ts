import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NARROW_WINDOW_WIDTH, sheetCollapsedHeight, useNarrowWindow, useViewportHeight } from "./narrow";

const original = { width: window.innerWidth, height: window.innerHeight };

function resizeTo(width: number, height: number): void {
  act(() => {
    window.innerWidth = width;
    window.innerHeight = height;
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  window.innerWidth = original.width;
  window.innerHeight = original.height;
});

describe("narrow window (spec mobile §6)", () => {
  it("is narrow below 600 px and follows a resize across it", () => {
    expect(NARROW_WINDOW_WIDTH).toBe(600);
    window.innerWidth = 599;
    const { result } = renderHook(() => useNarrowWindow());
    expect(result.current).toBe(true);
    resizeTo(600, 800);
    expect(result.current).toBe(false);
    resizeTo(375, 812);
    expect(result.current).toBe(true);
  });

  it("follows the window's height", () => {
    window.innerHeight = 700;
    const { result } = renderHook(() => useViewportHeight());
    expect(result.current).toBe(700);
    resizeTo(375, 812);
    expect(result.current).toBe(812);
  });

  it("collapses the sheet to 40% of the window's height, rounded", () => {
    expect(sheetCollapsedHeight(812)).toBe(325);
    expect(sheetCollapsedHeight(568)).toBe(227);
  });
});
