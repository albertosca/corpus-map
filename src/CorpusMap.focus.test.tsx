import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { TERRITORY_OUTLINE_WIDTH } from "./territories/paintTerritories";
import { fitScene } from "./viewport/fitScene";
import { toScreen } from "./viewport/viewport";

/**
 * Keyboard focus on the canvas (2026-09-25 browser review, B10: the tree's
 * buttons are visually hidden, so their own focus ring is clipped away and
 * the canvas showed nothing). Observed through a fake 2D context that
 * records every `stroke()` with its style, width and path, one list per
 * painted frame (a frame starts at `clearRect`).
 */
interface Stroke {
  style: string;
  width: number;
  points: Array<[number, number]>;
  arc: { x: number; y: number; r: number } | null;
}

function recordingContext(frames: Stroke[][]): CanvasRenderingContext2D {
  let path: Array<[number, number]> = [];
  let arc: Stroke["arc"] = null;
  const saved: Array<{ strokeStyle: string; lineWidth: number; fillStyle: string }> = [];
  const context = {
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    globalAlpha: 1,
    textAlign: "",
    textBaseline: "",
    setTransform: () => {},
    clearRect: () => {
      frames.push([]);
    },
    save: () => {
      saved.push({ strokeStyle: context.strokeStyle, lineWidth: context.lineWidth, fillStyle: context.fillStyle });
    },
    restore: () => {
      const savedState = saved.pop();
      if (savedState) Object.assign(context, savedState);
    },
    beginPath: () => {
      path = [];
      arc = null;
    },
    moveTo: (horizontal: number, vertical: number) => {
      path.push([horizontal, vertical]);
    },
    lineTo: (horizontal: number, vertical: number) => {
      path.push([horizontal, vertical]);
    },
    arc: (horizontal: number, vertical: number, radius: number) => {
      arc = { x: horizontal, y: vertical, r: radius };
    },
    // An item label's plate is a rounded rectangle; its corners do not enter a ring.
    arcTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {
      frames[frames.length - 1]?.push({ style: context.strokeStyle, width: context.lineWidth, points: path, arc });
    },
    fillText: () => {},
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return context as unknown as CanvasRenderingContext2D;
}

const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] },
    { id: "t2", name: "South", members: ["d", "e", "f"], centroid: [1, 11] },
  ],
  nodes: [
    { id: "a", label: "Alpha", x: 0, y: 0, territory: "t1" },
    { id: "b", label: "Beta", x: 2, y: 0, territory: "t1" },
    { id: "c", label: "Gamma", x: 1, y: 2, territory: "t1" },
    { id: "d", label: "Delta", x: 0, y: 10, territory: "t2" },
    { id: "e", label: "Epsilon", x: 2, y: 10, territory: "t2" },
    { id: "f", label: "Zeta", x: 1, y: 12, territory: "t2" },
  ],
};
const WIDTH = 400;
const HEIGHT = 300;

const isFocusStyle = (stroke: Stroke) =>
  stroke.style === DEFAULT_THEME.focusOutline && stroke.width === DEFAULT_THEME.focusOutlineWidth;

describe("CorpusMap keyboard focus on the canvas (2026-09-25 review, B10)", () => {
  let frames: Stroke[][];
  let original: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    frames = [];
    original = HTMLCanvasElement.prototype.getContext;
    // One context per canvas, like a real browser: state set on it (the line
    // width) carries over to the next frame unless the painter restores it.
    const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      let context = contexts.get(this);
      if (!context) {
        context = recordingContext(frames);
        contexts.set(this, context);
      }
      return context;
    } as unknown as typeof original;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });

  const lastFrameFocusStrokes = (): Stroke[] => (frames[frames.length - 1] ?? []).filter(isFocusStyle);

  /** The territory's rings as `CorpusMap` projects them at its fitted view. */
  function expectedRings(id: string): Array<Array<[number, number]>> {
    const viewport = fitScene(spec, buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText), WIDTH, HEIGHT, 24);
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    return (scene.shapes.get(id) ?? [])
      .filter((ring) => ring.length >= 3)
      .map((ring) => ring.map(([horizontal, vertical]) => toScreen(viewport, horizontal, vertical)));
  }

  it("outlines the focused territory's rings in the focus style, removes the outline on blur, and moves it to the next territory", () => {
    render(<CorpusMap spec={spec} renderCard={() => null} width={WIDTH} height={HEIGHT} />);
    expect(frames.length).toBeGreaterThan(0);
    expect(lastFrameFocusStrokes()).toEqual([]);

    const north = screen.getByRole("button", { name: /North/ });
    const south = screen.getByRole("button", { name: /South/ });

    act(() => north.focus());
    const northRings = expectedRings("t1");
    expect(northRings.length).toBeGreaterThan(0);
    expect(lastFrameFocusStrokes().map((stroke) => stroke.points)).toEqual(northRings);

    act(() => south.focus());
    expect(lastFrameFocusStrokes().map((stroke) => stroke.points)).toEqual(expectedRings("t2"));

    act(() => south.blur());
    expect(lastFrameFocusStrokes()).toEqual([]);
  });

  it("does not leave the focus width on the context for the next frame's boundaries", () => {
    render(<CorpusMap spec={spec} renderCard={() => null} width={WIDTH} height={HEIGHT} />);
    act(() => screen.getByRole("button", { name: /North/ }).focus());
    // A second focused frame: its boundaries are stroked after the first
    // frame's outline, so a leaked line width would show on them.
    act(() => screen.getByRole("button", { name: /South/ }).focus());
    expect(lastFrameFocusStrokes().length).toBeGreaterThan(0);
    // Since slice D the boundaries are outlines in a palette colour at their
    // own width; the fill layer's polygons still stroke (transparent) at the
    // context's width, which is where a leaked focus width would show. This
    // fake canvas has no document, so the layer takes its fallback path.
    const lastFrame = frames[frames.length - 1] ?? [];
    const boundaries = lastFrame.filter((stroke) => DEFAULT_THEME.palette.includes(stroke.style));
    expect(boundaries.length).toBeGreaterThan(0);
    for (const boundary of boundaries) expect(boundary.width).toBe(TERRITORY_OUTLINE_WIDTH);
    const fillEdges = lastFrame.filter((stroke) => stroke.style === "transparent");
    expect(fillEdges.length).toBeGreaterThan(0);
    for (const edge of fillEdges) expect(edge.width).toBe(1);
  });

  it("rings the focused item's point at the near regime, and removes it on blur", () => {
    render(
      <CorpusMap
        spec={spec}
        renderCard={() => null}
        width={WIDTH}
        height={HEIGHT}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const epsilon = screen.getByRole("button", { name: "Epsilon" });
    act(() => epsilon.focus());
    const rings = lastFrameFocusStrokes();
    expect(rings).toHaveLength(1);
    const [expectedHorizontal, expectedVertical] = toScreen(
      fitScene(spec, buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText), WIDTH, HEIGHT, 24),
      2,
      10,
    );
    expect(rings[0]?.arc?.x).toBeCloseTo(expectedHorizontal, 6);
    expect(rings[0]?.arc?.y).toBeCloseTo(expectedVertical, 6);

    act(() => epsilon.blur());
    expect(lastFrameFocusStrokes()).toEqual([]);
  });

  it("drops the highlight when the focused button leaves the tree without a blur (its item is no longer listed)", () => {
    const { rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={() => null}
        width={WIDTH}
        height={HEIGHT}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    act(() => screen.getByRole("button", { name: "Epsilon" }).focus());
    expect(lastFrameFocusStrokes()).toHaveLength(1);

    // A card cap of 0 lists no items, so the focused button unmounts.
    rerender(
      <CorpusMap
        spec={spec}
        renderCard={() => null}
        width={WIDTH}
        height={HEIGHT}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardCap={0}
      />,
    );
    expect(screen.queryByRole("button", { name: "Epsilon" })).toBeNull();
    expect(lastFrameFocusStrokes()).toEqual([]);
  });

  it("never paints an item ring once the regime leaves near, not even on the first frame after", () => {
    const { rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={() => null}
        width={WIDTH}
        height={HEIGHT}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    act(() => screen.getByRole("button", { name: "Epsilon" }).focus());
    expect(lastFrameFocusStrokes()).toHaveLength(1);

    const before = frames.length;
    rerender(
      <CorpusMap
        spec={spec}
        renderCard={() => null}
        width={WIDTH}
        height={HEIGHT}
        thresholds={{ midAt: 50, nearAt: 60 }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Epsilon" })).toBeNull();
    expect(frames.length).toBeGreaterThan(before);
    for (const frame of frames.slice(before)) {
      expect(frame.filter((stroke) => isFocusStyle(stroke) && stroke.arc !== null)).toEqual([]);
    }
  });

  it("drops a territory highlight once the regime reaches near, where territory buttons are not listed", () => {
    render(<CorpusMap spec={spec} renderCard={() => null} width={WIDTH} height={HEIGHT} />);
    const north = screen.getByRole("button", { name: /North/ });
    act(() => north.focus());
    expect(lastFrameFocusStrokes().length).toBeGreaterThan(0);
    // Activating a territory zooms to it, into the near regime. Not one
    // frame painted from then on may carry the territory outline — not even
    // the first near frame, painted before the tree reports the unmount.
    const before = frames.length;
    act(() => north.click());
    expect(screen.queryByRole("button", { name: /North/ })).toBeNull();
    expect(frames.length).toBeGreaterThan(before);
    for (const frame of frames.slice(before)) {
      expect(frame.filter((stroke) => isFocusStyle(stroke) && stroke.arc === null)).toEqual([]);
    }
  });
});
