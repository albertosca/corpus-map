import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { validateSpec } from "./shared/spec";
import type { Viewport } from "./viewport/viewport";
import { toScreen } from "./viewport/viewport";

const painted = vi.hoisted(() => [] as Viewport[]);
vi.mock("./shared/paint", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/paint")>();
  return {
    ...original,
    paint: (...parameters: Parameters<typeof original.paint>) => {
      painted.push(parameters[3]);
    },
  };
});

afterEach(() => {
  painted.length = 0;
  vi.restoreAllMocks();
});

const RING: Array<[number, number]> = [
  [-50, -50],
  [60, -50],
  [60, 60],
  [-50, 60],
];
const spec = validateSpec({
  version: "1",
  territories: [{ id: "t", name: "T", members: ["a", "b"], centroid: [5, 5], boundary: RING }],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: "t" },
    { id: "b", label: "B", x: 10, y: 10, territory: "t" },
  ],
});

describe("CorpusMap first view", () => {
  it("fits the territory boundary, not only the nodes", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: () => {},
      // `useMeasure`'s offscreen canvas gets this fake context too.
      font: "",
      measureText: (text: string) => ({ width: text.length * 6 }),
    } as unknown as CanvasRenderingContext2D);
    render(<CorpusMap spec={spec} width={400} height={300} renderCard={() => null} />);
    const viewport = painted[painted.length - 1] as Viewport;
    for (const [horizontal, vertical] of RING) {
      const [screenHorizontal, screenVertical] = toScreen(viewport, horizontal, vertical);
      expect(screenHorizontal).toBeGreaterThanOrEqual(0);
      expect(screenHorizontal).toBeLessThanOrEqual(400);
      expect(screenVertical).toBeGreaterThanOrEqual(0);
      expect(screenVertical).toBeLessThanOrEqual(300);
    }
  });
});
