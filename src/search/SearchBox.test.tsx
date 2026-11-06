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

const input = () => screen.getByRole("combobox");
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
  it("names its field and never gives it an id, so Chrome does not flag it and two boxes can share a page", () => {
    mount();
    expect(input().getAttribute("name")).toBe("search");
    expect(input().hasAttribute("id")).toBe(false);
  });

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

  it("re-announces a repeated answer by alternating a trailing no-break space", async () => {
    mount();
    type("graphs");
    await settle();
    const first = screen.getByRole("status").textContent;
    expect(first).toBe("2 results");
    type("graph");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("2 results ");
    type("graphs");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("2 results");
    type("beta");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("1 result");
  });

  it("re-announces a repeated 'No results' and a repeated failure the same way", async () => {
    mount();
    type("zzz");
    await settle();
    type("yyy");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("No results ");
    const failing = mount({ search: () => Promise.reject(new Error("offline")) });
    const [, secondInput] = screen.getAllByRole("combobox");
    fireEvent.change(secondInput as HTMLElement, { target: { value: "a" } });
    await settle();
    fireEvent.change(secondInput as HTMLElement, { target: { value: "b" } });
    await settle();
    expect(screen.getAllByRole("status")[1]?.textContent).toBe("Search failed ");
    failing.unmount();
  });

  it("treats a consumer search that returns something that is not a list as a failure", async () => {
    const search = vi.fn(() => 5 as unknown as readonly string[]);
    const { onMatches } = mount({ search });
    type("anything");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Search failed");
    expect(lastCall(onMatches)).toBeNull();
  });

  it("treats a consumer search that returns nothing at all as a failure, not as 'No results'", async () => {
    const search = vi.fn(() => undefined as unknown as readonly string[]);
    const { onMatches } = mount({ search });
    type("anything");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Search failed");
    expect(lastCall(onMatches)).toBeNull();
  });

  it("moves the focus to the input when 'Show on map' disappears while it holds the focus", async () => {
    mount({ onShow: vi.fn() });
    type("graphs");
    await settle();
    screen.getByRole("button", { name: "Show on map" }).focus();
    type("zzz");
    await settle();
    expect(screen.queryByRole("button", { name: "Show on map" })).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it("does not take the focus when it was elsewhere", async () => {
    mount({ onShow: vi.fn() });
    type("graphs");
    await settle();
    (document.activeElement as HTMLElement | null)?.blur();
    type("zzz");
    await settle();
    expect(document.activeElement).not.toBe(input());
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

  it("takes its ids back when it unmounts holding an answer, and says nothing when it held none (whole-branch review I1)", async () => {
    const holding = mount();
    type("graphs");
    await settle();
    expect(lastCall(holding.onMatches)).toEqual(["alpha", "gamma"]);
    holding.unmount();
    expect(lastCall(holding.onMatches)).toBeNull();
    const idle = mount();
    idle.unmount();
    expect(idle.onMatches).not.toHaveBeenCalled();
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

  it("lets the input shrink to 4rem, so the clear button shares its row in a narrow bar", () => {
    mount();
    expect(input().style.flex).toBe("1 1 4rem");
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

const rankedSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "n1", label: "Delta graphs", x: 0, y: 0, territory: null },
    { id: "n2", label: "Alpha graphs", x: 1, y: 0, territory: null },
    { id: "n3", label: "Charlie graphs", x: 2, y: 0, territory: null },
  ],
  edges: [
    { source: "n1", target: "n2" },
    { source: "n1", target: "n3" },
    { source: "n3", target: "n2" },
    { source: "n1", target: "n2", weight: 3 },
  ],
};

describe("SearchBox ranking (spec ranking §2, §3)", () => {
  it("reports local matches by connections, ties alphabetical, by default", async () => {
    const { onMatches } = mount({ spec: rankedSpec });
    type("graphs");
    await settle();
    // n1 and n2 have 3 edges each and n3 has 2: Alpha (n2) comes before Delta (n1) on the tie.
    expect(lastCall(onMatches)).toEqual(["n2", "n1", "n3"]);
  });

  it("reports local matches alphabetically when asked", async () => {
    const { onMatches } = mount({ spec: rankedSpec, rank: "alphabetical" });
    type("graphs");
    await settle();
    expect(lastCall(onMatches)).toEqual(["n2", "n3", "n1"]);
  });

  it("orders local matches by a consumer's function", async () => {
    const { onMatches } = mount({ spec: rankedSpec, rank: (item) => (item.id === "n3" ? 10 : 0) });
    type("graphs");
    await settle();
    expect(lastCall(onMatches)).toEqual(["n3", "n2", "n1"]);
  });

  it("keeps the order of a consumer's plain id list, dropping a repeat", async () => {
    const { onMatches } = mount({ spec: rankedSpec, search: () => ["n3", "n1", "n3"] });
    type("anything");
    await settle();
    expect(lastCall(onMatches)).toEqual(["n3", "n1"]);
  });

  it("sorts a consumer's scored answer by score", async () => {
    const { onMatches } = mount({
      spec: rankedSpec,
      search: () => [
        { id: "n1", score: 0.2 },
        { id: "n3", score: 0.9 },
      ],
    });
    type("anything");
    await settle();
    expect(lastCall(onMatches)).toEqual(["n3", "n1"]);
  });

  it("announces 'Search failed' for a mixed answer and reports null", async () => {
    const { onMatches } = mount({ search: () => ["alpha", { id: "beta", score: 1 }] as never });
    type("anything");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Search failed");
    expect(lastCall(onMatches)).toBeNull();
  });
});

const options = () => screen.queryAllByRole("option");
const press = (key: string) => fireEvent.keyDown(input(), { key });

describe("SearchBox results list (spec ranking §4)", () => {
  it("lists the ranked results as options, labels only, and exposes the combobox state", async () => {
    mount({ spec: rankedSpec });
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
    type("graphs");
    await settle();
    expect(options().map((option) => option.textContent)).toEqual(["Alpha graphs", "Delta graphs", "Charlie graphs"]);
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("never calls onGo while typing", async () => {
    const onGo = vi.fn();
    mount({ spec: rankedSpec, onGo });
    type("graphs");
    await settle();
    expect(onGo).not.toHaveBeenCalled();
  });

  it("Enter goes to the first result and the list closes", async () => {
    const onGo = vi.fn();
    mount({ spec: rankedSpec, onGo });
    type("graphs");
    await settle();
    press("Enter");
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledWith("n2");
    expect(options()).toHaveLength(0);
  });

  it("ArrowDown and ArrowUp move the active option, aria-activedescendant follows, Enter goes to it", async () => {
    const onGo = vi.fn();
    mount({ spec: rankedSpec, onGo });
    type("graphs");
    await settle();
    press("ArrowDown");
    press("ArrowDown");
    const second = options()[1] as HTMLElement;
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBe(second.id);
    press("ArrowUp");
    expect((options()[0] as HTMLElement).getAttribute("aria-selected")).toBe("true");
    press("ArrowDown");
    press("Enter");
    expect(onGo).toHaveBeenCalledWith("n1");
  });

  it("a click on an option goes to that result", async () => {
    const onGo = vi.fn();
    mount({ spec: rankedSpec, onGo });
    type("graphs");
    await settle();
    fireEvent.click(options()[2] as HTMLElement);
    expect(onGo).toHaveBeenCalledWith("n3");
  });

  it("Enter does nothing without onGo, and without results", async () => {
    mount({ spec: rankedSpec });
    type("graphs");
    await settle();
    press("Enter");
    expect(options()).toHaveLength(3);
    type("zzzz");
    await settle();
    expect(options()).toHaveLength(0);
    press("Enter");
    expect(options()).toHaveLength(0);
  });

  it("renders at most 50 options plus 'and N more', and onMatches still gets every id", async () => {
    const many = Array.from({ length: 120 }, (_, number) => `id${String(number).padStart(3, "0")}`);
    const bigSpec: MapSpec = {
      version: "1",
      territories: [],
      nodes: many.map((id, number) => ({ id, label: `Item ${id}`, x: number, y: 0, territory: null })),
    };
    const { onMatches } = mount({ spec: bigSpec, search: () => many });
    type("item");
    await settle();
    expect(options()).toHaveLength(50);
    expect(screen.getByText("and 70 more")).not.toBeNull();
    expect((lastCall(onMatches) as string[]).length).toBe(120);
  });

  it("Escape, the clear button and a new spec empty the list", async () => {
    const view = mount({ spec: rankedSpec });
    type("graphs");
    await settle();
    press("Escape");
    expect(options()).toHaveLength(0);
    type("graphs");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(options()).toHaveLength(0);
    type("graphs");
    await settle();
    expect(options()).toHaveLength(3);
    view.rerender(<SearchBox spec={{ ...rankedSpec }} onMatches={vi.fn()} />);
    expect(options()).toHaveLength(0);
  });

  it("ArrowDown reopens a closed list that still has results", async () => {
    mount({ spec: rankedSpec, onGo: vi.fn() });
    type("graphs");
    await settle();
    press("Enter");
    expect(options()).toHaveLength(0);
    press("ArrowDown");
    expect(options()).toHaveLength(3);
  });

  it("a failed or empty search empties the list", async () => {
    mount({ spec: rankedSpec });
    type("graphs");
    await settle();
    expect(options()).toHaveLength(3);
    type("zzzz");
    await settle();
    expect(options()).toHaveLength(0);
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  });

  it("a slower older answer never repaints the list", async () => {
    const slow = deferred<string[]>();
    let call = 0;
    mount({ spec: rankedSpec, search: () => (++call === 1 ? slow.promise : ["n3"]) });
    type("one");
    await settle();
    type("two");
    await settle();
    await act(async () => {
      slow.resolve(["n1", "n2"]);
    });
    expect(options().map((option) => option.textContent)).toEqual(["Charlie graphs"]);
  });

  it("gives each option a 44 px target with touchTargets", async () => {
    mount({ spec: rankedSpec, touchTargets: true });
    type("graphs");
    await settle();
    expect((options()[0] as HTMLElement).style.minHeight).toBe("44px");
  });
});
