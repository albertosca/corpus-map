import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";
import type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "kept", name: "Kept", members: ["west", "east"], centroid: [0, 0] },
    { id: "hidden", name: "Hidden", members: ["far"], centroid: [500, 0] },
  ],
  nodes: [
    { id: "west", label: "West", x: 0, y: 0, territory: "kept" },
    { id: "east", label: "East", x: 100, y: 0, territory: "kept" },
    { id: "far", label: "Far", x: 500, y: 0, territory: "hidden" },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;
type Change = [MapViewport, { reason: ViewportChangeReason }];

function mount(extra: { hiddenTerritories?: readonly string[]; insets?: { right: number } } = {}) {
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

describe("CorpusMap revealAll (spec search §3)", () => {
  it("fits the matches in one change with the reason interaction", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.revealAll(["west", "east"]));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[1].reason).toBe("interaction");
    expect(changes[0]?.[0].centre[0]).toBeCloseTo(50, 6);
    expect(Number.isFinite(changes[0]?.[0].zoom)).toBe(true);
  });

  it("centres a single match at a finite zoom", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.revealAll(["east"]));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0].centre[0]).toBeCloseTo(100, 6);
    expect(Number.isFinite(changes[0]?.[0].zoom)).toBe(true);
  });

  it("does nothing for no ids or only unknown ids", () => {
    const { changes, handle } = mount();
    act(() => handle.current?.revealAll([]));
    act(() => handle.current?.revealAll(["ghost"]));
    expect(changes).toHaveLength(0);
  });

  it("ignores an id of a dimmed territory", () => {
    const { changes, handle } = mount({ hiddenTerritories: ["hidden"] });
    act(() => handle.current?.revealAll(["far"]));
    expect(changes).toHaveLength(0);
    act(() => handle.current?.revealAll(["far", "west"]));
    expect(changes[0]?.[0].centre[0]).toBeCloseTo(0, 6);
  });

  it("fits inside the uncovered area, so a right inset moves the centre to the right", () => {
    const plain = mount();
    act(() => plain.handle.current?.revealAll(["west", "east"]));
    const covered = mount({ insets: { right: 100 } });
    act(() => covered.handle.current?.revealAll(["west", "east"]));
    expect(covered.changes[0]?.[0].centre[0]).toBeGreaterThan(plain.changes[0]?.[0].centre[0] ?? 0);
  });
});
