import { afterEach, describe, expect, it, vi } from "vitest";
import { createHashWriter, parseDeepLink, serialiseDeepLink } from "./deepLink";

describe("deep link", () => {
  afterEach(() => vi.useRealTimers());

  it("round-trips corpus, view and selection", () => {
    const link = {
      corpus: "arxiv",
      view: { centre: [0.125, -3.5] as [number, number], zoom: 6 },
      selected: "2401.00001",
    };
    expect(parseDeepLink(serialiseDeepLink(link))).toEqual(link);
  });

  it("encodes ids that hold separators", () => {
    const link = { corpus: "arxiv", view: null, selected: "a&b=c" };
    expect(parseDeepLink(serialiseDeepLink(link))).toEqual(link);
  });

  it.each([
    ["", { corpus: null, view: null, selected: null }],
    ["#", { corpus: null, view: null, selected: null }],
    ["#view=abc", { corpus: null, view: null, selected: null }],
    ["#view=1,2", { corpus: null, view: null, selected: null }],
    ["#view=0,0,-3", { corpus: null, view: null, selected: null }],
    ["#view=0,0,Infinity", { corpus: null, view: null, selected: null }],
    ["#corpus=&selected=", { corpus: null, view: null, selected: null }],
  ])("parses %j without throwing", (hash, expected) => {
    expect(parseDeepLink(hash)).toEqual(expected);
  });

  it("debounces writes to one per quiet period, and flush writes at once", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createHashWriter(write, 250);
    for (let step = 0; step < 50; step += 1)
      writer.schedule({ corpus: "arxiv", view: { centre: [step, 0], zoom: 2 }, selected: null });
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(write).toHaveBeenCalledExactlyOnceWith("#corpus=arxiv&view=49,0,2");
    writer.schedule({ corpus: "elements", view: null, selected: null });
    writer.flush();
    expect(write).toHaveBeenLastCalledWith("#corpus=elements");
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("a steady drag writes nothing until it pauses: each change restarts the wait", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createHashWriter(write, 250);
    for (let frame = 0; frame < 60; frame += 1) {
      writer.schedule({ corpus: "arxiv", view: { centre: [frame, 0], zoom: 2 }, selected: null });
      vi.advanceTimersByTime(16);
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(write).toHaveBeenCalledExactlyOnceWith("#corpus=arxiv&view=59,0,2");
  });

  it("cancel drops a pending write", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createHashWriter(write, 250);
    writer.schedule({ corpus: "arxiv", view: null, selected: null });
    writer.cancel();
    vi.advanceTimersByTime(1000);
    writer.flush();
    expect(write).not.toHaveBeenCalled();
  });
});
