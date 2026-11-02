import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { Frame } from "./shared/paint";
import type { MapNode, MapSpec } from "./shared/spec";

const frames = vi.hoisted(() => [] as Frame[]);
const sceneBuilds = vi.hoisted(() => ({ count: 0 }));
vi.mock("./shared/paint", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/paint")>();
  return {
    ...original,
    paint: (...parameters: Parameters<typeof original.paint>) => {
      frames.push(parameters[4]);
    },
  };
});
vi.mock("./shared/scene", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/scene")>();
  return {
    ...original,
    buildScene: (...parameters: Parameters<typeof original.buildScene>) => {
      sceneBuilds.count += 1;
      return original.buildScene(...parameters);
    },
  };
});

beforeEach(() => {
  // jsdom has no canvas context (`test/setup.ts`); without one `paint` is never reached.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: () => {},
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  frames.length = 0;
  sceneBuilds.count = 0;
  vi.restoreAllMocks();
});

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t", name: "Territory", members: ["a", "b"], centroid: [0, 0] }],
  nodes: [
    { id: "a", label: "Alpha", x: 0, y: 0, territory: "t" },
    { id: "b", label: "Beta", x: 1, y: 0, territory: "t" },
  ],
};
const card = (node: MapNode) => <div>{node.label}</div>;
const properties = {
  renderCard: card,
  spec,
  width: 400,
  height: 300,
  defaultViewport: { centre: [0, 0] as [number, number], zoom: 8 },
};
const lastFrame = (): Frame => {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error("paint was never called");
  return frame;
};

describe("the matches prop (spec search §2)", () => {
  it("hands the matches to paint at the far regime a corpus opens in, so the result shows without zooming", () => {
    render(<CorpusMap {...properties} defaultViewport={undefined} matches={["a"]} />);
    expect(lastFrame().regime).toBe("far");
    expect([...(lastFrame().matches ?? [])]).toEqual(["a"]);
  });

  it("passes no matches to paint while the prop is unset or null", () => {
    const { rerender } = render(<CorpusMap {...properties} />);
    expect(lastFrame().matches).toBeUndefined();
    rerender(<CorpusMap {...properties} matches={null} />);
    expect(lastFrame().matches).toBeUndefined();
  });

  it("passes an array as a set without duplicates, and an empty array as an empty set", () => {
    const { rerender } = render(<CorpusMap {...properties} matches={["a", "a", "ghost"]} />);
    expect([...(lastFrame().matches ?? [])]).toEqual(["a", "ghost"]);
    rerender(<CorpusMap {...properties} matches={[]} />);
    expect(lastFrame().matches?.size).toBe(0);
  });

  it("repaints on a new set of matches without building the scene again", () => {
    const { rerender } = render(<CorpusMap {...properties} matches={["a"]} />);
    const builds = sceneBuilds.count;
    const painted = frames.length;
    rerender(<CorpusMap {...properties} matches={["b"]} />);
    expect(frames.length).toBeGreaterThan(painted);
    expect(sceneBuilds.count).toBe(builds);
  });

  it("does not repaint when the very same set comes back", () => {
    const stable = new Set(["a"]);
    const { rerender } = render(<CorpusMap {...properties} matches={stable} />);
    const painted = frames.length;
    rerender(<CorpusMap {...properties} matches={stable} />);
    expect(frames.length).toBe(painted);
  });

  it("marks matched items in the accessible tree", () => {
    render(
      <CorpusMap
        renderCard={card}
        spec={spec}
        width={400}
        height={300}
        thresholds={{ midAt: 0, nearAt: 0 }}
        matches={["b"]}
      />,
    );
    expect(screen.getByRole("button", { name: /Beta/ }).getAttribute("aria-description")).toBe("match");
    expect(screen.getByRole("button", { name: /Alpha/ }).getAttribute("aria-description")).toBeNull();
  });
});
