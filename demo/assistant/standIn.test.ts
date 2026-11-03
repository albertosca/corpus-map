import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../../src/shared/spec";
import { STAND_IN_NOTICE, standInAdapter } from "./standIn";

const nodes = Array.from({ length: 15 }, (_, position) => ({
  id: `graph-${position}`,
  label: `Graph paper ${position}`,
  x: position,
  y: 0,
  territory: "theory",
}));
const spec: MapSpec = {
  version: "1",
  territories: [{ id: "theory", name: "Theory", members: nodes.map((node) => node.id), centroid: [0, 0] }],
  nodes: [...nodes, { id: "tree", label: "Binary trees", x: 0, y: 1, territory: null }],
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const request = (question: string, selectedId: string | null = null) => ({ question, selectedId, history: [] });
const answerAfter = async (promise: Promise<unknown>, milliseconds = 400) => {
  await vi.advanceTimersByTimeAsync(milliseconds);
  return promise;
};

describe("standInAdapter (spec assistant §7)", () => {
  it("says what it is", () => {
    expect(STAND_IN_NOTICE).toBe("Stand-in answers from your browser's search, not an AI.");
  });

  it("answers with the match count and cites at most 12 ids in search order", async () => {
    const result = await answerAfter(standInAdapter(spec)(request("graph"), new AbortController().signal));
    expect(result).toEqual({
      text: "Found 15 items matching “graph”.",
      ids: nodes.slice(0, 12).map((node) => node.id),
    });
  });

  it("says item, not items, for a single match", async () => {
    const result = (await answerAfter(standInAdapter(spec)(request("binary"), new AbortController().signal))) as {
      text: string;
    };
    expect(result.text).toBe("Found 1 item matching “binary”.");
  });

  it("answers Nothing matches that. with no ids", async () => {
    const result = await answerAfter(standInAdapter(spec)(request("zebra"), new AbortController().signal));
    expect(result).toEqual({ text: "Nothing matches that.", ids: [] });
  });

  it("answers about the selection when the question says this", async () => {
    const result = await answerAfter(
      standInAdapter(spec)(request("What is this?", "graph-3"), new AbortController().signal),
    );
    expect(result).toEqual({ text: "That is “Graph paper 3”, in Theory.", ids: ["graph-3"] });
    const loose = await answerAfter(
      standInAdapter(spec)(request("what is this", "tree"), new AbortController().signal),
    );
    expect(loose).toEqual({ text: "That is “Binary trees”.", ids: ["tree"] });
  });

  it("asks the reader to select an item when this has nothing to mean", async () => {
    const result = await answerAfter(standInAdapter(spec)(request("what is this?"), new AbortController().signal));
    expect(result).toEqual({ text: "Select an item first, then ask about this.", ids: [] });
    const unknown = await answerAfter(
      standInAdapter(spec)(request("what is this?", "ghost"), new AbortController().signal),
    );
    expect(unknown).toEqual({ text: "Select an item first, then ask about this.", ids: [] });
  });

  it("does not cite the whole corpus for a question of only stop words", async () => {
    const result = await answerAfter(standInAdapter(spec)(request("what is the"), new AbortController().signal));
    expect(result).toEqual({ text: "Nothing matches that.", ids: [] });
  });

  it("waits the delay and rejects with AbortError when aborted first", async () => {
    const controller = new AbortController();
    const settled = vi.fn();
    const promise = standInAdapter(spec, 400)(request("graph"), controller.signal);
    promise.then(settled, settled);
    await vi.advanceTimersByTimeAsync(399);
    expect(settled).not.toHaveBeenCalled();
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once for a signal that is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(standInAdapter(spec)(request("graph"), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
