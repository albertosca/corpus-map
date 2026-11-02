import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
import { SEARCH_DEBOUNCE_MILLISECONDS, SearchBox, type SearchBoxProps } from "./SearchBox";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "alpha", label: "Alpha graphs", x: 0, y: 0, territory: null },
    { id: "beta", label: "Beta trees", x: 1, y: 0, territory: null, meta: { category: "cs.DS" } },
    { id: "gamma", label: "Gamma graphs", x: 2, y: 0, territory: null },
  ],
};
const otherSpec: MapSpec = { ...spec, nodes: spec.nodes.slice(0, 1) };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const input = () => screen.getByRole("textbox");
const landmark = (): HTMLElement => {
  const element = document.querySelector("search");
  if (!(element instanceof HTMLElement)) throw new Error("no <search> element");
  return element;
};
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const settle = (milliseconds = SEARCH_DEBOUNCE_MILLISECONDS) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
const lastCall = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1]?.[0];

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((settleResolve, settleReject) => {
    resolve = settleResolve;
    reject = settleReject;
  });
  return { promise, resolve, reject };
}

function mount(properties: Partial<SearchBoxProps> = {}) {
  const onMatches = vi.fn();
  const result = render(<SearchBox spec={spec} onMatches={onMatches} {...properties} />);
  return { onMatches, ...result };
}

describe("SearchBox (spec search §4, §5)", () => {
  it("waits the debounce, then reports the local matches in spec order", async () => {
    const { onMatches } = mount();
    type("graphs");
    await settle(SEARCH_DEBOUNCE_MILLISECONDS - 1);
    expect(onMatches).not.toHaveBeenCalled();
    await settle(1);
    expect(onMatches).toHaveBeenCalledTimes(1);
    expect(lastCall(onMatches)).toEqual(["alpha", "gamma"]);
  });

  it("searches meta as well, and folds accents", async () => {
    const { onMatches } = mount();
    type("CS.ds");
    await settle();
    expect(lastCall(onMatches)).toEqual(["beta"]);
  });

  it("passes the trimmed query to a consumer's search, once per settled query", async () => {
    const search = vi.fn(() => ["beta"]);
    const { onMatches } = mount({ search });
    type("  tre  ");
    type("  trees  ");
    await settle();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("trees");
    expect(lastCall(onMatches)).toEqual(["beta"]);
  });

  it("reports null for an empty or blank query without calling the search", async () => {
    const search = vi.fn(() => ["beta"]);
    const { onMatches } = mount({ search });
    type("trees");
    await settle();
    type("   ");
    await settle();
    expect(lastCall(onMatches)).toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("drops a slow answer that arrives after a newer query's", async () => {
    const slow = deferred<string[]>();
    const fast = deferred<string[]>();
    const search = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { onMatches } = mount({ search });
    type("one");
    await settle();
    type("two");
    await settle();
    await act(async () => fast.resolve(["beta"]));
    await act(async () => slow.resolve(["alpha"]));
    expect(onMatches.mock.calls.map((call) => call[0])).toEqual([["beta"]]);
  });

  it("shows 'Search failed' and reports null when the search rejects", async () => {
    const search = vi.fn(() => Promise.reject(new Error("offline")));
    const { onMatches } = mount({ search });
    type("trees");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Search failed");
    expect(lastCall(onMatches)).toBeNull();
  });

  it("treats a search that throws synchronously like a rejection", async () => {
    const search = vi.fn(() => {
      throw new Error("bug");
    });
    const { onMatches } = mount({ search });
    type("trees");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Search failed");
    expect(lastCall(onMatches)).toBeNull();
  });

  it("says 'No results' and reports an empty list when nothing matches", async () => {
    const { onMatches } = mount();
    type("zzz");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("No results");
    expect(lastCall(onMatches)).toEqual([]);
  });

  it("announces the count, singular and plural", async () => {
    mount();
    type("graphs");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("2 results");
    type("beta");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("1 result");
  });

  it("passes a consumer's ids through de-duplicated, unknown ids included (the map ignores them)", async () => {
    const { onMatches } = mount({ search: () => ["beta", "ghost", "beta"] });
    type("anything");
    await settle();
    expect(lastCall(onMatches)).toEqual(["beta", "ghost"]);
    expect(screen.getByRole("status").textContent).toBe("2 results");
  });

  it("clears the input and reports null when the spec changes, dropping a pending answer", async () => {
    const pending = deferred<string[]>();
    const { onMatches, rerender } = mount({ search: () => pending.promise });
    type("trees");
    await settle();
    rerender(<SearchBox spec={otherSpec} onMatches={onMatches} search={() => pending.promise} />);
    expect((input() as HTMLInputElement).value).toBe("");
    expect(lastCall(onMatches)).toBeNull();
    const calls = onMatches.mock.calls.length;
    await act(async () => pending.resolve(["beta"]));
    expect(onMatches.mock.calls).toHaveLength(calls);
  });

  it("does not report after it unmounts with an answer pending", async () => {
    const pending = deferred<string[]>();
    const { onMatches, unmount } = mount({ search: () => pending.promise });
    type("trees");
    await settle();
    unmount();
    await act(async () => pending.resolve(["beta"]));
    expect(onMatches).not.toHaveBeenCalled();
  });

  it("clears on Escape and keeps the focus in the input", async () => {
    const { onMatches } = mount();
    type("graphs");
    await settle();
    act(() => input().focus());
    fireEvent.keyDown(input(), { key: "Escape" });
    expect((input() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input());
    await settle();
    expect(lastCall(onMatches)).toBeNull();
  });

  it("has a named clear button that empties the input and returns the focus to it", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    type("graphs");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input());
  });

  it("is a search landmark with an accessible name, overridable by label", () => {
    const { unmount } = mount();
    // The native <search> element is the landmark; the DOM test library does not map it to a role yet.
    expect(landmark().getAttribute("aria-label")).toBe("Search");
    expect(input().getAttribute("aria-label")).toBe("Search");
    unmount();
    mount({ label: "Find a paper" });
    expect(landmark().getAttribute("aria-label")).toBe("Find a paper");
  });

  it("offers 'Show on map' only with onShow and results, and calls it", async () => {
    const onShow = vi.fn();
    const { unmount } = mount();
    type("graphs");
    await settle();
    expect(screen.queryByRole("button", { name: "Show on map" })).toBeNull();
    unmount();
    mount({ onShow });
    expect(screen.queryByRole("button", { name: "Show on map" })).toBeNull();
    type("zzz");
    await settle();
    expect(screen.queryByRole("button", { name: "Show on map" })).toBeNull();
    type("graphs");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Show on map" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("describes the input with the hint, and passes style to the container", () => {
    mount({ hint: "Searches titles in your browser", style: { maxWidth: 321 } });
    const describedBy = input().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe("Searches titles in your browser");
    expect(landmark().style.maxWidth).toBe("321px");
  });

  it("caps every control at its container's width, so a narrow bar never overflows", async () => {
    mount({ onShow: () => {} });
    type("graphs");
    await settle();
    for (const control of [
      input(),
      screen.getByRole("button", { name: "Clear search" }),
      screen.getByRole("button", { name: "Show on map" }),
    ])
      expect((control as HTMLElement).style.maxWidth).toBe("100%");
    expect(landmark().style.maxWidth).toBe("100%");
  });

  it("lets the consumer's style override the container's width cap", () => {
    mount({ style: { maxWidth: 321 } });
    expect(landmark().style.maxWidth).toBe("321px");
  });

  it("gives every control a 44 px target with touchTargets", async () => {
    mount({ touchTargets: true, onShow: () => {} });
    type("graphs");
    await settle();
    for (const control of [
      input(),
      screen.getByRole("button", { name: "Clear search" }),
      screen.getByRole("button", { name: "Show on map" }),
    ])
      expect((control as HTMLElement).style.minHeight).toBe("44px");
  });
});
