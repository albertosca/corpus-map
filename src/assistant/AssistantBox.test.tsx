import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
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
});
