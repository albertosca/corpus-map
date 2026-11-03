import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
import type { MapViewport } from "../viewport/publicViewport";
import { AssistantBox, type AssistantBoxProps } from "./AssistantBox";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "alpha", label: "Alpha graphs", x: 0, y: 0, territory: null },
    { id: "beta", label: "Beta trees", x: 1, y: 0, territory: null },
    { id: "gamma", label: "Gamma graphs", x: 2, y: 0, territory: null },
  ],
};
const otherSpec: MapSpec = { ...spec, nodes: spec.nodes.slice(0, 1) };

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((settleResolve, settleReject) => {
    resolve = settleResolve;
    reject = settleReject;
  });
  return { promise, resolve, reject };
}

type Ask = AssistantBoxProps["ask"];
type Answer = Awaited<ReturnType<Ask>>;

function mount(properties: Partial<AssistantBoxProps> = {}) {
  const onMatches = vi.fn();
  const ask = vi.fn<Ask>(async () => ({ text: "Two papers.", ids: ["alpha", "beta"] }));
  const result = render(
    <AssistantBox
      spec={spec}
      ask={ask}
      selectedId={null}
      view={undefined}
      onMatches={onMatches}
      onReveal={vi.fn()}
      onRestore={vi.fn()}
      onSelect={vi.fn()}
      {...properties}
    />,
  );
  return { ask, onMatches, ...result };
}

const input = () => screen.getByRole("textbox");
const status = () => screen.getByRole("status");
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const submit = async (text: string) => {
  type(text);
  await act(async () => {
    fireEvent.submit(input().closest("form") as HTMLFormElement);
  });
};
const signalOf = (ask: ReturnType<typeof vi.fn>, call: number): AbortSignal => ask.mock.calls[call]?.[1];

describe("AssistantBox asking (spec assistant §4, §5)", () => {
  it("asks once with the question, no selection and an empty history; blank questions never ask", async () => {
    const { ask } = mount();
    await submit("hello");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[0]).toEqual({ question: "hello", selectedId: null, history: [] });
    expect(ask.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    await submit("   ");
    await submit("");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks from the Ask button too", async () => {
    const { ask } = mount();
    type("via button");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("sends a known selection and shows it; an unknown one is sent as null and not shown", async () => {
    const known = mount({ selectedId: "beta" });
    expect(screen.getByText("About: Beta trees")).toBeTruthy();
    await submit("what is this?");
    expect(known.ask.mock.calls[0]?.[0].selectedId).toBe("beta");
    known.unmount();
    const unknown = mount({ selectedId: "ghost" });
    expect(screen.queryByText(/^About:/)).toBeNull();
    await submit("what is this?");
    expect(unknown.ask.mock.calls[0]?.[0].selectedId).toBeNull();
  });

  it("says Asking while pending, then how many items, and repeats an identical status audibly", async () => {
    const pending = deferred<Answer>();
    const { ask } = mount();
    ask.mockReturnValueOnce(pending.promise);
    await submit("first");
    expect(status().textContent).toBe("Asking…");
    await act(async () => pending.resolve({ text: "Two papers.", ids: ["alpha", "beta"] }));
    expect(status().textContent).toBe("Answer ready, 2 items shown on the map");
    expect(screen.getByRole("log").textContent).toContain("Two papers.");
    await submit("second");
    expect(status().textContent).toBe("Answer ready, 2 items shown on the map ");
    ask.mockResolvedValueOnce({ text: "One.", ids: ["gamma"] });
    await submit("third");
    expect(status().textContent).toBe("Answer ready, 1 item shown on the map");
  });

  it("filters ids to the spec, drops duplicates, keeps the order; no known id means no highlight", async () => {
    const { ask, onMatches } = mount();
    ask.mockResolvedValueOnce({ text: "x", ids: ["beta", "ghost", "alpha", "beta"] });
    await submit("q");
    expect(onMatches).toHaveBeenLastCalledWith(["beta", "alpha"]);
    ask.mockResolvedValueOnce({ text: "nothing known", ids: ["ghost"] });
    await submit("q2");
    expect(onMatches).toHaveBeenLastCalledWith(null);
    expect(status().textContent).toBe("Answer ready");
  });

  it("aborts the first question when a second is asked and drops the late first answer", async () => {
    const first = deferred<Answer>();
    const { ask, onMatches } = mount();
    ask.mockReturnValueOnce(first.promise);
    await submit("one");
    const firstSignal = signalOf(ask, 0);
    ask.mockResolvedValueOnce({ text: "second answer", ids: ["gamma"] });
    await submit("two");
    expect(firstSignal.aborted).toBe(true);
    expect(onMatches).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ text: "late", ids: ["alpha"] }));
    expect(onMatches).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("log").textContent).not.toContain("late");
  });

  it("does not report a failure for the abort of a question we replaced", async () => {
    const first = deferred<Answer>();
    const { ask } = mount();
    ask.mockReturnValueOnce(first.promise);
    await submit("one");
    ask.mockResolvedValueOnce({ text: "fine", ids: [] });
    await submit("two");
    await act(async () => first.reject(new DOMException("aborted", "AbortError")));
    expect(status().textContent).not.toContain("failed");
  });

  it("says Assistant failed for a rejection, an undefined answer and an ids that is not a list; earlier turns stay", async () => {
    const { ask, onMatches } = mount();
    await submit("good");
    onMatches.mockClear();
    ask.mockRejectedValueOnce(new Error("boom"));
    await submit("bad");
    expect(status().textContent).toBe("Assistant failed");
    expect(screen.getByRole("log").textContent).toContain("Two papers.");
    ask.mockResolvedValueOnce(undefined as unknown as Answer);
    await submit("undefined");
    expect(status().textContent).toBe("Assistant failed ");
    ask.mockResolvedValueOnce({ text: "x", ids: "alpha" } as unknown as Answer);
    await submit("bad ids");
    expect(status().textContent).toBe("Assistant failed");
    expect(onMatches).not.toHaveBeenCalled();
  });

  it("sends the earlier turns as history", async () => {
    const { ask } = mount();
    await submit("one");
    await submit("two");
    expect(ask.mock.calls[1]?.[0].history).toEqual([
      { question: "one", answer: "Two papers.", ids: ["alpha", "beta"] },
    ]);
  });

  it("clears turns and field, aborts and reports null when the spec changes; a late answer changes nothing", async () => {
    const pending = deferred<Answer>();
    const { ask, onMatches, rerender } = mount();
    await submit("done");
    ask.mockReturnValueOnce(pending.promise);
    await submit("pending");
    const signal = signalOf(ask, 1);
    onMatches.mockClear();
    rerender(
      <AssistantBox
        spec={otherSpec}
        ask={ask}
        selectedId={null}
        view={undefined}
        onMatches={onMatches}
        onReveal={vi.fn()}
        onRestore={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(signal.aborted).toBe(true);
    expect((input() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("log")?.textContent ?? "").toBe("");
    expect(onMatches).toHaveBeenCalledTimes(1);
    expect(onMatches).toHaveBeenCalledWith(null);
    await act(async () => pending.resolve({ text: "late", ids: ["alpha"] }));
    expect(onMatches).toHaveBeenCalledTimes(1);
  });

  it("Escape clears a non-empty field and stops there; Clear empties turns, aborts and reports null", async () => {
    const pending = deferred<Answer>();
    const { ask, onMatches } = mount();
    await submit("done");
    type("draft");
    const stop = vi.fn();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.stopPropagation = stop;
    await act(async () => {
      input().dispatchEvent(event);
    });
    expect((input() as HTMLInputElement).value).toBe("");
    expect(stop).toHaveBeenCalled();
    ask.mockReturnValueOnce(pending.promise);
    await submit("pending");
    const signal = signalOf(ask, 1);
    onMatches.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });
    expect(signal.aborted).toBe(true);
    expect(onMatches).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(status().textContent).toBe("");
  });

  it("gives every control a 44 px target for touch", () => {
    mount({ touchTargets: true });
    expect(input().style.minHeight).toBe("44px");
    expect(screen.getByRole("button", { name: "Ask" }).style.minHeight).toBe("44px");
  });

  it("gives the input a row of its own for touch, so the buttons wrap as a deliberate second row", () => {
    mount({ touchTargets: true });
    expect(input().style.flex).toBe("1 1 100%");
  });

  it("keeps the input beside the buttons without touch targets", () => {
    mount();
    expect(input().style.flex).toBe("1 1 4rem");
  });
});

const overview: MapViewport = { centre: [10, 20], zoom: 1 };

function framed(properties: Partial<AssistantBoxProps> = {}) {
  const onReveal = vi.fn();
  const onRestore = vi.fn();
  const onSelect = vi.fn();
  const shared = { onReveal, onRestore, onSelect, ...properties };
  const result = mount({ view: overview, ...shared });
  const again = (extra: Partial<AssistantBoxProps>) =>
    result.rerender(
      <AssistantBox
        spec={spec}
        ask={result.ask}
        selectedId={null}
        view={overview}
        onMatches={result.onMatches}
        onReveal={onReveal}
        onRestore={onRestore}
        onSelect={onSelect}
        {...extra}
      />,
    );
  return { ...result, onReveal, onRestore, onSelect, again };
}

describe("AssistantBox citing, framing once and going back (spec assistant §4)", () => {
  it("renders each cited id as a button with the item's label, in the answer's order, and selects on press", async () => {
    const { onSelect, ask } = framed();
    ask.mockResolvedValueOnce({ text: "see these", ids: ["gamma", "alpha"] });
    await submit("q");
    const buttons = screen.getAllByRole("button").filter((button) => /graphs$/.test(button.textContent ?? ""));
    expect(buttons.map((button) => button.textContent)).toEqual(["Gamma graphs", "Alpha graphs"]);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("gamma");
  });

  it("names its field and never gives it an id, so Chrome does not flag it and two boxes can share a page", () => {
    framed();
    expect(input().getAttribute("name")).toBe("assistant-question");
    expect(input().hasAttribute("id")).toBe(false);
  });

  it("lets a long cited label wrap instead of clipping it (2026-11-03 browser pass)", async () => {
    const { ask } = framed();
    ask.mockResolvedValueOnce({ text: "see this", ids: ["gamma"] });
    await submit("q");
    const citation = screen.getByRole("button", { name: "Gamma graphs" });
    expect(citation.style.whiteSpace).toBe("normal");
    expect(citation.style.textAlign).toBe("left");
  });

  it("scrolls the answers on their own so the input and Back stay in reach (2026-11-03 browser pass)", () => {
    framed();
    const log = screen.getByRole("log");
    expect(log.style.overflowY).toBe("auto");
    expect(log.style.minHeight).toBe("0px");
  });

  it("keeps the turns a real list inside the log, not a list that lost its role (Lighthouse listitem)", async () => {
    const { ask } = framed();
    ask.mockResolvedValueOnce({ text: "one", ids: ["gamma"] });
    await submit("q");
    const log = screen.getByRole("log");
    expect(log.tagName).not.toBe("OL");
    const list = log.querySelector("ol");
    expect(list?.hasAttribute("role")).toBe(false);
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(1);
  });

  it("falls back to the id for a label that is empty", async () => {
    const blank: MapSpec = { ...spec, nodes: [{ id: "nameless", label: "", x: 0, y: 0, territory: null }] };
    const { ask } = framed({ spec: blank });
    ask.mockResolvedValueOnce({ text: "one", ids: ["nameless"] });
    await submit("q");
    expect(screen.getByRole("button", { name: "nameless" })).toBeTruthy();
  });

  it("frames the cited items once, after highlighting them, and offers Back", async () => {
    const calls: string[] = [];
    const { onReveal, onMatches } = framed();
    onMatches.mockImplementation(() => calls.push("matches"));
    onReveal.mockImplementation(() => calls.push("reveal"));
    await submit("q");
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(["alpha", "beta"]);
    expect(calls).toEqual(["matches", "reveal"]);
    expect(screen.getByRole("button", { name: "Back to previous view" })).toBeTruthy();
  });

  it("Back restores the view captured when asking, disappears and returns focus to the input", async () => {
    const { onRestore } = framed();
    await submit("q");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to previous view" }));
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(overview);
    expect(screen.queryByRole("button", { name: "Back to previous view" })).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it("neither frames nor offers Back when the reader moved the view while waiting", async () => {
    const pending = deferred<Answer>();
    const { ask, onMatches, onReveal, again } = framed();
    ask.mockReturnValueOnce(pending.promise);
    await submit("q");
    again({ view: { centre: [99, 20], zoom: 1 } });
    await act(async () => pending.resolve({ text: "x", ids: ["alpha"] }));
    expect(onMatches).toHaveBeenLastCalledWith(["alpha"]);
    expect(onReveal).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Back to previous view" })).toBeNull();
  });

  it("frames without Back when the consumer tracks no view", async () => {
    const { onReveal } = framed({ view: undefined });
    await submit("q");
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Back to previous view" })).toBeNull();
  });

  it("counts float noise as the same view and a different zoom as moved", async () => {
    const noisy = deferred<Answer>();
    const first = framed();
    first.ask.mockReturnValueOnce(noisy.promise);
    await submit("q");
    first.again({ view: { centre: [10 + 1e-12, 20], zoom: 1 } });
    await act(async () => noisy.resolve({ text: "x", ids: ["alpha"] }));
    expect(first.onReveal).toHaveBeenCalledTimes(1);
    first.unmount();
    const zoomed = deferred<Answer>();
    const second = framed();
    second.ask.mockReturnValueOnce(zoomed.promise);
    await submit("q");
    second.again({ view: { centre: [10, 20], zoom: 1.5 } });
    await act(async () => zoomed.resolve({ text: "x", ids: ["alpha"] }));
    expect(second.onReveal).not.toHaveBeenCalled();
  });

  it("never frames an answer without ids or with only unknown ids", async () => {
    const { ask, onReveal, onMatches } = framed();
    ask.mockResolvedValueOnce({ text: "none", ids: [] });
    await submit("q");
    ask.mockResolvedValueOnce({ text: "unknown", ids: ["ghost"] });
    await submit("q2");
    expect(onReveal).not.toHaveBeenCalled();
    expect(onMatches).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("button", { name: "Back to previous view" })).toBeNull();
  });

  it("removes a stale Back when the reader asks again", async () => {
    const pending = deferred<Answer>();
    const { ask } = framed();
    await submit("q");
    expect(screen.getByRole("button", { name: "Back to previous view" })).toBeTruthy();
    ask.mockReturnValueOnce(pending.promise);
    await submit("again");
    expect(screen.queryByRole("button", { name: "Back to previous view" })).toBeNull();
  });

  it("Back after the selection changed restores the view and leaves the selection alone", async () => {
    const { onRestore, onSelect, again } = framed();
    await submit("q");
    again({ selectedId: "gamma" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to previous view" }));
    });
    expect(onRestore).toHaveBeenCalledWith(overview);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("AssistantBox final review fixes (2026-11-03 whole-branch review)", () => {
  it("drops an old-corpus answer that lands between a spec swap's commit and its passive effects", async () => {
    const pending = deferred<Answer>();
    const onMatches = vi.fn();
    const onReveal = vi.fn();
    const ask = vi.fn<Ask>(() => pending.promise);
    function ReleaseOnSwap() {
      useLayoutEffect(() => {
        pending.resolve({ text: "old corpus", ids: ["beta"] });
      }, []);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    globals.IS_REACT_ACT_ENVIRONMENT = false;
    const root = createRoot(container);
    const boxProperties = {
      ask,
      selectedId: null,
      view: undefined,
      onMatches,
      onReveal,
      onRestore: vi.fn(),
      onSelect: vi.fn(),
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    root.render(<AssistantBox spec={spec} {...boxProperties} />);
    await settle();
    const field = container.querySelector("input") as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "q");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    onMatches.mockClear();
    // The swap mounts a sibling whose layout effect resolves the answer in the very commit that swaps the spec.
    root.render(
      <>
        <AssistantBox spec={otherSpec} {...boxProperties} />
        <ReleaseOnSwap />
      </>,
    );
    await settle();
    const logText = container.querySelector("[role=log]")?.textContent;
    root.unmount();
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    expect(onReveal).not.toHaveBeenCalled();
    expect(onMatches.mock.calls.every(([ids]) => ids === null)).toBe(true);
    expect(logText).toBe("");
  });

  it("keeps a draft typed while the answer was pending", async () => {
    const pending = deferred<Answer>();
    const { ask } = mount();
    ask.mockReturnValueOnce(pending.promise);
    await submit("first");
    type("my follow-up draft");
    await act(async () => pending.resolve({ text: "x", ids: [] }));
    expect((input() as HTMLInputElement).value).toBe("my follow-up draft");
  });

  it("clears the field when the answer arrives and the reader typed nothing more", async () => {
    mount();
    await submit("first");
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("does not frame when no view was tracked at asking but one is by the answer", async () => {
    const pending = deferred<Answer>();
    const onReveal = vi.fn();
    const { ask, rerender, onMatches } = mount({ onReveal });
    ask.mockReturnValueOnce(pending.promise);
    await submit("q");
    rerender(
      <AssistantBox
        spec={spec}
        ask={ask}
        selectedId={null}
        view={{ centre: [5, 5], zoom: 2 }}
        onMatches={onMatches}
        onReveal={onReveal}
        onRestore={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await act(async () => pending.resolve({ text: "x", ids: ["alpha"] }));
    expect(onMatches).toHaveBeenLastCalledWith(["alpha"]);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("reports nothing on mount under StrictMode", () => {
    const onMatches = vi.fn();
    render(
      <StrictMode>
        <AssistantBox
          spec={spec}
          ask={vi.fn<Ask>()}
          selectedId={null}
          view={undefined}
          onMatches={onMatches}
          onReveal={vi.fn()}
          onRestore={vi.fn()}
          onSelect={vi.fn()}
        />
      </StrictMode>,
    );
    expect(onMatches).not.toHaveBeenCalled();
  });

  it("offers Clear while the first question is pending, and it aborts that question", async () => {
    const pending = deferred<Answer>();
    const { ask, onMatches } = mount();
    ask.mockReturnValueOnce(pending.promise);
    await submit("first");
    const signal = signalOf(ask, 0);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(signal.aborted).toBe(true);
    expect(onMatches).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(status().textContent).toBe("");
  });

  it("returns focus to the input after an answer when the reader pressed Ask", async () => {
    mount();
    type("q");
    const ask = screen.getByRole("button", { name: "Ask" });
    ask.focus();
    await act(async () => {
      fireEvent.click(ask);
    });
    expect(document.activeElement).toBe(input());
  });

  it("does not take focus from outside the box when the answer arrives", async () => {
    const pending = deferred<Answer>();
    const { ask } = mount();
    const outside = document.createElement("button");
    document.body.append(outside);
    ask.mockReturnValueOnce(pending.promise);
    await submit("q");
    outside.focus();
    await act(async () => pending.resolve({ text: "x", ids: [] }));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
