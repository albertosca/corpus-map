import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import { validateSpec } from "./shared/spec";

// Enough items on screen that the shares are trusted (FOCUS_CONFIDENT_ITEMS).
const PER_TERRITORY = Array.from({ length: 15 }, (_unused, index) => index);
const territory = (id: string, name: string, group: string, left: number) => ({
  id,
  name,
  group,
  members: PER_TERRITORY.map((index) => `${id}${index}`),
  centroid: [left + 1, 0] as [number, number],
});
const items = (id: string, left: number) =>
  PER_TERRITORY.map((index) => ({
    id: `${id}${index}`,
    label: `${id}${index}`,
    x: left + index / 5,
    y: 0,
    territory: id,
  }));

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

describe("CorpusMap open territory under the family focus (review I-3)", () => {
  const square = (half: number): Array<[number, number]> => [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  // Family A has thirty items around a small territory of family B that has two: B's leaf name is not drawn at near.
  const around = Array.from({ length: 30 }, (_unused, index) => ({
    id: `a${index}`,
    label: `a${index}`,
    x: 4 + (index % 6),
    y: -3 + Math.floor(index / 6) * 1.2,
    territory: "abig",
  }));
  const lopsided = validateSpec({
    version: "1",
    territories: [
      {
        id: "abig",
        name: "Abig",
        group: "Family A",
        members: around.map((node) => node.id),
        centroid: [7, 0],
        boundary: [
          [3.5, -4],
          [10, -4],
          [10, 4],
          [3.5, 4],
        ],
      },
      {
        id: "bsmall",
        name: "Bsmall",
        group: "Family B",
        members: ["b0", "b1"],
        centroid: [0, 0],
        boundary: square(3),
      },
      // Far away on both sides, so the fit is wide and zoom 8 is near with the whole cluster on screen.
      {
        id: "cfar",
        name: "Cfar",
        group: "Family C",
        members: ["c0", "c1"],
        centroid: [0, 100],
        boundary: [
          [-100, 90],
          [100, 90],
          [100, 110],
          [-100, 110],
        ],
      },
    ],
    nodes: [
      { id: "c0", label: "c0", x: -100, y: 100, territory: "cfar" },
      { id: "c1", label: "c1", x: 100, y: 100, territory: "cfar" },
      ...around,
      { id: "b0", label: "b0", x: -1, y: 0, territory: "bsmall" },
      { id: "b1", label: "b1", x: 1, y: 0, territory: "bsmall" },
    ],
  });

  it("names no open territory where the drawn names are the family's, not the leaf's", () => {
    const onOpenTerritoryChange = vi.fn();
    const handle = createRef<CorpusMapHandle>();
    HTMLCanvasElement.prototype.getContext = (() =>
      recordingContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    render(
      <CorpusMap
        renderCard={() => null}
        ref={handle}
        spec={lopsided}
        width={400}
        height={300}
        onOpenTerritoryChange={onOpenTerritoryChange}
      />,
    );
    drawn = [];
    act(() => handle.current?.setView({ centre: [0, 0], zoom: 8 }));
    expect(names().has("Bsmall")).toBe(false);
    expect(names().has("Family B")).toBe(true);
    expect(onOpenTerritoryChange).not.toHaveBeenCalledWith("bsmall");
  });
  it("hovering a leaf whose name is not drawn names its family, as the painted map does", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const handle = createRef<CorpusMapHandle>();
    HTMLCanvasElement.prototype.getContext = (() =>
      recordingContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const { container } = render(
      <CorpusMap renderCard={() => null} ref={handle} spec={lopsided} width={400} height={300} />,
    );
    act(() => handle.current?.setView({ centre: [0, 0], zoom: 8 }));
    const surface = container.querySelector("[data-map-surface]") as HTMLElement;
    // The box centre is world (0, 0): inside Bsmall, away from its two items.
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 150, pointerId: 1, pointerType: "mouse" });
    act(() => {
      for (const callback of callbacks.splice(0)) callback(0);
    });
    const hovered = document.querySelector("[data-hover-territories]");
    expect(hovered?.getAttribute("data-hover-territories")).toBe("group:Family B");
  });
});
