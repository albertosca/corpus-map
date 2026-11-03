import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";
import { type MapViewport, sameView, type ViewportChangeReason } from "./viewport/publicViewport";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "only", name: "Only", members: ["west", "east"], centroid: [50, 0] }],
  nodes: [
    { id: "west", label: "West", x: 0, y: 0, territory: "only" },
    { id: "east", label: "East", x: 100, y: 0, territory: "only" },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;
type Change = [MapViewport, { reason: ViewportChangeReason }];

function mount(extra: { viewport?: MapViewport } = {}) {
  const changes: Change[] = [];
  const handle = createRef<CorpusMapHandle>();
  render(
    <CorpusMap
      renderCard={card}
      ref={handle}
      spec={spec}
      width={400}
      height={300}
      onViewportChange={(...call) => changes.push(call)}
      {...extra}
    />,
  );
  return { changes, handle };
}

describe("CorpusMap setView (spec assistant §2)", () => {
  it("jumps to the given view with the reason interaction", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.setView({ centre: [30, 20], zoom: 2 }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[1].reason).toBe("interaction");
    expect(sameView(changes[0]?.[0] as MapViewport, { centre: [30, 20], zoom: 2 })).toBe(true);
  });

  it("round-trips a view the map reported", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.revealAll(["east"]));
    const reported = changes[0]?.[0] as MapViewport;
    act(() => handle.current?.setView({ centre: [0, 0], zoom: 3 }));
    act(() => handle.current?.setView(reported));
    expect(sameView(changes[changes.length - 1]?.[0] as MapViewport, reported)).toBe(true);
  });

  it("does nothing for a view that cannot be drawn", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.setView({ centre: [Number.NaN, 0], zoom: 2 }));
    act(() => handle.current?.setView({ centre: [0, 0], zoom: 0 }));
    act(() => handle.current?.setView({ centre: [0, 0], zoom: -3 }));
    act(() => handle.current?.setView({ centre: [0, 0] } as unknown as MapViewport));
    act(() => handle.current?.setView(null as unknown as MapViewport));
    expect(changes).toHaveLength(0);
  });

  it("clamps a zoom far outside the band", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.setView({ centre: [50, 0], zoom: 1e9 }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0].zoom).toBe(64);
  });

  it("proposes the view when controlled and draws nothing itself", () => {
    const held: MapViewport = { centre: [50, 0], zoom: 1 };
    const { changes, handle } = mount({ viewport: held });
    act(() => handle.current?.setView({ centre: [10, 10], zoom: 4 }));
    expect(changes).toHaveLength(1);
    expect(sameView(changes[0]?.[0] as MapViewport, { centre: [10, 10], zoom: 4 })).toBe(true);
    // Nothing was drawn: the held view stays the one on screen.
    expect(sameView(handle.current?.getView() as MapViewport, held)).toBe(true);
  });

  it("clamps a zoom far below the band", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.setView({ centre: [50, 0], zoom: 1e-9 }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0].zoom).toBe(0.125);
  });
});

describe("CorpusMap getView (spec assistant §2)", () => {
  it("reports the fit before anything was reported, the same view setView accepts back", () => {
    const { changes, handle } = mount();
    const fitted = handle.current?.getView() as MapViewport;
    expect(fitted.zoom).toBeCloseTo(1, 9);
    act(() => handle.current?.setView({ centre: [10, 10], zoom: 4 }));
    act(() => handle.current?.setView(fitted));
    expect(sameView(changes[changes.length - 1]?.[0] as MapViewport, fitted)).toBe(true);
  });

  it("follows the drawn view", () => {
    const { handle } = mount();
    act(() => handle.current?.setView({ centre: [30, 20], zoom: 2 }));
    expect(sameView(handle.current?.getView() as MapViewport, { centre: [30, 20], zoom: 2 })).toBe(true);
  });

  it("follows a box resize, matching what the map reported for it", () => {
    const changes: Change[] = [];
    const handle = createRef<CorpusMapHandle>();
    const element = (width: number) => (
      <CorpusMap
        renderCard={card}
        ref={handle}
        spec={spec}
        width={width}
        height={300}
        onViewportChange={(...call) => changes.push(call)}
      />
    );
    const { rerender } = render(element(400));
    rerender(element(200));
    const reported = changes[changes.length - 1];
    expect(reported?.[1].reason).toBe("resize");
    expect(sameView(handle.current?.getView() as MapViewport, reported?.[0] as MapViewport)).toBe(true);
  });

  it("is undefined while the map has no box to draw in", () => {
    const handle = createRef<CorpusMapHandle>();
    render(<CorpusMap renderCard={card} ref={handle} spec={spec} width={0} height={0} />);
    expect(handle.current?.getView()).toBeUndefined();
  });
});
