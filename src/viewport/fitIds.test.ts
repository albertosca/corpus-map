import { describe, expect, it } from "vitest";
import type { MapNode } from "../shared/spec";
import { fitIds } from "./fitIds";
import { toScreen } from "./viewport";

const nodeAt = (id: string, horizontal: number, vertical: number): MapNode => ({
  id,
  label: id,
  x: horizontal,
  y: vertical,
  territory: null,
});
const nodesById = new Map<string, MapNode>([
  ["a", nodeAt("a", 0, 0)],
  ["b", nodeAt("b", 10, 0)],
  ["c", nodeAt("c", 5, 5)],
]);
const area = { left: 0, top: 0, width: 100, height: 100 };

describe("fitIds (spec search §3)", () => {
  it("fits two nodes inside the area with the padding on every side", () => {
    const view = fitIds(nodesById, ["a", "b"], area, 10, 0.1, 100);
    if (view === null) throw new Error("expected a view");
    const [leftEdge] = toScreen(view, 0, 0);
    const [rightEdge] = toScreen(view, 10, 0);
    expect(leftEdge).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(rightEdge).toBeLessThanOrEqual(90 + 1e-9);
    expect((leftEdge + rightEdge) / 2).toBeCloseTo(50, 6);
  });

  it("centres the box in the area when the area does not start at the left edge", () => {
    const view = fitIds(nodesById, ["a", "b"], { left: 40, top: 0, width: 60, height: 100 }, 0, 0.1, 100);
    if (view === null) throw new Error("expected a view");
    const [leftEdge] = toScreen(view, 0, 0);
    const [rightEdge] = toScreen(view, 10, 0);
    expect((leftEdge + rightEdge) / 2).toBeCloseTo(70, 6);
  });

  it("gives a finite scale clamped to the maximum for one id, centred", () => {
    const view = fitIds(nodesById, ["c"], area, 10, 0.1, 7);
    if (view === null) throw new Error("expected a view");
    expect(view.scale).toBe(7);
    expect(Number.isFinite(view.tx)).toBe(true);
    expect(toScreen(view, 5, 5)).toEqual([50, 50]);
  });

  it("never goes below the minimum scale", () => {
    const far = new Map<string, MapNode>([
      ["p", nodeAt("p", 0, 0)],
      ["q", nodeAt("q", 1_000_000, 0)],
    ]);
    const view = fitIds(far, ["p", "q"], area, 0, 0.5, 100);
    expect(view?.scale).toBe(0.5);
  });

  it("ignores unknown ids and duplicates", () => {
    const view = fitIds(nodesById, ["ghost", "a", "a", "b"], area, 10, 0.1, 100);
    expect(view).toEqual(fitIds(nodesById, ["a", "b"], area, 10, 0.1, 100));
  });

  it("is null when nothing resolves: no ids, or only unknown ones", () => {
    expect(fitIds(nodesById, [], area, 10, 0.1, 100)).toBeNull();
    expect(fitIds(nodesById, ["ghost"], area, 10, 0.1, 100)).toBeNull();
  });
});
