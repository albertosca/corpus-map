import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nestedSpec } from "../test/specs";
import { CorpusMap } from "./CorpusMap";
import type { Measure } from "./labels/placement";
import { buildScene } from "./shared/scene";
import { validateSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
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

describe("CorpusMap first view on a narrow box (spec mobile §4)", () => {
  // Text as wide as its font is large, so the compact family names measure narrower than the large ones.
  const pixelsOf = (font: string) => Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
  const measure: Measure = (text, font) => ({ width: text.length * pixelsOf(font) * 0.6, height: pixelsOf(font) });
  const base = nestedSpec();
  const spec = validateSpec({
    ...base,
    territories: base.territories.map((territory) =>
      territory.id === "p" ? { ...territory, name: "A family name far wider than its own region" } : territory,
    ),
  });

  it("fits the compact family names below 600 px", () => {
    const fake = {
      setTransform: () => {},
      font: "",
      measureText(text: string) {
        return { width: measure(text, this.font).width };
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fake as unknown as CanvasRenderingContext2D);
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, measure);
    const compactFit = fitScene(spec, { ...scene, groupLabels: scene.compactGroupLabels }, 375, 700, 24);
    // The large name is wider than the box, so only the compact one widens the fit: the painted view tells which.
    expect(compactFit).not.toEqual(fitScene(spec, scene, 375, 700, 24));
    render(<CorpusMap spec={spec} width={375} height={700} renderCard={() => null} />);
    expect(painted[painted.length - 1]).toEqual(compactFit);
  });
});
