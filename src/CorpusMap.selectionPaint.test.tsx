import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { Frame } from "./shared/paint";
import type { MapNode, MapSpec } from "./shared/spec";

const frames = vi.hoisted(() => [] as Frame[]);
vi.mock("./shared/paint", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/paint")>();
  return {
    ...original,
    paint: (...parameters: Parameters<typeof original.paint>) => {
      frames.push(parameters[4]);
    },
  };
});

beforeEach(() => {
  // jsdom has no canvas context (`test/setup.ts`); without one `paint` is never reached.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: () => {},
    // `useMeasure`'s offscreen canvas gets this fake context too.
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  frames.length = 0;
  vi.restoreAllMocks();
});

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t", name: "Territory", members: ["a"], centroid: [0, 0] }],
  nodes: [{ id: "a", label: "Alpha", x: 0, y: 0, territory: "t" }],
};
const card = (node: MapNode) => <div>{node.label}</div>;
const lastFrame = (): Frame => {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error("paint was never called");
  return frame;
};

describe("the painted selection (spec slice C §5)", () => {
  it("passes the effective selection to paint: the id, then null while dimmed", () => {
    const properties = {
      renderCard: card,
      spec,
      width: 400,
      height: 300,
      defaultViewport: { centre: [0, 0] as [number, number], zoom: 8 },
      defaultSelectedId: "a",
    };
    const { rerender } = render(<CorpusMap {...properties} hiddenTerritories={[]} />);
    expect(lastFrame().selected).toBe("a");
    rerender(<CorpusMap {...properties} hiddenTerritories={["t"]} />);
    expect(lastFrame().selected).toBeNull();
  });
});
