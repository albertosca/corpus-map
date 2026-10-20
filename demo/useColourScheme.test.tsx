import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useColourScheme } from "./useColourScheme";

function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => query);
  return (next: boolean) => {
    for (const listener of listeners) listener({ matches: next });
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useColourScheme", () => {
  it("follows prefers-color-scheme and its changes", () => {
    const change = fakeMatchMedia(true);
    const { result } = renderHook(() => useColourScheme());
    expect(result.current).toBe("dark");
    act(() => change(false));
    expect(result.current).toBe("light");
  });

  it("is light where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useColourScheme()).result.current).toBe("light");
  });
});
