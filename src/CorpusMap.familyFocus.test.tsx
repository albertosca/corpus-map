import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { validateSpec } from "./shared/spec";

const territory = (id: string, name: string, group: string, left: number) => ({
  id,
  name,
  group,
  members: [`${id}0`, `${id}1`, `${id}2`],
  centroid: [left + 1, 0] as [number, number],
});
const items = (id: string, left: number) =>
  [0, 1, 2].map((index) => ({ id: `${id}${index}`, label: `${id}${index}`, x: left + index, y: 0, territory: id }));

// Two families a thousand units apart: a view on one of them holds none of the other's items.
const grouped = validateSpec({
  version: "1",
  territories: [
    territory("aone", "Aone", "Family A", 0),
    territory("atwo", "Atwo", "Family A", 10),
    territory("bone", "Bone", "Family B", 1000),
    territory("btwo", "Btwo", "Family B", 1010),
  ],
  nodes: [...items("aone", 0), ...items("atwo", 10), ...items("bone", 1000), ...items("btwo", 1010)],
});
const ungrouped = validateSpec({
  version: "1",
  territories: [territory("aone", "Aone", "", 0), territory("bone", "Bone", "", 1000)].map(
    ({ group: _group, ...rest }) => rest,
  ),
  nodes: [...items("aone", 0), ...items("bone", 1000)],
});

let drawn: Array<{ text: string; alpha: number }> = [];
const original = HTMLCanvasElement.prototype.getContext;

/** A context that records each `fillText` with the `globalAlpha` it was drawn at, and ignores the rest. */
function recordingContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { globalAlpha: 1, canvas: { width: 0, height: 0 } };
  state.fillText = (text: string) => {
    drawn.push({ text, alpha: state.globalAlpha as number });
  };
  state.measureText = (text: string) => ({ width: text.length * 6 });
  return new Proxy(state, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function mount(spec = grouped) {
  const handle = createRef<CorpusMapHandle>();
  HTMLCanvasElement.prototype.getContext = (() =>
    recordingContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  render(<CorpusMap renderCard={() => null} ref={handle} spec={spec} width={400} height={300} />);
  return handle;
}
const names = () => new Set(drawn.map((entry) => entry.text));

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original;
  drawn = [];
  vi.restoreAllMocks();
});

describe("CorpusMap family focus (spec family focus §3)", () => {
  it("at near, with the view on family A, draws A's leaf names and B only as a family", () => {
    const handle = mount();
    drawn = [];
    act(() => handle.current?.setView({ centre: [6, 0], zoom: 6 }));
    expect(names().has("Aone")).toBe(true);
    expect(names().has("Family B")).toBe(true);
    expect(names().has("Bone")).toBe(false);
    expect(names().has("Btwo")).toBe(false);
    expect(names().has("Family A")).toBe(false);
  });

  it("panning to family B swaps them", () => {
    const handle = mount();
    act(() => handle.current?.setView({ centre: [6, 0], zoom: 6 }));
    drawn = [];
    act(() => handle.current?.setView({ centre: [1006, 0], zoom: 6 }));
    expect(names().has("Bone")).toBe(true);
    expect(names().has("Family A")).toBe(true);
    expect(names().has("Aone")).toBe(false);
    expect(names().has("Family B")).toBe(false);
  });

  it("a spec without groups draws its leaf names everywhere, as before", () => {
    const handle = mount(ungrouped);
    drawn = [];
    act(() => handle.current?.setView({ centre: [6, 0], zoom: 6 }));
    expect(names().has("Aone")).toBe(true);
    expect([...names()].some((text) => text.startsWith("Family"))).toBe(false);
  });
});
